import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BaseLegalService } from '../../base-legal/base-legal.service';
import { lerFontes } from '../../base-legal/pesquisa-externa';
import { LimiteUso, comPrazo, emParalelo } from '../../ia-consultoria/util';
import { PrismaService } from '../../prisma/prisma.service';
import { SanCasosService } from '../dados/casos.service';
import type { CasoParaParecer, ParecerIa, ParecerIaPort } from '../dados/portas';
import { CANDIDATOS_BORDA, motivoBorda, usaBusca, type Borda } from './borda';
import { lerParecer, montarPrompt, paraGravar, type LeiCarregada, type ParecerGravado, type Precedente } from './parecer';

/** Casos que ainda estão abertos (a IA não opina sobre o que já foi decidido). */
const SITUACOES_ABERTAS = ['PROPOSTO', 'RASCUNHO', 'AGUARDANDO_INFORMACAO'];
const MAX_POR_CHAMADA = 12;
/** Página da varredura dos casos candidatos a borda (só as colunas que a regra da borda lê). */
const PAGINA = 2000;
const CONCORRENCIA = 2;
/** Depois deste tempo o lote não começa caso novo: devolve o que fez e quantos faltam (a requisição não fica presa por minutos). */
const ORCAMENTO_LOTE_MS = 60_000;
/** A requisição do lote nunca passa de ~90 s: o último caso recebe só o tempo que sobra (mínimo 8 s, máximo 40 s). */
const TETO_REQUISICAO_MS = 90_000;
const PRAZO_SEM_BUSCA_MS = 90_000;
const PRAZO_COM_BUSCA_MS = 150_000;

export type Motivo = 'ok' | 'ia_indisponivel' | 'sem_resposta' | 'nao_e_borda' | 'caso_decidido';
export type ResultadoParecer = { parecer: ParecerGravado | null; motivo: Motivo };

type Caso = Awaited<ReturnType<PrismaService['sanCaso']['findUnique']>>;

/**
 * Parecer da IA nos casos de borda (porta SAN_PARECER_IA). Regras de ferro:
 * - a IA NUNCA aprova nem altera item: o único dado gravado é `parecer_ia` do caso (SanCasosService.definirParecerIa);
 * - falha, lentidão ou IA fora do ar = null, nunca erro para o usuário e nunca bloqueia o caso;
 * - roda por caso e em lotes pequenos, jamais sobre os milhares de itens.
 */
@Injectable()
export class ParecerIaService implements ParecerIaPort {
  private readonly log = new Logger(ParecerIaService.name);
  /** 150 casos por hora por usuário (cada parecer é uma chamada de IA, e as de tributário pesquisam na web). */
  private readonly limite = new LimiteUso(150, 60 * 60_000, 'Muitos pareceres de IA seguidos. Aguarde um pouco e continue pelos casos de borda restantes.');

  constructor(private readonly prisma: PrismaService, private readonly casos: SanCasosService, private readonly base: BaseLegalService) {}

  // ── Porta: só devolve o parecer; quem grava é gerarEGravar ─────────────────

  async parecer(caso: CasoParaParecer): Promise<ParecerIa | null> {
    return (await this.gerar(caso.casoId)).parecer;
  }

  // ── Contexto mínimo do caso ────────────────────────────────────────────────

  private async precedentes(c: NonNullable<Caso>): Promise<Precedente[]> {
    const aprovados = await this.prisma.sanCaso.findMany({
      where: { projeto_id: c.projeto_id, camada: c.camada, tipo: c.tipo, situacao: 'APROVADO', id: { not: c.id } },
      orderBy: [{ decidido_em: 'desc' }, { id: 'asc' }], take: 60,
    });
    if (!aprovados.length) return [];
    // Mesma família = mesmo tipo e o mesmo conjunto (NCM × finalidade) quando o caso tem conjunto.
    const chaveDe = async (ids: string[]) => {
      const itens = await this.prisma.sanItem.findMany({ where: { id: { in: ids } }, select: { id: true, conjunto_chave: true } });
      return new Map(itens.map((i) => [i.id, i.conjunto_chave]));
    };
    const meu = (await chaveDe(c.itens.slice(0, 1))).get(c.itens[0]) ?? null;
    let escolhidos = aprovados;
    if (meu) {
      const doConjunto = await chaveDe(aprovados.map((a) => a.itens[0]).filter(Boolean));
      escolhidos = aprovados.filter((a) => doConjunto.get(a.itens[0]) === meu);
    }
    return escolhidos.slice(0, 3).map((a) => ({ problema: a.problema, atual: a.atual, proposta: a.proposta, justificativa: a.justificativa, fundamento: a.fundamento }));
  }

