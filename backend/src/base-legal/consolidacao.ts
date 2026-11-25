/**
 * Alterações que um ato faz em outras normas e que o texto compilado delas ainda pode não trazer. O Planalto compila com atraso:
 * uma lei nova já vale, mas o "texto compilado" da norma alterada só ganha as notas "(Redação dada pela...)" dias ou semanas
 * depois. Nesse intervalo, citar o texto compilado é citar texto superado. Funções puras: leem o texto dos artigos do ato alterador
 * ("A Lei Complementar nº 214, de 16 de janeiro de 2025, passa a vigorar com as seguintes alterações:") e comparam com as notas
 * que a norma alterada já registra.
 */
import { semRiscado } from './base-legal.parser';
import { atoDoTexto, type AtoNormativo } from './marcas';

export type ArtigoDoAto = { tipo: string; rotulo: string; caminho: string; texto: string };

export type AlteracaoDoAto = {
  alvo: AtoNormativo;
  tipo: 'alteracao' | 'revogacao';
  /** Revoga a norma inteira (e não só artigos dela). */
  integral: boolean;
  /** Artigos da norma alvo que o ato diz alterar, incluir ou revogar ("art-174", "art-87-b"). */
  artigos: string[];
  /** Artigos do próprio ato que fazem a alteração ("Art. 174"). */
  do_ato: string[];
};

const RE_ALTERA = /\bpassa(?:m)?\s+a\s+vigorar\b|\bpassa(?:m)?\s+a\s+ter\s+a\s+seguinte\s+reda[cç][aã]o\b|\b(?:fica(?:m)?|s[aã]o)\s+(?:acrescid|acrescentad|inclu[ií]d)[oa]s?\b/i;
const RE_REVOGA = /^[^.:;]{0,80}?\b(?:fica(?:m)?\s+revogad[oa]s?|revoga(?:m)?-se|s[aã]o\s+revogad[oa]s?|[eé]\s+revogad[oa])\b/i;
const PREFIXO_ARTIGO = /^\s*Art\.?\s*\d+\s*(?:º|°|o\b)?(?:-[A-Z]{1,3})?\s*[.\-–—]?\s*/;
const RE_INICIO_ATO = /\b(?:Lei Complementar|Lei Delegada|Decreto[- ]Lei|Decreto Legislativo|Decreto|Medida Provis[óo]ria|Emenda Constitucional|Emenda à Constitui[çc][ãa]o|Lei|LC|EC|MP)\s*(?:n[ºo°.]{0,2}\s*)?\d/i;
const MAX_FAIXA = 30;

const caminhoDe = (numero: string, sufixo?: string) => `art-${Number(numero)}${sufixo ? `-${sufixo.toLowerCase()}` : ''}`;
/** "art-30-a" → "Art. 30-A". */
export const rotuloDoCaminho = (caminho: string): string => {
  const m = /^art-(\d+)(?:-([a-z]{1,3}))?$/.exec(caminho);
  return m ? `Art. ${m[1]}${m[2] ? `-${m[2].toUpperCase()}` : ''}` : caminho;
};

/** Artigos citados em um trecho ("art. 13", "arts. 3º, 4º e 5º", "arts. 3º a 5º", "art. 87-B"), como caminhos. */
export function artigosCitados(trecho: string): string[] {
  const saida: string[] = [];
  const NUM = String.raw`\d+(?:\s*(?:º|°|o\b))?(?:-[A-Z]{1,3}\b)?`;
  const RE_BLOCO = new RegExp(String.raw`\bart(?:s|igos?)?\.?\s*(${NUM}(?:(?:\s*,\s*|\s+e\s+|\s+a\s+|\s+ao\s+)${NUM})*)`, 'gi');
  for (const m of trecho.matchAll(RE_BLOCO)) {
    const bloco = m[1];
    const faixa = /^\s*(\d+)\s*(?:º|°|o\b)?\s+a(?:o)?\s+(\d+)\s*(?:º|°|o\b)?\s*$/i.exec(bloco);
    if (faixa && Number(faixa[2]) >= Number(faixa[1]) && Number(faixa[2]) - Number(faixa[1]) < MAX_FAIXA) {
      for (let n = Number(faixa[1]); n <= Number(faixa[2]); n++) saida.push(caminhoDe(String(n)));
      continue;
    }
    for (const n of bloco.matchAll(/(\d+)\s*[º°o]?(?:-([A-Z]{1,3})\b)?/g)) saida.push(caminhoDe(n[1], n[2]));
  }
  return saida;
}

/** Artigos inteiros reproduzidos entre aspas no corpo da alteração ("“Art. 13. ......” (NR)"): o que ficará com texto novo na norma alvo. */
function artigosEntreAspas(linhas: string[]): string[] {
  const saida: string[] = [];
  for (const l of linhas) {
    const m = /^\s*[“"]\s*Art\.?\s*(\d+)\s*(?:º|°|o\b)?(?:-([A-Z]{1,3})\b)?/.exec(l);
    if (m) saida.push(caminhoDe(m[1], m[2]));
  }
  return saida;
}

const unico = <T>(xs: T[]): T[] => [...new Set(xs)];

/** Tira "na redação dada pelo art. 517 da Lei Complementar nº 214..." e notas entre parênteses: o ato que aparece aí não é o alvo. */
const semRedacaoDada = (l: string) => l.replace(/,?\s*na\s+reda[cç][aã]o\s+dada\b.*$/i, '').replace(/\([^)]*\)/g, ' ');

