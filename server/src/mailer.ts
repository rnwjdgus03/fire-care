import nodemailer from 'nodemailer';

function gmailCredentials() {
  const user = process.env.GMAIL_USER;
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  if (!user || !appPassword) throw new Error('Gmail SMTP 설정이 필요합니다. GMAIL_USER와 GMAIL_APP_PASSWORD를 server/.env에 입력해주세요.');
  return { user, appPassword };
}

export function mailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export async function sendInspectionMail(input: {
  recipient: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}) {
  const { user, appPassword } = gmailCredentials();
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: appPassword },
  });
  return transporter.sendMail({
    from: `"${process.env.MAIL_SENDER_NAME || 'FIRE CARE'}" <${user}>`,
    to: input.recipient,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  });
}
