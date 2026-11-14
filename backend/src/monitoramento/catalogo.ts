/**
 * Catálogo dos serviços do Integra Contador que o InTAX usa no monitoramento. Códigos (idSistema, idServico, versão, endpoint) e formato dos
 * dados de entrada conferidos na documentação oficial do Serpro e no ambiente de demonstração em 11/11/2026:
 * https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/catalogo_de_servicos/
 */
import { SERVICOS_INFOSIMPLES } from './infosimples';
import type { ConsultaInfosimples } from './infosimples/base';

export type Grupo = 'situacao' | 'declaracoes' | 'guias' | 'mensagens' | 'parcelamentos' | 'mei' | 'procuracoes' | 'processos';
export type Alvo = 'PJ' | 'PF' | 'TODOS';
export type TipoParametro = 'ano' | 'periodo' | 'texto' | 'numero' | 'data';
export type Parametro = { nome: string; rotulo: string; tipo: TipoParametro; padrao?: (hoje: Date) => string; obrigatorio?: boolean; opcoes?: { valor: string; rotulo: string }[] };
export type Servico = {
  chave: string;
  rotulo: string;
  grupo: Grupo;
  sistema: string;
  servico: string;
  versao: string;
  endpoint: 'Apoiar' | 'Consultar' | 'Declarar' | 'Emitir' | 'Monitorar';
  alvo: Alvo;
  /** Só para quem é do Simples (SN), MEI ou tem a obrigação; serve de dica na tela e para a rotina automática. */
  para?: 'SIMPLES' | 'MEI' | 'NORMAL';
  parametros: Parametro[];
  /** Monta o campo "dados" (texto JSON) a partir dos parâmetros. */
  dados: (p: Record<string, string>) => string;
  /** O que mandar no ambiente de demonstração (o trial só responde aos exemplos oficiais). */
  demo: { contribuinte: { numero: string; tipo: 1 | 2 }; dados: string; contratante?: { numero: string; tipo: 1 | 2 }; autor?: { numero: string; tipo: 1 | 2 } };
  /** Entra na consulta automática (rotina) e na atualização em lote. */
  rotina?: boolean;
  /** Obrigação que esta consulta acompanha (para "sem obrigação" e para a ausência). */
  obrigacao?: string;
  descricao: string;
  /** Ação que muda dados na Receita: exige confirmação explícita (texto mostrado antes de executar) e nunca roda em lote nem na rotina. */
  acao?: string;
  /** Fonte da consulta: Integra Contador (padrão) ou Infosimples (portais oficiais estaduais, municipais e federais sem API). */
  fonte?: 'INFOSIMPLES';
  /** UFs atendidas (só Infosimples; vazio = todas). */
  ufs?: string[];
  infosimples?: ConsultaInfosimples;
};

const PJ0 = { numero: '00000000000000', tipo: 2 as const };
const PJ100 = { numero: '00000000000100', tipo: 2 as const };
const PJ9 = { numero: '99999999999999', tipo: 2 as const };
const PF9 = { numero: '99999999999', tipo: 1 as const };
const PF0 = { numero: '00000000000', tipo: 1 as const };
const PJ101 = { numero: '00000000000101', tipo: 2 as const };
const aaaammdd = (iso: string) => iso.replace(/-/g, '');
/** Data de pagamento opcional: em branco, a guia sai com a data que o Serpro calcular. */
const P_PAGAMENTO: Parametro = { nome: 'pagamento', rotulo: 'Data de pagamento (opcional)', tipo: 'data' };
const PJ1 = { numero: '11111111111111', tipo: 2 as const };
const j = (o: unknown) => JSON.stringify(o);

