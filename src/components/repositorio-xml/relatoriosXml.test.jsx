import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  COLUNAS_GERAL, COLUNAS_RESUMO_GERAL, colunasProdutos, dataLocal, linhasParaCsv, montarPlanilha, nomeDoArquivo, periodoPadrao, textoDaCelula, textoDoPeriodo, valorDoExcel,
} from "./dadosDosRelatorios";
import RelatoriosXml, { ResultadoGeral, ResultadoProdutos } from "./RelatoriosXml";

const renderizar = (elemento) => {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  return renderToString(<QueryClientProvider client={qc}>{elemento}</QueryClientProvider>).replace(/<!-- -->/g, "");
};

const CHAVE = "51261112345678000195550010000001231000000010";
const linhaGeral = (extra = {}) => ({
  id: "d1", documento: "NF-e", numero: "123", serie: "1", data_emissao: "2026-11-05T13:15:00.000Z", chave: CHAVE, emitente_nome: "FORNECEDOR AGRO LTDA",
  emitente_doc: "12345678000195", destinatario_doc: "98765432000110", valor_total: 1000, situacao: "AUTORIZADA", origem: "UPLOAD", conteudo: "COMPLETO", importado: false, ...extra,
});
const geral = (extra = {}) => ({
  resumo: {
    documentos: 6, valor_autorizadas: 3580.5, canceladas: 1,
    por_documento: [
      { documento: "NF-e", total: 3, autorizadas: 1, canceladas: 1, denegadas: 1, sem_situacao: 0, valor_total: 1700, valor_autorizadas: 1000 },
      { documento: "CT-e", total: 1, autorizadas: 1, canceladas: 0, denegadas: 0, sem_situacao: 0, valor_total: 2500, valor_autorizadas: 2500 },
    ],
  },
  linhas: [linhaGeral(), linhaGeral({ id: "d2", documento: "CT-e", numero: "77", valor_total: 2500, situacao: "CANCELADA", origem: "CAPTURA", importado: true })],
  truncado: false,
  ...extra,
});
const linhaProduto = (extra = {}) => ({
  data_emissao: "2026-11-05T13:15:00.000Z", numero: "123", serie: "1", chave: CHAVE, emitente_nome: "FORNECEDOR AGRO LTDA", emitente_doc: "12345678000195", item: "1", codigo: "P0001",
  descricao: "SOJA EM GRAOS CLASSIFICADA", ncm: "12019000", cfop: "5102", unidade: "SC", quantidade: 10.5, valor_unitario: 107.25, valor_total: 1126.13, desconto: 0, valor_icms: 135.14, valor_ipi: 0, ...extra,
});

describe("período e textos", () => {
  it("o período padrão vai do primeiro dia do mês até hoje", () => {
    expect(periodoPadrao(new Date(2026, 10, 11))).toEqual({ de: "2026-11-01", ate: "2026-11-11" });
    expect(periodoPadrao(new Date(2026, 0, 5))).toEqual({ de: "2026-01-01", ate: "2026-01-05" });
  });

  it("o texto do período para o cabeçalho dos arquivos", () => {
    expect(textoDoPeriodo("2026-11-01", "2026-11-30")).toBe("Período de emissão: 01/11/2026 a 30/11/2026");
    expect(textoDoPeriodo("2026-11-01", "")).toBe("Emissão a partir de 01/11/2026");
    expect(textoDoPeriodo("", "2026-11-30")).toBe("Emissão até 30/11/2026");
    expect(textoDoPeriodo("", "")).toBe("Período de emissão: todos");
  });

  it("a data de emissão (UTC no banco) vale no dia de Brasília", () => {
    expect(dataLocal("2026-11-01T02:30:00.000Z")).toBe("2026-10-31");
    expect(dataLocal("2026-11-05T13:15:00.000Z")).toBe("2026-11-05");
    expect(dataLocal(null)).toBeNull();
    expect(dataLocal("lixo")).toBeNull();
  });

  it("nome do arquivo: tipo do relatório, empresa e período, sem acento nem caractere estranho", () => {
    expect(nomeDoArquivo({ qual: "geral", empresa: { id_empresa: "EMP-01" }, de: "2026-11-01", ate: "2026-11-30", extensao: "xlsx" })).toBe("relatorio-geral-EMP-01-2026-11-01-a-2026-11-30.xlsx");
    expect(nomeDoArquivo({ qual: "produtos", empresa: { razao_social: "Álvares Agropecuária Ltda." }, de: "", ate: "", extensao: "csv" })).toBe("relatorio-produtos-AlvaresAgropecuariaLtda.csv");
    expect(nomeDoArquivo({ qual: "geral", empresa: null, extensao: "csv" })).toBe("relatorio-geral-empresa.csv");
  });
});

