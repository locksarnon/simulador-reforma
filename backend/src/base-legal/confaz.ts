import { decodificarEntidades, htmlParaTexto } from './base-legal.parser';

/**
 * Convênios, ajustes e protocolos publicados pelo Confaz. A página vem por cláusulas e cada parágrafo traz a classe do que ele é:
 * texto vigente (TextoAcordo), nota da redação atual (Remisso), redação anterior (RedaoAnt) e a nota dela (RemissoAnt); nas tabelas
 * dos anexos, as linhas "verde" são a redação anterior. Aqui a página é remontada no formato que o leitor das normas já entende:
 * cada item em um parágrafo, a nota no fim do item a que se refere (entre parênteses, como no Planalto) e a redação anterior riscada,
 * junto do texto que a substituiu. Assim ela nunca entra no texto vigente e fica guardada como redação anterior do dispositivo certo.
 */
export function ehPaginaConfaz(html: string): boolean {
  return /class="(?:A\d+(?:-\d+)?)?TextoAcordo"/i.test(html) && /class="(?:A\d+(?:-\d+)?)?(?:TituloAcordo|AcordoTipo|Remiss[a-z]*|Reda[a-z]*Ant)"/i.test(html);
}

/** Primeiro parágrafo do conteúdo (título, publicação, ementa ou texto): o que vem antes é menu do portal. */
const RE_INICIO_CONTEUDO = /<p[^>]*class="(?:A\d+(?:-\d+)?)?(?:TituloAcordo|DataPublica[a-z]*|Ementa|TextoAcordo)"/i;

/** Texto em linhas de uma página oficial, com o riscado marcado (Planalto, CGIBS... e, remontada antes, a do Confaz). */
export function textoDaPagina(html: string): string {
  return htmlParaTexto(ehPaginaConfaz(html) ? confazParaHtml(html) : html);
}

type TipoBloco = 'texto' | 'nota' | 'antigo' | 'cabecalho';

