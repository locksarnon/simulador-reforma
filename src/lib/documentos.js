/** Arquivos e documentos: rótulos, cores e contas da tela. As regras ficam no servidor (backend/src/documentos). */
export const SITUACOES_DOC = {
  VENCIDO: { rotulo: "Vencido", tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  A_VENCER: { rotulo: "Vence em breve", tom: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  VALIDO: { rotulo: "Válido", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  SEM_VALIDADE: { rotulo: "Sem validade", tom: "bg-muted text-muted-foreground" },
};

/** "1,2 MB", "830 KB", "512 B". */
export function tamanhoLegivel(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Os pedaços do caminho da pasta, para as migalhas: "A/B" → [{nome:"A", pasta:"A"}, {nome:"B", pasta:"A/B"}]. */
export function trilhaDaPasta(pasta) {
  const partes = String(pasta || "").split("/").filter(Boolean);
  return partes.map((nome, i) => ({ nome, pasta: partes.slice(0, i + 1).join("/") }));
}

/** Quantos documentos em cada situação (para os cartões). */
export function contarSituacoes(docs) {
  const c = { VENCIDO: 0, A_VENCER: 0, VALIDO: 0, SEM_VALIDADE: 0 };
  for (const d of docs || []) c[d.situacao] = (c[d.situacao] || 0) + 1;
  return c;
}

/** "Expira em 6 dias" / "Expira hoje". */
export function expiraEm(data, agora = new Date()) {
  const dias = Math.ceil((new Date(data).getTime() - agora.getTime()) / 86_400_000);
  return dias <= 0 ? "Expira hoje" : dias === 1 ? "Expira amanhã" : `Expira em ${dias} dias`;
}
