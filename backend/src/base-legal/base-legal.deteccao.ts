/** Detecção de normas citadas em textos do Radar e regras de segurança das URLs (funções puras). */

export type NormaCitada = { referencia: string; tipo: string; rotulo: string };

const ABREV: [RegExp, string, string][] = [
  [/^(lei complementar|lc)$/i, 'LC', 'Lei Complementar'],
  [/^(emenda constitucional|ec)$/i, 'EC', 'Emenda Constitucional'],
  [/^decreto[- ]lei$/i, 'Decreto-Lei', 'Decreto-Lei'],
  [/^decreto$/i, 'Decreto', 'Decreto'],
  [/^(medida provis[óo]ria|mp)$/i, 'MP', 'Medida Provisória'],
  [/^resolu[çc][ãa]o cgibs$/i, 'Resolução CGIBS', 'Resolução CGIBS'],
  [/^resolu[çc][ãa]o cgsn$/i, 'Resolução CGSN', 'Resolução CGSN'],
  [/^portaria conjunta(?: mf\/cgibs)?$/i, 'Portaria Conjunta MF/CGIBS', 'Portaria Conjunta'],
  [/^ato conjunto(?: rfb\/cgibs)?$/i, 'Ato Conjunto RFB/CGIBS', 'Ato Conjunto'],
  [/^ato t[ée]cnico conjunto(?: rfb\/cgibs)?$/i, 'Ato Técnico Conjunto RFB/CGIBS', 'Ato Técnico Conjunto'],
  [/^conv[êe]nio icms$/i, 'Convênio ICMS', 'Convênio ICMS'],
  [/^ajuste sinief$/i, 'Ajuste SINIEF', 'Ajuste SINIEF'],
  [/^lei$/i, 'Lei', 'Lei'],
];

/** Como "IN RFB" e "IN SRF" são normas diferentes, o órgão entra no rótulo quando a citação o traz (não se presume o órgão). */
function tipoDaCitacao(grupo: string): { abrev: string; tipo: string } | null {
  const s = grupo.replace(/\s+/g, ' ').trim();
  const em = /^(?:instru[çc][ãa]o normativa|in)(?: (rfb|srf|srf\/rfb))?$/i.exec(s);
  if (em) return { abrev: `IN${em[1] ? ` ${em[1].toUpperCase()}` : ''}`, tipo: 'Instrução Normativa' };
  const pm = /^portaria (mf|rfb|me|pgfn)$/i.exec(s);
  if (pm) return { abrev: `Portaria ${pm[1].toUpperCase()}`, tipo: 'Portaria' };
  const achado = ABREV.find(([re]) => re.test(s));
  return achado ? { abrev: achado[1], tipo: achado[2] } : null;
}

const RE_CITACAO =
  /\b(Lei Complementar|LC|Emenda Constitucional|EC|Decreto[- ]Lei|Decreto|Medida Provis[óo]ria|MP|Resolu[çc][ãa]o CGIBS|Resolu[çc][ãa]o CGSN|Portaria Conjunta(?: MF\/CGIBS)?|Portaria (?:MF|RFB|ME|PGFN)|Ato Conjunto(?: RFB\/CGIBS)?|Ato T[ée]cnico Conjunto(?: RFB\/CGIBS)?|Instru[çc][ãa]o Normativa(?: (?:RFB|SRF|SRF\/RFB))?|IN(?: (?:RFB|SRF))?|Conv[êe]nio ICMS|Ajuste SINIEF|Lei)\s*(?:n[ºo°]\.?\s*)?(\d{1,3}(?:\.\d{3})?)\s*\/\s*(\d{4})\b/gi;

/** "Lei Complementar nº 235/2026" → { referencia: "lc 235/2026", rotulo: "LC 235/2026" }. */
export function normasCitadas(texto: string): NormaCitada[] {
  const achadas = new Map<string, NormaCitada>();
  for (const m of texto.matchAll(RE_CITACAO)) {
    const abrev = tipoDaCitacao(m[1]);
    if (!abrev) continue;
    const numero = m[2].replace(/\./g, '');
    const rotulo = `${abrev.abrev} ${numero}/${m[3]}`;
    const referencia = rotulo.toLowerCase();
    if (!achadas.has(referencia)) achadas.set(referencia, { referencia, tipo: abrev.tipo, rotulo });
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

/** Sufixos de domínio de fonte oficial: governo (.gov.br), tribunais (.jus.br) e Legislativo (.leg.br). */
const SUFIXOS_OFICIAIS = ['.gov.br', '.jus.br', '.leg.br'];

/** O endereço é de órgão oficial (o próprio .gov.br, ou subdomínio dele, como normas.receita.fazenda.gov.br)? */
export function dominioOficial(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h || /^\d+(\.\d+){3}$/.test(h) || h.includes(':') || h === 'localhost') return false;
  return h === 'gov.br' || SUFIXOS_OFICIAIS.some((s) => h.endsWith(s));
}

/**
 * Só baixamos texto de sites oficiais, por https, sem usuário e sem porta diferente (evita usar o servidor para acessar endereços
 * arbitrários). Vale para qualquer subdomínio de .gov.br, .jus.br e .leg.br (Planalto, CGIBS, Receita, Confaz, SEFAZ, STF, STJ...).
 */
export function urlOficialValida(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && (u.port === '' || u.port === '443') && dominioOficial(u.hostname);
  } catch {
    return false;
  }
}

const PLANALTO = 'https://www.planalto.gov.br/ccivil_03';
const PERIODOS: [number, number][] = [[2007, 2010], [2011, 2014], [2015, 2018], [2019, 2022], [2023, 2026], [2027, 2030]];

/**
 * Endereço provável da página do Planalto para um ato citado ("lc 239/2026", "lei 15270/2025", "decreto 12808/2025", "mp 656/2014").
 * É só um palpite: quem usa confere se a página abre e traz o número do ato antes de cadastrar a norma.
 */
export function urlProvavelDoAto(referencia: string): string | null {
  const m = /^(lc|ec|lei|decreto|mp) (\d+)\/(\d{4})$/.exec(referencia.trim().toLowerCase());
  if (!m) return null;
  const [, tipo, numero, anoTexto] = m;
  const ano = Number(anoTexto);
  if (tipo === 'lc') return `${PLANALTO}/leis/lcp/lcp${numero}.htm`;
  if (tipo === 'ec') return `${PLANALTO}/constituicao/emendas/emc/emc${numero}.htm`;
  const periodo = PERIODOS.find(([ini, fim]) => ano >= ini && ano <= fim);
  if (!periodo) return null;
  const pasta = `_ato${periodo[0]}-${periodo[1]}/${ano}`;
  if (tipo === 'lei') return `${PLANALTO}/${pasta}/lei/l${numero}.htm`;
  if (tipo === 'decreto') return `${PLANALTO}/${pasta}/decreto/d${numero}.htm`;
  return `${PLANALTO}/${pasta}/mpv/mpv${numero}.htm`;
}
