/**
 * Funções previstas para as fases 3 e 4 (dependem de contrato ou conta externa), tiradas de docs/mapa-completo-veri-intax.csv.
 * As páginas "em breve" e a Análise de risco mostram daqui o que falta e do que depende. Gerado do CSV; não editar à mão.
 */
export const FUNCOES_PREVISTAS = [
 {
  "id": "V041",
  "funcao": "DASN-SIMEI (ausência e irregularidade)",
  "destino": "BPO > Monitoramento > MEI",
  "fase": "3",
  "depende": "o Serpro ainda não liberou a DASN-SIMEI no Integra Contador (\"Em construção\" no catálogo oficial); até lá, a omissão aparece no relatório de situação fiscal",
  "modulo": "monitoramento"
 },
 {
  "id": "V066",
  "funcao": "Pós-análise por IA (análises mensais)",
  "destino": "BPO > Análise de risco",
  "fase": "3",
  "depende": "depende de dados reais do monitoramento e da chave de IA no servidor",
  "modulo": "analise-risco"
 },
 {
  "id": "V067",
  "funcao": "Assistente de IA para análise fiscal (chat)",
  "destino": "BPO > Análise de risco",
  "fase": "3",
  "depende": "depende de dados reais do monitoramento e da chave de IA no servidor",
  "modulo": "analise-risco"
 },
 {
  "id": "V095",
  "funcao": "Comunicados por WhatsApp",
  "destino": "Comercial > Comunicação",
  "fase": "4",
  "depende": "Ext (agente de WhatsApp)",
  "modulo": "comunicados"
 },
 {
  "id": "V108",
  "funcao": "WhatsApps enviados e lista de bloqueio",
  "destino": "Administração > Logs de envio",
  "fase": "4",
  "depende": "Ext (agente de WhatsApp)",
  "modulo": "comunicacoes"
 },
 {
  "id": "V122",
  "funcao": "Envio em lote por e-mail e WhatsApp (guias, avisos)",
  "destino": "Comercial > Comunicação",
  "fase": "2 e 4",
  "depende": "Ext",
  "modulo": "comunicados"
 }
];

export const DEPENDE = { Rec: "Receita Federal pelo Integra Contador (Serpro)", Ext: "conta ou contrato externo", Cad: "cadastro", "—": "nada externo" };

/** As funções previstas de um módulo, em ordem. */
export const funcoesDoModulo = (moduloId) => FUNCOES_PREVISTAS.filter((f) => f.modulo === moduloId);
