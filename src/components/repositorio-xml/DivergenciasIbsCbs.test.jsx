import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DivergenciasIbsCbs, { achadoDoItem } from "./DivergenciasIbsCbs";

const DADOS = {
  versao: { versaoApp: "1.6.1", versaoDb: "V0059" }, resumo: { DIVERGENTE: 1, CONFERE: 2 }, pendentes: 3,
  linhas: [{ id: "a1", chave: "4126", data_emissao: "2026-10-10T13:00:00Z", papel: "EMITIDA", emitente_nome: "EMPRESA", situacao: "DIVERGENTE", itens_divergentes: 1, vbc_nota: 1000, vbc_oficial: 787.5, ibs_nota: 1, ibs_oficial: 0.79, cbs_nota: 9, cbs_oficial: 7.09,
    detalhes: [{ numero: 2, ncm: "84714900", descricao: "Produto 2", cst: "000", cClassTrib: "000001", situacao: "DIVERGENTE", campos: [{ campo: "Base de cálculo", nota: 1000, oficial: 787.5 }], erros: [] }] }],
};
const render = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["auditoria-ibscbs", "E1", "2026-10-01", "2026-10-31"], DADOS);
  return renderToString(<QueryClientProvider client={qc}><DivergenciasIbsCbs empresaId="E1" datas={{ de: "2026-10-01", ate: "2026-10-31" }} /></QueryClientProvider>).replace(/<!-- -->/g, "");
};

describe("Divergências IBS/CBS", () => {
  it("resume por situação, avisa as pendentes e lista notas e itens com o achado oficial", () => {
    const html = render();
    for (const t of ["Valor divergente", "Confere", "3 notas aguardando conferência", "versão 1.6.1, banco V0059", "Notas conferidas", "Itens com achado", "Base de cálculo: nota 1000 × oficial 787.5"]) expect(html).toContain(t);
  });
  it("o achado mostra o erro oficial de enquadramento quando houver", () => {
    expect(achadoDoItem({ situacao: "ENQUADRAMENTO", erros: [{ codigo: "REG-011", mensagem: "NCM não vinculada" }] })).toBe("REG-011: NCM não vinculada");
  });
});
