/** 0,076 → "7,6" (até 4 casas, sem zeros sobrando, vírgula decimal). */
export function fracaoParaTexto(fracao) {
  const n = Number(fracao);
  if (!Number.isFinite(n) || n === 0) return "0";
  return (Math.round(n * 100 * 10000) / 10000).toString().replace(".", ",");
}

/** "7,60" ou "7.6" → 0.076 (arredondado para não carregar erro de ponto flutuante). */
export function textoParaFracao(texto) {
  const limpo = String(texto).replace(",", ".").replace(/[^0-9.]/g, "");
  if (limpo === "" || limpo === ".") return 0;
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round((n / 100) * 1e8) / 1e8 : 0;
}