const ano = (desloc = 0) => (h: Date) => String(h.getFullYear() + desloc);
/** Período AAAAMM do mês anterior (a competência que vence agora). */
const mesAnterior = (h: Date) => { const d = new Date(h.getFullYear(), h.getMonth() - 1, 1); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`; };
const P_ANO: Parametro = { nome: 'ano', rotulo: 'Ano', tipo: 'ano', padrao: ano(0), obrigatorio: true };
const P_ANO_ANTERIOR: Parametro = { nome: 'ano', rotulo: 'Ano-calendário', tipo: 'ano', padrao: ano(-1), obrigatorio: true };
const P_PERIODO: Parametro = { nome: 'periodo', rotulo: 'Competência (AAAAMM)', tipo: 'periodo', padrao: mesAnterior, obrigatorio: true };

/** Campos do Sicalc (DARF em atraso ou avulso), iguais nos serviços 51, 53 e 54. */
const P_SICALC: Parametro[] = [
      { nome: 'receita', rotulo: 'Código da receita com extensão (ex.: 2089-01)', tipo: 'texto', obrigatorio: true },
      { nome: 'apuracao', rotulo: 'Período de apuração (MM/AAAA)', tipo: 'texto', padrao: (h) => { const d = new Date(h.getFullYear(), h.getMonth() - 1, 1); return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }, obrigatorio: true },
      { nome: 'vencimento', rotulo: 'Vencimento original', tipo: 'data', obrigatorio: true },
      { nome: 'valor', rotulo: 'Valor principal (R$)', tipo: 'numero', obrigatorio: true },
      { nome: 'pagamento', rotulo: 'Data de pagamento', tipo: 'data', padrao: (h) => h.toISOString().slice(0, 10), obrigatorio: true },
    ];
const dadosSicalc = (p: Record<string, string>) => {
      const [codigo, extensao] = String(p.receita).replace(/\s/g, '').split('-');
      if (!/^\d{4}$/.test(codigo ?? '') || !/^\d{2}$/.test(extensao ?? '')) throw new Error('Código da receita: use 4 dígitos, hífen e a extensão de 2 dígitos (ex.: 2089-01).');
      if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(String(p.apuracao))) throw new Error('Período de apuração: use MM/AAAA (ex.: 09/2026).');
      const valor = Number(String(p.valor).replace(/\./g, '').replace(',', '.'));
      if (!(valor > 0)) throw new Error('Valor principal: informe um valor maior que zero.');
      return j({ codigoReceita: codigo, codigoReceitaExtensao: extensao, tipoPA: 'ME', dataPA: p.apuracao, vencimento: `${p.vencimento}T00:00:00`, valorImposto: valor.toFixed(2), dataConsolidacao: `${p.pagamento}T00:00:00`, observacao: 'Emitido pelo InTAX' });
};

/** Os 8 parcelamentos do Simples e do MEI têm os mesmos serviços, com códigos diferentes. */
const PARCELAMENTOS: { sistema: string; nome: string; base: number; para: 'SIMPLES' | 'MEI'; demo: { pedidos: string; parcela: string; numero: number; mes: number; numeroPagamento?: number } }[] = [
  { sistema: 'PARCSN', nome: 'Parcelamento do Simples', base: 160, para: 'SIMPLES', demo: { pedidos: '', parcela: j({ parcelaParaEmitir: 202306 }), numero: 1, mes: 201612 } },
  { sistema: 'PARCSN-ESP', nome: 'Parcelamento especial do Simples', base: 170, para: 'SIMPLES', demo: { pedidos: '', parcela: j({ parcelaParaEmitir: 202306 }), numero: 9001, mes: 201612 } },
  { sistema: 'PERTSN', nome: 'PERT do Simples', base: 180, para: 'SIMPLES', demo: { pedidos: '', parcela: j({ parcelaParaEmitir: 202301 }), numero: 9102, mes: 201806 } },
  { sistema: 'RELPSN', nome: 'RELP do Simples', base: 190, para: 'SIMPLES', demo: { pedidos: '', parcela: j({ parcelaParaEmitir: 202308 }), numero: 9131, mes: 201806 } },
  { sistema: 'PARCMEI', nome: 'Parcelamento do MEI', base: 200, para: 'MEI', demo: { pedidos: '', parcela: j({ parcelaParaEmitir: 202107 }), numero: 1, mes: 202107 } },
  { sistema: 'PARCMEI-ESP', nome: 'Parcelamento especial do MEI', base: 210, para: 'MEI', demo: { pedidos: '', parcela: j({ parcelaParaEmitir: 202107 }), numero: 9001, mes: 202111 } },
  { sistema: 'PERTMEI', nome: 'PERT do MEI', base: 220, para: 'MEI', demo: { pedidos: '', parcela: j({ parcelaParaEmitir: 202306 }), numero: 9001, mes: 201907, numeroPagamento: 9101 } },
  { sistema: 'RELPMEI', nome: 'RELP do MEI', base: 230, para: 'MEI', demo: { pedidos: '', parcela: j({ parcelaParaEmitir: 202304 }), numero: 9131, mes: 202303 } },
];

const servicosDeParcelamento: Servico[] = PARCELAMENTOS.flatMap((p) => {
  const id = p.sistema.toLowerCase();
  return [
    {
      chave: `${id}-pedidos`, rotulo: `${p.nome}: pedidos e situação`, grupo: 'parcelamentos', sistema: p.sistema, servico: `PEDIDOSPARC${p.base + 3}`, versao: '1.0',
      endpoint: 'Consultar', alvo: 'PJ', para: p.para, parametros: [], dados: () => '', demo: { contribuinte: PJ0, dados: '' }, rotina: true,
      descricao: 'Todos os pedidos de parcelamento, com a situação de cada um.',
    },
    {
      chave: `${id}-parcelas`, rotulo: `${p.nome}: parcelas para emitir`, grupo: 'parcelamentos', sistema: p.sistema, servico: `PARCELASPARAGERAR${p.base + 2}`, versao: '1.0',
      endpoint: 'Consultar', alvo: 'PJ', para: p.para, parametros: [], dados: () => '', demo: { contribuinte: PJ0, dados: '' }, rotina: true,
      descricao: 'As parcelas que podem ser emitidas agora (em aberto).',
    },
    {
      chave: `${id}-das`, rotulo: `${p.nome}: emitir o DAS da parcela`, grupo: 'parcelamentos', sistema: p.sistema, servico: `GERARDAS${p.base + 1}`, versao: '1.0',
      endpoint: 'Emitir', alvo: 'PJ', para: p.para, parametros: [{ nome: 'parcela', rotulo: 'Parcela (AAAAMM)', tipo: 'periodo', padrao: (h) => `${h.getFullYear()}${String(h.getMonth() + 1).padStart(2, '0')}`, obrigatorio: true }],
      dados: (x) => j({ parcelaParaEmitir: Number(x.parcela) }), demo: { contribuinte: PJ0, dados: p.demo.parcela },
      descricao: 'O DAS (PDF) da parcela escolhida.',
    },
    {
      chave: `${id}-detalhe`, rotulo: `${p.nome}: detalhe do parcelamento`, grupo: 'parcelamentos', sistema: p.sistema, servico: `OBTERPARC${p.base + 4}`, versao: '1.0',
      endpoint: 'Consultar', alvo: 'PJ', para: p.para, parametros: [{ nome: 'numero', rotulo: 'Número do parcelamento', tipo: 'numero', obrigatorio: true }],
      dados: (x) => j({ numeroParcelamento: Number(x.numero) }), demo: { contribuinte: PJ0, dados: j({ numeroParcelamento: p.demo.numero }) },
      descricao: 'Situação, valores consolidados, parcelas pagas e a pagar de um parcelamento (o número vem em "pedidos e situação").',
    },
    {
      chave: `${id}-pagamento`, rotulo: `${p.nome}: pagamento de uma parcela`, grupo: 'parcelamentos', sistema: p.sistema, servico: `DETPAGTOPARC${p.base + 5}`, versao: '1.0',
      endpoint: 'Consultar', alvo: 'PJ', para: p.para,
      parametros: [{ nome: 'numero', rotulo: 'Número do parcelamento', tipo: 'numero', obrigatorio: true }, { nome: 'parcela', rotulo: 'Parcela (AAAAMM)', tipo: 'periodo', obrigatorio: true }],
      dados: (x) => j({ numeroParcelamento: Number(x.numero), anoMesParcela: Number(x.parcela) }), demo: { contribuinte: PJ0, dados: j({ numeroParcelamento: p.demo.numeroPagamento ?? p.demo.numero, anoMesParcela: p.demo.mes }) },
      descricao: 'O pagamento de uma parcela: data, valor pago e DAS usado.',
    },
  ] as Servico[];
});

export const SERVICOS: Servico[] = [
  // Situação
  {
    chave: 'sitfis', rotulo: 'Relatório de situação fiscal', grupo: 'situacao', sistema: 'SITFIS', servico: 'RELATORIOSITFIS92', versao: '2.0', endpoint: 'Emitir', alvo: 'TODOS',
    parametros: [], dados: () => '', demo: { contribuinte: PF9, dados: j({ protocoloRelatorio: '+S7N6c04XNZUVzmxWT7SzpkZA4xeDQC9Z2T2GBJ5usn8LyouyWXbsy6mKsLy7/EImRkDjF4NAL25KiSXOLjnzAaZu/FC+G1pYOtTMYqokKYYr/yZ6aqUiCuWPfujDQ2/udwgU+Dyh56GSe28B5Ev25jDnzpvVJPhiebO5hpy1YESP5gnEhaP3bocCiZZrYG26F8avRRBJhRTsfv3Rvop+bxvYJZsVym270eO8oZTDIr3OJj==' }), contratante: PJ0, autor: PJ0 }, rotina: true,
    descricao: 'O relatório de situação fiscal da Receita e da PGFN (pendências, débitos, dívida ativa, omissões), em PDF. Pede o protocolo e espera o relatório.',
  },
  {
    chave: 'dte', rotulo: 'Domicílio Tributário Eletrônico (DTE)', grupo: 'situacao', sistema: 'DTE', servico: 'CONSULTASITUACAODTE111', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ',
    parametros: [], dados: () => '', demo: { contribuinte: PJ9, dados: '', contratante: PJ1, autor: PJ1 }, rotina: true, descricao: 'Se a empresa é optante do DTE (a caixa postal vale como intimação).',
  },
  {
    chave: 'regime-anos', rotulo: 'Regime de apuração (caixa ou competência) por ano', grupo: 'situacao', sistema: 'REGIMEAPURACAO', servico: 'CONSULTARANOSCALENDARIOS102', versao: '1.0',
    endpoint: 'Consultar', alvo: 'PJ', para: 'SIMPLES', parametros: [], dados: () => '', demo: { contribuinte: PJ0, dados: '' }, descricao: 'O regime de reconhecimento de receita (caixa ou competência) escolhido em cada ano no Simples.',
  },
  // Declarações
  {
    chave: 'pgdasd-declaracoes', rotulo: 'PGDAS-D: declarações do ano', grupo: 'declaracoes', sistema: 'PGDASD', servico: 'CONSDECLARACAO13', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'SIMPLES',
    parametros: [P_ANO], dados: (p) => j({ anoCalendario: p.ano }), demo: { contribuinte: PJ0, dados: j({ anoCalendario: '2018' }) }, rotina: true, obrigacao: 'PGDASD',
    descricao: 'Cada competência do ano com as declarações transmitidas e os DAS gerados.',
  },
  {
    chave: 'pgdasd-ultima', rotulo: 'PGDAS-D: recibo e declaração da competência', grupo: 'declaracoes', sistema: 'PGDASD', servico: 'CONSULTIMADECREC14', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'SIMPLES',
    parametros: [P_PERIODO], dados: (p) => j({ periodoApuracao: p.periodo }), demo: { contribuinte: PJ0, dados: j({ periodoApuracao: '201801' }) }, obrigacao: 'PGDASD',
    descricao: 'A última declaração da competência, com o recibo e a declaração em PDF (e a MAED, se houver).',
  },
  {
    chave: 'defis', rotulo: 'DEFIS: declarações entregues', grupo: 'declaracoes', sistema: 'DEFIS', servico: 'CONSDECLARACAO142', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'SIMPLES',
    parametros: [], dados: () => '', demo: { contribuinte: PJ0, dados: '' }, rotina: true, obrigacao: 'DEFIS', descricao: 'As DEFIS entregues, por ano-calendário.',
  },
  {
    chave: 'defis-recibo', rotulo: 'DEFIS: recibo e declaração do ano', grupo: 'declaracoes', sistema: 'DEFIS', servico: 'CONSULTIMADECREC143', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'SIMPLES',
    parametros: [P_ANO_ANTERIOR], dados: (p) => j({ ano: Number(p.ano) }), demo: { contribuinte: PJ0, dados: j({ ano: 2021 }) }, obrigacao: 'DEFIS', descricao: 'A última DEFIS do ano, com recibo e declaração em PDF.',
  },
  {
    chave: 'dctfweb-recibo', rotulo: 'DCTFWeb: recibo de transmissão', grupo: 'declaracoes', sistema: 'DCTFWEB', servico: 'CONSRECIBO32', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'NORMAL',
    parametros: [P_PERIODO], dados: (p) => j({ categoria: 'GERAL_MENSAL', anoPA: p.periodo.slice(0, 4), mesPA: p.periodo.slice(4, 6) }),
    demo: { contribuinte: PJ0, dados: j({ categoria: 'GERAL_MENSAL', anoPA: '2027', mesPA: '11', numeroReciboEntrega: 24573 }) }, rotina: true, obrigacao: 'DCTFWEB',
    descricao: 'O recibo da DCTFWeb da competência (se não houver, a declaração não foi transmitida).',
  },
  {
    chave: 'dctfweb-completa', rotulo: 'DCTFWeb: declaração completa', grupo: 'declaracoes', sistema: 'DCTFWEB', servico: 'CONSDECCOMPLETA33', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'NORMAL',
    parametros: [P_PERIODO], dados: (p) => j({ categoria: 'GERAL_MENSAL', anoPA: p.periodo.slice(0, 4), mesPA: p.periodo.slice(4, 6) }),
    demo: { contribuinte: PJ0, dados: j({ categoria: 'GERAL_MENSAL', anoPA: '2027', mesPA: '11', numeroReciboEntrega: 24573 }) }, obrigacao: 'DCTFWEB',
    descricao: 'O relatório completo da DCTFWeb da competência, com débitos e créditos (PDF).',
  },
  {
    chave: 'mit', rotulo: 'MIT: apurações', grupo: 'declaracoes', sistema: 'MIT', servico: 'LISTAAPURACOES317', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'NORMAL',
    parametros: [P_ANO], dados: (p) => j({ anoApuracao: Number(p.ano) }), demo: { contribuinte: PJ0, dados: j({ mesApuracao: 1, anoApuracao: 2025, situacaoApuracao: 3 }) }, rotina: true, obrigacao: 'MIT',
    descricao: 'As apurações do MIT (Módulo de Inclusão de Tributos da DCTFWeb) no ano, com a situação e o valor.',
  },

  // Consultas e emissões incluídas em 12/11/2026 (catálogo oficial de 15/10/2026; exemplos conferidos no ambiente de demonstração).
  {
    chave: 'pgdasd-declaracao', rotulo: 'PGDAS-D: uma declaração com recibo', grupo: 'declaracoes', sistema: 'PGDASD', servico: 'CONSDECREC15', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'SIMPLES',
    parametros: [{ nome: 'numero', rotulo: 'Número da declaração', tipo: 'texto', obrigatorio: true }], dados: (p) => j({ numeroDeclaracao: p.numero }), demo: { contribuinte: PJ0, dados: j({ numeroDeclaracao: '00000000201801001' }) }, obrigacao: 'PGDASD',
    descricao: 'A declaração do PGDAS-D e o recibo (PDF) pelo número da declaração (o número vem em "declarações do ano").',
  },
  {
    chave: 'das-processo', rotulo: 'DAS do Simples: débito de processo em cobrança', grupo: 'guias', sistema: 'PGDASD', servico: 'GERARDASPROCESSO18', versao: '1.0', endpoint: 'Emitir', alvo: 'PJ', para: 'SIMPLES',
    parametros: [{ nome: 'processo', rotulo: 'Número do processo', tipo: 'texto', obrigatorio: true }], dados: (p) => j({ numeroProcesso: p.processo }), demo: { contribuinte: PJ0, dados: j({ numeroProcesso: '00000000000000000' }) },
    descricao: 'O DAS (PDF) de um débito do Simples que está em processo de cobrança.',
  },
  {
    chave: 'regime-opcao', rotulo: 'Regime de apuração: opção do ano', grupo: 'situacao', sistema: 'REGIMEAPURACAO', servico: 'CONSULTAROPCAOREGIME103', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'SIMPLES',
    parametros: [P_ANO], dados: (p) => j({ anoCalendario: Number(p.ano) }), demo: { contribuinte: PJ0, dados: j({ anoCalendario: 2023 }) },
    descricao: 'A opção pelo regime de caixa ou de competência no ano, com o demonstrativo (PDF).',
  },
  {
    chave: 'regime-resolucao', rotulo: 'Regime de apuração: resolução do regime de caixa', grupo: 'situacao', sistema: 'REGIMEAPURACAO', servico: 'CONSULTARRESOLUCAO104', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'SIMPLES',
    parametros: [P_ANO], dados: (p) => j({ anoCalendario: Number(p.ano) }), demo: { contribuinte: PJ0, dados: j({ anoCalendario: 2021 }) },
    descricao: 'O texto da resolução do regime de caixa do ano.',
  },
  {
    chave: 'defis-declaracao', rotulo: 'DEFIS: uma declaração com recibo', grupo: 'declaracoes', sistema: 'DEFIS', servico: 'CONSDECREC144', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'SIMPLES',
    parametros: [{ nome: 'id', rotulo: 'Número da DEFIS (idDefis)', tipo: 'texto', obrigatorio: true }], dados: (p) => j({ idDefis: p.id }), demo: { contribuinte: PJ0, dados: j({ idDefis: '000000002021002' }) }, obrigacao: 'DEFIS',
    descricao: 'Uma DEFIS e o recibo (PDF) pelo número (o número vem em "DEFIS: declarações entregues").',
  },
  {
    chave: 'das-mei-codbarra', rotulo: 'DAS do MEI: código de barras', grupo: 'mei', sistema: 'PGMEI', servico: 'GERARDASCODBARRA22', versao: '1.0', endpoint: 'Emitir', alvo: 'PJ', para: 'MEI',
    parametros: [P_PERIODO], dados: (p) => j({ periodoApuracao: p.periodo }), demo: { contribuinte: PJ100, dados: j({ periodoApuracao: '201901' }), contratante: PJ100, autor: PJ100 },
    descricao: 'O código de barras do DAS do MEI da competência, para pagar sem o PDF.',
  },
  {
    chave: 'ccmei-situacao', rotulo: 'CCMEI: situação dos MEI do CPF', grupo: 'mei', sistema: 'CCMEI', servico: 'CCMEISITCADASTRAL123', versao: '1.0', endpoint: 'Consultar', alvo: 'PF',
    parametros: [], dados: () => '', demo: { contribuinte: PF0, dados: '' }, descricao: 'A situação cadastral de todos os CNPJs de MEI ligados ao CPF.',
  },
  {
    chave: 'dctfweb-xml', rotulo: 'DCTFWeb: XML da declaração', grupo: 'declaracoes', sistema: 'DCTFWEB', servico: 'CONSXMLDECLARACAO38', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'NORMAL',
    parametros: [P_PERIODO], dados: (p) => j({ categoria: 'GERAL_MENSAL', anoPA: p.periodo.slice(0, 4), mesPA: p.periodo.slice(4, 6) }),
    demo: { contribuinte: PF0, dados: j({ categoria: 'PF_MENSAL', anoPA: '2022', mesPA: '06' }), contratante: PF0, autor: PF0 }, obrigacao: 'DCTFWEB',
    descricao: 'O arquivo XML da DCTFWeb da competência, como transmitido.',
  },
  {
    chave: 'mit-apuracao', rotulo: 'MIT: uma apuração', grupo: 'declaracoes', sistema: 'MIT', servico: 'CONSAPURACAO316', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'NORMAL',
    parametros: [{ nome: 'id', rotulo: 'Número da apuração (idApuracao)', tipo: 'numero', obrigatorio: true }], dados: (p) => j({ idApuracao: Number(p.id) }), demo: { contribuinte: PJ0, dados: j({ idApuracao: 0 }) }, obrigacao: 'MIT',
    descricao: 'Os débitos e a situação de uma apuração do MIT (o número vem em "MIT: apurações").',
  },
  {
    chave: 'caixa-postal-mensagem', rotulo: 'Caixa postal: ler uma mensagem', grupo: 'mensagens', sistema: 'CAIXAPOSTAL', servico: 'MSGDETALHAMENTO62', versao: '1.0', endpoint: 'Consultar', alvo: 'TODOS',
    parametros: [{ nome: 'isn', rotulo: 'Número da mensagem (ISN)', tipo: 'texto', obrigatorio: true }], dados: (p) => j({ isn: p.isn }), demo: { contribuinte: PJ0, dados: j({ isn: '0000082838' }) },
    descricao: 'O texto completo de uma mensagem da caixa postal (o número vem na lista de mensagens).',
  },

  // Incluídos em 12/11/2026 (grupos 1 e 2 do catálogo oficial). Consultas e cálculos:
  {
    chave: 'darf-sicalc-codbarra', rotulo: 'DARF em atraso (Sicalc): código de barras', grupo: 'guias', sistema: 'SICALC', servico: 'GERARDARFCODBARRA53', versao: '2.9', endpoint: 'Emitir', alvo: 'TODOS',
    parametros: P_SICALC, dados: dadosSicalc,
    demo: { contribuinte: PJ9, dados: j({ uf: 'SP', municipio: '7107', codigoReceita: '1162', codigoReceitaExtensao: '01', tipoPA: 'ME', dataPA: '01/2022', vencimento: '2022-02-18T00:00:00', valorImposto: '1000.00', dataConsolidacao: '2022-08-08T00:00:00', observacao: 'Darf calculado' }), contratante: PJ9, autor: PJ9 },
    descricao: 'O mesmo cálculo do DARF em atraso, devolvendo o código de barras para pagar no banco.',
  },
  {
    chave: 'darf-sicalc-calculo', rotulo: 'DARF em atraso (Sicalc): só o cálculo', grupo: 'guias', sistema: 'SICALC', servico: 'CONSOLIDAR54', versao: '2.9', endpoint: 'Emitir', alvo: 'TODOS',
    parametros: P_SICALC, dados: dadosSicalc,
    demo: { contribuinte: PF9, dados: j({ uf: 'SP', municipio: '7107', codigoReceita: '0190', codigoReceitaExtensao: '01', tipoPA: 'ME', dataPA: '12/2017', vencimento: '2018-01-31T00:00:00', valorImposto: '1000.00', dataConsolidacao: '2022-08-08T00:00:00', observacao: 'Darf calculado' }), contratante: PJ9, autor: PF9 },
    descricao: 'Calcula principal, multa e juros até a data de pagamento, sem emitir guia (para conferir ou orçar).',
  },
  {
    chave: 'sicalc-receita', rotulo: 'Sicalc: códigos e extensões de uma receita', grupo: 'guias', sistema: 'SICALC', servico: 'CONSULTAAPOIORECEITAS52', versao: '2.9', endpoint: 'Apoiar', alvo: 'TODOS',
    parametros: [{ nome: 'codigo', rotulo: 'Código da receita (4 dígitos)', tipo: 'texto', obrigatorio: true }],
    dados: (p) => { if (!/^\d{4}$/.test(String(p.codigo).trim())) throw new Error('Código da receita: use 4 dígitos (ex.: 2089).'); return j({ codigoReceita: String(p.codigo).trim() }); },
    demo: { contribuinte: PF0, dados: j({ codigoReceita: '6106' }), contratante: PJ0, autor: PF0 },
    descricao: 'As extensões de um código de receita e os campos que cada uma exige, para preencher o DARF em atraso.',
  },
  {
    chave: 'pagamentos-contagem', rotulo: 'Pagamentos: quantos no período', grupo: 'guias', sistema: 'PAGTOWEB', servico: 'CONTACONSDOCARRPG73', versao: '1.0', endpoint: 'Consultar', alvo: 'TODOS',
    parametros: [
      { nome: 'de', rotulo: 'De', tipo: 'data', padrao: (h) => new Date(h.getFullYear(), h.getMonth() - 3, 1).toISOString().slice(0, 10), obrigatorio: true },
      { nome: 'ate', rotulo: 'Até', tipo: 'data', padrao: (h) => h.toISOString().slice(0, 10), obrigatorio: true },
    ],
    dados: (p) => j({ intervaloDataArrecadacao: { dataInicial: p.de, dataFinal: p.ate } }),
    demo: { contribuinte: PF9, dados: j({ intervaloDataArrecadacao: { dataInicial: '2019-09-01', dataFinal: '2019-11-30' } }), contratante: PF9, autor: PF9 },
    descricao: 'Quantos documentos de arrecadação foram pagos no período (sem listar).',
  },
  {
    chave: 'mit-situacao-encerramento', rotulo: 'MIT: situação do encerramento', grupo: 'declaracoes', sistema: 'MIT', servico: 'SITUACAOENC315', versao: '1.0', endpoint: 'Apoiar', alvo: 'PJ', para: 'NORMAL',
    parametros: [{ nome: 'protocolo', rotulo: 'Protocolo do encerramento', tipo: 'texto', obrigatorio: true }], dados: (p) => j({ protocoloEncerramento: p.protocolo }),
    demo: { contribuinte: PJ0, dados: j({ protocoloEncerramento: '2fc4NTscrGXWTl4xbCX9rw==' }) }, obrigacao: 'MIT',
    descricao: 'Se o encerramento de uma apuração do MIT já chegou à DCTFWeb (situação e data).',
  },
  // Ações (mudam dados na Receita; só com confirmação):
  {
    chave: 'regime-opcao-efetuar', rotulo: 'Regime de apuração: registrar a opção do ano', grupo: 'situacao', sistema: 'REGIMEAPURACAO', servico: 'EFETUAROPCAOREGIME101', versao: '1.0', endpoint: 'Declarar', alvo: 'PJ', para: 'SIMPLES',
    parametros: [P_ANO, { nome: 'regime', rotulo: 'Regime', tipo: 'texto', obrigatorio: true, opcoes: [{ valor: 'CAIXA', rotulo: 'Caixa' }, { valor: 'COMPETENCIA', rotulo: 'Competência' }] }],
    dados: (p) => {
      const r = String(p.regime).toUpperCase();
      if (r !== 'CAIXA' && r !== 'COMPETENCIA') throw new Error('Regime: escolha Caixa ou Competência.');
      // tipoRegime: 1 = CAIXA (exemplo oficial); 0 = COMPETÊNCIA (não confirmado na documentação; o descritivo reforça a escolha).
      return j({ anoOpcao: Number(p.ano), tipoRegime: r === 'CAIXA' ? 1 : 0, descritivoRegime: r, deAcordoResolucao: true });
    },
    demo: { contribuinte: PJ0, dados: j({ anoOpcao: 2023, tipoRegime: 1, descritivoRegime: 'CAIXA', deAcordoResolucao: true }) },
    descricao: 'Registra na Receita a opção pelo regime de caixa ou de competência do ano (Simples Nacional), com o demonstrativo em PDF.',
    acao: 'Registrar na Receita a opção pelo regime de apuração deste cliente? A opção vale para o ano inteiro e, no regime de caixa, implica concordar com a resolução do CGSN.',
  },
  {
    chave: 'mei-beneficio', rotulo: 'MEI: informar benefício previdenciário', grupo: 'mei', sistema: 'PGMEI', servico: 'ATUBENEFICIO23', versao: '1.0', endpoint: 'Emitir', alvo: 'PJ', para: 'MEI',
    parametros: [P_ANO, { nome: 'periodos', rotulo: 'Competências (AAAAMM, separadas por vírgula)', tipo: 'texto', obrigatorio: true }, { nome: 'beneficio', rotulo: 'Houve benefício?', tipo: 'texto', obrigatorio: true, opcoes: [{ valor: 'sim', rotulo: 'Sim' }, { valor: 'nao', rotulo: 'Não' }] }],
    dados: (p) => {
      const lista = String(p.periodos).split(/[,;\s]+/).filter(Boolean);
      if (!lista.length || lista.some((x) => !/^\d{4}(0[1-9]|1[0-2])$/.test(x) || x.slice(0, 4) !== String(p.ano))) throw new Error('Competências: use AAAAMM do mesmo ano, separadas por vírgula (ex.: 202601, 202602).');
      return j({ anoCalendario: Number(p.ano), infoBeneficio: lista.map((x) => ({ periodoApuracao: x, indicadorBeneficio: p.beneficio === 'sim' })) });
    },
    demo: { contribuinte: PJ101, dados: j({ anoCalendario: 2026, infoBeneficio: [{ periodoApuracao: '202601', indicadorBeneficio: true }, { periodoApuracao: '202602', indicadorBeneficio: true }] }), contratante: PJ101, autor: PJ101 },
    descricao: 'Registra no PGMEI se houve benefício previdenciário nas competências (muda o DAS do MEI).',
    acao: 'Registrar no PGMEI a informação de benefício previdenciário para estas competências? Isso muda o valor do DAS do MEI.',
  },
  {
    chave: 'dctfweb-transmitir', rotulo: 'DCTFWeb: transmitir a declaração em andamento', grupo: 'declaracoes', sistema: 'DCTFWEB', servico: 'TRANSDECLARACAO310', versao: '1.0', endpoint: 'Declarar', alvo: 'PJ', para: 'NORMAL',
    parametros: [P_PERIODO], dados: (p) => j({ categoria: 'GERAL_MENSAL', anoPA: p.periodo.slice(0, 4), mesPA: p.periodo.slice(4, 6), xmlAssinadoBase64: p.xmlAssinadoBase64 ?? '' }),
    demo: { contribuinte: PJ0, dados: j({ categoria: 'GERAL_MENSAL', anoPA: '2022', mesPA: '04', xmlAssinadoBase64: 'AQUI_VAI_TEXTOBASE64ASSINADO' }) }, obrigacao: 'DCTFWEB',
    descricao: 'Baixa o XML da DCTFWeb em andamento (montada pelo eSocial e pela Reinf), assina com o certificado do autor do pedido (A1 do cliente ou do escritório) e transmite. Devolve o recibo.',
    acao: 'Transmitir à Receita a DCTFWeb desta competência, assinada digitalmente? A transmissão é uma entrega oficial da declaração.',
  },
  // Guias e pagamentos
  {
    chave: 'das', rotulo: 'DAS do Simples: gerar a guia', grupo: 'guias', sistema: 'PGDASD', servico: 'GERARDAS12', versao: '1.0', endpoint: 'Emitir', alvo: 'PJ', para: 'SIMPLES',
    parametros: [P_PERIODO, P_PAGAMENTO], dados: (p) => j({ periodoApuracao: p.periodo, ...(p.pagamento ? { dataConsolidacao: aaaammdd(p.pagamento) } : {}) }), demo: { contribuinte: PJ100, dados: j({ periodoApuracao: '201801' }) },
    descricao: 'O DAS da competência (PDF), com valor, vencimento e composição por tributo. Com a data de pagamento, sai consolidado para aquela data (multa e juros, se em atraso).',
  },
  {
    chave: 'das-avulso', rotulo: 'DAS do Simples: DAS avulso', grupo: 'guias', sistema: 'PGDASD', servico: 'GERARDASAVULSO19', versao: '1.0', endpoint: 'Emitir', alvo: 'PJ', para: 'SIMPLES',
    parametros: [
      P_PERIODO,
      { nome: 'tributo', rotulo: 'Código do tributo no Simples (ex.: 1001)', tipo: 'numero', obrigatorio: true },
      { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'numero', obrigatorio: true },
      { nome: 'uf', rotulo: 'UF (só ICMS)', tipo: 'texto' },
      { nome: 'municipio', rotulo: 'Código do município (só ISS)', tipo: 'texto' },
    ],
    dados: (p) => {
      const valor = Number(String(p.valor).replace(/\./g, '').replace(',', '.'));
      if (!(valor > 0)) throw new Error('Valor: informe um valor maior que zero.');
      if (p.uf && !/^[A-Za-z]{2}$/.test(p.uf)) throw new Error('UF: use a sigla com 2 letras.');
      return j({ PeriodoApuracao: Number(p.periodo), ListaTributos: [{ Codigo: Number(p.tributo), Valor: valor, ...(p.municipio ? { CodMunicipio: Number(p.municipio) } : {}), ...(p.uf ? { uf: p.uf.toUpperCase() } : {}) }] });
    },
    demo: { contribuinte: PJ0, dados: j({ PeriodoApuracao: 202401, ListaTributos: [{ Codigo: 1, Valor: 111.22, CodMunicipio: 375, uf: 'PA' }, { Codigo: 1, Valor: 20.5, uf: 'RJ' }, { Codigo: 1001, Valor: 100 }] }) },
    descricao: 'O DAS (PDF) de um tributo do Simples avulso na competência, com o valor informado.',
  },
  {
    chave: 'das-cobranca', rotulo: 'DAS do Simples: débito em cobrança', grupo: 'guias', sistema: 'PGDASD', servico: 'GERARDASCOBRANCA17', versao: '1.0', endpoint: 'Emitir', alvo: 'PJ', para: 'SIMPLES',
    parametros: [P_PERIODO], dados: (p) => j({ periodoApuracao: p.periodo }), demo: { contribuinte: PJ0, dados: j({ periodoApuracao: '202301' }) },
    descricao: 'O DAS de uma competência que já foi para cobrança (débito em atraso enviado à Receita), em PDF.',
  },
  {
    chave: 'das-extrato', rotulo: 'DAS do Simples: extrato', grupo: 'guias', sistema: 'PGDASD', servico: 'CONSEXTRATO16', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'SIMPLES',
    parametros: [{ nome: 'numero', rotulo: 'Número do DAS', tipo: 'texto', obrigatorio: true }], dados: (p) => j({ numeroDas: p.numero }), demo: { contribuinte: PJ0, dados: j({ numeroDas: '07202136999997159' }) },
    descricao: 'O extrato de um DAS já gerado (PDF).',
  },
  {
    chave: 'dctfweb-guia', rotulo: 'DCTFWeb: DARF da competência', grupo: 'guias', sistema: 'DCTFWEB', servico: 'GERARGUIA31', versao: '1.0', endpoint: 'Emitir', alvo: 'PJ', para: 'NORMAL',
    parametros: [P_PERIODO, { nome: 'pagamento', rotulo: 'Data de pagamento (opcional; dia útil deste mês)', tipo: 'data' }],
    dados: (p) => j({ categoria: 'GERAL_MENSAL', anoPA: p.periodo.slice(0, 4), mesPA: p.periodo.slice(4, 6), ...(p.pagamento ? { DataAcolhimentoProposta: Number(aaaammdd(p.pagamento)) } : {}) }),
    demo: { contribuinte: PJ0, dados: j({ categoria: 'GERAL_MENSAL', anoPA: '2027', mesPA: '11', numeroReciboEntrega: 24573 }) },
    descricao: 'O DARF de todos os débitos da DCTFWeb transmitida (PDF). Em atraso, informe a data de pagamento (dia útil do mês corrente, a partir de hoje) e o DARF sai com multa e juros.',
  },
  {
    chave: 'dctfweb-guia-andamento', rotulo: 'DCTFWeb: DARF da declaração em andamento', grupo: 'guias', sistema: 'DCTFWEB', servico: 'GERARGUIAANDAMENTO313', versao: '1.0', endpoint: 'Emitir', alvo: 'PJ', para: 'NORMAL',
    parametros: [P_PERIODO], dados: (p) => j({ categoria: 'GERAL_MENSAL', anoPA: p.periodo.slice(0, 4), mesPA: p.periodo.slice(4, 6) }),
    demo: { contribuinte: PJ0, dados: j({ categoria: 'GERAL_MENSAL', anoPA: '2025', mesPA: '01' }) }, descricao: 'O DARF da DCTFWeb ainda não transmitida (PDF).',
  },
  {
    chave: 'darf-sicalc', rotulo: 'DARF avulso ou em atraso (Sicalc)', grupo: 'guias', sistema: 'SICALC', servico: 'CONSOLIDARGERARDARF51', versao: '2.9', endpoint: 'Emitir', alvo: 'TODOS',
    parametros: P_SICALC,
    dados: dadosSicalc,
    demo: { contribuinte: PF9, dados: j({ uf: 'SP', municipio: '7107', codigoReceita: '0190', codigoReceitaExtensao: '01', tipoPA: 'ME', dataPA: '12/2017', vencimento: '2018-01-31T00:00:00', valorImposto: '1000.00', dataConsolidacao: '2022-08-08T00:00:00', observacao: 'Darf calculado' }), contratante: PJ9, autor: PF9 },
    descricao: 'Calcula multa e juros até a data de pagamento e emite o DARF (PDF, com Pix) de um tributo federal em atraso ou avulso, pelo Sicalc da Receita.',
  },
  {
    chave: 'pagamentos', rotulo: 'Pagamentos (DARF, DAS, DAE)', grupo: 'guias', sistema: 'PAGTOWEB', servico: 'PAGAMENTOS71', versao: '1.0', endpoint: 'Consultar', alvo: 'TODOS',
    parametros: [
      { nome: 'de', rotulo: 'De', tipo: 'data', padrao: (h) => new Date(h.getFullYear(), h.getMonth() - 3, 1).toISOString().slice(0, 10), obrigatorio: true },
      { nome: 'ate', rotulo: 'Até', tipo: 'data', padrao: (h) => h.toISOString().slice(0, 10), obrigatorio: true },
    ],
    dados: (p) => j({ intervaloDataArrecadacao: { dataInicial: p.de, dataFinal: p.ate }, primeiroDaPagina: 0, tamanhoDaPagina: 100 }),
    demo: { contribuinte: PF9, dados: j({ intervaloDataArrecadacao: { dataInicial: '2019-09-01', dataFinal: '2019-11-30' }, primeiroDaPagina: 0, tamanhoDaPagina: 100 }), contratante: PJ9, autor: PF9 }, rotina: true,
    descricao: 'Os pagamentos arrecadados no período, com o número do documento para emitir o comprovante.',
  },
  {
    chave: 'comprovante', rotulo: 'Comprovante de pagamento', grupo: 'guias', sistema: 'PAGTOWEB', servico: 'COMPARRECADACAO72', versao: '1.0', endpoint: 'Emitir', alvo: 'TODOS',
    parametros: [{ nome: 'numero', rotulo: 'Número do documento', tipo: 'texto', obrigatorio: true }], dados: (p) => j({ numeroDocumento: p.numero }),
    demo: { contribuinte: PF9, dados: j({ numeroDocumento: '99999999999999999' }), contratante: PJ9, autor: PF9 }, descricao: 'O comprovante de arrecadação (PDF) de um pagamento.',
  },
  // Mensagens
  {
    chave: 'caixa-postal', rotulo: 'Caixa postal do e-CAC', grupo: 'mensagens', sistema: 'CAIXAPOSTAL', servico: 'MSGCONTRIBUINTE61', versao: '1.0', endpoint: 'Consultar', alvo: 'TODOS',
    parametros: [], dados: () => j({ statusLeitura: '0', indicadorPagina: '0' }), demo: { contribuinte: PJ9, dados: j({ statusLeitura: '0', indicadorPagina: '0' }) }, rotina: true,
    descricao: 'As mensagens da caixa postal (intimações, termos, avisos de malha), com as não lidas e a relevância.',
  },
  {
    chave: 'caixa-postal-novas', rotulo: 'Caixa postal: há mensagens novas?', grupo: 'mensagens', sistema: 'CAIXAPOSTAL', servico: 'INNOVAMSG63', versao: '1.0', endpoint: 'Monitorar', alvo: 'TODOS',
    parametros: [], dados: () => '', demo: { contribuinte: PF9, dados: '', contratante: PJ0, autor: PJ0 }, descricao: 'Só o indicador de mensagens novas (consulta rápida).',
  },
  // MEI
  {
    chave: 'ccmei', rotulo: 'CCMEI: dados do MEI', grupo: 'mei', sistema: 'CCMEI', servico: 'DADOSCCMEI122', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'MEI',
    parametros: [], dados: () => '', demo: { contribuinte: PJ0, dados: '' }, rotina: true, descricao: 'Os dados do certificado do MEI: situação, enquadramento e atividades.',
  },
  {
    chave: 'ccmei-pdf', rotulo: 'CCMEI: emitir o certificado', grupo: 'mei', sistema: 'CCMEI', servico: 'EMITIRCCMEI121', versao: '1.0', endpoint: 'Emitir', alvo: 'PJ', para: 'MEI',
    parametros: [], dados: () => '', demo: { contribuinte: PJ0, dados: '' }, descricao: 'O Certificado da Condição de MEI (PDF).',
  },
  {
    chave: 'das-mei', rotulo: 'DAS do MEI: gerar a guia', grupo: 'mei', sistema: 'PGMEI', servico: 'GERARDASPDF21', versao: '1.0', endpoint: 'Emitir', alvo: 'PJ', para: 'MEI',
    parametros: [P_PERIODO], dados: (p) => j({ periodoApuracao: p.periodo }), demo: { contribuinte: PJ100, dados: j({ periodoApuracao: '201901' }) }, descricao: 'O DAS do MEI da competência (PDF).',
  },
  {
    chave: 'divida-mei', rotulo: 'MEI: débitos em dívida ativa', grupo: 'mei', sistema: 'PGMEI', servico: 'DIVIDAATIVA24', versao: '1.0', endpoint: 'Consultar', alvo: 'PJ', para: 'MEI',
    parametros: [P_ANO_ANTERIOR], dados: (p) => j({ anoCalendario: p.ano }), demo: { contribuinte: PJ100, dados: j({ anoCalendario: '2020' }) }, rotina: true,
    descricao: 'Os débitos do MEI enviados à Procuradoria (dívida ativa) no ano.',
  },
  // Procurações
  {
    chave: 'procuracao', rotulo: 'Procuração eletrônica para o escritório', grupo: 'procuracoes', sistema: 'PROCURACOES', servico: 'OBTERPROCURACAO41', versao: '1', endpoint: 'Consultar', alvo: 'TODOS',
    parametros: [], dados: (p) => j({ outorgante: p.outorgante, tipoOutorgante: p.tipoOutorgante, outorgado: p.outorgado, tipoOutorgado: p.tipoOutorgado }),
    demo: { contribuinte: PF9, dados: j({ outorgante: '99999999999999', tipoOutorgante: '2', outorgado: '99999999999', tipoOutorgado: '1' }), contratante: PJ9, autor: PJ9 }, rotina: true,
    descricao: 'Se o cliente deu procuração eletrônica ao escritório no e-CAC, para quais serviços e até quando.',
  },
  // Processos
  {
    chave: 'eprocesso', rotulo: 'Processos digitais (e-Processo)', grupo: 'processos', sistema: 'EPROCESSO', servico: 'CONSPROCPORINTER271', versao: '2.0', endpoint: 'Consultar', alvo: 'TODOS',
    parametros: [], dados: () => '{}', demo: { contribuinte: PJ0, dados: '{}' }, descricao: 'Os processos digitais em que a empresa é interessada, com a situação.',
  },
  ...servicosDeParcelamento,
  ...SERVICOS_INFOSIMPLES,
];

export const SERVICO_POR_CHAVE = new Map(SERVICOS.map((s) => [s.chave, s]));

/** Os grupos (abas) na ordem da tela. */
export const GRUPOS: { id: Grupo; rotulo: string }[] = [
  { id: 'situacao', rotulo: 'Situação fiscal' },
  { id: 'declaracoes', rotulo: 'Declarações' },
  { id: 'guias', rotulo: 'Guias e pagamentos' },
  { id: 'mensagens', rotulo: 'Caixa postal' },
  { id: 'parcelamentos', rotulo: 'Parcelamentos' },
  { id: 'mei', rotulo: 'MEI' },
  { id: 'procuracoes', rotulo: 'Procuração' },
  { id: 'processos', rotulo: 'Processos' },
];

/** Obrigações que a empresa pode marcar como "não tem" (a ausência delas não conta). */
export const OBRIGACOES = [
  { id: 'PGDASD', rotulo: 'PGDAS-D (Simples)' },
  { id: 'DEFIS', rotulo: 'DEFIS (Simples)' },
  { id: 'DCTFWEB', rotulo: 'DCTFWeb' },
  { id: 'MIT', rotulo: 'MIT (DCTFWeb)' },
] as const;

/** Que serviços servem à empresa pelo regime do cadastro (Simples, MEI, normal) e pelo tipo (PJ ou PF). */
export function servicosParaEmpresa(regime: string | null | undefined, pessoaFisica = false, uf?: string | null): Servico[] {
  const r = String(regime || '').toLowerCase();
  const mei = r.includes('mei');
  const simples = !mei && r.includes('simples');
  const normal = !mei && !simples && !!r;
  return SERVICOS.filter((s) => {
    if (pessoaFisica) return s.alvo !== 'PJ';
    if (s.alvo === 'PF') return false;
    if (s.ufs?.length && uf && !s.ufs.includes(uf.toUpperCase())) return false;
    if (!r || !s.para) return true;
    return (s.para === 'MEI' && mei) || (s.para === 'SIMPLES' && simples) || (s.para === 'NORMAL' && normal);
  });
}

/** Parâmetros com os padrões preenchidos (o que veio da tela vence). Recusa parâmetro obrigatório vazio e formato errado. */
export function completarParametros(s: Servico, vindos: Record<string, unknown> = {}, hoje = new Date()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of s.parametros) {
    const v = String(vindos[p.nome] ?? '').trim() || (p.padrao ? p.padrao(hoje) : '');
    if (!v && p.obrigatorio) throw new Error(`Informe ${p.rotulo.toLowerCase()}.`);
    if (v && p.tipo === 'ano' && !/^\d{4}$/.test(v)) throw new Error(`${p.rotulo}: use 4 dígitos (ex.: 2026).`);
    if (v && p.tipo === 'periodo' && !/^\d{4}(0[1-9]|1[0-2])$/.test(v)) throw new Error(`${p.rotulo}: use AAAAMM (ex.: 202610).`);
    if (v && p.tipo === 'data' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${p.rotulo}: use AAAA-MM-DD.`);
    out[p.nome] = v;
  }
  for (const [k, v] of Object.entries(vindos)) if (!(k in out) && typeof v === 'string') out[k] = v;
  return out;
}

