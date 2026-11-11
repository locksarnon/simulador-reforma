/**
 * CT-e de exemplo (modelo 57, leiaute 4.00, modal rodoviário) para os testes e para conferir o DACTE à vista: transporte de soja
 * em grãos entre duas cidades de Mato Grosso, com valores e empresas fictícios. As variações cobrem o que o leiaute muda no
 * documento: poucos e muitos documentos originários, sem expedidor e recebedor, tomador de cada tipo, homologação, CT-e
 * complementar, substituto e de anulação (este só existe no leiaute 3.00), cada grupo de ICMS, IBS/CBS (NT 2025.001) e outros modais.
 */

const CNPJ_TRANSPORTADORA = '11222333000181';
const CNPJ_REMETENTE = '12345678000195';
const CPF_PRODUTOR = '12345678909';

/** Dígito verificador da chave de acesso: módulo 11, pesos de 2 a 9 da direita para a esquerda. */
function digitoDaChave(base43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i -= 1) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

function montarChave(o: { documento: string; modelo: string; serie: number; numero: number; codigo: number }): string {
  const base = `512611${o.documento.padStart(14, '0')}${o.modelo}${String(o.serie).padStart(3, '0')}${String(o.numero).padStart(9, '0')}1${String(o.codigo).padStart(8, '0')}`;
  return `${base}${digitoDaChave(base)}`;
}

export const CHAVE_CTE_EXEMPLO = montarChave({ documento: CNPJ_TRANSPORTADORA, modelo: '57', serie: 1, numero: 123, codigo: 123 });
/** Chave do CT-e que o complementar complementa, o substituto substitui ou a anulação anula. */
export const CHAVE_CTE_REFERENCIADO = montarChave({ documento: CNPJ_TRANSPORTADORA, modelo: '57', serie: 1, numero: 98, codigo: 98 });
export const URL_QR_CTE_EXEMPLO = `https://dfe-portal.svrs.rs.gov.br/cte/qrCode?chCTe=${CHAVE_CTE_EXEMPLO}&tpAmb=1`;

/** Chave da NF-e transportada de número `numero`; a segunda do exemplo é de um produtor rural (CPF), como é comum no agro. */
export function chaveNfeExemplo(numero: number): string {
  const documento = numero === 2 ? `000${CPF_PRODUTOR}` : CNPJ_REMETENTE;
  return montarChave({ documento, modelo: '55', serie: 1, numero, codigo: (numero * 7919) % 100000000 });
}

export interface OpcoesCteExemplo {
  /** Quantidade de NF-e nos documentos originários (padrão 3). */
  documentos?: number;
  semExpedidor?: boolean;
  semRecebedor?: boolean;
  /** Quem toma o serviço (padrão: o remetente); "outros" usa o grupo toma4, com dados próprios. */
  tomador?: 'remetente' | 'expedidor' | 'recebedor' | 'destinatario' | 'outros';
  homologacao?: boolean;
  /** tpCTe: normal (0), complemento de valores (1), substituição (3) ou anulação (2, só no leiaute 3.00). */
  tipo?: 'normal' | 'complemento' | 'substituto' | 'anulacao';
  semProtocolo?: boolean;
  semQrCode?: boolean;
  icms?: 'ICMS00' | 'ICMS20' | 'ICMS45' | 'ICMS60' | 'ICMS90' | 'ICMSOutraUF' | 'ICMSSN';
  /** Quantidade total de componentes do valor da prestação (padrão 3). */
  componentes?: number;
  /** Texto de compl/xObs. */
  observacao?: string;
  obsCont?: number;
  obsFisco?: number;
  /** Código do ide/modal; só o rodoviário (01) tem o bloco próprio, os outros mostram os campos como estão no XML. */
  modal?: '01' | '02' | '03' | '04' | '05' | '06';
  ibsCbs?: boolean;
  globalizado?: boolean;
  documentosAnteriores?: boolean;
  /** Veículos novos transportados (infCTeNorm/veicNovos), caso específico do item 2.21.4 do MOC. */
  veiculosNovos?: number;
  ordensColeta?: number;
  /** Só o que o leiaute exige: sem fantasia, complementos, fluxo, observações, carga detalhada, componentes e protocolo. */
  enxuto?: boolean;
  /** Texto de infAdFisco (informações adicionais de interesse do Fisco). */
  infAdFisco?: string;
}

