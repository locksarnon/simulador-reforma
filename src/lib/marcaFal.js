/**
 * Logo da FAL no topo de tudo o que o sistema imprime ou exporta (regra da ferramenta inteira). Um só arquivo de logo
 * (src/assets/marca/logo-fal.png, a mesma imagem de backend/assets/logo-fal-agro.png) e um só jeito de pôr a logo em cada tecnologia:
 *  - PDF (jsPDF): logoFalNasPaginasPdf, depois de desenhar o documento (logo no alto de TODAS as páginas);
 *  - Excel (exceljs): cabecalhoFalExcel em cada aba, antes de escrever a primeira linha (a logo ocupa a linha 1; o conteúdo começa abaixo);
 *  - impressão do navegador: o componente CabecalhoImpressaoFal (src/components/CabecalhoImpressaoFal.jsx).
 * CSV não leva imagem: fica de fora da regra. Exceção aprovada: aba de dados feita para CARGA NO ERP (SAP DTW e parecidos esperam os títulos na
 * linha 1) sai sem a logo — cabecalhoFalExcel(wb, ws, logo, { cargaNoErp: true }) devolve 0 e não reserva linha; o Resumo da mesma pasta
 * continua com a logo. A lista dessas abas fica na trava (src/lib/marcaFal.test.js, ABAS_DE_CARGA_NO_ERP).
 * Um teste (src/lib/marcaFal.test.js) falha se um arquivo novo gerar PDF ou Excel sem importar este módulo.
 */
import urlLogo from "@/assets/marca/logo-fal.png";

/** Endereço da logo para <img> (impressão). */
export const URL_LOGO_FAL = urlLogo;
/** Largura / altura da imagem (480 × 196). */
export const LOGO_FAL_PROPORCAO = 480 / 196;

let logoEmCache = null;
/**
 * A logo em data URL (base64), para o jsPDF e o exceljs. Fica num pedaço separado do código (só é carregada quando alguém gera um arquivo).
 * Se falhar, devolve null e o arquivo sai sem a imagem (nunca deixa de sair).
 */
export function carregarLogoFal() {
  if (!logoEmCache) {
    logoEmCache = import("@/assets/marca/logo-fal.png?inline").then((m) => m.default || null).catch(() => null);
  }
  return logoEmCache;
}

// ── PDF (jsPDF) ─────────────────────────────────────────────────────────────

/** Altura da logo no PDF, em mm (largura pela proporção). */
export const ALTURA_LOGO_PDF_MM = 9;
/** Onde o conteúdo de cada página deve começar (mm) para não ficar debaixo da logo. */
export const TOPO_ABAIXO_DA_LOGO_MM = 22;

/**
 * Logo no canto superior esquerdo de todas as páginas do documento (chamar depois de desenhar tudo). `margem` = margem esquerda em mm.
 * Devolve quantas páginas receberam a logo.
 */
export function logoFalNasPaginasPdf(doc, logo, { margem = 12, topo = 6, altura = ALTURA_LOGO_PDF_MM } = {}) {
  if (!logo) return 0;
  const total = doc.getNumberOfPages();
  const atual = doc.getCurrentPageInfo?.().pageNumber ?? total;
  let n = 0;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    try { doc.addImage(logo, "PNG", margem, topo, altura * LOGO_FAL_PROPORCAO, altura, "logo-fal", "FAST"); n++; } catch { /* imagem inválida: segue sem */ }
  }
  doc.setPage(atual);
  return n;
}

// ── Excel (exceljs) ─────────────────────────────────────────────────────────

/** Quantas linhas a logo ocupa no topo de cada aba (o conteúdo começa na linha LINHAS_LOGO_FAL + 1). */
export const LINHAS_LOGO_FAL = 1;
/** Altura da linha da logo, em pontos. */
export const ALTURA_LINHA_LOGO_FAL = 42;
const ALTURA_LOGO_PX = 46;

const idsPorPasta = new WeakMap();
/**
 * Põe a logo na linha 1 da aba (canto superior esquerdo) e devolve quantas linhas ela ocupa: quem escreve a aba começa o conteúdo na linha
 * seguinte (e soma esse número ao congelamento de painéis, ao filtro e às fórmulas). Chamar ANTES de escrever a primeira linha.
 * A linha da logo fica sem valor nenhum: quem lê a planilha de volta (eachRow, leitores que pulam linha em branco) não enxerga a linha.
 * Sem logo (falha ao carregar), a linha fica reservada do mesmo jeito: o layout não muda.
 * `cargaNoErp`: aba de dados que volta para o ERP — sem a logo, títulos na linha 1 (devolve 0). Só para as abas da lista da trava.
 */
export function cabecalhoFalExcel(wb, ws, logo, { cargaNoErp = false } = {}) {
  if (cargaNoErp) return 0;
  const linha = ws.getRow(1);
  linha.height = ALTURA_LINHA_LOGO_FAL;
  if (logo) {
    let id = idsPorPasta.get(wb);
    if (id === undefined) { id = wb.addImage({ base64: logo, extension: "png" }); idsPorPasta.set(wb, id); }
    ws.addImage(id, { tl: { col: 0.1, row: 0.12 }, ext: { width: Math.round(ALTURA_LOGO_PX * LOGO_FAL_PROPORCAO), height: ALTURA_LOGO_PX }, editAs: "oneCell" });
  }
  return LINHAS_LOGO_FAL;
}
