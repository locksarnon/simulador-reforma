import { jsPDF } from "jspdf";
import { BRL, pct } from "./format";

const MARGIN = 14;
const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const LARGURA = PAGE_W - MARGIN * 2;

function linha(doc, y) {
  doc.setDrawColor(220, 220, 220);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
}

/** Garante espaço na página; devolve o novo y. */
function espaco(doc, y, preciso = 12) {
  if (y + preciso > PAGE_H - 16) {
    doc.addPage();
    return 20;
  }
  return y;
}

function titulo(doc, y, texto) {
  y = espaco(doc, y, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text(texto, MARGIN, y);
  return y + 7;
}

/** Parágrafo com quebra de linha; devolve o novo y. */
function paragrafo(doc, y, texto, { tamanho = 9, cor = 80, recuo = 0 } = {}) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(tamanho);
  doc.setTextColor(cor);
  const linhas = doc.splitTextToSize(texto, LARGURA - recuo);
  for (const l of linhas) {
    y = espaco(doc, y, 5);
    doc.text(l, MARGIN + recuo, y);
    y += 4.4;
  }
  doc.setTextColor(0);
  return y + 1.5;
}

/** Tabela simples com cabeçalho repetido a cada página. cols: [{ label, w, align }]. */
function tabela(doc, y, cols, linhas) {
  const cabecalho = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0);
    let x = MARGIN;
    for (const c of cols) {
      doc.text(c.label, c.align === "right" ? x + c.w : x, y, { align: c.align || "left" });
      x += c.w;
    }
    y += 2;
    linha(doc, y);
    y += 4.5;
  };
  y = espaco(doc, y, 22);
  cabecalho();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  linhas.forEach((valores, idx) => {
    if (y > PAGE_H - 20) {
      doc.addPage();
      y = 20;
      cabecalho();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
    }
    if (idx % 2 === 1) {
      doc.setFillColor(246, 246, 246);
      doc.rect(MARGIN - 1, y - 3.6, LARGURA + 2, 5.2, "F");
    }
    let x = MARGIN;
    valores.forEach((v, i) => {
      const c = cols[i];
      doc.text(String(v), c.align === "right" ? x + c.w : x, y, { align: c.align || "left" });
      x += c.w;
    });
    y += 5.2;
  });
  return y + 3;
}

const p2 = (v) => `${(Number(v || 0) * 100).toFixed(2).replace(".", ",")}%`;
const fator = (v) => (v === undefined || v === null ? "—" : `${(Number(v) * 100).toFixed(0)}%`);

/**
 * Gera e baixa o PDF do Painel Executivo: resumo, cronograma da transição 2026–2033 (ano a ano),
 * débitos e créditos de IBS/CBS, comparação de cenários, ressalvas e base legal.
 */
