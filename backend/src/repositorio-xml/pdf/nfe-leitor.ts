/**
 * Leitura do XML da NF-e (modelo 55, leiaute 4.00) para o DANFE: só os campos que o documento auxiliar mostra.
 * Usa o parser seguro do importador (sem DTD nem entidade externa, com limite de tamanho). Os valores ficam como texto do XML;
 * a formatação (moeda, data, CNPJ) é feita no desenho.
 */
import { getAll, getAttr, getFirst, getFirstDeep, getText, parseXml } from '../../importacao-xml/shared/xml-parser';
import { ErroLeituraDocumento } from './erros';

export class ErroLeituraNfe extends ErroLeituraDocumento {}

export interface EnderecoNfe {
  logradouro: string; numero: string; complemento: string; bairro: string; municipio: string; uf: string; cep: string; fone: string;
}
export interface ParteNfe {
  documento: string; nome: string; fantasia: string; ie: string; ieSt: string; im: string; endereco: EnderecoNfe;
}
export interface ItemNfe {
  numero: string; codigo: string; descricao: string; ncm: string; cfop: string; unidade: string; quantidade: string;
  valorUnitario: string; valorTotal: string; desconto: string; origemCst: string; baseIcms: string; valorIcms: string;
  aliquotaIcms: string; valorIpi: string; aliquotaIpi: string; infAdicional: string;
}
export interface TotaisNfe {
  baseIcms: string; valorIcms: string; valorIcmsDesonerado: string; valorFcp: string; baseIcmsSt: string; valorIcmsSt: string;
  valorProdutos: string; frete: string; seguro: string; desconto: string; valorImpostoImportacao: string; ipi: string;
  outras: string; valorNota: string; tributosAproximados: string;
}
export interface VolumeNfe { quantidade: string; especie: string; marca: string; numeracao: string; pesoLiquido: string; pesoBruto: string }
export interface TransporteNfe {
  modalidadeFrete: string; transportadora: ParteNfe | null; placa: string; ufPlaca: string; rntc: string; volumes: VolumeNfe[];
}
export interface DuplicataNfe { numero: string; vencimento: string; valor: string }
export interface IssqnNfe { valorServicos: string; baseCalculo: string; valorIss: string }
export interface ProtocoloNfe { numero: string; dataHora: string; status: string; motivo: string }

export interface NfeLida {
  chave: string;
  versao: string;
  naturezaOperacao: string;
  modelo: string;
  serie: string;
  numero: string;
  dataEmissao: string; // como no XML (ISO com fuso)
  dataSaida: string;
  tipoOperacao: string; // 0 entrada, 1 saída
  homologacao: boolean;
  emitente: ParteNfe;
  destinatario: ParteNfe | null;
  itens: ItemNfe[];
  totais: TotaisNfe;
  issqn: IssqnNfe | null;
  transporte: TransporteNfe;
  duplicatas: DuplicataNfe[];
  informacoesComplementares: string;
  informacoesFisco: string;
  protocolo: ProtocoloNfe | null;
}

const LIMITE_ITENS = 1000;

const filhoElemento = (el: any): any => {
  if (!el) return null;
  for (let i = 0; i < el.childNodes.length; i += 1) if (el.childNodes[i].nodeType === 1) return el.childNodes[i];
  return null;
};

function endereco(el: any): EnderecoNfe {
  return {
    logradouro: getText(el, 'xLgr'), numero: getText(el, 'nro'), complemento: getText(el, 'xCpl'), bairro: getText(el, 'xBairro'),
    municipio: getText(el, 'xMun'), uf: getText(el, 'UF'), cep: getText(el, 'CEP'), fone: getText(el, 'fone'),
  };
}

function parte(el: any, enderecoEl: any): ParteNfe {
  return {
    documento: getText(el, 'CNPJ') || getText(el, 'CPF') || getText(el, 'idEstrangeiro'),
    nome: getText(el, 'xNome'), fantasia: getText(el, 'xFant'), ie: getText(el, 'IE'), ieSt: getText(el, 'IEST'), im: getText(el, 'IM'),
    endereco: endereco(enderecoEl),
  };
}

function item(det: any): ItemNfe {
  const prod = getFirst(det, 'prod');
  const imposto = getFirst(det, 'imposto');
  const icmsGrupo = filhoElemento(getFirstDeep(imposto, 'ICMS'));
  const ipiTrib = getFirstDeep(getFirstDeep(imposto, 'IPI'), 'IPITrib');
  const origem = getText(icmsGrupo, 'orig');
  return {
    numero: getAttr(det, 'nItem'),
    codigo: getText(prod, 'cProd'), descricao: getText(prod, 'xProd'), ncm: getText(prod, 'NCM'), cfop: getText(prod, 'CFOP'),
    unidade: getText(prod, 'uCom'), quantidade: getText(prod, 'qCom'), valorUnitario: getText(prod, 'vUnCom'),
    valorTotal: getText(prod, 'vProd'), desconto: getText(prod, 'vDesc'),
    origemCst: `${origem}${getText(icmsGrupo, 'CST') || getText(icmsGrupo, 'CSOSN')}`,
    baseIcms: getText(icmsGrupo, 'vBC'), valorIcms: getText(icmsGrupo, 'vICMS'), aliquotaIcms: getText(icmsGrupo, 'pICMS'),
    valorIpi: getText(ipiTrib, 'vIPI'), aliquotaIpi: getText(ipiTrib, 'pIPI'),
    infAdicional: getText(det, 'infAdProd'),
  };
}

