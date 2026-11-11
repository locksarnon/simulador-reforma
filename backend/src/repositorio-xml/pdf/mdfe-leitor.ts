/**
 * Leitura do XML do MDF-e (modelo 58, leiaute 3.00) para o DAMDFE: só os campos que o documento auxiliar mostra.
 * Usa o parser seguro do importador (sem DTD nem entidade externa, com limite de tamanho). Os valores ficam como texto do XML;
 * a formatação (moeda, data, CNPJ) é feita no desenho.
 *
 * Leiaute conferido em 11/11/2026 contra o Anexo I do MOC 3.00b (Leiaute e Regras de Validação do MDF-e), no arquivo cujo MD5
 * (2ab67e2079e10dd35b78444abae5623c) é o publicado no Ato COTEPE/ICMS 124/2022:
 *  - raiz mdfeProc > MDFe > infMDFe + infMDFeSupl (qrCodMDFe) e protMDFe > infProt; ou só MDFe, sem protocolo;
 *  - infMDFe traz ide, emit, infModal (rodo, aereo, ferrov ou aquav), infDoc (infMunDescarga com infCTe, infNFe e infMDFeTransp),
 *    seg, prodPred, tot, lacres, autXML e infAdic;
 *  - o modal rodoviário (rodo) guarda o RNTRC, o CIOT, o vale-pedágio, os contratantes, o pagamento do frete, o veículo de
 *    tração (com os condutores), os reboques e os lacres do veículo.
 *
 * NÃO confirmado: o que as versões de leiaute anteriores à 3.00 (grupos infCT e infNF, de documentos em papel) trariam; elas não
 * são lidas aqui.
 */
import { getAll, getAttr, getFirst, getFirstDeep, getText, parseXml } from '../../importacao-xml/shared/xml-parser';
import { ErroLeituraDocumento } from './erros';

export class ErroLeituraMdfe extends ErroLeituraDocumento {}

export interface EnderecoMdfe {
  logradouro: string; numero: string; complemento: string; bairro: string; municipio: string; uf: string; cep: string; fone: string; email: string;
}
export interface EmitenteMdfe { documento: string; ie: string; nome: string; fantasia: string; endereco: EnderecoMdfe }
export interface MunicipioMdfe { codigo: string; nome: string }

export type TipoDocumentoMdfe = 'CTE' | 'NFE' | 'MDFE';
export interface DocumentoMdfe { tipo: TipoDocumentoMdfe; chave: string }
export interface MunicipioDescargaMdfe extends MunicipioMdfe { documentos: DocumentoMdfe[] }