describe("células", () => {
  const col = (chave) => COLUNAS_GERAL.find((c) => c.chave === chave);

  it("na tela: data, CNPJ, moeda, situação, origem e sim/não como a pessoa lê", () => {
    const l = linhaGeral({ valor_total: 15250.9, situacao: "CANCELADA", importado: true });
    expect(textoDaCelula(col("data_emissao"), l)).toBe("05/11/2026");
    expect(textoDaCelula(col("emitente_doc"), l)).toBe("12.345.678/0001-95");
    expect(textoDaCelula(col("valor_total"), l)).toBe("15.250,90");
    expect(textoDaCelula(col("situacao"), l)).toBe("Cancelada");
    expect(textoDaCelula(col("origem"), l)).toBe("Importação");
    expect(textoDaCelula(col("importado"), l)).toBe("Sim");
    expect(textoDaCelula(col("importado"), linhaGeral())).toBe("Não");
  });

  it("célula sem valor fica vazia (e a tela mostra um traço)", () => {
    const l = linhaGeral({ valor_total: null, destinatario_doc: null, data_emissao: null, situacao: null });
    for (const c of ["valor_total", "destinatario_doc", "data_emissao", "situacao"]) expect(textoDaCelula(col(c), l), c).toBe("");
  });

  it("quantidade tem até 4 casas; no CSV o ponto de milhar some e a vírgula fica", () => {
    const q = colunasProdutos("itens").find((c) => c.chave === "quantidade");
    expect(textoDaCelula(q, { quantidade: 1234.5678 })).toBe("1.234,5678");
    expect(textoDaCelula(q, { quantidade: 1234.5678 }, { csv: true })).toBe("1234,5678");
    expect(textoDaCelula(col("valor_total"), { valor_total: 1234.5 }, { csv: true })).toBe("1234,50");
  });

  it("no Excel vão a data de verdade e os números de verdade, para ordenar e somar", () => {
    expect(valorDoExcel(col("data_emissao"), linhaGeral())).toEqual(new Date(Date.UTC(2026, 10, 5)));
    expect(valorDoExcel(col("valor_total"), linhaGeral())).toBe(1000);
    expect(valorDoExcel(col("valor_total"), linhaGeral({ valor_total: null }))).toBeNull();
    expect(valorDoExcel(col("emitente_nome"), linhaGeral())).toBe("FORNECEDOR AGRO LTDA");
    expect(valorDoExcel(col("serie"), linhaGeral({ serie: "" }))).toBeNull();
  });
});

describe("colunas do relatório de Produtos", () => {
  it("cada agrupamento tem as suas colunas; os itens soltos levam a nota e o item", () => {
    expect(colunasProdutos("itens").map((c) => c.chave)).toEqual([
      "data_emissao", "numero", "serie", "emitente_nome", "emitente_doc", "item", "codigo", "descricao", "ncm", "cfop", "unidade", "quantidade", "valor_unitario",
      "valor_total", "desconto", "valor_icms", "valor_ipi", "chave",
    ]);
    expect(colunasProdutos("produto").map((c) => c.titulo)).toEqual(["Produto", "Un.", "NCM", "CFOP", "Notas", "Itens", "Quantidade", "Valor total (R$)", "Desconto (R$)", "ICMS (R$)", "IPI (R$)"]);
    expect(colunasProdutos("ncm")[0].titulo).toBe("NCM");
    expect(colunasProdutos("cfop")[0].titulo).toBe("CFOP");
    // somar quantidade de unidades diferentes não faz sentido: por NCM e por CFOP não há coluna de quantidade
    expect(colunasProdutos("ncm").some((c) => c.chave === "quantidade")).toBe(false);
    expect(colunasProdutos("desconhecido")).toEqual(colunasProdutos("itens"));
  });
});

