/**
 * NFS-e Nacional de exemplo (leiaute 1.01 do ADN: NFSe > infNFSe com a DPS dentro) para os testes e para conferir o DANFSe à vista.
 * Valores fictícios: uma consultoria agronômica de Lucas do Rio Verde (MT) prestando serviço a uma fazenda de Sorriso (MT).
 * A ordem dos elementos segue os esquemas XSD v1.01 (tiposComplexos_v1.01.xsd).
 */

export interface OpcoesNfseExemplo {
  /** tpAmb = 2: NFS-e de teste, sem validade jurídica. */
  homologacao?: boolean;
  /** Sem o grupo toma na DPS. */
  semTomador?: boolean;
  /** indDest = 1 (o destinatário não é o tomador) sem o grupo dest. */
  semDestinatario?: boolean;
  /** indDest = 1 com o grupo dest: o destinatário é outra pessoa. */
  destinatarioDistinto?: boolean;
  /** Grupo interm na DPS. */
  comIntermediario?: boolean;
  /** cTribNac 990101: serviço sem incidência de ISSQN (sem município de incidência nem valores de ISSQN). */
  naoSujeitaIssqn?: boolean;
  /** Prestador ME/EPP optante do Simples Nacional (ISSQN no DAS): sem valores de ISSQN, PIS/COFINS nem IBS/CBS. */
  simplesNacional?: boolean;
  /** tpRetISSQN = 2: ISSQN retido pelo tomador. */
  issqnRetido?: boolean;
  /** IRRF e CSLL retidos (PIS/COFINS/CSLL retidos). */
  retencoesFederais?: boolean;
  /** Sem os grupos IBSCBS (NFS-e do leiaute anterior à reforma). */
  semIbsCbs?: boolean;
  /** Data de competência (AAAA-MM-DD); a partir de 2027 não há PIS/COFINS e o IBS/CBS vai por fora. */
  competencia?: string;
  /** Tomador no exterior (NIF e endExt). */
  tomadorExterior?: boolean;
  /** DPS com o nome e o endereço do prestador (o normal é só o grupo emit da NFS-e trazê-los). */
  prestadorCompletoNaDps?: boolean;
  /** Com código e descrição de tributação municipal (cTribMun e xTribMun). */
  codigoMunicipal?: boolean;
  /** Descrição do serviço (xDescServ). */
  descricao?: string;
  /** Descrição nacional do código de tributação (xTribNac). */
  descricaoTribNacional?: string;
  /** Informações complementares (xInfComp). */
  infComp?: string;
  /** Todos os campos que vão em informações complementares (substituição, referência, obra, evento, itens do pedido, uso do município). */
  todosOsComplementos?: boolean;
  /** Totais aproximados dos tributos: em R$ (padrão), em % ou sem estimativa (indTotTrib). */
  tributosAproximados?: 'valor' | 'percentual' | 'nenhum';
  /** cStat da NFS-e (padrão 100). */
  situacao?: string;
  /** Nome do prestador (xNome do emit). */
  nomePrestador?: string;
  /** Sem telefone, e-mail, NBS e código de tributação municipal: campos que o DANFSe preenche com traço. */
  enxuta?: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const el = (nome: string, valor: string | number | undefined | null) => (valor === undefined || valor === null || valor === '' ? '' : `<${nome}>${esc(String(valor))}</${nome}>`);
const grupo = (nome: string, filhos: string) => (filhos ? `<${nome}>${filhos}</${nome}>` : '');
const dinheiro = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

const CNPJ_PRESTADOR = '11222333000181';
const CNPJ_TOMADOR = '45723174000110';

/** Dígito verificador da chave da NFS-e (módulo 11, pesos de 2 a 9 da direita para a esquerda). */
function dvModulo11(base: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto <= 1 ? 0 : 11 - resto);
}

/** Chave de acesso do exemplo: município (7) + ambiente gerador (1) + tipo de inscrição (1) + CNPJ (14) + nº da NFS-e (13) + AAMM (4) + código (9) + DV. */
export function chaveNfseExemplo(competencia = '2026-11-05'): string {
  const aamm = `${competencia.slice(2, 4)}${competencia.slice(5, 7)}`;
  const municipio = '5105259';
  const ambienteGerador = '2';
  const tipoInscricao = '2'; // CNPJ
  const base = `${municipio}${ambienteGerador}${tipoInscricao}${CNPJ_PRESTADOR}${'123'.padStart(13, '0')}${aamm}123456789`;
  return `${base}${dvModulo11(base)}`;
}
export const CHAVE_NFSE_EXEMPLO = chaveNfseExemplo();

const DESCRICAO_PADRAO = 'Assistência técnica agronômica: monitoramento de lavoura de soja da safra 2026/27 com visitas quinzenais, recomendação de manejo fitossanitário e de adubação, receituário agronômico e relatório técnico mensal. Referente ao período de 01/10/2026 a 31/10/2026, conforme contrato 2026/118.';

