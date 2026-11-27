import { createHash } from 'crypto';
import { clausulaDaLinha, ehSoNota, expandirFaixaRevogada, type Marca, marcadorEstrutural, marcasDoTexto, marcasUnicas, numeroDoArtigo, type Remissao, remissoesDoTexto, situacaoDoDispositivo, temasDoTexto } from './marcas';

/** Dispositivo extraído do texto de uma norma (artigo, anexo ou, nos convênios do Confaz, cláusula). */
export type DispositivoExtraido = {
  tipo: 'artigo' | 'anexo' | 'clausula';
  rotulo: string;
  caminho: string;
  ordem: number;
  secao: string | null;
  texto: string;
  /** Revogado (ou vetado) por inteiro: não sobra texto operativo, só a nota de revogação. */
  revogado: boolean;
  /** Há parágrafos, incisos ou alíneas revogados junto de texto ainda vigente. */
  parcialmente_revogado: boolean;
  revogado_por: string | null;
  /** Notas entre parênteses do texto oficial: redação dada, incluído, revogado, vide, vigência. */
  alteracoes: Marca[];
  /** Texto que estava riscado no site oficial (redação superada ou revogada). Nunca entra no texto vigente. */
  redacoes_anteriores: string[];
  /** Artigos de outras normas que o dispositivo diz regulamentar ou reproduzir. */
  remissoes: Remissao[];
  temas: string[];
};

const ENTIDADES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordm: 'º', ordf: 'ª', sect: '§',
  ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', otilde: 'õ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  agrave: 'à', acirc: 'â', ecirc: 'ê', ocirc: 'ô', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  Atilde: 'Ã', Otilde: 'Õ', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô', ndash: '–', mdash: '—', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', hellip: '…', deg: '°',
};

export function decodificarEntidades(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, nome) => ENTIDADES[nome] ?? m);
}

/** Delimitadores (área de uso privado do Unicode) do texto que o site oficial mostra riscado. */
/**
 * Versão do leitor de texto. Aumente quando o leitor passar a extrair o texto de outro jeito (por exemplo, separar o que está riscado):
 * as normas gravadas por versão anterior são reprocessadas na próxima leitura, sem contar a diferença como mudança da lei.
 */
// 3: faixas "Arts. 52 a 58 (Revogados...)", artigo todo riscado com o aviso só no inciso, artigos citados entre aspas, cláusulas do Confaz.
// 4: "Artigo 1º" e "Art. 1.000", anexo longo em partes, artigo riscado com o mesmo número de um vigente é redação anterior.
export const LEITOR_VERSAO = 4;

export const INICIO_RISCADO = '';
export const FIM_RISCADO = '';
const RE_RISCADO = /([^]*)/g;

/** Texto sem as partes riscadas (o que está em vigor). */
export const semRiscado = (texto: string): string => texto.replace(RE_RISCADO, ' ');

