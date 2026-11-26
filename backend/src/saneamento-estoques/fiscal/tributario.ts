/**
 * Camada TRIBUTARIO: um caso por CONJUNTO (mesmo NCM + mesma finalidade), nunca por item.
 * Sem NCM válido ou sem finalidade o caso é "aguardando informação". Exceções por item vêm de fora (decisões já registradas).
 */
import { AnalisadorCamada, Camada, CasoProposto, ContextoAnalise, Evidencia, ItemTrabalho, ResultadoCamada, ROTULO_CENARIO, ROTULO_FINALIDADE, Cenario } from '../tipos';
import { CatalogosFiscais } from './catalogos';
import { Enquadramento, ExcecaoItem, agruparConjuntos, aplicarExcecao, enquadrar } from './enquadramento';
import { cenariosAplicaveis } from './cenarios';

/** Dependências entre camadas (plano, seção 4): o que passa a "revisar" quando a camada tem caso aprovado/alterado. */
export const AFETA: Partial<Record<Camada, Camada[]>> = {
  IDENTIFICACAO: ['NCM', 'TRIBUTARIO', 'OBRIGACOES'],
  QUALIDADE: [],
  DUPLICIDADE: ['OBRIGACOES'],
  GRUPOS_FINALIDADE: ['TRIBUTARIO', 'OBRIGACOES'],
  NOMES_UNIDADES: ['DUPLICIDADE', 'OBRIGACOES'],
  NCM: ['TRIBUTARIO', 'OBRIGACOES'],
  TRIBUTARIO: ['OBRIGACOES'],
  OBRIGACOES: [],
};

export type OpcoesTributario = {
  /** Exceções já registradas por item (id do item → exceção). */
  excecoes?: Record<string, ExcecaoItem>;
};

const informada = (it: ItemTrabalho): string => String(it.campos?.cClassTrib ?? it.campos?.c_class_trib ?? '').trim();
const nomeCenario = (c: Cenario) => ROTULO_CENARIO[c];

