// Identidade estável do item. O número da linha da planilha muda a cada nova extração; o código do ERP não. Por isso as decisões, as tarefas de execução e a revisão
// fiscal são guardadas pelo CÓDIGO do item, sempre como TEXTO (zeros à esquerda e códigos alfanuméricos não podem virar número). Dentro do projeto o item é
// identificado por ERP + instância + empresa + código: a origem (ERP, instância e empresa) é declarada uma vez no projeto e vale para todos os códigos. Funções puras.

/** Código do item como texto, sem espaços nas pontas (a identidade do item dentro da origem do projeto). */
export const idItem = (it) => String(it?.codigo ?? "").trim();

/** Chave de uma decisão ou tarefa do item: "código|critério". O código pode ter "|": o critério é sempre o que vem depois da ÚLTIMA barra. */
export const chaveDe = (it, crit) => `${idItem(it)}|${crit}`;
export const chaveDeId = (id, crit) => `${id}|${crit}`;
export function partirChave(k) {
  const s = String(k ?? ""); const i = s.lastIndexOf("|");
  return i < 0 ? { id: s, crit: "" } : { id: s.slice(0, i), crit: s.slice(i + 1) };
}

const cache = new WeakMap();
/**
 * Índice dos itens da base (calculado uma vez por lista de itens): por código (`porId`), por linha (`porLinha`), os códigos que se repetem (`repetidos`) e quantos
 * itens não têm código (`semCodigo`). Código repetido ou ausente não identifica o item: não serve de âncora para decisão.
 */
export function indexar(itens) {
  const lista = itens || [];
  let x = cache.get(lista); if (x) return x;
  const porId = new Map(); const porLinha = new Map(); const repetidos = new Set(); let semCodigo = 0;
  for (const it of lista) {
    porLinha.set(it.linha, it);
    const id = idItem(it);
    if (!id) { semCodigo += 1; continue; }
    if (porId.has(id)) repetidos.add(id); else porId.set(id, it);
  }
  x = { porId, porLinha, repetidos, semCodigo };
  cache.set(lista, x);
  return x;
}

/** O item tem código e ele não se repete na base: pode receber decisão. */
export const identificavel = (it, indice) => { const id = idItem(it); return !!id && !indice.repetidos.has(id); };

/** O item de um código, ou null se não existe na base ou se o código se repete (não dá para dizer de qual item é a decisão). */
export const itemPorId = (indice, id) => (indice.repetidos.has(id) ? null : indice.porId.get(id) ?? null);

/** Por que o item não pode receber decisão ("" quando pode). */
export const motivoSemIdentidade = (it, indice) => (!idItem(it) ? "Item sem código no ERP: não dá para identificá-lo de forma estável" : indice.repetidos.has(idItem(it)) ? `O código ${idItem(it)} aparece mais de uma vez na base: não dá para saber de qual item é a decisão` : "");

/** Origem dos dados do projeto: ERP + instância + empresa (texto livre, preenchido pelo analista). Completa quando os três estão preenchidos. */
export const origemCompleta = (o) => !!(String(o?.erp ?? "").trim() && String(o?.instancia ?? "").trim() && String(o?.empresa ?? "").trim());
export const textoOrigem = (o) => (origemCompleta(o) ? `${String(o.erp).trim()} · ${String(o.instancia).trim()} · ${String(o.empresa).trim()}` : "origem não declarada");

/** Versão do formato das chaves guardadas no projeto: 1 = pelo número da linha (projetos antigos), 2 = pelo código do item. */
export const VERSAO_CHAVES = 2;

/** Há decisão, confirmação de execução ou decisão fiscal guardada (no formato antigo, quando o projeto ainda não tem a versão)? */
export const temDadosPorChave = (e) => Object.keys(e?.decisoes || {}).length > 0 || Object.keys(e?.execucao?.registros || {}).length > 0 || Object.keys(e?.fiscal?.decisoes || {}).length > 0;

/** Versão das chaves do projeto salvo: a gravada ou, se não há, a 1 quando já existe dado por chave (projeto antigo) e a 2 quando o projeto ainda não guardou nada. */
export const versaoDasChaves = (e) => e?.versaoChaves ?? (temDadosPorChave(e) ? 1 : VERSAO_CHAVES);

/** O projeto guarda decisões pela linha da planilha e precisa migrar antes de seguir. */
export const precisaMigrar = (e) => versaoDasChaves(e) < VERSAO_CHAVES;

/** Cópia do estado sem o que está guardado pelo formato antigo: as chaves antigas (número da linha) nunca podem ser lidas como código de item. */
export function semChavesAntigas(e) {
  return { ...e, decisoes: {}, execucao: { ...(e?.execucao || {}), registros: {} }, fiscal: { ...(e?.fiscal || {}), decisoes: {} } };
}
