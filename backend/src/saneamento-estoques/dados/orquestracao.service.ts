import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Camada, ContextoAnalise, ItemTrabalho } from '../tipos';
import { camadasAtivas, propostaAplicavel, validarCamada, type Json } from './constantes';
import { SanCasosService } from './casos.service';
import { SAN_MOTOR, type MotorPort } from './portas';
import { idsDeAtividades } from './motor.provider';
import { SanProjetoService } from './projeto.service';
import { nomeDoErp } from '../../erps/erps.service';
import { envolverComDiretrizes } from '../diretrizes/analise';
import { indiceAplicado } from '../diretrizes/dados';
import { fecharEscopo, recortarResultado } from '../diretrizes/escopo';

/** Análise em segundo plano (uma por projeto): roda as camadas na ordem, no servidor, e segue mesmo que a tela seja fechada. */
export interface ExecucaoCamadas {
  rodando: boolean;
  camadas: Camada[];
  atual: Camada | null;
  feitas: Array<Record<string, unknown> & { camada: Camada }>;
  erro: { camada: Camada; mensagem: string } | null;
  iniciadaEm: string;
  terminadaEm: string | null;
}

/** Roda uma camada: lê os itens, chama o analisador (função pura) e grava casos e células. Os analisadores entram por injeção (SAN_MOTOR). */
@Injectable()
export class SanOrquestracaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projetos: SanProjetoService,
    private readonly casos: SanCasosService,
    @Inject(SAN_MOTOR) private readonly motor: MotorPort,
  ) {}

  private readonly execucoes = new Map<string, ExecucaoCamadas>();

  /** Situação da análise em segundo plano do projeto (a última, mesmo terminada); null se nenhuma rodou desde que o servidor subiu. */
  execucao(projetoId: string): ExecucaoCamadas | null {
    return this.execucoes.get(projetoId) ?? null;
  }

  /**
   * Inicia a análise das camadas, na ordem dada, em segundo plano. Confere a trava e as camadas antes de responder; recusa se já houver
   * uma análise rodando no projeto. Para na primeira camada que falhar (as anteriores ficam gravadas).
   */
  async iniciarExecucao(projetoId: string, camadasTexto: unknown): Promise<ExecucaoCamadas> {
    if (!Array.isArray(camadasTexto) || !camadasTexto.length) throw new BadRequestException('Informe as camadas a analisar.');
    const camadas = camadasTexto.map((c) => validarCamada(String(c)));
    await this.projetos.exigirConfirmadas(projetoId);
    if (this.execucoes.get(projetoId)?.rodando) throw new BadRequestException('Já há uma análise rodando neste projeto. Aguarde terminar.');
    const ex: ExecucaoCamadas = { rodando: true, camadas, atual: camadas[0], feitas: [], erro: null, iniciadaEm: new Date().toISOString(), terminadaEm: null };
    this.execucoes.set(projetoId, ex);
    void (async () => {
      for (const camada of camadas) {
        ex.atual = camada;
        try {
          ex.feitas.push({ ...(await this.executarCamada(projetoId, camada) as Record<string, unknown>), camada });
        } catch (e) {
          ex.erro = { camada, mensagem: e instanceof Error ? e.message : String(e) };
          break;
        }
      }
      ex.atual = null;
      ex.rodando = false;
      ex.terminadaEm = new Date().toISOString();
    })();
    return ex;
  }

  /** Camadas que têm analisador conectado. */
  camadasDisponiveis() {
    return this.motor.camadas();
  }

  /**
   * `escopo` (Diretrizes: aplicar e reanalisar): a análise roda sobre a base inteira, mas só se grava o que toca estes itens (escopo fechado
   * pelos casos de conjunto, ver diretrizes/escopo.ts). As regras APLICADAS do projeto comandam as camadas (diretrizes/analise.ts); sem
   * regra aplicada, a camada roda exatamente como antes.
   */
  async executarCamada(projetoId: string, camadaTexto: string, opcoes: { escopo?: Set<string> } = {}) {
    const camada = validarCamada(camadaTexto);
    const p = await this.projetos.exigirConfirmadas(projetoId); // A TRAVA
    if (!camadasAtivas(p.modulos as Json).includes(camada)) throw new BadRequestException('Esta camada não está ligada neste projeto (módulo opcional desligado).');
    if (!this.motor.camadas().includes(camada)) throw new BadRequestException('Esta camada ainda não tem análise conectada neste servidor.');
    const itens: ItemTrabalho[] = [];
    let cursor: string | undefined;
    for (;;) {
      const lote = await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId }, orderBy: { id: 'asc' }, take: 5000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, codigo: true, estabelecimento: true, trabalho: true } });
      for (const i of lote) itens.push({ ...(i.trabalho as Json), id: i.id, codigo: String((i.trabalho as Json).codigo ?? i.codigo), estabelecimento: i.estabelecimento || null } as ItemTrabalho);
      if (lote.length < 5000) break;
      cursor = lote[lote.length - 1].id;
    }
    if (!itens.length) throw new BadRequestException('Importe o cadastro de itens antes de analisar.');
    const ativas = await this.prisma.sanAtividade.findMany({ where: { projeto_id: projetoId, mantida: true }, select: { codigo: true } });
    const contexto: ContextoAnalise = {
      dataBase: await this.projetos.dataBase(projetoId), atividades: idsDeAtividades(ativas.map((a) => a.codigo)),
      erp: await nomeDoErp(this.prisma, (p as { erp_id?: string | null }).erp_id, p.erp), erp_id: (p as { erp_id?: string | null }).erp_id ?? null,
      corteMovimentacao: ((p.parametros as Json)?.corteMovimentacao as string | null | undefined) ?? null,
      ...((p.parametros as Json)?.motor ? { parametros: (p.parametros as Json).motor } : {}),
    } as ContextoAnalise;
    const preparado = await this.motor.preparar(camada, { projetoId, itens, contexto });
    const diretrizes = await indiceAplicado(this.prisma, projetoId);
    const analisador = diretrizes ? envolverComDiretrizes(preparado.analisador, diretrizes) : preparado.analisador;
    let resultado = analisador.analisar(itens, preparado.contexto);
    let escopo: Set<string> | undefined;
    if (opcoes.escopo) {
      const abertos = await this.prisma.sanCaso.findMany({ where: { projeto_id: projetoId, camada, situacao: 'PROPOSTO' }, select: { itens: true } });
      escopo = fecharEscopo(opcoes.escopo, resultado.casos, abertos);
      resultado = recortarResultado(resultado, escopo);
    }
    const gravado = await this.casos.registrarResultado(projetoId, resultado, { completo: true, interno: true, escopo });
    // A camada de obrigações também (re)grava as linhas de impacto no SPED de todos os casos que geram ajuste.
    if (camada === 'OBRIGACOES') await this.casos.sincronizarTodosImpactos(projetoId);
    // Só a execução da camada inteira conta como "analisada em" (a reanálise de uma regra roda só nos itens dela).
    if (!opcoes.escopo) await this.registrarExecucao(projetoId, camada, new Date());
    return gravado;
  }

  /** Grava a data da última execução completa da camada em `parametros.execucoes` (sem mexer na versão do projeto). */
  private async registrarExecucao(projetoId: string, camada: Camada, quando: Date) {
    const iso = quando.toISOString();
    if (typeof (this.prisma as unknown as { $executeRaw?: unknown }).$executeRaw === 'function') {
      await this.prisma.$executeRaw`UPDATE "SanProjeto" SET "parametros" = jsonb_set(COALESCE("parametros", '{}'::jsonb), '{execucoes}', COALESCE("parametros"->'execucoes', '{}'::jsonb) || jsonb_build_object(${camada}::text, ${iso}::text)) WHERE "id" = ${projetoId}`;
      return;
    }
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { parametros: true } });
    const parametros = (p?.parametros ?? {}) as Json;
    await this.prisma.sanProjeto.update({ where: { id: projetoId }, data: { parametros: { ...parametros, execucoes: { ...((parametros.execucoes as Json) ?? {}), [camada]: iso } } as never } });
  }

  /**
   * Estado de cada camada para a faixa de Cobertura e para a liberação de versão: casos em aberto, aguardando e aprovados por camada,
   * quando a camada foi analisada por inteiro pela última vez e se ficou desatualizada (um campo de que ela depende mudou depois disso),
   * e o que os casos aprovados fazem no cadastro (o que entra numa versão liberada). Só lê.
   */
  async estadoDasCamadas(projetoId: string) {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { modulos: true, parametros: true } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    const camadas = camadasAtivas(p.modulos as Json);
    const execucoes = ((p.parametros as Json | null)?.execucoes ?? {}) as Record<string, string>;
    const contagem = await this.prisma.sanCaso.groupBy({ by: ['camada', 'situacao'], where: { projeto_id: projetoId }, _count: { _all: true } });
    const porCamada = new Map<string, { abertos: number; aguardando: number; aprovados: number }>();
    for (const c of contagem) {
      const x = porCamada.get(c.camada) ?? { abertos: 0, aguardando: 0, aprovados: 0 };
      if (c.situacao === 'PROPOSTO' || c.situacao === 'RASCUNHO') x.abertos += c._count._all;
      else if (c.situacao === 'AGUARDANDO_INFORMACAO') x.aguardando += c._count._all;
      else if (c.situacao === 'APROVADO') x.aprovados += c._count._all;
      porCamada.set(c.camada, x);
    }
    // Última mudança de cada campo de que alguma camada depende (aprovação, desfazer, reimportação, restauração; rejeitar não muda o valor).
    const mudancas = new Map<string, string | null>();
    for (const camada of camadas) {
      for (const d of DEPENDENCIAS[camada] ?? []) {
        if (!execucoes[camada] || mudancas.has(d.camada)) continue;
        const u = await this.prisma.sanDecisao.findFirst({ where: { projeto_id: projetoId, campo: { in: d.campos }, tipo: { not: 'rejeitar' } }, orderBy: { quando: 'desc' }, select: { quando: true } });
        mudancas.set(d.camada, u?.quando ? new Date(u.quando).toISOString() : null);
      }
    }
    const linhas = camadas.map((camada) => ({
      camada, ...(porCamada.get(camada) ?? { abertos: 0, aguardando: 0, aprovados: 0 }), executadaEm: execucoes[camada] ?? null,
      desatualizada: desatualizacao(camada, execucoes[camada] ?? null, mudancas),
    }));
    const aprovados = await this.prisma.sanCaso.findMany({ where: { projeto_id: projetoId, situacao: 'APROVADO' }, select: { camada: true, proposta: true, itens: true } });
    return {
      camadas: linhas,
      abertos: linhas.reduce((s, l) => s + l.abertos, 0), aguardando: linhas.reduce((s, l) => s + l.aguardando, 0), aprovados: linhas.reduce((s, l) => s + l.aprovados, 0),
      efeitos: efeitosDosAprovados(aprovados),
    };
  }
}

