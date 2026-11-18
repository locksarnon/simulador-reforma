/**
 * Leitura do grupo IBS/CBS de cada item da NF-e (modelo 55) e da NFC-e (65), com os valores que compõem a base de cálculo
 * (LC 214/2025, art. 12) — o que a conferência com a calculadora oficial precisa. Lógica pura sobre o texto do XML.
 */
import { getAll, getAttr, getFirst, getFirstDeep, getText, parseXml } from '../importacao-xml/shared/xml-parser';

const n = (s: string) => (s === '' ? 0 : Number(s));
const opt = (s: string) => (s === '' ? null : Number(s));

export type GrupoTributo = { aliquota: number | null; valor: number | null; pRedAliq: number | null; pAliqEfet: number | null; pDif: number | null; vDif: number | null };
export type ItemIbsCbs = {
  numero: number; ncm: string; cfop: string; descricao: string;
  componentes: { vProd: number; vFrete: number; vSeg: number; vOutro: number; vDesc: number; vII: number; vIS: number; vPIS: number; vCOFINS: number; vICMS: number; vICMSUFDest: number; vFCP: number; vFCPUFDest: number; vICMSMono: number; vISSQN: number };
  temImpostoSeletivo: boolean;
  ibscbs: null | {
    cst: string; cClassTrib: string; vBC: number | null; vIBS: number | null;
    uf: GrupoTributo | null; mun: GrupoTributo | null; cbs: GrupoTributo | null;
    tribRegular: { cst: string; cClassTrib: string } | null;
  };
};
export type NotaIbsCbs = { chave: string; modelo: string; dataEmissao: string; ambiente: string; municipio: string; emitente: string; tipoNf: string; itens: ItemIbsCbs[] };

function grupo(el: unknown, sufixo: 'IBSUF' | 'IBSMun' | 'CBS'): GrupoTributo | null {
  if (!el) return null;
  const red = getFirst(el, 'gRed');
  const dif = getFirst(el, 'gDif');
  return {
    aliquota: opt(getText(el, `p${sufixo}`)), valor: opt(getText(el, `v${sufixo}`)),
    pRedAliq: red ? opt(getText(red, 'pRedAliq')) : null, pAliqEfet: red ? opt(getText(red, 'pAliqEfet')) : null,
    pDif: dif ? opt(getText(dif, 'pDif')) : null, vDif: dif ? opt(getText(dif, 'vDif')) : null,
  };
}

/** Soma o valor de uma tag em qualquer subgrupo (ex.: vICMS dentro de ICMS00, ICMS20…). */
function somaEmFilhos(pai: unknown, tag: string): number {
  if (!pai) return 0;
  let t = 0;
  const filhos = (pai as { childNodes?: ArrayLike<unknown> }).childNodes ?? [];
  for (let i = 0; i < filhos.length; i++) {
    const f = filhos[i] as { nodeType?: number };
    if (f?.nodeType === 1) t += n(getText(f, tag));
  }
  return t;
}

export function lerNotaIbsCbs(xml: string): NotaIbsCbs {
  const doc = parseXml(xml);
  const raiz: any = doc.documentElement;
  const nome = String(raiz?.localName ?? '').toLowerCase();
  const nfe = nome === 'nfeproc' ? getFirst(raiz, 'NFe') : nome === 'nfe' ? raiz : null;
  const inf = nfe ? getFirst(nfe, 'infNFe') : null;
  if (!inf) throw new Error('O XML não é uma NF-e nem uma NFC-e.');
  const ide = getFirst(inf, 'ide');
  const emit = getFirst(inf, 'emit');
  const prot = nome === 'nfeproc' ? getFirstDeep(raiz, 'infProt') : null;
  const chave = getAttr(inf, 'Id').replace(/^NFe/i, '') || getText(prot, 'chNFe');
  const itens: ItemIbsCbs[] = getAll(inf, 'det').map((det: unknown) => {
    const prod = getFirst(det, 'prod');
    const imp = getFirst(det, 'imposto');
    const icms = getFirst(imp, 'ICMS');
    const icmsDest = getFirst(imp, 'ICMSUFDest');
    const g = getFirst(imp, 'IBSCBS');
    const gv = g ? getFirst(g, 'gIBSCBS') : null;
    const reg = gv ? getFirst(gv, 'gTribRegular') : null;
    return {
      numero: Number(getAttr(det, 'nItem')),
      ncm: getText(prod, 'NCM'), cfop: getText(prod, 'CFOP'), descricao: getText(prod, 'xProd'),
      componentes: {
        vProd: n(getText(prod, 'vProd')), vFrete: n(getText(prod, 'vFrete')), vSeg: n(getText(prod, 'vSeg')), vOutro: n(getText(prod, 'vOutro')), vDesc: n(getText(prod, 'vDesc')),
        vII: n(getText(getFirst(imp, 'II'), 'vII')), vIS: n(getText(getFirst(imp, 'IS'), 'vIS')),
        vPIS: somaEmFilhos(getFirst(imp, 'PIS'), 'vPIS'), vCOFINS: somaEmFilhos(getFirst(imp, 'COFINS'), 'vCOFINS'),
        vICMS: somaEmFilhos(icms, 'vICMS'), vFCP: somaEmFilhos(icms, 'vFCP'), vICMSMono: somaEmFilhos(icms, 'vICMSMono'),
        vICMSUFDest: n(getText(icmsDest, 'vICMSUFDest')), vFCPUFDest: n(getText(icmsDest, 'vFCPUFDest')),
        vISSQN: n(getText(getFirst(imp, 'ISSQN'), 'vISSQN')),
      },
      temImpostoSeletivo: !!getFirst(imp, 'IS'),
      ibscbs: g ? {
        cst: getText(g, 'CST'), cClassTrib: getText(g, 'cClassTrib'),
        vBC: gv ? opt(getText(gv, 'vBC')) : null, vIBS: gv ? opt(getText(gv, 'vIBS')) : null,
        uf: grupo(gv ? getFirst(gv, 'gIBSUF') : null, 'IBSUF'), mun: grupo(gv ? getFirst(gv, 'gIBSMun') : null, 'IBSMun'), cbs: grupo(gv ? getFirst(gv, 'gCBS') : null, 'CBS'),
        tribRegular: reg ? { cst: getText(reg, 'CSTReg'), cClassTrib: getText(reg, 'cClassTribReg') } : null,
      } : null,
    };
  });
  return {
    chave, modelo: getText(ide, 'mod'), dataEmissao: getText(ide, 'dhEmi') || getText(ide, 'dEmi'), ambiente: getText(ide, 'tpAmb'),
    municipio: getText(ide, 'cMunFG'), emitente: getText(emit, 'CNPJ') || getText(emit, 'CPF'), tipoNf: getText(ide, 'tpNF'), itens,
  };
}