export interface ProprietarioMdfe { documento: string; rntrc: string; nome: string; ie: string; uf: string; tipo: string }
export interface VeiculoMdfe {
  tipo: 'TRACAO' | 'REBOQUE'; codigoInterno: string; placa: string; renavam: string; tara: string; capacidadeKg: string; capacidadeM3: string;
  tipoRodado: string; tipoCarroceria: string; uf: string; proprietario: ProprietarioMdfe | null;
}
export interface CondutorMdfe { cpf: string; nome: string }
export interface CiotMdfe { ciot: string; documento: string }
export interface DispositivoValePedagioMdfe { fornecedor: string; responsavel: string; comprovante: string; valor: string; tipo: string }
export interface ContratanteMdfe { nome: string; documento: string; numeroContrato: string; valorContrato: string }
export interface ComponentePagamentoMdfe { tipo: string; valor: string; descricao: string }
export interface ParcelaMdfe { numero: string; vencimento: string; valor: string }
export interface PagamentoFreteMdfe {
  nome: string; documento: string; componentes: ComponentePagamentoMdfe[]; valorContrato: string; altoDesempenho: boolean;
  formaPagamento: string; adiantamento: string; parcelas: ParcelaMdfe[];
  banco: { banco: string; agencia: string; ipef: string; pix: string } | null;
}
export interface RodoviarioMdfe {
  rntrc: string; ciots: CiotMdfe[]; valesPedagio: DispositivoValePedagioMdfe[]; contratantes: ContratanteMdfe[]; pagamentos: PagamentoFreteMdfe[];
  /** O veículo de tração primeiro e depois os reboques. */
  veiculos: VeiculoMdfe[]; condutores: CondutorMdfe[]; lacres: string[]; codigoAgendamentoPorto: string;
}
export interface AereoMdfe { marcaNacionalidade: string; marcaMatricula: string; numeroVoo: string; aerodromoEmbarque: string; aerodromoDestino: string; dataVoo: string }
export interface VagaoMdfe { serie: string; numero: string; sequencia: string; tipo: string; pesoBaseCalculo: string; pesoReal: string; toneladaUtil: string }
export interface FerroviarioMdfe { prefixo: string; dataHoraLiberacao: string; origem: string; destino: string; quantidadeVagoes: string; vagoes: VagaoMdfe[] }
export interface TerminalMdfe { codigo: string; nome: string }
export interface UnidadeVaziaMdfe { identificacao: string; tipo: string }
export interface AquaviarioMdfe {
  irin: string; tipoEmbarcacao: string; codigoEmbarcacao: string; nomeEmbarcacao: string; viagem: string; portoEmbarque: string; portoDestino: string;
  portosTransbordo: string[]; tipoNavegacao: string; terminaisCarregamento: TerminalMdfe[]; terminaisDescarregamento: TerminalMdfe[];
  comboio: { codigo: string; balsa: string }[]; unidadesCargaVazias: UnidadeVaziaMdfe[]; unidadesTransporteVazias: UnidadeVaziaMdfe[];
}

export interface SeguroMdfe {
  responsavel: string; documentoResponsavel: string; seguradora: string; cnpjSeguradora: string; apolice: string; averbacoes: string[];
}
export interface ProdutoPredominanteMdfe { tipoCarga: string; produto: string; gtin: string; ncm: string; localCarregamento: string; localDescarregamento: string }
export interface TotaisMdfe { qtdCte: string; qtdNfe: string; qtdMdfe: string; valorCarga: string; unidade: string; pesoCarga: string }
export interface ProtocoloMdfe { numero: string; dataHora: string; status: string; motivo: string }

export type ModalMdfe = 'RODOVIARIO' | 'AEREO' | 'AQUAVIARIO' | 'FERROVIARIO' | '';

export interface MdfeLido {
  chave: string;
  versao: string;
  modelo: string;
  serie: string;
  numero: string;
  dataEmissao: string; // como no XML (ISO com fuso)
  dataInicioViagem: string;
  homologacao: boolean;
  tipoEmitente: string; // 1 prestador de serviço de transporte, 2 carga própria, 3 prestador que emitirá CT-e globalizado
  tipoTransportador: string; // 1 ETC, 2 TAC, 3 CTC
  formaEmissao: string; // 1 normal, 2 contingência off-line, 3 regime especial NFF
  modal: ModalMdfe;
  ufCarregamento: string;
  ufDescarregamento: string;
  municipiosCarregamento: MunicipioMdfe[];
  ufsPercurso: string[];
  canalVerde: boolean;
  cargaPosterior: boolean;
  emitente: EmitenteMdfe;
  rodoviario: RodoviarioMdfe | null;
  aereo: AereoMdfe | null;
  ferroviario: FerroviarioMdfe | null;
  aquaviario: AquaviarioMdfe | null;
  /** O grupo infDoc veio no XML (mesmo que sem documentos). */
  temInfDoc: boolean;
  municipiosDescarga: MunicipioDescargaMdfe[];
  seguros: SeguroMdfe[];
  produtoPredominante: ProdutoPredominanteMdfe | null;
  totais: TotaisMdfe;
  lacres: string[];
  autorizados: string[];
  informacoesFisco: string;
  informacoesComplementares: string;
  qrCode: string;
  protocolo: ProtocoloMdfe | null;
}

