import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HomologacaoErp, { achadosEmTexto } from "./HomologacaoErp";

const CHAVE = "41261100000000000191550010000000011000000011";
const DADOS = {
  versao: { versaoApp: "1.6.1", versaoDb: "V0059" }, empresas: [{ id: "E1", razao_social: "EMPRESA TESTE" }], aguardando: 3, conferidas: 7,
  resumo: { cenarios: 3, aprovados: 1, reprovados: 1, nao_cobertos: 1, sem_destaque: 0, notas: 7, itens: 20, homologacao_ignoradas: 2 },
  cenarios: [
    { empresa_id: "E1", cst: "000", cClassTrib: "000001", cfop: "5102", notas: 4, itens: 12, aprovados: 10, reprovados: 2, nao_cobertos: 0, sem_destaque: 0, situacao: "REPROVADO",
      achados: [{ tipo: "DIVERGENTE", regra: "Base de cálculo", texto: "Base de cálculo: nota 3.19 × oficial 2.9", ocorrencias: 2, exemplo: { chave: CHAVE, item: 3 } }] },
    { empresa_id: "E1", cst: "200", cClassTrib: "200003", cfop: "5101", notas: 2, itens: 6, aprovados: 6, reprovados: 0, nao_cobertos: 0, sem_destaque: 0, situacao: "APROVADO", achados: [] },
  ],
};
const render = (dados = DADOS) => {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["homologacao-erp", "P1"], dados);
  return renderToString(<QueryClientProvider client={qc}><HomologacaoErp projetoId="P1" /></QueryClientProvider>).replace(/<!-- -->/g, "");
};

describe("Homologação do ERP", () => {
  it("mostra o resumo, a versão da calculadora, as notas aguardando e os cenários com o achado oficial", () => {
    const html = render();
    for (const t of ["Reprovado", "Aprovado", "Cenários", "calculadora oficial 1.6.1 (banco V0059)", "3 notas aguardando conferência", "2 notas de homologação ignoradas", "000 / 000001", "5102", "Base de cálculo: nota 3.19 × oficial 2.9 (2 itens; ex.: nota 412611…000011, item 3)"]) expect(html).toContain(t);
  });
  it("o achado de enquadramento mostra o código oficial", () => {
    expect(achadosEmTexto({ achados: [{ tipo: "ENQUADRAMENTO", regra: "REG-011", texto: "NCM não vinculada", ocorrencias: 1, exemplo: { chave: CHAVE, item: 1 } }] })).toContain("REG-011: NCM não vinculada (1 item;");
  });
});
