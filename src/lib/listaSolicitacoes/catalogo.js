/**
 * Listas de solicitações ao cliente: uma por serviço da tela "Serviços e análises" (src/lib/servicosEmpresa.js).
 *
 * Regra do conteúdo: cada linha da lista é um DOCUMENTO que o cliente envia (arquivo, relatório, extração do ERP, contrato,
 * comprovante). Colunas de uma planilha e campos de cadastro (NCM, código, descrição...) não são linhas: vão no detalhe do
 * documento a que pertencem. Dados gerais (regime, ERP, contatos) ficam nos campos da Capa.
 *
 * Item: [título, detalhe/formato esperado, prioridade (A = Alta, M = Média, B = Baixa), subitens opcionais].
 * Subitem: texto simples ou [título, detalhe, prioridade]. Marcadores de texto: {periodo} (12 meses até a data-base),
 * {database} e {ano}; na planilha viram fórmulas ligadas à Capa.
 */
export const PRIORIDADES = { A: "Alta", M: "Média", B: "Baixa" };
export const PRAZOS_PADRAO = { Alta: 7, Média: 14, Baixa: 21 };

export const LISTAS = [
  {
    servico: "importacao-xml",
    nome: "Diagnóstico tributário",
    objetivo:
      "Para realizar o diagnóstico tributário precisamos dos arquivos fiscais da empresa (XML de NF-e, NFC-e e CT-e, ou uma planilha de operações), dos documentos de cadastro e de relatórios de créditos, preço e caixa listados abaixo.",
    secoes: [
      ["Cadastro da empresa", [
        ["Cartão CNPJ e comprovante de inscrição estadual (ou CAEPF) de cada empresa a analisar", "PDF. O cartão CNPJ traz razão social, CNAE, UF e município da sede.", "A"],
        ["Documento que comprove o regime de tributação de cada empresa em {ano}", "Termo de opção pelo Simples Nacional, ECF do último exercício ou, para produtor rural pessoa física, o último LCDPR.", "A"],
        ["Relação dos estabelecimentos (matriz, filiais, fazendas e armazéns)", "Excel ou cartões CNPJ e CAEPF, com UF e município de cada um.", "A"],
        ["Comprovante do enquadramento em regime específico, quando houver", "Inscrição de produtor rural (CAEPF), estatuto de cooperativa ou opção do Simples pelo regime regular do IBS e da CBS.", "M"],
      ]],
      ["Arquivos fiscais (XML ou planilha)", [
        ["XML das NF-e e NFC-e de saída (vendas), {periodo}", "Arquivos .xml de todos os estabelecimentos, separados por mês. Se forem muitos, envie compactados (.zip).", "A"],
        ["XML das NF-e de entrada (compras e aquisições), {periodo}", "Arquivos .xml (ou .zip). Inclua as notas de entrada emitidas pela própria empresa, como as compras de produtor rural.", "A"],
        ["XML dos CT-e e CT-e OS (frete) emitidos e recebidos, {periodo}", "Arquivos .xml. Aplicável a transportadoras e a empresas com fretes relevantes.", "M"],
        ["XML dos eventos de cancelamento das NF-e e dos CT-e, {periodo}", "Arquivos .xml, quando houver. Documento cancelado sai da análise.", "M"],
        ["Relatório dos serviços prestados e tomados (NFS-e), {periodo}", "Excel no modelo de planilha de operações (data, valor, NBS, município e ISS %). A análise lê XML de NF-e, NFC-e e CT-e; os serviços entram pela planilha.", "M"],
        ["Alternativa aos XML: planilha de operações no modelo enviado pela FAL", "Excel ou CSV.\nObrigatórias: Data, Entrada/Saída e Valor.\nRecomendadas: Descrição, Tipo (mercadoria ou serviço), NCM ou NBS, CFOP, UF de origem e de destino, PIS %, Cofins %, ICMS %, ISS %, Crédito elegível % e cClassTrib.", "M"],
      ]],
      ["Tributos e créditos", [
        ["Apuração de PIS e Cofins, {periodo}", "EFD-Contribuições ou planilha de apuração. Mostra o regime (cumulativo ou não cumulativo) por receita e as alíquotas, e completa as operações cujo XML não traz PIS e Cofins, como os CT-e.", "A"],
        ["Planilha dos créditos aproveitados, por tipo de compra", "Excel, separando revenda, insumo, uso e consumo, ativo imobilizado, serviços e fretes. Dela sai o percentual de crédito aproveitável; sem ela o crédito de IBS e CBS das compras importadas fica zerado até ser editado.", "A"],
        ["Atos concessórios e planilha-resumo dos benefícios e regimes especiais em uso", "PDF dos atos e Excel. Inclui isenção, redução de base, diferimento, crédito presumido e TTD de ICMS, ISS, PIS e Cofins.", "A"],
        ["Relatório de vendas por tipo de destinatário e de operação", "Excel, com o valor e o percentual do faturamento de: órgãos públicos, exportação, combustíveis e produtos sujeitos ao Imposto Seletivo.", "M"],
        ["Relatório de compras com crédito presumido", "Excel, com o valor anual e o documento de entrada. Inclui compras de produtor rural pessoa física, de transportador autônomo (TAC), de resíduos e de bens usados de pessoa física.", "M"],
        ["Inventário de estoques em 31/12/2026, por item e NCM", "Excel, com o custo de aquisição e os tributos pagos na compra. Base para o crédito presumido sobre o estoque existente em 1º de janeiro de 2027.", "M"],
      ]],
      ["Preço, margem e caixa", [
        ["Planilha de custo e margem por linha de produto ou serviço", "Excel, com preço, custo e margem. Sem ela a FAL usa custo de 65% e margem de 18% do preço.", "M"],
        ["Relatório de contas a receber e a pagar, com emissão e vencimento dos títulos, {periodo}", "Excel. Dele sai o prazo médio de recebimento e de pagamento.", "M"],
        ["Relatório de recebimentos por forma de pagamento, {periodo}", "Excel. Boleto, PIX, cartão e transferência, para estimar a parcela liquidada com recolhimento automático (split payment).", "M"],
      ]],
    ],
  },
  {
    servico: "validador-cadastro",
    nome: "Validação de cadastro",
    objetivo:
      "Para a validação de cadastro precisamos da planilha de produtos do ERP, com uma linha por produto. Conferimos NCM, classificação (cClassTrib) e duplicidades e devolvemos a planilha corrigida.",
    secoes: [
      ["Planilha de produtos", [
        ["Planilha com o cadastro de produtos do ERP, ativos e inativos", "Excel (.xlsx) ou CSV, uma linha por produto, até 50 mil itens (acima disso, envie por grupo). Pode ser a exportação do ERP como sai: a FAL indica qual coluna é qual.\nColunas obrigatórias: Código, Descrição e NCM (oito dígitos, formatada como texto para não perder o zero à esquerda; no SAP Business One, o NCM real da tabela ONCM e não o código interno).\nColunas opcionais: Unidade, Origem, cClassTrib informado, código de barras (EAN), saldo em estoque, grupo de produto, grupo contábil, princípio ativo (com concentração e formulação) e data da última movimentação ou do cadastro.", "A"],
      ]],
      ["Documentos de apoio", [
        ["Tabela de tributação por produto usada no ERP", "Excel exportado do sistema, com CST, alíquotas e enquadramentos.", "M"],
        ["Relação dos produtos com tratamento tributário diferenciado hoje, com o fundamento usado", "Excel. Cesta básica, insumos agropecuários, medicamentos, higiene e outros.", "M"],
        ["Política ou orientação de cadastro de produtos", "PDF ou texto. Define o que é o mesmo produto e o que é produto distinto (cor, tamanho, lado, voltagem, embalagem) e evita falsas indicações de duplicidade.", "M"],
      ]],
      ["Retorno", [
        ["Planilha devolvida com a posição do cliente sobre os itens em \"Atenção\" e em \"Corrigir\"", "Excel, com a decisão em cada item.", "M"],
      ]],
    ],
  },
  {
    servico: "saneamento-estoque",
    nome: "Saneamento de estoques",
    objetivo:
      "Para o saneamento de estoques precisamos das extrações do cadastro e do movimento de itens do ERP, das decisões do cliente sobre o escopo e de acesso a um ambiente de testes para validar as alterações antes de aplicá-las. O projeto vai da triagem dos itens até a política de uso dos estoques.",
    secoes: [
      ["Projeto e responsáveis", [
        ["Relação dos responsáveis por cadastro de produtos, almoxarifado, compras, fiscal, contábil e TI", "Excel ou texto, com nome, cargo e e-mail.", "A"],
        ["Relação de filiais, depósitos, almoxarifados e locais de estoque", "Excel, com código, descrição, tipo e responsável de cada local.", "A"],
      ]],
      ["Base de itens (Triagem e Checagens)", [
        ["Cadastro completo de itens, ativos, inativos e bloqueados", "Excel ou CSV como sai do ERP (até 60 MB). Campos: código, descrição, grupo, unidade de estoque, unidade de compra e itens por unidade de compra, NCM de 8 dígitos, origem, conta contábil, situação, fabricante, referência, código de barras, data de criação e de atualização. No SAP Business One: tabela OITM.", "A"],
        ["Tabela de NCM do ERP (código interno e NCM de 8 dígitos)", "Excel. No SAP Business One: tabela ONCM, pois o campo NCM do item guarda o código interno.", "A"],
        ["Extração da última movimentação de cada item", "Excel ou CSV. Base do corte \"itens não movimentados desde\". No SAP Business One: tabela OINM; no Protheus: último movimento em SD1, SD2 e SD3.", "A"],
        ["Extração do saldo de estoque por item e por depósito, na data da extração", "Excel ou CSV. No SAP Business One: tabela OITW; no Protheus: SB2.", "A"],
        ["Tabela de grupos de itens, com código e nome", "Excel. No SAP Business One: OITB; no Protheus: SBM.", "M"],
        ["Tabela de unidades de medida e fatores de conversão, com a política de unidades em uso", "Excel e texto.", "M"],
      ]],
      ["Escopo do saneamento", [
        ["Documento do cliente com as decisões de escopo do saneamento", "E-mail, ata ou formulário assinado. Deve definir: a data de corte (itens sem movimentação desde quando ficam fora, e como tratar o item sem data de movimentação); os grupos que entram e os que ficam de fora (exemplo: limpeza, copa e cozinha); e as variações que são observação e não produto distinto (cor, tipo, apresentação).", "A"],
      ]],
      ["Piloto no ERP", [
        ["Instruções de acesso ao ambiente de testes (homologação) do ERP", "Documento ou e-mail da TI com endereço, base e usuário de teste (senhas por canal seguro). Informe se o ERP bloqueia a troca da unidade de estoque de item com movimentação.", "A"],
        ["Autorização para executar as alterações aprovadas no cadastro de itens", "Documento ou e-mail com o usuário executor, as permissões e a janela de execução.", "M"],
        ["Documentação das regras e bloqueios do ERP para alterar ou inativar item", "Texto ou manual. Saldo, documentos em aberto, lista de materiais e pedidos que impedem a alteração.", "M"],
      ]],
      ["Execução e conferência", [
        ["Relação das equipes de execução (administrativo e ERP, e almoxarifado), com os responsáveis", "Lista.", "A"],
        ["Listas de tarefas devolvidas, preenchidas por cada equipe", "Planilha enviada pela FAL, com FEITO ou DIVERGÊNCIA, evidência, endereços e quantidade no almoxarifado.", "M"],
        ["Nova extração do cadastro depois das alterações, com as mesmas colunas da primeira", "Excel ou CSV. Base da conferência entre o esperado e o que ficou no ERP.", "M"],
      ]],
      ["Fiscal e Política", [
        ["Parametrização fiscal por item e tabela de tipos de entrada e saída (TES ou equivalente)", "Excel exportado do sistema, com CST, alíquotas e enquadramentos.", "M"],
        ["Política ou manual atual de cadastro de itens, nomenclatura e classificação fiscal", "PDF ou Word, se existir.", "M"],
        ["Designação dos responsáveis pela aprovação e pela manutenção da política", "Ata, e-mail ou ofício, com nome e cargo de cada responsável (cadastro, fiscal e contábil).", "A"],
        ["Documentação do módulo de cadastro automático ou do fluxo de aprovação de itens que receberá as regras da política", "A política sai também em arquivo estruturado para configurar esse módulo.", "B"],
      ]],
    ],
  },
  {
    servico: "classificacao-servicos",
    nome: "Classificação de serviços",
    objetivo:
      "Para a classificação de serviços precisamos da relação dos serviços da empresa e das condições de cada um (local, tomador e tratamento tributário). Correlacionamos o item da LC 116/2003, a NBS, o cIndOp e o cClassTrib.",
    secoes: [
      ["Serviços a classificar", [
        ["Planilha dos serviços prestados pela empresa", "Excel, uma linha por serviço, consultada em lote pela FAL.\nColunas: descrição como consta no contrato e na nota; item da LC 116/2003, código de tributação municipal e NBS usados hoje; valor anual; município de execução; perfil do tomador (empresa contribuinte, pessoa física, órgão público ou exterior); regra de local especial, se houver (entrega de bem, imóvel, serviço físico sobre pessoa, feira ou evento, exploração de via, TI e software).", "A"],
        ["Planilha dos serviços tomados (contratados) relevantes", "Excel, com as mesmas colunas da planilha dos serviços prestados.", "M"],
        ["Relação dos serviços prestados ou tomados do exterior ou para o exterior", "Excel, com o país e o tipo de serviço.", "M"],
      ]],
      ["Tratamento diferenciado", [
        ["Relação dos serviços com tratamento diferenciado hoje, com o fundamento", "Excel. Isenção, alíquota reduzida ou regime específico.", "M"],
      ]],
      ["Documentos de apoio", [
        ["Contratos-padrão de cada tipo de serviço", "PDF.", "M"],
        ["NFS-e emitida de cada tipo de serviço", "PDF ou XML.", "M"],
        ["Tabela de serviços do sistema emissor de NFS-e", "Excel exportado do sistema, com os códigos do cadastro.", "M"],
        ["Cartão CNPJ, com os CNAEs, e comprovante de inscrição municipal", "PDF.", "A"],
      ]],
    ],
  },
  {
    servico: "validador-nfse",
    nome: "Validação de NFS-e",
    objetivo:
      "Para a validação de NFS-e precisamos de XML da DPS e da NFS-e de cada tipo de serviço e de documentos do emissor. Conferimos a estrutura, os campos de IBS e CBS e os códigos cIndOp e cClassTrib (padrão nacional, XSD v1.01).",
    secoes: [
      ["Documentos para validar", [
        ["XML da DPS e da NFS-e de cada tipo de serviço prestado, um arquivo por situação", "Arquivos .xml, um por situação (cada arquivo é validado separadamente). Envie ao menos os dois primeiros casos abaixo.", "A", [
          ["XML de prestação a tomador pessoa jurídica (contribuinte)", "", "A"],
          ["XML de prestação a pessoa física (consumidor final)", "", "A"],
          ["XML de prestação a órgão público", "", "M"],
          ["XML de serviço com retenção de tributos", "", "M"],
          ["XML de serviço prestado ou tomado do exterior", "", "M"],
          ["XML de serviço com dedução ou redução de base (obras e construção civil)", "", "M"],
          ["XML de operação com cClassTrib diferente do padrão (alíquota reduzida, isenção ou diferimento)", "", "M"],
        ]],
        ["XML de documentos rejeitados ou com erro, com o texto da rejeição recebido", "Arquivos .xml e o texto do retorno do ambiente nacional ou do município.", "A"],
        ["XML das NFS-e mais recentes em produção de cada município de emissão, uma por tipo de serviço", "Arquivos .xml.", "M"],
        ["Relação dos serviços com os códigos usados na DPS", "Excel. Item da LC 116/2003, código de tributação, NBS, cIndOp e cClassTrib.", "A"],
      ]],
      ["Emissor e empresa", [
        ["Comprovante de habilitação no emissor nacional de NFS-e ou no sistema municipal", "PDF ou imagem da tela. Mostra se a empresa emite pelo ambiente nacional (padrão nacional) ou por sistema municipal.", "A"],
        ["Comprovante de inscrição municipal de cada estabelecimento", "PDF. Indica o município de emissão.", "A"],
        ["Comprovante de opção pelo Simples Nacional ou do MEI (CCMEI), se for o caso", "PDF.", "A"],
        ["Comunicado ou cronograma do fornecedor do emissor sobre a adequação ao IBS e à CBS", "PDF ou e-mail.", "M"],
        ["Instruções de acesso ao ambiente de homologação do emissor, se existir", "Documento ou e-mail, com usuário de teste (senhas por canal seguro).", "B"],
      ]],
    ],
  },
];