/** A competência fiscal é a do pedido ou do documento. A data da consulta não define o período. */
export function filtroDeCompetencia(competencia?: string): import('@prisma/client').Prisma.ConsultaFiscalWhereInput {
  if (!competencia || !/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return {};
  const mensais = SERVICOS.filter((s) => s.parametros.some((p) => p.tipo === 'periodo' && p.nome === 'periodo')).map((s) => s.chave);
  const anuais = SERVICOS.filter((s) => s.grupo === 'declaracoes' && s.parametros.some((p) => p.nome === 'ano')).map((s) => s.chave);
  const ano = competencia.slice(0, 4);
  const mes = competencia.slice(5);
  return { OR: [
    { chave: { notIn: [...mensais, ...anuais, 'mit-apuracao', 'pgdasd-declaracao'] } },
    { chave: { in: mensais }, parametros: { path: ['periodo'], equals: ano + mes } },
    { chave: { in: anuais }, parametros: { path: ['ano'], equals: ano } },
    { chave: 'pgdasd-declaracao', dados: { path: ['leitura_pgdasd', 'periodo'], equals: competencia } },
    { chave: 'mit-apuracao', AND: [
      { OR: [Number(ano), ano].map((equals) => ({ dados: { path: ['dadosApuracaoMit', 'PeriodoApuracao', 'AnoApuracao'], equals } })) },
      { OR: [Number(mes), mes, String(Number(mes))].map((equals) => ({ dados: { path: ['dadosApuracaoMit', 'PeriodoApuracao', 'MesApuracao'], equals } })) },
    ] },
  ] };
}
