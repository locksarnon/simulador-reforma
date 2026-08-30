/**
 * Parser XML seguro para NF-e/NFC-e — usa @xmldom/xmldom.
 * Localização SEMPRE por element.localName (nunca indexOf/substring/regex).
 * Bloqueia DTD e entidades externas.
 *
 * Porte direto de base44/shared/xmlParser.js — única mudança é o import do
 * xmldom (era `npm:@xmldom/xmldom@0.9.3`, especificador estilo Deno, usado
 * pelo runtime de edge functions do Base44; aqui é um import Node normal).
 */
import { DOMParser } from '@xmldom/xmldom';

const MAX_TAMANHO_XML = 2 * 1024 * 1024; // 2 MB
const MAX_PROFUNDIDADE = 50;
export const MAX_ITENS = 500;
export { MAX_TAMANHO_XML };

export function parseXml(content: string): Document {
  if (!content || content.length > MAX_TAMANHO_XML) {
    throw new Error('XML vazio ou excede o tamanho máximo permitido.');
  }
  const parser = new DOMParser({
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onError: () => {},
  });
  const doc = parser.parseFromString(content, 'application/xml');
  if (!doc) throw new Error('Falha ao parsear XML.');
  return doc as unknown as Document;
}

/** Busca o primeiro elemento filho por localName (case-insensitive). */
export function getFirst(parent: any, localName: string): any {
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
export function getAll(parent: any, localName: string): any[] {
  const result: any[] = [];
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
export function getText(parent: any, localName: string): string {
  const el = getFirst(parent, localName);
  if (!el) return '';
  return (el.textContent || '').trim();
}

/**
 * Busca o primeiro elemento recursivamente por localName (case-insensitive).
 * Percorre toda a subárvore — necessário para grupos aninhados da NF-e
 * (ex: PIS > PISAliq > pPIS, ICMS > ICMS00 > pICMS).
 */
export function getFirstDeep(parent: any, localName: string, maxDepth = MAX_PROFUNDIDADE): any {
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
export function getTextDeep(parent: any, localName: string, maxDepth = MAX_PROFUNDIDADE): string {
  const el = getFirstDeep(parent, localName, maxDepth);
  if (!el) return '';
  return (el.textContent || '').trim();
}

/** Atributo de um elemento (case-insensitive localName). */
export function getAttr(el: any, attrName: string): string {
  if (!el) return '';
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    if (a.name && a.name.toLowerCase() === attrName.toLowerCase()) return a.value;
  }
  return '';
}

/**
 * Identifica o tipo de XML pela raiz. CT-e/MDF-e/NFS-e são reconhecidos
 * (não caem em XML_DESCONHECIDO) mas não têm extração de item/tributo —
 * ver comentário do enum TipoXml no schema.prisma sobre por quê.
 */
export function identificarTipoXml(doc: any): string {
  const root = doc.documentElement;
  if (!root) return 'XML_DESCONHECIDO';
  const name = (root.localName || root.nodeName || '').toLowerCase();
  if (name === 'nfeproc') return 'NFE_PROC';
  if (name === 'nfe') return 'NFE';
  if (name === 'proceventonfe' || name === 'evento') {
    const tp = buscarRecursivo(root, 'tpEvento');
    if (tp === '110111') return 'EVENTO_CANCELAMENTO';
    if (tp === '110110') return 'EVENTO_CARTA_CORRECAO';
    return 'EVENTO_OUTRO';
  }
  if (name === 'cteproc' || name === 'cte') return 'CTE';
  if (name === 'mdfeproc' || name === 'mdfe') return 'MDFE';
  // NFS-e nacional (padrão mais recente, unificado); layouts municipais
  // legados (ABRASF e variações próprias de cada prefeitura) não têm um
  // nome de raiz único e não são cobertos aqui.
  if (name === 'nfse') return 'NFSE';
  return 'XML_DESCONHECIDO';
}

function buscarRecursivo(parent: any, localName: string, maxDepth = MAX_PROFUNDIDADE): string {
  if (!parent || maxDepth <= 0) return '';
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const n = children[i];
    if (n.nodeType === 1) {
      if (n.localName && n.localName.toLowerCase() === localName.toLowerCase()) {
        return (n.textContent || '').trim();
      }
      const found = buscarRecursivo(n, localName, maxDepth - 1);
      if (found) return found;
    }
  }
  return '';
}
