import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CAMADAS, SITUACOES } from '../tipos';
import { camadasAtivas, validarCamada, type Json } from './constantes';
import { paramInteiro, paramTexto } from './validacao';
import { CAMPOS_BASE, ROTULO_CAMPO as ROTULO_CAMPO_IMPORTACAO } from '../importacao/tipos';

export type FiltroItens = {
  camada?: string; situacao?: string; revisar?: boolean; grupo?: string; busca?: string;
  ordem?: 'codigo' | 'grupo'; cursor?: string; limite?: number | string;
  /** Lista JSON dos nomes das colunas extras do ERP que a tela escolheu mostrar (as demais não vêm). */
  extras?: string;
};

/**
 * Campos fundamentais da importação que a Tabela mostra em par "como era" × "como ficou": todo o catálogo da importação (CAMPOS_BASE),
 * menos código e estabelecimento (a chave do item, que não muda e já fica fixa à esquerda). Campo novo no catálogo entra sozinho.
 */
export const CAMPOS_PAREADOS: readonly string[] = CAMPOS_BASE.filter((c) => c !== 'codigo' && c !== 'estabelecimento');
/** Até quantas colunas extras do ERP a lista devolve por pedido. */
const MAX_EXTRAS = 60;
const NOMES_PROIBIDOS = ['__proto__', 'constructor', 'prototype'];

/** Valor do campo no JSON do item: campo de topo ou, se não houver (ex.: subgrupo), o de `campos` (como a visão focada). */
function valorDe(parte: Json | null | undefined, campo: string): unknown {
  if (!parte || typeof parte !== 'object') return null;
  if (campo in parte) return parte[campo] ?? null;
  const campos = parte.campos as Json | undefined;
  return campos && typeof campos === 'object' ? campos[campo] ?? null : null;
}
const vazio = (v: unknown) => v === null || v === undefined || v === '';

/** Lê o parâmetro `extras` (lista JSON de nomes de colunas extras); ausente = nenhuma. */
export function lerExtras(bruto: unknown): string[] {
  const t = paramTexto(bruto, 'extras');
  if (!t) return [];
  let v: unknown;
  try { v = JSON.parse(t); } catch { throw new BadRequestException('Colunas extras inválidas (use uma lista de nomes).'); }
  if (!Array.isArray(v) || v.length > MAX_EXTRAS || v.some((x) => typeof x !== 'string' || !x || x.length > 200 || NOMES_PROIBIDOS.includes(x))) {
    throw new BadRequestException(`Colunas extras inválidas (até ${MAX_EXTRAS} nomes).`);
  }
  return [...new Set(v as string[])];
}

/**
 * Pares "como era" (original da primeira importação, o mesmo da visão focada) × "como ficou" (base de trabalho) do item, só com os campos
 * que têm valor em algum dos dois (resposta compacta para 30 mil linhas). Extras: só os nomes pedidos.
 */
