/**
 * Leitura do XML do CT-e (modelo 57, leiaute 4.00 do MOC) para o DACTE: só os campos que o documento auxiliar mostra, na
 * correspondência do quadro "Correlação dos campos do XML do CT-e x DACTE" (MOC CT-e 4.00, Anexo II, item 3).
 * Também lê os arquivos antigos (leiaute 3.00 e 2.00), que o repositório guarda: as diferenças que importam para o DACTE são
 * o CT-e de anulação (infCteAnu, extinto na 4.00) e o tomador `toma03` do 2.00.
 * Usa o parser seguro do importador (sem DTD nem entidade externa, com limite de tamanho). Os valores ficam como texto do XML;
 * a formatação (moeda, data, CNPJ) é feita no desenho.
 *
 * Fonte: Anexo I (leiaute e regras de validação) e Anexo II (DACTE) do MOC CT-e 4.00, publicados no portal nacional do CT-e
 * (cte.fazenda.gov.br), conferidos em 11/11/2026; NT 2025.001 v1.14b (grupo imp/IBSCBS) e NT 2026.004 v1.01 (vTPrestLiq).
 * NÃO confirmado em fonte oficial: o que é só dos leiautes antigos (infCteAnu e tpCTe 2, tomador toma03), que está aqui de memória
 * e do importador (shared/cte-parser.ts); o leiaute 3.00 do MOC não foi lido.
 */
import { getAll, getAttr, getFirst, getFirstDeep, getText, parseXml } from '../../importacao-xml/shared/xml-parser';
import { ErroLeituraDocumento } from './erros';

export class ErroLeituraCte extends ErroLeituraDocumento {}

export interface EnderecoCte {
  logradouro: string; numero: string; complemento: string; bairro: string; municipio: string; uf: string; cep: string; pais: string;
}
export interface ParteCte {
  documento: string; nome: string; fantasia: string; ie: string; fone: string; suframa: string; endereco: EnderecoCte;
}
export type PapelTomador = 'remetente' | 'expedidor' | 'recebedor' | 'destinatario' | 'outros' | '';
export interface TomadorCte { papel: PapelTomador; parte: ParteCte | null }

export interface QuantidadeCarga { codigoUnidade: string; tipoMedida: string; quantidade: string }
export interface CargaCte {
  valorCarga: string; produtoPredominante: string; outrasCaracteristicas: string; quantidades: QuantidadeCarga[];
}

export interface ComponenteCte { nome: string; valor: string }
export interface PrestacaoCte { valorTotal: string; valorReceber: string; valorLiquido: string; componentes: ComponenteCte[] }

export interface IcmsCte {
  /** ICMS00, ICMS20, ICMS45, ICMS60, ICMS90, ICMSOutraUF ou ICMSSN; vazio quando o XML não traz imp/ICMS. */
  grupo: string;
  cst: string;
  /** vBC, vBCSTRet (ICMS60) ou vBCOutraUF, como manda o quadro de correlação do MOC. */
  baseCalculo: string;
  aliquota: string;
  valor: string;
  percentualReducao: string;
  creditoOutorgado: string;
  indicadorSimples: string;
}
/** Grupo imp/IBSCBS da NT 2025.001 (Reforma Tributária). O DACTE do MOC 4.00 não tem quadro para ele. */
export interface IbsCbsCte {
  cst: string; classificacao: string; baseCalculo: string; aliquotaIbsUf: string; valorIbsUf: string; aliquotaIbsMun: string;
  valorIbsMun: string; valorIbs: string; aliquotaCbs: string; valorCbs: string;
}
export interface ImpostoCte { icms: IcmsCte; ibsCbs: IbsCbsCte | null; valorTotalDfe: string }

