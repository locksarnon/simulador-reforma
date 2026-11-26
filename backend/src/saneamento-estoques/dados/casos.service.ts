import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogosFiscaisPrisma, classeVigente } from '../fiscal';
import { camadasAfetadas } from '../motor';
import { CAMADAS, type Camada, type CasoProposto, type ResultadoCamada } from '../tipos';
import { linhasDeImpactoDoCaso } from './ajustes';
import {
  CASO_ABERTO, CELULA_DO_CASO, TX_LONGA, aplicarCampo, camadasAtivas, chaveCaso, conflito, derivadosDoTrabalho, exigirVersao, fatiar, igual, propostaAplicavel, quem, validarCamada,
  valorDoCampo, type Json, type SituacaoCaso, type Usuario,
} from './constantes';
import type { ParecerIa } from './portas';
import { SanProjetoService } from './projeto.service';
import { paramInteiro, paramTexto, validarProposta, validarResultado } from './validacao';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
type CasoLinha = NonNullable<Awaited<ReturnType<PrismaService['sanCaso']['findUnique']>>>;

export type FiltroCasos = { camada?: string; situacao?: string; grupo?: string; tipo?: string; origem?: string; item_id?: string; cursor?: string; limite?: number | string };
export type EntradaAprovar = {
  versao?: number; proposta?: Json; fundamento?: string; justificativa?: string; versoesItens?: Record<string, number>;
  /** Aprova mesmo que o valor atual do item já não seja o da época da proposta. */
  confirmarDivergencia?: boolean;
  /** Confirma o fator de conversão sugerido pela descrição (situação CONFIRMAR). */
  confirmarFator?: boolean;
};
export type EntradaLote = { ids?: string[]; filtro?: { camada?: string; tipo?: string; origem?: string }; versoes?: Record<string, number>; fundamento?: string; orcamentoMs?: number };
type Excecao = { casoId: string; motivo: string };

const texto = (v: unknown, max: number) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const MAX_LOTE = 2000;
const ORCAMENTO_LOTE_MS = 60_000;
const bad = (codigo: string, message: string, extra: Json = {}) => new BadRequestException({ statusCode: 400, codigo, message, ...extra });
const ehCasoDeUnidade = (p: Json) => p.fatorSituacao !== undefined || p.unidadeCompra !== undefined;
const fatorValido = (p: Json) => p.fatorConversao != null && Number.isFinite(Number(p.fatorConversao)) && Number(p.fatorConversao) > 0;

