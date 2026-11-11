/**
 * MDF-e de exemplo (modelo 58, leiaute 3.00) para os testes e para conferir o DAMDFE à vista. Valores fictícios, mas com a
 * forma do leiaute oficial (Anexo I do MOC 3.00b): as chaves de acesso têm o dígito verificador certo (módulo 11) e as tags
 * seguem a ordem do schema. O padrão é um MDF-e rodoviário de grãos saindo de MT para o porto de Paranaguá (PR).
 */
export interface OpcoesMdfeExemplo {
  /** Modal do manifesto; o padrão é o rodoviário completo (os outros saem só com os dados principais do modal). */
  modal?: 'rodoviario' | 'aereo' | 'aquaviario' | 'ferroviario';
  /** Reboques do veículo de tração (0 a 3; padrão 2, um bitrem). */
  reboques?: number;
  /** Municípios de descarga (padrão 3). */
  municipiosDescarga?: number;
  /** Documentos de cada tipo por município de descarga (padrão 2). */
  documentosPorMunicipio?: number;
  /**
   * Quais documentos fiscais vão nos municípios. O leiaute aceita CT-e e NF-e no mesmo município, mas as regras F14 a F16 do
   * Anexo I só deixam um tipo por tipo de emitente; o padrão `misto` serve para conferir os dois desenhos de uma vez.
   */
  tipoDocumentos?: 'misto' | 'cte' | 'nfe';
  homologacao?: boolean;
  /** Forma de emissão 2 (contingência off-line). */
  contingencia?: boolean;
  /** XML só com a raiz MDFe, sem o mdfeProc (e, por isso, sem o protocolo). */
  semProtocolo?: boolean;
  /** Sem o grupo infMDFeSupl (o QR Code). */
  semQrCode?: boolean;
  /** MDF-e com a carga incluída depois, por evento (indCarregaPosterior): sai sem documentos fiscais. */
  cargaPosterior?: boolean;
  /** Quantidade de vagões do modal ferroviário (padrão 3). */
  vagoes?: number;
  infCpl?: string;
  infAdFisco?: string;
  /** Lacres do manifesto (padrão 3). */
  lacres?: number;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const moeda = (n: number): string => n.toFixed(2);
const tag = (nome: string, valor: string | number | undefined): string => (valor === undefined || valor === '' ? '' : `<${nome}>${esc(String(valor))}</${nome}>`);

/** Dígito verificador da chave de acesso (módulo 11, pesos de 2 a 9 da direita para a esquerda; resto 0 ou 1 dá 0). */
export function digitoDaChave(base43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i -= 1) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

/** Chave de acesso de 44 dígitos de um documento de MT (UF 51): cUF, AAMM, CNPJ, modelo, série, número, tpEmis, cNF e DV. */
export function chaveFicticia(modelo: '55' | '57' | '58', numero: number, cnpj: string, opcoes: { serie?: number; aamm?: string; tpEmis?: string } = {}): string {
  const serie = String(opcoes.serie ?? 1).padStart(3, '0');
  const cNF = String((numero * 7919 + 12345678) % 100000000).padStart(8, '0');
  const base = `51${opcoes.aamm ?? '2611'}${cnpj}${modelo}${serie}${String(numero).padStart(9, '0')}${opcoes.tpEmis ?? '1'}${cNF}`;
  return `${base}${digitoDaChave(base)}`;
}

export const CNPJ_EMITENTE_MDFE = '11222333000181';
export const NUMERO_MDFE_EXEMPLO = 4512;
/** Chave do MDF-e que o gerador monta com as opções padrão (forma de emissão normal). */
export const CHAVE_MDFE_EXEMPLO = chaveFicticia('58', NUMERO_MDFE_EXEMPLO, CNPJ_EMITENTE_MDFE);

const CNPJS_REMETENTES = ['12345678000195', '98765432000110', '45678901000123', '23456789000150'];
const MUNICIPIOS_DESCARGA = [
  { cMun: '4118204', nome: 'PARANAGUA' },
  { cMun: '4119905', nome: 'PONTA GROSSA' },
  { cMun: '4104808', nome: 'CASCAVEL' },
  { cMun: '4115200', nome: 'MARINGA' },
  { cMun: '4113700', nome: 'LONDRINA' },
  { cMun: '4106902', nome: 'CURITIBA' },
];

/** Município com seus documentos, na forma de `infMunDescarga` do leiaute. */
function municipioDeDescarga(indice: number, o: OpcoesMdfeExemplo, seqCte: { n: number }, seqNfe: { n: number }): { xml: string; cte: number; nfe: number; mdfe: number } {
  const mun = MUNICIPIOS_DESCARGA[indice % MUNICIPIOS_DESCARGA.length];
  const nomeMun = indice < MUNICIPIOS_DESCARGA.length ? mun.nome : `${mun.nome} ${Math.floor(indice / MUNICIPIOS_DESCARGA.length) + 1}`;
  const porTipo = o.documentosPorMunicipio ?? 2;
  const cte = o.cargaPosterior || o.tipoDocumentos === 'nfe' ? 0 : porTipo;
  const nfe = o.cargaPosterior || o.tipoDocumentos === 'cte' ? 0 : porTipo;
  const partes: string[] = [];
  for (let i = 0; i < cte; i += 1) {
    seqCte.n += 1;
    partes.push(`<infCTe><chCTe>${chaveFicticia('57', seqCte.n, CNPJ_EMITENTE_MDFE, { serie: 1 })}</chCTe></infCTe>`);
  }
  for (let i = 0; i < nfe; i += 1) {
    seqNfe.n += 1;
    partes.push(`<infNFe><chNFe>${chaveFicticia('55', seqNfe.n, CNPJS_REMETENTES[seqNfe.n % CNPJS_REMETENTES.length], { serie: 1 })}</chNFe></infNFe>`);
  }
  let mdfe = 0;
  if (o.modal === 'aquaviario' && indice === 0) {
    // No aquaviário o manifesto pode referenciar o MDF-e do trecho rodoviário (grupo infMDFeTransp).
    mdfe = 1;
    partes.push(`<infMDFeTransp><chMDFe>${chaveFicticia('58', 777, CNPJ_EMITENTE_MDFE)}</chMDFe></infMDFeTransp>`);
  }
  return { xml: `<infMunDescarga><cMunDescarga>${mun.cMun}</cMunDescarga><xMunDescarga>${nomeMun}</xMunDescarga>${partes.join('')}</infMunDescarga>`, cte, nfe, mdfe };
}

function modalRodoviario(o: OpcoesMdfeExemplo): string {
  const reboques = Math.max(0, Math.min(3, o.reboques ?? 2));
  const placasReboque = ['ABC1D23', 'ABC4E56', 'ABC7F89'];
  const rebs = Array.from({ length: reboques }, (_, i) => `<veicReboque><cInt>R${i + 1}</cInt><placa>${placasReboque[i]}</placa><RENAVAM>0123456789${i}</RENAVAM><tara>7200</tara><capKG>20000</capKG><capM3>45</capM3>${i === 0 ? `<prop><CNPJ>45678901000123</CNPJ><RNTRC>04999111</RNTRC><xNome>TRANSPORTES PARCEIROS DO MEDIO NORTE LTDA</xNome><IE>131777888</IE><UF>MT</UF><tpProp>2</tpProp></prop>` : ''}<tpCar>03</tpCar><UF>MT</UF></veicReboque>`).join('');
  return `<rodo><infANTT><RNTRC>04512789</RNTRC><infCIOT><CIOT>123456789012</CIOT><CNPJ>12345678000195</CNPJ></infCIOT><infCIOT><CIOT>123456789013</CIOT><CPF>52998224725</CPF></infCIOT>`
    + `<valePed><disp><CNPJForn>12345678000195</CNPJForn><CNPJPg>98765432000110</CNPJPg><nCompra>202611050001234</nCompra><vValePed>842.30</vValePed><tpValePed>01</tpValePed></disp><disp><CNPJForn>12345678000195</CNPJForn><nCompra>202611050001235</nCompra><vValePed>310.00</vValePed><tpValePed>03</tpValePed></disp></valePed>`
    + `<infContratante><xNome>AGRO EXPORTADORA SOL NASCENTE S/A</xNome><CNPJ>98765432000110</CNPJ><infContrato><NroContrato>2026-0098</NroContrato><vContratoGlobal>48500.00</vContratoGlobal></infContrato></infContratante>`
    + `<infPag><xNome>AGRO EXPORTADORA SOL NASCENTE S/A</xNome><CNPJ>98765432000110</CNPJ><Comp><tpComp>01</tpComp><vComp>842.30</vComp></Comp><Comp><tpComp>99</tpComp><vComp>150.00</vComp><xComp>ADICIONAL DE ESPERA NO PORTO</xComp></Comp><vContrato>48500.00</vContrato><indAltoDesemp>1</indAltoDesemp><indPag>1</indPag><vAdiant>15000.00</vAdiant><infPrazo><nParcela>001</nParcela><dVenc>2026-12-05</dVenc><vParcela>33500.00</vParcela></infPrazo><infBanc><PIX>financeiro@transportadora-exemplo.com.br</PIX></infBanc></infPag></infANTT>`
    + `<veicTracao><cInt>T1</cInt><placa>QJK4B21</placa><RENAVAM>01234567890</RENAVAM><tara>9500</tara><capKG>0</capKG><capM3>0</capM3><condutor><xNome>JOSE CARLOS DA SILVA</xNome><CPF>52998224725</CPF></condutor><condutor><xNome>ANTONIO FERREIRA LIMA</xNome><CPF>11144477735</CPF></condutor><tpRod>03</tpRod><tpCar>00</tpCar><UF>MT</UF></veicTracao>`
    + `${rebs}${(o.lacres ?? 3) > 0 ? '<codAgPorto>AGD2026110512</codAgPorto>' : ''}${Array.from({ length: o.lacres ?? 3 }, (_, i) => `<lacRodo><nLacre>RD${String(7001 + i)}</nLacre></lacRodo>`).join('')}</rodo>`;
}

function modalAereo(): string {
  return '<aereo><nac>PT</nac><matr>MDF</matr><nVoo>AB1234</nVoo><cAerEmb>CGB</cAerEmb><cAerDes>CWB</cAerDes><dVoo>2026-11-06</dVoo></aereo>';
}

function modalFerroviario(o: OpcoesMdfeExemplo): string {
  const vagoes = Array.from({ length: o.vagoes ?? 3 }, (_, i) => `<vag><pesoBC>${(98.5 + i).toFixed(3)}</pesoBC><pesoR>${(97.25 + i).toFixed(3)}</pesoR><tpVag>GRANELEIRO</tpVag><serie>HFS</serie><nVag>${String(100200 + i * 17).padStart(8, '0')}</nVag><nSeq>${String(i + 1).padStart(3, '0')}</nSeq><TU>${(96.8 + i * 0.1).toFixed(3)}</TU></vag>`).join('');
  return `<ferrov><trem><xPref>R123</xPref><dhTrem>2026-11-06T06:30:00-03:00</dhTrem><xOri>RUM</xOri><xDest>PNG</xDest><qVag>${o.vagoes ?? 3}</qVag></trem>${vagoes}</ferrov>`;
}

function modalAquaviario(): string {
  return '<aquav><irin>PPXY</irin><tpEmb>01</tpEmb><cEmbar>0123456789</cEmbar><xEmbar>NAVIO GRANELEIRO EXEMPLO</xEmbar><nViag>0123</nViag><cPrtEmb>BRSSZ</cPrtEmb><cPrtDest>BRPNG</cPrtDest><prtTrans>BRITQ</prtTrans><tpNav>1</tpNav>'
    + '<infTermCarreg><cTermCarreg>12345678</cTermCarreg><xTermCarreg>TERMINAL DE GRAOS DO PORTO DE SANTOS</xTermCarreg></infTermCarreg>'
    + '<infTermDescarreg><cTermDescarreg>87654321</cTermDescarreg><xTermDescarreg>TERMINAL DE CONTEINERES DE PARANAGUA</xTermDescarreg></infTermDescarreg>'
    + '<infEmbComb><cEmbComb>BAL001</cEmbComb><xBalsa>BALSA GRANELEIRA 1</xBalsa></infEmbComb><infEmbComb><cEmbComb>BAL002</cEmbComb><xBalsa>BALSA GRANELEIRA 2</xBalsa></infEmbComb>'
    + '<infUnidCargaVazia><idUnidCargaVazia>MSKU1234567</idUnidCargaVazia><tpUnidCargaVazia>1</tpUnidCargaVazia></infUnidCargaVazia>'
    + '<infUnidTranspVazia><idUnidTranspVazia>QJK4B21</idUnidTranspVazia><tpUnidTranspVazia>1</tpUnidTranspVazia></infUnidTranspVazia></aquav>';
}

/** XML do MDF-e de exemplo: `mdfeProc` com o protocolo (ou só `MDFe`, com `semProtocolo`). */
export function mdfeExemplo(o: OpcoesMdfeExemplo = {}): string {
  const modal = o.modal ?? 'rodoviario';
  const codigoModal = { rodoviario: '1', aereo: '2', aquaviario: '3', ferroviario: '4' }[modal];
  const tpEmis = o.contingencia ? '2' : '1';
  const tpAmb = o.homologacao ? 2 : 1;
  const chave = chaveFicticia('58', NUMERO_MDFE_EXEMPLO, CNPJ_EMITENTE_MDFE, { tpEmis });
  const cMDF = chave.slice(35, 43);

  const seqCte = { n: 0 };
  const seqNfe = { n: 0 };
  const municipios = Array.from({ length: o.municipiosDescarga ?? 3 }, (_, i) => municipioDeDescarga(i, o, seqCte, seqNfe));
  const qCte = municipios.reduce((acc, m) => acc + m.cte, 0);
  const qNfe = municipios.reduce((acc, m) => acc + m.nfe, 0);
  const qMdfe = municipios.reduce((acc, m) => acc + m.mdfe, 0);
  // Peso e valor da carga não dependem de quantos documentos a descrevem: um bitrem leva ~38,5 t; o trem e o navio, em toneladas.
  const emToneladas = o.modal === 'ferroviario' || o.modal === 'aquaviario';
  const pesoCarga = o.modal === 'ferroviario' ? (o.vagoes ?? 3) * 96.8 : o.modal === 'aquaviario' ? 52000 : 38500;
  const valorCarga = o.modal === 'ferroviario' ? (o.vagoes ?? 3) * 120000 : o.modal === 'aquaviario' ? 7800000 : 148750.5;

  const modalXml = modal === 'rodoviario' ? modalRodoviario(o) : modal === 'aereo' ? modalAereo() : modal === 'ferroviario' ? modalFerroviario(o) : modalAquaviario();
  const infDoc = o.cargaPosterior ? '' : `<infDoc>${municipios.map((m) => m.xml).join('')}</infDoc>`;
  const qrCode = `https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=${chave}&amp;tpAmb=${tpAmb}${o.contingencia ? '&amp;sign=Vn0m4sQ1w0q0m3t6B0s6pQy5Qp7oV6r3lXw8D2o2hXk=' : ''}`;
  const lacres = Array.from({ length: o.lacres ?? 3 }, (_, i) => `<lacres><nLacre>MD${String(5001 + i)}</nLacre></lacres>`).join('');

  const infMdfe = `<infMDFe Id="MDFe${chave}" versao="3.00">
<ide><cUF>51</cUF><tpAmb>${tpAmb}</tpAmb><tpEmit>1</tpEmit>${modal === 'rodoviario' ? '<tpTransp>1</tpTransp>' : ''}<mod>58</mod><serie>1</serie><nMDF>${NUMERO_MDFE_EXEMPLO}</nMDF><cMDF>${cMDF}</cMDF><cDV>${chave.slice(43)}</cDV><modal>${codigoModal}</modal><dhEmi>2026-11-05T08:42:10-04:00</dhEmi><tpEmis>${tpEmis}</tpEmis><procEmi>0</procEmi><verProc>InTAX 1.0</verProc><UFIni>MT</UFIni><UFFim>PR</UFFim><infMunCarrega><cMunCarrega>5107925</cMunCarrega><xMunCarrega>SORRISO</xMunCarrega></infMunCarrega><infMunCarrega><cMunCarrega>5105259</cMunCarrega><xMunCarrega>LUCAS DO RIO VERDE</xMunCarrega></infMunCarrega><infPercurso><UFPer>MS</UFPer></infPercurso><dhIniViagem>2026-11-05T14:00:00-04:00</dhIniViagem>${o.cargaPosterior ? '<indCarregaPosterior>1</indCarregaPosterior>' : ''}</ide>
<emit><CNPJ>${CNPJ_EMITENTE_MDFE}</CNPJ><IE>131000111</IE><xNome>TRANSPORTADORA GRAOS DO NORTE LTDA</xNome><xFant>GRAOS DO NORTE</xFant><enderEmit><xLgr>RODOVIA BR 163 KM 782</xLgr><nro>S/N</nro><xCpl>GALPAO 2</xCpl><xBairro>DISTRITO INDUSTRIAL</xBairro><cMun>5107925</cMun><xMun>SORRISO</xMun><CEP>78890000</CEP><UF>MT</UF><fone>6635441200</fone><email>operacao@graosdonorte.example.com.br</email></enderEmit></emit>
<infModal versaoModal="3.00">${modalXml}</infModal>
${infDoc}
<seg><infResp><respSeg>1</respSeg><CNPJ>${CNPJ_EMITENTE_MDFE}</CNPJ></infResp><infSeg><xSeg>SEGURADORA EXEMPLO S/A</xSeg><CNPJ>45678901000123</CNPJ></infSeg><nApol>1234567890123</nApol><nAver>2026110000000123456789</nAver><nAver>2026110000000987654321</nAver></seg>
<prodPred><tpCarga>01</tpCarga><xProd>SOJA EM GRAOS</xProd><cEAN>SEM GTIN</cEAN><NCM>12019000</NCM></prodPred>
<tot>${qCte ? `<qCTe>${qCte}</qCTe>` : ''}${qNfe ? `<qNFe>${qNfe}</qNFe>` : ''}${qMdfe ? `<qMDFe>${qMdfe}</qMDFe>` : ''}<vCarga>${moeda(valorCarga)}</vCarga><cUnid>${emToneladas ? '02' : '01'}</cUnid><qCarga>${pesoCarga.toFixed(4)}</qCarga></tot>
${lacres}
<autXML><CNPJ>12345678000195</CNPJ></autXML><autXML><CPF>52998224725</CPF></autXML>
<infAdic>${tag('infAdFisco', o.infAdFisco ?? 'Transporte de carga de soja em graos amparado por contrato de transporte continuado.')}${tag('infCpl', o.infCpl ?? 'Carga de soja em graos safra 2025/26. Viagem sujeita a pesagem no porto de destino. Motorista orientado quanto ao horario de agendamento.')}</infAdic>
</infMDFe>`;

  const suplementar = o.semQrCode ? '' : `<infMDFeSupl><qrCodMDFe>${qrCode}</qrCodMDFe></infMDFeSupl>`;
  const assinatura = '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#MDFe' + chave + '"><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>abc=</DigestValue></Reference></SignedInfo><SignatureValue>def=</SignatureValue></Signature>';
  const mdfe = `<MDFe xmlns="http://www.portalfiscal.inf.br/mdfe">${infMdfe}${suplementar}${assinatura}</MDFe>`;
  if (o.semProtocolo) return `<?xml version="1.0" encoding="UTF-8"?>\n${mdfe}`;
  const protocolo = `<protMDFe versao="3.00"><infProt><tpAmb>${tpAmb}</tpAmb><verAplic>RS20261031</verAplic><chMDFe>${chave}</chMDFe><dhRecbto>2026-11-05T09:42:58-03:00</dhRecbto><nProt>151260000012345</nProt><digVal>abc=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso do MDF-e</xMotivo></infProt></protMDFe>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mdfeProc xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00">${mdfe}${protocolo}</mdfeProc>`;
}

/** MDF-e com o mínimo possível (identificação, emitente e a chave): serve para ver os campos ausentes em branco. */
export function mdfeMinimo(): string {
  return `<MDFe xmlns="http://www.portalfiscal.inf.br/mdfe"><infMDFe Id="MDFe${CHAVE_MDFE_EXEMPLO}" versao="3.00"><ide><mod>58</mod></ide><emit><CNPJ>${CNPJ_EMITENTE_MDFE}</CNPJ></emit></infMDFe></MDFe>`;
}
