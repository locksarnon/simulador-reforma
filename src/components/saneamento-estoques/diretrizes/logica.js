/**
 * Diretrizes do saneamento: regras por aspecto e por grupo (contrato em docs/saneamento-diretrizes.md, seção 11, e
 * backend/src/saneamento-estoques/diretrizes/tipos.ts). Aqui só funções puras: rótulos, conteúdo padrão, validação, abrangência,
 * transferências, limites, prévia da estrutura de nomes e o fluxo "prévia antes de aplicar".
 */
import { codigoDoErro, ehConflitoVersao, lerNumeroBr, mensagemDeErro, ROTULO_CAMADA } from "../logica";

// ── Aspectos ─────────────────────────────────────────────────────────────────

export const ASPECTOS = ["NOMES", "ATRIBUTOS", "UNIDADES", "LIMITES", "FISCAL"];
export const ROTULO_ASPECTO = {
  NOMES: "Padrão de nomes", ATRIBUTOS: "Atributos técnicos", UNIDADES: "Unidades e embalagens", LIMITES: "Limites de caracteres", FISCAL: "Classificação fiscal",
};
export const PREFIXO_ASPECTO = { NOMES: "N", ATRIBUTOS: "A", UNIDADES: "U", LIMITES: "L", FISCAL: "F" };
/** O que a análise aponta com cada aspecto (uma frase, para a tela). */
export const SOBRE_ASPECTO = {
  NOMES: "Ordem e forma da descrição: componentes, separador, maiúsculas, abreviações aprovadas e termos proibidos. A proposta só reordena e normaliza o que já existe; nunca inventa informação.",
  ATRIBUTOS: "Informações técnicas que o item precisa ter (marca, referência, princípio ativo…) e onde elas ficam. Atributo ausente vira pendência.",
  UNIDADES: "Unidade de estoque, unidades permitidas na compra e na saída e os fatores de conversão.",
  LIMITES: "Tamanho máximo de cada campo por destino (leiaute oficial, ERP, cliente). Vale o menor limite confirmado; nada é cortado.",
  FISCAL: "Validação de NCM e de cClassTrib nos cenários do cliente.",
};
export const CAMADAS_DO_ASPECTO = { NOMES: ["NOMES_UNIDADES"], ATRIBUTOS: ["QUALIDADE"], UNIDADES: ["NOMES_UNIDADES"], LIMITES: ["NOMES_UNIDADES"], FISCAL: ["NCM", "TRIBUTARIO"] };
export const rotuloCamada = (c) => ROTULO_CAMADA[c] || "Outra análise";

export const SITUACAO_REGRA = { RASCUNHO: "Rascunho", APROVADA: "Aprovada" };

/** Componentes da descrição (aspecto Nomes). */
export const COMPONENTES_NOME = ["NOME", "REFERENCIA", "MARCA", "CARACTERISTICA", "APRESENTACAO", "COMPLEMENTO"];
export const ROTULO_COMPONENTE = { NOME: "Nome", REFERENCIA: "Referência", MARCA: "Marca", CARACTERISTICA: "Característica técnica", APRESENTACAO: "Apresentação", COMPLEMENTO: "Complemento" };
/** Exemplo de cada componente na prévia da estrutura (sem item real). */
export const EXEMPLO_COMPONENTE = { NOME: "Parafuso sextavado", REFERENCIA: "Ref 4521", MARCA: "Ciser", CARACTERISTICA: "M10 x 50 mm", APRESENTACAO: "Caixa com 100", COMPLEMENTO: "Zincado" };
export const CAPITALIZACOES = { MAIUSCULAS: "Tudo em maiúsculas", MINUSCULAS: "Tudo em minúsculas", PRESERVAR: "Manter como está" };
export const SEPARADORES = [{ valor: " ", rotulo: "Espaço" }, { valor: " - ", rotulo: "Hífen com espaços ( - )" }, { valor: "-", rotulo: "Hífen (-)" }, { valor: ", ", rotulo: "Vírgula (, )" }, { valor: " / ", rotulo: "Barra ( / )" }];

