const { google } = require('googleapis');

function getGmailClient() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );

  oAuth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  return google.gmail({ version: 'v1', auth: oAuth2Client });
}

// Lista e-mails não lidos na caixa de entrada
async function listUnreadMessages() {
  const gmail = getGmailClient();

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread in:inbox',
    maxResults: 50,
  });

  return res.data.messages || [];
}

// Busca detalhes completos de uma mensagem (remetente, corpo, thread, headers)
async function getMessage(messageId) {
  const gmail = getGmailClient();

  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = res.data.payload.headers;
  const getHeader = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const fromHeader = getHeader('From');
  // Extrai só o e-mail de dentro de "Nome <email@dominio.com>"
  const emailMatch = fromHeader.match(/<(.+)>/);
  const fromEmail = (emailMatch ? emailMatch[1] : fromHeader).trim().toLowerCase();

  const subject = getHeader('Subject');
  const messageIdHeader = getHeader('Message-ID');
  const references = getHeader('References');

  const body = extractBody(res.data.payload);

  return {
    id: res.data.id,
    threadId: res.data.threadId,
    fromEmail,
    subject,
    messageIdHeader,
    references,
    body,
  };
}

// Extrai o corpo em texto puro do payload do Gmail (lida com multipart)
function extractBody(payload) {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    }
    // fallback: procura recursivamente (ex: multipart/alternative dentro de multipart/mixed)
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  return '';
}

// Marca uma mensagem como lida (remove label UNREAD)
async function markAsRead(messageId) {
  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}

// Envia uma resposta dentro da mesma thread (para o lead)
async function sendReply({ to, subject, body, threadId, inReplyTo, references }) {
  const gmail = getGmailClient();

  const replySubject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;

  const rawMessage = buildRawMessage({
    to,
    subject: replySubject,
    body,
    inReplyTo,
    references,
  });

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: rawMessage,
      threadId,
    },
  });
}

// Envia um e-mail avulso (usado para notificar Jefferson, sem precisar de thread)
async function sendNotification({ to, subject, body }) {
  const gmail = getGmailClient();
  const rawMessage = buildRawMessage({ to, subject, body });

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: rawMessage },
  });
}

function buildRawMessage({ to, subject, body, inReplyTo, references }) {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
  ];

  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);

  const message = `${headers.join('\r\n')}\r\n\r\n${body}`;

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

module.exports = {
  listUnreadMessages,
  getMessage,
  markAsRead,
  sendReply,
  sendNotification,
};
