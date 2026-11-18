import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CalculadoraOficial from "./CalculadoraOficial";

const render = (dados) => {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["calculadora-rfb"], dados);
  return renderToString(<QueryClientProvider client={qc}><CalculadoraOficial /></QueryClientProvider>).replace(/<!-- -->/g, "");
};
const BASE = {
  no_ar: true, versao: { versaoApp: "1.6.1", versaoDb: "V0059", dataVersaoDb: "2026-09-30" }, commit: "150cccb",
  tabelas: { classes: 193, vinculos: 1490, importado_em: "2026-11-18T15:00:00Z" },
  github: { commit: "150cccb", data: "2026-10-22T12:00:00Z", verificado_em: "2026-11-18T15:00:00Z" }, versao_nova: false,
  atualizacao: { situacao: null, pedido: null, bateria: null }, fonte: "https://github.com/ReceitaFederal/calculadora-rtc-regime-regular",
};

describe("Calculadora oficial da Receita (Integrações)", () => {
  it("mostra a comparação das tabelas: contagem por tipo, informativos por último e a lista", () => {
    const html = render({ ...BASE, comparacao: { versao_db: "V0059", comparado_em: "2026-11-18T15:00:00Z", resumo: { "cClassTrib só no InTAX": 8, "Redução CBS divergente": 1 },
      lista: [{ grupo: "Redução CBS divergente", chave: "200038", intax: "50%", oficial: "60%", observacao: "CST 200" }, { grupo: "cClassTrib só no InTAX", chave: "200056", intax: "CST 200", oficial: "—" }] } });
    for (const t of ["Redução CBS divergente: <strong>1</strong>", "cClassTrib só no InTAX: <strong>8</strong>", "(informativo)", "200038", "InTAX: 50%", "Calculadora: 60%"]) expect(html).toContain(t);
    expect(html.indexOf("Redução CBS divergente: <strong>")).toBeLessThan(html.indexOf("cClassTrib só no InTAX: <strong>"));
  });
  it("mostra versão, tabelas copiadas e a última versão do GitHub; sem versão nova não oferece aplicar", () => {
    const html = render(BASE);
    for (const t of ["Ligada", "1.6.1 · banco V0059", "150cccb", "193 classificações e 1490 vínculos NCM/NBS", "Conferir no GitHub"]) expect(html).toContain(t);
    expect(html).not.toContain("Aplicar versão nova");
  });
  it("com versão nova oferece aplicar; com diferença na bateria mostra a lista e pede confirmação", () => {
    expect(render({ ...BASE, versao_nova: true, github: { ...BASE.github, commit: "abc1234" } })).toContain("Aplicar versão nova");
    const html = render({ ...BASE, versao_nova: true, atualizacao: { situacao: { etapa: "AGUARDANDO_CONFIRMACAO", commit: "abc1234" }, pedido: { commit: "abc1234" },
      bateria: { diferencas: 1, casos: 808, versao_antes: { versaoDb: "V0059" }, versao_depois: { versaoDb: "V0060" }, lista: [{ caso: "2027 200038", antes: { vCBS: "1.00" }, depois: { vCBS: "2.00" } }] } } });
    for (const t of ["1 de 808 casos mudam (V0059 → V0060)", "2027 200038", "Confirmar troca"]) expect(html).toContain(t);
  });
});
