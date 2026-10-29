import { beforeEach, describe, expect, it, vi } from "vitest";

const CHAVE = "intax.cenarioAliquotas.v1";

/** localStorage em memória: os testes rodam sem navegador. */
function memoria() {
  const d = new Map();
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k), clear: () => d.clear() };
}
let armazenamento;

/** Importa o módulo "do zero" (ele lê o localStorage ao carregar). */
async function carregar() {
  vi.resetModules();
  return import("./cenarioAliquotasStore.js");
}

describe("escolha do cenário de alíquotas (guardada no navegador)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    armazenamento = memoria();
    vi.stubGlobal("localStorage", armazenamento);
  });

  it("sem nada guardado, vale o cenário padrão (gatilho de 26,5%)", async () => {
    const m = await carregar();
    expect(m.obterCenarioAliquotas()).toEqual({ id: "gatilho", cbs: null, ibs: null });
  });

  it("trocar de cenário guarda a escolha e a próxima abertura a recupera", async () => {
    const m = await carregar();
    m.definirCenarioAliquotas({ id: "somadas" });
    expect(m.obterCenarioAliquotas().id).toBe("somadas");
    expect(JSON.parse(armazenamento.getItem(CHAVE)).id).toBe("somadas");
    const outra = await carregar();
    expect(outra.obterCenarioAliquotas().id).toBe("somadas");
  });

  it("o personalizado guarda CBS e IBS (em fração) e limita a 0–60%", async () => {
    const m = await carregar();
    m.definirCenarioAliquotas({ id: "personalizado", cbs: 0.1, ibs: 0.16 });
    expect(m.obterCenarioAliquotas()).toEqual({ id: "personalizado", cbs: 0.1, ibs: 0.16 });
    m.definirCenarioAliquotas({ ibs: 9 });
    expect(m.obterCenarioAliquotas()).toEqual({ id: "personalizado", cbs: 0.1, ibs: 0.6 });
  });

  it("nomes de cenário de versões anteriores (teto e sem_teto) viram os atuais", async () => {
    armazenamento.setItem(CHAVE, JSON.stringify({ id: "sem_teto" }));
    expect((await carregar()).obterCenarioAliquotas().id).toBe("somadas");
    armazenamento.setItem(CHAVE, JSON.stringify({ id: "teto" }));
    expect((await carregar()).obterCenarioAliquotas().id).toBe("gatilho");
  });

  it("valor guardado estragado ou de cenário que não existe cai no padrão, sem quebrar", async () => {
    armazenamento.setItem(CHAVE, "{isso não é json");
    expect((await carregar()).obterCenarioAliquotas().id).toBe("gatilho");
    armazenamento.setItem(CHAVE, JSON.stringify({ id: "inexistente" }));
    expect((await carregar()).obterCenarioAliquotas().id).toBe("gatilho");
  });

  it("sem acesso ao armazenamento (janela privada, bloqueio): carrega no padrão e trocar de cenário não dá erro", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("bloqueado"); },
      setItem: () => { throw new Error("bloqueado"); },
      removeItem: () => {},
    });
    const m = await carregar();
    expect(m.obterCenarioAliquotas().id).toBe("gatilho");
    expect(() => m.definirCenarioAliquotas({ id: "cadastrada" })).not.toThrow();
    expect(m.obterCenarioAliquotas().id).toBe("cadastrada"); // vale nesta sessão mesmo sem gravar
  });
});