  private async atividades(projetoId: string): Promise<string[]> {
    const l = await this.prisma.sanAtividade.findMany({ where: { projeto_id: projetoId, mantida: true }, orderBy: { codigo: 'asc' }, take: 20 });
    return l.map((a) => `${a.codigo} — ${a.descricao}`);
  }

  /** Texto de lei já carregado no InTAX (Base legal), só para casos fiscais ou com fundamento; falha da busca não impede o parecer. */
  private async leis(c: NonNullable<Caso>): Promise<LeiCarregada[]> {
    if (!(c.camada === 'TRIBUTARIO' || c.camada === 'OBRIGACOES' || c.fundamento)) return [];
    try {
      const cands = await this.base.candidatos(`${c.fundamento ?? ''} ${c.problema}`.slice(0, 300), []);
      return cands.slice(0, 3).map((x) => ({ rotulo: `${x.numero} — ${x.rotulo}`, texto: x.texto }));
    } catch (e) {
      this.log.warn(`Texto de lei indisponível para o parecer: ${(e as Error).message}`);
      return [];
    }
  }

  // ── Geração ────────────────────────────────────────────────────────────────

  /** Gera o parecer de um caso de borda. Nunca lança por falha da IA; não grava nada. */
  async gerar(casoId: string, prazoMs?: number): Promise<ResultadoParecer> {
    const c = await this.prisma.sanCaso.findUnique({ where: { id: casoId } });
    if (!c) throw new NotFoundException('Caso não encontrado.');
    const caso = {
      camada: c.camada as CasoParaParecer['camada'], tipo: c.tipo, problema: c.problema, evidencia: (c.evidencia ?? []) as CasoParaParecer['evidencia'],
      atual: (c.atual ?? {}) as CasoParaParecer['atual'], proposta: (c.proposta ?? {}) as CasoParaParecer['proposta'], justificativa: c.justificativa, fundamento: c.fundamento,
    };
    const borda = motivoBorda(caso);
    if (!borda) return { parecer: null, motivo: 'nao_e_borda' };
    if (!this.base.iaConfigurada()) return { parecer: null, motivo: 'ia_indisponivel' };
    try {
      const [atividades, precedentes, leis] = await Promise.all([this.atividades(c.projeto_id), this.precedentes(c), this.leis(c)]);
      const comBusca = usaBusca(borda);
      const prompt = montarPrompt({ caso, borda, atividades, precedentes, leis, comBusca });
      let texto: string, modelo: string | null = null, fontesDaBusca: ReturnType<typeof lerFontes> = [];
      if (comBusca) {
        const r = await comPrazo(this.base.iaComBusca(prompt), prazoMs ?? PRAZO_COM_BUSCA_MS);
        texto = r.texto; modelo = r.modelo; fontesDaBusca = lerFontes(r.grounding);
      } else {
        texto = await comPrazo(this.base.ia(prompt, prazoMs ?? PRAZO_SEM_BUSCA_MS), prazoMs ?? PRAZO_SEM_BUSCA_MS + 15_000);
        modelo = this.base.modeloAtual();
      }
      const lido = lerParecer(texto);
      if (!lido) { this.log.warn(`Parecer descartado (resposta inválida) no caso ${casoId}`); return { parecer: null, motivo: 'sem_resposta' }; }
      return { parecer: paraGravar(lido, { modelo, comBusca, borda, fontesDaBusca: fontesDaBusca.map((f) => ({ titulo: f.titulo, url: f.url, oficial: f.oficial })) }), motivo: 'ok' };
    } catch (e) {
      this.log.warn(`Parecer de IA falhou no caso ${casoId}: ${(e as Error).message}`);
      return { parecer: null, motivo: 'sem_resposta' };
    }
  }