export type TipoDocumentoCte = 'NFE' | 'NF' | 'OUTRO' | 'CTE_ANTERIOR' | 'PAPEL_ANTERIOR';
/** Documento originário (infNF, infNFe, infOutros) ou de transporte anterior (docAnt): uma linha da lista do DACTE. */
export interface DocumentoCte {
  tipo: TipoDocumentoCte;
  /** O que vai na coluna "TP DOC.": NF-e, NF 01, CT-e, Declaração... */
  rotulo: string;
  /** CNPJ ou CPF (só dígitos) do emitente do documento; vazio quando o XML não permite saber. */
  emitente: string;
  serie: string;
  numero: string;
  /** Chave de acesso de 44 dígitos (NF-e ou CT-e anterior). */
  chave: string;
  descricao: string;
}

/** Veículo novo transportado (infCTeNorm/veicNovos): um dos "casos específicos" do item 2.21.4 do MOC. */
export interface VeiculoNovoCte { chassi: string; cor: string; modelo: string; valorUnitario: string; frete: string }

export type TipoReferenciaCte = 'complementado' | 'substituido' | 'anulado';
export interface ReferenciaCte { tipo: TipoReferenciaCte; chave: string }

export interface CampoLivreCte { campo: string; texto: string }
export interface ObservacoesCte {
  geral: string; informacoesFisco: string; caracteristicaTransporte: string; caracteristicaServico: string; emissor: string;
  municipioOrigemCalculo: string; municipioDestinoCalculo: string;
  /** ObsCont: campo de uso livre do contribuinte (quadro "Uso exclusivo do emissor do CT-e"). */
  usoEmissor: CampoLivreCte[];
  /** ObsFisco: quadro "Reservado ao Fisco". */
  fisco: CampoLivreCte[];
}
export interface FluxoCte { origem: string; passagens: string[]; destino: string }

export interface OrdemColetaCte { serie: string; numero: string; dataEmissao: string; emitente: string; ie: string; uf: string; fone: string }
export interface DetalheModalCte { campo: string; valor: string }
export interface ModalCte {
  /** Código do ide/modal: 01 rodoviário, 02 aéreo, 03 aquaviário, 04 ferroviário, 05 dutoviário, 06 multimodal. */
  codigo: string;
  rntrc: string;
  ordensColeta: OrdemColetaCte[];
  /** Modais que não são o rodoviário: os campos do grupo específico, como estão no XML (nome do campo e valor). */
  detalhes: DetalheModalCte[];
}

export interface ProtocoloCte { numero: string; dataHora: string; status: string; motivo: string }

export interface CteLido {
  chave: string;
  versao: string;
  modelo: string;
  serie: string;
  numero: string;
  dataEmissao: string; // como no XML (ISO com fuso)
  /** tpCTe: 0 normal, 1 complemento de valores, 2 anulação (só no leiaute 3.00 e anteriores), 3 substituição. */
  tipoCte: string;
  /** tpServ: 0 normal, 1 subcontratação, 2 redespacho, 3 redespacho intermediário, 4 serviço vinculado a multimodal. */
  tipoServico: string;
  homologacao: boolean;
  cfop: string;
  naturezaOperacao: string;
  inicioPrestacao: { uf: string; municipio: string };
  terminoPrestacao: { uf: string; municipio: string };
  globalizado: { indicador: boolean; informacao: string };
  /** retira: 0 = o recebedor retira a carga no destino; 1 = não. */
  retira: { indicador: string; detalhes: string };
  emitente: ParteCte;
  remetente: ParteCte | null;
  expedidor: ParteCte | null;
  recebedor: ParteCte | null;
  destinatario: ParteCte | null;
  tomador: TomadorCte;
  carga: CargaCte;
  prestacao: PrestacaoCte;
  imposto: ImpostoCte;
  documentos: DocumentoCte[];
  documentosAnteriores: DocumentoCte[];
  veiculosNovos: VeiculoNovoCte[];
  referencias: ReferenciaCte[];
  observacoes: ObservacoesCte;
  fluxo: FluxoCte;
  modal: ModalCte;
  /** Texto do QR Code (infCTeSupl/qrCodCTe); vazio quando o XML não traz. */
  qrCode: string;
  protocolo: ProtocoloCte | null;
}

