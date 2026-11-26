import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TX_LONGA, camadasAtivas, conflito, exigirVersao, fatiar, quem, type Usuario } from '../dados/constantes';
import { SanOrquestracaoService } from '../dados/orquestracao.service';
import { SanVersoesService } from '../dados/versoes.service';
import { lerFator } from '../motor';
import { dataIsoValida } from '../motor/texto';
import { CAMADAS, type Camada, type ItemTrabalho } from '../tipos';
import { abreviarAte, atributoPresente, componentePresente, descricaoPelaRegra, foraDoNcm, localizar } from './analise';
import { validarRegraModelo } from './biblioteca.service';
import { abrangenciaVazia, canonico, conferirCoerencia, conteudoEfetivo, texto, validarAbrangencia, validarAspecto, validarConteudo } from './conteudo-regra';
import { MODELOS, PROCEDIMENTOS } from './conteudo/biblioteca';
import {
  aplicacaoDoRascunho, conteudosDaBiblioteca, efetivoDaLinha, fotoDasDiretrizes, gruposDaBase, itensComGrupo, lerRegras, pendenteAplicar, regraApi, regrasDoProjeto,
  resolviveisAplicadas, situacaoDasDiretrizes, type Aplicacao, type LinhaRegra,
} from './dados';
import { limitesEfetivos } from './parametros';
import { criarIndice, gruposSemRegra, retirarSobreposicao, sobreposicoes, type RegraResolvivel } from './resolucao';
import {
  CAMADAS_DO_ASPECTO, PREFIXO_ASPECTO, type Abrangencia, type Aspecto, type ConteudoRegra, type PreviaAplicacao, type RegraAtributos, type RegraFiscal, type RegraLimites,
  type RegraNomes, type RegraUnidades,
} from './tipos';

