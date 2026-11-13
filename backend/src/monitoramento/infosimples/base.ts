import type { Grupo, Parametro, Servico } from '../catalogo';
import type { Resumo } from '../interpretar';

/** O que a consulta da Infosimples recebe do cadastro do cliente e dos parâmetros da tela. */
export type ContextoInfosimples = {
  cnpj: string;
  uf: string | null;
  municipio: string | null;
  codigoIbge: string | null;
  inscricaoEstadual: string | null;
  inscricaoMunicipal: string | null;
  params: Record<string, string>;
};

/** Resposta da Infosimples (https://api.infosimples.com/api/v2/consultas/<rota>). */
export type RespostaInfosimples = { code?: number; code_message?: string; data?: Record<string, unknown>[]; errors?: string[]; site_receipts?: string[]; header?: Record<string, unknown> };

export type ConsultaInfosimples = {
  /** Rota da consulta (ex.: "receita-federal/simples"); pode depender da UF do cliente. null = sem consulta para esse cliente. */
  rota: (c: ContextoInfosimples) => string | null;
  /** Parâmetros oficiais da consulta (o token e o timeout o InTAX põe). Lança Error com mensagem clara quando falta dado do cadastro. */
  parametros: (c: ContextoInfosimples) => Record<string, string>;
  /** Lê os dados devolvidos: nível, frase, destaques e tabela (padrão do monitoramento). */
  ler: (data: Record<string, unknown>[], r: RespostaInfosimples) => Resumo;
  /** Adicional por consulta da tabela da Infosimples, além do preço base (R$). */
  adicional?: number;
  /**
   * Quando a Infosimples responde que a consulta não retornou dados (código 612): em dívida ou lista de devedores, "nada consta"
   * é o resultado bom. Sem este gancho, a falta de dados vira alerta.
   */
  semDados?: (r: RespostaInfosimples) => Resumo;
};

/**
 * Serviço do monitoramento atendido pela Infosimples. Entra no mesmo catálogo do Integra Contador: aparece nas abas do cliente,
 * na agenda por serviço, no histórico (com envio e download), nas bolinhas da carteira e nos custos.
 */
export function servicoInfosimples(s: {
  chave: string;
  rotulo: string;
  grupo: Grupo;
  descricao: string;
  para?: 'SIMPLES' | 'MEI' | 'NORMAL';
  /** UFs atendidas (vazio = todas). Clientes de outras UFs não veem o serviço. */
  ufs?: string[];
  parametros?: Parametro[];
  rotina?: boolean;
  consulta: ConsultaInfosimples;
}): Servico {
  return {
    chave: s.chave, rotulo: s.rotulo, grupo: s.grupo, descricao: s.descricao, para: s.para, rotina: s.rotina,
    sistema: 'INFOSIMPLES', servico: s.chave, versao: '', endpoint: 'Consultar', alvo: 'PJ',
    parametros: s.parametros ?? [], dados: () => '{}', demo: { contribuinte: { numero: '', tipo: 2 }, dados: '{}' },
    fonte: 'INFOSIMPLES', ufs: s.ufs, infosimples: s.consulta,
  };
}

const txt = (v: unknown) => (v === null || v === undefined || typeof v === 'object' ? '' : String(v).trim());
export { txt };

/** Resposta sem sucesso da Infosimples em frase para a tela (código e mensagem oficiais). */
export function resumoDeFalha(r: RespostaInfosimples, http: number): Resumo {
  const msg = [r.code_message, ...(r.errors ?? [])].filter(Boolean).join(' ');
  const semCobertura = /n[aã]o est[aá] dispon[ií]vel uma consulta para/i.test(msg);
  return {
    nivel: semCobertura ? 'INFO' : 'ATENCAO',
    titulo: semCobertura ? 'Sem consulta automática para o estado ou município do cliente.' : `A Infosimples não trouxe o resultado (código ${r.code ?? http}): ${msg || 'sem mensagem'}.`,
    destaques: [],
  };
}
