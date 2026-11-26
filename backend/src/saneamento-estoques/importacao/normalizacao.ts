import { lerDataMovimento } from '../../produtos/data-movimento';
import type { Finalidade } from '../tipos';
import type { SemanticaAtivo } from './tipos';

/** Texto sem acento. */
export const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Minúsculo, só letras e números (para comparar cabeçalhos e valores). */
export const simplificar = (s: unknown) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const aparar = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Notação científica que o Excel grava quando "come" um código numérico longo (tem ponto decimal e expoente: 1.23457E+11). "1E5" puro não entra. */
const CIENTIFICA_EXCEL = /^[+-]?\d+[.,]\d+[eE][+-]?\d+$/;

export type Normalizado = { valor: string; problema?: 'CIENTIFICA' };

/**
 * Código como TEXTO: zeros à esquerda e letras preservados. Só tira espaços e o ".0" que ferramentas põem ao ler inteiros
 * ("123.0" -> "123"). Nunca vira número: "1E5" continua "1E5". Notação científica com ponto ("1.2E+11") fica como veio e é sinalizada.
 */
export function normalizarCodigo(bruto: unknown): Normalizado {
  let t = aparar(bruto);
  if (/^\d+[.,]0+$/.test(t)) t = t.replace(/[.,]0+$/, '');
  if (CIENTIFICA_EXCEL.test(t)) return { valor: t, problema: 'CIENTIFICA' };
  return { valor: t };
}

export type NcmNormalizado = { valor: string | null; problema?: 'AUSENTE' | 'INVALIDO' };

/**
 * NCM como texto de 8 dígitos. Aceita "0101.21.00" e "01 01 21 00". Com 7 dígitos numa coluna que o Excel guardou como número,
 * o zero à esquerda foi perdido: recompõe. Fora disso (outro tamanho, notação científica, letras) mantém o texto e marca INVALIDO.
 */
export function normalizarNcm(bruto: unknown, colunaNumerica = false): NcmNormalizado {
  let t = aparar(bruto);
  if (!t || /^0*$/.test(t.replace(/[.\-\s]/g, ''))) return { valor: null, problema: 'AUSENTE' };
  if (/^\d+[.,]0+$/.test(t)) t = t.replace(/[.,]0+$/, '');
  if (!/^[\d.\-\s]+$/.test(t)) return { valor: t, problema: 'INVALIDO' }; // letras ou notação científica
  let d = t.replace(/\D/g, '');
  if (d.length === 7 && colunaNumerica) d = '0' + d;
  return d.length === 8 ? { valor: d } : { valor: d, problema: 'INVALIDO' };
}

/**
 * Número em formato brasileiro ou americano. "1.234,56" e "1,234.56" -> 1234.56; "1234,56" e "1234.56" -> 1234.56;
 * "1.234" (um ponto, três casas, sem vírgula) -> 1234 e "1,234" -> 1.234 (costume brasileiro, o mesmo do saneamento atual; se a coluna é numérica
 * de verdade, `colunaNumerica`, o ponto é decimal). "12-" (sinal no fim, SAP) e "(12)" são negativos. Vazio ou texto -> null.
 */
export function lerNumero(bruto: unknown, colunaNumerica = false): number | null {
  let t = aparar(bruto).replace(/^R\$\s*/i, '');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
  if (t.endsWith('-')) { neg = !neg; t = t.slice(0, -1).trim(); }
  if (t.startsWith('-')) { neg = !neg; t = t.slice(1).trim(); } else if (t.startsWith('+')) t = t.slice(1).trim();
  if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(t)) { const n = Number(t); return Number.isFinite(n) ? (neg ? -n : n) : null; }
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const pontos = (t.match(/\./g) || []).length; const virgulas = (t.match(/,/g) || []).length;
  let s: string;
  if (pontos && virgulas) {
    const decimal = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
    const milhar = decimal === '.' ? ',' : '.';
    if (t.split(decimal).length > 2) return null;
    s = t.split(milhar).join('').replace(decimal, '.');
  } else if (virgulas) {
    if (virgulas > 1 && !/^\d{1,3}(,\d{3})+$/.test(t)) return null; // várias vírgulas = milhar americano
    s = virgulas === 1 ? t.replace(',', '.') : t.replace(/,/g, '');
  } else if (pontos) {
    if (pontos > 1) { if (!/^\d{1,3}(\.\d{3})+$/.test(t)) return null; s = t.replace(/\./g, ''); }
    else s = !colunaNumerica && /^\d{1,3}\.\d{3}$/.test(t) ? t.replace('.', '') : t;
  } else s = t;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n === 0 ? 0 : neg ? -n : n;
}