// ── Ajudantes ────────────────────────────────────────────────────────

const filhoElemento = (el: any): any => {
  if (!el) return null;
  for (let i = 0; i < el.childNodes.length; i += 1) if (el.childNodes[i].nodeType === 1) return el.childNodes[i];
  return null;
};
const temFilhoElemento = (el: any): boolean => filhoElemento(el) !== null;
const nomeLocal = (el: any): string => String(el?.localName ?? '').toLowerCase();

/** Chave de 44 dígitos → CNPJ ou CPF do emitente do documento (posições 7 a 20; CPF vem com 3 zeros à esquerda). */
export function documentoDaChave(chave: string): string {
  if (!/^[0-9]{44}$/.test(chave)) return '';
  const base = chave.slice(6, 20);
  return base.startsWith('000') && /[1-9]/.test(base.slice(3)) ? base.slice(3) : base;
}
const serieDaChave = (chave: string): string => (/^[0-9]{44}$/.test(chave) ? String(Number(chave.slice(22, 25))) : '');
const numeroDaChave = (chave: string): string => (/^[0-9]{44}$/.test(chave) ? String(Number(chave.slice(25, 34))) : '');

function endereco(el: any): EnderecoCte {
  return {
    logradouro: getText(el, 'xLgr'), numero: getText(el, 'nro'), complemento: getText(el, 'xCpl'), bairro: getText(el, 'xBairro'),
    municipio: getText(el, 'xMun'), uf: getText(el, 'UF'), cep: getText(el, 'CEP'),
    // O código 1058 é o Brasil na tabela do BACEN; quando o XML só traz o código, o DACTE mostra o nome.
    pais: getText(el, 'xPais') || (getText(el, 'cPais') === '1058' ? 'BRASIL' : ''),
  };
}

/** `foneEl` é onde está o telefone: no emitente fica dentro de enderEmit; nos demais, no próprio grupo da parte. */
function parte(el: any, enderecoEl: any, foneEl: any = el): ParteCte {
  return {
    documento: getText(el, 'CNPJ') || getText(el, 'CPF'),
    nome: getText(el, 'xNome'), fantasia: getText(el, 'xFant'), ie: getText(el, 'IE'), fone: getText(foneEl, 'fone'),
    suframa: getText(el, 'ISUF'), endereco: endereco(enderecoEl),
  };
}

const parteOpcional = (el: any, nomeEndereco: string): ParteCte | null => (el ? parte(el, getFirst(el, nomeEndereco)) : null);

function campoLivre(el: any): CampoLivreCte {
  return { campo: getAttr(el, 'xCampo'), texto: getText(el, 'xTexto') };
}

function icms(imp: any): IcmsCte {
  const g = filhoElemento(getFirst(imp, 'ICMS'));
  if (!g) {
    return { grupo: '', cst: '', baseCalculo: '', aliquota: '', valor: '', percentualReducao: '', creditoOutorgado: '', indicadorSimples: '' };
  }
  const grupo = String(g.localName ?? '');
  const retido = /^icms60$/i.test(grupo); // ICMS cobrado por substituição tributária: vBCSTRet, pICMSSTRet, vICMSSTRet
  const sufixo = /outrauf/i.test(grupo) ? 'OutraUF' : '';
  return {
    grupo,
    cst: getText(g, 'CST'),
    baseCalculo: getText(g, retido ? 'vBCSTRet' : `vBC${sufixo}`),
    aliquota: getText(g, retido ? 'pICMSSTRet' : `pICMS${sufixo}`),
    valor: getText(g, retido ? 'vICMSSTRet' : `vICMS${sufixo}`),
    percentualReducao: getText(g, `pRedBC${sufixo}`),
    creditoOutorgado: getText(g, 'vCred'),
    indicadorSimples: getText(g, 'indSN'),
  };
}

