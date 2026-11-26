import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { BaseLegalService } from '../base-legal/base-legal.service';
import { PrismaService } from '../prisma/prisma.service';
import { CATALOGO_CONSULTORIA, SERVICOS_POR_DATA_BASE } from '../servicos-contratados/consultoria.service';
import type { Candidato } from '../base-legal/base-legal.assistente';
import {
  AVISO_RASCUNHO, MAX_NORMAS_RASCUNHO, lerRascunho, montarPromptRascunho, rascunhoEmTexto,
  type ClienteResumo, type ContextoProjeto, type DocumentosResumo, type ModoRascunho, type SecoesRascunho,
} from './contexto';
import { roteiroDe, type Roteiro } from './roteiros';
import { LimiteUso, comPrazo } from './util';

/**
 * Achados que outro módulo já tem do serviço (ex.: o laudo da homologação). O integrador pode fornecer este token com uma função
 * `(projeto) => string[]`; sem ele, o contexto usa só o que este módulo lê sozinho (documentos e, no saneamento, os casos por situação).
 */
export const ACHADOS_IA = 'ACHADOS_IA';
export type ProvedorDeAchados = (projeto: { id: string; servico_consultoria: string; empresa_ids: string[]; pessoa_fisica_id: string | null; periodo_inicio: Date | null; periodo_fim: Date | null }) => Promise<string[]>;

/** Prazo de cada modo: o rápido não pesquisa na web; o aprofundado pesquisa (a ponte do Claude Code encerra o processo neste mesmo prazo). */
export const PRAZO_MS: Record<ModoRascunho, number> = { rapido: 60_000, pesquisa: 170_000 };
/** Pedido "em andamento" há mais que o prazo + esta folga (ex.: o servidor reiniciou no meio) é mostrado como interrompido. */
const MARGEM_INTERROMPIDO_MS = 60_000;
const PRAZO_NORMAS_MS = 10_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** O último rascunho fica em ParametroSistema (chave por projeto): um registro só, substituído a cada pedido. */
export const chaveRascunho = (projetoId: string) => `ia-consultoria:rascunho:${projetoId}`;

export type RascunhoGuardado = { rascunho: string; secoes: SecoesRascunho; modelo: string; modo: ModoRascunho; gerado_em: string; servico: string };
export type EstadoGuardado = {
  estado: 'EM_ANDAMENTO' | 'PRONTO' | 'ERRO';
  modo: ModoRascunho | null;
  iniciado_em: string | null;
  concluido_em: string | null;
  /** Mensagem do erro (ou null). */
  mensagem: string | null;
  /** O último rascunho pronto: continua à vista mesmo depois de um pedido novo que falhou. */
  ultimo: RascunhoGuardado | null;
};
export type EstadoAnalise = Omit<EstadoGuardado, 'estado'> & { estado: EstadoGuardado['estado'] | 'NENHUM'; aviso: string };

/**
 * Botão "Analisar com IA" de todos os serviços de consultoria: monta o contexto padrão do projeto e prepara um RASCUNHO de parecer em
 * segundo plano. Só guarda o rascunho (o projeto não muda).
 */
