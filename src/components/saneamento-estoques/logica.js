/**
 * Funções puras do módulo "Saneamento de Estoques e Cadastro de Produtos" (sem React, sem rede).
 * Espelham o contrato do servidor (backend/src/saneamento-estoques/tipos.ts e docs/saneamento-estoques-contrato.md).
 */

// ── Camadas e situações ──────────────────────────────────────────────────────

export const CAMADAS = ["IDENTIFICACAO", "QUALIDADE", "DUPLICIDADE", "GRUPOS_FINALIDADE", "NOMES_UNIDADES", "NCM", "TRIBUTARIO", "ESTOQUE", "OBRIGACOES"];

/** Título do grupo de colunas de cada camada na tabela única. */
export const ROTULO_CAMADA = {
  IDENTIFICACAO: "Identificação", QUALIDADE: "Qualidade", DUPLICIDADE: "Duplicidades", GRUPOS_FINALIDADE: "Grupos e finalidade",
  NOMES_UNIDADES: "Nomes e unidades", NCM: "NCM", TRIBUTARIO: "Tratamento tributário", ESTOQUE: "Estoque", OBRIGACOES: "Impacto nas obrigações",
};

/** Campos do item que cada camada revisa (visão focada). `campos.*` = campo extra da importação. */
export const CAMPOS_DA_CAMADA = {
  IDENTIFICACAO: ["codigo", "estabelecimento", "descricao", "referencia", "fabricante"],
  QUALIDADE: ["descricao", "unidade", "ncm", "ativo", "ultimaMovimentacao"],
  DUPLICIDADE: ["codigo", "descricao", "unidade", "fabricante", "referencia"],
  GRUPOS_FINALIDADE: ["grupo", "finalidade", "tambemUsadoComo"],
  NOMES_UNIDADES: ["descricao", "unidade"],
  NCM: ["ncm", "descricao"],
  TRIBUTARIO: ["ncm", "finalidade", "cClassTrib", "cst"],
  ESTOQUE: ["saldo", "unidade", "ultimaMovimentacao"],
  OBRIGACOES: ["codigo", "unidade", "ncm"],
};

export const ROTULO_CAMPO = {
  codigo: "Código", estabelecimento: "Estabelecimento", descricao: "Descrição", unidade: "Unidade", ncm: "NCM", grupo: "Grupo", ativo: "Ativo",
  saldo: "Saldo", ultimaMovimentacao: "Última movimentação", fabricante: "Fabricante", referencia: "Referência", finalidade: "Finalidade",
  tambemUsadoComo: "Também usado como", fatorConversao: "Fator de conversão", unidadeCompra: "Unidade de compra", cClassTrib: "cClassTrib", cst: "CST", enquadramentoLegal: "Enquadramento legal", artigo: "Artigo", origem: "Origem",
  fatorSituacao: "Situação do fator", exigeFator: "Exige fator (informativo)", fatorDe: "Fator: 1 unidade de", fatorPara: "Fator: equivale a (unidade)",
};
export const rotuloDoCampo = (c) => ROTULO_CAMPO[c] || c;

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

// ── Trava das atividades ─────────────────────────────────────────────────────

export const MENSAGEM_TRAVA = "Confirme as atividades do cliente para continuar";

/** O que a tela mostra e bloqueia conforme o projeto (campos `atividadesConfirmadas`, `cnpjDesatualizado` e `atividades`). */
export function estadoDaTrava(projeto) {
  const atividades = projeto?.atividades || [];
  const mantidas = atividades.filter((a) => a.mantida).length;
  const confirmada = !!projeto?.atividadesConfirmadas;
  return {
    confirmada,
    bloqueada: !confirmada,
    mensagem: confirmada ? null : MENSAGEM_TRAVA,
    mantidas,
    podeConfirmar: !confirmada && mantidas >= 1,
    motivoSemConfirmar: confirmada ? null : mantidas < 1 ? "Mantenha ou acrescente pelo menos uma atividade." : null,
    revisarAtividades: !!projeto?.cnpjDesatualizado,
    editavel: !confirmada,
  };
}

/** Abas que a trava bloqueia por inteiro. A tabela, a visão geral e os casos continuam legíveis; só as análises ficam travadas. */
export const ABAS_BLOQUEADAS_PELA_TRAVA = ["importacao"];
export const abaBloqueada = (aba, projeto) => estadoDaTrava(projeto).bloqueada && ABAS_BLOQUEADAS_PELA_TRAVA.includes(aba);

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
  if (ehTravaNaoConfirmada(err)) return `${MENSAGEM_TRAVA}.`;
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
  if (Object.keys(p).length === 0) return "Não há proposta: não há alteração para aprovar. Rejeite ou peça informação.";
  if (p.decisao === "SOLICITAR_INFORMACAO") return "A decisão proposta é solicitar informação ao cliente: use “Pedir informação” ou escolha outra decisão antes de aprovar.";
  if (precisaInformarFator(caso) && !fatorOk(p.fatorConversao)) return "Informe o fator de conversão (número maior que zero) para aprovar a mudança de unidade.";
  return null;
}