function ibsCbs(imp: any): IbsCbsCte | null {
  const ib = getFirst(imp, 'IBSCBS');
  if (!ib) return null;
  const g = getFirst(ib, 'gIBSCBS');
  const uf = getFirst(g, 'gIBSUF');
  const mun = getFirst(g, 'gIBSMun');
  const cbs = getFirst(g, 'gCBS');
  return {
    cst: getText(ib, 'CST'), classificacao: getText(ib, 'cClassTrib'), baseCalculo: getText(g, 'vBC'),
    aliquotaIbsUf: getText(uf, 'pIBSUF'), valorIbsUf: getText(uf, 'vIBSUF'),
    aliquotaIbsMun: getText(mun, 'pIBSMun'), valorIbsMun: getText(mun, 'vIBSMun'),
    valorIbs: getText(g, 'vIBS'), aliquotaCbs: getText(cbs, 'pCBS'), valorCbs: getText(cbs, 'vCBS'),
  };
}

const TIPO_DOCUMENTO_OUTROS: Record<string, string> = { '00': 'Declaração', '10': 'Dutoviário', '59': 'CF-e SAT', '65': 'NFC-e', '99': 'Outros' };
const TIPO_DOCUMENTO_ANTERIOR: Record<string, string> = {
  '07': 'ATRE', '08': 'DTA', '09': 'Conh. Aéreo Int.', '10': 'Carta Porte Int.', '11': 'Conh. Avulso', '12': 'TIF', '13': 'BL',
};

/** infDoc: um item por infNF, infNFe ou infOutros, na ordem do XML. O emitente das NF em papel e dos outros é o remetente (MOC). */
function documentosOriginarios(infDoc: any, remetente: ParteCte | null): DocumentoCte[] {
  const saida: DocumentoCte[] = [];
  if (!infDoc) return saida;
  for (let i = 0; i < infDoc.childNodes.length; i += 1) {
    const el = infDoc.childNodes[i];
    if (el.nodeType !== 1) continue;
    const nome = nomeLocal(el);
    if (nome === 'infnfe') {
      const chave = getText(el, 'chave');
      saida.push({ tipo: 'NFE', rotulo: 'NF-e', emitente: documentoDaChave(chave), serie: serieDaChave(chave), numero: numeroDaChave(chave), chave, descricao: '' });
    } else if (nome === 'infnf') {
      const modelo = getText(el, 'mod');
      saida.push({
        tipo: 'NF', rotulo: modelo ? `NF ${modelo}` : 'NF', emitente: remetente?.documento ?? '', serie: getText(el, 'serie'),
        numero: getText(el, 'nDoc'), chave: '', descricao: '',
      });
    } else if (nome === 'infoutros') {
      const tipo = getText(el, 'tpDoc');
      saida.push({
        tipo: 'OUTRO', rotulo: TIPO_DOCUMENTO_OUTROS[tipo] ?? tipo, emitente: remetente?.documento ?? '', serie: '',
        numero: getText(el, 'nDoc'), chave: '', descricao: getText(el, 'descOutros'),
      });
    }
  }
  return saida;
}

/** docAnt: documentos de transporte anterior (redespacho, subcontratação), eletrônicos (chave do CT-e) ou em papel. */
function documentosAnteriores(docAnt: any): DocumentoCte[] {
  const saida: DocumentoCte[] = [];
  for (const emi of getAll(docAnt, 'emiDocAnt')) {
    const emitente = getText(emi, 'CNPJ') || getText(emi, 'CPF');
    for (const id of getAll(emi, 'idDocAnt')) {
      for (const ele of getAll(id, 'idDocAntEle')) {
        const chave = getText(ele, 'chCTe');
        saida.push({
          tipo: 'CTE_ANTERIOR', rotulo: 'CT-e', emitente: emitente || documentoDaChave(chave), serie: serieDaChave(chave),
          numero: numeroDaChave(chave), chave, descricao: '',
        });
      }
      for (const pap of getAll(id, 'idDocAntPap')) {
        const tipo = getText(pap, 'tpDoc');
        const serie = [getText(pap, 'serie'), getText(pap, 'subser')].filter(Boolean).join('-');
        saida.push({ tipo: 'PAPEL_ANTERIOR', rotulo: TIPO_DOCUMENTO_ANTERIOR[tipo] ?? tipo, emitente, serie, numero: getText(pap, 'nDoc'), chave: '', descricao: '' });
      }
    }
  }
  return saida;
}

