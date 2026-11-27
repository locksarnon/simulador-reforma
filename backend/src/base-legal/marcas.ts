/**
 * Marcas de alteração e revogação que o texto oficial traz entre parênteses ("(Redação dada pela Lei Complementar nº 227,
 * de 2026)", "(Revogado pelo Decreto nº 10.668, de 2021)"), remissões entre normas e temas. Funções puras, sem banco e sem rede.
 */

export type TipoMarca = 'redacao' | 'inclusao' | 'revogacao' | 'veto' | 'vide' | 'vigencia' | 'renumeracao' | 'judicial';

export type Marca = {
  tipo: TipoMarca;
  /** Rótulo normalizado do ato que alterou, incluiu ou revogou ("LC 227/2026"); nulo quando a nota não cita ato. */
  ato: string | null;
  /** Mesmo ato em minúsculas, para comparar com as normas já carregadas ("lc 227/2026"). */
  referencia: string | null;
  /** A nota como está no texto oficial (até 220 caracteres). */
  trecho: string;
};

export type AtoNormativo = { rotulo: string; referencia: string; tipo: string };

const ATOS: [RegExp, string, string][] = [
  [/^lei complementar$/i, 'LC', 'Lei Complementar'],
  [/^lei delegada$/i, 'Lei Delegada', 'Lei Delegada'],
  [/^decreto[- ]lei$/i, 'Decreto-Lei', 'Decreto-Lei'],
  [/^decreto legislativo$/i, 'Decreto Legislativo', 'Decreto Legislativo'],
  [/^decreto$/i, 'Decreto', 'Decreto'],
  [/^medida provis[óo]ria$/i, 'MP', 'Medida Provisória'],
  [/^emenda\s+(?:constitucional|à\s+constitui[çc][ãa]o)$/i, 'EC', 'Emenda Constitucional'],
  [/^lei$/i, 'Lei', 'Lei'],
  [/^resolu[çc][ãa]o$/i, 'Resolução', 'Resolução'],
  [/^instru[çc][ãa]o normativa$/i, 'IN', 'Instrução Normativa'],
  [/^portaria$/i, 'Portaria', 'Portaria'],
  [/^ato declarat[óo]rio$/i, 'AD', 'Ato Declaratório'],
  [/^ato complementar$/i, 'AC', 'Ato Complementar'],
  [/^conv[êe]nio$/i, 'Convênio', 'Convênio'],
  [/^ajuste$/i, 'Ajuste', 'Ajuste'],
  [/^protocolo$/i, 'Protocolo', 'Protocolo'],
];

const NOME_ATO = 'Lei Complementar|Lei Delegada|Decreto[- ]Lei|Decreto Legislativo|Decreto|Medida Provis[óo]ria|Emenda Constitucional|Emenda à Constitui[çc][ãa]o|Lei|Resolu[çc][ãa]o|Instru[çc][ãa]o Normativa|Portaria|Ato Declarat[óo]rio|Ato Complementar|Conv[êe]nio|Ajuste|Protocolo';
/** Atos em que o órgão faz parte do nome: "IN RFB 2.121", "Convênio ICMS 100/1997", "Ajuste SINIEF 7/2005". */
const COM_ORGAO = ['IN', 'Portaria', 'Resolução', 'Convênio', 'Ajuste', 'Protocolo'];
// "Lei Complementar nº 227, de 2026" | "Lei nº 11.945, de 4 de junho de 2009" | "LC 227/2026" | "Decreto 12.955/2026"
const RE_ATO = new RegExp(
  `\\b(${NOME_ATO}|LC|EC|MP)(?:\\s+(?<orgao>RFB|SRF\\/RFB|SRF|MF|MEF|ME|MDIC|PGFN|CGSN|CGIBS|COSIT|SEFAZ|ANP|STN|ICMS|SINIEF))?\\s*(?:n[ºo°.]{0,2}\\s*)?(\\d{1,3}(?:\\.\\d{3})*|\\d+)(?:-(?:[A-Z]|\\d{1,2}))?\\s*(?:\\/\\s*(\\d{4})|,\\s*de\\s*(?:\\d{1,2}[º°]?\\s*(?:de\\s+)?[A-Za-zçãéúÇ]+\\s*(?:de\\s+)?)?(\\d{4})|,\\s*de\\s*\\d{1,2}[./]\\d{1,2}[./](\\d{4}|\\d{2})(?!\\d))`,
  'i',
);

