/**
 * Parser XML seguro para NF-e/NFC-e — usa @xmldom/xmldom.
 * Localização SEMPRE por element.localName (nunca indexOf/substring/regex).
 * Bloqueia DTD e entidades externas.
 */
import { DOMParser } from "npm:@xmldom/xmldom@0.9.3";

const MAX_TAMANHO_XML = 2 * 1024 * 1024; // 2 MB
const MAX_PROFUNDIDADE = 50;
const MAX_ITENS = 500;

export function parseXml(content) {
  if (!content || content.length > MAX_TAMANHO_XML) {
    throw new Error("XML vazio ou excede o tamanho máximo permitido.");
  }
  const parser = new DOMParser({
    errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} },
    resolveExternals: false,
  });
  const doc = parser.parseFromString(content, "application/xml");
  if (!doc) throw new Error("Falha ao parsear XML.");
  return doc;
}

/** Busca o primeiro elemento filho por localName (case-insensitive). */
export function getFirst(parent, localName) {
  if (!parent) return null;
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const n = children[i];
    if (n.nodeType === 1 && n.localName && n.localName.toLowerCase() === localName.toLowerCase()) {
      return n;
    }
  }
  return null;
}

/** Busca todos os elementos filhos por localName. */
export function getAll(parent, localName) {
  const result = [];
  if (!parent) return result;
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const n = children[i];
    if (n.nodeType === 1 && n.localName && n.localName.toLowerCase() === localName.toLowerCase()) {
      result.push(n);
    }
  }
  return result;
}

/** Texto de um elemento filho (trim). */
export function getText(parent, localName) {
  const el = getFirst(parent, localName);
  if (!el) return "";
  return (el.textContent || "").trim();
}

/**
 * Busca o primeiro elemento recursivamente por localName (case-insensitive).
 * Percorre toda a subárvore — necessário para grupos aninhados da NF-e
 * (ex: PIS > PISAliq > pPIS, ICMS > ICMS00 > pICMS).
 */
export function getFirstDeep(parent, localName, maxDepth = MAX_PROFUNDIDADE) {
  if (!parent || maxDepth <= 0) return null;
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const n = children[i];
    if (n.nodeType === 1) {
      if (n.localName && n.localName.toLowerCase() === localName.toLowerCase()) {
        return n;
      }
      const found = getFirstDeep(n, localName, maxDepth - 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Texto de um elemento buscado recursivamente (trim).
 * Percorre toda a subárvore do parent até encontrar localName.
 */
export function getTextDeep(parent, localName, maxDepth = MAX_PROFUNDIDADE) {
  const el = getFirstDeep(parent, localName, maxDepth);
  if (!el) return "";
  return (el.textContent || "").trim();
}

/** Atributo de um elemento (case-insensitive localName). */
export function getAttr(el, attrName) {
  if (!el) return "";
  // Procura case-insensitive.
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    if (a.name && a.name.toLowerCase() === attrName.toLowerCase()) return a.value;
  }
  return "";
}

/** Identifica o tipo de XML pela raiz. */
export function identificarTipoXml(doc) {
  const root = doc.documentElement;
  if (!root) return "XML_DESCONHECIDO";
  const name = (root.localName || root.nodeName || "").toLowerCase();
  if (name === "nfeproc") return "NFE_PROC";
  if (name === "nfe") return "NFE";
  if (name === "proceventonfe" || name === "evento") {
    const tp = buscarRecursivo(root, "tpEvento");
    if (tp === "110111") return "EVENTO_CANCELAMENTO";
    if (tp === "110110") return "EVENTO_CARTA_CORRECAO";
    return "EVENTO_OUTRO";
  }
  return "XML_DESCONHECIDO";
}

function buscarRecursivo(parent, localName, maxDepth = MAX_PROFUNDIDADE) {
  if (!parent || maxDepth <= 0) return "";
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const n = children[i];
    if (n.nodeType === 1) {
      if (n.localName && n.localName.toLowerCase() === localName.toLowerCase()) {
        return (n.textContent || "").trim();
      }
      const found = buscarRecursivo(n, localName, maxDepth - 1);
      if (found) return found;
    }
  }
  return "";
}

export { MAX_ITENS, MAX_TAMANHO_XML };