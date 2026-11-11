/**
 * Leitura do XML da NFS-e Nacional (leiaute 1.00/1.01 do ADN: NFSe > infNFSe, com a DPS/infDPS dentro) para o DANFSe:
 * só os campos que o documento auxiliar mostra (Nota Técnica nº 008/2026 da SE/CGNFS-e, item 2.4.5).
 * Usa o parser seguro do importador (sem DTD nem entidade externa, com limite de tamanho). Os valores ficam como texto do XML;
 * a formatação (moeda, data, CNPJ) e as descrições das opções numéricas ficam por conta do desenho.
 *
 * Os dados do prestador vêm da DPS (prest) e, quando a DPS não os traz (o sistema nacional só repete ali o CNPJ, a inscrição
 * municipal e o regime), do grupo emit da própria NFS-e: nome e endereço de quem emitiu.
 * O XML só traz o código IBGE do município (7 dígitos) nos endereços; o nome vem junto no XML apenas para o município emissor,
 * o do local da prestação e o de incidência. Por isso o nome só é preenchido quando o código bate com um desses; a UF sai
 * dos dois primeiros dígitos do código IBGE.
 */
import { getAll, getAttr, getFirst, getFirstDeep, getText, parseXml } from '../../importacao-xml/shared/xml-parser';
import { ErroLeituraDocumento } from './erros';

export class ErroLeituraNfse extends ErroLeituraDocumento {}

export interface EnderecoNfse {
  logradouro: string; numero: string; complemento: string; bairro: string;
  /** Código IBGE do município (7 dígitos); vazio no endereço do exterior. */
  codigoMunicipio: string;
  /** Nome do município: só quando o XML o traz para esse código (ver o comentário do arquivo). */
  municipio: string;
  uf: string; cep: string;
  /** Endereço no exterior (endExt): país (ISO, 2 letras), código postal, cidade e estado/província/região. */
  pais: string; codigoPostal: string; cidade: string; estadoProvincia: string;
}
export type TipoDocumentoNfse = 'CNPJ' | 'CPF' | 'NIF' | '';
export interface ParteNfse {
  documento: string; tipoDocumento: TipoDocumentoNfse;
  /** Motivo de não ter NIF (cNaoNIF: 0, 1 ou 2), quando a parte não tem documento nenhum. */
  motivoSemNif: string;
  inscricaoMunicipal: string; nome: string; endereco: EnderecoNfse; fone: string; email: string;
}
export interface PrestadorNfse extends ParteNfse {
  /** opSimpNac: 1 não optante, 2 MEI, 3 ME/EPP. */
  simplesNacional: string;
  /** regApTribSN: 1 a 3 (só para ME/EPP). */
  regimeApuracaoSn: string;
  /** regEspTrib: 0 a 6 e 9. */
  regimeEspecial: string;
}
export interface LocalNfse { codigoMunicipio: string; municipio: string; uf: string; pais: string }
export interface ServicoNfse {
  codigoTribNacional: string; codigoTribMunicipal: string; descricaoTribNacional: string; descricaoTribMunicipal: string;
  codigoNbs: string; descricao: string; local: LocalNfse;
}
export interface IssqnNfse {
  /** tribISSQN: 1 tributável, 2 imunidade, 3 exportação, 4 não incidência. */
  tipoTributacao: string;
  incidencia: LocalNfse;
  tipoImunidade: string; tipoSuspensao: string; processoSuspensao: string;
  tipoBeneficio: string; valorBeneficio: string; percentualBeneficio: string;
  /** Dedução/redução da base de cálculo (vCalcDR da NFS-e ou vDR da DPS). */
  deducoes: string;
  descontoIncondicionado: string;
  baseCalculo: string; aliquota: string; tipoRetencao: string; valor: string;
}
export interface FederalNfse {
  irrf: string; contribuicaoPrevidenciaria: string; contribuicoesSociais: string; pis: string; cofins: string;
  tipoRetencaoPisCofins: string;
}
export interface AliquotasIbsCbsNfse { aliquota: string; reducao: string; aliquotaEfetiva: string; valor: string }
export interface IbsCbsNfse {
  /** Algum dos dois grupos IBSCBS (o da DPS ou o da NFS-e) está no XML. */
  presente: boolean;
  cst: string; classificacao: string; indicadorOperacao: string;
  /** indDest: 0 o destinatário é o próprio tomador, 1 é outra pessoa. */
  indicadorDestinatario: string;
  /** finNFSe. */
  finalidade: string;
  localidade: LocalNfse;
  baseCalculo: string; reembolsos: string;
  estadual: AliquotasIbsCbsNfse; municipal: AliquotasIbsCbsNfse; cbs: AliquotasIbsCbsNfse;
  totalIbs: string; totalNf: string;
}
export interface TotaisNfse {
  valorServico: string; descontoIncondicionado: string; descontoCondicionado: string; totalRetencoes: string; valorLiquido: string;
}
export interface TributosAproximadosNfse {
  /** valor (vTotTrib, em R$), percentual (pTotTrib, em %) ou vazio (indTotTrib ou só pTotTribSN). */
  tipo: 'valor' | 'percentual' | '';
  federal: string; estadual: string; municipal: string;
  /** pTotTribSN: percentual aproximado dos tributos na alíquota do Simples Nacional. */
  percentualSimples: string;
}
export interface ComplementaresNfse {
  informacoes: string; substituida: string; documentoReferencia: string; codigoObra: string; inscricaoImobiliaria: string;
  codigoEvento: string; documentoTecnico: string; numeroPedido: string; itensPedido: string[];
  /** xOutInf: informações de uso da Administração Tributária Municipal. */
  usoMunicipio: string;
}

