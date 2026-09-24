/**
 * Roteiro de testes do InTAX — conteúdo PROVISÓRIO para o tester (a página
 * /roteiro-testes será removida depois). Cada função traz: onde abrir, o que
 * preparar, passo a passo (fazer → esperado), cuidados e critério de aprovação.
 *
 * Os textos de botões/campos são os reais das telas. Onde há "esperado" numérico
 * ele foi conferido no ambiente; onde é comparação entre telas, o tester confere.
 */
const p = (f, e) => ({ f, e });

export const CSV_TESTE_CADASTRO = [
  "Cod Produto;Descrição do Produto;NCM;UN;cClassTrib",
  "P1;Milho em grão;1005.90.10;KG;",
  "P2;Ração para bovinos;23099010;SC;000001",
  "P3;Produto sem NCM;;UN;",
  "P4;NCM curto;1234;UN;",
  "P5;NCM inexistente;99999999;UN;",
  "P1;Código repetido;10059010;KG;",
].join("\n");

export const ROTEIRO = [
  // ───────────────────────── ACESSO E BASE ─────────────────────────
  {
    id: "acesso", grupo: "Acesso e base", titulo: "Acesso e cadastro por convite", rota: "/login",
    objetivo: "Garantir que só quem tem o código de convite cria conta e que o login funciona.",
    preparo: ["Use uma janela anônima do navegador.", "Peça o código de convite à equipe FAL (não está escrito em nenhuma tela)."],
    passos: [
      p("Abra o endereço do sistema.", "Aparece \"Welcome back\" com e-mail e senha."),
      p("Clique em \"Create one\" (criar conta).", "Aparece o formulário com e-mail, senha, confirmar senha e o campo \"Código de convite\"."),
      p("Preencha e-mail e senha, mas deixe o convite em branco ou errado e envie.", "Erro: \"O cadastro é por convite\". A conta NÃO é criada."),
      p("Repita com o código correto.", "Conta criada e você cai no DataHub."),
      p("Saia e entre de novo com o mesmo e-mail e senha.", "Login funciona. Senha errada mostra \"E-mail ou senha inválidos\"."),
    ],
    cuidados: ["Senha precisa de no mínimo 8 caracteres.", "Não use dados reais de cliente neste teste."],
    criterio: "Sem convite não cria conta; com convite cria e entra; login e senha errada se comportam como descrito.",
  },
  {
    id: "datahub", grupo: "Acesso e base", titulo: "DataHub — criar grupo (diagnóstico)", rota: "/",
    objetivo: "Criar o grupo econômico que reúne as empresas de um diagnóstico.",
    preparo: ["Estar logado."],
    passos: [
      p("No menu, abra \"DataHub\".", "Título \"Hub de Grupos\" (Gestão de grupos econômicos e diagnósticos tributários)."),
      p("Clique em \"Novo Grupo\".", "Abre o formulário com Número, Nome do grupo, Tipo e Observação."),
      p("Informe um número (ex.: #900) e um nome que comece com \"TESTE-\" e seu nome. Salve.", "O grupo aparece como cartão na lista."),
      p("Use o campo \"Buscar por nome ou número...\".", "A lista filtra em tempo real."),
      p("Abra o cartão do grupo.", "Entra na área do grupo com \"Empresas deste grupo\" e o bloco \"Bases Técnicas e Análise\"."),
    ],
    cuidados: ["Prefixe tudo que você criar com \"TESTE-\" para limpar depois.", "As \"Bases Técnicas\" (Cenários, Transição, Catálogos) são compartilhadas entre todos os grupos: mexer nelas afeta todo mundo."],
    criterio: "Grupo criado, encontrado na busca e aberto sem erro.",
  },
  {
    id: "empresas", grupo: "Acesso e base", titulo: "Empresas — cadastrar empresa do grupo", rota: "/",
    objetivo: "Cadastrar a empresa com regime e ramo corretos (base de todo o cálculo).",
    preparo: ["Grupo de teste criado.", "Um CNPJ válido para consultar (pode ser de empresa pública qualquer)."],
    passos: [
      p("Dentro do grupo, clique em \"Nova empresa\".", "Abre o formulário completo."),
      p("Digite o CNPJ e clique em \"Buscar\".", "Razão social, UF e município são preenchidos pela Receita Federal (BrasilAPI). O campo \"ID empresa\" mostra os 8 primeiros dígitos do CNPJ e não é editável."),
      p("Escolha o \"Regime atual\" e abra a lista \"Setor\".", "A lista traz os ramos com os nomes da LC 214/2025 (ex.: Bares e restaurantes, Bens minerais, Combustíveis...), seguidos dos setores gerais."),
      p("Preencha Contribuinte IBS/CBS, Produtor rural, Responsável fiscal e ERP. Salve.", "A empresa aparece como cartão no grupo."),
      p("Clique em \"Ver como tabela\".", "A mesma empresa aparece na tabela. Edite e exclua uma empresa de teste (botão \"Excluir empresa\")."),
    ],
    cuidados: ["CPF não tem busca na Receita.", "Empresa com o mesmo CNPJ que uma nota importada é o que liga a nota à empresa: cadastre o CNPJ exato do XML que você vai importar."],
    criterio: "Empresa criada com dados da Receita, ramo da lista da lei e ID automático.",
  },

  // ───────────────────────── DIAGNÓSTICO ─────────────────────────
  {
    id: "xml", grupo: "Diagnóstico com notas", titulo: "Importação de XML (NF-e)", rota: "/",
    objetivo: "Subir notas reais, conferir a validação e confirmar a importação como operações.",
    preparo: ["Empresa cadastrada com o CNPJ do emitente OU do destinatário das notas.", "5 a 10 XMLs de NF-e autorizadas (mercadoria) e, se tiver, 1 de serviço. Use dados de teste/anonimizados."],
    passos: [
      p("Abra a empresa e vá em \"Importação XML\".", "Aparece \"Upload de XML (NF-e / NFC-e)\"."),
      p("Arraste os arquivos .xml para a área tracejada (ou clique para escolher).", "Os arquivos entram na lista; \"Limpar todos\" remove."),
      p("Envie para processamento.", "Aparecem os totais: Arquivos válidos, Importáveis, Com alerta, Bloqueados, Duplicados, Cancelados."),
      p("Na tabela \"Staging de Itens\" (colunas Empresa, Persp., Direção, NCM/NBS, Resultado), clique em um item.", "Abre o painel de validação com 4 abas: Documental, Cadastral, Tributária e Operacional."),
      p("Numa nota SEM cClassTrib no XML (notas anteriores a 2026), procure na aba Tributária o alerta de cClassTrib inferido.", "Aviso de que o código foi inferido pelo NCM (LC 214) ou assumido como regime padrão 000001. É alerta, não bloqueio."),
      p("Numa nota COM cClassTrib, veja se aparece o alerta \"NCM x cClassTrib\".", "Só aparece quando a classe informada difere da esperada pelo NCM (ex.: produto com redução de 60% na lei classificado como tributação integral)."),
      p("Numa nota de SERVIÇO sem alíquota de ISS, veja o alerta de ISS inferido.", "Cita o município do destinatário (código IBGE) e o item da lista LC 116 usados; a alíquota vem da base do Portal Nacional da NFS-e."),
      p("Reenvie um arquivo já enviado.", "Fica como Duplicado, não gera item novo."),
      p("Clique em \"Confirmar importação com alertas\" (ou confirme só os itens sem alerta).", "Os itens viram operações e passam a aparecer em Operações e no Painel Executivo. Itens já importados mostram \"Já importado\" (verde)."),
    ],
    cuidados: [
      "CNPJ do XML que não esteja cadastrado deixa o item Bloqueado (CNPJ não localizado). Use \"Ver os itens bloqueados\" para ler o motivo.",
      "Nota cancelada não importa; nota em ambiente de homologação vem com alerta.",
      "NCM ausente ou fora da tabela oficial gera alerta amarelo, não bloqueio.",
      "Confirmar importação grava dados: teste apenas no grupo \"TESTE-\".",
    ],
    criterio: "Totais batem com a quantidade de arquivos; cada bloqueio tem motivo legível; alertas de inferência aparecem onde esperado; após confirmar, as operações existem.",
  },
  {
    id: "operacoes", grupo: "Diagnóstico com notas", titulo: "Operações — cadastro manual e detalhe do cálculo", rota: "/",
    objetivo: "Conferir que o cálculo de uma operação está coerente e explicável.",
    preparo: ["Empresa de teste cadastrada."],
    passos: [
      p("Dentro da empresa, abra \"Operações\" e clique em \"Nova operação\".", "Formulário com as abas Identificação, Valores, Classificação fiscal, Tributos atuais (%), IBS/CBS e split, Produção/Homologação."),
      p("Cadastre uma SAÍDA: Quantidade 100, Preço unitário R$ 1.000 (Valor bruto calculado = R$ 100.000), PIS 1,65%, Cofins 7,6%, ICMS 12%. Ano 2026 e depois copie para 2027 e 2033. Salve com \"Salvar operação\".", "A linha aparece na tabela com Valor bruto, Trib. atuais, IBS/CBS, Carga trans. e Funding."),
      p("Conferência 2026: tributos atuais = 100.000 × (1,65% + 7,6% + 12%) = R$ 21.250.", "A coluna \"Trib. atuais\" mostra R$ 21.250."),
      p("Abra o detalhe do cálculo da operação (clique na linha; se não abrir, procure o ícone de detalhe ao lado dela).", "Mostra sistema atual, IBS/CBS, transição, preço e margem, caixa/split."),
      p("Compare 2027 e 2033 da mesma operação.", "Em 2027 o PIS/Cofins do sistema atual zera (entra a CBS); em 2033 o ICMS zera e o IBS chega ao valor cheio."),
      p("Cadastre uma ENTRADA (compra) com crédito elegível e veja o efeito.", "O crédito reduz o IBS/CBS líquido da empresa no ano."),
    ],
    cuidados: ["Filtros da tabela: \"Todas as empresas\" e \"Todos os anos\".", "Alíquotas de IBS de 2029 em diante são estimativas provisórias (fonte: Resolução CGIBS nº 14/2026, ver Transição)."],
    criterio: "Valor bruto e tributos atuais batem com a conta manual; 2027 e 2033 mudam como descrito.",
  },
  {
    id: "cockpit", grupo: "Diagnóstico com notas", titulo: "Painel Executivo (Cockpit) — projeção e memória de cálculo", rota: "/cockpit",
    objetivo: "Ler o resultado consolidado, projetar 2026–2033 e auditar cada número.",
    preparo: ["Empresa com algumas operações (importadas ou manuais)."],
    passos: [
      p("Abra \"Cockpit\" e escolha o grupo (\"Todos os grupos\") e a empresa (\"Todas as empresas do grupo\") nos seletores.", "Aparecem os cartões: Operações carregadas, Valor bruto simulado, Tributos atuais líquidos, Carga da transição, IBS/CBS líquido, Funding tributário estimado, Δ Margem transição."),
      p("Confira: Valor bruto simulado = soma do Valor bruto das operações da empresa.", "Os números batem com a tela Operações."),
      p("Veja \"Consolidado por ano\" (Valor bruto, Tributos atuais, Carga transição, IBS/CBS, Split retido, Funding, Carga efetiva).", "Carga efetiva = Carga transição ÷ Valor bruto."),
      p("Troque o Cenário no seletor \"Cenário:\" e veja \"Comparação entre cenários\".", "Margem atual e Margem transição mudam conforme os fatores do cenário."),
      p("Desça até \"Projeção da transição (2026-2033)\".", "Gráfico e tabela por ano com o MESMO volume de operações."),
      p("Abra \"Memória de cálculo, ano a ano\" (vem fechada; clique para abrir) e escolha um ano.", "Tabela Componente | Base (líquida de crédito) | × Fator | = Resultado: PIS/COFINS, IPI, ICMS + FCP + ST, ISS, IBS/CBS financeiro e Carga total."),
      p("Em 2033, confira a memória.", "Sistema atual remanescente = zero (fator 0); toda a carga vem de IBS/CBS."),
      p("Clique em \"Salvar simulação\" e depois em \"Exportar PDF\".", "A simulação aparece em \"Simulações salvas\" (com Versão motor, Versão regras e Hash da entrada); o PDF baixa com o cabeçalho InTAX."),
    ],
    cuidados: ["Memória de cálculo é o que valida a projeção: some as parcelas à mão em pelo menos 1 ano e compare com a Carga total.", "Salvar simulação grava dados."],
    criterio: "Cartões batem com Operações; a memória de cálculo de um ano fecha exatamente com o total mostrado; PDF gerado.",
  },
  {
    id: "cenarios", grupo: "Diagnóstico com notas", titulo: "Cenários", rota: "/cenarios",
    objetivo: "Criar e ativar cenários de volume, preço e custo.",
    preparo: [],
    passos: [
      p("Abra \"Cenários\" e clique em \"Novo cenário\".", "Formulário: Nome, Descrição, Fator volume, Fator preço, Fator custo, Crédito aproveitado."),
      p("Crie \"TESTE +10% volume\" com Fator volume 1,10 e os demais 1. Salve.", "O cenário aparece na lista."),
      p("Clique em \"Definir como padrão\".", "Ele ganha o selo PADRÃO."),
      p("Volte ao Cockpit.", "O cenário ativo mudou e a margem reflete o novo fator."),
    ],
    cuidados: ["Cenários são compartilhados entre grupos.", "Devolva o cenário padrão original ao final."],
    criterio: "Cenário criado, ativado e refletido no Cockpit.",
  },
  {
    id: "transicao", grupo: "Diagnóstico com notas", titulo: "Transição 2026–2033 (parâmetros)", rota: "/transicao",
    objetivo: "Conferir a tabela de parâmetros que alimenta todos os cálculos.",
    preparo: [],
    passos: [
      p("Abra \"Transição 2026–2033\".", "Uma linha por ano de 2026 a 2033."),
      p("Confira PIS/Cofins fator: 2026 = 1 e de 2027 em diante = 0.", "Valores conforme o cronograma."),
      p("Confira ICMS fator: 1 até 2028, 0,9 / 0,8 / 0,7 / 0,6 de 2029 a 2032 e 0 em 2033.", "Cronograma de redução do ICMS."),
      p("Confira IBS efetivo: 0,1% até 2028 e 18,7% em 2033 (provisório); CBS efetiva 9,21% de 2027 em diante.", "Coluna Fonte cita a Resolução CGIBS nº 14/2026 como estimativa provisória."),
      p("Abra um ano em edição (só para ver os campos) e cancele.", "Campos: PIS/Cofins fator, IPI fator geral, ICMS fator, ISS fator, IBS UF/Município, Efeito financeiro (0/1), Fonte, Observação."),
    ],
    cuidados: ["NÃO altere valores: a tabela é compartilhada e reflete no simulador e na calculadora pública.", "Alíquotas finais do IBS ainda serão fixadas: a página deve deixar claro que são parâmetros editáveis."],
    criterio: "Todos os anos presentes com os fatores descritos e fonte legível.",
  },
  {
    id: "catalogos", grupo: "Diagnóstico com notas", titulo: "Catálogos IBS/CBS", rota: "/catalogos",
    objetivo: "Conferir as bases oficiais (CST, cClassTrib, cCredPres, NCM, CFOP).",
    preparo: [],
    passos: [
      p("Abra \"Catálogos IBS/CBS\" e passe pelas abas CST IBS/CBS, cClassTrib, cCredPres, NCM e CFOP.", "Cada aba lista os registros com \"Buscar...\"."),
      p("Aba cClassTrib: procure 200038.", "Aparece com redução de 60% de IBS e CBS (Red. IBS / Red. CBS)."),
      p("Aba NCM: busque 23099010.", "Descrição da posição 2309 (alimentação de animais). A tabela oficial tem 10.515 códigos."),
      p("Aba cCredPres.", "Poucos registros (crédito presumido do produtor rural aparece como \"Pendente de regulamentação\")."),
    ],
    cuidados: ["Não edite os catálogos.", "A aba CFOP e a de Benefício Fiscal podem estar quase vazias: é esperado por enquanto."],
    criterio: "Catálogos abrem, buscam e mostram vigência e situação oficial.",
  },
  {
    id: "config", grupo: "Diagnóstico com notas", titulo: "Configuração", rota: "/configuracao",
    objetivo: "Conferir os parâmetros globais do motor.",
    preparo: [],
    passos: [
      p("Abra \"Configuração\".", "Campos: Versão do simulador, Cenário ativo, Data-base normativa, Margem meta (%), Prazo realização crédito (dias) e Taxa custo financeiro (% a.m.)."),
      p("Anote o valor atual da Margem meta, altere para um valor um pouco maior (ex.: +2 pontos percentuais) e salve.", "Mensagem \"Configuração salva\". O preço-alvo e a margem no Cockpit passam a usar a nova meta."),
      p("Devolva o valor original que você anotou.", "Configuração restaurada."),
    ],
    cuidados: ["Configuração é global."],
    criterio: "Salva e reflete no cálculo de preço-alvo/margem.",
  },

  // ───────────────────────── VALIDAÇÃO FISCAL ─────────────────────────
  {
    id: "validador", grupo: "Validação fiscal", titulo: "Validador de cadastro de produtos (NCM × cClassTrib)", rota: "/ferramentas/validador-cadastro",
    objetivo: "Achar NCM inválido, ausente ou classificação divergente numa planilha de produtos.",
    preparo: ["Salve o CSV de teste abaixo (botão \"Copiar CSV de teste\") num arquivo teste.csv, ou use uma exportação real do ERP."],
    passos: [
      p("Abra \"Validador de cadastro\".", "Área para arrastar planilha e o quadro \"Como preparar a planilha\"."),
      p("Clique em \"Baixar planilha modelo\".", "Baixa um Excel com cabeçalho, 2 exemplos e aba de instruções."),
      p("Clique em \"Copiar cabeçalho\" e cole numa planilha nova.", "Cada nome de coluna cai numa célula."),
      p("Envie o CSV de teste.", "Tela \"Confirme as colunas\" com Código, Descrição, NCM, Unidade e cClassTrib reconhecidos automaticamente."),
      p("Clique em \"Validar cadastro\".", "Total 6: 2 com Atenção (código P1 repetido), 4 para Corrigir."),
      p("Confira linha a linha.", "P2 (ração 23099010 com 000001): \"benefício possivelmente perdido\", sugestão 200038 (redução de 60%, Anexo IX). P3: NCM ausente. P4: NCM \"1234\" tem 4 dígitos. P5: NCM inexistente na tabela oficial. P1 (2×): código duplicado."),
      p("Clique nos cartões (Sem problemas / Atenção / Corrigir) e use a busca.", "A tabela filtra."),
      p("Clique em \"Baixar planilha corrigida\".", "Excel com Situação colorida, problemas, cClassTrib informado × sugerido e aba Resumo."),
      p("Teste uma planilha do ERP real (Protheus, SAP ou Sankhya) sem renomear colunas.", "O sistema reconhece as colunas ou permite indicá-las na tela."),
    ],
    cuidados: [
      "Se o NCM vier do Excel como número, o zero à esquerda some: o sistema restaura e avisa.",
      "CSV em Latin-1 ou com ponto e vírgula é aceito. Arquivo .xls antigo não: salvar como .xlsx.",
      "A sugestão de classificação é orientativa: NCM ambíguo aparece como \"depende do produto\".",
    ],
    criterio: "Todos os problemas do CSV de teste identificados exatamente como descrito; planilha corrigida baixa e abre.",
    csvTeste: true,
  },
  {
    id: "consulta-ncm", grupo: "Validação fiscal", titulo: "Consulta NCM", rota: "/ferramentas/consulta-ncm",
    objetivo: "Consultar como um NCM é tratado na LC 214/2025.",
    preparo: [],
    passos: [
      p("Abra \"Consulta NCM\" e digite 23099010.", "Um resultado: \"Redução de 60%\", cClassTrib 200038, base \"Anexo IX\", confiança média."),
      p("Digite 23091000.", "Alimentos para cães e gatos: \"Sem tratamento diferenciado nos anexos consultados\"."),
      p("Digite uma palavra (ex.: milho).", "Lista de NCMs cuja descrição contém a palavra; o número de resultados aparece acima."),
      p("Digite só 2 dígitos (ex.: 23).", "Lista os primeiros 25 e avisa para refinar."),
      p("Clique em \"Copiar NCM\".", "O código sem pontuação vai para a área de transferência."),
    ],
    cuidados: ["\"Sem exceção nos anexos\" NÃO quer dizer tributação padrão garantida: pode existir outra base legal."],
    criterio: "Resultados coerentes com a lei e aviso de orientação visível.",
  },
  {
    id: "classificador", grupo: "Validação fiscal", titulo: "Classificador & Conversor de códigos de serviço", rota: "/ferramentas/classificacao",
    objetivo: "Converter entre item LC 116, NBS e cClassTrib de serviços.",
    preparo: [],
    passos: [
      p("Abra \"Classificador & Conversor\" e, na aba Busca, digite 01.01 (ou 1.1502.10.00).", "Mostra Item LC 116, NBS, cClassTrib e Local de incidência do IBS."),
      p("Digite um trecho de descrição (ex.: análise de sistemas).", "Retorna itens relacionados."),
      p("Use \"Não sabe o código? Filtre por tipo de operação\".", "Filtra a base por tipo."),
      p("Aba \"Consulta em lote\": cole 3 códigos e clique em \"Processar lote\".", "Tabela com Status (Encontrado / Não encontrado); depois \"Exportar CSV\"."),
    ],
    cuidados: ["A base é do Anexo VIII (serviços). Mercadoria com NCM não está aqui: use a Consulta NCM."],
    criterio: "Conversões corretas e exportação do lote funcionando.",
  },
  {
    id: "calc-rapida", grupo: "Validação fiscal", titulo: "Calculadora Rápida (uma operação)", rota: "/ferramentas/calculadora",
    objetivo: "Simular uma operação isolada e comparar com o motor.",
    preparo: [],
    passos: [
      p("Abra \"Calculadora Rápida\" e escolha o Ano.", "Os parâmetros de IBS/CBS/transição do ano são aplicados."),
      p("Direção \"Saída (venda)\", Valor bruto R$ 100.000, PIS 1,65%, Cofins 7,6%, ICMS 12%.", "Resultado: Sistema atual líquido R$ 21.250 em qualquer ano; IBS/CBS líquido e Carga da transição variam por ano."),
      p("Troque para \"Entrada (compra)\" com Crédito elegível 100%.", "Aparecem os créditos; o líquido diminui."),
      p("Repita a mesma operação no Cockpit (Operações) e compare o resultado.", "Devem ser idênticos."),
    ],
    cuidados: ["É só simulação: não grava nada."],
    criterio: "Resultado igual ao do Cockpit para a mesma operação.",
  },
  {
    id: "nfse", grupo: "Validação fiscal", titulo: "Validador NFS-e (DPS Padrão Nacional)", rota: "/ferramentas/validador-nfse",
    objetivo: "Validar o XML de uma DPS/NFS-e.",
    preparo: ["Um XML de DPS/NFS-e (real ou de teste)."],
    passos: [
      p("Abra \"Validador NFS-e\" e envie o arquivo (\"Enviar arquivo .xml\") ou cole o conteúdo.", "O sistema processa e mostra 3 blocos: Estrutura válida, Pronto para autorização e Conformidade tributária."),
      p("Estrague o XML de propósito (apague uma tag obrigatória) e valide de novo.", "O bloco correspondente aponta o erro."),
    ],
    cuidados: ["Use XML de teste; não envie dados sigilosos."],
    criterio: "Aceita XML correto e aponta erros do XML estragado.",
  },
  {
    id: "art11", grupo: "Validação fiscal", titulo: "Guia do Art. 11 — local da operação", rota: "/ferramentas/art-11",
    objetivo: "Conferir o conteúdo explicativo do Art. 11 da LC 214.",
    preparo: [],
    passos: [
      p("Leia \"Por que local da operação importa\" e a tabela \"As regras, por tipo de operação\".", "Texto claro, com o aviso de que é um resumo, não o texto literal da lei."),
      p("Clique nos links \"Classificador & Conversor\" e \"Texto oficial da LC 214/2025 no Planalto\".", "Abrem as páginas corretas."),
    ],
    cuidados: [],
    criterio: "Conteúdo legível, sem erro de português e links funcionando.",
  },

  // ───────────────────────── INTELIGÊNCIA ─────────────────────────
  {
    id: "radar", grupo: "Inteligência de mercado", titulo: "Radar de Novidades", rota: "/ferramentas/radar-reforma",
    objetivo: "Conferir o radar semanal gerado por IA (fontes reais, prazos, prioridade).",
    preparo: [],
    passos: [
      p("Abra \"Radar de Novidades\".", "Resumo executivo da semana e cartões de novidades ordenados por prioridade."),
      p("Em 3 cartões, abra o link da fonte.", "A página existe e trata do assunto. Anote qualquer fonte que não abra ou não confirme o texto."),
      p("Confira os campos: prioridade, status normativo (Em vigor / Aprovado, aguardando vigência / Proposta em tramitação / A confirmar), prazo e ação recomendada.", "Prazos desconhecidos aparecem como \"A confirmar\", nunca inventados."),
      p("Clique em \"Gerar agora\" (uma vez).", "Atualiza a semana atual (pode levar cerca de 1 minuto). Sem duplicar itens."),
    ],
    cuidados: ["Conteúdo gerado por IA: antes de qualquer envio a cliente, alguém precisa revisar.", "\"Gerar agora\" consome a cota da IA: não repita à toa."],
    criterio: "Itens têm fonte verificável; nada com prazo inventado; nenhum item duplicado ao regerar.",
  },
  {
    id: "noticias", grupo: "Inteligência de mercado", titulo: "Acervo de Notícias", rota: "/ferramentas/noticias",
    objetivo: "Conferir a busca em fontes oficiais e o fluxo rascunho → publicada.",
    preparo: [],
    passos: [
      p("Abra \"Acervo de Notícias\" e clique em \"Buscar atualizações\".", "Mensagem com quantos rascunhos novos foram criados."),
      p("Publique um rascunho (botão de check) e edite outro.", "Status muda de Rascunho para Publicada."),
      p("Exclua uma notícia de teste.", "Some da lista."),
    ],
    cuidados: [],
    criterio: "Busca funciona, rascunho vira publicada e exclusão funciona.",
  },
  {
    id: "newsletter", grupo: "Inteligência de mercado", titulo: "Newsletter", rota: "/comercial/newsletter",
    objetivo: "Revisar, aprovar e (em ambiente configurado) enviar o Radar por e-mail.",
    preparo: ["Radar da semana gerado.", "Saiba se o e-mail (SMTP) já está configurado: o painel avisa."],
    passos: [
      p("Abra \"Newsletter\" e clique em \"Gerar rascunho do Radar\".", "Nasce uma edição \"Rascunho\" com os itens de prioridade Alta e Média."),
      p("Leia a \"Prévia do e-mail\" e edite o Assunto.", "A prévia mostra resumo da semana e cartões com ação recomendada e fonte."),
      p("Clique em \"Salvar\".", "Edição salva (volta para rascunho)."),
      p("Clique em \"Aprovar\".", "Status \"Aprovada\", com seu e-mail e a data."),
      p("Se o e-mail estiver configurado, digite seu e-mail e clique em \"Enviar teste\".", "Chega um e-mail com \"[TESTE]\" no assunto."),
    ],
    cuidados: ["NÃO clique em \"Enviar para N inscritos\" durante os testes: dispara para todos os inscritos reais.", "Sem SMTP configurado o envio não funciona (esperado): você testa só o rascunho e a aprovação."],
    criterio: "Rascunho gerado, editável, aprovável; nada é enviado sem aprovação.",
  },
  {
    id: "leads", grupo: "Inteligência de mercado", titulo: "Leads (funil comercial)", rota: "/comercial/leads",
    objetivo: "Conferir a captura e a pontuação dos contatos vindos das ferramentas públicas.",
    preparo: ["Faça antes o teste da Calculadora pública (abaixo) com um e-mail seu."],
    passos: [
      p("Abra \"Leads\".", "Cartões: Leads, Novos (sem contato), Perfil consultoria, Score médio."),
      p("Encontre o seu lead e clique na linha.", "Abre o resultado da ferramenta (carga hoje → 2033) e o campo de notas."),
      p("Mude o Status (Novo → Contatado → Qualificado...).", "O valor persiste ao recarregar."),
      p("Use os filtros de destino/status e a busca; depois \"Exportar CSV\".", "CSV baixa com os leads filtrados."),
    ],
    cuidados: ["Score: porte + impacto + regime + cargo. Sócio/diretor de empresa média em Lucro Presumido com impacto alto tende a ficar em \"Consultoria\"."],
    criterio: "Lead aparece com score e destino coerentes; status e notas persistem.",
  },

  // ───────────────────────── PÚBLICO ─────────────────────────
  {
    id: "calc-publica", grupo: "Ferramentas públicas (sem login)", titulo: "Calculadora pública — todos os perfis", rota: "/calculadora",
    objetivo: "Validar a experiência do visitante e a coerência dos resultados por perfil.",
    preparo: ["Use janela anônima e, se puder, também o celular.", "Faça o teste com pelo menos 4 perfis diferentes."],
    passos: [
      p("Abra /calculadora.", "Perfis agrupados por Regimes diferenciados, Regimes específicos, Imposto Seletivo e Regime regular, cada um com a base legal da LC 214."),
      p("Escolha um perfil e responda as 3 perguntas Sim/Não.", "Avança sozinho para a etapa \"Números\"."),
      p("Preencha regime, tratamento dos produtos e faturamento mensal (ex.: R$ 2.000.000). Clique \"Ver resultado\".", "Mostra Hoje, 2027 e 2033 (% do faturamento), gráfico por ano, cartões verde/amarelo/vermelho e 3 ações."),
      p("Bens minerais: responda Sim para exporta e escolha faturamento R$ 5.000.000/mês.", "Cartão \"Imposto Seletivo na extração\" com 0,25% do faturamento anual (R$ 150.000/ano). Contratos longos aparece em vermelho."),
      p("Bares e restaurantes: Sim para consumidor final.", "Cartão \"Consumidor final não aproveita crédito\". Redução inicial de 40%."),
      p("Produtor rural: responda Não à pergunta da receita de R$ 3,6 milhões.", "Cartão \"Você tende a ficar fora do IBS/CBS\"."),
      p("Escolha uma combinação em que as compras sejam altas e o tratamento seja alíquota zero.", "Cartão \"Você tende a acumular crédito\": o resultado NÃO é apresentado como economia."),
      p("Preencha o formulário de contato e envie.", "Aparece \"Pronto\" e o botão \"Baixar PDF agora\"."),
      p("Abra o PDF.", "Cabeçalho \"InTAX por\" + logo FAL Agro, resumo, tabela por ano, pontos de atenção, ações, premissas e aviso legal. Texto alinhado à esquerda."),
    ],
    cuidados: [
      "Os números são estimativas: premissas (ICMS médio, reduções) estão marcadas \"a validar pelo especialista\". Anote qualquer resultado que pareça absurdo.",
      "Nunca deve prometer % de economia.",
      "Sem e-mail configurado, o PDF só sai por download (esperado).",
    ],
    criterio: "Fluxo completo sem erro; cartões coerentes com as respostas; PDF correto; lead aparece em Leads.",
  },
  {
    id: "ncm-publica", grupo: "Ferramentas públicas (sem login)", titulo: "Consulta NCM e Validador de cadastro — versão pública", rota: "/consulta-ncm",
    objetivo: "Validar o que o visitante vê sem login.",
    preparo: ["Janela anônima."],
    passos: [
      p("Abra /consulta-ncm e repita 2 consultas do teste da Consulta NCM.", "Mesmo resultado do sistema interno."),
      p("Abra /validador-cadastro, envie o CSV de teste.", "Mostra o resumo e no máximo 3 itens com problema, com um cartão \"Libere o resultado completo\"."),
      p("Preencha o formulário do cartão.", "O resultado completo (todos os itens) é liberado."),
      p("Tente um arquivo .xls antigo e um arquivo grande.", "Mensagens claras em português; limite de 300 produtos e 2 MB."),
      p("Envie o mesmo arquivo 7 vezes seguidas em 1 minuto.", "A partir de certo ponto aparece \"Muitos envios seguidos\" (proteção contra abuso)."),
    ],
    cuidados: [],
    criterio: "Resumo sem login, detalhe só após contato, erros claros e limite de uso funcionando.",
    csvTeste: true,
  },
];

export const GRUPOS_ROTEIRO = [...new Set(ROTEIRO.map((r) => r.grupo))];
