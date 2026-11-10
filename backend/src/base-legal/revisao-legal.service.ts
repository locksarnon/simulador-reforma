import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { montarEmailRevisao } from './revisao-legal.email';
import {
  Impacto, impactoDe, MudancaDispositivo, NormaMudada, NovaRevisao, revisoesDeCartoes, revisoesDeFundamentos, revisoesDeMarcos, TipoRevisao,
} from './revisao-legal.regras';

export type ResumoRevisao = {
  /** Cartões que citam os dispositivos alterados (publicados ou rascunhos). */
  cartoes: number;
  /** Destes, quantos estavam publicados e voltaram para rascunho. */
  cartoes_despublicados: number;
  fundamentos: number;
  marcos: number;
  /** Linhas gravadas na fila de revisão (uma por item e dispositivo). */
  itens: number;
};

export const TIPOS_REVISAO: TipoRevisao[] = ['cartao', 'fundamento', 'marco'];

/**
 * Fila de revisão pela lei. Quando o texto de um dispositivo da Base legal muda, os itens que o citam (cartões de
 * pergunta frequente, notas "i" do cálculo e marcos da agenda) entram na fila com o motivo e a data. O cartão publicado
 * volta para rascunho. Nada é publicado de novo sem a conferência do administrador.
 */
@Injectable()
export class RevisaoLegalService {
  private readonly log = new Logger(RevisaoLegalService.name);

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  private cartoesParaConferir() {
    return this.prisma.cartaoLegal.findMany({ select: { id: true, pergunta: true, status: true, fundamentos: true } });
  }

  private marcosDaAgenda() {
    return this.prisma.agendaMarco.findMany({ where: { ativo: true }, select: { id: true, titulo: true, fontes: true } });
  }

  /** Quantos itens citam os dispositivos que vão mudar (só leitura; usado no aviso de atualização pendente). */
  async impacto(norma: NormaMudada, mudancas: MudancaDispositivo[]): Promise<Impacto> {
    if (!mudancas.length) return { cartoes: 0, publicados: 0, fundamentos: 0, marcos: 0 };
    const [cartoes, marcos] = await Promise.all([this.cartoesParaConferir(), this.marcosDaAgenda()]);
    return impactoDe(cartoes, marcos, norma, mudancas);
  }

  /**
   * Chamado quando uma atualização da Base legal muda dispositivos já carregados: grava a fila de revisão, devolve para
   * rascunho os cartões publicados que os citam e avisa o administrador por e-mail (se o envio estiver configurado).
   */
  async registrarMudancas(norma: NormaMudada, mudancas: MudancaDispositivo[]): Promise<ResumoRevisao> {
    const vazio: ResumoRevisao = { cartoes: 0, cartoes_despublicados: 0, fundamentos: 0, marcos: 0, itens: 0 };
    if (!mudancas.length) return vazio;

    const [cartoes, marcos] = await Promise.all([this.cartoesParaConferir(), this.marcosDaAgenda()]);
    const dosCartoes = revisoesDeCartoes(cartoes, norma, mudancas);
    const dosFundamentos = revisoesDeFundamentos(norma, mudancas);
    const dosMarcos = revisoesDeMarcos(marcos, norma, mudancas);
    const novas: NovaRevisao[] = [...dosCartoes, ...dosFundamentos, ...dosMarcos];
    if (!novas.length) return vazio;

    const idsCartoes = new Set(dosCartoes.map((r) => r.alvo_id));
    const publicados = cartoes.filter((c) => idsCartoes.has(c.id) && c.status === 'revisado').map((c) => c.id);

    // O mesmo dispositivo mudando de novo antes da conferência (ou a mesma atualização repetida) atualiza a linha pendente em vez de duplicá-la.
    const chave = (r: { tipo: string; alvo_id: string; caminho: string }) => `${r.tipo}|${r.alvo_id}|${r.caminho}`;
    const pendentes = await this.prisma.revisaoLegal.findMany({
      where: { status: 'pendente', norma_chave: norma.chave, caminho: { in: [...new Set(novas.map((r) => r.caminho))] } },
      select: { id: true, tipo: true, alvo_id: true, caminho: true },
    });
    const idPendente = new Map(pendentes.map((p) => [chave(p), p.id]));
    const criar = novas.filter((r) => !idPendente.has(chave(r)));
    const atualizar = novas.filter((r) => idPendente.has(chave(r)));

    await this.prisma.$transaction([
      ...(criar.length ? [this.prisma.revisaoLegal.createMany({ data: criar })] : []),
      ...atualizar.map((r) => this.prisma.revisaoLegal.update({
        where: { id: idPendente.get(chave(r)) as string },
        data: { alvo_titulo: r.alvo_titulo, rotulo: r.rotulo, mudanca: r.mudanca, detalhe: r.detalhe, critica: r.critica },
      })),
      ...(publicados.length
        ? [this.prisma.cartaoLegal.updateMany({ where: { id: { in: publicados }, status: 'revisado' }, data: { status: 'rascunho', revisado_por: null, revisado_em: null } })]
        : []),
    ]);

    this.log.log(`${norma.chave}: ${novas.length} item(ns) para revisar (${idsCartoes.size} cartão(ões), ${publicados.length} despublicado(s))`);
    await this.avisarAdministrador(norma, novas, publicados.length);
    return {
      cartoes: idsCartoes.size,
      cartoes_despublicados: publicados.length,
      fundamentos: new Set(dosFundamentos.map((r) => r.alvo_id)).size,
      marcos: new Set(dosMarcos.map((r) => r.alvo_id)).size,
      itens: novas.length,
    };
  }