/** Camada → camadas cujas decisões ela usa (e os campos do item que essas decisões alteram). Mudou um deles depois da análise: refazer. */
export const DEPENDENCIAS: Partial<Record<Camada, { camada: Camada; campos: string[] }[]>> = {
  TRIBUTARIO: [{ camada: 'GRUPOS_FINALIDADE', campos: ['finalidade', 'tambemUsadoComo'] }, { camada: 'NCM', campos: ['ncm'] }],
};

/** A camada ficou desatualizada? Só quando foi analisada por inteiro e um campo de que depende mudou depois. Função pura. */
export function desatualizacao(camada: Camada, executadaEm: string | null, mudancas: Map<string, string | null>): { por: Camada[]; desde: string } | null {
  if (!executadaEm) return null;
  const depois = (DEPENDENCIAS[camada] ?? []).map((d) => ({ camada: d.camada, quando: mudancas.get(d.camada) ?? null })).filter((d) => !!d.quando && d.quando > executadaEm);
  if (!depois.length) return null;
  return { por: depois.map((d) => d.camada), desde: depois.map((d) => d.quando as string).sort()[0] };
}

export type EfeitosDosAprovados = { unificacoes: number; inativados: number; finalidade: number; descricao: number; unidade: number; ncm: number; tributario: number };

