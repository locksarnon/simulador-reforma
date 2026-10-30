/**
 * Monta o Excel da lista de solicitações ao cliente (padrão FAL Agro): aba Capa (logo, dados do projeto, andamento, prazos,
 * como responder, legenda) e aba Solicitações (um documento por linha, situação em lista suspensa, prazos calculados).
 *
 * Função pura: recebe o ExcelJS (carregado sob demanda no navegador ou direto no Node), a lista do catálogo, os dados da empresa
 * e a logo (base64); devolve o workbook. Os textos com {periodo}, {database} e {ano}, as datas e os prazos são FÓRMULAS ligadas
 * à Capa: preencher cliente, data-base e data de envio ajusta a lista inteira.
 */
import { PRIORIDADES, PRAZOS_PADRAO } from "./catalogo.js";

const FONTE = "Calibri";
const COR = {
  navy: "FF243B55", verde: "FF1C682F", ardosia: "FF98A1AD", borda: "FFC9CFD6", faixa: "FFE9EDF2",
  entrada: "FFFFF8DC", texto: "FF1F2937", suave: "FF5B6675", branco: "FFFFFFFF", atraso: "FFC00000",
};
export const STATUS = [
  { nome: "Pendente", bg: "FFF2F4F6", fg: "FF4A5568", desc: "Ainda não enviado." },
  { nome: "Em preparação", bg: "FFFFF2CC", fg: "FF7F6000", desc: "O cliente está levantando ou gerando o documento." },
  { nome: "Entrega parcial", bg: "FFDDEBF7", fg: "FF1F4E79", desc: "Enviado em parte; explique o que falta em Observações." },
  { nome: "Entregue", bg: "FFE3F1E4", fg: "FF1C682F", desc: "Enviado por completo." },
  { nome: "Não aplicável", bg: "FFFFFFFF", fg: "FF8A94A0", desc: "Não existe ou não se aplica ao cliente; justifique em Observações." },
];
const PRIORIDADE_DESC = { Alta: "Necessário para iniciar os trabalhos.", Média: "Necessário durante a execução.", Baixa: "Complementar ou confirmatório." };
const PASSOS = [
  "Envie os documentos pelo canal combinado com a FAL, identificando cada arquivo pelo número do item (exemplo: \"12_Balancete mensal.xlsx\").",
  "Na aba Solicitações, atualize a Situação e a data em \"Entregue em\" a cada envio. Se um item chegar em partes, use \"Entrega parcial\" e explique em Observações.",
  "Prefira arquivos originais e pesquisáveis (Excel, CSV, TXT/SPED, XML, PDF) a fotos ou digitalizações. Relatórios do sistema de gestão devem ser exportados em Excel sempre que possível.",
  "Se o item não existir ou não se aplicar, marque \"Não aplicável\" e justifique em Observações. Se houver impedimento (sistema indisponível, terceiro responsável), informe a data em que será possível enviar.",
  "Envie apenas os dados pessoais necessários ao serviço (folha, sócios, titulares) e mantenha-os protegidos, conforme a LGPD.",
];
const NOTA_FINAL = "Durante o desenvolvimento dos trabalhos, poderão ser solicitadas informações adicionais. Documento confidencial: as informações fornecidas serão utilizadas exclusivamente na execução do serviço contratado.";
const REGIMES = "Lucro Real,Lucro Presumido,Simples Nacional,Produtor rural pessoa física";
const LINHA_INICIAL = 4; // primeira linha após o cabeçalho da lista
const LINHA_FINAL_FORMULAS = 400; // faixa coberta por painel, formatação e validações
const ABA_LISTA = "Solicitações";
const LOGO_PROPORCAO = 640 / 262; // largura / altura do PNG da logo

// ---------------------------------------------------------------- utilitários

const serial = (d) => Math.round(d.getTime() / 86400000) + 25569;
const fmtData = (d) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
const linhasNecessarias = (texto, largura) => Math.max(1, Math.ceil(String(texto).length / largura));