/** Atributos sugeridos (aspecto Atributos); o usuário pode acrescentar outro. */
export const ATRIBUTOS_SUGERIDOS = ["MARCA", "REFERENCIA", "COMPOSICAO", "PRINCIPIO_ATIVO", "CONCENTRACAO", "FORMULACAO", "DIMENSAO", "MATERIAL", "APRESENTACAO"];
export const ROTULO_ATRIBUTO = {
  MARCA: "Marca", REFERENCIA: "Referência", COMPOSICAO: "Composição", PRINCIPIO_ATIVO: "Princípio ativo", CONCENTRACAO: "Concentração", FORMULACAO: "Formulação",
  DIMENSAO: "Dimensão", MATERIAL: "Material", APRESENTACAO: "Apresentação",
};
export const rotuloAtributo = (a) => ROTULO_ATRIBUTO[a] || String(a ?? "");
export const ONDE_ATRIBUTO = { DESCRICAO: "Na descrição", CAMPO_PROPRIO: "Em campo próprio", AMBOS: "Na descrição e em campo próprio" };
export const APLICABILIDADE = { OBRIGATORIO: "Obrigatório", QUANDO_APLICAVEL: "Obrigatório quando aplicável" };

/** Unidades comuns oferecidas nas listas (outras podem ser digitadas). */
export const UNIDADES_COMUNS = ["UN", "PC", "PAR", "JG", "KIT", "CX", "FD", "SC", "DZ", "KG", "G", "TON", "L", "ML", "GL", "BD", "LT", "M", "CM", "MM", "M2", "M3", "RL"];
export const CRITERIO_ESTOQUE = { MENOR_PRATICA: "Menor unidade prática (padrão)", DEFINIDA: "Unidade definida para o grupo" };
export const ABRANGENCIA_CONVERSAO = { GRUPO: "Todo o grupo", PRODUTO: "Um produto" };
export const AVISO_CONVERSAO_DESCONHECIDA = "Conversão desconhecida vira pendência pedindo o fator: o sistema nunca adivinha um fator.";

export const ORIGEM_LIMITE = { LEIAUTE_OFICIAL: "Leiaute oficial", ERP: "ERP", CLIENTE: "Cliente" };
export const CAMPO_ITEM = { descricao: "Descrição", codigo: "Código", unidade: "Unidade", referencia: "Referência", fabricante: "Fabricante" };
export const TRATAMENTO_EXCESSO = { SUGERIR_ABREVIACAO: "Sugerir abreviação aprovada", SOLICITAR_REVISAO: "Pedir revisão" };

export const CENARIOS_FISCAIS = { ENTRADA: "Entrada", SAIDA: "Saída", USO_INTERNO: "Uso interno" };
export const TEXTO_AUSENTE = "Classificação ausente vira pendência.";
export const TEXTO_AMBIGUO = "Classificação ambígua vai para revisão fiscal.";

// ── Conteúdo padrão por aspecto ──────────────────────────────────────────────

export function conteudoPadrao(aspecto) {
  switch (aspecto) {
    case "NOMES": return { aspecto, componentes: ["NOME", "CARACTERISTICA", "MARCA", "REFERENCIA", "APRESENTACAO"], obrigatorios: ["NOME"], separador: " ", capitalizacao: "MAIUSCULAS", removerEspacosDuplicados: true, abreviacoes: [], termosProibidos: [] };
    case "ATRIBUTOS": return { aspecto, atributos: [] };
    case "UNIDADES": return { aspecto, criterioEstoque: "MENOR_PRATICA", unidadeDefinida: null, unidadesCompra: [], unidadesSaida: [], conversoes: [], conversaoDesconhecida: "PENDENCIA" };
    case "LIMITES": return { aspecto, linhas: [] };
    case "FISCAL": return { aspecto, validarNcm: true, excecoesNcm: [], validarCClassTrib: true, cenarios: ["ENTRADA", "SAIDA"], ausente: "PENDENCIA", ambiguo: "REVISAO_FISCAL" };
    default: return { aspecto };
  }
}

/** Conteúdo completo: o padrão do aspecto com o que veio do servidor por cima (campo ausente não quebra a tela). */
export function conteudoCompleto(aspecto, conteudo) {
  return { ...conteudoPadrao(aspecto), ...(conteudo || {}), aspecto };
}

export const novaLinhaLimite = () => ({ destino: "", campo: "", campoItem: "descricao", limite: null, origem: "CLIENTE", referencia: "", url: "", confirmado: false, tratamento: "SUGERIR_ABREVIACAO", preservar: ["NOME"] });
export const novaConversao = () => ({ origem: "", destino: "", fator: "", abrangencia: "GRUPO", codigoProduto: "" });
export const novoAtributo = (atributo = "") => ({ atributo, onde: "DESCRICAO", campo: "", aplicabilidade: "OBRIGATORIO", condicao: "" });

// ── Listas e ordem ───────────────────────────────────────────────────────────

/** Move o elemento `i` uma posição (`delta` = -1 sobe, +1 desce). Fora dos limites, devolve a mesma lista. */
export function mover(lista, i, delta) {
  const j = i + delta;
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return lista;
  const n = [...lista];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}
