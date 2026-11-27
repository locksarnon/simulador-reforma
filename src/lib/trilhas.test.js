import { describe, expect, it } from "vitest";
import {
  clienteDoProjeto, finalizar, rotaDeAbrirProjeto, rotaSaneamento, rotuloDoProjeto, telasDoSaneamento, trilhaDaConsultoria, trilhaDoCliente, trilhaDoProjeto,
} from "./trilhas";
import { normalizarCrumbs } from "@/components/PageHeader";

const rotulos = (t) => t.map((c) => c.label).join(" > ");
const CRESTANI = { publico: "PJ", id: "e1", nome: "AGROPECUARIA CRESTANI LTDA" };
const PROJETO = { id: "p9", nome: "Saneamento de estoques com foco em IBS e CBS · AGROPECUARIA CRESTANI LTDA", servico_consultoria: "saneamento-estoques", empresa_ids: ["e1"] };

describe("trilha padrão da Consultoria", () => {
  it("página do cliente: Início > Consultoria Tributária > Carteira de Consultoria > cliente (sem link)", () => {
    const t = trilhaDoCliente(CRESTANI);
    expect(rotulos(t)).toBe("Início > Consultoria Tributária > Carteira de Consultoria > AGROPECUARIA CRESTANI LTDA");
    expect(t.map((c) => c.to)).toEqual(["/inicio", "/area/diagnostico", "/consultoria/carteira", undefined]);
  });

  it("projeto: o nome do cliente (link para a página dele) e o projeto sem repetir o cliente", () => {
    const t = trilhaDoProjeto({ projeto: PROJETO, cliente: CRESTANI });
    expect(rotulos(t)).toBe("Início > Consultoria Tributária > Carteira de Consultoria > AGROPECUARIA CRESTANI LTDA > Saneamento de estoques com foco em IBS e CBS");
    expect(t[3].to).toBe("/consultoria/carteira/PJ/e1");
    expect(t[4].to).toBeUndefined();
    expect(rotulos(t)).not.toContain("Trabalhos do cliente");
  });

  it("saneamento: a fase e a aba abertas no fim, cada nível com o endereço de verdade", () => {
    const t = trilhaDoProjeto({ projeto: PROJETO, cliente: CRESTANI, telas: telasDoSaneamento("p9", { fase: "fase1", aba: "casos" }) });
    expect(rotulos(t)).toBe("Início > Consultoria Tributária > Carteira de Consultoria > AGROPECUARIA CRESTANI LTDA > Saneamento de estoques com foco em IBS e CBS > Saneamento de estoques > Fase 1 > 1.3 Casos");
    expect(t.slice(4).map((c) => c.to)).toEqual(["/diagnostico/projetos/p9", "/diagnostico/projetos/p9/saneamento", "/diagnostico/projetos/p9/saneamento?fase=1", undefined]);
    expect(rotulos(trilhaDoProjeto({ projeto: PROJETO, cliente: CRESTANI, telas: telasDoSaneamento("p9", { fase: "fase2", aba: "premissas" }) }))).toMatch(/Saneamento de estoques > Fase 2 > 2\.1 Premissas e diretrizes$/);
    expect(rotulos(trilhaDoProjeto({ projeto: PROJETO, cliente: CRESTANI, telas: telasDoSaneamento("p9", { fase: "fechamento", aba: "entregas" }) }))).toMatch(/Saneamento de estoques > Fechamento > 3\.1 Entregas finais$/);
    // Áreas comuns ficam sem a fase, como na faixa de abas; sem fase definida, a trilha para no Saneamento.
    expect(rotulos(telasDoSaneamento("p9", { fase: "fase1", aba: "tabela" }))).toBe("Saneamento de estoques > Tabela");
    expect(rotulos(finalizar(telasDoSaneamento("p9")))).toBe("Saneamento de estoques");
    expect(finalizar(telasDoSaneamento("p9"))[0].to).toBeUndefined();
  });

  it("roteiro: ... > Saneamento de estoques > Roteiro do projeto", () => {
    const t = trilhaDoProjeto({ projeto: PROJETO, cliente: CRESTANI, telas: [...telasDoSaneamento("p9"), { label: "Roteiro do projeto" }] });
    expect(rotulos(t)).toBe("Início > Consultoria Tributária > Carteira de Consultoria > AGROPECUARIA CRESTANI LTDA > Saneamento de estoques com foco em IBS e CBS > Saneamento de estoques > Roteiro do projeto");
    expect(t[5].to).toBe("/diagnostico/projetos/p9/saneamento");
  });

  it("projeto sem cliente único: pela lista de Projetos (consultoria) ou de Diagnósticos", () => {
    expect(rotulos(trilhaDoProjeto({ projeto: { id: "x", nome: "Grupo X", servico_consultoria: "s", empresa_ids: ["a", "b"] }, cliente: null })))
      .toBe("Início > Consultoria Tributária > Projetos > Grupo X");
    expect(rotulos(trilhaDoProjeto({ projeto: { id: "d", nome: "Diagnóstico Y", empresa_ids: ["a"] }, cliente: null })))
      .toBe("Início > Consultoria Tributária > Diagnósticos > Diagnóstico Y");
    expect(rotulos(trilhaDaConsultoria({ label: "Carteira de Consultoria", to: "/consultoria/carteira" }))).toBe("Início > Consultoria Tributária > Carteira de Consultoria");
  });

  it("cliente do projeto: pessoa física ou a única empresa; grupo = sem cliente", () => {
    expect(clienteDoProjeto(PROJETO, { empresas: [{ id: "e1", razao_social: "AGROPECUARIA CRESTANI LTDA" }] })).toEqual(CRESTANI);
    expect(clienteDoProjeto({ pessoa_fisica_id: "f1", empresa_ids: [] }, { pessoas: [{ id: "f1", nome: "Ana" }] })).toEqual({ publico: "PF", id: "f1", nome: "Ana" });
    expect(clienteDoProjeto({ empresa_ids: ["a", "b"] }, {})).toBeNull();
    expect(clienteDoProjeto(null)).toBeNull();
  });

  it("nome do projeto sem o cliente; nome editado à mão fica igual", () => {
    expect(rotuloDoProjeto(PROJETO.nome, "Agropecuária Crestani Ltda")).toBe("Saneamento de estoques com foco em IBS e CBS");
    expect(rotuloDoProjeto("Saneamento 2026", "AGROPECUARIA CRESTANI LTDA")).toBe("Saneamento 2026");
    expect(rotuloDoProjeto("AGROPECUARIA CRESTANI LTDA", "AGROPECUARIA CRESTANI LTDA")).toBe("AGROPECUARIA CRESTANI LTDA");
  });

  it("endereço do saneamento com fase e aba", () => {
    expect(rotaSaneamento("p9", { fase: "fase1", aba: "casos" })).toBe("/diagnostico/projetos/p9/saneamento?fase=1&aba=casos");
    expect(rotaSaneamento("p9")).toBe("/diagnostico/projetos/p9/saneamento");
  });

  it("clicar no projeto abre onde se trabalha nele: o de Saneamento direto na ferramenta, os demais na página do projeto", () => {
    expect(rotaDeAbrirProjeto({ id: "p9", servico_consultoria: "saneamento-estoques" })).toBe("/diagnostico/projetos/p9/saneamento");
    expect(rotaDeAbrirProjeto({ id: "p8", servico_consultoria: "pj-homologacao" })).toBe("/diagnostico/projetos/p8");
    expect(rotaDeAbrirProjeto({ id: "p7" })).toBe("/diagnostico/projetos/p7");
  });
});

describe("normalizarCrumbs: toda trilha começa por Início e termina sem link", () => {
  it("DataHub vira Início > área; trilha sem Início ganha o Início; o último item perde o link", () => {
    expect(rotulos(normalizarCrumbs([{ label: "DataHub", to: "/" }, { label: "Repositório de XML" }], "/bpo/repositorio-xml"))).toMatch(/^Início > /);
    const t = normalizarCrumbs([{ label: "Clientes", to: "/" }, { label: "Grupo", to: "/workroom/1" }], "/workroom/1");
    expect(rotulos(t)).toBe("Início > Clientes > Grupo");
    expect(t[2].to).toBeUndefined();
    expect(normalizarCrumbs([{ label: "Início" }], "/inicio")).toEqual([{ label: "Início" }]);
    expect(normalizarCrumbs([], "/")).toEqual([]);
  });
});
