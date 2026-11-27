import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TX_LONGA, camadaTravada, camadasAtivas, conflito, exigirVersao, fatiar, quem, type Usuario } from '../dados/constantes';
import { SanOrquestracaoService } from '../dados/orquestracao.service';
import { SanVersoesService } from '../dados/versoes.service';
import { lerFator } from '../motor';
import { dataIsoValida } from '../motor/texto';
import { CAMADAS, type Camada, type ItemTrabalho } from '../tipos';
import { abreviarAte, atributoPresente, componentePresente, descricaoPelaRegra, foraDoNcm, localizar, tipoMudaComAspecto } from './analise';
import { fecharEscopo } from './escopo';
import { validarRegraModelo } from './biblioteca.service';
import { abrangenciaVazia, abreviacoesNoSentidoCerto, canonico, conferirCoerencia, conteudoEfetivo, mesmoConteudo, texto, validarAbrangencia, validarAspecto, validarConteudo } from './conteudo-regra';
import { MODELOS, PROCEDIMENTOS } from './conteudo/biblioteca';
import { CONTROLES_INTERNOS } from './conteudo/controles-internos';
import { criteriosParaPolitica } from '../criterios/politica';
import {
  aplicacaoDoRascunho, comLinhasDoErp, conteudosDaBiblioteca, efetivoDaLinha, fotoDasDiretrizes, gruposDaBase, itensComGrupo, lerRegras, pendenteAplicar, regraApi, regrasDoProjeto,
  resolviveisAplicadas, situacaoDasDiretrizes, type Aplicacao, type LinhaRegra,
} from './dados';
import { carregarPerfil, nomeDoErp } from '../../erps/erps.service';
import { LIMITES_OFICIAIS } from './conteudo/limites-oficiais';
import { ID_BIBLIOTECA_LIMITES, converterParametros, limitesEfetivos, linhasDoErp } from './parametros';
import { chaveGrupo, criarIndice, gruposSemRegra, retirarSobreposicao, sobreposicoes, subgrupoDosCampos, type RegraResolvivel } from './resolucao';
import {
  CAMADAS_DO_ASPECTO, PREFIXO_ASPECTO, type Abrangencia, type Aspecto, type ConteudoRegra, type PreviaAplicacao, type Procedimento, type RegraAtributos, type RegraFiscal, type RegraLimites,
  type RegraNomes, type RegraUnidades,
} from './tipos';

type Json = Record<string, unknown>;
type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
const ehObjeto = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const corpo = (b: unknown): Json => (ehObjeto(b) ? b : {});
const bad = (codigo: string, message: string, extra: Json = {}) => new BadRequestException({ statusCode: 400, codigo, message, ...extra });
const MAX_EXEMPLOS = 20;
/** Teto de regras aplicadas numa só vez (um modelo da biblioteca tem dezenas). */
const MAX_REGRAS_JUNTAS = 200;
/** Ação gravada → ação que a tela mostra (o registro guarda a origem: criação manual, por modelo, por caso ou por conversão). */
const ACAO_TELA: Record<string, string> = {
  CRIAR: 'CRIOU', MODELO: 'CRIOU', TRANSFORMAR: 'CRIOU', CONVERTER: 'CRIOU', ALTERAR: 'ALTEROU', APLICAR: 'APLICOU', APROVAR: 'APROVOU', ADOTAR_VERSAO: 'ADOTOU', TRANSFERIR: 'TRANSFERIU',
};

/** Retrato da regra para o histórico (antes/depois). */
const retrato = (r: Partial<LinhaRegra>) => ({
  nome: r.nome, abrangencia: r.abrangencia, observacao: r.observacao ?? null, bibliotecaId: r.biblioteca_id ?? null, bibliotecaVersao: r.biblioteca_versao ?? null,
  alteracoes: r.alteracoes ?? null, situacao: r.situacao, revisar: r.revisar, aprovadaPor: r.aprovada_por ?? null, legado: r.legado,
});
const camadasDoAspecto = (a: Aspecto): Camada[] => CAMADAS_DO_ASPECTO[a].filter((c): c is Camada => (CAMADAS as readonly string[]).includes(c));
const rotuloAbrangencia = (a: Abrangencia) => (a.todos ? 'Todos os grupos' : a.grupos.length ? `${a.grupos.join(', ')}${a.subgrupos?.length ? ` (subgrupos: ${a.subgrupos.join(', ')})` : ''}` : 'nenhum grupo');

type Previa = PreviaAplicacao & {
  pendenteAplicar: boolean;
  transferencias: { regraId: string; codigo: string; abrangenciaDepois: Abrangencia | null }[];
  transferenciaManual: boolean;
};

/**
 * Diretrizes do Saneamento (docs/saneamento-diretrizes.md, seção 11): cabeçalho, regras do projeto (com histórico), aplicação com prévia e
 * reanálise só dos itens afetados, aprovação (um aprovador), adoção de versão nova da biblioteca, transformar caso em regra e os dados da
 * política. Concorrência otimista (`versao`, 409) em tudo que grava.
 */
