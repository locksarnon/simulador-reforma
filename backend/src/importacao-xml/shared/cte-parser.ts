/**
 * Leitura de CT-e (modelo 57) e CT-e OS (modelo 67) para o importador de XML — funções PURAS, sem banco.
 * O serviço só orquestra (perspectivas, catálogos, gravação); tudo que depende do leiaute fica aqui.
 *
 * Leiaute conferido em 29/10/2026 contra fontes OFICIAIS do Portal Nacional do CT-e (cte.fazenda.gov.br):
 *  - pacote de schemas "PL_CTe_400_NT2026.004 RTC_1.00" (cteTiposBasico_v4.00.xsd, DFeTiposBasicos_v1.00.xsd,
 *    eventoCTeTiposBasico_v4.00.xsd, evCancCTe_v4.00.xsd, evApropriaCredPres_v4.00.xsd), republicado em 16/10/2026;
 *  - Nota Técnica 2025.001 v1.14b (grupo imp/IBSCBS e total do DF-e), NT 2026.002 v1.01 e NT 2026.004 v1.00.
 *
 * O que o leiaute oficial diz e este módulo usa:
 *  - CT-e (57): raiz cteProc > CTe > infCte + protCTe > infProt. CT-e OS (67): raiz cteOSProc > CTeOS > infCte;
 *    nele o tomador é o grupo infCte/toma (no 57 é ide/toma3 ou ide/toma4).
 *  - imp/ICMS traz UM dos grupos ICMS00, ICMS20, ICMS45, ICMS60, ICMS90, ICMSOutraUF ou ICMSSN.
 *  - imp/IBSCBS (tipo TTribCTe) tem CST, cClassTrib, indDoacao, gIBSCBS e gEstornoCred. NÃO tem gCredPres:
 *    o crédito presumido do transportador autônomo (cCredPres 02, LC 214 art. 169) é apropriado pelo tomador
 *    por EVENTO (tpEvento 211110, evApropriaCredPres) — NT 2026.004 v1.00, item 8.
 *  - Regra de rejeição 365: vTotDFe = vTPrest + IBS + CBS (em 2026 não soma). Logo vTPrest não inclui IBS/CBS.
 *    (A NT 2026.004, item 3, diz em nota que "a partir de 2027 IBS e CBS compõem o Valor Total da Prestação";
 *    há um alerta quando o total do documento sugere o contrário.)
 *
 * NÃO confirmado: cStat de retorno além de 100/101 (autorização/cancelamento) e 135/136 (evento); CT-e Simplificado,
 * GTV-e e MDF-e não são lidos aqui.
 */
import { getFirst, getAll, getText, getFirstDeep, getTextDeep, getAttr } from './xml-parser';
import { check, Check, STATUS, normalizeCnpj, anoNoBrasil, parseDataEmissao } from './xml-utils';

export type ModeloCte = '57' | '67';

export type ParteCte = { doc: string; nome: string; uf: string; ie: string };

export type PapelTomador = 'remetente' | 'expedidor' | 'recebedor' | 'destinatario' | 'outros' | 'indefinido';
export type TomadorCte = ParteCte & { papel: PapelTomador };

export type IcmsCte = {
  /** ICMS00, ICMS20, ICMS45, ICMS60, ICMS90, ICMSOutraUF, ICMSSN — vazio quando imp/ICMS não veio. */
  grupo: string;
  cst: string;
  vBC: number | null;
  pICMS: number | null;
  vICMS: number | null;
  pRedBC: number | null;
  indSN: string;
  /** Texto original de pICMS (ou pICMSOutraUF), como veio no XML. */
  pICMSTexto: string;
};

export type IbsCbsCte = {
  cst: string;
  cClassTrib: string;
  indDoacao: string;
  vBC: number | null;
  vIBS: number | null;
  vCBS: number | null;
  pIBSUF: string;
  pIBSMun: string;
  pCBS: string;
  // Leitura TOLERANTE (busca profunda): estes três NÃO fazem parte do leiaute do CT-e na NT 2025.001 v1.14b.
  cCredPres: string;
  pCredPresIBS: string;
  pCredPresCBS: string;
  grupoRtc: string;
};

