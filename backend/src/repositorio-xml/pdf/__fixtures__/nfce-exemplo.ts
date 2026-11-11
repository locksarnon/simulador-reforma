/**
 * NFC-e de exemplo (modelo 65, leiaute 4.00) para os testes e para conferir o DANFE NFC-e à vista. Dados fictícios: loja de
 * insumos agropecuários em Sorriso (MT). Os endereços de consulta e o hash do QR Code são ilustrativos (o hash é um SHA-1 de
 * um CSC inventado), só servem para o XML ter o formato de um XML real.
 */
import { createHash } from 'node:crypto';

export interface OpcoesNfceExemplo {
  /** Quantidade de itens (o catálogo se repete). O padrão é 3. */
  itens?: number;
  homologacao?: boolean;
  /** Emissão em contingência off-line (tpEmis=9). Sem protocolo, como o XML sai do emissor, a menos que `semProtocolo` seja false. */
  contingencia?: boolean;
  /** Sem o protocolo de autorização: o XML vira só a `NFe`, como no momento da emissão. */
  semProtocolo?: boolean;
  /** Identificação do consumidor. O padrão é o CPF. */
  consumidor?: 'cpf' | 'cnpj' | 'estrangeiro' | 'nenhum';
  /** Entrega em domicílio (indPres=4): consumidor com nome e endereço de entrega e taxa de entrega (frete). */
  entregaEmDomicilio?: boolean;
  /** Sem desconto (o padrão é 3% em cada item). */
  semDesconto?: boolean;
  /** Formas de pagamento: duas, com troco (padrão), só um cartão de crédito no valor exato ou nenhuma. */
  pagamento?: 'misto' | 'cartao' | 'nenhum';
  infCpl?: string;
  infAdFisco?: string;
  /** Sem o valor aproximado dos tributos (Lei 12.741) no total da nota; o padrão informa 18,5% dos produtos. */
  semTributos?: boolean;
}

const EMITENTE_CNPJ = '12345678000195';
const PROTOCOLO = '351260000000001';
const URL_CONSULTA = 'http://www.sefaz.mt.gov.br/nfce/consultanfce';
const URL_CONSULTA_HOMOLOGACAO = 'http://homologacao.sefaz.mt.gov.br/nfce/consultanfce';
const CSC_FICTICIO = 'CSC-FICTICIO-SO-PARA-TESTE-0000000000';
const DIGEST_VALUE = 'yzGYhUx1/XYYzksWB+fPR3Qc50c=';

const CATALOGO = [
  { codigo: '0001', descricao: 'SAL MINERAL BOVINO 25 KG', unidade: 'SC', ncm: '23099090', quantidade: 6, valor: 189.9 },
  { codigo: '0023', descricao: 'VERMIFUGO IVERMECTINA 1% FRASCO 50 ML', unidade: 'FR', ncm: '30049099', quantidade: 3, valor: 24.5 },
  { codigo: '0310', descricao: 'OLEO DIESEL S10', unidade: 'L', ncm: '27101921', quantidade: 45.32, valor: 6.19 },
  { codigo: '7891234567895', descricao: 'LUVA NITRILICA TAM G', unidade: 'PAR', ncm: '40151900', quantidade: 2, valor: 7.75 },
  { codigo: '0777', descricao: 'HERBICIDA GLIFOSATO 480 G/L CONCENTRADO SOLUVEL GALAO COM 20 LITROS LOTE 2026/11-A VALIDADE 11/2028 USO RESTRITO A PRODUTORES', unidade: 'GL', ncm: '38089329', quantidade: 1, valor: 1234.5 },
];

/** Arredonda para centavos e devolve o texto do XML (ponto decimal, duas casas). */
const dinheiro = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);