export const listaDoServico = (servico) => LISTAS.find((l) => l.servico === servico) || null;

/** Itens que o cliente responde (cada subitem conta; o item com subitens é só o título do grupo). */
export function folhas(lista) {
  const r = [];
  for (const [area, itens] of lista.secoes) {
    for (const [titulo, detalhe, prio, subs] of itens) {
      if (subs && subs.length) for (const s of subs) { const [t, d, p] = Array.isArray(s) ? s : [s, "", null]; r.push({ area, titulo: t, detalhe: d, prio: p || prio }); }
      else r.push({ area, titulo, detalhe, prio });
    }
  }
  return r;
}

/** Erros do catálogo (lista vazia = tudo certo): prioridade inválida, serviço repetido e linha que não é documento. */
export function validarCatalogo(listas = LISTAS) {
  const erros = [];
  const vistos = new Set();
  for (const l of listas) {
    if (!l.servico || !l.nome || !Array.isArray(l.secoes) || !l.secoes.length) { erros.push(`${l.servico || "?"}: faltam servico, nome ou secoes`); continue; }
    if (vistos.has(l.servico)) erros.push(`${l.servico}: serviço repetido`);
    vistos.add(l.servico);
    for (const [area, itens] of l.secoes) {
      if (!area || !Array.isArray(itens) || !itens.length) erros.push(`${l.servico}: seção sem nome ou sem itens`);
      for (const [titulo, , prio, subs] of itens || []) {
        const ref = `${l.servico} / ${area} / ${titulo}`;
        if (!PRIORIDADES[prio]) erros.push(`${ref}: prioridade inválida`);
        // uma linha é um documento: título curto de uma ou duas palavras ("NCM", "Descrição") é campo de planilha
        if (String(titulo || "").trim().split(/\s+/).length < 3) erros.push(`${ref}: a linha deve ser um documento, não um campo`);
        for (const s of subs || []) {
          const [t, , p] = Array.isArray(s) ? s : [s, "", null];
          if (p && !PRIORIDADES[p]) erros.push(`${ref} / ${t}: prioridade inválida`);
          if (String(t || "").trim().split(/\s+/).length < 3) erros.push(`${ref} / ${t}: a linha deve ser um documento, não um campo`);
        }
      }
    }
  }
  return erros;
}
