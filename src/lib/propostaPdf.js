import { jsPDF } from "jspdf";
import { brl, SERVICOS, totaisDosItens } from "@/lib/propostas";

const M = 16;
const LARGURA = 210 - M * 2;
const VERDE = [30, 118, 77];

/** Logo da FAL Agro (public/fal-agro-logo.png) em base64; sem logo, o PDF sai só com o nome. */
export async function carregarLogo() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}fal-agro-logo.png`);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = () => ok(null); f.readAsDataURL(blob); });
  } catch {
    return null;
  }
}

const fmtData = (v) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

/** Monta o PDF da proposta (devolve o jsPDF, para o teste e para salvar). */
export function montarPdfDaProposta(p, { logo = null, hoje = new Date() } = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 16;
  const pagina = (preciso = 10) => { if (y + preciso > 280) { doc.addPage(); y = 18; } };
  const texto = (t, { tamanho = 10, negrito = false, cor = 40, recuo = 0 } = {}) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal"); doc.setFontSize(tamanho); doc.setTextColor(cor);
    for (const l of doc.splitTextToSize(String(t || ""), LARGURA - recuo)) { pagina(6); doc.text(l, M + recuo, y); y += tamanho * 0.48; }
    y += 1.5;
  };
  if (logo) { try { doc.addImage(logo, "PNG", M, y - 6, 34, 12); } catch { /* logo inválida: segue sem */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...VERDE);
  doc.text("Proposta comercial", 210 - M, y, { align: "right" });
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`Nº ${p.numero} · emitida em ${hoje.toLocaleDateString("pt-BR")}${p.validade ? ` · válida até ${fmtData(p.validade)}` : ""}`, 210 - M, y + 6, { align: "right" });
  y += 16;
  doc.setDrawColor(...VERDE); doc.line(M, y, 210 - M, y); y += 7;

  texto("Para", { tamanho: 9, cor: 110 });
  texto(p.cliente_nome, { tamanho: 12, negrito: true, cor: 20 });
  if (p.cliente_documento || p.cliente_email) texto([p.cliente_documento, p.cliente_email].filter(Boolean).join(" · "), { tamanho: 9, cor: 90 });
  y += 2;
  texto(`Serviço: ${SERVICOS[p.servico] || p.servico}`, { tamanho: 11, negrito: true, cor: 20 });
  if (p.escopo) { texto("Escopo", { tamanho: 10, negrito: true, cor: 20 }); texto(p.escopo, { tamanho: 9.5 }); }

  y += 2; pagina(20);
  texto("Investimento", { tamanho: 10, negrito: true, cor: 20 });
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(60);
  doc.text("Descrição", M, y); doc.text("Qtd.", M + 112, y, { align: "right" }); doc.text("Valor", M + 142, y, { align: "right" }); doc.text("Total", 210 - M, y, { align: "right" });
  y += 2; doc.setDrawColor(210); doc.line(M, y, 210 - M, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(30);
  for (const i of p.itens || []) {
    const linhas = doc.splitTextToSize(`${i.descricao}${i.recorrente ? " (mensal)" : ""}`, 95);
    pagina(linhas.length * 4.5 + 2);
    doc.text(linhas, M, y);
    doc.text(String(i.quantidade), M + 112, y, { align: "right" });
    doc.text(brl(i.valor_unitario), M + 142, y, { align: "right" });
    doc.text(brl(i.quantidade * i.valor_unitario), 210 - M, y, { align: "right" });
    y += linhas.length * 4.5 + 1.5;
  }
  const t = totaisDosItens(p.itens);
  doc.line(M, y, 210 - M, y); y += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
  if (t.mensal) { doc.text("Honorário mensal", M + 100, y); doc.text(brl(t.mensal), 210 - M, y, { align: "right" }); y += 6; }
  if (t.unico) { doc.text("Valor único", M + 100, y); doc.text(brl(t.unico), 210 - M, y, { align: "right" }); y += 6; }
  y += 3;
  if (p.condicoes) { texto("Condições", { tamanho: 10, negrito: true, cor: 20 }); texto(p.condicoes, { tamanho: 9.5 }); }
  if (p.observacoes) { texto("Observações", { tamanho: 10, negrito: true, cor: 20 }); texto(p.observacoes, { tamanho: 9.5 }); }
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(130);
    doc.text("FAL Agro · contato@falagro.com.br", M, 290);
    doc.text(`${i}/${paginas}`, 210 - M, 290, { align: "right" });
  }
  return doc;
}

/** Baixa o PDF da proposta com a logo. */
export async function baixarPdfDaProposta(p) {
  const doc = montarPdfDaProposta(p, { logo: await carregarLogo() });
  const nome = `proposta-${p.numero}-${String(p.cliente_nome || "cliente").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}.pdf`;
  doc.save(nome);
  return nome;
}