/** Dígito verificador da chave de acesso (módulo 11, pesos de 2 a 9 da direita para a esquerda). */
function digitoVerificador(base: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

/** Chave de acesso de 44 dígitos (UF 51, novembro de 2026, série 1, número 123) com o dígito verificador certo. */
export function chaveNfceExemplo(tpEmis = 1): string {
  const base = `512611${EMITENTE_CNPJ}65001000000123${tpEmis}00000001`;
  return base + digitoVerificador(base);
}

export const CHAVE_NFCE_EXEMPLO = chaveNfceExemplo();

export function nfceExemplo(o: OpcoesNfceExemplo = {}): string {
  const qtdItens = o.itens ?? 3;
  const tpEmis = o.contingencia ? 9 : 1;
  const tpAmb = o.homologacao ? 2 : 1;
  const chave = chaveNfceExemplo(tpEmis);
  const consumidor = o.consumidor ?? 'cpf';
  const semProtocolo = o.semProtocolo ?? !!o.contingencia;

  let totalProdutos = 0;
  let totalDesconto = 0;
  let totalIcms = 0;
  const dets: string[] = [];
  for (let i = 1; i <= qtdItens; i += 1) {
    const base = CATALOGO[(i - 1) % CATALOGO.length];
    // Em homologação o primeiro item leva sempre esta descrição (regra de validação do leiaute).
    const descricao = o.homologacao && i === 1 ? 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL' : base.descricao;
    const codigo = i <= CATALOGO.length ? base.codigo : `${base.codigo}${i}`;
    const valor = Math.round(base.quantidade * base.valor * 100) / 100;
    const desconto = o.semDesconto ? 0 : Math.round(valor * 0.03 * 100) / 100;
    const icms = Math.round((valor - desconto) * 0.17 * 100) / 100;
    totalProdutos += valor;
    totalDesconto += desconto;
    totalIcms += icms;
    dets.push(
      `<det nItem="${i}"><prod><cProd>${codigo}</cProd><cEAN>SEM GTIN</cEAN><xProd>${descricao}</xProd><NCM>${base.ncm}</NCM><CFOP>5102</CFOP><uCom>${base.unidade}</uCom><qCom>${base.quantidade.toFixed(4)}</qCom><vUnCom>${base.valor.toFixed(10)}</vUnCom><vProd>${dinheiro(valor)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${base.unidade}</uTrib><qTrib>${base.quantidade.toFixed(4)}</qTrib><vUnTrib>${base.valor.toFixed(10)}</vUnTrib>${desconto ? `<vDesc>${dinheiro(desconto)}</vDesc>` : ''}<indTot>1</indTot></prod><imposto><vTotTrib>${dinheiro(valor * 0.185)}</vTotTrib><ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${dinheiro(valor - desconto)}</vBC><pICMS>17.0000</pICMS><vICMS>${dinheiro(icms)}</vICMS></ICMS00></ICMS><PIS><PISNT><CST>07</CST></PISNT></PIS><COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS></imposto></det>`,
    );
  }

  const frete = o.entregaEmDomicilio ? 15 : 0;
  const valorNota = totalProdutos - totalDesconto + frete;

  // Pagamento: o que foi pago menos o troco é sempre o valor da nota (regra do leiaute 4.00).
  const pagamentos: string[] = [];
  let troco = 0;
  const forma = o.pagamento ?? 'misto';
  if (forma === 'cartao') {
    pagamentos.push(`<detPag><indPag>0</indPag><tPag>03</tPag><vPag>${dinheiro(valorNota)}</vPag><card><tpIntegra>2</tpIntegra><tBand>01</tBand></card></detPag>`);
  } else if (forma === 'misto') {
    const debito = Math.floor((valorNota * 100) / 2) / 100;
    const restante = valorNota - debito;
    const recebido = Math.ceil((restante + 0.01) / 10) * 10;
    troco = recebido - restante;
    pagamentos.push(`<detPag><indPag>0</indPag><tPag>04</tPag><vPag>${dinheiro(debito)}</vPag><card><tpIntegra>2</tpIntegra><tBand>02</tBand></card></detPag>`);
    pagamentos.push(`<detPag><indPag>0</indPag><tPag>01</tPag><vPag>${dinheiro(recebido)}</vPag></detPag>`);
  }

  const emit = `<emit><CNPJ>${EMITENTE_CNPJ}</CNPJ><xNome>AGRO SERRA DOURADA COMERCIO DE INSUMOS AGROPECUARIOS LTDA</xNome><xFant>AGRO SERRA DOURADA</xFant><enderEmit><xLgr>RODOVIA MT 242</xLgr><nro>KM 3</nro><xBairro>ZONA RURAL</xBairro><cMun>5107925</cMun><xMun>SORRISO</xMun><UF>MT</UF><CEP>78890000</CEP><cPais>1058</cPais><xPais>BRASIL</xPais><fone>6535441100</fone></enderEmit><IE>131234567</IE><CRT>3</CRT></emit>`;
  const enderecoEntrega = '<enderDest><xLgr>RUA DAS ACACIAS</xLgr><nro>120</nro><xBairro>JARDIM PRIMAVERA</xBairro><cMun>5107925</cMun><xMun>SORRISO</xMun><UF>MT</UF><CEP>78890100</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></enderDest>';
  let dest = '';
  if (o.entregaEmDomicilio) dest = `<dest><CPF>12345678909</CPF><xNome>MARIA APARECIDA DA SILVA</xNome>${enderecoEntrega}<indIEDest>9</indIEDest></dest>`;
  else if (consumidor === 'cpf') dest = '<dest><CPF>12345678909</CPF><indIEDest>9</indIEDest></dest>';
  else if (consumidor === 'cnpj') dest = '<dest><CNPJ>98765432000110</CNPJ><xNome>FAZENDA BOA ESPERANCA AGROPECUARIA LTDA</xNome><indIEDest>9</indIEDest></dest>';
  else if (consumidor === 'estrangeiro') dest = '<dest><idEstrangeiro>X1234567</idEstrangeiro><xNome>JOHN SMITH</xNome><indIEDest>9</indIEDest></dest>';

  // QR Code versão 2: online leva a chave, a versão, o ambiente, o id do CSC e o hash; a contingência off-line leva também o dia
  // da emissão, o valor da nota e o digest em hexadecimal (NT 2015.002).
  const idCsc = '1';
  const parametros = o.contingencia
    ? `${chave}|2|${tpAmb}|05|${dinheiro(valorNota)}|${Buffer.from(DIGEST_VALUE).toString('hex')}|${idCsc}`
    : `${chave}|2|${tpAmb}|${idCsc}`;
  const hash = createHash('sha1').update(`${parametros}${CSC_FICTICIO}`).digest('hex').toUpperCase();
  const urlConsulta = o.homologacao ? URL_CONSULTA_HOMOLOGACAO : URL_CONSULTA;
  const qrCode = `${urlConsulta}?p=${parametros}|${hash}`;

  const infAdFisco = o.infAdFisco ? `<infAdFisco>${o.infAdFisco}</infAdFisco>` : '';
  const infCpl = o.infCpl ?? 'Vendedor: Joao. Mercadoria destinada a produtor rural. Obrigado pela preferencia!';
  const contingencia = o.contingencia ? '<dhCont>2026-11-05T09:50:00-04:00</dhCont><xJust>Falha de comunicacao com a SEFAZ</xJust>' : '';
  const protocolo = semProtocolo
    ? ''
    : `<protNFe versao="4.00"><infProt><tpAmb>${tpAmb}</tpAmb><verAplic>SVRS202610</verAplic><chNFe>${chave}</chNFe><dhRecbto>2026-11-05T10:16:30-04:00</dhRecbto><nProt>${PROTOCOLO}</nProt><digVal>${DIGEST_VALUE}</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>`;

  const nfe = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${chave}" versao="4.00">
<ide><cUF>51</cUF><cNF>00000001</cNF><natOp>VENDA AO CONSUMIDOR</natOp><mod>65</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-11-05T10:15:00-04:00</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>5107925</cMunFG><tpImp>4</tpImp><tpEmis>${tpEmis}</tpEmis><cDV>${chave.slice(43)}</cDV><tpAmb>${tpAmb}</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>${o.entregaEmDomicilio ? 4 : 1}</indPres><procEmi>0</procEmi><verProc>PDV 5.2</verProc>${contingencia}</ide>
${emit}
${dest}
${dets.join('\n')}
<total><ICMSTot><vBC>${dinheiro(totalProdutos - totalDesconto)}</vBC><vICMS>${dinheiro(totalIcms)}</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${dinheiro(totalProdutos)}</vProd><vFrete>${dinheiro(frete)}</vFrete><vSeg>0.00</vSeg><vDesc>${dinheiro(totalDesconto)}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${dinheiro(valorNota)}</vNF>${o.semTributos ? '' : `<vTotTrib>${dinheiro(totalProdutos * 0.185)}</vTotTrib>`}</ICMSTot></total>
<transp><modFrete>${o.entregaEmDomicilio ? 0 : 9}</modFrete></transp>
${forma === 'nenhum' ? '' : `<pag>${pagamentos.join('')}${troco > 0 ? `<vTroco>${dinheiro(troco)}</vTroco>` : ''}</pag>`}
<infAdic>${infAdFisco}<infCpl>${infCpl}</infCpl></infAdic>
</infNFe><infNFeSupl><qrCode><![CDATA[${qrCode}]]></qrCode><urlChave>${urlConsulta}</urlChave></infNFeSupl><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><Reference URI="#NFe${chave}"><DigestValue>${DIGEST_VALUE}</DigestValue></Reference></SignedInfo><SignatureValue>ZmljdGljaW8=</SignatureValue></Signature></NFe>`;

  if (semProtocolo) return `<?xml version="1.0" encoding="UTF-8"?>\n${nfe}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${nfe}${protocolo}</nfeProc>`;
}
