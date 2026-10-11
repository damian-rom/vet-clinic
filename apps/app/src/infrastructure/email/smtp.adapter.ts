import type { ReportEmail, EmailPort } from '../../domain/ports/email.port';
import nodemailer from 'nodemailer';

export class SmtpEmailAdapter implements EmailPort {
  readonly available = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);

  async sendReport(message: ReportEmail): Promise<void> {
    if (!this.available) throw new Error('Email delivery is not configured for this clinic.');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      ...(process.env.SMTP_USER
        ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
        : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: message.to,
        subject: message.subject,
        text: 'Your requested Pawstead clinic report is attached. Keep this document private.',
        attachments: [
          { filename: message.filename, content: message.pdf, contentType: 'application/pdf' },
        ],
      });
    } finally {
      transport.close();
    }
  }
}