describe("CSV", () => {
  it("ponto e vírgula, vírgula decimal, aspas só onde precisa e quebra de linha do Windows", () => {
    const csv = linhasParaCsv(COLUNAS_GERAL.filter((c) => ["numero", "emitente_nome", "valor_total", "situacao"].includes(c.chave)), [
      linhaGeral({ emitente_nome: 'AGRO "BOA SAFRA"; COMERCIO', valor_total: 1250.5 }),
      linhaGeral({ numero: "124", emitente_nome: "SEM ASPAS", valor_total: 2000, situacao: "CANCELADA" }),
    ]);
    expect(csv.split("\r\n")).toEqual([
      "Número;Emitente;Valor (R$);Situação",
      '123;"AGRO ""BOA SAFRA""; COMERCIO";1250,50;Autorizada',
      "124;SEM ASPAS;2000,00;Cancelada",
    ]);
  });
});

describe("planilha do Excel", () => {
  it("cabeçalho verde, datas e números de verdade, total que acompanha o filtro, filtro automático e linha congelada", async () => {
    const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
    const g = geral();
    const wb = montarPlanilha(ExcelJS, [
      { nome: "Resumo", titulo: "Resumo", linhasDeTexto: ["Empresa X"], colunas: COLUNAS_RESUMO_GERAL, linhas: g.resumo.por_documento, totais: false },
      { nome: "Documentos", titulo: "Relatório Geral — documentos", linhasDeTexto: ["Empresa X", "Período de emissão: 01/11/2026 a 30/11/2026"], colunas: COLUNAS_GERAL, linhas: g.linhas },
    ]);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Documentos"]);

    const ws = wb.getWorksheet("Documentos");
    expect(ws.getCell("A1").value).toBe("Relatório Geral — documentos");
    expect(ws.getCell("A2").value).toBe("Empresa X");
    const cab = 5; // 1 título + 2 linhas de texto + 1 em branco
    expect(ws.getCell(cab, 1).value).toBe("Emissão");
    expect(ws.getCell(cab, 1).fill.fgColor.argb).toBe("FF1E764D");
    expect(ws.getCell(cab, 1).font.color.argb).toBe("FFFFFFFF");
    expect(ws.getCell(cab + 1, 1).value).toEqual(new Date(Date.UTC(2026, 10, 5)));
    expect(ws.getCell(cab + 1, 1).numFmt).toBe("dd/mm/yyyy");
    const colValor = COLUNAS_GERAL.findIndex((c) => c.chave === "valor_total") + 1;
    expect(ws.getCell(cab + 1, colValor).value).toBe(1000);
    expect(ws.getCell(cab + 1, colValor).numFmt).toBe("#,##0.00");
    // total: SUBTOTAL(109), que só soma o que está visível depois de filtrar, já com o valor calculado
    const total = ws.getCell(cab + 3, colValor).value;
    expect(total.formula).toBe(`SUBTOTAL(109,${ws.getColumn(colValor).letter}${cab + 1}:${ws.getColumn(colValor).letter}${cab + 2})`);
    expect(total.result).toBe(3500);
    expect(ws.getCell(cab + 3, 1).value).toBe("Total");
    expect(ws.autoFilter).toEqual({ from: { row: cab, column: 1 }, to: { row: cab + 2, column: COLUNAS_GERAL.length } });
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: cab });

    // a aba do resumo não leva linha de total
    const resumo = wb.getWorksheet("Resumo");
    expect(resumo.getCell(4, 1).value).toBe("Documento");
    expect(resumo.getCell(7, 1).value).toBeNull();

    // vai para o arquivo e volta com os mesmos dados
    const buf = await wb.xlsx.writeBuffer();
    const lido = new ExcelJS.Workbook();
    await lido.xlsx.load(buf);
    expect(lido.getWorksheet("Documentos").getCell(cab + 1, 5).value).toBe("FORNECEDOR AGRO LTDA");
    expect(lido.getWorksheet("Documentos").getCell(cab + 1, colValor).value).toBe(1000);
  });

  it("sem linhas não cria total nem filtro", async () => {
    const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
    const wb = montarPlanilha(ExcelJS, [{ nome: "Produtos", titulo: "Relatório de Produtos", linhasDeTexto: [], colunas: colunasProdutos("itens"), linhas: [] }]);
    const ws = wb.getWorksheet("Produtos");
    expect(ws.autoFilter).toBeFalsy();
    expect(ws.getCell(3, 1).value).toBe("Emissão"); // título, uma linha em branco e o cabeçalho
    expect(ws.getCell(4, 1).value).toBeNull();
  });
});