const textoDoHtml = (s: string) => decodificarEntidades(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tipoDaClasse(classes: string[]): TipoBloco {
  if (classes.some((c) => /verde|Ant$/i.test(c))) return 'antigo';
  if (classes.some((c) => /Remiss/i.test(c))) return 'nota';
  if (classes.some((c) => /DataPubli|TituloAcordo|Ementa|AcordoTipo/i.test(c))) return 'cabecalho';
  return 'texto';
}

const NOME_DO_ATO: Record<string, string> = { 'conv.': 'Convênio', 'convênio': 'Convênio', convenio: 'Convênio', ajuste: 'Ajuste', protocolo: 'Protocolo', 'prot.': 'Protocolo' };
const anoCheio = (ano: string) => (ano.length === 4 ? ano : String((Number(ano) > 30 ? 1900 : 2000) + Number(ano)));

/** "Conv. ICMS 99/04" → "Convênio ICMS nº 99, de 2004" (a forma que o leitor de atos reconhece). */
export function atosDoConfaz(texto: string): string {
  return texto.replace(
    /\b(Conv\.|Conv[êe]nio|Ajuste|Protocolo|Prot\.)\s*(ICMS|SINIEF|ECF)?\s*(?:n[ºo°.]{0,2}\s*)?(\d{1,4})\s*\/\s*(\d{4}|\d{2})(?!\d)/gi,
    (_, tipo: string, orgao: string | undefined, numero: string, ano: string) =>
      `${NOME_DO_ATO[tipo.toLowerCase()] ?? tipo}${orgao ? ` ${orgao.toUpperCase()}` : ''} nº ${Number(numero)}, de ${anoCheio(ano)}`,
  );
}

/**
 * Nota do Confaz → nota entre parênteses no padrão do Planalto, para virar marca de alteração com o ato:
 * "Nova redação dada ao inciso I ... pelo Conv. ICMS 99/04, efeitos a partir de 19.10.04." →
 * "(Redação dada ao inciso I ... pelo Convênio ICMS nº 99, de 2004, efeitos a partir de 19.10.04)".
 */
export function notaDoConfaz(texto: string): string {
  let s = atosDoConfaz(texto.replace(/\(/g, '[').replace(/\)/g, ']').replace(/\s+/g, ' ').trim().replace(/[.;:]+$/, ''));
  if (/^Nova reda[çc][ãa]o/i.test(s)) s = s.replace(/^Nova reda[çc][ãa]o(?:\s+dada)?/i, 'Redação dada');
  else if (/^Prorrogad/i.test(s)) s = `Vigência: ${s}`;
  else if (!/^(Acrescid|Inclu[íi]d|Revogad|Renumerad|Suprimid|Vide|Reda[çc][ãa]o dada|Vig[êe]ncia)/i.test(s)) s = `Vide: ${s}`;
  return `(${s})`;
}

/** "II - REVOGADO", "Cláusula terceira REVOGADA": sobra o marcador; o aviso (com o ato) vem da nota. */
function semPalavraRevogado(texto: string): string | null {
  const m = /^(.*?)\s*\(?\s*REVOGAD[OA]S?\s*\)?\s*[.;]?$/.exec(texto);
  return m && m[1].length <= 40 ? m[1].trim() : null;
}

/** Remonta a página do Confaz como HTML simples (ver ehPaginaConfaz). */
export function confazParaHtml(html: string): string {
  const inicio = html.search(RE_INICIO_CONTEUDO);
  let regiao = inicio >= 0 ? html.slice(inicio) : html;
  const fim = regiao.search(/<div[^>]*id="(?:viewlet-below-content|portal-footer|portal-footer-wrapper)"|<footer\b/i);
  if (fim > 0) regiao = regiao.slice(0, fim);
  regiao = regiao.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

  const blocos: { tipo: TipoBloco; texto: string }[] = [];
  for (const m of regiao.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>|<(p|h[1-6])\b([^>]*)>([\s\S]*?)<\/\2>/gi)) {
    if (m[1] !== undefined) {
      const celulas = [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => textoDoHtml(c[1])).filter(Boolean);
      if (!celulas.length) continue;
      blocos.push({ tipo: tipoDaClasse([...m[1].matchAll(/class="([^"]+)"/gi)].map((c) => c[1])), texto: celulas.join(' | ') });
      continue;
    }
    const texto = textoDoHtml(m[4]);
    if (texto) blocos.push({ tipo: tipoDaClasse([/class="([^"]+)"/i.exec(m[3])?.[1] ?? '']), texto });
  }

  const linhas: string[] = [];
  let notas: string[] = [];
  let ultimoTexto = -1;
  for (const b of blocos) {
    if (b.tipo === 'nota') { notas.push(notaDoConfaz(b.texto)); continue; }
    if (b.tipo === 'antigo') {
      const riscado = `<strike>${escapar(b.texto)}</strike>`;
      if (ultimoTexto >= 0) linhas[ultimoTexto] += ` ${riscado}`;
      else linhas.push(riscado);
      continue;
    }
    if (b.tipo === 'cabecalho') {
      linhas.push(escapar(/^Revogad/i.test(b.texto) ? notaDoConfaz(b.texto) : b.texto));
      continue;
    }
    let texto = b.texto;
    const marcador = semPalavraRevogado(texto);
    if (marcador !== null) {
      texto = marcador;
      if (!notas.some((n) => /^\(Revogad/i.test(n))) notas.push(/^Cl[áa]usula/i.test(marcador) ? '(Revogada)' : '(Revogado)');
    }
    linhas.push(escapar([texto, ...notas].filter(Boolean).join(' ')));
    notas = [];
    ultimoTexto = linhas.length - 1;
  }
  if (notas.length) linhas.push(escapar(notas.join(' ')));
  return linhas.map((l) => `<p>${l}</p>`).join('\n');
}
