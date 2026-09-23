import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, emailLayout, esc } from '../mail/mail.service';

const LINK = '{{LINK_DESCADASTRO}}';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ORDEM: Record<string, number> = { Alta: 0, Média: 1 };
const COR: Record<string, string> = { Alta: '#b3261e', Média: '#a86a00' };

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Newsletter do InTAX: o Radar gera o RASCUNHO toda segunda; uma pessoa revisa,
 * aprova e dispara. Nada sai automaticamente — o Radar é gerado por IA e pode
 * errar. Só recebe quem deu consentimento, e todo e-mail leva link de descadastro.
 */
@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  @Cron('30 7 * * 1', { timeZone: 'America/Sao_Paulo' })
  async rascunhoSemanal() {
    try {
      await this.gerarRascunho();
    } catch (err) {
      this.logger.warn(`Rascunho semanal não gerado: ${(err as Error).message}`);
    }
  }

  async gerarRascunho() {
    const exec = await this.prisma.radarReformaExecucao.findFirst({ where: { status: 'OK' }, orderBy: { executado_em: 'desc' } });
    if (!exec) throw new BadRequestException('Ainda não há Radar gerado. Gere o Radar de Novidades primeiro.');

    const existente = await this.prisma.newsletterEdicao.findFirst({ where: { semana_referencia: exec.semana_referencia } });
    if (existente) return existente;

    const itens = (await this.prisma.radarReformaItem.findMany({
      where: { semana_referencia: exec.semana_referencia, prioridade: { in: ['Alta', 'Média'] } },
    })).sort((a, b) => (ORDEM[a.prioridade] ?? 9) - (ORDEM[b.prioridade] ?? 9));
    if (itens.length === 0) throw new BadRequestException('O Radar desta semana não tem itens de prioridade Alta ou Média.');

    const blocos = itens.map((i) => `
      <div style="border:1px solid #dfe5e0;border-radius:6px;padding:14px;margin:0 0 12px">
        <div style="font-size:11px;font-weight:bold;color:${COR[i.prioridade] || '#555'};text-transform:uppercase">${esc(i.prioridade)} · ${esc(i.status_normativo || 'A confirmar')}</div>
        <div style="font-size:12px;color:#5b6b63;margin:2px 0 8px">${esc(i.categoria)}</div>
        <div style="font-size:14px;line-height:1.55">${esc(i.resumo)}</div>
        ${i.prazo_vigencia ? `<div style="font-size:13px;margin-top:8px"><b>Prazo/vigência:</b> ${esc(i.prazo_vigencia)}</div>` : ''}
        ${i.acao_recomendada ? `<div style="font-size:13px;margin-top:6px;background:#f3f5f2;padding:8px;border-radius:4px"><b>O que fazer:</b> ${esc(i.acao_recomendada)}</div>` : ''}
        ${i.fonte_url ? `<div style="font-size:12px;margin-top:8px"><a href="${esc(i.fonte_url)}" style="color:#1f3a2e">${esc(i.fonte_nome || 'Fonte')}</a></div>` : ''}
      </div>`).join('');

    const corpo = `${exec.resumo_executivo ? `<p style="font-size:14px;line-height:1.6;margin:0 0 16px"><b>Resumo da semana:</b> ${esc(exec.resumo_executivo)}</p>` : ''}${blocos}`;
    return this.prisma.newsletterEdicao.create({
      data: {
        assunto: `Radar InTAX — ${itens.length} novidade(s) da reforma tributária para você acompanhar`,
        semana_referencia: exec.semana_referencia,
        corpo_html: corpo,
      },
    });
  }

  private montarHtml(ed: { assunto: string; corpo_html: string }, linkDescadastro: string) {
    const rodape = `Você recebe este e-mail porque se cadastrou nas ferramentas do InTAX. <a href="${esc(linkDescadastro)}" style="color:#1f3a2e">Cancelar inscrição</a>.`;
    return emailLayout(ed.assunto, ed.corpo_html, rodape);
  }

  async atualizar(id: string, dados: { assunto?: string; corpo_html?: string }) {
    const ed = await this.prisma.newsletterEdicao.findUnique({ where: { id } });
    if (!ed) throw new NotFoundException('Edição não encontrada.');
    if (ed.status === 'Enviada' || ed.status === 'Enviando') throw new BadRequestException('Edição já enviada não pode ser alterada.');
    return this.prisma.newsletterEdicao.update({
      where: { id },
      data: { assunto: dados.assunto?.slice(0, 200) ?? ed.assunto, corpo_html: dados.corpo_html ?? ed.corpo_html, status: 'Rascunho', aprovada_por: null, aprovada_em: null },
    });
  }

  async aprovar(id: string, quem: string) {
    const ed = await this.prisma.newsletterEdicao.findUnique({ where: { id } });
    if (!ed) throw new NotFoundException('Edição não encontrada.');
    if (ed.status !== 'Rascunho') throw new BadRequestException(`Edição está "${ed.status}".`);
    return this.prisma.newsletterEdicao.update({ where: { id }, data: { status: 'Aprovada', aprovada_por: quem, aprovada_em: new Date() } });
  }

  async enviarTeste(id: string, para: string) {
    if (!EMAIL_RE.test(para)) throw new BadRequestException('E-mail de teste inválido.');
    const ed = await this.prisma.newsletterEdicao.findUnique({ where: { id } });
    if (!ed) throw new NotFoundException('Edição não encontrada.');
    const r = await this.mail.enviar({ to: para, subject: `[TESTE] ${ed.assunto}`, html: this.montarHtml(ed, '#') });
    if (!r.enviado) throw new BadRequestException(`Não foi possível enviar: ${r.motivo}`);
    return { enviado: true };
  }

  async enviar(id: string) {
    if (!this.mail.configurado) throw new BadRequestException('O envio de e-mail ainda não está configurado no servidor (SMTP).');
    const travou = await this.prisma.newsletterEdicao.updateMany({ where: { id, status: 'Aprovada' }, data: { status: 'Enviando' } });
    if (travou.count === 0) throw new BadRequestException('Só é possível enviar uma edição aprovada e ainda não enviada.');

    const ed = await this.prisma.newsletterEdicao.findUniqueOrThrow({ where: { id } });
    const inscritos = await this.prisma.newsletterInscrito.findMany({ where: { ativo: true } });
    let ok = 0;
    let falhas = 0;
    for (const ins of inscritos) {
      const link = `${this.mail.urlPublica}/api/v1/public/newsletter/descadastrar?token=${ins.token}`;
      const r = await this.mail.enviar({
        to: ins.email,
        subject: ed.assunto,
        html: this.montarHtml(ed, link),
        headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      r.enviado ? ok++ : falhas++;
      await dormir(250);
    }
    return this.prisma.newsletterEdicao.update({
      where: { id },
      data: { status: 'Enviada', enviada_em: new Date(), destinatarios: ok, falhas },
    });
  }

  async inscrever(email: string, nome?: string, segmento?: string, origem = 'site') {
    const e = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(e)) throw new BadRequestException('Informe um e-mail válido.');
    await this.prisma.newsletterInscrito.upsert({
      where: { email: e },
      create: { email: e, nome: nome?.slice(0, 120), segmento: segmento?.slice(0, 60), origem, consentimento_em: new Date() },
      update: { ativo: true, descadastrado_em: null, consentimento_em: new Date() },
    });
    return { ok: true };
  }

  async descadastrar(token: string) {
    const ins = token ? await this.prisma.newsletterInscrito.findUnique({ where: { token } }) : null;
    if (!ins) return false;
    await this.prisma.newsletterInscrito.update({ where: { id: ins.id }, data: { ativo: false, descadastrado_em: new Date() } });
    return true;
  }

  async resumo() {
    const [ativos, total, mailOk] = await Promise.all([
      this.prisma.newsletterInscrito.count({ where: { ativo: true } }),
      this.prisma.newsletterInscrito.count(),
      Promise.resolve(this.mail.configurado),
    ]);
    return { inscritos_ativos: ativos, inscritos_total: total, email_configurado: mailOk };
  }
}

export const LINK_DESCADASTRO = LINK;
