import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import PraticaDaResposta, { MotorDaResposta } from "./PraticaDaResposta";
import { Resultado } from "./AssistenteLegal";

const CALCULO = {
  formula: "ICMS = valor da operação × carga efetiva",
  premissas: [{ id: "P1", descricao: "Valor da venda (exemplo)", valor: 100000, unidade: "R$", valor_texto: "R$ 100.000,00" }],
  parametros: [{ id: "A1", descricao: "Carga efetiva do ICMS", valor: 4, unidade: "%", valor_texto: "4%", fundamento: { norma: "ms-ricms-anexo-i", numero: "Anexo I do RICMS (MS)", rotulo: "Art. 59-A", caminho: "art-59-a" } }],
  linhas: [{ id: "L1", descricao: "ICMS da operação", expressao: "P1 * A1", conta: "R$ 100.000,00 × 4%", resultado: 4000, unidade: "R$", valor_texto: "R$ 4.000,00" }],
  ajustes: [],
};
const PRATICA = { passos: ["Confira se o adubo vai para a agricultura.", "Emita a NF-e com a redução da base."], calculo: CALCULO, sem_calculo: null };
const desenhar = (no) => renderToStaticMarkup(<MemoryRouter>{no}</MemoryRouter>);

describe("o que fazer e como calcular, na resposta do assistente", () => {
  it("passo a passo numerado e cálculo com a origem de cada número (exemplo, artigo, conta conferida)", () => {
    const h = desenhar(<PraticaDaResposta pratica={PRATICA} />);
    expect(h).toContain("Na prática: o que fazer");
    expect(h.indexOf("Confira se o adubo")).toBeLessThan(h.indexOf("Emita a NF-e"));
    expect(h).toContain("Como calcular");
    expect(h).toContain("ICMS = valor da operação × carga efetiva");
    expect(h).toContain(">Exemplo<");
    expect(h).toContain('href="/base-legal/ms-ricms-anexo-i/art-59-a"');
    expect(h).toContain("R$ 100.000,00 × 4%");
    expect(h).toContain("R$ 4.000,00");
    expect(h).toContain("Conta conferida");
    expect(h).toContain("todas as contas foram refeitas pelo InTAX");
    expect(h).not.toContain("Contas corrigidas pelo InTAX");
  });

  it("conta corrigida pelo InTAX aparece dita; sem cálculo possível, o motivo", () => {
    const corrigida = desenhar(<PraticaDaResposta pratica={{ ...PRATICA, calculo: { ...CALCULO, ajustes: ["ICMS da operação: o modelo chegou a R$ 4.500,00; a conta dá R$ 4.000,00 e vale a do InTAX."] } }} />);
    expect(corrigida).toContain("Contas corrigidas pelo InTAX");
    expect(corrigida).toContain("o modelo chegou a R$ 4.500,00");
    const sem = desenhar(<PraticaDaResposta pratica={{ passos: [], calculo: null, sem_calculo: "A alíquota interna não está nos dispositivos fornecidos." }} />);
    expect(sem).toContain("<b>Cálculo modelo:</b> A alíquota interna não está nos dispositivos fornecidos.");
    expect(desenhar(<PraticaDaResposta pratica={null} />)).toBe("");
  });

  it("diz qual motor construiu a resposta, e o motor reserva com todas as letras", () => {
    expect(desenhar(<MotorDaResposta modelo="claude-fable-5-2" />)).toContain("Resposta construída pelo Claude Fable 5.2");
    const reserva = desenhar(<MotorDaResposta modelo="gemini-3.5-flash" />);
    expect(reserva).toContain("Resposta do motor reserva (Gemini 3.5 Flash): o Claude Fable 5.2 não respondeu agora.");
    expect(desenhar(<MotorDaResposta modelo={null} />)).toBe("");
  });

  it("o resultado mostra motor e parte prática; assistente indisponível não mostra nenhum dos dois", () => {
    const r = { id: "p1", resposta: "Depende: o adubo agropecuário tem carga de 4%.", suficiente: true, ressalvas: null, fundamentos: [], modelo: "claude-fable-5-2", pratica: PRATICA, aviso: "Orientação." };
    const h = desenhar(<Resultado r={r} />);
    expect(h).toContain("Resposta construída pelo Claude Fable 5.2");
    expect(h).toContain("Na prática: o que fazer");
    const indisponivel = desenhar(<Resultado r={{ ...r, motivo: "erro_ia", suficiente: false, modelo: null }} />);
    expect(indisponivel).not.toContain("Na prática: o que fazer");
    expect(indisponivel).not.toContain("Resposta construída");
  });
});
