import { describe, expect, it } from "vitest";
import { aplicarEscolha, desfazerEscolha, detectarEscalaSaldo, escolhaDoConjunto, montarConjuntos, saldoNaEscala, sugerirSobrevivente } from "./conjuntos";

const dup = (grupo, cands, nivel = "EXATA", score = 1) => ({ nivel, score, grupo, mestre: null, candidatos: cands.map((l) => ({ linha: l, score, nivel, motivos: [] })) });
const item = (linha, codigo, extra = {}) => ({ linha, codigo, descricao: `ITEM ${codigo}`, unidade: "UN", grupo_atual: "Peças", ...extra });
const ctx = { quem: "ana", hoje: "2026-10-22" };
const linhas = (conj) => conj.membros.map((m) => m.linha);

describe("conjuntos de duplicados", () => {
  it("itens do mesmo grupo forte ficam juntos; o par só possível se liga pelo candidato; item sem par e candidato fora do escopo não viram conjunto", () => {
    const itens = [item(2, "A", { duplicidade: dup(0, [3]) }), item(3, "B", { duplicidade: dup(0, [2, 4]) }), item(4, "C", { duplicidade: dup(0, [3]) }),
      item(10, "P", { duplicidade: dup(null, [11], "POSSIVEL", 0.8) }), item(11, "Q", { duplicidade: dup(null, [10], "POSSIVEL", 0.8) }),
      item(20, "S", { duplicidade: dup(null, [99], "POSSIVEL", 0.8) }), item(30, "Z")];
    const c = montarConjuntos(itens);
    expect(c.map((x) => [x.id, linhas(x).sort((a, b) => a - b), x.nivel])).toEqual([["c:2", [2, 3, 4], "EXATA"], ["c:10", [10, 11], "POSSIVEL"]]);
  });
  it("o possível ligado a um grupo forte entra no conjunto dele; o nível do conjunto é o mais forte; o grupo de itens é o mais frequente", () => {
    const itens = [item(2, "A", { duplicidade: dup(0, [3]) }), item(3, "B", { grupo_atual: "Insumos", duplicidade: dup(0, [2]) }), item(4, "C", { grupo_atual: "Insumos", duplicidade: dup(null, [3], "POSSIVEL", 0.8) }), item(5, "D", { duplicidade: dup(null, [3], "POSSIVEL", 0.8) })];
    const [c] = montarConjuntos(itens);
    expect(linhas(c).sort((a, b) => a - b)).toEqual([2, 3, 4, 5]); expect(c.nivel).toBe("EXATA"); expect(c.grupo).toBe("Insumos"); expect(c.score).toBe(1);
  });
  it("ordena os conjuntos do mais forte ao mais fraco, depois pelo tamanho; o sugerido vem primeiro", () => {
    const itens = [item(2, "A", { duplicidade: dup(null, [3], "POSSIVEL", 0.8) }), item(3, "B", { duplicidade: dup(null, [2], "POSSIVEL", 0.8) }),
      item(5, "C", { duplicidade: dup(1, [6], "MUITO_PROVAVEL", 0.95) }), item(6, "D", { duplicidade: dup(1, [5], "MUITO_PROVAVEL", 0.95) }),
      item(7, "E", { duplicidade: dup(2, [8]) }), item(8, "F", { duplicidade: dup(2, [7, 9]) }), item(9, "G", { duplicidade: dup(2, [8]) }), item(12, "H", { duplicidade: dup(3, [13]) }), item(13, "I", { duplicidade: dup(3, [12]) })];
    const c = montarConjuntos(itens);
    expect(c.map((x) => [x.nivel, x.membros.length])).toEqual([["EXATA", 3], ["EXATA", 2], ["MUITO_PROVAVEL", 2], ["POSSIVEL", 2]]);
    expect(c[0].membros[0].linha).toBe(c[0].sugestao.linha);
  });
});

