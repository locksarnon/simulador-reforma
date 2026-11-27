import { describe, expect, it } from "vitest";
import {
  clienteDoProjeto, finalizar, rotaDeAbrirProjeto, rotaSaneamento, rotuloDoProjeto, telasDoSaneamento, trilhaDaConsultoria, trilhaDoCliente, trilhaDoProjeto,
} from "./trilhas";
import { destinoAcima, normalizarCrumbs } from "@/components/PageHeader";

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

  it("saneamento: o projeto é a raiz (abre direto na ferramenta), com a fase e a aba abertas no fim, cada link levando a outra tela", () => {
    const t = trilhaDoProjeto({ projeto: PROJETO, cliente: CRESTANI, telas: telasDoSaneamento("p9", { fase: "fase1", aba: "casos" }) });
    expect(rotulos(t)).toBe("Início > Consultoria Tributária > Carteira de Consultoria > AGROPECUARIA CRESTANI LTDA > Saneamento de estoques com foco em IBS e CBS > Fase 1 > 1.3 Casos");
    // O projeto leva à ferramenta (não à página do projeto, que só redireciona); a fase, à primeira aba dela.
    expect(t.slice(4).map((c) => c.to)).toEqual(["/diagnostico/projetos/p9/saneamento", "/diagnostico/projetos/p9/saneamento?fase=1", undefined]);
    expect(t.map((c) => c.to)).not.toContain("/diagnostico/projetos/p9");
    expect(rotulos(trilhaDoProjeto({ projeto: PROJETO, cliente: CRESTANI, telas: telasDoSaneamento("p9", { fase: "fase2", aba: "casos" }) }))).toMatch(/com foco em IBS e CBS > Fase 2 > 2\.3 Casos$/);
    expect(rotulos(trilhaDoProjeto({ projeto: PROJETO, cliente: CRESTANI, telas: telasDoSaneamento("p9", { fase: "fechamento", aba: "entregas" }) }))).toMatch(/com foco em IBS e CBS > Fechamento > 3\.1 Entregas finais$/);
    // Áreas comuns ficam sem a fase, como na faixa de abas; sem fase definida, nada depois do projeto.
    expect(rotulos(telasDoSaneamento("p9", { fase: "fase1", aba: "tabela" }))).toBe("Tabela");
    expect(telasDoSaneamento("p9")).toEqual([]);
  });

  it("caminho sem link morto: a fase na primeira aba dela e o projeto na tela em que ele abre ficam sem link", () => {
    // 1.1, 2.1 e 3.1 são a primeira aba da fase: clicar na fase não mudaria a tela.
    for (const [fase, aba] of [["fase1", "preparar"], ["fase2", "premissas"], ["fechamento", "entregas"]]) expect(telasDoSaneamento("p9", { fase, aba })[0].to).toBeUndefined();
    expect(telasDoSaneamento("p9", { fase: "fase2", aba: "analise" })[0].to).toBe("/diagnostico/projetos/p9/saneamento?fase=2");
    // Na tela em que o projeto abre (a fase em andamento, na primeira aba), o projeto também fica sem link; o cliente continua com o dele.
    const t = trilhaDoProjeto({ projeto: PROJETO, cliente: CRESTANI, telas: telasDoSaneamento("p9", { fase: "fase1", aba: "preparar" }), noInicioDoProjeto: true });
    expect(rotulos(t)).toBe("Início > Consultoria Tributária > Carteira de Consultoria > AGROPECUARIA CRESTANI LTDA > Saneamento de estoques com foco em IBS e CBS > Fase 1 > 1.1 Preparar e diretrizes");
    expect(t.map((c) => c.to)).toEqual(["/inicio", "/area/diagnostico", "/consultoria/carteira", "/consultoria/carteira/PJ/e1", undefined, undefined, undefined]);
    // Projeto de outro serviço segue para a página do projeto.
    expect(trilhaDoProjeto({ projeto: { id: "p8", nome: "Homologação", servico_consultoria: "pj-homologacao" }, cliente: CRESTANI, telas: [{ label: "Tela" }] })[4].to).toBe("/diagnostico/projetos/p8");
  });

  it("roteiro: ... > projeto (volta ao Saneamento) > Roteiro do projeto", () => {
    const t = trilhaDoProjeto({ projeto: PROJETO, cliente: CRESTANI, telas: [{ label: "Roteiro do projeto" }] });
    expect(rotulos(t)).toBe("Início > Consultoria Tributária > Carteira de Consultoria > AGROPECUARIA CRESTANI LTDA > Saneamento de estoques com foco em IBS e CBS > Roteiro do projeto");
    expect(t[4].to).toBe("/diagnostico/projetos/p9/saneamento");
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

  it("item que leva ao endereço já aberto perde o link; o Voltar sem tela anterior sobe para o item com link mais próximo", () => {
    const t = normalizarCrumbs([{ label: "Início", to: "/inicio" }, { label: "Projeto", to: "/x/saneamento" }, { label: "Aba", to: "/x/saneamento?aba=1" }], "/x/saneamento", "");
    expect(t.map((c) => c.to)).toEqual(["/inicio", undefined, undefined]);
    // Outra aba do mesmo endereço: o projeto volta a ser link.
    expect(normalizarCrumbs([{ label: "Início", to: "/inicio" }, { label: "Projeto", to: "/x/saneamento" }, { label: "Aba" }], "/x/saneamento", "?aba=2")[1].to).toBe("/x/saneamento");
    expect(destinoAcima(t)).toBe("/inicio");
    expect(destinoAcima([{ label: "Início", to: "/inicio" }, { label: "Cliente", to: "/c/1" }, { label: "Projeto" }, { label: "Aba" }])).toBe("/c/1");
    expect(destinoAcima([])).toBe("/inicio");
  });
});
