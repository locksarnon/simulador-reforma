/**
 * Funções puras do módulo "Saneamento de Estoques e Cadastro de Produtos" (sem React, sem rede).
 * Espelham o contrato do servidor (backend/src/saneamento-estoques/tipos.ts e docs/saneamento-estoques-contrato.md).
 */

// ── Camadas e situações ──────────────────────────────────────────────────────

export const CAMADAS = [
  "IDENTIFICACAO", "QUALIDADE", "DUPLICIDADE", "GRUPOS_FINALIDADE", "NOMES_UNIDADES", "NCM", "ESTOQUE", "FINALIDADE", "NCM_CLASSIFICACAO", "TRIBUTARIO", "OBRIGACOES",
];

/** Título do grupo de colunas de cada camada na tabela única. GRUPOS_FINALIDADE é só "Grupos" (a finalidade virou camada da Fase 2). */
export const ROTULO_CAMADA = {
  IDENTIFICACAO: "Identificação", QUALIDADE: "Qualidade", DUPLICIDADE: "Duplicidades", GRUPOS_FINALIDADE: "Grupos",
  NOMES_UNIDADES: "Nomes e unidades", NCM: "Validar NCM", ESTOQUE: "Estoque", FINALIDADE: "Finalidade", NCM_CLASSIFICACAO: "Classificação NCM",
  TRIBUTARIO: "Tratamento tributário", OBRIGACOES: "Impacto no SPED",
};

/**
 * Fases do trabalho (backend dados/constantes.ts FASES). Impacto no SPED roda no fim de cada fase; o Estoque é da Fase 1 (só com o módulo
 * de conciliação). As camadas da Fase 2 exigem a Fase 1 liberada, o regime do cliente e as atividades confirmadas.
 */
export const FASES = {
  FASE1: ["IDENTIFICACAO", "QUALIDADE", "DUPLICIDADE", "GRUPOS_FINALIDADE", "NOMES_UNIDADES", "NCM", "ESTOQUE", "OBRIGACOES"],
  FASE2: ["FINALIDADE", "NCM_CLASSIFICACAO", "TRIBUTARIO", "OBRIGACOES"],
};
export const LISTA_FASES = ["FASE1", "FASE2"];
export const ROTULO_FASE = { FASE1: "Fase 1 · Saneamento de estoques", FASE2: "Fase 2 · Tributário e Reforma" };
/** Nome da liberação de cada fase (a versão "Cadastro saneado" e a "Tributário aprovado"). */
export const ROTULO_LIBERACAO = { FASE1: "Cadastro saneado", FASE2: "Tributário aprovado" };
/** Primeira fase que contém a camada (Impacto no SPED = Fase 1). */
export const faseDaCamada = (c) => LISTA_FASES.find((f) => FASES[f].includes(c)) || null;
/** Camadas da fase entre as ativas do projeto (Estoque só com o módulo de conciliação). */
export const camadasDaFase = (fase, modulos) => (FASES[fase] || []).filter((c) => camadasAtivas(modulos).includes(c));
/** Camadas que só rodam depois da Fase 1 liberada, com o regime e as atividades. Impacto no SPED roda sem trava. */
export const CAMADAS_TRAVADAS_FASE2 = ["FINALIDADE", "NCM_CLASSIFICACAO", "TRIBUTARIO"];

/** Regime do cliente no IBS e na CBS (premissa obrigatória da Fase 2). Espelha backend/src/saneamento-estoques/fiscal/regimes.ts. */
export const REGIMES_CLIENTE = [
  { codigo: "REGULAR", rotulo: "Regime regular", fundamento: "LC 214/2025, arts. 21 e 41" },
  { codigo: "SIMPLES_NO_SIMPLES", rotulo: "Simples Nacional, recolhendo IBS e CBS no Simples", fundamento: "LC 214/2025, art. 47, § 9º" },
  { codigo: "SIMPLES_REGULAR", rotulo: "Simples Nacional, recolhendo IBS e CBS no regime regular", fundamento: "LC 214/2025, art. 41, § 3º" },
  { codigo: "PRODUTOR_RURAL_NAO_CONTRIBUINTE", rotulo: "Produtor rural não contribuinte", fundamento: "LC 214/2025, art. 164" },
  { codigo: "PRODUTOR_RURAL_CONTRIBUINTE", rotulo: "Produtor rural contribuinte (por opção)", fundamento: "LC 214/2025, art. 165" },
];
/** Texto da fase de uma liberação: "Fase 1 · Cadastro saneado". Versão antiga (sem fase) = vazio. */
export const rotuloDaFaseLiberada = (fase) => (ROTULO_LIBERACAO[fase] ? `${fase === "FASE1" ? "Fase 1" : "Fase 2"} · ${ROTULO_LIBERACAO[fase]}` : "");
/** Há Fase 1 liberada? Pela resposta de GET fases; sem ela, pelas versões liberadas (resumo.fase). */
export function fase1Liberada(dadosFases, versoes) {
  const f1 = (dadosFases?.fases || []).find((f) => f.fase === "FASE1");
  if (f1) return !!f1.liberada;
  return (Array.isArray(versoes) ? versoes : []).some((v) => v?.resumo?.fase === "FASE1");
}
export const regimeDoCliente = (codigo) => REGIMES_CLIENTE.find((r) => r.codigo === codigo) || null;

/** Campos do item que cada camada revisa (visão focada). `campos.*` = campo extra da importação. */
export const CAMPOS_DA_CAMADA = {
  IDENTIFICACAO: ["codigo", "estabelecimento", "descricao", "referencia", "fabricante"],
  QUALIDADE: ["descricao", "unidade", "ncm", "ativo", "ultimaMovimentacao"],
  DUPLICIDADE: ["codigo", "descricao", "unidade", "fabricante", "referencia"],
  GRUPOS_FINALIDADE: ["grupo"],
  NOMES_UNIDADES: ["descricao", "unidade"],
  NCM: ["ncm", "descricao"],
  ESTOQUE: ["saldo", "unidade", "ultimaMovimentacao"],
  FINALIDADE: ["grupo", "finalidade", "tambemUsadoComo"],
  NCM_CLASSIFICACAO: ["ncm", "descricao"],
  TRIBUTARIO: ["ncm", "finalidade", "cClassTrib", "cst"],
  OBRIGACOES: ["codigo", "unidade", "ncm"],
};

// ── Rótulos (o mesmo dicionário do material do cliente: backend/src/saneamento-estoques/rotulos.ts; o teste confere que são iguais) ──

/** Campos do item e da proposta. Nenhum código interno de campo aparece na tela. */
export const ROTULO_CAMPO = {
  codigo: "Código", estabelecimento: "Estabelecimento", descricao: "Descrição", unidade: "Unidade", ncm: "NCM", grupo: "Grupo", ativo: "Ativo",
  saldo: "Saldo", ultimaMovimentacao: "Última movimentação", fabricante: "Fabricante", referencia: "Referência", finalidade: "Finalidade",
  tambemUsadoComo: "Também usado como", fatorConversao: "Fator de conversão", unidadeCompra: "Unidade de compra", cClassTrib: "cClassTrib", cst: "CST", enquadramentoLegal: "Enquadramento legal", artigo: "Artigo", origem: "Origem",
  fatorSituacao: "Situação do fator", exigeFator: "Exige fator", fatorDe: "Fator: 1 unidade de", fatorPara: "Fator: equivale a (unidade)",
  decisao: "Decisão", manter: "Código mantido", consolidar: "Código consolidado", ajustes: "Ajustes", valorOriginal: "Valor original", valorProposto: "Valor proposto",
  tipoImpacto: "Tipo de impacto", codigoAntigo: "Código antigo", decisoesPossiveis: "Decisões possíveis", codigos: "Códigos", descricoes: "Descrições",
  tratamentoDoSaldo: "Tratamento do saldo", arvore: "Árvore de grupos", subgrupos: "Subgrupos",
};
export const rotuloDoCampo = (c) => { const k = String(c ?? "").replace(/^campos\./, ""); return ROTULO_CAMPO[k] || k; };

