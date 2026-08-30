/**
 * Porte do backend/src/importacao-xml/shared/vigencia.ts — mesma lógica,
 * usada aqui pra escolher entre versões históricas de ClassTrib/CredPres a
 * que estava vigente na data da operação, em vez de pegar "a que existir".
 */
function toDate(v) {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

export function estaVigente(row, data) {
  const inicio = toDate(row.vigencia_inicio);
  const fim = toDate(row.vigencia_fim);
  if (inicio && data < inicio) return false;
  if (fim && data > fim) return false;
  return true;
}

export function escolherVigente(rows, data) {
  const candidatas = rows.filter((r) => estaVigente(r, data));
  if (candidatas.length === 0) return undefined;
  return candidatas.sort((a, b) => {
    const ai = toDate(a.vigencia_inicio)?.getTime() ?? -Infinity;
    const bi = toDate(b.vigencia_inicio)?.getTime() ?? -Infinity;
    if (bi !== ai) return bi - ai;
    const au = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bu = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bu - au;
  })[0];
}

export function agruparPorCodigo(rows, codigo) {
  const map = new Map();
  for (const r of rows) {
    const key = codigo(r);
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }
  return map;
}