/** Em que atividade cada CNAE vira (mapaAtividades do projeto); ausente = não mostra nada. */
export function efeitoDaAtividade(mapa, codigo) {
  if (!mapa) return null;
  const m = (mapa.mapeadas || []).find((x) => String(x.codigo) === String(codigo));
  if (m) return `Vira: ${m.rotulo || m.atividade}`;
  if ((mapa.semMapeamento || []).map(String).includes(String(codigo))) return "Sem efeito nas sugestões";
  return null;
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

/** Corpo da prévia e da aprovação do lote: ids marcados ou, sem marcação, o filtro (camada, tipo, origem). */
export function corpoDoLote({ ids, filtro, fundamento } = {}) {
  const corpo = {};
  if (ids && ids.length) corpo.ids = ids;
  else {
    const f = {};
    for (const k of ["camada", "tipo", "origem"]) if (filtro && !vazio(filtro[k])) f[k] = filtro[k];
    corpo.filtro = f;
  }
  if (fundamento && String(fundamento).trim()) corpo.fundamento = String(fundamento).trim();
  return corpo;
}
/** Rótulo de um caso para as exceções do lote: camada e problema (o servidor só devolve o id). */
export function rotuloDoCaso(casos, id) {
  const c = (casos || []).find((x) => x.id === id);
  return c ? `${ROTULO_CAMADA[c.camada] || c.camada}: ${c.problema}` : `Caso ${String(id).slice(0, 8)}`;
}
/** Ids do lote = exatamente os casos que a tela mostra em aberto (ou os marcados), no máximo 2000. */
export function idsDoLote(marcados, listados) {
  if (marcados && marcados.size) return [...marcados].slice(0, 2000);
  return (listados || []).filter(casoAberto).map((c) => c.id).slice(0, 2000);
}
export const loteTemEscolha = (corpo) => !!(corpo?.ids?.length || (corpo?.filtro && Object.keys(corpo.filtro).length));
/** A aprovação exige as versões que a prévia mostrou. */
export const versoesDaPrevia = (previa) => Object.fromEntries((previa?.aprovaveis || []).map((a) => [a.casoId, a.versao]));

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

/** Endereço do download de uma entrega. Com `versaoId` = versão liberada; sem ele = exportação para revisão (base de agora). */
export function enderecoDeEntrega(projetoId, tipo, versaoId) {
  const base = `/saneamento-estoques/projetos/${projetoId}/entregas/${tipo === "pdf" ? "relatorio" : "excel"}`;
  return versaoId ? `${base}?versaoId=${encodeURIComponent(versaoId)}` : base;
}
export function nomeDeEntrega(tipo, versao) {
  const ext = tipo === "pdf" ? "pdf" : "xlsx";
  return versao ? `saneamento-estoques-versao-${versao.numero}-liberada.${ext}` : `saneamento-estoques-para-revisao.${ext}`;
}

// ── Mapa de unificações e inativações ────────────────────────────────────────

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
export const textoDoValor = (v) => (v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "Sim" : "Não") : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v));

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
  GRUPOS_FINALIDADE: [{ campo: "finalidade", rotulo: "Finalidade deste item", tipo: "finalidade" }],
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
      justificativa: String(motivo).trim(), fundamento: null, impactos: [], origem: "REGRA", afeta: camada === "GRUPOS_FINALIDADE" ? ["TRIBUTARIO", "OBRIGACOES"] : camada === "NOMES_UNIDADES" ? ["DUPLICIDADE", "OBRIGACOES"] : ["OBRIGACOES"],
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
    GRUPOS_FINALIDADE: [{ id: "grupo", titulo: "Grupo", largura: 170 }, { id: "finalidade", titulo: "Finalidade", largura: 150 }],
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

// ── Abas da página do projeto ────────────────────────────────────────────────

export const ABAS = [
  { id: "configuracao", rotulo: "Configuração" },
  { id: "importacao", rotulo: "Importação" },
  { id: "tabela", rotulo: "Tabela" },
  { id: "visao", rotulo: "Visão geral" },
  { id: "casos", rotulo: "Casos" },
  { id: "impacto", rotulo: "Impacto nas obrigações" },
  { id: "unificacoes", rotulo: "Unificações" },
  { id: "versoes", rotulo: "Versões" },
];
/** Aba pedida na URL; sem pedido (ou inválida), a Configuração enquanto as atividades não estão confirmadas e a Tabela depois. */
export function abaInicial(pedida, projeto) {
  if (ABAS.some((a) => a.id === pedida)) return pedida;
  return projeto && !projeto.atividadesConfirmadas ? "configuracao" : "tabela";
}
/** Próxima aba por teclado (setas, Home, End), circular. */
export function abaPorTecla(atual, tecla) {
  const i = ABAS.findIndex((a) => a.id === atual);
  if (tecla === "ArrowRight") return ABAS[(i + 1) % ABAS.length].id;
  if (tecla === "ArrowLeft") return ABAS[(i - 1 + ABAS.length) % ABAS.length].id;
  if (tecla === "Home") return ABAS[0].id;
  if (tecla === "End") return ABAS[ABAS.length - 1].id;
  return null;
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