describe("tela do relatório Geral", () => {
  it("mostra os totais, o resumo por documento, a lista e os botões de arquivo", () => {
    const html = renderizar(<ResultadoGeral dados={geral()} aoBaixar={() => {}} baixando={null} />);
    expect(html).toContain("Documentos");
    expect(html).toContain(">6<");
    expect(html).toContain("R$"); // valor das autorizadas
    expect(html).toContain("3.580,50");
    expect(html).toContain("Canceladas");
    expect(html).toContain("Por documento");
    for (const c of COLUNAS_RESUMO_GERAL) expect(html, c.titulo).toContain(c.titulo);
    // a lista da tela leva só as colunas principais; o Excel e o CSV levam todas
    for (const t of ["Emissão", "Documento", "Número", "Emitente", "Valor (R$)", "Situação", "Origem", "No importador"]) expect(html, t).toContain(`>${t}<`);
    for (const t of ["Chave de acesso", "CNPJ/CPF do destinatário"]) expect(html, t).not.toContain(`>${t}<`);
    for (const v of ["05/11/2026", "FORNECEDOR AGRO LTDA", "1.000,00", "Autorizada", "Cancelada", "Importação", "Captura"]) expect(html, v).toContain(v);
    expect(html).toContain("Baixar Excel");
    expect(html).toContain("Baixar CSV");
  });

  it("sem documentos, diz isso e não oferece arquivo", () => {
    const vazio = { resumo: { documentos: 0, valor_autorizadas: 0, canceladas: 0, por_documento: [] }, linhas: [], truncado: false };
    const html = renderizar(<ResultadoGeral dados={vazio} aoBaixar={() => {}} baixando={null} />);
    expect(html).toContain("Nenhum documento nos filtros escolhidos.");
    expect(html).not.toContain("Baixar Excel");
  });

  it("a tela mostra as primeiras 500 linhas e avisa que o arquivo traz todas; o corte do servidor também é avisado", () => {
    const muitas = geral({ linhas: Array.from({ length: 600 }, (_, i) => linhaGeral({ id: `d${i}`, numero: String(i + 1) })), truncado: true });
    const html = renderizar(<ResultadoGeral dados={muitas} aoBaixar={() => {}} baixando={null} />);
    const tabelaDeDocumentos = html.slice(html.indexOf('aria-label="Documentos do período"'));
    expect(tabelaDeDocumentos.match(/<tr /g)).toHaveLength(501); // o cabeçalho e 500 linhas
    expect(html).toContain("Mostrando as primeiras 500 de 600 linhas. O Excel e o CSV trazem todas.");
    expect(html).toContain("A lista foi cortada no limite de 600 linhas");
  });

  it("enquanto o arquivo é gerado, o botão certo mostra que está trabalhando e os dois ficam desligados", () => {
    const html = renderizar(<ResultadoGeral dados={geral()} aoBaixar={() => {}} baixando="xlsx" />);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("animate-spin");
  });
});

