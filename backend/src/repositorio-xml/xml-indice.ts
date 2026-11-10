import { getAttr, getFirst, getFirstDeep, getText, getTextDeep, parseXml } from '../importacao-xml/shared/xml-parser';
import { parseDataEmissao } from '../importacao-xml/shared/xml-utils';

export type TipoDocXml = 'NFE' | 'CTE' | 'MDFE' | 'NFSE' | 'EVENTO';

export type IndiceXml = {
  tipo: TipoDocXml;
  /** Chave de acesso de 44 posições, ou de 50 na NFS-e Nacional (no evento, a do documento a que ele se refere). */
  chave: string;
  eventoTipo: string;
  sequencia: number;
  modelo: string | null;
  numero: string | null;
  serie: string | null;
  dataEmissao: Date | null;
  emitenteDoc: string | null;
  emitenteNome: string | null;
  destinatarioDoc: string | null;
  valorTotal: number | null;
  /** RESUMO = só o resumo da Distribuição de DF-e (resNFe/resEvento), sem o XML completo. */
  conteudo: 'COMPLETO' | 'RESUMO';
  situacao: 'AUTORIZADA' | 'CANCELADA' | 'DENEGADA' | null;
  /** Data da autorização (protocolo): dela contam os prazos da manifestação do destinatário. Na NFS-e, a da geração (dhProc). */
  autorizadaEm: Date | null;
};

/** Chave de acesso: 6 dígitos (UF e AAMM), 12 caracteres do CNPJ (letras permitidas), 2 dígitos verificadores do CNPJ e 26 dígitos. */
const CHAVE = /^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/;

/**
 * Chave da NFS-e Nacional (Id do infNFSe sem o "NFS"; XSD v1.01, TSIdNFSe): município (7), ambiente gerador (1), tipo de inscrição (1),
 * inscrição federal (14), número (13), AAMM (4), código numérico (9) e DV (1). O XSD vigente só tem dígitos; a NT 009 do CGNFS-e passa
 * o CNPJ para caractere, então aceita letras nas 12 posições do CNPJ, como na chave da NF-e.
 */
const CHAVE_NFSE = /^[0-9]{9}[0-9A-Z]{12}[0-9]{29}$/;
const NS_NFSE = 'http://www.sped.fazenda.gov.br/nfse';
/** cStat da NFS-e (TStat): 100 gerada, 102 por decisão judicial, 103 avulsa e 107 MEI; todas são NFS-e válidas. */
const NFSE_GERADA = new Set(['100', '102', '103', '107']);
/** Eventos que cancelam a NFS-e: cancelamento, por substituição, deferido por análise fiscal e por ofício (Anexo II v1.01, tipos de evento). */
const CANCELAMENTOS_NFSE = new Set(['101101', '105102', '105104', '305101']);

const vazioParaNulo = (s: string) => (s ? s : null);
const numero = (s: string): number | null => {
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? n : null;
};

/**
 * Código do evento (tpEvento): 6 dígitos. Ele entra no nome do arquivo guardado e no do download, então nada além disso passa:
 * um evento com outro formato não é reconhecido (nunca vira um caminho de armazenamento inventado).
 */
const TIPO_EVENTO = /^[0-9]{6}$/;

/** nSeqEvento: de 1 a 3 dígitos; ausente vale 1. Qualquer outro valor torna o evento irreconhecível, em vez de virar uma sequência inventada. */
function sequenciaDoEvento(texto: string): number | null {
  if (texto === '') return 1;
  return /^[0-9]{1,3}$/.test(texto) && Number(texto) >= 1 ? Number(texto) : null;
}

/** A chave da NFS-e tem 50 posições; as demais, 44. */
export const ehChaveNfse = (chave: string): boolean => chave.length === 50;

/** Campos que a própria chave de acesso já traz (cUF, AAMM, CNPJ/CPF do emitente, modelo, série e número). */
function dadosDaChave(chave: string) {
  return {
    modelo: chave.slice(20, 22),
    serie: String(Number(chave.slice(22, 25)) || 0),
    numero: String(Number(chave.slice(25, 34)) || 0),
    emitenteDoc: chave.slice(6, 20),
  };
}