/** Texto dos marcadores quando ainda não há data-base: aparecem entre colchetes para a equipe preencher. */
export function tokensDe(dados) {
  const db = dados.database;
  if (!db) return { database: "[data-base]", ano: "[ano]", periodo: "[período]" };
  const ini = new Date(Date.UTC(db.getUTCFullYear(), db.getUTCMonth() - 11, 1));
  return { database: fmtData(db), ano: String(db.getUTCFullYear()), periodo: `${fmtData(ini)} a ${fmtData(db)}` };
}
const subst = (s, t) => String(s || "").replace(/\{(database|ano|periodo)\}/g, (_, k) => t[k]);

const literal = (txt) => txt.split("\n").map((parte) => `"${parte.replace(/"/g, '""')}"`).join("&CHAR(10)&");

/** Texto com marcadores vira fórmula ligada à Capa (o texto acompanha a data-base); o resultado em cache vale sem recalcular. */
function textoComTokens(texto, tok, refs) {
  const bruto = String(texto || "");
  if (!/\{(database|ano|periodo)\}/.test(bruto)) return bruto || null;
  const pedacos = [];
  for (const p of bruto.split(/(\{(?:database|ano|periodo)\})/)) {
    if (!p) continue;
    const m = /^\{(database|ano|periodo)\}$/.exec(p);
    if (m) { pedacos.push(refs[m[1]]); continue; }
    for (let i = 0; i < p.length; i += 250) pedacos.push(literal(p.slice(i, i + 250)));
  }
  return { formula: pedacos.join("&"), result: subst(bruto, tok) };
}

// ---------------------------------------------------------------- estilos

const traco = (cor = COR.borda, estilo = "thin") => ({ style: estilo, color: { argb: cor } });
const caixa = (cor) => ({ top: traco(cor), left: traco(cor), bottom: traco(cor), right: traco(cor) });
const f = (o) => ({ name: FONTE, size: 10, color: { argb: COR.texto }, ...o });
const preenche = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function faixa(ws, de, ate, texto) {
  const [c1, c2] = [ws.getCell(de), ws.getCell(ate)];
  for (let c = c1.col; c <= c2.col; c++) {
    const cell = ws.getCell(c1.row, c);
    cell.fill = preenche(COR.navy);
    cell.font = f({ bold: true, size: 11, color: { argb: COR.branco } });
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  }
  c1.value = texto;
  ws.getRow(c1.row).height = 21;
}

function mesclado(ws, intervalo, valor, estilo = {}) {
  ws.mergeCells(intervalo);
  const topo = ws.getCell(intervalo.split(":")[0]);
  topo.value = valor;
  Object.assign(topo, estilo);
  return topo;
}

// ---------------------------------------------------------------- capa

