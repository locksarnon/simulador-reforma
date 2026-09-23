import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, emailLayout, esc } from '../mail/mail.service';
import { PdfService, DocumentoPdf } from '../pdf/pdf.service';

export type NovoLead = {
  nome: string;
  email: string;
  empresa?: string;
  cargo?: string;
  telefone?: string;
  porte?: string;
  segmento?: string;
  perfil?: string;
  regime?: string;
  origem: string;
  consentimento_email?: boolean;
  dados?: Record<string, unknown>;
  relatorio?: DocumentoPdf;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CARGOS_DECISORES = /(s[oó]cio|diretor|ceo|presidente|propriet|dono|gerente|cfo|controller|financeiro)/i;

/**
 * Pontuação do funil (regra do plano): porte + impacto + regime + cargo.
 * Define o destino: consultoria (impacto alto/empresa maior), BPO (pequena,
 * Simples ou desorganizada), parceria (escritório contábil) ou nutrição.
 */
export function pontuar(l: Pick<NovoLead, 'porte' | 'regime' | 'cargo' | 'dados' | 'perfil'>) {
  const porte = { micro: 5, pequena: 10, media: 20, grande: 30, escritorio_contabil: 0 }[String(l.porte)] ?? 5;
  const regime = { real: 15, presumido: 10, simples: 5, produtor_pf: 5 }[String(l.regime)] ?? 5;
  const pp = Math.abs(Number((l.dados as { impacto_pp_2033?: number })?.impacto_pp_2033 ?? 0));
  const impacto = pp >= 3 ? 30 : pp >= 1.5 ? 20 : pp > 0 ? 10 : 0;
  const cargo = l.cargo && CARGOS_DECISORES.test(l.cargo) ? 10 : 0;
  const score = porte + regime + impacto + cargo;

  let destino: 'consultoria' | 'bpo' | 'parceria' | 'nutricao' = 'nutricao';
  if (l.porte === 'escritorio_contabil' || l.perfil === 'contador') destino = 'parceria';
  else if (score >= 55) destino = 'consultoria';
  else if (score >= 30 || l.regime === 'simples') destino = 'bpo';
  return { score, destino };
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly pdf: PdfService,
  ) {}

  async criar(dto: NovoLead) {
    const email = String(dto.email || '').trim().toLowerCase();
    const nome = String(dto.nome || '').trim();
    if (!nome) throw new BadRequestException('Informe seu nome.');
    if (!EMAIL_RE.test(email)) throw new BadRequestException('Informe um e-mail válido.');

    const { score, destino } = pontuar(dto);
    const corte = (s: unknown, n = 160) => (s ? String(s).trim().slice(0, n) : null);
    const dadosJson = dto.dados ? JSON.stringify(dto.dados).slice(0, 20_000) : null;

    const recente = await this.prisma.lead.findFirst({
      where: { email, origem: dto.origem, createdAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
    });
    const dados = {
      nome: nome.slice(0, 120), email, empresa: corte(dto.empresa), cargo: corte(dto.cargo, 80), telefone: corte(dto.telefone, 30),
      porte: corte(dto.porte, 40), segmento: corte(dto.segmento, 60), perfil: corte(dto.perfil, 60), origem: dto.origem.slice(0, 40),
      consentimento_email: Boolean(dto.consentimento_email),
      consentimento_em: dto.consentimento_email ? new Date() : null,
      score, destino, dados_json: dadosJson,
    };
    const lead = recente
      ? await this.prisma.lead.update({ where: { id: recente.id }, data: dados })
      : await this.prisma.lead.create({ data: dados });

    if (dto.consentimento_email) {
      await this.prisma.newsletterInscrito.upsert({
        where: { email },
        create: { email, nome: dados.nome, segmento: dados.segmento, perfil: dados.perfil, origem: dados.origem, consentimento_em: new Date() },
        update: { nome: dados.nome, segmento: dados.segmento, perfil: dados.perfil, ativo: true, descadastrado_em: null },
      });
    }

    // E-mails são "melhor esforço": falha de envio nunca derruba o cadastro.
    void this.notificar(lead.id, dto, score, destino).catch((e) => this.logger.warn(`Notificação do lead falhou: ${e.message}`));
    return { id: lead.id, score, destino, email_configurado: this.mail.configurado };
  }

  private async notificar(_id: string, dto: NovoLead, score: number, destino: string) {
    if (!this.mail.configurado) return;
    const email = dto.email.trim().toLowerCase();

    if (dto.relatorio) {
      const pdf = await this.pdf.gerar(dto.relatorio);
      await this.mail.enviar({
        to: email,
        subject: `Seu relatório InTAX: ${dto.relatorio.titulo}`.slice(0, 150),
        html: emailLayout(
          `Olá, ${dto.nome.split(' ')[0]}!`,
          `<p style="line-height:1.6">Segue em anexo o relatório que você gerou no InTAX.</p>
           <p style="line-height:1.6">Quer esse cálculo com as <b>suas notas reais</b>? Responda este e-mail e agendamos um diagnóstico.</p>`,
        ),
        attachments: [{ filename: 'relatorio-intax.pdf', content: pdf, contentType: 'application/pdf' }],
      });
    }

    if (this.mail.emailInterno) {
      await this.mail.enviar({
        to: this.mail.emailInterno,
        subject: `Novo lead (${destino}, score ${score}): ${dto.nome}`.slice(0, 150),
        html: emailLayout('Novo lead no InTAX', `<table cellpadding="4" style="font-size:14px">
          <tr><td><b>Nome</b></td><td>${esc(dto.nome)}</td></tr><tr><td><b>E-mail</b></td><td>${esc(dto.email)}</td></tr>
          <tr><td><b>Empresa</b></td><td>${esc(dto.empresa)}</td></tr><tr><td><b>Cargo</b></td><td>${esc(dto.cargo)}</td></tr>
          <tr><td><b>Telefone</b></td><td>${esc(dto.telefone)}</td></tr><tr><td><b>Perfil</b></td><td>${esc(dto.perfil)} / ${esc(dto.segmento)}</td></tr>
          <tr><td><b>Origem</b></td><td>${esc(dto.origem)}</td></tr><tr><td><b>Score / destino</b></td><td>${score} / ${esc(destino)}</td></tr></table>`),
      });
    }
  }

  /** Confere se existe lead recente com o e-mail — libera o resultado completo das ferramentas gratuitas. */
  async leadRecente(email: string, origem: string) {
    const e = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return false;
    const l = await this.prisma.lead.findFirst({
      where: { email: e, origem, createdAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
      select: { id: true },
    });
    return Boolean(l);
  }
}
