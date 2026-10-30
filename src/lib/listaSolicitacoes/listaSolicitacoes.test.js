import { describe, it, expect } from "vitest";
import { SERVICOS } from "@/lib/servicosEmpresa";
import { LISTAS, listaDoServico, folhas, validarCatalogo } from "./catalogo";
import { montarPlanilha, nomeArquivo } from "./planilha";
import { dadosDaCapa, dataDoCampo } from "./baixar";

const carregar = async () => (await import("exceljs")).default;
// Fórmula sem resultado em cache (texto vazio) vem só com "formula".
const valor = (c) => (c && typeof c === "object" && "formula" in c ? (c.result ?? "") : c);
const utc = (a, m, d) => new Date(Date.UTC(a, m - 1, d));

/** Linhas de item da aba Solicitações: { num, area, titulo, detalhe, prio, situacao, solicitado, prazo }. */
function linhas(wb) {
  const ws = wb.getWorksheet("Solicitações");
  const r = [];
  for (let i = 4; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    if (row.getCell(3).value === null || row.getCell(3).value === undefined) continue; // linha de seção ou vazia
    r.push({
      linha: i, num: row.getCell(2).value, area: row.getCell(3).value, titulo: valor(row.getCell(4).value), detalhe: valor(row.getCell(5).value),
      prio: row.getCell(6).value, solicitado: valor(row.getCell(7).value), prazo: valor(row.getCell(8).value), situacao: row.getCell(9).value,
    });
  }
  return r;
}

describe("catálogo das listas de solicitações", () => {
  it("cada serviço da tela Serviços e análises tem a sua lista, com o mesmo nome, e nenhuma lista sobra", () => {
    for (const [rota, nome] of SERVICOS) expect(listaDoServico(rota)?.nome, rota).toBe(nome);
    expect(LISTAS.map((l) => l.servico).sort()).toEqual(SERVICOS.map((s) => s[0]).sort());
  });

  it("o catálogo está válido: prioridades certas e toda linha é um documento (não um campo de planilha)", () => {
    expect(validarCatalogo()).toEqual([]);
  });

  it("o validador reprova campo de planilha na coluna de documentos e prioridade inválida", () => {
    const erros = validarCatalogo([{ servico: "x", nome: "X", secoes: [["Área", [["NCM", "", "A"], ["Planilha de produtos do ERP", "", "Z"]]]] }]);
    expect(erros.some((e) => e.includes("deve ser um documento"))).toBe(true);
    expect(erros.some((e) => e.includes("prioridade inválida"))).toBe(true);
  });

  it("a validação de cadastro não lista NCM, código ou descrição como linha: as colunas vão no detalhe da planilha", () => {
    const lista = listaDoServico("validador-cadastro");
    const titulos = folhas(lista).map((i) => i.titulo.toLowerCase());
    for (const campo of ["ncm", "código do produto", "descrição", "unidade de medida", "origem da mercadoria"]) expect(titulos).not.toContain(campo);
    const planilha = folhas(lista).find((i) => i.titulo.startsWith("Planilha com o cadastro de produtos"));
    expect(planilha.detalhe).toContain("Colunas obrigatórias: Código, Descrição e NCM");
  });
});