/** Tipo do documento pelo modelo que a chave de acesso carrega (posições 21 e 22); a chave de 50 posições é da NFS-e. */
export function tipoDaChave(chave: string): Exclude<TipoDocXml, 'EVENTO'> {
  if (ehChaveNfse(chave)) return 'NFSE';
  const mod = chave.slice(20, 22);
  if (mod === '57' || mod === '67') return 'CTE';
  if (mod === '58') return 'MDFE';
  return 'NFE';
}

function situacaoPorStatus(cStat: string, cancelamento = false): IndiceXml['situacao'] {
  if (['100', '150'].includes(cStat)) return 'AUTORIZADA';
  if (['101', '151', '155'].includes(cStat)) return 'CANCELADA';
  if (['110', '205', '301', '302', '303'].includes(cStat)) return 'DENEGADA';
  if (cancelamento && ['135', '136'].includes(cStat)) return 'CANCELADA';
  return null;
}

/** Número da NFS-e sem zeros à esquerda: o Anexo I do ADN fala em 13 dígitos (0000000000123), e a busca por número usa os dígitos digitados. */
const semZeros = (s: string): string | null => (/^[0-9]{1,13}$/.test(s) ? String(Number(s)) : null);
/** Número da NFS-e que a própria chave traz (13 posições, depois do ambiente gerador e da inscrição federal). */
const numeroDaChaveNfse = (chave: string) => semZeros(chave.slice(23, 36));

/**
 * NFS-e Nacional (XSD v1.01): NFSe > infNFSe, com a DPS dentro. O emitente é o prestador; série e data de emissão são da DPS e o
 * tomador, quando há, também.
 */
function indexarNfse(root: unknown): IndiceXml | null {
  const inf = getFirst(root, 'infNFSe');
  const chave = getAttr(inf, 'Id').replace(/^NFS/, '');
  if (!CHAVE_NFSE.test(chave)) return null;
  const emit = getFirst(inf, 'emit');
  const dps = getFirst(getFirst(inf, 'DPS'), 'infDPS');
  const toma = getFirst(dps, 'toma');
  return {
    tipo: 'NFSE', chave, eventoTipo: '', sequencia: 0,
    modelo: null,
    numero: semZeros(getText(inf, 'nNFSe')) ?? numeroDaChaveNfse(chave),
    serie: vazioParaNulo(getText(dps, 'serie')),
    dataEmissao: parseDataEmissao(getText(dps, 'dhEmi') || getText(inf, 'dhProc')),
    emitenteDoc: vazioParaNulo(getText(emit, 'CNPJ') || getText(emit, 'CPF')),
    emitenteNome: vazioParaNulo(getText(emit, 'xNome')),
    destinatarioDoc: vazioParaNulo(getText(toma, 'CNPJ') || getText(toma, 'CPF') || getText(toma, 'NIF')),
    valorTotal: numero(getText(getFirst(inf, 'valores'), 'vLiq')) ?? numero(getText(getFirst(getFirst(dps, 'valores'), 'vServPrest'), 'vServ')),
    conteudo: 'COMPLETO',
    situacao: NFSE_GERADA.has(getText(inf, 'cStat')) ? 'AUTORIZADA' : null,
    autorizadaEm: parseDataEmissao(getText(inf, 'dhProc')),
  };
}

/** Código do evento da NFS-e: o pedido de registro tem um elemento "e" mais os 6 dígitos do tipo (e101101, e305101...). */
function codigoDoEventoNfse(pedido: any): string {
  const filhos = pedido?.childNodes;
  for (let i = 0; i < (filhos?.length ?? 0); i += 1) {
    const m = /^e(\d{6})$/.exec(filhos[i].localName ?? '');
    if (m) return m[1];
  }
  return '';
}

/**
 * Evento da NFS-e Nacional (XSD de eventos v1.01): evento > infEvento > pedRegEvento > infPedReg, que traz a chave da NFS-e (chNFSe),
 * o autor e o evento em si. Só os quatro eventos de cancelamento marcam a NFS-e como cancelada: depois deles o Sistema Nacional não
 * aceita mais nenhum evento (Anexo II v1.01, aba "RN EVENTOSxEVENTOS").
 */
