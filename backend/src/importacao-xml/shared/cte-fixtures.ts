/**
 * Fixtures SINTÉTICOS de CT-e, CT-e OS e eventos para os testes da importação — montados conforme o leiaute oficial
 * (schemas PL_CTe_400, NT 2026.004 RTC v1.00). Não há dado real aqui: CNPJs/CPF são números de teste válidos.
 * Usado só pelos testes; não é importado pelo código de produção.
 */

export const CNPJ_TRANSPORTADORA = '11222333000181';
export const CNPJ_EMBARCADOR = '11444777000161';
export const CNPJ_DESTINATARIO = '36940852000297';
export const CPF_TAC = '52998224725';

/** Dígito verificador da chave de acesso (módulo 11, pesos 2 a 9 da direita para a esquerda). */
export function dvChave(base43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += parseInt(base43[i], 10) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Chave de 44 dígitos válida (CPF no lugar do CNPJ vai com 3 zeros à esquerda, como na chave real). */
export function montarChave(o: { doc?: string; mod?: string; serie?: string; numero?: string; aamm?: string; uf?: string } = {}): string {
  const doc = (o.doc ?? CNPJ_TRANSPORTADORA).padStart(14, '0');
  const base43 =
    (o.uf ?? '35') + (o.aamm ?? '2701') + doc + (o.mod ?? '57') + (o.serie ?? '1').padStart(3, '0') + (o.numero ?? '123').padStart(9, '0') + '1' + '12345678';
  return base43 + dvChave(base43);
}

export type OpcoesCte = {
  mod?: '57' | '67';
  /** Documento do emitente: CNPJ (padrão) ou CPF (TAC). */
  docEmit?: string;
  ufEmit?: string;
  crt?: string;
  tpEmis?: string;
  procEmi?: string;
  tpCTe?: string;
  tpAmb?: string;
  dhEmi?: string;
  /** null = sem protocolo (cteProc sem protCTe). */
  cStat?: string | null;
  numero?: string;
  serie?: string;
  cfop?: string;
  ufIni?: string;
  ufFim?: string;
  cMunFim?: string;
  /** CT-e 57: 0=remetente, 1=expedidor, 2=recebedor, 3=destinatário. null = usa toma4. */
  toma3?: '0' | '1' | '2' | '3' | null;
  toma4?: { doc: string; uf: string } | null;
  docRem?: string;
  docDest?: string;
  docExped?: string;
  docReceb?: string;
  /** CT-e OS: documento do tomador (grupo infCte/toma). */
  docTomaOs?: string;
  vTPrest?: string;
  vTPrestLiq?: string | null;
  vTotDFe?: string | null;
  icms?: 'ICMS00' | 'ICMS20' | 'ICMS45' | 'ICMS60' | 'ICMS90' | 'ICMSOutraUF' | 'ICMSSN' | null;
  vBC?: string;
  pICMS?: string;
  vICMS?: string | null;
  pRedBC?: string;
  /** Inclui imp/IBSCBS (com CST e cClassTrib). 'sem-classe' omite o cClassTrib. */
  ibscbs?: boolean | 'sem-classe';
  vIBS?: string;
  vCBS?: string;
  chavesNfe?: string[];
  chaveComplementada?: string;
  chaveSubstituida?: string;
};

function blocoIcms(o: OpcoesCte): string {
  const g = o.icms === undefined ? 'ICMS00' : o.icms;
  if (g === null) return '';
  const vBC = o.vBC ?? '1000.00';
  const pICMS = o.pICMS ?? '12.00';
  const vICMS = o.vICMS === undefined ? '120.00' : o.vICMS;
  const tagVICMS = vICMS === null ? '' : `<vICMS>${vICMS}</vICMS>`;
  switch (g) {
    case 'ICMS00':
      return `<ICMS><ICMS00><CST>00</CST><vBC>${vBC}</vBC><pICMS>${pICMS}</pICMS>${tagVICMS}</ICMS00></ICMS>`;
    case 'ICMS20':
      return `<ICMS><ICMS20><CST>20</CST><pRedBC>${o.pRedBC ?? '50.00'}</pRedBC><vBC>${vBC}</vBC><pICMS>${pICMS}</pICMS>${tagVICMS}</ICMS20></ICMS>`;
    case 'ICMS45':
      return '<ICMS><ICMS45><CST>40</CST></ICMS45></ICMS>';
    case 'ICMS60':
      return '<ICMS><ICMS60><CST>60</CST><vBCSTRet>1000.00</vBCSTRet><vICMSSTRet>120.00</vICMSSTRet><pICMSSTRet>12.00</pICMSSTRet></ICMS60></ICMS>';
    case 'ICMS90':
      return `<ICMS><ICMS90><CST>90</CST><vBC>${vBC}</vBC><pICMS>${pICMS}</pICMS>${tagVICMS}</ICMS90></ICMS>`;
    case 'ICMSOutraUF':
      return `<ICMS><ICMSOutraUF><CST>90</CST><pRedBCOutraUF>${o.pRedBC ?? '0.00'}</pRedBCOutraUF><vBCOutraUF>${vBC}</vBCOutraUF><pICMSOutraUF>${pICMS}</pICMSOutraUF>${vICMS === null ? '' : `<vICMSOutraUF>${vICMS}</vICMSOutraUF>`}</ICMSOutraUF></ICMS>`;
    case 'ICMSSN':
      return '<ICMS><ICMSSN><CST>90</CST><indSN>1</indSN></ICMSSN></ICMS>';
    default:
      return '';
  }
}

function blocoIbsCbs(o: OpcoesCte): string {
  if (!o.ibscbs) return '';
  const classe = o.ibscbs === 'sem-classe' ? '' : '<cClassTrib>000001</cClassTrib>';
  return (
    '<IBSCBS><CST>000</CST>' +
    classe +
    '<gIBSCBS><vBC>1000.00</vBC>' +
    '<gIBSUF><pIBSUF>0.05</pIBSUF><vIBSUF>0.50</vIBSUF></gIBSUF>' +
    '<gIBSMun><pIBSMun>0.05</pIBSMun><vIBSMun>0.50</vIBSMun></gIBSMun>' +
    `<vIBS>${o.vIBS ?? '1.00'}</vIBS>` +
    `<gCBS><pCBS>11.20</pCBS><vCBS>${o.vCBS ?? '112.00'}</vCBS></gCBS>` +
    '</gIBSCBS></IBSCBS>'
  );
}

function parte(tag: string, endereco: string, doc: string, uf: string, nome: string): string {
  const id = doc.length === 11 ? `<CPF>${doc}</CPF>` : `<CNPJ>${doc}</CNPJ>`;
  return `<${tag}>${id}<IE>123456789</IE><xNome>${nome}</xNome><${endereco}><xLgr>RUA TESTE</xLgr><nro>1</nro><xMun>CIDADE</xMun><UF>${uf}</UF></${endereco}></${tag}>`;
}

/** cteProc (57) ou cteOSProc (67) sintético e completo, autorizado por padrão. */
export function xmlCte(o: OpcoesCte = {}): string {
  const mod = o.mod ?? '57';
  const docEmit = o.docEmit ?? CNPJ_TRANSPORTADORA;
  const chave = montarChave({ doc: docEmit, mod, serie: o.serie, numero: o.numero });
  const cStat = o.cStat === undefined ? '100' : o.cStat;
  const toma3 = o.toma3 === undefined ? '0' : o.toma3;

  const tomaNoIde = mod === '67'
    ? ''
    : toma3 !== null
      ? `<toma3><toma>${toma3}</toma></toma3>`
      : `<toma4><toma>4</toma><CNPJ>${o.toma4?.doc ?? CNPJ_EMBARCADOR}</CNPJ><IE>123456789</IE><xNome>TOMADOR OUTROS</xNome><enderToma><xLgr>RUA</xLgr><nro>2</nro><xMun>CIDADE</xMun><UF>${o.toma4?.uf ?? 'PR'}</UF></enderToma></toma4>`;

  const partes =
    mod === '67'
      ? parte('toma', 'enderToma', o.docTomaOs ?? CNPJ_EMBARCADOR, 'PR', 'TOMADOR OS')
      : [
          parte('rem', 'enderReme', o.docRem ?? CNPJ_EMBARCADOR, 'SP', 'REMETENTE'),
          o.docExped ? parte('exped', 'enderExped', o.docExped, 'SP', 'EXPEDIDOR') : '',
          o.docReceb ? parte('receb', 'enderReceb', o.docReceb, 'MG', 'RECEBEDOR') : '',
          parte('dest', 'enderDest', o.docDest ?? CNPJ_DESTINATARIO, 'MG', 'DESTINATARIO'),
        ].join('');

  const infDoc = (o.chavesNfe ?? []).length
    ? `<infDoc>${(o.chavesNfe ?? []).map((k) => `<infNFe><chave>${k}</chave></infNFe>`).join('')}</infDoc>`
    : '';
  const comp = o.chaveComplementada ? `<infCteComp><chCTe>${o.chaveComplementada}</chCTe></infCteComp>` : '';
  const sub = o.chaveSubstituida ? `<infCteSub><chCte>${o.chaveSubstituida}</chCte></infCteSub>` : '';
  const vTPrest = o.vTPrest ?? '1000.00';
  const vTPrestLiq = o.vTPrestLiq === undefined ? '' : o.vTPrestLiq === null ? '' : `<vTPrestLiq>${o.vTPrestLiq}</vTPrestLiq>`;
  const vTotDFe = o.vTotDFe ? `<vTotDFe>${o.vTotDFe}</vTotDFe>` : '';

  const emit = parte('emit', 'enderEmit', docEmit, o.ufEmit ?? 'SP', 'TRANSPORTADORA TESTE').replace('</emit>', `<CRT>${o.crt ?? '3'}</CRT></emit>`);

  const ide =
    `<ide><cUF>35</cUF><cCT>12345678</cCT><CFOP>${o.cfop ?? '6353'}</CFOP><natOp>PRESTACAO DE SERVICO DE TRANSPORTE</natOp>` +
    `<mod>${mod}</mod><serie>${o.serie ?? '1'}</serie><nCT>${o.numero ?? '123'}</nCT><dhEmi>${o.dhEmi ?? '2027-01-15T10:00:00-03:00'}</dhEmi>` +
    `<tpImp>1</tpImp><tpEmis>${o.tpEmis ?? '1'}</tpEmis><cDV>${chave.slice(-1)}</cDV><tpAmb>${o.tpAmb ?? '1'}</tpAmb><tpCTe>${o.tpCTe ?? '0'}</tpCTe>` +
    `<procEmi>${o.procEmi ?? '0'}</procEmi><verProc>1.0</verProc><cMunEnv>3550308</cMunEnv><xMunEnv>SAO PAULO</xMunEnv><UFEnv>SP</UFEnv>` +
    `<modal>01</modal><tpServ>0</tpServ><cMunIni>3550308</cMunIni><xMunIni>SAO PAULO</xMunIni><UFIni>${o.ufIni ?? 'SP'}</UFIni>` +
    `<cMunFim>${o.cMunFim ?? '3106200'}</cMunFim><xMunFim>BELO HORIZONTE</xMunFim><UFFim>${o.ufFim ?? 'MG'}</UFFim><retira>1</retira><indIEToma>1</indIEToma>${tomaNoIde}</ide>`;

  const corpo =
    `<infCte Id="CTe${chave}" versao="4.00">${ide}` +
    emit +
    partes +
    `<vPrest><vTPrest>${vTPrest}</vTPrest>${vTPrestLiq}<vRec>${vTPrest}</vRec><Comp><xNome>Frete peso</xNome><vComp>${vTPrest}</vComp></Comp></vPrest>` +
    `<imp>${blocoIcms(o)}<vTotTrib>0.00</vTotTrib>${blocoIbsCbs(o)}${vTotDFe}</imp>` +
    `<infCTeNorm><infCarga><vCarga>50000.00</vCarga><proPred>GRAOS</proPred></infCarga>${infDoc}${sub}${comp}</infCTeNorm></infCte>`;

  const protocolo =
    cStat === null
      ? ''
      : `<protCTe versao="4.00"><infProt><tpAmb>${o.tpAmb ?? '1'}</tpAmb><verAplic>SVRS</verAplic><chCTe>${chave}</chCTe>` +
        `<dhRecbto>2027-01-15T10:00:05-03:00</dhRecbto><nProt>135270000000001</nProt><cStat>${cStat}</cStat><xMotivo>Autorizado o uso do CT-e</xMotivo></infProt></protCTe>`;

  const raiz = mod === '67' ? 'cteOSProc' : 'cteProc';
  const el = mod === '67' ? 'CTeOS' : 'CTe';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<${raiz} xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><${el} xmlns="http://www.portalfiscal.inf.br/cte">${corpo}</${el}>${protocolo}</${raiz}>`
  );
}

function envelopeEvento(chave: string, tpEvento: string, descEvento: string, detalhe: string, cStat: string | null): string {
  const ret =
    cStat === null
      ? ''
      : `<retEventoCTe versao="4.00"><infEvento><tpAmb>1</tpAmb><verAplic>SVRS</verAplic><cOrgao>91</cOrgao><cStat>${cStat}</cStat>` +
        `<xMotivo>Evento registrado e vinculado a CT-e</xMotivo><chCTe>${chave}</chCTe><tpEvento>${tpEvento}</tpEvento><xEvento>${descEvento}</xEvento>` +
        '<nSeqEvento>1</nSeqEvento><dhRegEvento>2027-01-16T09:00:00-03:00</dhRegEvento><nProt>135270000000099</nProt></infEvento></retEventoCTe>';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<procEventoCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00">' +
    `<eventoCTe versao="4.00"><infEvento Id="ID${tpEvento}${chave}01"><cOrgao>91</cOrgao><tpAmb>1</tpAmb><CNPJ>${CNPJ_EMBARCADOR}</CNPJ>` +
    `<chCTe>${chave}</chCTe><dhEvento>2027-01-16T08:55:00-03:00</dhEvento><tpEvento>${tpEvento}</tpEvento><nSeqEvento>1</nSeqEvento>` +
    `<detEvento versaoEvento="4.00">${detalhe}</detEvento></infEvento></eventoCTe>${ret}</procEventoCTe>`
  );
}

/** Evento de cancelamento (110111) de CT-e, com o retorno da SEFAZ (cStat 135 por padrão; null = sem retorno). */
export function xmlEventoCancelamentoCte(chave: string, cStat: string | null = '135'): string {
  return envelopeEvento(
    chave,
    '110111',
    'Cancelamento',
    '<evCancCTe><descEvento>Cancelamento</descEvento><nProt>135270000000001</nProt><xJust>Cancelamento por erro de digitacao no valor</xJust></evCancCTe>',
    cStat,
  );
}

/** Carta de correção (110110) de CT-e. */
export function xmlEventoCartaCorrecaoCte(chave: string): string {
  return envelopeEvento(
    chave,
    '110110',
    'Carta de Correcao',
    '<evCCeCTe><descEvento>Carta de Correcao</descEvento><infCorrecao><grupoAlterado>ide</grupoAlterado><campoAlterado>xObs</campoAlterado><valorAlterado>x</valorAlterado><nroItemAlterado>1</nroItemAlterado></infCorrecao></evCCeCTe>',
    '135',
  );
}

/** Evento 211110 — Apropriação do Crédito Presumido (TAC/MEI), NT 2026.004. */
export function xmlEventoApropriacaoCredPres(chave: string, o: { cStat?: string | null; cCredPres?: string; pIbs?: string; pCbs?: string } = {}): string {
  const cCredPres = o.cCredPres ?? '02';
  const ibs = o.pIbs === undefined ? '1.0000' : o.pIbs;
  const cbs = o.pCbs === undefined ? '3.5000' : o.pCbs;
  return envelopeEvento(
    chave,
    '211110',
    'Apropriação Credito Presumido',
    '<evApropriaCredPres><descEvento>Apropriação Credito Presumido</descEvento><vBCCredPres>1000.00</vBCCredPres>' +
      `<cCredPres>${cCredPres}</cCredPres>` +
      (ibs ? `<gIBSCredPres><pCredPres>${ibs}</pCredPres><vCredPres>10.00</vCredPres></gIBSCredPres>` : '') +
      (cbs ? `<gCBSCredPres><pCredPres>${cbs}</pCredPres><vCredPres>35.00</vCredPres></gCBSCredPres>` : '') +
      '<xDecPag>Declaro, para fins de apropriação do crédito presumido solicitado, relativo à operação registrada no documento fiscal eletrônico a que se refere este evento: I – já ter efetuado o pagamento integral do valor da prestação do serviço ao transportador, nos termos do art. 126, § 5º, II, da Lei Complementar nº 214, de 16 de janeiro de 2025; II – estar ciente de que a prestação de declaração falsa sujeita-me às penalidades administrativas e sanções penais previstas na legislação, sem prejuízo do estorno do crédito indevidamente apropriado com os acréscimos legais.</xDecPag>' +
      '</evApropriaCredPres>',
    o.cStat === undefined ? '135' : o.cStat,
  );
}
