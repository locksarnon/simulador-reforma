import { createHash } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogosFiscaisPrisma, classeVigente } from '../fiscal';
import { camadasAfetadas, lerFator } from '../motor';
import { CAMADAS, type Camada, type CasoProposto, type ResultadoCamada } from '../tipos';
import { mapaExcecoes, regravarImpactosDosCasos, semExcecoes } from './impactos-casos';
import { tiposDeAjusteDoCaso } from './ajustes';
import { rotuloDoCampo, rotuloTipoCaso } from '../rotulos';
import {
  CASO_ABERTO, CELULA_DO_CASO, acrescentar, EXCECAO_VIVA, TIPOS_EXCECAO, TX_LONGA, aplicarCampo, camadaTravada, camadasAtivas, chaveCaso, conflito, derivadosDoTrabalho, ehExcecao, exigirVersao, fatiar, igual,
  propostaAplicavel, quem, validarCamada, valorDoCampo, type Json, type SituacaoCaso, type Usuario,
} from './constantes';
import { VARIA_POR_ITEM } from '../motor';
import { canonico } from '../diretrizes/conteudo-regra';
import type { ParecerIa } from './portas';
import { similaridadeDoCaso } from '../criterios/similaridade';
import { SanProjetoService } from './projeto.service';
import { paramInteiro, paramTexto, validarProposta, validarResultado } from './validacao';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/** O que a análise diz de um caso (o que a reexecução renova num caso proposto e não editado). */
type ConteudoDoCaso = { problema: string; evidencia: unknown; atual: unknown; proposta: unknown; justificativa: string; fundamento: string | null; afeta: unknown; impactos: unknown };
const SELECAO_CONTEUDO = { problema: true, evidencia: true, atual: true, proposta: true, justificativa: true, fundamento: true, afeta: true, impactos: true } as const;
const conteudoDoCaso = (c: CasoProposto): ConteudoDoCaso => ({
  problema: c.problema, evidencia: c.evidencia ?? [], atual: c.atual ?? {}, proposta: c.proposta ?? {}, justificativa: c.justificativa,
  fundamento: c.fundamento ?? null, afeta: c.afeta ?? [], impactos: c.impactos ?? [],
});
type Ev = { rotulo?: string; valor?: unknown };
/** Códigos das regras citadas na evidência ("N01 — nome" → N01): renomear a regra não pede revisão. */
const regraDa = (ev: unknown): string => (Array.isArray(ev) ? (ev as Ev[]).filter((x) => x?.rotulo === 'Regra').map((x) => String(x.valor).split(/;\s*/).map((r) => r.split(' — ')[0].trim()).join('; ')).join('; ') : '');
/**
 * O que mudou, do que importa para a decisão, entre o caso gravado e o produzido agora (mesma chave, logo os mesmos itens). Só contam a
 * proposta, o problema, o fundamento e o CÓDIGO da regra citada (trocado por outro). Diferença só de texto da evidência — inclusive a linha
 * "Regra" que só aparece (regra convertida dos parâmetros antigos, mesmo resultado) ou o nome novo da regra — não renova, não sobe a versão
 * e não marca revisar.
 * - `conteudo`: renova o caso PROPOSTO (não editado).
 * - `analise`: pede revisão de quem editou ou decidiu; a proposta não conta (no caso decidido ou em rascunho, a gravada é a do consultor).
 */
export function mudancaDoCaso(e: Partial<ConteudoDoCaso>, c: CasoProposto): { conteudo: boolean; analise: boolean; regra: string | null } {
  if (e.problema === undefined) return { conteudo: false, analise: false, regra: null };
  const n = conteudoDoCaso(c);
  // O fundamento cita "Regra N01 — nome (Diretrizes do projeto)": renomear a regra não conta, só o código.
  const semNome = (v: unknown) => (typeof v === 'string' ? v.replace(/(Regra [A-Z]\d+) — .*? \(Diretrizes do projeto\)/g, '$1 (Diretrizes do projeto)') : v);
  const difere = (k: keyof ConteudoDoCaso) => canonico(semNome(e[k]) ?? null) !== canonico(semNome(n[k]) ?? null);
  const ra = regraDa(e.evidencia); const rn = regraDa(n.evidencia);
  const regraTrocada = !!ra && !!rn && ra !== rn;
  const base = difere('problema') || difere('fundamento') || regraTrocada;
  return { conteudo: base || difere('proposta'), analise: base, regra: regraTrocada ? rn : null };
}

/** Itens por bloco na aprovação: lidos de uma vez e gravados num UPDATE só (antes, um UPDATE por item: 3,7 mil idas ao banco num lote). */
export const BLOCO_APROVACAO = 1000;
type ItemGravado = { id: string; codigo: string; versao: number; trabalho: Json } & ReturnType<typeof derivadosDoTrabalho>;

/**
 * Grava o trabalho dos itens aprovados conferindo a versão de cada um: no Postgres, um UPDATE ... FROM jsonb_to_recordset por bloco; sem SQL
 * bruto (Prisma em memória dos testes), um por item. Menos linhas que o bloco = alguém alterou um item no meio: conflito (a transação desfaz).
 */
export async function gravarTrabalhoEmBloco(tx: Tx, linhas: ItemGravado[]): Promise<void> {
  if (!linhas.length) return;
  if (typeof (tx as unknown as { $executeRaw?: unknown }).$executeRaw === 'function') {
    const dados = linhas.map(({ codigo: _c, ...l }) => l); // eslint-disable-line @typescript-eslint/no-unused-vars
    const n = await tx.$executeRaw(Prisma.sql`UPDATE "SanItem" AS i SET "trabalho" = v.trabalho, "descricao" = v.descricao, "grupo" = v.grupo,
        "finalidade" = v.finalidade, "tambem_usado_como" = v.tambem_usado_como, "conjunto_chave" = v.conjunto_chave, "ativo" = v.ativo,
        "versao" = i."versao" + 1, "updatedAt" = now()
      FROM jsonb_to_recordset(${JSON.stringify(dados)}::jsonb) AS v(id text, versao int, trabalho jsonb, descricao text, grupo text,
        finalidade text, tambem_usado_como jsonb, conjunto_chave text, ativo boolean)
      WHERE i."id" = v.id AND i."versao" = v.versao`);
    if (n !== linhas.length) throw conflito('Algum item do caso foi alterado por outra pessoa durante a aprovação. Recarregue.');
    return;
  }
  for (const { id, codigo, versao, trabalho, ...d } of linhas) {
    const r = await tx.sanItem.updateMany({ where: { id, versao }, data: { trabalho: trabalho as never, ...d, versao: { increment: 1 } } });
    if (r.count === 0) throw conflito(`O item ${codigo} foi alterado por outra pessoa durante a aprovação. Recarregue.`);
  }
}
type CasoLinha = NonNullable<Awaited<ReturnType<PrismaService['sanCaso']['findUnique']>>>;

export type FiltroCasos = { camada?: string; situacao?: string; grupo?: string; tipo?: string; origem?: string; item_id?: string; cursor?: string; limite?: number | string };
/** Casos agrupados: os filtros da lista, mais a busca no texto e a chave de um grupo (detalhe do grupo). */
export type FiltroCasosAgrupados = FiltroCasos & { busca?: string; chave?: string };
type CasoParaGrupo = { id: string; camada: string; tipo: string; itens: string[]; problema: string; proposta: unknown; atual: unknown; situacao: string };
type GrupoDeCasos = {
  chave: string; camada: string; tipo: string; grupo: string | null; conjunto: boolean; problema: string; problemaVaria: boolean; proposta: Json; atual: Json;
  atualCanon: string; atualVaria: boolean; casos: number; itens: number; ids: string[]; situacoes: Record<string, number>;
};
/** Casos lidos por vez na leitura agrupada; ids de cada grupo na lista (o detalhe do grupo traz todos); linhas de casos no detalhe. */
const JANELA_AGRUPAR = 5000;
export const IDS_POR_GRUPO = 500;
/** Agrupamento de casos guardado para a paginação e o detalhe: validade e quantos ficam (os mais recentes). */
export const CACHE_AGRUPADOS_MS = 60_000;
const MAX_CACHE_AGRUPADOS = 6;
const CASOS_DO_GRUPO = 500;
/** Busca sem acento e sem caixa. */
const normalizarBusca = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
export type EntradaAprovar = {
  versao?: number; proposta?: Json; fundamento?: string; justificativa?: string; versoesItens?: Record<string, number>;
  /** Aprova mesmo que o valor atual do item já não seja o da época da proposta. */
  confirmarDivergencia?: boolean;
  /** Confirma o fator de conversão sugerido pela descrição (situação CONFIRMAR). */
  confirmarFator?: boolean;
};
/**
 * Lote: `ids` (até 2000) ou `filtro` (os casos em aberto da camada, tipo, origem, grupo e situação). Pelo filtro, cada chamada lê uma janela de
 * até 2000 casos a partir de `apos` (id): a resposta traz `proximo` enquanto houver mais, e a tela percorre o filtro inteiro em rodadas.
 */
export type EntradaLote = {
  ids?: string[]; filtro?: { camada?: string; tipo?: string; origem?: string; grupo?: string; situacao?: string }; apos?: string;
  versoes?: Record<string, number>; fundamento?: string; orcamentoMs?: unknown;
};
/** Pedir informação ou rejeitar em lote: o mesmo recorte, as versões da prévia e o texto comum (motivo ou justificativa). */
export type EntradaLoteDecisao = EntradaLote & { texto?: string };
/** Identificação do caso no lote: tipo, quantos itens e o primeiro item (código e descrição), para a tela nunca mostrar o id. */
type Identificacao = { tipo?: string; qtdItens?: number; codigo?: string; descricao?: string };
type Excecao = { casoId: string; motivo: string } & Identificacao;
/** Situação do caso por extenso, nas mensagens do lote. */
const SITUACAO_LEGIVEL: Record<string, string> = {
  PROPOSTO: 'proposto', RASCUNHO: 'em rascunho', APROVADO: 'aprovado', REJEITADO: 'rejeitado', AGUARDANDO_INFORMACAO: 'aguardando informação', OBSOLETO: 'substituído',
};
/** Itens que o detalhe do caso mostra (o bloco do item; nos conjuntos, a tabela resumida). */
const RESUMO_ITENS = 50;

/** Aprovar "solicitar informação" não decide nada: o caso vai para "Aguardando informação" pelo botão próprio, ou a decisão muda antes. */
const MSG_PEDE_INFORMACAO = 'A decisão proposta é solicitar informação ao cliente: aprovar não decide nada. Use "Pedir informação" (o caso fica Aguardando informação) ou escolha outra decisão na proposta antes de aprovar.';
const texto = (v: unknown, max: number) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const MAX_LOTE = 2000;
const ORCAMENTO_LOTE_MS = 60_000;
/** Orçamento de tempo do lote: o informado (ms) até o teto do servidor; o que não é número positivo é recusado. */
export function orcamentoDoLote(v: unknown): number {
  if (v === undefined || v === null || v === '') return ORCAMENTO_LOTE_MS;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 1) throw new BadRequestException('"orcamentoMs" deve ser um número de milissegundos maior ou igual a 1.');
  return Math.min(Math.max(1, Math.floor(n)), ORCAMENTO_LOTE_MS);
}
/** Tempo estimado do próximo caso do lote (ms): itens × custo por item medido (sem medida ainda, 0: o primeiro caso sempre roda). */
export const estimativaDoCaso = (itens: number, msPorItem: number) => Math.max(1, itens) * msPorItem;
const bad = (codigo: string, message: string, extra: Json = {}) => new BadRequestException({ statusCode: 400, codigo, message, ...extra });
/** Exceção de finalidade ao grupo: aprovar exige o motivo escrito pelo consultor (ao menos 5 caracteres). */
const MOTIVO_MINIMO = 5;
const ehCasoDeUnidade = (p: Json) => p.fatorSituacao !== undefined || p.unidadeCompra !== undefined;
/** Fator > 0, lido como o resto do módulo (`lerFator`: número como está; texto no formato brasileiro, "0,5" e "0.001" valem). */
const fatorValido = (p: Json) => lerFator(p.fatorConversao) != null;