export function gerarRelatorioSimulacao({
  totais, consolidado, versaoMotor, versaoRegras, cenarioNome, grupoNome,
  transicaoAnos = [], comparacaoCenarios = null, ressalvas = [],
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("InTAX — Reforma Tributária", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Relatório de simulação — memória de cálculo consolidada", MARGIN, y);
  y += 9;

  doc.setFontSize(9);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, MARGIN, y);
  doc.text(`Versão do motor: ${versaoMotor}`, PAGE_W / 2, y);
  y += 5;
  doc.text(`Escopo: ${grupoNome || "Todos os grupos"}`, MARGIN, y);
  doc.text(`Versão das regras: ${versaoRegras}`, PAGE_W / 2, y);
  y += 5;
  doc.text(`Cenário: ${cenarioNome || "Base"}`, MARGIN, y);
  y += 7;
  doc.setTextColor(0);
  linha(doc, y);
  y += 8;

  // 1. Resumo
  y = titulo(doc, y, "1. Resumo consolidado");
  const kpis = [
    ["Valor bruto simulado", BRL(totais.valorBruto)],
    ["Tributos atuais líquidos (PIS, Cofins, ICMS, ISS, IPI)", BRL(totais.tributosAtuais)],
    ["Carga da transição", `${BRL(totais.cargaTransicao)}${totais.valorBruto > 0 ? `  (${pct(totais.cargaTransicao / totais.valorBruto)})` : ""}`],
    ["Débito de IBS (sobre as vendas)", BRL(totais.debitoIbs)],
    ["Débito de CBS (sobre as vendas)", BRL(totais.debitoCbs)],
    ["Crédito de IBS (das compras)", BRL(totais.creditoIbs)],
    ["Crédito de CBS (das compras)", BRL(totais.creditoCbs)],
    ["Crédito presumido (estimativa — ver ressalvas)", BRL(totais.credPres)],
    ["IBS/CBS líquido a recolher", BRL(totais.ibsCbs)],
    ["Split payment retido", BRL(totais.split)],
    ["Funding tributário estimado", BRL(totais.funding)],
    ["Variação de margem (transição − atual)", BRL(totais.margemTransicao - totais.margemAtual)],
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  for (const [label, value] of kpis) {
    y = espaco(doc, y, 6);
    doc.text(label, MARGIN, y);
    doc.text(value, PAGE_W - MARGIN, y, { align: "right" });
    y += 5.6;
  }
  y += 3;
  linha(doc, y);
  y += 8;

  // 2. Cronograma da transição (todos os anos, mesmo sem operação)
  if (transicaoAnos.length > 0) {
    y = titulo(doc, y, "2. Cronograma da transição, ano a ano");
    y = paragrafo(doc, y, "Parâmetros usados no cálculo: quanto de cada tributo atual ainda vale (fator) e as alíquotas de IBS e CBS de cada ano.");
    y = tabela(
      doc, y,
      [
        { label: "Ano", w: 14 }, { label: "PIS/Cofins", w: 24, align: "right" }, { label: "ICMS", w: 20, align: "right" },
        { label: "ISS", w: 20, align: "right" }, { label: "IPI", w: 20, align: "right" },
        { label: "IBS efetivo", w: 26, align: "right" }, { label: "CBS efetiva", w: 26, align: "right" }, { label: "Efeito financ.", w: 32, align: "right" },
      ],
      transicaoAnos.map((t) => [t.ano, fator(t.pis_cofins_fator), fator(t.icms_fator), fator(t.iss_fator), fator(t.ipi_fator_geral), p2(t.ibs_efetivo), p2(t.cbs_efetiva), fator(t.efeito_financeiro)]),
    );
  }

  // 3. Débitos, créditos e carga por ano (todos os anos do cronograma)
  const porAno = new Map(consolidado.map((c) => [c.ano, c]));
  const anos = [...new Set([...transicaoAnos.map((t) => t.ano), ...consolidado.map((c) => c.ano)])].sort((a, b) => a - b);
  y = titulo(doc, y, "3. Débitos, créditos e carga por ano");
  y = paragrafo(doc, y, "Anos sem operações lançadas aparecem com traço. IBS/CBS líquido = débitos − créditos − crédito presumido, por empresa e por ano, sem valores negativos.");
  y = tabela(
    doc, y,
    [
      { label: "Ano", w: 14 }, { label: "Déb. IBS", w: 25, align: "right" }, { label: "Déb. CBS", w: 25, align: "right" },
      { label: "Créd. IBS", w: 25, align: "right" }, { label: "Créd. CBS", w: 25, align: "right" },
      { label: "IBS/CBS líq.", w: 34, align: "right" }, { label: "Carga %", w: 34, align: "right" },
    ],
    anos.map((a) => {
      const c = porAno.get(a);
      if (!c) return [a, "—", "—", "—", "—", "—", "—"];
      return [a, BRL(c.debitoIbs || 0), BRL(c.debitoCbs || 0), BRL(c.creditoIbs || 0), BRL(c.creditoCbs || 0), BRL(c.ibsCbsLiquido), c.valorBruto > 0 ? pct(c.cargaTransicao / c.valorBruto) : "—"];
    }),
  );

  y = tabela(
    doc, y,
    [
      { label: "Ano", w: 14 }, { label: "Valor bruto", w: 32, align: "right" }, { label: "Trib. atuais", w: 30, align: "right" },
      { label: "Carga transição", w: 32, align: "right" }, { label: "Split", w: 26, align: "right" }, { label: "Funding", w: 26, align: "right" }, { label: "Margem trans.", w: 22, align: "right" },
    ],
    anos.map((a) => {
      const c = porAno.get(a);
      if (!c) return [a, "—", "—", "—", "—", "—", "—"];
      return [a, BRL(c.valorBruto), BRL(c.tributosAtuaisLiquidos), BRL(c.cargaTransicao), BRL(c.splitRetido), BRL(c.funding), BRL(c.margemTransicao)];
    }),
  );

  // 4. Comparação de cenários
  const temCenarios = comparacaoCenarios && comparacaoCenarios.length > 0;
  if (temCenarios) {
    y = titulo(doc, y, "4. Comparação entre cenários");
    y = tabela(
      doc, y,
      [
        { label: "Cenário", w: 46 }, { label: "Margem atual", w: 44, align: "right" }, { label: "Margem transição", w: 46, align: "right" }, { label: "Variação", w: 46, align: "right" },
      ],
      comparacaoCenarios.map(({ cenario, totais: t }) => [cenario.nome, BRL(t.margemAtual), BRL(t.margemTransicao), BRL(t.margemTransicao - t.margemAtual)]),
    );
  }

  // 5. Ressalvas e base legal
  y = titulo(doc, y, `${temCenarios ? "5" : "4"}. Ressalvas e base legal`);
  for (const r of ressalvas) y = paragrafo(doc, y, `• ${r}`, { recuo: 2 });
  y = paragrafo(doc, y, "• Crédito de IBS/CBS: apropriação ampla, exceto uso e consumo pessoal, condicionada a documento fiscal eletrônico idôneo (LC 214/2025, art. 47).", { recuo: 2 });
  y = paragrafo(doc, y, "• Split payment: segregação e recolhimento na liquidação financeira do pagamento (LC 214/2025, arts. 31 a 35).", { recuo: 2 });
  y = paragrafo(doc, y, "• Premissas e alíquotas futuras permanecem como hipóteses até a publicação oficial. O motor calcula IBS/CBS, transição, margem, caixa e split a partir dos parâmetros editáveis nas abas Cenários, Transição e Catálogos.", { recuo: 2 });
  y = paragrafo(doc, y, "Estimativa gerencial: não substitui parecer tributário nem serve como guia de recolhimento.", { tamanho: 8, cor: 120 });

  const nomeArquivo = `simulacao-fal-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(nomeArquivo);
  return nomeArquivo;
}