/** Ano de "19/01/1999" ou "10.12.97" (as páginas antigas do Planalto escrevem a data assim). */
const anoCompleto = (ano: string | undefined): string | undefined =>
  !ano ? undefined : ano.length === 4 ? ano : String((Number(ano) > 30 ? 1900 : 2000) + Number(ano));

/** "Lei Complementar nº 227, de 2026" → { rotulo: "LC 227/2026", referencia: "lc 227/2026", tipo: "Lei Complementar" }. */
export function atoDoTexto(texto: string): AtoNormativo | null {
  const m = RE_ATO.exec(texto);
  return m ? atoDeMatch(m) : null;
}

/** Todos os atos citados no texto, sem repetir e na ordem em que aparecem (a ementa de uma lei que altera várias outras, por exemplo). */
export function atosDoTexto(texto: string): AtoNormativo[] {
  const achados = new Map<string, AtoNormativo>();
  for (const m of texto.matchAll(new RegExp(RE_ATO.source, 'gi'))) {
    const ato = atoDeMatch(m);
    if (ato && !achados.has(ato.referencia)) achados.set(ato.referencia, ato);
  }
  return [...achados.values()];
}

function atoDeMatch(m: RegExpExecArray | RegExpMatchArray): AtoNormativo | null {
  const nome = m[1].trim();
  let abrev = 'LC';
  let tipo = 'Lei Complementar';
  if (/^lc$/i.test(nome)) { abrev = 'LC'; tipo = 'Lei Complementar'; }
  else if (/^ec$/i.test(nome)) { abrev = 'EC'; tipo = 'Emenda Constitucional'; }
  else if (/^mp$/i.test(nome)) { abrev = 'MP'; tipo = 'Medida Provisória'; }
  else {
    const achado = ATOS.find(([re]) => re.test(nome.replace(/\s+/g, ' ')));
    if (!achado) return null;
    abrev = achado[1];
    tipo = achado[2];
    // O órgão faz parte do rótulo: "IN RFB" e "IN SRF" são normas diferentes.
    const orgao = m.groups?.orgao;
    if (orgao && COM_ORGAO.includes(abrev)) abrev = `${abrev} ${orgao.toUpperCase()}`;
  }
  // Grupos: 1 tipo do ato, 2 órgão (opcional), 3 número, 4 ano ("/2026"), 5 ano ("de 12 de março de 2026"), 6 ano ("de 19/01/1999", "de 10.12.97").
  const numero = m[3].replace(/\./g, '');
  const ano = m[4] ?? m[5] ?? anoCompleto(m[6]);
  const rotulo = `${abrev} ${numero}/${ano}`;
  return { rotulo, referencia: rotulo.toLowerCase(), tipo };
}

const RE_NOTA = /\(\s*(Reda[çc][ãa]o dada|Inclu[íi]d[oa]s?|Acrescid[oa]s?|Revogad[oa]s?|Vetad[oa]s?|Vide|Vig[êe]ncia|Produ[çc][ãa]o de efeitos?|Renumerad[oa]s?|Declarad[oa]|Suprimid[oa]s?|Regulamento)\b([^()]*(?:\([^()]*\)[^()]*)?)\)/gi;

function tipoDaNota(inicio: string, resto: string): TipoMarca {
  const s = inicio.toLowerCase();
  if (s.startsWith('reda')) return 'redacao';
  if (s.startsWith('inclu') || s.startsWith('acresc')) return 'inclusao';
  if (s.startsWith('revog') || s.startsWith('suprim')) return 'revogacao';
  if (s.startsWith('vetad')) return 'veto';
  if (s.startsWith('renum')) return 'renumeracao';
  if (s.startsWith('declarad') || /\b(ADI|ADC|ADPF|STF)\b/.test(resto)) return 'judicial';
  if (s.startsWith('vide')) return /\b(ADI|ADC|ADPF|STF|inconstitucional)/i.test(resto) ? 'judicial' : 'vide';
  return 'vigencia';
}

/** Todas as notas entre parênteses de um dispositivo, na ordem em que aparecem. */
export function marcasDoTexto(texto: string): Marca[] {
  const saida: Marca[] = [];
  for (const m of texto.matchAll(RE_NOTA)) {
    const tipo = tipoDaNota(m[1], m[2]);
    const ato = atoDoTexto(m[2]);
    saida.push({ tipo, ato: ato?.rotulo ?? null, referencia: ato?.referencia ?? null, trecho: m[0].replace(/\s+/g, ' ').trim().slice(0, 220) });
  }
  return saida;
}

