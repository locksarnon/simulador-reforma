import { describe, it, expect } from "vitest";
import { FAQ_SECOES, FAQ_ATUALIZADO_EM } from "./faqData";
import { SECAO_NOVIDADES } from "./faqAtualizacao";

describe("FAQ do InTAX", () => {
  it("abre com as novidades da Reforma e traz as seções novas nos lugares certos", () => {
    const titulos = FAQ_SECOES.map((s) => s.titulo);
    expect(titulos[0]).toMatch(/^Novidades da Reforma/);
    expect(FAQ_ATUALIZADO_EM).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(titulos[0]).toContain(FAQ_ATUALIZADO_EM);
    const apos = (antes, depois) => expect(titulos.indexOf(depois)).toBe(titulos.indexOf(antes) + 1);
    apos("Cadastro de operações", "Importação de XML de NF-e");
    apos("Informações de DF-e", "Ferramentas abertas e consultas");
    apos("Ferramentas abertas e consultas", "Base legal, Radar e Saneamento de estoques");
  });

  it("cada item tem pergunta e resposta, e a fonte, quando existe, é texto", () => {
    for (const secao of FAQ_SECOES) {
      expect(secao.itens.length, secao.titulo).toBeGreaterThan(0);
      for (const item of secao.itens) {
        expect(typeof item.p === "string" && item.p.trim().length > 0, `${secao.titulo}: pergunta vazia`).toBe(true);
        expect(typeof item.r === "string" && item.r.trim().length > 0, `${secao.titulo}: resposta vazia em "${item.p}"`).toBe(true);
        if (item.f !== undefined) expect(typeof item.f === "string" && item.f.trim().length > 0, `fonte vazia em "${item.p}"`).toBe(true);
      }
    }
  });

  it("não repete pergunta dentro da mesma seção", () => {
    for (const secao of FAQ_SECOES) {
      const perguntas = secao.itens.map((i) => i.p.trim().toLowerCase());
      expect(new Set(perguntas).size, secao.titulo).toBe(perguntas.length);
    }
  });

  it("as respostas de novidades que trazem número, prazo ou dispositivo citam a fonte oficial", () => {
    const semFonteOk = ["O InTAX já reflete todas essas atualizações?", "Onde acompanhar os atos oficiais?"];
    for (const item of SECAO_NOVIDADES.itens) {
      if (semFonteOk.includes(item.p)) continue;
      expect(item.f, `falta a fonte em "${item.p}"`).toBeTruthy();
    }
  });

  it("não sobrou menção ao nome antigo nem à plataforma de origem", () => {
    const texto = JSON.stringify(FAQ_SECOES);
    expect(texto).not.toMatch(/Simulador FAL v0\.16/i);
    expect(texto).not.toMatch(/base44/i);
  });
});
