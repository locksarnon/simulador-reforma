import { describe, expect, it } from 'vitest';
import { ehChaveNfse, indexarXml, tipoDaChave } from './xml-indice';

const CH = '51261112345678000195550010000001231000000010';
const CH_CTE = '51261112345678000195570010000004561000000019';
// NFS-e Nacional (50 posições): município, ambiente gerador, tipo de inscrição, inscrição federal, número, AAMM, código numérico e DV
const CH_NFSE = '5103403' + '2' + '2' + '12345678000195' + '0000000000123' + '2611' + '123456789' + '0';

const nfeProc = (cStat = '100') => `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe${CH}" versao="4.00">
    <ide><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-11-05T10:15:00-03:00</dhEmi></ide>
    <emit><CNPJ>12345678000195</CNPJ><xNome>FORNECEDOR AGRO LTDA</xNome></emit>
    <dest><CNPJ>98765432000110</CNPJ><xNome>CLIENTE</xNome></dest>
    <total><ICMSTot><vNF>15250.90</vNF></ICMSTot></total>
  </infNFe></NFe>
  <protNFe versao="4.00"><infProt><chNFe>${CH}</chNFe><dhRecbto>2026-11-05T10:16:00-03:00</dhRecbto><cStat>${cStat}</cStat></infProt></protNFe>
</nfeProc>`;