function montarCapa(wb, lista, dados, tok, logoId, totais) {
  const ws = wb.addWorksheet("Capa", {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: COR.navy } },
    pageSetup: {
      paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: "&L&8FAL Agro&R&8Documento confidencial" },
  });
  ws.columns = [{ width: 2 }, { width: 28 }, { width: 34 }, { width: 3 }, { width: 32 }, { width: 9 }, { width: 9 }, { width: 2 }];
  const E = {}; // endereços usados pela lista
  let r = 1;
  ws.getRow(r++).height = 8;

  const logoLinha = r;
  for (let i = 0; i < 3; i++) ws.getRow(r++).height = 24;
  if (logoId !== null) ws.addImage(logoId, { tl: { col: 1, row: logoLinha - 1 }, ext: { width: 230, height: Math.round(230 / LOGO_PROPORCAO) } });
  ws.getRow(r++).height = 8;

  ws.getRow(r).height = 34;
  const titulo = ws.getCell(`B${r}`);
  titulo.value = "LISTA DE SOLICITAÇÕES";
  titulo.font = f({ size: 22, bold: true, color: { argb: COR.navy } });
  titulo.alignment = { vertical: "middle" };
  r++;
  ws.getRow(r).height = 25;
  for (const col of ["B", "C", "D", "E", "F", "G"]) ws.getCell(`${col}${r}`).border = { bottom: traco(COR.verde, "medium") };
  const servico = ws.getCell(`B${r}`);
  servico.value = lista.nome;
  servico.font = f({ size: 15, bold: true, color: { argb: COR.verde } });
  servico.alignment = { vertical: "middle" };
  r++;
  ws.getRow(r++).height = 8;

  const objetivo = subst(lista.objetivo || "", tok);
  const linhaObjetivo = objetivo ? r : null;
  if (objetivo) {
    ws.getRow(r).height = 14 * linhasNecessarias(objetivo, 112) + 6;
    mesclado(ws, `B${r}:G${r}`, objetivo, { font: f({ size: 10.5, color: { argb: COR.suave } }), alignment: { wrapText: true, vertical: "top" } });
    r++;
  }
  ws.getRow(r++).height = 10;

  // ---- Dados do projeto (esquerda) e Andamento (direita)
  faixa(ws, `B${r}`, `C${r}`, "Dados do projeto (preencher as células amarelas)");
  faixa(ws, `E${r}`, `G${r}`, "Andamento (atualiza sozinho)");
  r++;
  const r0 = r;
  const campos = [
    ["cliente", "Cliente", dados.cliente, null, true],
    ["cnpj", "CNPJ", dados.cnpj, null, true],
    ["servico", "Serviço", lista.nome, null, false],
    ["regime", "Regime tributário", dados.regime, null, true],
    ["erp", "ERP ou emissor e versão", dados.erp, null, true],
    ["database", "Data-base", dados.database, "dd/mm/yyyy", true],
    ["periodo", "Período analisado", null, null, false],
    ["envio", "Data de envio", dados.envio, "dd/mm/yyyy", true],
    ["responsavel", "Responsável FAL", dados.responsavel, null, true],
    ["contatoCliente", "Contato no cliente", dados.contatoCliente, null, true],
    ["contatoFal", "Contato FAL (e-mail/tel.)", dados.contatoFal, null, true],
  ];
  const posicao = (k) => campos.findIndex((c) => c[0] === k);
  campos.forEach(([chave, rotulo, valor, fmt, editavel], i) => {
    const lin = r0 + i;
    ws.getRow(lin).height = 20;
    const l = ws.getCell(`B${lin}`);
    l.value = rotulo;
    l.font = f({ bold: true, color: { argb: COR.navy } });
    l.alignment = { vertical: "middle", indent: 1 };
    l.border = { bottom: traco() };
    const v = ws.getCell(`C${lin}`);
    v.value = valor || null;
    v.font = f({ bold: !editavel });
    const longo = chave === "servico" && String(valor).length > 40; // nome comprido quebra em duas linhas
    v.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: longo };
    if (longo) ws.getRow(lin).height = 32;
    v.border = caixa();
    if (editavel) v.fill = preenche(COR.entrada);
    if (fmt) v.numFmt = fmt;
    if (chave === "regime") v.dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`"${REGIMES}"`] };
    E[chave] = `C${lin}`;
  });

  // marcadores de texto ({database}, {ano}, {periodo}) viram fórmulas ligadas à data-base da capa
  const rDb = r0 + posicao("database");
  const rPer = r0 + posicao("periodo");
  const db = `$C$${rDb}`;
  const refs = { database: `Capa!$J$${r0}`, ano: `Capa!$J$${r0 + 1}`, periodo: `Capa!$C$${rPer}` };
  ws.getColumn(10).hidden = true; // coluna J: auxiliares dos textos
  ws.getCell(`J${r0}`).value = { formula: `IF(${db}="","[data-base]",TEXT(DAY(${db}),"00")&"/"&TEXT(MONTH(${db}),"00")&"/"&YEAR(${db}))`, result: tok.database };
  ws.getCell(`J${r0 + 1}`).value = { formula: `IF(${db}="","[ano]",YEAR(${db}))`, result: tok.ano };
  const per = ws.getCell(`C${rPer}`);
  per.value = {
    formula: `IF(${db}="","[período]",TEXT(1,"00")&"/"&TEXT(MONTH(DATE(YEAR(${db}),MONTH(${db})-11,1)),"00")&"/"&YEAR(DATE(YEAR(${db}),MONTH(${db})-11,1))&" a "&$J$${r0})`,
    result: tok.periodo,
  };
  per.font = f({ italic: true, color: { argb: COR.suave } });
  if (linhaObjetivo) ws.getCell(`B${linhaObjetivo}`).value = textoComTokens(lista.objetivo, tok, refs);

  // painel de andamento (fórmulas sobre a aba Solicitações)
  const rng = (col) => `'${ABA_LISTA}'!$${col}$${LINHA_INICIAL}:$${col}$${LINHA_FINAL_FORMULAS}`;
  const totalRow = r0 + STATUS.length;
  STATUS.forEach((st, i) => {
    const lin = r0 + i;
    const l = ws.getCell(`E${lin}`);
    l.value = st.nome;
    l.font = f({ bold: true, color: { argb: st.fg } });
    l.fill = preenche(st.bg);
    l.alignment = { vertical: "middle", indent: 1 };
    l.border = caixa();
    const n = ws.getCell(`F${lin}`);
    n.value = { formula: `COUNTIF(${rng("I")},"${st.nome}")`, result: totais.porStatus[st.nome] || 0 };
    n.font = f({ bold: true });
    n.alignment = { horizontal: "center", vertical: "middle" };
    n.border = caixa();
    const p = ws.getCell(`G${lin}`);
    p.value = { formula: `IF($F$${totalRow}=0,0,F${lin}/$F$${totalRow})`, result: totais.total ? (totais.porStatus[st.nome] || 0) / totais.total : 0 };
    p.numFmt = "0%";
    p.alignment = { horizontal: "center", vertical: "middle" };
    p.border = caixa();
    p.font = f();
  });
  const extras = [
    [totalRow, "Total de itens", { formula: `COUNTA(${rng("I")})`, result: totais.total }, { formula: `SUM(G${r0}:G${totalRow - 1})`, result: totais.total ? 1 : 0 }, COR.faixa, COR.navy],
    [totalRow + 1, "Em atraso (prazo vencido)", { formula: `COUNTIFS(${rng("H")},"<"&TODAY(),${rng("I")},"<>Entregue",${rng("I")},"<>Não aplicável",${rng("I")},"<>")`, result: totais.atraso }, null, COR.branco, COR.atraso],
    [totalRow + 2, "Concluído (entregue ou n/a)", { formula: `F${r0 + 3}+F${r0 + 4}`, result: (totais.porStatus.Entregue || 0) + (totais.porStatus["Não aplicável"] || 0) }, { formula: `IF($F$${totalRow}=0,0,F${totalRow + 2}/$F$${totalRow})`, result: 0 }, COR.faixa, COR.verde],
  ];
  for (const [lin, rotulo, vn, vp, bg, cor] of extras) {
    ws.getRow(lin).height = 20;
    const l = ws.getCell(`E${lin}`);
    l.value = rotulo;
    l.font = f({ bold: true, color: { argb: cor } });
    l.fill = preenche(bg);
    l.alignment = { vertical: "middle", indent: 1 };
    l.border = caixa();
    const n = ws.getCell(`F${lin}`);
    n.value = vn;
    n.font = f({ bold: true, color: { argb: cor } });
    n.alignment = { horizontal: "center", vertical: "middle" };
    n.fill = preenche(bg);
    n.border = caixa();
    const p = ws.getCell(`G${lin}`);
    p.value = vp;
    p.numFmt = "0%";
    p.font = f({ bold: true, color: { argb: cor } });
    p.alignment = { horizontal: "center", vertical: "middle" };
    p.fill = preenche(bg);
    p.border = caixa();
  }
  r = r0 + campos.length;
  ws.getRow(r++).height = 10;

  // ---- Prazos padrão
  faixa(ws, `B${r}`, `C${r}`, "Prazos padrão para retorno (dias corridos)");
  faixa(ws, `E${r}`, `G${r}`, "Como o arquivo funciona");
  r++;
  const rp = r;
  Object.entries(PRAZOS_PADRAO).forEach(([prio, dias], i) => {
    const lin = rp + i;
    ws.getRow(lin).height = 20;
    const l = ws.getCell(`B${lin}`);
    l.value = `Prioridade ${prio}`;
    l.font = f({ bold: true, color: { argb: COR.navy } });
    l.alignment = { vertical: "middle", indent: 1 };
    l.border = { bottom: traco() };
    const v = ws.getCell(`C${lin}`);
    v.value = dias;
    v.numFmt = '0" dias após o envio"';
    v.font = f({ bold: true });
    v.fill = preenche(COR.entrada);
    v.border = caixa();
    v.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    E[{ Alta: "prazoAlta", Média: "prazoMedia", Baixa: "prazoBaixa" }[prio]] = `C${lin}`;
  });
  mesclado(
    ws,
    `E${rp}:G${rp + 2}`,
    "O prazo de cada item na aba Solicitações é calculado: data de envio + o prazo da prioridade. Ajuste os prazos ao lado se for preciso; células amarelas são de preenchimento.",
    { font: f({ size: 9.5, color: { argb: COR.suave } }), alignment: { wrapText: true, vertical: "top", indent: 1 } },
  );
  r = rp + 3;
  ws.getRow(r++).height = 10;

  // ---- Como responder
  faixa(ws, `B${r}`, `G${r}`, "Como responder");
  r++;
  PASSOS.forEach((txt, i) => {
    ws.getRow(r).height = 14 * linhasNecessarias(txt, 135) + 8;
    mesclado(
      ws,
      `B${r}:G${r}`,
      { richText: [{ text: `${i + 1}   `, font: f({ bold: true, size: 11, color: { argb: COR.verde } }) }, { text: txt, font: f() }] },
      { alignment: { wrapText: true, vertical: "top", indent: 1 } },
    );
    for (const col of ["B", "C", "D", "E", "F", "G"]) ws.getCell(`${col}${r}`).border = { bottom: traco("FFE3E7EC") };
    r++;
  });
  ws.getRow(r++).height = 10;

  // ---- Legendas
  faixa(ws, `B${r}`, `G${r}`, "Legenda da situação e da prioridade");
  r++;
  for (const st of STATUS) {
    ws.getRow(r).height = 20;
    const c = ws.getCell(`B${r}`);
    c.value = st.nome;
    c.font = f({ bold: true, color: { argb: st.fg } });
    c.fill = preenche(st.bg);
    c.alignment = { vertical: "middle", indent: 1 };
    c.border = caixa();
    mesclado(ws, `C${r}:G${r}`, st.desc, { alignment: { vertical: "middle", indent: 1 }, font: f() });
    r++;
  }
  for (const [prio, desc] of Object.entries(PRIORIDADE_DESC)) {
    ws.getRow(r).height = 20;
    const c = ws.getCell(`B${r}`);
    c.value = `Prioridade ${prio}`;
    c.font = f({ bold: true, color: { argb: COR.navy } });
    c.alignment = { vertical: "middle", indent: 1 };
    c.border = { bottom: traco() };
    mesclado(ws, `C${r}:G${r}`, desc, { alignment: { vertical: "middle", indent: 1 }, font: f() });
    r++;
  }
  ws.getRow(r++).height = 10;
  ws.getRow(r).height = 14 * linhasNecessarias(NOTA_FINAL, 118) + 6;
  mesclado(ws, `B${r}:G${r}`, NOTA_FINAL, { font: f({ size: 9, italic: true, color: { argb: COR.suave } }), alignment: { wrapText: true, vertical: "top" } });
  return { E, refs };
}

