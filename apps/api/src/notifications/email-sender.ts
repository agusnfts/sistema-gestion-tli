import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../config/config';

export type EmailMessage = { to: string; subject: string; text: string };

/** Envío de mails detrás de una interfaz. El sistema funciona completo sin mail. */
export interface EmailSender {
  /** false si no hay transporte configurado (no se intenta enviar). */
  readonly configured: boolean;
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

/** SMTP genérico (Google Workspace, Office 365, el servidor que habilite IT…). */
export class SmtpEmailSender implements EmailSender {
  readonly configured = true;
  private readonly transporter: Transporter;

  constructor(private readonly smtp: NonNullable<AppConfig['smtp']>) {
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      // Exigir TLS válido (no se aceptan certificados inválidos).
      tls: { rejectUnauthorized: true },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.smtp.from, ...message });
  }
}

/** Sin SMTP configurado: no envía nada. */
export class DisabledEmailSender implements EmailSender {
  readonly configured = false;
  private readonly logger = new Logger(DisabledEmailSender.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.debug(`Mail no enviado (sin SMTP): ${message.subject}`);
  }
}

/** Solo tests: guarda los mails en memoria. */
export class MemoryEmailSender implements EmailSender {
  readonly configured = true;
  readonly outbox: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.outbox.push(message);
  }
}

export function createEmailSender(config: AppConfig): EmailSender {
  if (config.env === 'test') return new MemoryEmailSender();
  return config.smtp ? new SmtpEmailSender(config.smtp) : new DisabledEmailSender();
}