export function paresDoItem(original: Json | null | undefined, trabalho: Json | null | undefined, extras: string[]) {
  const como: Record<string, [unknown, unknown]> = {};
  for (const c of CAMPOS_PAREADOS) {
    const a = valorDe(original, c); const b = valorDe(trabalho, c);
    if (!vazio(a) || !vazio(b)) como[c] = [a, b];
  }
  if (!extras.length) return { como };
  const campoDe = (parte: Json | null | undefined, nome: string) => { const cs = parte?.campos as Json | undefined; return cs && typeof cs === 'object' && Object.hasOwn(cs, nome) ? cs[nome] ?? null : null; };
  const ext: Record<string, [unknown, unknown]> = {};
  for (const nome of extras) {
    const a = campoDe(original, nome); const b = campoDe(trabalho, nome);
    if (!vazio(a) || !vazio(b)) ext[nome] = [a, b];
  }
  return { como, extras: ext };
}

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
    const extras = lerExtras(bruto.extras);
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
    const select = { id: true, codigo: true, estabelecimento: true, descricao: true, grupo: true, finalidade: true, conjunto_chave: true, ativo: true, versao: true, original: true, trabalho: true, celulas: { select: { camada: true, situacao: true, revisar: true, revisar_causa: true, caso_id: true } } };
    // Com SQL: código só de dígitos ordena como número (2 antes de 10); sem SQL (testes em memória), a ordem do texto.
    const ids = typeof (this.prisma as unknown as { $queryRaw?: unknown }).$queryRaw === 'function'
      ? await this.idsNaOrdemNumerica(projetoId, { ...f, camada: celula.camada as string | undefined, busca }, limite + 1)
      : null;
    const linhas = ids
      ? await this.prisma.sanItem.findMany({ where: { id: { in: ids } }, select }).then((ls) => { const m = new Map(ls.map((l) => [l.id, l])); return ids.map((id) => m.get(id)!).filter(Boolean); })
      : await this.prisma.sanItem.findMany({ where: where as never, orderBy: ordem as never, take: limite + 1, ...(f.cursor ? { cursor: { id: f.cursor }, skip: 0 } : {}), select });
    const total = f.cursor ? undefined : await this.prisma.sanItem.count({ where: where as never });
    const pagina = linhas.slice(0, limite);
    const enq = await this.enquadramentos(projetoId, pagina.map((x) => x.id));
    const sug = await this.finalidadesSugeridas(projetoId, pagina.filter((x) => !x.finalidade).map((x) => x.id));
    const proximo = linhas.length > limite ? linhas[limite].id : null;
    // original e trabalho inteiros não saem daqui: só os pares dos campos com valor e os extras pedidos.
    const itens = pagina.map(({ original, trabalho, ...x }) => ({
      ...x, ...paresDoItem(original as Json, trabalho as Json, extras), enquadramento: enq.get(x.id) ?? null, finalidadeSugerida: sug.get(x.id) ?? null,
    }));
    return { itens, proximo, ...(total === undefined ? {} : { total }) };
  }

  /**
   * Colunas da Tabela: os campos fundamentais que o projeto importou (mapeados em alguma importação ou com valor em algum item, original ou
   * atual), na ordem do catálogo da importação, e os nomes das colunas extras do ERP (`campos`, fora os fundamentais) para escolher.
   * Duas consultas agregadas no banco (sem trazer os itens).
   */
  async colunas(projetoId: string) {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { id: true } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    const presentes = new Set<string>();
    const imps = await this.prisma.sanImportacao.findMany({ where: { projeto_id: projetoId }, select: { mapeamento: true } });
    for (const i of imps) for (const [k, v] of Object.entries((i.mapeamento ?? {}) as Json)) if (!vazio(v) && CAMPOS_PAREADOS.includes(k)) presentes.add(k);
    const extras = new Set<string>();
    if (typeof (this.prisma as unknown as { $queryRaw?: unknown }).$queryRaw === 'function') {
      // Os nomes dos campos vêm do catálogo fixo (CAMPOS_BASE), nunca do pedido: podem entrar no SQL como texto.
      const tem = (parte: string, c: string) => {
        const v = `COALESCE(i."${parte}"->'${c}', i."${parte}"->'campos'->'${c}')`;
        return `(${v} IS NOT NULL AND ${v} NOT IN ('null'::jsonb, '""'::jsonb))`;
      };
      const colunas = CAMPOS_PAREADOS.map((c) => `bool_or(${tem('original', c)} OR ${tem('trabalho', c)}) AS "${c}"`).join(', ');
      const [r] = await this.prisma.$queryRaw<Record<string, boolean | null>[]>`SELECT ${Prisma.raw(colunas)} FROM "SanItem" i WHERE i."projeto_id" = ${projetoId}`;
      for (const c of CAMPOS_PAREADOS) if (r?.[c]) presentes.add(c);
      const objeto = (parte: string) => Prisma.raw(`(CASE WHEN jsonb_typeof(i."${parte}"->'campos') = 'object' THEN i."${parte}"->'campos' ELSE '{}'::jsonb END)`);
      const ks = await this.prisma.$queryRaw<{ k: string }[]>`SELECT DISTINCT t.k FROM "SanItem" i CROSS JOIN LATERAL (SELECT jsonb_object_keys(${objeto('original')}) UNION SELECT jsonb_object_keys(${objeto('trabalho')})) AS t(k) WHERE i."projeto_id" = ${projetoId} ORDER BY t.k LIMIT 1000`;
      for (const { k } of ks) extras.add(k);
    } else {
      // Sem SQL (testes em memória): percorre os itens.
      const itens = await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId }, select: { original: true, trabalho: true } });
      for (const it of itens) for (const parte of [it.original, it.trabalho] as (Json | null)[]) {
        for (const c of CAMPOS_PAREADOS) if (!vazio(valorDe(parte, c))) presentes.add(c);
        for (const k of Object.keys((parte?.campos as Json | undefined) ?? {})) extras.add(k);
      }
    }
    const rotulos = ROTULO_CAMPO_IMPORTACAO as Record<string, string>;
    return {
      fundamentais: CAMPOS_PAREADOS.filter((c) => presentes.has(c)).map((campo) => ({ campo, rotulo: rotulos[campo] ?? campo })),
      extras: [...extras].filter((k) => !CAMPOS_PAREADOS.includes(k) && !NOMES_PROIBIDOS.includes(k)).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    };
  }

  /**
   * Ids da página na ordem de trabalho, com os mesmos filtros da lista. A chave de ordem do código é o código com zeros à esquerda quando ele
   * só tem dígitos (ordem numérica: 2, 10, 100) e o próprio texto nos demais. O cursor (id) entra na página seguinte, como no caminho Prisma.
   */
  private async idsNaOrdemNumerica(projetoId: string, f: { camada?: string; situacao?: string; revisar: boolean; grupo?: string; busca: string; ordem?: string; cursor?: string }, take: number): Promise<string[]> {
    const chave = Prisma.sql`(CASE WHEN i."codigo" ~ '^[0-9]{1,40}$' THEN lpad(i."codigo", 40, '0') ELSE i."codigo" END)`;
    const conds: Prisma.Sql[] = [Prisma.sql`i."projeto_id" = ${projetoId}`];
    const cel: Prisma.Sql[] = [];
    if (f.camada) cel.push(Prisma.sql`c."camada" = ${f.camada}`);
    if (f.situacao) cel.push(Prisma.sql`c."situacao" = ${f.situacao}`);
    if (f.revisar) cel.push(Prisma.sql`c."revisar" = true`);
    if (cel.length) conds.push(Prisma.sql`EXISTS (SELECT 1 FROM "SanCelula" c WHERE c."item_id" = i."id" AND ${Prisma.join(cel, ' AND ')})`);
    if (f.grupo !== undefined && f.grupo !== '') conds.push(f.grupo === '(sem grupo)' ? Prisma.sql`i."grupo" IS NULL` : Prisma.sql`i."grupo" = ${f.grupo}`);
    if (f.busca) {
      const termo = `%${f.busca.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
      conds.push(Prisma.sql`(i."codigo" ILIKE ${termo} OR i."descricao" ILIKE ${termo})`);
    }
    const porGrupo = f.ordem === 'grupo';
    // Grupo vazio por último (como o Prisma em ordem crescente): primeiro os que têm grupo, depois o grupo, a chave do código, o código e o id.
    const campos = (x: string) => (porGrupo ? Prisma.sql`(${Prisma.raw(x)}."grupo" IS NULL), COALESCE(${Prisma.raw(x)}."grupo", ''), ` : Prisma.empty);
    if (f.cursor) {
      const ref = Prisma.sql`(SELECT ${campos('r')}(CASE WHEN r."codigo" ~ '^[0-9]{1,40}$' THEN lpad(r."codigo", 40, '0') ELSE r."codigo" END), r."codigo", r."id" FROM "SanItem" r WHERE r."id" = ${f.cursor})`;
      conds.push(Prisma.sql`ROW(${campos('i')}${chave}, i."codigo", i."id") >= ${ref}`);
    }
    const ordem = Prisma.sql`${campos('i')}${chave}, i."codigo", i."id"`;
    const linhas: { id: string }[] = await this.prisma.$queryRaw`SELECT i."id" FROM "SanItem" i WHERE ${Prisma.join(conds, ' AND ')} ORDER BY ${ordem} LIMIT ${take}`;
    return linhas.map((l) => l.id);
  }

  /**
   * Enquadramento de cada item da página: o do caso TRIBUTARIO aprovado ou aberto mais relevante (exceção antes de conjunto; depois o mais recente).
   * Uma consulta por página (até 500 itens), com índice GIN em SanCaso.itens; só campos leves.
   */
  /**
   * Finalidade que a camada Finalidade propõe e ainda não foi aprovada (caso em aberto), para a tabela mostrar como "sugerida".
   * A exceção do item vale mais que o caso do grupo. Item que já tem finalidade não entra.
   */
  private async finalidadesSugeridas(projetoId: string, ids: string[]) {
    const saida = new Map<string, string>();
    if (!ids.length) return saida;
    const casos = await this.prisma.sanCaso.findMany({
      where: { projeto_id: projetoId, camada: 'FINALIDADE', tipo: { in: ['FINALIDADE_GRUPO', 'FINALIDADE_EXCECAO'] }, situacao: { in: ['PROPOSTO', 'RASCUNHO'] }, itens: { hasSome: ids } },
      select: { tipo: true, itens: true, proposta: true },
    });
    const quer = new Set(ids);
    for (const tipo of ['FINALIDADE_GRUPO', 'FINALIDADE_EXCECAO']) {
      for (const c of casos) {
        if (c.tipo !== tipo) continue;
        const f = (c.proposta as Json | null)?.finalidade;
        if (typeof f === 'string') for (const id of c.itens) if (quer.has(id)) saida.set(id, f);
      }
    }
    return saida;
  }

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
      // Camada que esta versão não conhece (dado antigo ou de outra versão do servidor): não entra na contagem (antes derrubava a tela).
      if (!(CAMADAS as readonly string[]).includes(c.camada)) continue;
      const g = obter(c.grupo ?? '');
      if (!(c.situacao in g.camadas[c.camada])) continue;
      g.camadas[c.camada][c.situacao] += c._count._all;
      if (c.revisar) g.camadas[c.camada].revisar += c._count._all;
    }
    return { camadas, grupos: [...grupos.values()].sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR')) };
  }
}
