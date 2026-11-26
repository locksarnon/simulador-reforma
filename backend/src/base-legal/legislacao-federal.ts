/**
 * Descoberta de atos federais novos pela API de dados abertos da legislação do Senado Federal (fonte oficial, domínio .leg.br):
 * lista por tipo e ano com número, data e ementa. A ementa diz quais normas o ato altera, revoga ou regulamenta, o que permite
 * avisar a equipe no mesmo dia em que a lei é publicada, antes de o texto compilado do Planalto ser atualizado. Funções puras.
 */
import { urlProvavelDoAto } from './base-legal.deteccao';
import { atosDoTexto, type AtoNormativo } from './marcas';

export const TIPOS_FEDERAIS = ['LCP', 'EMC', 'MPV', 'LEI', 'DEC'] as const;
export type TipoFederal = (typeof TIPOS_FEDERAIS)[number];

const API_SENADO = 'https://legis.senado.leg.br/dadosabertos/legislacao/lista';
export const urlListaFederal = (tipo: string, ano: number) => `${API_SENADO}?tipo=${encodeURIComponent(tipo)}&ano=${ano}`;

const TIPO_ATO: Record<string, { abrev: string; nome: string }> = {
  LCP: { abrev: 'LC', nome: 'Lei Complementar' },
  EMC: { abrev: 'EC', nome: 'Emenda Constitucional' },
  MPV: { abrev: 'MP', nome: 'Medida Provisória' },
  LEI: { abrev: 'Lei', nome: 'Lei' },
  DEC: { abrev: 'Decreto', nome: 'Decreto' },
  DEL: { abrev: 'Decreto-Lei', nome: 'Decreto-Lei' },
};

export type AtoFederal = {
  id: string;
  /** LCP | EMC | MPV | LEI | DEC | DEL */
  tipo: string;
  /** "Lei Complementar nº 239 de 24/11/2026" */
  nome: string;
  numero: string;
  ano: number;
  data: Date | null;
  /** "LC 239/2026" */
  rotulo: string;
  /** "lc 239/2026" (igual ao que o leitor das normas usa para comparar atos) */
  referencia: string;
  ementa: string;
  url_senado: string;
  /** Endereço provável do texto no Planalto (conferido antes de cadastrar). */
  url_planalto: string | null;
};

type DocumentoSenado = { id?: unknown; numero?: unknown; norma?: unknown; normaNome?: unknown; ementa?: unknown; dataassinatura?: unknown; anoassinatura?: unknown };

