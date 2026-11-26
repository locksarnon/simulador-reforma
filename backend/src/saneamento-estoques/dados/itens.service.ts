import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CAMADAS, SITUACOES } from '../tipos';
import { camadasAtivas, validarCamada, type Json } from './constantes';
import { paramInteiro, paramTexto } from './validacao';

export type FiltroItens = {
  camada?: string; situacao?: string; revisar?: boolean; grupo?: string; busca?: string;
  ordem?: 'codigo' | 'grupo'; cursor?: string; limite?: number | string;
};

@Injectable()
export class SanItensService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista paginada por cursor (id do último item da página anterior). Ordem estável: ordem escolhida, depois id. */
  async listar(projetoId: string, bruto: FiltroItens) {
    // Parâmetros de query: só texto simples (lista ou objeto vira 400, nunca erro de servidor).
    const f = {
      camada: paramTexto(bruto.camada, 'camada'), situacao: paramTexto(bruto.situacao, 'situacao'), grupo: paramTexto(bruto.grupo, 'grupo'), busca: paramTexto(bruto.busca, 'busca'),
      ordem: paramTexto(bruto.ordem, 'ordem') as FiltroItens['ordem'], cursor: paramTexto(bruto.cursor, 'cursor'), revisar: bruto.revisar === true,
    };
    const limite = Math.min(Math.max(paramInteiro(bruto.limite, 'limite') ?? 100, 1), 500);
    if (f.situacao && !(SITUACOES as readonly string[]).includes(f.situacao)) throw new BadRequestException('Situação inválida.');
    if (f.ordem && f.ordem !== 'codigo' && f.ordem !== 'grupo') throw new BadRequestException('Ordem inválida (use codigo ou grupo).');
    const where: Json = { projeto_id: projetoId };
    const celula: Json = {};
    if (f.camada) celula.camada = validarCamada(f.camada);
    if (f.situacao) celula.situacao = f.situacao;
    if (f.revisar) celula.revisar = true;
    if (Object.keys(celula).length) where.celulas = { some: celula };
    if (f.grupo !== undefined && f.grupo !== '') where.grupo = f.grupo === '(sem grupo)' ? null : f.grupo;
    const busca = (f.busca ?? '').trim();
    if (busca) where.OR = [{ codigo: { contains: busca, mode: 'insensitive' } }, { descricao: { contains: busca, mode: 'insensitive' } }];
    const ordem = f.ordem === 'grupo' ? [{ grupo: 'asc' }, { codigo: 'asc' }, { id: 'asc' }] : [{ codigo: 'asc' }, { id: 'asc' }];
    const linhas = await this.prisma.sanItem.findMany({
      where: where as never, orderBy: ordem as never, take: limite + 1, ...(f.cursor ? { cursor: { id: f.cursor }, skip: 0 } : {}),
      select: { id: true, codigo: true, estabelecimento: true, descricao: true, grupo: true, finalidade: true, conjunto_chave: true, ativo: true, versao: true, celulas: { select: { camada: true, situacao: true, revisar: true, revisar_causa: true, caso_id: true } } },
    });
    const total = f.cursor ? undefined : await this.prisma.sanItem.count({ where: where as never });
    const pagina = linhas.slice(0, limite);
    const enq = await this.enquadramentos(projetoId, pagina.map((x) => x.id));
    const proximo = linhas.length > limite ? linhas[limite].id : null;
    return { itens: pagina.map((x) => ({ ...x, enquadramento: enq.get(x.id) ?? null })), proximo, ...(total === undefined ? {} : { total }) };
  }

  /**
   * Enquadramento de cada item da página: o do caso TRIBUTARIO aprovado ou aberto mais relevante (exceção antes de conjunto; depois o mais recente).
   * Uma consulta por página (até 500 itens), com índice GIN em SanCaso.itens; só campos leves.
   */
  private async enquadramentos(projetoId: string, ids: string[]) {
    const saida = new Map<string, Json>();
    if (!ids.length) return saida;
    const casos = await this.prisma.sanCaso.findMany({
      where: { projeto_id: projetoId, camada: 'TRIBUTARIO', situacao: { in: ['APROVADO', 'PROPOSTO', 'RASCUNHO'] }, itens: { hasSome: ids } },
      select: { id: true, tipo: true, itens: true, proposta: true, situacao: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    const peso = (tipo: string, p: Json) => (tipo.startsWith('EXCECAO') || p.origem === 'EXCECAO' ? 1 : 0);
    const quer = new Set(ids);
    const escolhido = new Map<string, { c: (typeof casos)[number]; peso: number }>();
    for (const c of casos) {
      const p = (c.proposta ?? {}) as Json;
      if (!p.cClassTrib && !p.enquadramentoLegal) continue;
      const w = peso(c.tipo, p);
      for (const id of c.itens) {
        if (!quer.has(id)) continue;
        const atual = escolhido.get(id);
        if (!atual || w > atual.peso) escolhido.set(id, { c, peso: w });
      }
    }
    for (const [id, { c, peso: w }] of escolhido) {
      const p = c.proposta as Json;
      saida.set(id, {
        cClassTrib: p.cClassTrib ?? null, cst: p.cst ?? null, enquadramentoLegal: p.enquadramentoLegal ?? null, artigo: p.artigo ?? null,
        origem: w ? 'EXCECAO' : 'HERDADO', casoId: c.id, situacao: c.situacao,
      });
    }
    return saida;
  }

  /**
   * Em quais grupos estão os itens de um caso (quantos por grupo, maior primeiro). Caso de conjunto (unidade, NCM, tributário) junta itens
   * de vários grupos: a tela, no recorte de um grupo, avisa quantos itens de outros grupos a aprovação também altera.
   */
  async gruposDoCaso(casoId: string) {
    const c = await this.prisma.sanCaso.findUnique({ where: { id: casoId }, select: { projeto_id: true, itens: true } });
    if (!c) throw new NotFoundException('Caso não encontrado.');
    const contagem = new Map<string, number>();
    for (let i = 0; i < c.itens.length; i += 5000) {
      const g = await this.prisma.sanItem.groupBy({ by: ['grupo'], where: { projeto_id: c.projeto_id, id: { in: c.itens.slice(i, i + 5000) } }, _count: { _all: true } });
      for (const x of g) contagem.set(x.grupo ?? '', (contagem.get(x.grupo ?? '') ?? 0) + x._count._all);
    }
    const grupos = [...contagem].map(([grupo, itens]) => ({ grupo: grupo || '(sem grupo)', itens })).sort((a, b) => b.itens - a.itens || a.grupo.localeCompare(b.grupo, 'pt-BR'));
    return { total: grupos.reduce((s, g) => s + g.itens, 0), grupos };
  }

  async obter(itemId: string) {
    const i = await this.prisma.sanItem.findUnique({ where: { id: itemId }, include: { celulas: true } });
    if (!i) throw new NotFoundException('Item não encontrado.');
    return i;
  }

  /** Visão geral: por grupo, a contagem de células por camada e situação (e quantas estão marcadas "revisar"). */
  async visaoGeral(projetoId: string) {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { modulos: true } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    const camadas = camadasAtivas(p.modulos as Json);
    const [cel, itens] = await Promise.all([
      this.prisma.sanCelula.groupBy({ by: ['grupo', 'camada', 'situacao', 'revisar'], where: { projeto_id: projetoId }, _count: { _all: true } }),
      this.prisma.sanItem.groupBy({ by: ['grupo'], where: { projeto_id: projetoId }, _count: { _all: true } }),
    ]);
    const grupos = new Map<string, { grupo: string; itens: number; camadas: Record<string, Record<string, number>> }>();
    const obter = (g: string) => {
      if (!grupos.has(g)) grupos.set(g, { grupo: g || '(sem grupo)', itens: 0, camadas: Object.fromEntries(CAMADAS.map((c) => [c, { PENDENTE: 0, SEM_PROBLEMA: 0, PROPOSTO: 0, APROVADO: 0, AGUARDANDO_INFORMACAO: 0, revisar: 0 }])) });
      return grupos.get(g)!;
    };
    for (const i of itens) obter(i.grupo ?? '').itens = i._count._all;
    for (const c of cel) {
      const g = obter(c.grupo ?? '');
      g.camadas[c.camada][c.situacao] += c._count._all;
      if (c.revisar) g.camadas[c.camada].revisar += c._count._all;
    }
    return { camadas, grupos: [...grupos.values()].sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR')) };
  }
}