const filhoElemento = (el: any): any => {
  if (!el) return null;
  for (let i = 0; i < el.childNodes.length; i += 1) if (el.childNodes[i].nodeType === 1) return el.childNodes[i];
  return null;
};

/** CNPJ, CPF ou o identificador de estrangeiro, o que o grupo trouxer. */
const documentoDe = (el: any): string => getText(el, 'CNPJ') || getText(el, 'CPF') || getText(el, 'idEstrangeiro');

const textos = (pai: any, nome: string, filho: string): string[] => getAll(pai, nome).map((e) => getText(e, filho)).filter(Boolean);

function endereco(el: any): EnderecoMdfe {
  return {
    logradouro: getText(el, 'xLgr'), numero: getText(el, 'nro'), complemento: getText(el, 'xCpl'), bairro: getText(el, 'xBairro'),
    municipio: getText(el, 'xMun'), uf: getText(el, 'UF'), cep: getText(el, 'CEP'), fone: getText(el, 'fone'), email: getText(el, 'email'),
  };
}

function proprietario(prop: any): ProprietarioMdfe | null {
  if (!prop) return null;
  return { documento: documentoDe(prop), rntrc: getText(prop, 'RNTRC'), nome: getText(prop, 'xNome'), ie: getText(prop, 'IE'), uf: getText(prop, 'UF'), tipo: getText(prop, 'tpProp') };
}

function veiculo(el: any, tipo: VeiculoMdfe['tipo']): VeiculoMdfe {
  return {
    tipo, codigoInterno: getText(el, 'cInt'), placa: getText(el, 'placa'), renavam: getText(el, 'RENAVAM'), tara: getText(el, 'tara'),
    capacidadeKg: getText(el, 'capKG'), capacidadeM3: getText(el, 'capM3'), tipoRodado: getText(el, 'tpRod'), tipoCarroceria: getText(el, 'tpCar'),
    uf: getText(el, 'UF'), proprietario: proprietario(getFirst(el, 'prop')),
  };
}

function pagamento(el: any): PagamentoFreteMdfe {
  const banco = getFirst(el, 'infBanc');
  return {
    nome: getText(el, 'xNome'), documento: documentoDe(el),
    componentes: getAll(el, 'Comp').map((c) => ({ tipo: getText(c, 'tpComp'), valor: getText(c, 'vComp'), descricao: getText(c, 'xComp') })),
    valorContrato: getText(el, 'vContrato'), altoDesempenho: getText(el, 'indAltoDesemp') === '1',
    formaPagamento: getText(el, 'indPag'), adiantamento: getText(el, 'vAdiant'),
    parcelas: getAll(el, 'infPrazo').map((p) => ({ numero: getText(p, 'nParcela'), vencimento: getText(p, 'dVenc'), valor: getText(p, 'vParcela') })),
    banco: banco ? { banco: getText(banco, 'codBanco'), agencia: getText(banco, 'codAgencia'), ipef: getText(banco, 'CNPJIPEF'), pix: getText(banco, 'PIX') } : null,
  };
}

function lerRodoviario(rodo: any): RodoviarioMdfe {
  const ant = getFirst(rodo, 'infANTT');
  const tracao = getFirst(rodo, 'veicTracao');
  const veiculos: VeiculoMdfe[] = [];
  if (tracao) veiculos.push(veiculo(tracao, 'TRACAO'));
  getAll(rodo, 'veicReboque').forEach((r) => veiculos.push(veiculo(r, 'REBOQUE')));
  return {
    rntrc: getText(ant, 'RNTRC'),
    ciots: getAll(ant, 'infCIOT').map((c) => ({ ciot: getText(c, 'CIOT'), documento: documentoDe(c) })),
    valesPedagio: getAll(getFirst(ant, 'valePed'), 'disp').map((d) => ({
      fornecedor: getText(d, 'CNPJForn'), responsavel: getText(d, 'CNPJPg') || getText(d, 'CPFPg'), comprovante: getText(d, 'nCompra'),
      valor: getText(d, 'vValePed'), tipo: getText(d, 'tpValePed'),
    })),
    contratantes: getAll(ant, 'infContratante').map((c) => {
      const contrato = getFirst(c, 'infContrato');
      return { nome: getText(c, 'xNome'), documento: documentoDe(c), numeroContrato: getText(contrato, 'NroContrato'), valorContrato: getText(contrato, 'vContratoGlobal') };
    }),
    pagamentos: getAll(ant, 'infPag').map(pagamento),
    veiculos,
    condutores: getAll(tracao, 'condutor').map((c) => ({ cpf: getText(c, 'CPF'), nome: getText(c, 'xNome') })),
    lacres: textos(rodo, 'lacRodo', 'nLacre'),
    codigoAgendamentoPorto: getText(rodo, 'codAgPorto'),
  };
}

