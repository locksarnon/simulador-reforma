/** Formatação dos dados do DANFE (pt-BR). Tudo recebe o texto do XML e devolve texto pronto, vazio quando não há valor. */

/** CNPJ (inclusive alfanumérico) ou CPF com a pontuação de costume; outro texto passa como está. */
export function fmtDocumento(doc: string): string {
  const d = String(doc ?? '').trim().toUpperCase();
  if (/^[0-9A-Z]{14}$/.test(d)) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (/^[0-9]{11}$/.test(d)) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
}

/** Número do XML ("1234.5600") em pt-BR, com no mínimo e no máximo de casas; vazio se não for número. */
export function fmtNumero(valor: string | undefined, min = 2, max = min): string {
  const texto = String(valor ?? '').trim();
  if (texto === '') return '';
  const n = Number(texto);
  if (!Number.isFinite(n)) return texto;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
}

/** Como fmtNumero, mas vazio também quando o valor é zero (colunas que só aparecem quando há imposto ou desconto). */
export function fmtNumeroSeHouver(valor: string | undefined, min = 2, max = min): string {
  const n = Number(String(valor ?? '').trim());
  return Number.isFinite(n) && n !== 0 ? fmtNumero(valor, min, max) : '';
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}(?::\d{2})?))?/;

/** Data como está no XML (sem converter o fuso), em dd/mm/aaaa. */
export function fmtData(iso: string | undefined): string {
  const m = ISO.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Hora como está no XML (sem converter o fuso), em hh:mm:ss. */
export function fmtHora(iso: string | undefined): string {
  const m = ISO.exec(String(iso ?? ''));
  if (!m || !m[4]) return '';
  return m[4].length === 5 ? `${m[4]}:00` : m[4];
}

/** Chave de acesso em grupos de 4 dígitos. */
export function fmtChave(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Número da nota com 9 dígitos e pontos: 000.000.123. */
export function fmtNumeroNota(n: string): string {
  const d = String(n ?? '').replace(/\D/g, '').padStart(9, '0');
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
}

export function fmtCep(cep: string): string {
  const d = String(cep ?? '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function fmtFone(fone: string): string {
  const d = String(fone ?? '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return d;
}

/**
 * Texto que a fonte padrão do PDF (WinAnsi) sabe desenhar: espaços repetidos e quebras viram um espaço, e o que ficar fora do
 * conjunto vira "?". Com `quebras` as quebras de linha são mantidas (campos de texto livre, como as informações complementares).
 */
export function limparTexto(texto: string | undefined, quebras = false): string {
  const base = String(texto ?? '').replace(/\r\n?/g, '\n');
  const linhas = quebras ? base.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()) : [base.replace(/\s+/g, ' ').trim()];
  return linhas.join('\n').replace(/[^\n -~ -ÿ–—‘’“”•…€]/g, '?').trim();
}
