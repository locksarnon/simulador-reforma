import { createHash } from 'crypto';

/** Dispositivo extraído do texto de uma norma (artigo ou anexo). */
export type DispositivoExtraido = {
  tipo: 'artigo' | 'anexo';
  rotulo: string;
  caminho: string;
  ordem: number;
  secao: string | null;
  texto: string;
  revogado: boolean;
};

const ENTIDADES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordm: 'º', ordf: 'ª', sect: '§',
  ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', otilde: 'õ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  agrave: 'à', acirc: 'â', ecirc: 'ê', ocirc: 'ô', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  Atilde: 'Ã', Otilde: 'Õ', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô', ndash: '–', mdash: '—', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', hellip: '…', deg: '°',
};

function decodificarEntidades(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, nome) => ENTIDADES[nome] ?? m);
}

/**
 * HTML do Planalto → texto em linhas. Descarta o que está riscado (redação
 * revogada/alterada; o texto vigente vem depois, com "Redação dada por…").
 */
export function htmlParaTexto(html: string): string {
  let h = html
    .replace(/\s+/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(strike|s|del)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  h = decodificarEntidades(h).replace(/ /g, ' ');
  return h
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').replace(/(\s\|)+\s*$/, '').trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

const RE_ARTIGO = /^Art\.\s*(\d+)\s*(?:º|°|o\b|\.)?\s*(?:-\s*([A-Z]{1,3})\b)?/;
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

/** Divide o texto de uma norma em artigos e anexos, guardando o caminho (Título › Capítulo…). */
export function extrairDispositivos(texto: string): DispositivoExtraido[] {
  const linhas = texto.split('\n');
  // Constituição: o ADCT tem numeração própria (Art. 1º…) — é tratado como um segundo bloco.
  const iAdct = linhas.findIndex((l) => /^ATO DAS DISPOSI[ÇC][ÕO]ES CONSTITUCIONAIS TRANSIT[ÓO]RIAS$/.test(l.trim()));
  if (iAdct > 0) {
    const corpo = extrairSegmento(linhas.slice(0, iAdct), '', 0);
    const adct = extrairSegmento(linhas.slice(iAdct + 1), 'adct', corpo.length);
    return [...corpo, ...adct];
  }
  return extrairSegmento(linhas, '', 0);
}

const chaveArtigo = (num: string, suf?: string) => {
  let v = 0;
  for (const c of (suf ?? '').toUpperCase()) v = v * 27 + (c.charCodeAt(0) - 64);
  return Number(num) * 100000 + v;
};

/**
 * Linhas que iniciam de fato os artigos da própria norma: a maior sequência crescente de
 * numeração (Art. 10 < 10-A < 11). Artigos de OUTRAS leis citados dentro de um artigo
 * alterador ("passa a vigorar com a redação…") ficam fora dela e continuam no texto do artigo.
 */
function linhasDeArtigos(linhas: string[]): Set<number> {
  const cand: { i: number; k: number; n: number }[] = [];
  linhas.forEach((l, i) => {
    const m = RE_ARTIGO.exec(l);
    if (m) cand.push({ i, k: chaveArtigo(m[1], m[2]), n: Number(m[1]) });
  });
  // Cadeia crescente de maior "pontuação": cada artigo vale 1 e um salto grande de numeração
  // (ex.: 165 → 323-G) custa 40. Assim a sequência real (densa) vence uma sequência de artigos
  // citados de outra lei, mesmo quando esta é mais longa que o fim da norma.
  const SALTO = 10;
  const CUSTO = 40;
  // Artigo inicial da cadeia: normas começam em números baixos; começar em 208-A é sinal de citação.
  const dp: number[] = cand.map((c) => 1 - (c.n > SALTO ? CUSTO : 0));
  const pai: number[] = new Array(cand.length).fill(-1);
  for (let j = 0; j < cand.length; j++) {
    for (let i = 0; i < j; i++) {
      if (cand[i].k >= cand[j].k) continue;
      const v = dp[i] + 1 - (cand[j].n - cand[i].n > SALTO ? CUSTO : 0);
      if (v > dp[j]) { dp[j] = v; pai[j] = i; }
    }
  }
  let melhor = -1;
  dp.forEach((v, j) => { if (melhor < 0 || v > dp[melhor]) melhor = j; });
  const aceitos = new Set<number>();
  for (let x = melhor; x >= 0; x = pai[x]) aceitos.add(cand[x].i);
  return aceitos;
}

function extrairSegmento(linhas: string[], prefixo: string, ordemBase: number): DispositivoExtraido[] {
  const aceitos = linhasDeArtigos(linhas);
  const saida: DispositivoExtraido[] = [];
  const niveis: (string | null)[] = [null, null, null, null, null];
  let atual: { d: DispositivoExtraido; linhas: string[] } | null = null;
  let paiAnexo = '';
  let ultimoAnexo = 0;
  const usados = new Map<string, number>();

  const fechar = () => {
    if (!atual) return;
    atual.d.texto = atual.linhas.join('\n').trim();
    atual.d.revogado = /^Art\.[^\n]{0,14}\(?\s*Revogad[oa]/i.test(atual.d.texto);
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
    if (asx && l.length <= 60 && l.startsWith('ANEXO')) {
      fechar();
      const id = asx[1].toUpperCase().replace('Ú', 'U');
      const valor = romano(id);
      // Anexo cujo número volta atrás (I, II… depois do XVIII) é subanexo do anterior.
      const sub = paiAnexo && valor > 0 && valor <= ultimoAnexo;
      if (!sub) { paiAnexo = id; ultimoAnexo = valor; }
      const rotulo = sub ? `Anexo ${paiAnexo} › Anexo ${id}` : `Anexo ${id}`;
      const base = sub ? `anexo-${paiAnexo.toLowerCase()}-${id.toLowerCase()}` : `anexo-${id.toLowerCase()}`;
      atual = {
        d: { tipo: 'anexo', rotulo, caminho: caminhoUnico(prefixo ? `${prefixo}-${base}` : base), ordem: ordemBase + saida.length + 1, secao: 'Anexos', texto: '', revogado: false },
        linhas: [l],
      };
      continue;
    }
    {
      const ma = aceitos.has(i) ? RE_ARTIGO.exec(l) : null;
      if (ma) {
        fechar();
        const num = ma[1];
        const suf = ma[2] ? `-${ma[2]}` : '';
        atual = {
          d: { tipo: 'artigo', rotulo: `${prefixo ? 'ADCT, ' : ''}Art. ${num}${Number(num) <= 9 && !suf ? 'º' : ''}${suf}`, caminho: caminhoUnico(`${prefixo ? `${prefixo}-` : ''}art-${num}${suf.toLowerCase()}`), ordem: ordemBase + saida.length + 1, secao: prefixo ? `ADCT${secaoAtual() ? ' › ' + secaoAtual() : ''}` : secaoAtual(), texto: '', revogado: false },
          linhas: [l],
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
    if (atual) atual.linhas.push(l);
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