function lerAereo(el: any): AereoMdfe {
  return {
    marcaNacionalidade: getText(el, 'nac'), marcaMatricula: getText(el, 'matr'), numeroVoo: getText(el, 'nVoo'),
    aerodromoEmbarque: getText(el, 'cAerEmb'), aerodromoDestino: getText(el, 'cAerDes'), dataVoo: getText(el, 'dVoo'),
  };
}

function lerFerroviario(el: any): FerroviarioMdfe {
  const trem = getFirst(el, 'trem');
  return {
    prefixo: getText(trem, 'xPref'), dataHoraLiberacao: getText(trem, 'dhTrem'), origem: getText(trem, 'xOri'), destino: getText(trem, 'xDest'),
    quantidadeVagoes: getText(trem, 'qVag'),
    vagoes: getAll(el, 'vag').map((v) => ({
      serie: getText(v, 'serie'), numero: getText(v, 'nVag'), sequencia: getText(v, 'nSeq'), tipo: getText(v, 'tpVag'),
      pesoBaseCalculo: getText(v, 'pesoBC'), pesoReal: getText(v, 'pesoR'), toneladaUtil: getText(v, 'TU'),
    })),
  };
}

function lerAquaviario(el: any): AquaviarioMdfe {
  return {
    irin: getText(el, 'irin'), tipoEmbarcacao: getText(el, 'tpEmb'), codigoEmbarcacao: getText(el, 'cEmbar'), nomeEmbarcacao: getText(el, 'xEmbar'),
    viagem: getText(el, 'nViag'), portoEmbarque: getText(el, 'cPrtEmb'), portoDestino: getText(el, 'cPrtDest'),
    portosTransbordo: getAll(el, 'prtTrans').map((p) => (p.textContent || '').trim()).filter(Boolean),
    tipoNavegacao: getText(el, 'tpNav'),
    terminaisCarregamento: getAll(el, 'infTermCarreg').map((t) => ({ codigo: getText(t, 'cTermCarreg'), nome: getText(t, 'xTermCarreg') })),
    terminaisDescarregamento: getAll(el, 'infTermDescarreg').map((t) => ({ codigo: getText(t, 'cTermDescarreg'), nome: getText(t, 'xTermDescarreg') })),
    comboio: getAll(el, 'infEmbComb').map((b) => ({ codigo: getText(b, 'cEmbComb'), balsa: getText(b, 'xBalsa') })),
    unidadesCargaVazias: getAll(el, 'infUnidCargaVazia').map((u) => ({ identificacao: getText(u, 'idUnidCargaVazia'), tipo: getText(u, 'tpUnidCargaVazia') })),
    unidadesTransporteVazias: getAll(el, 'infUnidTranspVazia').map((u) => ({ identificacao: getText(u, 'idUnidTranspVazia'), tipo: getText(u, 'tpUnidTranspVazia') })),
  };
}

/** Local de carga e descarga da carga lotação: o CEP ou, sem ele, a latitude e a longitude. */
function localDeLotacao(el: any): string {
  if (!el) return '';
  const cep = getText(el, 'CEP');
  if (cep) return `CEP ${cep}`;
  const lat = getText(el, 'latitude');
  const lon = getText(el, 'longitude');
  return lat || lon ? `${lat}, ${lon}` : '';
}

