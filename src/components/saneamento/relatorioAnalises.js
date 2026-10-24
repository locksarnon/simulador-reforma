// Excel das análises (passo Checagens): o analista escolhe os grupos e os critérios, e cada critério ocupa o seu bloco de colunas (como é, como seria, por quê e
// a decisão), lado a lado na linha do item, para ler juntos os problemas de um mesmo item. Funções puras (sem React); o download fica em gerarXlsxAnalises().
import { CRITERIOS, dataBr, grupoDe } from "./logica";
import { situacaoCriterio } from "./analise";
import { baixarXlsx, carregarExcelJS } from "./arquivoXlsx";
import { formatarNcm, leituraAchado, textoLinhas } from "./leituraAchados";
import { montarConjuntos } from "./conjuntos";
import { chaveDe, identificavel, indexar } from "./identidade";
import { coerenciaDaDecisao } from "./aprovacao";

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const plural = (n, um, varios) => `${fmt(n)} ${n === 1 ? um : varios}`;
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const slugTxt = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const SITUACAO = { APROVADO: "aprovado pelo analista", AUTO: "aprovado automaticamente (sem achados)", PENDENTE: "ainda não aprovado", SEM_ANALISE: "com a análise não executada nesta base", NAO_APLICAVEL: "declarado não aplicável ao projeto" };

/** Critérios que têm achados calculados (teste automático): são os que o Excel pode listar. */
export const criteriosDoRelatorio = () => CRITERIOS.filter((c) => c.auto);

/** Decisão registrada para o achado, nas palavras das telas: encaminhado ao De/para, aprovado ou rejeitado lá. */
export function textoDecisao(d) {
  if (!d) return "Não encaminhado";
  const quando = `${d.decididoPor ? ` por ${d.decididoPor}` : ""}${d.decididoEm ? ` em ${dataBr(d.decididoEm)}` : ""}`;
  if (d.status === "APR") return `Aprovado${quando}`;
  if (d.status === "REJ") return `Rejeitado${quando}`;
  return "Encaminhado (aguarda decisão)";
}

/** Quantos itens e achados a seleção tem (sem montar os textos): serve à tela de escolha. `grupos` null = todos. */
export function contarSelecao({ achados, criterios, grupos }) {
  const gs = grupos ? new Set(grupos) : null; const itens = new Set(); let total = 0;
  for (const id of criterios) for (const a of achados?.[id] || []) { if (gs && !gs.has(grupoDe(a.item))) continue; itens.add(a.item.linha); total += 1; }
  return { itens: itens.size, achados: total };
}

/**
 * Monta o relatório: uma linha por item com achado em algum dos critérios escolhidos, e em cada linha o bloco de cada critério
 * ({ como, seria, porque, decisao }). `totaisGrupos` é Map(grupo -> itens em escopo); `escalaSaldo` divide o saldo lido da base.
 */
