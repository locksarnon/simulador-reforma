/**
 * Regra da ferramenta: tudo o que o sistema imprime ou exporta sai com a logo da FAL no topo. Aqui: a logo carrega, entra no PDF (todas as
 * páginas) e no Excel (linha 1), a impressão tem o cabeçalho, e uma trava estática reprova gerador novo de PDF/Excel que não use marcaFal.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { jsPDF } from "jspdf";
import ExcelJS from "exceljs";
import { cabecalhoFalExcel, carregarLogoFal, LINHAS_LOGO_FAL, logoFalNasPaginasPdf, LOGO_FAL_PROPORCAO } from "./marcaFal";
import { desenharRelatorio } from "@/components/saneamento/relatorioPdf";
import { montarPdfDaProposta } from "./propostaPdf";

const SRC = fileURLToPath(new URL("..", import.meta.url));

describe("Logo da FAL: o arquivo", () => {
  it("carrega em base64 (PNG) e tem a proporção declarada", async () => {
    const logo = await carregarLogoFal();
    expect(logo.startsWith("data:image/png;base64,")).toBe(true);
    const png = Buffer.from(logo.split(",")[1], "base64");
    expect(png.length).toBeLessThanOrEqual(60 * 1024);
    expect(png.readUInt32BE(16) / png.readUInt32BE(20)).toBeCloseTo(LOGO_FAL_PROPORCAO, 3);
  });
  it("é a mesma imagem do backend (um só arquivo de logo)", () => {
    const front = readFileSync(join(SRC, "assets", "marca", "logo-fal.png"));
    const back = readFileSync(join(SRC, "..", "backend", "assets", "logo-fal-agro.png"));
    expect(front.equals(back)).toBe(true);
  });
});

describe("Logo da FAL: PDF (jsPDF)", () => {
  it("logoFalNasPaginasPdf põe a logo em todas as páginas", async () => {
    const logo = await carregarLogoFal();
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.addPage(); doc.addPage();
    const espia = vi.spyOn(doc, "addImage");
    expect(logoFalNasPaginasPdf(doc, logo)).toBe(3);
    expect(espia).toHaveBeenCalledTimes(3);
    expect(doc.output()).toContain("/Subtype /Image");
  });
  it("relatório do programa de trabalho (saneamento) e proposta comercial: logo em todas as páginas", async () => {
    const logo = await carregarLogoFal();
    const rel = { titulo: "Relatório", subtitulo: "Sub", rodape: "Rodapé", blocos: Array.from({ length: 160 }, (_, i) => ({ t: "p", texto: `Parágrafo ${i} ${"palavra ".repeat(30)}` })) };
    const espiaRel = vi.spyOn(jsPDF.API, "addImage");
    const doc = desenharRelatorio(jsPDF, rel, logo);
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    expect(espiaRel).toHaveBeenCalledTimes(doc.getNumberOfPages());
    espiaRel.mockClear();
    const prop = montarPdfDaProposta({ numero: 1, cliente_nome: "X", servico: "BPO_FISCAL", itens: [{ descricao: "Item", quantidade: 1, valor_unitario: 10 }], observacoes: "obs ".repeat(3000) }, { logo });
    expect(prop.getNumberOfPages()).toBeGreaterThan(1);
    expect(espiaRel).toHaveBeenCalledTimes(prop.getNumberOfPages());
    espiaRel.mockRestore();
  });
});

describe("Logo da FAL: Excel (exceljs)", () => {
  it("cabecalhoFalExcel: imagem na linha 1, linha sem valor, uma imagem só por pasta", async () => {
    const logo = await carregarLogoFal();
    const wb = new ExcelJS.Workbook();
    const a = wb.addWorksheet("A"); const b = wb.addWorksheet("B");
    expect(cabecalhoFalExcel(wb, a, logo)).toBe(LINHAS_LOGO_FAL);
    cabecalhoFalExcel(wb, b, logo);
    a.addRow(["Título"]);
    const lido = new ExcelJS.Workbook();
    await lido.xlsx.load(await wb.xlsx.writeBuffer());
    for (const ws of lido.worksheets) {
      expect(ws.getImages().length).toBe(1);
      expect(ws.getImages()[0].range.tl.nativeRow).toBe(0);
      expect(ws.getRow(1).cellCount).toBe(0);
    }
    expect(lido.getWorksheet("A").getRow(2).getCell(1).value).toBe("Título");
    expect(lido.model.media.length).toBe(1);
  });
  it("aba de carga no ERP (cargaNoErp): sem a logo, títulos na linha 1; a outra aba da pasta mantém a logo", async () => {
    const logo = await carregarLogoFal();
    const wb = new ExcelJS.Workbook();
    const resumo = wb.addWorksheet("Resumo"); const carga = wb.addWorksheet("Carga");
    expect(cabecalhoFalExcel(wb, resumo, logo)).toBe(LINHAS_LOGO_FAL);
    expect(cabecalhoFalExcel(wb, carga, logo, { cargaNoErp: true })).toBe(0);
    carga.addRow(["ItemCode", "ItemName"]); carga.addRow(["001", "Milho"]);
    const lido = new ExcelJS.Workbook();
    await lido.xlsx.load(await wb.xlsx.writeBuffer());
    expect(lido.getWorksheet("Resumo").getImages().length).toBe(1);
    expect(lido.getWorksheet("Carga").getImages().length).toBe(0);
    expect(lido.getWorksheet("Carga").getRow(1).values.slice(1)).toEqual(["ItemCode", "ItemName"]);
    expect(lido.getWorksheet("Carga").getRow(2).getCell(1).value).toBe("001");
  });
});

describe("Logo da FAL: impressão do navegador", () => {
  it("o App tem o cabeçalho de impressão e o Roteiro do projeto (que imprime só um pedaço) também", () => {
    expect(readFileSync(join(SRC, "App.jsx"), "utf8")).toMatch(/<CabecalhoImpressaoFal \/>/);
    expect(readFileSync(join(SRC, "components", "saneamento-estoques", "RoteiroProjeto.jsx"), "utf8")).toMatch(/roteiro-imprimivel">\s*<CabecalhoImpressaoFal \/>/);
    expect(readFileSync(join(SRC, "components", "CabecalhoImpressaoFal.jsx"), "utf8")).toMatch(/print:block[\s\S]*URL_LOGO_FAL/);
  });
});

// ── Trava estática ─────────────────────────────────────────────────────────

/**
 * Exceção aprovada: abas de dados para CARGA NO ERP (SAP DTW e parecidos esperam os títulos na linha 1) saem sem a logo. Lista fechada:
 * arquivo → motivo. Só estes arquivos podem usar `cargaNoErp: true`.
 */
