/**
 * Leitura das Diretrizes no banco (tabelas SanDiretrizes, SanDiretrizRegra, SanDiretrizHistorico, SanDiretrizBiblioteca e
 * SanDiretrizBibliotecaVersao), compartilhada pelo serviço, pela orquestração (motor) e pela foto da versão. Recebe o cliente do Prisma
 * (ou o da transação); sem Nest.
 */
import { Prisma } from '@prisma/client';
import type { ParametrosMotor } from '../motor/contexto';
import { abrangenciaVazia, abreviacoesNoSentidoCerto, canonico, conteudoEfetivo } from './conteudo-regra';
import { PROCEDIMENTOS } from './conteudo/biblioteca';
import { LIMITES_OFICIAIS } from './conteudo/limites-oficiais';
import { carregarPerfil } from '../../erps/erps.service';
import { ID_BIBLIOTECA_LIMITES, alertasDeLimites, linhasDoErp } from './parametros';
import { chaveGrupo, chaveSubgrupo, criarIndice, subgrupoDosCampos, type IndiceDiretrizes, type RegraResolvivel } from './resolucao';
import type { Abrangencia, Aspecto, ConteudoRegra, LinhaLimite, RegraLimites, RegraProjeto, SituacaoRegra } from './tipos';

type Json = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;

/** O que fica gravado como "aplicado": a análise usa SÓ isto (rascunho editado não muda nada até ser aplicado). */
export type Aplicacao = { abrangencia: Abrangencia; conteudo: ConteudoRegra; legado: boolean; parametrosLegados: ParametrosMotor | null };

export type LinhaRegra = {
  id: string; projeto_id: string; aspecto: string; codigo: string; nome: string; abrangencia: unknown; observacao: string | null;
  biblioteca_id: string | null; biblioteca_versao: number | null; alteracoes: unknown; situacao: string; revisar: boolean; revisar_causa: string | null;
  aprovada_por: string | null; aprovada_em: Date | null; aplicacao: unknown; aplicada_em: Date | null; aplicada_por: string | null;
  legado: boolean; parametros_legados: unknown; criada_por: string | null; versao: number; createdAt: Date; updatedAt: Date;
};

/** Regra como a API devolve: o contrato (RegraProjeto) + conteúdo efetivo e o estado da aplicação. */
export type RegraApi = RegraProjeto & {
  conteudoEfetivo: ConteudoRegra;
  /** Já aplicada alguma vez (a análise usa a versão aplicada). */
  aplicada: boolean;
  /** O rascunho difere do que foi aplicado: "Aplicar e reanalisar" pendente. */
  pendenteAplicar: boolean;
  /** Convertida dos parâmetros antigos e não editada. */
  legado: boolean;
  /** Cobre algum grupo (perdeu todos numa transferência = inativa). */
  ativa: boolean;
  revisarCausa: string | null;
  alertas: string[];
  bibliotecaVersaoAtual: number | null;
  aplicadaEm: string | null;
  aplicadaPor: string | null;
};

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/** Conteúdos da biblioteca citados pelas regras e, quando alguma regra parte dos limites oficiais, as linhas do ERP do projeto. */
export type ConteudosBiblioteca = { porVersao: Map<string, ConteudoRegra>; atual: Map<string, { versao: number; conteudo: ConteudoRegra }>; linhasErp: LinhaLimite[] };

/** Linhas de limite do ERP do projeto (Cadastro de ERPs, LIMITE_CAMPO), lidas na hora: trocar o ERP do projeto muda o rascunho. */
export async function linhasErpDoProjeto(db: Db, projetoId: string): Promise<LinhaLimite[]> {
  if (!db.sanProjeto?.findUnique) return [];
  const p = await db.sanProjeto.findUnique({ where: { id: projetoId }, select: { erp_id: true } });
  return linhasDoErp(await carregarPerfil(db, p?.erp_id ?? null));
}

/**
 * Conteúdo de cada versão de biblioteca citada (id@versão) e a versão atual de cada regra-modelo. Com `projetoId` e alguma referência à
 * regra-modelo dos limites oficiais, traz também as linhas do ERP do projeto (derivadas na resolução, nunca copiadas na regra).
 */
