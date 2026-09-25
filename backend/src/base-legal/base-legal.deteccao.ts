/** Detecção de normas citadas em textos do Radar e regras de segurança das URLs (funções puras). */

export type NormaCitada = { referencia: string; tipo: string; rotulo: string };

const ABREV: [RegExp, string, string][] = [
  [/^(lei complementar|lc)$/i, 'LC', 'Lei Complementar'],
  [/^(emenda constitucional|ec)$/i, 'EC', 'Emenda Constitucional'],
  [/^decreto$/i, 'Decreto', 'Decreto'],
  [/^resolu[çc][ãa]o cgibs$/i, 'Resolução CGIBS', 'Resolução CGIBS'],
  [/^portaria conjunta(?: mf\/cgibs)?$/i, 'Portaria Conjunta MF/CGIBS', 'Portaria Conjunta'],
  [/^ato conjunto(?: rfb\/cgibs)?$/i, 'Ato Conjunto RFB/CGIBS', 'Ato Conjunto'],
  [/^ato t[ée]cnico conjunto(?: rfb\/cgibs)?$/i, 'Ato Técnico Conjunto RFB/CGIBS', 'Ato Técnico Conjunto'],
  [/^lei$/i, 'Lei', 'Lei'],
];

const RE_CITACAO =
  /\b(Lei Complementar|LC|Emenda Constitucional|EC|Decreto|Resolu[çc][ãa]o CGIBS|Portaria Conjunta(?: MF\/CGIBS)?|Ato Conjunto(?: RFB\/CGIBS)?|Ato T[ée]cnico Conjunto(?: RFB\/CGIBS)?|Lei)\s*(?:n[ºo°]\.?\s*)?(\d{1,3}(?:\.\d{3})?)\s*\/\s*(\d{4})\b/gi;

/** "Lei Complementar nº 235/2026" → { referencia: "lc 235/2026", rotulo: "LC 235/2026" }. */
export function normasCitadas(texto: string): NormaCitada[] {
  const achadas = new Map<string, NormaCitada>();
  for (const m of texto.matchAll(RE_CITACAO)) {
    const abrev = ABREV.find(([re]) => re.test(m[1].trim()));
    if (!abrev) continue;
    const numero = m[2].replace(/\./g, '');
    const rotulo = `${abrev[1]} ${numero}/${m[3]}`;
    const referencia = rotulo.toLowerCase();
    if (!achadas.has(referencia)) achadas.set(referencia, { referencia, tipo: abrev[2], rotulo });
  }
  return [...achadas.values()];
}

/** Mesma normalização para o "numero" cadastrado na base (ex.: "Decreto 12.955/2026"). */
export function referenciaDe(numero: string): string {
  return normasCitadas(numero)[0]?.referencia ?? numero.trim().toLowerCase();
}

export function chaveDe(referencia: string): string {
  return referencia.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const HOSTS_OFICIAIS = ['planalto.gov.br', 'www.planalto.gov.br', 'cgibs.gov.br', 'www.cgibs.gov.br', 'gov.br', 'www.gov.br'];

/** Só aceitamos baixar texto de sites oficiais, por https (evita usar o servidor para acessar endereços arbitrários). */
export function urlOficialValida(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && (u.port === '' || u.port === '443') && HOSTS_OFICIAIS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}