const ABAS_DE_CARGA_NO_ERP = {
  "components/saneamento/listasFinais.js": "Lista final corrigida (cadastro saneado), Desduplicações (código de origem → mantido) e Candidatos à inativação",
};

/** Geradores que recebem a logo pronta de quem chama (não podem importar marcaFal) — com o motivo. */
const LOGO_RECEBIDA = {
  "lib/listaSolicitacoes/planilha.js": "também roda no Node (scripts/gerar-listas-solicitacoes.mjs); a logo vem de baixar.js (carregarLogoFal) ou do script",
};

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" ? [] : arquivos(p);
    return /\.(js|jsx)$/.test(n) && !/\.test\.(js|jsx)$/.test(n) ? [p] : [];
  });
}

describe("Logo da FAL: trava para gerador novo", () => {
  const fontes = arquivos(SRC).map((p) => ({ nome: relative(SRC, p).replace(/\\/g, "/"), texto: readFileSync(p, "utf8") }));
  const usaMarca = (t) => /from "(@\/lib\/|\.\/|\.\.\/(\.\.\/)*lib\/)marcaFal"/.test(t);

  it("todo arquivo que escreve Excel (addWorksheet) ou cria PDF (new jsPDF / new JsPdf) usa src/lib/marcaFal.js", () => {
    const geradores = fontes.filter((f) => f.nome !== "lib/marcaFal.js" && /\.addWorksheet\(|new jsPDF\(|new JsPdf\(/.test(f.texto));
    expect(geradores.length).toBeGreaterThan(8);
    const sem = geradores.filter((f) => !LOGO_RECEBIDA[f.nome] && !usaMarca(f.texto)).map((f) => f.nome);
    expect(sem, "gerador sem a logo da FAL: use cabecalhoFalExcel / logoFalNasPaginasPdf de src/lib/marcaFal.js").toEqual([]);
  });
  it("aba sem logo só para carga no ERP, nos arquivos da lista fechada (ABAS_DE_CARGA_NO_ERP)", async () => {
    const comExcecao = fontes.filter((f) => !["lib/marcaFal.js", "components/saneamento/arquivoXlsx.js"].includes(f.nome) && /cargaNoErp: true/.test(f.texto)).map((f) => f.nome).sort();
    expect(comExcecao, "aba sem a logo fora da lista de carga no ERP").toEqual(Object.keys(ABAS_DE_CARGA_NO_ERP).sort());
    const { ABAS_DE_CARGA_NO_ERP: nomes } = await import("@/components/saneamento/listasFinais");
    expect(nomes).toEqual(["Lista final corrigida", "Desduplicações", "Candidatos à inativação"]);
    expect(nomes.filter((n) => /resumo/i.test(n))).toEqual([]);
  });
  it("os da allow-list continuam recebendo a logo de quem chama", () => {
    for (const nome of Object.keys(LOGO_RECEBIDA)) {
      const f = fontes.find((x) => x.nome === nome);
      expect(f, nome).toBeTruthy();
      expect(f.texto).toMatch(/addImage\(/);
    }
    expect(fontes.find((f) => f.nome === "lib/listaSolicitacoes/baixar.js").texto).toMatch(/carregarLogoFal\(\)/);
  });
});