/** Lê o XML (nfeProc ou NFe) e devolve os dados do DANFE. Lança ErroLeituraNfe se não for uma NF-e legível. */
export function lerNfe(xml: string): NfeLida {
  let doc;
  try {
    doc = parseXml(xml);
  } catch (e) {
    throw new ErroLeituraNfe((e as Error).message);
  }
  const raiz: any = doc.documentElement;
  const nomeRaiz = String(raiz?.localName ?? '').toLowerCase();
  const nfe = nomeRaiz === 'nfeproc' ? getFirst(raiz, 'NFe') : nomeRaiz === 'nfe' ? raiz : null;
  const inf = nfe ? getFirst(nfe, 'infNFe') : null;
  if (!inf) throw new ErroLeituraNfe('O XML não é uma NF-e (modelo 55).');

  const prot = nomeRaiz === 'nfeproc' ? getFirstDeep(raiz, 'infProt') : null;
  let chave = getAttr(inf, 'Id').replace(/^NFe/i, '');
  if (!/^[0-9]{44}$/.test(chave)) chave = getText(prot, 'chNFe');
  if (!/^[0-9]{44}$/.test(chave)) throw new ErroLeituraNfe('A NF-e não traz a chave de acesso de 44 dígitos.');

  const ide = getFirst(inf, 'ide');
  const emit = getFirst(inf, 'emit');
  const dest = getFirst(inf, 'dest');
  const total = getFirstDeep(inf, 'ICMSTot');
  const transp = getFirst(inf, 'transp');
  const transporta = getFirst(transp, 'transporta');
  const veiculo = getFirst(transp, 'veicTransp');
  const cobr = getFirst(inf, 'cobr');
  const issqn = getFirstDeep(inf, 'ISSQNtot');
  const infAdic = getFirst(inf, 'infAdic');
  const dets = getAll(inf, 'det');
  if (dets.length > LIMITE_ITENS) throw new ErroLeituraNfe(`A NF-e tem mais de ${LIMITE_ITENS} itens.`);

  return {
    chave,
    versao: getAttr(inf, 'versao'),
    naturezaOperacao: getText(ide, 'natOp'),
    modelo: getText(ide, 'mod'),
    serie: getText(ide, 'serie'),
    numero: getText(ide, 'nNF'),
    dataEmissao: getText(ide, 'dhEmi') || getText(ide, 'dEmi'),
    dataSaida: getText(ide, 'dhSaiEnt') || getText(ide, 'dSaiEnt'),
    tipoOperacao: getText(ide, 'tpNF'),
    homologacao: (getText(ide, 'tpAmb') || getText(prot, 'tpAmb')) === '2',
    emitente: parte(emit, getFirst(emit, 'enderEmit')),
    destinatario: dest ? parte(dest, getFirst(dest, 'enderDest')) : null,
    itens: dets.map(item),
    totais: {
      baseIcms: getText(total, 'vBC'), valorIcms: getText(total, 'vICMS'), valorIcmsDesonerado: getText(total, 'vICMSDeson'),
      valorFcp: getText(total, 'vFCP'), baseIcmsSt: getText(total, 'vBCST'), valorIcmsSt: getText(total, 'vST'),
      valorProdutos: getText(total, 'vProd'), frete: getText(total, 'vFrete'), seguro: getText(total, 'vSeg'), desconto: getText(total, 'vDesc'),
      valorImpostoImportacao: getText(total, 'vII'), ipi: getText(total, 'vIPI'), outras: getText(total, 'vOutro'),
      valorNota: getText(total, 'vNF'), tributosAproximados: getText(total, 'vTotTrib'),
    },
    issqn: issqn ? { valorServicos: getText(issqn, 'vServ'), baseCalculo: getText(issqn, 'vBC'), valorIss: getText(issqn, 'vISS') } : null,
    transporte: {
      modalidadeFrete: getText(transp, 'modFrete'),
      // Na transportadora o endereço vem direto no grupo (xEnder, xMun, UF), sem elemento próprio.
      transportadora: transporta
        ? { ...parte(transporta, null), endereco: { ...endereco(null), logradouro: getText(transporta, 'xEnder'), municipio: getText(transporta, 'xMun'), uf: getText(transporta, 'UF') } }
        : null,
      placa: getText(veiculo, 'placa'), ufPlaca: getText(veiculo, 'UF'), rntc: getText(veiculo, 'RNTC'),
      volumes: getAll(transp, 'vol').map((v) => ({
        quantidade: getText(v, 'qVol'), especie: getText(v, 'esp'), marca: getText(v, 'marca'), numeracao: getText(v, 'nVol'),
        pesoLiquido: getText(v, 'pesoL'), pesoBruto: getText(v, 'pesoB'),
      })),
    },
    duplicatas: getAll(cobr, 'dup').map((d) => ({ numero: getText(d, 'nDup'), vencimento: getText(d, 'dVenc'), valor: getText(d, 'vDup') })),
    informacoesComplementares: getText(infAdic, 'infCpl'),
    informacoesFisco: getText(infAdic, 'infAdFisco'),
    protocolo: prot ? { numero: getText(prot, 'nProt'), dataHora: getText(prot, 'dhRecbto'), status: getText(prot, 'cStat'), motivo: getText(prot, 'xMotivo') } : null,
  };
}
