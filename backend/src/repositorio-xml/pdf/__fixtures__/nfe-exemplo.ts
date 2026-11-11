/** NF-e de exemplo (leiaute 4.00) para os testes e para conferir o DANFE à vista. Valores fictícios. */
export const CHAVE_EXEMPLO = '51261112345678000195550010000001231000000010';

export interface OpcoesNfeExemplo {
  itens?: number;
  duplicatas?: number;
  homologacao?: boolean;
  semDestinatario?: boolean;
  semProtocolo?: boolean;
  infCpl?: string;
  servicos?: boolean;
}

const moeda = (n: number) => n.toFixed(2);

export function nfeExemplo(o: OpcoesNfeExemplo = {}): string {
  const qtdItens = o.itens ?? 3;
  const qtdDup = o.duplicatas ?? 2;
  const descricoes = [
    'SOJA EM GRAOS CLASSIFICADA',
    'HERBICIDA GLIFOSATO 480 G/L CONCENTRADO SOLUVEL - GALAO DE 20 LITROS - LOTE 2026/11-A - VALIDADE 11/2028',
    'FERTILIZANTE NPK 04-14-08 SACO DE 50 KG',
    'OLEO DIESEL S10',
  ];
  let totalProdutos = 0;
  let totalIcms = 0;
  const dets: string[] = [];
  for (let i = 1; i <= qtdItens; i += 1) {
    const qtd = 10 + i / 2;
    const unit = 100 + i * 7.25;
    const valor = Math.round(qtd * unit * 100) / 100;
    const icms = Math.round(valor * 0.12 * 100) / 100;
    totalProdutos += valor;
    totalIcms += icms;
    dets.push(`<det nItem="${i}"><prod><cProd>P${String(i).padStart(4, '0')}</cProd><cEAN>SEM GTIN</cEAN><xProd>${descricoes[(i - 1) % descricoes.length]}</xProd><NCM>12019000</NCM><CFOP>5102</CFOP><uCom>SC</uCom><qCom>${qtd.toFixed(4)}</qCom><vUnCom>${unit.toFixed(10)}</vUnCom><vProd>${moeda(valor)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>SC</uTrib><qTrib>${qtd.toFixed(4)}</qTrib><vUnTrib>${unit.toFixed(10)}</vUnTrib><indTot>1</indTot></prod><imposto><vTotTrib>${moeda(valor * 0.1)}</vTotTrib><ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${moeda(valor)}</vBC><pICMS>12.0000</pICMS><vICMS>${moeda(icms)}</vICMS></ICMS00></ICMS><IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>${moeda(valor)}</vBC><pIPI>5.0000</pIPI><vIPI>${moeda(valor * 0.05)}</vIPI></IPITrib></IPI></imposto>${i === 2 ? '<infAdProd>Lote 2026/11-A</infAdProd>' : ''}</det>`);
  }
  const frete = 120.5;
  const valorNota = totalProdutos + frete;
  const dups: string[] = [];
  for (let d = 1; d <= qtdDup; d += 1) dups.push(`<dup><nDup>${String(d).padStart(3, '0')}</nDup><dVenc>2026-12-${String(5 + d).padStart(2, '0')}</dVenc><vDup>${moeda(valorNota / qtdDup)}</vDup></dup>`);
  const dest = o.semDestinatario
    ? ''
    : '<dest><CNPJ>98765432000110</CNPJ><xNome>CLIENTE EXEMPLO AGROPECUARIA S/A</xNome><enderDest><xLgr>AVENIDA DAS PALMEIRAS</xLgr><nro>1500</nro><xBairro>CENTRO</xBairro><cMun>5107602</cMun><xMun>RONDONOPOLIS</xMun><UF>MT</UF><CEP>78700000</CEP><cPais>1058</cPais><xPais>BRASIL</xPais><fone>6634210000</fone></enderDest><indIEDest>1</indIEDest><IE>131999888</IE></dest>';
  const servicos = o.servicos ? '<ISSQNtot><vServ>1000.00</vServ><vBC>1000.00</vBC><vISS>50.00</vISS></ISSQNtot>' : '';
  const protocolo = o.semProtocolo
    ? ''
    : `<protNFe versao="4.00"><infProt><tpAmb>${o.homologacao ? 2 : 1}</tpAmb><verAplic>SVRS202610</verAplic><chNFe>${CHAVE_EXEMPLO}</chNFe><dhRecbto>2026-11-05T10:16:30-03:00</dhRecbto><nProt>351260000000001</nProt><digVal>abc=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${CHAVE_EXEMPLO}" versao="4.00">
<ide><cUF>51</cUF><cNF>00000001</cNF><natOp>VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS</natOp><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-11-05T10:15:00-03:00</dhEmi><dhSaiEnt>2026-11-05T14:30:00-03:00</dhSaiEnt><tpNF>1</tpNF><idDest>1</idDest><cMunFG>5103403</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>0</cDV><tpAmb>${o.homologacao ? 2 : 1}</tpAmb><finNFe>1</finNFe><indFinal>0</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>1.0</verProc></ide>
<emit><CNPJ>12345678000195</CNPJ><xNome>FORNECEDOR AGRO COMERCIO E REPRESENTACOES LTDA</xNome><xFant>FORNECEDOR AGRO</xFant><enderEmit><xLgr>RODOVIA BR 163</xLgr><nro>KM 12</nro><xCpl>SALA 3</xCpl><xBairro>DISTRITO INDUSTRIAL</xBairro><cMun>5103403</cMun><xMun>CUIABA</xMun><UF>MT</UF><CEP>78000000</CEP><cPais>1058</cPais><xPais>BRASIL</xPais><fone>6532224444</fone></enderEmit><IE>131234567</IE><IM>4455</IM><CRT>3</CRT></emit>
${dest}
${dets.join('\n')}
<total><ICMSTot><vBC>${moeda(totalProdutos)}</vBC><vICMS>${moeda(totalIcms)}</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${moeda(totalProdutos)}</vProd><vFrete>${moeda(frete)}</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII><vIPI>${moeda(totalProdutos * 0.05)}</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${moeda(valorNota)}</vNF><vTotTrib>${moeda(totalProdutos * 0.1)}</vTotTrib></ICMSTot>${servicos}</total>
<transp><modFrete>0</modFrete><transporta><CNPJ>11222333000181</CNPJ><xNome>TRANSPORTES RAPIDOS DO CENTRO-OESTE LTDA</xNome><IE>131000111</IE><xEnder>RUA DAS FLORES, 100</xEnder><xMun>CUIABA</xMun><UF>MT</UF></transporta><veicTransp><placa>ABC1D23</placa><UF>MT</UF><RNTC>12345678</RNTC></veicTransp><vol><qVol>10</qVol><esp>SACOS</esp><marca>FORNECEDOR</marca><nVol>1-10</nVol><pesoL>500.000</pesoL><pesoB>520.000</pesoB></vol></transp>
${qtdDup ? `<cobr><fat><nFat>123</nFat><vOrig>${moeda(valorNota)}</vOrig><vDesc>0.00</vDesc><vLiq>${moeda(valorNota)}</vLiq></fat>${dups.join('')}</cobr>` : ''}
<pag><detPag><tPag>15</tPag><vPag>${moeda(valorNota)}</vPag></detPag></pag>
<infAdic><infCpl>${o.infCpl ?? 'Pedido 4567. Mercadoria destinada a produtor rural. Valor aproximado dos tributos: conforme Lei 12.741/2012.'}</infCpl></infAdic>
</infNFe></NFe>${protocolo}</nfeProc>`;
}