/** Remove as marcas repetidas (mesmo tipo e mesmo ato) para guardar só uma. */
export function marcasUnicas(marcas: Marca[]): Marca[] {
  const vistas = new Set<string>();
  return marcas.filter((m) => {
    const k = `${m.tipo}|${m.referencia ?? m.trecho}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

const RE_TOKEN_ARTIGO = /^Art(?:igo)?\.?\s*\d+(?:\.\d{3})*\s*(?:º|°|o\b)?(?:-[A-Z]{1,3})?\s*\.?/;
const RE_SO_NOTA = /^\s*[-–—:.;,]*\s*\(?\s*(Revogad[oa]s?|Vetad[oa]s?|Suprimid[oa]s?)\b[^)]*\)?[\s.;,]*$/i;
const RE_NOTA_COMPLETA = /\(\s*(?:Reda[çc][ãa]o dada|Inclu[íi]d[oa]s?|Acrescid[oa]s?|Revogad[oa]s?|Vetad[oa]s?|Vide|Vig[êe]ncia|Produ[çc][ãa]o de efeitos?|Renumerad[oa]s?|Declarad[oa]|Suprimid[oa]s?|Regulamento)\b[^()]*(?:\([^()]*\)[^()]*)?\)/gi;

// ── Cláusulas (convênios, ajustes e protocolos do Confaz): "Cláusula primeira", "Cláusula terceira-A", "Cláusula décima segunda" ──
const UNIDADES: Record<string, number> = { primeira: 1, segunda: 2, terceira: 3, quarta: 4, quinta: 5, sexta: 6, 'sétima': 7, setima: 7, oitava: 8, nona: 9 };
const DEZENAS: Record<string, number> = {
  'décima': 10, decima: 10, 'vigésima': 20, vigesima: 20, 'trigésima': 30, trigesima: 30, 'quadragésima': 40, quadragesima: 40, 'quinquagésima': 50, quinquagesima: 50,
};
const ORD_UNIDADE = 'primeira|segunda|terceira|quarta|quinta|sexta|s[ée]tima|oitava|nona';
const ORD_DEZENA = 'd[ée]cima|vig[ée]sima|trig[ée]sima|quadrag[ée]sima|quinquag[ée]sima';
/** Só "Cláusula" com inicial maiúscula e ordinal por extenso: "CLÁUSULA PRIMEIRA DO CONVÊNIO..." (título de anexo) não é cláusula. */
export const RE_CLAUSULA = new RegExp(`^Cl[áa]usula\\s+((?:${ORD_DEZENA})(?:[\\s-]+(?:${ORD_UNIDADE}))?|${ORD_UNIDADE})(?:\\s*-\\s*([A-Z]{1,2})\\b)?`);

/** "Cláusula décima segunda-A ..." → { numero: 12, sufixo: 'A', rotulo: 'Cláusula décima segunda-A' }. */
export function clausulaDaLinha(linha: string): { numero: number; sufixo: string; rotulo: string } | null {
  const m = RE_CLAUSULA.exec(linha.trim());
  if (!m) return null;
  const ordinal = m[1].toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ');
  const numero = ordinal.split(' ').reduce((s, p) => s + (DEZENAS[p] ?? UNIDADES[p] ?? 0), 0);
  return numero ? { numero, sufixo: m[2] ?? '', rotulo: `Cláusula ${ordinal}${m[2] ? `-${m[2]}` : ''}` } : null;
}

/** O que sobra de uma linha quando se tiram o marcador estrutural (Art. 5º, Cláusula primeira, § 2º, I -, a)) e as notas entre parênteses. */
function miolo(linha: string): string {
  return linha
    .replace(RE_NOTA_COMPLETA, ' ')
    .replace(RE_TOKEN_ARTIGO, ' ')
    .replace(RE_CLAUSULA, ' ')
    .replace(/^\s*(?:ANEXO|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\s+(?:[IVXLCDM]+(?:-[A-Z])?|[ÚU]NIC[OA]|\d+)\b/i, ' ')
    .replace(/^\s*(§\s*\d+\s*[º°o]?\s*[-A-Z]*\s*\.?|Parágrafo único\.?|[IVXLCDM]+\s*[-–—]|[a-z]\)|\d{1,2}\s*[.)-])/i, ' ')
    .replace(/[\s.;,:()–—-]+/g, ' ')
    .trim();
}

/**
 * Revogado por inteiro: nenhuma linha do dispositivo traz texto operativo, só marcas ("(Revogado pelo...)", "(VETADO)").
 * Revogado em parte: há linhas (parágrafos, incisos, alíneas) revogadas junto de linhas vigentes.
 */
export function situacaoDoDispositivo(texto: string): { revogado: boolean; parcialmente_revogado: boolean; revogado_por: string | null } {
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!linhas.length) return { revogado: false, parcialmente_revogado: false, revogado_por: null };
  // Linha que só traz o marcador (Art. 5º, § 2º, I -) e a nota de extinção: nada operativo sobrou.
  const revogadas = linhas.filter((l) => /\(\s*(Revogad[oa]s?|Suprimid[oa]s?)\b/i.test(l) && !miolo(l));
  const vetadas = linhas.filter((l) => /\(\s*Vetad[oa]s?\b/i.test(l) && !miolo(l));
  const operativas = linhas.filter((l) => miolo(l));
  // Revogado por inteiro: nenhuma linha operativa (o veto de um artigo inteiro também não deixa texto); só parágrafos revogados = revogação parcial.
  const revogado = operativas.length === 0 && revogadas.length + vetadas.length > 0;
  let revogadoPor: string | null = null;
  if (revogadas.length) revogadoPor = marcasDoTexto(revogadas.join('\n')).find((m) => m.tipo === 'revogacao' && m.ato)?.ato ?? null;
  else if (revogado && vetadas.length) revogadoPor = 'veto';
  return { revogado, parcialmente_revogado: !revogado && revogadas.length > 0, revogado_por: revogadoPor };
}

const RE_ESTRUTURA_SUPERIOR = /^\s*((?:ANEXO|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\s+(?:[IVXLCDM]+(?:-[A-Z])?|[ÚU]NIC[OA]|\d+)\b)/i;
const RE_ESTRUTURA = /^\s*(Art(?:igo)?\.?\s*\d+(?:\.\d{3})*\s*(?:º|°|o\b)?(?:-[A-Z]{1,3})?\s*\.?|§\s*\d+\s*[º°o]?\s*(?:-\s*[A-Z]{1,3})?\s*\.?|Parágrafo único\.?|[IVXLCDM]+\s*[-–—]|[a-z]\)|\d{1,2}\s*[.)])/;

/**
 * Início estrutural de uma linha ("Art. 165.", "§ 2º", "I -", "a)", "ANEXO XIV", "CAPÍTULO IV"): serve para reconstituir o
 * cabeçalho de um dispositivo cujo título estava riscado e que sobrou só com o aviso de revogação.
 */
export function marcadorEstrutural(linha: string): string | null {
  const m = RE_ESTRUTURA_SUPERIOR.exec(linha) ?? RE_ESTRUTURA.exec(linha);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

/** "Art. 165-A." → "165-A" (o número do artigo que a linha inicia). */
export function numeroDoArtigo(linha: string): string | null {
  const m = /^\s*Art(?:igo)?\.?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?!\d)(?!\.\d)\s*(?:º|°|o\b)?(?:-([A-Z]{1,3})\b)?/.exec(linha);
  return m ? `${m[1].replace(/\./g, '')}${m[2] ? `-${m[2]}` : ''}` : null;
}

const NUM_FAIXA = String.raw`\d+(?:\s*(?:º|°|o\b))?(?:-[A-Z]{1,3}\b)?`;
const RE_FAIXA_REVOGADA = new RegExp(
  String.raw`^\s*Arts?\.?\s*(${NUM_FAIXA}(?:(?:\s*,\s*|\s+(?:e|ao?)\s+)${NUM_FAIXA})+)\s*\.?\s*[-–—:]?\s*\(?\s*((?:Revogad|Vetad|Suprimid)[^)]*)\)?[\s.;]*$`,
  'i',
);
const MAX_FAIXA_REVOGADA = 80;

/**
 * "Arts. 52 a 58 (Revogados pelo Decreto-lei nº 406, de 1968)", "Arts. 3º e 4º (Revogados...)", "Arts. 15-A a 15-C (Vetados)": a linha que
 * revoga vários artigos de uma vez vira uma linha por artigo, cada uma com o aviso ("Art. 52. (Revogado pelo Decreto-lei nº 406, de 1968)").
 * Sem isso, os artigos sumiam da base e o aviso grudava no artigo anterior. Devolve null quando a linha não é desse tipo.
 */
export function expandirFaixaRevogada(linha: string): string[] | null {
  const m = RE_FAIXA_REVOGADA.exec(linha);
  if (!m) return null;
  const nota = m[2].trim().replace(/[\s.;]+$/, '').replace(/^(Revogad|Vetad|Suprimid)([oa])s\b/i, '$1$2');
  // Separadores: vírgula, "e" e "a"/"ao" (faixa); estes três só com espaço em volta, para não partir o sufixo de "Art. 15-E".
  const partes = m[1]
    .split(/\s*(,)\s*|\s+(e|ao?)\s+/i)
    .filter((p): p is string => Boolean(p))
    .map((p) => p.trim());
  const ler = (p: string) => {
    const x = /^(\d+)(?:\s*(?:º|°|o))?(?:-([A-Za-z]{1,3}))?$/i.exec(p);
    return x ? { n: Number(x[1]), suf: x[2]?.toUpperCase() ?? '' } : null;
  };
  const letra = (suf: string) => (suf ? suf.charCodeAt(0) : 64); // 64 = a posição antes do "A"
  const itens: { n: number; suf: string }[] = [];
  const sufixos = (n: number, depoisDe: number, ate: number) => {
    for (let c = depoisDe + 1; c <= ate; c++) itens.push({ n, suf: String.fromCharCode(c) });
  };
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    if (p === ',' || /^e$/i.test(p)) continue;
    if (/^ao?$/i.test(p)) {
      const ini = itens[itens.length - 1];
      const fim = ler(partes[i + 1] ?? '');
      if (!ini || !fim) return null;
      if (fim.n > ini.n && fim.n - ini.n <= MAX_FAIXA_REVOGADA) {
        // "52 a 58"; "10 a 12-B" = 10, 11, 12, 12-A e 12-B
        for (let n = ini.n + 1; n <= fim.n; n++) itens.push({ n, suf: '' });
        if (fim.suf.length === 1) sufixos(fim.n, 64, letra(fim.suf));
        else if (fim.suf) itens.push(fim);
      } else if (ini.n === fim.n && ini.suf.length <= 1 && fim.suf.length === 1 && letra(fim.suf) > letra(ini.suf)) {
        sufixos(ini.n, letra(ini.suf), letra(fim.suf)); // "15-A a 15-C"
      } else {
        return null; // faixa que não se sabe expandir (ou longa demais): não adivinhar
      }
      i += 1;
      continue;
    }
    const x = ler(p);
    if (!x) return null;
    itens.push(x);
  }
  if (itens.length < 2 || itens.length > MAX_FAIXA_REVOGADA + 1) return null;
  const cabeca = ({ n, suf }: { n: number; suf: string }) => (suf ? `Art. ${n}-${suf}.` : n <= 9 ? `Art. ${n}º` : `Art. ${n}.`);
  return itens.map((item) => `${cabeca(item)} (${nota})`);
}

/** A linha é só uma nota ("(Revogado pelo Decreto nº 7.990, de 2013)", "(Redação dada...)"), sem texto próprio. */
export const ehSoNota = (linha: string): boolean => /^\s*\(\s*(Revogad|Reda[çc][ãa]o dada|Inclu[íi]d|Vetad|Suprimid|Renumerad|Acrescid)/i.test(linha);

// ── Remissões entre normas: "(Art. 38 da LC 214/2025)", "(arts. 38 a 41 da Lei Complementar nº 214, de 2025)" ──────────────

export type Remissao = { ato: string; referencia: string; caminhos: string[]; trecho: string };

const RE_REMISSAO = new RegExp(
  `\\(\\s*((?:§\\s*\\d+[º°]?\\s*(?:,\\s*)?)?(?:(?:inciso|incisos)\\s+[IVXLC]+(?:\\s*(?:,|e|a)\\s*[IVXLC]+)*\\s*(?:,\\s*)?)?(?:do\\s+)?(?:arts?\\.|artigos?)\\s*\\d+[º°]?(?:-[A-Z])?(?:\\s*(?:,|e|a|ao)\\s*\\d+[º°]?(?:-[A-Z])?)*)\\s+d[ao]s?\\s+((?:${NOME_ATO}|LC|EC)\\s*(?:n[ºo°.]{0,2}\\s*)?[\\d.]+\\s*(?:\\/\\s*\\d{4}|,\\s*de\\s*(?:\\d{1,2}[º°]?\\s*(?:de\\s+)?[A-Za-zçãéúÇ]+\\s*(?:de\\s+)?)?\\d{4}))[^)]{0,40}\\)`,
  'gi',
);

const MAX_ARTIGOS_POR_FAIXA = 30;

/** Artigos de outra norma que o dispositivo diz regulamentar ou reproduzir. Só entram remissões a artigos (o mapa dispositivo a dispositivo). */
export function remissoesDoTexto(texto: string): Remissao[] {
  const saida: Remissao[] = [];
  for (const m of texto.matchAll(RE_REMISSAO)) {
    const ato = atoDoTexto(m[2]);
    if (!ato) continue;
    const partes = m[1];
    const numeros: string[] = [];
    const faixa = /(\d+)[º°]?(?:-([A-Z]))?\s*(?:a|ao)\s*(\d+)[º°]?(?:-([A-Z]))?/i.exec(partes);
    if (faixa && !faixa[2] && !faixa[4]) {
      const ini = Number(faixa[1]);
      const fim = Number(faixa[3]);
      if (fim >= ini && fim - ini < MAX_ARTIGOS_POR_FAIXA) for (let n = ini; n <= fim; n++) numeros.push(String(n));
    }
    if (!numeros.length) {
      const depoisDeArt = partes.slice(partes.search(/arts?\.|artigos?/i));
      for (const n of depoisDeArt.matchAll(/(\d+)[º°]?(?:-([A-Z]))?/g)) numeros.push(`${n[1]}${n[2] ? `-${n[2].toLowerCase()}` : ''}`);
    }
    const caminhos = [...new Set(numeros)].slice(0, MAX_ARTIGOS_POR_FAIXA).map((n) => `art-${n}`);
    if (caminhos.length) saida.push({ ato: ato.rotulo, referencia: ato.referencia, caminhos, trecho: m[0].replace(/\s+/g, ' ').slice(0, 160) });
  }
  return saida;
}

// ── Temas: índice temático dentro de cada norma (o que a pessoa procura, não o número do artigo) ──────────────────────────

export type Tema = { chave: string; rotulo: string; termos: string[] };

export const TEMAS: Tema[] = [
  { chave: 'produtor_rural', rotulo: 'Produtor rural', termos: ['produtor rural', 'atividade rural', 'agricultura familiar', 'pecuaria', 'lavoura', 'nao contribuinte', 'credito presumido do produtor'] },
  { chave: 'cooperativas', rotulo: 'Cooperativas', termos: ['cooperativa', 'ato cooperativo', 'cooperado'] },
  { chave: 'insumos_agropecuarios', rotulo: 'Insumos agropecuários', termos: ['insumo agropecuario', 'insumos agropecuarios', 'defensivo', 'fertilizante', 'semente', 'racao', 'medicamento veterinario', 'adubo'] },
  { chave: 'alimentos', rotulo: 'Alimentos', termos: ['cesta basica', 'alimento', 'produto hortifruticola', 'carne', 'leite', 'cereal', 'hortifruti'] },
  { chave: 'imoveis', rotulo: 'Imóveis', termos: ['bem imovel', 'bens imoveis', 'operacoes com imoveis', 'incorporacao imobiliaria', 'locacao de imovel', 'loteamento', 'imobiliario'] },
  { chave: 'construcao_civil', rotulo: 'Construção civil', termos: ['construcao civil', 'obra de construcao', 'empreitada', 'engenharia', 'edificacao'] },
  { chave: 'servicos_profissionais', rotulo: 'Serviços profissionais', termos: ['profissao intelectual', 'profissional liberal', 'servico profissional', 'sociedade de profissionais', 'advocacia', 'contabilidade'] },
  { chave: 'combustiveis', rotulo: 'Combustíveis', termos: ['combustivel', 'combustiveis', 'gasolina', 'diesel', 'etanol', 'biocombustivel', 'gas natural', 'glp'] },
  { chave: 'importacao_exportacao', rotulo: 'Importação e exportação', termos: ['importacao', 'exportacao', 'desembaraco aduaneiro', 'zona franca', 'drawback', 'regime aduaneiro', 'zona de processamento'] },
  { chave: 'creditos', rotulo: 'Créditos', termos: ['credito de ibs', 'credito de cbs', 'apropriacao de credito', 'creditos', 'estorno de credito', 'credito presumido'] },
  { chave: 'ressarcimento', rotulo: 'Ressarcimento e restituição', termos: ['ressarcimento', 'restituicao', 'compensacao', 'saldo credor', 'pagamento indevido'] },
  { chave: 'split_payment', rotulo: 'Split payment', termos: ['split payment', 'pagamento dividido', 'recolhimento na liquidacao financeira'] },
  { chave: 'transicao', rotulo: 'Transição', termos: ['transicao', 'periodo de transicao', 'periodo de teste', 'aliquota de referencia', 'redutor'] },
  { chave: 'imposto_seletivo', rotulo: 'Imposto Seletivo', termos: ['imposto seletivo', 'extracao de bens minerais'] },
  { chave: 'simples_nacional', rotulo: 'Simples Nacional', termos: ['simples nacional', 'microempresa', 'empresa de pequeno porte', 'mei', 'regime unificado'] },
  { chave: 'regimes_diferenciados', rotulo: 'Regimes diferenciados', termos: ['aliquota reduzida', 'reducao de aliquota', 'regime especifico', 'regime diferenciado', 'isencao', 'aliquota zero', 'imunidade'] },
  { chave: 'saude_educacao', rotulo: 'Saúde e educação', termos: ['servicos de saude', 'dispositivo medico', 'medicamento', 'educacao', 'ensino', 'prouni'] },
  { chave: 'transporte', rotulo: 'Transporte', termos: ['transporte de cargas', 'transporte coletivo', 'transportador autonomo', 'frete', 'transporte de passageiros'] },
  { chave: 'servicos_financeiros', rotulo: 'Serviços financeiros', termos: ['servicos financeiros', 'instituicao financeira', 'seguro', 'consorcio', 'planos de saude', 'operacoes de credito'] },
  { chave: 'obrigacoes_acessorias', rotulo: 'Obrigações acessórias', termos: ['documento fiscal', 'nota fiscal', 'escrituracao', 'declaracao', 'obrigacao acessoria', 'nf-e', 'nfs-e'] },
  { chave: 'processo_administrativo', rotulo: 'Processo administrativo e penalidades', termos: ['processo administrativo', 'auto de infracao', 'multa', 'penalidade', 'recurso administrativo', 'consulta tributaria', 'decadencia', 'prescricao'] },
  { chave: 'imposto_de_renda', rotulo: 'Imposto de renda', termos: ['imposto de renda', 'irpj', 'csll', 'lucro presumido', 'lucro real', 'lucro arbitrado', 'juros sobre o capital proprio'] },
  { chave: 'pis_cofins', rotulo: 'PIS e Cofins', termos: ['pis/pasep', 'cofins', 'contribuicao para o pis', 'regime cumulativo', 'regime nao cumulativo'] },
  { chave: 'icms_iss', rotulo: 'ICMS e ISS', termos: ['icms', 'imposto sobre servicos', 'iss ', 'issqn', 'substituicao tributaria', 'difal'] },
];

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ER_TERMO = new Map<string, RegExp>();
/** O termo como palavra inteira (com plural simples): "racao" não pode casar dentro de "operacao". */
function termoRegex(termo: string): RegExp {
  let er = ER_TERMO.get(termo);
  if (!er) {
    const esc = termo.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    er = new RegExp(`(?<![a-z0-9])${esc}(?:s|es)?(?![a-z0-9])`, 'g');
    ER_TERMO.set(termo, er);
  }
  return er;
}

/** Até 6 temas que o dispositivo trata: um termo no início do texto, ou dois termos (ou o mesmo duas vezes) no corpo. */
export function temasDoTexto(texto: string): string[] {
  const t = semAcento(texto);
  const pontos: [string, number][] = [];
  for (const tema of TEMAS) {
    let p = 0;
    for (const termo of tema.termos) {
      const achados = [...t.matchAll(termoRegex(termo))];
      if (!achados.length) continue;
      p += 1;
      if ((achados[0].index ?? 0) < 400) p += 2;
      if (achados.length > 1) p += 1;
    }
    if (p >= 2) pontos.push([tema.chave, p]);
  }
  return pontos.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
}