/** Folhas (elementos sem filhos elementos) de um grupo, em ordem: nome do campo e valor. Usado nos modais que não são o rodoviário. */
function folhasDoGrupo(el: any, saida: DetalheModalCte[], limite = 60): void {
  for (let i = 0; i < el.childNodes.length && saida.length < limite; i += 1) {
    const filho = el.childNodes[i];
    if (filho.nodeType !== 1) continue;
    if (temFilhoElemento(filho)) folhasDoGrupo(filho, saida, limite);
    else {
      const valor = String(filho.textContent ?? '').trim();
      if (valor) saida.push({ campo: String(filho.localName ?? ''), valor });
    }
  }
}

function modal(infModal: any, codigo: string): ModalCte {
  const grupo = filhoElemento(infModal);
  const saida: ModalCte = { codigo, rntrc: '', ordensColeta: [], detalhes: [] };
  if (!grupo) return saida;
  if (nomeLocal(grupo) === 'rodo') {
    saida.rntrc = getText(grupo, 'RNTRC');
    saida.ordensColeta = getAll(grupo, 'occ').map((o) => {
      const emi = getFirst(o, 'emiOcc');
      return {
        serie: getText(o, 'serie'), numero: getText(o, 'nOcc'), dataEmissao: getText(o, 'dEmi'), emitente: getText(emi, 'CNPJ'),
        ie: getText(emi, 'IE'), uf: getText(emi, 'UF'), fone: getText(emi, 'fone'),
      };
    });
  } else {
    folhasDoGrupo(grupo, saida.detalhes);
  }
  return saida;
}

const PAPEL_TOMA3: Record<string, { papel: PapelTomador; grupo: 'rem' | 'exped' | 'receb' | 'dest' }> = {
  '0': { papel: 'remetente', grupo: 'rem' }, '1': { papel: 'expedidor', grupo: 'exped' },
  '2': { papel: 'recebedor', grupo: 'receb' }, '3': { papel: 'destinatario', grupo: 'dest' },
};

/**
 * Lê o XML (cteProc ou CTe) e devolve os dados do DACTE. Lança ErroLeituraCte (mensagem em português, própria para a tela)
 * quando o XML não é um CT-e legível ou não é do modelo 57: o CT-e OS (67), o CT-e Simplificado e a GTV-e têm outro documento auxiliar.
 */