/** O que os casos aprovados fazem no cadastro (itens distintos por efeito; unificações = duplicidades consolidadas). Função pura. */
export function efeitosDosAprovados(casos: { camada: string; proposta: unknown; itens: string[] }[]): EfeitosDosAprovados {
  const s = { inativados: new Set<string>(), finalidade: new Set<string>(), descricao: new Set<string>(), unidade: new Set<string>(), ncm: new Set<string>(), tributario: new Set<string>() };
  let unificacoes = 0;
  const somar = (alvo: Set<string>, itens: string[]) => { for (const i of itens) alvo.add(i); };
  for (const c of casos) {
    const bruta = (c.proposta ?? {}) as Json;
    const p = propostaAplicavel(c.camada, bruta);
    if (c.camada === 'DUPLICIDADE' && bruta.decisao === 'PROPOR_CONSOLIDACAO') unificacoes++;
    if (p.ativo === false) somar(s.inativados, c.itens);
    if ('finalidade' in p) somar(s.finalidade, c.itens);
    if ('descricao' in p) somar(s.descricao, c.itens);
    if ('unidade' in p) somar(s.unidade, c.itens);
    if ('ncm' in p) somar(s.ncm, c.itens);
    if (c.camada === 'TRIBUTARIO' && (p.cClassTrib || p.enquadramentoLegal)) somar(s.tributario, c.itens);
  }
  return { unificacoes, inativados: s.inativados.size, finalidade: s.finalidade.size, descricao: s.descricao.size, unidade: s.unidade.size, ncm: s.ncm.size, tributario: s.tributario.size };
}