export async function conteudosDaBiblioteca(db: Db, refs: { id: string; versao: number | null }[], projetoId?: string): Promise<ConteudosBiblioteca> {
  const ids = [...new Set(refs.map((r) => r.id))];
  const porVersao = new Map<string, ConteudoRegra>();
  const atual = new Map<string, { versao: number; conteudo: ConteudoRegra }>();
  const linhasErp = projetoId && ids.includes(ID_BIBLIOTECA_LIMITES) ? await linhasErpDoProjeto(db, projetoId) : [];
  if (!ids.length || !db.sanDiretrizBiblioteca) return { porVersao, atual, linhasErp };
  for (const b of await db.sanDiretrizBiblioteca.findMany({ where: { id: { in: ids } }, select: { id: true, versao: true, conteudo: true } })) atual.set(b.id, { versao: b.versao, conteudo: b.conteudo as ConteudoRegra });
  const versoes = [...new Set(refs.filter((r) => r.versao != null).map((r) => r.versao as number))];
  if (versoes.length) {
    for (const v of await db.sanDiretrizBibliotecaVersao.findMany({ where: { regra_id: { in: ids }, versao: { in: versoes } }, select: { regra_id: true, versao: true, conteudo: true } })) porVersao.set(`${v.regra_id}@${v.versao}`, v.conteudo as ConteudoRegra);
  }
  return { porVersao, atual, linhasErp };
}

/** Base da regra (biblioteca na versão adotada), ou null (padrão do aspecto). */
export function baseDaRegra(r: Pick<LinhaRegra, 'biblioteca_id' | 'biblioteca_versao'>, bib: ConteudosBiblioteca): ConteudoRegra | null {
  if (!r.biblioteca_id) return null;
  return bib.porVersao.get(`${r.biblioteca_id}@${r.biblioteca_versao}`) ?? (bib.atual.get(r.biblioteca_id)?.versao === r.biblioteca_versao ? bib.atual.get(r.biblioteca_id)!.conteudo : null);
}

/** Conteúdo efetivo do rascunho. Regra convertida e não editada (legado): abreviações no sentido certo (conversão antiga gravava o par invertido). */
export function efetivoDaLinha(r: LinhaRegra, bib: ConteudosBiblioteca): ConteudoRegra {
  const c = comLinhasDoErp(r, conteudoEfetivo(r.aspecto as Aspecto, baseDaRegra(r, bib), r.alteracoes as Partial<ConteudoRegra> | null), bib);
  return r.legado ? abreviacoesNoSentidoCerto(c) : c;
}
/**
 * Regra que parte dos limites oficiais (biblioteca) sem lista própria de linhas: as linhas do ERP do projeto entram depois das oficiais, lidas
 * do Cadastro de ERPs na hora (troca de ERP ou de versão da biblioteca muda o rascunho; a análise só muda quando o consultor aplica). Regra
 * com linhas próprias (inclusive a cópia que as primeiras versões gravavam) fica como está.
 */
export function comLinhasDoErp(r: Pick<LinhaRegra, 'aspecto' | 'biblioteca_id' | 'alteracoes'>, c: ConteudoRegra, bib: Pick<ConteudosBiblioteca, 'linhasErp'>): ConteudoRegra {
  if (c.aspecto !== 'LIMITES' || r.biblioteca_id !== ID_BIBLIOTECA_LIMITES || !bib.linhasErp?.length) return c;
  if ((r.alteracoes as Json | null)?.linhas !== undefined) return c;
  return { ...c, linhas: [...c.linhas, ...bib.linhasErp] };
}
/** A aplicação gravada, com a mesma correção de leitura do rascunho (legado). */
export const aplicacaoLida = (a: Aplicacao): Aplicacao => (a.legado ? { ...a, conteudo: abreviacoesNoSentidoCerto(a.conteudo) } : a);

/** A aplicação que corresponde ao rascunho de agora (para comparar com a gravada e para gravar ao aplicar). */
export const aplicacaoDoRascunho = (r: LinhaRegra, conteudo: ConteudoRegra): Aplicacao => ({
  abrangencia: r.abrangencia as Abrangencia, conteudo, legado: r.legado, parametrosLegados: r.legado ? ((r.parametros_legados as ParametrosMotor | null) ?? null) : null,
});
export const pendenteAplicar = (r: LinhaRegra, conteudo: ConteudoRegra) => !r.aplicacao || canonico(aplicacaoLida(r.aplicacao as Aplicacao)) !== canonico(aplicacaoDoRascunho(r, conteudo));