/** O que o ato altera e revoga em outras normas, lido dos seus artigos (caput de cada artigo alterador e as cláusulas de revogação). */
export function alteracoesDoAto(artigos: ArtigoDoAto[]): AlteracaoDoAto[] {
  const mapa = new Map<string, AlteracaoDoAto>();
  const somar = (alvo: AtoNormativo, tipo: 'alteracao' | 'revogacao', integral: boolean, caminhos: string[], doAto: string) => {
    const chave = `${alvo.referencia}|${tipo}`;
    const atual = mapa.get(chave) ?? { alvo, tipo, integral: false, artigos: [], do_ato: [] };
    atual.integral = atual.integral || integral;
    atual.artigos = unico([...atual.artigos, ...caminhos]);
    atual.do_ato = unico([...atual.do_ato, doAto]);
    mapa.set(chave, atual);
  };

  for (const a of artigos) {
    if (a.tipo !== 'artigo') continue;
    const linhas = semRiscado(a.texto).split('\n').map((l) => l.trim()).filter(Boolean);
    if (!linhas.length) continue;
    const caput = linhas[0].replace(PREFIXO_ARTIGO, '');

    if (RE_ALTERA.test(caput)) {
      const semParenteses = semRedacaoDada(caput);
      const alvo = atoDoTexto(semParenteses);
      if (!alvo) continue;
      // Os artigos do alvo que o caput nomeia ("O § 1º do art. 13 da Lei...") vêm antes da menção ao ato.
      const inicioDoAto = semParenteses.search(RE_INICIO_ATO);
      const antes = inicioDoAto > 0 ? semParenteses.slice(0, inicioDoAto) : '';
      somar(alvo, 'alteracao', false, [...artigosCitados(antes), ...artigosEntreAspas(linhas.slice(1))], a.rotulo);
      continue;
    }

    if (RE_REVOGA.test(caput)) {
      // Cada inciso diz o que revoga; as alíneas herdam a norma do inciso que as abre.
      let atual: AtoNormativo | null = null;
      const linhasRevogacao = [caput, ...linhas.slice(1)];
      linhasRevogacao.forEach((bruta, i) => {
        const l = semRedacaoDada(bruta);
        const ehInciso = /^\s*[IVXLCDM]+\s*[-–—]/.test(l);
        const ehAlinea = /^\s*[a-z]\)/.test(l);
        const ato = atoDoTexto(l);
        if (i === 0 || ehInciso || ato) atual = ato ?? (ehAlinea ? atual : null);
        if (!atual) return;
        const alvo: AtoNormativo = atual;
        const caminhos = artigosCitados(l);
        const cabecalho = /dispositivos|:\s*$/.test(l);
        if (caminhos.length) somar(alvo, 'revogacao', false, caminhos, a.rotulo);
        else if (ato && !cabecalho && !/\b(?:§|inciso|par[áa]grafo|al[íi]nea|item)\b/i.test(l)) somar(alvo, 'revogacao', true, [], a.rotulo);
      });
    }
  }
  return [...mapa.values()];
}

export type AtoAlterador = { chave: string; numero: string; referencia: string; url_oficial: string; alteracoes: AlteracaoDoAto[] };
export type AlvoCarregado = { chave: string; numero: string; referencia: string; situacao: string; atos_modificadores: { referencia?: string | null }[] };

export type PendenciaConsolidacao = {
  ato: { chave: string; numero: string; referencia: string; url_oficial: string };
  alvo: { chave: string; numero: string; referencia: string };
  tipos: ('alteracao' | 'revogacao')[];
  integral: boolean;
  /** Artigos do alvo que o ato mexe, como caminhos. */
  artigos: string[];
  /** Artigos do ato que fazem a alteração. */
  do_ato: string[];
};

/**
 * Alterações feitas por atos que a base tem e que a norma alterada (também na base) ainda não registra: nenhuma nota do texto
 * compilado da norma alvo cita o ato. O critério é o ato inteiro, e não artigo a artigo, para não confundir imprecisão da leitura
 * com texto desatualizado.
 */
export function pendenciasDeConsolidacao(atos: AtoAlterador[], alvos: AlvoCarregado[]): PendenciaConsolidacao[] {
  const porReferencia = new Map(alvos.map((a) => [a.referencia, a]));
  const saida: PendenciaConsolidacao[] = [];
  for (const ato of atos) {
    const porAlvo = new Map<string, AlteracaoDoAto[]>();
    for (const alt of ato.alteracoes) porAlvo.set(alt.alvo.referencia, [...(porAlvo.get(alt.alvo.referencia) ?? []), alt]);
    for (const [ref, alteracoes] of porAlvo) {
      const alvo = porReferencia.get(ref);
      if (!alvo || alvo.chave === ato.chave || alvo.referencia === ato.referencia) continue;
      if (alvo.atos_modificadores.some((m) => m.referencia === ato.referencia)) continue;
      const integral = alteracoes.some((a) => a.integral);
      // Revogação da norma inteira já refletida: o texto oficial da alvo a dá como revogada.
      if (integral && alvo.situacao === 'revogada' && alteracoes.every((a) => a.tipo === 'revogacao')) continue;
      saida.push({
        ato: { chave: ato.chave, numero: ato.numero, referencia: ato.referencia, url_oficial: ato.url_oficial },
        alvo: { chave: alvo.chave, numero: alvo.numero, referencia: alvo.referencia },
        tipos: unico(alteracoes.map((a) => a.tipo)),
        integral,
        artigos: unico(alteracoes.flatMap((a) => a.artigos)),
        do_ato: unico(alteracoes.flatMap((a) => a.do_ato)),
      });
    }
  }
  return saida;
}
