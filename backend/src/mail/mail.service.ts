import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

export type EnvioEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
  headers?: Record<string, string>;
};

/**
 * Envio de e-mail via SMTP genérico (Resend, SendGrid, SES, Hostinger...).
 * Sem SMTP_HOST configurado, o serviço fica "desligado": não quebra nada,
 * só devolve enviado=false — assim o resto do produto funciona antes de o
 * provedor e o domínio remetente estarem prontos.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      const port = Number(this.config.get('SMTP_PORT') ?? 587);
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: String(this.config.get('SMTP_SECURE') ?? (port === 465)) === 'true',
        auth: this.config.get('SMTP_USER')
          ? { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASS') }
          : undefined,
      });
    }
  }

  get configurado() {
    return this.transporter !== null;
  }

  get remetente() {
    return this.config.get<string>('MAIL_FROM') || 'InTAX <no-reply@localhost>';
  }

  get emailInterno() {
    return this.config.get<string>('NOTIFY_EMAIL') || '';
  }

  get urlPublica() {
    return (this.config.get<string>('APP_PUBLIC_URL') || 'https://simulador.clarityib.com.br').replace(/\/$/, '');
  }

  async enviar(msg: EnvioEmail): Promise<{ enviado: boolean; motivo?: string }> {
    if (!this.transporter) return { enviado: false, motivo: 'SMTP não configurado' };
    try {
      await this.transporter.sendMail({
        from: this.remetente,
        replyTo: this.config.get<string>('MAIL_REPLY_TO') || undefined,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        attachments: msg.attachments,
        headers: msg.headers,
      });
      return { enviado: true };
    } catch (err) {
      const motivo = (err as Error).message;
      this.logger.warn(`Falha ao enviar e-mail para ${msg.to}: ${motivo}`);
      return { enviado: false, motivo };
    }
  }
}

export const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Moldura padrão dos e-mails do InTAX (marca FAL Agro). */
export function emailLayout(titulo: string, corpoHtml: string, rodapeHtml = ''): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f5f2;font-family:Arial,Helvetica,sans-serif;color:#1c2b24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#1f3a2e;padding:18px 24px;color:#ffffff"><span style="font-size:20px;font-weight:bold;letter-spacing:.5px">InTAX</span> <span style="font-size:12px;opacity:.8">&nbsp;por FAL Agro</span></td></tr>
<tr><td style="padding:24px"><h1 style="font-size:20px;margin:0 0 14px">${esc(titulo)}</h1>${corpoHtml}</td></tr>
<tr><td style="padding:16px 24px;background:#f3f5f2;font-size:11px;color:#5b6b63;line-height:1.5">${rodapeHtml}
<p style="margin:8px 0 0">Conteúdo orientativo, baseado na legislação vigente na data de envio. Não substitui a análise de um especialista.</p></td></tr>
</table></td></tr></table></body></html>`;
}