function indexarEventoNfse(root: unknown): IndiceXml | null {
  const inf = getFirst(root, 'infEvento');
  const pedido = getFirstDeep(inf, 'infPedReg');
  const chave = getText(pedido, 'chNFSe');
  const codigo = codigoDoEventoNfse(pedido);
  const sequencia = sequenciaDoEvento(getText(inf, 'nSeqEvento'));
  if (!CHAVE_NFSE.test(chave) || !codigo || sequencia === null) return null;
  return {
    tipo: 'EVENTO', chave, eventoTipo: codigo, sequencia,
    modelo: null, numero: numeroDaChaveNfse(chave), serie: null,
    dataEmissao: parseDataEmissao(getText(pedido, 'dhEvento') || getText(inf, 'dhProc')),
    emitenteDoc: vazioParaNulo(getText(pedido, 'CNPJAutor') || getText(pedido, 'CPFAutor')),
    emitenteNome: null, destinatarioDoc: null, valorTotal: null,
    conteudo: 'COMPLETO', situacao: CANCELAMENTOS_NFSE.has(codigo) ? 'CANCELADA' : null, autorizadaEm: null,
  };
}

/** Lê o XML e devolve o que o repositório precisa para indexá-lo. Devolve null se não for um documento fiscal reconhecido. */
export function indexarXml(xml: string): IndiceXml | null {
  let doc;
  try {
    doc = parseXml(xml);
  } catch {
    return null;
  }
  const root = doc.documentElement as unknown as { localName?: string; nodeName?: string; namespaceURI?: string | null } | null;
  if (!root) return null;
  const nome = (root.localName || root.nodeName || '').toLowerCase();

  // NFS-e Nacional: o evento tem a mesma raiz do evento da NF-e, e só o namespace as distingue
  if (root.namespaceURI === NS_NFSE) {
    if (nome === 'nfse') return indexarNfse(root);
    if (nome === 'evento') return indexarEventoNfse(root);
    return null;
  }

  // Resumos da Distribuição de DF-e
  if (nome === 'resnfe') {
    const chave = getText(root, 'chNFe');
    if (!CHAVE.test(chave)) return null;
    const d = dadosDaChave(chave);
    return {
      tipo: 'NFE', chave, eventoTipo: '', sequencia: 0,
      modelo: d.modelo, numero: d.numero, serie: d.serie,
      dataEmissao: parseDataEmissao(getText(root, 'dhEmi')),
      emitenteDoc: vazioParaNulo(getText(root, 'CNPJ') || getText(root, 'CPF')) ?? d.emitenteDoc,
      emitenteNome: vazioParaNulo(getText(root, 'xNome')),
      destinatarioDoc: null,
      valorTotal: numero(getText(root, 'vNF')),
      conteudo: 'RESUMO',
      situacao: ({ '1': 'AUTORIZADA', '2': 'DENEGADA', '3': 'CANCELADA' } as const)[getText(root, 'cSitNFe') as '1' | '2' | '3'] ?? null,
      autorizadaEm: parseDataEmissao(getText(root, 'dhRecbto')),
    };
  }
  if (nome === 'resevento') {
    const chave = getText(root, 'chNFe') || getText(root, 'chCTe');
    if (!CHAVE.test(chave)) return null;
    const tp = getText(root, 'tpEvento');
    const sequencia = sequenciaDoEvento(getText(root, 'nSeqEvento'));
    if (!TIPO_EVENTO.test(tp) || sequencia === null) return null;
    const d = dadosDaChave(chave);
    return {
      tipo: 'EVENTO', chave, eventoTipo: tp, sequencia,
      modelo: d.modelo, numero: d.numero, serie: d.serie,
      dataEmissao: parseDataEmissao(getText(root, 'dhEvento')),
      emitenteDoc: vazioParaNulo(getText(root, 'CNPJ') || getText(root, 'CPF')),
      emitenteNome: null, destinatarioDoc: null, valorTotal: null,
      conteudo: 'RESUMO', situacao: tp === '110111' ? 'CANCELADA' : null, autorizadaEm: null,
    };
  }

  // Eventos completos (NF-e, CT-e, MDF-e)
  if (['proceventonfe', 'evento', 'proceventocte', 'eventocte', 'proceventomdfe', 'eventomdfe'].includes(nome)) {
    const inf = getFirstDeep(root, 'infEvento');
    if (!inf) return null;
    const chave = getText(inf, 'chNFe') || getText(inf, 'chCTe') || getText(inf, 'chMDFe');
    if (!CHAVE.test(chave)) return null;
    const tp = getText(inf, 'tpEvento');
    const sequencia = sequenciaDoEvento(getText(inf, 'nSeqEvento'));
    if (!TIPO_EVENTO.test(tp) || sequencia === null) return null;
    const d = dadosDaChave(chave);
    const retorno = getFirst(root, 'retEvento');
    const cStat = getText(getFirstDeep(retorno, 'infEvento'), 'cStat');
    return {
      tipo: 'EVENTO', chave, eventoTipo: tp, sequencia,
      modelo: d.modelo, numero: d.numero, serie: d.serie,
      dataEmissao: parseDataEmissao(getText(inf, 'dhEvento')),
      emitenteDoc: vazioParaNulo(getText(inf, 'CNPJ') || getText(inf, 'CPF')),
      emitenteNome: null, destinatarioDoc: null, valorTotal: null,
      conteudo: 'COMPLETO', situacao: tp === '110111' ? situacaoPorStatus(cStat, true) : null, autorizadaEm: null,
    };
  }

  // Documentos completos
  const familia =
    nome === 'nfeproc' || nome === 'nfe' ? { inf: 'infNFe', prefixo: /^NFe/i, num: 'nNF', valor: 'vNF', prot: 'protNFe' }
    : nome === 'cteproc' || nome === 'cte' || nome === 'cteosproc' || nome === 'cteos' ? { inf: 'infCte', prefixo: /^CTe/i, num: 'nCT', valor: 'vTPrest', prot: 'protCTe' }
    : nome === 'mdfeproc' || nome === 'mdfe' ? { inf: 'infMDFe', prefixo: /^MDFe/i, num: 'nMDF', valor: 'vCarga', prot: 'protMDFe' }
    : null;
  if (!familia) return null;
  const inf = getFirstDeep(root, familia.inf);
  if (!inf) return null;
  const chave = getAttr(inf, 'Id').replace(familia.prefixo, '');
  if (!CHAVE.test(chave)) return null;
  const d = dadosDaChave(chave);
  const ide = getFirst(inf, 'ide');
  const emit = getFirst(inf, 'emit');
  const dest = getFirst(inf, 'dest');
  const protocolo = getFirstDeep(getFirst(root, familia.prot), 'infProt');
  const cStat = getText(protocolo, 'cStat');
  return {
    tipo: tipoDaChave(chave), chave, eventoTipo: '', sequencia: 0,
    modelo: vazioParaNulo(getText(ide, 'mod')) ?? d.modelo,
    numero: vazioParaNulo(getText(ide, familia.num)) ?? d.numero,
    serie: vazioParaNulo(getText(ide, 'serie')) ?? d.serie,
    dataEmissao: parseDataEmissao(getText(ide, 'dhEmi') || getText(ide, 'dEmi')),
    emitenteDoc: vazioParaNulo(getText(emit, 'CNPJ') || getText(emit, 'CPF')) ?? d.emitenteDoc,
    emitenteNome: vazioParaNulo(getText(emit, 'xNome')),
    destinatarioDoc: vazioParaNulo(getText(dest, 'CNPJ') || getText(dest, 'CPF') || getText(dest, 'idEstrangeiro')),
    valorTotal: numero(getTextDeep(root, familia.valor)),
    conteudo: 'COMPLETO',
    situacao: situacaoPorStatus(cStat),
    autorizadaEm: parseDataEmissao(getText(protocolo, 'dhRecbto')),
  };
}
