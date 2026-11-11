import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import AnaliseRiscoPagina from "./AnaliseRiscoPagina";
import PreAnalisePagina, { leituraDoCnae, linhasDaPreAnalise } from "@/pages/comercial/PreAnalisePagina";
import PrimeirosPassos, { PASSOS } from "@/components/inicio/PrimeirosPassos";
import ModuloEmBreve from "@/pages/ModuloEmBreve";
import { FUNCOES_PREVISTAS, funcoesDoModulo } from "@/lib/funcoesPlanejadas";

const r = (el, location = "/") => renderToString(<QueryClientProvider client={new QueryClient()}><StaticRouter location={location}>{el}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");

describe("Análise de risco", () => {
  it("abre na calculadora de multas com os tipos, a fonte e o aviso de estimativa", () => {
    const html = r(<AnaliseRiscoPagina />);
    for (const t of ["Calculadora de multas", "Previsto", "Pagamento de tributo federal em atraso", "DCTFWeb entregue em atraso", "ECF do Lucro Real em atraso", "Lei nº 9.430/1996, art. 61", "Estimativa"]) expect(html).toContain(t);
  });
});

describe("Funções previstas (fases 3 e 4 do mapa)", () => {
  it("todas têm módulo e as do monitoramento aparecem na página em breve dele", () => {
    expect(FUNCOES_PREVISTAS.length).toBeGreaterThan(70);
    expect(FUNCOES_PREVISTAS.every((f) => f.modulo && f.id.startsWith("V"))).toBe(true);
    expect(funcoesDoModulo("monitoramento").length).toBeGreaterThan(40);
    const html = renderToString(<MemoryRouter initialEntries={["/em-breve/monitoramento"]}><Routes><Route path="/em-breve/:moduloId" element={<ModuloEmBreve />} /></Routes></MemoryRouter>).replace(/<!-- -->/g, "");
    expect(html).toContain("O que está previsto");
    expect(html).toContain("V001");
    expect(html).toContain("Receita Federal (Integra Contador)");
  });
});

describe("Pré-análise por CNPJ", () => {
  const D = { cnpj: "58509112000152", razao_social: "EXTRA AGRO LTDA", nome_fantasia: "", situacao: "ATIVA", municipio: "SORRISO", uf: "MT", natureza_juridica: "Sociedade Empresária Limitada", porte: "DEMAIS", data_inicio_atividade: "2020-01-01", capital_social: 100000, opcao_pelo_simples: false, opcao_pelo_mei: false, cnae_codigo: "0115600", cnae_descricao: "Cultivo de soja", cnaes_secundarios: [{ codigo: "4623108", descricao: "Comércio atacadista de matérias-primas agrícolas" }], socios: [{ nome: "Fulano", qualificacao: "Sócio-Administrador" }] };
  it("a ficha tem os campos públicos e a leitura do CNAE", () => {
    const l = linhasDaPreAnalise(D);
    expect(l.find((x) => x.campo === "CNPJ").valor).toBe("58.509.112/0001-52");
    expect(l.find((x) => x.campo === "CNAE principal").valor).toBe("0115-6/00 Cultivo de soja");
    expect(l.find((x) => x.campo === "Sócios").valor).toBe("Fulano (Sócio-Administrador)");
    expect(leituraDoCnae("0115600").setor).toMatch(/Agropecuária/);
    expect(leituraDoCnae("4930202").setor).toMatch(/Transporte/);
    expect(leituraDoCnae("9999999").setor).toBe("Outras atividades");
  });
  it("a tela pede o CNPJ", () => {
    expect(r(<PreAnalisePagina />)).toContain("CNPJ do prospect");
  });
});

describe("Primeiros passos", () => {
  it("mostra os passos com o atalho de cada um", () => {
    const html = r(<PrimeirosPassos usuarioId="U1" />);
    expect(html).toContain("Primeiros passos no InTAX");
    expect(html).toContain(`0 de ${PASSOS.length}`);
    for (const p of PASSOS) expect(html).toContain(`href="${p.to}"`);
  });
});