export function regraApi(r: LinhaRegra, bib: ConteudosBiblioteca): RegraApi {
  const conteudo = efetivoDaLinha(r, bib);
  const abrangencia = r.abrangencia as Abrangencia;
  return {
    id: r.id, projetoId: r.projeto_id, aspecto: r.aspecto as Aspecto, codigo: r.codigo, nome: r.nome, abrangencia, observacao: r.observacao,
    bibliotecaId: r.biblioteca_id, bibliotecaVersao: r.biblioteca_versao, alteracoes: (r.alteracoes as Partial<ConteudoRegra> | null) ?? null,
    situacao: r.situacao as SituacaoRegra, revisar: r.revisar, aprovadaPor: r.aprovada_por, aprovadaEm: iso(r.aprovada_em), versao: r.versao,
    conteudoEfetivo: conteudo, aplicada: !!r.aplicacao, pendenteAplicar: pendenteAplicar(r, conteudo), legado: r.legado, ativa: !abrangenciaVazia(abrangencia),
    revisarCausa: r.revisar_causa, alertas: conteudo.aspecto === 'LIMITES' ? alertasDeLimites((conteudo as RegraLimites).linhas, LIMITES_OFICIAIS) : [],
    bibliotecaVersaoAtual: r.biblioteca_id ? bib.atual.get(r.biblioteca_id)?.versao ?? null : null, aplicadaEm: iso(r.aplicada_em), aplicadaPor: r.aplicada_por,
  };
}

export async function lerRegras(db: Db, projetoId: string): Promise<LinhaRegra[]> {
  if (!db.sanDiretrizRegra) return [];
  return db.sanDiretrizRegra.findMany({ where: { projeto_id: projetoId }, orderBy: [{ codigo: 'asc' }] });
}

/** Regras do projeto na forma da API (conteúdo efetivo resolvido). */
export async function regrasDoProjeto(db: Db, projetoId: string): Promise<{ linhas: LinhaRegra[]; regras: RegraApi[]; bib: ConteudosBiblioteca }> {
  const linhas = await lerRegras(db, projetoId);
  const bib = await conteudosDaBiblioteca(db, linhas.filter((r) => r.biblioteca_id).map((r) => ({ id: r.biblioteca_id as string, versao: r.biblioteca_versao })), projetoId);
  return { linhas, regras: linhas.map((r) => regraApi(r, bib)), bib };
}

/** Situação das Diretrizes: Aprovada só quando há regra ativa e todas as ativas estão aprovadas; "revisar" se alguma tem a marca. */
export function situacaoDasDiretrizes(regras: Pick<RegraApi, 'situacao' | 'revisar' | 'ativa'>[]): { situacao: SituacaoRegra; revisar: boolean } {
  const ativas = regras.filter((r) => r.ativa);
  return { situacao: ativas.length && ativas.every((r) => r.situacao === 'APROVADA') ? 'APROVADA' : 'RASCUNHO', revisar: ativas.some((r) => r.revisar) };
}

/** Regras que a análise usa: as aplicadas, com o que foi aplicado (nunca o rascunho). */
export function resolviveisAplicadas(linhas: LinhaRegra[]): RegraResolvivel[] {
  const out: RegraResolvivel[] = [];
  for (const r of linhas) {
    const a = r.aplicacao ? aplicacaoLida(r.aplicacao as Aplicacao) : null;
    if (!a || abrangenciaVazia(a.abrangencia)) continue;
    out.push({ id: r.id, codigo: r.codigo, nome: r.nome, aspecto: r.aspecto as Aspecto, abrangencia: a.abrangencia, conteudo: a.conteudo, aprovada: r.situacao === 'APROVADA', legado: a.legado, parametrosLegados: a.parametrosLegados });
  }
  return out;
}

/** Índice das regras aplicadas do projeto, ou null quando não há nenhuma (a análise segue exatamente como antes). */
export async function indiceAplicado(db: Db, projetoId: string): Promise<IndiceDiretrizes | null> {
  const regras = resolviveisAplicadas(await lerRegras(db, projetoId));
  return regras.length ? criarIndice(regras) : null;
}

export type ItemDoGrupo = { id: string; grupo: string; subgrupo: string };

/**
 * Id, grupo e subgrupo de todos os itens do projeto. No Postgres, uma consulta que extrai só o subgrupo do `trabalho`; sem SQL bruto
 * (Prisma em memória dos testes), em lotes de 5 mil.
 */