/** Leva o elemento de `de` para a posição `para` (arrastar e soltar). */
export function moverPara(lista, de, para) {
  if (de === para || de < 0 || de >= lista.length || para < 0 || para >= lista.length) return lista;
  const n = [...lista];
  const [x] = n.splice(de, 1);
  n.splice(para, 0, x);
  return n;
}
export const alternarNaLista = (lista, valor) => (lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);

// ── Abrangência e transferências ─────────────────────────────────────────────

export const ABRANGENCIA_TODOS = { todos: true };
export const ehTodos = (a) => !a || a.todos === true;
export const gruposDaAbrangencia = (a) => (ehTodos(a) ? [] : Array.isArray(a.grupos) ? a.grupos : []);

/** Texto curto da abrangência ("Todos os grupos" ou a lista). */
export function textoAbrangencia(a) {
  if (ehTodos(a)) return "Todos os grupos";
  const g = gruposDaAbrangencia(a);
  const sub = Array.isArray(a.subgrupos) && a.subgrupos.length ? ` (subgrupos: ${a.subgrupos.join(", ")})` : "";
  return g.length ? `${g.join(", ")}${sub}` : "Nenhum grupo";
}

/**
 * Grupos que a abrangência escolhida tira de outra regra do mesmo aspecto (uma regra efetiva por grupo e aspecto).
 * - grupo escolhido que já está na lista de outra regra → transferência;
 * - "Todos os grupos" quando outra regra do aspecto já é o padrão → o padrão passa para esta regra.
 * Regra "Todos os grupos" não perde grupo para uma regra de grupo: a regra de grupo é a exceção, não é transferência.
 */
export function transferencias({ abrangencia, aspecto, regraId, regras }) {
  const outras = (regras || []).filter((r) => r.aspecto === aspecto && r.id !== regraId).sort((a, b) => String(a.codigo || "").localeCompare(String(b.codigo || "")));
  if (ehTodos(abrangencia)) {
    return outras.filter((r) => ehTodos(r.abrangencia)).map((r) => ({ grupo: "Todos os grupos (padrão)", regraId: r.id, codigo: r.codigo, nome: r.nome, padrao: true }));
  }
  // Mesma regra de nível do servidor (resolucao.ts): só há sobreposição no MESMO nível — regra de grupo com regra de grupo, regra de
  // grupo e subgrupo com regra do mesmo par grupo/subgrupo. Regra de subgrupo é exceção dentro da regra do grupo, não transferência.
  const { nivel, chaves } = paresDaAbrangencia(abrangencia);
  const minhas = new Set(chaves);
  const lista = [];
  for (const r of outras) {
    const dela = paresDaAbrangencia(r.abrangencia);
    if (dela.nivel !== nivel) continue;
    for (const k of dela.chaves) if (minhas.has(k)) lista.push({ grupo: k.replace("\u0000", " / "), regraId: r.id, codigo: r.codigo, nome: r.nome, padrao: false });
  }
  return lista;
}
/** Chave de grupo como o servidor compara (espaços repetidos não distinguem; vazio = "(sem grupo)"). */
const chaveGrupoTela = (g) => String(g ?? "").replace(/\s+/g, " ").trim() || "(sem grupo)";
const chaveSubgrupoTela = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
/** Pares que a abrangência cobre no nível dela (TODOS, GRUPO ou SUBGRUPO), como `pares` em resolucao.ts. */
function paresDaAbrangencia(a) {
  if (ehTodos(a)) return { nivel: "TODOS", chaves: ["*"] };
  const grupos = gruposDaAbrangencia(a);
  const subs = Array.isArray(a.subgrupos) ? a.subgrupos : [];
  if (subs.length) return { nivel: "SUBGRUPO", chaves: grupos.flatMap((g) => subs.map((s) => `${chaveGrupoTela(g)}\u0000${chaveSubgrupoTela(s)}`)) };
  return { nivel: "GRUPO", chaves: grupos.map(chaveGrupoTela) };
}
/** Chave estável de um conjunto de transferências (a confirmação vale só para o que foi mostrado). */
export const chaveTransferencias = (lista) => (lista || []).map((t) => `${t.grupo}>${t.regraId}`).sort().join("|");

