import { describe, expect, it } from "vitest";
import { aplicarEscopo, agruparPorGrupo, criarTestes } from "./logica";
import { calcularAchados, contarAchados } from "./analise";
import { COLUNAS_REGRAS, SECOES, montarPolitica } from "./politica";
import { criarWorkbookPolitica } from "./politicaXlsx";

const item = (linha, extra = {}) => ({ linha, codigo: `C${linha}`, descricao: "PARAFUSO", unidade: "UN", grupo_atual: "Peças", ultima_mov: "2026-03-01", problemas: [], ...extra });
const itens = [item(2), item(3, { unidade: "KG", grupo_atual: "Insumos" })];
const aprov = { aprovado: true, por: "ana", em: "2026-10-20" };
const estado = { params: { desde: "2025-01-01" }, criterios: { padrao: aprov, identidade: aprov, saldos: aprov, cartilhas: aprov }, tratados: Object.fromEntries(["identidade", "saldos", "cartilhas"].map((c) => [`Peças|${c}`, { por: "ana", em: "2026-10-23", resultado: "SEM_ACHADOS", nota: "conferido no ERP" }])), decisoes: {}, saneados: { "Peças": true }, piloto: {},
  padronizacao: { regras: {}, abreviacoes: { sext: { para: "SEXTAVADO", aprovada: true } } }, politica: { secoes: Object.fromEntries(SECOES.map((s) => [s.id, { responsavel: "Gestor", controle: "Revisão semestral" }])), aprovada: { por: "ana", em: "2026-10-23" }, grupos: { "Insumos": { regra: "Adubo só em KG" } } } };
const escopo = aplicarEscopo(itens, estado.params);
const contagem = contarAchados(calcularAchados(escopo.emEscopo, criarTestes(escopo.emEscopo, estado)), escopo.emEscopo.length);
const politica = montarPolitica({ estado, contagem, escopo, grupos: agruparPorGrupo(escopo.emEscopo), nomeProjeto: "Projeto X", nomeBase: "itens.xlsx" });

describe("política em Excel", () => {
  it("resumo com a situação e as pendências, regras por procedimento, por grupo, padrão de descrição e unidades", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(await criarWorkbookPolitica(ExcelJS, politica, { nomeProjeto: "Projeto X", nomeBase: "itens.xlsx" }).xlsx.writeBuffer());
    expect(lido.worksheets.map((w) => w.name)).toEqual(["Resumo", "Procedimentos e regras", "Por grupo", "Padrão de descrição", "Unidades"]);
    const texto = (nome) => { const t = []; lido.getWorksheet(nome).eachRow((r) => t.push(r.values.slice(1).map((v) => v ?? "").join(" | "))); return t; };
    const resumo = texto("Resumo");
    expect(resumo).toContain("Situação | Aprovada"); expect(resumo.some((t) => t.startsWith("Aprovada por | ana em"))).toBe(true); expect(resumo.some((t) => t.startsWith("Atenção | Proposta de política"))).toBe(true);
    expect(resumo.some((t) => t.includes("ainda não foi aprovado"))).toBe(false); // nenhum critério pendente: os manuais foram aprovados e os automáticos abriram aprovados
    const regras = lido.getWorksheet("Procedimentos e regras");
    expect(regras.getRow(1).values.slice(1)).toEqual(COLUNAS_REGRAS.map(([t]) => t)); expect(regras.rowCount).toBe(1 + politica.secoes.reduce((n, s) => n + s.regras.length, 0));
    expect(regras.getRow(2).getCell(1).value).toBe("Criar o cadastro"); expect(regras.getRow(2).getCell(5).value).toBe("Gestor"); expect(regras.autoFilter).toBe("A1:F1");
    const grupos = texto("Por grupo"); expect(grupos).toContain("Peças | 1 | Sim | Em revisão | 0 | "); expect(grupos).toContain("Insumos | 1 | Não | Não liberado | 3 | Adubo só em KG"); // Insumos ainda não concluiu os três critérios de conferência manual
    const pd = texto("Padrão de descrição"); expect(pd).toContain("Formato | NOME + REFERENCIA + COMPLEMENTO"); expect(pd).toContain("SEXT | SEXTAVADO"); expect(pd.some((t) => t.startsWith("Caixa alta | Sim"))).toBe(true);
    expect(pd.some((t) => t.includes("(ex.:"))).toBe(false);
    const un = texto("Unidades"); expect(un).toContain("massa | KG"); expect(un.some((t) => t.startsWith("UN | 1 |"))).toBe(true);
  });
});