const moeda = (n: number) => n.toFixed(2);

function parteXml(tag: string, enderecoTag: string, p: { cnpj?: string; cpf?: string; ie?: string; nome: string; fantasia?: string; fone?: string; suframa?: string; logradouro: string; numero: string; complemento?: string; bairro: string; cMun: string; municipio: string; cep: string; uf: string }, extra = ''): string {
  const documento = p.cnpj ? `<CNPJ>${p.cnpj}</CNPJ>` : `<CPF>${p.cpf}</CPF>`;
  return `<${tag}>${extra}${documento}${p.ie ? `<IE>${p.ie}</IE>` : ''}<xNome>${p.nome}</xNome>${p.fantasia ? `<xFant>${p.fantasia}</xFant>` : ''}${p.fone ? `<fone>${p.fone}</fone>` : ''}${p.suframa ? `<ISUF>${p.suframa}</ISUF>` : ''}<${enderecoTag}><xLgr>${p.logradouro}</xLgr><nro>${p.numero}</nro>${p.complemento ? `<xCpl>${p.complemento}</xCpl>` : ''}<xBairro>${p.bairro}</xBairro><cMun>${p.cMun}</cMun><xMun>${p.municipio}</xMun><CEP>${p.cep}</CEP><UF>${p.uf}</UF><cPais>1058</cPais><xPais>BRASIL</xPais></${enderecoTag}></${tag}>`;
}

const REMETENTE = { cnpj: CNPJ_REMETENTE, ie: '131000222', nome: 'FAZENDA SÃO JOÃO AGROPECUÁRIA LTDA', fantasia: 'SAO JOAO', fone: '6635442000', logradouro: 'ESTRADA VICINAL LINHA 12 KM 8', numero: 'S/N', bairro: 'ZONA RURAL', cMun: '5107925', municipio: 'SORRISO', cep: '78890000', uf: 'MT' };
const EXPEDIDOR = { cnpj: '22333444000172', ie: '131000333', nome: 'ARMAZENS GERAIS VALE VERDE LTDA', fone: '6535491100', logradouro: 'AVENIDA DAS INDUSTRIAS', numero: '2500', complemento: 'GALPAO 4', bairro: 'DISTRITO INDUSTRIAL', cMun: '5105259', municipio: 'LUCAS DO RIO VERDE', cep: '78455000', uf: 'MT' };
const RECEBEDOR = { cnpj: '33444555000163', ie: '131000444', nome: 'TERMINAL INTERMODAL DO CENTRO-OESTE S/A', fone: '6634211500', logradouro: 'RODOVIA BR 364 KM 3', numero: 'S/N', bairro: 'AREA PORTUARIA SECA', cMun: '5107602', municipio: 'RONDONOPOLIS', cep: '78700970', uf: 'MT' };
const DESTINATARIO = { cnpj: '98765432000110', ie: '131999888', nome: 'TRADING COMMODITIES BRASIL S/A', fone: '6634210000', suframa: '', logradouro: 'AVENIDA DAS PALMEIRAS', numero: '1500', complemento: 'SALA 801', bairro: 'CENTRO', cMun: '5107602', municipio: 'RONDONOPOLIS', cep: '78700000', uf: 'MT' };
const TOMADOR_OUTROS = { cnpj: '44555666000154', ie: '131000555', nome: 'COOPERATIVA AGROINDUSTRIAL DO MEDIO NORTE', fantasia: 'COOPERNORTE', fone: '6635443000', logradouro: 'RUA DOS COOPERADOS', numero: '900', bairro: 'CENTRO', cMun: '5107925', municipio: 'SORRISO', cep: '78890100', uf: 'MT' };

const NOMES_COMPONENTES = ['FRETE PESO', 'PEDAGIO', 'SEC/CAT', 'FRETE VALOR', 'GRIS', 'TX DESCARGA', 'AGENDAMENTO', 'DESPACHO', 'ESTADIA', 'ADEME', 'SEGURO', 'TAS'];

