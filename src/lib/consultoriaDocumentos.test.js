import { describe, expect, it } from "vitest";
import { linhasDoPeriodo, itensDoServico, arquivoSpedDaLinha } from "./consultoriaDocumentos";

describe("Solicitações de Consultoria", () => {
  it("mantém as duas listas de cruzamentos e os prints de homologação", () => {
    expect(itensDoServico("cruzamentos-pf").some((l) => l.startsWith("LCDPR integral"))).toBe(true);
    expect(itensDoServico("conciliacao-escrituracoes").some((l) => l.startsWith("DIRPF"))).toBe(false);
    for (const id of ["pf-homologacao", "pj-homologacao"]) {
      expect(itensDoServico(id).some((l) => l.includes("Capturas"))).toBe(true);
    }
  });
  it("inclui os meses tocados pelo recorte e separa ECD, ECF e recibos", () => {
    const linhas = linhasDoPeriodo("irpj-csll", "2026-01-15", "2026-03-10");
    expect(linhas.filter((l) => l.item.startsWith("MIT")).map((l) => l.periodo)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(linhas.filter((l) => ["ECD", "ECF"].includes(l.sped)).map((l) => [l.sped, l.recibo, l.periodo])).toEqual([
      ["ECD", false, "2026"], ["ECD", true, "2026"], ["ECF", false, "2026"], ["ECF", true, "2026"],
    ]);
  });
  it("só reconhece o recibo identificado e pertencente ao acervo do cliente", () => {
    const linha = { sped: "ECD", recibo: true, anual: true, periodo: "2026" };
    const sped = [{ escrituracao: "ECD", competencia: "2026", arquivo_id: "dados", arquivos: [
      { id: "dados", tipo: "ESCRITURACAO" }, { id: "recibo", tipo: "RECIBO" },
    ] }];
    expect(arquivoSpedDaLinha(linha, sped, [{ id: "dados" }])).toBeNull();
    expect(arquivoSpedDaLinha(linha, sped, [{ id: "dados" }, { id: "recibo" }])).toBe("recibo");
  });
});