@Injectable()
export class SanDiretrizesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orquestracao: SanOrquestracaoService,
    private readonly versoes: SanVersoesService,
  ) {}

  // ── Cabeçalho e conversão dos parâmetros antigos ────────────────────────────

  private async projeto(projetoId: string) {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { id: true, parametros: true, modulos: true, atividades_confirmadas_em: true, erp_id: true } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    return p;
  }

  /**
   * Garante o cabeçalho e, na primeira vez, converte os parâmetros antigos do projeto (limites, abreviações, política de unidades, caixa alta)
   * em regras "Todos os grupos" equivalentes, JÁ APLICADAS e marcadas como legado: a análise continua exatamente como antes.
   */
  async garantir(projetoId: string) {
    const ja = await this.prisma.sanDiretrizes.findUnique({ where: { projeto_id: projetoId } });
    if (ja) return ja;
    const p = await this.projeto(projetoId);
    // Linhas de limite padrão: leiaute oficial (biblioteca, ou a lista oficial se a carga ainda não rodou) + ERP do projeto (Cadastro de ERPs).
    const libLimites = await this.prisma.sanDiretrizBiblioteca.findUnique({ where: { id: ID_BIBLIOTECA_LIMITES } });
    const oficiais = libLimites?.ativa ? ((libLimites.conteudo as RegraLimites).linhas ?? []) : LIMITES_OFICIAIS;
    const doErp = linhasDoErp(await carregarPerfil(this.prisma, p.erp_id));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cab = await tx.sanDiretrizes.create({ data: { projeto_id: projetoId, convertido_em: new Date() } });
        const seq: Partial<Record<Aspecto, number>> = {};
        const convertidas = converterParametros(((p.parametros as Json | null)?.motor ?? null) as never, [...oficiais, ...doErp]);
        for (const c of convertidas) {
          const conteudo = conteudoEfetivo(c.aspecto, null, c.alteracoes as Partial<ConteudoRegra>);
          seq[c.aspecto] = (seq[c.aspecto] ?? 0) + 1;
          const aplicacao: Aplicacao = { abrangencia: { todos: true }, conteudo, legado: true, parametrosLegados: c.parametrosLegados };
          const r = await tx.sanDiretrizRegra.create({
            data: {
              projeto_id: projetoId, aspecto: c.aspecto, codigo: `${PREFIXO_ASPECTO[c.aspecto]}${String(seq[c.aspecto]).padStart(2, '0')}`, nome: c.nome, abrangencia: { todos: true },
              observacao: c.observacao, alteracoes: c.alteracoes as never, legado: true, parametros_legados: c.parametrosLegados as never, aplicacao: aplicacao as never,
              aplicada_em: new Date(), aplicada_por: 'sistema', criada_por: 'sistema',
            },
          });
          await this.registrar(tx, r, 'CONVERTER', undefined, null, retrato(r), 'Parâmetros do projeto convertidos em regra equivalente (resultado das análises inalterado).');
        }
        // Sem limite antigo: regra padrão de LIMITES "Todos os grupos" com as linhas oficiais e as do ERP, em RASCUNHO e NÃO aplicada (a análise
        // só muda quando o consultor aplicar). Vale o menor limite confirmado; ERP acima do leiaute vira alerta. A regra APONTA para a regra-modelo
        // dos limites oficiais e as linhas do ERP são derivadas na resolução (dados.ts, comLinhasDoErp): nada é copiado. Só sem a carga da
        // biblioteca (ainda não rodou) as linhas vão como cópia, para a regra não nascer vazia.
        if (!convertidas.some((c) => c.aspecto === 'LIMITES')) {
          const r = await tx.sanDiretrizRegra.create({
            data: {
              projeto_id: projetoId, aspecto: 'LIMITES', codigo: `${PREFIXO_ASPECTO.LIMITES}01`, nome: 'Limites de caracteres (leiaute oficial e ERP)', abrangencia: { todos: true },
              observacao: 'Regra padrão: leiaute oficial é o teto; o ERP e o cliente só restringem mais. Vale o menor limite confirmado.',
              biblioteca_id: libLimites?.ativa ? libLimites.id : null, biblioteca_versao: libLimites?.ativa ? libLimites.versao : null,
              alteracoes: (libLimites?.ativa ? undefined : { linhas: [...oficiais, ...doErp] }) as never, criada_por: 'sistema',
            },
          });
          await this.registrar(tx, r, 'CRIAR', undefined, null, retrato(r), 'Regra padrão de limites criada na abertura das Diretrizes (rascunho, não aplicada).');
        }
        return cab;
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return this.prisma.sanDiretrizes.findUnique({ where: { projeto_id: projetoId } });
      throw e;
    }
  }

  async obter(projetoId: string) {
    await this.garantir(projetoId);
    const cab = await this.prisma.sanDiretrizes.findUnique({ where: { projeto_id: projetoId } });
    const { regras } = await regrasDoProjeto(this.prisma, projetoId);
    const grupos = gruposDaBase(await itensComGrupo(this.prisma, projetoId));
    const s = situacaoDasDiretrizes(regras);
    return {
      cabecalho: { vigencia: cab?.vigencia ?? null, situacao: s.situacao, revisar: s.revisar, versao: cab?.versao ?? 1, convertidoEm: cab?.convertido_em ?? null },
      regras,
      grupos,
      gruposSemRegra: gruposSemRegra(grupos.map((g) => g.grupo), regras.filter((r) => r.ativa)),
      atualizacoesBiblioteca: regras.filter((r) => r.bibliotecaId && r.bibliotecaVersaoAtual != null && r.bibliotecaVersaoAtual > (r.bibliotecaVersao ?? 0)).map((r) => ({ regraId: r.id, versaoNova: r.bibliotecaVersaoAtual as number })),
    };
  }

  async atualizarCabecalho(projetoId: string, b: unknown) {
    const e = corpo(b);
    const versao = exigirVersao(e.versao);
    let vigencia: string | null | undefined;
    if (e.vigencia !== undefined) {
      vigencia = e.vigencia === null || e.vigencia === '' ? null : String(e.vigencia);
      if (vigencia !== null && !dataIsoValida(vigencia)) throw bad('VIGENCIA_INVALIDA', 'A vigência deve ser uma data (aaaa-mm-dd).');
    }
    await this.garantir(projetoId);
    const x = await this.prisma.sanDiretrizes.updateMany({ where: { projeto_id: projetoId, versao }, data: { ...(vigencia !== undefined ? { vigencia } : {}), versao: { increment: 1 } } });
    if (x.count === 0) throw conflito();
    const cab = await this.prisma.sanDiretrizes.findUnique({ where: { projeto_id: projetoId } });
    return { id: cab!.id, vigencia: cab!.vigencia, versao: cab!.versao };
  }

  // ── Regras ─────────────────────────────────────────────────────────────────

  private async registrar(tx: Tx, r: { id: string; projeto_id: string }, acao: string, usuario: Usuario, antes: unknown, depois: unknown, detalhe?: string) {
    await tx.sanDiretrizHistorico.create({ data: { projeto_id: r.projeto_id, regra_id: r.id, acao, usuario: quem(usuario), antes: (antes ?? undefined) as never, depois: (depois ?? undefined) as never, detalhe: detalhe?.slice(0, 2000) ?? null } });
  }

  private async proximoCodigo(tx: Tx, projetoId: string, aspecto: Aspecto) {
    const prefixo = PREFIXO_ASPECTO[aspecto];
    const ja = await tx.sanDiretrizRegra.findMany({ where: { projeto_id: projetoId, codigo: { startsWith: prefixo } }, select: { codigo: true } });
    const n = ja.reduce((m, r) => Math.max(m, /^\D+(\d+)$/.test(r.codigo) ? Number(r.codigo.replace(/^\D+/, '')) : 0), 0) + 1;
    return `${prefixo}${String(n).padStart(2, '0')}`;
  }

  private async carregar(regraId: string): Promise<LinhaRegra> {
    const r = await this.prisma.sanDiretrizRegra.findUnique({ where: { id: regraId } });
    if (!r) throw new NotFoundException('Regra não encontrada.');
    return r as LinhaRegra;
  }

  private async apiDe(regraId: string) {
    const r = await this.carregar(regraId);
    const bib = await conteudosDaBiblioteca(this.prisma, r.biblioteca_id ? [{ id: r.biblioteca_id, versao: r.biblioteca_versao }] : [], r.projeto_id);
    return regraApi(r, bib);
  }

  /** Base da biblioteca para uma regra nova (versão atual). */
  private async bibliotecaPara(tx: Tx, bibliotecaId: unknown, aspecto: Aspecto) {
    if (bibliotecaId == null || bibliotecaId === '') return null;
    const lib = await tx.sanDiretrizBiblioteca.findUnique({ where: { id: String(bibliotecaId) } });
    if (!lib) throw bad('BIBLIOTECA_INEXISTENTE', 'Regra da biblioteca não encontrada.');
    if (lib.aspecto !== aspecto) throw bad('ASPECTO_DIFERENTE', 'A regra da biblioteca é de outro aspecto.');
    if (!lib.ativa) throw bad('BIBLIOTECA_INATIVA', 'Esta regra da biblioteca está desativada.');
    return lib;
  }

  /** Conteúdo efetivo completo e coerente (400 claro). */
  private efetivoValido(aspecto: Aspecto, base: ConteudoRegra | null, alteracoes: Partial<ConteudoRegra> | null) {
    const efetivo = conteudoEfetivo(aspecto, base, alteracoes);
    validarConteudo(aspecto, efetivo, false);
    conferirCoerencia(efetivo);
    return efetivo;
  }

  private async criarNaTransacao(tx: Tx, projetoId: string, e: Json, usuario: Usuario, acao: 'CRIAR' | 'MODELO' | 'TRANSFORMAR', detalhe?: string) {
    const aspecto = validarAspecto(e.aspecto);
    const nome = texto(e.nome, 'o nome da regra', 160) as string;
    const abrangencia = validarAbrangencia(e.abrangencia);
    const observacao = texto(e.observacao, 'Observação', 2000, true);
    const lib = await this.bibliotecaPara(tx, e.bibliotecaId, aspecto);
    const alteracoes = e.alteracoes == null ? null : (validarConteudo(aspecto, e.alteracoes, true) as Partial<ConteudoRegra>);
    this.efetivoValido(aspecto, (lib?.conteudo as ConteudoRegra | undefined) ?? null, alteracoes);
    const r = await tx.sanDiretrizRegra.create({
      data: {
        projeto_id: projetoId, aspecto, codigo: await this.proximoCodigo(tx, projetoId, aspecto), nome, abrangencia: abrangencia as never, observacao,
        biblioteca_id: lib?.id ?? null, biblioteca_versao: lib?.versao ?? null, alteracoes: (alteracoes ?? undefined) as never, criada_por: quem(usuario),
      },
    });
    await this.registrar(tx, r, acao, usuario, null, retrato(r), detalhe);
    return r as LinhaRegra;
  }

  async criarRegra(projetoId: string, b: unknown, usuario: Usuario) {
    await this.garantir(projetoId);
    try {
      const r = await this.prisma.$transaction((tx) => this.criarNaTransacao(tx, projetoId, corpo(b), usuario, 'CRIAR'));
      return this.apiDe(r.id);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw conflito('Outra pessoa criou uma regra ao mesmo tempo. Tente de novo.');
      throw e;
    }
  }

  /** Cria as regras do modelo em rascunho, sem duplicar (mesma regra da biblioteca com a mesma abrangência já existente fica como está). */
  async aplicarModelo(projetoId: string, b: unknown, usuario: Usuario) {
    const e = corpo(b);
    const modelo = MODELOS.find((m) => m.id === e.modeloId);
    if (!modelo) throw new NotFoundException('Modelo de diretrizes não encontrado.');
    await this.garantir(projetoId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const linhas = (await tx.sanDiretrizRegra.findMany({ where: { projeto_id: projetoId } })) as LinhaRegra[];
        const criadas: string[] = []; const jaExistentes: string[] = []; const faltando: string[] = [];
        for (const at of modelo.atribuicoes) {
          const abrangencia: Abrangencia = at.grupos === 'TODOS' ? { todos: true } : validarAbrangencia({ todos: false, grupos: at.grupos });
          const ja = linhas.find((l) => l.biblioteca_id === at.bibliotecaId && canonico(l.abrangencia) === canonico(abrangencia));
          if (ja) { jaExistentes.push(ja.codigo); continue; }
          const lib = await tx.sanDiretrizBiblioteca.findUnique({ where: { id: at.bibliotecaId } });
          if (!lib || !lib.ativa || lib.aspecto !== at.aspecto) { faltando.push(at.bibliotecaId); continue; }
          const r = await this.criarNaTransacao(tx, projetoId, { aspecto: at.aspecto, nome: lib.nome, abrangencia, bibliotecaId: lib.id }, usuario, 'MODELO', `Modelo: ${modelo.nome}`);
          linhas.push(r); criadas.push(r.codigo);
        }
        // Formato da tela: quantidades em `criadas` e `jaExistiam`; os códigos vêm nas listas ao lado.
        return { modeloId: modelo.id, criadas: criadas.length, jaExistiam: jaExistentes.length, codigosCriados: criadas, codigosJaExistentes: jaExistentes, faltando };
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw conflito('Outra pessoa criou regras ao mesmo tempo. Tente de novo.');
      throw err;
    }
  }

  /** Itens cuja regra efetiva (APLICADA) do aspecto é esta regra. */
  private async itensDaRegraAplicada(projetoId: string, r: LinhaRegra, linhas?: LinhaRegra[]): Promise<string[]> {
    if (!r.aplicacao) return [];
    const idx = criarIndice(resolviveisAplicadas(linhas ?? (await lerRegras(this.prisma, projetoId))));
    const aspecto = r.aspecto as Aspecto;
    return (await itensComGrupo(this.prisma, projetoId)).filter((i) => idx.resolver(i.grupo, i.subgrupo)[aspecto]?.id === r.id).map((i) => i.id);
  }

  /** Marca "revisar" nas células (já trabalhadas) das camadas do aspecto, para os itens dados. Mesmo mecanismo das dependências entre camadas. */
  private async marcarRevisar(tx: Tx, projetoId: string, itens: string[], aspecto: Aspecto, causa: string) {
    let n = 0;
    for (const lote of fatiar(itens, 5000)) {
      const x = await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, camada: { in: camadasDoAspecto(aspecto) }, item_id: { in: lote }, situacao: { not: 'PENDENTE' } }, data: { revisar: true, revisar_causa: causa.slice(0, 300) } });
      n += x.count;
    }
    return n;
  }

  /** Mudança em regra APROVADA: a aprovação cai, a regra fica "revisar" e as conclusões dependentes também (decisões e versões ficam). */
  private quedaDeAprovacao(r: LinhaRegra, motivo: string) {
    if (r.situacao !== 'APROVADA') return {};
    return { situacao: 'RASCUNHO', aprovada_por: null, aprovada_em: null, revisar: true, revisar_causa: motivo };
  }

  async atualizarRegra(regraId: string, b: unknown, usuario: Usuario) {
    const e = corpo(b);
    const versao = exigirVersao(e.versao);
    const r = await this.carregar(regraId);
    if (r.versao !== versao) throw conflito();
    const aspecto = r.aspecto as Aspecto;
    const novo: Json = {};
    if (e.nome !== undefined) novo.nome = texto(e.nome, 'o nome da regra', 160);
    if (e.observacao !== undefined) novo.observacao = texto(e.observacao, 'Observação', 2000, true);
    if (e.abrangencia !== undefined) novo.abrangencia = validarAbrangencia(e.abrangencia);
    if (e.alteracoes !== undefined) novo.alteracoes = e.alteracoes === null ? null : validarConteudo(aspecto, e.alteracoes, true);
    const mudou = Object.keys(novo).filter((k) => canonico(novo[k]) !== canonico((r as unknown as Json)[k] ?? null));
    if (!mudou.length) return this.apiDe(regraId);
    const bib = await conteudosDaBiblioteca(this.prisma, r.biblioteca_id ? [{ id: r.biblioteca_id, versao: r.biblioteca_versao }] : [], r.projeto_id);
    const baseLib = r.biblioteca_id ? efetivoDaLinha({ ...r, alteracoes: null, legado: false }, bib) : null;
    // Alterações que não mudam o CONTEÚDO EFETIVO (a tela mandou o conteúdo inteiro, igual ao de hoje) não contam: nada se grava delas e a
    // regra convertida continua legado (o motor segue com os parâmetros antigos, resultado idêntico).
    if (mudou.includes('alteracoes') && mesmoConteudo(aspecto, efetivoDaLinha(r, bib), conteudoEfetivo(aspecto, baseLib, novo.alteracoes as Partial<ConteudoRegra> | null))) mudou.splice(mudou.indexOf('alteracoes'), 1);
    if (!mudou.length) return this.apiDe(regraId);
    const alteracoes = (mudou.includes('alteracoes') ? novo.alteracoes : r.alteracoes) as Partial<ConteudoRegra> | null;
    this.efetivoValido(aspecto, baseLib, alteracoes);
    // Só o conteúdo tira o legado: nome, observação e abrangência não mudam o que a regra manda (a regra convertida, com outra abrangência,
    // continua aplicando os parâmetros antigos aos grupos que cobre).
    const conteudoMudou = mudou.includes('alteracoes');
    const queda = this.quedaDeAprovacao(r, `A regra ${r.codigo} foi alterada depois de aprovada: aplicar, revisar os achados e aprovar de novo.`);
    const itens = r.situacao === 'APROVADA' ? await this.itensDaRegraAplicada(r.projeto_id, r) : [];
    const data: Json = {
      ...Object.fromEntries(mudou.map((k) => [k, k === 'alteracoes' && novo[k] === null ? null : novo[k]])),
      ...(conteudoMudou ? { legado: false, parametros_legados: null } : {}), ...queda, versao: versao + 1,
    };
    await this.prisma.$transaction(async (tx) => {
      const x = await tx.sanDiretrizRegra.updateMany({ where: { id: regraId, versao }, data: data as never });
      if (x.count === 0) throw conflito();
      const depois = await tx.sanDiretrizRegra.findUnique({ where: { id: regraId } });
      const marcadas = itens.length ? await this.marcarRevisar(tx, r.projeto_id, itens, aspecto, `Revisar: a regra ${r.codigo} (${r.nome}) foi alterada depois de aprovada.`) : 0;
      await this.registrar(tx, r, 'ALTERAR', usuario, retrato(r), retrato(depois!), r.situacao === 'APROVADA' ? `Aprovação retirada; ${marcadas} célula(s) marcadas para revisar.` : undefined);
    }, TX_LONGA);
    return this.apiDe(regraId);
  }

  /** Prévia de "Aplicar e reanalisar": grupos e itens afetados, sobreposições que bloqueiam e camadas que serão reexecutadas. Só lê. */
  private async calcularPrevia(r: LinhaRegra, db: Tx | PrismaService = this.prisma, cache: { todos?: Awaited<ReturnType<typeof itensComGrupo>> } = {}): Promise<{ previa: Previa; afetados: string[]; linhas: LinhaRegra[]; conteudo: ConteudoRegra }> {
    const { linhas, bib } = await regrasDoProjeto(db, r.projeto_id);
    const atual = linhas.find((l) => l.id === r.id) ?? r;
    const conteudo = efetivoDaLinha(atual, bib);
    const aspecto = atual.aspecto as Aspecto;
    const abr = atual.abrangencia as Abrangencia;
    const comAbr = (l: LinhaRegra) => ({ id: l.id, codigo: l.codigo, aspecto: l.aspecto as Aspecto, abrangencia: l.abrangencia as Abrangencia });
    const sobre = abrangenciaVazia(abr) ? [] : sobreposicoes(comAbr(atual), linhas.map(comAbr));
    const transferencias: Previa['transferencias'] = [];
    let transferenciaManual = false;
    const depois = new Map<string, LinhaRegra>();
    for (const id of [...new Set(sobre.map((s) => s.regraId))]) {
      const o = linhas.find((l) => l.id === id)!;
      const nova = retirarSobreposicao(o.abrangencia as Abrangencia, abr);
      const aplicada = o.aplicacao ? retirarSobreposicao((o.aplicacao as Aplicacao).abrangencia, abr) : null;
      if (!nova || (o.aplicacao && !aplicada)) transferenciaManual = true;
      transferencias.push({ regraId: o.id, codigo: o.codigo, abrangenciaDepois: nova });
      depois.set(o.id, { ...o, abrangencia: nova ?? o.abrangencia, aplicacao: o.aplicacao ? { ...(o.aplicacao as Aplicacao), abrangencia: aplicada ?? (o.aplicacao as Aplicacao).abrangencia } : null });
    }
    depois.set(atual.id, { ...atual, aplicacao: aplicacaoDoRascunho(atual, conteudo) });
    const antesIdx = criarIndice(resolviveisAplicadas(linhas));
    const depoisIdx = criarIndice(resolviveisAplicadas(linhas.map((l) => depois.get(l.id) ?? l)));
    const todos = (cache.todos ??= await itensComGrupo(db, r.projeto_id));
    const diretos: string[] = [];
    for (const i of todos) {
      const a = antesIdx.resolver(i.grupo, i.subgrupo)[aspecto]?.id; const d = depoisIdx.resolver(i.grupo, i.subgrupo)[aspecto]?.id;
      if (a !== d || a === atual.id || d === atual.id) diretos.push(i.id);
    }
    // Itens que podem mudar = os da regra + os que dividem com eles um caso aberto de conjunto que a regra mexe (o conjunto se refaz sem os
    // itens que saem). Caso de outro aspecto (ex.: unidade, numa regra de nomes) não muda e não entra.
    const conjuntos = diretos.length
      ? (await db.sanCaso.findMany({ where: { projeto_id: r.projeto_id, camada: { in: camadasDoAspecto(aspecto) }, situacao: 'PROPOSTO' }, select: { camada: true, tipo: true, itens: true } }))
        .filter((c: { camada: string; tipo: string; itens: string[] }) => c.itens.length > 1 && tipoMudaComAspecto(aspecto, c.camada, c.tipo))
      : [];
    const fechado = fecharEscopo(diretos, [], conjuntos);
    const afetados: string[] = []; const grupos = new Set<string>();
    for (const i of todos) if (fechado.has(i.id)) { afetados.push(i.id); grupos.add(i.grupo); }
    return {
      previa: {
        regraId: atual.id, grupos: [...grupos].sort(), itens: afetados.length, sobreposicoes: sobre.map(({ grupo, regraAtual }) => ({ grupo, regraAtual })), camadas: CAMADAS_DO_ASPECTO[aspecto],
        pendenteAplicar: pendenteAplicar(atual, conteudo), transferencias, transferenciaManual,
      },
      afetados, linhas, conteudo,
    };
  }

  async previa(regraId: string) {
    return (await this.calcularPrevia(await this.carregar(regraId))).previa;
  }

  /**
   * Reexecuta só os itens afetados (orquestração existente, com escopo), uma vez por camada: `porCamada` junta os itens de todas as regras
   * aplicadas juntas. Falha de uma camada não desfaz a aplicação: vem no retorno.
   */
  private async reanalisarCamadas(projetoId: string, porCamada: Map<Camada, Set<string>>, total: number) {
    if (!total) return { itens: 0, camadas: [], aviso: 'Nenhum item afetado: nada a reanalisar.' };
    const p = await this.projeto(projetoId);
    const disponiveis = this.orquestracao.camadasDisponiveis();
    const ativas = camadasAtivas(p.modulos as Json);
    const out: Json[] = [];
    // Trava por fase: só as camadas da Fase 2 ficam de fora enquanto a fase estiver travada (a regra vale na próxima análise delas).
    let bloqueio: { codigo: string; mensagem: string } | null | undefined;
    const puladas: string[] = [];
    for (const camada of CAMADAS.filter((c) => porCamada.get(c)?.size)) {
      if (!disponiveis.includes(camada) || !ativas.includes(camada)) { out.push({ camada, executada: false, motivo: 'Camada sem análise conectada ou desligada neste projeto.' }); continue; }
      if (camadaTravada(camada)) {
        if (bloqueio === undefined) bloqueio = await this.orquestracao.bloqueioDaFase2(projetoId);
        if (bloqueio) { out.push({ camada, executada: false, codigo: bloqueio.codigo, motivo: bloqueio.mensagem }); puladas.push(camada); continue; }
      }
      try {
        const g = await this.orquestracao.executarCamada(projetoId, camada, { escopo: porCamada.get(camada) });
        out.push({ camada, executada: true, casosNovos: g.casosNovos, casosObsoletos: g.casosObsoletos, semProblema: g.semProblema, semDados: g.semDados ?? null });
      } catch (e) {
        out.push({ camada, executada: false, motivo: (e as Error).message });
      }
    }
    if (puladas.length && bloqueio) return { itens: total, camadas: out, aviso: `${bloqueio.mensagem} A regra está aplicada e vale na próxima análise de ${puladas.join(', ')}.` };
    return { itens: total, camadas: out };
  }

  /** Reexecuta só os itens afetados nas camadas do aspecto. */
  private async reanalisar(projetoId: string, aspecto: Aspecto, itens: string[]) {
    return this.reanalisarCamadas(projetoId, new Map(camadasDoAspecto(aspecto).map((c) => [c, new Set(itens)])), itens.length);
  }

  /** Sobreposição sem a transferência confirmada (409) e transferência que exige ajuste manual (409). */
  private exigirTransferencia(r: LinhaRegra, previa: Previa, confirmada: boolean) {
    if (previa.sobreposicoes.length && !confirmada) {
      throw new ConflictException({
        statusCode: 409, codigo: 'SOBREPOSICAO', sobreposicoes: previa.sobreposicoes, transferencias: previa.transferencias,
        message: `Já há regra de ${r.aspecto} para: ${previa.sobreposicoes.map((s) => `${s.grupo} (${s.regraAtual})`).join('; ')}. Confirme a transferência (o histórico fica) ou ajuste a abrangência.`,
      });
    }
    if (previa.transferenciaManual) throw new ConflictException({ statusCode: 409, codigo: 'TRANSFERENCIA_MANUAL', message: 'A transferência deixaria a outra regra com grupos e subgrupos que não se combinam: ajuste a abrangência dela à mão.' });
  }

  /** Grava a aplicação da regra (e as transferências confirmadas), com o histórico, dentro da transação de quem chama. */
  private async gravarAplicacao(tx: Tx, r: LinhaRegra, calc: { previa: Previa; afetados: string[]; linhas: LinhaRegra[]; conteudo: ConteudoRegra }, usuario: Usuario, agora: Date) {
    const { previa, afetados, linhas, conteudo } = calc;
    const x = await tx.sanDiretrizRegra.updateMany({ where: { id: r.id, versao: r.versao }, data: { aplicacao: aplicacaoDoRascunho(r, conteudo) as never, aplicada_em: agora, aplicada_por: quem(usuario), versao: r.versao + 1 } });
    if (x.count === 0) throw conflito();
    for (const t of previa.transferencias) {
      const o = linhas.find((l) => l.id === t.regraId)!;
      const aplicacao = o.aplicacao ? { ...(o.aplicacao as Aplicacao), abrangencia: retirarSobreposicao((o.aplicacao as Aplicacao).abrangencia, r.abrangencia as Abrangencia) } : null;
      // A abrangência da regra aprovada mudou: a aprovação cai (volta a rascunho com "revisar") e precisa ser refeita.
      const queda = this.quedaDeAprovacao(o, `A regra ${o.codigo} perdeu grupos para a regra ${r.codigo}: confira a abrangência e aprove de novo.`);
      const y = await tx.sanDiretrizRegra.updateMany({ where: { id: o.id, versao: o.versao }, data: { abrangencia: t.abrangenciaDepois as never, aplicacao: (aplicacao ?? undefined) as never, ...queda, versao: o.versao + 1 } as never });
      if (y.count === 0) throw conflito('Outra regra envolvida na transferência foi alterada ao mesmo tempo. Recarregue e tente de novo.');
      await this.registrar(tx, o, 'TRANSFERIR', usuario, { abrangencia: o.abrangencia, situacao: o.situacao }, { abrangencia: t.abrangenciaDepois, ...(o.situacao === 'APROVADA' ? { situacao: 'RASCUNHO', revisar: true } : {}) },
        `Transferido para a regra ${r.codigo}: ${previa.sobreposicoes.filter((s) => s.regraAtual === o.codigo).map((s) => s.grupo).join(', ')}.${o.situacao === 'APROVADA' ? ' Aprovação retirada: a abrangência mudou.' : ''}`);
    }
    await this.registrar(tx, r, 'APLICAR', usuario, { aplicacao: r.aplicacao ?? null }, { aplicacao: aplicacaoDoRascunho(r, conteudo) },
      `Aplicada a ${rotuloAbrangencia(r.abrangencia as Abrangencia)}: ${afetados.length} item(ns) em ${previa.grupos.length} grupo(s); camadas ${previa.camadas.join(', ')}.`);
  }

  async aplicar(regraId: string, b: unknown, usuario: Usuario) {
    const e = corpo(b);
    const versao = exigirVersao(e.versao);
    const r = await this.carregar(regraId);
    if (r.versao !== versao) throw conflito();
    if (abrangenciaVazia(r.abrangencia as Abrangencia)) throw bad('REGRA_SEM_GRUPOS', 'A regra não cobre nenhum grupo: escolha os grupos (ou "Todos os grupos") antes de aplicar.');
    const calc = await this.calcularPrevia(r);
    this.exigirTransferencia(r, calc.previa, e.confirmarTransferencia === true);
    await this.prisma.$transaction(async (tx) => this.gravarAplicacao(tx, r, calc, usuario, new Date()), TX_LONGA);
    const reanalise = await this.reanalisar(r.projeto_id, r.aspecto as Aspecto, calc.afetados);
    const regra = await this.apiDe(regraId);
    return { ...regra, regra, previa: calc.previa, reanalise };
  }

  // ── Várias regras de uma vez (Aplicar todas / Aplicar selecionadas) ─────────

  /** Regras pedidas, do projeto, na ordem do código. `versoes` (id → versão que a tela viu) confere a concorrência. */
  private async regrasPedidas(projetoId: string, ids: string[], versoes?: Map<string, number>) {
    if (!ids.length) throw bad('SEM_REGRAS', 'Escolha ao menos uma regra.');
    if (ids.length > MAX_REGRAS_JUNTAS) throw bad('REGRAS_DEMAIS', `Aplique no máximo ${MAX_REGRAS_JUNTAS} regras de uma vez.`);
    const linhas = (await this.prisma.sanDiretrizRegra.findMany({ where: { projeto_id: projetoId, id: { in: ids } } })) as LinhaRegra[];
    if (linhas.length !== ids.length) throw new NotFoundException('Alguma regra escolhida não existe neste projeto.');
    if (versoes) for (const r of linhas) if (versoes.get(r.id) !== r.versao) throw conflito(`A regra ${r.codigo} foi alterada depois que você abriu a lista. Recarregue e tente de novo.`);
    const vazias = linhas.filter((r) => abrangenciaVazia(r.abrangencia as Abrangencia));
    if (vazias.length) throw bad('REGRA_SEM_GRUPOS', `Sem grupos escolhidos: ${vazias.map((r) => r.codigo).sort().join(', ')}. Escolha os grupos (ou "Todos os grupos") ou tire essas regras da seleção.`);
    return linhas.sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));
  }

  /** Prévia agregada: grupos, itens distintos e camadas de todas as regras; sobreposições com regras fora da seleção e entre as escolhidas. Só lê. */
  private async previaAgregada(linhas: LinhaRegra[]) {
    const cache: { todos?: Awaited<ReturnType<typeof itensComGrupo>> } = {};
    const escolhidas = new Set(linhas.map((l) => l.codigo));
    const grupos = new Set<string>(); const itens = new Set<string>(); const camadas = new Set<string>();
    const sobreposicoes: { regra: string; grupo: string; regraAtual: string }[] = [];
    const entreEscolhidas: { regra: string; grupo: string; regraAtual: string }[] = [];
    const paresVistos = new Set<string>();
    let transferenciaManual = false;
    for (const r of linhas) {
      const { previa, afetados } = await this.calcularPrevia(r, this.prisma, cache);
      previa.grupos.forEach((g) => grupos.add(g)); afetados.forEach((i) => itens.add(i)); previa.camadas.forEach((c) => camadas.add(c));
      for (const s of previa.sobreposicoes) {
        if (!escolhidas.has(s.regraAtual)) { sobreposicoes.push({ regra: r.codigo, ...s }); continue; }
        // Entre as escolhidas, o par aparece pelas duas regras (A disputa com B e B com A): conta uma vez só.
        const par = JSON.stringify([s.grupo, ...[r.codigo, s.regraAtual].sort()]);
        if (!paresVistos.has(par)) { paresVistos.add(par); entreEscolhidas.push({ regra: r.codigo, ...s }); }
      }
      if (previa.transferenciaManual) transferenciaManual = true;
    }
    return {
      regras: linhas.map((r) => ({ id: r.id, codigo: r.codigo, nome: r.nome })), grupos: [...grupos].sort(), itens: itens.size,
      camadas: CAMADAS.filter((c) => camadas.has(c)), sobreposicoes, entreEscolhidas, transferenciaManual,
    };
  }

  /** Só lê: prévia agregada de aplicar várias regras numa só reanálise (`ids` separados por vírgula). */
  async previaVarias(projetoId: string, idsTexto: unknown) {
    const ids = [...new Set(String(idsTexto ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
    return this.previaAgregada(await this.regrasPedidas(projetoId, ids));
  }

  /**
   * Aplica várias regras de uma vez, com as mesmas garantias da regra individual (versão de cada uma, sobreposição só com a transferência
   * confirmada, tudo numa transação), e reanalisa UMA vez por camada os itens afetados por todas. Duas regras escolhidas que disputam o
   * mesmo grupo: recusa (a pessoa decide qual fica).
   */
  async aplicarVarias(projetoId: string, b: unknown, usuario: Usuario) {
    const e = corpo(b);
    const pedidas = Array.isArray(e.regras) ? e.regras : [];
    const versoes = new Map<string, number>();
    for (const x of pedidas) {
      if (!ehObjeto(x) || typeof x.id !== 'string' || !x.id) throw bad('REGRAS_INVALIDAS', 'Envie as regras como [{ id, versao }].');
      if (versoes.has(x.id)) throw bad('REGRAS_REPETIDAS', 'A mesma regra veio duas vezes.');
      versoes.set(x.id, exigirVersao(x.versao));
    }
    const linhas = await this.regrasPedidas(projetoId, [...versoes.keys()], versoes);
    const agregada = await this.previaAgregada(linhas);
    if (agregada.entreEscolhidas.length) {
      throw bad('SOBREPOSICAO_ENTRE_REGRAS', `Regras escolhidas disputam o mesmo grupo: ${agregada.entreEscolhidas.map((s) => `${s.grupo} (${[s.regra, s.regraAtual].sort().join(' e ')})`).join('; ')}. Ajuste a abrangência de uma delas ou aplique-as separadamente.`);
    }
    if (agregada.sobreposicoes.length && e.confirmarTransferencia !== true) {
      throw new ConflictException({
        statusCode: 409, codigo: 'SOBREPOSICAO', sobreposicoes: agregada.sobreposicoes,
        message: `Já há regra para: ${agregada.sobreposicoes.map((s) => `${s.grupo} (${s.regraAtual} → ${s.regra})`).join('; ')}. Confirme a transferência (o histórico fica) ou ajuste a abrangência.`,
      });
    }
    if (agregada.transferenciaManual) throw new ConflictException({ statusCode: 409, codigo: 'TRANSFERENCIA_MANUAL', message: 'A transferência deixaria outra regra com grupos e subgrupos que não se combinam: ajuste a abrangência dela à mão.' });
    const porCamada = new Map<Camada, Set<string>>();
    const afetados = new Set<string>();
    const agora = new Date();
    await this.prisma.$transaction(async (tx) => {
      const cache: { todos?: Awaited<ReturnType<typeof itensComGrupo>> } = {};
      for (const pedida of linhas) {
        // Relida na transação: a regra anterior pode ter transferido grupos (e mudado a versão das outras).
        const r = (await tx.sanDiretrizRegra.findUnique({ where: { id: pedida.id } })) as LinhaRegra | null;
        if (!r || r.versao !== pedida.versao) throw conflito(`A regra ${pedida.codigo} foi alterada ao mesmo tempo. Recarregue e tente de novo.`);
        const calc = await this.calcularPrevia(r, tx, cache);
        this.exigirTransferencia(r, calc.previa, e.confirmarTransferencia === true);
        await this.gravarAplicacao(tx, r, calc, usuario, agora);
        for (const c of camadasDoAspecto(r.aspecto as Aspecto)) {
          const s = porCamada.get(c) ?? new Set<string>();
          for (const i of calc.afetados) { s.add(i); afetados.add(i); }
          porCamada.set(c, s);
        }
      }
    }, TX_LONGA);
    const reanalise = await this.reanalisarCamadas(projetoId, porCamada, afetados.size);
    const { regras } = await regrasDoProjeto(this.prisma, projetoId);
    return { aplicadas: linhas.length, regras: regras.filter((r) => versoes.has(r.id)), previa: agregada, reanalise };
  }

  /** Aprovação (um aprovador: o consultor). Exige a regra aplicada como está e com grupos. Já aprovada e sem "revisar": devolve sem gravar. */
  async aprovar(regraId: string, b: unknown, usuario: Usuario) {
    const e = corpo(b);
    const versao = exigirVersao(e.versao);
    const r = await this.carregar(regraId);
    if (r.versao !== versao) throw conflito();
    if (abrangenciaVazia(r.abrangencia as Abrangencia)) throw bad('REGRA_SEM_GRUPOS', 'A regra não cobre nenhum grupo: não há o que aprovar.');
    const bib = await conteudosDaBiblioteca(this.prisma, r.biblioteca_id ? [{ id: r.biblioteca_id, versao: r.biblioteca_versao }] : [], r.projeto_id);
    if (pendenteAplicar(r, efetivoDaLinha(r, bib))) throw bad('REGRA_NAO_APLICADA', 'Aplique e reanalise a regra como está antes de aprovar (o rascunho difere do que foi aplicado).');
    if (r.situacao === 'APROVADA' && !r.revisar) return { ...(await this.apiDe(regraId)), jaAprovada: true };
    await this.prisma.$transaction(async (tx) => {
      const x = await tx.sanDiretrizRegra.updateMany({ where: { id: regraId, versao }, data: { situacao: 'APROVADA', aprovada_por: quem(usuario), aprovada_em: new Date(), revisar: false, revisar_causa: null, versao: versao + 1 } });
      if (x.count === 0) throw conflito();
      await this.registrar(tx, r, 'APROVAR', usuario, { situacao: r.situacao, revisar: r.revisar }, { situacao: 'APROVADA', aprovadaPor: quem(usuario) });
    });
    return this.apiDe(regraId);
  }

  /** Histórico da regra (o mais recente primeiro), no formato da tela: `{ linhas: [{ createdAt, usuario, acao, antes, depois, detalhe }] }`. */
  async historico(regraId: string) {
    await this.carregar(regraId);
    const h = await this.prisma.sanDiretrizHistorico.findMany({ where: { regra_id: regraId }, orderBy: [{ quando: 'desc' }, { id: 'desc' }], take: 500 });
    return { linhas: h.map((x) => ({ id: x.id, createdAt: x.quando, usuario: x.usuario, acao: ACAO_TELA[x.acao] ?? x.acao, origem: x.acao, antes: x.antes, depois: x.depois, detalhe: x.detalhe })) };
  }

  /** Adota a versão nova da regra da biblioteca (com o antes e depois do conteúdo efetivo e a prévia). Regra aprovada volta a rascunho. */
  async adotarVersao(regraId: string, b: unknown, usuario: Usuario) {
    const e = corpo(b);
    const versao = exigirVersao(e.versao);
    const r = await this.carregar(regraId);
    if (r.versao !== versao) throw conflito();
    if (!r.biblioteca_id) throw bad('SEM_BIBLIOTECA', 'Esta regra não vem da biblioteca.');
    const lib = await this.prisma.sanDiretrizBiblioteca.findUnique({ where: { id: r.biblioteca_id } });
    if (!lib || lib.versao <= (r.biblioteca_versao ?? 0)) throw bad('SEM_VERSAO_NOVA', 'Não há versão nova desta regra na biblioteca.');
    const bib = await conteudosDaBiblioteca(this.prisma, [{ id: r.biblioteca_id, versao: r.biblioteca_versao }], r.projeto_id);
    const antes = efetivoDaLinha(r, bib);
    let depois: ConteudoRegra;
    try { depois = this.efetivoValido(r.aspecto as Aspecto, lib.conteudo as ConteudoRegra, r.alteracoes as Partial<ConteudoRegra> | null); } catch (err) {
      throw bad('ALTERACOES_INCOMPATIVEIS', `As alterações do projeto não cabem na versão nova da biblioteca: ${((err as { response?: { message?: string } }).response?.message) ?? (err as Error).message} Ajuste as alterações antes de adotar.`);
    }
    depois = comLinhasDoErp(r, depois, bib);
    const itens = r.situacao === 'APROVADA' ? await this.itensDaRegraAplicada(r.projeto_id, r) : [];
    const queda = this.quedaDeAprovacao(r, `A regra ${r.codigo} adotou a versão ${lib.versao} da biblioteca depois de aprovada: aplicar, revisar os achados e aprovar de novo.`);
    await this.prisma.$transaction(async (tx) => {
      const x = await tx.sanDiretrizRegra.updateMany({ where: { id: regraId, versao }, data: { biblioteca_versao: lib.versao, ...queda, versao: versao + 1 } as never });
      if (x.count === 0) throw conflito();
      const marcadas = itens.length ? await this.marcarRevisar(tx, r.projeto_id, itens, r.aspecto as Aspecto, `Revisar: a regra ${r.codigo} adotou a versão ${lib.versao} da biblioteca.`) : 0;
      await this.registrar(tx, r, 'ADOTAR_VERSAO', usuario, { bibliotecaVersao: r.biblioteca_versao, conteudo: antes }, { bibliotecaVersao: lib.versao, conteudo: depois },
        r.situacao === 'APROVADA' ? `Aprovação retirada; ${marcadas} célula(s) marcadas para revisar.` : undefined);
    }, TX_LONGA);
    const nova = await this.carregar(regraId);
    const regra = await this.apiDe(regraId);
    return { ...regra, regra, antes, depois, previa: (await this.calcularPrevia(nova)).previa };
  }

  /**
   * Transformar em regra: a partir de um caso (decisão num item), cria a regra em RASCUNHO com a abrangência escolhida, no projeto ou na
   * biblioteca (só administrador), e devolve a prévia do impacto. Nada é aplicado aqui: a decisão isolada nunca muda regra sozinha.
   */
  async transformar(projetoId: string, b: unknown, usuario: Usuario) {
    const e = corpo(b);
    const aspecto = validarAspecto(e.aspecto);
    if (e.destino !== 'PROJETO' && e.destino !== 'BIBLIOTECA') throw bad('DESTINO_INVALIDO', 'Destino: PROJETO ou BIBLIOTECA.');
    if (e.destino === 'BIBLIOTECA' && usuario?.role !== 'admin') throw new ForbiddenException('Somente administradores criam regras na Biblioteca de diretrizes.');
    const caso = await this.prisma.sanCaso.findUnique({ where: { id: String(e.casoId ?? '') } });
    if (!caso || caso.projeto_id !== projetoId) throw new NotFoundException('Caso não encontrado neste projeto.');
    const codigos = caso.itens.length ? (await this.prisma.sanItem.findMany({ where: { id: { in: caso.itens.slice(0, 5000) } }, select: { codigo: true } })).map((i) => i.codigo) : [];
    const alteracoes = alteracoesDoCaso(aspecto, caso as never, codigos);
    const detalhe = `A partir do caso ${caso.tipo} (${caso.camada}, ${caso.situacao}) ${caso.id}.`;
    await this.garantir(projetoId);
    try {
      const r = await this.prisma.$transaction(async (tx) => {
        let bibliotecaId: string | null = null;
        // Destino biblioteca: a regra-modelo leva só o que vale para qualquer cliente; o que cita item do cliente (exceção de NCM por código,
        // conversão de um produto) fica só na regra do projeto, que nasce em rascunho apontando para a regra-modelo.
        const { geral, doProjeto } = e.destino === 'BIBLIOTECA' ? separarDoCliente(aspecto, alteracoes) : { geral: null, doProjeto: alteracoes };
        if (e.destino === 'BIBLIOTECA') {
          const conteudo = validarRegraModelo(aspecto, conteudoEfetivo(aspecto, null, geral));
          bibliotecaId = `bib-${randomUUID().slice(0, 8)}`;
          const nome = texto(e.nome, 'o nome da regra', 160) as string;
          const obs = `Criada a partir de um caso do Saneamento (${caso.tipo}).`;
          await tx.sanDiretrizBiblioteca.create({ data: { id: bibliotecaId, aspecto, nome, observacao: obs, conteudo: conteudo as never, versao: 1, editada: true } });
          await tx.sanDiretrizBibliotecaVersao.create({ data: { regra_id: bibliotecaId, versao: 1, nome, observacao: obs, conteudo: conteudo as never, acao: 'CRIOU', usuario: quem(usuario) } });
        }
        return this.criarNaTransacao(tx, projetoId, {
          aspecto, nome: e.nome, abrangencia: e.abrangencia, observacao: e.observacao ?? detalhe, bibliotecaId, alteracoes: doProjeto,
        }, usuario, 'TRANSFORMAR', detalhe);
      });
      const regra = await this.apiDe(r.id);
      return { ...regra, regra, previa: (await this.calcularPrevia(await this.carregar(r.id))).previa };
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw conflito('Outra pessoa criou uma regra ao mesmo tempo. Tente de novo.');
      throw err;
    }
  }

  /** Itens reais do grupo (até 20) com a descrição atual e como ficaria pela regra (rascunho), e o que a análise apontaria. Só lê. */
  async exemplos(regraId: string) {
    const r = await this.carregar(regraId);
    const { linhas, bib } = await regrasDoProjeto(this.prisma, r.projeto_id);
    const conteudoDe = new Map(linhas.map((l) => [l.id, efetivoDaLinha(l, bib)]));
    const rascunhos: RegraResolvivel[] = linhas.filter((l) => !abrangenciaVazia(l.abrangencia as Abrangencia))
      .map((l) => ({ id: l.id, codigo: l.codigo, nome: l.nome, aspecto: l.aspecto as Aspecto, abrangencia: l.abrangencia as Abrangencia, conteudo: conteudoDe.get(l.id)!, aprovada: l.situacao === 'APROVADA', legado: false }));
    const idx = criarIndice(rascunhos);
    const aspecto = r.aspecto as Aspecto;
    const doGrupo = (await itensComGrupo(this.prisma, r.projeto_id)).filter((i) => idx.resolver(i.grupo, i.subgrupo)[aspecto]?.id === r.id);
    const conteudo = conteudoDe.get(r.id)!;
    // Formato da tela: `itens: [{ codigo, descricaoAtual, descricaoProposta }]` (+ o detalhe do aspecto). descricaoProposta: NOMES = como
    // ficaria; LIMITES = a variante que cabe no menor limite confirmado (null = cabe como está ou precisa de revisão); demais = null.
    // Nomes e limites: todos os itens da regra são avaliados e os que MUDAM (proposta ≠ atual) vêm primeiro; `totalMudam` = quantos mudam.
    const comDescricao = aspecto === 'NOMES' || aspecto === 'LIMITES';
    const exemplo = (it: ItemTrabalho) => {
      const ex = exemploDoItem(it, conteudo, idx.resolver(it.grupo, subgrupoDosCampos(it.campos)).NOMES);
      const descricaoProposta = (ex.descricaoProposta as string | null | undefined) ?? null;
      return {
        itemId: it.id, codigo: it.codigo, grupo: it.grupo, subgrupo: subgrupoDosCampos(it.campos), unidade: it.unidade, descricaoAtual: it.descricao,
        descricaoProposta, muda: descricaoProposta != null && descricaoProposta !== it.descricao, observacao: (ex.observacao as string | undefined) ?? '', ...ex,
      };
    };
    const ler = async (ids: string[]) => {
      const out: ItemTrabalho[] = [];
      for (const lote of fatiar(ids, 5000)) {
        const lidos = await this.prisma.sanItem.findMany({ where: { id: { in: lote } }, orderBy: { id: 'asc' }, select: { id: true, codigo: true, estabelecimento: true, trabalho: true } });
        for (const i of lidos) out.push({ ...(i.trabalho as Json), id: i.id, codigo: String((i.trabalho as Json).codigo ?? i.codigo), estabelecimento: i.estabelecimento || null } as ItemTrabalho);
      }
      return out;
    };
    if (!comDescricao) {
      return { regraId: r.id, codigo: r.codigo, aspecto, total: doGrupo.length, totalMudam: null, itens: (await ler(doGrupo.slice(0, MAX_EXEMPLOS).map((i) => i.id))).map(exemplo) };
    }
    const todos = (await ler(doGrupo.map((i) => i.id))).map(exemplo);
    const mudam = todos.filter((x) => x.muda);
    return { regraId: r.id, codigo: r.codigo, aspecto, total: doGrupo.length, totalMudam: mudam.length, itens: [...mudam, ...todos.filter((x) => !x.muda)].slice(0, MAX_EXEMPLOS) };
  }

  // ── Política ───────────────────────────────────────────────────────────────

  /**
   * Entrada de `gerarPdfPolitica` (entregaveis/politica, tipo `DadosPolitica`), montada a partir de `dadosDaPolitica`: versão liberada =
   * Diretrizes congeladas na foto; sem versão = as de agora. Só regras ativas; o PDF marca Rascunho se houver regra não aprovada.
   */
  async dadosPdfPolitica(projetoId: string, versaoId?: string | null) {
    const d = await this.dadosDaPolitica(projetoId, versaoId);
    const diag = await this.prisma.projetoDiagnostico.findUnique({ where: { id: d.projeto.diagnostico_id }, select: { nome: true } });
    const emp = await this.prisma.empresa.findUnique({ where: { id: d.projeto.empresa_id }, select: { razao_social: true, nome_fantasia: true } });
    const proj = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { erp: true, erp_id: true, parametros: true, modulos: true } });
    // Critérios das análises: os congelados na versão (reproduzível); sem versão, os de agora.
    const parametrosCriterios = versaoId ? await this.versoes.parametrosDaVersao(projetoId, versaoId) : (proj?.parametros as Json | null | undefined) ?? null;
    const regras = d.regras.map((x) => ({
      codigo: String(x.codigo), aspecto: x.aspecto as Aspecto, nome: String(x.nome), abrangencia: x.abrangencia as Abrangencia, situacao: x.situacao as 'RASCUNHO' | 'APROVADA',
      observacao: (x.observacao as string | null) ?? null, aprovadaPor: (x.aprovadaPor as string | null) ?? null, aprovadaEm: (x.aprovadaEm as string | null) ?? null, revisar: x.revisar === true,
      conteudo: x.conteudoEfetivo as ConteudoRegra,
    }));
    const aprovadores = [...new Set(regras.filter((x) => x.situacao === 'APROVADA' && x.aprovadaPor).map((x) => x.aprovadaPor as string))];
    // Seção fiscal: numa versão, só a da Fase 2 (reproduzível); sem versão, decisões aprovadas de Finalidade ou de Tratamento tributário.
    let fiscal: { fase2: boolean; finalidadeAprovadas?: number; tributarioAprovadas?: number };
    if (versaoId) {
      const v = await this.prisma.sanVersao.findUnique({ where: { id: versaoId }, select: { resumo: true } });
      fiscal = { fase2: (v?.resumo as Json | null)?.fase === 'FASE2' };
    } else {
      const contar = (camada: string) => this.prisma.sanCaso.count({ where: { projeto_id: projetoId, camada, situacao: 'APROVADO' } });
      const [fin, trib] = await Promise.all([contar('FINALIDADE'), contar('TRIBUTARIO')]);
      fiscal = { fase2: fin + trib > 0, finalidadeAprovadas: fin, tributarioAprovadas: trib };
    }
    return {
      identificacao: {
        cliente: emp?.razao_social || emp?.nome_fantasia || '', projeto: diag?.nome ?? '',
        versao: d.versao ? { numero: Number(d.versao.numero), rotulo: (d.versao.rotulo as string) ?? null, liberadaEm: (d.versao.criadaEm as Date) ?? null } : null,
        vigencia: (d.cabecalho.vigencia as string | null) ?? null, situacao: d.rascunho ? 'RASCUNHO' as const : 'APROVADA' as const,
        aprovador: aprovadores.length ? aprovadores.join(', ') : null, dataEmissao: new Date(), erp: await nomeDoErp(this.prisma, proj?.erp_id, proj?.erp),
      },
      regras,
      procedimentos: d.procedimentos, notaProcedimentos: d.notaProcedimentos, antesDasDiretrizes: d.antesDasDiretrizes,
      controles: CONTROLES_INTERNOS, fiscal,
      criterios: criteriosParaPolitica(parametrosCriterios, camadasAtivas(proj?.modulos as Json | null | undefined)),
      quadro: d.quadro.map(({ grupo, ...cods }) => ({ grupo, codigos: Object.fromEntries(Object.entries(cods).filter(([, v]) => v)) as Partial<Record<Aspecto, string>> })),
      pendencias: { gruposSemRegra: d.antesDasDiretrizes ? [] : d.pendencias.gruposSemRegra },
    };
  }

  /**
   * Dados da política (para o PDF): as Diretrizes de agora ou as congeladas numa versão liberada (reproduzível), os procedimentos fixos, o
   * quadro de consulta por grupo e as pendências (regras não aprovadas e grupos sem regra). `rascunho` = há regra ativa não aprovada.
   */
  async dadosDaPolitica(projetoId: string, versaoId?: string | null) {
    const projeto = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { id: true, empresa_id: true, diagnostico_id: true, responsavel: true } });
    if (!projeto) throw new NotFoundException('Projeto de saneamento não encontrado.');
    let diretrizes: Json | null; let versao: Json | null = null; let grupos: string[];
    let procedimentos: Procedimento[] = PROCEDIMENTOS; let notaProcedimentos: string | null = null; let antesDasDiretrizes = false;
    if (versaoId) {
      const v = await this.versoes.diretrizesDaVersao(projetoId, versaoId);
      diretrizes = v.diretrizes; versao = { id: v.versao.id, numero: v.versao.numero, rotulo: v.versao.rotulo, criadaEm: v.versao.createdAt };
      const { itens } = await this.versoes.trabalhoDosItensDaFoto(projetoId, versaoId);
      // Mesma chave de grupo da resolução (espaços repetidos não distinguem grupos): "PARAFUSOS  E FIXADORES" = "PARAFUSOS E FIXADORES".
      grupos = [...new Set([...itens.values()].map((t) => chaveGrupo(t.grupo)))].sort();
      // Procedimentos congelados na foto; foto anterior a isso usa a redação atual, com nota.
      if (Array.isArray(diretrizes?.procedimentos)) procedimentos = diretrizes.procedimentos as Procedimento[];
      else if (diretrizes) notaProcedimentos = 'Procedimentos na redação vigente na data de emissão deste documento.';
      if (!diretrizes) {
        // Versão liberada antes das Diretrizes: as regras vêm dos parâmetros do projeto congelados na foto (os que valiam na análise).
        antesDasDiretrizes = true;
        notaProcedimentos = 'Procedimentos na redação vigente na data de emissão deste documento.';
        const convertidas = converterParametros((await this.versoes.parametrosMotorDaVersao(projetoId, versaoId)) as never);
        const seq: Partial<Record<Aspecto, number>> = {};
        const regrasDaFoto = convertidas.map((c) => {
          seq[c.aspecto] = (seq[c.aspecto] ?? 0) + 1;
          const codigo = `${PREFIXO_ASPECTO[c.aspecto]}${String(seq[c.aspecto]).padStart(2, '0')}`;
          return {
            id: `foto-${codigo}`, codigo, aspecto: c.aspecto, nome: c.nome, abrangencia: { todos: true }, observacao: 'Parâmetros do projeto vigentes na data da versão.',
            conteudoEfetivo: conteudoEfetivo(c.aspecto, null, c.alteracoes as Partial<ConteudoRegra>), situacao: 'APROVADA', revisar: false, aprovadaPor: null, aprovadaEm: null, ativa: true, legado: true,
          };
        });
        diretrizes = { cabecalho: { vigencia: null, situacao: regrasDaFoto.length ? 'APROVADA' : 'RASCUNHO', revisar: false, versao: 1 }, regras: regrasDaFoto };
      }
    } else {
      await this.garantir(projetoId);
      diretrizes = await fotoDasDiretrizes(this.prisma, projetoId);
      grupos = gruposDaBase(await itensComGrupo(this.prisma, projetoId)).map((g) => g.grupo);
    }
    // Foto de versão: regra convertida (ou foto sem a marca) com as abreviações no sentido certo (conversão antiga gravava o par invertido).
    const regras = ((diretrizes?.regras as Json[] | undefined) ?? []).filter((x) => x.ativa !== false)
      .map((x) => (versaoId && x.legado !== false && x.conteudoEfetivo ? { ...x, conteudoEfetivo: abreviacoesNoSentidoCerto(x.conteudoEfetivo as ConteudoRegra) } : x));
    const idx = criarIndice(regras.map((x) => ({ id: String(x.id), codigo: String(x.codigo), nome: String(x.nome), aspecto: x.aspecto as Aspecto, abrangencia: x.abrangencia as Abrangencia, conteudo: x.conteudoEfetivo as ConteudoRegra, aprovada: x.situacao === 'APROVADA' })));
    const quadro = grupos.map((grupo) => { const rs = idx.resolver(grupo); return { grupo, NOMES: rs.NOMES?.codigo ?? null, ATRIBUTOS: rs.ATRIBUTOS?.codigo ?? null, UNIDADES: rs.UNIDADES?.codigo ?? null, LIMITES: rs.LIMITES?.codigo ?? null, FISCAL: rs.FISCAL?.codigo ?? null }; });
    const cab = (diretrizes?.cabecalho as Json | undefined) ?? { vigencia: null, situacao: 'RASCUNHO', revisar: false, versao: 1 };
    return {
      projeto, versao, cabecalho: cab, regras, procedimentos, notaProcedimentos, antesDasDiretrizes, quadro,
      pendencias: {
        regrasNaoAprovadas: regras.filter((x) => x.situacao !== 'APROVADA').map((x) => ({ codigo: x.codigo, nome: x.nome, revisar: x.revisar === true })),
        gruposSemRegra: gruposSemRegra(grupos, regras.map((x) => ({ id: String(x.id), codigo: String(x.codigo), aspecto: x.aspecto as Aspecto, abrangencia: x.abrangencia as Abrangencia }))).filter((g) => g.grupos.length),
      },
      rascunho: cab.situacao !== 'APROVADA',
    };
  }
}

