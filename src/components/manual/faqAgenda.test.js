import { describe, expect, it } from "vitest";
import { FAQ_SECOES } from "./faqData";
import { SECAO_AGENDA } from "./faqAtualizacao";

describe("FAQ: Agenda da Reforma", () => {
  it("entra logo depois da seção da Base legal, Radar e Saneamento", () => {
    const titulos = FAQ_SECOES.map((s) => s.titulo);
    expect(titulos.indexOf("Agenda da Reforma")).toBe(titulos.indexOf("Base legal, Radar e Saneamento de estoques") + 1);
  });

  it("responde o que a tela faz: filtros, fonte oficial, não confirmado, calendário e lembretes", () => {
    const perguntas = SECAO_AGENDA.itens.map((i) => i.p).join(" | ");
    for (const t of ["filtro a agenda por regime, UF ou empresa", "não confirmado em fonte oficial", "calendário (.ics)", "lembretes por e-mail"]) expect(perguntas, t).toContain(t);
    const respostas = SECAO_AGENDA.itens.map((i) => i.r).join(" ");
    expect(respostas).toContain("Todo dia às 7h");
    expect(respostas).toContain("Só datas confirmadas em fonte oficial geram aviso");
  });

  it("toda resposta que cita lei ou ato traz a fonte", () => {
    for (const item of SECAO_AGENDA.itens) {
      if (/LC 214|Decreto|CGSN|CGIBS|ADCT/.test(item.r)) expect(item.f, item.p).toBeTruthy();
    }
  });
});