/** Etiqueta de caso nas justificativas dos vínculos: vários casos podem usar o mesmo vínculo. */
const etiqueta = (id: string) => `[caso:${id}]`;

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
   * `completo` = a camada foi reexecutada inteira: os casos abertos que ela não produziu mais viram OBSOLETO.
   */
  async registrarResultado(projetoId: string, bruto: ResultadoCamada, opcoes: { completo?: boolean } = {}) {
    const p = await this.projetos.exigirConfirmadas(projetoId); // A TRAVA
    const r = validarResultado(bruto);
    const camada = validarCamada(r.camada);
    if (!camadasAtivas(p.modulos as Json).includes(camada)) throw new BadRequestException('Esta camada não está ligada neste projeto (módulo opcional desligado).');
    const casos = r.casos ?? [];
    const dataBase = await this.projetos.dataBase(projetoId);
    for (const c of casos) await this.validarExcecaoManual(c, dataBase);
    const ids = [...new Set([...casos.flatMap((c) => c.itens), ...(r.semProblema ?? [])])];
    let existem = 0;
    for (const lote of fatiar(ids, 5000)) existem += await this.prisma.sanItem.count({ where: { projeto_id: projetoId, id: { in: lote } } });
    if (existem !== ids.length) throw new BadRequestException('O resultado cita item que não existe neste projeto.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const chaves = casos.map((c) => chaveCaso(camada, c.tipo, c.itens));
        const ja = new Map<string, { id: string; situacao: string; versao: number }>();
        for (const lote of fatiar(chaves, 2000)) {
          for (const e of await tx.sanCaso.findMany({ where: { projeto_id: projetoId, camada, chave: { in: lote } }, select: { id: true, chave: true, situacao: true, versao: true } })) ja.set(e.chave, e);
        }
        const situacaoInicial = (c: CasoProposto) => (c.tipo.startsWith('AGUARDANDO') ? 'AGUARDANDO_INFORMACAO' : c.tipo === 'ENQUADRAMENTO_CONFERIDO' ? 'APROVADO' : 'PROPOSTO');
        const tocados = new Set<string>();
        const atualizados: unknown[] = [];

        // Obsolescência: a camada foi reexecutada e não produz mais estes casos (só os ainda sem edição; exceção manual nunca é obsoleta).
        const obsoletos: string[] = [];
        if (opcoes.completo) {
          const produzidas = new Set(chaves);
          const abertos = await tx.sanCaso.findMany({ where: { projeto_id: projetoId, camada, situacao: 'PROPOSTO' }, select: { id: true, chave: true, tipo: true } });
          for (const a of abertos) if (!produzidas.has(a.chave) && a.tipo !== 'EXCECAO_MANUAL') obsoletos.push(a.id);
          for (const lote of fatiar(obsoletos, 1000)) {
            await tx.sanCaso.updateMany({ where: { id: { in: lote }, situacao: 'PROPOSTO' }, data: { situacao: 'OBSOLETO', versao: { increment: 1 } } });
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
          if (!conferido && !manual && !reativar) continue;
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
        const pares: { item_id: string; caso_id: string; situacao: string }[] = [];
        casos.forEach((c, i) => {
          if (c.tipo === 'ENQUADRAMENTO_CONFERIDO') return;
          const e = ja.get(chaves[i])!;
          for (const item_id of c.itens) pares.push({ item_id, caso_id: e.id, situacao: CELULA_DO_CASO[e.situacao as SituacaoCaso] });
        });
        await this.marcarCelulas(tx, projetoId, camada, pares);

        // Sem problema: o que estava aprovado continua aprovado (só deixa de ser "revisar"); o resto vira "sem problema".
        let sem = 0;
        for (const lote of fatiar(r.semProblema ?? [], 5000)) {
          const base = { projeto_id: projetoId, camada, item_id: { in: lote } };
          await tx.sanCelula.updateMany({ where: { ...base, situacao: 'APROVADO' }, data: { revisar: false, revisar_causa: null } });
          const x = await tx.sanCelula.updateMany({ where: { ...base, situacao: { in: ['PENDENTE', 'PROPOSTO', 'SEM_PROBLEMA', 'AGUARDANDO_INFORMACAO'] } }, data: { situacao: 'SEM_PROBLEMA', caso_id: null, revisar: false, revisar_causa: null } });
          sem += x.count;
        }
        // Faltou dado: o que ainda está pendente na camada fica "aguardando informação" (o motivo vai no retorno).
        if (r.semDados) await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, camada, situacao: 'PENDENTE' }, data: { situacao: 'AGUARDANDO_INFORMACAO', revisar_causa: r.semDados.motivo.slice(0, 300) } });

        await this.sincronizarImpactos(tx, projetoId, [...tocados], dataBase);
        return {
          camada, analisados: r.analisados, casosNovos: unicos.length, casosJaExistentes: casos.length - novos.length - atualizados.length, semProblema: sem, semDados: r.semDados,
          casosAtualizados: atualizados, casosObsoletos: obsoletos.length,
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

  /** Regrava as linhas de impacto dos casos (apaga e recria as ligadas ao caso; caso que não gera ajuste fica sem linhas). Idempotente. */
  private async sincronizarImpactos(tx: Tx, projetoId: string, casoIds: string[], dataBase: string) {
    if (!casoIds.length) return;
    for (const lote of fatiar(casoIds, 500)) {
      const casos = await tx.sanCaso.findMany({ where: { projeto_id: projetoId, id: { in: lote } }, select: { id: true, projeto_id: true, camada: true, tipo: true, itens: true, justificativa: true, situacao: true, atual: true, proposta: true } });
      await tx.sanImpactoSped.deleteMany({ where: { projeto_id: projetoId, caso_id: { in: lote } } });
      const linhas = casos.flatMap((c) => linhasDeImpactoDoCaso(c, dataBase));
      for (const l of fatiar(linhas, 1000)) await tx.sanImpactoSped.createMany({ data: l as never });
    }
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
    if (camadaF) where.camada = validarCamada(camadaF);
    const sits = (situacaoF ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (sits.length) where.situacao = sits.length === 1 ? sits[0] : { in: sits };
    if (grupoF) {
      // Casos cujos itens estão no grupo: a célula guarda o caso e o grupo (índice projeto+grupo+camada).
      const cel = await this.prisma.sanCelula.findMany({
        where: { projeto_id: projetoId, grupo: grupoF === '(sem grupo)' ? '' : grupoF, caso_id: { not: null }, ...(camadaF ? { camada: validarCamada(camadaF) } : {}) },
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
    const pagina = linhas.slice(0, limite).map(({ itens, ...resto }) => ({ ...resto, qtdItens: itens.length, itens: itens.slice(0, 20) }));
    return { casos: pagina, proximo: linhas.length > limite ? linhas[limite].id : null };
  }

  async obter(id: string) {
    const c = await this.prisma.sanCaso.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Caso não encontrado.');
    return c;
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
    if (c.camada === 'OBRIGACOES' || c.tipo === 'CODIGO_ANTIGO' || proposta.decisao !== undefined || Object.keys(aplicavel).length) return;
    throw bad('SEM_PROPOSTA', 'Este caso não tem proposta aplicável: falta informação. Informe o valor (edite a proposta) ou rejeite o caso.');
  }

  /** Conversão de unidade só com fator numérico > 0; fator sugerido pela descrição exige confirmação. */
  private exigirFator(proposta: Json, confirmarFator?: boolean) {
    if (!ehCasoDeUnidade(proposta)) return;
    if (!fatorValido(proposta) || proposta.fatorSituacao === 'INFORMAR') throw bad('FATOR_AUSENTE', 'Informe o fator de conversão (número maior que zero) editando a proposta antes de aprovar.');
    if (proposta.fatorSituacao === 'CONFIRMAR' && !confirmarFator) throw bad('FATOR_A_CONFIRMAR', 'O fator foi tirado da descrição do item: confirme-o (confirmarFator) ou corrija-o na proposta.');
  }

  /** Campos da proposta cujo valor atual no item já não é o que o caso registrou em `atual`. */
  private async divergencias(tx: Tx, c: CasoLinha, aplicavel: Json) {
    const atual = (c.atual as Json) ?? {};
    const campos = Object.keys(aplicavel).filter((k) => k in atual);
    if (!campos.length) return [];
    const achadas: { campo: string; atual: unknown; esperado: unknown }[] = [];
    for (const lote of fatiar(c.itens, 500)) {
      for (const i of await tx.sanItem.findMany({ where: { id: { in: lote }, projeto_id: c.projeto_id }, select: { id: true, trabalho: true } })) {
        for (const k of campos) {
          const v = valorDoCampo(i.trabalho as Json, k);
          if (!igual(v, atual[k]) && !igual(v, aplicavel[k]) && !achadas.some((a) => a.campo === k)) achadas.push({ campo: k, atual: v, esperado: atual[k] });
        }
      }
    }
    return achadas;
  }

  /** Aprova e APLICA ao trabalho, gravando uma decisão por campo. Idempotente: caso já aprovado devolve o estado sem gravar de novo. */
  async aprovar(id: string, e: EntradaAprovar, usuario?: Usuario) {
    const editada = e.proposta !== undefined ? this.normalizarFator(validarProposta(e.proposta)) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const c = await this.carregar(tx, id);
      if (c.situacao === 'APROVADO') return { caso: c, jaAplicado: true };
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
      await this.celulasDoCaso(tx, novo, 'APROVADO', false);
      await this.marcarDependencias(tx, novo);
      await this.sincronizarImpactos(tx, c.projeto_id, [id], await this.projetos.dataBase(c.projeto_id));
      return { caso: novo, jaAplicado: false };
    }, TX_LONGA);
  }

  async rejeitar(id: string, e: { versao?: number; justificativa?: string }, usuario?: Usuario) {
    const justificativa = texto(e.justificativa, 4000);
    if (!justificativa) throw new BadRequestException('Rejeitar exige uma justificativa.');
    return this.prisma.$transaction(async (tx) => {
      const c = await this.carregar(tx, id);
      if (c.situacao === 'REJEITADO') return { caso: c, jaAplicado: true };
      const versao = exigirVersao(e.versao);
      if (c.versao !== versao) throw conflito();
      if (c.situacao === 'APROVADO') throw new BadRequestException('O caso já foi aprovado. Reabra (desfaça) antes de rejeitar.');
      const itens = await tx.sanItem.findMany({ where: { id: { in: c.itens } }, select: { id: true, trabalho: true } });
      const campos = Object.keys(propostaAplicavel(c.camada, c.proposta as Json));
      const rows = itens.flatMap((i) => (campos.length ? campos : [`caso:${c.tipo}`]).map((campo) => {
        const v = campo.startsWith('caso:') ? null : valorDoCampo(i.trabalho as Json, campo);
        return { projeto_id: c.projeto_id, item_id: i.id, caso_id: c.id, campo, antes: v as never, depois: v as never, fundamento: justificativa, usuario: quem(usuario), tipo: 'rejeitar' };
      }));
      for (const lote of fatiar(rows, 2000)) await tx.sanDecisao.createMany({ data: lote });
      const r = await tx.sanCaso.updateMany({ where: { id, versao }, data: { situacao: 'REJEITADO', motivo: justificativa, decidido_por: quem(usuario), decidido_em: new Date(), versao: { increment: 1 } } });
      if (r.count === 0) throw conflito();
      await this.celulasDoCaso(tx, c, 'REJEITADO', false);
      await this.sincronizarImpactos(tx, c.projeto_id, [id], await this.projetos.dataBase(c.projeto_id));
      return { caso: await tx.sanCaso.findUnique({ where: { id } }), jaAplicado: false };
    }, TX_LONGA);
  }

  async pedirInformacao(id: string, e: { versao?: number; motivo?: string }) {
    const motivo = texto(e.motivo, 4000);
    if (!motivo) throw new BadRequestException('Diga que informação falta.');
    const versao = exigirVersao(e.versao);
    return this.prisma.$transaction(async (tx) => {
      const c = await this.carregar(tx, id);
      if (!CASO_ABERTO.includes(c.situacao as SituacaoCaso)) throw new BadRequestException('Só dá para pedir informação de um caso em aberto.');
      const r = await tx.sanCaso.updateMany({ where: { id, versao }, data: { situacao: 'AGUARDANDO_INFORMACAO', motivo, versao: { increment: 1 } } });
      if (r.count === 0) throw conflito();
      await this.celulasDoCaso(tx, c, 'AGUARDANDO_INFORMACAO', false);
      await this.sincronizarImpactos(tx, c.projeto_id, [id], await this.projetos.dataBase(c.projeto_id));
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
        for (const d of aDesfazer) porItem.set(d.item_id, [...(porItem.get(d.item_id) ?? []), d]);
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
      return this.prisma.sanCaso.findMany({ where: { projeto_id: projetoId, id: { in: e.ids } } });
    }
    const f = e.filtro ?? {};
    if (!f.camada && !f.tipo && !f.origem) throw new BadRequestException('Escolha os casos do lote (lista de ids ou filtro por camada, tipo ou origem).');
    const where: Json = { projeto_id: projetoId, situacao: { in: CASO_ABERTO } };
    if (f.camada) where.camada = validarCamada(String(f.camada));
    if (f.tipo) where.tipo = String(f.tipo);
    if (f.origem) where.origem = String(f.origem);
    const achados = await this.prisma.sanCaso.findMany({ where: where as never, orderBy: { id: 'asc' }, take: MAX_LOTE + 1 });
    if (achados.length > MAX_LOTE) throw new BadRequestException(`O filtro traz mais de ${MAX_LOTE} casos. Restrinja por camada, tipo ou origem.`);
    return achados;
  }

  /** Prévia: mostra itens, campos afetados, vínculos a criar e as exceções (que ficam de fora). Não grava nada. */
  async lotePrevia(projetoId: string, e: EntradaLote) {
    const casos = await this.casosDoLote(projetoId, e);
    const itensIds = [...new Set(casos.flatMap((c) => c.itens))];
    const itens = new Map<string, { id: string; trabalho: unknown; versao: number }>();
    for (const lote of fatiar(itensIds, 5000)) for (const i of await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId, id: { in: lote } }, select: { id: true, trabalho: true, versao: true } })) itens.set(i.id, i);
    const excecoes: Excecao[] = [];
    const quemMuda = new Map<string, { valor: unknown; casoId: string }>();
    const aprovaveis: { casoId: string; versao: number; camada: string; tipo: string; itens: number; campos: string[]; vinculos: { de: string; para: string }[] }[] = [];
    const afetadosItens = new Set<string>();
    let camposAfetados = 0;
    for (const c of casos) {
      const completa = (c.proposta as Json) ?? {};
      const proposta = propostaAplicavel(c.camada, completa);
      const atual = (c.atual as Json) ?? {};
      let motivo: string | null = null;
      if (!CASO_ABERTO.includes(c.situacao as SituacaoCaso)) motivo = `O caso está "${c.situacao}", não em aberto.`;
      else if (c.tipo === 'DUPLICIDADE_COM_SALDO') motivo = 'Duplicidade com saldo ou movimentação: exige transferência de saldo e decisão individual.';
      else if (c.tipo.startsWith('AGUARDANDO')) motivo = 'Falta informação para decidir este caso.';
      else if (ehCasoDeUnidade(completa) && (!fatorValido(completa) || completa.fatorSituacao === 'INFORMAR')) motivo = 'Conversão de unidade sem fator: informe o fator editando o caso.';
      else if (ehCasoDeUnidade(completa) && completa.fatorSituacao === 'CONFIRMAR') motivo = 'O fator de conversão veio da descrição do item: confirme-o caso a caso.';
      else if ((c.parecer_ia as { confianca?: string } | null)?.confianca === 'baixa') motivo = 'O parecer da IA tem confiança baixa: decida este caso à parte.';
      else if (c.itens.some((i) => !itens.has(i))) motivo = 'Algum item do caso não existe mais.';
      else if (c.camada !== 'OBRIGACOES' && c.tipo !== 'CODIGO_ANTIGO' && completa.decisao === undefined && !Object.keys(proposta).length) motivo = 'Caso sem proposta aplicável: falta informação.';
      if (!motivo) {
        for (const campo of Object.keys(atual)) {
          if (!(campo in proposta)) continue;
          const dif = c.itens.find((i) => !igual(valorDoCampo(itens.get(i)!.trabalho as Json, campo), atual[campo]));
          if (dif) { motivo = `O valor de "${campo}" mudou desde que o caso foi proposto.`; break; }
        }
      }
      if (!motivo) {
        for (const campo of Object.keys(proposta)) {
          for (const i of c.itens) {
            const k = `${i}\u0000${campo}`;
            const outro = quemMuda.get(k);
            if (outro && !igual(outro.valor, proposta[campo])) { motivo = `Conflita com o caso ${outro.casoId} (mesmo item e campo, valores diferentes).`; break; }
          }
          if (motivo) break;
        }
      }
      if (motivo) { excecoes.push({ casoId: c.id, motivo }); continue; }
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
      aprovaveis.push({ casoId: c.id, versao: c.versao, camada: c.camada, tipo: c.tipo, itens: c.itens.length, campos: [...campos], vinculos });
    }
    return { casos: casos.length, aprovaveis, excecoes, itensAfetados: afetadosItens.size, camposAfetados, vinculosACriar: aprovaveis.reduce((s, a) => s + a.vinculos.length, 0) };
  }

  /**
   * Aprova só o que a prévia aceitou. Cada caso numa transação; falha de um (ex.: conflito) vira exceção e não derruba os outros.
   * Tem orçamento de tempo (60 s): o que não coube volta em `restantes` para uma nova chamada.
   */
  async loteAprovar(projetoId: string, e: EntradaLote, usuario?: Usuario) {
    if (!e.versoes || !Object.keys(e.versoes).length) throw new BadRequestException('Faça a prévia do lote antes de aprovar e envie as versões que ela mostrou ("versoes").');
    const previa = await this.lotePrevia(projetoId, e);
    const excecoes = [...previa.excecoes];
    const orcamento = Number.isFinite(e.orcamentoMs) ? Number(e.orcamentoMs) : ORCAMENTO_LOTE_MS;
    const inicio = Date.now();
    const restantes: string[] = [];
    let aprovados = 0;
    for (const a of previa.aprovaveis) {
      if (Date.now() - inicio > orcamento) { restantes.push(a.casoId); continue; }
      if (e.versoes[a.casoId] !== a.versao) { excecoes.push({ casoId: a.casoId, motivo: 'O caso mudou depois da prévia. Refaça a prévia.' }); continue; }
      try {
        await this.aprovar(a.casoId, { versao: a.versao, fundamento: e.fundamento }, usuario);
        aprovados++;
      } catch (err) {
        const msg = (err as { response?: { message?: string } }).response?.message ?? (err as Error).message;
        excecoes.push({ casoId: a.casoId, motivo: msg });
      }
    }
    return { aprovados, excecoes, restantes };
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  private async carregar(tx: Tx, id: string): Promise<CasoLinha> {
    const c = await tx.sanCaso.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Caso não encontrado.');
    return c;
  }

  private celulasDoCaso(tx: Tx, c: CasoLinha, situacao: SituacaoCaso, revisar: boolean) {
    return tx.sanCelula.updateMany({
      where: { projeto_id: c.projeto_id, camada: c.camada, item_id: { in: c.itens } },
      data: { situacao: CELULA_DO_CASO[situacao], caso_id: c.id, revisar, ...(revisar ? {} : { revisar_causa: null }) },
    });
  }

  /** Grava a proposta no trabalho dos itens do caso (uma decisão por campo; campo que não muda não gera linha). */
  private async aplicar(tx: Tx, c: CasoLinha, proposta: Json, fundamento: string, versoesItens: Record<string, number> | undefined, usuario?: Usuario) {
    const campos = Object.keys(proposta);
    const quemFez = quem(usuario);
    if ('codigo' in proposta) {
      if (c.itens.length > 1) throw bad('CODIGO_REPETIDO', 'Não dá para dar o mesmo código novo a mais de um item.');
      const novo = String(proposta.codigo);
      const item = await tx.sanItem.findFirst({ where: { id: c.itens[0], projeto_id: c.projeto_id }, select: { id: true, estabelecimento: true, trabalho: true } });
      const outro = item ? await tx.sanItem.findFirst({ where: { projeto_id: c.projeto_id, estabelecimento: item.estabelecimento, codigo: novo, NOT: { id: item.id } }, select: { id: true } }) : null;
      if (outro) throw bad('CODIGO_JA_EXISTE', `O código ${novo} já pertence a outro item deste projeto.`);
    }
    for (const lote of fatiar(c.itens, 200)) {
      const itens = await tx.sanItem.findMany({ where: { id: { in: lote }, projeto_id: c.projeto_id } });
      if (itens.length !== lote.length) throw new BadRequestException('Algum item do caso não existe mais neste projeto.');
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
          const marca = `caso:${c.tipo}`;
          const ja = await tx.sanDecisao.count({ where: { caso_id: c.id, item_id: item.id, campo: marca, tipo: 'aprovar' } });
          if (!ja) await tx.sanDecisao.create({ data: { projeto_id: c.projeto_id, item_id: item.id, caso_id: c.id, campo: marca, antes: undefined, depois: 'APROVADO' as never, fundamento, usuario: quemFez, tipo: 'aprovar' } });
          continue;
        }
        const d = derivadosDoTrabalho(trabalho);
        const r = await tx.sanItem.updateMany({ where: { id: item.id, versao: item.versao }, data: { trabalho: trabalho as never, ...d, versao: { increment: 1 } } });
        if (r.count === 0) throw conflito(`O item ${item.codigo} foi alterado por outra pessoa durante a aprovação. Recarregue.`);
        await tx.sanDecisao.createMany({ data: decs as never });
        const dc = decs.find((x) => x.campo === 'codigo');
        if (dc && dc.antes && dc.depois) await this.criarVinculo(tx, c, String(dc.antes), String(dc.depois), fundamento);
        if ('grupo' in proposta) await tx.sanCelula.updateMany({ where: { item_id: item.id }, data: { grupo: d.grupo ?? '' } });
      }
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
    const afeta = ((c.afeta as string[]) ?? []).filter((x) => x !== c.camada);
    if (!afeta.length) return;
    await tx.sanCelula.updateMany({
      where: { projeto_id: c.projeto_id, item_id: { in: c.itens }, camada: { in: afeta }, situacao: { not: 'PENDENTE' } },
      data: { revisar: true, revisar_causa: `Revisar: o caso "${c.tipo}" (${c.camada}) ${verbo.startsWith('foi aprovado') ? verbo : `${verbo} e muda dados que esta camada usa`}.` },
    });
  }
}
