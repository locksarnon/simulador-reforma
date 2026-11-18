import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  anexarAoHistorico, CHAVE_HISTORICO, temContextoProprio, gravarHistorico, lerHistorico, LIMITE_HISTORICO, mensagemDeEspera, paraGuardar, perguntaValida, sugestoesDoContexto, textoParaCopiar,
} from "./assistente";

function armazenamentoFalso() {
  const dados = new Map();
  return { getItem: (k) => (dados.has(k) ? dados.get(k) : null), setItem: (k, v) => dados.set(k, String(v)), removeItem: (k) => dados.delete(k), dados };
}

describe("sugestões por tela", () => {
  it("a tela tem sugestões próprias; sem tela própria vale a área; sem contexto, as gerais", () => {
    expect(sugestoesDoContexto({ id: "credito-estoque", area: "reforma" })[0]).toMatch(/estoque/);
    expect(sugestoesDoContexto({ id: "painel-executivo", area: "reforma" })[0]).toMatch(/transição/);
    expect(sugestoesDoContexto({ id: "tarefas", area: "bpo" })).toHaveLength(3);
    expect(sugestoesDoContexto(null)).toHaveLength(3);
    expect(sugestoesDoContexto({ id: "x", area: "inexistente" })[0]).toMatch(/crédito/);
  });
  it("só diz “para quem está em…” quando a tela tem sugestões próprias", () => {
    expect(temContextoProprio({ id: "transicao", area: "reforma" })).toBe(true);
    expect(temContextoProprio({ id: "tarefas", area: "bpo" })).toBe(true);
    expect(temContextoProprio({ id: "perfil", area: "inicio" })).toBe(false);
    expect(temContextoProprio(null)).toBe(false);
  });
  it("quem abre o assistente pode trazer as próprias sugestões (ex.: as de um setor), até 4", () => {
    expect(sugestoesDoContexto({ id: "credito-estoque" }, ["a", "b", "c", "d", "e"])).toEqual(["a", "b", "c", "d"]);
    expect(sugestoesDoContexto({ id: "credito-estoque" }, [])[0]).toMatch(/estoque/);
  });
  it("toda sugestão passa na regra de tamanho mínimo do serviço", () => {
    for (const m of [null, { id: "transicao" }, { id: "consulta-ncm" }, { area: "bpo" }, { area: "diagnostico" }, { area: "clientes" }, { area: "comercial" }]) {
      for (const s of sugestoesDoContexto(m)) expect(perguntaValida(s), s).toBe(true);
    }
  });
});

describe("pergunta e espera", () => {
  it("exige 8 caracteres úteis", () => {
    expect(perguntaValida("   curta ")).toBe(false);
    expect(perguntaValida("Ouro paga IBS e CBS?")).toBe(true);
    expect(perguntaValida(null)).toBe(false);
  });
  it("a mensagem de espera muda com o tempo", () => {
    expect(mensagemDeEspera(0)).toMatch(/Procurando/);
    expect(mensagemDeEspera(4)).toMatch(/Lendo/);
    expect(mensagemDeEspera(9)).toMatch(/Montando/);
    expect(mensagemDeEspera(15)).toMatch(/Conferindo/);
    expect(mensagemDeEspera(60)).toMatch(/demorando/);
  });
});

describe("histórico da conversa", () => {
  beforeEach(() => vi.stubGlobal("localStorage", armazenamentoFalso()));
  const ok = (id) => ({ id, pergunta: `pergunta ${id} longa`, estado: "ok", resultado: { resposta: "r" } });

  it("guarda só o que terminou e devolve na ordem", () => {
    gravarHistorico([ok("1"), { id: "2", pergunta: "carregando agora", estado: "carregando" }, ok("3")]);
    expect(lerHistorico().map((i) => i.id)).toEqual(["1", "3"]);
  });
  it("respeita o limite e fica com as mais novas", () => {
    const muitas = Array.from({ length: LIMITE_HISTORICO + 3 }, (_, i) => ok(String(i)));
    gravarHistorico(muitas);
    const lido = lerHistorico();
    expect(lido).toHaveLength(LIMITE_HISTORICO);
    expect(lido.at(-1).id).toBe(String(LIMITE_HISTORICO + 2));
  });
  it("nova conversa apaga o guardado", () => {
    gravarHistorico([ok("1")]);
    gravarHistorico([]);
    expect(localStorage.getItem(CHAVE_HISTORICO)).toBeNull();
  });
  it("dado estragado no armazenamento não derruba a tela", () => {
    localStorage.setItem(CHAVE_HISTORICO, "{não é json");
    expect(lerHistorico()).toEqual([]);
    localStorage.setItem(CHAVE_HISTORICO, JSON.stringify([null, { id: 5 }, ok("a")]));
    expect(lerHistorico().map((i) => i.id)).toEqual(["a"]);
  });
  it("sem armazenamento (navegador bloqueado) não lança erro", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); }, removeItem: () => { throw new Error("bloqueado"); } });
    expect(lerHistorico()).toEqual([]);
    expect(() => gravarHistorico([ok("1")])).not.toThrow();
  });
  it("anexar não repete a mesma troca e mantém o limite", () => {
    const h = anexarAoHistorico([ok("1"), ok("2")], ok("1"));
    expect(h.map((i) => i.id)).toEqual(["2", "1"]);
    expect(paraGuardar([{ id: "x", estado: "carregando" }])).toEqual([]);
  });
});

describe("texto para copiar", () => {
  it("junta a resposta, a atenção e a base legal", () => {
    const t = textoParaCopiar({ resposta: "Resposta.", ressalvas: "Depende do caso.", fundamentos: [{ numero: "Art. 12", rotulo: "Base de cálculo" }] });
    expect(t).toBe("Resposta.\n\nAtenção: Depende do caso.\n\nBase legal:\n- Art. 12 — Base de cálculo");
    expect(textoParaCopiar(null)).toBe("");
    expect(textoParaCopiar({ resposta: "Só isto." })).toBe("Só isto.");
  });
});