export type CteLido = {
  modelo: ModeloCte;
  chave: string;
  versao: string;
  numero: string;
  serie: string;
  dhEmi: string;
  ambiente: string;
  tpCTe: string;
  tpEmis: string;
  procEmi: string;
  cfop: string;
  natOp: string;
  modal: string;
  tpServ: string;
  ufIni: string;
  ufFim: string;
  cMunIni: string;
  cMunFim: string;
  emitente: ParteCte & { crt: string };
  tomador: TomadorCte;
  vTPrest: number;
  vRec: number | null;
  vTPrestLiq: number | null;
  vTotDFe: number | null;
  componentes: { nome: string; valor: number | null }[];
  icms: IcmsCte;
  ibscbs: IbsCbsCte | null;
  cStat: string;
  xMotivo: string;
  nProt: string;
  /** Chaves das NF-e transportadas (infDoc/infNFe/chave). */
  chavesNfe: string[];
  /** Chaves de outros CT-e relacionados: complemento, substituição, anulação e documentos anteriores (redespacho). */
  chavesCteRelacionados: string[];
  compraGov: { tpEnteGov: string; pRedutor: string; tpOperGov: string } | null;
};

export type LeituraCte = { ok: true; cte: CteLido } | { ok: false; motivo: string };

// ── leitura do XML ──────────────────────────────────────────────────────────