export async function itensComGrupo(db: Db, projetoId: string): Promise<ItemDoGrupo[]> {
  if (typeof db.$queryRaw === 'function') {
    // Base antiga guardava o subgrupo como coluna extra (campos["Subgrupo"]): sem `campos.subgrupo`, vêm só as chaves com "sub" no nome e
    // subgrupoDosCampos escolhe (a mesma regra do caminho sem SQL).
    const linhas: { id: string; grupo: string | null; subgrupo: string | null; outros: Json | null }[] = await db.$queryRaw(
      Prisma.sql`SELECT "id", "grupo", "trabalho"->'campos'->>'subgrupo' AS "subgrupo",
        CASE WHEN COALESCE(btrim("trabalho"->'campos'->>'subgrupo'), '') = '' AND jsonb_typeof("trabalho"->'campos') = 'object'
          THEN (SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each_text("trabalho"->'campos') e WHERE e.key ILIKE '%sub%') END AS "outros"
        FROM "SanItem" WHERE "projeto_id" = ${projetoId} ORDER BY "id"`,
    );
    return linhas.map((l) => ({ id: l.id, grupo: chaveGrupo(l.grupo), subgrupo: chaveSubgrupo(subgrupoDosCampos({ ...(l.outros ?? {}), ...(l.subgrupo != null ? { subgrupo: l.subgrupo } : {}) })) }));
  }
  const out: ItemDoGrupo[] = [];
  let cursor: string | undefined;
  for (;;) {
    const lote: { id: string; grupo: string | null; trabalho: Json }[] = await db.sanItem.findMany({ where: { projeto_id: projetoId }, orderBy: { id: 'asc' }, take: 5000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, grupo: true, trabalho: true } });
    for (const i of lote) out.push({ id: i.id, grupo: chaveGrupo(i.grupo), subgrupo: chaveSubgrupo(subgrupoDosCampos(i.trabalho?.campos as Json | undefined)) });
    if (lote.length < 5000) break;
    cursor = lote[lote.length - 1].id;
  }
  return out;
}

/** Grupos da base: subgrupos e quantidade de itens, em ordem de nome. */
export function gruposDaBase(itens: ItemDoGrupo[]): { grupo: string; subgrupos: string[]; itens: number }[] {
  const m = new Map<string, { subgrupos: Set<string>; itens: number }>();
  for (const i of itens) {
    const g = m.get(i.grupo) ?? m.set(i.grupo, { subgrupos: new Set(), itens: 0 }).get(i.grupo)!;
    g.itens++;
    if (i.subgrupo) g.subgrupos.add(i.subgrupo);
  }
  return [...m].map(([grupo, g]) => ({ grupo, subgrupos: [...g.subgrupos].sort(), itens: g.itens })).sort((a, b) => (a.grupo < b.grupo ? -1 : a.grupo > b.grupo ? 1 : 0));
}

/**
 * Diretrizes como estão AGORA (cabeçalho e regras com conteúdo efetivo, situação e aprovador), para a foto da versão liberada e para a
 * política. null = o projeto nunca abriu as Diretrizes. Os procedimentos fixos da política entram na foto (`procedimentos`): o PDF da versão
 * liberada sai com a redação daquele dia. `legado` marca a regra convertida e não editada.
 */
export async function fotoDasDiretrizes(db: Db, projetoId: string): Promise<Json | null> {
  if (!db.sanDiretrizes) return null;
  const cab = await db.sanDiretrizes.findUnique({ where: { projeto_id: projetoId } });
  if (!cab) return null;
  const { regras } = await regrasDoProjeto(db, projetoId);
  const s = situacaoDasDiretrizes(regras);
  return {
    formato: 1,
    cabecalho: { vigencia: cab.vigencia ?? null, situacao: s.situacao, revisar: s.revisar, versao: cab.versao },
    regras: regras.map((r) => ({
      id: r.id, codigo: r.codigo, aspecto: r.aspecto, nome: r.nome, abrangencia: r.abrangencia, observacao: r.observacao, bibliotecaId: r.bibliotecaId, bibliotecaVersao: r.bibliotecaVersao,
      conteudoEfetivo: r.conteudoEfetivo, situacao: r.situacao, revisar: r.revisar, aprovadaPor: r.aprovadaPor, aprovadaEm: r.aprovadaEm, aplicada: r.aplicada, pendenteAplicar: r.pendenteAplicar,
      ativa: r.ativa, alertas: r.alertas, versao: r.versao, legado: r.legado,
    })),
    procedimentos: PROCEDIMENTOS,
  };
}
