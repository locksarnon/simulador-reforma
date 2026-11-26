import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { avisosDePendencias } from './avisos-legais';

export type FiltroNovidades = {
  /** abertas (padrão: novas e vistas) | nova | vista | descartada | resolvida | todas */
  status?: string;
  /** Um ou mais tipos separados por vírgula. */
  tipo?: string;
  /** Chave da norma (ex.: lcp-214-2025). */
  norma?: string;
  origem?: string;
  /** sim | nao */
  confirmada?: string;
  busca?: string;
  pagina?: number;
  limite?: number;
};

export const ABERTAS = ['nova', 'vista'];
export const ACOES_NOVIDADE = ['visto', 'confirmar', 'descartar', 'reabrir'] as const;
export type AcaoNovidade = (typeof ACOES_NOVIDADE)[number];

const limitar = (n: unknown, padrao: number, max: number) => Math.min(Math.max(Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : padrao, 1), max);

/**
 * Consulta e curadoria das novidades das bases legais: o que a revisão semanal e as atualizações das normas
 * descobriram (alterações, revogações, atos novos, regulamentações, aplicações), com a situação de cada um.
 */
@Injectable()
export class ConhecimentoLegalService {
  constructor(private readonly prisma: PrismaService) {}

  private onde(f: FiltroNovidades): Prisma.NovidadeLegalWhereInput {
    const where: Prisma.NovidadeLegalWhereInput = {};
    const status = (f.status || 'abertas').trim();
    if (status === 'abertas') where.status = { in: ABERTAS };
    else if (status !== 'todas') where.status = status;
    const tipos = (f.tipo || '').split(',').map((t) => t.trim()).filter(Boolean);
    if (tipos.length) where.tipo = { in: tipos };
    if (f.norma) where.norma_chave = f.norma.trim();
    if (f.origem) where.origem = f.origem.trim();
    if (f.confirmada === 'sim') where.confirmada = true;
    else if (f.confirmada === 'nao') where.confirmada = false;
    const q = (f.busca || '').trim().slice(0, 120);
    if (q) {
      where.OR = [
        { titulo: { contains: q, mode: 'insensitive' } }, { resumo: { contains: q, mode: 'insensitive' } },
        { ato: { contains: q, mode: 'insensitive' } }, { norma_numero: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  async listarNovidades(f: FiltroNovidades = {}) {
    const limite = limitar(f.limite, 50, 200);
    const pagina = limitar(f.pagina, 1, 10_000);
    const where = this.onde(f);
    const [itens, total] = await Promise.all([
      this.prisma.novidadeLegal.findMany({ where, orderBy: [{ detectada_em: 'desc' }, { id: 'desc' }], skip: (pagina - 1) * limite, take: limite }),
      this.prisma.novidadeLegal.count({ where }),
    ]);
    return { itens, total, pagina, limite };
  }

  /** Números para os selos da tela: o que há de novo, o que falta confirmar e a situação das normas. */
  async resumo() {
    const abertas = { status: { in: ABERTAS } };
    const [porTipo, novas, aConfirmar, naoConsolidadas, revogadas, parciais, ultima] = await Promise.all([
      this.prisma.novidadeLegal.groupBy({ by: ['tipo'], where: abertas, _count: { _all: true } }),
      this.prisma.novidadeLegal.count({ where: { status: 'nova' } }),
      this.prisma.novidadeLegal.count({ where: { ...abertas, confirmada: false } }),
      this.prisma.novidadeLegal.count({ where: { ...abertas, tipo: 'nao_consolidada' } }),
      this.prisma.normaLegal.count({ where: { situacao: 'revogada' } }),
      this.prisma.normaLegal.count({ where: { situacao: 'parcialmente_revogada' } }),
      this.prisma.revisaoSemanal.findFirst({ orderBy: { iniciado_em: 'desc' }, select: { id: true, semana: true, status: true, iniciado_em: true, concluido_em: true, resumo: true } }),
    ]);
    return {
      novas, a_confirmar: aConfirmar, nao_consolidadas: naoConsolidadas, normas_revogadas: revogadas, normas_parcialmente_revogadas: parciais,
      por_tipo: Object.fromEntries(porTipo.map((t) => [t.tipo, t._count._all])), ultima_revisao: ultima,
    };
  }

  /** Marca a novidade como vista, confirma uma achada na web, descarta ou reabre. Só a equipe de administração mexe. */
  async atualizar(id: string, acao: string, por: string) {
    if (!ACOES_NOVIDADE.includes(acao as AcaoNovidade)) throw new BadRequestException('Ação inválida');
    const n = await this.prisma.novidadeLegal.findUnique({ where: { id }, select: { id: true, status: true, confirmada: true } });
    if (!n) throw new NotFoundException('Novidade não encontrada');
    const agora = new Date();
    const dados: Prisma.NovidadeLegalUpdateInput =
      acao === 'visto' ? { status: n.status === 'nova' ? 'vista' : n.status }
      : acao === 'confirmar' ? { confirmada: true, status: n.status === 'nova' ? 'vista' : n.status, resolvida_por: por, resolvida_em: agora }
      : acao === 'descartar' ? { status: 'descartada', resolvida_por: por, resolvida_em: agora }
      : { status: 'nova', resolvida_por: null, resolvida_em: null };
    return this.prisma.novidadeLegal.update({ where: { id }, data: dados });
  }

  /** O que a base de conhecimento sabe de novo sobre uma norma (alterações, atos que a citam, pendências de consolidação). */
  novidadesDaNorma(chave: string, limite = 60) {
    return this.prisma.novidadeLegal.findMany({
      where: { norma_chave: chave, status: { not: 'descartada' } },
      orderBy: [{ detectada_em: 'desc' }, { id: 'desc' }],
      take: limitar(limite, 60, 200),
    });
  }

  /**
   * Avisos que o assistente deve levar junto de cada dispositivo que vai citar: alteração de um ato novo que o texto compilado
   * ainda não traz. A chave do mapa é "norma/caminho".
   */
  async avisosDosDispositivos(itens: { chave: string; caminho: string }[]): Promise<Map<string, string[]>> {
    const chaves = [...new Set(itens.map((i) => i.chave))];
    if (!chaves.length) return new Map<string, string[]>();
    const pendencias = await this.prisma.novidadeLegal.findMany({
      where: { tipo: 'nao_consolidada', status: { in: ABERTAS }, norma_chave: { in: chaves } },
      select: { norma_chave: true, ato: true, detalhes: true },
    });
    return avisosDePendencias(pendencias, itens);
  }

  // ───────────── Revisão semanal: consulta ─────────────

  listarRodadas(limite = 20) {
    return this.prisma.revisaoSemanal.findMany({ orderBy: { iniciado_em: 'desc' }, take: limitar(limite, 20, 100) });
  }
}