function blocoIcms(grupo: NonNullable<OpcoesCteExemplo['icms']>, total: number): string {
  const base = total;
  const aliquota = 12;
  switch (grupo) {
    case 'ICMS00':
      return `<ICMS><ICMS00><CST>00</CST><vBC>${moeda(base)}</vBC><pICMS>${moeda(aliquota)}</pICMS><vICMS>${moeda((base * aliquota) / 100)}</vICMS></ICMS00></ICMS>`;
    case 'ICMS20': {
      const reduzida = base * 0.6;
      return `<ICMS><ICMS20><CST>20</CST><pRedBC>40.00</pRedBC><vBC>${moeda(reduzida)}</vBC><pICMS>${moeda(aliquota)}</pICMS><vICMS>${moeda((reduzida * aliquota) / 100)}</vICMS></ICMS20></ICMS>`;
    }
    case 'ICMS45':
      return '<ICMS><ICMS45><CST>40</CST></ICMS45></ICMS>';
    case 'ICMS60':
      return `<ICMS><ICMS60><CST>60</CST><vBCSTRet>${moeda(base)}</vBCSTRet><vICMSSTRet>${moeda((base * 17) / 100)}</vICMSSTRet><pICMSSTRet>17.00</pICMSSTRet><vCred>${moeda((base * 17 * 0.2) / 100)}</vCred></ICMS60></ICMS>`;
    case 'ICMS90':
      return `<ICMS><ICMS90><CST>90</CST><pRedBC>10.00</pRedBC><vBC>${moeda(base * 0.9)}</vBC><pICMS>${moeda(aliquota)}</pICMS><vICMS>${moeda((base * 0.9 * aliquota) / 100)}</vICMS><vCred>10.00</vCred></ICMS90></ICMS>`;
    case 'ICMSOutraUF':
      return `<ICMS><ICMSOutraUF><CST>90</CST><pRedBCOutraUF>0.00</pRedBCOutraUF><vBCOutraUF>${moeda(base)}</vBCOutraUF><pICMSOutraUF>${moeda(aliquota)}</pICMSOutraUF><vICMSOutraUF>${moeda((base * aliquota) / 100)}</vICMSOutraUF></ICMSOutraUF></ICMS>`;
    default:
      return '<ICMS><ICMSSN><CST>01</CST><indSN>1</indSN></ICMSSN></ICMS>';
  }
}

function blocoModal(modal: string, ordens: number): string {
  switch (modal) {
    case '02':
      return '<infModal versaoModal="4.00"><aereo><nMinu>123456789</nMinu><nOCA>12345678901</nOCA><dPrevAereo>2026-11-12</dPrevAereo><natCarga><xDime>120X80X60</xDime><cInfManu>03</cInfManu></natCarga><tarifa><CL>G</CL><cTar>001</cTar><vTar>12.50</vTar></tarifa></aereo></infModal>';
    case '03':
      return '<infModal versaoModal="4.00"><aquav><vPrest>3688.83</vPrest><vAFRMM>0.00</vAFRMM><xNavio>NAVIO EXEMPLO</xNavio><balsa><xBalsa>BALSA 01</xBalsa></balsa><nViag>112</nViag><direc>N</direc><irin>ABC123</irin><tpNav>0</tpNav></aquav></infModal>';
    case '04':
      return '<infModal versaoModal="4.00"><ferrov><tpTraf>1</tpTraf><trafMut><respFat>1</respFat><ferrEmi>1</ferrEmi><vFrete>3688.83</vFrete></trafMut><fluxo>1234567890</fluxo></ferrov></infModal>';
    case '05':
      return '<infModal versaoModal="4.00"><duto><vTar>0.123456</vTar><dIni>2026-11-01</dIni><dFim>2026-11-30</dFim></duto></infModal>';
    case '06':
      return '<infModal versaoModal="4.00"><multimodal><COTM>COTM-2026-0042</COTM><indNegociavel>0</indNegociavel><seg><infSeg><xSeg>SEGURADORA EXEMPLO</xSeg></infSeg><nApol>APOL-998877</nApol></seg></multimodal></infModal>';
    default: {
      const occ: string[] = [];
      for (let i = 1; i <= ordens; i += 1) occ.push(`<occ><serie>1</serie><nOcc>${String(i * 17)}</nOcc><dEmi>2026-11-0${(i % 5) + 1}</dEmi><emiOcc><CNPJ>${CNPJ_TRANSPORTADORA}</CNPJ><cInt>FIL${i}</cInt><IE>131234567</IE><UF>MT</UF><fone>6635441000</fone></emiOcc></occ>`);
      return `<infModal versaoModal="4.00"><rodo><RNTRC>12345678</RNTRC>${occ.join('')}</rodo></infModal>`;
    }
  }
}

