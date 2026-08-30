/**
 * Escolhe, entre várias linhas de catálogo com o mesmo código (ex: duas
 * versões históricas do mesmo cClassTrib), a que estava vigente numa data
 * — em vez de simplesmente pegar "a que existir" (comportamento anterior,
 * que não tinha como diferenciar uma regra revogada de uma vigente quando
 * havia mais de uma linha para o mesmo código).
 *
 * vigencia_inicio nulo = vigente desde sempre. vigencia_fim nulo = vigente
 * até hoje, sem previsão de fim.
 */
export type ComVigencia = {
  vigencia_inicio?: Date | string | null;
  vigencia_fim?: Date | string | null;
};

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

export function estaVigente(row: ComVigencia, data: Date): boolean {
  const inicio = toDate(row.vigencia_inicio);
  const fim = toDate(row.vigencia_fim);
  if (inicio && data < inicio) return false;
  if (fim && data > fim) return false;
  return true;
}

/**
 * Entre as linhas vigentes na data, prefere a de vigencia_inicio mais
 * recente (a regra mais nova que já valia naquele momento) — desempate por
 * updatedAt mais recente para linhas sem vigencia_inicio informado.
 */
export function escolherVigente<T extends ComVigencia & { updatedAt?: Date }>(
  rows: T[],
  data: Date,
): T | undefined {
  const candidatas = rows.filter((r) => estaVigente(r, data));
  if (candidatas.length === 0) return undefined;
  return candidatas.sort((a, b) => {
    const ai = toDate(a.vigencia_inicio)?.getTime() ?? -Infinity;
    const bi = toDate(b.vigencia_inicio)?.getTime() ?? -Infinity;
    if (bi !== ai) return bi - ai;
    const au = a.updatedAt?.getTime() ?? 0;
    const bu = b.updatedAt?.getTime() ?? 0;
    return bu - au;
  })[0];
}

/** Agrupa uma lista de linhas de catálogo por código, para consulta por escolherVigente. */
export function agruparPorCodigo<T>(rows: T[], codigo: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const key = codigo(r);
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }
  return map;
}