const ELEMENTOS_VAZIOS = new Set(['br', 'hr', 'img', 'meta', 'link', 'input', 'col', 'wbr', 'area', 'base', 'param', 'source', 'track', 'embed']);
const BLOCOS = new Set(['p', 'div', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'blockquote']);
const TAGS_RISCADO = new Set(['strike', 's', 'del']);
const RE_ESTILO_RISCADO = /text-decoration[^;"']*line-through/i;
const RE_ABRE_TAG = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/;
/** Elemento que, ao abrir de novo, fecha o irmão anterior ainda aberto (HTML antigo sem as tags de fechamento). */
const IRMAOS: Record<string, { fecha: string[]; limite: string[] }> = {
  p: { fecha: ['p'], limite: ['div', 'td', 'th', 'li', 'blockquote', 'table'] },
  li: { fecha: ['li'], limite: ['ul', 'ol'] },
  td: { fecha: ['td', 'th'], limite: ['tr', 'table'] },
  th: { fecha: ['td', 'th'], limite: ['tr', 'table'] },
  tr: { fecha: ['tr', 'td', 'th'], limite: ['table'] },
};

/**
 * HTML do site oficial → texto em linhas. O que o Planalto mostra riscado (por <strike>, <s>, <del> ou por
 * `text-decoration: line-through`, que é como a maior parte vem) é a redação superada ou revogada: sai do texto vigente e
 * fica entre INICIO_RISCADO e FIM_RISCADO, para `extrairDispositivos` guardá-lo à parte como redação anterior.
 */
export function htmlParaTexto(html: string): string {
  const limpo = html
    .replace(/\s+/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const pilha: { nome: string; riscado: boolean }[] = [];
  let riscados = 0;
  const saida: string[] = [];
  let aberto = false;
  const marcar = (riscado: boolean) => {
    if (riscado && !aberto) { saida.push(INICIO_RISCADO); aberto = true; }
    else if (!riscado && aberto) { saida.push(FIM_RISCADO); aberto = false; }
  };
  const texto = (s: string) => {
    if (!s) return;
    marcar(riscados > 0 && s.trim().length > 0);
    saida.push(s);
  };
  const quebra = (s: string) => { marcar(false); saida.push(s); };
  const desempilhar = (ate: number) => { while (pilha.length > ate) { if (pilha.pop()!.riscado) riscados -= 1; } };
  const fecharIrmao = (nome: string) => {
    const regra = IRMAOS[nome];
    if (!regra) return;
    for (let k = pilha.length - 1; k >= 0; k--) {
      if (regra.fecha.includes(pilha[k].nome)) { desempilhar(k); return; }
      if (regra.limite.includes(pilha[k].nome)) return;
    }
  };

  let i = 0;
  while (i < limpo.length) {
    const lt = limpo.indexOf('<', i);
    if (lt < 0) { texto(limpo.slice(i)); break; }
    if (lt > i) texto(limpo.slice(i, lt));
    const m = RE_ABRE_TAG.exec(limpo.slice(lt, lt + 48));
    if (!m) { texto('<'); i = lt + 1; continue; }
    // fim da tag respeitando aspas; aspa sem par não pode engolir o documento
    let j = lt + m[0].length;
    let aspas = '';
    while (j < limpo.length && j - lt < 4000) {
      const c = limpo[j];
      if (aspas) { if (c === aspas) aspas = ''; } else if (c === '"' || c === "'") aspas = c; else if (c === '>') break;
      j += 1;
    }
    if (limpo[j] !== '>') { texto('<'); i = lt + 1; continue; }
    const attrs = limpo.slice(lt + m[0].length, j);
    const nome = m[2].toLowerCase();
    i = j + 1;

    if (m[1] === '/') {
      if (nome === 'td' || nome === 'th') quebra(' | ');
      if (BLOCOS.has(nome)) quebra('\n');
      for (let k = pilha.length - 1; k >= 0; k--) {
        if (pilha[k].nome === nome) { desempilhar(k); break; }
      }
      continue;
    }
    if (nome === 'br') { quebra('\n'); continue; }
    if (ELEMENTOS_VAZIOS.has(nome) || attrs.trimEnd().endsWith('/')) continue;
    fecharIrmao(nome);
    const riscado = TAGS_RISCADO.has(nome) || RE_ESTILO_RISCADO.test(attrs);
    pilha.push({ nome, riscado });
    if (riscado) riscados += 1;
  }
  marcar(false);

  return decodificarEntidades(saida.join(''))
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').replace(/(\s\|)+\s*$/, '').trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

// "Art. 5º", "Art. 5º-A" e o estilo antigo "Art 5º - texto" (sem ponto): o hífen só é sufixo quando colado ao número ("5º-A"), senão "Art 1º - O imposto" viraria o art. 1-O.
// "Art. 33, inciso II do caput: ..." (vírgula logo depois do número) é remissão, não o início de um artigo.
// "Art. 1.000" (regulamentos estaduais com mais de 999 artigos): o ponto é separador de milhar, não o fim do número.
// "Artigo 1º" por extenso (São Paulo escreve assim) é o mesmo que "Art. 1º".
const RE_ARTIGO = /^Art(?:igo)?\.?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?!\d)(?!\.\d)\s*(?:º|°|o\b|\.)?(?:\s*-([A-Z]{1,3})\b)?(?!\s*,)/;
/** "1.000" → "1000" (o número do artigo sem o separador de milhar). */
const numeroArtigo = (s: string) => s.replace(/\./g, '');
const RE_ANEXO = /^ANEXO\s+([IVXLC]+(?:-[A-Z])?|[ÚU]NICO)\b/i;
const RE_SECAO = /^(LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\s+([IVXLCDM]+(?:-[A-Z])?|[ÚU]NIC[OA]|\d+)\b\s*(.*)$/i;
const NIVEL: Record<string, number> = { LIVRO: 0, TITULO: 1, CAPITULO: 2, SECAO: 3, SUBSECAO: 4 };

function romano(r: string): number {
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  const base = r.split('-')[0];
  let t = 0;
  for (let i = 0; i < base.length; i++) {
    const a = v[base[i]] ?? 0;
    const b = v[base[i + 1]] ?? 0;
    t += a < b ? -a : a;
  }
  return t;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/**
 * Separa, linha a linha, o texto vigente do riscado, sem deixar sumir dispositivo revogado:
 *  - cabeçalho riscado ("Art. 165.", "ANEXO XIV") seguido só do aviso de revogação ("(Revogado pelo Decreto...)") volta a ser a
 *    linha "Art. 165. (Revogado pelo Decreto...)" (antes o dispositivo sumia e o aviso grudava no anterior);
 *  - artigo riscado que não tem aviso próprio (o aviso está no título da seção) e não foi reeditado vira "Art. N. (Revogado...)".
 * O que estava riscado fica à parte, em `riscados`, como redação anterior.
 */
/** O aviso "(Revogado pela Lei nº 10.833, de 29.12.2003)" que o próprio texto riscado traz, se trouxer. */
function notaDoRiscado(bloco: string): string | null {
  const m = /\(\s*((?:Revogad|Suprimid)[oa]s?\b[^()]*)\)/i.exec(bloco);
  return m ? `(${m[1].replace(/\s+/g, ' ').trim()})` : null;
}

/**
 * Números dos artigos que têm texto em vigor em algum lugar da norma (fora de citação entre aspas). O artigo riscado com um desses
 * números é redação anterior (Goiás traz o capítulo antigo inteiro riscado antes do atual), não um artigo revogado a mais.
 */
function artigosComTextoVigente(texto: string): Set<string> {
  const linhas = texto.split('\n').map((b) => semRiscado(b).replace(/[ \t]+/g, ' ').trim());
  const citadas = linhasCitadas(linhas);
  const numeros = new Set<string>();
  linhas.forEach((l, i) => {
    if (citadas.has(i)) return;
    const n = numeroDoArtigo(l);
    if (n) numeros.add(n);
  });
  return numeros;
}

function prepararLinhas(texto: string): { linhas: string[]; riscados: string[][] } {
  const linhas: string[] = [];
  const riscados: string[][] = [];
  let pendente: string[] = [];
  let notaSolta: string | null = null;
  const comTextoVigente = artigosComTextoVigente(texto);

  for (const bruta of texto.split('\n')) {
    const fragmentos = [...bruta.matchAll(RE_RISCADO)].map((m) => m[1].replace(/\s+/g, ' ').trim()).filter((f) => f.length >= 3);
    let vigente = semRiscado(bruta).replace(/[ \t]+/g, ' ').replace(/(\s\|)+\s*$/, '').trim();
    // Erro de digitação da própria página oficial ("rt. 758." no RIR/2018): é o início de um artigo.
    vigente = vigente.replace(/^rt\.\s*(?=\d)/, 'Art. ');
    if (!vigente) {
      pendente.push(...fragmentos);
      continue;
    }
    const iniciaRiscado = bruta.trimStart().startsWith(INICIO_RISCADO);
    // Blocos riscados que vêm logo antes do texto vigente desta linha, em ordem (o primeiro fragmento da própria linha conta se ela começa riscada).
    const sequencia = [...pendente, ...(iniciaRiscado && fragmentos[0] ? [fragmentos[0]] : [])];
    const resto = iniciaRiscado ? fragmentos.slice(1) : fragmentos;

    // O aviso de revogação sem cabeçalho pertence ao último bloco riscado que tinha cabeçalho.
    let usado = -1;
    if (!marcadorEstrutural(vigente) && (ehSoNota(vigente) || (iniciaRiscado && fragmentos[0]))) {
      for (let k = sequencia.length - 1; k >= 0; k--) {
        const marc = marcadorEstrutural(sequencia[k]);
        if (!marc) continue;
        if (ehSoNota(vigente) || k === sequencia.length - 1) { vigente = `${marc} ${vigente}`; usado = k; }
        break;
      }
    }
    const numeroAqui = numeroDoArtigo(vigente);

    // Agrupa os blocos riscados por artigo: cada "Art. N" riscado abre um grupo e os blocos seguintes sem artigo são continuação dele.
    const grupos: { token: string; numero: string; indices: number[] }[] = [];
    const soltos: number[] = [];
    sequencia.forEach((b, k) => {
      const numero = numeroDoArtigo(b);
      if (numero) grupos.push({ token: marcadorEstrutural(b) as string, numero, indices: [k] });
      else if (grupos.length) grupos[grupos.length - 1].indices.push(k);
      else soltos.push(k);
    });
    const proprios: number[] = [...soltos];
    for (const g of grupos) {
      if (g.numero === numeroAqui || usado === g.indices[0] || comTextoVigente.has(g.numero)) { proprios.push(...g.indices); continue; }
      const cabeca = sequencia[g.indices[0]];
      if (cabeca.length < 20) { proprios.push(...g.indices); continue; }
      if (g.indices.includes(usado)) {
        // Artigo inteiro riscado cujo aviso de revogação só veio no inciso ou parágrafo (RIPI, art. 146; Lei 10.637, art. 6º):
        // o artigo continua na base, revogado, e o item com o aviso segue dentro dele.
        linhas.push(`${g.token} ${notaDoRiscado(cabeca) ?? notaSolta ?? '(Revogado)'}`);
        riscados.push(g.indices.filter((k) => k < usado).map((k) => sequencia[k]));
        proprios.push(...g.indices.filter((k) => k >= usado));
        continue;
      }
      // artigo riscado e não reeditado: continua existindo na base, como revogado (com o ato, se o próprio riscado o traz)
      linhas.push(`${g.token} ${notaSolta ?? notaDoRiscado(cabeca) ?? '(Revogado)'}`);
      riscados.push(g.indices.map((k) => sequencia[k]));
    }

    // "Arts. 52 a 58 (Revogados pelo...)": uma linha por artigo revogado, cada uma com o aviso.
    const faixa = expandirFaixaRevogada(vigente);
    const novas = faixa ?? [vigente];
    linhas.push(novas[0]);
    riscados.push([...proprios.sort((a, b) => a - b).map((k) => sequencia[k]), ...resto]);
    for (const extra of novas.slice(1)) { linhas.push(extra); riscados.push([]); }
    pendente = [];
    // Aviso de revogação solto (logo depois de um título) que vale para os artigos riscados que vierem em seguida.
    notaSolta = !faixa && ehSoNota(vigente) && /^\s*\(\s*Revogad/i.test(vigente) ? vigente : null;
  }
  return { linhas, riscados };
}

/**
 * Norma publicada em várias páginas (o RICMS/MT sai uma página por capítulo, fora de ordem): cada página é lida sozinha e as listas
 * se juntam, sem repetir dispositivo (vale o primeiro) e com a ordem refeita.
 */
export function juntarPartes(listas: DispositivoExtraido[][]): DispositivoExtraido[] {
  const vistos = new Set<string>();
  const saida: DispositivoExtraido[] = [];
  for (const lista of listas) {
    for (const d of lista) {
      if (vistos.has(d.caminho)) continue;
      vistos.add(d.caminho);
      saida.push({ ...d, ordem: saida.length + 1 });
    }
  }
  return saida;
}

/** Divide o texto de uma norma em artigos e anexos, guardando o caminho (Título › Capítulo…). */
export function extrairDispositivos(texto: string): DispositivoExtraido[] {
  const { linhas, riscados } = prepararLinhas(texto);
  // Constituição: o ADCT tem numeração própria (Art. 1º…) — é tratado como um segundo bloco.
  const iAdct = linhas.findIndex((l) => /^ATO DAS DISPOSI[ÇC][ÕO]ES CONSTITUCIONAIS TRANSIT[ÓO]RIAS$/.test(l.trim()));
  if (iAdct > 0) {
    const corpo = extrairSegmento(linhas.slice(0, iAdct), '', 0, riscados.slice(0, iAdct));
    const adct = extrairSegmento(linhas.slice(iAdct + 1), 'adct', corpo.length, riscados.slice(iAdct + 1));
    return [...corpo, ...adct];
  }
  return extrairSegmento(linhas, '', 0, riscados);
}

const chaveArtigo = (num: string, suf?: string) => {
  let v = 0;
  for (const c of (suf ?? '').toUpperCase()) v = v * 27 + (c.charCodeAt(0) - 64);
  return Number(num) * 100000 + v;
};

const PESO_CITADO = 0.1;
const MAX_LINHAS_CITACAO = 400;
const fechaCitacao = (linha: string) => /[”"]\s*(?:\(\s*(?:NR|AC)\s*\))?\s*[.;,]?\s*$/i.test(linha.trim());

/**
 * Linhas de texto citado entre aspas: os artigos de outra lei que um artigo alterador reproduz ("“Art. 22-A. ... Capítulo.” (NR)").
 * Abre na linha que começa com aspas e fecha na primeira que termina com aspas (com ou sem "(NR)"). Sem fechamento em até
 * 400 linhas, a abertura é ignorada.
 */
function linhasCitadas(linhas: string[]): Set<number> {
  const citadas = new Set<number>();
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (!/^[“"]/.test(l) || fechaCitacao(l.slice(1))) continue;
    let fim = -1;
    for (let j = i + 1; j < Math.min(linhas.length, i + MAX_LINHAS_CITACAO); j++) {
      if (fechaCitacao(linhas[j])) { fim = j; break; }
    }
    if (fim < 0) continue;
    for (let k = i; k <= fim; k++) citadas.add(k);
    i = fim;
  }
  return citadas;
}

/**
 * Linhas que iniciam de fato os artigos da própria norma: a maior sequência crescente de
 * numeração (Art. 10 < 10-A < 11). Artigos de OUTRAS leis citados dentro de um artigo
 * alterador ("passa a vigorar com a redação…") ficam fora dela e continuam no texto do artigo.
 */
function linhasDeArtigos(linhas: string[]): Set<number> {
  // Artigo de outra lei reproduzido entre aspas vale quase nada: só entra na cadeia se não disputar lugar com artigo da própria norma
  // (Lei 14.973/2024: os arts. 22-A a 22-E citados da Lei 13.988 tomavam o lugar dos arts. 20 e 21).
  const citadas = linhasCitadas(linhas);
  const cand: { i: number; k: number; n: number; peso: number }[] = [];
  linhas.forEach((l, i) => {
    const peso = citadas.has(i) ? PESO_CITADO : 1;
    const m = RE_ARTIGO.exec(l);
    if (m) { cand.push({ i, k: chaveArtigo(numeroArtigo(m[1]), m[2]), n: Number(numeroArtigo(m[1])), peso }); return; }
    const c = clausulaDaLinha(l);
    if (c) cand.push({ i, k: chaveArtigo(String(c.numero), c.sufixo), n: c.numero, peso });
  });
  // Cadeia crescente de maior "pontuação": cada artigo vale 1 e um salto grande de numeração
  // (ex.: 165 → 323-G) custa 40. Assim a sequência real (densa) vence uma sequência de artigos
  // citados de outra lei, mesmo quando esta é mais longa que o fim da norma.
  const SALTO = 10;
  const CUSTO = 40;
  // Artigo inicial da cadeia: normas começam em números baixos; começar em 208-A é sinal de citação.
  const dp: number[] = cand.map((c) => c.peso - (c.n > SALTO ? CUSTO : 0));
  const pai: number[] = new Array(cand.length).fill(-1);
  for (let j = 0; j < cand.length; j++) {
    for (let i = 0; i < j; i++) {
      if (cand[i].k >= cand[j].k) continue;
      const v = dp[i] + cand[j].peso - (cand[j].n - cand[i].n > SALTO ? CUSTO : 0);
      if (v > dp[j]) { dp[j] = v; pai[j] = i; }
    }
  }
  let melhor = -1;
  dp.forEach((v, j) => { if (melhor < 0 || v > dp[melhor]) melhor = j; });
  const aceitos = new Set<number>();
  for (let x = melhor; x >= 0; x = pai[x]) aceitos.add(cand[x].i);
  return aceitos;
}

/** Anexo acima disto é dividido em partes (o índice de busca lê os primeiros 200 mil caracteres de cada dispositivo). */
const LIMITE_ANEXO_INTEIRO = 40_000;
const TAMANHO_PARTE_ANEXO = 15_000;

/** Linhas do anexo em partes de até TAMANHO_PARTE_ANEXO caracteres, sem quebrar linha; a primeira leva o título do anexo. */
function partesDoAnexo(linhas: string[]): string[] {
  const partes: string[] = [];
  let atual: string[] = [];
  let tamanho = 0;
  for (const l of linhas) {
    if (tamanho + l.length > TAMANHO_PARTE_ANEXO && atual.length) {
      partes.push(atual.join('\n').trim());
      atual = [];
      tamanho = 0;
    }
    atual.push(l);
    tamanho += l.length + 1;
  }
  if (atual.length) partes.push(atual.join('\n').trim());
  return partes.filter(Boolean);
}

const LIMITE_REDACOES = 10;
const LIMITE_CARACTERES_REDACAO = 2000;

/** Preenche o que se lê do próprio texto: revogação, notas de alteração, remissões e temas. */
function completar(d: DispositivoExtraido, riscados: string[]) {
  // "Art. 540. Ficam revogados os seguintes dispositivos..." é artigo em vigor que revoga outros; só vale a nota "(Revogado...)" sem texto operativo.
  const s = situacaoDoDispositivo(d.texto);
  d.revogado = s.revogado;
  d.parcialmente_revogado = !d.revogado && s.parcialmente_revogado;
  d.revogado_por = d.revogado || d.parcialmente_revogado ? s.revogado_por : null;
  d.alteracoes = marcasUnicas(marcasDoTexto(d.texto)).slice(0, 14);
  d.remissoes = remissoesDoTexto(d.texto).slice(0, 12);
  d.temas = d.revogado ? [] : temasDoTexto(d.texto);
  // O que estava riscado fica como redação anterior, sem o que já é o próprio texto vigente.
  const plano = d.texto.replace(/\s+/g, ' ');
  d.redacoes_anteriores = [...new Set(riscados)]
    .filter((r) => !plano.includes(r))
    .slice(0, LIMITE_REDACOES)
    .map((r) => r.slice(0, LIMITE_CARACTERES_REDACAO));
}

function extrairSegmento(linhas: string[], prefixo: string, ordemBase: number, riscados: string[][]): DispositivoExtraido[] {
  const aceitos = linhasDeArtigos(linhas);
  const saida: DispositivoExtraido[] = [];
  const niveis: (string | null)[] = [null, null, null, null, null];
  let atual: { d: DispositivoExtraido; linhas: string[]; riscados: string[] } | null = null;
  let paiAnexo = '';
  let ultimoAnexo = 0;
  const usados = new Map<string, number>();

  const novo = (base: Pick<DispositivoExtraido, 'tipo' | 'rotulo' | 'caminho' | 'ordem' | 'secao' | 'texto' | 'revogado'>): DispositivoExtraido => ({
    ...base, parcialmente_revogado: false, revogado_por: null, alteracoes: [], redacoes_anteriores: [], remissoes: [], temas: [],
  });
  const fechar = () => {
    if (!atual) return;
    atual.d.texto = atual.linhas.join('\n').trim();
    // Anexo enorme (tabelas de NCM dos regulamentos): vira partes de até ~15 mil caracteres, para a busca alcançar o anexo inteiro e a
    // IA receber só a parte que interessa. A primeira parte fica com o endereço do anexo (citações antigas continuam valendo).
    if (atual.d.tipo === 'anexo' && atual.d.texto.length > LIMITE_ANEXO_INTEIRO) {
      const pedacos = partesDoAnexo(atual.linhas);
      pedacos.forEach((pedaco, k) => {
        const d: DispositivoExtraido = k === 0
          ? { ...atual!.d, texto: pedaco }
          : novo({ tipo: 'anexo', rotulo: `${atual!.d.rotulo} (continuação ${k + 1})`, caminho: caminhoUnico(`${atual!.d.caminho}-t${k + 1}`), ordem: atual!.d.ordem + k, secao: atual!.d.secao, texto: pedaco, revogado: false });
        completar(d, k === 0 ? atual!.riscados : []);
        saida.push(d);
      });
      atual = null;
      return;
    }
    completar(atual.d, atual.riscados);
    saida.push(atual.d);
    atual = null;
  };
  const caminhoUnico = (base: string) => {
    const n = (usados.get(base) ?? 0) + 1;
    usados.set(base, n);
    return n === 1 ? base : `${base}-r${n}`;
  };
  const secaoAtual = () => niveis.filter(Boolean).join(' › ') || null;

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const asx = RE_ANEXO.exec(l);
    if (asx && l.startsWith('ANEXO') && (l.length <= 60 || (l.length <= 200 && /\(\s*(?:Revogad|Reda[çc]|Inclu[íi]d|Vetad)/i.test(l)))) {
      fechar();
      const id = asx[1].toUpperCase().replace('Ú', 'U');
      const valor = romano(id);
      // Anexo cujo número volta atrás (I, II… depois do XVIII) é subanexo do anterior.
      const sub = paiAnexo && valor > 0 && valor <= ultimoAnexo;
      if (!sub) { paiAnexo = id; ultimoAnexo = valor; }
      const rotulo = sub ? `Anexo ${paiAnexo} › Anexo ${id}` : `Anexo ${id}`;
      const base = sub ? `anexo-${paiAnexo.toLowerCase()}-${id.toLowerCase()}` : `anexo-${id.toLowerCase()}`;
      atual = {
        d: novo({ tipo: 'anexo', rotulo, caminho: caminhoUnico(prefixo ? `${prefixo}-${base}` : base), ordem: ordemBase + saida.length + 1, secao: 'Anexos', texto: '', revogado: false }),
        linhas: [l],
        riscados: [...(riscados[i] ?? [])],
      };
      continue;
    }
    {
      const ma = aceitos.has(i) ? RE_ARTIGO.exec(l) : null;
      if (ma) {
        fechar();
        const num = numeroArtigo(ma[1]);
        const suf = ma[2] ? `-${ma[2]}` : '';
        const exibido = Number(num) >= 1000 ? Number(num).toLocaleString('pt-BR') : num;
        atual = {
          d: novo({ tipo: 'artigo', rotulo: `${prefixo ? 'ADCT, ' : ''}Art. ${exibido}${Number(num) <= 9 && !suf ? 'º' : ''}${suf}`, caminho: caminhoUnico(`${prefixo ? `${prefixo}-` : ''}art-${num}${suf.toLowerCase()}`), ordem: ordemBase + saida.length + 1, secao: prefixo ? `ADCT${secaoAtual() ? ' › ' + secaoAtual() : ''}` : secaoAtual(), texto: '', revogado: false }),
          linhas: [l],
          riscados: [...(riscados[i] ?? [])],
        };
        continue;
      }
      const mc = aceitos.has(i) ? clausulaDaLinha(l) : null;
      if (mc) {
        fechar();
        const base = `clausula-${mc.numero}${mc.sufixo ? `-${mc.sufixo.toLowerCase()}` : ''}`;
        atual = {
          d: novo({ tipo: 'clausula', rotulo: mc.rotulo, caminho: caminhoUnico(prefixo ? `${prefixo}-${base}` : base), ordem: ordemBase + saida.length + 1, secao: secaoAtual(), texto: '', revogado: false }),
          linhas: [l],
          riscados: [...(riscados[i] ?? [])],
        };
        continue;
      }
      const ms = RE_SECAO.exec(l);
      if (ms && l.length < 160) {
        const nivel = NIVEL[semAcento(ms[1]).toUpperCase()];
        let nome = ms[3].replace(/\((?:Inclu[íi]d|Reda[çc]|Revogad|Vide|Vig)[^)]*\)/gi, '').replace(/^[-–—:.\s]+/, '').trim();
        // Nome na(s) linha(s) seguinte(s); linhas só com anotação "(Incluído pela…)" são puladas.
        while (!nome && linhas[i + 1] !== undefined) {
          const prox = linhas[i + 1].trim();
          if (/^\((?:Inclu[íi]d|Reda[çc]|Revogad|Vide|Vig)[^)]*\)$/i.test(prox)) { i += 1; continue; }
          if (!RE_ARTIGO.test(prox) && !RE_SECAO.test(prox) && prox.length < 160) { nome = prox; i += 1; }
          break;
        }
        for (let k = nivel; k < niveis.length; k++) niveis[k] = null;
        niveis[nivel] = `${cap(ms[1])} ${ms[2].toUpperCase()}${nome ? ` — ${nome}` : ''}`;
        continue;
      }
    }
    if (atual) {
      atual.linhas.push(l);
      if (riscados[i]?.length) atual.riscados.push(...riscados[i]);
    }
  }
  fechar();
  return saida;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Decodifica o corpo baixado (o Planalto serve windows-1252) para texto. */
export function decodificar(buf: Buffer): string {
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(buf);
}
