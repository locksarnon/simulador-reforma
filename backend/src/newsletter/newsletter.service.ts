import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, emailLayout, esc } from '../mail/mail.service';
import { BaseLegalService } from '../base-legal/base-legal.service';
import { htmlNewsletter, htmlNewsletterSemIa, itensDaSemana, promptNewsletter, TIPOS_NOVIDADE_NEWSLETTER, validarNewsletter } from './newsletter-resumo';

const LINK = '{{LINK_DESCADASTRO}}';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ORDEM: Record<string, number> = { Alta: 0, Média: 1 };
/** Novidades das bases legais que entram na edição: as da última semana (a revisão semanal roda na segunda às 5h). */
const JANELA_NOVIDADES_MS = 8 * 86_400_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Newsletter do InTAX: o Radar gera o RASCUNHO toda segunda às 7h30, e às 8h
 * (ver `envioAutomaticoSemanal`) o sistema aprova e dispara sozinho pra quem
 * deu consentimento — decisão explícita do usuário em 2026-10-01, ciente de
 * que o conteúdo vem de IA (Radar/Gemini) e vai pra lista sem revisão humana.
 * Uma edição já tocada manualmente antes das 8h (aprovada/enviada) nunca é
 * reenviada pelo cron — só edições ainda em "Rascunho" são auto-enviadas.
 * Todo e-mail leva link de descadastro (one-click, LGPD/CAN-SPAM).
 */
@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService, private readonly modulos: ModuleRef) {}

  /** Motor de IA das bases legais (Claude ou Gemini), buscado na hora: o módulo Comercial não depende do módulo da Base legal. */
  private ia(): BaseLegalService | null {
    try {
      return this.modulos.get(BaseLegalService, { strict: false });
    } catch {
      return null;
    }
  }

  @Cron('30 7 * * 1', { timeZone: 'America/Sao_Paulo' })
  async rascunhoSemanal() {
    try {
      await this.gerarRascunho();
    } catch (err) {
      this.logger.warn(`Rascunho semanal não gerado: ${(err as Error).message}`);
    }
  }

  /** 30 min depois do rascunho — tempo de a geração do Radar/rascunho terminar antes de tentar enviar. */
  @Cron('0 8 * * 1', { timeZone: 'America/Sao_Paulo' })
  async envioAutomaticoSemanal() {
    let ed;
    try {
      ed = await this.gerarRascunho();
    } catch (err) {
      this.logger.warn(`Envio automático: sem rascunho esta semana (${(err as Error).message}).`);
      return;
    }
    if (ed.status !== 'Rascunho') return; // já aprovada/enviada manualmente antes do cron rodar

    try {
      await this.aprovar(ed.id, 'sistema (envio automático)');
      const enviada = await this.enviar(ed.id);
      this.logger.log(`Newsletter "${enviada.assunto}" enviada automaticamente: ${enviada.destinatarios} ok, ${enviada.falhas} falhas.`);
      if (this.mail.emailInterno) {
        await this.mail.enviar({
          to: this.mail.emailInterno,
          subject: `[InTAX] Newsletter enviada automaticamente: ${enviada.assunto}`.slice(0, 150),
          html: emailLayout('Newsletter enviada automaticamente', `<p style="font-size:14px;line-height:1.6">A edição da semana ${esc(enviada.semana_referencia)} foi aprovada e enviada sozinha pelo sistema, sem revisão humana.</p><p style="font-size:14px"><b>Destinatários:</b> ${enviada.destinatarios} enviados, ${enviada.falhas} falhas.</p><p style="font-size:13px;color:#5b6b63">Revise o conteúdo em /comercial/newsletter — se algo saiu errado, o próximo passo é corrigir a fonte (Radar) antes da próxima segunda.</p>`),
        });
      }
    } catch (err) {
      this.logger.error(`Envio automático da newsletter falhou: ${(err as Error).message}`);
    }
  }

  async gerarRascunho() {
    const exec = await this.prisma.radarReformaExecucao.findFirst({ where: { status: 'OK' }, orderBy: { executado_em: 'desc' } });
    if (!exec) throw new BadRequestException('Ainda não há Radar gerado. Gere o Radar de Novidades primeiro.');

    const existente = await this.prisma.newsletterEdicao.findFirst({ where: { semana_referencia: exec.semana_referencia } });
    if (existente) return existente;

    const radar = (await this.prisma.radarReformaItem.findMany({
      where: { semana_referencia: exec.semana_referencia, prioridade: { in: ['Alta', 'Média'] } },
    })).sort((a, b) => (ORDEM[a.prioridade] ?? 9) - (ORDEM[b.prioridade] ?? 9));
    // O que a revisão semanal das bases legais achou: leis alteradas ou revogadas, normas novas e documentos oficiais que mudaram.
    const novidades = await this.prisma.novidadeLegal.findMany({
      where: { detectada_em: { gte: new Date(Date.now() - JANELA_NOVIDADES_MS) }, oficial: true, confirmada: true, status: { not: 'descartada' }, tipo: { in: TIPOS_NOVIDADE_NEWSLETTER } },
      orderBy: { detectada_em: 'desc' },
      take: 20,
      select: { tipo: true, norma_numero: true, titulo: true, resumo: true, url: true },
    });
    if (radar.length === 0 && novidades.length === 0) throw new BadRequestException('Nada de prioridade Alta ou Média no Radar desta semana e nenhuma mudança nas leis acompanhadas.');

    const { assunto, corpo } = await this.conteudo(radar, novidades, exec.resumo_executivo);
    return this.prisma.newsletterEdicao.create({ data: { assunto, semana_referencia: exec.semana_referencia, corpo_html: corpo } });
  }

  /** A IA escreve o resumo do resumo, o efeito por setor e o que preparar; sem IA (ou resposta inaproveitável), a versão curta. */
  private async conteudo(radar: Parameters<typeof itensDaSemana>[0], novidades: Parameters<typeof itensDaSemana>[1], resumoExecutivo: string | null) {
    const itens = itensDaSemana(radar, novidades);
    const motor = this.ia();
    if (motor) {
      try {
        const c = validarNewsletter(await motor.ia(promptNewsletter(itens), 90_000), itens);
        if (c) return { assunto: c.assunto, corpo: htmlNewsletter(c, itens) };
        this.logger.warn('Newsletter: a resposta da IA não trouxe conteúdo aproveitável; usada a versão curta.');
      } catch (e) {
        this.logger.warn(`Newsletter: IA indisponível (${(e as Error).message}); usada a versão curta.`);
      }
    }
    return htmlNewsletterSemIa(radar, novidades, resumoExecutivo);
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