describe('indexarXml', () => {
  it('NF-e autorizada: chave, partes, valor e situação', () => {
    const i = indexarXml(nfeProc())!;
    expect(i.tipo).toBe('NFE');
    expect(i.chave).toBe(CH);
    expect(i.modelo).toBe('55');
    expect(i.numero).toBe('123');
    expect(i.serie).toBe('1');
    expect(i.emitenteDoc).toBe('12345678000195');
    expect(i.emitenteNome).toBe('FORNECEDOR AGRO LTDA');
    expect(i.destinatarioDoc).toBe('98765432000110');
    expect(i.valorTotal).toBeCloseTo(15250.9);
    expect(i.dataEmissao?.toISOString()).toBe('2026-11-05T13:15:00.000Z');
    expect(i.conteudo).toBe('COMPLETO');
    expect(i.situacao).toBe('AUTORIZADA');
    expect(i.autorizadaEm?.toISOString()).toBe('2026-11-05T13:16:00.000Z');
  });

  it('NF-e cancelada e denegada pelo status do protocolo', () => {
    expect(indexarXml(nfeProc('101'))!.situacao).toBe('CANCELADA');
    expect(indexarXml(nfeProc('302'))!.situacao).toBe('DENEGADA');
  });

  it('resumo da Distribuição (resNFe): usa a chave para o que o resumo não traz', () => {
    const i = indexarXml(`<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
      <chNFe>${CH}</chNFe><CNPJ>12345678000195</CNPJ><xNome>FORNECEDOR AGRO LTDA</xNome><IE>123</IE>
      <dhEmi>2026-11-05T10:15:00-03:00</dhEmi><tpNF>1</tpNF><vNF>15250.90</vNF><digVal>x</digVal>
      <dhRecbto>2026-11-05T10:16:00-03:00</dhRecbto><nProt>351260000000001</nProt><cSitNFe>1</cSitNFe></resNFe>`)!;
    expect(i.conteudo).toBe('RESUMO');
    expect(i.tipo).toBe('NFE');
    expect(i.numero).toBe('123');
    expect(i.valorTotal).toBeCloseTo(15250.9);
    expect(i.situacao).toBe('AUTORIZADA');
    expect(i.autorizadaEm?.toISOString()).toBe('2026-11-05T13:16:00.000Z');
  });

  it('evento de cancelamento homologado: referencia a chave e marca CANCELADA', () => {
    const i = indexarXml(`<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
      <evento><infEvento Id="ID1101115126"><cOrgao>51</cOrgao><CNPJ>12345678000195</CNPJ><chNFe>${CH}</chNFe>
        <dhEvento>2026-11-06T09:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento></infEvento></evento>
      <retEvento><infEvento><cStat>135</cStat></infEvento></retEvento></procEventoNFe>`)!;
    expect(i.tipo).toBe('EVENTO');
    expect(i.chave).toBe(CH);
    expect(i.eventoTipo).toBe('110111');
    expect(i.sequencia).toBe(1);
    expect(i.situacao).toBe('CANCELADA');
  });

  it('evento com código ou sequência fora do padrão não é reconhecido (esses textos viram nome de arquivo e de download)', () => {
    const evento = (tp: string, seq: string) => `<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
      <evento><infEvento Id="ID1"><CNPJ>12345678000195</CNPJ><chNFe>${CH}</chNFe><dhEvento>2026-11-06T09:00:00-03:00</dhEvento>
        <tpEvento>${tp}</tpEvento>${seq === '' ? '' : `<nSeqEvento>${seq}</nSeqEvento>`}</infEvento></evento><retEvento><infEvento><cStat>135</cStat></infEvento></retEvento></procEventoNFe>`;
    const resumo = (tp: string, seq: string) => `<resEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><CNPJ>98765432000110</CNPJ>
      <chNFe>${CH}</chNFe><dhEvento>2026-11-06T09:00:00-03:00</dhEvento><tpEvento>${tp}</tpEvento><nSeqEvento>${seq}</nSeqEvento></resEvento>`;
    for (const f of [evento, resumo]) {
      expect(indexarXml(f('110111', '1'))).toMatchObject({ eventoTipo: '110111', sequencia: 1 });
      expect(indexarXml(f('110110', '12'))).toMatchObject({ eventoTipo: '110110', sequencia: 12 });
      for (const tpRuim of ['../../x', '11011', '1101111', '11a111', '"; x']) expect(indexarXml(f(tpRuim, '1')), `tp ${tpRuim}`).toBeNull();
      for (const seqRuim of ['1.5', '-1', '0', '1000', 'a', '1e2']) expect(indexarXml(f('110111', seqRuim)), `seq ${seqRuim}`).toBeNull();
    }
    // nSeqEvento ausente vale 1 (e só no evento completo, que o leiaute marca como obrigatório mas nem todo emissor preenche)
    expect(indexarXml(evento('110111', ''))).toMatchObject({ eventoTipo: '110111', sequencia: 1 });
  });

  it('resumo de evento (resEvento)', () => {
    const i = indexarXml(`<resEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><CNPJ>98765432000110</CNPJ>
      <chNFe>${CH}</chNFe><dhEvento>2026-11-06T09:00:00-03:00</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento>
      <xEvento>Ciencia da Operacao</xEvento></resEvento>`)!;
    expect(i.tipo).toBe('EVENTO');
    expect(i.conteudo).toBe('RESUMO');
    expect(i.eventoTipo).toBe('210210');
    expect(i.situacao).toBeNull();
  });

  it('CT-e: tipo vem do modelo da chave e valor da prestação', () => {
    const i = indexarXml(`<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><CTe><infCte Id="CTe${CH_CTE}" versao="4.00">
      <ide><mod>57</mod><serie>1</serie><nCT>456</nCT><dhEmi>2026-11-03T08:00:00-03:00</dhEmi></ide>
      <emit><CNPJ>12345678000195</CNPJ><xNome>TRANSPORTADORA</xNome></emit><dest><CNPJ>98765432000110</CNPJ></dest>
      <vPrest><vTPrest>3200.00</vTPrest></vPrest></infCte></CTe>
      <protCTe><infProt><cStat>100</cStat></infProt></protCTe></cteProc>`)!;
    expect(i.tipo).toBe('CTE');
    expect(i.chave).toBe(CH_CTE);
    expect(i.numero).toBe('456');
    expect(i.valorTotal).toBe(3200);
    expect(i.situacao).toBe('AUTORIZADA');
  });

  it('aceita chave alfanumérica (CNPJ novo) e recusa o que não é documento fiscal', () => {
    // 6 dígitos + 12 caracteres do CNPJ (com letras) + 2 dígitos verificadores + modelo, série, número, tipo, código e DV
    const alfa = '512611' + '12ABC34501DE' + '35' + '55' + '001' + '000000123' + '1' + '00000001' + '0';
    expect(alfa).toHaveLength(44);
    expect(indexarXml(`<resNFe><chNFe>${alfa}</chNFe></resNFe>`)?.chave).toBe(alfa);
    // letra fora das posições do CNPJ não é chave válida
    expect(indexarXml(`<resNFe><chNFe>${alfa.slice(0, 40)}ABCD</chNFe></resNFe>`)).toBeNull();
    expect(indexarXml('<qualquer><coisa/></qualquer>')).toBeNull();
    expect(indexarXml('isto não é xml')).toBeNull();
    expect(indexarXml(`<resNFe><chNFe>123</chNFe></resNFe>`)).toBeNull();
  });
});

// Amostras montadas a partir do XSD v1.01 da NFS-e Nacional (NFSe_v1.01.xsd e evento_v1.01.xsd) e validadas contra ele
const ASSINATURA = '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#x"><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>AAAAAAAAAAAAAAAAAAAAAAAAAAA=</DigestValue></Reference></SignedInfo><SignatureValue>AAAAAAAA</SignatureValue></Signature>';
const NS = 'xmlns="http://www.sped.fazenda.gov.br/nfse"';

