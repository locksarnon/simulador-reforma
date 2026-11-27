/**
 * CFOP oficial (Convênio s/nº de 15/12/1970, Anexo II, redação do Ajuste SINIEF 03/24) com grupo e natureza agrupada.
 * O código e a descrição são oficiais (cfop-dados.ts, gerado do texto do CONFAZ). A natureza agrupada é DERIVADA (não é oficial),
 * pela regra documentada em `naturezaDoCfop` e em docs/tabelas-oficiais-fase2.md.
 */
import { CFOP_OFICIAL, LinhaCfopOficial } from './cfop-dados';
import { FONTE_CFOP, FonteOficial } from './fontes';

export { CFOP_OFICIAL };
export type { LinhaCfopOficial };
export const FONTE_TABELA_CFOP: FonteOficial = FONTE_CFOP;

export const GRUPOS_CFOP = ['1', '2', '3', '5', '6', '7'] as const;
export type GrupoCfop = (typeof GRUPOS_CFOP)[number];
export const ROTULO_GRUPO_CFOP: Record<GrupoCfop, string> = {
  '1': 'Entradas do Estado',
  '2': 'Entradas de outros Estados',
  '3': 'Entradas do Exterior',
  '5': 'Saídas para o Estado',
  '6': 'Saídas para outros Estados',
  '7': 'Saídas para o Exterior',
};

export const NATUREZAS_CFOP = ['COMPRA', 'VENDA', 'TRANSFERENCIA', 'DEVOLUCAO', 'REMESSA', 'RETORNO', 'OUTRAS'] as const;
export type NaturezaCfop = (typeof NATUREZAS_CFOP)[number];
export const ROTULO_NATUREZA_CFOP: Record<NaturezaCfop, string> = {
  COMPRA: 'Compra', VENDA: 'Venda', TRANSFERENCIA: 'Transferência', DEVOLUCAO: 'Devolução', REMESSA: 'Remessa', RETORNO: 'Retorno', OUTRAS: 'Outras',
};

export type Cfop = {
  /** 4 dígitos, sem ponto (ex.: "5102"). */
  codigo: string;
  descricao: string;
  /** Nota explicativa oficial ("Classificam-se neste código..."). */
  nota: string | null;
  grupo: GrupoCfop;
  sentido: 'ENTRADA' | 'SAIDA';
  natureza: NaturezaCfop;
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Prefixos que só introduzem a operação; a regra olha o que vem depois. */
const PREFIXOS_NEUTROS = ['entrada decorrente de ', 'lancamento efetuado a titulo de '];

const REGRAS_NATUREZA: readonly [string[], NaturezaCfop][] = [
  [['devolucao'], 'DEVOLUCAO'],
  [['retorno'], 'RETORNO'],
  [['transferencia'], 'TRANSFERENCIA'],
  [['compra', 'aquisicao'], 'COMPRA'],
  [['venda', 'prestacao'], 'VENDA'],
  [['remessa'], 'REMESSA'],
];

/**
 * Natureza agrupada (regra derivada, não oficial), aplicada à descrição oficial do CFOP:
 * 1. normaliza (minúsculas, sem acento) e retira os prefixos "Entrada decorrente de" e "Lançamento efetuado a título de";
 * 2. classifica pela PRIMEIRA palavra: Devolução → DEVOLUCAO; Retorno → RETORNO; Transferência → TRANSFERENCIA;
 *    Compra/Aquisição → COMPRA; Venda/Prestação → VENDA; Remessa → REMESSA;
 * 3. o resto (Entrada de..., Anulação..., Industrialização..., Outra entrada/saída..., Exportação..., Fixação de preço..., etc.) → OUTRAS.
 */
export function naturezaDoCfop(descricao: string): NaturezaCfop {
  let d = semAcento(descricao);
  for (const p of PREFIXOS_NEUTROS) if (d.startsWith(p)) d = d.slice(p.length);
  for (const [inicios, natureza] of REGRAS_NATUREZA) if (inicios.some((i) => d.startsWith(i))) return natureza;
  return 'OUTRAS';
}

function montar(l: LinhaCfopOficial): Cfop {
  const grupo = l.codigo[0] as GrupoCfop;
  return {
    codigo: l.codigo, descricao: l.descricao, nota: l.nota, grupo,
    sentido: grupo <= '3' ? 'ENTRADA' : 'SAIDA', natureza: naturezaDoCfop(l.descricao),
  };
}

/** Só os códigos de lançamento (sem os títulos de grupo x.000, x.y00 e x.y50). */
export const CFOPS: readonly Cfop[] = CFOP_OFICIAL.filter((l) => !l.titulo).map(montar);
/** Títulos de grupo (servem para agrupar a lista na tela). */
export const TITULOS_CFOP: readonly LinhaCfopOficial[] = CFOP_OFICIAL.filter((l) => l.titulo);

const POR_CODIGO = new Map(CFOPS.map((c) => [c.codigo, c]));

/** Aceita "5102", "5.102" ou " 5.102 ". */
export function normalizarCfop(codigo: string): string {
  return String(codigo ?? '').replace(/\D/g, '');
}

export function cfop(codigo: string): Cfop | null {
  return POR_CODIGO.get(normalizarCfop(codigo)) ?? null;
}

export function ehCfopValido(codigo: string): boolean {
  return POR_CODIGO.has(normalizarCfop(codigo));
}

export function cfopsDaNatureza(natureza: NaturezaCfop, grupo?: GrupoCfop): Cfop[] {
  return CFOPS.filter((c) => c.natureza === natureza && (!grupo || c.grupo === grupo));
}

/** Título de grupo ao qual o código pertence (x.y50 ou x.y00, o mais específico que existir). */
export function tituloDoCfop(codigo: string): LinhaCfopOficial | null {
  const c = normalizarCfop(codigo);
  if (c.length !== 4) return null;
  const n = Number(c);
  const candidatos = TITULOS_CFOP.filter((t) => t.codigo[0] === c[0] && Number(t.codigo) <= n && t.codigo.slice(1) !== '000');
  return candidatos.length ? candidatos[candidatos.length - 1] : null;
}