export interface NfseLida {
  /** Chave de acesso: o Id do infNFSe sem o prefixo "NFS" (50 caracteres). */
  chave: string;
  versao: string;
  numero: string;
  municipioEmissor: string; ufEmissor: string;
  ambienteGerador: string; tipoAmbiente: string;
  homologacao: boolean;
  /** cStat. */
  situacao: string;
  dataHoraEmissao: string; // dhProc, como no XML (ISO com fuso)
  competencia: string;
  numeroDps: string; serieDps: string; dataHoraDps: string;
  /** tpEmit: 1 prestador, 2 tomador, 3 intermediário. */
  emitente: string;
  prestador: PrestadorNfse;
  tomador: ParteNfse | null;
  destinatario: ParteNfse | null;
  intermediario: ParteNfse | null;
  servico: ServicoNfse;
  issqn: IssqnNfse;
  federal: FederalNfse;
  ibsCbs: IbsCbsNfse;
  totais: TotaisNfse;
  tributosAproximados: TributosAproximadosNfse;
  complementares: ComplementaresNfse;
}

/** Chave da NFS-e Nacional: município (7), ambiente gerador (1), tipo de inscrição (1), inscrição (14, pode ser alfanumérica), resto numérico. */
const CHAVE_NFSE = /^[0-9]{9}[0-9A-Z]{12}[0-9]{29}$/;

/** Sigla da UF pelos dois primeiros dígitos do código IBGE do município. */
const UF_POR_CODIGO_IBGE: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO', '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN',
  '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR', '42': 'SC',
  '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};
/** Só vale para código de município de 7 dígitos: outro texto não tem UF. */
const ufDoCodigoIbge = (codigo: string): string => (/^[0-9]{7}$/.test(String(codigo ?? '')) ? UF_POR_CODIGO_IBGE[codigo.slice(0, 2)] ?? '' : '');

/** Elemento no fim de um caminho de filhos diretos ("DPS/infDPS/serv"); null se algum faltar. */
const caminho = (el: any, rota: string): any => rota.split('/').reduce((acc, nome) => getFirst(acc, nome), el);
/** Texto do último elemento de um caminho de filhos diretos; vazio se algum faltar. */
function txt(el: any, rota: string): string {
  const partes = rota.split('/');
  const nome = partes.pop() as string;
  return getText(partes.length ? caminho(el, partes.join('/')) : el, nome);
}

type NomeDoMunicipio = (codigo: string) => string;