/** Decimal do XML ("1234.56"); null quando vazio ou inválido. */
function num(v: string): number | null {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(',', '.').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function primeiroFilho(el: any): any {
  if (!el) return null;
  const filhos = el.childNodes;
  for (let i = 0; i < filhos.length; i++) {
    if (filhos[i].nodeType === 1) return filhos[i];
  }
  return null;
}

/** Todos os descendentes com o nome dado (busca em profundidade, sem repetir dentro do mesmo achado). */
function todosProfundos(parent: any, localName: string, profundidade = 30): any[] {
  const achados: any[] = [];
  if (!parent || profundidade <= 0) return achados;
  const alvo = localName.toLowerCase();
  const filhos = parent.childNodes;
  for (let i = 0; i < filhos.length; i++) {
    const n = filhos[i];
    if (n.nodeType !== 1) continue;
    if (n.localName && n.localName.toLowerCase() === alvo) achados.push(n);
    else achados.push(...todosProfundos(n, localName, profundidade - 1));
  }
  return achados;
}

const PAPEL_TOMA3: Record<string, Exclude<PapelTomador, 'outros' | 'indefinido'>> = {
  '0': 'remetente',
  '1': 'expedidor',
  '2': 'recebedor',
  '3': 'destinatario',
};
const ELEMENTO_PAPEL: Record<string, { grupo: string; endereco: string }> = {
  remetente: { grupo: 'rem', endereco: 'enderReme' },
  expedidor: { grupo: 'exped', endereco: 'enderExped' },
  recebedor: { grupo: 'receb', endereco: 'enderReceb' },
  destinatario: { grupo: 'dest', endereco: 'enderDest' },
};

function lerParte(el: any, nomeEndereco: string): ParteCte {
  if (!el) return { doc: '', nome: '', uf: '', ie: '' };
  const endereco = getFirst(el, nomeEndereco);
  return {
    doc: getText(el, 'CNPJ') || getText(el, 'CPF'),
    nome: getText(el, 'xNome'),
    uf: endereco ? getText(endereco, 'UF') : '',
    ie: getText(el, 'IE'),
  };
}

const TOMADOR_INDEFINIDO: TomadorCte = { doc: '', nome: '', uf: '', ie: '', papel: 'indefinido' };

function lerTomador(infCte: any, ide: any, modelo: string): TomadorCte {
  if (modelo === '67') {
    const toma = getFirst(infCte, 'toma');
    return toma ? { ...lerParte(toma, 'enderToma'), papel: 'outros' } : TOMADOR_INDEFINIDO;
  }
  const toma4 = getFirst(ide, 'toma4');
  if (toma4) return { ...lerParte(toma4, 'enderToma'), papel: 'outros' };
  const toma3 = getFirst(ide, 'toma3');
  if (toma3) {
    const papel = PAPEL_TOMA3[getText(toma3, 'toma')];
    if (papel) {
      const alvo = ELEMENTO_PAPEL[papel];
      return { ...lerParte(getFirst(infCte, alvo.grupo), alvo.endereco), papel };
    }
  }
  return TOMADOR_INDEFINIDO;
}

function lerIcms(imp: any): IcmsCte {
  const vazio: IcmsCte = { grupo: '', cst: '', vBC: null, pICMS: null, vICMS: null, pRedBC: null, indSN: '', pICMSTexto: '' };
  const grupoEl = primeiroFilho(getFirst(imp, 'ICMS'));
  if (!grupoEl) return vazio;
  const grupo = String(grupoEl.localName || '');
  const sufixo = /outrauf/i.test(grupo) ? 'OutraUF' : '';
  return {
    grupo,
    cst: getText(grupoEl, 'CST'),
    vBC: num(getText(grupoEl, `vBC${sufixo}`)),
    pICMS: num(getText(grupoEl, `pICMS${sufixo}`)),
    vICMS: num(getText(grupoEl, `vICMS${sufixo}`)),
    pRedBC: num(getText(grupoEl, `pRedBC${sufixo}`)),
    indSN: getText(grupoEl, 'indSN'),
    pICMSTexto: getText(grupoEl, `pICMS${sufixo}`),
  };
}

function lerIbsCbs(imp: any): IbsCbsCte | null {
  const ib = getFirst(imp, 'IBSCBS');
  if (!ib) return null;
  const g = getFirst(ib, 'gIBSCBS');
  return {
    cst: getText(ib, 'CST'),
    cClassTrib: getText(ib, 'cClassTrib'),
    indDoacao: getText(ib, 'indDoacao'),
    vBC: num(getText(g, 'vBC')),
    vIBS: num(getText(g, 'vIBS')),
    vCBS: num(getText(getFirst(g, 'gCBS'), 'vCBS')),
    pIBSUF: getText(getFirst(g, 'gIBSUF'), 'pIBSUF'),
    pIBSMun: getText(getFirst(g, 'gIBSMun'), 'pIBSMun'),
    pCBS: getText(getFirst(g, 'gCBS'), 'pCBS'),
    cCredPres: getTextDeep(ib, 'cCredPres'),
    pCredPresIBS: getTextDeep(ib, 'pCredPresIBS'),
    pCredPresCBS: getTextDeep(ib, 'pCredPresCBS'),
    grupoRtc: getTextDeep(ib, 'gRTC'),
  };
}

/** Lê um CT-e/CT-e OS já parseado. Não consulta banco nem decide perspectiva. */
export function lerCte(doc: any): LeituraCte {
  const root = doc?.documentElement;
  if (!root) return { ok: false, motivo: 'XML sem elemento raiz.' };
  const nomeRaiz = String(root.localName || root.nodeName || '').toLowerCase();
  const cteEl = nomeRaiz === 'cte' || nomeRaiz === 'cteos' ? root : getFirst(root, 'CTe') || getFirst(root, 'CTeOS');
  if (!cteEl) return { ok: false, motivo: 'Elemento CTe/CTeOS não localizado.' };
  const infCte = getFirst(cteEl, 'infCte');
  if (!infCte) return { ok: false, motivo: 'Elemento infCte não localizado.' };
  const ide = getFirst(infCte, 'ide');
  if (!ide) return { ok: false, motivo: 'Grupo ide não localizado no CT-e.' };

  const protCTe = getFirst(root, 'protCTe') || getFirst(cteEl, 'protCTe');
  const infProt = getFirst(protCTe, 'infProt');
  const chave = (getAttr(infCte, 'Id') || '').replace(/^CTe/i, '') || getText(infProt, 'chCTe');
  const modelo = (getText(ide, 'mod') || chave.substring(20, 22)) as string;
  if (modelo !== '57' && modelo !== '67') {
    return { ok: false, motivo: `Modelo ${modelo || '—'} não suportado (esperado 57 ou 67).` };
  }

  const emit = getFirst(infCte, 'emit');
  const vPrest = getFirst(infCte, 'vPrest');
  const imp = getFirst(infCte, 'imp');
  const infDoc = getFirstDeep(infCte, 'infDoc');

  const chavesNfe = infDoc ? getAll(infDoc, 'infNFe').map((n) => getText(n, 'chave')).filter(Boolean) : [];
  const chavesCteRelacionados = [
    ...todosProfundos(infCte, 'infCteComp').map((n) => getText(n, 'chCTe')),
    ...todosProfundos(infCte, 'infCteSub').map((n) => getText(n, 'chCte')),
    ...todosProfundos(infCte, 'infCteAnu').map((n) => getText(n, 'chCte')),
    ...todosProfundos(infCte, 'idDocAntEle').map((n) => getText(n, 'chCTe')),
  ].filter(Boolean);

  const gov = getFirst(ide, 'gCompraGov');

  return {
    ok: true,
    cte: {
      modelo: modelo as ModeloCte,
      chave,
      versao: getAttr(infCte, 'versao'),
      numero: getText(ide, 'nCT'),
      serie: getText(ide, 'serie'),
      dhEmi: getText(ide, 'dhEmi'),
      ambiente: getText(ide, 'tpAmb'),
      tpCTe: getText(ide, 'tpCTe'),
      tpEmis: getText(ide, 'tpEmis'),
      procEmi: getText(ide, 'procEmi'),
      cfop: getText(ide, 'CFOP'),
      natOp: getText(ide, 'natOp'),
      modal: getText(ide, 'modal'),
      tpServ: getText(ide, 'tpServ'),
      ufIni: getText(ide, 'UFIni'),
      ufFim: getText(ide, 'UFFim'),
      cMunIni: getText(ide, 'cMunIni'),
      cMunFim: getText(ide, 'cMunFim'),
      emitente: { ...lerParte(emit, 'enderEmit'), crt: getText(emit, 'CRT') },
      tomador: lerTomador(infCte, ide, modelo),
      vTPrest: num(getText(vPrest, 'vTPrest')) ?? 0,
      vRec: num(getText(vPrest, 'vRec')),
      vTPrestLiq: num(getText(vPrest, 'vTPrestLiq')),
      vTotDFe: num(getText(imp, 'vTotDFe')),
      componentes: getAll(vPrest, 'Comp').map((c) => ({ nome: getText(c, 'xNome'), valor: num(getText(c, 'vComp')) })),
      icms: lerIcms(imp),
      ibscbs: lerIbsCbs(imp),
      cStat: getText(infProt, 'cStat'),
      xMotivo: getText(infProt, 'xMotivo'),
      nProt: getText(infProt, 'nProt'),
      chavesNfe,
      chavesCteRelacionados,
      compraGov: gov ? { tpEnteGov: getText(gov, 'tpEnteGov'), pRedutor: getText(gov, 'pRedutor'), tpOperGov: getText(gov, 'tpOperGov') } : null,
    },
  };
}

// ── mapeamentos ─────────────────────────────────────────────────────────────

/** Modelo do documento (posições 21–22 da chave de 44 dígitos); vazio se a chave não tiver 44 dígitos. */
export function modeloDaChave(chave: string): string {
  return /^\d{44}$/.test(String(chave || '')) ? String(chave).substring(20, 22) : '';
}

/** Rótulo do campo `documento` da Operação a partir do modelo da chave (55 → NF-e, 65 → NFC-e, 57/67 → CT-e). */
export function documentoDaChave(chave: string): string {
  const modelo = modeloDaChave(chave);
  if (modelo === '57' || modelo === '67') return 'CT-e';
  if (modelo === '65') return 'NFC-e';
  return 'NF-e';
}

export function ehChaveCte(chave: string): boolean {
  const modelo = modeloDaChave(chave);
  return modelo === '57' || modelo === '67';
}

/**
 * Percentual efetivo do ICMS sobre o valor da prestação (fração: 0,12 = 12%), que é o que o motor aplica sobre valor_bruto.
 *  - ICMS45 (CST 40/41/51), ICMS60 (ST anterior) e ICMSSN: nenhum ICMS destacado → 0.
 *  - Demais grupos: vICMS/vTPrest quando vICMS > 0; vICMS informado igual a zero → 0;
 *    sem vICMS, pICMS × (1 − pRedBC/100).
 * Devolve null quando não há como calcular (sem grupo, ou resultado fora de [0, 1]).
 */
export function icmsEfetivoCte(icms: IcmsCte, vTPrest: number): number | null {
  const g = icms.grupo.toLowerCase();
  if (!g) return null;
  if (g === 'icms45' || g === 'icms60' || g === 'icmssn') return 0;
  let pct: number | null = null;
  if (icms.vICMS !== null && icms.vICMS > 0) {
    pct = vTPrest > 0 ? icms.vICMS / vTPrest : null;
  } else if (icms.vICMS !== null) {
    pct = 0;
  } else if (icms.pICMS !== null) {
    pct = (icms.pICMS / 100) * (1 - (icms.pRedBC ?? 0) / 100);
  }
  if (pct === null || !Number.isFinite(pct) || pct < 0 || pct > 1) return null;
  return pct;
}

/** PIS/Cofins presumidos pelo regime da empresa (o CT-e não traz PIS/Cofins). Frações: 0,0165 = 1,65%. */
export function pisCofinsPadraoRegime(regime: string | null | undefined): { pis: number; cofins: number; reconhecido: boolean; descricao: string } {
  const r = String(regime || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (r.includes('presumido')) {
    return { pis: 0.0065, cofins: 0.03, reconhecido: true, descricao: 'Lucro Presumido (regime cumulativo: PIS 0,65% e Cofins 3,00%)' };
  }
  if (/\breal\b/.test(r)) {
    return { pis: 0.0165, cofins: 0.076, reconhecido: true, descricao: 'Lucro Real (regime não cumulativo: PIS 1,65% e Cofins 7,60%)' };
  }
  if (r.includes('simples') || /\bmei\b/.test(r) || r.includes('produtor rural')) {
    return { pis: 0, cofins: 0, reconhecido: true, descricao: `${regime} (PIS/Cofins fora do cálculo por operação: DAS ou pessoa física)` };
  }
  return { pis: 0, cofins: 0, reconhecido: false, descricao: 'regime da empresa não identificado (PIS/Cofins deixados em zero)' };
}

export type EmpresaPerspectiva = { id: string } & Record<string, any>;
export type Perspectiva = { empresa: EmpresaPerspectiva | null; perspectiva: string; direcao: string; tipo_rel: string };

/**
 * Quais empresas do grupo participam do CT-e e em que papel. Emitente (a transportadora) = EMITENTE/Saída (receita);
 * tomador do serviço = DESTINATARIO/Entrada (frete adquirido). Mesma lógica de prepararNfe.
 */
export function resolverPerspectivas(
  cnpjEmitNorm: string,
  cnpjTomadorNorm: string,
  empresasByCnpj: Map<string, any>,
): { statusMapeamento: string; perspectivas: Perspectiva[] } {
  const empEmit = empresasByCnpj.get(cnpjEmitNorm);
  const empToma = empresasByCnpj.get(cnpjTomadorNorm);
  let statusMapeamento = 'OK';
  let perspectivas: Perspectiva[] = [];
  if (cnpjEmitNorm && cnpjTomadorNorm && cnpjEmitNorm === cnpjTomadorNorm) {
    statusMapeamento = 'REVISAO_MESMO_CNPJ';
  } else if (!empEmit && !empToma) {
    statusMapeamento = 'CNPJ_NAO_LOCALIZADO';
    perspectivas = [{ empresa: null, perspectiva: 'PENDENTE', direcao: 'Entrada', tipo_rel: 'TERCEIRO' }];
  } else if (empEmit && empToma && empEmit.id !== empToma.id) {
    perspectivas = [
      { empresa: empEmit, perspectiva: 'EMITENTE', direcao: 'Saida', tipo_rel: 'INTERCOMPANY' },
      { empresa: empToma, perspectiva: 'DESTINATARIO', direcao: 'Entrada', tipo_rel: 'INTERCOMPANY' },
    ];
  } else if (empEmit && empToma && empEmit.id === empToma.id) {
    perspectivas = [
      { empresa: empEmit, perspectiva: 'EMITENTE', direcao: 'Saida', tipo_rel: 'TRANSFERENCIA_INTERNA' },
      { empresa: empToma, perspectiva: 'DESTINATARIO', direcao: 'Entrada', tipo_rel: 'TRANSFERENCIA_INTERNA' },
    ];
  } else if (empEmit) {
    perspectivas = [{ empresa: empEmit, perspectiva: 'EMITENTE', direcao: 'Saida', tipo_rel: 'TERCEIRO' }];
  } else if (empToma) {
    perspectivas = [{ empresa: empToma, perspectiva: 'DESTINATARIO', direcao: 'Entrada', tipo_rel: 'TERCEIRO' }];
  }
  return { statusMapeamento, perspectivas };
}

/** Situação fiscal pelo protocolo (mesma ordem de decisão do NF-e). 100 = autorizado, 101 = cancelamento homologado. */
export function situacaoFiscalCte(cStat: string, ambiente: string): string {
  if (cStat === '100') return 'AUTORIZADO';
  if (cStat === '101') return 'CANCELADO';
  if (ambiente === '2') return 'HOMOLOGACAO';
  if (cStat) return 'INVALIDO';
  return 'SEM_PROTOCOLO';
}

const FINALIDADE_CTE: Record<string, string> = { '0': '', '1': 'Complemento de valores — ', '2': 'Anulação — ', '3': 'Substituto — ' };

/** Texto curto para a operação, ex.: "Transporte de carga SP→MG (CT-e nº 123)". */
export function descricaoCte(c: CteLido): string {
  const rota = c.ufIni && c.ufFim ? ` ${c.ufIni}→${c.ufFim}` : '';
  const doc = c.modelo === '67' ? 'CT-e OS' : 'CT-e';
  const servico = c.modelo === '67' ? 'Serviço de transporte' : 'Transporte de carga';
  const numero = String(parseInt(c.numero, 10) || c.numero || '—');
  return `${FINALIDADE_CTE[c.tpCTe] || ''}${servico}${rota} (${doc} nº ${numero})`;
}

/** Data/hora de emissão como Date; null se ausente ou inválida. */
export function dataEmissaoCte(c: Pick<CteLido, 'dhEmi'>): Date | null {
  return parseDataEmissao(c.dhEmi);
}

/**
 * Local da operação (LC 214/2025, art. 11): no transporte de carga é o local da entrega, isto é, o fim da prestação (inciso
 * VII); no de passageiros é o local de início do transporte (inciso VI). No CT-e OS, tpServ 6 (pessoas) e 8 (excesso de
 * bagagem) são passageiros; 7 (valores) segue o fim, como a carga.
 */
export function localDaOperacaoCte(c: Pick<CteLido, 'modelo' | 'tpServ' | 'ufIni' | 'ufFim' | 'cMunIni' | 'cMunFim'>): { uf: string; municipio: string } {
  const passageiros = c.modelo === '67' && (c.tpServ === '6' || c.tpServ === '8');
  return passageiros ? { uf: c.ufIni, municipio: c.cMunIni } : { uf: c.ufFim, municipio: c.cMunFim };
}

export type ContextoItemCte = { loteId: string; arquivoId: string; grupoId: string; statusMapeamento: string };

/** Campos de ImportacaoXMLItem para UM CT-e visto de UMA perspectiva (numero_item sempre 1). */
export function montarDadosCte(c: CteLido, p: Perspectiva, ctx: ContextoItemCte): Record<string, unknown> {
  const ib = c.ibscbs;
  const cstOriginal = ib?.cst || '';
  const classOriginal = ib?.cClassTrib || '';
  // Sem o grupo IBSCBS (CT-e emitido antes de 2026 ou de emitente do Simples) assume o regime padrão, como o NF-e faz.
  const cstNormalizado = cstOriginal || (classOriginal ? classOriginal.slice(0, 3) : '000');
  const classNormalizada = classOriginal || '000001';

  const icmsPct = icmsEfetivoCte(c.icms, c.vTPrest);
  // PIS/Cofins só se presumem na SAÍDA (a receita da própria transportadora, pelo regime dela). Na ENTRADA o PIS/Cofins
  // embutido no frete é o do prestador, que o CT-e não informa e o regime do comprador não revela; presumir o do
  // comprador criaria um crédito de PIS/Cofins que, por exemplo, o Lucro Presumido não tem. Fica zero, com alerta.
  const regime = p.direcao === 'Saida' ? pisCofinsPadraoRegime(p.empresa?.regime_atual) : { pis: 0, cofins: 0 };
  const refs = [...c.chavesNfe, ...c.chavesCteRelacionados];
  const dataEmi = dataEmissaoCte(c);
  const local = localDaOperacaoCte(c);

  return {
    lote_id: ctx.loteId,
    arquivo_id: ctx.arquivoId,
    grupo_id: ctx.grupoId,
    chave_nfe: c.chave,
    numero_item: 1,
    empresa_id: p.empresa ? p.empresa.id : null,
    perspectiva: p.perspectiva,
    direcao: p.direcao,
    tipo_relacionamento: p.tipo_rel,
    status_mapeamento: ctx.statusMapeamento,
    descricao: descricaoCte(c),
    ncm: null,
    nbs: null,
    cfop_servico: c.cfop || null,
    uf_origem: c.ufIni || null,
    // Local da operação (LC 214/2025, art. 11, VI e VII): fim da prestação na carga, início do transporte nos passageiros.
    uf_destino: local.uf || null,
    municipio_destino: local.municipio || null,
    quantidade: 1,
    preco_unitario: c.vTPrest,
    desconto_incondicional: 0,
    frete: 0,
    seguro: 0,
    outras_despesas: 0,
    valor_bruto: c.vTPrest,
    cst_original: cstOriginal,
    cst_normalizado: cstNormalizado,
    c_class_trib_original: classOriginal,
    c_class_trib_normalizado: classNormalizada,
    c_cred_pres_original: ib?.cCredPres || '',
    c_cred_pres_normalizado: ib?.cCredPres || null,
    // PIS/Cofins não constam do CT-e: sem original; o normalizado vem do regime da empresa (e há alerta).
    pis_pct_original: null,
    pis_pct_normalizado: regime.pis,
    cofins_pct_original: null,
    cofins_pct_normalizado: regime.cofins,
    icms_pct_original: c.icms.pICMSTexto,
    icms_pct_normalizado: icmsPct,
    fcp_pct_original: null,
    fcp_pct_normalizado: null,
    ipi_pct_original: null,
    ipi_pct_normalizado: null,
    iss_pct_original: null,
    iss_pct_normalizado: null,
    credito_presumido_ibs_pct_original: ib?.pCredPresIBS || '',
    credito_presumido_ibs_pct_normalizado: percentualOuNull(ib?.pCredPresIBS),
    credito_presumido_cbs_pct_original: ib?.pCredPresCBS || '',
    credito_presumido_cbs_pct_normalizado: percentualOuNull(ib?.pCredPresCBS),
    grupo_rtc: ib?.grupoRtc || null,
    finalidade_dfe: c.tpCTe || null,
    documentos_referenciados_json: refs.length > 0 ? JSON.stringify(refs) : null,
    crt_emitente: c.emitente.crt || null,
    ambiente: c.ambiente,
    data_emissao: dataEmi,
  };
}

/** Percentual do XML ("1.5000" = 1,5%) em fração; null se vazio ou fora de [0, 100]. */
function percentualOuNull(v: string | undefined): number | null {
  const n = num(v ?? '');
  if (n === null) return null;
  const p = n / 100;
  return p < 0 || p > 1 ? null : p;
}

// ── validações específicas do CT-e ─────────────────────────────────────────

export type ChecksExtrasCte = { tributarias: Check[]; operacionais: Check[] };

/** Marca de emissão por TAC/MEI: Nota Fiscal Fácil (tpEmis 3), emissão pelo PAA (procEmi 4) ou CRT 4 (MEI). */
export function emitidoPorTacOuMei(c: CteLido): boolean {
  return c.tpEmis === '3' || c.procEmi === '4' || c.emitente.crt === '4';
}

/** Checks que só fazem sentido para CT-e (os demais são os mesmos do NF-e). Nenhum bloqueia a importação. */
export function checksExtrasCte(c: CteLido, p: { empresa: Record<string, any> | null; perspectiva: string }): ChecksExtrasCte {
  const tributarias: Check[] = [];
  const operacionais: Check[] = [];

  if (p.perspectiva === 'DESTINATARIO') {
    tributarias.push(
      check(
        'TRIB_PIS_COFINS_COMPRA_ZERADO',
        STATUS.ALERTA,
        'O CT-e não traz o PIS/Cofins do prestador, então a compra do frete entra com PIS/Cofins zerados (o crédito de PIS/Cofins do sistema atual só existe para quem está no Lucro Real, e depende do regime do prestador). Informe na operação se for o caso. O crédito de IBS/CBS é definido em "Crédito elegível %".',
        false,
        'pis_pct',
      ),
    );
  } else {
    const regime = pisCofinsPadraoRegime(p.empresa?.regime_atual);
    tributarias.push(
      check(
        'TRIB_PIS_COFINS_PADRAO_REGIME',
        STATUS.ALERTA,
        `O CT-e não traz PIS/Cofins: foram presumidos pelo regime da empresa — ${regime.descricao}. Ajuste na operação se a empresa tiver outro tratamento.`,
        false,
        'pis_pct',
      ),
    );
  }

  if (p.perspectiva === 'DESTINATARIO' && emitidoPorTacOuMei(c)) {
    tributarias.push(
      check(
        'TRIB_CTE_TAC_CRED_PRES_VIA_EVENTO',
        STATUS.ALERTA,
        'CT-e emitido por transportador autônomo/MEI: o crédito presumido (LC 214/2025, art. 169) não consta do CT-e; o tomador o apropria por evento (tipo 211110). Importe o evento ou informe o crédito presumido na operação.',
        false,
        'c_cred_pres',
      ),
    );
  }

  if (c.tpCTe === '1') {
    operacionais.push(
      check(
        'OPER_CTE_COMPLEMENTO_REVISAR',
        STATUS.ALERTA,
        `CT-e de complemento de valores (tpCTe=1)${c.chavesCteRelacionados.length ? `, referencia ${c.chavesCteRelacionados.length} CT-e` : ''} — verifique se o valor já não está no CT-e original antes de confirmar, para não contar em dobro.`,
        false,
        'finalidade_dfe',
        c.chavesCteRelacionados,
      ),
    );
  } else if (c.tpCTe === '3') {
    operacionais.push(
      check(
        'OPER_CTE_SUBSTITUTO_REVISAR',
        STATUS.ALERTA,
        'CT-e substituto (tpCTe=3): substitui outro CT-e — importe apenas um dos dois para não contar em dobro.',
        false,
        'finalidade_dfe',
        c.chavesCteRelacionados,
      ),
    );
  } else if (c.tpCTe === '2') {
    operacionais.push(
      check(
        'OPER_CTE_ANULACAO_REVISAR',
        STATUS.ALERTA,
        'CT-e de anulação (tpCTe=2): confira o CT-e anulado e se esta operação não duplica ou deveria estornar a original.',
        false,
        'finalidade_dfe',
        c.chavesCteRelacionados,
      ),
    );
  }

  // Regra 365: em 2027+ vTotDFe = vTPrest + vIBS + vCBS. Se o total repete o vTPrest apesar de haver IBS/CBS, o
  // vTPrest pode já incluir os dois (nota da NT 2026.004, item 3): o valor_bruto fica a conferir.
  const ib = c.ibscbs;
  const tributosNovos = (ib?.vIBS ?? 0) + (ib?.vCBS ?? 0);
  const emissao = dataEmissaoCte(c);
  const ano = emissao ? anoNoBrasil(emissao) : 0;
  if (ib && tributosNovos > 0 && c.vTotDFe !== null && ano >= 2027 && Math.abs(c.vTotDFe - c.vTPrest) <= 0.01) {
    operacionais.push(
      check(
        'OPER_CTE_VALOR_PRESTACAO_COM_IBS_CBS_REVISAR',
        STATUS.ALERTA,
        'O total do documento (vTotDFe) é igual ao valor da prestação (vTPrest) apesar de haver IBS/CBS: o vTPrest pode já incluir esses tributos. A operação usa o vTPrest como valor bruto; confira se não deve descontar IBS e CBS.',
        false,
        'valor_bruto',
      ),
    );
  }

  return { tributarias, operacionais };
}

// ── eventos ─────────────────────────────────────────────────────────────────

export type ApropriacaoCredPres = {
  vBC: number | null;
  /** Código de 2 dígitos como vem no XML (padrão \d{2}); 02 = transportador autônomo (art. 169). */
  cCredPres: string;
  ibs: { pct: string; valor: number | null } | null;
  cbs: { pct: string; valor: number | null } | null;
};

export type EventoCteLido = {
  chave: string;
  tpEvento: string;
  descEvento: string;
  cStat: string;
  xMotivo: string;
  nProt: string;
  /** Retorno da SEFAZ com cStat 135 (registrado e vinculado) ou 136 (registrado, não vinculado). */
  processado: boolean;
  /** Preenchido só no evento 211110 (Apropriação do Crédito Presumido). */
  apropriacao: ApropriacaoCredPres | null;
};

export const TP_EVENTO_APROPRIACAO_CRED_PRES = '211110';

/** A raiz é de evento de CT-e (procEventoCTe ou eventoCTe)? */
export function ehEventoCte(doc: any): boolean {
  const nome = String(doc?.documentElement?.localName || doc?.documentElement?.nodeName || '').toLowerCase();
  return nome === 'proceventocte' || nome === 'eventocte';
}

function grupoCredito(el: any): { pct: string; valor: number | null } | null {
  return el ? { pct: getText(el, 'pCredPres'), valor: num(getText(el, 'vCredPres')) } : null;
}

/** Lê o evento (cancelamento, CC-e, apropriação de crédito presumido...) com busca profunda, tanto em procEventoCTe quanto em eventoCTe. */
export function lerEventoCte(doc: any): EventoCteLido {
  const root = doc?.documentElement;
  const nomeRaiz = String(root?.localName || '').toLowerCase();
  const eventoEl = nomeRaiz === 'eventocte' ? root : getFirstDeep(root, 'eventoCTe');
  const infEvento = getFirst(eventoEl, 'infEvento');
  const retorno = getFirstDeep(root, 'retEventoCTe');
  const infRetorno = getFirst(retorno, 'infEvento');

  const tpEvento = getText(infEvento, 'tpEvento') || getText(infRetorno, 'tpEvento');
  const cStat = getText(infRetorno, 'cStat');
  const detalhe = getFirst(infEvento, 'detEvento');
  const apropriacaoEl = getFirstDeep(detalhe, 'evApropriaCredPres');

  return {
    chave: getText(infEvento, 'chCTe') || getText(infRetorno, 'chCTe'),
    tpEvento,
    descEvento: getTextDeep(detalhe, 'descEvento'),
    cStat,
    xMotivo: getText(infRetorno, 'xMotivo'),
    nProt: getText(infRetorno, 'nProt'),
    processado: cStat === '135' || cStat === '136',
    apropriacao:
      tpEvento === TP_EVENTO_APROPRIACAO_CRED_PRES && apropriacaoEl
        ? {
            vBC: num(getText(apropriacaoEl, 'vBCCredPres')),
            cCredPres: getText(apropriacaoEl, 'cCredPres'),
            ibs: grupoCredito(getFirst(apropriacaoEl, 'gIBSCredPres')),
            cbs: grupoCredito(getFirst(apropriacaoEl, 'gCBSCredPres')),
          }
        : null,
  };
}

/** CNPJ/CPF normalizado do emitente e do tomador, para casar com o cadastro de empresas. */
export function documentosNormalizadosCte(c: CteLido): { emitente: string; tomador: string } {
  return { emitente: normalizeCnpj(c.emitente.doc), tomador: normalizeCnpj(c.tomador.doc) };
}