@Injectable()
export class AnalisarIaService {
  private readonly log = new Logger(AnalisarIaService.name);
  /** A pesquisa na web custa mais que a pergunta comum: 8 rascunhos a cada 10 minutos por usuário. */
  private readonly limite = new LimiteUso(8, 10 * 60_000, 'Muitos rascunhos seguidos. Aguarde alguns minutos e tente de novo.');
  private readonly trabalhos = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly base: BaseLegalService,
    @Optional() @Inject(ACHADOS_IA) private readonly achadosExternos?: ProvedorDeAchados,
  ) {}

  private async documentos(servico: string, publico: string, clienteIds: string[]): Promise<DocumentosResumo> {
    if (!clienteIds.length) return { total: 0, porSituacao: {}, abertos: [] };
    const linhas = await this.prisma.controleDocumentoConsultoria.findMany({ where: { publico, servico, cliente_id: { in: clienteIds } }, take: 2000 });
    const porSituacao: Record<string, number> = {};
    for (const l of linhas) porSituacao[l.situacao] = (porSituacao[l.situacao] ?? 0) + 1;
    const abertos = linhas.filter((l) => l.situacao === 'PENDENTE' || l.situacao === 'DIVERGENTE').slice(0, 15).map((l) => ({ item: l.item, periodo: l.periodo, situacao: l.situacao }));
    return { total: linhas.length, porSituacao, abertos };
  }

  private async achadosDoServico(p: Parameters<ProvedorDeAchados>[0]): Promise<string[]> {
    const achados: string[] = [];
    try {
      if (p.servico_consultoria === 'saneamento-estoques') {
        const san = await this.prisma.sanProjeto.findUnique({ where: { diagnostico_id: p.id }, select: { id: true, atividades_confirmadas_em: true } });
        if (san) {
          const grupos = await this.prisma.sanCaso.groupBy({ by: ['camada', 'situacao'], where: { projeto_id: san.id }, _count: { _all: true } });
          achados.push(san.atividades_confirmadas_em ? 'Atividades do cliente confirmadas.' : 'Atividades do cliente ainda NÃO confirmadas: a análise está travada.');
          for (const g of grupos) achados.push(`Casos da camada ${g.camada} em ${g.situacao}: ${g._count._all}`);
        }
      }
      if (this.achadosExternos) achados.push(...(await this.achadosExternos(p)).slice(0, 12));
    } catch (e) {
      this.log.warn(`Achados do serviço indisponíveis: ${(e as Error).message}`);
    }
    return achados;
  }

  /** Só o que o parecer precisa: nada de nome, CNPJ, CPF, e-mail ou endereço. */
  async montarContexto(projetoId: string): Promise<ContextoProjeto> {
    const p = await this.prisma.projetoDiagnostico.findUnique({ where: { id: projetoId } });
    if (!p) throw new NotFoundException('Projeto não encontrado.');
    const servico = CATALOGO_CONSULTORIA.find((s) => s.id === p.servico_consultoria);
    if (!servico) throw new BadRequestException('Este projeto não é de um serviço de consultoria do catálogo.');

    let clientes: ClienteResumo[] = [];
    let ids: string[] = [];
    if (servico.publico === 'PF') {
      ids = p.pessoa_fisica_id ? [p.pessoa_fisica_id] : [];
      clientes = [{ tipo: 'Produtor rural pessoa física' }];
    } else {
      ids = p.empresa_ids;
      const empresas = await this.prisma.empresa.findMany({ where: { id: { in: ids.slice(0, 5) } } });
      clientes = empresas.map((e) => ({
        tipo: 'Pessoa jurídica', regime: e.regime_atual, setor: e.setor, uf: e.uf, porte: e.porte, simples: e.opcao_simples,
        cnae: e.cnae_principal ? `${e.cnae_principal}${e.cnae_descricao ? ` — ${e.cnae_descricao}` : ''}` : null,
        produtorRural: e.produtor_rural, contribuinteIbsCbs: e.contribuinte_ibs_cbs, cooperativa: e.cooperativa,
      }));
    }
    const porBase = SERVICOS_POR_DATA_BASE.includes(servico.id);
    return {
      servico: { id: servico.id, nome: servico.nome, area: servico.area, publico: servico.publico },
      referencia: porBase ? { tipo: 'data-base', de: iso(p.periodo_inicio), ate: null } : { tipo: 'período', de: iso(p.periodo_inicio), ate: iso(p.periodo_fim) },
      situacaoDoProjeto: p.situacao, qtdClientes: ids.length, clientes,
      documentos: await this.documentos(servico.id, servico.publico, ids),
      achados: await this.achadosDoServico({ id: p.id, servico_consultoria: servico.id, empresa_ids: p.empresa_ids, pessoa_fisica_id: p.pessoa_fisica_id, periodo_inicio: p.periodo_inicio, periodo_fim: p.periodo_fim }),
    };
  }


  /** O que está guardado para o projeto (ou null). Registro ilegível conta como nenhum. */
  private async ler(projetoId: string): Promise<EstadoGuardado | null> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { chave: chaveRascunho(projetoId) } });
    if (!p) return null;
    try { return JSON.parse(p.valor) as EstadoGuardado; } catch { return null; }
  }

  private async gravar(projetoId: string, e: EstadoGuardado) {
    const valor = JSON.stringify(e);
    await this.prisma.parametroSistema.upsert({ where: { chave: chaveRascunho(projetoId) }, update: { valor }, create: { chave: chaveRascunho(projetoId), valor, descricao: 'Analisar com IA: último rascunho de parecer do projeto' } });
  }

  /** Estado da análise do projeto: o pedido em curso (ou o último erro) e o último rascunho pronto. Nunca fica "em andamento" além do prazo. */
  async estado(projetoId: string, agora = Date.now()): Promise<EstadoAnalise> {
    const g = await this.ler(projetoId);
    if (!g) return { estado: 'NENHUM', modo: null, iniciado_em: null, concluido_em: null, mensagem: null, ultimo: null, aviso: AVISO_RASCUNHO };
    if (g.estado === 'EM_ANDAMENTO' && g.iniciado_em && agora - Date.parse(g.iniciado_em) > PRAZO_MS[g.modo ?? 'pesquisa'] + MARGEM_INTERROMPIDO_MS) {
      return { ...g, estado: 'ERRO', concluido_em: null, mensagem: 'A análise foi interrompida antes de terminar. Tente de novo.', aviso: AVISO_RASCUNHO };
    }
    return { ...g, aviso: AVISO_RASCUNHO };
  }

  /**
   * Botão "Analisar com IA" (modo rápido, padrão) ou "Aprofundar com pesquisa externa". Devolve na hora: o trabalho segue em segundo plano
   * e o resultado fica guardado no projeto. Se já houver um pedido em curso, devolve o estado dele sem abrir outro.
   */
  async iniciar(projetoId: string, email: string, modo: ModoRascunho = 'rapido'): Promise<EstadoAnalise> {
    if (modo !== 'rapido' && modo !== 'pesquisa') throw new BadRequestException('Modo de análise inválido.');
    const ctx = await this.montarContexto(projetoId);
    const roteiro = roteiroDe(ctx.servico.id);
    if (!roteiro) throw new BadRequestException('Este serviço ainda não tem roteiro de análise.');
    const atual = await this.estado(projetoId);
    if (atual.estado === 'EM_ANDAMENTO') return atual;
    const base = { modo, ultimo: atual.ultimo };
    if (!this.base.iaConfigurada()) {
      const e: EstadoGuardado = { ...base, estado: 'ERRO', iniciado_em: null, concluido_em: new Date().toISOString(), mensagem: 'A IA não está disponível neste servidor agora. Faça o parecer pelo roteiro do serviço; nada foi perdido.' };
      await this.gravar(projetoId, e);
      return { ...e, aviso: AVISO_RASCUNHO };
    }
    this.limite.consumir(email);
    const iniciado_em = new Date().toISOString();
    const e: EstadoGuardado = { ...base, estado: 'EM_ANDAMENTO', iniciado_em, concluido_em: null, mensagem: null };
    await this.gravar(projetoId, e);
    const trabalho = this.executar(projetoId, ctx, roteiro, modo, iniciado_em, atual.ultimo).finally(() => this.trabalhos.delete(projetoId));
    this.trabalhos.set(projetoId, trabalho);
    return { ...e, aviso: AVISO_RASCUNHO };
  }

  /** O pedido em curso deste processo (para testes e para o encerramento). */
  trabalhoEmCurso(projetoId: string): Promise<void> | undefined {
    return this.trabalhos.get(projetoId);
  }

  /** Trechos da base legal local ligados ao serviço (sem IA, só a busca no banco). Falha aqui não derruba o rascunho. */
  private async normasDoServico(ctx: ContextoProjeto, roteiro: Roteiro): Promise<Candidato[]> {
    try {
      return (await comPrazo(this.base.candidatos(`${ctx.servico.nome}. ${roteiro.foco}`, [ctx.servico.nome, roteiro.borda]), PRAZO_NORMAS_MS)).slice(0, MAX_NORMAS_RASCUNHO);
    } catch (e) {
      this.log.warn(`Trechos da base legal indisponíveis para o rascunho: ${(e as Error).message}`);
      return [];
    }
  }

  /** O trabalho em segundo plano: nunca lança; termina sempre em PRONTO ou ERRO, dentro do prazo do modo. */
  private async executar(projetoId: string, ctx: ContextoProjeto, roteiro: Roteiro, modo: ModoRascunho, iniciado_em: string, ultimo: RascunhoGuardado | null): Promise<void> {
    const prazo = PRAZO_MS[modo];
    const fim = (e: Omit<EstadoGuardado, 'modo' | 'iniciado_em' | 'concluido_em'>) => ({ ...e, modo, iniciado_em, concluido_em: new Date().toISOString() });
    let final: EstadoGuardado;
    try {
      const normas = modo === 'rapido' ? await this.normasDoServico(ctx, roteiro) : [];
      const prompt = montarPromptRascunho(ctx, roteiro, modo, normas);
      const r = modo === 'rapido' ? await comPrazo(this.base.iaComModelo(prompt, prazo), prazo) : await comPrazo(this.base.iaComBusca(prompt, prazo), prazo);
      const secoes = lerRascunho(r.texto);
      if (!secoes) {
        this.log.warn(`Rascunho descartado (resposta inválida) no projeto ${projetoId}`);
        final = fim({ estado: 'ERRO', mensagem: 'A IA não devolveu um rascunho utilizável desta vez. Tente de novo.', ultimo });
      } else {
        final = fim({ estado: 'PRONTO', mensagem: null, ultimo: { rascunho: rascunhoEmTexto(ctx.servico.nome, secoes), secoes, modelo: r.modelo, modo, gerado_em: new Date().toISOString(), servico: ctx.servico.nome } });
      }
    } catch (e) {
      const msg = (e as Error).message || '';
      this.log.warn(`Rascunho de IA (${modo}) falhou no projeto ${projetoId}: ${msg}`);
      const segundos = Math.round(prazo / 1000);
      final = fim({
        estado: 'ERRO', ultimo,
        mensagem: /prazo|tempo|timeout|abort/i.test(msg)
          ? `A IA passou do prazo de ${segundos} segundos e o pedido foi encerrado. Tente de novo${modo === 'pesquisa' ? ' ou use o rascunho rápido' : ''}.`
          : 'A IA falhou desta vez. Tente de novo em instantes.',
      });
    }
    try {
      // Outro pedido pode ter começado depois que este foi dado como interrompido: só grava se ainda for o pedido da vez.
      const agora = await this.ler(projetoId);
      if (!agora || agora.iniciado_em === iniciado_em) await this.gravar(projetoId, final);
    } catch (e) {
      this.log.error(`Não foi possível guardar o rascunho do projeto ${projetoId}: ${(e as Error).message}`);
    }
  }
}
