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

/** Modo de autenticação escolhido no boot, a partir do ambiente. */
type ModoAuth = 'desligado' | 'senha' | 'token';

/** Variáveis que, juntas, ligam a autenticação por token (OAuth2 client credentials). */
const VARS_TOKEN = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET'] as const;

/** Escopo fixo do SMTP do Microsoft 365 (não é o do Graph). */
const ESCOPO_SMTP = 'https://outlook.office365.com/.default';

/**
 * Margem de renovação: o token é trocado antes de vencer para que um envio
 * longo (newsletter) não caia no meio por expiração entre o pedido e a
 * entrega. Em token de vida curta a margem cai para metade da validade.
 */
const MARGEM_RENOVACAO_MS = 5 * 60 * 1000;

/** Validade assumida quando a resposta não traz `expires_in` utilizável. */
const VALIDADE_PADRAO_S = 3600;

/**
 * Envio de e-mail via SMTP genérico (Resend, SendGrid, SES, Hostinger...).
 * Sem SMTP_HOST configurado, o serviço fica "desligado": não quebra nada,
 * só devolve enviado=false — assim o resto do produto funciona antes de o
 * provedor e o domínio remetente estarem prontos.
 *
 * Autenticação: por padrão é SMTP_USER/SMTP_PASS. Preenchendo as três
 * variáveis MS_* o serviço passa a autenticar por token (OAuth2 client
 * credentials no Microsoft 365, AUTH XOAUTH2), e SMTP_PASS deixa de ser
 * usado — a caixa remetente fica acessível por um aplicativo revogável em
 * vez de por uma senha guardada aqui.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly modo: ModoAuth;
  private readonly host: string;
  private readonly port: number;
  private readonly secure: boolean;
  private readonly usuario: string;
  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  /** Transporter do modo senha: fixo, montado uma vez no boot. */
  private transporter: Transporter | null = null;

  /** Transporter do modo token: refeito a cada token novo. */
  private transporterToken: { token: string; transporter: Transporter } | null = null;

  private tokenCache: { valor: string; expiraEm: number } | null = null;

  /** Busca em voo, para que envios simultâneos não peçam dois tokens. */
  private buscaToken: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {
    this.host = (this.config.get<string>('SMTP_HOST') || '').trim();
    this.port = Number(this.config.get('SMTP_PORT') ?? 587);
    this.secure = String(this.config.get('SMTP_SECURE') ?? (this.port === 465)) === 'true';
    this.usuario = (this.config.get<string>('SMTP_USER') || '').trim();

    this.tenantId = (this.config.get<string>('MS_TENANT_ID') || '').trim();
    this.clientId = (this.config.get<string>('MS_CLIENT_ID') || '').trim();
    this.clientSecret = (this.config.get<string>('MS_CLIENT_SECRET') || '').trim();

    const preenchidas: Record<(typeof VARS_TOKEN)[number], string> = {
      MS_TENANT_ID: this.tenantId,
      MS_CLIENT_ID: this.clientId,
      MS_CLIENT_SECRET: this.clientSecret,
    };
    const faltando = VARS_TOKEN.filter((nome) => !preenchidas[nome]);
    const modoToken = faltando.length === 0;

    if (!this.host) this.modo = 'desligado';
    else this.modo = modoToken ? 'token' : 'senha';

    if (faltando.length > 0 && faltando.length < VARS_TOKEN.length) {
      const destino = this.modo === 'desligado' ? 'desligado (SMTP_HOST vazio)' : 'usuário/senha (SMTP_USER/SMTP_PASS)';
      this.logger.warn(
        `Autenticação por token do Microsoft 365 está incompleta: falta preencher ${faltando.join(', ')}. ` +
          `Preencha as três ou deixe as três vazias. Enquanto isso, o envio segue no modo ${destino}.`,
      );
    }

    // Todo modo diz no boot em que estado subiu: sem isso, a única forma de
    // descobrir se o modo token pegou é esperar um envio falhar — e captação
    // de lead é melhor esforço, não mostra erro na tela de ninguém.
    if (this.modo === 'desligado') {
      this.logger.log(
        'Envio de e-mail desligado: SMTP_HOST está vazio. O resto do produto funciona normalmente, ' +
          'mas nenhuma mensagem sai — avisos de lead, newsletter e relatórios não são enviados.',
      );
    }

    if (this.modo === 'token') {
      if (!this.usuario) {
        this.logger.warn(
          'Autenticação por token do Microsoft 365 ligada, mas SMTP_USER está vazio — ' +
            'ele precisa ser o endereço da caixa remetente, que é o usuário do XOAUTH2.',
        );
      } else {
        this.logger.log(`Autenticação por token do Microsoft 365 ligada para a caixa ${this.usuario}.`);
      }
    }

    if (this.modo === 'senha') {
      if (this.usuario) {
        this.logger.log(
          `Autenticação de e-mail por usuário e senha ligada para a caixa ${this.usuario} (SMTP_USER/SMTP_PASS).`,
        );
      } else {
        this.logger.log(
          'Envio de e-mail ligado sem autenticação: SMTP_USER está vazio, ' +
            'então o servidor SMTP precisa aceitar envio anônimo.',
        );
      }

      this.transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.secure,
        auth: this.usuario
          ? { user: this.usuario, pass: this.config.get<string>('SMTP_PASS') }
          : undefined,
      });
    }
  }

  get configurado() {
    return this.modo !== 'desligado';
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
    if (this.modo === 'desligado') return { enviado: false, motivo: 'SMTP não configurado' };

    // `tokenUsado` fica local à chamada de propósito: entre o sendMail e o
    // catch, outra chamada concorrente pode ter rotacionado o token em cache.
    // Redigir contra o cache apagaria o token errado e deixaria vazar este.
    let transporter: Transporter;
    let tokenUsado: string | undefined;
    try {
      ({ transporter, tokenUsado } = await this.obterTransporter());
    } catch (err) {
      // Falhou ao BUSCAR o token: não há token desta chamada para redigir.
      const motivo = this.redigir((err as Error).message);
      this.logger.warn(`Falha ao autenticar por token para enviar e-mail a ${msg.to}: ${motivo}`);
      return { enviado: false, motivo };
    }

    try {
      await transporter.sendMail({
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
      const motivo = this.redigir((err as Error).message, tokenUsado);
      this.logger.warn(`Falha ao enviar e-mail para ${msg.to}: ${motivo}`);
      return { enviado: false, motivo };
    }
  }

  /**
   * No modo senha o transporter é sempre o mesmo. No modo token ele é
   * remontado só quando o token muda — um disparo inteiro de newsletter
   * reusa o mesmo token e o mesmo transporter.
   */
  private async obterTransporter(): Promise<{ transporter: Transporter; tokenUsado?: string }> {
    if (this.modo === 'senha') return { transporter: this.transporter as Transporter };

    const token = await this.obterToken();
    if (!this.transporterToken || this.transporterToken.token !== token) {
      this.transporterToken = {
        token,
        transporter: nodemailer.createTransport({
          host: this.host,
          port: this.port,
          secure: this.secure,
          auth: { type: 'OAuth2', user: this.usuario, accessToken: token },
        }),
      };
    }
    return { transporter: this.transporterToken.transporter, tokenUsado: token };
  }

  /** Token em cache enquanto válido; uma única busca em voo por vez. */
  private async obterToken(): Promise<string> {
    const cache = this.tokenCache;
    if (cache && cache.expiraEm > Date.now()) return cache.valor;

    if (!this.buscaToken) {
      this.buscaToken = this.buscarToken().finally(() => {
        this.buscaToken = null;
      });
    }
    return this.buscaToken;
  }

  private async buscarToken(): Promise<string> {
    const url = `https://login.microsoftonline.com/${encodeURIComponent(this.tenantId)}/oauth2/v2.0/token`;
    const corpo = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: ESCOPO_SMTP,
      grant_type: 'client_credentials',
    });

    const resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo.toString(),
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      // A mensagem passa pelo redigir() de enviar() antes de virar log ou motivo.
      throw new Error(`A Microsoft recusou a emissão do token (HTTP ${resposta.status}): ${detalhe.slice(0, 300)}`);
    }

    const dados = (await resposta.json()) as { access_token?: unknown; expires_in?: unknown };
    const token = typeof dados.access_token === 'string' ? dados.access_token : '';
    if (!token) throw new Error('A resposta da Microsoft não trouxe access_token.');

    const validadeS = Number(dados.expires_in) > 0 ? Number(dados.expires_in) : VALIDADE_PADRAO_S;
    const validadeMs = validadeS * 1000;
    const margem = Math.min(MARGEM_RENOVACAO_MS, validadeMs / 2);
    this.tokenCache = { valor: token, expiraEm: Date.now() + validadeMs - margem };
    this.logger.log(`Token de envio do Microsoft 365 renovado — válido por ${validadeS}s.`);
    return token;
  }

  /**
   * Ponto único por onde todo texto de falha passa antes de virar log ou o
   * `motivo` devolvido ao chamador (`newsletter.enviarTeste` joga o `motivo`
   * dentro de um BadRequestException, que chega à tela do operador). Segredo
   * do aplicativo e token nunca podem sair daqui. Nem a Microsoft nem o
   * servidor SMTP devolvem o segredo no erro, mas a guarda não depende disso.
   *
   * O token vem por PARÂMETRO, nunca de `this.tokenCache`: o cache é
   * compartilhado entre chamadas concorrentes e pode ter sido rotacionado
   * enquanto este envio estava em voo — ler o cache aqui apagaria o token
   * novo e deixaria vazar justamente o que falhou. O `clientSecret` pode vir
   * do campo porque é readonly e não muda durante a vida do serviço.
   */
  private redigir(texto: string, tokenUsado?: string): string {
    let saida = texto ?? '';
    for (const segredo of [this.clientSecret, tokenUsado]) {
      if (segredo && segredo.length >= 8) saida = saida.split(segredo).join('***');
    }
    return saida;
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
