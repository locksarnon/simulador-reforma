/**
 * Cliente da API do ReceitanetBX-Serviço (programa oficial da Receita Federal que roda ao lado do InTAX, no container
 * `receitanetbx`). SOAP 1.1 document/literal (Axis2), namespace http://ws.apache.org/axis2, SOAPAction urn:<Operação>.
 * Cada operação recebe `entrada` (um XML em texto) e devolve `retorno` (número) e `saida` (outro XML em texto).
 * Operações: PesquisarArquivos, SolicitarArquivos, VerificarSituacaoPedidos e ConsultarPedidos.
 */
export type Operacao = 'PesquisarArquivos' | 'SolicitarArquivos' | 'VerificarSituacaoPedidos' | 'ConsultarPedidos';
export type RespostaBx = { retorno: number; saida: string };

export const URL_PADRAO_BX = 'http://reforma-receitanetbx:2444/services/ReceitanetBX';
export const URL_SECUNDARIO_BX = 'http://reforma-receitanetbx-socio:2444/services/ReceitanetBX';

/** Os serviços do ReceitanetBX: primário (certificado da empresa) e secundário (certificado do sócio, procurador de clientes). */
export function servicosBx() {
  return [
    { id: 'primario', rotulo: 'Primário (empresa)', url: process.env.RECEITANETBX_URL || URL_PADRAO_BX },
    { id: 'secundario', rotulo: 'Secundário (sócio)', url: process.env.RECEITANETBX_URL_SECUNDARIO || URL_SECUNDARIO_BX },
  ];
}

export const escaparXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const desescapar = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');

export function envelope(op: Operacao, entrada: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://ws.apache.org/axis2"><soapenv:Body><ns:${op}><ns:entrada>${escaparXml(entrada)}</ns:entrada></ns:${op}></soapenv:Body></soapenv:Envelope>`;
}

/** Lê `retorno` e `saida` da resposta (com ou sem prefixo de namespace; `saida` pode vir escapada ou em CDATA). */
export function lerResposta(xml: string): RespostaBx {
  const falha = xml.match(/<(?:\w+:)?faultstring>([\s\S]*?)<\/(?:\w+:)?faultstring>/);
  if (falha) throw new Error(`ReceitanetBX: ${desescapar(falha[1]).trim()}`);
  const retorno = Number(xml.match(/<(?:\w+:)?retorno>\s*(-?\d+)\s*<\/(?:\w+:)?retorno>/)?.[1] ?? NaN);
  const bruto = xml.match(/<(?:\w+:)?saida>([\s\S]*?)<\/(?:\w+:)?saida>/)?.[1] ?? '';
  const cdata = bruto.match(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/);
  return { retorno, saida: cdata ? cdata[1] : desescapar(bruto) };
}

export async function chamarBx(op: Operacao, entrada: string, url = process.env.RECEITANETBX_URL || URL_PADRAO_BX, tempo = 120_000): Promise<RespostaBx> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=UTF-8', SOAPAction: `urn:${op}` },
    body: envelope(op, entrada),
    signal: AbortSignal.timeout(tempo),
  });
  const texto = await r.text();
  if (!r.ok && !/faultstring/.test(texto)) throw new Error(`ReceitanetBX respondeu HTTP ${r.status}.`);
  return lerResposta(texto);
}

/** Atributos de um elemento XML simples, em objeto. */
export function atributos(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = desescapar(m[2]);
  return out;
}

/** Arquivos de uma pesquisa (retornopesquisa): id e os atributos (nome → valor) de cada um, e a mensagem ao usuário. */
export function lerPesquisa(saida: string): { arquivos: { id: string; atributos: Record<string, string> }[]; mensagem: string | null } {
  const arquivos = [...saida.matchAll(/<arquivo\b([^>]*)>([\s\S]*?)<\/arquivo>/g)].map((m) => ({
    id: atributos(m[1]).id ?? '',
    atributos: Object.fromEntries([...m[2].matchAll(/<atributo\b([^>]*?)\/?>/g)].map((a) => { const x = atributos(a[1]); return [x.nome, x.valor ?? '']; })),
  }));
  const msg = saida.match(/<mensagemusuario\b[^>]*>([\s\S]*?)<\/mensagemusuario>/)?.[1] ?? saida.match(/<mensagemusuario\b([^>]*)\/>/)?.[1] ?? null;
  return { arquivos, mensagem: msg ? desescapar(msg).trim() || null : null };
}

/** Situação do serviço: responde? tem certificado carregado? (ConsultarPedidos sem critérios; não vai ao servidor da Receita). */
export async function estadoBx(url?: string): Promise<{ disponivel: boolean; configurado: boolean; mensagem: string }> {
  try {
    const r = await chamarBx('ConsultarPedidos', '<consulta><criterios/></consulta>', url, 15_000);
    if (/NullPointer|certificado/i.test(r.saida) && r.retorno === 0) return { disponivel: true, configurado: false, mensagem: 'O serviço está no ar, mas o certificado ainda não foi configurado.' };
    return { disponivel: true, configurado: true, mensagem: 'O serviço está no ar com o certificado do escritório.' };
  } catch (e) {
    return { disponivel: false, configurado: false, mensagem: `O serviço do ReceitanetBX não respondeu: ${(e as Error).message}` };
  }
}
