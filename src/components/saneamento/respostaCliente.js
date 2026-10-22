// Fluxo de aprovação das correções de descrição: o sistema emite a lista com as sugestões, o cliente responde "OK" ou escreve ao lado
// como deve ficar, e a resposta é importada de volta como decisões. Nada é gravado no cadastro: só ficam registradas as decisões.
import { REGRAS_PADRAO, abreviacoesAprovadas, padronizarDescricao } from "./logica";

const sem = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const COLUNAS_LISTA = ["Código", "Descrição atual", "Descrição sugerida", "Resposta do cliente (OK ou deixe em branco)", "Como deve ficar (se não aceitar a sugestão)", "Observação"];

/** Linhas da lista que vai para o cliente: uma por correção sugerida (e ainda não decidida, quando só = "pendentes"). */
export function linhasListaCliente(decisoes, itens, { somentePendentes = false } = {}) {
  const porLinha = new Map(itens.map((i) => [i.linha, i]));
  const linhas = [];
  for (const [k, d] of Object.entries(decisoes || {})) {
    const [linha, crit] = k.split("|"); if (crit !== "padrao") continue;
    if (somentePendentes && d.status !== "PROP") continue;
    const it = porLinha.get(Number(linha)); if (!it) continue;
    linhas.push([it.codigo, it.descricao, d.sugerida || "", "", "", ""]);
  }
  return linhas;
}
export { COLUNAS_LISTA };

/** Interpreta a resposta do cliente: "OK"/"sim" aceita a sugestão; texto em "Como deve ficar" vale como descrição final; "não" mantém a atual. */
export function interpretarResposta(resposta, comoFica, sugerida) {
  const r = sem(resposta); const texto = String(comoFica ?? "").trim();
  if (texto && texto !== sugerida) return { status: "APR", final: texto, origemFinal: "cliente" };
  if (["ok", "sim", "s", "aceito", "deacordo", "aprovado", "x"].includes(r) || (texto && texto === sugerida)) return { status: "APR", final: sugerida, origemFinal: "sugestao" };
  if (["nao", "n", "manter", "naoaceito", "rejeitado"].includes(r)) return { status: "REJ" };
  return null; // sem resposta: continua aguardando
}

/** Aplica as respostas lidas da planilha (código, resposta, como deve ficar) sobre as decisões. Devolve as novas decisões e um resumo. */
export function aplicarRespostas(decisoes, itens, linhas, { quem, hoje, regras = REGRAS_PADRAO, abrev = {} }) {
  const porCodigo = new Map(itens.map((i) => [String(i.codigo).trim(), i]));
  const novas = { ...decisoes };
  const resumo = { aceitas: 0, ajustadas: 0, rejeitadas: 0, semResposta: 0, naoEncontradas: [] };
  for (const l of linhas) {
    const it = porCodigo.get(String(l.codigo ?? "").trim());
    if (!it) { if (String(l.codigo ?? "").trim()) resumo.naoEncontradas.push(String(l.codigo).trim()); continue; }
    const k = `${it.linha}|padrao`; const atual = novas[k];
    const sugerida = atual?.sugerida || padronizarDescricao(it.descricao, regras, abrev).sugerida;
    const res = interpretarResposta(l.resposta, l.comoFica, sugerida);
    if (!res) { resumo.semResposta++; continue; }
    novas[k] = { acao: "ENC", grupo: atual?.grupo || it.grupo_atual || "(sem grupo)", por: atual?.por || "planilha do cliente", em: atual?.em || hoje, ...atual, sugerida, ...res, decididoPor: quem, decididoEm: hoje, viaPlanilha: true };
    if (res.status === "REJ") resumo.rejeitadas++; else if (res.origemFinal === "cliente") resumo.ajustadas++; else resumo.aceitas++;
  }
  return { decisoes: novas, resumo };
}

/** CSV simples (separador ; ou ,; aspas duplas). */
export function lerCsv(texto) {
  const t = texto.replace(/^﻿/, ""); const sep = (t.split("\n")[0].match(/;/g) || []).length >= (t.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const linhas = []; let campo = ""; let linha = []; let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) { if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c; }
    else if (c === '"') aspas = true; else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; linha.push(campo); campo = ""; if (linha.some((x) => x !== "")) linhas.push(linha); linha = []; }
    else campo += c;
  }
  linha.push(campo); if (linha.some((x) => x !== "")) linhas.push(linha);
  return linhas;
}

/** Acha as colunas da planilha devolvida pelo cliente, mesmo que ele tenha mudado a ordem ou o texto do título. */
export function mapearColunasResposta(cabecalho) {
  const nomes = cabecalho.map(sem);
  const acha = (...ops) => nomes.findIndex((n) => ops.some((o) => n.includes(o)));
  const codigo = acha("codigo", "cod", "itemcode"); const resposta = acha("resposta", "ok", "aprov"); const comoFica = acha("comodeveficar", "comoficaria", "comoficar", "ficar");
  return { codigo, resposta, comoFica, ok: codigo >= 0 && (resposta >= 0 || comoFica >= 0) };
}

/** Lê o arquivo devolvido (xlsx ou csv) e devolve [{ codigo, resposta, comoFica }]. */
export async function lerRespostaCliente(file) {
  let matriz;
  if (/\.csv$|\.txt$/i.test(file.name)) matriz = lerCsv(await file.text());
  else {
    const mod = await import("exceljs"); const ExcelJS = mod.default || mod;
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0]; matriz = [];
    ws.eachRow({ includeEmpty: false }, (row) => matriz.push(row.values.slice(1).map((v) => (v && typeof v === "object" ? (v.result ?? v.text ?? (v.richText ? v.richText.map((r) => r.text).join("") : "")) : v ?? ""))));
  }
  if (!matriz.length) throw new Error("A planilha está vazia.");
  const cols = mapearColunasResposta(matriz[0].map(String));
  if (!cols.ok) throw new Error('Não encontrei as colunas "Código" e "Resposta"/"Como deve ficar" na primeira linha. Use a planilha emitida pelo sistema.');
  return matriz.slice(1).map((r) => ({ codigo: r[cols.codigo], resposta: cols.resposta >= 0 ? r[cols.resposta] : "", comoFica: cols.comoFica >= 0 ? r[cols.comoFica] : "" }));
}

export { abreviacoesAprovadas };