describe("qual código fica (sugestão)", () => {
  it("1º o maior saldo em estoque, na escala escolhida; saldo zero ou ausente perde", () => {
    const m = [item(2, "A", { saldo: 3 }), item(3, "B", { saldo: 12 }), item(4, "C", { saldo: null })];
    expect(sugerirSobrevivente(m)).toMatchObject({ linha: 3, criterio: "saldo", motivo: "maior saldo em estoque (12 contra 3)", ordem: [3, 2, 4] });
    expect(sugerirSobrevivente([item(2, "A", { saldo: 3000000 }), item(3, "B", { saldo: 12000000 })], { escala: 1e6 }).motivo).toBe("maior saldo em estoque (12 contra 3)");
    expect(sugerirSobrevivente([item(2, "A", { saldo: 0 }), item(3, "B", { saldo: 5 })])).toMatchObject({ linha: 3, motivo: "maior saldo em estoque (5 contra 0)" });
  });
  it("2º a movimentação mais recente; quem não tem data perde", () => {
    const m = [item(2, "A", { ultima_mov: "2025-01-02" }), item(3, "B", { ultima_mov: "2026-03-12" }), item(4, "C")];
    expect(sugerirSobrevivente(m)).toMatchObject({ linha: 3, criterio: "movimentacao", motivo: "movimentação mais recente (12/03/2026 contra 02/01/2025)" });
    expect(sugerirSobrevivente([item(2, "A"), item(3, "B", { ultima_mov: "2026-03-12" })]).motivo).toBe("movimentação mais recente (12/03/2026 contra sem data)");
  });
  it("3º o cadastro mais completo (NCM, unidade, princípio ativo, grupo); empate, a descrição mais longa", () => {
    const m = [item(2, "A", { unidade: "", grupo_atual: "" }), item(3, "B", { ncm: "12092100", principio_ativo: "GLIFOSATO" })];
    expect(sugerirSobrevivente(m)).toMatchObject({ linha: 3, criterio: "completude", motivo: "cadastro mais completo" });
    expect(sugerirSobrevivente([item(2, "A", { descricao: "ANEL" }), item(3, "B", { descricao: "ANEL TRAVA 10MM" })]).linha).toBe(3);
  });
  it("4º o menor código (mais antigo), com ordem numérica; e a ordem da planilha só desempata cadastros idênticos", () => {
    expect(sugerirSobrevivente([item(2, "22898", { descricao: "X" }), item(3, "22897", { descricao: "X" }), item(4, "9", { descricao: "X" })])).toMatchObject({ linha: 4, criterio: "codigo", motivo: "menor código (cadastro mais antigo)" });
    expect(sugerirSobrevivente([item(5, "A", { descricao: "X" }), item(3, "A", { descricao: "X" })])).toMatchObject({ linha: 3, criterio: "linha" });
  });
  it("cada critério só vale quando separa os que ainda empatam, e o resultado é determinístico", () => {
    const m = [item(2, "A", { saldo: 5, ultima_mov: "2025-01-01" }), item(3, "B", { saldo: 5, ultima_mov: "2026-01-01" }), item(4, "C", { saldo: 1, ultima_mov: "2027-01-01" })];
    expect(sugerirSobrevivente(m)).toMatchObject({ linha: 3, criterio: "movimentacao", ordem: [3, 2, 4] });
    expect(sugerirSobrevivente([...m].reverse()).ordem).toEqual([3, 2, 4]);
    expect(sugerirSobrevivente([item(2, "A")])).toMatchObject({ linha: 2, criterio: "unico", motivo: "" });
    expect(sugerirSobrevivente([])).toMatchObject({ linha: null, ordem: [] });
  });
  it("escala do saldo: ×1.000.000 só quando todos os saldos são múltiplos exatos (e há ao menos 3)", () => {
    expect(detectarEscalaSaldo([item(1, "a", { saldo: 5000000 }), item(2, "b", { saldo: 12000000 }), item(3, "c", { saldo: 1000000 }), item(4, "d", { saldo: 0 }), item(5, "e")])).toBe(1e6);
    expect(detectarEscalaSaldo([item(1, "a", { saldo: 5000000 }), item(2, "b", { saldo: 12 }), item(3, "c", { saldo: 1000000 })])).toBe(1);
    expect(detectarEscalaSaldo([item(1, "a", { saldo: 5000000 }), item(2, "b", { saldo: 1000000 })])).toBe(1); // poucos itens: não arrisca
    expect(detectarEscalaSaldo([])).toBe(1);
    expect(saldoNaEscala(5000000, 1e6)).toBe(5); expect(saldoNaEscala(null, 1e6)).toBeNull(); expect(saldoNaEscala(7)).toBe(7); expect(saldoNaEscala(0, 1e6)).toBe(0);
  });
});

