/**
 * Leitura do XML da NFC-e (modelo 65, leiaute 4.00) para o DANFE NFC-e: só os campos que o documento auxiliar mostra.
 * O leitor da NF-e (nfe-leitor.ts) não serve aqui: a NFC-e tem consumidor no lugar do destinatário, formas de pagamento
 * com troco e as informações suplementares (QR Code e endereço de consulta pela chave). Usa o parser seguro do importador
 * (sem DTD nem entidade externa, com limite de tamanho). Os valores ficam como texto do XML; a formatação (moeda, data,
 * CNPJ) é feita no desenho.
 */
import { getAll, getAttr, getFirst, getText, parseXml } from '../../importacao-xml/shared/xml-parser';
import { ErroLeituraDocumento } from './erros';

export class ErroLeituraNfce extends ErroLeituraDocumento {}

/** Itens além deste número não são lidos nem desenhados (o DANFE avisa): a NFC-e raramente passa de 100 e o leiaute só admite 990. */
export const LIMITE_ITENS_NFCE = 1000;

export interface EnderecoNfce {
  logradouro: string; numero: string; complemento: string; bairro: string; municipio: string; uf: string; cep: string; fone: string;
}
export interface EmitenteNfce {
  tipoDocumento: 'CNPJ' | 'CPF' | ''; documento: string; nome: string; ie: string; endereco: EnderecoNfce;
}
/** Consumidor identificado (grupo `dest`). Na NFC-e com entrega em domicílio o endereço do consumidor é o de entrega. */
export interface ConsumidorNfce {
  tipoDocumento: 'CNPJ' | 'CPF' | 'ESTRANGEIRO' | ''; documento: string; nome: string; endereco: EnderecoNfce;
}
export interface ItemNfce {
  numero: string; codigo: string; descricao: string; unidade: string; quantidade: string; valorUnitario: string; valorTotal: string; desconto: string;
}
/** Uma forma de pagamento: `forma` é o código tPag, `descricao` o xPag (só obrigatório no tPag 99, "Outros"). */
export interface PagamentoNfce { forma: string; descricao: string; valor: string }
export interface TotaisNfce {
  valorProdutos: string; valorServicos: string; desconto: string; frete: string; seguro: string; outras: string; valorNota: string; tributosAproximados: string;
}
export interface ProtocoloNfce { numero: string; dataHora: string; status: string; motivo: string }

export interface NfceLida {
  chave: string;
  versao: string;
  modelo: string;
  serie: string;
  numero: string;
  dataEmissao: string; // como no XML (ISO com o fuso do emitente)
  tipoEmissao: string; // 1 normal, 9 contingência off-line
  contingencia: boolean;
  homologacao: boolean;
  emitente: EmitenteNfce;
  consumidor: ConsumidorNfce | null;
  /** Os itens lidos (no máximo LIMITE_ITENS_NFCE). */
  itens: ItemNfce[];
  /** Quantidade de itens que o XML traz, inclusive os que ficaram de fora de `itens`. */
  totalItens: number;
  totais: TotaisNfce;
  pagamentos: PagamentoNfce[];
  troco: string;
  /** Texto do QR Code (infNFeSupl/qrCode), exatamente como está no XML. */
  qrCode: string;
  /** Endereço de consulta pela chave de acesso (infNFeSupl/urlChave). */
  urlChave: string;
  informacoesComplementares: string;
  informacoesFisco: string;
  protocolo: ProtocoloNfce | null;
}

/**
 * Chave de acesso: 44 posições. Desde julho de 2026 o CNPJ pode ter letras, e então as 14 posições dele na chave também
 * (UF e AAMM, 6 dígitos; CNPJ, 14 caracteres; modelo, série, número, forma de emissão, código e DV, 24 dígitos).
 */
const CHAVE = /^[0-9]{6}[0-9A-Z]{14}[0-9]{24}$/;

function endereco(el: any): EnderecoNfce {
  return {
    logradouro: getText(el, 'xLgr'), numero: getText(el, 'nro'), complemento: getText(el, 'xCpl'), bairro: getText(el, 'xBairro'),
    municipio: getText(el, 'xMun'), uf: getText(el, 'UF'), cep: getText(el, 'CEP'), fone: getText(el, 'fone'),
  };
}

function emitente(emit: any): EmitenteNfce {
  const cnpj = getText(emit, 'CNPJ');
  const cpf = getText(emit, 'CPF');
  return {
    tipoDocumento: cnpj ? 'CNPJ' : cpf ? 'CPF' : '', documento: cnpj || cpf,
    nome: getText(emit, 'xNome'), ie: getText(emit, 'IE'), endereco: endereco(getFirst(emit, 'enderEmit')),
  };
}

/**
 * O consumidor só existe no XML quando ele pediu para ser identificado, a nota é de R$ 10.000 ou mais ou há entrega em domicílio.
 * O endereço de entrega vem em `dest/enderDest`; o grupo `entrega` (raro na NFC-e) serve de reserva.
 */
function consumidor(dest: any, entrega: any): ConsumidorNfce | null {
  if (!dest) return null;
  const cnpj = getText(dest, 'CNPJ');
  const cpf = getText(dest, 'CPF');
  const estrangeiro = getText(dest, 'idEstrangeiro');
  const enderDest = getFirst(dest, 'enderDest');
  return {
    tipoDocumento: cnpj ? 'CNPJ' : cpf ? 'CPF' : estrangeiro ? 'ESTRANGEIRO' : '',
    documento: cnpj || cpf || estrangeiro,
    nome: getText(dest, 'xNome'),
    endereco: endereco(enderDest ?? entrega),
  };
}

