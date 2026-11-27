import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Camada } from '../tipos';
import {
  CELULA_DO_CASO, EXCECAO_VIVA, ORIGEM_DA_CAMADA_NOVA, TIPOS_DA_CAMADA_NOVA, TX_LONGA, chaveCaso, ehExcecao, fatiar, type Json, type SituacaoCaso,
} from './constantes';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
type Db = Pick<PrismaService, 'sanProjeto' | 'sanItem' | 'sanCelula' | 'sanCaso' | '$transaction'>;
type CasoMig = { id: string; tipo: string; itens: string[]; situacao: string; createdAt: Date };
type EstadoCelula = { situacao: string; caso_id: string | null; revisar: boolean; revisar_causa: string | null };

const NOVAS = Object.keys(ORIGEM_DA_CAMADA_NOVA) as (keyof typeof ORIGEM_DA_CAMADA_NOVA)[];
const CASO_VIVO = ['PROPOSTO', 'RASCUNHO', 'APROVADO', 'AGUARDANDO_INFORMACAO'];

export type ResultadoMigracaoFases = { projetos: number; migrados: number; casosMovidos: number; celulasCriadas: number; execucoesCopiadas: number };

/**
 * O caso que manda na célula do item entre vários: exceção viva primeiro (vale mais que a regra), depois o mais recente. Função pura.
 */
export function casoDaCelula(casos: CasoMig[]): Map<string, CasoMig> {
  const peso = (c: CasoMig) => (ehExcecao(c.tipo) && EXCECAO_VIVA.includes(c.situacao) ? 1 : 0);
  const out = new Map<string, CasoMig>();
  for (const c of casos) {
    for (const i of c.itens) {
      const a = out.get(i);
      if (!a || peso(c) > peso(a) || (peso(c) === peso(a) && +new Date(c.createdAt) > +new Date(a.createdAt))) out.set(i, c);
    }
  }
  return out;
}

/** Agrupa as células pelo estado a gravar: uma atualização por estado (com 30 mil itens são poucos estados distintos). */
function porEstado(pares: { item: string; estado: EstadoCelula }[]) {
  const m = new Map<string, { estado: EstadoCelula; itens: string[] }>();
  for (const { item, estado } of pares) {
    const k = JSON.stringify(estado);
    const g = m.get(k);
    if (g) g.itens.push(item); else m.set(k, { estado, itens: [item] });
  }
  return [...m.values()];
}

/**
 * Migração da divisão em fases (docs/saneamento-fases.md, "Migração"), no boot e idempotente (como a carga da biblioteca de diretrizes):
 * - casos FINALIDADE_GRUPO/FINALIDADE_EXCECAO de GRUPOS_FINALIDADE → camada FINALIDADE; NCM_INFO_INSUFICIENTE/NCM_INCOMPATIVEL_DESCRICAO/
 *   NCM_DIVERGENTE_ENTRE_ITENS_IGUAIS de NCM → NCM_CLASSIFICACAO, com a `chave` recalculada (o id do caso não muda: decisões e linhas de
 *   impacto no SPED, que apontam para o id, continuam válidas);
 * - as células da camada antiga que apontavam para esses casos passam o estado para a célula da camada nova; a célula antiga volta ao caso
 *   vivo que sobrou na camada (ou "sem problema", se a camada foi analisada, ou "pendente");
 * - cria as células que faltarem das camadas novas para todos os itens;
 * - na primeira vez (projeto ainda sem célula das camadas novas): copia `parametros.execucoes` da camada antiga para a nova e o "sem problema"
 *   ou "aguardando informação" sem caso da célula antiga para a nova (a análise antiga já cobria as duas partes).
 * Rodar de novo não muda nada; banco vazio não faz nada. Fotos de versões liberadas não são tocadas (os leitores aceitam as duas camadas).
 */