export function montarRelatorioAnalises({ achados, criterios, grupos, estado, contagem, itemPorLinha, totaisGrupos, escalaSaldo = 1, indice }) {
  const ind = indice ?? indexar([...(itemPorLinha?.values?.() ?? [])]); // sem o índice da base, ele sai dos itens conhecidos (código repetido não recebe decisão)
  const sel = criteriosDoRelatorio().filter((c) => criterios.includes(c.id));
  // a duplicidade sai com a escolha de quem fica (ou a sugestão): os conjuntos são montados sobre todos os achados do critério
  const conjuntoDe = new Map();
  if (sel.some((c) => c.id === "duplicidade")) for (const c of montarConjuntos((achados?.duplicidade || []).map((a) => a.item), { escala: escalaSaldo })) for (const m of c.membros) conjuntoDe.set(m.linha, c);
  const gs = grupos ? new Set(grupos) : null; const linhas = new Map(); const colunas = []; let totalAchados = 0;
  // a decisão só aparece para item com código que o identifica; a que perdeu a validade (cadastro mudou, código repetido) diz isso ao lado do que foi decidido
  const textoDaDecisao = (it, critId) => {
    const d = identificavel(it, ind) ? estado?.decisoes?.[chaveDe(it, critId)] : undefined; if (!d) return textoDecisao(undefined);
    const coer = coerenciaDaDecisao(d, critId, it, ind, estado?.decisoes);
    return `${textoDecisao(d)}${coer.ok ? "" : ` (não vale: ${coer.motivo.toLowerCase()})`}`;
  };
  for (const c of sel) {
    let total = 0;
    for (const a of achados?.[c.id] || []) {
      const g = grupoDe(a.item); if (gs && !gs.has(g)) continue;
      const it = a.item; const l = leituraAchado(c, a, { itemPorLinha, escala: escalaSaldo, conjuntoDe, decisoes: estado?.decisoes, indice: ind });
      let r = linhas.get(it.linha);
      if (!r) {
        const saldo = it.saldo != null && Number.isFinite(Number(it.saldo)) ? Number(it.saldo) / (escalaSaldo || 1) : null;
        r = { grupo: g, linha: it.linha, codigo: it.codigo || "", descricao: it.descricao || "", unidade: it.unidade || "", ncm: formatarNcm(it.ncm || it.ncm_original || ""), ultimaMov: dataBr(it.ultima_mov), saldo, porCriterio: {} };
        linhas.set(it.linha, r);
      }
      r.porCriterio[c.id] = { como: textoLinhas(l.como), seria: textoLinhas(l.seria), porque: l.porque, decisao: textoDaDecisao(it, c.id) };
      total += 1;
    }
    totalAchados += total; colunas.push({ id: c.id, titulo: c.titulo, situacao: situacaoCriterio(estado, c, contagem), total });
  }
  const lista = [...linhas.values()].sort((x, y) => x.grupo.localeCompare(y.grupo, "pt-BR") || x.linha - y.linha);
  const nomes = (gs ? [...gs] : [...(totaisGrupos?.keys() || [])]).sort((x, y) => x.localeCompare(y, "pt-BR"));
  const comAchado = new Map(); for (const l of lista) comAchado.set(l.grupo, (comAchado.get(l.grupo) || 0) + 1);
  return {
    criterios: colunas, linhas: lista, temSaldo: lista.some((l) => l.saldo != null),
    porGrupo: nomes.map((g) => ({ grupo: g, itensEmEscopo: totaisGrupos?.get(g) ?? 0, itensComAchado: comAchado.get(g) || 0 })),
    gruposTodos: !gs || (!!totaisGrupos && nomes.length === totaisGrupos.size),
    totais: { itens: lista.length, achados: totalAchados, grupos: nomes.length },
  };
}

/** Nome do arquivo: diz o critério (ou quantos) e o grupo (ou quantos) do relatório. */
export function nomeArquivoAnalises({ slug, criterios, grupos, totalGrupos }) {
  const c = criterios.length === 1 ? slugTxt(criterios[0].titulo) : `${criterios.length}-criterios`;
  const g = grupos.length === totalGrupos ? "todos-os-grupos" : grupos.length === 1 ? slugTxt(grupos[0]) : `${grupos.length}-grupos`;
  return `${slug || "projeto"}-analises-${c}-${g}.xlsx`;
}

const CORES = ["FFDCE6F1", "FFE2EFDA", "FFFCE4D6", "FFE4DFEC", "FFFFF2CC", "FFDDEBF7", "FFF8CBAD", "FFE7E6E6"];
const COR_ITEM = "FFEDEDED";
const CAMPOS_CRITERIO = [["como", "Como é", 40], ["seria", "Como seria", 40], ["porque", "Por quê", 40], ["decisao", "Decisão", 26]];

/** Linhas da aba de resumo: o que foi escolhido, o que o relatório traz e como ler. */
function linhasResumo(rel, { nomeProjeto, nomeBase }) {
  const t = rel.totais; const nomes = rel.porGrupo.map((g) => g.grupo);
  return [
    ["Relatório", "Análises por critério e grupo"], ["Projeto", nomeProjeto || ""], ["Base importada", nomeBase || ""], ["Gerado em", new Date().toLocaleString("pt-BR")], ["", ""],
    ["Grupos incluídos", rel.gruposTodos ? `todos os ${fmt(t.grupos)} grupos em escopo` : `${fmt(t.grupos)}: ${nomes.slice(0, 12).join("; ")}${nomes.length > 12 ? "…" : ""}`],
    ["Critérios incluídos", rel.criterios.length],
    ...rel.criterios.map((c) => [`  ${c.titulo}`, `${plural(c.total, "achado", "achados")} · critério ${SITUACAO[c.situacao]}`]),
    ["Itens com achado", t.itens], ["Achados (soma dos critérios)", t.achados], ["", ""],
    ["Itens com achado por grupo", ""], ...rel.porGrupo.map((g) => [`  ${g.grupo}`, `${fmt(g.itensComAchado)} de ${plural(g.itensEmEscopo, "item", "itens")} em escopo`]), ["", ""],
    ["Como ler", "Cada critério ocupa um bloco de colunas, na mesma linha do item: Como é (o que o cadastro tem hoje), Como seria (o que a ferramenta sugere), Por quê (a razão do achado) e Decisão (o que foi registrado no passo De/para)."],
    ["Decisão", "Não encaminhado = nenhuma proposta registrada para o item · Encaminhado (aguarda decisão) = enviado ao De/para · Aprovado ou Rejeitado = decisão registrada, com aprovador e data."],
    ...(rel.temSaldo ? [["Saldo", "Saldo em estoque lido da base, na unidade de estoque atual do item."]] : []),
    ["Atenção", "Os achados são indícios e as sugestões são propostas para análise: a similaridade entre descrições não é probabilidade nem prova de identidade. Nenhum cadastro foi alterado por esta ferramenta."],
  ];
}