/** Subgrupos disponíveis para os grupos escolhidos (só quando a base trouxe a coluna). */
export function subgruposDisponiveis(grupos, escolhidos) {
  const set = new Set();
  for (const g of grupos || []) if (escolhidos.includes(g.grupo)) for (const s of g.subgrupos || []) if (s) set.add(s);
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Regras agrupadas por aspecto, na ordem do contrato e pelo código dentro do aspecto. */
export function regrasPorAspecto(regras) {
  const r = {};
  for (const a of ASPECTOS) r[a] = (regras || []).filter((x) => x.aspecto === a).sort((x, y) => String(x.codigo || "").localeCompare(String(y.codigo || ""), "pt-BR", { numeric: true }));
  return r;
}

// ── Conteúdo efetivo, alterações do projeto ──────────────────────────────────

/** JSON com as chaves em ordem: compara conteúdos sem depender da ordem em que foram montados. */
const estavel = (v) => (Array.isArray(v) ? `[${v.map(estavel).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${estavel(v[k])}`).join(",")}}` : JSON.stringify(v ?? null));
const igual = (a, b) => estavel(a) === estavel(b);

/**
 * O que o projeto guarda: só o que difere da biblioteca. `base` = conteúdo de que a tela partiu (efetivo carregado ou o da biblioteca);
 * `editado` = o que está na tela; `anteriores` = alterações já gravadas (continuam valendo, com o editado por cima).
 * Sem biblioteca, o conteúdo inteiro é a regra. Conteúdo igual ao de que a tela partiu (só nome, observação ou grupos mudaram) devolve
 * `undefined`: as alterações não vão no pedido (renomear não mexe no conteúdo nem tira a marca de regra convertida).
 */
export function alteracoesParaSalvar({ bibliotecaId, base, editado, anteriores }) {
  if (base && igual(editado, base)) return undefined;
  if (!bibliotecaId) return { ...editado };
  const r = { ...(anteriores || {}) };
  for (const k of Object.keys(editado || {})) if (k !== "aspecto" && !igual(editado[k], base?.[k])) r[k] = editado[k];
  if (Object.keys(r).length) r.aspecto = editado.aspecto;
  return Object.keys(r).length ? r : null;
}

// ── Conversões e números ─────────────────────────────────────────────────────

/** Fator digitado (padrão brasileiro, mesma leitura do servidor) → número positivo; senão null. */
export function lerFator(texto) {
  const n = lerNumeroBr(texto);
  return n !== null && n > 0 ? n : null;
}
/** Fator para a tela: número vira texto com vírgula ("0,5"); texto fica como foi digitado. */
export const fatorNaTela = (f) => (typeof f === "number" ? String(f).replace(".", ",") : f ?? "");

/** Limite digitado → inteiro positivo, ou null (vazio = não confirmado). `invalido` quando há texto que não é inteiro positivo. */
export function lerLimite(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return { valor: null, invalido: false };
  const n = lerNumeroBr(t);
  return n !== null && Number.isInteger(n) && n > 0 ? { valor: n, invalido: false } : { valor: null, invalido: true };
}

// ── Limites: menor confirmado e alerta do ERP ────────────────────────────────

/**
 * Limite efetivo por campo do item: o MENOR limite confirmado. Linha sem número ou não confirmada fica pendente.
 * Alerta quando um ERP confirmado aceita mais que o leiaute oficial confirmado (o ERP está configurado acima do teto).
 */
export function resumoLimites(linhas) {
  const porCampo = {};
  for (const l of linhas || []) {
    const c = l.campoItem || "descricao";
    const p = (porCampo[c] ||= { campoItem: c, efetivo: null, origemEfetivo: null, destinoEfetivo: null, pendentes: 0, alertas: [] });
    const n = typeof l.limite === "number" ? l.limite : lerLimite(l.limite).valor;
    if (n === null || !l.confirmado) { p.pendentes += 1; continue; }
    if (p.efetivo === null || n < p.efetivo) { p.efetivo = n; p.origemEfetivo = l.origem; p.destinoEfetivo = l.destino; }
  }
  for (const c of Object.keys(porCampo)) {
    const confirmadas = (linhas || []).filter((l) => (l.campoItem || "descricao") === c && l.confirmado).map((l) => ({ ...l, n: typeof l.limite === "number" ? l.limite : lerLimite(l.limite).valor })).filter((l) => l.n !== null);
    const oficiais = confirmadas.filter((l) => l.origem === "LEIAUTE_OFICIAL");
    if (!oficiais.length) continue;
    const teto = Math.min(...oficiais.map((l) => l.n));
    for (const e of confirmadas.filter((l) => l.origem === "ERP" && l.n > teto)) {
      porCampo[c].alertas.push(`${e.destino || "ERP"} aceita ${e.n} caracteres em ${CAMPO_ITEM[c] || c}, mais que o leiaute oficial (${teto}). Vale o leiaute oficial; confira a configuração do ERP.`);
    }
  }
  return Object.values(porCampo);
}

// ── Prévia da estrutura (Nomes) ──────────────────────────────────────────────

function capitalizar(t, modo) {
  if (modo === "MAIUSCULAS") return t.toLocaleUpperCase("pt-BR");
  if (modo === "MINUSCULAS") return t.toLocaleLowerCase("pt-BR");
  return t;
}
/** Estrutura em texto ("Nome + Característica técnica + Marca") e um exemplo montado com a regra (separador, maiúsculas, abreviações, termos). */
export function previaEstrutura(regra) {
  const c = conteudoCompleto("NOMES", regra);
  const estrutura = c.componentes.map((k) => `${ROTULO_COMPONENTE[k] || k}${c.obrigatorios.includes(k) ? " (obrigatório)" : ""}`).join(" + ");
  let exemplo = c.componentes.map((k) => EXEMPLO_COMPONENTE[k] || k).join(c.separador ?? " ");
  exemplo = aplicarTextos(exemplo, c);
  return { estrutura: estrutura || "Nenhum componente escolhido", exemplo };
}
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Aplica termos proibidos, abreviações, espaços e maiúsculas a um texto (só para a prévia; quem propõe é o servidor). */
export function aplicarTextos(texto, regra) {
  let t = String(texto ?? "");
  for (const p of regra.termosProibidos || []) {
    if (!p.termo) continue;
    t = t.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escapar(p.termo)}(?=$|[^\\p{L}\\p{N}])`, "giu"), (_m, antes) => `${antes}${p.substituicao ?? ""}`);
  }
  for (const a of regra.abreviacoes || []) {
    if (!a.completa || !a.abreviacao) continue;
    t = t.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escapar(a.completa)}(?=$|[^\\p{L}\\p{N}])`, "giu"), (_m, antes) => `${antes}${a.abreviacao}`);
  }
  if (regra.removerEspacosDuplicados) t = t.replace(/\s{2,}/g, " ").trim();
  return capitalizar(t, regra.capitalizacao);
}

/** Exemplos reais (rota exemplos): aceita lista ou { itens }, com os nomes de campo que o servidor usar. */
export function lerExemplos(dados) {
  const lista = Array.isArray(dados) ? dados : Array.isArray(dados?.itens) ? dados.itens : Array.isArray(dados?.exemplos) ? dados.exemplos : [];
  return lista.map((e, i) => {
    const atual = e.descricaoAtual ?? e.atual ?? e.descricao ?? "";
    const proposta = e.descricaoProposta ?? e.proposta ?? e.comoFicaria ?? e.depois ?? "";
    return {
      id: e.id ?? e.itemId ?? `${i}`,
      codigo: e.codigo ?? "",
      grupo: e.grupo ?? "",
      atual,
      proposta,
      muda: typeof e.muda === "boolean" ? e.muda : !!proposta && proposta !== atual,
      observacao: e.observacao ?? e.motivo ?? (Array.isArray(e.apontamentos) ? e.apontamentos.join("; ") : ""),
    };
  });
}

/**
 * Resumo dos exemplos: quantos itens da regra mudam (o servidor manda primeiro os que mudam). null = o servidor não contou (aspecto sem
 * descrição proposta).
 */
export function resumoExemplos(dados) {
  const total = Number(dados?.total);
  const mudam = dados?.totalMudam;
  if (typeof mudam !== "number" || !Number.isFinite(total)) return null;
  const fmt = (n) => Number(n).toLocaleString("pt-BR");
  if (!mudam) return `Nenhum dos ${fmt(total)} ${total === 1 ? "item" : "itens"} da regra muda.`;
  return `${fmt(mudam)} de ${fmt(total)} ${total === 1 ? "item muda" : "itens mudam"} com esta regra; os que mudam aparecem primeiro.`;
}

// ── Validação ────────────────────────────────────────────────────────────────

/** Erros que impedem salvar (texto para a pessoa). Lista vazia = pode salvar. */
export function validarRegra({ nome, abrangencia, conteudo }) {
  const e = [];
  if (!String(nome || "").trim()) e.push("Dê um nome à regra.");
  if (!ehTodos(abrangencia) && !gruposDaAbrangencia(abrangencia).length) e.push("Escolha os grupos da regra ou marque Todos os grupos.");
  const c = conteudo || {};
  switch (c.aspecto) {
    case "NOMES":
      if (!(c.componentes || []).length) e.push("Escolha ao menos um componente da descrição.");
      if ((c.obrigatorios || []).some((o) => !(c.componentes || []).includes(o))) e.push("Componente obrigatório precisa estar na estrutura.");
      if ((c.abreviacoes || []).some((a) => !String(a.completa || "").trim() || !String(a.abreviacao || "").trim())) e.push("Preencha a expressão completa e a abreviação em todas as linhas de abreviações (ou remova a linha).");
      if ((c.termosProibidos || []).some((t) => !String(t.termo || "").trim())) e.push("Preencha o termo em todas as linhas de termos proibidos (ou remova a linha).");
      break;
    case "ATRIBUTOS":
      (c.atributos || []).forEach((a, i) => {
        const n = `Atributo ${i + 1}${a.atributo ? ` (${rotuloAtributo(a.atributo)})` : ""}`;
        if (!String(a.atributo || "").trim()) e.push(`${n}: escolha ou digite o atributo.`);
        if (a.onde !== "DESCRICAO" && !String(a.campo || "").trim()) e.push(`${n}: informe o campo próprio.`);
        if (a.aplicabilidade === "QUANDO_APLICAVEL" && !String(a.condicao || "").trim()) e.push(`${n}: descreva quando se aplica.`);
      });
      break;
    case "UNIDADES":
      if (c.criterioEstoque === "DEFINIDA" && !String(c.unidadeDefinida || "").trim()) e.push("Escolha a unidade definida para o grupo.");
      (c.conversoes || []).forEach((v, i) => {
        const n = `Conversão ${i + 1}`;
        if (!String(v.origem || "").trim() || !String(v.destino || "").trim()) e.push(`${n}: informe a unidade de origem e a de destino.`);
        else if (String(v.origem).trim().toUpperCase() === String(v.destino).trim().toUpperCase()) e.push(`${n}: origem e destino são a mesma unidade.`);
        if (lerFator(v.fator) === null) e.push(`${n}: digite um fator maior que zero (ex.: 1.000 ou 0,5).`);
        if (v.abrangencia === "PRODUTO" && !String(v.codigoProduto || "").trim()) e.push(`${n}: informe o código do produto.`);
      });
      break;
    case "LIMITES":
      (c.linhas || []).forEach((l, i) => {
        const n = `Limite ${i + 1}${l.destino ? ` (${l.destino})` : ""}`;
        if (!String(l.destino || "").trim()) e.push(`${n}: informe o destino.`);
        if (!String(l.campo || "").trim()) e.push(`${n}: informe o campo do destino.`);
        if (lerLimite(l.limite).invalido) e.push(`${n}: o limite é um número inteiro de caracteres (ou vazio, se ainda não confirmado).`);
      });
      break;
    case "FISCAL":
      if ((c.excecoesNcm || []).some((x) => !String(x.alvo || "").trim() || !String(x.justificativa || "").trim())) e.push("Cada exceção de NCM precisa do item ou grupo e da justificativa.");
      if (c.validarCClassTrib && !(c.cenarios || []).length) e.push("Escolha ao menos um cenário para validar o cClassTrib.");
      break;
    default:
  }
  return e;
}

/** Conteúdo pronto para enviar: números lidos, campos vazios limpos, regras fixas do contrato garantidas. */
export function normalizarConteudo(c) {
  switch (c.aspecto) {
    case "NOMES":
      return {
        ...c, obrigatorios: (c.obrigatorios || []).filter((o) => (c.componentes || []).includes(o)),
        abreviacoes: (c.abreviacoes || []).map((a) => ({ completa: String(a.completa).trim(), abreviacao: String(a.abreviacao).trim() })),
        termosProibidos: (c.termosProibidos || []).map((t) => ({ termo: String(t.termo).trim(), substituicao: String(t.substituicao ?? "").trim() || null })),
      };
    case "ATRIBUTOS":
      return { ...c, atributos: (c.atributos || []).map((a) => ({ atributo: String(a.atributo).trim(), onde: a.onde, campo: a.onde === "DESCRICAO" ? null : String(a.campo || "").trim() || null, aplicabilidade: a.aplicabilidade, condicao: a.aplicabilidade === "QUANDO_APLICAVEL" ? String(a.condicao || "").trim() || null : null })) };
    case "UNIDADES":
      return {
        ...c, unidadeDefinida: c.criterioEstoque === "DEFINIDA" ? String(c.unidadeDefinida || "").trim().toUpperCase() || null : null, conversaoDesconhecida: "PENDENCIA",
        conversoes: (c.conversoes || []).map((v) => ({ origem: String(v.origem).trim().toUpperCase(), destino: String(v.destino).trim().toUpperCase(), fator: lerFator(v.fator), abrangencia: v.abrangencia, codigoProduto: v.abrangencia === "PRODUTO" ? String(v.codigoProduto || "").trim() || null : null })),
      };
    case "LIMITES":
      return {
        ...c, linhas: (c.linhas || []).map((l) => {
          const limite = typeof l.limite === "number" ? l.limite : lerLimite(l.limite).valor;
          return { ...l, destino: String(l.destino).trim(), campo: String(l.campo).trim(), limite, confirmado: limite !== null && !!l.confirmado, referencia: String(l.referencia || "").trim() || null, url: String(l.url || "").trim() || null };
        }),
      };
    case "FISCAL":
      return { ...c, ausente: "PENDENCIA", ambiguo: "REVISAO_FISCAL", excecoesNcm: (c.excecoesNcm || []).map((x) => ({ alvo: String(x.alvo).trim(), justificativa: String(x.justificativa).trim() })) };
    default:
      return c;
  }
}

/** Conteúdo vindo do servidor → forma da tela (fator como texto com vírgula, limite como texto). */
export function conteudoParaTela(aspecto, conteudo) {
  const c = conteudoCompleto(aspecto, conteudo);
  if (aspecto === "UNIDADES") return { ...c, conversoes: (c.conversoes || []).map((v) => ({ ...novaConversao(), ...v, fator: fatorNaTela(v.fator), codigoProduto: v.codigoProduto ?? "" })) };
  if (aspecto === "LIMITES") return { ...c, linhas: (c.linhas || []).map((l) => ({ ...novaLinhaLimite(), ...l, limite: l.limite == null ? "" : String(l.limite), referencia: l.referencia ?? "", url: l.url ?? "" })) };
  if (aspecto === "ATRIBUTOS") return { ...c, atributos: (c.atributos || []).map((a) => ({ ...novoAtributo(), ...a, campo: a.campo ?? "", condicao: a.condicao ?? "" })) };
  return c;
}

// ── Prévia antes de aplicar, conflitos ───────────────────────────────────────

/** Texto da prévia de "Aplicar e reanalisar". */
export function resumoPrevia(p) {
  if (!p) return null;
  const grupos = Array.isArray(p.grupos) ? p.grupos : [];
  const itens = Number(p.itens || 0);
  const fmt = (n) => Number(n).toLocaleString("pt-BR");
  return {
    grupos,
    itens,
    camadas: (p.camadas || []).map(rotuloCamada),
    sobreposicoes: Array.isArray(p.sobreposicoes) ? p.sobreposicoes : [],
    texto: `${fmt(itens)} ${itens === 1 ? "item" : "itens"} de ${fmt(grupos.length)} ${grupos.length === 1 ? "grupo" : "grupos"} ${itens === 1 ? "será analisado" : "serão analisados"} de novo.`,
    textoFeito: `${fmt(itens)} ${itens === 1 ? "item" : "itens"} de ${fmt(grupos.length)} ${grupos.length === 1 ? "grupo" : "grupos"} ${itens === 1 ? "foi analisado" : "foram analisados"} de novo.`,
  };
}

/** 409 de sobreposição ao aplicar (o servidor pede confirmar a transferência). Conflito de versão é outra coisa. */
export const ehSobreposicao = (err) => err?.status === 409 && !ehConflitoVersao(err) && /SOBREPOS|TRANSFER/i.test(String(codigoDoErro(err) || ""));

/** Mensagem de erro das diretrizes: conflito de versão recarrega; o resto, a mensagem do servidor. */
export function mensagemDiretriz(err) {
  if (ehConflitoVersao(err)) return "Outra pessoa alterou esta regra depois que você a abriu. Recarregamos a regra e mantivemos o que você digitou: confira e salve de novo.";
  if (ehSobreposicao(err)) return "Há grupos cobertos por outra regra do mesmo aspecto. Confira a prévia e confirme a transferência.";
  if (err?.status === 403) return "Seu acesso não permite esta alteração. Peça ao administrador.";
  return mensagemDeErro(err);
}

/**
 * "Aplicar e reanalisar": SEMPRE busca a prévia e só aplica depois que a pessoa confirma o que viu.
 * `confirmar(previa)` devolve { ok, confirmarTransferencia } (ou false). Devolve { aplicado, previa, resultado }.
 * Sobreposição sem a confirmação da transferência não é enviada.
 */
export async function aplicarComPrevia({ buscarPrevia, confirmar, aplicar }) {
  const previa = await buscarPrevia();
  const resposta = await confirmar(previa);
  if (!resposta || !resposta.ok) return { aplicado: false, previa };
  const sobrepoe = (previa?.sobreposicoes || []).length > 0;
  if (sobrepoe && !resposta.confirmarTransferencia) return { aplicado: false, previa, motivo: "Confirme a transferência dos grupos antes de aplicar." };
  const resultado = await aplicar(sobrepoe ? { confirmarTransferencia: true } : {});
  return { aplicado: true, previa, resultado };
}

/** Atualização da biblioteca para a regra (aviso "regra atualizada na biblioteca"). */
export const atualizacaoDa = (regra, atualizacoes) => (atualizacoes || []).find((a) => a.regraId === regra.id) || null;

// ── Transformar em regra (a partir de um caso) ───────────────────────────────

const ASPECTO_DA_CAMADA = { NOMES_UNIDADES: "NOMES", QUALIDADE: "ATRIBUTOS", NCM: "FISCAL", TRIBUTARIO: "FISCAL" };
/** Formulário de "Transformar em regra" pré-preenchido pelo caso. Unidade/fator no caso → aspecto Unidades. */
export function inicialDoCaso(caso, gruposDoCaso) {
  const temUnidade = Object.keys(caso?.proposta || {}).some((k) => /unidade|fator/i.test(k));
  const aspecto = caso?.camada === "NOMES_UNIDADES" && temUnidade ? "UNIDADES" : ASPECTO_DA_CAMADA[caso?.camada] || "NOMES";
  const grupos = [...new Set((gruposDoCaso?.grupos || []).map((g) => g.grupo).filter(Boolean))];
  return { aspecto, nome: String(caso?.problema || "").slice(0, 120), todos: grupos.length === 0, grupos, destino: "PROJETO" };
}

// ── Histórico ────────────────────────────────────────────────────────────────

export const ACOES_HISTORICO = { CRIOU: "Criou", ALTEROU: "Alterou", APLICOU: "Aplicou e reanalisou", APROVOU: "Aprovou", ADOTOU: "Adotou versão da biblioteca", TRANSFERIU: "Transferiu grupos", CARGA: "Carga inicial" };
/** Linhas do histórico (lista ou { linhas }), com quem, quando, ação e o que mudou (antes → depois) em texto curto. */
export function lerHistorico(dados) {
  const lista = Array.isArray(dados) ? dados : Array.isArray(dados?.linhas) ? dados.linhas : Array.isArray(dados?.historico) ? dados.historico : [];
  return lista.map((h, i) => ({
    id: h.id ?? `${i}`,
    quando: h.createdAt ?? h.em ?? h.quando ?? null,
    quem: h.usuario ?? h.por ?? h.quem ?? "",
    acao: ACOES_HISTORICO[h.acao] || h.acao || "",
    versao: h.versao ?? null,
    mudou: h.resumo || diferencasRegra(h.antes, h.depois),
  }));
}
const curto = (v) => {
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? `${v.length} ${v.length === 1 ? "linha" : "linhas"}` : "nenhum";
  if (typeof v === "object") return ehTodos(v) && "todos" in v ? "Todos os grupos" : "grupos" in v ? textoAbrangencia(v) : "alterado";
  const s = String(SITUACAO_REGRA[v] || ROTULO_ASPECTO[v] || v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
};
const ROTULO_CAMPO_REGRA = {
  nome: "Nome", abrangencia: "Grupos", observacao: "Observação", situacao: "Situação", alteracoes: "Conteúdo", conteudo: "Conteúdo", bibliotecaVersao: "Versão da biblioteca",
  indicadaPara: "Indicada para", ativa: "Ativa", componentes: "Componentes", obrigatorios: "Obrigatórios", separador: "Separador", capitalizacao: "Maiúsculas",
  abreviacoes: "Abreviações", termosProibidos: "Termos proibidos", atributos: "Atributos", conversoes: "Conversões", linhas: "Limites", excecoesNcm: "Exceções de NCM", cenarios: "Cenários",
};
export function diferencasRegra(antes, depois) {
  if (!antes && depois) return "Criada";
  if (!antes || !depois) return "—";
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter((k) => !["versao", "updatedAt", "createdAt", "id"].includes(k) && !igual(antes[k], depois[k]));
  return campos.map((k) => `${ROTULO_CAMPO_REGRA[k] || k}: ${curto(antes[k])} → ${curto(depois[k])}`).join("; ") || "Sem mudança";
}

// ── Política (PDF) ───────────────────────────────────────────────────────────

export function enderecoDaPolitica(projetoId, versaoId) {
  const base = `/saneamento-estoques/projetos/${projetoId}/politica/pdf`;
  return versaoId ? `${base}?versaoId=${encodeURIComponent(versaoId)}` : base;
}
export const nomeDaPolitica = (versao) => (versao ? `politica-de-cadastro-e-estoques-versao-${versao.numero}.pdf` : "politica-de-cadastro-e-estoques.pdf");