/** Etiqueta de caso nas justificativas dos vínculos: vários casos podem usar o mesmo vínculo. */
const etiqueta = (id: string) => `[caso:${id}]`;

/** Filtro de camada da lista e do lote: uma camada, ou várias separadas por vírgula (as camadas de uma fase). */
export function filtroDeCamada(valor: string): string | { in: string[] } {
  const lista = [...new Set(valor.split(",").map((x) => x.trim()).filter(Boolean))].map((c) => validarCamada(c));
  return lista.length === 1 ? lista[0] : { in: lista };
}

/** Casos: criação a partir das camadas, decisão (rascunho, aprovar e APLICAR, rejeitar, pedir informação, reabrir) e lote com prévia. */
@Injectable()
export class SanCasosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projetos: SanProjetoService,
    @Optional() private readonly catalogos?: CatalogosFiscaisPrisma,
  ) {}

  // ── Criação a partir de uma camada ─────────────────────────────────────────

  /**
   * Grava o resultado de uma camada: casos novos (sem duplicar os já existentes), células e "aguardando informação" quando faltou dado.
   * `completo` = a camada foi reexecutada inteira: os casos abertos que ela não produziu mais viram OBSOLETO (sem escopo, também o "aguardando" do motor sem ação do consultor). `escopo` (Diretrizes: aplicar e
   * reanalisar) = só estes itens foram reanalisados: a obsolescência e o "aguardando informação" ficam restritos aos casos e células deles (o
   * resultado já vem recortado por `recortarResultado`, com o escopo fechado).
   */
  async registrarResultado(projetoId: string, bruto: ResultadoCamada, opcoes: { completo?: boolean; interno?: boolean; escopo?: Set<string> } = {}) {
    const noEscopo = (itens: string[]) => !opcoes.escopo || itens.some((i) => opcoes.escopo!.has(i));
    // O teto de casos protege só o POST (corpo HTTP); o caminho interno (executar camada) grava tudo, em blocos, numa transação.
    const r = validarResultado(bruto, { semTeto: opcoes.interno === true });
    const camada = validarCamada(r.camada);
    const p = await this.projetos.exigirLiberadaPara(projetoId, camada); // A TRAVA (por fase)
    if (!camadasAtivas(p.modulos as Json).includes(camada)) throw new BadRequestException('Esta camada não está ligada neste projeto (módulo opcional desligado).');
    const dataBase = await this.projetos.dataBase(projetoId);
    for (const c of r.casos ?? []) await this.validarExcecaoManual(c, dataBase);
    // A exceção vale mais que a regra (todas as camadas, inclusive caso de um item): o caso de regra não cita o item que tem exceção viva.
    // Exceção de regra ainda proposta que esta execução completa não produz mais vai virar obsoleta: não conta.
    const produzidas = new Set((r.casos ?? []).filter((c) => ehExcecao(c.tipo)).map((c) => chaveCaso(camada, c.tipo, c.itens)));
    const vivas = new Set<string>();
    for (const e of await this.prisma.sanCaso.findMany({ where: { projeto_id: projetoId, camada, tipo: { in: TIPOS_EXCECAO }, situacao: { in: EXCECAO_VIVA } }, select: { itens: true, tipo: true, situacao: true, chave: true } })) {
      if (opcoes.completo && e.situacao === 'PROPOSTO' && e.tipo !== 'EXCECAO_MANUAL' && !produzidas.has(e.chave) && noEscopo(e.itens)) continue;
      for (const i of e.itens) vivas.add(i);
    }
    const casos = (r.casos ?? [])
      .map((c) => (ehExcecao(c.tipo) || !vivas.size ? c : { ...c, itens: c.itens.filter((i) => !vivas.has(i)) }))
      .filter((c) => c.itens.length > 0);
    const ids = [...new Set([...casos.flatMap((c) => c.itens), ...(r.semProblema ?? [])])];
    let existem = 0;
    for (const lote of fatiar(ids, 5000)) existem += await this.prisma.sanItem.count({ where: { projeto_id: projetoId, id: { in: lote } } });
    if (existem !== ids.length) throw new BadRequestException('O resultado cita item que não existe neste projeto.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const chaves = casos.map((c) => chaveCaso(camada, c.tipo, c.itens));
        const ja = new Map<string, { id: string; situacao: string; versao: number } & Partial<ConteudoDoCaso>>();
        for (const lote of fatiar(chaves, 2000)) {
          for (const e of await tx.sanCaso.findMany({ where: { projeto_id: projetoId, camada, chave: { in: lote } }, select: { id: true, chave: true, situacao: true, versao: true, ...SELECAO_CONTEUDO } })) ja.set(e.chave, e as never);
        }
        const renovados: string[] = [];
        const aRevisar: { id: string; causa: string }[] = [];
        const situacaoInicial = (c: CasoProposto) => (c.tipo.startsWith('AGUARDANDO') ? 'AGUARDANDO_INFORMACAO' : c.tipo === 'ENQUADRAMENTO_CONFERIDO' ? 'APROVADO' : 'PROPOSTO');
        const tocados = new Set<string>();
        const atualizados: unknown[] = [];

        // Obsolescência: a camada foi reexecutada e não produz mais estes casos (só os ainda sem edição; exceção manual nunca é obsoleta).
        // Na reexecução inteira (sem escopo) entra também o "aguardando informação" que o MOTOR criou (tipo AGUARDANDO_*, origem REGRA) e em
        // que ninguém agiu: sem motivo (o pedido de informação do consultor grava o motivo), sem responsável e sem decisão registrada.
        // O aguardando por pedido do consultor nunca vira obsoleto.
        const obsoletos: string[] = [];
        if (opcoes.completo) {
          const produzidas = new Set(chaves);
          const situacoes = opcoes.escopo ? ['PROPOSTO'] : ['PROPOSTO', 'AGUARDANDO_INFORMACAO'];
          const abertos: { id: string; chave: string; tipo: string; situacao: string; origem: string; motivo: string | null; responsavel: string | null; itens?: string[] }[] = await tx.sanCaso.findMany({
            where: { projeto_id: projetoId, camada, situacao: { in: situacoes } },
            select: { id: true, chave: true, tipo: true, situacao: true, origem: true, motivo: true, responsavel: true, itens: !!opcoes.escopo },
          });
          const doMotorSemAcao = (a: (typeof abertos)[number]) => a.tipo.startsWith('AGUARDANDO') && a.origem === 'REGRA' && !a.motivo && !a.responsavel;
          const candidatos = abertos.filter((a) => !produzidas.has(a.chave) && a.tipo !== 'EXCECAO_MANUAL' && noEscopo(a.itens ?? []) && (a.situacao === 'PROPOSTO' || doMotorSemAcao(a)));
          const aguardando = candidatos.filter((a) => a.situacao === 'AGUARDANDO_INFORMACAO').map((a) => a.id);
          const comDecisao = new Set<string>();
          for (const lote of fatiar(aguardando, 1000)) {
            for (const d of await tx.sanDecisao.findMany({ where: { caso_id: { in: lote } }, select: { caso_id: true } })) if (d.caso_id) comDecisao.add(d.caso_id);
          }
          for (const a of candidatos) if (!comDecisao.has(a.id)) obsoletos.push(a.id);
          for (const lote of fatiar(obsoletos, 1000)) {
            await tx.sanCaso.updateMany({ where: { id: { in: lote }, situacao: { in: situacoes } }, data: { situacao: 'OBSOLETO', versao: { increment: 1 } } });
            await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, camada, caso_id: { in: lote } }, data: { situacao: 'PENDENTE', caso_id: null, revisar: false, revisar_causa: null } });
            await tx.sanImpactoSped.deleteMany({ where: { projeto_id: projetoId, caso_id: { in: lote } } });
          }
        }

        // Exceção manual repetida (mesmo item e tipo) atualiza o caso aberto; caso obsoleto que volta a ser produzido é reativado.
        for (let i = 0; i < casos.length; i++) {
          const c = casos[i] as CasoProposto & { versao?: number };
          const e = ja.get(chaves[i]);
          if (!e) continue;
          const conferido = c.tipo === 'ENQUADRAMENTO_CONFERIDO';
          const manual = c.tipo === 'EXCECAO_MANUAL';
          const reativar = e.situacao === 'OBSOLETO';
          if (!conferido && !manual && !reativar) {
            // O caso continua sendo produzido (mesma chave), mas o que a análise diz dele mudou (regra nova ou alterada, proposta, evidência).
            // Proposto e não editado: passa a dizer o que a análise diz agora (mesma linha, versão nova; decisões e versões liberadas ficam).
            // Em rascunho ou já decidido: nunca se sobrescreve; as células ganham "revisar" com o motivo.
            const m = mudancaDoCaso(e, c);
            if (m.conteudo && e.situacao === 'PROPOSTO') {
              const x = await tx.sanCaso.updateMany({ where: { id: e.id, versao: e.versao, situacao: 'PROPOSTO' }, data: { ...conteudoDoCaso(c), versao: { increment: 1 } } as never });
              if (x.count === 0) throw conflito();
              ja.set(chaves[i], { ...e, ...conteudoDoCaso(c), versao: e.versao + 1 });
              renovados.push(e.id); tocados.add(e.id);
            } else if (m.analise && e.situacao !== 'PROPOSTO' && e.situacao !== 'OBSOLETO') {
              aRevisar.push({ id: e.id, causa: m.regra ? `Revisar: a regra mudou (agora ${m.regra}); a análise deste caso mudou depois da decisão.` : 'Revisar: a análise deste caso mudou depois da decisão.' });
            }
            continue;
          }
          if (manual && !reativar) {
            if (!CASO_ABERTO.includes(e.situacao as SituacaoCaso) && e.situacao !== 'AGUARDANDO_INFORMACAO') {
              throw new ConflictException({ statusCode: 409, codigo: 'CASO_JA_DECIDIDO', message: 'Já existe uma exceção decidida para este item. Reabra o caso antes de registrar outra.' });
            }
            if (c.versao !== undefined && c.versao !== e.versao) throw conflito();
          }
          const nova = reativar ? situacaoInicial(c) : e.situacao;
          const x = await tx.sanCaso.updateMany({
            where: { id: e.id, versao: e.versao },
            data: {
              problema: c.problema, evidencia: (c.evidencia ?? []) as never, atual: (c.atual ?? {}) as never, proposta: (c.proposta ?? {}) as never, justificativa: c.justificativa,
              fundamento: c.fundamento ?? null, afeta: (c.afeta ?? []) as never, situacao: nova, versao: { increment: 1 },
            },
          });
          if (x.count === 0) throw conflito();
          ja.set(chaves[i], { ...e, situacao: nova, versao: e.versao + 1 });
          tocados.add(e.id);
          if (manual || reativar) atualizados.push(await tx.sanCaso.findUnique({ where: { id: e.id } }));
        }

        const novos: { c: CasoProposto; chave: string }[] = [];
        casos.forEach((c, i) => { if (!ja.has(chaves[i])) novos.push({ c, chave: chaves[i] }); });
        const vistos = new Set<string>();
        const unicos = novos.filter((n) => (vistos.has(n.chave) ? false : (vistos.add(n.chave), true)));
        for (const lote of fatiar(unicos, 500)) {
          const criados = await tx.sanCaso.createManyAndReturn({
            data: lote.map(({ c, chave }) => ({
              projeto_id: projetoId, camada, tipo: c.tipo, chave, itens: c.itens, problema: c.problema, evidencia: (c.evidencia ?? []) as never, atual: (c.atual ?? {}) as never,
              proposta: (c.proposta ?? {}) as never, justificativa: c.justificativa, fundamento: c.fundamento ?? null, impactos: (c.impactos ?? []) as never, origem: c.origem,
              situacao: situacaoInicial(c), afeta: (c.afeta ?? []) as never,
              ...(c.tipo === 'ENQUADRAMENTO_CONFERIDO' ? { decidido_por: 'sistema', decidido_em: new Date() } : {}),
            })),
            select: { id: true, chave: true },
          });
          for (const k of criados) { ja.set(k.chave, { id: k.id, situacao: situacaoInicial(lote.find((x) => x.chave === k.chave)!.c), versao: 1 }); tocados.add(k.id); }
        }

        // Células dos itens que entraram em caso (a situação da célula acompanha a do caso). O enquadramento conferido não mexe nas células.
        // Item com exceção própria (viva) fica com a célula da exceção: o caso do conjunto não a sobrepõe.
        const comExcecao = await this.mapaExcecoes(tx, projetoId, camada);
        const pares: { item_id: string; caso_id: string; situacao: string }[] = [];
        casos.forEach((c, i) => {
          if (c.tipo === 'ENQUADRAMENTO_CONFERIDO') return;
          const e = ja.get(chaves[i])!;
          const deRegra = !ehExcecao(c.tipo); // de conjunto ou de um item: a exceção viva do item vale mais
          for (const item_id of c.itens) {
            if (deRegra && comExcecao.has(item_id)) continue;
            pares.push({ item_id, caso_id: e.id, situacao: CELULA_DO_CASO[e.situacao as SituacaoCaso] });
          }
        });
        await this.marcarCelulas(tx, projetoId, camada, pares);
        // Depois de marcar as células (que limpam "revisar"): caso em rascunho ou decidido cuja análise mudou fica "revisar".
        for (const a of aRevisar) await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, camada, caso_id: a.id }, data: { revisar: true, revisar_causa: a.causa.slice(0, 300) } });

        // Unificação proposta (caso novo): a Qualidade dos mesmos itens fica "revisar" (a inativação por falta de movimento pode ter vindo antes,
        // e o código que fica não pode ser inativado). Mesma regra de dependência da aprovação (`camadasAfetadas`).
        if (camada === 'DUPLICIDADE') {
          const envolvidos = new Set<string>();
          for (const { c } of unicos) if (camadasAfetadas(c).includes('QUALIDADE')) for (const i of c.itens) envolvidos.add(i);
          for (const lote of fatiar([...envolvidos], 5000)) {
            await tx.sanCelula.updateMany({
              where: { projeto_id: projetoId, camada: 'QUALIDADE', item_id: { in: lote }, situacao: { not: 'PENDENTE' } },
              data: { revisar: true, revisar_causa: 'Revisar: a Duplicidade propôs unificar este código; confira a inativação por falta de movimento (o código que fica não pode ser inativado).' },
            });
          }
        }

        // Sem problema: o que estava aprovado continua aprovado (só deixa de ser "revisar"); o resto vira "sem problema".
        let sem = 0;
        for (const lote of fatiar((r.semProblema ?? []).filter((i) => !comExcecao.has(i)), 5000)) {
          const base = { projeto_id: projetoId, camada, item_id: { in: lote } };
          await tx.sanCelula.updateMany({ where: { ...base, situacao: 'APROVADO' }, data: { revisar: false, revisar_causa: null } });
          const x = await tx.sanCelula.updateMany({ where: { ...base, situacao: { in: ['PENDENTE', 'PROPOSTO', 'SEM_PROBLEMA', 'AGUARDANDO_INFORMACAO'] } }, data: { situacao: 'SEM_PROBLEMA', caso_id: null, revisar: false, revisar_causa: null } });
          sem += x.count;
        }
        // Faltou dado: o que ainda está pendente na camada fica "aguardando informação" (o motivo vai no retorno).
        if (r.semDados && !opcoes.escopo) await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, camada, situacao: 'PENDENTE' }, data: { situacao: 'AGUARDANDO_INFORMACAO', revisar_causa: r.semDados.motivo.slice(0, 300) } });
        else if (r.semDados) {
          for (const lote of fatiar([...opcoes.escopo!], 5000)) {
            await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, camada, situacao: 'PENDENTE', item_id: { in: lote } }, data: { situacao: 'AGUARDANDO_INFORMACAO', revisar_causa: r.semDados.motivo.slice(0, 300) } });
          }
        }

        await this.sincronizarImpactos(tx, projetoId, [...tocados], dataBase);
        return {
          camada, analisados: r.analisados, casosNovos: unicos.length, casosJaExistentes: casos.length - novos.length - atualizados.length - renovados.length, semProblema: sem, semDados: r.semDados,
          casosAtualizados: atualizados, casosObsoletos: obsoletos.length, casosRenovados: renovados.length, casosParaRevisar: aRevisar.length,
        };
      }, TX_LONGA);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw conflito('Outra execução gravou os mesmos casos ao mesmo tempo. Refaça a operação.');
      throw e;
    }
  }

  /** Exceção manual: motivo com ao menos 5 caracteres e, no tributário, cClassTrib existente e vigente na data-base, com CST coerente. */
  private async validarExcecaoManual(c: CasoProposto, dataBase: string) {
    if (c.tipo !== 'EXCECAO_MANUAL') return;
    if (String(c.justificativa ?? '').trim().length < 5) throw bad('MOTIVO_CURTO', 'Explique o motivo da exceção (ao menos 5 caracteres).');
    const classe = c.proposta?.cClassTrib;
    if (c.camada === 'TRIBUTARIO' && classe != null && this.catalogos) {
      const cat = await this.catalogos.carregar();
      const { classe: k, motivo } = classeVigente(cat, String(classe), dataBase);
      if (!k) throw bad('CLASSE_INVALIDA', `A exceção não vale: ${motivo}.`);
      const cst = c.proposta?.cst;
      if (cst != null && k.cst && String(cst) !== k.cst) throw bad('CST_INCOERENTE', `O CST ${String(cst)} não confere com o da classe ${String(classe)} na tabela da SVRS (${k.cst}).`);
    }
  }

  /** Marca as células (item × camada) com a situação e o caso: um UPDATE por lote no Postgres; sem SQL bruto (testes), um por caso. */
  private async marcarCelulas(tx: Tx, projetoId: string, camada: Camada, pares: { item_id: string; caso_id: string; situacao: string }[]) {
    if (!pares.length) return;
    const bruto = (tx as unknown as { $executeRaw?: unknown }).$executeRaw;
    if (typeof bruto === 'function') {
      for (const lote of fatiar(pares, 5000)) {
        await tx.$executeRaw(Prisma.sql`UPDATE "SanCelula" AS c SET "situacao" = v.situacao, "caso_id" = v.caso_id, "revisar" = false, "revisar_causa" = NULL, "updatedAt" = now()
          FROM jsonb_to_recordset(${JSON.stringify(lote)}::jsonb) AS v(item_id text, caso_id text, situacao text)
          WHERE c."item_id" = v.item_id AND c."camada" = ${camada} AND c."projeto_id" = ${projetoId}`);
      }
      return;
    }
    const porCaso = new Map<string, { situacao: string; itens: string[] }>();
    for (const x of pares) { const g = porCaso.get(x.caso_id) ?? { situacao: x.situacao, itens: [] }; g.itens.push(x.item_id); porCaso.set(x.caso_id, g); }
    for (const [caso_id, g] of porCaso) await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, camada, item_id: { in: g.itens } }, data: { situacao: g.situacao, caso_id, revisar: false, revisar_causa: null } });
  }

  // ── Impacto no SPED ligado ao caso ─────────────────────────────────────────

  /** Regrava as linhas de impacto dos casos: a mesma função da restauração (`regravarImpactosDosCasos`, uma fonte só). */
  private async sincronizarImpactos(tx: Tx, projetoId: string, casoIds: string[], dataBase: string) {
    await regravarImpactosDosCasos(tx, projetoId, casoIds, dataBase);
  }

  /** Reconstrói TODAS as linhas de impacto do projeto (usado ao executar a camada de obrigações). */
  async sincronizarTodosImpactos(projetoId: string) {
    const dataBase = await this.projetos.dataBase(projetoId);
    return this.prisma.$transaction(async (tx) => {
      const ids = (await tx.sanCaso.findMany({ where: { projeto_id: projetoId, camada: { not: 'OBRIGACOES' } }, select: { id: true } })).map((x) => x.id);
      await this.sincronizarImpactos(tx, projetoId, ids, dataBase);
      return { casos: ids.length };
    }, TX_LONGA);
  }

  // ── Consulta ───────────────────────────────────────────────────────────────

  async listar(projetoId: string, f: FiltroCasos) {
    const limite = Math.min(Math.max(paramInteiro(f.limite, 'limite') ?? 100, 1), 500);
    const camadaF = paramTexto(f.camada, 'camada');
    const situacaoF = paramTexto(f.situacao, 'situacao');
    const grupoF = paramTexto(f.grupo, 'grupo');
    const where: Json = { projeto_id: projetoId };
    if (camadaF) where.camada = filtroDeCamada(camadaF);
    const sits = (situacaoF ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (sits.length) where.situacao = sits.length === 1 ? sits[0] : { in: sits };
    if (grupoF) {
      // Casos cujos itens estão no grupo: a célula guarda o caso e o grupo (índice projeto+grupo+camada).
      const cel = await this.prisma.sanCelula.findMany({
        where: { projeto_id: projetoId, grupo: grupoF === '(sem grupo)' ? '' : grupoF, caso_id: { not: null }, ...(camadaF ? { camada: filtroDeCamada(camadaF) } : {}) },
        select: { caso_id: true }, distinct: ['caso_id'],
      });
      where.id = { in: [...new Set(cel.map((c) => c.caso_id as string))] };
    }
    const tipo = paramTexto(f.tipo, 'tipo'); const origem = paramTexto(f.origem, 'origem'); const itemId = paramTexto(f.item_id, 'item_id'); const cursor = paramTexto(f.cursor, 'cursor');
    if (tipo) where.tipo = tipo;
    if (origem) where.origem = origem;
    if (itemId) where.itens = { has: itemId };
    const linhas = await this.prisma.sanCaso.findMany({
      where: where as never, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limite + 1, ...(cursor ? { cursor: { id: cursor } } : {}),
    });
    // O primeiro item de cada caso (código, descrição, grupo): a lista mostra o item, não só o problema.
    const primeiros = [...new Set(linhas.slice(0, limite).map((c) => c.itens[0]).filter(Boolean))];
    const itens = new Map<string, { codigo: string; descricao: string; grupo: string | null }>();
    for (const lote of fatiar(primeiros, 5000)) for (const i of await this.prisma.sanItem.findMany({ where: { id: { in: lote } }, select: { id: true, codigo: true, descricao: true, grupo: true } })) itens.set(i.id, i);
    const pagina = linhas.slice(0, limite).map(({ itens: ids, ...resto }) => {
      const i = itens.get(ids[0]);
      // `similaridade` (0 a 100, pontuação e não probabilidade): Duplicidades e Grupos; null nos demais.
      return { ...resto, qtdItens: ids.length, itens: ids.slice(0, 20), item: i ? { codigo: i.codigo, descricao: i.descricao, grupo: i.grupo } : null, similaridade: similaridadeDoCaso(resto.evidencia) };
    });
    // Primeira página: quantos casos há por tipo no filtro (sem o próprio tipo), para a lista de tipos com contagem.
    let tipos: { tipo: string; n: number }[] | undefined;
    if (!cursor) {
      const { tipo: _t, ...semTipo } = where; // eslint-disable-line @typescript-eslint/no-unused-vars
      const g = await this.prisma.sanCaso.groupBy({ by: ['tipo'], where: semTipo as never, _count: { _all: true } });
      tipos = g.map((x) => ({ tipo: x.tipo, n: x._count._all })).sort((a, b) => b.n - a.n || a.tipo.localeCompare(b.tipo));
    }
    return { casos: pagina, proximo: linhas.length > limite ? linhas[limite].id : null, ...(tipos ? { tipos } : {}) };
  }

  /**
   * Casos agrupados (leitura): casos iguais viram uma linha. Caso de um item entra no grupo (camada, tipo, grupo do item, proposta
   * normalizada); caso de conjunto (vários itens) é um grupo sozinho. Não muda os casos nem a chave deles: a decisão do grupo usa o lote
   * de sempre (ids do grupo), com as mesmas garantias (versão, exceções, conflitos). Mesmos filtros da lista de casos, mais `busca`
   * (problema, grupo, tipo ou proposta). Com `chave`, devolve só aquele grupo com TODOS os ids e as primeiras linhas dos casos.
   * Leitura em janelas de 5000 casos por id (memória limitada), grupo do item lido em bloco.
   */
  async agrupados(projetoId: string, f: FiltroCasosAgrupados) {
    const limite = Math.min(Math.max(paramInteiro(f.limite, 'limite') ?? 200, 1), 500);
    const inicio = Math.max(paramInteiro(f.cursor, 'cursor') ?? 0, 0);
    const chaveF = paramTexto(f.chave, 'chave');
    const busca = normalizarBusca(paramTexto(f.busca, 'busca') ?? '');
    const where = await this.filtroDosCasos(projetoId, f);
    const { grupos, totalCasos } = await this.gruposDosCasos(projetoId, where, busca);
    const saida = ({ atualCanon: _a, atualVaria, ids, ...g }: GrupoDeCasos, todos: boolean) => ({ // eslint-disable-line @typescript-eslint/no-unused-vars
      ...g, atual: atualVaria ? null : g.atual, atualVaria, ids: todos ? ids : ids.slice(0, IDS_POR_GRUPO), idsCompletos: todos || g.casos <= IDS_POR_GRUPO,
    });
    if (chaveF) {
      const g = grupos.get(chaveF);
      if (!g) throw new NotFoundException('Grupo de casos não encontrado com estes filtros (os casos podem ter sido decididos). Recarregue a lista.');
      const mostrar = g.ids.slice(0, CASOS_DO_GRUPO);
      const linhas = await this.prisma.sanCaso.findMany({ where: { id: { in: mostrar } }, select: { id: true, camada: true, tipo: true, itens: true, problema: true, situacao: true, versao: true, origem: true, evidencia: true } });
      const itens = new Map<string, { codigo: string; descricao: string; grupo: string | null }>();
      const primeiros = [...new Set(linhas.map((c) => c.itens[0]).filter(Boolean))];
      for (const lote of fatiar(primeiros, 5000)) for (const i of await this.prisma.sanItem.findMany({ where: { id: { in: lote } }, select: { id: true, codigo: true, descricao: true, grupo: true } })) itens.set(i.id, i);
      const ordem = new Map(mostrar.map((id, i) => [id, i] as const));
      const casos = linhas.sort((a, b) => ordem.get(a.id)! - ordem.get(b.id)!).map(({ itens: ids, evidencia, ...resto }) => {
        const i = itens.get(ids[0]);
        return { ...resto, similaridade: similaridadeDoCaso(evidencia), qtdItens: ids.length, item: i ? { codigo: i.codigo, descricao: i.descricao, grupo: i.grupo } : null };
      });
      return { grupo: { ...saida(g, true), todosIds: g.ids }, casos };
    }
    const ordemCamada = (c: string) => { const i = (CAMADAS as readonly string[]).indexOf(c); return i < 0 ? CAMADAS.length : i; };
    const lista = [...grupos.values()].sort((a, b) => b.casos - a.casos || ordemCamada(a.camada) - ordemCamada(b.camada) || a.camada.localeCompare(b.camada)
      || a.tipo.localeCompare(b.tipo) || (a.grupo ?? '').localeCompare(b.grupo ?? '') || a.chave.localeCompare(b.chave));
    const pagina = lista.slice(inicio, inicio + limite).map((g) => saida(g, false));
    let tipos: { tipo: string; n: number }[] | undefined;
    if (!inicio && !busca) {
      const { tipo: _t, ...semTipo } = where; // eslint-disable-line @typescript-eslint/no-unused-vars
      const gb = await this.prisma.sanCaso.groupBy({ by: ['tipo'], where: semTipo as never, _count: { _all: true } });
      tipos = gb.map((x) => ({ tipo: x.tipo, n: x._count._all })).sort((a, b) => b.n - a.n || a.tipo.localeCompare(b.tipo));
    }
    return { grupos: pagina, totalGrupos: lista.length, totalCasos, proximo: inicio + limite < lista.length ? String(inicio + limite) : null, ...(tipos ? { tipos } : {}) };
  }

  /** Agrupamentos recentes (projeto + filtro + busca), reaproveitados enquanto os casos e os itens do projeto não mudarem (marcaDosCasos). */
  private readonly cacheAgrupados = new Map<string, { marca: string; em: number; grupos: Map<string, GrupoDeCasos>; totalCasos: number }>();

  /** Marca da situação dos casos e dos itens do projeto: muda quando um caso ou item é criado, alterado ou apagado. */
  private async marcaDosCasos(projetoId: string): Promise<string> {
    const [n, caso, item] = await Promise.all([
      this.prisma.sanCaso.count({ where: { projeto_id: projetoId } }),
      this.prisma.sanCaso.findFirst({ where: { projeto_id: projetoId }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      this.prisma.sanItem.findFirst({ where: { projeto_id: projetoId }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ]);
    return `${n}|${caso ? +new Date(caso.updatedAt) : 0}|${item ? +new Date(item.updatedAt) : 0}`;
  }

  /**
   * Os grupos de casos do filtro (todos os ids de cada grupo). A paginação e o detalhe de um grupo reaproveitam o mesmo agrupamento por até
   * CACHE_AGRUPADOS_MS, enquanto a marca dos casos e itens do projeto for a mesma (decisão, reanálise ou reimportação refazem o agrupamento).
   */
  private async gruposDosCasos(projetoId: string, where: Json, busca: string): Promise<{ grupos: Map<string, GrupoDeCasos>; totalCasos: number }> {
    const chaveCache = createHash('sha1').update(`${projetoId}\u0000${JSON.stringify(where)}\u0000${busca}`).digest('hex');
    const marca = await this.marcaDosCasos(projetoId);
    const agora = Date.now();
    for (const [k, v] of this.cacheAgrupados) if (agora - v.em > CACHE_AGRUPADOS_MS) this.cacheAgrupados.delete(k);
    const guardado = this.cacheAgrupados.get(chaveCache);
    if (guardado && guardado.marca === marca) return guardado;
    const grupos = new Map<string, GrupoDeCasos>();
    let totalCasos = 0;
    let apos: string | undefined;
    for (;;) {
      const janela: CasoParaGrupo[] = await this.prisma.sanCaso.findMany({
        where: { ...where, ...(apos ? { id: where.id ? { ...(where.id as Json), gt: apos } : { gt: apos } } : {}) } as never,
        select: { id: true, camada: true, tipo: true, itens: true, problema: true, proposta: true, atual: true, situacao: true },
        orderBy: { id: 'asc' }, take: JANELA_AGRUPAR,
      });
      if (!janela.length) break;
      apos = janela[janela.length - 1].id;
      const soltos = [...new Set(janela.filter((c) => c.itens.length === 1).map((c) => c.itens[0]))];
      const grupoDoItem = new Map<string, string>();
      for (const lote of fatiar(soltos, 5000)) for (const i of await this.prisma.sanItem.findMany({ where: { id: { in: lote } }, select: { id: true, grupo: true } })) grupoDoItem.set(i.id, i.grupo ?? '');
      for (const c of janela) {
        const conjunto = c.itens.length !== 1;
        const grupo = conjunto ? null : grupoDoItem.get(c.itens[0]) ?? '';
        const proposta = canonico(c.proposta ?? {});
        if (busca && !normalizarBusca(`${c.problema} ${grupo ?? ''} ${rotuloTipoCaso(c.tipo)} ${proposta}`).includes(busca)) continue;
        const chave = conjunto ? `c:${c.id}` : `g:${createHash('sha1').update(`${c.camada}\u0000${c.tipo}\u0000${grupo}\u0000${proposta}`).digest('hex').slice(0, 24)}`;
        totalCasos++;
        const atual = canonico(c.atual ?? {});
        let g = grupos.get(chave);
        if (!g) {
          g = { chave, camada: c.camada, tipo: c.tipo, grupo, conjunto, problema: c.problema, problemaVaria: false, proposta: (c.proposta as Json) ?? {}, atual: (c.atual as Json) ?? {}, atualCanon: atual, atualVaria: false, casos: 0, itens: 0, ids: [], situacoes: {} };
          grupos.set(chave, g);
        }
        g.casos++;
        g.itens += c.itens.length;
        if (!g.problemaVaria && g.problema !== c.problema) g.problemaVaria = true;
        if (!g.atualVaria && g.atualCanon !== atual) g.atualVaria = true;
        g.ids.push(c.id);
        g.situacoes[c.situacao] = (g.situacoes[c.situacao] ?? 0) + 1;
      }
      if (janela.length < JANELA_AGRUPAR) break;
    }
    const r = { marca, em: agora, grupos, totalCasos };
    this.cacheAgrupados.delete(chaveCache);
    this.cacheAgrupados.set(chaveCache, r);
    while (this.cacheAgrupados.size > MAX_CACHE_AGRUPADOS) this.cacheAgrupados.delete(this.cacheAgrupados.keys().next().value as string);
    return r;
  }

  /** O `where` da lista de casos (camada, situação, grupo do item pela célula, tipo, origem, item), para a leitura agrupada. */
  private async filtroDosCasos(projetoId: string, f: FiltroCasos): Promise<Json> {
    const camadaF = paramTexto(f.camada, 'camada');
    const situacaoF = paramTexto(f.situacao, 'situacao');
    const grupoF = paramTexto(f.grupo, 'grupo');
    const where: Json = { projeto_id: projetoId };
    if (camadaF) where.camada = filtroDeCamada(camadaF);
    const sits = (situacaoF ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (sits.length) where.situacao = sits.length === 1 ? sits[0] : { in: sits };
    if (grupoF) {
      const cel = await this.prisma.sanCelula.findMany({
        where: { projeto_id: projetoId, grupo: grupoF === '(sem grupo)' ? '' : grupoF, caso_id: { not: null }, ...(camadaF ? { camada: filtroDeCamada(camadaF) } : {}) },
        select: { caso_id: true }, distinct: ['caso_id'],
      });
      where.id = { in: [...new Set(cel.map((c) => c.caso_id as string))] };
    }
    const tipo = paramTexto(f.tipo, 'tipo'); const origem = paramTexto(f.origem, 'origem'); const itemId = paramTexto(f.item_id, 'item_id');
    if (tipo) where.tipo = tipo;
    if (origem) where.origem = origem;
    if (itemId) where.itens = { has: itemId };
    return where;
  }

  async obter(id: string) {
    const c = await this.prisma.sanCaso.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Caso não encontrado.');
    // Os primeiros itens do caso (código, descrição, grupo, NCM, unidade, saldo, última movimentação): o detalhe mostra sempre o item.
    const ids = c.itens.slice(0, RESUMO_ITENS);
    const lidos = new Map((await this.prisma.sanItem.findMany({ where: { id: { in: ids } }, select: { id: true, codigo: true, trabalho: true } })).map((i) => [i.id, i] as const));
    const resumoItens = ids.flatMap((id) => {
      const i = lidos.get(id);
      if (!i) return [];
      const t = (i.trabalho as Json) ?? {};
      return [{ id: i.id, codigo: i.codigo, descricao: t.descricao ?? null, grupo: t.grupo ?? null, ncm: t.ncm ?? null, unidade: t.unidade ?? null, saldo: t.saldo ?? null, ultimaMovimentacao: t.ultimaMovimentacao ?? null }];
    });
    // Tipos de ajuste do caso: a tela mostra as restrições do ERP do projeto para eles (Cadastro de ERPs).
    return { ...c, tiposAjuste: tiposDeAjusteDoCaso(c), resumoItens };
  }

  /** Histórico por campo de um item (mais recente primeiro). */
  historico(itemId: string, campo?: string) {
    return this.prisma.sanDecisao.findMany({ where: { item_id: itemId, ...(campo ? { campo } : {}) }, orderBy: [{ quando: 'desc' }, { id: 'desc' }], take: 500 });
  }

  /**
   * O Agente 7 grava o parecer da IA aqui. Só preenche `parecer_ia` de caso ABERTO (proposto ou em edição) e sobe a `versao`, para que quem
   * estava com o caso aberto na tela veja que mudou. Nunca decide nem muda a situação. Caso fechado: não grava e devolve o motivo.
   */
  async definirParecerIa(casoId: string, parecer: ParecerIa | null): Promise<{ gravado: boolean; motivo?: string }> {
    const r = await this.prisma.sanCaso.updateMany({ where: { id: casoId, situacao: { in: CASO_ABERTO } }, data: { parecer_ia: (parecer ?? null) as never, versao: { increment: 1 } } });
    if (r.count > 0) return { gravado: true };
    const c = await this.prisma.sanCaso.findUnique({ where: { id: casoId }, select: { situacao: true } });
    if (!c) throw new NotFoundException('Caso não encontrado.');
    return { gravado: false, motivo: `O caso está "${c.situacao}": o parecer só é gravado em caso aberto.` };
  }

  // ── Decisões ───────────────────────────────────────────────────────────────

  /** Rascunho: guarda a proposta editada sem aplicar. O caso volta a "rascunho" até aprovar. */
  async salvarRascunho(id: string, e: { versao?: number; proposta?: Json; justificativa?: string; responsavel?: string | null }, usuario?: Usuario) {
    const versao = exigirVersao(e.versao);
    const dados: Json = { situacao: 'RASCUNHO', versao: { increment: 1 } };
    const proposta = e.proposta !== undefined ? this.normalizarFator(validarProposta(e.proposta ?? {})) : undefined;
    if (e.justificativa !== undefined) dados.justificativa = texto(e.justificativa, 4000) ?? '';
    if (e.responsavel !== undefined) dados.responsavel = texto(e.responsavel, 120);
    return this.prisma.$transaction(async (tx) => {
      const c = await this.carregar(tx, id);
      await this.exigirFaseLiberada(c);
      if (!CASO_ABERTO.includes(c.situacao as SituacaoCaso) && c.situacao !== 'AGUARDANDO_INFORMACAO') throw new BadRequestException('Só dá para editar um caso em aberto. Reabra o caso antes.');
      if (proposta !== undefined) { dados.proposta = proposta; dados.afeta = this.afetaDe(c, proposta); }
      const r = await tx.sanCaso.updateMany({ where: { id, versao, situacao: c.situacao }, data: dados as never });
      if (r.count === 0) throw conflito();
      await this.celulasDoCaso(tx, c, 'RASCUNHO', false);
      await this.sincronizarImpactos(tx, c.projeto_id, [id], await this.projetos.dataBase(c.projeto_id));
      return tx.sanCaso.findUnique({ where: { id } });
    });
  }

  /** O consultor que digita o fator numérico informa (ou confirma) o fator: a situação deixa de ser INFORMAR/CONFIRMAR. */
  private normalizarFator(p: Json): Json {
    if ((p.fatorSituacao === 'INFORMAR' || p.fatorSituacao === 'CONFIRMAR') && fatorValido(p)) return { ...p, fatorSituacao: 'INFORMADO' };
    return p;
  }

  /** `afeta` recalculado a partir da proposta (união com o que o analisador já tinha). */
  private afetaDe(c: Pick<CasoLinha, 'camada' | 'tipo' | 'afeta'>, proposta: Json): string[] {
    const calc = camadasAfetadas({ camada: c.camada as Camada, tipo: c.tipo, proposta: proposta as never });
    const todas = new Set<string>([...((c.afeta as string[]) ?? []), ...calc]);
    return CAMADAS.filter((x) => todas.has(x) && x !== c.camada);
  }

  /** Um caso só pode ser aprovado se houver o que decidir: campo aplicável, decisão de duplicidade, vínculo de código antigo ou conferência. */
  private exigirEfeito(c: CasoLinha, aplicavel: Json, proposta: Json) {
    if (c.situacao === 'OBSOLETO') throw bad('CASO_OBSOLETO', 'Este caso ficou obsoleto: a camada foi reexecutada e não o produz mais. Rode a análise de novo.');
    if (c.tipo.startsWith('AGUARDANDO')) throw bad('FALTA_INFORMACAO', 'Falta informação para decidir este caso: informe o que falta e reabra, ou rejeite.');
    if (proposta.decisao === 'SOLICITAR_INFORMACAO') throw bad('DECISAO_PEDE_INFORMACAO', MSG_PEDE_INFORMACAO);
    if (c.camada === 'OBRIGACOES' || c.tipo === 'CODIGO_ANTIGO' || proposta.decisao !== undefined || Object.keys(aplicavel).length) return;
    throw bad('SEM_PROPOSTA', 'Este caso não tem proposta aplicável: falta informação. Informe o valor (edite a proposta) ou rejeite o caso.');
  }

  /** Conversão de unidade só com fator numérico > 0; fator sugerido pela descrição exige confirmação. */
  private exigirFator(proposta: Json, confirmarFator?: boolean) {
    if (!ehCasoDeUnidade(proposta)) return;
    if (!fatorValido(proposta) || proposta.fatorSituacao === 'INFORMAR') throw bad('FATOR_AUSENTE', 'Informe o fator de conversão (número maior que zero) editando a proposta antes de aprovar.');
    if (proposta.fatorSituacao === 'CONFIRMAR' && !confirmarFator) throw bad('FATOR_A_CONFIRMAR', 'O fator foi tirado da descrição do item: confirme-o (confirmarFator) ou corrija-o na proposta.');
  }

  /**
   * Campos da proposta cujo valor atual no item já não é o que o caso registrou em `atual`. Quando o `atual` do conjunto diz "varia por
   * item", a conferência é item a item e campo a campo: diverge o item cujo campo foi alterado por outra decisão (ou reimportação)
   * depois que o caso foi proposto.
   */
  private async divergencias(tx: Tx, c: CasoLinha, aplicavel: Json) {
    const atual = (c.atual as Json) ?? {};
    const campos = Object.keys(aplicavel).filter((k) => k in atual);
    if (!campos.length) return [];
    const porItem = campos.filter((k) => atual[k] === VARIA_POR_ITEM);
    const diretos = campos.filter((k) => atual[k] !== VARIA_POR_ITEM);
    const achadas: { campo: string; atual: unknown; esperado: unknown; item?: string }[] = [];
    for (const lote of fatiar(c.itens, 500)) {
      const itens = await tx.sanItem.findMany({ where: { id: { in: lote }, projeto_id: c.projeto_id }, select: { id: true, codigo: true, trabalho: true } });
      for (const i of itens) {
        for (const k of diretos) {
          const v = valorDoCampo(i.trabalho as Json, k);
          if (!igual(v, atual[k]) && !igual(v, aplicavel[k]) && !achadas.some((a) => a.campo === k)) achadas.push({ campo: k, atual: v, esperado: atual[k] });
        }
      }
      if (!porItem.length) continue;
      const depois = await tx.sanDecisao.findMany({
        where: { projeto_id: c.projeto_id, item_id: { in: lote }, campo: { in: porItem }, OR: [{ caso_id: null }, { caso_id: { not: c.id } }] },
        select: { item_id: true, campo: true, quando: true },
      });
      for (const d of depois) {
        if (+d.quando <= +c.createdAt) continue;
        const i = itens.find((x) => x.id === d.item_id);
        const v = i ? valorDoCampo(i.trabalho as Json, d.campo) : null;
        const item = i?.codigo ?? d.item_id;
        if (igual(v, aplicavel[d.campo]) || achadas.some((a) => a.campo === d.campo && a.item === item)) continue;
        achadas.push({ campo: d.campo, atual: v, esperado: VARIA_POR_ITEM, item });
      }
    }
    return achadas;
  }

  /** Aprova e APLICA ao trabalho, gravando uma decisão por campo. Idempotente: caso já aprovado devolve o estado sem gravar de novo. */
  async aprovar(id: string, e: EntradaAprovar, usuario?: Usuario, interno: { dataBase?: string; liberada?: boolean } = {}) {
    const editada = e.proposta !== undefined ? this.normalizarFator(validarProposta(e.proposta)) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const todo = await this.carregar(tx, id);
      if (todo.situacao === 'APROVADO') return { caso: todo, jaAplicado: true };
      if (!interno.liberada) await this.exigirFaseLiberada(todo);
      // Caso de regra (conjunto ou um item): o item com exceção própria fica fora (a exceção vale mais), e também o item que tem caso
      // individual em edição (rascunho) na mesma camada e no mesmo campo; os demais recebem a decisão, item a item.
      const camposDaProposta = Object.keys(propostaAplicavel(todo.camada, editada ?? ((todo.proposta as Json) ?? {})));
      const c = await this.semExcecoes(tx, todo, await this.mapaExcecoes(tx, todo.projeto_id, todo.camada, camposDaProposta));
      if (!c.itens.length) throw bad('SO_EXCECOES', 'Todos os itens deste caso têm exceção própria ou caso individual em edição no mesmo campo: decida esses casos primeiro (este não tem o que aplicar).');
      if (c.tipo === 'FINALIDADE_EXCECAO' && (texto(e.justificativa, 4000) ?? texto(c.justificativa, 4000) ?? '').length < MOTIVO_MINIMO) {
        throw bad('MOTIVO_EXCECAO', 'Exceção exige motivo: escreva na justificativa por que estes itens têm finalidade diferente da do grupo (ao menos 5 caracteres).');
      }
      const versao = exigirVersao(e.versao);
      if (c.versao !== versao) throw conflito();
      if (c.situacao === 'REJEITADO') throw new BadRequestException('O caso foi rejeitado. Reabra antes de aprovar.');
      const proposta = editada ?? ((c.proposta as Json) ?? {});
      const aplicavel = propostaAplicavel(c.camada, proposta);
      this.exigirEfeito(c, aplicavel, proposta);
      this.exigirFator(proposta, e.confirmarFator);
      if (!e.confirmarDivergencia) {
        const campos = await this.divergencias(tx, c, aplicavel);
        if (campos.length) throw new ConflictException({ statusCode: 409, codigo: 'PROPOSTA_DESATUALIZADA', message: 'O valor atual do item mudou desde que o caso foi proposto. Confira ou confirme a divergência.', campos });
      }
      const justificativa = texto(e.justificativa, 4000);
      const fundamentoBase = texto(e.fundamento, 4000) ?? c.fundamento ?? c.justificativa;
      const fundamento = justificativa ? (e.fundamento ? `${justificativa} (${fundamentoBase})` : justificativa) : fundamentoBase;
      await this.aplicar(tx, c, aplicavel, fundamento, e.versoesItens, usuario);
      await this.vincularConsolidacao(tx, c, proposta, fundamento);
      if (c.tipo === 'CODIGO_ANTIGO') {
        const a = (c.atual as Json) ?? {};
        if (a.codigoAntigo && a.codigo) await this.criarVinculo(tx, c, String(a.codigoAntigo), String(a.codigo), fundamento);
      }
      const afeta = this.afetaDe(c, proposta);
      const r = await tx.sanCaso.updateMany({
        where: { id, versao },
        data: {
          situacao: 'APROVADO', proposta: proposta as never, afeta: afeta as never, decidido_por: quem(usuario), decidido_em: new Date(), versao: { increment: 1 },
          ...(justificativa ? { justificativa } : {}),
        },
      });
      if (r.count === 0) throw conflito();
      const novo = (await tx.sanCaso.findUnique({ where: { id } }))!;
      const efetivo = { ...novo, itens: c.itens };
      await this.celulasDoCaso(tx, efetivo, 'APROVADO', false);
      await this.marcarDependencias(tx, efetivo);
      await this.sincronizarImpactos(tx, c.projeto_id, [id], interno.dataBase ?? (await this.projetos.dataBase(c.projeto_id)));
      return { caso: novo, jaAplicado: false, ...(todo.itens.length !== c.itens.length ? { itensComExcecao: todo.itens.length - c.itens.length } : {}) };
    }, TX_LONGA);
  }

  async rejeitar(id: string, e: { versao?: number; justificativa?: string }, usuario?: Usuario, interno: { dataBase?: string; liberada?: boolean } = {}) {
    const justificativa = texto(e.justificativa, 4000);
    if (!justificativa) throw new BadRequestException('Rejeitar exige uma justificativa.');
    return this.prisma.$transaction(async (tx) => {
      const c = await this.carregar(tx, id);
      if (c.situacao === 'REJEITADO') return { caso: c, jaAplicado: true };
      if (!interno.liberada) await this.exigirFaseLiberada(c);
      const versao = exigirVersao(e.versao);
      if (c.versao !== versao) throw conflito();
      if (c.situacao === 'APROVADO') throw new BadRequestException('O caso já foi aprovado. Reabra (desfaça) antes de rejeitar.');
      const efetivos = (await this.semExcecoes(tx, c)).itens;
      const itens: { id: string; trabalho: unknown }[] = [];
      for (const lote of fatiar(efetivos, 5000)) itens.push(...(await tx.sanItem.findMany({ where: { id: { in: lote } }, select: { id: true, trabalho: true } })));
      const campos = Object.keys(propostaAplicavel(c.camada, c.proposta as Json));
      const rows = itens.flatMap((i) => (campos.length ? campos : [`caso:${c.tipo}`]).map((campo) => {
        const v = campo.startsWith('caso:') ? null : valorDoCampo(i.trabalho as Json, campo);
        return { projeto_id: c.projeto_id, item_id: i.id, caso_id: c.id, campo, antes: v as never, depois: v as never, fundamento: justificativa, usuario: quem(usuario), tipo: 'rejeitar' };
      }));
      for (const lote of fatiar(rows, 2000)) await tx.sanDecisao.createMany({ data: lote });
      const r = await tx.sanCaso.updateMany({ where: { id, versao }, data: { situacao: 'REJEITADO', motivo: justificativa, decidido_por: quem(usuario), decidido_em: new Date(), versao: { increment: 1 } } });
      if (r.count === 0) throw conflito();
      await this.celulasDoCaso(tx, c, 'REJEITADO', false);
      await this.sincronizarImpactos(tx, c.projeto_id, [id], interno.dataBase ?? (await this.projetos.dataBase(c.projeto_id)));
      return { caso: await tx.sanCaso.findUnique({ where: { id } }), jaAplicado: false };
    }, TX_LONGA);
  }

  async pedirInformacao(id: string, e: { versao?: number; motivo?: string }, interno: { dataBase?: string; liberada?: boolean } = {}) {
    const motivo = texto(e.motivo, 4000);
    if (!motivo) throw new BadRequestException('Diga que informação falta.');
    const versao = exigirVersao(e.versao);
    return this.prisma.$transaction(async (tx) => {
      const c = await this.carregar(tx, id);
      if (!interno.liberada) await this.exigirFaseLiberada(c);
      if (!CASO_ABERTO.includes(c.situacao as SituacaoCaso)) throw new BadRequestException('Só dá para pedir informação de um caso em aberto.');
      const r = await tx.sanCaso.updateMany({ where: { id, versao }, data: { situacao: 'AGUARDANDO_INFORMACAO', motivo, versao: { increment: 1 } } });
      if (r.count === 0) throw conflito();
      await this.celulasDoCaso(tx, c, 'AGUARDANDO_INFORMACAO', false);
      await this.sincronizarImpactos(tx, c.projeto_id, [id], interno.dataBase ?? (await this.projetos.dataBase(c.projeto_id)));
      return tx.sanCaso.findUnique({ where: { id } });
    });
  }

  /**
   * Reabrir: de rejeitado ou aguardando volta a "proposto". De aprovado, DESFAZ o que foi aplicado (cada campo volta ao valor anterior,
   * gravando decisão "desfazer"), marca as dependências como "revisar" e remove vínculos e impactos do caso; se o campo foi mudado depois
   * por outra decisão, recusa com mensagem clara.
   */
  async reabrir(id: string, e: { versao?: number }, usuario?: Usuario) {
    const versao = exigirVersao(e.versao);
    return this.prisma.$transaction(async (tx) => {
      const c = await this.carregar(tx, id);
      if (CASO_ABERTO.includes(c.situacao as SituacaoCaso)) return c;
      if (c.situacao === 'OBSOLETO') throw bad('CASO_OBSOLETO', 'Este caso ficou obsoleto e não pode ser reaberto: rode a análise de novo.');
      if (c.versao !== versao) throw conflito();
      if (c.situacao === 'APROVADO') {
        const decs = await tx.sanDecisao.findMany({ where: { caso_id: id }, orderBy: [{ quando: 'asc' }, { id: 'asc' }] });
        const ultima = new Map<string, (typeof decs)[number]>();
        for (const d of decs) ultima.set(`${d.item_id}\u0000${d.campo}`, d);
        const aDesfazer = [...ultima.values()].filter((d) => d.tipo === 'aprovar' && !d.campo.startsWith('caso:'));
        const porItem = new Map<string, typeof aDesfazer>();
        for (const d of aDesfazer) acrescentar(porItem, d.item_id, d);
        for (const [itemId, lista] of porItem) {
          const item = await tx.sanItem.findUnique({ where: { id: itemId } });
          if (!item) continue;
          const trabalho = JSON.parse(JSON.stringify(item.trabalho)) as Json;
          for (const d of lista) {
            if (!igual(valorDoCampo(trabalho, d.campo), d.depois)) throw new ConflictException({ statusCode: 409, codigo: 'CAMPO_ALTERADO_DEPOIS', message: `Não dá para desfazer: o campo "${d.campo}" do item ${String(trabalho.codigo)} foi alterado depois por outra decisão. Desfaça essa primeiro.` });
            aplicarCampo(trabalho, d.campo, d.antes, false);
          }
          const rr = await tx.sanItem.updateMany({ where: { id: itemId, versao: item.versao }, data: { trabalho: trabalho as never, ...derivadosDoTrabalho(trabalho), versao: { increment: 1 } } });
          if (rr.count === 0) throw conflito();
          await tx.sanCelula.updateMany({ where: { item_id: itemId }, data: { grupo: derivadosDoTrabalho(trabalho).grupo ?? '' } });
          await tx.sanDecisao.createMany({ data: lista.map((d) => ({ projeto_id: c.projeto_id, item_id: itemId, caso_id: id, campo: d.campo, antes: d.depois as never, depois: d.antes as never, fundamento: 'Aprovação desfeita', usuario: quem(usuario), tipo: 'desfazer' })) });
        }
        if (porItem.size) await this.marcarDependencias(tx, c, 'foi desfeito');
        await this.removerVinculosDoCaso(tx, c.projeto_id, id);
      }
      const r = await tx.sanCaso.updateMany({ where: { id, versao }, data: { situacao: 'PROPOSTO', motivo: null, decidido_por: null, decidido_em: null, versao: { increment: 1 } } });
      if (r.count === 0) throw conflito();
      await this.celulasDoCaso(tx, c, 'PROPOSTO', false);
      await this.sincronizarImpactos(tx, c.projeto_id, [id], await this.projetos.dataBase(c.projeto_id));
      return tx.sanCaso.findUnique({ where: { id } });
    }, TX_LONGA);
  }

  // ── Lote com prévia ────────────────────────────────────────────────────────

  private async casosDoLote(projetoId: string, e: EntradaLote) {
    if (e.ids?.length) {
      if (!Array.isArray(e.ids) || e.ids.some((x) => typeof x !== 'string')) throw new BadRequestException('"ids" deve ser uma lista de textos.');
      if (e.ids.length > MAX_LOTE) throw new BadRequestException(`O lote aceita até ${MAX_LOTE} casos por vez.`);
      const ids = [...new Set(e.ids)];
      const achados = await this.prisma.sanCaso.findMany({ where: { projeto_id: projetoId, id: { in: ids } } });
      const existem = new Set(achados.map((c) => c.id));
      // Id que não existe neste projeto não some em silêncio: a prévia o lista entre as exceções.
      return { casos: achados, inexistentes: ids.filter((x) => !existem.has(x)), total: ids.length, proximo: null as string | null };
    }
    const f = e.filtro ?? {};
    if (!f.camada && !f.tipo && !f.origem && !f.grupo && !f.situacao) throw new BadRequestException('Escolha os casos do lote (lista de ids ou filtro por camada, tipo, origem, grupo ou situação).');
    // Só casos em aberto; a situação do filtro só restringe (proposto ou rascunho).
    const sits = String(f.situacao ?? '').split(',').map((x) => x.trim()).filter((x) => CASO_ABERTO.includes(x as SituacaoCaso));
    const where: Json = { projeto_id: projetoId, situacao: { in: sits.length ? sits : CASO_ABERTO } };
    if (f.camada) where.camada = filtroDeCamada(String(f.camada));
    if (f.tipo) where.tipo = String(f.tipo);
    if (f.origem) where.origem = String(f.origem);
    const idF: Json = {};
    if (f.grupo) {
      // Casos cujos itens estão no grupo (o mesmo recorte da lista de casos).
      const cel = await this.prisma.sanCelula.findMany({
        where: { projeto_id: projetoId, grupo: f.grupo === '(sem grupo)' ? '' : String(f.grupo), caso_id: { not: null }, ...(f.camada ? { camada: filtroDeCamada(String(f.camada)) } : {}) },
        select: { caso_id: true }, distinct: ['caso_id'],
      });
      idF.in = [...new Set(cel.map((c) => c.caso_id as string))];
    }
    const total = await this.prisma.sanCaso.count({ where: { ...where, ...(f.grupo ? { id: idF } : {}) } as never });
    if (e.apos !== undefined && typeof e.apos !== 'string') throw new BadRequestException('"apos" deve ser o id do último caso da rodada anterior.');
    if (e.apos) idF.gt = e.apos;
    const janela = await this.prisma.sanCaso.findMany({ where: { ...where, ...(Object.keys(idF).length ? { id: idF } : {}) } as never, orderBy: { id: 'asc' }, take: MAX_LOTE + 1 });
    const casos = janela.slice(0, MAX_LOTE);
    // Mais de 2000 no filtro: esta rodada leva os 2000 primeiros; `proximo` diz de onde a próxima começa.
    return { casos, inexistentes: [] as string[], total, proximo: janela.length > MAX_LOTE ? casos[casos.length - 1].id : null };
  }

  /** Tipo, quantidade de itens e o primeiro item (código e descrição) do caso, lidos do mapa de itens já carregado. */
  private identificar(c: Pick<CasoLinha, 'tipo' | 'itens'>, itens: Map<string, { trabalho: unknown }>): Identificacao {
    const t = (itens.get(c.itens[0])?.trabalho as Json | undefined) ?? {};
    return { tipo: c.tipo, qtdItens: c.itens.length, ...(t.codigo != null ? { codigo: String(t.codigo) } : {}), ...(t.descricao != null ? { descricao: String(t.descricao) } : {}) };
  }

  /** Prévia: mostra itens, campos afetados, vínculos a criar e as exceções (que ficam de fora). Não grava nada. */
  async lotePrevia(projetoId: string, e: EntradaLote) {
    const { casos: brutos, inexistentes, total, proximo } = await this.casosDoLote(projetoId, e);
    // Conjunto: o item com exceção própria fica fora (como na aprovação individual).
    const excecoesPorCamada = new Map<string, Map<string, string>>();
    for (const camada of new Set(brutos.filter((c) => !ehExcecao(c.tipo)).map((c) => c.camada))) excecoesPorCamada.set(camada, await this.mapaExcecoes(this.prisma, projetoId, camada));
    const casos: CasoLinha[] = [];
    for (const c of brutos) casos.push(await this.semExcecoes(this.prisma, c, excecoesPorCamada.get(c.camada) ?? new Map()));
    const itensIds = [...new Set([...casos.flatMap((c) => c.itens), ...brutos.map((c) => c.itens[0]).filter(Boolean)])];
    const itens = new Map<string, { id: string; trabalho: unknown; versao: number }>();
    for (const lote of fatiar(itensIds, 5000)) for (const i of await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId, id: { in: lote } }, select: { id: true, trabalho: true, versao: true } })) itens.set(i.id, i);
    const ident = new Map(brutos.map((c) => [c.id, this.identificar(c, itens)] as const));
    const excecoes: Excecao[] = inexistentes.map((casoId) => ({ casoId, motivo: 'Caso inexistente neste projeto.' }));
    const quemMuda = new Map<string, { valor: unknown; casoId: string }>();
    const aprovaveis: ({ casoId: string; versao: number; camada: string; tipo: string; itens: number; campos: string[]; vinculos: { de: string; para: string }[] } & Identificacao)[] = [];
    const afetadosItens = new Set<string>();
    let camposAfetados = 0;
    for (const c of casos) {
      const completa = (c.proposta as Json) ?? {};
      const proposta = propostaAplicavel(c.camada, completa);
      const atual = (c.atual as Json) ?? {};
      let motivo: string | null = null;
      if (!CASO_ABERTO.includes(c.situacao as SituacaoCaso)) motivo = `O caso está ${SITUACAO_LEGIVEL[c.situacao] ?? c.situacao}, não em aberto.`;
      else if (c.tipo === 'DUPLICIDADE_COM_SALDO') motivo = 'Duplicidade com saldo ou movimentação: exige transferência de saldo e decisão individual.';
      else if (c.tipo.startsWith('AGUARDANDO')) motivo = 'Falta informação para decidir este caso.';
      else if (completa.decisao === 'SOLICITAR_INFORMACAO') motivo = MSG_PEDE_INFORMACAO;
      else if (!c.itens.length) motivo = 'Todos os itens deste conjunto têm exceção própria.';
      else if (c.tipo === 'FINALIDADE_EXCECAO') motivo = 'Exceção à finalidade do grupo: exige o motivo escrito, caso a caso.';
      else if (ehCasoDeUnidade(completa) && (!fatorValido(completa) || completa.fatorSituacao === 'INFORMAR')) motivo = 'Conversão de unidade sem fator: informe o fator editando o caso.';
      else if (ehCasoDeUnidade(completa) && completa.fatorSituacao === 'CONFIRMAR') motivo = 'O fator de conversão veio da descrição do item: confirme-o caso a caso.';
      else if ((c.parecer_ia as { confianca?: string } | null)?.confianca === 'baixa') motivo = 'O parecer da IA tem confiança baixa: decida este caso à parte.';
      else if (c.itens.some((i) => !itens.has(i))) motivo = 'Algum item do caso não existe mais.';
      else if (c.camada !== 'OBRIGACOES' && c.tipo !== 'CODIGO_ANTIGO' && completa.decisao === undefined && !Object.keys(proposta).length) motivo = 'Caso sem proposta aplicável: falta informação.';
      if (!motivo) {
        for (const campo of Object.keys(atual)) {
          if (!(campo in proposta) || atual[campo] === VARIA_POR_ITEM) continue; // varia por item: a conferência é na aprovação, item a item
          const dif = c.itens.find((i) => !igual(valorDoCampo(itens.get(i)!.trabalho as Json, campo), atual[campo]));
          if (dif) { motivo = `O valor de "${rotuloDoCampo(campo)}" mudou desde que o caso foi proposto.`; break; }
        }
      }
      if (!motivo) {
        for (const campo of Object.keys(proposta)) {
          for (const i of c.itens) {
            const k = `${i}\u0000${campo}`;
            const outro = quemMuda.get(k);
            if (outro && !igual(outro.valor, proposta[campo])) { const o = ident.get(outro.casoId); motivo = `Conflita com outro caso do lote (${rotuloTipoCaso(o?.tipo ?? '')}${o?.codigo ? `, item ${o.codigo}` : ''}): mesmo item e campo, valores diferentes.`; break; }
          }
          if (motivo) break;
        }
      }
      if (motivo) { excecoes.push({ casoId: c.id, motivo, ...ident.get(c.id) }); continue; }
      const campos = new Set<string>();
      for (const campo of Object.keys(proposta)) for (const i of c.itens) {
        quemMuda.set(`${i}\u0000${campo}`, { valor: proposta[campo], casoId: c.id });
        if (!igual(valorDoCampo(itens.get(i)!.trabalho as Json, campo), proposta[campo])) { campos.add(campo); camposAfetados++; afetadosItens.add(i); }
      }
      const vinculos: { de: string; para: string }[] = [];
      if (c.camada === 'DUPLICIDADE' && completa.decisao === 'PROPOR_CONSOLIDACAO' && completa.manter && completa.consolidar) {
        for (const de of String(completa.consolidar).split('|').map((x) => x.trim()).filter(Boolean)) vinculos.push({ de, para: String(completa.manter) });
      }
      if (c.tipo === 'CODIGO_ANTIGO' && atual.codigoAntigo && atual.codigo) vinculos.push({ de: String(atual.codigoAntigo), para: String(atual.codigo) });
      if (proposta.codigo !== undefined) for (const i of c.itens) { const antes = valorDoCampo(itens.get(i)!.trabalho as Json, 'codigo'); if (antes && antes !== proposta.codigo) vinculos.push({ de: String(antes), para: String(proposta.codigo) }); }
      aprovaveis.push({ ...ident.get(c.id), casoId: c.id, versao: c.versao, camada: c.camada, tipo: c.tipo, itens: c.itens.length, campos: [...campos], vinculos });
    }
    // Em aberto (com a versão): o recorte de "Pedir informação" e "Rejeitar" em lote, que valem para todo caso em aberto, com ou sem proposta.
    const abertos = brutos.filter((c) => CASO_ABERTO.includes(c.situacao as SituacaoCaso)).map((c) => ({ casoId: c.id, versao: c.versao }));
    return {
      casos: casos.length, total, proximo, inexistentes: inexistentes.length, aprovaveis, excecoes, abertos, itensAfetados: afetadosItens.size, camposAfetados,
      camadas: [...new Set(brutos.map((c) => c.camada))],
      vinculosACriar: aprovaveis.reduce((s, a) => s + a.vinculos.length, 0),
    };
  }

  /**
   * Aprova só o que a prévia aceitou. Cada caso numa transação; falha de um (ex.: conflito) vira exceção e não derruba os outros.
   * Tem orçamento de tempo (60 s): o que não coube volta em `restantes` para uma nova chamada.
   */
  async loteAprovar(projetoId: string, e: EntradaLote, usuario?: Usuario) {
    if (!e.versoes || !Object.keys(e.versoes).length) throw new BadRequestException('Faça a prévia do lote antes de aprovar e envie as versões que ela mostrou ("versoes").');
    const orcamento = orcamentoDoLote(e.orcamentoMs);
    const inicio = Date.now(); // o orçamento conta a requisição inteira (a prévia refeita também)
    const previa = await this.lotePrevia(projetoId, e);
    // A trava por fase vale para o lote inteiro: com caso de camada da Fase 2 travada, nada é decidido (o mesmo 400 da decisão individual).
    await this.projetos.exigirLiberadaPara(projetoId, previa.camadas);
    const excecoes = [...previa.excecoes];
    const dataBase = await this.projetos.dataBase(projetoId);
    const restantes: string[] = [];
    let aprovados = 0;
    // O orçamento olha o PRÓXIMO caso antes de começá-lo: estimativa = itens do caso × o maior custo por item já medido neste lote
    // (o primeiro caso sempre roda, para o lote andar). Caso que não cabe fica em "restantes" e o consultor chama de novo.
    let msPorItem = 0;
    for (const a of previa.aprovaveis) {
      const gasto = Date.now() - inicio;
      if (gasto > orcamento || (aprovados > 0 && gasto + estimativaDoCaso(a.itens, msPorItem) > orcamento)) { restantes.push(a.casoId); continue; }
      const id = { tipo: a.tipo, qtdItens: a.qtdItens, codigo: a.codigo, descricao: a.descricao };
      if (e.versoes[a.casoId] !== a.versao) { excecoes.push({ casoId: a.casoId, motivo: 'O caso mudou depois da prévia. Refaça a prévia.', ...id }); continue; }
      try {
        const t0 = Date.now();
        await this.aprovar(a.casoId, { versao: a.versao, fundamento: e.fundamento }, usuario, { dataBase, liberada: true });
        msPorItem = Math.max(msPorItem, (Date.now() - t0) / Math.max(1, a.itens));
        aprovados++;
      } catch (err) {
        const msg = (err as { response?: { message?: string } }).response?.message ?? (err as Error).message;
        excecoes.push({ casoId: a.casoId, motivo: msg, ...id });
      }
    }
    return { aprovados, excecoes, restantes };
  }

  /**
   * Pedir informação ou rejeitar em lote, com o texto comum: só casos em aberto, na versão que a prévia mostrou (`versoes`). Cada caso na sua
   * transação (as mesmas garantias da decisão individual: versão, conflito 409, células e impactos); falha de um vira exceção e não derruba
   * os outros. Orçamento de tempo como o do aprovar: o que não coube volta em `restantes`.
   */
  async loteDecidir(projetoId: string, acao: 'rejeitar' | 'pedir', e: EntradaLoteDecisao, usuario?: Usuario) {
    const textoComum = texto(e.texto, 4000);
    if (!textoComum) throw new BadRequestException(acao === 'rejeitar' ? 'Rejeitar exige uma justificativa.' : 'Diga que informação falta.');
    if (!e.versoes || !Object.keys(e.versoes).length) throw new BadRequestException('Faça a prévia do lote antes e envie as versões que ela mostrou ("versoes").');
    const orcamento = orcamentoDoLote(e.orcamentoMs);
    const inicio = Date.now();
    const { casos, inexistentes } = await this.casosDoLote(projetoId, e);
    // A trava por fase vale para o lote inteiro (os casos da prévia): com camada da Fase 2 travada, nada é decidido.
    await this.projetos.exigirLiberadaPara(projetoId, [...new Set(casos.filter((c) => e.versoes![c.id] !== undefined).map((c) => c.camada))]);
    const itens = new Map<string, { trabalho: unknown }>();
    const primeiros = [...new Set(casos.map((c) => c.itens[0]).filter(Boolean))];
    for (const lote of fatiar(primeiros, 5000)) for (const i of await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId, id: { in: lote } }, select: { id: true, trabalho: true } })) itens.set(i.id, i);
    const excecoes: Excecao[] = inexistentes.map((casoId) => ({ casoId, motivo: 'Caso inexistente neste projeto.' }));
    const restantes: string[] = [];
    const dataBase = await this.projetos.dataBase(projetoId);
    let decididos = 0;
    for (const c of casos) {
      if (e.versoes[c.id] === undefined) continue; // fora da prévia: não faz parte deste lote
      const id = this.identificar(c, itens);
      if (!CASO_ABERTO.includes(c.situacao as SituacaoCaso)) { excecoes.push({ casoId: c.id, motivo: `O caso está ${SITUACAO_LEGIVEL[c.situacao] ?? c.situacao}, não em aberto.`, ...id }); continue; }
      if (e.versoes[c.id] !== c.versao) { excecoes.push({ casoId: c.id, motivo: 'O caso mudou depois da prévia. Refaça a prévia.', ...id }); continue; }
      if (decididos > 0 && Date.now() - inicio > orcamento) { restantes.push(c.id); continue; }
      try {
        if (acao === 'rejeitar') await this.rejeitar(c.id, { versao: c.versao, justificativa: textoComum }, usuario, { dataBase, liberada: true });
        else await this.pedirInformacao(c.id, { versao: c.versao, motivo: textoComum }, { dataBase, liberada: true });
        decididos++;
      } catch (err) {
        const msg = (err as { response?: { message?: string } }).response?.message ?? (err as Error).message;
        excecoes.push({ casoId: c.id, motivo: msg, ...id });
      }
    }
    return { decididos, excecoes, restantes };
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  /**
   * A trava por fase na decisão (docs/saneamento-fases.md, "Travas"): caso de FINALIDADE, NCM_CLASSIFICACAO ou TRIBUTARIO só é decidido
   * (aprovar, rejeitar, pedir informação, rascunho) com a Fase 1 liberada, o regime do cliente e as atividades confirmadas. Ler é livre.
   */
  private async exigirFaseLiberada(c: Pick<CasoLinha, 'projeto_id' | 'camada'>) {
    if (camadaTravada(c.camada)) await this.projetos.exigirLiberadaPara(c.projeto_id, c.camada);
  }

  private async carregar(tx: Tx, id: string): Promise<CasoLinha> {
    const c = await tx.sanCaso.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Caso não encontrado.');
    return c;
  }

  /** Células do caso. No conjunto, o item com exceção própria fica com a célula da exceção. */
  private async celulasDoCaso(tx: Tx, c: CasoLinha, situacao: SituacaoCaso, revisar: boolean) {
    const { itens } = await this.semExcecoes(tx, c);
    for (const lote of fatiar(itens, 5000)) {
      await tx.sanCelula.updateMany({
        where: { projeto_id: c.projeto_id, camada: c.camada, item_id: { in: lote } },
        data: { situacao: CELULA_DO_CASO[situacao], caso_id: c.id, revisar, ...(revisar ? {} : { revisar_causa: null }) },
      });
    }
  }

  private mapaExcecoes(db: Pick<Tx, 'sanCaso'>, projetoId: string, camada: string, campos?: string[]): Promise<Map<string, string>> {
    return mapaExcecoes(db, projetoId, camada, campos);
  }

  private semExcecoes<T extends Pick<CasoLinha, 'id' | 'projeto_id' | 'camada' | 'tipo' | 'itens'>>(db: Pick<Tx, 'sanCaso'>, c: T, mapa?: Map<string, string>): Promise<T> {
    return semExcecoes(db, c, mapa);
  }

  /**
   * Outro item do mesmo estabelecimento já usa o código? Vale a coluna da importação (código original, nunca reutilizado) e o código de
   * TRABALHO, que muda por decisão aprovada: os itens com código alterado são os que têm decisão no campo "codigo".
   */
  private async outroComCodigo(tx: Tx, projetoId: string, itemId: string, estabelecimento: string, novo: string): Promise<boolean> {
    if (await tx.sanItem.findFirst({ where: { projeto_id: projetoId, estabelecimento, codigo: novo, NOT: { id: itemId } }, select: { id: true } })) return true;
    const mudados = [...new Set((await tx.sanDecisao.findMany({ where: { projeto_id: projetoId, campo: 'codigo' }, select: { item_id: true } })).map((d) => d.item_id))].filter((i) => i !== itemId);
    for (const lote of fatiar(mudados, 1000)) {
      const itens = await tx.sanItem.findMany({ where: { projeto_id: projetoId, id: { in: lote }, estabelecimento }, select: { trabalho: true } });
      if (itens.some((i) => String((i.trabalho as Json)?.codigo ?? '') === novo)) return true;
    }
    return false;
  }

  /** Grava a proposta no trabalho dos itens do caso (uma decisão por campo; campo que não muda não gera linha). */
  private async aplicar(tx: Tx, c: CasoLinha, proposta: Json, fundamento: string, versoesItens: Record<string, number> | undefined, usuario?: Usuario) {
    const campos = Object.keys(proposta);
    const quemFez = quem(usuario);
    if ('codigo' in proposta) {
      if (c.itens.length > 1) throw bad('CODIGO_REPETIDO', 'Não dá para dar o mesmo código novo a mais de um item.');
      const novo = String(proposta.codigo);
      const item = await tx.sanItem.findFirst({ where: { id: c.itens[0], projeto_id: c.projeto_id }, select: { id: true, estabelecimento: true, trabalho: true } });
      const outro = item ? await this.outroComCodigo(tx, c.projeto_id, item.id, item.estabelecimento, novo) : false;
      if (outro) throw bad('CODIGO_JA_EXISTE', `O código ${novo} já pertence a outro item deste projeto.`);
    }
    // Consultas em bloco: um registro de aprovação por item e caso (a marca já gravada não se repete), decisões e grupos gravados por lote.
    const marca = `caso:${c.tipo}`;
    const jaMarcados = new Set((await tx.sanDecisao.findMany({ where: { caso_id: c.id, campo: marca, tipo: 'aprovar' }, select: { item_id: true } })).map((d) => d.item_id));
    for (const lote of fatiar(c.itens, BLOCO_APROVACAO)) {
      const itens = await tx.sanItem.findMany({ where: { id: { in: lote }, projeto_id: c.projeto_id } });
      const gravar: ItemGravado[] = [];
      if (itens.length !== lote.length) throw new BadRequestException('Algum item do caso não existe mais neste projeto.');
      const decisoesDoLote: Json[] = [];
      const porGrupo = new Map<string, string[]>();
      for (const item of itens) {
        if (versoesItens && versoesItens[item.id] !== undefined && versoesItens[item.id] !== item.versao) throw conflito(`O item ${item.codigo} foi alterado por outra pessoa depois que você abriu o caso. Recarregue.`);
        const trabalho = JSON.parse(JSON.stringify(item.trabalho)) as Json;
        const decs: Json[] = [];
        for (const campo of campos) {
          const antes = valorDoCampo(trabalho, campo);
          if (igual(antes, proposta[campo])) continue;
          aplicarCampo(trabalho, campo, proposta[campo]);
          decs.push({ projeto_id: c.projeto_id, item_id: item.id, caso_id: c.id, campo, antes: (antes ?? null) as never, depois: (proposta[campo] ?? null) as never, fundamento, usuario: quemFez, tipo: 'aprovar' });
        }
        if (!decs.length) {
          // Nada a mudar (alerta ou já igual): fica o registro da aprovação, uma vez por item e caso.
          if (!jaMarcados.has(item.id)) { jaMarcados.add(item.id); decisoesDoLote.push({ projeto_id: c.projeto_id, item_id: item.id, caso_id: c.id, campo: marca, depois: 'APROVADO', fundamento, usuario: quemFez, tipo: 'aprovar' }); }
          continue;
        }
        const d = derivadosDoTrabalho(trabalho);
        gravar.push({ id: item.id, codigo: item.codigo, versao: item.versao, trabalho, ...d });
        decisoesDoLote.push(...decs);
        const dc = decs.find((x) => x.campo === 'codigo');
        if (dc && dc.antes && dc.depois) await this.criarVinculo(tx, c, String(dc.antes), String(dc.depois), fundamento);
        if ('grupo' in proposta) { const g = d.grupo ?? ''; acrescentar(porGrupo, g, item.id); }
      }
      await gravarTrabalhoEmBloco(tx, gravar);
      if (decisoesDoLote.length) await tx.sanDecisao.createMany({ data: decisoesDoLote as never });
      for (const [grupo, ids] of porGrupo) await tx.sanCelula.updateMany({ where: { item_id: { in: ids } }, data: { grupo } });
    }
  }

  /** Vínculo código antigo → novo. Se outro caso já criou o mesmo vínculo, só acrescenta a etiqueta deste caso (o desfazer de um não apaga o do outro). */
  private async criarVinculo(tx: Tx, c: CasoLinha, de: string, para: string, fundamento: string) {
    if (de === para) return;
    const ja = await tx.sanVinculoCodigo.findFirst({ where: { projeto_id: c.projeto_id, de, para } });
    if (!ja) { await tx.sanVinculoCodigo.create({ data: { projeto_id: c.projeto_id, de, para, justificativa: `${etiqueta(c.id)} ${fundamento}`.slice(0, 2000), criado_por: 'sistema' } }); return; }
    if (!ja.justificativa.includes(etiqueta(c.id))) await tx.sanVinculoCodigo.update({ where: { id: ja.id }, data: { justificativa: `${etiqueta(c.id)}${ja.justificativa}`.slice(0, 2000) } });
  }

  private async removerVinculosDoCaso(tx: Tx, projetoId: string, casoId: string) {
    const tag = etiqueta(casoId);
    for (const v of await tx.sanVinculoCodigo.findMany({ where: { projeto_id: projetoId, justificativa: { contains: tag } } })) {
      const resto = v.justificativa.split(tag).join('');
      if (/\[caso:[^\]]+\]/.test(resto)) await tx.sanVinculoCodigo.update({ where: { id: v.id }, data: { justificativa: resto } });
      else await tx.sanVinculoCodigo.deleteMany({ where: { id: v.id } });
    }
  }

  /** Consolidação de duplicidade aprovada: guarda o vínculo código antigo → mantido (histórico e SPED). */
  private async vincularConsolidacao(tx: Tx, c: CasoLinha, proposta: Json, fundamento: string) {
    if (c.camada !== 'DUPLICIDADE' || proposta.decisao !== 'PROPOR_CONSOLIDACAO' || !proposta.manter || !proposta.consolidar) return;
    for (const de of String(proposta.consolidar).split('|').map((x) => x.trim()).filter(Boolean)) await this.criarVinculo(tx, c, de, String(proposta.manter), fundamento);
  }

  /** Dependências: as camadas citadas em `afeta` viram "revisar" nos itens do caso (a decisão anterior nelas fica intacta). */
  private async marcarDependencias(tx: Tx, c: CasoLinha, verbo = 'foi aprovado e muda dados que esta camada usa') {
    let afeta = ((c.afeta as string[]) ?? []).filter((x) => x !== c.camada);
    if (!afeta.length) return;
    const data = { revisar: true, revisar_causa: `Revisar: o caso "${c.tipo}" (${c.camada}) ${verbo.startsWith('foi aprovado') ? verbo : `${verbo} e muda dados que esta camada usa`}.` };
    // Inativação da Qualidade (sem movimentação) × Duplicidades: só importa para o item que está numa unificação aberta ou aprovada (o código
    // que fica não pode ser inativado). Item sem duplicata não ganha "revisar" na Duplicidade.
    if (c.camada === 'QUALIDADE' && afeta.includes('DUPLICIDADE')) {
      afeta = afeta.filter((x) => x !== 'DUPLICIDADE');
      const doCaso = new Set(c.itens);
      const comDup = new Set<string>();
      for (const d of await tx.sanCaso.findMany({ where: { projeto_id: c.projeto_id, camada: 'DUPLICIDADE', situacao: { in: ['PROPOSTO', 'RASCUNHO', 'AGUARDANDO_INFORMACAO', 'APROVADO'] } }, select: { itens: true } })) {
        for (const id of d.itens) if (doCaso.has(id)) comDup.add(id);
      }
      for (const lote of fatiar([...comDup], 5000)) await tx.sanCelula.updateMany({ where: { projeto_id: c.projeto_id, item_id: { in: lote }, camada: 'DUPLICIDADE', situacao: { not: 'PENDENTE' } }, data });
      if (!afeta.length) return;
    }
    await tx.sanCelula.updateMany({ where: { projeto_id: c.projeto_id, item_id: { in: c.itens }, camada: { in: afeta }, situacao: { not: 'PENDENTE' } }, data });
  }
}
