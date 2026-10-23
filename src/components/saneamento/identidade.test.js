import { describe, expect, it } from "vitest";
import { chaveDe, chaveDeId, idItem, identificavel, indexar, itemPorId, motivoSemIdentidade, origemCompleta, partirChave, precisaMigrar, semChavesAntigas, temDadosPorChave, textoOrigem, versaoDasChaves } from "./identidade";

const item = (linha, codigo, extra = {}) => ({ linha, codigo, descricao: `ITEM ${linha}`, ...extra });

describe("identidade do item: o código do ERP, sempre como texto", () => {
  it("preserva zeros à esquerda e códigos alfanuméricos; tira só os espaços das pontas", () => {
    expect(idItem(item(2, "00123"))).toBe("00123"); expect(idItem(item(2, "  A-77/B "))).toBe("A-77/B");
    expect(idItem(item(2, 12))).toBe("12"); expect(idItem({})).toBe(""); expect(idItem(null)).toBe("");
    expect(idItem(item(2, "00123"))).not.toBe(idItem(item(3, "123"))); // 00123 e 123 são itens diferentes
  });
  it("a chave de decisão é código|critério e o critério é o que vem depois da última barra", () => {
    expect(chaveDe(item(2, "00123"), "padrao")).toBe("00123|padrao"); expect(chaveDeId("X1", "unidade")).toBe("X1|unidade");
    expect(partirChave("00123|padrao")).toEqual({ id: "00123", crit: "padrao" });
    expect(partirChave("A|B|duplicidade")).toEqual({ id: "A|B", crit: "duplicidade" }); // código com barra
    expect(partirChave(chaveDe(item(2, "A|B"), "ncm"))).toEqual({ id: "A|B", crit: "ncm" });
    expect(partirChave("semcritério")).toEqual({ id: "semcritério", crit: "" });
  });
});

describe("índice dos itens da base", () => {
  const itens = [item(2, "A1"), item(3, "A2"), item(4, "A1"), item(5, ""), item(6, "  "), item(7, "00123")];
  const ix = indexar(itens);
  it("indexa por código e por linha, e separa o código repetido e o item sem código", () => {
    expect(ix.porLinha.get(3).codigo).toBe("A2"); expect(ix.porId.get("00123").linha).toBe(7);
    expect([...ix.repetidos]).toEqual(["A1"]); expect(ix.semCodigo).toBe(2);
  });
  it("código repetido ou ausente não identifica o item: não serve de âncora para decisão", () => {
    expect(identificavel(itens[1], ix)).toBe(true); expect(identificavel(itens[0], ix)).toBe(false); expect(identificavel(itens[3], ix)).toBe(false);
    expect(itemPorId(ix, "A2").linha).toBe(3); expect(itemPorId(ix, "A1")).toBeNull(); expect(itemPorId(ix, "ZZ")).toBeNull();
    expect(motivoSemIdentidade(itens[3], ix)).toContain("sem código"); expect(motivoSemIdentidade(itens[0], ix)).toContain("mais de uma vez"); expect(motivoSemIdentidade(itens[1], ix)).toBe("");
  });
  it("a mesma lista devolve o mesmo índice (calculado uma vez)", () => {
    expect(indexar(itens)).toBe(ix); expect(indexar([])).not.toBe(ix); expect(indexar(null).porId.size).toBe(0);
  });
});

describe("origem dos dados e versão das chaves do projeto", () => {
  it("a origem só vale com o ERP, a instância e a empresa", () => {
    expect(origemCompleta({ erp: "SAP B1", instancia: "CRESTANI_PRD", empresa: "Crestani Agro" })).toBe(true);
    expect(origemCompleta({ erp: "SAP B1", instancia: " ", empresa: "Crestani" })).toBe(false); expect(origemCompleta(undefined)).toBe(false);
    expect(textoOrigem({ erp: "SAP B1", instancia: "CRESTANI_PRD", empresa: "Crestani Agro" })).toBe("SAP B1 · CRESTANI_PRD · Crestani Agro"); expect(textoOrigem({})).toBe("origem não declarada");
  });
  it("projeto antigo com decisão por linha precisa migrar; projeto vazio nasce no formato novo; a versão gravada manda", () => {
    expect(versaoDasChaves({ decisoes: { "12|padrao": { status: "APR" } } })).toBe(1); expect(precisaMigrar({ decisoes: { "12|padrao": {} } })).toBe(true);
    expect(versaoDasChaves({ execucao: { registros: { "12|inativacao": {} } } })).toBe(1); expect(versaoDasChaves({ fiscal: { decisoes: { 12: {} } } })).toBe(1);
    expect(versaoDasChaves({})).toBe(2); expect(precisaMigrar({ decisoes: {}, execucao: { registros: {} }, fiscal: { decisoes: {} } })).toBe(false);
    expect(versaoDasChaves({ versaoChaves: 2, decisoes: { "A1|padrao": {} } })).toBe(2); expect(precisaMigrar({ versaoChaves: 1, decisoes: {} })).toBe(true);
    expect(temDadosPorChave({})).toBe(false);
  });
  it("sem as chaves antigas: o que está guardado pela linha nunca é lido como código", () => {
    const e = { decisoes: { "12|padrao": { status: "APR" } }, execucao: { tipos: { unidade: { incluir: false } }, registros: { "12|padrao": { adm: {} } } }, fiscal: { decisoes: { 12: { acao: "ACEITAR" } }, grupos: { G: { por: "a" } } }, criterios: { padrao: { aprovado: true } } };
    const s = semChavesAntigas(e);
    expect(s.decisoes).toEqual({}); expect(s.execucao.registros).toEqual({}); expect(s.fiscal.decisoes).toEqual({});
    expect(s.execucao.tipos).toEqual({ unidade: { incluir: false } }); expect(s.fiscal.grupos).toEqual({ G: { por: "a" } }); expect(s.criterios).toEqual(e.criterios);
    expect(e.decisoes["12|padrao"]).toBeTruthy(); // o original não é alterado
  });
});