describe("escolher quem fica", () => {
  const mk = () => montarConjuntos([item(2, "A", { saldo: 3, duplicidade: dup(0, [3, 4]) }), item(3, "B", { saldo: 12, duplicidade: dup(0, [2, 4]) }), item(4, "C", { saldo: 1, duplicidade: dup(0, [3]) })])[0];

  it("os que saem viram proposta para o De/para (unificar no que fica); o que fica não tem decisão", () => {
    const c = mk(); const d = aplicarEscolha({}, c, 3, { ...ctx, origem: "sugestao" });
    expect(Object.keys(d).sort()).toEqual(["2|duplicidade", "4|duplicidade"]);
    expect(d["2|duplicidade"]).toEqual({ acao: "ENC", status: "PROP", grupo: "Peças", por: "ana", em: "2026-10-22", destino: 3, conjunto: "c:2", escolhaPor: "sugestao" });
    expect(escolhaDoConjunto(c, d)).toEqual({ fica: 3, origem: "sugestao", status: "aguardando", travada: false });
    expect(escolhaDoConjunto(c, {})).toEqual({ fica: null, origem: null, status: "nenhuma", travada: false });
  });
  it("não altera as decisões dadas, é idempotente e trocar de ideia reorganiza as propostas", () => {
    const c = mk(); const base = { "9|padrao": { acao: "ENC", status: "PROP" } }; const copia = JSON.stringify(base);
    const d1 = aplicarEscolha(base, c, 3, ctx); expect(JSON.stringify(base)).toBe(copia); expect(d1["9|padrao"]).toBe(base["9|padrao"]);
    expect(aplicarEscolha(d1, c, 3, ctx)).toBe(d1); // mesma escolha, mesma referência
    const d2 = aplicarEscolha(d1, c, 2, ctx);
    expect(Object.keys(d2).filter((k) => k.endsWith("duplicidade")).sort()).toEqual(["3|duplicidade", "4|duplicidade"]); expect(d2["3|duplicidade"].destino).toBe(2); expect(d2["4|duplicidade"].destino).toBe(2);
    expect(escolhaDoConjunto(c, d2).fica).toBe(2);
  });
  it("o modelo antigo (a decisão do mantido aponta para ele mesmo) é reconhecido", () => {
    const c = mk(); const antigo = { "2|duplicidade": { status: "PROP", destino: 3 }, "3|duplicidade": { status: "PROP", destino: 3 }, "4|duplicidade": { status: "PROP", destino: 3 } };
    expect(escolhaDoConjunto(c, antigo)).toMatchObject({ fica: 3, origem: "analista", status: "aguardando", travada: false });
  });
  it("conjunto com caso já aprovado ou rejeitado fica travado: nada muda", () => {
    const c = mk(); const d = { "2|duplicidade": { acao: "ENC", status: "APR", destino: 3 }, "4|duplicidade": { acao: "ENC", status: "PROP", destino: 3 } };
    expect(escolhaDoConjunto(c, d)).toMatchObject({ fica: 3, status: "decidida", travada: true });
    expect(aplicarEscolha(d, c, 4, ctx)).toBe(d); expect(desfazerEscolha(d, c)["2|duplicidade"].status).toBe("APR");
  });
  it("desfazer remove só as propostas ainda não decididas", () => {
    const c = mk(); const d = aplicarEscolha({ "9|padrao": { status: "PROP" } }, c, 3, ctx); const x = desfazerEscolha(d, c);
    expect(Object.keys(x)).toEqual(["9|padrao"]); expect(desfazerEscolha(x, c)).toBe(x); // nada a desfazer: mesma referência
    const parcial = desfazerEscolha({ "2|duplicidade": { status: "REJ", destino: 3 }, "4|duplicidade": { status: "PROP", destino: 3 } }, c);
    expect(Object.keys(parcial)).toEqual(["2|duplicidade"]);
  });
});