/** O que a regra (rascunho) faria com um item real: descrição como ficaria (NOMES), variantes por destino (LIMITES), unidade, atributos e fiscal. */
function exemploDoItem(it: ItemTrabalho, c: ConteudoRegra, nomes: RegraResolvivel | undefined): Json {
  switch (c.aspecto) {
    case 'NOMES': {
      const p = descricaoPelaRegra(String(it.descricao ?? ''), c as RegraNomes);
      const ausentes = (c as RegraNomes).obrigatorios.filter((o) => componentePresente(it, o) === false);
      return {
        descricaoProposta: p.sugerida, observacao: [...p.motivos, ...(ausentes.length ? [`componente ausente: ${ausentes.join(', ')}`] : [])].join('; '),
        comoFicaria: p.sugerida, ajustes: p.motivos,
        termosProibidos: (c as RegraNomes).termosProibidos.filter((t) => t.substituicao == null && localizar(String(it.descricao ?? ''), t.termo).length).map((t) => t.termo),
        componentesAusentes: (c as RegraNomes).obrigatorios.filter((o) => componentePresente(it, o) === false),
        componentesNaoVerificaveis: (c as RegraNomes).obrigatorios.filter((o) => componentePresente(it, o) === null),
      };
    }
    case 'LIMITES': {
      const abrev = nomes ? (nomes.conteudo as RegraNomes).abreviacoes : [];
      const lin = (c as RegraLimites).linhas;
      const desc = String(it.descricao ?? '');
      const ef = limitesEfetivos(lin).get('descricao');
      const v = ef && desc.length > ef.limite ? (ef.linha.tratamento === 'SUGERIR_ABREVIACAO' ? abreviarAte(desc, ef.limite, abrev) : { cabe: false, texto: desc }) : null;
      return {
        descricaoProposta: v?.cabe ? v.texto : null,
        observacao: !ef ? 'sem limite confirmado para a descrição' : !v ? `cabe no limite de ${ef.limite} (${ef.linha.destino})` : v.cabe ? `abreviada para caber em ${ef.limite} (${ef.linha.destino})` : `acima de ${ef.limite} (${ef.linha.destino}): revisar à mão; nada é cortado`,
        efetivos: [...limitesEfetivos(lin)].map(([campo, { limite, linha }]) => ({ campo, limite, destino: linha.destino })),
        destinos: lin.map((l) => {
          const valor = String((it as unknown as Json)[l.campoItem] ?? '');
          const confirmado = l.confirmado && l.limite != null;
          const v = confirmado && valor.length > (l.limite as number) && ['descricao', 'fabricante'].includes(l.campoItem) && l.tratamento === 'SUGERIR_ABREVIACAO' ? abreviarAte(valor, l.limite as number, abrev) : null;
          return { destino: l.destino, campo: l.campo, campoItem: l.campoItem, limite: l.limite, confirmado, tamanho: valor.length, excede: confirmado ? valor.length > (l.limite as number) : null, variante: v ? (v.cabe ? v.texto : null) : null, revisar: confirmado && valor.length > (l.limite as number) && !v?.cabe };
        }),
      };
    }
    case 'UNIDADES': {
      const u = c as RegraUnidades;
      return { criterio: u.criterioEstoque, unidadeDefinida: u.unidadeDefinida ?? null, unidadeCompra: it.campos?.unidadeCompra ?? null, unidadeSaida: it.campos?.unidadeSaida ?? it.campos?.unidadeVenda ?? null };
    }
    case 'ATRIBUTOS': return { atributos: (c as RegraAtributos).atributos.map((a) => ({ atributo: a.atributo, aplicabilidade: a.aplicabilidade, ...atributoPresente(it, a) })) };
    case 'FISCAL': return { ncm: it.ncm, foraDaValidacaoNcm: foraDoNcm(it, c as RegraFiscal), validarCClassTrib: (c as RegraFiscal).validarCClassTrib };
  }
}

