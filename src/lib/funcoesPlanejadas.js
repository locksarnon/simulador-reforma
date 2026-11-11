/**
 * Funções previstas para as fases 3 e 4 (dependem de contrato ou conta externa), tiradas de docs/mapa-completo-veri-intax.csv.
 * As páginas "em breve" e a Análise de risco mostram daqui o que falta e do que depende. Gerado do CSV; não editar à mão.
 */
export const FUNCOES_PREVISTAS = [
 {
  "id": "V001",
  "funcao": "Diagnóstico fiscal PJ (situação fiscal e-CAC, histórico, baixar todos)",
  "destino": "BPO > Monitoramento > Situação",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V002",
  "funcao": "Sublimite do Simples (receita acumulada, % do limite, sócios)",
  "destino": "BPO > Monitoramento > Situação",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V003",
  "funcao": "Ausência de declarações (por regime, obrigações em falta)",
  "destino": "BPO > Monitoramento > Situação",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V004",
  "funcao": "Exclusão MEI/Simples (períodos e status)",
  "destino": "BPO > Monitoramento > Situação",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V005",
  "funcao": "Aviso de exclusão do Simples (previsão e dias restantes)",
  "destino": "BPO > Monitoramento > Situação",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V006",
  "funcao": "Dívida ativa (situação e detalhes)",
  "destino": "BPO > Monitoramento > Situação",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V007",
  "funcao": "E-processos (processo mais recente, situação, histórico)",
  "destino": "BPO > Monitoramento > Situação",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V008",
  "funcao": "PGDAS-D (transmissões, status, documentos)",
  "destino": "BPO > Monitoramento > Declarações e guias",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V009",
  "funcao": "DEFIS (por ano-calendário, status, recibo)",
  "destino": "BPO > Monitoramento > Declarações e guias",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V010",
  "funcao": "DCTFWeb (transmissão, débito apurado, saldo a pagar)",
  "destino": "BPO > Monitoramento > Declarações e guias",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V011",
  "funcao": "MIT (apuração mensal, situação, valor)",
  "destino": "BPO > Monitoramento > Declarações e guias",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V012",
  "funcao": "DAS: gerar, baixar, pago, duplicidade, extrato",
  "destino": "BPO > Monitoramento > Declarações e guias",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V013",
  "funcao": "DARF da DCTFWeb: gerar e baixar em lote",
  "destino": "BPO > Monitoramento > Declarações e guias",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V014",
  "funcao": "Comprovantes de pagamento (DARF, DAS, DAE, DJE por mês; baixar em lote)",
  "destino": "BPO > Monitoramento > Declarações e guias",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V015",
  "funcao": "Relatório de faturamento (Simples e regime normal; exige configuração)",
  "destino": "BPO > Monitoramento > Declarações e guias",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V016",
  "funcao": "Fator R (relatório por empresa)",
  "destino": "BPO > Monitoramento > Declarações e guias",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V017",
  "funcao": "Procurações (situação; consulta em lote)",
  "destino": "BPO > Monitoramento > Procurações e certificados",
  "fase": "3",
  "depende": "Rec",
  "modulo": "procuracoes"
 },
 {
  "id": "V019",
  "funcao": "Mensagens e-CAC (consultar novas, leitura, classificar, pontuais)",
  "destino": "BPO > Monitoramento > Mensagens",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V020",
  "funcao": "Malha fiscal",
  "destino": "BPO > Monitoramento > Mensagens",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V021",
  "funcao": "Termos da Receita (intimações)",
  "destino": "BPO > Monitoramento > Mensagens",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V022",
  "funcao": "CND federal (RFB/PGFN)",
  "destino": "BPO > Monitoramento > Certidões",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V023",
  "funcao": "CND estadual (por UF, validade, baixar todas)",
  "destino": "BPO > Monitoramento > Certidões",
  "fase": "3",
  "depende": "Rec (portal com captcha)",
  "modulo": "monitoramento"
 },
 {
  "id": "V024",
  "funcao": "CND trabalhista",
  "destino": "BPO > Monitoramento > Certidões",
  "fase": "3",
  "depende": "Rec (portal com captcha)",
  "modulo": "monitoramento"
 },
 {
  "id": "V025",
  "funcao": "CND FGTS",
  "destino": "BPO > Monitoramento > Certidões",
  "fase": "3",
  "depende": "Rec (portal com captcha)",
  "modulo": "monitoramento"
 },
 {
  "id": "V026",
  "funcao": "CND municipal",
  "destino": "BPO > Monitoramento > Certidões",
  "fase": "3",
  "depende": "Rec (portal por município)",
  "modulo": "monitoramento"
 },
 {
  "id": "V027",
  "funcao": "Relatório unificado de certidões",
  "destino": "BPO > Monitoramento > Certidões",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V028",
  "funcao": "Parcelamento do Simples (SN)",
  "destino": "BPO > Monitoramento > Parcelamentos",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V029",
  "funcao": "Parcelamento especial SN",
  "destino": "BPO > Monitoramento > Parcelamentos",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V030",
  "funcao": "PERT SN",
  "destino": "BPO > Monitoramento > Parcelamentos",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V031",
  "funcao": "RELP SN",
  "destino": "BPO > Monitoramento > Parcelamentos",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V032",
  "funcao": "Parcelamento MEI",
  "destino": "BPO > Monitoramento > Parcelamentos",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V033",
  "funcao": "Parcelamento especial MEI",
  "destino": "BPO > Monitoramento > Parcelamentos",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V034",
  "funcao": "PERT MEI",
  "destino": "BPO > Monitoramento > Parcelamentos",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V035",
  "funcao": "RELP MEI",
  "destino": "BPO > Monitoramento > Parcelamentos",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V036",
  "funcao": "Parcelamento PGFN (Sispar)",
  "destino": "BPO > Monitoramento > Parcelamentos",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V037",
  "funcao": "Ações em lote nos parcelamentos (atualizar, gerar DAS, enviar e-mails, baixar DAS)",
  "destino": "BPO > Monitoramento > Parcelamentos",
  "fase": "3",
  "depende": "Rec + e-mail",
  "modulo": "monitoramento"
 },
 {
  "id": "V038",
  "funcao": "CCMEI (status, atualizar em lote)",
  "destino": "BPO > Monitoramento > MEI",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V039",
  "funcao": "Diagnóstico fiscal MEI",
  "destino": "BPO > Monitoramento > MEI",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V040",
  "funcao": "DAS MEI (por competência, gerar em lote, recalcular)",
  "destino": "BPO > Monitoramento > MEI",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V041",
  "funcao": "DASN-SIMEI (ausência e irregularidade)",
  "destino": "BPO > Monitoramento > MEI",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V042",
  "funcao": "Optantes e excluídas do MEI",
  "destino": "BPO > Monitoramento > MEI",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V043",
  "funcao": "Dívida ativa MEI",
  "destino": "BPO > Monitoramento > MEI",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V044",
  "funcao": "Painel da pessoa física",
  "destino": "BPO > Monitoramento > Pessoa física",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V046",
  "funcao": "Mensagens e-CAC da pessoa física",
  "destino": "BPO > Monitoramento > Pessoa física",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V047",
  "funcao": "Situação fiscal da pessoa física",
  "destino": "BPO > Monitoramento > Pessoa física",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V048",
  "funcao": "CND federal da pessoa física",
  "destino": "BPO > Monitoramento > Pessoa física",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V049",
  "funcao": "CND trabalhista da pessoa física",
  "destino": "BPO > Monitoramento > Pessoa física",
  "fase": "3",
  "depende": "Rec (portal com captcha)",
  "modulo": "monitoramento"
 },
 {
  "id": "V050",
  "funcao": "Procurações da pessoa física",
  "destino": "BPO > Monitoramento > Pessoa física",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V053",
  "funcao": "Gestão à Vista 360° (resumo executivo e gráficos: entregas, ausências por obrigação e regime, diagnóstico, CNDs, evolução mensal)",
  "destino": "BPO > Análise de risco",
  "fase": "3",
  "depende": "Rec",
  "modulo": "analise-risco"
 },
 {
  "id": "V054",
  "funcao": "Top 5 empresas em risco, com score e nível",
  "destino": "BPO > Análise de risco",
  "fase": "3",
  "depende": "Rec",
  "modulo": "analise-risco"
 },
 {
  "id": "V056",
  "funcao": "Radar de CND (vencimentos das certidões)",
  "destino": "BPO > Análise de risco",
  "fase": "3",
  "depende": "Rec",
  "modulo": "analise-risco"
 },
 {
  "id": "V057",
  "funcao": "Fila de prioridade e ações rápidas",
  "destino": "BPO > Análise de risco",
  "fase": "3",
  "depende": "Rec",
  "modulo": "analise-risco"
 },
 {
  "id": "V058",
  "funcao": "Auditoria e cross-check dos dados",
  "destino": "BPO > Análise de risco",
  "fase": "3",
  "depende": "Rec",
  "modulo": "analise-risco"
 },
 {
  "id": "V062",
  "funcao": "Indicadores por módulo (diagnóstico, caixa postal, PGDAS, CNDs, DCTFWeb, ausências, sublimite; PJ, PF, parcelamentos, cobrança)",
  "destino": "BPO > Análise de risco",
  "fase": "3",
  "depende": "Rec",
  "modulo": "analise-risco"
 },
 {
  "id": "V063",
  "funcao": "Raio-X Fiscal / Diagnóstico (relatório por fonte e por empresa)",
  "destino": "BPO > Análise de risco",
  "fase": "3",
  "depende": "Rec",
  "modulo": "analise-risco"
 },
 {
  "id": "V064",
  "funcao": "Health Score Fiscal",
  "destino": "BPO > Análise de risco",
  "fase": "3",
  "depende": "Rec",
  "modulo": "analise-risco"
 },
 {
  "id": "V066",
  "funcao": "Pós-análise por IA (análises mensais)",
  "destino": "BPO > Análise de risco",
  "fase": "3",
  "depende": "Rec",
  "modulo": "analise-risco"
 },
 {
  "id": "V067",
  "funcao": "Assistente de IA para análise fiscal (chat)",
  "destino": "BPO > Análise de risco",
  "fase": "3",
  "depende": "Rec",
  "modulo": "analise-risco"
 },
 {
  "id": "V079",
  "funcao": "Cadastro automático de novas empresas a partir das procurações",
  "destino": "Clientes > Grupos e empresas",
  "fase": "3",
  "depende": "Rec",
  "modulo": "grupos-empresas"
 },
 {
  "id": "V083",
  "funcao": "Portal do cliente (login personalizável, forma de acesso, funções)",
  "destino": "Comercial > Portal do cliente",
  "fase": "4",
  "depende": "Ext",
  "modulo": "portal-contratos"
 },
 {
  "id": "V084",
  "funcao": "Rastreio público por CNPJ",
  "destino": "Comercial > Portal do cliente",
  "fase": "4",
  "depende": "—",
  "modulo": "portal-contratos"
 },
 {
  "id": "V085",
  "funcao": "App móvel com a marca do escritório (baixar, personalizar)",
  "destino": "Comercial > App",
  "fase": "4",
  "depende": "Ext (lojas de app)",
  "modulo": "portal-contratos"
 },
 {
  "id": "V086",
  "funcao": "Usuários do app (clientes) e permissões",
  "destino": "Comercial > App",
  "fase": "4",
  "depende": "Ext",
  "modulo": "portal-contratos"
 },
 {
  "id": "V087",
  "funcao": "Envio de guias ao app",
  "destino": "Comercial > App",
  "fase": "4",
  "depende": "Rec + Ext",
  "modulo": "portal-contratos"
 },
 {
  "id": "V088",
  "funcao": "Solicitações dos clientes pelo app (lista e status)",
  "destino": "Comercial > Solicitações",
  "fase": "4",
  "depende": "—",
  "modulo": "portal-contratos"
 },
 {
  "id": "V091",
  "funcao": "Contratos: modelos",
  "destino": "Comercial > Contratos",
  "fase": "4",
  "depende": "—",
  "modulo": "portal-contratos"
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
  "id": "V100",
  "funcao": "Procuradores (certificado do escritório)",
  "destino": "Administração > Integrações",
  "fase": "3",
  "depende": "Rec + Ext",
  "modulo": "integracoes"
 },
 {
  "id": "V106",
  "funcao": "Controle de notificações por tipo (federais, certidões)",
  "destino": "Administração > Comunicações",
  "fase": "3",
  "depende": "Rec",
  "modulo": "comunicacoes"
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
  "id": "V109",
  "funcao": "Parâmetros da consulta automática (dia por módulo)",
  "destino": "Administração > Parâmetros e rotinas",
  "fase": "3",
  "depende": "Rec",
  "modulo": "parametros-rotinas"
 },
 {
  "id": "V110",
  "funcao": "Rotinas automáticas: envio de guias no dia escolhido",
  "destino": "Administração > Parâmetros e rotinas",
  "fase": "3",
  "depende": "Rec + e-mail",
  "modulo": "parametros-rotinas"
 },
 {
  "id": "V118",
  "funcao": "Marcar empresa como \"sem obrigação\" por obrigação (DCTFWeb, PGDAS, DEFIS, MIT)",
  "destino": "Núcleo do Monitoramento",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
 },
 {
  "id": "V119",
  "funcao": "Atualizar em lote ou sob demanda, com histórico por empresa",
  "destino": "Núcleo do Monitoramento",
  "fase": "3",
  "depende": "Rec",
  "modulo": "monitoramento"
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
