import type { StatusProcesso } from './leitor-certidoes';

export type ChaveProcesso = 'EMPRESA' | 'CCC' | 'CERTIFICADO_CCC' | 'PGFN' | 'TRABALHISTA' | 'FGTS' | 'DIVIDA_ATIVA';

export type Processo = {
  chave: ChaveProcesso;
  status: StatusProcesso;
  resumo: string;
  /** Linhas rótulo/valor mostradas na tela e no PDF. */
  detalhes: { rotulo: string; valor: string }[];
  fonte: string;
  consultado_em: string | null;
  /** Arquivo guardado (certidão enviada ou comprovante gerado). */
  arquivo?: { key: string; nome: string; enviado_por?: string } | null;
  /** Consulta feita no ambiente de demonstração oficial (dados fictícios). */
  demonstracao?: boolean;
};

export type DefinicaoProcesso = { chave: ChaveProcesso; rotulo: string; fonte: string; portal: string | null; aceitaCertidao: boolean; como: string };

/** As sete consultas da pré-análise, na ordem do relatório. */
export const PROCESSOS: DefinicaoProcesso[] = [
  { chave: 'EMPRESA', rotulo: 'Consulta Empresa', fonte: 'Cadastro do CNPJ na Receita Federal (dados públicos)', portal: 'https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp', aceitaCertidao: false, como: 'Automática.' },
  { chave: 'CCC', rotulo: 'Consulta CCC', fonte: 'Cadastro Centralizado de Contribuintes do ICMS (web service da SEFAZ)', portal: 'https://dfe-portal.svrs.rs.gov.br/NFE/CCC', aceitaCertidao: false, como: 'Automática, com o certificado do escritório (Administração > Integrações).' },
  { chave: 'CERTIFICADO_CCC', rotulo: 'Certificado CCC', fonte: 'Comprovante da consulta ao CCC, emitido pelo InTAX com o retorno da SEFAZ', portal: null, aceitaCertidao: false, como: 'Gerado a partir da Consulta CCC.' },
  { chave: 'PGFN', rotulo: 'PGFN', fonte: 'Certidão de débitos relativos a tributos federais e à Dívida Ativa da União (Receita Federal e PGFN)', portal: 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj', aceitaCertidao: true, como: 'Automática pela API Consulta CND do Serpro, quando contratada; senão, emita no portal e anexe o PDF.' },
  { chave: 'TRABALHISTA', rotulo: 'Trabalhista', fonte: 'Certidão Negativa de Débitos Trabalhistas (CNDT, Tribunal Superior do Trabalho)', portal: 'https://cndt-certidao.tst.jus.br/inicio.faces', aceitaCertidao: true, como: 'O portal do TST tem verificação humana e não oferece API: emita lá e anexe o PDF; o InTAX lê a situação e a validade.' },
  { chave: 'FGTS', rotulo: 'FGTS', fonte: 'Certificado de Regularidade do FGTS (CRF, Caixa)', portal: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf', aceitaCertidao: true, como: 'O portal da Caixa tem verificação humana e não oferece API: emita lá e anexe o PDF; o InTAX lê a situação e a validade.' },
  { chave: 'DIVIDA_ATIVA', rotulo: 'Dívida Ativa', fonte: 'Inscrições em Dívida Ativa da União (PGFN)', portal: 'https://www.listadevedores.pgfn.gov.br/', aceitaCertidao: false, como: 'Automática pela API Consulta Dívida Ativa do Serpro, quando contratada; senão, consulte a lista de devedores da PGFN.' },
];

export const DEFINICAO = new Map(PROCESSOS.map((p) => [p.chave, p]));

export const ROTULO_STATUS: Record<StatusProcesso, string> = {
  PROCESSANDO: 'Processando',
  CONCLUIDO: 'Concluído',
  IRREGULAR: 'Irregular',
  DEBITOS: 'Débitos',
  INDISPONIVEL: 'Indisponível',
  MANUAL: 'Aguardando certidão',
};

export function processoInicial(chave: ChaveProcesso): Processo {
  return { chave, status: 'PROCESSANDO', resumo: 'Na fila.', detalhes: [], fonte: DEFINICAO.get(chave)!.fonte, consultado_em: null, arquivo: null };
}

/** Situação geral: Irregular ou Débitos se algum processo acusar; Processando enquanto houver fila; senão Concluído (com pendências). */
export function situacaoGeral(processos: Processo[]): { status: StatusProcesso; texto: string } {
  const n = (s: StatusProcesso) => processos.filter((p) => p.status === s).length;
  if (n('PROCESSANDO')) return { status: 'PROCESSANDO', texto: `Processando ${n('PROCESSANDO')} de ${processos.length} consultas.` };
  const problemas = n('IRREGULAR') + n('DEBITOS');
  const pendentes = n('MANUAL') + n('INDISPONIVEL');
  if (problemas) return { status: n('DEBITOS') ? 'DEBITOS' : 'IRREGULAR', texto: `${problemas} ponto(s) de atenção${pendentes ? ` e ${pendentes} consulta(s) pendente(s)` : ''}.` };
  if (pendentes) return { status: 'MANUAL', texto: `Nada irregular nas consultas feitas; ${pendentes} consulta(s) pendente(s).` };
  return { status: 'CONCLUIDO', texto: 'Todas as consultas concluídas sem pendências.' };
}
