/**
 * Cadastro de ERPs: rótulos e regras puras usadas pelas telas. Espelho de backend/src/erps/logica.ts (o teste do servidor
 * confere que as duas associam o texto antigo do mesmo jeito). Sem imports: o servidor lê este arquivo no teste.
 */

export const TIPOS_CONHECIMENTO = {
  COLUNA_EXPORT: "Colunas do export",
  CONSULTA_EXTRACAO: "Consultas de extração",
  RESTRICAO: "Restrições",
  ACAO_NO_ERP: "Ação no ERP",
  MODELO_CARGA: "Modelos de carga",
  OBSERVACAO: "Observações",
};
export const SITUACOES_ERP = { COMPLETO: "Completo", PARCIAL: "Parcial", A_DESENVOLVER: "A desenvolver" };
export const GRAUS = { CONFIRMADO: "Confirmado", NAO_CONFIRMADO: "Não confirmado" };
/** Os mesmos TIPOS_AJUSTE de backend/src/saneamento-estoques/fiscal/impactoSped.ts. */
export const TIPOS_AJUSTE_ERP = {
  MUDOU_CODIGO_DESCRICAO: "Mudou código ou descrição do item",
  MUDOU_UNIDADE: "Mudou unidade ou conversão",
  CONSOLIDOU_INATIVOU: "Consolidou código (unificação)",
  INATIVOU: "Inativou código",
  MUDOU_NCM: "Mudou NCM",
  MUDOU_TRATAMENTO: "Mudou tratamento (CST/cClassTrib)",
  ITEM_ATIVO_IMOBILIZADO: "Item de bem do ativo imobilizado",
};
/** Campos do saneamento que uma coluna do export pode alimentar (CAMPOS_BASE da importação). */
export const CAMPOS_SANEAMENTO = {
  codigo: "Código", descricao: "Descrição", unidade: "Unidade", ncm: "NCM", grupo: "Grupo", ativo: "Ativo", saldo: "Saldo",
  ultimaMovimentacao: "Última movimentação", fabricante: "Fabricante", referencia: "Referência", estabelecimento: "Estabelecimento", finalidade: "Finalidade",
};

/** Nome normalizado: sem acento, minúsculo, só letras e números separados por um espaço. */
export function normalizarNome(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Apelidos do nome (siglas de mercado) ficam no próprio Cadastro de ERPs: item OBSERVACAO com a chave "Apelidos do nome" e os apelidos no
 * texto, separados por ";" (o administrador edita como qualquer item, com histórico). A lista de ERPs (/erps) já traz `apelidos`.
 */
export const CHAVE_APELIDOS = "Apelidos do nome";
export const apelidosDoTexto = (t) => String(t ?? "").split(/[;\n]/).map((s) => s.trim()).filter(Boolean);

/** Tira do fim do texto normalizado a versão numérica ("10", "10.0", "12.1.2510", "v10") e o banco (SQL, SQL Server, HANA). */
export function semSufixos(n) {
  let s = n; let antes = "";
  while (s !== antes) { antes = s; s = s.replace(/(?:\s+(?:v?\d+|sql|server|hana|e))+$/, "").trim(); }
  return s;
}

/** Formas do nome que identificam o ERP: o nome, sem o parêntese, sem o fabricante, sem a palavra "erp", o produto, fabricante + produto e os apelidos do cadastro. */
export function formasDoNome(e) {
  const f = new Set();
  const fab = normalizarNome(e?.fabricante);
  const add = (s) => { const n = normalizarNome(s); if (n) f.add(n); };
  const nome = normalizarNome(e?.nome);
  const semParentese = normalizarNome(String(e?.nome ?? "").replace(/\([^)]*\)/g, " "));
  for (const base of [nome, semParentese]) {
    add(base);
    if (fab && base.startsWith(`${fab} `)) add(base.slice(fab.length + 1));
    add(base.replace(/\berp\b/g, " "));
  }
  if (e?.produto) {
    const prod = normalizarNome(String(e.produto).replace(/\([^)]*\)/g, " "));
    add(prod);
    if (fab) add(`${fab} ${prod}`);
  }
  for (const a of e?.apelidos ?? []) add(a);
  for (const x of [...f]) { const s = semSufixos(x); if (s) f.add(s); }
  return f;
}

