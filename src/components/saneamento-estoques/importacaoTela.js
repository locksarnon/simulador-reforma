/**
 * Regras puras da aba Importação do Saneamento de estoques: exemplos e selo de certeza do mapeamento e o aviso do saldo em escala
 * (ERP que exporta 24 como 24.000.000). Sem React, para os testes.
 */

/** Sugestão do servidor para uma coluna do arquivo (pelo nome). */
const sugestaoDaColuna = (previa, nome) => (previa?.sugestao?.colunas || []).find((c) => c.nome === nome) || null;

/** Até 3 valores da coluna escolhida, para o consultor conferir se é a coluna certa. */
export function exemplosDaColuna(previa, nome) {
  if (!nome) return [];
  const c = sugestaoDaColuna(previa, nome);
  if (!c) return [];
  const lista = Array.isArray(c.exemplos) && c.exemplos.length ? c.exemplos : c.exemplo ? [c.exemplo] : [];
  return lista.slice(0, 3);
}

/**
 * Selo da linha do mapeamento: a certeza ("ALTA"/"MEDIA") só enquanto a coluna é a que o sistema sugeriu para o campo; trocada pelo
 * consultor, o selo some (null). "RECONHECIDA": coluna usada pelo servidor sem certeza informada.
 */
export function seloDoMapeamento(previa, campo, coluna) {
  if (!coluna) return null;
  const colunas = previa?.sugestao?.colunas || [];
  if (!colunas.length) return previa?.mapeamento?.[campo] === coluna ? "RECONHECIDA" : null;
  const sugerida = colunas.find((c) => c.campo === campo);
  return sugerida && sugerida.nome === coluna && sugerida.certeza ? sugerida.certeza : null;
}

export const fmtNumero = (n) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 6 });

/** O saldo do arquivo parece estar em escala (todo saldo com 1.000.000 ou mais, ou múltiplo de 1.000)? Devolve a escala ou null. */
export const escalaDetectada = (relatorio) => {
  const e = relatorio?.escalaSaldo;
  return e && Number(e.detectada) > 1 ? e : null;
};

/** Divisor aplicado na prévia (1 = saldo como veio): é o que a confirmação envia, para gravar exatamente o que foi visto. */
export const escalaAplicada = (relatorio) => Number(relatorio?.escalaSaldo?.aplicada) > 1 ? Number(relatorio.escalaSaldo.aplicada) : 1;

/** Texto do aviso do saldo em escala, com um exemplo do antes e depois. */
export function textoEscalaSaldo(e) {
  if (!e) return "";
  const div = fmtNumero(e.detectada);
  const exemplo = e.exemplo != null ? ` Exemplo: ${fmtNumero(e.exemplo)} vira ${fmtNumero(e.exemplo / e.detectada)}.` : "";
  const regra = Number(e.detectada) === 1e6 ? "têm 1.000.000 ou mais (nenhum entre zero e um milhão)" : `são múltiplos de ${div}`;
  const anterior = Number(e.anterior) > 1 ? ` Na importação anterior, os saldos foram divididos por ${fmtNumero(e.anterior)}.` : "";
  return `Os ${fmtNumero(e.naoNulos)} saldos não zerados da coluna "${e.coluna}" ${regra}: o ERP pode ter exportado a quantidade sem a vírgula das casas decimais.${exemplo}${anterior}`;
}

/** Linha do relatório da importação confirmada quando o saldo foi dividido. */
export const textoEscalaAplicada = (e) => (Number(e?.aplicada) > 1 ? `Saldos da coluna "${e.coluna}" divididos por ${fmtNumero(e.aplicada)}, por escolha na prévia.` : "");
