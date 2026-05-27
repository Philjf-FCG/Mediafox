import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

const getTransport = () => {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
};

export const sendEmail = async (opts: EmailOptions): Promise<void> => {
  const transport = getTransport();
  if (!transport) return; // silently skip if SMTP not configured

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? `MediaFox <noreply@mediafox.io>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
};

export const notifyPostPublished = async (email: string, postTitle: string, platforms: string[]): Promise<void> => {
  await sendEmail({
    to: email,
    subject: `Post published — ${postTitle || 'your post'}`,
    html: `<p>Your post <strong>${postTitle || '(untitled)'}</strong> has been published to: <strong>${platforms.join(', ')}</strong>.</p>`,
  });
};

export const notifyPostFailed = async (email: string, postTitle: string, error: string): Promise<void> => {
  await sendEmail({
    to: email,
    subject: `Post failed to publish — ${postTitle || 'your post'}`,
    html: `<p>Your post <strong>${postTitle || '(untitled)'}</strong> failed to publish.</p><p>Error: ${error}</p>`,
  });
};