// ---------------------------------------------------------------- lista

function montarLista(wb, lista, dados, tok, logoId, E, refs) {
  const ws = wb.addWorksheet(ABA_LISTA, {
    views: [{ state: "frozen", xSplit: 0, ySplit: LINHA_INICIAL - 1, showGridLines: false, zoomScale: 90 }],
    properties: { tabColor: { argb: COR.verde } },
    pageSetup: {
      paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      printTitlesRow: `1:${LINHA_INICIAL - 1}`,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: "&L&8FAL Agro · Lista de Solicitações&C&8Página &P de &N&R&8Documento confidencial" },
  });
  const colunas = [
    ["", 1.5], ["Item", 6], ["Área", 22], ["Documento solicitado", 50], ["Detalhes e formato esperado", 36],
    ["Prioridade", 10], ["Solicitado em", 11.5], ["Prazo para entrega", 11.5], ["Situação", 14.5], ["Entregue em", 11.5], ["Observações do cliente", 36],
  ];
  ws.columns = colunas.map(([, width]) => ({ width }));

  // faixa do título
  ws.getRow(1).height = 26;
  ws.getRow(2).height = 26;
  if (logoId !== null) ws.addImage(logoId, { tl: { col: 1.05, row: 0.12 }, ext: { width: 138, height: Math.round(138 / LOGO_PROPORCAO) } });
  const t = ws.getCell("D1");
  t.value = `Lista de Solicitações — ${lista.nome}`;
  t.font = f({ size: 15, bold: true, color: { argb: COR.navy } });
  t.alignment = { vertical: "bottom" };
  const abs = (end) => `Capa!$${end[0]}$${end.slice(1)}`;
  const cli = abs(E.cliente);
  const db = abs(E.database);
  const info = ws.getCell("D2");
  info.value = {
    formula: `"Cliente: "&IF(${cli}="","(preencher na aba Capa)",${cli})&"     |     Data-base: "&IF(${db}="","(preencher)",TEXT(DAY(${db}),"00")&"/"&TEXT(MONTH(${db}),"00")&"/"&YEAR(${db}))`,
    result: `Cliente: ${dados.cliente || "(preencher na aba Capa)"}     |     Data-base: ${dados.database ? fmtData(dados.database) : "(preencher)"}`,
  };
  info.font = f({ size: 10.5, color: { argb: COR.suave } });
  info.alignment = { vertical: "top" };
  for (let c = 2; c <= 11; c++) ws.getCell(2, c).border = { bottom: traco(COR.verde, "medium") };

  // cabeçalho da tabela
  const hr = LINHA_INICIAL - 1;
  ws.getRow(hr).height = 32;
  colunas.forEach(([nome], i) => {
    if (i === 0) return;
    const c = ws.getCell(hr, i + 1);
    c.value = nome;
    c.font = f({ bold: true, size: 10, color: { argb: COR.branco } });
    c.fill = preenche(COR.navy);
    const esquerda = [2, 3, 4, 10].includes(i); // Área, Documento, Detalhes e Observações
    c.alignment = { vertical: "middle", horizontal: esquerda ? "left" : "center", wrapText: true, indent: esquerda ? 1 : 0 };
    c.border = caixa(COR.navy);
  });

  const refEnvio = abs(E.envio);
  let folhas = 0;
  let r = LINHA_INICIAL;
  let n = 0;

  const escreverLinha = (lin, num, area, titulo, detalhe, prio, comStatus, negrito) => {
    const base = { vertical: "top", wrapText: true };
    const set = (col, valor, extra = {}) => {
      const c = ws.getCell(`${col}${lin}`);
      if (valor !== undefined) c.value = valor;
      c.border = caixa();
      c.font = f(extra.font || {});
      c.alignment = { ...base, ...(extra.alignment || {}) };
      if (extra.numFmt) c.numFmt = extra.numFmt;
      return c;
    };
    set("B", num, { alignment: { horizontal: "center" }, font: { color: { argb: COR.suave } } });
    set("C", area, { font: { size: 9, color: { argb: COR.suave } } });
    set("D", textoComTokens(titulo, tok, refs), { font: { bold: !!negrito }, alignment: { indent: 1 } });
    set("E", textoComTokens(detalhe, tok, refs), { font: { size: 9.5, color: { argb: COR.suave } }, alignment: { indent: 1 } });
    if (!comStatus) {
      for (const col of ["F", "G", "H", "I", "J", "K"]) set(col, null);
      return;
    }
    set("F", prio, { alignment: { horizontal: "center" } });
    set("G", { formula: `IF(${refEnvio}="","",${refEnvio})`, result: dados.envio ? serial(dados.envio) : "" }, { alignment: { horizontal: "center" }, numFmt: "dd/mm/yyyy" });
    set(
      "H",
      { formula: `IF(G${lin}="","",G${lin}+IF(F${lin}="Alta",PrazoAlta,IF(F${lin}="Média",PrazoMedia,PrazoBaixa)))`, result: dados.envio ? serial(dados.envio) + PRAZOS_PADRAO[prio] : "" },
      { alignment: { horizontal: "center" }, numFmt: "dd/mm/yyyy" },
    );
    const st = set("I", "Pendente", { alignment: { horizontal: "center" }, font: { bold: true } });
    st.dataValidation = {
      type: "list", allowBlank: false, showErrorMessage: true, errorStyle: "stop", errorTitle: "Situação",
      error: "Escolha uma das opções da lista.", formulae: [`"${STATUS.map((x) => x.nome).join(",")}"`],
    };
    ws.getCell(`F${lin}`).dataValidation = {
      type: "list", allowBlank: false, showErrorMessage: true, errorStyle: "stop", errorTitle: "Prioridade",
      error: "Escolha Alta, Média ou Baixa.", formulae: ['"Alta,Média,Baixa"'],
    };
    set("J", null, { alignment: { horizontal: "center" }, numFmt: "dd/mm/yyyy" });
    set("K", null, { alignment: { indent: 1 } });
    folhas++;
  };

  for (const [area, itens] of lista.secoes) {
    ws.getRow(r).height = 21;
    for (let c = 2; c <= 11; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = preenche(COR.faixa);
      cell.border = { top: traco(COR.ardosia), bottom: traco(COR.ardosia) };
    }
    const sec = ws.getCell(`B${r}`);
    sec.value = subst(area, tok);
    sec.font = f({ bold: true, size: 11, color: { argb: COR.navy } });
    sec.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    r++;
    for (const [titulo, detalhe, prio, subs] of itens) {
      n++;
      if (subs && subs.length) {
        escreverLinha(r, n, subst(area, tok), titulo, detalhe, null, false, true);
        r++;
        subs.forEach((sub, i) => {
          const [st, sd, sp] = Array.isArray(sub) ? sub : [sub, "", null];
          escreverLinha(r, `${n}.${i + 1}`, subst(area, tok), st, sd, PRIORIDADES[sp || prio], true, false);
          r++;
        });
      } else {
        escreverLinha(r, n, subst(area, tok), titulo, detalhe, PRIORIDADES[prio], true, false);
        r++;
      }
    }
  }
  const ultima = r - 1;
  r++;
  const nota = ws.getCell(`D${r}`);
  nota.value = "Durante o desenvolvimento dos trabalhos, poderão ser solicitadas informações adicionais.";
  nota.font = f({ size: 9, italic: true, color: { argb: COR.suave } });

  ws.autoFilter = { from: { row: hr, column: 2 }, to: { row: ultima, column: 11 } };

  // situação: cores por valor; prazo vencido e não entregue em vermelho
  ws.addConditionalFormatting({
    ref: `I${LINHA_INICIAL}:I${LINHA_FINAL_FORMULAS}`,
    rules: STATUS.map((st, i) => ({
      type: "cellIs", operator: "equal", formulae: [`"${st.nome}"`], priority: i + 1,
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: st.bg } }, font: { color: { argb: st.fg }, bold: true, italic: st.nome === "Não aplicável" } },
    })),
  });
  ws.addConditionalFormatting({
    ref: `H${LINHA_INICIAL}:H${LINHA_FINAL_FORMULAS}`,
    rules: [{
      type: "expression", priority: STATUS.length + 1,
      formulae: [`AND(ISNUMBER($H${LINHA_INICIAL}),$H${LINHA_INICIAL}<TODAY(),$I${LINHA_INICIAL}<>"Entregue",$I${LINHA_INICIAL}<>"Não aplicável",$I${LINHA_INICIAL}<>"")`],
      style: { font: { color: { argb: COR.atraso }, bold: true } },
    }],
  });
  return { folhas };
}