describe("planilha da lista de solicitações", () => {
  it("monta Capa e Solicitações para cada lista, com um item Pendente por documento e o cabeçalho de documentos", async () => {
    const ExcelJS = await carregar();
    for (const lista of LISTAS) {
      const { wb, itens } = montarPlanilha({ ExcelJS, lista });
      expect(wb.worksheets.map((w) => w.name)).toEqual(["Capa", "Solicitações"]);
      const ws = wb.getWorksheet("Solicitações");
      expect(ws.getRow(3).getCell(4).value).toBe("Documento solicitado");
      const todas = linhas(wb);
      const comStatus = todas.filter((l) => l.situacao !== null && l.situacao !== undefined);
      expect(comStatus.length, lista.servico).toBe(folhas(lista).length);
      expect(itens).toBe(folhas(lista).length);
      expect(comStatus.every((l) => l.situacao === "Pendente")).toBe(true);
      expect(comStatus.every((l) => ["Alta", "Média", "Baixa"].includes(l.prio))).toBe(true);
      expect(ws.getCell(`I${comStatus[0].linha}`).dataValidation.formulae[0]).toBe('"Pendente,Em preparação,Entrega parcial,Entregue,Não aplicável"');
    }
  });

  it("a Capa traz os dados da empresa e os nomes dos prazos usados pelas fórmulas da lista", async () => {
    const ExcelJS = await carregar();
    const empresa = { razao_social: "Agro Exemplo Ltda", cnpj_cpf: "12.345.678/0001-95", regime_atual: "Lucro Real", erp: "Protheus", erp_versao: "12.1.2210" };
    const dados = dadosDaCapa(empresa, { dataBase: "2026-12-31", envio: "2026-11-03", responsavel: " Ana ", contatoFal: "ana@fal.com.br" });
    expect(dados).toMatchObject({ cliente: "Agro Exemplo Ltda", regime: "Lucro Real", erp: "Protheus 12.1.2210", responsavel: "Ana" });
    const { wb } = montarPlanilha({ ExcelJS, lista: listaDoServico("importacao-xml"), dados });
    const capa = wb.getWorksheet("Capa");
    const rotulos = {};
    capa.eachRow((row) => { const l = row.getCell(2).value; if (typeof l === "string") rotulos[l] = valor(row.getCell(3).value); });
    expect(rotulos["Cliente"]).toBe("Agro Exemplo Ltda");
    expect(rotulos["CNPJ"]).toBe("12.345.678/0001-95");
    expect(rotulos["Regime tributário"]).toBe("Lucro Real");
    expect(rotulos["ERP ou emissor e versão"]).toBe("Protheus 12.1.2210");
    expect(rotulos["Período analisado"]).toBe("01/01/2026 a 31/12/2026");
    const nomes = wb.definedNames.model.map((n) => n.name).sort();
    expect(nomes).toEqual(expect.arrayContaining(["PrazoAlta", "PrazoBaixa", "PrazoMedia"]));
  });

  it("com data-base e data de envio, textos e prazos saem preenchidos; sem elas, aparecem os marcadores entre colchetes", async () => {
    const ExcelJS = await carregar();
    const lista = listaDoServico("importacao-xml");
    const cheio = linhas(montarPlanilha({ ExcelJS, lista, dados: { cliente: "X", database: utc(2026, 12, 31), envio: utc(2026, 11, 3) } }).wb);
    const vazio = linhas(montarPlanilha({ ExcelJS, lista }).wb);
    const alvo = (ls) => ls.find((l) => String(l.titulo).startsWith("Documento que comprove o regime"));
    expect(alvo(cheio).titulo).toBe("Documento que comprove o regime de tributação de cada empresa em 2026");
    expect(alvo(vazio).titulo).toBe("Documento que comprove o regime de tributação de cada empresa em [ano]");
    const xml = cheio.find((l) => String(l.titulo).startsWith("XML das NF-e e NFC-e de saída"));
    expect(xml.titulo).toBe("XML das NF-e e NFC-e de saída (vendas), 01/01/2026 a 31/12/2026");
    // Alta = envio + 7 dias; Média = + 14
    const serial = (d) => Math.round(d.getTime() / 86400000) + 25569;
    expect(xml.prazo).toBe(serial(utc(2026, 11, 3)) + 7);
    expect(cheio.find((l) => l.prio === "Média").prazo).toBe(serial(utc(2026, 11, 3)) + 14);
    expect(vazio[0].prazo).toBe("");
  });

  it("os textos com marcador são fórmulas ligadas à Capa (acompanham a data-base) e quebras de linha viram CHAR(10)", async () => {
    const ExcelJS = await carregar();
    const { wb } = montarPlanilha({ ExcelJS, lista: listaDoServico("importacao-xml") });
    const ws = wb.getWorksheet("Solicitações");
    const linhaXml = linhas(wb).find((l) => String(l.titulo).startsWith("XML das NF-e e NFC-e de saída")).linha;
    expect(ws.getCell(`D${linhaXml}`).value.formula).toMatch(/^"XML das NF-e e NFC-e de saída \(vendas\), "&Capa!\$C\$\d+$/);
    // item cujo detalhe tem quebras de linha e nenhum marcador: texto simples com \n
    const planilha = linhas(wb).find((l) => String(l.titulo).startsWith("Alternativa aos XML"));
    expect(String(planilha.detalhe)).toContain("\nObrigatórias: Data, Entrada/Saída e Valor.");
  });

  it("o arquivo gravado e relido mantém as duas abas, as fórmulas e a validação de situação", async () => {
    const ExcelJS = await carregar();
    const { wb } = montarPlanilha({ ExcelJS, lista: listaDoServico("validador-nfse"), dados: { cliente: "Prestadora Exemplo", database: utc(2026, 12, 31), envio: utc(2026, 11, 3) } });
    const buf = await wb.xlsx.writeBuffer();
    const lido = new ExcelJS.Workbook();
    await lido.xlsx.load(buf);
    expect(lido.worksheets.map((w) => w.name)).toEqual(["Capa", "Solicitações"]);
    const todas = linhas(lido);
    const filho = todas.find((l) => l.num === "1.1");
    expect(filho.titulo).toBe("XML de prestação a tomador pessoa jurídica (contribuinte)");
    expect(filho.situacao).toBe("Pendente");
    const pai = todas.find((l) => l.num === 1);
    expect(pai.situacao === null || pai.situacao === undefined).toBe(true); // o item com subitens é só o título do grupo
    expect(lido.getWorksheet("Solicitações").getCell(`H${filho.linha}`).value.formula).toContain("PrazoAlta");
  });

  it("a logo, quando informada, entra nas duas abas", async () => {
    const ExcelJS = await carregar();
    // PNG de 1x1 pixel
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const { wb } = montarPlanilha({ ExcelJS, lista: listaDoServico("validador-cadastro"), logo: png });
    expect(wb.getWorksheet("Capa").getImages().length).toBe(1);
    expect(wb.getWorksheet("Solicitações").getImages().length).toBe(1);
    const sem = montarPlanilha({ ExcelJS, lista: listaDoServico("validador-cadastro") }).wb;
    expect(sem.getWorksheet("Capa").getImages().length).toBe(0);
  });

  it("o nome do arquivo usa o serviço e o cliente, sem caracteres proibidos nem ponto no fim", () => {
    const lista = listaDoServico("validador-cadastro");
    expect(nomeArquivo(lista, { cliente: "Cliente S.A." })).toBe("Lista de Solicitações - Validação de cadastro - Cliente S.A.xlsx");
    expect(nomeArquivo(lista, { cliente: "A/B: C*D?" })).toBe("Lista de Solicitações - Validação de cadastro - A-B- C-D-.xlsx");
    expect(nomeArquivo(lista, {}, 2)).toBe("Lista de Solicitações - 02 - Validação de cadastro.xlsx");
    expect(nomeArquivo(lista, { cliente: "X".repeat(80) }).length).toBeLessThan(110);
  });

  it("a data do campo vira Date em UTC e valor inválido vira null", () => {
    expect(dataDoCampo("2026-12-31").toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(dataDoCampo("")).toBeNull();
    expect(dataDoCampo("31/12/2026")).toBeNull();
  });
});
