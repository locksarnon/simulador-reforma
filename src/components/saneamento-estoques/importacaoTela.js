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

/**
 * Tratamento para itens sem data de última movimentação: escolha obrigatória em toda importação (nada pré-selecionado) e editável em
 * Fase 1 > 1.1 Dados do projeto. O servidor guarda em `parametros.semDataMovimentacao` e recusa a importação sem ela.
 */
export const TRATAMENTOS_SEM_DATA = [
  { valor: "SEM_MOVIMENTACAO", rotulo: "Considerar sem movimentação", ajuda: "Entram no corte de movimentação como itens parados: sem saldo, propõe inativar; com saldo, pede regularizar o saldo antes." },
  { valor: "DEPOIS", rotulo: "Deixar para tratar depois", ajuda: "Ficam fora do corte, pendentes: cada item vira um caso \"Sem data de movimentação\" na Qualidade, tratado à parte." },
];
export const rotuloTratamentoSemData = (v) => TRATAMENTOS_SEM_DATA.find((t) => t.valor === v)?.rotulo || "";
export const MENSAGEM_SEM_TRATAMENTO = "Escolha o tratamento para itens sem data de última movimentação (em Colunas do arquivo, na linha Última movimentação) para continuar.";

/** Quantos itens do arquivo estão sem data, em texto para a prévia (null quando a prévia não informa). */
export function textoItensSemData(previa) {
  const s = previa?.semDataMovimentacao;
  if (!s || s.itens == null) return null;
  const n = Number(s.itens);
  if (!s.colunaMapeada) return `Sem coluna de última movimentação: todos os ${n.toLocaleString("pt-BR")} item(ns) do arquivo ficam sem data.`;
  return n ? `${n.toLocaleString("pt-BR")} item(ns) do arquivo sem data de última movimentação.` : "Todos os itens do arquivo têm data de última movimentação (a escolha vale se algum ficar sem data).";
}

/** Linha do relatório da importação confirmada: o tratamento escolhido e quantos itens ele alcançou. */
export function textoTratamentoNaImportacao(s) {
  if (!s?.tratamento) return "";
  const n = Number(s.itens || 0);
  const base = `Itens sem data de última movimentação (${n.toLocaleString("pt-BR")}): ${rotuloTratamentoSemData(s.tratamento) || s.rotulo}.`;
  return s.alterouAnalise ? `${base} O tratamento mudou: analise a Qualidade e as Duplicidades de novo.` : base;
}

/** "Considerar sem movimentação, na importação, por Fulano, em 27/11/2026 14:03" (vazio sem registro). */
export function textoDecisaoSemData(d) {
  if (!d?.tratamento) return "";
  const t = d.em ? new Date(d.em) : null;
  const quando = t && !Number.isNaN(t.getTime()) ? t.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";
  return [rotuloTratamentoSemData(d.tratamento), d.origem === "CONFIGURACAO" ? "na configuração do projeto" : "na importação", d.por ? `por ${d.por}` : "", quando ? `em ${quando}` : ""].filter(Boolean).join(", ");
}

/**
 * Por que o botão de confirmar a importação está desligado (null = pode confirmar). O tratamento dos itens sem data é obrigatório: sem ele,
 * a mensagem diz onde escolher.
 */
export function bloqueioDaConfirmacao({ podeImportar = true, semData, ocupado = false, faltam = [], mapeamentoPendente = false, aceitas = 0 }) {
  if (!podeImportar) return "Sem permissão para importar.";
  if (!semData) return MENSAGEM_SEM_TRATAMENTO;
  if (faltam.length) return `Escolha a coluna de: ${faltam.join(", ")}.`;
  if (mapeamentoPendente) return "O mapeamento foi corrigido: atualize a prévia antes de confirmar.";
  if (!aceitas) return "Nenhuma linha aceita para importar.";
  if (ocupado) return "Aguarde a operação em andamento.";
  return null;
}