const nfse = (o: { chave?: string; cStat?: string; valoresNfse?: string; dhEmi?: string; serie?: string; toma?: string; ns?: string; nNFSe?: string } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<NFSe ${o.ns ?? NS} versao="1.01">
  <infNFSe Id="NFS${o.chave ?? CH_NFSE}">
    <xLocEmi>Cuiabá</xLocEmi><xLocPrestacao>Cuiabá</xLocPrestacao>${o.nNFSe ?? '<nNFSe>123</nNFSe>'}<cLocIncid>5103403</cLocIncid><xLocIncid>Cuiabá</xLocIncid>
    <xTribNac>Medicina veterinária e zootecnia</xTribNac><verAplic>EmissorWeb_1.0.0</verAplic><ambGer>2</ambGer><tpEmis>2</tpEmis>
    <cStat>${o.cStat ?? '100'}</cStat><dhProc>2026-11-05T10:20:00-03:00</dhProc><nDFSe>77</nDFSe>
    <emit><CNPJ>12345678000195</CNPJ><xNome>PRESTADORA AGRO LTDA</xNome><enderNac><xLgr>RUA DAS FLORES</xLgr><nro>10</nro><xBairro>CENTRO</xBairro><cMun>5103403</cMun><UF>MT</UF><CEP>78000000</CEP></enderNac></emit>
    ${o.valoresNfse ?? '<valores><vBC>1000.00</vBC><pAliqAplic>2.00</pAliqAplic><vISSQN>20.00</vISSQN><vTotalRet>0.00</vTotalRet><vLiq>980.00</vLiq></valores>'}
    <DPS versao="1.01"><infDPS Id="DPS510340321234567800019500001000000000000123">
      <tpAmb>1</tpAmb>${o.dhEmi ?? '<dhEmi>2026-11-05T10:15:00-03:00</dhEmi>'}<verAplic>EmissorWeb_1.0.0</verAplic>${o.serie ?? '<serie>1</serie>'}<nDPS>123</nDPS><dCompet>2026-11-05</dCompet><tpEmit>1</tpEmit><cLocEmi>5103403</cLocEmi>
      <prest><CNPJ>12345678000195</CNPJ><regTrib><opSimpNac>1</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>
      ${o.toma ?? '<toma><CNPJ>98765432000110</CNPJ><xNome>FAZENDA TOMADORA S/A</xNome></toma>'}
      <serv><locPrest><cLocPrestacao>5103403</cLocPrestacao></locPrest><cServ><cTribNac>050101</cTribNac><xDescServ>Atendimento veterinário a rebanho</xDescServ></cServ></serv>
      <valores><vServPrest><vServ>1000.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><indTotTrib>0</indTotTrib></totTrib></trib></valores>
    </infDPS></DPS>
  </infNFSe>
  ${ASSINATURA}
</NFSe>`;

const eventoNfse = (codigo = '101101', o: { chave?: string; ns?: string; seq?: string; autor?: string; corpo?: string } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<evento ${o.ns ?? NS} versao="1.01">
  <infEvento Id="EVT${o.chave ?? CH_NFSE}${codigo}001">
    <verAplic>ADN_1.0.0</verAplic><ambGer>3</ambGer><nSeqEvento>${o.seq ?? '1'}</nSeqEvento><dhProc>2026-11-06T09:00:05-03:00</dhProc><nDFSe>78</nDFSe>
    <pedRegEvento versao="1.01"><infPedReg Id="PRE${o.chave ?? CH_NFSE}${codigo}">
      <tpAmb>1</tpAmb><verAplic>EmissorWeb_1.0.0</verAplic><dhEvento>2026-11-06T09:00:00-03:00</dhEvento>${o.autor ?? '<CNPJAutor>12345678000195</CNPJAutor>'}<chNFSe>${o.chave ?? CH_NFSE}</chNFSe>
      <e${codigo}>${o.corpo ?? '<xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo><xMotivo>Erro na emissão da nota</xMotivo>'}</e${codigo}>
    </infPedReg></pedRegEvento>
  </infEvento>
  ${ASSINATURA}
</evento>`;

describe('indexarXml: NFS-e Nacional', () => {
  it('NFS-e: chave do Id sem o prefixo, número, série e data de emissão da DPS, prestador, tomador, valor líquido e situação', () => {
    expect(CH_NFSE).toHaveLength(50);
    const i = indexarXml(nfse())!;
    expect(i).toMatchObject({
      tipo: 'NFSE', chave: CH_NFSE, eventoTipo: '', sequencia: 0, modelo: null, numero: '123', serie: '1',
      emitenteDoc: '12345678000195', emitenteNome: 'PRESTADORA AGRO LTDA', destinatarioDoc: '98765432000110', valorTotal: 980,
      conteudo: 'COMPLETO', situacao: 'AUTORIZADA',
    });
    expect(i.dataEmissao?.toISOString()).toBe('2026-11-05T13:15:00.000Z');
    expect(i.autorizadaEm?.toISOString()).toBe('2026-11-05T13:20:00.000Z');
  });

  it('o valor líquido vem do infNFSe/valores, não do valor do serviço da DPS; sem ele, vale o valor do serviço', () => {
    expect(indexarXml(nfse())!.valorTotal).toBe(980);
    expect(indexarXml(nfse({ valoresNfse: '<valores><vLiq>0</vLiq></valores>' }))!.valorTotal).toBe(0);
    expect(indexarXml(nfse({ valoresNfse: '<valores/>' }))!.valorTotal).toBe(1000);
  });

  it('sem tomador a DPS não tem destinatário; tomador e prestador pessoa física saem pelo CPF; estrangeiro, pelo NIF', () => {
    expect(indexarXml(nfse({ toma: '' }))!.destinatarioDoc).toBeNull();
    expect(indexarXml(nfse({ toma: '<toma><CPF>12345678909</CPF><xNome>PRODUTOR</xNome></toma>' }))!.destinatarioDoc).toBe('12345678909');
    expect(indexarXml(nfse({ toma: '<toma><NIF>PT123456789</NIF><xNome>EXTERIOR</xNome></toma>' }))!.destinatarioDoc).toBe('PT123456789');
    const pf = nfse().replace('<emit><CNPJ>12345678000195</CNPJ>', '<emit><CPF>12345678909</CPF>');
    expect(indexarXml(pf)!.emitenteDoc).toBe('12345678909');
  });

  it('o número sai sem zeros à esquerda, venha com 13 dígitos no nNFSe ou só na chave', () => {
    expect(indexarXml(nfse({ nNFSe: '<nNFSe>0000000000123</nNFSe>' }))!.numero).toBe('123');
    expect(indexarXml(nfse({ nNFSe: '<nNFSe>9999999999999</nNFSe>' }))!.numero).toBe('9999999999999');
    expect(indexarXml(nfse({ nNFSe: '<nNFSe>12A</nNFSe>' }))!.numero).toBe('123');
  });

  it('a data de emissão cai para o dhProc quando a DPS não a traz, e o número para o da própria chave', () => {
    const i = indexarXml(nfse({ dhEmi: '', nNFSe: '', serie: '' }))!;
    expect(i.dataEmissao?.toISOString()).toBe('2026-11-05T13:20:00.000Z');
    expect(i.numero).toBe('123');
    expect(i.serie).toBeNull();
  });

  it('as quatro situações de NFS-e gerada (100, 102, 103 e 107) são autorizadas; outro código não define a situação', () => {
    for (const cStat of ['100', '102', '103', '107']) expect(indexarXml(nfse({ cStat }))!.situacao, cStat).toBe('AUTORIZADA');
    expect(indexarXml(nfse({ cStat: '999' }))!.situacao).toBeNull();
  });

  it('chave com letras no CNPJ (NT 009) é aceita; fora das posições do CNPJ, ou fora do tamanho, o documento é recusado', () => {
    const alfa = CH_NFSE.slice(0, 9) + '12ABC34501DE35' + CH_NFSE.slice(23);
    expect(alfa).toHaveLength(50);
    expect(indexarXml(nfse({ chave: alfa }))?.chave).toBe(alfa);
    expect(indexarXml(nfse({ chave: CH_NFSE.slice(0, 40) + 'ABCD' + CH_NFSE.slice(44) }))).toBeNull();
    expect(indexarXml(nfse({ chave: CH_NFSE.slice(1) }))).toBeNull();
    expect(indexarXml(nfse({ chave: `${CH_NFSE}0` }))).toBeNull();
    expect(indexarXml(nfse().replace('Id="NFS', 'Id="NFE'))).toBeNull();
    expect(indexarXml(nfse().replace(/ Id="NFS\d+"/, ''))).toBeNull();
  });

  it('só é NFS-e Nacional com o namespace do SNNFSe: sem namespace ou no de outro padrão (ABRASF) não é reconhecida', () => {
    expect(indexarXml(nfse({ ns: '' }))).toBeNull();
    expect(indexarXml(nfse({ ns: 'xmlns="http://www.abrasf.org.br/nfse.xsd"' }))).toBeNull();
    expect(indexarXml(`<Nfse xmlns="http://www.abrasf.org.br/nfse.xsd"><InfNfse Id="${CH_NFSE}"><Numero>1</Numero></InfNfse></Nfse>`)).toBeNull();
  });

  it('a DPS e os pedidos do mesmo namespace não são documentos distribuídos: não são indexados', () => {
    expect(indexarXml(`<DPS ${NS} versao="1.01"><infDPS Id="DPS510340321234567800019500001000000000000123"/></DPS>`)).toBeNull();
    expect(indexarXml(`<pedRegEvento ${NS} versao="1.01"><infPedReg/></pedRegEvento>`)).toBeNull();
  });

  it('a chave de 50 posições é da NFS-e e a de 44 continua pelo modelo', () => {
    expect(ehChaveNfse(CH_NFSE)).toBe(true);
    expect(ehChaveNfse(CH)).toBe(false);
    expect(tipoDaChave(CH_NFSE)).toBe('NFSE');
    expect(tipoDaChave(CH)).toBe('NFE');
    expect(tipoDaChave(CH_CTE)).toBe('CTE');
  });
});

describe('indexarXml: eventos da NFS-e Nacional', () => {
  it('cancelamento (e101101): referencia a chave da NFS-e, vem do autor e marca CANCELADA', () => {
    const i = indexarXml(eventoNfse())!;
    expect(i).toMatchObject({
      tipo: 'EVENTO', chave: CH_NFSE, eventoTipo: '101101', sequencia: 1, modelo: null, numero: '123', serie: null,
      emitenteDoc: '12345678000195', emitenteNome: null, destinatarioDoc: null, valorTotal: null,
      conteudo: 'COMPLETO', situacao: 'CANCELADA', autorizadaEm: null,
    });
    expect(i.dataEmissao?.toISOString()).toBe('2026-11-06T12:00:00.000Z');
  });

  it('os quatro eventos que cancelam a NFS-e marcam CANCELADA: cancelamento, por substituição, deferido por análise fiscal e por ofício', () => {
    for (const codigo of ['101101', '105102', '105104', '305101']) expect(indexarXml(eventoNfse(codigo, { corpo: '<xDesc>x</xDesc>' }))!.situacao, codigo).toBe('CANCELADA');
  });

  it('os demais eventos ficam registrados, mas não alteram a situação: análise pedida ou indeferida, manifestações, bloqueio e desbloqueio', () => {
    for (const codigo of ['101103', '105105', '202201', '203202', '204203', '205204', '202205', '203206', '204207', '205208', '305102', '305103']) {
      const i = indexarXml(eventoNfse(codigo, { corpo: '<xDesc>x</xDesc>' }))!;
      expect(i, codigo).toMatchObject({ tipo: 'EVENTO', chave: CH_NFSE, eventoTipo: codigo, situacao: null });
    }
  });

  it('número sequencial do evento e autor pessoa física', () => {
    const i = indexarXml(eventoNfse('203206', { seq: '002', autor: '<CPFAutor>12345678909</CPFAutor>', corpo: '<xDesc>x</xDesc>' }))!;
    expect(i).toMatchObject({ sequencia: 2, emitenteDoc: '12345678909' });
  });

  it('a raiz "evento" fora do namespace da NFS-e continua sendo o evento da NF-e', () => {
    const nfe = indexarXml(`<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="ID1"><CNPJ>12345678000195</CNPJ><chNFe>${CH}</chNFe>
      <dhEvento>2026-11-06T09:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento></infEvento></evento>`)!;
    expect(nfe).toMatchObject({ tipo: 'EVENTO', chave: CH, eventoTipo: '110111', sequencia: 1, modelo: '55' });
    // sem namespace, também
    expect(indexarXml(`<evento><infEvento><chNFe>${CH}</chNFe><tpEvento>210210</tpEvento></infEvento></evento>`)).toMatchObject({ chave: CH, eventoTipo: '210210' });
  });

  it('evento da NFS-e sem chave válida ou sem o código do evento não é indexado', () => {
    expect(indexarXml(eventoNfse('101101', { chave: CH }))).toBeNull();
    expect(indexarXml(eventoNfse().replace(/<chNFSe>.*<\/chNFSe>/, ''))).toBeNull();
    expect(indexarXml(eventoNfse().replace(/<e101101>.*<\/e101101>/, '<outro/>'))).toBeNull();
    expect(indexarXml(eventoNfse().replaceAll('infEvento', 'semInf'))).toBeNull();
  });
});