  /** Gera e grava o parecer de um caso. Só `parecer_ia` muda; o caso e os itens ficam exatamente como estavam. */
  async gerarEGravar(casoId: string, email: string): Promise<ResultadoParecer> {
    const c = await this.prisma.sanCaso.findUnique({ where: { id: casoId } });
    if (!c) throw new NotFoundException('Caso não encontrado.');
    if (!SITUACOES_ABERTAS.includes(c.situacao)) return { parecer: null, motivo: 'caso_decidido' };
    if (!this.base.iaConfigurada()) return { parecer: null, motivo: 'ia_indisponivel' };
    this.limite.consumir(email);
    const r = await this.gerar(casoId);
    if (r.parecer) await this.casos.definirParecerIa(casoId, r.parecer);
    return r;
  }

  /** Pareceres dos casos de borda ainda sem parecer: até 50 por chamada, 2 ao mesmo tempo, dentro do orçamento de tempo. */
  async gerarLote(projetoId: string, email: string) {
    // A consulta já filtra as camadas e os tipos que podem ser borda (borda.ts) e percorre todos em páginas: nenhum caso de borda fica de fora
    // por estar depois de milhares de casos que a regra decide. Só a contagem e os primeiros 12 ficam em memória.
    const where = {
      projeto_id: projetoId, situacao: { in: SITUACOES_ABERTAS },
      OR: CANDIDATOS_BORDA.map((x) => (x.tipos ? { camada: x.camada, tipo: { in: x.tipos } } : { camada: x.camada })),
    };
    const fatia: { id: string }[] = [];
    let casosDeBorda = 0;
    let cursor: string | undefined;
    for (;;) {
      const pagina = await this.prisma.sanCaso.findMany({
        where: where as never, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: PAGINA, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, camada: true, tipo: true, problema: true, evidencia: true, atual: true, proposta: true, justificativa: true, parecer_ia: true },
      });
      for (const c of pagina) {
        if (c.parecer_ia || !motivoBorda({
          camada: c.camada as CasoParaParecer['camada'], tipo: c.tipo, problema: c.problema, evidencia: (c.evidencia ?? []) as CasoParaParecer['evidencia'],
          atual: (c.atual ?? {}) as CasoParaParecer['atual'], proposta: (c.proposta ?? {}) as CasoParaParecer['proposta'], justificativa: c.justificativa,
        })) continue;
        casosDeBorda++;
        if (fatia.length < MAX_POR_CHAMADA) fatia.push({ id: c.id });
      }
      if (pagina.length < PAGINA) break;
      cursor = pagina[pagina.length - 1].id;
    }
    const vazio = { casosDeBorda, tentados: 0, gerados: 0, semResposta: 0, restantes: casosDeBorda };
    if (!this.base.iaConfigurada()) return { iaDisponivel: false, ...vazio };
    if (!fatia.length) return { iaDisponivel: true, ...vazio };
    this.limite.consumir(email, fatia.length);

    const inicio = Date.now();
    const limiteTempo = inicio + ORCAMENTO_LOTE_MS;
    let tentados = 0, gerados = 0;
    await emParalelo(fatia, CONCORRENCIA, async (c) => {
      if (Date.now() > limiteTempo) return;
      tentados++;
      try {
        const prazo = Math.min(40_000, Math.max(8_000, inicio + TETO_REQUISICAO_MS - Date.now()));
        const r = await this.gerar(c.id, prazo);
        if (r.parecer) { await this.casos.definirParecerIa(c.id, r.parecer); gerados++; }
      } catch (e) {
        this.log.warn(`Lote de pareceres: caso ${c.id} falhou: ${(e as Error).message}`);
      }
    });
    return { iaDisponivel: true, casosDeBorda, tentados, gerados, semResposta: tentados - gerados, restantes: casosDeBorda - gerados, mensagem: casosDeBorda - gerados > 0 ? 'Repita para os demais casos de borda.' : null };
  }
}

export type { Borda };
