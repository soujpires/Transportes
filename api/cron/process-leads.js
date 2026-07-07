const { listUnreadMessages, getMessage, markAsRead, sendReply, sendNotification } = require('../../lib/gmailClient');
const { supabase } = require('../../lib/supabaseClient');
const { classificarPrimeiraResposta, extrairCamposTriagem } = require('../../lib/claudeClient');
const { CAMPOS_TRIAGEM, emailTriagemCompleta, emailCamposFaltantes, emailNotificacaoJefferson } = require('../../lib/templates');

module.exports = async function handler(req, res) {
  // Protege o endpoint - só o próprio Vercel Cron (com o header correto) pode chamar
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const resultados = [];

  try {
    const mensagens = await listUnreadMessages();

    for (const msgRef of mensagens) {
      const msg = await getMessage(msgRef.id);

      // Já processamos essa mensagem antes? (evita duplicidade)
      const { data: jaProcessada } = await supabase
        .from('historico_conversas')
        .select('id')
        .eq('gmail_message_id', msg.id)
        .maybeSingle();

      if (jaProcessada) {
        await markAsRead(msg.id);
        continue;
      }

      // Busca o lead pelo e-mail do remetente
      let { data: lead } = await supabase
        .from('leads_caminhoneiros')
        .select('*')
        .eq('email', msg.fromEmail)
        .maybeSingle();

      // Se não existe ainda, é a primeira resposta ao disparo manual -> cria o registro
      if (!lead) {
        const { data: novoLead, error } = await supabase
          .from('leads_caminhoneiros')
          .insert({ email: msg.fromEmail, estagio: 'disparo_enviado' })
          .select()
          .single();

        if (error) throw error;
        lead = novoLead;
      }

      // Grava a mensagem recebida no histórico
      await supabase.from('historico_conversas').insert({
        lead_id: lead.id,
        remetente: 'transportador',
        conteudo: msg.body,
        gmail_message_id: msg.id,
        gmail_thread_id: msg.threadId,
      });

      // ---- Lógica por estágio ----

      if (lead.estagio === 'disparo_enviado') {
        const { intencao } = await classificarPrimeiraResposta(msg.body);

        if (intencao === 'sem_interesse') {
          await supabase
            .from('leads_caminhoneiros')
            .update({ estagio: 'sem_interesse', ultima_interacao_em: new Date().toISOString() })
            .eq('id', lead.id);
          resultados.push({ lead: msg.fromEmail, acao: 'marcado sem_interesse, sem resposta enviada' });
        } else {
          // interessado ou dúvida genérica -> manda o questionário de triagem
          const corpo = emailTriagemCompleta();
          await sendReply({
            to: msg.fromEmail,
            subject: msg.subject,
            body: corpo,
            threadId: msg.threadId,
            inReplyTo: msg.messageIdHeader,
            references: msg.references,
          });

          await supabase
            .from('leads_caminhoneiros')
            .update({
              estagio: 'aguardando_triagem',
              ultima_interacao_em: new Date().toISOString(),
            })
            .eq('id', lead.id);

          await supabase.from('historico_conversas').insert({
            lead_id: lead.id,
            remetente: 'automacao',
            conteudo: corpo,
            gmail_thread_id: msg.threadId,
          });

          resultados.push({ lead: msg.fromEmail, acao: 'triagem enviada' });
        }
      } else if (lead.estagio === 'aguardando_triagem' || lead.estagio === 'triagem_parcial') {
        const camposAtuais = Object.fromEntries(
          CAMPOS_TRIAGEM.map((c) => [c, lead[c]]).filter(([, v]) => v !== null && v !== undefined)
        );

        const { campos_extraidos } = await extrairCamposTriagem(msg.body, camposAtuais);
        const camposAtualizados = { ...camposAtuais, ...campos_extraidos };

        const faltantes = CAMPOS_TRIAGEM.filter(
          (c) => camposAtualizados[c] === undefined || camposAtualizados[c] === null || camposAtualizados[c] === ''
        );

        if (faltantes.length === 0) {
          // Triagem completa -> NÃO decide sozinho, só notifica o Jefferson
          await supabase
            .from('leads_caminhoneiros')
            .update({
              ...campos_extraidos,
              estagio: 'triagem_completa',
              ultima_interacao_em: new Date().toISOString(),
            })
            .eq('id', lead.id);

          const leadCompleto = { ...lead, ...camposAtualizados };
          await sendNotification({
            to: process.env.NOTIFICATION_EMAIL,
            subject: `Lead pronto para decisão: ${msg.fromEmail}`,
            body: emailNotificacaoJefferson(leadCompleto),
          });

          resultados.push({ lead: msg.fromEmail, acao: 'triagem completa, Jefferson notificado' });
        } else {
          // Ainda falta informação -> pede só o que falta
          const corpo = emailCamposFaltantes(faltantes);
          await sendReply({
            to: msg.fromEmail,
            subject: msg.subject,
            body: corpo,
            threadId: msg.threadId,
            inReplyTo: msg.messageIdHeader,
            references: msg.references,
          });

          await supabase
            .from('leads_caminhoneiros')
            .update({
              ...campos_extraidos,
              estagio: 'triagem_parcial',
              ultima_interacao_em: new Date().toISOString(),
            })
            .eq('id', lead.id);

          await supabase.from('historico_conversas').insert({
            lead_id: lead.id,
            remetente: 'automacao',
            conteudo: corpo,
            gmail_thread_id: msg.threadId,
          });

          resultados.push({ lead: msg.fromEmail, acao: `pediu campos faltantes: ${faltantes.join(', ')}` });
        }
      } else {
        // triagem_completa, proposta_enviada, aguardando_reuniao, etc -> não age sozinho
        resultados.push({ lead: msg.fromEmail, acao: `sem ação automática (estágio atual: ${lead.estagio})` });
      }

      await markAsRead(msg.id);
    }

    return res.status(200).json({ processados: resultados.length, resultados });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