function lerDocumentos(infDoc: any): MunicipioDescargaMdfe[] {
  return getAll(infDoc, 'infMunDescarga').map((mun) => ({
    codigo: getText(mun, 'cMunDescarga'),
    nome: getText(mun, 'xMunDescarga'),
    documentos: [
      ...getAll(mun, 'infCTe').map((e): DocumentoMdfe => ({ tipo: 'CTE', chave: getText(e, 'chCTe') })),
      ...getAll(mun, 'infNFe').map((e): DocumentoMdfe => ({ tipo: 'NFE', chave: getText(e, 'chNFe') })),
      ...getAll(mun, 'infMDFeTransp').map((e): DocumentoMdfe => ({ tipo: 'MDFE', chave: getText(e, 'chMDFe') })),
    ].filter((d) => d.chave),
  }));
}

function lerSeguro(seg: any): SeguroMdfe {
  const resp = getFirst(seg, 'infResp');
  const infSeg = getFirst(seg, 'infSeg');
  return {
    responsavel: getText(resp, 'respSeg'), documentoResponsavel: documentoDe(resp),
    seguradora: getText(infSeg, 'xSeg'), cnpjSeguradora: getText(infSeg, 'CNPJ'),
    apolice: getText(seg, 'nApol'), averbacoes: getAll(seg, 'nAver').map((a) => (a.textContent || '').trim()).filter(Boolean),
  };
}

