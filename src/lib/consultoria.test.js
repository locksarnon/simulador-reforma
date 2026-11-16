import { describe, expect, it } from "vitest";
import { areasDoCatalogo, caminhoDaConsultoria, indexarConsultoria, situacaoDoServico, temCnpj } from "./consultoria";

const CATALOGO = [
  { id: "pis-cofins", publico: "PJ", area: "Créditos e Oportunidades Tributárias", nome: "Créditos de PIS e Cofins" },
  { id: "regimes-exercicio", publico: "PJ", area: "Planejamento Tributário", nome: "Escolha do regime tributário para o exercício" },
  { id: "credito-estoque", publico: "PJ", area: "Créditos e Oportunidades Tributárias", nome: "Crédito presumido de estoque" },
];

describe("consultoria por cliente", () => {
  it("indexa os serviços de cada cliente do público, sem repetir, e mantém o vínculo de serviço que saiu do catálogo", () => {
    const mapa = indexarConsultoria([
      { publico: "PJ", cliente_id: "E1", servico: "pis-cofins" },
      { publico: "PJ", cliente_id: "E1", servico: "pis-cofins" },
      { publico: "PJ", cliente_id: "E1", servico: "antigo" },
      { publico: "PF", cliente_id: "P1", servico: "lcdpr" },
    ], CATALOGO);
    expect(mapa.get("E1").map((s) => s.nome)).toEqual(["Créditos de PIS e Cofins", "antigo"]);
    expect(mapa.has("P1")).toBe(false);
    expect(indexarConsultoria(undefined, undefined).size).toBe(0);
  });

  it("áreas na ordem do catálogo, CNPJ completo e o caminho da carteira", () => {
    expect(areasDoCatalogo(CATALOGO)).toEqual(["Créditos e Oportunidades Tributárias", "Planejamento Tributário"]);
    expect(temCnpj("58.509.112/0001-52")).toBe(true);
    expect(temCnpj("123.456.789-01")).toBe(false);
    expect(temCnpj(null)).toBe(false);
    expect(caminhoDaConsultoria("E1")).toBe("/consultoria/carteira/PJ/E1");
  });

  it("situação do serviço pelos projetos do cliente", () => {
    const projetos = [
      { empresa_ids: ["E1"], servico_consultoria: "pis-cofins", situacao: "EM_ANDAMENTO" },
      { empresa_ids: ["E1"], servico_consultoria: "pis-cofins", situacao: "PAUSADO" },
      { empresa_ids: ["E1"], servico_consultoria: "credito-estoque", situacao: "CONCLUIDO" },
      { empresa_ids: ["E2"], servico_consultoria: "regimes-exercicio", situacao: "EM_ANDAMENTO" },
    ];
    expect(situacaoDoServico(projetos, "E1", "pis-cofins")).toBe("2 projetos em andamento");
    expect(situacaoDoServico(projetos, "E1", "credito-estoque")).toBe("Sem projeto em andamento");
    expect(situacaoDoServico(projetos, "E1", "regimes-exercicio")).toBe("Contratado · ainda não iniciado");
    expect(situacaoDoServico(projetos, "E2", "regimes-exercicio")).toBe("1 projeto em andamento");
    expect(situacaoDoServico(undefined, "E1", "pis-cofins")).toBe("Contratado · ainda não iniciado");
  });
});
