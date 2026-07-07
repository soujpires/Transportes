# Automação de E-mails - Campanha ANTT (Caminhoneiros)

Robô que lê as respostas dos transportadores aos e-mails de prospecção manual,
conduz o levantamento qualitativo (triagem) e avisa por e-mail quando um lead
está pronto para você decidir o próximo passo (proposta padrão ou reunião).

## Como funciona

1. Roda 1x por dia (09:00 horário de Brasília) via Vercel Cron.
2. Lê os e-mails não lidos da caixa `transportes@somosvalor.com`.
3. Para cada e-mail novo:
   - Se é a primeira resposta do lead ao disparo manual → classifica se há
     interesse. Se sim, envia o questionário de triagem. Se não, marca como
     `sem_interesse` e não responde nada.
   - Se o lead já está em triagem → extrai os campos da resposta. Se faltar
     algo, pergunta só o que falta. Se completou tudo, marca como
     `triagem_completa` e **te manda um e-mail de notificação** com o resumo
     -- a IA não decide proposta vs. reunião sozinha, isso é manual.
4. Tudo fica registrado nas tabelas `leads_caminhoneiros` e
   `historico_conversas` no Supabase (projeto LeadMap).

## Setup

1. `npm install`
2. Preencha o `.env.example` e renomeie para `.env` (uso local) ou configure
   as mesmas variáveis em **Vercel → Settings → Environment Variables**.
3. Deploy: `vercel --prod` (ou push pro GitHub com o repo conectado ao Vercel).
4. O cron já fica agendado automaticamente pelo `vercel.json`.

## Testando manualmente

Você pode chamar o endpoint manualmente (fora do horário do cron) com:

```bash
curl -X POST https://SEU-DOMINIO.vercel.app/api/cron/process-leads \
  -H "Authorization: Bearer SEU_CRON_SECRET"
```

## Atenção: campo "Nº de caminhões"

O questionário de triagem incluído aqui (`lib/templates.js`) já contém o campo
**"Número de caminhões da frota"**, que é essencial para você decidir depois se
o lead é pequeno ou precisa de reunião — mas ele não estava na lista original
de perguntas que você descreveu. Confirme se o texto do e-mail de triagem em
`emailTriagemCompleta()` está do jeito que você quer antes de colocar em
produção.

## Segurança

- RLS habilitado nas tabelas do Supabase - só a service role key (usada aqui
  no backend) tem acesso, chave anon/pública não enxerga nada.
- O endpoint do cron exige o header `Authorization: Bearer CRON_SECRET` -
  ninguém de fora consegue disparar o processamento manualmente.
- A IA nunca envia proposta comercial nem agenda reunião sozinha - só conduz
  a triagem e notifica você quando está completa.