function item(det: any): ItemNfce {
  const prod = getFirst(det, 'prod');
  return {
    numero: getAttr(det, 'nItem'), codigo: getText(prod, 'cProd'), descricao: getText(prod, 'xProd'), unidade: getText(prod, 'uCom'),
    quantidade: getText(prod, 'qCom'), valorUnitario: getText(prod, 'vUnCom'), valorTotal: getText(prod, 'vProd'), desconto: getText(prod, 'vDesc'),
  };
}

/**
 * Formas de pagamento e troco. No leiaute 4.00 há um grupo `pag` com vários `detPag` (e o `vTroco`); no 3.10 cada forma era
 * um grupo `pag` com tPag e vPag direto, e as NFC-e antigas ainda estão nos arquivos dos clientes.
 */
function pagamentos(inf: any): { formas: PagamentoNfce[]; troco: string } {
  const formas: PagamentoNfce[] = [];
  let troco = '';
  for (const pag of getAll(inf, 'pag')) {
    const detalhes = getAll(pag, 'detPag');
    const grupos = detalhes.length ? detalhes : getText(pag, 'tPag') ? [pag] : [];
    for (const g of grupos) formas.push({ forma: getText(g, 'tPag'), descricao: getText(g, 'xPag'), valor: getText(g, 'vPag') });
    troco = troco || getText(pag, 'vTroco');
  }
  return { formas, troco };
}

/** Lê o XML (nfeProc ou NFe) e devolve os dados do DANFE NFC-e. Lança ErroLeituraNfce se não for uma NFC-e legível (modelo 65). */
export function lerNfce(xml: string): NfceLida {
  let doc;
  try {
    // Arquivo salvo no Windows costuma começar com BOM, e o parser recusa qualquer coisa antes da declaração <?xml.
    doc = parseXml(String(xml ?? '').trimStart()); // o trimStart também tira o BOM (U+FEFF)
  } catch (e) {
    throw new ErroLeituraNfce((e as Error).message);
  }
  const raiz: any = doc.documentElement;
  const nomeRaiz = String(raiz?.localName ?? '').toLowerCase();
  const nfe = nomeRaiz === 'nfeproc' ? getFirst(raiz, 'NFe') : nomeRaiz === 'nfe' ? raiz : null;
  const inf = nfe ? getFirst(nfe, 'infNFe') : null;
  if (!inf) throw new ErroLeituraNfce('O XML não é uma NFC-e (modelo 65).');

  const ide = getFirst(inf, 'ide');
  const prot = getFirst(nomeRaiz === 'nfeproc' ? getFirst(raiz, 'protNFe') : null, 'infProt');
  let chave = getAttr(inf, 'Id').replace(/^NFe/i, '');
  if (!CHAVE.test(chave)) chave = getText(prot, 'chNFe');
  if (!CHAVE.test(chave)) chave = '';

  // O modelo está na identificação e também nas posições 21 e 22 da chave.
  const modelo = getText(ide, 'mod') || chave.slice(20, 22);
  if (modelo === '55') throw new ErroLeituraNfce('Este XML é de uma NF-e (modelo 55), não de uma NFC-e: use o DANFE da NF-e.');
  if (modelo !== '65') throw new ErroLeituraNfce(`O DANFE NFC-e só é gerado para NFC-e modelo 65 (este documento é modelo ${modelo || 'desconhecido'}).`);
  if (!chave) throw new ErroLeituraNfce('A NFC-e não traz a chave de acesso de 44 dígitos.');

  const total = getFirst(inf, 'total');
  const icmsTot = getFirst(total, 'ICMSTot');
  const issqnTot = getFirst(total, 'ISSQNtot');
  const supl = getFirst(nfe, 'infNFeSupl');
  const infAdic = getFirst(inf, 'infAdic');
  const dets = getAll(inf, 'det');
  const pagos = pagamentos(inf);
  const tipoEmissao = getText(ide, 'tpEmis');

  return {
    chave,
    versao: getAttr(inf, 'versao'),
    modelo,
    serie: getText(ide, 'serie'),
    numero: getText(ide, 'nNF'),
    dataEmissao: getText(ide, 'dhEmi') || getText(ide, 'dEmi'),
    tipoEmissao,
    contingencia: tipoEmissao === '9',
    homologacao: (getText(ide, 'tpAmb') || getText(prot, 'tpAmb')) === '2',
    emitente: emitente(getFirst(inf, 'emit')),
    consumidor: consumidor(getFirst(inf, 'dest'), getFirst(inf, 'entrega')),
    itens: dets.slice(0, LIMITE_ITENS_NFCE).map(item),
    totalItens: dets.length,
    totais: {
      valorProdutos: getText(icmsTot, 'vProd'), valorServicos: getText(issqnTot, 'vServ'), desconto: getText(icmsTot, 'vDesc'),
      frete: getText(icmsTot, 'vFrete'), seguro: getText(icmsTot, 'vSeg'), outras: getText(icmsTot, 'vOutro'),
      valorNota: getText(icmsTot, 'vNF'), tributosAproximados: getText(icmsTot, 'vTotTrib'),
    },
    pagamentos: pagos.formas,
    troco: pagos.troco,
    qrCode: getText(supl, 'qrCode'),
    urlChave: getText(supl, 'urlChave'),
    informacoesComplementares: getText(infAdic, 'infCpl'),
    informacoesFisco: getText(infAdic, 'infAdFisco'),
    protocolo: prot ? { numero: getText(prot, 'nProt'), dataHora: getText(prot, 'dhRecbto'), status: getText(prot, 'cStat'), motivo: getText(prot, 'xMotivo') } : null,
  };
}