// ---------------------------------------------------------------- montagem

const limparNome = (t) => String(t).replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();

/** Nome do arquivo: "Lista de Solicitações - <serviço> - <cliente>.xlsx" (cliente cortado em 40 caracteres, por causa do limite de caminho do Windows). */
export function nomeArquivo(lista, dados = {}, ordem = null) {
  if (dados.cliente) return `Lista de Solicitações - ${limparNome(lista.nome)} - ${limparNome(dados.cliente).slice(0, 40).trim()}.xlsx`;
  return `Lista de Solicitações - ${ordem ? `${String(ordem).padStart(2, "0")} - ` : ""}${limparNome(lista.nome)}.xlsx`;
}

/**
 * @param {object} p
 * @param {any} p.ExcelJS biblioteca exceljs
 * @param {object} p.lista item de LISTAS (catálogo)
 * @param {object} [p.dados] cliente, cnpj, regime, erp, database (Date UTC), envio (Date UTC), responsavel, contatoCliente, contatoFal
 * @param {string|null} [p.logo] PNG da logo em base64 (com ou sem o prefixo data:image/png;base64,)
 * @param {Date} [p.hoje] data de referência dos itens em atraso (valor em cache; o Excel recalcula ao abrir)
 */
export function montarPlanilha({ ExcelJS, lista, dados = {}, logo = null, hoje = new Date() }) {
  const tok = tokensDe(dados);
  const wb = new ExcelJS.Workbook();
  wb.creator = "FAL Agro";
  wb.lastModifiedBy = "FAL Agro";
  wb.company = "FAL Auditores e Consultores Independentes Ltda.";
  wb.title = `Lista de Solicitações — ${lista.nome}`;
  wb.subject = dados.cliente ? `Cliente: ${dados.cliente}` : "Modelo padrão";
  wb.created = new Date();
  wb.modified = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const logoId = logo ? wb.addImage({ base64: logo, extension: "png" }) : null;

  // totais em cache para o painel da Capa (o Excel recalcula ao abrir)
  let total = 0;
  let atraso = 0;
  const hojeSerial = serial(hoje);
  for (const [, itens] of lista.secoes) {
    for (const [, , prio, subs] of itens) {
      const prios = subs && subs.length ? subs.map((x) => (Array.isArray(x) ? x[2] || prio : prio)) : [prio];
      for (const p of prios) {
        total++;
        if (dados.envio && serial(dados.envio) + PRAZOS_PADRAO[PRIORIDADES[p]] < hojeSerial) atraso++;
      }
    }
  }
  const totais = { total, atraso, porStatus: { Pendente: total } };

  const capa = montarCapa(wb, lista, dados, tok, logoId, totais);
  const res = montarLista(wb, lista, dados, tok, logoId, capa.E, capa.refs);
  const ref = (end) => `Capa!$${end[0]}$${end.slice(1)}`;
  wb.definedNames.add(ref(capa.E.prazoAlta), "PrazoAlta");
  wb.definedNames.add(ref(capa.E.prazoMedia), "PrazoMedia");
  wb.definedNames.add(ref(capa.E.prazoBaixa), "PrazoBaixa");
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return { wb, itens: res.folhas };
}
