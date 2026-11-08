import nodemailer from 'nodemailer';
import { Resend } from 'resend';

function gmailCredentials() {
  const user = process.env.GMAIL_USER;
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  if (!user || !appPassword) throw new Error('Gmail SMTP 설정이 필요합니다. GMAIL_USER와 GMAIL_APP_PASSWORD를 server/.env에 입력해주세요.');
  return { user, appPassword };
}

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY || (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD));
}

export async function sendInspectionMail(input: {
  recipient: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}) {
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const attachments = input.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content.toString('base64'),
    }));
    const result = await resend.emails.send({
      from: process.env.MAIL_FROM || 'onboarding@resend.dev',
      to: input.recipient,
      subject: input.subject,
      html: input.html,
      attachments,
    });
    if (result.error) throw new Error(`Resend 발송 실패: ${result.error.message}`);
    return result.data;
  }
  const { user, appPassword } = gmailCredentials();
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass: appPassword },
    requireTLS: true,
    // Do not leave the mobile UI stuck forever when Render/Gmail is slow.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter.sendMail({
    from: `"${process.env.MAIL_SENDER_NAME || 'FIRE CARE'}" <${user}>`,
    to: input.recipient,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  });
}