export function nfseExemplo(o: OpcoesNfseExemplo = {}): string {
  const competencia = o.competencia ?? '2026-11-05';
  const ano = Number(competencia.slice(0, 4));
  const simples = Boolean(o.simplesNacional);
  const comIbsCbs = !o.semIbsCbs && !simples;
  const chave = chaveNfseExemplo(competencia);
  const tributavel = !o.naoSujeitaIssqn;

  // valores
  const vServ = 8500;
  const aliquotaIss = 2;
  const vIss = tributavel && !simples ? dinheiro((vServ * aliquotaIss) / 100) : '';
  const ateAno2026 = ano <= 2026;
  const vPis = !simples && ateAno2026 && tributavel ? vServ * 0.0065 : 0;
  const vCofins = !simples && ateAno2026 && tributavel ? vServ * 0.03 : 0;
  const vIrrf = o.retencoesFederais ? vServ * 0.015 : 0;
  const vCsll = o.retencoesFederais ? vServ * 0.01 : 0;
  const issRetido = Boolean(o.issqnRetido) && tributavel && !simples;
  const totalRetido = vIrrf + vCsll + (issRetido ? Number(vIss) : 0);
  const vLiq = vServ - totalRetido;

  // IBS/CBS (alíquotas de teste de 2026; em 2027 a CBS passa a valer de verdade)
  const pIbsUf = 0.1;
  const pIbsMun = 0;
  const pCbs = ano <= 2026 ? 0.9 : 8.8;
  const baseIbs = vServ - Number(vIss || 0) - vPis - vCofins;
  const vIbsUf = Math.round(baseIbs * pIbsUf) / 100;
  const vIbsMun = Math.round(baseIbs * pIbsMun) / 100;
  const vCbs = Math.round(baseIbs * pCbs) / 100;
  const vIbsTotal = vIbsUf + vIbsMun;
  const vTotNf = ano <= 2026 ? vLiq : vLiq + vCbs + vIbsTotal;

  const emissao = `${competencia}T10:15:00-03:00`;
  const processamento = `${competencia}T10:20:00-03:00`;

  const enderecoTomador = o.tomadorExterior
    ? '<end><endExt><cPais>US</cPais><cEndPost>60601</cEndPost><xCidade>Chicago</xCidade><xEstProvReg>Illinois</xEstProvReg></endExt><xLgr>North Michigan Avenue</xLgr><nro>500</nro><xCpl>Suite 1200</xCpl><xBairro>Loop</xBairro></end>'
    : '<end><endNac><cMun>5107925</cMun><CEP>78890000</CEP></endNac><xLgr>RODOVIA MT 242</xLgr><nro>KM 18</nro><xCpl>ZONA RURAL</xCpl><xBairro>ZONA RURAL</xBairro></end>';
  const tomador = o.semTomador
    ? ''
    : grupo('toma', `${o.tomadorExterior ? el('NIF', 'US-98-7654321') : el('CNPJ', CNPJ_TOMADOR)}${el('xNome', o.tomadorExterior ? 'GREAT PLAINS GRAIN TRADING INC' : 'FAZENDA SANTA LUZIA AGROPECUARIA S/A')}${enderecoTomador}${o.enxuta ? '' : el('fone', o.tomadorExterior ? '13125550100' : '6635441200')}${o.enxuta ? '' : el('email', 'compras@santaluzia.example.com.br')}`);
  const intermediario = o.comIntermediario
    ? grupo('interm', `${el('CNPJ', '03778899000140')}${el('IM', '88120')}${el('xNome', 'INTERMEDIARIA DE NEGOCIOS AGRO LTDA')}<end><endNac><cMun>5103403</cMun><CEP>78005100</CEP></endNac><xLgr>AVENIDA GETULIO VARGAS</xLgr><nro>890</nro><xBairro>CENTRO</xBairro></end>${el('fone', '6532110090')}${el('email', 'contato@intermediaria.example.com.br')}`)
    : '';

  const prestadorNaDps = grupo(
    'prest',
    `${el('CNPJ', CNPJ_PRESTADOR)}${el('IM', '45012')}${o.prestadorCompletoNaDps ? el('xNome', o.nomePrestador ?? 'AGRO CONSULTORIA E ASSISTENCIA TECNICA LTDA') : ''}${
      o.prestadorCompletoNaDps ? '<end><endNac><cMun>5105259</cMun><CEP>78455000</CEP></endNac><xLgr>AVENIDA BRASIL NORTE</xLgr><nro>1250</nro><xCpl>SALA 4</xCpl><xBairro>CENTRO</xBairro></end>' : ''
    }${o.enxuta ? '' : el('fone', '65999887766')}${o.enxuta ? '' : el('email', 'financeiro@agroconsultoria.example.com.br')}<regTrib>${el('opSimpNac', simples ? 3 : 1)}${simples ? el('regApTribSN', 1) : ''}${el('regEspTrib', 0)}</regTrib>`,
  );

  const complementos = o.todosOsComplementos
    ? `${el('idDocTec', 'ART 1420260012345')}${el('docRef', 'Contrato 2026/118')}${el('xPed', 'PO-2026-0457')}${grupo('gItemPed', `${el('xItemPed', '1')}${el('xItemPed', '2')}${el('xItemPed', '5')}`)}${el('xInfComp', o.infComp ?? 'Pagamento em 30 dias. Safra 2026/27.')}`
    : `${el('idDocTec', 'ART 1420260012345')}${el('xPed', 'PO-2026-0457')}${el('xInfComp', o.infComp ?? 'Pagamento em 30 dias. Safra 2026/27.')}`;
  const obra = o.todosOsComplementos ? grupo('obra', `${el('inscImobFisc', '01.02.003.0045.001')}${el('cObra', 'CNO-90.123.45678/90')}`) : '';
  const evento = o.todosOsComplementos ? grupo('atvEvento', `${el('xNome', 'Dia de Campo da Soja')}${el('dtIni', '2026-11-10')}${el('dtFim', '2026-11-11')}${el('idAtvEvt', 'EVT-2026-33')}`) : '';
  const substituicao = o.todosOsComplementos ? grupo('subst', `${el('chSubstda', '51052592211222333000181000000000009926100987654321')}${el('cMotivo', '01')}`) : '';

  const totTrib = (() => {
    if (simples) return grupo('totTrib', el('pTotTribSN', '6.00'));
    switch (o.tributosAproximados ?? 'valor') {
      case 'percentual': return grupo('totTrib', grupo('pTotTrib', `${el('pTotTribFed', '13.45')}${el('pTotTribEst', '0.00')}${el('pTotTribMun', '2.00')}`));
      case 'nenhum': return grupo('totTrib', el('indTotTrib', 0));
      default: return grupo('totTrib', grupo('vTotTrib', `${el('vTotTribFed', dinheiro(vServ * 0.1345))}${el('vTotTribEst', '0.00')}${el('vTotTribMun', dinheiro(vServ * 0.02))}`));
    }
  })();

  const tribFed = simples
    ? ''
    : grupo(
      'tribFed',
      `${ateAno2026 && tributavel ? grupo('piscofins', `${el('CST', '01')}${el('vBCPisCofins', dinheiro(vServ))}${el('pAliqPis', '0.65')}${el('pAliqCofins', '3.00')}${el('vPis', dinheiro(vPis))}${el('vCofins', dinheiro(vCofins))}${el('tpRetPisCofins', o.retencoesFederais ? 3 : 2)}`) : ''}${vIrrf ? el('vRetIRRF', dinheiro(vIrrf)) : ''}${vCsll ? el('vRetCSLL', dinheiro(vCsll)) : ''}`,
    );

  const ibsDps = comIbsCbs
    ? grupo(
      'IBSCBS',
      `${el('finNFSe', 0)}${el('indFinal', 0)}${el('cIndOp', '100301')}${el('indDest', o.destinatarioDistinto || o.semDestinatario ? 1 : 0)}${
        o.destinatarioDistinto
          ? grupo('dest', `${el('CNPJ', '45723174000200')}${el('xNome', 'FAZENDA SANTA LUZIA AGROPECUARIA S/A - FILIAL SINOP')}<end><endNac><cMun>5107909</cMun><CEP>78550000</CEP></endNac><xLgr>RODOVIA BR 163</xLgr><nro>KM 790</nro><xBairro>ZONA RURAL</xBairro></end>${el('fone', '6635110088')}${el('email', 'sinop@santaluzia.example.com.br')}`)
          : ''
      }${grupo('valores', grupo('trib', grupo('gIBSCBS', `${el('CST', '000')}${el('cClassTrib', '000001')}`)))}`,
    )
    : '';

  const ibsNfse = comIbsCbs
    ? grupo(
      'IBSCBS',
      `${el('cLocalidadeIncid', '5107925')}${el('xLocalidadeIncid', 'Sorriso')}${grupo(
        'valores',
        `${el('vBC', dinheiro(baseIbs))}${grupo('uf', `${el('pIBSUF', pIbsUf.toFixed(2))}${el('pAliqEfetUF', pIbsUf.toFixed(2))}`)}${grupo('mun', `${el('pIBSMun', pIbsMun.toFixed(2))}${el('pAliqEfetMun', pIbsMun.toFixed(2))}`)}${grupo('fed', `${el('pCBS', pCbs.toFixed(2))}${el('pAliqEfetCBS', pCbs.toFixed(2))}`)}`,
      )}${grupo(
        'totCIBS',
        `${el('vTotNF', dinheiro(vTotNf))}${grupo('gIBS', `${el('vIBSTot', dinheiro(vIbsTotal))}${grupo('gIBSUFTot', el('vIBSUF', dinheiro(vIbsUf)))}${grupo('gIBSMunTot', el('vIBSMun', dinheiro(vIbsMun)))}`)}${grupo('gCBS', el('vCBS', dinheiro(vCbs)))}`,
      )}`,
    )
    : '';

  const valoresNfse = grupo(
    'valores',
    tributavel && !simples
      ? `${el('vBC', dinheiro(vServ))}${el('pAliqAplic', aliquotaIss.toFixed(2))}${el('vISSQN', vIss)}${el('vTotalRet', dinheiro(totalRetido))}${el('vLiq', dinheiro(vLiq))}`
      : `${el('vTotalRet', dinheiro(totalRetido))}${el('vLiq', dinheiro(vLiq))}`,
  );

  const codigoServico = o.naoSujeitaIssqn ? '990101' : '070102';
  const descricaoTribNac = o.descricaoTribNacional ?? (o.naoSujeitaIssqn ? 'Serviços sem a incidência de ISSQN e ICMS' : 'Agronomia e congêneres.');

  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${chave}">
${el('xLocEmi', 'Lucas do Rio Verde')}${el('xLocPrestacao', 'Sorriso')}${el('nNFSe', 123)}${tributavel ? `${el('cLocIncid', '5105259')}${el('xLocIncid', 'Lucas do Rio Verde')}` : ''}${el('xTribNac', descricaoTribNac)}${o.codigoMunicipal ? el('xTribMun', 'Assistência técnica agronômica a produtores rurais') : ''}${o.enxuta ? '' : el('xNBS', 'Serviços de consultoria agronômica')}${el('verAplic', 'EmissorWeb_1.4.0')}${el('ambGer', 2)}${el('tpEmis', 1)}${el('procEmi', 2)}${el('cStat', o.situacao ?? 100)}${el('dhProc', processamento)}${el('nDFSe', 77)}
<emit>${el('CNPJ', CNPJ_PRESTADOR)}${el('IM', '45012')}${el('xNome', o.nomePrestador ?? 'AGRO CONSULTORIA E ASSISTENCIA TECNICA LTDA')}${el('xFant', 'AGRO CONSULTORIA')}<enderNac>${el('xLgr', 'AVENIDA BRASIL NORTE')}${el('nro', '1250')}${el('xCpl', 'SALA 4')}${el('xBairro', 'CENTRO')}${el('cMun', '5105259')}${el('UF', 'MT')}${el('CEP', '78455000')}</enderNac>${o.enxuta ? '' : el('fone', '65999887766')}${o.enxuta ? '' : el('email', 'financeiro@agroconsultoria.example.com.br')}</emit>
${valoresNfse}
${o.todosOsComplementos ? el('xOutInf', 'Alvará municipal 2026/4412') : ''}${ibsNfse}<DPS versao="1.01"><infDPS Id="DPS51052592${CNPJ_PRESTADOR}00001000000000000123">${el('tpAmb', o.homologacao ? 2 : 1)}${el('dhEmi', emissao)}${el('verAplic', 'EmissorWeb_1.4.0')}${el('serie', 1)}${el('nDPS', 123)}${el('dCompet', competencia)}${el('tpEmit', 1)}${el('cLocEmi', '5105259')}${substituicao}
${prestadorNaDps}
${tomador}${intermediario}
<serv><locPrest>${el('cLocPrestacao', '5107925')}</locPrest><cServ>${el('cTribNac', codigoServico)}${o.codigoMunicipal ? el('cTribMun', '001') : ''}${el('xDescServ', o.descricao ?? DESCRICAO_PADRAO)}${o.enxuta ? '' : el('cNBS', '115021100')}</cServ>${obra}${evento}${grupo('infoCompl', complementos)}</serv>
<valores>${grupo('vServPrest', el('vServ', dinheiro(vServ)))}${grupo('trib', `<tribMun>${el('tribISSQN', tributavel ? 1 : 4)}${el('tpRetISSQN', issRetido ? 2 : 1)}</tribMun>${tribFed}${totTrib}`)}</valores>
${ibsDps}</infDPS></DPS></infNFSe>
<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#NFS${chave}"><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>AAAAAAAAAAAAAAAAAAAAAAAAAAA=</DigestValue></Reference></SignedInfo><SignatureValue>AAAAAAAA</SignatureValue><KeyInfo><X509Data><X509Certificate>AAAAAAAA</X509Certificate></X509Data></KeyInfo></Signature></NFSe>`;
}