function blocoIbsCbs(total: number): string {
  const vbc = total;
  return `<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>${moeda(vbc)}</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>${moeda(vbc * 0.001)}</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>${moeda(vbc * 0.001)}</vIBS><gCBS><pCBS>0.90</pCBS><vCBS>${moeda(vbc * 0.009)}</vCBS></gCBS></gIBSCBS></IBSCBS>`;
}

export function cteExemplo(o: OpcoesCteExemplo = {}): string {
  const tipo = o.tipo ?? 'normal';
  const enxuto = !!o.enxuto;
  const versao = tipo === 'anulacao' ? '3.00' : '4.00';
  const tpCte = { normal: '0', complemento: '1', substituto: '3', anulacao: '2' }[tipo];
  const quantidadeDocs = o.documentos ?? 3;
  const qtdComponentes = enxuto ? 1 : Math.max(1, o.componentes ?? 3);

  const componentes: { nome: string; valor: number }[] = [];
  for (let i = 0; i < qtdComponentes; i += 1) {
    componentes.push({ nome: i < NOMES_COMPONENTES.length ? NOMES_COMPONENTES[i] : `COMP ${i + 1}`, valor: i === 0 ? 3688.83 : 20 + i * 11.5 });
  }
  const total = Math.round(componentes.reduce((acc, c) => acc + c.valor, 0) * 100) / 100;
  const amb = o.homologacao ? 2 : 1;

  const tomaPapel = o.tomador ?? 'remetente';
  const codigoToma = { remetente: '0', expedidor: '1', recebedor: '2', destinatario: '3', outros: '4' }[tomaPapel];
  const toma = tomaPapel === 'outros'
    ? parteXml('toma4', 'enderToma', TOMADOR_OUTROS, '<toma>4</toma>')
    : `<toma3><toma>${codigoToma}</toma></toma3>`;
  const exped = !o.semExpedidor || tomaPapel === 'expedidor';
  const receb = !o.semRecebedor || tomaPapel === 'recebedor';

  const ide = `<ide><cUF>51</cUF><cCT>00000123</cCT><CFOP>5353</CFOP><natOp>PRESTACAO DE SERVICO DE TRANSPORTE A ESTABELECIMENTO COMERCIAL</natOp><mod>57</mod><serie>1</serie><nCT>123</nCT><dhEmi>2026-11-05T10:15:00-03:00</dhEmi><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${CHAVE_CTE_EXEMPLO.slice(43)}</cDV><tpAmb>${amb}</tpAmb><tpCTe>${tpCte}</tpCTe><procEmi>0</procEmi><verProc>InTAX-QA 1.0</verProc>${o.globalizado ? '<indGlobalizado>1</indGlobalizado>' : ''}<cMunEnv>5107925</cMunEnv><xMunEnv>SORRISO</xMunEnv><UFEnv>MT</UFEnv><modal>${o.modal ?? '01'}</modal><tpServ>0</tpServ><cMunIni>5107925</cMunIni><xMunIni>SORRISO</xMunIni><UFIni>MT</UFIni><cMunFim>5107602</cMunFim><xMunFim>RONDONOPOLIS</xMunFim><UFFim>MT</UFFim><retira>1</retira><indIEToma>1</indIEToma>${toma}</ide>`;

  const obsCont: string[] = [];
  for (let i = 1; i <= (o.obsCont ?? 0); i += 1) obsCont.push(`<ObsCont xCampo="CAMPO${i}"><xTexto>CONTEUDO LIVRE DO EMISSOR NUMERO ${i}</xTexto></ObsCont>`);
  const obsFisco: string[] = [];
  for (let i = 1; i <= (o.obsFisco ?? 0); i += 1) obsFisco.push(`<ObsFisco xCampo="FISCO${i}"><xTexto>NORMA REFERENCIADA ${i}</xTexto></ObsFisco>`);
  const observacao = o.observacao ?? 'FRETE CIF. CARGA GRANEL. ROMANEIO 4587. CONTRATO 2026/1123. MOTORISTA JOSE DA SILVA CPF 123.456.789-09. PLACAS ABC1D23 E DEF4G56.';
  const compl = enxuto
    ? ''
    : `<compl><xCaracAd>CONVENCIONAL</xCaracAd><fluxo><xOrig>SORRISO</xOrig><pass><xPass>NOVA MUTUM</xPass></pass><xDest>RONDONOPOLIS</xDest></fluxo><xObs>${observacao}</xObs>${obsCont.join('')}${obsFisco.join('')}</compl>`;

  const emit = `<emit><CNPJ>${CNPJ_TRANSPORTADORA}</CNPJ><IE>131234567</IE><xNome>TRANSPORTADORA GRAOS DO CERRADO LTDA</xNome>${enxuto ? '' : '<xFant>TRANSGRAOS</xFant>'}<enderEmit><xLgr>RODOVIA BR 163</xLgr><nro>KM 801</nro>${enxuto ? '' : '<xCpl>GALPAO 2</xCpl>'}<xBairro>DISTRITO INDUSTRIAL</xBairro><cMun>5107925</cMun><xMun>SORRISO</xMun><CEP>78890000</CEP><UF>MT</UF>${enxuto ? '' : '<fone>6635441000</fone>'}</enderEmit><CRT>3</CRT></emit>`;
  const partes = [
    parteXml('rem', 'enderReme', REMETENTE),
    exped ? parteXml('exped', 'enderExped', EXPEDIDOR) : '',
    receb ? parteXml('receb', 'enderReceb', RECEBEDOR) : '',
    parteXml('dest', 'enderDest', { ...DESTINATARIO, suframa: '' }),
  ].join('');

  const vPrest = `<vPrest><vTPrest>${moeda(total)}</vTPrest><vRec>${moeda(total)}</vRec>${componentes.map((c) => `<Comp><xNome>${c.nome}</xNome><vComp>${moeda(c.valor)}</vComp></Comp>`).join('')}</vPrest>`;
  const imp = `<imp>${blocoIcms(o.icms ?? 'ICMS00', total)}${enxuto ? '' : `<vTotTrib>${moeda(total * 0.12)}</vTotTrib>`}${o.infAdFisco ? `<infAdFisco>${o.infAdFisco}</infAdFisco>` : ''}${o.ibsCbs ? `${blocoIbsCbs(total)}<vTotDFe>${moeda(total * 1.01)}</vTotDFe>` : ''}</imp>`;

  const infQ = (unidade: string, medida: string, quantidade: string) => `<infQ><cUnid>${unidade}</cUnid><tpMed>${medida}</tpMed><qCarga>${quantidade}</qCarga></infQ>`;
  const carga = enxuto
    ? '<infCarga><vCarga>182500.00</vCarga><proPred>SOJA EM GRAOS</proPred><infQ><cUnid>01</cUnid><tpMed>PESO BRUTO</tpMed><qCarga>37450.0000</qCarga></infQ></infCarga>'
    : `<infCarga><vCarga>182500.00</vCarga><proPred>SOJA EM GRAOS</proPred><xOutCat>GRANEL</xOutCat>${infQ('01', 'PESO BRUTO', '37450.0000')}${infQ('01', 'PESO BASE DE CALCULO', '37450.0000')}${infQ('02', 'PESO AFERIDO', '37.4200')}${infQ('03', 'VOLUME', '1.0000')}</infCarga>`;

  const docs: string[] = [];
  for (let i = 1; i <= quantidadeDocs; i += 1) docs.push(`<infNFe><chave>${chaveNfeExemplo(i)}</chave></infNFe>`);
  const docAnt = o.documentosAnteriores
    ? `<docAnt><emiDocAnt><CNPJ>44555666000154</CNPJ><IE>131000555</IE><UF>MT</UF><xNome>TRANSPORTADORA ANTERIOR LTDA</xNome><idDocAnt><idDocAntEle><chCTe>${CHAVE_CTE_REFERENCIADO}</chCTe></idDocAntEle><idDocAntPap><tpDoc>08</tpDoc><serie>1</serie><subser>2</subser><nDoc>4455</nDoc><dEmi>2026-10-30</dEmi></idDocAntPap></idDocAnt></emiDocAnt></docAnt>`
    : '';
  const veiculos: string[] = [];
  for (let i = 1; i <= (o.veiculosNovos ?? 0); i += 1) veiculos.push(`<veicNovos><chassi>9BWZZZ377VT00${String(4200 + i)}</chassi><cCor>12</cCor><xCor>PRATA METALICO</xCor><cMod>12345${i % 10}</cMod><vUnit>${moeda(85000 + i * 1000)}</vUnit><vFrete>${moeda(1200 + i)}</vFrete></veicNovos>`);
  const normal = `<infCTeNorm>${carga}<infDoc>${docs.join('')}</infDoc>${docAnt}${blocoModal(o.modal ?? '01', o.ordensColeta ?? 0)}${veiculos.join('')}${tipo === 'substituto' ? `<infCteSub><chCte>${CHAVE_CTE_REFERENCIADO}</chCte></infCteSub>` : ''}${o.globalizado ? '<infGlobalizado><xObs>CTE GLOBALIZADO CONFORME REGIME ESPECIAL AUTORIZADO PELA SEFAZ</xObs></infGlobalizado>' : ''}</infCTeNorm>`;
  const complemento = tipo === 'complemento' ? `<infCteComp><chCTe>${CHAVE_CTE_REFERENCIADO}</chCTe></infCteComp>` : '';
  const anulacao = tipo === 'anulacao' ? `<infCteAnu><chCte>${CHAVE_CTE_REFERENCIADO}</chCte><dEmi>2026-11-04</dEmi></infCteAnu>` : '';
  const corpo = tipo === 'complemento' || tipo === 'anulacao' ? `${complemento}${anulacao}` : normal;

  const autorizados = enxuto ? '' : `<autXML><CNPJ>${CNPJ_REMETENTE}</CNPJ></autXML><infRespTec><CNPJ>55666777000145</CNPJ><xContato>SUPORTE EMISSOR</xContato><email>suporte@emissor.exemplo</email><fone>6530001000</fone></infRespTec>`;
  const qr = o.semQrCode ? '' : `<infCTeSupl><qrCodCTe>https://dfe-portal.svrs.rs.gov.br/cte/qrCode?chCTe=${CHAVE_CTE_EXEMPLO}&amp;tpAmb=${amb}</qrCodCTe></infCTeSupl>`;
  const assinatura = '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/></SignedInfo><SignatureValue>AAAA</SignatureValue></Signature>';
  const protocolo = o.semProtocolo
    ? ''
    : `<protCTe versao="${versao}"><infProt><tpAmb>${amb}</tpAmb><verAplic>MT_CTE_202610</verAplic><chCTe>${CHAVE_CTE_EXEMPLO}</chCTe><dhRecbto>2026-11-05T10:16:30-03:00</dhRecbto><nProt>351260000000321</nProt><digVal>abc=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso do CT-e</xMotivo></infProt></protCTe>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="${versao}"><CTe xmlns="http://www.portalfiscal.inf.br/cte"><infCte Id="CTe${CHAVE_CTE_EXEMPLO}" versao="${versao}">
${ide}
${compl}
${emit}
${partes}
${vPrest}
${imp}
${corpo}
${autorizados}
</infCte>${qr}${assinatura}</CTe>${protocolo}</cteProc>`;
}
