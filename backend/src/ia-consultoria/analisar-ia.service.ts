import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { BaseLegalService } from '../base-legal/base-legal.service';
import { PrismaService } from '../prisma/prisma.service';
import { CATALOGO_CONSULTORIA, SERVICOS_POR_DATA_BASE } from '../servicos-contratados/consultoria.service';
import { AVISO_RASCUNHO, lerRascunho, montarPromptRascunho, rascunhoEmTexto, type ClienteResumo, type ContextoProjeto, type DocumentosResumo } from './contexto';
import { roteiroDe } from './roteiros';
import { LimiteUso, comPrazo } from './util';

/**
 * Achados que outro módulo já tem do serviço (ex.: o laudo da homologação). O integrador pode fornecer este token com uma função
 * `(projeto) => string[]`; sem ele, o contexto usa só o que este módulo lê sozinho (documentos e, no saneamento, os casos por situação).
 */
export const ACHADOS_IA = 'ACHADOS_IA';
export type ProvedorDeAchados = (projeto: { id: string; servico_consultoria: string; empresa_ids: string[]; pessoa_fisica_id: string | null; periodo_inicio: Date | null; periodo_fim: Date | null }) => Promise<string[]>;

const PRAZO_MS = 150_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export type MotivoRascunho = 'ok' | 'ia_indisponivel' | 'sem_resposta';

/** Botão "Analisar com IA" de todos os serviços de consultoria: monta o contexto padrão do projeto e devolve um RASCUNHO de parecer. Não grava nada. */
@Injectable()
export class AnalisarIaService {
  private readonly log = new Logger(AnalisarIaService.name);
  /** A pesquisa na web custa mais que a pergunta comum: 8 rascunhos a cada 10 minutos por usuário. */
  private readonly limite = new LimiteUso(8, 10 * 60_000, 'Muitos rascunhos seguidos. Aguarde alguns minutos e tente de novo.');

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

  /** Rascunho de parecer. IA fora do ar ou resposta inválida não é erro: devolve `motivo` e o texto de aviso. */
  async analisar(projetoId: string, email: string) {
    const ctx = await this.montarContexto(projetoId);
    const roteiro = roteiroDe(ctx.servico.id);
    if (!roteiro) throw new BadRequestException('Este serviço ainda não tem roteiro de análise.');
    const sem = (motivo: MotivoRascunho, mensagem: string) => ({ motivo, rascunho: null, secoes: null, modelo: null, aviso: AVISO_RASCUNHO, mensagem, servico: ctx.servico.nome });
    if (!this.base.iaConfigurada()) return sem('ia_indisponivel', 'A IA não está disponível neste servidor agora. Faça o parecer pelo roteiro do serviço; nada foi perdido.');
    this.limite.consumir(email);
    try {
      const r = await comPrazo(this.base.iaComBusca(montarPromptRascunho(ctx, roteiro)), PRAZO_MS);
      const secoes = lerRascunho(r.texto);
      if (!secoes) { this.log.warn(`Rascunho descartado (resposta inválida) no projeto ${projetoId}`); return sem('sem_resposta', 'A IA não devolveu um rascunho utilizável desta vez. Tente de novo em instantes.'); }
      return { motivo: 'ok' as const, rascunho: rascunhoEmTexto(ctx.servico.nome, secoes), secoes, modelo: r.modelo, aviso: AVISO_RASCUNHO, mensagem: null, servico: ctx.servico.nome };
    } catch (e) {
      this.log.warn(`Rascunho de IA falhou no projeto ${projetoId}: ${(e as Error).message}`);
      return sem('sem_resposta', 'A IA demorou ou falhou desta vez. Tente de novo em instantes.');
    }
  }
}
