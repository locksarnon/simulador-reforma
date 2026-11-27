/**
 * Similaridade de um caso (0 a 100) lida da evidência: Duplicidades ("Similaridade (pontuação, não é probabilidade)"; casos antigos traziam
 * "Pontuação de similaridade" de 0 a 1) e Grupos ("Similaridade com o grupo"). Sem a evidência: null. É uma pontuação, não uma probabilidade.
 */
export function similaridadeDoCaso(evidencia: unknown): number | null {
  if (!Array.isArray(evidencia)) return null;
  for (const e of evidencia as { rotulo?: unknown; valor?: unknown }[]) {
    const r = String(e?.rotulo ?? '').toLowerCase();
    if (!r.startsWith('similaridade') && !r.startsWith('pontuação de similaridade')) continue;
    const t = String(e?.valor ?? '').replace(',', '.');
    const n = Number(t.replace('%', '').trim());
    if (!Number.isFinite(n)) continue;
    const v = t.includes('%') ? n : n <= 1 ? n * 100 : n;
    return Math.max(0, Math.min(100, Math.round(v)));
  }
  return null;
}