const enderecoVazio = (): EnderecoNfse => ({
  logradouro: '', numero: '', complemento: '', bairro: '', codigoMunicipio: '', municipio: '', uf: '', cep: '',
  pais: '', codigoPostal: '', cidade: '', estadoProvincia: '',
});

/** Endereço do grupo `end` da DPS (nacional ou no exterior). */
function lerEndereco(end: any, nomeDe: NomeDoMunicipio): EnderecoNfse {
  const nacional = getFirst(end, 'endNac');
  const exterior = getFirst(end, 'endExt');
  const codigo = getText(nacional, 'cMun');
  return {
    logradouro: getText(end, 'xLgr'), numero: getText(end, 'nro'), complemento: getText(end, 'xCpl'), bairro: getText(end, 'xBairro'),
    codigoMunicipio: codigo, municipio: nomeDe(codigo), uf: ufDoCodigoIbge(codigo), cep: getText(nacional, 'CEP'),
    pais: getText(exterior, 'cPais'), codigoPostal: getText(exterior, 'cEndPost'), cidade: getText(exterior, 'xCidade'),
    estadoProvincia: getText(exterior, 'xEstProvReg'),
  };
}

/** Endereço do emitente da NFS-e (emit/enderNac): os campos vêm direto no grupo, com a UF. */
function lerEnderecoEmitente(ender: any, nomeDe: NomeDoMunicipio): EnderecoNfse {
  if (!ender) return enderecoVazio();
  const codigo = getText(ender, 'cMun');
  return {
    ...enderecoVazio(),
    logradouro: getText(ender, 'xLgr'), numero: getText(ender, 'nro'), complemento: getText(ender, 'xCpl'), bairro: getText(ender, 'xBairro'),
    codigoMunicipio: codigo, municipio: nomeDe(codigo), uf: getText(ender, 'UF') || ufDoCodigoIbge(codigo), cep: getText(ender, 'CEP'),
  };
}

function lerDocumento(el: any): Pick<ParteNfse, 'documento' | 'tipoDocumento' | 'motivoSemNif'> {
  const cnpj = getText(el, 'CNPJ');
  if (cnpj) return { documento: cnpj, tipoDocumento: 'CNPJ', motivoSemNif: '' };
  const cpf = getText(el, 'CPF');
  if (cpf) return { documento: cpf, tipoDocumento: 'CPF', motivoSemNif: '' };
  const nif = getText(el, 'NIF');
  if (nif) return { documento: nif, tipoDocumento: 'NIF', motivoSemNif: '' };
  return { documento: '', tipoDocumento: '', motivoSemNif: getText(el, 'cNaoNIF') };
}

/** Tomador, intermediário e destinatário (e o prestador da DPS): mesmo desenho de grupo. */
function lerParte(el: any, nomeDe: NomeDoMunicipio): ParteNfse {
  const end = getFirst(el, 'end');
  return {
    ...lerDocumento(el),
    inscricaoMunicipal: getText(el, 'IM'), nome: getText(el, 'xNome'),
    endereco: end ? lerEndereco(end, nomeDe) : enderecoVazio(),
    fone: getText(el, 'fone'), email: getText(el, 'email'),
  };
}

function lerAliquotas(valores: any, grupo: string, aliquota: string, reducao: string, efetiva: string, totais: any, rotaValor: string): AliquotasIbsCbsNfse {
  return {
    aliquota: txt(valores, `${grupo}/${aliquota}`), reducao: txt(valores, `${grupo}/${reducao}`),
    aliquotaEfetiva: txt(valores, `${grupo}/${efetiva}`), valor: txt(totais, rotaValor),
  };
}

/**
 * Lê o XML (NFSe) e devolve os dados do DANFSe. Lança ErroLeituraNfse se não for uma NFS-e Nacional legível
 * (raiz NFSe com infNFSe, a DPS dentro e a chave de acesso no Id).
 */
