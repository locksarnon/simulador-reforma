// Desenho do relatório do programa de trabalho em PDF (A4, retrato). Recebe o construtor do jsPDF (carregado só na hora de emitir) e os blocos de
// relatorioFinal.js. As fontes embutidas do PDF só têm o conjunto Latin-1/WinAnsi: o texto é limpo antes de desenhar (setas e sinais fora dele viram letras).
const MARGEM = 14; const LARGURA_PAGINA = 210; const ALTURA_PAGINA = 297; const LARGURA = LARGURA_PAGINA - MARGEM * 2; const TOPO = 22; const BASE = ALTURA_PAGINA - 18;
const ESCURO = [31, 41, 55]; const MEDIO = [90, 98, 110]; const FAIXA = [243, 245, 248]; const LINHA = [214, 218, 224]; const DESTAQUE = [28, 74, 120];

/** Troca o que a fonte do PDF não desenha por equivalentes em letras (→ vira ->, ≥ vira >=...) e tira o resto fora de Latin-1 e dos sinais comuns do WinAnsi. */
export function limparTextoPdf(s) {
  return String(s ?? "").replace(/[→➜➔]/g, "->").replace(/←/g, "<-").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/≈/g, "~").replace(/[✓✔]/g, "ok").replace(/≠/g, "!=").replace(/[‑‒]/g, "-")
    .replace(/ /g, " ").replace(/[^\u0009\u000a -~¡-ÿ–—‘’“”•…€™]/g, "");
}

/**
 * Desenha o relatório e devolve o documento. `JsPdf` é o construtor do jsPDF. Cada bloco: titulo, sub, p, nota, kv, tabela (colunas com peso `w`, células que quebram
 * linha, cabeçalho repetido a cada página) e lista. Rodapé com o projeto e a página em todas as páginas.
 */
export function desenharRelatorio(JsPdf, relatorio) {
  const doc = new JsPdf({ unit: "mm", format: "a4" });
  const L = limparTextoPdf; let y = TOPO;
  const cor = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const quebrar = (texto, largura) => doc.splitTextToSize(L(texto), largura);
  const espaco = (preciso) => { if (y + preciso > BASE) { doc.addPage(); y = TOPO; } };
  const texto = (linhas, x, passo, tamanho, estilo = "normal", c = ESCURO) => {
    doc.setFont("helvetica", estilo); doc.setFontSize(tamanho); cor(c);
    for (const l of linhas) { espaco(passo); doc.text(l, x, y); y += passo; }
  };

  // capa
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); cor(DESTAQUE); doc.text(L(relatorio.titulo), MARGEM, y); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(12); cor(MEDIO); doc.text(L(relatorio.subtitulo), MARGEM, y); y += 5;
  doc.setDrawColor(LINHA[0], LINHA[1], LINHA[2]); doc.line(MARGEM, y, LARGURA_PAGINA - MARGEM, y); y += 7;

  for (const b of relatorio.blocos) {
    if (b.t === "titulo") {
      espaco(20); y += 4; doc.setFont("helvetica", "bold"); doc.setFontSize(13); cor(DESTAQUE);
      doc.text(L(b.n ? `${b.n}. ${b.texto}` : b.texto), MARGEM, y); y += 2.5; doc.setDrawColor(LINHA[0], LINHA[1], LINHA[2]); doc.line(MARGEM, y, LARGURA_PAGINA - MARGEM, y); y += 5.5;
    } else if (b.t === "sub") {
      espaco(14); y += 1.5; texto([L(b.texto)], MARGEM, 5.2, 10.5, "bold"); y += 0.5;
    } else if (b.t === "p" || b.t === "nota") {
      texto(quebrar(b.texto, LARGURA), MARGEM, 4.5, b.t === "nota" ? 8.5 : 9.5, "normal", b.t === "nota" ? MEDIO : ESCURO); y += 2;
    } else if (b.t === "kv") {
      for (const [r, v] of b.linhas) {
        const vl = quebrar(v, LARGURA - 78); const n = Math.max(1, vl.length); espaco(n * 4.6 + 1);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); cor(MEDIO); doc.text(L(r), MARGEM, y);
        doc.setFont("helvetica", "bold"); cor(ESCURO); vl.forEach((l, i) => doc.text(l, MARGEM + 78, y + i * 4.6)); y += n * 4.6 + 0.8;
      }
      y += 2.5;
    } else if (b.t === "lista") {
      for (const it of b.itens) {
        const ls = quebrar(it, LARGURA - 6); espaco(ls.length * 4.5 + 1.5);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); cor(ESCURO); doc.text("-", MARGEM + 1, y);
        ls.forEach((l, i) => doc.text(l, MARGEM + 5, y + i * 4.5)); y += ls.length * 4.5 + 1.2;
      }
      y += 1.5;
    } else if (b.t === "tabela") {
      const soma = b.cols.reduce((s, c) => s + c.w, 0); const larg = b.cols.map((c) => (c.w / soma) * LARGURA);
      const cabecalho = () => {
        const ls = b.cols.map((c, i) => quebrar(c.label, larg[i] - 3)); const n = Math.max(...ls.map((l) => l.length)); espaco(n * 4 + 8);
        doc.setFillColor(FAIXA[0], FAIXA[1], FAIXA[2]); doc.rect(MARGEM, y - 3.6, LARGURA, n * 4 + 1.6, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); cor(ESCURO); let x = MARGEM;
        ls.forEach((l, i) => { l.forEach((t, k) => doc.text(t, b.cols[i].align === "right" ? x + larg[i] - 1.5 : x + 1.5, y + k * 4, { align: b.cols[i].align === "right" ? "right" : "left" })); x += larg[i]; });
        y += n * 4 + 1.6;
      };
      cabecalho();
      if (!b.linhas.length) { texto([L("Nenhum registro.")], MARGEM + 1.5, 4.5, 8.5, "normal", MEDIO); y += 2; continue; }
      b.linhas.forEach((linha, idx) => {
        const ls = linha.map((v, i) => quebrar(v, larg[i] - 3)); const n = Math.max(...ls.map((l) => l.length)); const alt = n * 3.9 + 1.8;
        if (y + alt > BASE) { doc.addPage(); y = TOPO; cabecalho(); }
        if (idx % 2) { doc.setFillColor(250, 251, 252); doc.rect(MARGEM, y - 3.4, LARGURA, alt, "F"); }
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); cor(ESCURO); let x = MARGEM;
        ls.forEach((l, i) => { l.forEach((t, k) => doc.text(t, b.cols[i].align === "right" ? x + larg[i] - 1.5 : x + 1.5, y + k * 3.9, { align: b.cols[i].align === "right" ? "right" : "left" })); x += larg[i]; });
        y += alt;
      });
      doc.setDrawColor(LINHA[0], LINHA[1], LINHA[2]); doc.line(MARGEM, y - 1.6, LARGURA_PAGINA - MARGEM, y - 1.6); y += 4;
    }
  }

  // rodapé e numeração em todas as páginas
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); cor(MEDIO);
    doc.text(L(relatorio.rodape), MARGEM, ALTURA_PAGINA - 9); doc.text(`Página ${i} de ${total}`, LARGURA_PAGINA - MARGEM, ALTURA_PAGINA - 9, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF. O jsPDF é carregado só nesta hora (não pesa no resto do sistema). */
export async function gerarPdfRelatorio(relatorio, nomeArquivo) {
  const { jsPDF } = await import("jspdf");
  const doc = desenharRelatorio(jsPDF, relatorio);
  doc.save(nomeArquivo);
  return doc.getNumberOfPages();
}
