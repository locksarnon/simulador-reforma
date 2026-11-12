/**
 * Leitura das certidões que o usuário baixa nos portais oficiais (que têm captcha e não oferecem API) e envia ao InTAX:
 * CNDT (TST), CRF do FGTS (Caixa) e certidão federal conjunta RFB/PGFN. O InTAX só lê o texto do PDF; não acessa o portal.
 */
export type TipoCertidao = 'TRABALHISTA' | 'FGTS' | 'PGFN';
export type StatusProcesso = 'PROCESSANDO' | 'CONCLUIDO' | 'IRREGULAR' | 'DEBITOS' | 'INDISPONIVEL' | 'MANUAL';

export type LeituraCertidao = {
  status: StatusProcesso;
  resumo: string;
  situacao: string;
  validade: string | null;
  emissao: string | null;
  numero: string | null;
  documento: string | null;
  confere: boolean;
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const so = (s: string) => s.replace(/\D/g, '');
const DATA = '(\\d{2}\\/\\d{2}\\/\\d{4})';

/** O pdfjs-dist é módulo ES: em produção o import() vira require(), que o Node 22 aceita para módulos ES sem await no topo. */
const PDFJS = 'pdfjs-dist/legacy/build/pdf.mjs';
type PdfJs = { getDocument: (o: Record<string, unknown>) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string }[] }> }>; destroy: () => Promise<void> }> } };

/** Extrai o texto do PDF com o pdfjs-dist (sem rodar scripts do PDF), até 10 páginas. */
export async function textoDoPdf(pdf: Buffer): Promise<string> {
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('O arquivo não é um PDF.');
  const pdfjs = (await import(PDFJS)) as PdfJs;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  try {
    const partes: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      partes.push(c.items.map((x) => x.str ?? '').join(' '));
    }
    return partes.join('\n');
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

function primeiro(texto: string, padroes: RegExp[]): string | null {
  for (const p of padroes) {
    const m = texto.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

/** Converte dd/mm/aaaa em Date no fim do dia (horário de Brasília). */
export function fimDoDia(br: string | null): Date | null {
  if (!br) return null;
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T23:59:59-03:00`) : null;
}

export function interpretarCertidao(tipo: TipoCertidao, textoOriginal: string, cnpj: string, agora = new Date()): LeituraCertidao {
  const t = semAcento(textoOriginal).replace(/\s+/g, ' ').toUpperCase();
  const docs = (t.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) ?? []).map(so);
  const raiz = so(cnpj).slice(0, 8);
  // CNDT e certidão federal valem para a raiz do CNPJ (todos os estabelecimentos); o CRF é por estabelecimento.
  const confere = docs.length === 0 ? false : tipo === 'FGTS' ? docs.includes(so(cnpj)) : docs.some((d) => d.slice(0, 8) === raiz);
  const documento = docs[0] ?? null;

  let situacao = '';
  let regular: boolean | null = null;
  let validade: string | null = null;
  let emissao: string | null = null;
  let numero: string | null = null;

  if (tipo === 'TRABALHISTA') {
    if (!/DEBITOS TRABALHISTAS/.test(t)) return naoReconhecido('CNDT (Certidão Negativa de Débitos Trabalhistas, do TST)');
    if (/POSITIVA DE DEBITOS TRABALHISTAS COM EFEITO DE NEGATIVA|POSITIVA COM EFEITO DE NEGATIVA/.test(t)) { situacao = 'Positiva com efeito de negativa'; regular = true; }
    else if (/CERTIDAO POSITIVA DE DEBITOS TRABALHISTAS/.test(t)) { situacao = 'Positiva (há débitos trabalhistas)'; regular = false; }
    else if (/CERTIDAO NEGATIVA DE DEBITOS TRABALHISTAS/.test(t)) { situacao = 'Negativa'; regular = true; }
    validade = primeiro(t, [new RegExp(`VALIDADE:? ?${DATA}`)]);
    emissao = primeiro(t, [new RegExp(`EXPEDICAO:? ?${DATA}`)]);
    numero = primeiro(t, [/CERTIDAO N[º°O.]*:? ?([\d./-]+)/]);
  } else if (tipo === 'FGTS') {
    if (!/REGULARIDADE DO FGTS|FUNDO DE GARANTIA/.test(t)) return naoReconhecido('CRF (Certificado de Regularidade do FGTS, da Caixa)');
    if (/SITUACAO REGULAR/.test(t)) { situacao = 'Regular'; regular = true; }
    else if (/IRREGULAR/.test(t)) { situacao = 'Irregular'; regular = false; }
    const v = t.match(new RegExp(`VALIDADE:? ?${DATA} ?A ?${DATA}`));
    validade = v ? v[2] : null;
    emissao = v ? v[1] : null;
    numero = primeiro(t, [/CERTIFICACAO NUMERO:? ?([\w-]+)/]);
  } else {
    if (!/TRIBUTOS FEDERAIS|DIVIDA ATIVA DA UNIAO/.test(t)) return naoReconhecido('certidão federal conjunta (Receita Federal e PGFN)');
    if (/POSITIVA COM EFEITOS DE NEGATIVA/.test(t)) { situacao = 'Positiva com efeitos de negativa'; regular = true; }
    else if (/CERTIDAO POSITIVA/.test(t)) { situacao = 'Positiva (há débitos federais ou inscrições em dívida ativa)'; regular = false; }
    else if (/CERTIDAO NEGATIVA/.test(t)) { situacao = 'Negativa'; regular = true; }
    validade = primeiro(t, [new RegExp(`VALIDA ATE ${DATA}`), new RegExp(`VALIDADE:? ?${DATA}`)]);
    emissao = primeiro(t, [new RegExp(`EMITIDA AS [\\d:]+ DO DIA ${DATA}`), new RegExp(`EMITIDA EM ${DATA}`)]);
    numero = primeiro(t, [/CODIGO DE CONTROLE DA CERTIDAO:? ?([A-Z0-9.]+)/]);
  }

  if (regular === null) return { status: 'MANUAL', resumo: 'Não consegui ler a situação no PDF. Confira o documento e anexe de novo, se preciso.', situacao: 'não lida', validade, emissao, numero, documento, confere };
  const venceu = (() => { const v = fimDoDia(validade); return v ? v.getTime() < agora.getTime() : false; })();
  const status: StatusProcesso = !confere ? 'IRREGULAR' : venceu ? 'IRREGULAR' : regular ? 'CONCLUIDO' : 'DEBITOS';
  const partes = [situacao];
  if (validade) partes.push(`válida até ${validade}${venceu ? ' (vencida)' : ''}`);
  if (!confere) partes.push('o CNPJ da certidão não é o desta pré-análise');
  return { status, resumo: partes.join('; '), situacao, validade, emissao, numero, documento, confere };
}

function naoReconhecido(esperado: string): LeituraCertidao {
  return { status: 'MANUAL', resumo: `O PDF enviado não parece ser a ${esperado}.`, situacao: 'documento não reconhecido', validade: null, emissao: null, numero: null, documento: null, confere: false };
}
