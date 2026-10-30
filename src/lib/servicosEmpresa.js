// Serviços da tela "Serviços e análises" de cada empresa: [rota, título, descrição].
// A lista de solicitações ao cliente (src/lib/listaSolicitacoes) tem uma lista para cada serviço daqui; um teste avisa se algum ficar sem.
export const SERVICOS = [
  ["importacao-xml", "Diagnóstico tributário", "Importe XML (NF-e, CT-e) ou uma planilha de operações, revise e consulte o painel."],
  ["validador-cadastro", "Validação de cadastro", "Conferência rápida de uma planilha: NCM, cClassTrib e duplicidades."],
  ["saneamento-estoque", "Saneamento de estoques", "Projeto completo, passo a passo, até a política de uso."],
  ["classificacao-servicos", "Classificação de serviços", "Correlação entre LC 116, NBS, cIndOp e cClassTrib."],
  ["validador-nfse", "Validação de NFS-e", "Confira os documentos de serviço desta empresa."],
];