function dataBr(s: unknown): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Lê a resposta JSON da API de listagem. Aceita lista vazia, um único documento (a API não faz array nesse caso) e lixo. */
export function lerListaFederal(corpo: unknown, agora = new Date()): AtoFederal[] {
  const bruto = (corpo as { ListaDocumento?: { documentos?: { documento?: unknown } } } | null)?.ListaDocumento?.documentos?.documento;
  const lista: DocumentoSenado[] = Array.isArray(bruto) ? bruto : bruto && typeof bruto === 'object' ? [bruto as DocumentoSenado] : [];
  const saida: AtoFederal[] = [];
  const vistos = new Set<string>();
  for (const d of lista) {
    const partes = String(d.norma ?? '').split('-');
    const tipo = partes[0]?.toUpperCase();
    const info = TIPO_ATO[tipo];
    const numero = String(d.numero ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const ano = Number(d.anoassinatura ?? partes[2]);
    if (!info || !numero || !Number.isInteger(ano) || ano < 1800 || ano > 2200) continue;
    const rotulo = `${info.abrev} ${numero}/${ano}`;
    const referencia = rotulo.toLowerCase();
    if (vistos.has(referencia)) continue;
    vistos.add(referencia);
    let data = dataBr(d.dataassinatura);
    // Data no futuro é erro da fonte: não serve para decidir o que é recente.
    if (data && data.getTime() > agora.getTime() + 36 * 3_600_000) data = null;
    const id = String(d.id ?? '').replace(/\D/g, '');
    saida.push({
      id, tipo, nome: String(d.normaNome ?? rotulo).slice(0, 160), numero, ano, data, rotulo, referencia,
      ementa: String(d.ementa ?? '').replace(/\s+/g, ' ').trim().slice(0, 1500),
      url_senado: id ? `https://legis.senado.leg.br/norma/${id}` : `${API_SENADO}?tipo=${tipo}&ano=${ano}&numero=${numero}`,
      url_planalto: urlProvavelDoAto(referencia),
    });
  }
  return saida;
}

/** Anos a consultar: o corrente e, em janeiro, o anterior (atos assinados no fim de dezembro entram no cadastro depois). */
export const anosDaConsulta = (hoje = new Date()): number[] => {
  const ano = hoje.getUTCFullYear();
  return hoje.getUTCMonth() === 0 ? [ano, ano - 1] : [ano];
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Atos que não mudam regra tributária: crédito orçamentário, homenagens, nomes de obras e outras formalidades. */
const SEM_INTERESSE = /^\s*(?:abre|autoriza a abertura de)\b[^.]{0,200}\bcredito|\bcredito\s+(?:suplementar|extraordinario|especial)\b|^\s*(?:confere|concede)\b.{0,80}\b(?:titulo|medalha|honraria|condecoracao)|^\s*denomina\b|^\s*da (?:o )?nome\b|^\s*institui o dia\b|^\s*inscreve\b.{0,80}\blivro|\bmedalha\b|^\s*promulga\b|^\s*autoriza\b.{0,40}\b(?:nomeacao|contratacao|aumento de capital|provimento)|\bcandidatos? aprovados?\b|\bconcurso publico\b/;

const TRIBUTARIO = /\b(?:tribut\w*|impost\w*|contribuic\w*|ibs|cbs|ipi|icms|iss|issqn|irpj|irpf|csll|pis|pasep|cofins|iof|itr|simples nacional|mei|aduaneir\w*|receita federal|comite gestor|credito presumido|substituicao tribut\w*|isencao|isencoes|drawback|zona franca|split payment|aliquota\w*|renuncia de receita|beneficio\w* fiscal\w*|nota fiscal|documento fiscal)\b/;

/** Tributos de peso para o trabalho da FAL: lei ou decreto que falem deles são carregados mesmo sem citar norma da base. */
const TRIBUTO_FORTE = /\b(?:ibs|cbs|imposto seletivo|comite gestor|reforma tributaria|split payment|credito presumido|simples nacional|icms|iss|issqn|ipi|irpj|csll|cofins|pis|pasep)\b/;

/** Termos que levam o ato para o grupo "Reforma do consumo". */
const REFORMA = /\b(?:ibs|cbs|imposto seletivo|reforma tributaria|comite gestor|cgibs|split payment|credito presumido)\b/;

export type EfeitoDoAto = 'alteracao' | 'revogacao' | 'regulamentacao' | 'aplicacao' | 'nova_norma';

export type RelevanciaDoAto = {
  relevante: boolean;
  motivo: 'cita_norma' | 'tema_tributario' | null;
  /** Normas já carregadas na base que a ementa cita. */
  normas: AtoNormativo[];
  efeito: EfeitoDoAto;
  /** Bloco da base em que o ato entra se for cadastrado. */
  grupo: 'reforma' | 'federal';
};

/** Primeiro verbo da ementa: o que o ato faz com as normas que cita. */
export function efeitoDaEmenta(ementa: string): EfeitoDoAto {
  const t = semAcento(ementa).trim();
  if (/^revoga/.test(t)) return 'revogacao';
  if (/^(?:altera|acrescenta|inclui|modifica|da nova redacao|insere|suprime|prorroga|restabelece)/.test(t)) return 'alteracao';
  if (/\bregulamenta|\bregulamentacao\b/.test(t)) return 'regulamentacao';
  if (/\b(?:altera|alteram|acrescenta|modifica)\b/.test(t)) return 'alteracao';
  if (/\brevoga(?:m)?\b/.test(t)) return 'revogacao';
  return 'aplicacao';
}

/**
 * O texto do ato deve ser cadastrado na base sozinho? Sim se cita norma da base. Se só trata de tributo: leis complementares,
 * emendas e medidas provisórias sempre; lei e decreto só quando falam de tributo de peso (IBS, CBS, ICMS, ISS, IPI, IRPJ, PIS, Cofins...).
 */
export function deveCarregarTexto(ato: Pick<AtoFederal, 'tipo' | 'ementa'>, relevancia: RelevanciaDoAto): boolean {
  if (!relevancia.relevante) return false;
  if (relevancia.motivo === 'cita_norma') return true;
  return ato.tipo === 'LCP' || ato.tipo === 'EMC' || ato.tipo === 'MPV' || TRIBUTO_FORTE.test(semAcento(ato.ementa));
}

/** O ato interessa à base? Interessa se cita uma norma já carregada ou se trata de tributo, e não é formalidade (crédito orçamentário, homenagem). */
export function relevanciaDoAto(ato: Pick<AtoFederal, 'ementa' | 'referencia'>, carregadas: ReadonlySet<string>): RelevanciaDoAto {
  const t = semAcento(ato.ementa);
  const nada: RelevanciaDoAto = { relevante: false, motivo: null, normas: [], efeito: 'aplicacao', grupo: 'federal' };
  if (!t || SEM_INTERESSE.test(t)) return nada;
  const normas = atosDoTexto(ato.ementa).filter((a) => a.referencia !== ato.referencia && carregadas.has(a.referencia));
  const grupo = REFORMA.test(t) ? 'reforma' : 'federal';
  if (normas.length) return { relevante: true, motivo: 'cita_norma', normas, efeito: efeitoDaEmenta(ato.ementa), grupo };
  if (TRIBUTARIO.test(t)) return { relevante: true, motivo: 'tema_tributario', normas: [], efeito: 'nova_norma', grupo };
  return nada;
}

/** Ordem de prioridade para cadastrar o texto (poucos por semana): leis complementares e emendas antes, depois MP, lei e decreto; os mais novos primeiro. */
const PESO_TIPO: Record<string, number> = { EMC: 0, LCP: 1, MPV: 2, LEI: 3, DEL: 4, DEC: 5 };
export const porPrioridade = (a: AtoFederal, b: AtoFederal): number =>
  (PESO_TIPO[a.tipo] ?? 9) - (PESO_TIPO[b.tipo] ?? 9) || (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0);

/**
 * Atos novos desde a última leitura. Na primeira leitura (sem lista anterior) só valem os assinados nos últimos `diasBase` dias;
 * os mais antigos entram só como ponto de partida, sem virar aviso.
 */
export function atosNovos(atuais: AtoFederal[], anteriores: ReadonlySet<string> | null, hoje = new Date(), diasBase = 45): AtoFederal[] {
  if (anteriores) return atuais.filter((a) => !anteriores.has(a.url_senado));
  const corte = hoje.getTime() - diasBase * 86_400_000;
  return atuais.filter((a) => (a.data?.getTime() ?? 0) >= corte);
}