/** O texto antigo casa, sem ambiguidade, com um só ERP ativo do cadastro? Devolve o ERP ou null. */
export function associarErp(texto, erps = []) {
  const t = normalizarNome(texto);
  if (!t) return null;
  const s = semSufixos(t);
  const achados = erps.filter((e) => { if (e.ativo === false) return false; const f = formasDoNome(e); return f.has(t) || (!!s && f.has(s)); });
  return achados.length === 1 ? achados[0] : null;
}

/**
 * O ERP de um registro (cliente, projeto): pelo vínculo (erp_id); sem vínculo, pelo texto antigo, quando casa sem ambiguidade.
 * { erp, texto, naoIdentificado }: `naoIdentificado` = há texto antigo que não casa (a tela pede para selecionar na lista).
 */
export function erpDoRegistro(registro, erps = [], campos = { id: "erp_id", texto: "erp" }) {
  const id = registro?.[campos.id];
  const texto = String(registro?.[campos.texto] ?? "").trim();
  const porId = id ? erps.find((e) => e.id === id) : null;
  if (porId) return { erp: porId, texto, naoIdentificado: false };
  const porTexto = associarErp(texto, erps);
  return { erp: porTexto, texto, naoIdentificado: !porTexto && !!texto };
}

/**
 * Vínculo do ERP a gravar (cliente e projeto): o erp_id escolhido na lista ou o do texto antigo que casa sem ambiguidade; o texto antigo
 * (`erp`) fica como foi digitado e só é preenchido com o nome do ERP quando estava vazio. Sem a lista carregada (carregando ou falhou),
 * o erp_id que o registro já tem é mantido: nunca se apaga o vínculo por falta de lista.
 */
export function vinculoErpParaSalvar(registro, erps = [], listaCarregada = true) {
  const atualId = registro?.erp_id || null;
  const texto = String(registro?.erp ?? "").trim();
  if (!listaCarregada) return { erp_id: atualId, erp: texto || null };
  const { erp } = erpDoRegistro(registro, erps);
  return { erp_id: erp?.id ?? atualId, erp: texto || erp?.nome || null };
}

export const avisoNaoIdentificado = (texto) => `ERP não identificado: ${texto} — selecione na lista`;

/**
 * Texto original do registro que diverge do ERP escolhido (ex.: "SAP B1" digitado antes e o Siagri escolhido na lista): fica guardado só
 * como registro histórico e a tela o identifica como "Texto original", nunca como o ERP em uso. null = não há texto ou ele é o mesmo ERP.
 */
export function textoOriginalDivergente(registro, erps = []) {
  const { erp, texto } = erpDoRegistro(registro, erps);
  if (!erp || !texto || !registro?.erp_id) return null;
  return associarErp(texto, erps)?.id === erp.id ? null : texto;
}

export const avisoTextoOriginal = (texto) => `Texto original: "${texto}" (registro histórico do que estava digitado; o ERP em uso é o selecionado na lista)`;

/** Perfil com conhecimento específico? A desenvolver (e o "Outro ERP") usa só as regras gerais, sem alertas específicos. */
export const perfilEspecifico = (p) => !!p && p.situacao !== "A_DESENVOLVER" && p.ativo !== false;

const ativos = (p, tipo) => (perfilEspecifico(p) ? (p.itens || []).filter((i) => i.ativo !== false && i.tipo === tipo).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)) : []);

/** Restrições do ERP para os tipos de ajuste (as gerais, sem tipo, ficam na ficha do ERP). */
export function restricoesDoTipo(p, tipos = []) {
  const s = new Set(tipos);
  return ativos(p, "RESTRICAO").filter((i) => i.tipo_ajuste && s.has(i.tipo_ajuste));
}

export const consultasDeExtracao = (p) => ativos(p, "CONSULTA_EXTRACAO");
export const colunasDoExportDoPerfil = (p) => ativos(p, "COLUNA_EXPORT");

