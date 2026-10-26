import { describe, expect, it } from "vitest";
import { aplicarEscolha, completarEscolha, conjuntoIdentificavel, desfazerEscolha, detectarEscalaSaldo, escolhaDoConjunto, membrosSemProposta, montarConjuntos, saldoNaEscala, sugerirSobrevivente } from "./conjuntos";
import { indexar } from "./identidade";

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
    expect(c.map((x) => [x.id, linhas(x).sort((a, b) => a - b), x.nivel])).toEqual([["c:A", [2, 3, 4], "EXATA"], ["c:P", [10, 11], "POSSIVEL"]]); // o conjunto se chama pelo menor código: não muda de uma extração para outra
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
    expect(sugerirSobrevivente(m)).toMatchObject({ linha: 3, id: "B", criterio: "saldo", motivo: "maior saldo em estoque (12 contra 3)", ordem: [3, 2, 4] });
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

describe("escolher quem fica (a escolha é guardada pelo código do item)", () => {
  const mk = () => montarConjuntos([item(2, "A", { saldo: 3, duplicidade: dup(0, [3, 4]) }), item(3, "B", { saldo: 12, duplicidade: dup(0, [2, 4]) }), item(4, "C", { saldo: 1, duplicidade: dup(0, [3]) })])[0];

  it("os que saem viram proposta para o De/para (unificar no código que fica); o que fica não tem decisão", () => {
    const c = mk(); const d = aplicarEscolha({}, c, "B", { ...ctx, origem: "sugestao" });
    expect(Object.keys(d).sort()).toEqual(["A|duplicidade", "C|duplicidade"]);
    expect(d["A|duplicidade"]).toEqual({ acao: "ENC", status: "PROP", grupo: "Peças", por: "ana", em: "2026-10-22", destino: "B", conjunto: "c:A", escolhaPor: "sugestao",
      antes: { descricao: "ITEM A" }, destinoAntes: { descricao: "ITEM B" } }); // a decisão guarda como a descrição dos dois cadastros estava
    expect(escolhaDoConjunto(c, d)).toEqual({ fica: "B", origem: "sugestao", status: "aguardando", travada: false });
    expect(escolhaDoConjunto(c, {})).toEqual({ fica: null, origem: null, status: "nenhuma", travada: false });
  });
  it("não altera as decisões dadas, é idempotente e trocar de ideia reorganiza as propostas", () => {
    const c = mk(); const base = { "Z9|padrao": { acao: "ENC", status: "PROP" } }; const copia = JSON.stringify(base);
    const d1 = aplicarEscolha(base, c, "B", ctx); expect(JSON.stringify(base)).toBe(copia); expect(d1["Z9|padrao"]).toBe(base["Z9|padrao"]);
    expect(aplicarEscolha(d1, c, "B", ctx)).toBe(d1); // mesma escolha, mesma referência
    const d2 = aplicarEscolha(d1, c, "A", ctx);
    expect(Object.keys(d2).filter((k) => k.endsWith("duplicidade")).sort()).toEqual(["B|duplicidade", "C|duplicidade"]); expect(d2["B|duplicidade"].destino).toBe("A"); expect(d2["C|duplicidade"].destino).toBe("A");
    expect(escolhaDoConjunto(c, d2).fica).toBe("A");
  });
  it("o modelo antigo (a decisão do mantido aponta para ele mesmo) é reconhecido", () => {
    const c = mk(); const antigo = { "A|duplicidade": { status: "PROP", destino: "B" }, "B|duplicidade": { status: "PROP", destino: "B" }, "C|duplicidade": { status: "PROP", destino: "B" } };
    expect(escolhaDoConjunto(c, antigo)).toMatchObject({ fica: "B", origem: "analista", status: "aguardando", travada: false });
  });
  it("conjunto com caso já aprovado ou rejeitado fica travado: nada muda", () => {
    const c = mk(); const d = { "A|duplicidade": { acao: "ENC", status: "APR", destino: "B" }, "C|duplicidade": { acao: "ENC", status: "PROP", destino: "B" } };
    expect(escolhaDoConjunto(c, d)).toMatchObject({ fica: "B", status: "decidida", travada: true });
    expect(aplicarEscolha(d, c, "C", ctx)).toBe(d); expect(desfazerEscolha(d, c)["A|duplicidade"].status).toBe("APR");
  });
  it("conjunto travado com membro sem proposta (decisão descartada, duplicado que entrou depois): completar encaminha só os que faltam, para o mesmo código, sem tocar no decidido", () => {
    const c = mk(); const decidida = { acao: "ENC", status: "APR", destino: "B", antes: { descricao: "ITEM A" } };
    const d = { "A|duplicidade": decidida }; // o C está sem proposta
    expect(membrosSemProposta(c, d).map((m) => m.codigo)).toEqual(["C"]);
    expect(aplicarEscolha(d, c, "C", ctx)).toBe(d); // a escolha continua travada: não troca quem fica
    const x = completarEscolha(d, c, ctx);
    expect(x["A|duplicidade"]).toBe(decidida); expect(x["C|duplicidade"]).toMatchObject({ acao: "ENC", status: "PROP", destino: "B", conjunto: "c:A", por: "ana", em: "2026-10-22", antes: { descricao: "ITEM C" }, destinoAntes: { descricao: "ITEM B" } });
    expect(x["B|duplicidade"]).toBeUndefined(); expect(d["C|duplicidade"]).toBeUndefined(); // quem fica não ganha decisão; o recebido não é alterado
    expect(completarEscolha(x, c, ctx)).toBe(x); expect(membrosSemProposta(c, x)).toEqual([]); // nada mais a completar
  });
  it("a variante (observação) de quem sai segue na decisão, para o campo adicional do código que fica; sem variante, a decisão não leva o campo", () => {
    const obs = (palavras) => ({ ...dup(0, [2, 3, 4], "MUITO_PROVAVEL", 0.95), porObservacao: true, observacao: { palavras } });
    const c = montarConjuntos([item(2, "A", { saldo: 3, duplicidade: obs(["CLEAR"]) }), item(3, "B", { saldo: 12, duplicidade: obs(["NEUTRO", "INCOLOR"]) }), item(4, "C", { saldo: 1, duplicidade: obs([]) })])[0];
    const d = aplicarEscolha({}, c, "B", ctx);
    expect(d["A|duplicidade"].observacao).toEqual(["CLEAR"]); expect(d["C|duplicidade"]).not.toHaveProperty("observacao"); expect(d["B|duplicidade"]).toBeUndefined();
    expect(aplicarEscolha({}, c, "A", ctx)["B|duplicidade"].observacao).toEqual(["NEUTRO", "INCOLOR"]); // a variante é a de quem sai, qualquer que seja o que fica
    const decidida = { acao: "ENC", status: "APR", destino: "B", antes: { descricao: "ITEM A" } };
    expect(completarEscolha({ "A|duplicidade": decidida }, c, ctx)["C|duplicidade"]).not.toHaveProperty("observacao");
    const c2 = montarConjuntos([item(2, "A", { duplicidade: obs(["CLEAR"]) }), item(3, "B", { duplicidade: obs(["NEUTRO"]) }), item(4, "C", { duplicidade: obs(["AZUL"]) })])[0];
    expect(completarEscolha({ "A|duplicidade": decidida }, c2, ctx)["C|duplicidade"].observacao).toEqual(["AZUL"]);
  });
  it("completar não faz nada se o código que ficou saiu do conjunto: os membros de hoje nunca foram comparados com ele", () => {
    const c = mk(); const d = { "A|duplicidade": { acao: "ENC", status: "APR", destino: "Z" }, "B|duplicidade": { acao: "ENC", status: "APR", destino: "Z" } }; // o Z não está mais no conjunto {A, B, C}
    expect(escolhaDoConjunto(c, d)).toMatchObject({ fica: "Z", travada: true }); expect(membrosSemProposta(c, d)).toEqual([]); expect(completarEscolha(d, c, ctx)).toBe(d);
  });
  it("completar não faz nada em conjunto sem escolha, em conjunto ainda não travado ou sem como identificar os itens", () => {
    const c = mk();
    expect(membrosSemProposta(c, {})).toEqual([]); expect(completarEscolha({}, c, ctx)).toEqual({});
    const aguardando = aplicarEscolha({}, c, "B", ctx); expect(membrosSemProposta(c, aguardando)).toEqual([]); expect(completarEscolha(aguardando, c, ctx)).toBe(aguardando);
    const travadoSemId = { "A|duplicidade": { acao: "ENC", status: "APR", destino: "B" } };
    expect(completarEscolha(travadoSemId, c, { ...ctx, indice: indexar([...c.membros, item(99, "C")]) })).toBe(travadoSemId); // o código C está em outro item da base
  });
  it("desfazer remove só as propostas ainda não decididas", () => {
    const c = mk(); const d = aplicarEscolha({ "Z9|padrao": { status: "PROP" } }, c, "B", ctx); const x = desfazerEscolha(d, c);
    expect(Object.keys(x)).toEqual(["Z9|padrao"]); expect(desfazerEscolha(x, c)).toBe(x); // nada a desfazer: mesma referência
    const parcial = desfazerEscolha({ "A|duplicidade": { status: "REJ", destino: "B" }, "C|duplicidade": { status: "PROP", destino: "B" } }, c);
    expect(Object.keys(parcial)).toEqual(["A|duplicidade"]);
  });
  it("o código se guarda como texto: zeros à esquerda e a diferença entre 007 e 7 são preservados", () => {
    const c = montarConjuntos([item(2, "007", { duplicidade: dup(0, [3]) }), item(3, "7", { duplicidade: dup(0, [2]) })])[0];
    const d = aplicarEscolha({}, c, "007", ctx);
    expect(Object.keys(d)).toEqual(["7|duplicidade"]); expect(d["7|duplicidade"].destino).toBe("007"); expect(escolhaDoConjunto(c, d).fica).toBe("007");
  });
  it("sem código, ou com código repetido, a escolha não é guardada: não dá para saber depois de qual item ela é", () => {
    const semCodigo = montarConjuntos([item(2, "A", { duplicidade: dup(0, [3]) }), item(3, "", { duplicidade: dup(0, [2]) })])[0];
    expect(conjuntoIdentificavel(semCodigo).ok).toBe(false); expect(conjuntoIdentificavel(semCodigo).motivo).toContain("sem código");
    expect(aplicarEscolha({}, semCodigo, "A", ctx)).toEqual({});
    const repetidoNoConjunto = montarConjuntos([item(2, "A", { duplicidade: dup(0, [3]) }), item(3, "A", { duplicidade: dup(0, [2]) })])[0];
    expect(conjuntoIdentificavel(repetidoNoConjunto).ok).toBe(false); expect(aplicarEscolha({}, repetidoNoConjunto, "A", ctx)).toEqual({});
    const c = mk(); const outraLinhaComOMesmoCodigo = [...c.membros, item(99, "B")]; // o código B também está em outro item da base
    expect(conjuntoIdentificavel(c, indexar(outraLinhaComOMesmoCodigo)).ok).toBe(false); expect(aplicarEscolha({}, c, "A", { ...ctx, indice: indexar(outraLinhaComOMesmoCodigo) })).toEqual({});
    expect(conjuntoIdentificavel(c, indexar(c.membros)).ok).toBe(true);
  });
});
