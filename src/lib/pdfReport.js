import { jsPDF } from "jspdf";
import { BRL, pct } from "@/lib/format";

const MARGIN = 14;
const PAGE_W = 210; // A4 mm

function linha(doc, y) {
  doc.setDrawColor(220, 220, 220);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
}

/**
 * Gera e baixa um PDF com a memória de cálculo consolidada do Painel
 * Executivo — a mesma tabela/KPIs da tela, mas exportável e datável.
 * Não existia nenhum jeito de tirar esses números da tela antes disso.
 */
export function gerarRelatorioSimulacao({ totais, consolidado, versaoMotor, versaoRegras, cenarioNome, grupoNome }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Simulador FAL — Reforma Tributária", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Relatório de simulação - memória de cálculo consolidada", MARGIN, y);
  y += 10;

  doc.setFontSize(9);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, MARGIN, y);
  doc.text(`Versão do motor: ${versaoMotor}`, PAGE_W / 2, y);
  y += 5;
  doc.text(`Grupo: ${grupoNome || "Todos os grupos"}`, MARGIN, y);
  doc.text(`Versão das regras: ${versaoRegras}`, PAGE_W / 2, y);
  y += 5;
  doc.text(`Cenário: ${cenarioNome || "Base"}`, MARGIN, y);
  y += 8;
  doc.setTextColor(0);
  linha(doc, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Resumo consolidado", MARGIN, y);
  y += 7;

  const kpis = [
    ["Valor bruto simulado", BRL(totais.valorBruto)],
    ["Tributos atuais líquidos", BRL(totais.tributosAtuais)],
    ["Carga da transição", BRL(totais.cargaTransicao)],
    ["IBS/CBS líquido", BRL(totais.ibsCbs)],
    ["Split retido", BRL(totais.split)],
    ["Funding tributário estimado", BRL(totais.funding)],
    ["Variacao de margem (transicao - atual)", BRL(totais.margemTransicao - totais.margemAtual)],
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const [label, value] of kpis) {
    doc.text(label, MARGIN, y);
    doc.text(value, PAGE_W - MARGIN, y, { align: "right" });
    y += 6;
  }
  y += 4;
  linha(doc, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Consolidado por ano", MARGIN, y);
  y += 8;

  const cols = [
    { label: "Ano", w: 14, align: "left" },
    { label: "Valor bruto", w: 26, align: "right" },
    { label: "Trib. atuais", w: 26, align: "right" },
    { label: "Carga trans.", w: 26, align: "right" },
    { label: "IBS/CBS", w: 24, align: "right" },
    { label: "Split", w: 22, align: "right" },
    { label: "Funding", w: 24, align: "right" },
    { label: "Carga %", w: 20, align: "right" },
  ];
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  let x = MARGIN;
  for (const c of cols) {
    doc.text(c.label, c.align === "right" ? x + c.w : x, y, { align: c.align });
    x += c.w;
  }
  y += 2;
  linha(doc, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  for (const c of consolidado) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    x = MARGIN;
    const values = [
      String(c.ano),
      BRL(c.valorBruto),
      BRL(c.tributosAtuaisLiquidos),
      BRL(c.cargaTransicao),
      BRL(c.ibsCbsLiquido),
      BRL(c.splitRetido),
      BRL(c.funding),
      c.valorBruto > 0 ? pct(c.cargaTransicao / c.valorBruto) : "—",
    ];
    values.forEach((v, i) => {
      const col = cols[i];
      doc.text(v, col.align === "right" ? x + col.w : x, y, { align: col.align });
      x += col.w;
    });
    y += 6;
  }

  y += 6;
  linha(doc, y);
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(120);
  const disclaimer =
    "Premissas e aliquotas futuras permanecem como hipoteses ate publicacao oficial. O motor calcula IBS/CBS, transicao, " +
    "margem, caixa e split a partir dos parametros editaveis nas abas de Cenarios, Transicao e Catalogos.";
  doc.text(doc.splitTextToSize(disclaimer, PAGE_W - MARGIN * 2), MARGIN, y);

  const nomeArquivo = `simulacao-fal-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(nomeArquivo);
  return nomeArquivo;
}