/**
 * Separa as alterações tiradas de um caso entre o que pode ir para a biblioteca (vale para qualquer cliente) e o que cita item do cliente e
 * fica só no projeto: exceções de NCM (o alvo é código de item ou grupo do cliente) e conversões de um produto (código do produto).
 */
export function separarDoCliente(aspecto: Aspecto, alteracoes: Partial<ConteudoRegra> | null): { geral: Partial<ConteudoRegra> | null; doProjeto: Partial<ConteudoRegra> | null } {
  if (!alteracoes) return { geral: null, doProjeto: null };
  const vazio = (o: Json) => (Object.keys(o).length ? o : null);
  if (aspecto === 'FISCAL') {
    const resto: Json = { ...alteracoes };
    delete resto.excecoesNcm;
    const excecoesNcm = (alteracoes as Partial<RegraFiscal>).excecoesNcm;
    return { geral: vazio(resto) as Partial<ConteudoRegra> | null, doProjeto: excecoesNcm?.length ? ({ excecoesNcm } as Partial<RegraFiscal>) : null };
  }
  if (aspecto === 'UNIDADES' && (alteracoes as Partial<RegraUnidades>).conversoes) {
    const a = alteracoes as Partial<RegraUnidades>;
    const doGrupo = a.conversoes!.filter((c) => c.abrangencia !== 'PRODUTO');
    const doProduto = a.conversoes!.filter((c) => c.abrangencia === 'PRODUTO');
    const resto: Json = { ...a };
    delete resto.conversoes;
    return {
      geral: vazio({ ...resto, ...(doGrupo.length ? { conversoes: doGrupo } : {}) }) as Partial<ConteudoRegra> | null,
      doProjeto: doProduto.length ? ({ conversoes: [...doGrupo, ...doProduto] } as Partial<RegraUnidades>) : null,
    };
  }
  return { geral: alteracoes, doProjeto: null };
}