export class AnalisadorTributario implements AnalisadorCamada {
  readonly camada = 'TRIBUTARIO' as const;
  constructor(private readonly catalogos: CatalogosFiscais, private readonly opcoes: OpcoesTributario = {}) {}

  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada {
    const casos: CasoProposto[] = []; const semProblema: string[] = [];
    const afeta = AFETA.TRIBUTARIO ?? [];
    const excecoes = this.opcoes.excecoes ?? {};
    let aguardandoItens = 0;

    for (const [chave, grupo] of agruparConjuntos(itens)) {
      const [ncm, fin] = chave.split('|');
      const ids = grupo.map((i) => i.id);
      const finalidade = grupo[0].finalidade;
      const base = { camada: 'TRIBUTARIO' as const, itens: ids, origem: 'REGRA' as const, afeta, impactos: ['Impacto nas obrigações (SPED/NF-e): conferir a camada de obrigações'] };

      if (ncm === 'SEM_NCM' || fin === 'SEM_FINALIDADE') {
        aguardandoItens += ids.length;
        const faltas = [ncm === 'SEM_NCM' ? 'NCM de 8 dígitos' : '', fin === 'SEM_FINALIDADE' ? 'finalidade' : ''].filter(Boolean).join(' e ');
        casos.push({
          ...base, tipo: ncm === 'SEM_NCM' ? 'AGUARDANDO_NCM' : 'AGUARDANDO_FINALIDADE',
          problema: `${ids.length} item(ns) sem ${faltas}: o enquadramento não pode ser feito`,
          evidencia: [{ rotulo: 'Conjunto', valor: chave }, { rotulo: 'Itens', valor: String(ids.length) }],
          atual: { ncm: ncm === 'SEM_NCM' ? null : ncm, finalidade: finalidade ?? null }, proposta: {},
          justificativa: `Aguardando informação: ${faltas}.`, fundamento: null,
        });
        continue;
      }

      const aplicaveis = cenariosAplicaveis(finalidade!);
      const enqs: Enquadramento[] = aplicaveis.map((c) => enquadrar(ncm, finalidade, c, contexto.dataBase, this.catalogos));
      const pendente = enqs.find((e) => e.status === 'AGUARDANDO_INFORMACAO') ?? (enqs.length === 0 ? enquadrar(ncm, finalidade, 'COMPRA_REVENDA', contexto.dataBase, this.catalogos) : null);
      if (pendente) {
        aguardandoItens += ids.length;
        casos.push({
          ...base, tipo: 'AGUARDANDO_INFORMACAO', problema: `Enquadramento do conjunto ${ncm} × ${ROTULO_FINALIDADE[finalidade!]} aguarda informação`,
          evidencia: [{ rotulo: 'Conjunto', valor: `${ncm} × ${ROTULO_FINALIDADE[finalidade!]}` }, { rotulo: 'Itens', valor: String(ids.length) }],
          atual: { ncm, finalidade: finalidade! }, proposta: {}, justificativa: pendente.motivoSeAguardando ?? 'Sem base para enquadrar', fundamento: null,
        });
        continue;
      }

      const ref = enqs[0];
      const evidencia: Evidencia[] = [{ rotulo: 'Conjunto', valor: `${ncm} × ${ROTULO_FINALIDADE[finalidade!]}` }, { rotulo: 'Itens no conjunto', valor: String(ids.length) }];
      for (const e of enqs) evidencia.push({ rotulo: nomeCenario(e.cenario), valor: e.credito ? `${e.credito.situacao}: ${e.credito.descricao}` : '—' });

      // itens cuja classe informada já bate com a proposta: sem problema; os demais entram no caso do conjunto
      const aberto: ItemTrabalho[] = [];
      for (const it of grupo) {
        const ex = excecoes[it.id];
        if (ex) {
          const e = aplicarExcecao(ref, ex, contexto.dataBase, this.catalogos);
          casos.push({
            ...base, itens: [it.id], tipo: 'EXCECAO_ITEM', problema: `Exceção ao conjunto ${ncm} × ${ROTULO_FINALIDADE[finalidade!]}`,
            evidencia: [{ rotulo: 'Motivo', valor: ex.motivo }, { rotulo: 'Herdado', valor: ref.cClassTrib ?? '—' }],
            atual: { cClassTrib: informada(it) || null }, proposta: { cClassTrib: e.cClassTrib, cst: e.cst, origem: 'EXCECAO' },
            justificativa: e.status === 'DEFINIDO' ? ex.motivo : e.motivoSeAguardando ?? 'Exceção inválida', fundamento: e.enquadramentoLegal,
          });
        } else if (informada(it) && informada(it) === ref.cClassTrib) semProblema.push(it.id);
        else aberto.push(it);
      }
      if (aberto.length > 0) {
        casos.push({
          ...base, itens: aberto.map((i) => i.id), tipo: 'ENQUADRAMENTO_CONJUNTO',
          problema: `Enquadrar ${aberto.length} item(ns) do conjunto ${ncm} × ${ROTULO_FINALIDADE[finalidade!]}`,
          evidencia,
          atual: { cClassTrib: informada(aberto[0]) || null },
          proposta: { cClassTrib: ref.cClassTrib, cst: ref.cst, enquadramentoLegal: ref.enquadramentoLegal, artigo: ref.artigo, origem: 'HERDADO' },
          justificativa: ref.observacao || 'Enquadramento pela tabela da SVRS e pelos anexos da LC 214 carregados',
          fundamento: [ref.artigo, ref.vigencia?.inicio ? `cClassTrib ${ref.cClassTrib} vigente desde ${ref.vigencia.inicio}` : null].filter(Boolean).join(' · ') || null,
        });
      }
    }
    const semDados = aguardandoItens > 0 ? { motivo: 'NCM de 8 dígitos, finalidade ou base legal ausentes para o enquadramento', itens: aguardandoItens } : null;
    return { camada: 'TRIBUTARIO', analisados: itens.length, semDados, casos, semProblema };
  }
}
