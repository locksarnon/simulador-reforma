import { describe, expect, it } from "vitest";
import { decidirIa, ehBuscaDeArtigo, etiquetasDoAchado, limparConsulta, MOTIVO_SEM_IA, normasConsultaveis } from "./consultaLegal";

describe("barra de consulta das bases legais", () => {
  it("limpa espaços e corta no limite da pergunta", () => {
    expect(limparConsulta("  ouro   paga \n IBS?  ")).toBe("ouro paga IBS?");
    expect(limparConsulta(null)).toBe("");
    expect(limparConsulta("a".repeat(900))).toHaveLength(600);
  });

  it("reconhece a busca de um artigo pelo número, que não precisa da IA", () => {
    for (const t of ["art 164", "Art. 12-A", "artigo 164 da LC 214", "arts. 3 e 4", "ART.5"]) expect(ehBuscaDeArtigo(t), t).toBe(true);
    for (const t of ["ouro paga IBS?", "o art. 164 da LC 214 se aplica ao produtor rural que ultrapassou o limite de receita?", "artigos sobre crédito presumido", "qual o art 164"]) expect(ehBuscaDeArtigo(t), t).toBe(false);
  });

  it("a IA só responde ligada, com pergunta de verdade e fora da busca de artigo; o motivo explica o resto", () => {
    expect(decidirIa("ouro paga IBS?", true)).toEqual({ roda: true, motivo: null });
    expect(decidirIa("ouro paga IBS?", false)).toEqual({ roda: false, motivo: "desligada" });
    expect(decidirIa("art 164", true)).toEqual({ roda: false, motivo: "artigo" });
    expect(decidirIa("IBS?", true)).toEqual({ roda: false, motivo: "curta" });
    expect(MOTIVO_SEM_IA.desligada).toBe("");
    expect(MOTIVO_SEM_IA.artigo).toContain("sem precisar da IA");
    expect(MOTIVO_SEM_IA.curta).toContain("pelo menos 8 caracteres");
  });

  it("achado revogado, de norma revogada ou com parte revogada vem etiquetado; em vigor, sem etiqueta", () => {
    expect(etiquetasDoAchado({ revogado: true }).map((e) => e.rotulo)).toEqual(["Revogado"]);
    expect(etiquetasDoAchado({ revogado: true, norma_situacao: "revogada" }).map((e) => e.rotulo)).toEqual(["Norma revogada", "Revogado"]);
    expect(etiquetasDoAchado({ parcialmente_revogado: true })).toEqual([{ chave: "parcial", rotulo: "Parte revogada", classe: "ambar" }]);
    expect(etiquetasDoAchado({ revogado: false, parcialmente_revogado: false, norma_situacao: "parcialmente_revogada" })).toEqual([]);
    expect(etiquetasDoAchado(null)).toEqual([]);
  });

  it("só as normas com texto por artigo entram na escolha da norma da busca", () => {
    const normas = [{ chave: "a", total_dispositivos: 10, formato: "html" }, { chave: "b", total_dispositivos: 0, formato: "html" }, { chave: "c", total_dispositivos: 5, formato: "externo" }, { chave: "d", total_dispositivos: 7, formato: "pdf" }];
    expect(normasConsultaveis(normas).map((n) => n.chave)).toEqual(["a", "d"]);
    expect(normasConsultaveis(undefined)).toEqual([]);
  });
});
