/**
 * Regras puras do Cadastro de ERPs. Espelho de src/lib/erps.js (o teste logica.test.ts confere que as duas associam igual).
 */
export const TIPOS_CONHECIMENTO = ['COLUNA_EXPORT', 'CONSULTA_EXTRACAO', 'RESTRICAO', 'ACAO_NO_ERP', 'MODELO_CARGA', 'OBSERVACAO'] as const;
export type TipoConhecimento = (typeof TIPOS_CONHECIMENTO)[number];
export const SITUACOES_ERP = ['COMPLETO', 'PARCIAL', 'A_DESENVOLVER'] as const;
export type SituacaoErp = (typeof SITUACOES_ERP)[number];
export const GRAUS = ['CONFIRMADO', 'NAO_CONFIRMADO'] as const;
export type GrauErp = (typeof GRAUS)[number];

export type ErpBasico = { id: string; nome: string; fabricante?: string | null; produto?: string | null; situacao?: string; ativo?: boolean };
export type ItemConhecimento = {
  id: string; tipo: string; tipo_ajuste: string | null; chave: string; texto: string; campo_erp: string | null; fonte_url: string | null; grau: string; ordem: number; ativo: boolean;
};
/** O ERP com o conhecimento ativo (o que as telas usam). */
export type PerfilErp = ErpBasico & { situacao: string; itens: ItemConhecimento[] };

/** Nome normalizado: sem acento, minúsculo, só letras e números separados por um espaço. */
export function normalizarNome(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Formas do nome que identificam o ERP: o nome, sem o parêntese, sem o fabricante, sem a palavra "erp", o produto e fabricante + produto. */
export function formasDoNome(e: ErpBasico): Set<string> {
  const f = new Set<string>();
  const fab = normalizarNome(e.fabricante);
  const add = (s: string) => { const n = normalizarNome(s); if (n) f.add(n); };
  const nome = normalizarNome(e.nome);
  const semParentese = normalizarNome(String(e.nome ?? '').replace(/\([^)]*\)/g, ' '));
  for (const base of [nome, semParentese]) {
    add(base);
    if (fab && base.startsWith(`${fab} `)) add(base.slice(fab.length + 1));
    add(base.replace(/\berp\b/g, ' '));
  }
  if (e.produto) {
    const prod = normalizarNome(String(e.produto).replace(/\([^)]*\)/g, ' '));
    add(prod);
    if (fab) add(`${fab} ${prod}`);
  }
  return f;
}

/**
 * Associa um texto antigo ao ERP do cadastro: casa quando o texto normalizado é uma das formas do nome de UM só ERP ativo.
 * Nenhum ou mais de um = não identificado (fica o texto, com o aviso para selecionar na lista).
 */
export function associarErp(texto: unknown, erps: ErpBasico[]): ErpBasico | null {
  const t = normalizarNome(texto);
  if (!t) return null;
  const achados = erps.filter((e) => e.ativo !== false && formasDoNome(e).has(t));
  return achados.length === 1 ? achados[0] : null;
}

/** Perfil com conhecimento específico? A_DESENVOLVER (e o "Outro ERP") usa só as regras gerais, sem alertas específicos. */
export const perfilEspecifico = (p: PerfilErp | null | undefined): p is PerfilErp => !!p && p.situacao !== 'A_DESENVOLVER' && p.ativo !== false;

const ativos = (p: PerfilErp | null | undefined, tipo: TipoConhecimento) => (perfilEspecifico(p) ? p.itens.filter((i) => i.ativo !== false && i.tipo === tipo).sort((a, b) => a.ordem - b.ordem) : []);

/** Restrições do ERP para os tipos de ajuste (só as ligadas a um tipo; as gerais ficam na ficha do ERP). */
export function restricoesDoTipo(p: PerfilErp | null | undefined, tipos: string[]): ItemConhecimento[] {
  const s = new Set(tipos);
  return ativos(p, 'RESTRICAO').filter((i) => i.tipo_ajuste && s.has(i.tipo_ajuste));
}

/** Texto da "Ação no ERP" para o tipo de ajuste, com {sai} e {fica} trocados pelos códigos; null = sem texto específico. */
export function acaoNoErp(p: PerfilErp | null | undefined, tipo: string, codigos: { sai?: string; fica?: string } = {}): string | null {
  const i = ativos(p, 'ACAO_NO_ERP').find((x) => x.tipo_ajuste === tipo);
  if (!i) return null;
  return i.texto.replace(/\{sai\}/g, codigos.sai ?? '').replace(/\{fica\}/g, codigos.fica ?? '').trim();
}

/** Colunas do export por campo do saneamento (COLUNA_EXPORT: chave = campo, campo_erp = cabeçalho). */
export function colunasDoExport(p: PerfilErp | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of ativos(p, 'COLUNA_EXPORT')) if (i.campo_erp) (out[i.chave] ??= []).push(i.campo_erp);
  return out;
}

export const consultasDeExtracao = (p: PerfilErp | null | undefined) => ativos(p, 'CONSULTA_EXTRACAO');