  /** Aviso por e-mail ao endereço interno (NOTIFY_EMAIL). Falha de envio nunca desfaz a revisão. */
  private async avisarAdministrador(norma: NormaMudada, revisoes: NovaRevisao[], despublicados: number) {
    try {
      const para = this.mail?.emailInterno;
      if (!para || !this.mail.configurado) return;
      const e = montarEmailRevisao(norma, revisoes, despublicados, this.mail.urlPublica);
      const r = await this.mail.enviar({ to: para, subject: e.assunto, html: e.html, text: e.texto });
      if (!r.enviado) this.log.warn(`Aviso de revisão não enviado: ${r.motivo}`);
    } catch (e) {
      this.log.warn(`Aviso de revisão falhou: ${(e as Error).message}`);
    }
  }

  listarPendentes(tipos: TipoRevisao[] = TIPOS_REVISAO) {
    return this.prisma.revisaoLegal.findMany({ where: { status: 'pendente', tipo: { in: tipos } }, orderBy: { mudou_em: 'desc' }, take: 1000 });
  }

  /** Revisões pendentes de vários itens do mesmo tipo, agrupadas pelo id do item. */
  async pendentesPorAlvo(tipo: TipoRevisao, ids: string[]) {
    const porAlvo = new Map<string, Awaited<ReturnType<RevisaoLegalService['listarPendentes']>>>();
    if (!ids.length) return porAlvo;
    const linhas = await this.prisma.revisaoLegal.findMany({ where: { tipo, alvo_id: { in: ids }, status: 'pendente' }, orderBy: { mudou_em: 'desc' } });
    for (const l of linhas) porAlvo.set(l.alvo_id, [...(porAlvo.get(l.alvo_id) ?? []), l]);
    return porAlvo;
  }

  /** O administrador conferiu o item: as revisões pendentes dele saem da fila. */
  async resolver(tipo: TipoRevisao, alvoId: string, por: string) {
    const r = await this.prisma.revisaoLegal.updateMany({
      where: { tipo, alvo_id: alvoId, status: 'pendente' },
      data: { status: 'resolvida', resolvida_por: por, resolvida_em: new Date() },
    });
    return { resolvidas: r.count };
  }

  /** O item deixou de existir (cartão excluído): a fila dele não faz mais sentido. */
  async descartar(tipo: TipoRevisao, alvoId: string) {
    await this.prisma.revisaoLegal.deleteMany({ where: { tipo, alvo_id: alvoId } });
  }
}