export function lerCte(xml: string): CteLido {
  let doc;
  try {
    // A declaração <?xml ?> só vale no começo do arquivo: a marca de ordem de bytes (BOM) e as linhas em branco que alguns sistemas
    // gravam antes dela fariam o parser recusar um XML bom.
    doc = parseXml(xml.replace(/^[\s﻿]+/, ''));
  } catch (e) {
    const mensagem = (e as Error).message;
    // O parser seguro já fala português quando o XML é vazio ou grande demais; os erros de sintaxe da biblioteca vêm em inglês e não servem para a tela.
    throw new ErroLeituraCte(/^XML vazio/.test(mensagem) ? mensagem : 'O arquivo não é um XML válido: está mal formado ou incompleto.');
  }
  const raiz: any = doc.documentElement;
  const nomeRaiz = nomeLocal(raiz);
  if (nomeRaiz === 'cteosproc' || nomeRaiz === 'cteos') {
    throw new ErroLeituraCte('O CT-e OS (modelo 67) tem outro documento auxiliar (DACTE OS), que não é gerado aqui: o DACTE só vale para o CT-e modelo 57.');
  }
  if (nomeRaiz === 'ctesimpproc' || nomeRaiz === 'ctesimp') {
    throw new ErroLeituraCte('O CT-e Simplificado tem outro documento auxiliar, que não é gerado aqui: o DACTE só vale para o CT-e modelo 57.');
  }
  if (nomeRaiz === 'gtveproc' || nomeRaiz === 'gtve') {
    throw new ErroLeituraCte('A GTV-e (modelo 64) tem outro documento auxiliar: o DACTE só vale para o CT-e modelo 57.');
  }
  const cte = nomeRaiz === 'cteproc' ? getFirst(raiz, 'CTe') : nomeRaiz === 'cte' ? raiz : null;
  const inf = cte ? getFirst(cte, 'infCte') : null;
  if (!inf) throw new ErroLeituraCte('O XML não é um CT-e (modelo 57).');

  const infProt = nomeRaiz === 'cteproc' ? getFirstDeep(getFirst(raiz, 'protCTe'), 'infProt') : null;
  let chave = getAttr(inf, 'Id').replace(/^CTe/i, '');
  if (!/^[0-9]{44}$/.test(chave)) chave = getText(infProt, 'chCTe');
  if (!/^[0-9]{44}$/.test(chave)) throw new ErroLeituraCte('O CT-e não traz a chave de acesso de 44 dígitos.');

  const ide = getFirst(inf, 'ide');
  // O modelo vem no ide; na falta dele, das posições 21 e 22 da chave.
  const modelo = getText(ide, 'mod') || chave.slice(20, 22);
  if (modelo === '67') {
    throw new ErroLeituraCte('O CT-e OS (modelo 67) tem outro documento auxiliar (DACTE OS), que não é gerado aqui: o DACTE só vale para o CT-e modelo 57.');
  }
  if (modelo !== '57') throw new ErroLeituraCte(`O DACTE só é gerado para CT-e modelo 57 (este documento é modelo ${modelo}).`);

  const compl = getFirst(inf, 'compl');
  const emit = getFirst(inf, 'emit');
  const enderEmit = getFirst(emit, 'enderEmit');
  const vPrest = getFirst(inf, 'vPrest');
  const imp = getFirst(inf, 'imp');
  const norm = getFirst(inf, 'infCTeNorm');
  const infCarga = getFirst(norm, 'infCarga');
  const fluxo = getFirst(compl, 'fluxo');
  const supl = getFirst(cte, 'infCTeSupl');

  const remetente = parteOpcional(getFirst(inf, 'rem'), 'enderReme');
  const expedidor = parteOpcional(getFirst(inf, 'exped'), 'enderExped');
  const recebedor = parteOpcional(getFirst(inf, 'receb'), 'enderReceb');
  const destinatario = parteOpcional(getFirst(inf, 'dest'), 'enderDest');

  // Tomador: no toma4 ("outros") os dados vêm do próprio grupo; no toma3 (toma03 no leiaute 2.00), da parte que o código indica.
  let tomador: TomadorCte = { papel: '', parte: null };
  const toma4 = getFirst(ide, 'toma4');
  const toma3 = getFirst(ide, 'toma3') ?? getFirst(ide, 'toma03');
  if (toma4) {
    tomador = { papel: 'outros', parte: parte(toma4, getFirst(toma4, 'enderToma')) };
  } else if (toma3) {
    const ref = PAPEL_TOMA3[getText(toma3, 'toma')];
    if (ref) {
      const partes = { rem: remetente, exped: expedidor, receb: recebedor, dest: destinatario };
      tomador = { papel: ref.papel, parte: partes[ref.grupo] };
    }
  }

  const referencias: ReferenciaCte[] = [
    ...getAll(inf, 'infCteComp').map((e): ReferenciaCte => ({ tipo: 'complementado', chave: getText(e, 'chCTe') })),
    ...getAll(norm, 'infCteSub').map((e): ReferenciaCte => ({ tipo: 'substituido', chave: getText(e, 'chCte') })),
    ...getAll(inf, 'infCteAnu').map((e): ReferenciaCte => ({ tipo: 'anulado', chave: getText(e, 'chCte') })),
  ].filter((r) => r.chave);

  const globalizado = getFirst(norm, 'infGlobalizado');

  return {
    chave,
    versao: getAttr(inf, 'versao'),
    modelo,
    serie: getText(ide, 'serie'),
    numero: getText(ide, 'nCT'),
    dataEmissao: getText(ide, 'dhEmi'),
    tipoCte: getText(ide, 'tpCTe'),
    tipoServico: getText(ide, 'tpServ'),
    homologacao: (getText(ide, 'tpAmb') || getText(infProt, 'tpAmb')) === '2',
    cfop: getText(ide, 'CFOP'),
    naturezaOperacao: getText(ide, 'natOp'),
    inicioPrestacao: { uf: getText(ide, 'UFIni'), municipio: getText(ide, 'xMunIni') },
    terminoPrestacao: { uf: getText(ide, 'UFFim'), municipio: getText(ide, 'xMunFim') },
    globalizado: { indicador: getText(ide, 'indGlobalizado') === '1', informacao: getText(globalizado, 'xObs') },
    retira: { indicador: getText(ide, 'retira'), detalhes: getText(ide, 'xDetRetira') },
    emitente: parte(emit, enderEmit, enderEmit),
    remetente,
    expedidor,
    recebedor,
    destinatario,
    tomador,
    carga: {
      valorCarga: getText(infCarga, 'vCarga'), produtoPredominante: getText(infCarga, 'proPred'), outrasCaracteristicas: getText(infCarga, 'xOutCat'),
      quantidades: getAll(infCarga, 'infQ').map((q) => ({ codigoUnidade: getText(q, 'cUnid'), tipoMedida: getText(q, 'tpMed'), quantidade: getText(q, 'qCarga') })),
    },
    prestacao: {
      valorTotal: getText(vPrest, 'vTPrest'), valorReceber: getText(vPrest, 'vRec'), valorLiquido: getText(vPrest, 'vTPrestLiq'),
      componentes: getAll(vPrest, 'Comp').map((c) => ({ nome: getText(c, 'xNome'), valor: getText(c, 'vComp') })),
    },
    imposto: { icms: icms(imp), ibsCbs: ibsCbs(imp), valorTotalDfe: getText(imp, 'vTotDFe') },
    documentos: documentosOriginarios(getFirst(norm, 'infDoc'), remetente),
    documentosAnteriores: documentosAnteriores(getFirst(norm, 'docAnt')),
    veiculosNovos: getAll(norm, 'veicNovos').map((v) => ({
      chassi: getText(v, 'chassi'), cor: [getText(v, 'cCor'), getText(v, 'xCor')].filter(Boolean).join(' - '), modelo: getText(v, 'cMod'),
      valorUnitario: getText(v, 'vUnit'), frete: getText(v, 'vFrete'),
    })),
    referencias,
    observacoes: {
      geral: getText(compl, 'xObs'), informacoesFisco: getText(imp, 'infAdFisco'),
      caracteristicaTransporte: getText(compl, 'xCaracAd'), caracteristicaServico: getText(compl, 'xCaracSer'), emissor: getText(compl, 'xEmi'),
      municipioOrigemCalculo: getText(compl, 'origCalc'), municipioDestinoCalculo: getText(compl, 'destCalc'),
      usoEmissor: getAll(compl, 'ObsCont').map(campoLivre), fisco: getAll(compl, 'ObsFisco').map(campoLivre),
    },
    fluxo: { origem: getText(fluxo, 'xOrig'), passagens: getAll(fluxo, 'pass').map((p) => getText(p, 'xPass')).filter(Boolean), destino: getText(fluxo, 'xDest') },
    modal: modal(getFirst(norm, 'infModal'), getText(ide, 'modal')),
    qrCode: getText(supl, 'qrCodCTe'),
    protocolo: infProt
      ? { numero: getText(infProt, 'nProt'), dataHora: getText(infProt, 'dhRecbto'), status: getText(infProt, 'cStat'), motivo: getText(infProt, 'xMotivo') }
      : null,
  };
}