/** Tipos de caso: a coluna, o filtro e o lote mostram sempre o rótulo. */
export const ROTULO_TIPO_CASO = {
  // Identificação e qualidade
  CODIGO_AUSENTE: "Código ausente", CODIGO_REPETIDO: "Código repetido", CODIGO_FORMATO: "Formato do código", CODIGO_ZEROS_ESQUERDA: "Zeros à esquerda no código",
  CODIGO_ANTIGO: "Código antigo", CODIGO_ANTIGO_EM_USO: "Código antigo em uso", CODIGO_DESCRICOES_DIVERGENTES: "Mesmo código com descrições diferentes",
  ESTABELECIMENTO_AUSENTE: "Estabelecimento ausente", CAMPO_OBRIGATORIO_VAZIO: "Campo obrigatório vazio", DESCRICAO_INSUFICIENTE: "Descrição insuficiente",
  SALDO_INVALIDO: "Saldo inválido", SALDO_NEGATIVO: "Saldo negativo", SEM_DATA_MOVIMENTACAO: "Sem data de movimentação", DATA_MOVIMENTACAO_INVALIDA: "Data de movimentação inválida",
  ITEM_INATIVO_COM_USO: "Item inativo com uso", SEM_MOVIMENTACAO: "Sem movimentação desde o corte (inativar)",
  SEM_MOVIMENTACAO_COM_SALDO: "Sem movimentação desde o corte, com saldo", UNIDADE_AUSENTE: "Unidade ausente", NCM_AUSENTE: "NCM ausente",
  // Duplicidade
  DUPLICIDADE_EXATA: "Duplicidade exata", DUPLICIDADE_INDICACAO_ALTA: "Indício alto de duplicidade", DUPLICIDADE_INDICACAO_POSSIVEL: "Possível duplicidade",
  DUPLICIDADE_COM_SALDO: "Duplicidade com saldo", APRESENTACOES_DISTINTAS: "Apresentações distintas", ATRIBUTOS_CONFLITANTES: "Atributos conflitantes",
  REFERENCIA_COINCIDENTE: "Mesma referência do fabricante", REFERENCIA_COINCIDENTE_CONDICAO_DIFERENTE: "Mesma referência, condição diferente (original × paralelo)",
  REFERENCIA_FABRICANTES_DIFERENTES: "Mesma referência, fabricantes diferentes", REFERENCIA_COINCIDENTE_SEM_FABRICANTE: "Mesma referência, sem fabricante",
  // Grupos e finalidade (casos da camada Grupos e da camada Finalidade)
  ITEM_SEM_GRUPO: "Item sem grupo", GRUPO_GENERICO: "Grupo genérico", GRUPO_NOME_VARIANTE: "Nome de grupo variante", GRUPOS_SOBREPOSTOS: "Grupos sobrepostos",
  ITEM_DESLOCADO: "Item fora do grupo", NECESSIDADE_NOVO_GRUPO: "Necessidade de grupo novo", FINALIDADE_GRUPO: "Finalidade do grupo", FINALIDADE_EXCECAO: "Exceção à finalidade do grupo",
  FINALIDADE_SUGERIDA: "Finalidade sugerida",
  // Nomes e unidades
  DESCRICAO_FORA_DO_PADRAO: "Descrição fora do padrão", TERMO_GENERICO: "Descrição com termo genérico", ABREVIACAO_ESCONDE_ATRIBUTO: "Abreviação que esconde atributo",
  CARACTERES_INVALIDOS: "Caracteres inválidos", TAMANHO_EXCEDIDO: "Tamanho acima do limite do ERP", UNIDADE_CONVERSAO: "Conversão de unidade",
  UNIDADE_GRAFIA: "Grafia da unidade", UNIDADE_SEM_REGRA: "Unidade sem regra", UNIDADE_INCOMPATIVEL: "Unidade incompatível",
  DESCRICAO_FORA_PADRAO: "Descrição fora do padrão da regra", TERMO_PROIBIDO: "Termo proibido na descrição", COMPONENTE_AUSENTE: "Componente ausente na descrição",
  UNIDADE_NAO_PERMITIDA: "Unidade não permitida", UNIDADE_FORA_CRITERIO: "Unidade fora do critério", EXCEDE_LIMITE_DESTINO: "Acima do limite de caracteres",
  LIMITE_NAO_CONFIRMADO: "Limite de caracteres não confirmado", ATRIBUTO_AUSENTE: "Atributo obrigatório ausente",
  // NCM
  NCM_FORMATO: "Formato do NCM", NCM_INEXISTENTE: "NCM inexistente", NCM_NAO_VIGENTE: "NCM não vigente", NCM_CLASSIFICACAO_ANTIGA: "NCM de classificação antiga", NCM_DIVERGENTE_ENTRE_ITENS_IGUAIS: "NCM diferente entre itens iguais",
  NCM_INCOMPATIVEL_DESCRICAO: "NCM incompatível com a descrição", NCM_INCOERENTE: "NCM incoerente", NCM_INFO_INSUFICIENTE: "Informação insuficiente para o NCM",
  NCM_PREENCHIMENTO_INVALIDO: "Preenchimento inválido do NCM",
  // Tratamento tributário
  ENQUADRAMENTO_CONJUNTO: "Enquadramento do conjunto", ENQUADRAMENTO_CONFERIDO: "Enquadramento conferido", EXCECAO_ITEM: "Exceção do item", EXCECAO_MANUAL: "Exceção do item",
  AGUARDANDO_NCM: "Aguardando NCM", AGUARDANDO_FINALIDADE: "Aguardando finalidade", AGUARDANDO_INFORMACAO: "Aguardando informação",
  // Obrigações
  IMPACTO_MUDOU_CODIGO_DESCRICAO: "Impacto: código ou descrição", IMPACTO_MUDOU_UNIDADE: "Impacto: unidade ou conversão", IMPACTO_CONSOLIDOU_INATIVOU: "Impacto: consolidação de código", IMPACTO_INATIVOU: "Impacto: inativação de código",
  IMPACTO_MUDOU_NCM: "Impacto: NCM", IMPACTO_MUDOU_TRATAMENTO: "Impacto: tratamento (CST/cClassTrib)", IMPACTO_ITEM_ATIVO_IMOBILIZADO: "Impacto: bem do ativo imobilizado",
};
/** Rótulo do tipo de caso; o que não estiver no dicionário vira texto legível (nunca o código com sublinhado). */
export function rotuloTipoCaso(tipo) {
  if (ROTULO_TIPO_CASO[tipo]) return ROTULO_TIPO_CASO[tipo];
  const t = String(tipo ?? "").toLowerCase().replace(/_+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

/** Valores codificados (decisões, finalidades, situação do fator, tipo de impacto). */
export const ROTULO_VALOR = {
  REVENDA: "Revenda", MATERIA_PRIMA: "Matéria-prima", INSUMO_PRODUCAO: "Insumo de produção", EMBALAGEM: "Embalagem", USO_CONSUMO: "Uso e consumo", MANUTENCAO: "Manutenção",
  IMOBILIZADO: "Imobilizado", MATERIAL_TERCEIROS: "Material de terceiros", HERDADO: "Herdado do conjunto", EXCECAO: "Exceção do item", INFORMAR: "a informar", CONFIRMAR: "a confirmar",
  INFORMADO: "informado", DEFINIDO: "definido", CADASTRAL_FUTURO: "Ajuste cadastral futuro", REGULARIZACAO_SALDO: "Regularização de saldo",
  ESCRITURACAO_ENTREGUE: "Impacto em escrituração já entregue", PROPOR_CONSOLIDACAO: "Propor consolidação", SOLICITAR_INFORMACAO: "Solicitar informação",
  RELACIONAR_APRESENTACOES: "Relacionar apresentações", PROPOR_INATIVACAO: "Propor inativação", REGULARIZAR_SALDO: "Regularizar o saldo antes de inativar",
  MANTER_DISTINTOS: "Manter distintos", CORRIGIR_IDENTIFICACAO: "Corrigir a identificação", RELACIONAR_EQUIVALENTES: "Relacionar equivalentes", SIM: "Sim", NAO: "Não",
  true: "Sim", false: "Não",
};
export const rotuloDoValor = (v) => ROTULO_VALOR[v] ?? v;
/** Campos cujo valor é um código (o texto mostra o rótulo). Descrição, grupo e afins nunca passam pelo dicionário. */
const CAMPOS_CODIFICADOS = ["decisao", "finalidade", "tambemUsadoComo", "fatorSituacao", "origem", "tipoImpacto", "exigeFator", "ativo"];

export const FINALIDADES = ["REVENDA", "MATERIA_PRIMA", "INSUMO_PRODUCAO", "EMBALAGEM", "USO_CONSUMO", "MANUTENCAO", "IMOBILIZADO", "MATERIAL_TERCEIROS"];
export const ROTULO_FINALIDADE = {
  REVENDA: "Revenda", MATERIA_PRIMA: "Matéria-prima", INSUMO_PRODUCAO: "Insumo de produção", EMBALAGEM: "Embalagem", USO_CONSUMO: "Uso e consumo",
  MANUTENCAO: "Manutenção", IMOBILIZADO: "Imobilizado", MATERIAL_TERCEIROS: "Material de terceiros",
};
export const rotuloFinalidade = (f) => ROTULO_FINALIDADE[f] || (f ? String(f) : "");

/** As 5 situações da célula. `forma` distingue sem depender da cor (a tela desenha um ícone diferente para cada uma). */
export const SITUACOES = {
  PENDENTE: { rotulo: "Pendente", curto: "Pendente", forma: "circulo", ordem: 0 },
  SEM_PROBLEMA: { rotulo: "Sem problema", curto: "Sem problema", forma: "visto", ordem: 4 },
  PROPOSTO: { rotulo: "Proposto", curto: "Proposto", forma: "losango", ordem: 2 },
  APROVADO: { rotulo: "Aprovado", curto: "Aprovado", forma: "quadrado", ordem: 3 },
  AGUARDANDO_INFORMACAO: { rotulo: "Aguardando informação", curto: "Aguardando", forma: "relogio", ordem: 1 },
};
export const LISTA_SITUACOES = Object.keys(SITUACOES);
export const rotuloSituacao = (s) => SITUACOES[s]?.rotulo || "Sem dados";
export const formaDaSituacao = (s) => SITUACOES[s]?.forma || "traco";

/** Texto lido por leitor de tela e usado como dica: "Proposto, revisar". */
export const textoDaCelula = (celula) => {
  if (!celula) return "Sem dados";
  return `${rotuloSituacao(celula.situacao)}${celula.revisar ? ", revisar" : ""}`;
};

/** A célula de uma camada dentro da lista de células de um item. */
export const celulaDa = (item, camada) => (item?.celulas || []).find((c) => c.camada === camada) || null;

/** Camadas que aparecem: ESTOQUE só com o módulo de conciliação ligado. */
export const camadasAtivas = (modulos) => CAMADAS.filter((c) => c !== "ESTOQUE" || modulos?.conciliacao === true);

/**
 * Situação agregada de um conjunto de células (visão geral). Mostra o que ainda exige trabalho primeiro:
 * pendente, depois aguardando informação, depois proposto; só então aprovado e sem problema.
 */
export function situacaoAgregada(contagem) {
  const c = contagem || {};
  for (const s of ["PENDENTE", "AGUARDANDO_INFORMACAO", "PROPOSTO", "APROVADO", "SEM_PROBLEMA"]) if (Number(c[s]) > 0) return s;
  return null;
}
export const totalDeCelulas = (contagem) => LISTA_SITUACOES.reduce((s, k) => s + (Number(contagem?.[k]) || 0), 0);

// ── Atividades (premissa da Fase 2) e trava da Fase 2 ───────────────────────

export const MENSAGEM_TRAVA = "Confirme as atividades do cliente para analisar a Fase 2";

/**
 * Mensagens dos bloqueios da Fase 2 (erro 400 do servidor ou `bloqueio` de GET fases), na ordem em que o servidor confere.
 * A importação e as camadas da Fase 1 nunca são bloqueadas.
 */
export const MENSAGEM_BLOQUEIO_FASE2 = {
  FASE1_NAO_LIBERADA: "Libere uma versão da Fase 1 (Cadastro saneado) em Fase 1 > Entrega da Fase 1 para começar a Fase 2.",
  REGIME_NAO_INFORMADO: "Informe o regime do cliente em Fase 2 > Premissas para analisar a Fase 2.",
  ATIVIDADES_NAO_CONFIRMADAS: "Confirme as atividades do cliente em Fase 2 > Premissas para analisar a Fase 2.",
};
/** Onde se resolve cada bloqueio da Fase 2: a fase, a aba e o texto do botão. */
export function acaoDoBloqueio(codigo) {
  if (codigo === "FASE1_NAO_LIBERADA") return { fase: "fase1", aba: "entrega", rotulo: "Ir para a Entrega da Fase 1" };
  if (codigo === "REGIME_NAO_INFORMADO" || codigo === "ATIVIDADES_NAO_CONFIRMADAS") return { fase: "fase2", aba: "premissas", rotulo: "Ir para as Premissas" };
  return null;
}

/** Estado das atividades do cliente (campos `atividadesConfirmadas`, `cnpjDesatualizado` e `atividades`). Só a Fase 2 depende delas. */
export function estadoDaTrava(projeto) {
  const atividades = projeto?.atividades || [];
  const mantidas = atividades.filter((a) => a.mantida).length;
  const confirmada = !!projeto?.atividadesConfirmadas;
  return {
    confirmada,
    mantidas,
    podeConfirmar: !confirmada && mantidas >= 1,
    motivoSemConfirmar: confirmada ? null : mantidas < 1 ? "Mantenha ou acrescente pelo menos uma atividade." : null,
    revisarAtividades: !!projeto?.cnpjDesatualizado,
    editavel: !confirmada,
  };
}

/** Módulos opcionais: nesta entrega nenhum é ligável. */
export const MODULOS_OPCIONAIS = [
  {
    id: "conciliacao", titulo: "Conciliação de estoque",
    oQueE: "Confronta, item a item, o saldo inicial mais as entradas e menos as saídas com o saldo final.",
    exige: "Saldo inicial, movimentação do período e saldo final na importação.",
    oQueMuda: "A camada Estoque aparece na tabela, e entram as solicitações de documentos, as pendências e a seção do relatório.",
  },
  {
    id: "blocosKG", titulo: "Blocos K e G do SPED",
    oQueE: "Confere o cadastro contra o Bloco K (controle da produção e do estoque) e o Bloco G (controle do crédito do ativo permanente).",
    exige: "Arquivos de EFD ICMS/IPI do cliente e, para o Bloco K, a estrutura de produção.",
    oQueMuda: "Passam a existir conferências de registros 0200, K200 e do CIAP, com suas pendências no relatório.",
  },
  {
    id: "arquivoErp", titulo: "Arquivo para o ERP",
    oQueE: "Gera o cadastro saneado no formato de carga do ERP do cliente.",
    exige: "O leiaute de carga do ERP confirmado por escrito pelo cliente ou pelo fornecedor.",
    oQueMuda: "Acrescenta uma entrega: o arquivo de carga, separado do Excel e do relatório.",
  },
];

// ── Erros da API, conflito 409 ───────────────────────────────────────────────

export const dadosDoErro = (err) => err?.response?.data || {};
export const codigoDoErro = (err) => dadosDoErro(err).codigo || null;

/** 409 CONFLITO_VERSAO: outra pessoa gravou antes. (Um 409 sem código também é tratado como conflito de versão.) */
export const ehConflitoVersao = (err) => err?.status === 409 && (codigoDoErro(err) === "CONFLITO_VERSAO" || !codigoDoErro(err));
export const ehTravaNaoConfirmada = (err) => err?.status === 400 && codigoDoErro(err) === "ATIVIDADES_NAO_CONFIRMADAS";
/** Erro 400 de uma trava da Fase 2 (Fase 1 não liberada, regime não informado, atividades não confirmadas). */
export const ehTravaDaFase2 = (err) => err?.status === 400 && Object.hasOwn(MENSAGEM_BLOQUEIO_FASE2, codigoDoErro(err) ?? "");
export const naoEncontrado = (err) => err?.status === 404;

export const ehErroDeRede = (err) => !err?.status && /Network Error|timeout|ECONNABORTED|ERR_NETWORK/i.test(`${err?.message || ""} ${err?.code || ""}`);
export const ehAtividadesConfirmadas = (err) => err?.status === 409 && codigoDoErro(err) === "ATIVIDADES_CONFIRMADAS";
export const ehPropostaDesatualizada = (err) => err?.status === 409 && codigoDoErro(err) === "PROPOSTA_DESATUALIZADA";
/** Campos divergentes que o servidor devolve em PROPOSTA_DESATUALIZADA: [{campo, atual, esperado}]. */
export const camposDivergentes = (err) => (Array.isArray(dadosDoErro(err).campos) ? dadosDoErro(err).campos : []);
export const exigeConfirmarFator = (err) => err?.status === 400 && codigoDoErro(err) === "CONFIRMAR_FATOR";

export function mensagemDeErro(err, padrao = "Não foi possível concluir. Tente de novo.") {
  if (ehErroDeRede(err)) return "Sem conexão com o servidor ou o tempo esgotou. Verifique a rede e tente de novo.";
  if (ehConflitoVersao(err)) return "Outra pessoa alterou este registro depois que você o abriu. Recarregamos os dados e mantivemos o que você digitou: confira e salve de novo.";
  if (ehTravaDaFase2(err)) return MENSAGEM_BLOQUEIO_FASE2[codigoDoErro(err)];
  const m = err?.message;
  return m && !/^Request failed with status code/.test(m) ? m : padrao;
}

/**
 * Depois de um conflito: o registro recarregado traz a versão nova, e o que o usuário digitou é mantido.
 * `mudou` diz se a proposta no servidor é diferente da que o usuário via, para a tela avisar.
 */
export function aposConflito(edicao, recarregado, vistoAntes) {
  const mudou = JSON.stringify(recarregado?.proposta ?? null) !== JSON.stringify(vistoAntes?.proposta ?? null) || (recarregado?.situacao ?? null) !== (vistoAntes?.situacao ?? null);
  return {
    edicao: { ...edicao },
    versao: recarregado?.versao,
    mudou,
    aviso: mudou ? "O caso mudou no servidor. Suas alterações continuam na tela; confira antes de salvar." : "Outra pessoa gravou este caso. Suas alterações continuam na tela; salve de novo.",
  };
}

// ── Virtualização ────────────────────────────────────────────────────────────

/** Janela de linhas a desenhar: só as visíveis mais uma folga acima e abaixo. */
export function janelaVisivel({ rolagem = 0, alturaVisivel = 600, alturaLinha = 36, total = 0, folga = 8 }) {
  const n = Math.max(0, Number(total) || 0);
  const alturaTotal = n * alturaLinha;
  if (n === 0) return { inicio: 0, fim: 0, topo: 0, alturaTotal: 0 };
  const primeira = Math.floor(Math.max(0, rolagem) / alturaLinha);
  const quantas = Math.ceil(Math.max(1, alturaVisivel) / alturaLinha);
  const inicio = Math.min(n - 1, Math.max(0, primeira - folga));
  const fim = Math.min(n, primeira + quantas + folga);
  return { inicio, fim, topo: inicio * alturaLinha, alturaTotal };
}

/** Rolagem que põe a linha `indice` no terço de cima da área visível. */
export const rolagemParaLinha = (indice, alturaLinha, alturaVisivel) => Math.max(0, indice * alturaLinha - Math.floor(alturaVisivel / 3));

/** Precisa buscar a próxima página? Quando a janela chega perto do fim do que já foi carregado. */
export const precisaCarregarMais = ({ fim, carregadas, temMais, margem = 60 }) => !!temMais && fim >= carregadas - margem;

/**
 * Próximo item com trabalho a fazer depois de `indiceAtual` (-1 = do começo). Com `camada`, só olha essa camada;
 * sem ela, qualquer camada ativa com célula pendente. Devolve o índice ou -1.
 */
export function proximoPendente(itens, indiceAtual, camada, camadas = CAMADAS) {
  const alvo = camada ? [camada] : camadas;
  for (let i = Math.max(-1, indiceAtual) + 1; i < itens.length; i++) {
    if ((itens[i].celulas || []).some((c) => alvo.includes(c.camada) && c.situacao === "PENDENTE")) return i;
  }
  return -1;
}

// ── Filtros ──────────────────────────────────────────────────────────────────

const vazio = (v) => v === undefined || v === null || v === "" || v === false;

/** Parâmetros da lista de itens: só o que foi preenchido (o servidor recusa situação inválida, então nada de campo vazio). */
export function montarFiltroItens(f = {}, { cursor, limite = 300 } = {}) {
  const p = {};
  if (!vazio(f.camada)) p.camada = f.camada;
  if (!vazio(f.situacao)) p.situacao = f.situacao;
  if (!vazio(f.grupo)) p.grupo = f.grupo;
  if (f.revisar) p.revisar = "true";
  if (!vazio(f.busca) && String(f.busca).trim()) p.busca = String(f.busca).trim();
  if (f.ordem === "grupo") p.ordem = "grupo";
  if (cursor) p.cursor = cursor;
  p.limite = limite;
  return p;
}

export function montarFiltroCasos(f = {}, { cursor, limite = 200 } = {}) {
  const p = {};
  if (!vazio(f.camada)) p.camada = f.camada;
  // "ABERTOS" = proposto + rascunho (o servidor aceita lista separada por vírgula).
  if (!vazio(f.situacao)) p.situacao = f.situacao === "ABERTOS" ? "PROPOSTO,RASCUNHO" : f.situacao;
  if (!vazio(f.grupo)) p.grupo = f.grupo;
  if (!vazio(f.tipo)) p.tipo = f.tipo;
  if (!vazio(f.origem)) p.origem = f.origem;
  if (!vazio(f.item_id)) p.item_id = f.item_id;
  if (cursor) p.cursor = cursor;
  p.limite = limite;
  return p;
}

export const SITUACOES_DO_CASO = {
  PROPOSTO: "Proposto", RASCUNHO: "Rascunho", APROVADO: "Aprovado", REJEITADO: "Rejeitado", AGUARDANDO_INFORMACAO: "Aguardando informação", OBSOLETO: "Substituído",
};
export const rotuloSituacaoCaso = (s) => SITUACOES_DO_CASO[s] || String(s || "");
export const casoAberto = (c) => c?.situacao === "PROPOSTO" || c?.situacao === "RASCUNHO";

/** Quais botões o caso admite, conforme a situação (as regras do servidor, para a tela não oferecer o que será recusado). */
export function acoesDoCaso(caso) {
  const s = caso?.situacao;
  const aberto = s === "PROPOSTO" || s === "RASCUNHO";
  return {
    editar: aberto || s === "AGUARDANDO_INFORMACAO",
    salvarRascunho: aberto || s === "AGUARDANDO_INFORMACAO",
    aprovar: aberto,
    rejeitar: aberto,
    pedirInformacao: aberto,
    reabrir: s === "APROVADO" || s === "REJEITADO" || s === "AGUARDANDO_INFORMACAO",
    desfaz: s === "APROVADO",
  };
}

/** Por que "Aprovar" fica desligado (o servidor recusa estes casos), ou null se pode aprovar. */
export function razaoSemAprovar(caso, proposta, justificativa) {
  if (!caso) return null;
  const p = proposta ?? caso.proposta ?? {};
  if (caso.tipo === "FINALIDADE_EXCECAO" && String(justificativa ?? caso.justificativa ?? "").trim().length < 5) return "Exceção exige motivo: escreva na justificativa por que estes itens têm finalidade diferente da do grupo.";
  if (caso.situacao === "AGUARDANDO_INFORMACAO" || String(caso.tipo || "").startsWith("AGUARDANDO")) return "O caso aguarda informação: não há o que aprovar. Reabra quando a informação chegar.";
  if (Object.keys(propostaParaEnviar(p, caso.proposta)).length === 0) return campoAlvoDoCaso(caso) ? `Digite o valor correto em ${rotuloDoCampo(campoAlvoDoCaso(caso))} para aprovar, ou rejeite ou peça informação.` : "Não há proposta: não há alteração para aprovar. Rejeite ou peça informação.";
  if (p.decisao === "SOLICITAR_INFORMACAO") return "A decisão proposta é solicitar informação ao cliente: use “Pedir informação” ou escolha outra decisão antes de aprovar.";
  if (precisaInformarFator(caso) && !fatorOk(p.fatorConversao)) return "Informe o fator de conversão (número maior que zero) para aprovar a mudança de unidade.";
  return null;
}

export const CNAE_SEM_ATIVIDADE = "CNAE sem atividade correspondente — inclua manualmente se aplicável";

/** Em que atividade cada CNAE vira (mapaAtividades do projeto), pelo rótulo; ausente = não mostra nada. Um CNAE pode virar mais de uma. */
export function efeitoDaAtividade(mapa, codigo) {
  if (!mapa) return null;
  const ms = (mapa.mapeadas || []).filter((x) => String(x.codigo) === String(codigo));
  if (ms.length) return `Vira: ${[...new Set(ms.map((m) => m.rotulo || m.atividade))].join(" e ")}`;
  if ((mapa.semMapeamento || []).map(String).includes(String(codigo))) return CNAE_SEM_ATIVIDADE;
  return null;
}

/** Por que o CNAE vira aquela atividade (a regra CNAE → atividade, com a divisão, grupo ou classe do CNAE 2.0). */
export function motivoDaAtividade(mapa, codigo) {
  const m = (mapa?.mapeadas || []).find((x) => String(x.codigo) === String(codigo));
  return m?.motivo || null;
}

/** CNAE em 7 dígitos formatado (0111-3/01); outro código (item da lista de atividades) fica como está. */
export function fmtCnae(codigo) {
  const bruto = String(codigo ?? "");
  const d = bruto.replace(/\D/g, "");
  return /^[\d.\-/]+$/.test(bruto) && d.length === 7 ? `${d.slice(0, 4)}-${d[4]}/${d.slice(5)}` : bruto;
}

/**
 * Por que a lista de atividades está vazia, pelo cadastro do cliente (campo `cliente` do projeto): pessoa física marca na lista; empresa
 * sem CNAE busca pelo CNPJ.
 */
export function motivoListaVazia(projeto) {
  const c = projeto?.cliente;
  if (c?.tipoDocumento === "PF") return "Pessoa física: marque na lista as atividades que o cliente exerce.";
  if (c?.tipoDocumento === "SEM_DOCUMENTO") return "O cadastro do cliente não tem CNPJ nem CNAE: acrescente as atividades à mão (ou informe o CNPJ no cadastro e busque).";
  return "O cadastro do cliente não tem CNAE e a consulta ao CNPJ não trouxe atividades. Busque de novo pelo CNPJ ou acrescente à mão.";
}

/** Mensagem depois de "Buscar atividades pelo CNPJ" (resposta da rota buscar-cnpj). */
export function textoBuscaCnpj(r) {
  if (r?.aviso) return r.aviso;
  const n = r?.acrescentadas?.length || 0;
  return n === 1 ? "1 atividade acrescentada pelo CNPJ." : `${n} atividades acrescentadas pelo CNPJ.`;
}

/** Liberar versão: o servidor pode devolver avisos (células em revisar) pedindo confirmação explícita. */
export const avisosDaLiberacao = (resposta) => (Array.isArray(resposta?.avisos) ? resposta.avisos.map((a) => (typeof a === "string" ? a : a?.texto || a?.mensagem || JSON.stringify(a))) : []);
export const versaoCriada = (resposta) => !!resposta?.id;

// ── Continuar a partir de uma versão liberada ────────────────────────────────
export const JUSTIFICATIVA_MINIMA = 10;
export const justificativaBasta = (t) => String(t || "").trim().length >= JUSTIFICATIVA_MINIMA;
/** Só restaura quando a prévia mostra algo a mudar e há justificativa. */
export const podeRestaurar = (previa, justificativa) => (Number(previa?.totais?.campos) || 0) > 0 && justificativaBasta(justificativa);
/** Restaurações feitas a partir de uma versão (guardadas no resumo dela), mais recente primeiro. */
export const restauracoesDaVersao = (v) => (Array.isArray(v?.resumo?.restauracoes) ? [...v.resumo.restauracoes].reverse() : []);
const plural = (n, um, varios) => `${Number(n).toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
/** Frases da prévia: o que muda, o que fica "revisar" e o que fica de fora. */
export function linhasDaPrevia(previa) {
  const t = previa?.totais || {};
  const numero = previa?.versao?.numero;
  if (!t.campos) return [`A base de trabalho já está igual à versão ${numero}: nada a restaurar.`];
  const um = (n, a, b) => (n === 1 ? a : b);
  const l = [`${plural(t.itens, "item", "itens")} e ${plural(t.campos, "campo", "campos")} voltam aos valores da versão ${numero}.`];
  if (t.casosDecididosDepois) l.push(`${plural(t.casosDecididosDepois, "caso aprovado", "casos aprovados")} depois desta versão ${um(t.casosDecididosDepois, "volta a proposto: a aprovação dele deixa de valer (célula, impacto no SPED e vínculos acompanham) e ele pode ser aprovado de novo ou rejeitado", "voltam a proposto: a aprovação deles deixa de valer (célula, impacto no SPED e vínculos acompanham) e eles podem ser aprovados de novo ou rejeitados")}.`);
  if (previa?.camadasRevisar?.length) l.push(`Ficam “revisar” nos itens restaurados: ${previa.camadasRevisar.map((c) => ROTULO_CAMADA[c] || c).join(", ")}.`);
  if (t.itensNovosDepois) l.push(`${plural(t.itensNovosDepois, "item importado", "itens importados")} depois desta versão não ${um(t.itensNovosDepois, "está", "estão")} na foto e ${um(t.itensNovosDepois, "fica como está", "ficam como estão")}.`);
  if (t.itensAusentes) l.push(`${plural(t.itensAusentes, "item da foto não existe", "itens da foto não existem")} mais na base e ${um(t.itensAusentes, "fica", "ficam")} de fora.`);
  if (previa?.ignorados?.length) l.push(`${plural(previa.ignorados.length, "código continua", "códigos continuam")} como ${um(previa.ignorados.length, "está", "estão")}: voltaria a repetir o de outro item.`);
  l.push("Nada é apagado: cada campo grava uma decisão no histórico e a restauração pode ser desfeita.");
  return l;
}

/** Coluna Tratamento tributário: o enquadramento do servidor, ou "Aguardando revisão" quando a célula tem a marca revisar. */
export function textoDoEnquadramento(item) {
  const cel = celulaDa(item, "TRIBUTARIO");
  if (cel?.revisar) return { aguardando: true, texto: "Aguardando revisão", origem: null };
  const e = item?.enquadramento;
  if (!e) return { aguardando: false, texto: textoDoConjunto(item?.conjunto_chave), origem: null };
  const partes = [e.enquadramentoLegal, e.artigo, e.cClassTrib ? `cClassTrib ${e.cClassTrib}` : null, e.cst ? `CST ${e.cst}` : null].filter(Boolean);
  return { aguardando: false, texto: partes.join(" · "), origem: etiquetaDeEnquadramento(e.origem) };
}

/** Só estes casos valem como enquadramento do item. */
export const casoValeParaEnquadramento = (c) => ["APROVADO", "PROPOSTO", "RASCUNHO"].includes(c?.situacao);

/** Próximo caso em aberto depois de `id` na lista; se não houver depois, o primeiro antes dele. */
export function proximoCasoAberto(casos, id) {
  const i = casos.findIndex((c) => c.id === id);
  for (let k = i + 1; k < casos.length; k++) if (casoAberto(casos[k])) return casos[k].id;
  for (let k = 0; k < i; k++) if (casoAberto(casos[k])) return casos[k].id;
  return null;
}

// ── Lote ─────────────────────────────────────────────────────────────────────

/** Casos por chamada do lote (o limite do servidor). */
export const MAX_LOTE = 2000;
/**
 * Corpo da prévia do lote: os ids marcados ou, sem marcação, o FILTRO INTEIRO da lista (camada, tipo, origem, grupo e situação em aberto),
 * lido pelo servidor em rodadas de até 2000 a partir de `apos`.
 */
export function corpoDoLote({ ids, filtro, fundamento, apos } = {}) {
  const corpo = {};
  if (ids && ids.length) corpo.ids = ids;
  else {
    const f = {};
    for (const k of ["camada", "tipo", "origem", "grupo"]) if (filtro && !vazio(filtro[k])) f[k] = filtro[k];
    const sit = filtro?.situacao;
    f.situacao = !vazio(sit) && sit !== "ABERTOS" && casoAberto({ situacao: sit }) ? sit : "PROPOSTO,RASCUNHO";
    corpo.filtro = f;
    if (apos) corpo.apos = apos;
  }
  if (fundamento && String(fundamento).trim()) corpo.fundamento = String(fundamento).trim();
  return corpo;
}
/** O filtro da lista admite lote? Só quando ele pode trazer casos em aberto (em aberto, todos, proposto ou rascunho). */
export const filtroAdmiteLote = (filtro) => vazio(filtro?.situacao) || filtro.situacao === "ABERTOS" || casoAberto({ situacao: filtro.situacao });
/** Ids marcados, em rodadas de até 2000. */
export const fatiarIds = (ids, n = MAX_LOTE) => { const r = []; for (let i = 0; i < ids.length; i += n) r.push(ids.slice(i, i + n)); return r; };
/** Junta as prévias das rodadas numa só (aprováveis, exceções, em aberto e os totais). */
export function somarPrevias(previas) {
  const soma = { total: 0, casos: 0, aprovaveis: [], excecoes: [], abertos: [], itensAfetados: 0, camposAfetados: 0 };
  for (const p of previas || []) {
    soma.casos += p.casos || 0; soma.itensAfetados += p.itensAfetados || 0; soma.camposAfetados += p.camposAfetados || 0;
    soma.aprovaveis.push(...(p.aprovaveis || [])); soma.excecoes.push(...(p.excecoes || [])); soma.abertos.push(...(p.abertos || []));
  }
  soma.total = Math.max(soma.casos, ...(previas || []).map((p) => p.total || 0));
  return soma;
}
export const loteTemEscolha = (corpo) => !!(corpo?.ids?.length || (corpo?.filtro && Object.keys(corpo.filtro).length));
/** A decisão exige as versões que a prévia mostrou: dos aprováveis (aprovar) ou de todos os em aberto (pedir informação, rejeitar). */
export const versoesDaPrevia = (previa, acao = "aprovar") => Object.fromEntries(((acao === "aprovar" ? previa?.aprovaveis : previa?.abertos) || []).map((a) => [a.casoId, a.versao]));

// ── Importação: mapeamento de colunas e relatório ────────────────────────────

export const CAMPOS_DE_IMPORTACAO = [
  { campo: "codigo", rotulo: "Código", obrigatorio: true },
  { campo: "descricao", rotulo: "Descrição", obrigatorio: true },
  { campo: "estabelecimento", rotulo: "Estabelecimento ou depósito" },
  { campo: "unidade", rotulo: "Unidade" },
  { campo: "ncm", rotulo: "NCM" },
  { campo: "grupo", rotulo: "Grupo" },
  { campo: "ativo", rotulo: "Ativo" },
  { campo: "saldo", rotulo: "Saldo" },
  { campo: "ultimaMovimentacao", rotulo: "Última movimentação" },
  { campo: "fabricante", rotulo: "Fabricante" },
  { campo: "referencia", rotulo: "Referência" },
  { campo: "finalidade", rotulo: "Finalidade (opcional)" },
];

export const ROTULO_CERTEZA = { ALTA: "Certeza alta", MEDIA: "Certeza média" };

/** Nomes das colunas do arquivo, na ordem: da prévia (`colunas`/`sugestao.colunas`) ou, na falta, dos nomes já mapeados. */
export function colunasDoArquivo(previa) {
  const lista = previa?.colunas || previa?.sugestao?.colunas;
  if (Array.isArray(lista) && lista.length) return lista.map((c) => (typeof c === "string" ? c : c.nome)).filter(Boolean);
  return [...new Set(Object.values(previa?.mapeamento || {}).filter((v) => typeof v === "string" && v))];
}

/** Uma linha por campo do sistema: a coluna escolhida e a certeza (quando o servidor informa). */
export function linhasDeMapeamento(previa, mapeamento) {
  const usado = mapeamento ?? previa?.mapeamento ?? {};
  const certeza = {};
  for (const c of previa?.sugestao?.colunas || []) if (c.campo && c.certeza) certeza[c.campo] = c.certeza;
  return CAMPOS_DE_IMPORTACAO.map((c) => ({ ...c, coluna: usado[c.campo] ?? "", certeza: certeza[c.campo] || null }));
}

/** Troca a coluna de um campo (vazio = sem coluna). */
export function corrigirMapeamento(mapeamento, campo, coluna) {
  const m = { ...(mapeamento || {}) };
  if (coluna === "" || coluna == null) delete m[campo]; else m[campo] = coluna;
  return m;
}
export const camposObrigatoriosSemColuna = (mapeamento) => CAMPOS_DE_IMPORTACAO.filter((c) => c.obrigatorio && !mapeamento?.[c.campo]).map((c) => c.rotulo);
export const mapeamentoMudou = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) !== JSON.stringify(Object.entries(b || {}).sort());

/**
 * Relatório de linhas em um formato só: aceita o do importador (totais, motivosRejeicao, pendencias agrupados)
 * ou o da porta (aceitas/rejeitadas/pendentes e listas de linhas), agrupando os motivos com até 3 exemplos.
 */
export function resumirRelatorio(r) {
  if (!r) return { aceitas: 0, rejeitadas: 0, pendentes: 0, motivosRejeicao: [], motivosPendencia: [], avisos: [] };
  const t = r.totais || r;
  const agrupar = (grupos, linhas) => {
    if (Array.isArray(grupos) && grupos.length) return grupos.map((g) => ({ texto: g.texto || g.codigo, quantidade: g.quantidade, exemplos: (g.exemplos || []).slice(0, 3) }));
    const mapa = new Map();
    for (const l of linhas || []) {
      const textos = Array.isArray(l.ocorrencias) ? l.ocorrencias : [l.motivo];
      for (const texto of textos.filter(Boolean)) {
        const g = mapa.get(texto) || { texto, quantidade: 0, exemplos: [] };
        g.quantidade++;
        if (g.exemplos.length < 3) g.exemplos.push({ linha: l.linha, codigo: l.codigo ?? l.chave ?? "", descricao: l.descricao ?? "" });
        mapa.set(texto, g);
      }
    }
    return [...mapa.values()].sort((a, b) => b.quantidade - a.quantidade);
  };
  return {
    aceitas: Number(t.aceitas) || 0, rejeitadas: Number(t.rejeitadas) || 0, pendentes: Number(t.pendentes) || 0,
    motivosRejeicao: agrupar(r.motivosRejeicao, r.linhasRejeitadas),
    motivosPendencia: agrupar(r.pendencias, r.linhasPendentes),
    avisos: r.avisos || [],
  };
}

/** Reimportação: há itens já guardados? Então a prévia mostra as diferenças antes de incorporar. */
export const ehReimportacao = (previa) => !!previa && (Number(previa.inalterados) > 0 || Number(previa.alterados) > 0 || Number(previa.ausentesDoArquivo) > 0);

/**
 * O que a confirmação envia em `incorporar`: no modo "ITENS", os ids marcados; nos modos de filtro, o filtro do servidor (vale para TODAS
 * as diferenças do arquivo, não só para a página na tela), sem listar ids.
 */
export const MODOS_INCORPORAR = {
  NENHUM: "Não incorporar agora (só entram os itens novos)",
  ITENS: "Escolher item a item",
  ALTERADOS: "Todos os alterados (campos protegidos ficam como estão)",
  ALTERADOS_SEM_PROTEGIDO: "Só os alterados sem campo protegido",
};
export function corpoIncorporar(modo, escolhidos) {
  if (modo === "ALTERADOS" || modo === "ALTERADOS_SEM_PROTEGIDO") return { filtro: modo };
  if (modo === "ITENS") return [...(escolhidos || [])];
  return [];
}
/** Quantos itens a confirmação vai incorporar, pelos totais da prévia (o arquivo inteiro). */
export function quantosIncorporar(previa, modo, escolhidos) {
  const t = previa?.totais || {};
  if (modo === "ALTERADOS") return Number(t.alteradosIncorporaveis ?? previa?.alterados ?? 0);
  if (modo === "ALTERADOS_SEM_PROTEGIDO") return Math.max(0, Number(t.alterados ?? previa?.alterados ?? 0) - Number(t.alteradosComProtegido ?? 0));
  if (modo === "ITENS") return escolhidos?.size || 0;
  return 0;
}

/** Escolha do que incorporar: ids dos itens marcados (itens só com campos protegidos não adiantam). */
export const itensIncorporaveis = (diferencas) => (diferencas || []).filter((d) => d.campos.some((c) => !c.protegido)).map((d) => d.itemId);
export function alternarIncorporar(escolhidos, id) {
  const n = new Set(escolhidos);
  if (n.has(id)) n.delete(id); else n.add(id);
  return n;
}

// ── Impacto, versões, formatação ─────────────────────────────────────────────

export const TIPOS_DE_AJUSTE = {
  CADASTRAL_FUTURO: "Ajuste cadastral futuro",
  REGULARIZACAO_SALDO: "Regularização de saldo",
  ESCRITURACAO_ENTREGUE: "Impacto em escrituração já entregue",
};
export const rotuloTipoAjuste = (t) => TIPOS_DE_AJUSTE[t] || String(t || "");

/** Páginas do GET impactos-sped ({ linhas, proximo, total, totalGeral, porTipo }) juntas: linhas carregadas e totais do servidor. */
export function paginasDeImpacto(dados) {
  const paginas = dados?.pages || [];
  const primeira = paginas[0] || {};
  const porTipo = { ...Object.fromEntries(Object.keys(TIPOS_DE_AJUSTE).map((k) => [k, 0])), ...(primeira.porTipo || {}) };
  const linhas = paginas.flatMap((p) => p.linhas || []);
  return { linhas, porTipo, total: Number(primeira.total ?? linhas.length) || 0, totalGeral: Number(primeira.totalGeral ?? primeira.total ?? linhas.length) || 0 };
}

export const ROTULO_ORIGEM = { REGRA: "Regra", IA: "IA", HERDADO: "Herdado do conjunto", EXCECAO: "Exceção" };
/** Etiqueta do enquadramento: "herdado do conjunto" ou "exceção" (a proposta do caso traz `origem`). */
export const etiquetaDeEnquadramento = (origem) => (origem === "EXCECAO" ? "exceção" : origem === "HERDADO" ? "herdado do conjunto" : null);

export const ROTULO_CONFIANCA = { alta: "Confiança alta", media: "Confiança média", baixa: "Confiança baixa" };

/**
 * Endereço do download de uma entrega. Com `versaoId` = versão liberada (a fase é a gravada na versão); sem ele = exportação para revisão
 * (base de agora), e `fase` = "FASE1" deixa de fora a parte tributária.
 */
export function enderecoDeEntrega(projetoId, tipo, versaoId, fase) {
  const base = `/saneamento-estoques/projetos/${projetoId}/entregas/${tipo === "pdf" ? "relatorio" : "excel"}`;
  if (versaoId) return `${base}?versaoId=${encodeURIComponent(versaoId)}`;
  return fase ? `${base}?fase=${encodeURIComponent(fase)}` : base;
}
/** Rótulo da fase gravada na versão (`resumo.fase`); versão antiga, sem fase = "". */
export const ROTULO_FASE_VERSAO = { FASE1: "Fase 1 · Saneamento", FASE2: "Fase 2 · Tributário" };
export function nomeDeEntrega(tipo, versao, fase) {
  const ext = tipo === "pdf" ? "pdf" : "xlsx";
  return versao ? `saneamento-estoques-versao-${versao.numero}-liberada.${ext}` : `saneamento-estoques-para-revisao${fase === "FASE1" ? "-fase-1" : ""}.${ext}`;
}

// ── Mapa de unificações e inativações ────────────────────────────────────────

/** Linha do mapa que pode ser marcada como executada no ERP: a decidida (aprovada) ou a troca de código registrada. */
export const linhaExecutavel = (l) => l?.situacao === "APROVADA" || l?.situacao === "REGISTRADA";
/** "X de Y executadas" da lista (contagem do servidor, sobre todas as linhas da lista, não só a página). */
export function textoExecutadas(c) {
  const total = Number(c?.total) || 0; const feitas = Number(c?.executadas) || 0;
  if (!total) return "Nenhuma ação aprovada para executar no ERP nesta lista.";
  return `${feitas.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} ${total === 1 ? "ação executada" : "ações executadas"} no ERP`;
}

export const SITUACOES_MAPA = { PROPOSTA: "Proposta", APROVADA: "Aprovada", AGUARDANDO: "Aguardando informação", REGISTRADA: "Registrada" };
export const TIPOS_MAPA = { UNIFICACAO: "Unificação de códigos", INATIVACAO: "Inativação (duplicidade ou sem movimentação)", EQUIVALENCIA: "Equivalência (nenhum código morre)", TROCA_CODIGO: "Troca de código" };
/** Parâmetros da consulta (só os preenchidos). */
export function paramsDoMapa({ situacao = "", tipo = "", busca = "", pagina = 1, limite = 100 } = {}) {
  const p = {};
  if (situacao) p.situacao = situacao;
  if (tipo) p.tipo = tipo;
  if (String(busca).trim()) p.busca = String(busca).trim();
  if (pagina > 1) p.pagina = pagina;
  if (limite !== 100) p.limite = limite;
  return p;
}
/** Endereço do Excel só do mapa, com o mesmo filtro da tela (sem a página). */
export function enderecoDoMapa(projetoId, filtro = {}) {
  const q = new URLSearchParams(paramsDoMapa({ ...filtro, pagina: 1, limite: 100 })).toString();
  return `/saneamento-estoques/projetos/${projetoId}/unificacoes/excel${q ? `?${q}` : ""}`;
}
/** Número de saldo em pt-BR; vazio quando a base não traz. */
export const fmtSaldo = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? "" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 6 }));

export const fmtDataHora = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
};
/** Data sem hora (data-base, início de vigência): usa só aaaa-mm-dd, sem fuso, para 31/12 nunca virar 30/12. */
export const fmtData = (iso) => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
};
/**
 * Valor legível: vazio = "—"; sim/não para booleanos (e "true"/"false"); com `campo` codificado (decisão, finalidade...), o rótulo do código;
 * listas separadas por vírgula; nunca o JSON cru de um objeto.
 */
export function textoDoValor(v, campo) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean" || v === "true" || v === "false") return v === true || v === "true" ? "Sim" : "Não";
  const rotular = (x) => (campo && CAMPOS_CODIFICADOS.includes(campo) ? rotuloDoValor(String(x)) : String(x));
  if (Array.isArray(v)) return v.map(rotular).join(", ");
  if (typeof v === "object") return Object.entries(v).map(([k, x]) => `${rotuloDoCampo(k)}: ${textoDoValor(x, k)}`).join("; ");
  return rotular(v);
}

/** Texto do motor com o acento que faltou ("confiança media" → "confiança média"). */
export const textoLegivel = (t) => String(t ?? "").replace(/(confiança:? )media\b/gi, "$1média").replace(/^media( \()/i, "média$1");

// ── Detalhe do caso: decisão, itens e campo-alvo ─────────────────────────────

/** Campos que não entram na grade "Dados e proposta": as decisões possíveis viram a lista do campo Decisão; códigos e descrições, a tabela de itens. */
export const CAMPOS_FORA_DA_GRADE = ["decisoesPossiveis", "codigos", "descricoes"];
/** Decisões que o caso admite (a proposta traz "A | B | C"); a decisão atual entra sempre. */
export function decisoesDoCaso(proposta) {
  const lista = String(proposta?.decisoesPossiveis ?? "").split("|").map((x) => x.trim()).filter(Boolean);
  const atual = proposta?.decisao;
  return atual && !lista.includes(atual) ? [atual, ...lista] : lista;
}
/**
 * Campo que o tipo de caso corrige (NCM, descrição ou unidade): fica sempre editável, mesmo quando o caso não traz proposta, para o consultor
 * digitar o valor certo. Null quando o tipo não corrige um campo só.
 */
export function campoAlvoDoCaso(caso) {
  const t = String(caso?.tipo || "");
  if ((caso?.itens?.length ?? 0) !== 1) return null; // conjunto: um valor só para todos os itens não é correção, é decisão da proposta
  if (!t || t.startsWith("AGUARDANDO") || t.startsWith("IMPACTO_") || caso?.camada === "DUPLICIDADE") return null;
  if (t.startsWith("NCM_")) return "ncm";
  if (t.startsWith("UNIDADE_") && t !== "UNIDADE_CONVERSAO") return "unidade";
  if (["DESCRICAO_FORA_DO_PADRAO", "DESCRICAO_FORA_PADRAO", "TERMO_GENERICO", "TERMO_PROIBIDO", "COMPONENTE_AUSENTE", "ABREVIACAO_ESCONDE_ATRIBUTO", "CARACTERES_INVALIDOS", "DESCRICAO_INSUFICIENTE"].includes(t)) return "descricao";
  if (["TAMANHO_EXCEDIDO", "EXCEDE_LIMITE_DESTINO"].includes(t)) {
    const k = Object.keys(caso?.proposta || {}).find((x) => ["descricao", "unidade"].includes(x)) || Object.keys(caso?.atual || {}).find((x) => ["descricao", "unidade"].includes(x));
    return k || null;
  }
  return null;
}
/** A proposta a enviar: o campo vazio que o caso não propunha (campo-alvo deixado em branco) não vai. */
export function propostaParaEnviar(valor, original) {
  return Object.fromEntries(Object.entries(valor || {}).filter(([k, v]) => (v !== null && v !== "") || k in (original || {})));
}
/** Identificação curta do caso na lista e no lote: código e descrição do item; no conjunto, "N itens" e o primeiro código. */
export function identificacaoDoCaso({ codigo, descricao, qtdItens } = {}) {
  const n = Number(qtdItens) || 0;
  const cod = codigo ? (n > 1 ? `${n.toLocaleString("pt-BR")} itens (1º: ${codigo})` : String(codigo)) : n > 1 ? `${n.toLocaleString("pt-BR")} itens` : "";
  return [cod, descricao].filter(Boolean).join(" — ");
}
/** Linha de exceção do lote: tipo, item e o motivo (o id do caso nunca aparece). */
export const linhaDeExcecao = (x) => {
  const quem = [x.tipo ? rotuloTipoCaso(x.tipo) : "", identificacaoDoCaso(x)].filter(Boolean).join(" · ");
  return `${quem || "Caso fora deste projeto"}: ${x.motivo}`;
};
/** Opções do filtro de tipo: rótulo e contagem, em ordem alfabética do rótulo; o tipo escolhido fica na lista mesmo sem casos. */
export function opcoesDeTipo(tipos, escolhido) {
  const lista = (tipos || []).map((t) => ({ valor: t.tipo, rotulo: `${rotuloTipoCaso(t.tipo)} (${Number(t.n).toLocaleString("pt-BR")})` }));
  if (escolhido && !lista.some((o) => o.valor === escolhido)) lista.push({ valor: escolhido, rotulo: `${rotuloTipoCaso(escolhido)} (0)` });
  return lista.sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** "Conjunto" da coluna Tratamento tributário: NCM e finalidade separados. */
export function textoDoConjunto(chave) {
  if (!chave) return "";
  const [ncm, fin] = String(chave).split("|");
  return `${ncm || ""}${fin ? ` · ${rotuloFinalidade(fin)}` : ""}`;
}

// ── Cobertura ────────────────────────────────────────────────────────────────

/**
 * O que pode e o que não pode ser analisado: por camada, "com dados" (há células analisadas), "aguardando informação" (falta dado),
 * "ainda não analisada" (nada rodou) ou "sem análise" (o servidor não tem analisador para ela).
 */
export function coberturaDeCamadas(camadas, disponiveis, visaoGeral) {
  const soma = {};
  for (const g of visaoGeral?.grupos || []) for (const [camada, cont] of Object.entries(g.camadas || {})) {
    const s = (soma[camada] ||= { PENDENTE: 0, SEM_PROBLEMA: 0, PROPOSTO: 0, APROVADO: 0, AGUARDANDO_INFORMACAO: 0 });
    for (const k of LISTA_SITUACOES) s[k] += Number(cont[k]) || 0;
  }
  return camadas.map((camada) => {
    const c = soma[camada] || {};
    const total = totalDeCelulas(c);
    const analisavel = (disponiveis || []).includes(camada);
    let estado;
    if (!analisavel) estado = "SEM_ANALISE";
    else if (total === 0) estado = "SEM_ITENS";
    else if (c.AGUARDANDO_INFORMACAO > 0 && c.AGUARDANDO_INFORMACAO === total) estado = "AGUARDA_INFORMACAO";
    else if (c.PENDENTE === total) estado = "NAO_ANALISADA";
    else estado = "COM_DADOS";
    return { camada, estado, analisavel, aguardando: c.AGUARDANDO_INFORMACAO || 0, total };
  });
}
export const ROTULO_COBERTURA = {
  COM_DADOS: "Com dados", AGUARDA_INFORMACAO: "Depende de informação", NAO_ANALISADA: "Ainda não analisada", SEM_ANALISE: "Análise ainda não disponível", SEM_ITENS: "Sem itens importados",
};

// ── Exceção item a item ──────────────────────────────────────────────────────

/** Camadas em que o consultor pode registrar exceção de um item (caso individual): campos que ele informa. */
export const EXCECOES_POR_CAMADA = {
  FINALIDADE: [{ campo: "finalidade", rotulo: "Finalidade deste item", tipo: "finalidade" }],
  TRIBUTARIO: [{ campo: "cClassTrib", rotulo: "cClassTrib", tipo: "texto" }, { campo: "cst", rotulo: "CST", tipo: "texto" }],
  // Conversão de unidade decidida por conjunto: o item de conteúdo diferente (outro fator) vira exceção.
  NOMES_UNIDADES: [
    { campo: "unidade", rotulo: "Unidade de estoque (ex.: KG)", tipo: "texto" }, { campo: "unidadeCompra", rotulo: "Unidade de compra (ex.: SC)", tipo: "texto" },
    { campo: "fatorConversao", rotulo: "Fator: unidades de estoque em 1 unidade de compra", tipo: "numero" },
  ],
};

/** Caso individual de exceção, no formato de POST projetos/:id/casos. Exige o motivo. */
export function montarExcecao({ camada, item, valores, motivo }) {
  const campos = EXCECOES_POR_CAMADA[camada];
  if (!campos) throw new Error("Esta camada não admite exceção por item.");
  if (!String(motivo || "").trim()) throw new Error("Explique o motivo da exceção.");
  const proposta = {};
  const atual = {};
  for (const c of campos) {
    const v = valores?.[c.campo];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      if (c.tipo === "numero") {
        const n = lerNumeroBr(v);
        if (n == null || n <= 0) throw new Error(`${c.rotulo}: informe um número maior que zero.`);
        proposta[c.campo] = n;
      } else proposta[c.campo] = String(v).trim();
    }
    atual[c.campo] = item?.trabalho?.[c.campo] ?? item?.trabalho?.campos?.[c.campo] ?? null;
  }
  if (!Object.keys(proposta).length) throw new Error("Informe o valor da exceção.");
  if (camada === "NOMES_UNIDADES" && campos.some((c) => proposta[c.campo] === undefined)) throw new Error("Informe a unidade de estoque, a unidade de compra e o fator deste item.");
  if (camada === "TRIBUTARIO") proposta.origem = "EXCECAO";
  return {
    camada, analisados: 1, semDados: null, semProblema: [],
    casos: [{
      camada, tipo: "EXCECAO_MANUAL", itens: [item.id], problema: `Exceção do item ${item.codigo}: tratamento diferente do conjunto`,
      evidencia: [{ rotulo: "Item", valor: `${item.codigo}${item.estabelecimento ? ` (${item.estabelecimento})` : ""}` }], atual, proposta,
      justificativa: String(motivo).trim(), fundamento: null, impactos: [], origem: "REGRA", afeta: camada === "FINALIDADE" ?["TRIBUTARIO", "OBRIGACOES"] : camada === "NOMES_UNIDADES" ? ["DUPLICIDADE", "OBRIGACOES"] : ["OBRIGACOES"],
    }],
  };
}

// ── Colunas da tabela única ──────────────────────────────────────────────────

export const ALTURA_LINHA = 38;
/** As três colunas fixas à esquerda (não saem da tela ao rolar para o lado). */
export const COLUNAS_FIXAS = [
  { id: "codigo", titulo: "Código", largura: 116 },
  { id: "descricao", titulo: "Descrição", largura: 280 },
  { id: "estabelecimento", titulo: "Estabelec.", largura: 96 },
];
export const LARGURA_FIXA = COLUNAS_FIXAS.reduce((s, c) => s + c.largura, 0);

/** Colunas rolantes: uma por camada ativa (a situação), mais os campos que a camada exibe na própria lista. */
export function colunasDaTabela(camadas) {
  const extras = {
    GRUPOS_FINALIDADE: [{ id: "grupo", titulo: "Grupo", largura: 170 }],
    FINALIDADE: [{ id: "finalidade", titulo: "Finalidade", largura: 200 }],
    TRIBUTARIO: [{ id: "conjunto", titulo: "Enquadramento", largura: 360 }],
  };
  return camadas.flatMap((camada) => [
    ...(extras[camada] || []).map((c) => ({ ...c, camada, tipo: "campo" })),
    { id: `situacao-${camada}`, titulo: "Situação", largura: 190, camada, tipo: "situacao" },
  ]);
}
export const larguraTotal = (colunas) => LARGURA_FIXA + colunas.reduce((s, c) => s + c.largura, 0);

/** Cabeçalho de grupos: cada camada com a largura somada das suas colunas. */
export function gruposDeColunas(colunas) {
  const grupos = [];
  for (const c of colunas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.camada === c.camada) ultimo.largura += c.largura;
    else grupos.push({ camada: c.camada, largura: c.largura });
  }
  return grupos;
}

// ── Edição da proposta de um caso ────────────────────────────────────────────

/** Campos da proposta que são texto da lei ou rótulo calculado: aparecem, mas o consultor não os edita. */
const SOMENTE_LEITURA = ["origem", "enquadramentoLegal", "artigo", "tipoImpacto", "valorProposto", "fatorSituacao", "exigeFator"];
export const propostaEditavel = (campo) => !SOMENTE_LEITURA.includes(campo);

/**
 * Número digitado, pela MESMA regra do servidor (lerNumero de backend/src/saneamento-estoques/importacao/normalizacao.ts, sem contexto de
 * coluna): "1.234,56" e "1,234.56" = 1234,56; "1.000" (um ponto, três casas, sem vírgula) = mil; "1,5" = 1,5; zero à esquerda desfaz a
 * ambiguidade ("0.001" = um milésimo); "12-" e "(12)" são negativos. Texto que não é número = null.
 */
export function lerNumeroBr(bruto) {
  if (typeof bruto === "number") return Number.isFinite(bruto) ? (bruto === 0 ? 0 : bruto) : null;
  let t = String(bruto ?? "").replace(/\s+/g, " ").trim().replace(/^R\$\s*/i, "");
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
  if (t.endsWith("-")) { neg = !neg; t = t.slice(0, -1).trim(); }
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1).trim(); } else if (t.startsWith("+")) t = t.slice(1).trim();
  if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(t)) { const n = Number(t); return Number.isFinite(n) ? (neg ? -n : n) : null; }
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const pontos = (t.match(/\./g) || []).length; const virgulas = (t.match(/,/g) || []).length;
  let s;
  if (pontos && virgulas) {
    const decimal = t.lastIndexOf(".") > t.lastIndexOf(",") ? "." : ",";
    const milhar = decimal === "." ? "," : ".";
    if (t.split(decimal).length > 2) return null;
    s = t.split(milhar).join("").replace(decimal, ".");
  } else if (virgulas) {
    if (virgulas > 1 && !/^\d{1,3}(,\d{3})+$/.test(t)) return null;
    s = virgulas === 1 ? t.replace(",", ".") : t.replace(/,/g, "");
  } else if (pontos) {
    if (pontos > 1) { if (!/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) return null; s = t.replace(/\./g, ""); }
    else s = /^[1-9]\d{0,2}\.\d{3}$/.test(t) ? t.replace(".", "") : t;
  } else s = t;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n === 0 ? 0 : neg ? -n : n;
}

/** Campos do fator de conversão com a direção (1 unidade de fatorDe = fatorConversao unidades de fatorPara). */
export const CAMPOS_DO_FATOR = ["fatorConversao", "fatorDe", "fatorPara"];
/** O caso de Duplicidades junta itens de unidades diferentes (a evidência traz a diferença "unidades diferentes: ..."). */
export const unidadesDiferemNoCaso = (c) => (c?.evidencia || []).some((e) => e?.rotulo === "Diferença" && /^unidades diferentes/i.test(String(e?.valor ?? "")));
/**
 * Campos do fator que a tela oferece para preencher numa unificação com unidades diferentes e que ainda não estão na proposta (o mapa só
 * converte o saldo com a direção: sem eles, "converter antes de somar"). Fora disso, nenhum.
 */
export function camposDoFatorAOferecer(c, proposta) {
  if (c?.camada !== "DUPLICIDADE" || !unidadesDiferemNoCaso(c)) return [];
  const p = proposta || c?.proposta || {};
  return CAMPOS_DO_FATOR.filter((k) => !(k in p));
}

/** Texto digitado → valor: mantém número onde o valor anterior era número (lido como o servidor lê); vazio vira null. */
export function converterValor(texto, modelo) {
  const t = String(texto ?? "").trim();
  if (t === "") return null;
  if (typeof modelo === "number") { const n = lerNumeroBr(t); return n ?? t; }
  if (typeof modelo === "boolean") return /^(sim|true|1|s)$/i.test(t);
  return t;
}

/** Converte o que foi digitado na proposta (texto) para o tipo do valor original. `invalidos` lista os campos numéricos digitados errado. */
export function converterProposta(proposta, original) {
  const valor = {};
  const invalidos = [];
  for (const [k, v] of Object.entries(proposta || {})) {
    const modelo = original?.[k];
    if (k === "fatorConversao" && typeof v === "string") {
      const n = converterValor(v, 0);
      if (n !== null && typeof n !== "number") invalidos.push(k);
      valor[k] = n;
    } else if (typeof v === "string" && typeof modelo === "number") {
      const n = converterValor(v, modelo);
      if (n !== null && typeof n !== "number") invalidos.push(k);
      valor[k] = n;
    } else if (typeof v === "string" && typeof modelo === "boolean") valor[k] = converterValor(v, modelo);
    else valor[k] = v === "" ? null : v;
  }
  return { valor, invalidos };
}

/** Estado inicial da edição de um caso (o que a tela mantém enquanto o usuário digita). */
export const precisaInformarFator = (caso) => caso?.proposta?.fatorSituacao === "INFORMAR";
export const precisaConfirmarFator = (caso) => caso?.proposta?.fatorSituacao === "CONFIRMAR";
const fatorOk = (v) => { const n = typeof v === "string" ? converterValor(v, 0) : v; return typeof n === "number" && n > 0; };
export const edicaoInicial = (caso) => ({ id: caso.id, proposta: { ...(precisaInformarFator(caso) && !("fatorConversao" in (caso.proposta || {})) ? { fatorConversao: null } : {}), ...(caso.proposta || {}) }, justificativa: caso.justificativa || "", fundamento: caso.fundamento || "" });

/** O consultor mexeu em algo que ainda não foi salvo? */
export function edicaoSuja(edicao, caso) {
  if (!edicao || !caso) return false;
  return JSON.stringify(Object.fromEntries(Object.entries(converterProposta(edicao.proposta, caso.proposta).valor).filter(([k, v]) => v !== null || k in (caso.proposta || {})))) !== JSON.stringify(caso.proposta || {}) || edicao.justificativa !== (caso.justificativa || "") || edicao.fundamento !== (caso.fundamento || "");
}

/** Lê o parecer da IA gravado no caso (null = sem parecer). */
export function lerParecer(caso) {
  const p = caso?.parecer_ia;
  if (!p || typeof p !== "object" || !p.recomendacao) return null;
  const lista = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);
  return {
    recomendacao: String(p.recomendacao), confianca: ["alta", "media", "baixa"].includes(p.confianca) ? p.confianca : null,
    aFavor: lista(p.aFavor), contra: lista(p.contra), oQueConfirmar: lista(p.oQueConfirmar), fontes: lista(p.fontes), praticaDeMercado: p.praticaDeMercado ? String(p.praticaDeMercado) : null, geradoEm: p.geradoEm || null,
  };
}

/** Resposta de POST casos/:id/parecer-ia: {parecer, motivo}. Só é sucesso quando veio `parecer`. */
export function interpretarRespostaParecer(r) {
  if (r?.parecer) return { ok: true, texto: "Parecer da IA gerado." };
  const m = {
    nao_e_borda: "Este caso é decidido pela regra; não precisa de parecer.",
    ia_indisponivel: "A IA não está disponível agora; o caso segue sem parecer.",
    sem_resposta: "A IA não está disponível agora; o caso segue sem parecer.",
  };
  return { ok: false, texto: m[r?.motivo] || "A IA não devolveu parecer; o caso segue sem parecer." };
}

/** Mensagem quando a rota do parecer da IA falha: 404 = ainda não existe neste servidor; o caso segue sem parecer. */
export function mensagemDoParecer(err) {
  if (err?.status === 404 || err?.status === 501 || err?.status === 503) return "O parecer da IA não está disponível neste servidor agora. O caso segue normalmente, sem parecer.";
  return "A IA não respondeu. O caso segue normalmente, sem parecer; tente de novo mais tarde.";
}

// ── Navegação da página do projeto: fases (primeiro nível) e abas (segundo nível) ──

/**
 * Primeiro nível: a fase do trabalho. `param` é o valor de `?fase=` na URL; `fase` é a chave do servidor (GET fases), quando existe.
 * Cada fase tem as suas abas (os mesmos componentes de sempre, filtrados pela fase). As áreas comuns (Tabela, Visão geral, Impacto no
 * SPED e Versões) mostram o projeto inteiro e ficam à direita da faixa de abas, em qualquer fase.
 */
export const AREAS = [
  {
    id: "fase1", param: "1", fase: "FASE1", rotulo: "Fase 1 · Saneamento",
    abas: [
      { id: "preparar", rotulo: "Preparar" },
      { id: "diretrizes", rotulo: "Diretrizes" },
      { id: "analise", rotulo: "Análise" },
      { id: "casos", rotulo: "Casos" },
      { id: "unificacoes", rotulo: "Unificações" },
      { id: "entrega", rotulo: "Entrega da Fase 1" },
    ],
  },
  {
    id: "fase2", param: "2", fase: "FASE2", rotulo: "Fase 2 · Tributário",
    abas: [
      { id: "premissas", rotulo: "Premissas" },
      { id: "diretrizes", rotulo: "Diretrizes" },
      { id: "analise", rotulo: "Análise" },
      { id: "casos", rotulo: "Casos" },
      { id: "entrega", rotulo: "Entrega da Fase 2" },
    ],
  },
  { id: "fechamento", param: "fechamento", fase: null, rotulo: "Fechamento", abas: [{ id: "entregas", rotulo: "Entregas finais" }] },
];
/** Áreas comuns, fora das fases: o projeto inteiro. */
export const ABAS_COMUNS = [
  { id: "tabela", rotulo: "Tabela" },
  { id: "visao", rotulo: "Visão geral" },
  { id: "impacto", rotulo: "Impacto no SPED" },
  { id: "versoes", rotulo: "Versões" },
];
/** Aspectos das Diretrizes em cada fase: a Fase 1 padroniza o cadastro; a Fase 2 cuida da classificação fiscal. */
export const ASPECTOS_DA_FASE = { fase1: ["NOMES", "ATRIBUTOS", "UNIDADES", "LIMITES"], fase2: ["FISCAL"] };

export const areaPorId = (id) => AREAS.find((a) => a.id === id) || null;
/** `?fase=1|2|fechamento` → id da área (fase1, fase2, fechamento); inválido = null. */
export const areaDoParam = (valor) => AREAS.find((a) => a.param === valor || a.id === valor)?.id || null;
export const paramDaArea = (id) => areaPorId(id)?.param || null;
/** Abas da faixa de uma fase: as da fase e, depois, as comuns. */
export const abasDaArea = (id) => [...(areaPorId(id)?.abas || []), ...ABAS_COMUNS];
const ehComum = (aba) => ABAS_COMUNS.some((a) => a.id === aba);
const temAba = (area, aba) => !!areaPorId(area)?.abas.some((a) => a.id === aba);

/**
 * Endereços antigos (`?aba=` da faixa única de nove abas) e atalhos internos (irPara, abrirCasos, abrirTabela, links das Diretrizes)
 * → fase e aba de agora. Mapa:
 *   configuracao, importacao → Fase 1 > Preparar        unificacoes, preparar → Fase 1        premissas → Fase 2 > Premissas
 *   entregas → Fechamento > Entregas finais
 *   diretrizes, analise, casos, entrega (abas das duas fases) → na fase da camada (`camada`, quando houver; Impacto no SPED está nas
 *     duas e fica a aberta), senão na fase aberta, senão na Fase 1
 *   tabela, visao, impacto, versoes → a área comum, na fase aberta (fase = null quando nenhuma está aberta)
 * Aba desconhecida = null (a página usa a aba de partida da fase).
 */
export function destinoDaAba(aba, { fase = null, camada = null } = {}) {
  if (!aba) return null;
  const aberta = areaPorId(fase) ? fase : null;
  if (ehComum(aba)) return { fase: aberta, aba };
  if (aba === "configuracao" || aba === "importacao") return { fase: "fase1", aba: "preparar" };
  const areas = AREAS.filter((a) => temAba(a.id, aba)).map((a) => a.id);
  if (!areas.length) return null;
  // A camada decide a fase (Impacto no SPED está nas duas: fica a aberta, se ela tiver a camada).
  if (camada) {
    const comCamada = areas.filter((a) => areaPorId(a).fase && FASES[areaPorId(a).fase].includes(camada));
    if (comCamada.length) return { fase: comCamada.includes(aberta) ? aberta : comCamada[0], aba };
  }
  return { fase: areas.includes(aberta) ? aberta : areas[0], aba };
}

/**
 * Fase em que o projeto abre: a que está em andamento. Fechamento só com a Fase 2 liberada; Fase 2 com a Fase 1 liberada; senão a Fase 1.
 * `dadosFases` = resposta de GET fases (sem ela, a Fase 1).
 */
export function faseInicial(dadosFases) {
  const lib = (f) => !!(dadosFases?.fases || []).find((x) => x.fase === f)?.liberada;
  if (lib("FASE2")) return "fechamento";
  if (lib("FASE1")) return "fase2";
  return "fase1";
}

/**
 * Aba de partida de cada fase. Fase 1: Preparar enquanto não há itens importados (`itens` = 0), senão Análise (itens desconhecidos = Análise).
 * Fase 2: Premissas enquanto o bloqueio é o regime ou as atividades, senão Análise. Fechamento: Entregas finais.
 */
export function abaInicialDaFase(fase, { itens = null, bloqueio = null } = {}) {
  if (fase === "fase1") return itens != null && Number(itens) === 0 ? "preparar" : "analise";
  if (fase === "fase2") return bloqueio?.codigo === "REGIME_NAO_INFORMADO" || bloqueio?.codigo === "ATIVIDADES_NAO_CONFIRMADAS" ? "premissas" : "analise";
  return "entregas";
}

/** Total de itens importados, pela visão geral (soma dos grupos). */
export const itensDaVisao = (visao) => (visao ? (visao.grupos || []).reduce((s, g) => s + (Number(g.itens) || 0), 0) : null);

/** Próximo elemento de uma lista por teclado (setas, Home, End), circular. `lista` = ids na ordem da faixa. */
export function proximoPorTecla(lista, atual, tecla) {
  const i = lista.indexOf(atual);
  if (tecla === "ArrowRight") return lista[(i + 1) % lista.length];
  if (tecla === "ArrowLeft") return lista[(i - 1 + lista.length) % lista.length];
  if (tecla === "Home") return lista[0];
  if (tecla === "End") return lista[lista.length - 1];
  return null;
}

/**
 * Andamento de uma fase pelas camadas dela (GET estado-camadas): uma camada está "em dia" quando já foi analisada e não tem caso em aberto
 * nem aguardando informação. % = camadas em dia ÷ camadas da fase (as ativas do projeto; Impacto no SPED conta nas duas fases).
 * Sem a resposta: null.
 */
export function andamentoDaFase(fase, estado, modulos) {
  if (!estado) return null;
  const camadas = camadasDaFase(fase, modulos);
  if (!camadas.length) return null;
  const porCamada = new Map((estado.camadas || []).map((l) => [l.camada, l]));
  const emDia = camadas.filter((c) => { const l = porCamada.get(c); return l && l.executadaEm && !Number(l.abertos) && !Number(l.aguardando); }).length;
  return Math.round((emDia / camadas.length) * 100);
}

/**
 * Situação de cada passo do seletor de fases: `{ texto, tom, travada, detalhe }`.
 * Fase 1: "Liberada" (há versão da Fase 1) ou "Em andamento · N%". Fase 2: "Bloqueada" com o motivo (cadeado), "Liberada" ou
 * "Em andamento · N%". Fechamento: "Após as fases" até as duas estarem liberadas; depois, "Disponível" (nunca trava a consulta).
 * `bloqueio2` = bloqueio da Fase 2 ({codigo, mensagem} | null), calculado por quem chama.
 */
export function situacaoDasFases({ fases: dadosFases, estado, modulos, bloqueio2 }) {
  const lib = (f) => !!(dadosFases?.fases || []).find((x) => x.fase === f)?.liberada;
  const andamento = (f) => { const p = andamentoDaFase(f, estado, modulos); return { texto: p == null ? "Em andamento" : `Em andamento · ${p}%`, tom: "alerta", travada: false, detalhe: null }; };
  const liberada = { texto: "Liberada", tom: "ok", travada: false, detalhe: null };
  return {
    fase1: lib("FASE1") ? liberada : andamento("FASE1"),
    fase2: bloqueio2 ? { texto: "Bloqueada", tom: "neutro", travada: true, detalhe: bloqueio2.mensagem } : lib("FASE2") ? liberada : andamento("FASE2"),
    fechamento: lib("FASE1") && lib("FASE2") ? { texto: "Disponível", tom: "ok", travada: false, detalhe: null } : { texto: "Após as fases", tom: "neutro", travada: false, detalhe: null },
  };
}

/** Caminho legível de uma aba, para avisos e manual: "Fase 1 > Casos", ou só "Tabela" para as áreas comuns. */
export function caminhoDaAba(fase, aba) {
  const comum = ABAS_COMUNS.find((a) => a.id === aba);
  if (comum) return comum.rotulo;
  const area = areaPorId(fase);
  const r = area?.abas.find((a) => a.id === aba)?.rotulo;
  return area && r ? `${area.rotulo.split(" · ")[0]} > ${r}` : r || "";
}

/**
 * Aviso do recorte grupo × camada: caso de conjunto (unidade, NCM, tributário) pode juntar itens de vários grupos, e aprovar altera todos.
 * `dados` = resposta de GET casos/:id/grupos. Devolve null quando todos os itens são do grupo do recorte.
 */
export function avisoDeOutrosGrupos(dados, grupoDoRecorte) {
  if (!dados || !grupoDoRecorte) return null;
  const outros = (dados.grupos || []).filter((g) => g.grupo !== grupoDoRecorte);
  const n = outros.reduce((s, g) => s + Number(g.itens || 0), 0);
  if (n === 0) return null;
  const fmt = (q) => Number(q).toLocaleString("pt-BR");
  const lista = outros.slice(0, 5).map((g) => `${g.grupo} (${fmt(g.itens)})`).join(", ") + (outros.length > 5 ? ` e mais ${outros.length - 5} grupo(s)` : "");
  return {
    outros: n,
    texto: `Este conjunto inclui ${fmt(n)} ${n === 1 ? "item" : "itens"} de outros grupos, além do grupo ${grupoDoRecorte}: ${lista}. Aprovar altera todos os ${fmt(dados.total)} itens do conjunto, não só os do recorte.`,
  };
}

/** Regra da finalidade sugerida (botão "i" no título da coluna Finalidade da Tabela). Espelha backend/src/saneamento-estoques/fiscal/finalidade.ts. */
export const REGRA_FINALIDADE = [
  "Item que já tem finalidade (informada na base ou aprovada num caso) fica com ela.",
  "Sem finalidade, o sistema lê o grupo e a descrição, nesta ordem: material de terceiros ou consignado → Material de terceiros; grupo de manutenção, peças de reposição ou oficina (e peças pelo nome, como rolamento, retentor, correia, filtro de óleo) → Manutenção; embalagens e sacarias → Embalagem; EPI, uniforme, limpeza, escritório, refeitório, informática e bens de pequeno valor → Uso e consumo; máquinas, veículos, implementos e equipamentos → Imobilizado; matéria-prima → Matéria-prima.",
  "Insumo agropecuário (defensivo, adubo, fertilizante, semente, inoculante, ração, sal mineral, vacina, medicamento veterinário) depende das atividades (CNAE) confirmadas em Fase 2 > Premissas: só produção → Insumo de produção; só revenda ou comércio → Revenda; produção e revenda juntas → sugestão de confiança baixa, a confirmar. Sem atividade confirmada, não há sugestão.",
  "Combustível e lubrificante (diesel, gasolina, Arla, graxa, óleo de motor) → Insumo de produção quando o cliente produz, transporta ou industrializa; nos demais casos, sem sugestão.",
  "Grupos ambíguos (serviços, taxas, diversos, outros, plantel ou rebanho, produção) ficam sem sugestão: a finalidade se confirma com o cliente. Materiais de construção, lonas e beneficiamento recebem sugestão de confiança baixa, com alternativas.",
  "A finalidade do grupo é a mais frequente entre os itens do grupo (caso \"Confirmar a finalidade do grupo\"). O item que a regra manda para outra finalidade vira caso de exceção, que exige o motivo escrito para aprovar.",
  "Enquanto o caso não é aprovado, a coluna mostra a finalidade em itálico com o selo \"sugerida\". Aprovar o caso grava a finalidade no item e libera o Tratamento tributário.",
];

// ── Casos agrupados (casos iguais numa linha) ────────────────────────────────

/** Proposta do grupo em texto legível (sem as listas auxiliares de decisões, códigos e descrições). Vazia = "sem proposta". */
export function textoDaPropostaDoGrupo(proposta) {
  const campos = Object.fromEntries(Object.entries(proposta || {}).filter(([k]) => !CAMPOS_FORA_DA_GRADE.includes(k)));
  return Object.keys(campos).length ? textoDoValor(campos) : "Sem proposta";
}
/** Grupo do item na linha agrupada: o conjunto (vários itens) junta itens de grupos diferentes. */
export const grupoDoGrupoDeCasos = (g) => (g?.conjunto ? "Vários itens (conjunto)" : g?.grupo || "(sem grupo)");
/** Problema da linha agrupada: quando o texto muda de caso para caso (cita o item), mostra o primeiro como exemplo. */
export const problemaDoGrupoDeCasos = (g) => `${g?.problemaVaria ? "Ex.: " : ""}${textoLegivel(g?.problema)}`;
/** Situações dos casos do grupo, por extenso e com a quantidade quando há mais de uma ("Proposto 3; Rascunho 1"). */
export function textoDasSituacoesDoGrupo(situacoes) {
  const e = Object.entries(situacoes || {}).filter(([, q]) => q > 0);
  if (e.length === 1) return rotuloSituacaoCaso(e[0][0]);
  return e.map(([s, q]) => `${rotuloSituacaoCaso(s)} ${Number(q).toLocaleString("pt-BR")}`).join("; ");
}
/** Situação única do grupo (para o selo), ou null quando o grupo mistura situações. */
export const situacaoUnicaDoGrupo = (situacoes) => { const e = Object.keys(situacoes || {}); return e.length === 1 ? e[0] : null; };
/** Contador da lista agrupada: "N grupos (M casos)". */
export const contadorDeGrupos = (grupos, casos) => `${Number(grupos || 0).toLocaleString("pt-BR")} grupo(s) (${Number(casos || 0).toLocaleString("pt-BR")} caso(s))`;
/**
 * Ids dos casos dos grupos marcados, para o lote: usa os ids que a lista trouxe e, no grupo maior que isso, pede todos (`buscarTodos(chave)`
 * devolve a lista completa). Sem repetir id.
 */
export async function idsDosGruposParaLote(grupos, marcadas, buscarTodos) {
  const ids = new Set();
  for (const g of grupos || []) {
    if (!marcadas.has(g.chave)) continue;
    const lista = g.idsCompletos === false || (g.ids || []).length < g.casos ? await buscarTodos(g.chave) : g.ids;
    for (const id of lista || []) ids.add(id);
  }
  return [...ids];
}
/** Descrição do lote de um grupo de casos (o texto do painel "Decidir em lote"). */
export const descricaoDoLoteDoGrupo = (g, nIds) => `${Number(nIds ?? g?.casos ?? 0).toLocaleString("pt-BR")} caso(s) do grupo ${rotuloTipoCaso(g?.tipo)} · ${grupoDoGrupoDeCasos(g)}.`;
