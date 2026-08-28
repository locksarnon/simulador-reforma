/**
 * Dicionário central de orientações do Simulador FAL v0.16.
 * Espelha os comentários de células da planilha Excel.
 * Estrutura: ORIENTACOES[pagina][campo] = "texto da orientação".
 *
 * Uso: <InfoTooltip pagina="config" chave="margem_meta" />
 * Ou:   <InfoTooltip text="texto literal" />  (fallback direto)
 */
export const ORIENTACOES = {
  config: {
    header: "Premissas centrais do motor de cálculo. Alterações aqui afetam todas as operações simultaneamente. Preencha antes de simular operações.",
    versao_simulador: "Identificação da versão do simulador (ex: v0.16). Serve para controle, auditoria e rastreabilidade. Não altera as fórmulas.",
    cenario_ativo: "Nome do cenário gerencial ativo. Deve corresponder exatamente ao nome de um cenário cadastrado. Prefira ativar pela página Cenários.",
    data_base_normativa: "Data até a qual as normas, tabelas e premissas foram revisadas. Não atualiza a legislação automaticamente — serve como referência normativa da simulação.",
    margem_meta_pct: "Margem líquida-alvo para o exercício. Digite em pontos percentuais (ex: 18 para 18%). Utilizada no cálculo do preço necessário para preservar a rentabilidade desejada.",
    prazo_realizacao_credito_dias: "Estimativa de dias até a compensação, utilização ou ressarcimento do crédito acumulado. Exemplos: 30, 60, 120. Quanto maior o prazo, maior o custo financeiro estimado.",
    taxa_custo_financeiro_pct: "Taxa mensal de custo de capital para carregar créditos tributários. Digite em pontos percentuais (ex: 1,5 para 1,5% a.m.).",
    observacao: "Anotações gerais sobre a configuração atual: fonte, responsável, justificativa de premissas.",
  },

  datahub: {
    header: "Gestão de grupos econômicos e diagnósticos tributários. Cada grupo abre um Workroom com pipeline próprio de empresas, operações e cenários.",
    numero: "Identificador curto e único do grupo (ex: #001). Utilizado para vincular empresas ao grupo.",
    nome: "Nome do grupo econômico ou familiar (ex: Grão Pará).",
    tipo: "Natureza do grupo (ex: Grupo familiar, Condomínio rural, Holding).",
    observacao: "Anotações sobre o grupo: composição, contexto, prioridades.",
  },

  empresas: {
    header: "Cadastro mestre de empresas. Vinculadas a grupos, alimentam operações e consolidações. O regime cadastrado é contextual — não seleciona alíquotas automaticamente.",
    id_empresa: "Código interno único da empresa (ex: EMP-001, MATRIZ). Será utilizado para vincular operações à empresa.",
    grupo: "Número do grupo econômico ao qual a empresa pertence. Deve corresponder a um grupo cadastrado no DataHub.",
    razao_social: "Nome formal da empresa ou pessoa física, conforme registro.",
    cnpj_cpf: "CNPJ para empresas ou CPF para pessoas físicas (produtores rurais).",
    regime_atual: "Regime tributário da empresa. É uma informação cadastral — não seleciona alíquotas automaticamente. As alíquotas devem ser informadas em cada operação.",
    setor: "Setor de atividade (ex: Agroindústria, Comércio, Serviços). Informativo.",
    uf: "Unidade federativa da sede. Não alimenta matriz de alíquotas automaticamente.",
    municipio: "Município da sede. Informativo — não define alíquota de ISS.",
    contribuinte_ibs_cbs: "Indica se a empresa é contribuinte do IBS/CBS. Não altera as fórmulas na versão atual.",
    produtor_rural: "Indica se a empresa é produtor rural. Cadastral — não altera as fórmulas automaticamente.",
    cooperativa: "Indica se a empresa é cooperativa. Cadastral — não altera as fórmulas automaticamente.",
    erp: "Sistema de gestão utilizado (ex: SAP, Totvs). Informativo.",
    responsavel_fiscal: "Nome do responsável fiscal pela empresa. Informativo.",
    observacao: "Anotações sobre a empresa: pendências, particularidades, revisões.",
  },

  operacoes: {
    header: "Operações e premissas por lançamento. O motor calcula sistema atual, IBS/CBS, transição, margem e caixa a partir dos dados informados. Preencha as células com atenção à direção e ao ano.",
  },

  operacao_form: {
    header_identificacao: "Identificação da operação. Campos obrigatórios para rastreio e vinculação ao motor de cálculo.",
    id_operacao: "Código único e rastreável da operação (ex: OP-001). Evite repetir o mesmo ID em operações diferentes.",
    empresa_id: "Selecione a empresa vinculada à operação. Deve estar cadastrada previamente.",
    data: "Data da operação real ou da operação-modelo. Funciona como informação cadastral — o parâmetro tributário principal é o campo Ano.",
    ano: "Ano da transição utilizado no cálculo (ex: 2026, 2027, 2029, 2033). Deve existir na página Transição. Determina as alíquotas e fatores aplicados.",
    direcao: "Saída para vendas e serviços prestados; Entrada para compras e aquisições. A direção altera completamente a lógica de débitos, créditos, margem e caixa.",
    tipo: "Mercadoria para produtos; Serviço para prestação; Outro para aquisição de ativo, importação ou situações não enquadradas. Informativo — não define tributação automaticamente.",
    descricao: "Descrição objetiva que permita reconhecer a operação sem abrir o cadastro (ex: Venda de soja em grão para cliente contribuinte).",

    header_valores: "Valores econômicos da operação. O valor bruto é calculado automaticamente.",
    quantidade: "Quantidade de itens ou unidades da operação. Para operações sem quantidade definida, utilize 1.",
    preco_unitario: "Preço unitário do item. Para operação sem quantidade definida, informe o valor total aqui.",
    desconto_incondicional: "Valor monetário do desconto (não percentual). Ex: 5000 para desconto de R$ 5.000.",
    frete: "Valor do frete integrado à operação. Entrará na base de cálculo.",
    seguro: "Valor do seguro integrado à operação. Entrará na base de cálculo.",
    outras_despesas: "Outras despesas acessórias integradas à operação. Entrarão na base de cálculo.",
    valor_bruto: "Valor total calculado: Quantidade × Preço – Desconto + Frete + Seguro + Outras despesas. Pode ser editado manualmente, mas será recalculado se os componentes mudarem.",

    header_classificacao: "Classificação fiscal da operação. NCM, NBS, CFOP e UFs são informativos na versão atual — não selecionam alíquotas automaticamente.",
    ncm: "Código NCM da mercadoria. Informativo — não seleciona alíquotas automaticamente.",
    nbs: "Código NBS do serviço. Informativo — não seleciona alíquotas automaticamente.",
    cfop_servico: "CFOP para mercadorias ou código de serviço. Informativo — não define tributação automaticamente.",
    uf_origem: "UF de origem da operação. Informativo — não alimenta matriz de alíquotas.",
    uf_destino: "UF de destino da operação. Informativo — não alimenta matriz de alíquotas.",
    municipio_destino: "Município de destino. Informativo — não define alíquota de ISS.",
    documento: "Tipo de documento fiscal (NF-e, NFC-e, CT-e, NFS-e, DUIMP). Informativo — não altera o cálculo.",
    regime_atual: "Regime tributário aplicável à operação. Informativo — não seleciona alíquotas automaticamente.",
    c_class_trib: "Código de classificação tributária do IBS/CBS. Utilizado pelo motor para localizar os percentuais de redução de IBS e CBS no catálogo. Se inexistente, a classificação ficará pendente.",
    cst_ibs_cbs: "Código de situação tributária IBS/CBS. Armazenado para referência — não altera diretamente as fórmulas na versão atual.",

    header_tributos_atuais: "Alíquotas do sistema tributário atual. Digite em pontos percentuais (ex: 1,65 para PIS). Aplicadas sobre o valor bruto de forma simplificada.",
    pis_pct: "Alíquota de PIS em pontos percentuais (ex: 1,65 para 1,65%). Aplicada sobre o valor bruto.",
    cofins_pct: "Alíquota de Cofins em pontos percentuais (ex: 7,6 para 7,6%). Aplicada sobre o valor bruto.",
    icms_pct: "Alíquota de ICMS próprio em pontos percentuais (ex: 17 para 17%). Aplicada sobre o valor bruto.",
    fcp_pct: "Alíquota de FCP em pontos percentuais (ex: 2 para 2%).",
    mva_st_pct: "Margem de Valor Agregado da substituição tributária em pontos percentuais (ex: 40 para 40%).",
    iss_pct: "Alíquota de ISS em pontos percentuais (ex: 5 para 5%).",
    ipi_pct: "Alíquota de IPI em pontos percentuais (ex: 10 para 10%).",
    credito_elegivel_pct: "Percentual do crédito calculado que poderá ser considerado aproveitável (ex: 80 para 80%). Aplicado apenas em operações de Entrada.",

    header_ibs_cbs: "Parâmetros de IBS/CBS, crédito presumido e margem. As alíquotas de IBS/CBS vêm da tabela de Transição conforme o ano.",
    split_pct: "Percentual de retenção pelo split payment sobre os débitos de IBS/CBS (ex: 100 para retenção integral). Calculado apenas em saídas.",
    c_cred_pres: "Código de crédito presumido. Consulte o catálogo em Catálogos → cCredPres. Se inexistente ou pendente, o crédito presumido não será calculado.",
    credito_presumido_ibs_pct: "Percentual de crédito presumido de IBS em pontos percentuais. Calculado apenas em entradas.",
    credito_presumido_cbs_pct: "Percentual de crédito presumido de CBS em pontos percentuais. Calculado apenas em entradas.",
    grupo_rtc: "Grupo de regime tributário complementar. Informativo.",
    custo_base_pct: "Percentual do valor bruto que representa o custo econômico (ex: 65 para 65%). Utilizado no cálculo de margem.",
    margem_meta_pct: "Margem-alvo da operação em pontos percentuais. Na versão atual, a margem global da Configuração prevalece sobre este valor.",

    header_dfe: "Informações de documento fiscal eletrônico. Maioria informativa na versão atual — não altera as fórmulas automaticamente.",
    finalidade_dfe: "Finalidade do documento fiscal eletrônico. Informativo.",
    crt_emitente: "Código de Regime Tributário do emitente. Informativo.",
    ambiente: "Ambiente de emissão: Produção ou Homologação. Informativo — não altera o cálculo.",
    reducao_informada: "Indica se há redução informada no DF-e. Informativo — não altera as fórmulas.",
    diferimento_informado: "Indica se há diferimento informado no DF-e. Informativo — não altera as fórmulas.",
    tributacao_regular_informada: "Indica se há tributação regular informada. Informativo.",
    credito_presumido_informado: "Indica se há crédito presumido informado no DF-e. Informativo.",
    compra_governamental_informado: "Indica se há compra governamental informada. Informativo.",
    observacao_dfe: "Anotações sobre o DF-e: pendências, justificativas, necessidade de parametrização no ERP.",
  },

  cenarios: {
    header: "Cenários gerenciais permitem testar hipóteses comerciais e operacionais sem alterar os dados originais. O cenário ativo recalcula todas as operações.",
    nome: "Nome do cenário (ex: Base, Conservador, Otimista). Deve ser único.",
    descricao: "Descrição do cenário e suas premissas principais.",
    fator_volume: "Multiplicador de volume (ex: 1,00 mantém; 0,90 reduz 10%; 1,10 aumenta 10%). Altera a receita da análise de margem — não replica tributos.",
    fator_preco: "Multiplicador de preço (ex: 1,05 aumenta 5%). Altera a receita gerencial — não altera tributos.",
    fator_custo: "Multiplicador de custo-base (ex: 1,10 aumenta 10%). Aplicado ao custo-base da análise de margem.",
    fator_credito_aproveitado: "Multiplicador de crédito aproveitado. Cadastrado mas ainda não integra as fórmulas. Utilize o crédito elegível da operação.",
  },

  transicao: {
    header: "Cronograma paramétrico da transição 2026–2033. Fatores de extinção gradual e alíquotas de referência. Alterações afetam todas as operações do ano.",
    ano: "Ano da transição (ex: 2026). Deve existir para que o motor calcule operações daquele ano.",
    carater: "Caráter do ano: Informativo ou Financeiro. Informativo.",
    pis_cofins_fator: "Fator multiplicador de PIS/Cofins (ex: 1 mantém 100%; 0,90 mantém 90%; 0 elimina). Informe como fração decimal.",
    ipi_fator_geral: "Fator multiplicador de IPI (ex: 1 mantém 100%; 0 elimina). Informe como fração decimal.",
    icms_fator: "Fator multiplicador de ICMS (ex: 1 mantém 100%; 0,60 mantém 60%; 0 elimina). Informe como fração decimal.",
    iss_fator: "Fator multiplicador de ISS (ex: 1 mantém 100%; 0 elimina). Informe como fração decimal.",
    ibs_efetivo: "Alíquota efetiva de IBS para o ano. Informe como fração decimal (ex: 0,01 para 1%; 0,09 para 9%).",
    cbs_efetiva: "Alíquota efetiva de CBS para o ano. Informe como fração decimal (ex: 0,01 para 1%; 0,08 para 8%).",
    ibs_uf_aliquota: "Alíquota do IBS estadual. Informe como fração decimal.",
    ibs_mun_aliquota: "Alíquota do IBS municipal. Informe como fração decimal.",
    efeito_financeiro: "Percentual do IBS/CBS líquido considerado na carga financeira do ano (ex: 0 ausência; 1 efeito integral; 0,50 efeito de 50%). Informe como fração decimal.",
    fonte: "Fonte normativa ou premissa utilizada (ex: EC 132/2023, LC projetada).",
    observacao: "Anotações sobre o ano: condição oficial ou estimada, justificativa, responsável.",
  },

  catalogos: {
    header: "Catálogos fiscais IBS/CBS. CST, cClassTrib e cCredPres — bases oficiais versionadas. Indicadores operacionais são mapeamento técnico preliminar.",
  },

  home: {
    header: "Visão consolidada do sistema atual, IBS/CBS, transição, margem e caixa. Os indicadores agregam todas as operações carregadas — não respeitam filtros da tela Operações.",
  },

  workroom: {
    header: "Pipeline do diagnóstico. Cada módulo abre dentro do contexto deste grupo. Navegue pelas etapas para empresas, operações e cenários.",
  },

  manual: {
    header: "Controles da arquitetura, classificação, transição, cálculos e consistência entre módulos. Documentação técnica e perguntas frequentes.",
  },

  importacao: {
    header: "Importação de NF-e/NFC-e com processamento backend seguro. Nenhuma extração tributária ocorre no navegador — todo o parse, validação e cruzamento de empresas é feito no backend com rastreabilidade auditável por lote, arquivo e item.",
  },
};