describe("tela do relatório de Produtos", () => {
  const produtos = (extra = {}) => ({
    modo: "itens", resumo: { notas: 2, notas_com_falha: 0, itens: 2, valor_total: 2252.26, desconto: 0 },
    linhas: [linhaProduto(), linhaProduto({ numero: "124", item: "2", codigo: "P0002", descricao: "HERBICIDA GLIFOSATO 480 G/L", valor_total: 1259.5, quantidade: 11 })],
    grupos: [], truncado: false, falhas: [], ...extra,
  });

  it("itens soltos: cartões, colunas principais da tela e os botões de arquivo", () => {
    const html = renderizar(<ResultadoProdutos dados={produtos()} aoBaixar={() => {}} baixando={null} />);
    for (const t of ["Notas lidas", "Itens", "Valor total dos itens", "Notas que não deu para ler"]) expect(html, t).toContain(t);
    expect(html).toContain("R$ 2.252,26"); // a moeda em pt-BR separa o R$ do número com espaço sem quebra
    for (const t of ["Emissão", "NF", "Emitente", "Código", "Descrição", "NCM", "CFOP", "Un.", "Quantidade", "Valor total (R$)"]) expect(html, t).toContain(`>${t}<`);
    expect(html).not.toContain(">Chave de acesso<"); // só no arquivo
    for (const v of ["SOJA EM GRAOS CLASSIFICADA", "HERBICIDA GLIFOSATO 480 G/L", "12019000", "5102", "10,5", "1.126,13"]) expect(html, v).toContain(v);
    expect(html).toContain("Itens das notas");
    expect(html).toContain("Baixar Excel");
  });

  it("somado por produto: uma linha por produto, com notas e itens", () => {
    const dados = produtos({
      modo: "produto", linhas: [],
      grupos: [{ chave: "SOJA|SC", descricao: "SOJA EM GRAOS CLASSIFICADA", ncm: "12019000", cfop: "5102", unidade: "SC", produtos: 1, notas: 2, itens: 2, quantidade: 21, valor_total: 2252.26, desconto: 0, valor_icms: 270.28, valor_ipi: 0 }],
    });
    const html = renderizar(<ResultadoProdutos dados={dados} aoBaixar={() => {}} baixando={null} />);
    expect(html).toContain("Somados por produto");
    for (const t of ["Produto", "Notas", "Itens", "Quantidade", "Valor total (R$)"]) expect(html, t).toContain(`>${t}<`);
    expect(html).toContain("2.252,26");
    expect(html).not.toContain(">Código<");
  });

  it("somado por NCM: o título diz NCM", () => {
    const dados = produtos({ modo: "ncm", linhas: [], grupos: [{ chave: "12019000", descricao: "SOJA", ncm: "12019000", cfop: "5102", unidade: "SC", produtos: 3, notas: 2, itens: 6, quantidade: 0, valor_total: 7571.52, desconto: 0, valor_icms: 0, valor_ipi: 0 }] });
    const html = renderizar(<ResultadoProdutos dados={dados} aoBaixar={() => {}} baixando={null} />);
    expect(html).toContain("Somados por NCM");
    expect(html).toContain("12019000");
  });

  it("notas que não deu para ler ficam numa lista, com o motivo, e o cartão avisa", () => {
    const dados = produtos({ resumo: { notas: 1, notas_com_falha: 3, itens: 2, valor_total: 10, desconto: 0 }, falhas: [{ chave: CHAVE, motivo: "O XML não é uma NF-e (modelo 55)." }] });
    const html = renderizar(<ResultadoProdutos dados={dados} aoBaixar={() => {}} baixando={null} />);
    expect(html).toContain("Notas que não deu para ler (3)");
    expect(html).toContain(CHAVE);
    expect(html).toContain("O XML não é uma NF-e (modelo 55).");
    expect(html).toContain("… e mais 2.");
    expect(html).toContain("border-amber-400/60");
  });

  it("sem itens, diz isso e não oferece arquivo", () => {
    const dados = produtos({ resumo: { notas: 0, notas_com_falha: 0, itens: 0, valor_total: 0, desconto: 0 }, linhas: [] });
    const html = renderizar(<ResultadoProdutos dados={dados} aoBaixar={() => {}} baixando={null} />);
    expect(html).toContain("Nenhum item nos filtros escolhidos.");
    expect(html).not.toContain("Baixar CSV");
  });
});

describe("RelatoriosXml (filtros)", () => {
  const hoje = new Date(2026, 10, 11);

  it("abre no relatório Geral, com o período do mês, os filtros dele e o botão que gera (nada roda sozinho)", () => {
    const html = renderizar(<RelatoriosXml empresaId="E1" empresa={{ id_empresa: "EMP-1", razao_social: "EMPRESA TESTE" }} hoje={hoje} />);
    expect(html).toContain("Relatórios");
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>Geral</);
    expect(html).toMatch(/role="tab" aria-selected="false"[^>]*>Produtos</);
    expect(html).toContain('value="2026-11-01"');
    expect(html).toContain('value="2026-11-11"');
    for (const t of ["Emissão de", "até", "Documento", "Situação", "Origem", "Contar também os que só têm o resumo"]) expect(html, t).toContain(t);
    expect(html).toContain("NF-e | NFC-e");
    expect(html).toContain("Gerar relatório");
    expect(html).toContain("Escolha o período e os filtros e clique em Gerar relatório.");
    expect(html).not.toContain("Somar por");
    expect(html).not.toContain("Baixar Excel");
  });

  it("explica cada relatório em uma linha", () => {
    const html = renderizar(<RelatoriosXml empresaId="E1" empresa={null} hoje={hoje} />);
    expect(html).toContain("Quantos documentos, de que tipo, em que situação e quanto valem, com a lista de cada um.");
  });
});