/** Lê o XML (mdfeProc ou MDFe) e devolve os dados do DAMDFE. Lança ErroLeituraMdfe se não for um MDF-e modelo 58 legível. */
export function lerMdfe(xml: string): MdfeLido {
  let doc;
  try {
    doc = parseXml(xml);
  } catch (e) {
    throw new ErroLeituraMdfe((e as Error).message);
  }
  const raiz: any = doc.documentElement;
  const nomeRaiz = String(raiz?.localName ?? '').toLowerCase();
  const mdfe = nomeRaiz === 'mdfeproc' ? getFirst(raiz, 'MDFe') : nomeRaiz === 'mdfe' ? raiz : null;
  const inf = mdfe ? getFirst(mdfe, 'infMDFe') : null;
  if (!inf) throw new ErroLeituraMdfe('O XML não é um MDF-e (modelo 58).');

  const prot = nomeRaiz === 'mdfeproc' ? getFirstDeep(raiz, 'infProt') : null;
  let chave = getAttr(inf, 'Id').replace(/^MDFe/i, '');
  if (!/^[0-9]{44}$/.test(chave)) chave = getText(prot, 'chMDFe');
  if (!/^[0-9]{44}$/.test(chave)) throw new ErroLeituraMdfe('O MDF-e não traz a chave de acesso de 44 dígitos.');

  const ide = getFirst(inf, 'ide');
  // O modelo vem na chave (posições 21 e 22) quando a tag mod falta.
  const modelo = getText(ide, 'mod') || chave.slice(20, 22);
  if (modelo !== '58') throw new ErroLeituraMdfe(`O DAMDFE só é gerado para MDF-e modelo 58 (este documento é modelo ${modelo}).`);

  const emit = getFirst(inf, 'emit');
  const infModal = getFirst(inf, 'infModal');
  const grupoModal = filhoElemento(infModal);
  const nomeModal = String(grupoModal?.localName ?? '').toLowerCase();
  // O grupo que veio em infModal manda; sem ele, vale o código da tag modal (1 rodoviário, 2 aéreo, 3 aquaviário, 4 ferroviário).
  const modal: ModalMdfe = nomeModal === 'rodo' ? 'RODOVIARIO' : nomeModal === 'aereo' ? 'AEREO' : nomeModal === 'aquav' ? 'AQUAVIARIO' : nomeModal === 'ferrov' ? 'FERROVIARIO'
    : ({ 1: 'RODOVIARIO', 2: 'AEREO', 3: 'AQUAVIARIO', 4: 'FERROVIARIO' } as Record<number, ModalMdfe>)[Number(getText(ide, 'modal'))] ?? '';
  const infDoc = getFirst(inf, 'infDoc');
  const tot = getFirst(inf, 'tot');
  const prod = getFirst(inf, 'prodPred');
  const infAdic = getFirst(inf, 'infAdic');
  const lotacao = getFirst(prod, 'infLotacao');

  return {
    chave,
    versao: getAttr(inf, 'versao'),
    modelo,
    serie: getText(ide, 'serie'),
    numero: getText(ide, 'nMDF'),
    dataEmissao: getText(ide, 'dhEmi'),
    dataInicioViagem: getText(ide, 'dhIniViagem'),
    homologacao: (getText(ide, 'tpAmb') || getText(prot, 'tpAmb')) === '2',
    tipoEmitente: getText(ide, 'tpEmit'),
    tipoTransportador: getText(ide, 'tpTransp'),
    formaEmissao: getText(ide, 'tpEmis'),
    modal,
    ufCarregamento: getText(ide, 'UFIni'),
    ufDescarregamento: getText(ide, 'UFFim'),
    municipiosCarregamento: getAll(ide, 'infMunCarrega').map((m) => ({ codigo: getText(m, 'cMunCarrega'), nome: getText(m, 'xMunCarrega') })),
    ufsPercurso: textos(ide, 'infPercurso', 'UFPer'),
    canalVerde: getText(ide, 'indCanalVerde') === '1',
    cargaPosterior: getText(ide, 'indCarregaPosterior') === '1',
    emitente: { documento: documentoDe(emit), ie: getText(emit, 'IE'), nome: getText(emit, 'xNome'), fantasia: getText(emit, 'xFant'), endereco: endereco(getFirst(emit, 'enderEmit')) },
    rodoviario: nomeModal === 'rodo' ? lerRodoviario(grupoModal) : null,
    aereo: nomeModal === 'aereo' ? lerAereo(grupoModal) : null,
    ferroviario: nomeModal === 'ferrov' ? lerFerroviario(grupoModal) : null,
    aquaviario: nomeModal === 'aquav' ? lerAquaviario(grupoModal) : null,
    temInfDoc: !!infDoc,
    municipiosDescarga: lerDocumentos(infDoc),
    seguros: getAll(inf, 'seg').map(lerSeguro),
    produtoPredominante: prod
      ? {
        tipoCarga: getText(prod, 'tpCarga'), produto: getText(prod, 'xProd'), gtin: getText(prod, 'cEAN'), ncm: getText(prod, 'NCM'),
        localCarregamento: localDeLotacao(getFirst(lotacao, 'infLocalCarrega')), localDescarregamento: localDeLotacao(getFirst(lotacao, 'infLocalDescarrega')),
      }
      : null,
    totais: {
      qtdCte: getText(tot, 'qCTe'), qtdNfe: getText(tot, 'qNFe'), qtdMdfe: getText(tot, 'qMDFe'),
      valorCarga: getText(tot, 'vCarga'), unidade: getText(tot, 'cUnid'), pesoCarga: getText(tot, 'qCarga'),
    },
    lacres: textos(inf, 'lacres', 'nLacre'),
    autorizados: getAll(inf, 'autXML').map(documentoDe).filter(Boolean),
    informacoesFisco: getText(infAdic, 'infAdFisco'),
    informacoesComplementares: getText(infAdic, 'infCpl'),
    qrCode: getText(getFirst(mdfe, 'infMDFeSupl'), 'qrCodMDFe'),
    protocolo: prot ? { numero: getText(prot, 'nProt'), dataHora: getText(prot, 'dhRecbto'), status: getText(prot, 'cStat'), motivo: getText(prot, 'xMotivo') } : null,
  };
}