/** Monta o workbook (separado do download para poder ser testado): aba "Análises" com um bloco de colunas por critério e aba "Resumo". */
export function criarWorkbookAnalises(ExcelJS, rel, { nomeProjeto = "", nomeBase = "" } = {}) {
  const wb = new ExcelJS.Workbook(); wb.created = new Date();
  const ws = wb.addWorksheet("Análises");
  const fixas = [["Código", 14, (l) => l.codigo], ["Descrição", 46, (l) => l.descricao], ["Unidade", 10, (l) => l.unidade], ["Grupo", 28, (l) => l.grupo], ["NCM", 13, (l) => l.ncm], ["Última movimentação", 14, (l) => l.ultimaMov],
    ...(rel.temSaldo ? [["Saldo em estoque", 14, (l) => l.saldo]] : []), ["Linha da planilha", 10, (l) => l.linha]];
  const cab = fixas.map(([t]) => t); const larguras = fixas.map(([, w]) => w);
  const bandas = [{ de: 1, ate: fixas.length, titulo: "Item", cor: COR_ITEM }]; const campos = []; let col = fixas.length + 1;
  rel.criterios.forEach((c, i) => {
    bandas.push({ de: col, ate: col + CAMPOS_CRITERIO.length - 1, titulo: c.titulo, cor: CORES[i % CORES.length], inicio: true });
    for (const [campo, titulo, largura] of CAMPOS_CRITERIO) { cab.push(titulo); larguras.push(largura); campos.push({ id: c.id, campo }); }
    col += CAMPOS_CRITERIO.length;
  });
  ws.columns = larguras.map((width) => ({ width }));
  ws.addRow(cab.map((_, i) => bandas.find((b) => b.de === i + 1)?.titulo ?? null));
  ws.addRow(cab);
  for (const l of rel.linhas) ws.addRow([...fixas.map(([, , f]) => f(l)), ...campos.map(({ id, campo }) => l.porCriterio[id]?.[campo] ?? "")]);
  // estilo: colunas primeiro (valem para as células já criadas), depois as duas linhas de cabeçalho
  const iSaldo = rel.temSaldo ? fixas.findIndex(([t]) => t === "Saldo em estoque") : -1;
  cab.forEach((_, i) => {
    const longa = i === 1 || i >= fixas.length; const c = ws.getColumn(i + 1);
    c.alignment = { vertical: "top", wrapText: longa };
    if (i === iSaldo) c.numFmt = "#,##0.######";
    if (bandas.some((b) => b.inicio && b.de === i + 1)) c.border = { left: { style: "thin", color: { argb: "FF9E9E9E" } } };
  });
  for (const b of bandas) {
    ws.mergeCells(1, b.de, 1, b.ate);
    for (let x = b.de; x <= b.ate; x++) for (const r of [1, 2]) ws.getCell(r, x).fill = { type: "pattern", pattern: "solid", fgColor: { argb: b.cor } };
    ws.getCell(1, b.de).alignment = { horizontal: "center", vertical: "middle" };
  }
  ws.getRow(1).font = { bold: true, size: 12 }; ws.getRow(2).font = { bold: true }; ws.getRow(2).alignment = { vertical: "middle", wrapText: true };
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 2 }];
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cab.length } };
  const rs = wb.addWorksheet("Resumo"); rs.columns = [{ width: 46 }, { width: 100 }];
  linhasResumo(rel, { nomeProjeto, nomeBase }).forEach((l) => rs.addRow(l));
  rs.getColumn(1).font = { bold: true }; rs.getColumn(2).alignment = { vertical: "top", wrapText: true };
  return wb;
}

/** Gera e baixa o Excel. A biblioteca é carregada só nesta hora. */
export async function gerarXlsxAnalises(rel, meta, nomeArquivo) {
  const ExcelJS = await carregarExcelJS();
  baixarXlsx(await criarWorkbookAnalises(ExcelJS, rel, meta).xlsx.writeBuffer(), nomeArquivo);
}