type Json = Record<string, unknown>;
type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
const ehObjeto = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const corpo = (b: unknown): Json => (ehObjeto(b) ? b : {});
const bad = (codigo: string, message: string, extra: Json = {}) => new BadRequestException({ statusCode: 400, codigo, message, ...extra });
const MAX_EXEMPLOS = 20;

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
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { id: true, parametros: true, modulos: true, atividades_confirmadas_em: true } });
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
    const { converterParametros } = await import('./parametros');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cab = await tx.sanDiretrizes.create({ data: { projeto_id: projetoId, convertido_em: new Date() } });
        const seq: Partial<Record<Aspecto, number>> = {};
        for (const c of converterParametros(((p.parametros as Json | null)?.motor ?? null) as never)) {
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
    return { vigencia: cab!.vigencia, versao: cab!.versao };
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
    const bib = await conteudosDaBiblioteca(this.prisma, r.biblioteca_id ? [{ id: r.biblioteca_id, versao: r.biblioteca_versao }] : []);
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
        return { modeloId: modelo.id, criadas, jaExistentes, faltando };
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
    const bib = await conteudosDaBiblioteca(this.prisma, r.biblioteca_id ? [{ id: r.biblioteca_id, versao: r.biblioteca_versao }] : []);
    const alteracoes = (mudou.includes('alteracoes') ? novo.alteracoes : r.alteracoes) as Partial<ConteudoRegra> | null;
    this.efetivoValido(aspecto, r.biblioteca_id ? efetivoDaLinha({ ...r, alteracoes: null }, bib) : null, alteracoes);
    const conteudoMudou = mudou.includes('alteracoes') || mudou.includes('abrangencia');
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
  private async calcularPrevia(r: LinhaRegra): Promise<{ previa: Previa; afetados: string[]; linhas: LinhaRegra[]; conteudo: ConteudoRegra }> {
    const { linhas, bib } = await regrasDoProjeto(this.prisma, r.projeto_id);
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
    const afetados: string[] = []; const grupos = new Set<string>();
    for (const i of await itensComGrupo(this.prisma, r.projeto_id)) {
      const a = antesIdx.resolver(i.grupo, i.subgrupo)[aspecto]?.id; const d = depoisIdx.resolver(i.grupo, i.subgrupo)[aspecto]?.id;
      if (a !== d || a === atual.id || d === atual.id) { afetados.push(i.id); grupos.add(i.grupo); }
    }
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

  /** Reexecuta só os itens afetados nas camadas do aspecto (orquestração existente, com escopo). Falha de uma camada não desfaz a aplicação: vem no retorno. */
  private async reanalisar(projetoId: string, aspecto: Aspecto, itens: string[]) {
    const camadas = camadasDoAspecto(aspecto);
    if (!itens.length) return { itens: 0, camadas: [], aviso: 'Nenhum item afetado: nada a reanalisar.' };
    const p = await this.projeto(projetoId);
    if (!p.atividades_confirmadas_em) return { itens: itens.length, camadas: [], aviso: 'As atividades do cliente ainda não foram confirmadas: a regra está aplicada e vale na próxima análise.' };
    const disponiveis = this.orquestracao.camadasDisponiveis();
    const ativas = camadasAtivas(p.modulos as Json);
    const out: Json[] = [];
    for (const camada of camadas) {
      if (!disponiveis.includes(camada) || !ativas.includes(camada)) { out.push({ camada, executada: false, motivo: 'Camada sem análise conectada ou desligada neste projeto.' }); continue; }
      try {
        const g = await this.orquestracao.executarCamada(projetoId, camada, { escopo: new Set(itens) });
        out.push({ camada, executada: true, casosNovos: g.casosNovos, casosObsoletos: g.casosObsoletos, semProblema: g.semProblema, semDados: g.semDados ?? null });
      } catch (e) {
        out.push({ camada, executada: false, motivo: (e as Error).message });
      }
    }
    return { itens: itens.length, camadas: out };
  }

  async aplicar(regraId: string, b: unknown, usuario: Usuario) {
    const e = corpo(b);
    const versao = exigirVersao(e.versao);
    const r = await this.carregar(regraId);
    if (r.versao !== versao) throw conflito();
    if (abrangenciaVazia(r.abrangencia as Abrangencia)) throw bad('REGRA_SEM_GRUPOS', 'A regra não cobre nenhum grupo: escolha os grupos (ou "Todos os grupos") antes de aplicar.');
    const { previa, afetados, linhas, conteudo } = await this.calcularPrevia(r);
    if (previa.sobreposicoes.length && e.confirmarTransferencia !== true) {
      throw new ConflictException({
        statusCode: 409, codigo: 'SOBREPOSICAO', sobreposicoes: previa.sobreposicoes, transferencias: previa.transferencias,
        message: `Já há regra de ${r.aspecto} para: ${previa.sobreposicoes.map((s) => `${s.grupo} (${s.regraAtual})`).join('; ')}. Confirme a transferência (o histórico fica) ou ajuste a abrangência.`,
      });
    }
    if (previa.transferenciaManual) throw new ConflictException({ statusCode: 409, codigo: 'TRANSFERENCIA_MANUAL', message: 'A transferência deixaria a outra regra com grupos e subgrupos que não se combinam: ajuste a abrangência dela à mão.' });
    const agora = new Date();
    await this.prisma.$transaction(async (tx) => {
      const x = await tx.sanDiretrizRegra.updateMany({ where: { id: regraId, versao }, data: { aplicacao: aplicacaoDoRascunho(r, conteudo) as never, aplicada_em: agora, aplicada_por: quem(usuario), versao: versao + 1 } });
      if (x.count === 0) throw conflito();
      for (const t of previa.transferencias) {
        const o = linhas.find((l) => l.id === t.regraId)!;
        const aplicacao = o.aplicacao ? { ...(o.aplicacao as Aplicacao), abrangencia: retirarSobreposicao((o.aplicacao as Aplicacao).abrangencia, r.abrangencia as Abrangencia) } : null;
        const y = await tx.sanDiretrizRegra.updateMany({ where: { id: o.id, versao: o.versao }, data: { abrangencia: t.abrangenciaDepois as never, aplicacao: (aplicacao ?? undefined) as never, versao: o.versao + 1 } });
        if (y.count === 0) throw conflito('Outra regra envolvida na transferência foi alterada ao mesmo tempo. Recarregue e tente de novo.');
        await this.registrar(tx, o, 'TRANSFERIR', usuario, { abrangencia: o.abrangencia }, { abrangencia: t.abrangenciaDepois },
          `Transferido para a regra ${r.codigo}: ${previa.sobreposicoes.filter((s) => s.regraAtual === o.codigo).map((s) => s.grupo).join(', ')}.`);
      }
      await this.registrar(tx, r, 'APLICAR', usuario, { aplicacao: r.aplicacao ?? null }, { aplicacao: aplicacaoDoRascunho(r, conteudo) },
        `Aplicada a ${rotuloAbrangencia(r.abrangencia as Abrangencia)}: ${afetados.length} item(ns) em ${previa.grupos.length} grupo(s); camadas ${previa.camadas.join(', ')}.`);
    }, TX_LONGA);
    const reanalise = await this.reanalisar(r.projeto_id, r.aspecto as Aspecto, afetados);
    return { regra: await this.apiDe(regraId), previa, reanalise };
  }

  /** Aprovação (um aprovador: o consultor). Exige a regra aplicada como está e com grupos. Já aprovada e sem "revisar": devolve sem gravar. */
  async aprovar(regraId: string, b: unknown, usuario: Usuario) {
    const e = corpo(b);
    const versao = exigirVersao(e.versao);
    const r = await this.carregar(regraId);
    if (r.versao !== versao) throw conflito();
    if (abrangenciaVazia(r.abrangencia as Abrangencia)) throw bad('REGRA_SEM_GRUPOS', 'A regra não cobre nenhum grupo: não há o que aprovar.');
    const bib = await conteudosDaBiblioteca(this.prisma, r.biblioteca_id ? [{ id: r.biblioteca_id, versao: r.biblioteca_versao }] : []);
    if (pendenteAplicar(r, efetivoDaLinha(r, bib))) throw bad('REGRA_NAO_APLICADA', 'Aplique e reanalise a regra como está antes de aprovar (o rascunho difere do que foi aplicado).');
    if (r.situacao === 'APROVADA' && !r.revisar) return { ...(await this.apiDe(regraId)), jaAprovada: true };
    await this.prisma.$transaction(async (tx) => {
      const x = await tx.sanDiretrizRegra.updateMany({ where: { id: regraId, versao }, data: { situacao: 'APROVADA', aprovada_por: quem(usuario), aprovada_em: new Date(), revisar: false, revisar_causa: null, versao: versao + 1 } });
      if (x.count === 0) throw conflito();
      await this.registrar(tx, r, 'APROVAR', usuario, { situacao: r.situacao, revisar: r.revisar }, { situacao: 'APROVADA', aprovadaPor: quem(usuario) });
    });
    return this.apiDe(regraId);
  }

  async historico(regraId: string) {
    await this.carregar(regraId);
    return this.prisma.sanDiretrizHistorico.findMany({ where: { regra_id: regraId }, orderBy: [{ quando: 'desc' }, { id: 'desc' }], take: 500 });
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
    const bib = await conteudosDaBiblioteca(this.prisma, [{ id: r.biblioteca_id, versao: r.biblioteca_versao }]);
    const antes = efetivoDaLinha(r, bib);
    let depois: ConteudoRegra;
    try { depois = this.efetivoValido(r.aspecto as Aspecto, lib.conteudo as ConteudoRegra, r.alteracoes as Partial<ConteudoRegra> | null); } catch (err) {
      throw bad('ALTERACOES_INCOMPATIVEIS', `As alterações do projeto não cabem na versão nova da biblioteca: ${((err as { response?: { message?: string } }).response?.message) ?? (err as Error).message} Ajuste as alterações antes de adotar.`);
    }
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
    return { regra: await this.apiDe(regraId), antes, depois, previa: (await this.calcularPrevia(nova)).previa };
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
        if (e.destino === 'BIBLIOTECA') {
          const conteudo = validarRegraModelo(aspecto, conteudoEfetivo(aspecto, null, alteracoes));
          bibliotecaId = `bib-${randomUUID().slice(0, 8)}`;
          const nome = texto(e.nome, 'o nome da regra', 160) as string;
          await tx.sanDiretrizBiblioteca.create({ data: { id: bibliotecaId, aspecto, nome, observacao: detalhe, conteudo: conteudo as never, versao: 1, editada: true } });
          await tx.sanDiretrizBibliotecaVersao.create({ data: { regra_id: bibliotecaId, versao: 1, nome, observacao: detalhe, conteudo: conteudo as never, acao: 'CRIOU', usuario: quem(usuario) } });
        }
        return this.criarNaTransacao(tx, projetoId, {
          aspecto, nome: e.nome, abrangencia: e.abrangencia, observacao: e.observacao ?? detalhe, bibliotecaId, alteracoes: bibliotecaId ? null : alteracoes,
        }, usuario, 'TRANSFORMAR', detalhe);
      });
      return { regra: await this.apiDe(r.id), previa: (await this.calcularPrevia(await this.carregar(r.id))).previa };
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
    const ids = doGrupo.slice(0, MAX_EXEMPLOS).map((i) => i.id);
    const lidos = ids.length ? await this.prisma.sanItem.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, select: { id: true, codigo: true, estabelecimento: true, trabalho: true } }) : [];
    const itens: ItemTrabalho[] = lidos.map((i) => ({ ...(i.trabalho as Json), id: i.id, codigo: String((i.trabalho as Json).codigo ?? i.codigo), estabelecimento: i.estabelecimento || null }) as ItemTrabalho);
    const conteudo = conteudoDe.get(r.id)!;
    return {
      regraId: r.id, codigo: r.codigo, aspecto, total: doGrupo.length,
      exemplos: itens.map((it) => ({ itemId: it.id, codigo: it.codigo, grupo: it.grupo, subgrupo: it.campos?.subgrupo ?? null, descricao: it.descricao, unidade: it.unidade, ...exemploDoItem(it, conteudo, idx.resolver(it.grupo, it.campos?.subgrupo).NOMES) })),
    };
  }

  // ── Política ───────────────────────────────────────────────────────────────

  /**
   * Dados da política (para o PDF): as Diretrizes de agora ou as congeladas numa versão liberada (reproduzível), os procedimentos fixos, o
   * quadro de consulta por grupo e as pendências (regras não aprovadas e grupos sem regra). `rascunho` = há regra ativa não aprovada.
   */
  async dadosDaPolitica(projetoId: string, versaoId?: string | null) {
    const projeto = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { id: true, empresa_id: true, diagnostico_id: true, responsavel: true } });
    if (!projeto) throw new NotFoundException('Projeto de saneamento não encontrado.');
    let diretrizes: Json | null; let versao: Json | null = null; let grupos: string[];
    if (versaoId) {
      const v = await this.versoes.diretrizesDaVersao(projetoId, versaoId);
      diretrizes = v.diretrizes; versao = { id: v.versao.id, numero: v.versao.numero, rotulo: v.versao.rotulo, criadaEm: v.versao.createdAt };
      const { itens } = await this.versoes.trabalhoDosItensDaFoto(projetoId, versaoId);
      grupos = [...new Set([...itens.values()].map((t) => (String(t.grupo ?? '').trim() || '(sem grupo)')))].sort();
    } else {
      await this.garantir(projetoId);
      diretrizes = await fotoDasDiretrizes(this.prisma, projetoId);
      grupos = gruposDaBase(await itensComGrupo(this.prisma, projetoId)).map((g) => g.grupo);
    }
    const regras = ((diretrizes?.regras as Json[] | undefined) ?? []).filter((x) => x.ativa !== false);
    const idx = criarIndice(regras.map((x) => ({ id: String(x.id), codigo: String(x.codigo), nome: String(x.nome), aspecto: x.aspecto as Aspecto, abrangencia: x.abrangencia as Abrangencia, conteudo: x.conteudoEfetivo as ConteudoRegra, aprovada: x.situacao === 'APROVADA' })));
    const quadro = grupos.map((grupo) => { const rs = idx.resolver(grupo); return { grupo, NOMES: rs.NOMES?.codigo ?? null, ATRIBUTOS: rs.ATRIBUTOS?.codigo ?? null, UNIDADES: rs.UNIDADES?.codigo ?? null, LIMITES: rs.LIMITES?.codigo ?? null, FISCAL: rs.FISCAL?.codigo ?? null }; });
    const cab = (diretrizes?.cabecalho as Json | undefined) ?? { vigencia: null, situacao: 'RASCUNHO', revisar: false, versao: 1 };
    return {
      projeto, versao, cabecalho: cab, regras, procedimentos: PROCEDIMENTOS, quadro,
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
      return {
        comoFicaria: p.sugerida, ajustes: p.motivos,
        termosProibidos: (c as RegraNomes).termosProibidos.filter((t) => t.substituicao == null && localizar(String(it.descricao ?? ''), t.termo).length).map((t) => t.termo),
        componentesAusentes: (c as RegraNomes).obrigatorios.filter((o) => componentePresente(it, o) === false),
        componentesNaoVerificaveis: (c as RegraNomes).obrigatorios.filter((o) => componentePresente(it, o) === null),
      };
    }
    case 'LIMITES': {
      const abrev = nomes ? (nomes.conteudo as RegraNomes).abreviacoes : [];
      const lin = (c as RegraLimites).linhas;
      return {
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
  if (aspecto === 'FISCAL' && caso.camada === 'NCM' && caso.situacao === 'REJEITADO' && codigos.length) {
    const j = String(caso.motivo || caso.justificativa || '').trim();
    const justificativa = (j.length >= 5 ? j : `NCM mantido pelo consultor ao rejeitar o caso ${caso.tipo}`).slice(0, 500);
    return { excecoesNcm: [...new Set(codigos)].slice(0, 5000).map((alvo) => ({ alvo: alvo.slice(0, 120), justificativa })) } as Partial<RegraFiscal>;
  }
  if (aspecto === 'NOMES' && typeof p.descricao === 'string' && p.descricao.trim() && p.descricao === p.descricao.toUpperCase() && /[A-Z]/.test(p.descricao)) {
    return { capitalizacao: 'MAIUSCULAS' } as Partial<RegraNomes>;
  }
  return null;
}