/** Data de uma célula -> yyyy-mm-dd. `invalida` quando há texto que não é data. Vazio e "00/00/0000" = sem data. */
export function lerData(bruto: unknown, hoje: Date = new Date()): { data: string | null; invalida: boolean } {
  const t = aparar(bruto);
  // Serial do Excel (dias desde 30/12/1899), com ou sem fração: 32874 = 01/01/1990
  const serial = /^(\d{5})(?:[.,]\d+)?$/.exec(t);
  if (serial) {
    const n = Number(serial[1]);
    if (n >= 32874 && n <= 80000) return lerDataMovimento(new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10), hoje);
    return { data: null, invalida: true };
  }
  // dd/mm/aa
  const curta = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})(?:\s.*)?$/.exec(t);
  if (curta) {
    const aa = Number(curta[3]);
    return lerDataMovimento(`${curta[1]}/${curta[2]}/${aa >= 70 ? 1900 + aa : 2000 + aa}`, hoje);
  }
  return lerDataMovimento(t, hoje);
}

const RELATIVO_SIM = new Set(['s', 'sim', 'y', 'yes', 'true', 't', '1', 'tyes', 'x', 'v', 'verdadeiro']);
const RELATIVO_NAO = new Set(['n', 'nao', 'no', 'false', 'f', '0', 'tno', 'falso']);
const ABS_ATIVO = new Set(['ativo', 'ativa', 'ativado', 'liberado', 'habilitado', 'active']);
const ABS_INATIVO = new Set(['inativo', 'inativa', 'bloqueado', 'bloqueada', 'obsoleto', 'desativado', 'desabilitado', 'inactive', 'blocked']);

/**
 * Valor da coluna de situação -> item ativo? S/N, Y/N, tYES/tNO, 1/0 valem conforme a coluna (`semantica`: em "Bloqueado"/"Inativo"
 * o S significa NÃO ativo). Palavras de estado ("ativo", "inativo", "bloqueado") valem por si. Vazio ou desconhecido -> null.
 */
export function lerAtivo(bruto: unknown, semantica: SemanticaAtivo = 'ATIVO'): boolean | null {
  const t = simplificar(bruto);
  if (!t) return null;
  if (ABS_ATIVO.has(t)) return true;
  if (ABS_INATIVO.has(t)) return false;
  let v: boolean | null = null;
  if (RELATIVO_SIM.has(t)) v = true; else if (RELATIVO_NAO.has(t)) v = false;
  if (v === null) return null;
  return semantica === 'BLOQUEADO' ? !v : v;
}

/** Lista fechada do contrato (../tipos FINALIDADES), repetida aqui só como tipo: o compilador acusa se o contrato mudar. */
const FINALIDADES: readonly Finalidade[] = ['REVENDA', 'MATERIA_PRIMA', 'INSUMO_PRODUCAO', 'EMBALAGEM', 'USO_CONSUMO', 'MANUTENCAO', 'IMOBILIZADO', 'MATERIAL_TERCEIROS'];
const SINONIMOS_FINALIDADE: [Finalidade, string[]][] = [
  ['MATERIA_PRIMA', ['materiaprima', 'mp']],
  ['INSUMO_PRODUCAO', ['insumodeproducao', 'insumoproducao', 'insumo', 'insumos']],
  ['MATERIAL_TERCEIROS', ['materialdeterceiros', 'materialterceiros', 'terceiros']],
  ['USO_CONSUMO', ['usoeconsumo', 'usoconsumo', 'consumo', 'uc']],
  ['REVENDA', ['revenda', 'mercadoriaparaorevenda', 'mercadoriaparrevenda', 'comercializacao']],
  ['EMBALAGEM', ['embalagem', 'embalagens']],
  ['MANUTENCAO', ['manutencao']],
  ['IMOBILIZADO', ['imobilizado', 'ativoimobilizado', 'ativofixo']],
];
/** Finalidade da planilha -> valor da lista fechada (aceita o nome da lista e sinônimos comuns). null quando não reconhece. */
export function lerFinalidade(bruto: unknown): Finalidade | null {
  const t = simplificar(bruto);
  if (!t) return null;
  for (const f of FINALIDADES) if (simplificar(f) === t) return f;
  for (const [f, lista] of SINONIMOS_FINALIDADE) if (lista.includes(t)) return f;
  return null;
}

/** Texto livre (descrição, grupo, fabricante...): tira espaços repetidos; vazio vira null. */
export function textoOuNulo(bruto: unknown): string | null {
  const t = aparar(bruto);
  return t || null;
}

/** Estabelecimento para a chave: sem acento, maiúsculo, espaços únicos. */
export function normalizarEstabelecimento(bruto: unknown): string {
  return aparar(semAcento(bruto)).toUpperCase();
}

/**
 * CHAVE de reconciliação = estabelecimento normalizado + código normalizado (maiúsculo, espaços únicos, zeros preservados).
 * Formato `<tamanho do estabelecimento>:<estabelecimento>|<código>`: sem ambiguidade e legível ("0:|00123", "3:FIL|00123").
 */
export function chaveReconciliacao(estabelecimento: unknown, codigo: unknown): string {
  const e = normalizarEstabelecimento(estabelecimento);
  const c = aparar(semAcento(codigo)).toUpperCase();
  return `${e.length}:${e}|${c}`;
}