export function lerNfse(xml: string): NfseLida {
  let doc;
  try {
    doc = parseXml(xml);
  } catch (e) {
    throw new ErroLeituraNfse((e as Error).message);
  }
  const raiz: any = doc.documentElement;
  const nomeRaiz = String(raiz?.localName ?? '').toLowerCase();
  const nfse = nomeRaiz === 'nfse' ? raiz : raiz ? getFirstDeep(raiz, 'NFSe') : null;
  const inf = nfse ? getFirst(nfse, 'infNFSe') : null;
  const infDps = inf ? caminho(inf, 'DPS/infDPS') : null;
  // A DPS dentro do infNFSe é o que separa a NFS-e Nacional dos leiautes municipais (ABRASF), que também têm um InfNfse.
  if (!inf || !infDps) throw new ErroLeituraNfse('O XML não é uma NFS-e Nacional (esperado o elemento NFSe com infNFSe e a DPS dentro).');

  const chave = getAttr(inf, 'Id').replace(/^NFS/i, '');
  if (!CHAVE_NFSE.test(chave)) throw new ErroLeituraNfse('A NFS-e não traz a chave de acesso de 50 caracteres (atributo Id do infNFSe).');

  const nomes = new Map<string, string>();
  const guardar = (codigo: string, nome: string) => { if (codigo && nome && !nomes.has(codigo)) nomes.set(codigo, nome); };
  guardar(txt(infDps, 'cLocEmi'), txt(inf, 'xLocEmi'));
  guardar(txt(infDps, 'serv/locPrest/cLocPrestacao'), txt(inf, 'xLocPrestacao'));
  guardar(txt(inf, 'cLocIncid'), txt(inf, 'xLocIncid'));
  guardar(txt(inf, 'IBSCBS/cLocalidadeIncid'), txt(inf, 'IBSCBS/xLocalidadeIncid'));
  const nomeDe: NomeDoMunicipio = (codigo) => nomes.get(codigo) ?? '';

  const emit = getFirst(inf, 'emit');
  const prest = getFirst(infDps, 'prest');
  const deDps = lerParte(prest, nomeDe);
  const documentoEmit = getText(emit, 'CNPJ') || getText(emit, 'CPF');
  // O grupo emit só completa o prestador quando é a mesma pessoa: com a DPS emitida pelo tomador ou pelo intermediário (importação
  // de serviço, por exemplo) o emit pode ser outra parte, e os dados dela não podem aparecer como se fossem do prestador.
  const emitEhOPrestador = documentoEmit !== '' && (documentoEmit === deDps.documento || (deDps.documento === '' && deDps.motivoSemNif === ''));
  const doEmit = (campo: string): string => (emitEhOPrestador ? getText(emit, campo) : '');
  const prestador: PrestadorNfse = {
    ...deDps,
    documento: deDps.documento || (emitEhOPrestador ? documentoEmit : ''),
    tipoDocumento: deDps.tipoDocumento || (emitEhOPrestador ? (getText(emit, 'CNPJ') ? 'CNPJ' : 'CPF') : ''),
    inscricaoMunicipal: deDps.inscricaoMunicipal || doEmit('IM'),
    nome: deDps.nome || doEmit('xNome'),
    endereco: getFirst(prest, 'end') || !emitEhOPrestador ? deDps.endereco : lerEnderecoEmitente(getFirst(emit, 'enderNac'), nomeDe),
    fone: deDps.fone || doEmit('fone'),
    email: deDps.email || doEmit('email'),
    simplesNacional: txt(prest, 'regTrib/opSimpNac'),
    regimeApuracaoSn: txt(prest, 'regTrib/regApTribSN'),
    regimeEspecial: txt(prest, 'regTrib/regEspTrib'),
  };

  const toma = getFirst(infDps, 'toma');
  const interm = getFirst(infDps, 'interm');
  const ibsDps = getFirst(infDps, 'IBSCBS');
  const dest = getFirst(ibsDps, 'dest');

  const serv = getFirst(infDps, 'serv');
  const cServ = getFirst(serv, 'cServ');
  const locPrest = getFirst(serv, 'locPrest');
  const codigoLocal = getText(locPrest, 'cLocPrestacao');

  const valoresNfse = getFirst(inf, 'valores');
  const valoresDps = getFirst(infDps, 'valores');
  const tribMun = caminho(valoresDps, 'trib/tribMun');
  const tribFed = caminho(valoresDps, 'trib/tribFed');
  const piscofins = getFirst(tribFed, 'piscofins');
  const codigoIncidencia = getText(inf, 'cLocIncid');

  const ibsNfse = getFirst(inf, 'IBSCBS');
  const valoresIbs = getFirst(ibsNfse, 'valores');
  const totaisIbs = getFirst(ibsNfse, 'totCIBS');
  const gruposIbs = caminho(ibsDps, 'valores/trib/gIBSCBS');
  const codigoLocalidade = getText(ibsNfse, 'cLocalidadeIncid');

  const totTrib = caminho(valoresDps, 'trib/totTrib');
  const monetarios = getFirst(totTrib, 'vTotTrib');
  const percentuais = getFirst(totTrib, 'pTotTrib');
  const grupoAproximados = monetarios ?? percentuais;

  const infoCompl = getFirst(serv, 'infoCompl');
  const obra = getFirst(serv, 'obra');

  return {
    chave,
    versao: getAttr(nfse, 'versao'),
    numero: getText(inf, 'nNFSe'),
    municipioEmissor: getText(inf, 'xLocEmi'),
    // a UF do município emissor sai do código dele; a do emitente (emit/enderNac/UF, que a NT cita) só entra se o código faltar
    ufEmissor: ufDoCodigoIbge(txt(infDps, 'cLocEmi')) || txt(emit, 'enderNac/UF'),
    ambienteGerador: getText(inf, 'ambGer'),
    tipoAmbiente: getText(infDps, 'tpAmb'),
    homologacao: getText(infDps, 'tpAmb') === '2',
    situacao: getText(inf, 'cStat'),
    dataHoraEmissao: getText(inf, 'dhProc'),
    competencia: getText(infDps, 'dCompet'),
    numeroDps: getText(infDps, 'nDPS'),
    serieDps: getText(infDps, 'serie'),
    dataHoraDps: getText(infDps, 'dhEmi'),
    emitente: getText(infDps, 'tpEmit'),
    prestador,
    tomador: toma ? lerParte(toma, nomeDe) : null,
    destinatario: dest ? lerParte(dest, nomeDe) : null,
    intermediario: interm ? lerParte(interm, nomeDe) : null,
    servico: {
      codigoTribNacional: getText(cServ, 'cTribNac'), codigoTribMunicipal: getText(cServ, 'cTribMun'),
      descricaoTribNacional: getText(inf, 'xTribNac'), descricaoTribMunicipal: getText(inf, 'xTribMun'),
      codigoNbs: getText(cServ, 'cNBS'), descricao: getText(cServ, 'xDescServ'),
      local: { codigoMunicipio: codigoLocal, municipio: getText(inf, 'xLocPrestacao'), uf: ufDoCodigoIbge(codigoLocal), pais: getText(locPrest, 'cPaisPrestacao') },
    },
    issqn: {
      tipoTributacao: getText(tribMun, 'tribISSQN'),
      incidencia: { codigoMunicipio: codigoIncidencia, municipio: getText(inf, 'xLocIncid'), uf: ufDoCodigoIbge(codigoIncidencia), pais: getText(tribMun, 'cPaisResult') },
      tipoImunidade: getText(tribMun, 'tpImunidade'),
      tipoSuspensao: txt(tribMun, 'exigSusp/tpSusp'), processoSuspensao: txt(tribMun, 'exigSusp/nProcesso'),
      tipoBeneficio: getText(valoresNfse, 'tpBM'),
      valorBeneficio: getText(valoresNfse, 'vCalcBM') || txt(tribMun, 'BM/vRedBCBM'),
      percentualBeneficio: txt(tribMun, 'BM/pRedBCBM'),
      deducoes: getText(valoresNfse, 'vCalcDR') || txt(valoresDps, 'vDedRed/vDR'),
      descontoIncondicionado: txt(valoresDps, 'vDescCondIncond/vDescIncond'),
      baseCalculo: getText(valoresNfse, 'vBC'), aliquota: getText(valoresNfse, 'pAliqAplic'),
      tipoRetencao: getText(tribMun, 'tpRetISSQN'), valor: getText(valoresNfse, 'vISSQN'),
    },
    federal: {
      irrf: getText(tribFed, 'vRetIRRF'), contribuicaoPrevidenciaria: getText(tribFed, 'vRetCP'), contribuicoesSociais: getText(tribFed, 'vRetCSLL'),
      pis: getText(piscofins, 'vPis'), cofins: getText(piscofins, 'vCofins'), tipoRetencaoPisCofins: getText(piscofins, 'tpRetPisCofins'),
    },
    ibsCbs: {
      presente: Boolean(ibsNfse || ibsDps),
      cst: getText(gruposIbs, 'CST'), classificacao: getText(gruposIbs, 'cClassTrib'),
      indicadorOperacao: getText(ibsDps, 'cIndOp'), indicadorDestinatario: getText(ibsDps, 'indDest'), finalidade: getText(ibsDps, 'finNFSe'),
      localidade: { codigoMunicipio: codigoLocalidade, municipio: getText(ibsNfse, 'xLocalidadeIncid'), uf: ufDoCodigoIbge(codigoLocalidade), pais: '' },
      baseCalculo: getText(valoresIbs, 'vBC'), reembolsos: getText(valoresIbs, 'vCalcReeRepRes'),
      estadual: lerAliquotas(valoresIbs, 'uf', 'pIBSUF', 'pRedAliqUF', 'pAliqEfetUF', totaisIbs, 'gIBS/gIBSUFTot/vIBSUF'),
      municipal: lerAliquotas(valoresIbs, 'mun', 'pIBSMun', 'pRedAliqMun', 'pAliqEfetMun', totaisIbs, 'gIBS/gIBSMunTot/vIBSMun'),
      cbs: lerAliquotas(valoresIbs, 'fed', 'pCBS', 'pRedAliqCBS', 'pAliqEfetCBS', totaisIbs, 'gCBS/vCBS'),
      totalIbs: txt(totaisIbs, 'gIBS/vIBSTot'), totalNf: getText(totaisIbs, 'vTotNF'),
    },
    totais: {
      valorServico: txt(valoresDps, 'vServPrest/vServ'),
      descontoIncondicionado: txt(valoresDps, 'vDescCondIncond/vDescIncond'),
      descontoCondicionado: txt(valoresDps, 'vDescCondIncond/vDescCond'),
      totalRetencoes: getText(valoresNfse, 'vTotalRet'), valorLiquido: getText(valoresNfse, 'vLiq'),
    },
    tributosAproximados: {
      tipo: monetarios ? 'valor' : percentuais ? 'percentual' : '',
      federal: getText(grupoAproximados, monetarios ? 'vTotTribFed' : 'pTotTribFed'),
      estadual: getText(grupoAproximados, monetarios ? 'vTotTribEst' : 'pTotTribEst'),
      municipal: getText(grupoAproximados, monetarios ? 'vTotTribMun' : 'pTotTribMun'),
      percentualSimples: getText(totTrib, 'pTotTribSN'),
    },
    complementares: {
      informacoes: getText(infoCompl, 'xInfComp'), substituida: txt(infDps, 'subst/chSubstda'),
      documentoReferencia: getText(infoCompl, 'docRef'), codigoObra: getText(obra, 'cObra'),
      inscricaoImobiliaria: getText(obra, 'inscImobFisc') || txt(ibsDps, 'imovel/inscImobFisc'),
      codigoEvento: txt(serv, 'atvEvento/idAtvEvt'), documentoTecnico: getText(infoCompl, 'idDocTec'), numeroPedido: getText(infoCompl, 'xPed'),
      itensPedido: getAll(getFirst(infoCompl, 'gItemPed'), 'xItemPed').map((i) => (i.textContent || '').trim()).filter(Boolean),
      usoMunicipio: getText(inf, 'xOutInf'),
    },
  };
}