@Injectable()
export class SanMigracaoFasesService implements OnApplicationBootstrap {
  private readonly log = new Logger(SanMigracaoFasesService.name);
  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
    void this.migrar().then(
      (r) => { if (r.migrados) this.log.log(`Saneamento em fases: ${r.migrados} projeto(s) migrado(s), ${r.casosMovidos} caso(s) movido(s), ${r.celulasCriadas} célula(s) criada(s), ${r.execucoesCopiadas} data(s) de análise copiada(s).`); },
      (e) => this.log.warn(`Saneamento em fases: migração não aplicada (${(e as Error).message}).`),
    );
  }

  async migrar(): Promise<ResultadoMigracaoFases> {
    const db = this.prisma as unknown as Db;
    const projetos = await db.sanProjeto.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
    const total: ResultadoMigracaoFases = { projetos: projetos.length, migrados: 0, casosMovidos: 0, celulasCriadas: 0, execucoesCopiadas: 0 };
    for (const p of projetos) {
      const r = await db.$transaction((tx) => this.migrarProjeto(tx, p.id), TX_LONGA);
      if (r.casosMovidos || r.celulasCriadas || r.execucoesCopiadas) total.migrados++;
      total.casosMovidos += r.casosMovidos; total.celulasCriadas += r.celulasCriadas; total.execucoesCopiadas += r.execucoesCopiadas;
    }
    return total;
  }

  private async migrarProjeto(tx: Tx, projetoId: string) {
    const r = { casosMovidos: 0, celulasCriadas: 0, execucoesCopiadas: 0 };
    const proj = await tx.sanProjeto.findUnique({ where: { id: projetoId }, select: { parametros: true } });
    if (!proj) return r;
    const parametros = (proj.parametros ?? {}) as Json;
    const execucoes = { ...((parametros.execucoes as Record<string, string> | undefined) ?? {}) };
    // Primeira vez = o projeto ainda não tem nenhuma célula das camadas novas (projeto aberto depois da divisão já nasce com elas).
    const primeiraVez = (await tx.sanCelula.count({ where: { projeto_id: projetoId, camada: { in: NOVAS } } })) === 0;
    const nItens = await tx.sanItem.count({ where: { projeto_id: projetoId } });

    // 1. Células que faltam das camadas novas (pendentes).
    for (const nova of NOVAS) {
      if ((await tx.sanCelula.count({ where: { projeto_id: projetoId, camada: nova } })) >= nItens) continue;
      let cursor: string | undefined;
      for (;;) {
        const lote = await tx.sanItem.findMany({ where: { projeto_id: projetoId }, orderBy: { id: 'asc' }, take: 5000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, grupo: true } });
        if (lote.length) r.celulasCriadas += (await tx.sanCelula.createMany({ data: lote.map((i) => ({ projeto_id: projetoId, item_id: i.id, camada: nova, grupo: i.grupo ?? '' })), skipDuplicates: true })).count;
        if (lote.length < 5000) break;
        cursor = lote[lote.length - 1].id;
      }
    }

    for (const nova of NOVAS) {
      const antiga = ORIGEM_DA_CAMADA_NOVA[nova];
      // 2. Primeira vez: o que a análise antiga já dizia sem caso ("sem problema", "aguardando informação") vale para a parte nova.
      if (primeiraVez && execucoes[antiga]) {
        const semCaso = await tx.sanCelula.findMany({ where: { projeto_id: projetoId, camada: antiga, caso_id: null, situacao: { in: ['SEM_PROBLEMA', 'AGUARDANDO_INFORMACAO'] } }, select: { item_id: true, situacao: true, revisar_causa: true } });
        await this.gravar(tx, projetoId, nova, semCaso.map((c) => ({ item: c.item_id, estado: { situacao: c.situacao, caso_id: null, revisar: false, revisar_causa: c.situacao === 'AGUARDANDO_INFORMACAO' ? c.revisar_causa : null } })), true);
      }
      if (primeiraVez && execucoes[antiga] && !execucoes[nova]) { execucoes[nova] = execucoes[antiga]; r.execucoesCopiadas++; }

      // 3. Casos que mudam de camada (chave recalculada; o id fica).
      const movidos: CasoMig[] = await tx.sanCaso.findMany({
        where: { projeto_id: projetoId, camada: antiga, tipo: { in: [...TIPOS_DA_CAMADA_NOVA[nova]] } }, select: { id: true, tipo: true, itens: true, situacao: true, createdAt: true },
      });
      if (!movidos.length) continue;
      for (const c of movidos) {
        let chave = chaveCaso(nova, c.tipo, c.itens);
        // Já existe caso igual na camada nova (a análise nova rodou antes da migração): a chave do antigo ganha o id para não colidir.
        if (await tx.sanCaso.findFirst({ where: { projeto_id: projetoId, chave, NOT: { id: c.id } }, select: { id: true } })) chave = `${chave}:${c.id}`;
        await tx.sanCaso.update({ where: { id: c.id }, data: { camada: nova, chave } });
      }
      r.casosMovidos += movidos.length;
      const ids = movidos.map((c) => c.id);

      // 4. Células da camada antiga que apontavam para os casos movidos: o estado vai para a célula nova.
      const apontadas: { item_id: string; situacao: string; revisar: boolean; revisar_causa: string | null; caso_id: string | null }[] = [];
      for (const lote of fatiar(ids, 1000)) {
        for (const c of await tx.sanCelula.findMany({ where: { projeto_id: projetoId, camada: antiga, caso_id: { in: lote } }, select: { item_id: true, situacao: true, revisar: true, revisar_causa: true, caso_id: true } })) apontadas.push(c);
      }
      await this.gravar(tx, projetoId, nova, apontadas.map((c) => ({ item: c.item_id, estado: { situacao: c.situacao, caso_id: c.caso_id, revisar: c.revisar, revisar_causa: c.revisar_causa } })), false);

      // 5. A célula antiga volta ao caso vivo que sobrou na camada (exceção primeiro, depois o mais recente), ou sem problema/pendente.
      const itensAntigos = apontadas.map((c) => c.item_id);
      const restantes: CasoMig[] = [];
      for (const lote of fatiar(itensAntigos, 2000)) {
        for (const c of await tx.sanCaso.findMany({ where: { projeto_id: projetoId, camada: antiga, situacao: { in: CASO_VIVO }, itens: { hasSome: lote } }, select: { id: true, tipo: true, itens: true, situacao: true, createdAt: true } })) restantes.push(c);
      }
      const dono = casoDaCelula(restantes);
      const vazio = execucoes[antiga] ? 'SEM_PROBLEMA' : 'PENDENTE';
      await this.gravar(tx, projetoId, antiga as Camada, itensAntigos.map((item) => {
        const c = dono.get(item);
        return { item, estado: c ? { situacao: CELULA_DO_CASO[c.situacao as SituacaoCaso] ?? 'PENDENTE', caso_id: c.id, revisar: false, revisar_causa: null } : { situacao: vazio, caso_id: null, revisar: false, revisar_causa: null } };
      }), false);

      // 6. Itens dos casos movidos cuja célula antiga apontava para outro caso: a célula nova (ainda pendente) passa a seguir o caso movido.
      const jaFeitos = new Set(itensAntigos);
      const vivos = casoDaCelula(movidos.filter((c) => c.situacao !== 'OBSOLETO'));
      await this.gravar(tx, projetoId, nova, [...vivos].filter(([item]) => !jaFeitos.has(item)).map(([item, c]) => ({
        item, estado: { situacao: CELULA_DO_CASO[c.situacao as SituacaoCaso] ?? 'PENDENTE', caso_id: c.id, revisar: false, revisar_causa: null },
      })), true);
    }

    if (r.execucoesCopiadas) {
      await tx.sanProjeto.update({ where: { id: projetoId }, data: { parametros: { ...parametros, execucoes } as never } });
    }
    return r;
  }

  /** Grava o estado nas células (item × camada). `soPendentes`: só toca célula ainda pendente e sem caso. */
  private async gravar(tx: Tx, projetoId: string, camada: string, pares: { item: string; estado: EstadoCelula }[], soPendentes: boolean) {
    for (const g of porEstado(pares)) {
      for (const lote of fatiar(g.itens, 5000)) {
        await tx.sanCelula.updateMany({
          where: { projeto_id: projetoId, camada, item_id: { in: lote }, ...(soPendentes ? { situacao: 'PENDENTE', caso_id: null } : {}) },
          data: { ...g.estado },
        });
      }
    }
  }
}