/**
 * Alterações (sobre o padrão do aspecto) tiradas de um caso: conversão de unidade com fator (UNIDADES), exceção de NCM de caso rejeitado
 * (FISCAL: o consultor manteve o NCM; a justificativa vem do caso) e caixa alta de descrição padronizada (NOMES). O resto começa no padrão
 * e a pessoa completa antes de aplicar.
 */
export function alteracoesDoCaso(aspecto: Aspecto, caso: { tipo: string; camada: string; situacao: string; proposta: Json | null; motivo: string | null; justificativa: string | null; id: string }, codigos: string[]): Partial<ConteudoRegra> | null {
  const p = caso.proposta ?? {};
  if (aspecto === 'UNIDADES') {
    const fator = lerFator(p.fatorConversao);
    if (typeof p.unidade === 'string' && typeof p.unidadeCompra === 'string' && fator != null && p.unidade.trim() && p.unidadeCompra.trim() && canonico(p.unidade.trim().toUpperCase()) !== canonico(p.unidadeCompra.trim().toUpperCase())) {
      return { conversoes: [{ origem: p.unidadeCompra.trim().slice(0, 20), destino: p.unidade.trim().slice(0, 20), fator, abrangencia: 'GRUPO', codigoProduto: null }] } as Partial<RegraUnidades>;
    }
  }
  if (aspecto === 'FISCAL' && (caso.camada === 'NCM' || caso.camada === 'NCM_CLASSIFICACAO') && caso.situacao === 'REJEITADO' && codigos.length) {
    const j = String(caso.motivo || caso.justificativa || '').trim();
    const justificativa = (j.length >= 5 ? j : `NCM mantido pelo consultor ao rejeitar o caso ${caso.tipo}`).slice(0, 500);
    return { excecoesNcm: [...new Set(codigos)].slice(0, 5000).map((alvo) => ({ alvo: alvo.slice(0, 120), justificativa })) } as Partial<RegraFiscal>;
  }
  if (aspecto === 'NOMES' && typeof p.descricao === 'string' && p.descricao.trim() && p.descricao === p.descricao.toUpperCase() && /[A-Z]/.test(p.descricao)) {
    return { capitalizacao: 'MAIUSCULAS' } as Partial<RegraNomes>;
  }
  return null;
}
