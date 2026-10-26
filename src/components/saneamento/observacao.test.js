import { describe, expect, it } from "vitest";
import { CRITERIOS, achadosDoCriterio, criarTestes } from "./logica";
import { montarConjuntos } from "./conjuntos";
import {
  analisarDescricao, aplicarObservacao, aprovarPalavras, assinaturaObservacao, definirGrupo, efeitoObservacao, formaDaPalavra, grupoUsaObservacao, gruposMarcados, gruposNoPadrao, ignorarPalavra, observacaoDoItem, observacaoInicial,
  palavrasAprovadas, palavrasEmVigor, palavrasIgnoradas, restaurarPalavra, rotuloMedida, sugerirPalavras,
} from "./observacao";

const item = (linha, codigo, descricao, extra = {}) => ({ linha, codigo, descricao, unidade: "UN", grupo_atual: "LIMPEZA", problemas: [], ...extra });
const dup = (grupo, cands, nivel = "EXATA", score = 1) => ({ nivel, score, grupo, mestre: null, candidatos: cands.map((l) => ({ linha: l, score, nivel, motivos: ["descrições iguais"] })) });
const porLinha = (lista) => new Map(lista.map((x) => [x.linha, x]));

// As linhas do analista: "CERTEZA QUE ISSO TUDO É A MESMA COISA, E TRATAMOS AS CORES E DETALHES EM CAMPOS ADICIONAIS"
const CERAS = [item(1, "C1", "CERA EM PASTA BRAVO INCOLOR"), item(2, "C2", "CERA EM PASTA INCOLOR PARA PISO"), item(3, "C3", "CERA LIQUIDA BRAVO INCOLOR"), item(4, "C4", "CERA VERMELHA")];
// "CLEAR E NEUTRO É OBSERVAÇÃO, NÃO PRODUTO"
const DETERGENTES = [item(10, "D1", "DETERGENTE YPE 5LTS CLEAR"), item(11, "D2", "DETERGENTE YPE 5LTS NEUTRO")];
const CERA_APROVADA = aprovarPalavras(observacaoInicial(), ["pasta", "liquida", "bravo", "piso"]);

describe("quais grupos usam a regra", () => {
  it("por padrão, os grupos de limpeza, copa, cozinha e utensílios (pelo nome, sem acento nem caixa)", () => {
    for (const g of ["LIMPEZA", "Material de Limpeza", "COPA E COZINHA", "Cozinha industrial", "UTENSÍLIOS DOMÉSTICOS", "Utensilios"]) expect(grupoUsaObservacao(undefined, g)).toBe(true);
    for (const g of ["AUTOPEÇAS", "FERRAGENS", "Peças", "SEM GRUPO"]) expect(grupoUsaObservacao(observacaoInicial(), g)).toBe(false);
  });
  it("a escolha do analista vale mais que o padrão, nos dois sentidos, e voltar ao padrão apaga as escolhas", () => {
    let cfg = definirGrupo(observacaoInicial(), "FERRAGENS", true); cfg = definirGrupo(cfg, "LIMPEZA", false);
    expect(grupoUsaObservacao(cfg, "FERRAGENS")).toBe(true); expect(grupoUsaObservacao(cfg, "LIMPEZA")).toBe(false);
    const padrao = gruposNoPadrao(cfg); expect(grupoUsaObservacao(padrao, "FERRAGENS")).toBe(false); expect(grupoUsaObservacao(padrao, "LIMPEZA")).toBe(true);
    expect(gruposMarcados(cfg, ["LIMPEZA", "FERRAGENS", "COPA"])).toEqual(["FERRAGENS", "COPA"]);
  });
});

describe("a descrição em palavras e medidas", () => {
  it("5LTS, 5 L e 5000 ML são a mesma medida; a unidade escrita junto do número não vira palavra", () => {
    const a = analisarDescricao("DETERGENTE YPE 5LTS CLEAR"); const b = analisarDescricao("Detergente Ype 5 L clear"); const c = analisarDescricao("DETERGENTE YPE 5000ML CLEAR");
    expect(a.medidas).toEqual(["volume:5000"]); expect(b.medidas).toEqual(a.medidas); expect(c.medidas).toEqual(a.medidas);
    expect(a.tokens.map((t) => t.f)).toEqual(["detergente", "ype", "clear"]);
    expect(rotuloMedida("volume:5000")).toBe("5 L"); expect(rotuloMedida("volume:500")).toBe("500 ml"); expect(rotuloMedida("massa:1500")).toBe("1,5 kg"); expect(rotuloMedida("percentual:70")).toBe("70%");
  });
  it("tira acento, caixa, plural e conectivos das formas, mas guarda como a palavra foi escrita", () => {
    const a = analisarDescricao("CERA EM PASTA LÍQUIDA PARA PISOS");
    expect(a.tokens.map((t) => t.f)).toEqual(["cera", "pasta", "liquida", "piso"]); expect(a.tokens.map((t) => t.t)).toEqual(["cera", "pasta", "líquida", "pisos"]);
    expect(formaDaPalavra("LUVAS")).toBe("luva"); expect(formaDaPalavra("GÁS")).toBe("gas"); expect(formaDaPalavra("CERA")).toBe("cera"); expect(formaDaPalavra("PAPEL-TOALHA")).toBe("papeltoalha");
  });
  it("lê vírgula decimal, percentual, comprimento e contagem; 'c/12' vira palavra, não medida", () => {
    expect(analisarDescricao("ÁGUA SANITÁRIA 2,5L").medidas).toEqual(["volume:2500"]);
    expect(analisarDescricao("ÁLCOOL 70%").medidas).toEqual(["percentual:70"]);
    expect(analisarDescricao("FITA 20MM").medidas).toEqual(["comprimento:20"]); expect(analisarDescricao("FITA 2CM").medidas).toEqual(["comprimento:20"]);
    expect(analisarDescricao("SACO LIXO 100 UN").medidas).toEqual(["contagem:100"]);
    expect(analisarDescricao("COPO C/50").tokens.map((t) => t.f)).toEqual(["copo", "com", "50"]);
  });
  it("número no padrão brasileiro: 1.000 é mil, mas 1,000 e 0,750 são decimais (um litro e setecentos e cinquenta mililitros)", () => {
    expect(analisarDescricao("AGUA SANITARIA 1,000 L").medidas).toEqual(["volume:1000"]); expect(analisarDescricao("AGUA SANITARIA 1 L").medidas).toEqual(["volume:1000"]);
    expect(analisarDescricao("AZEITE 0,750L").medidas).toEqual(["volume:750"]); expect(analisarDescricao("AGUA 1.000 ML").medidas).toEqual(["volume:1000"]);
    expect(analisarDescricao("TANQUE 1.500,5 L").medidas).toEqual(["volume:1500500"]);
  });
  it("COM e SEM não são conectivos descartáveis: separam o produto (COPO COM TAMPA x COPO SEM TAMPA)", () => {
    expect(analisarDescricao("COPO COM TAMPA").tokens.map((t) => t.f)).toEqual(["copo", "com", "tampa"]); expect(analisarDescricao("LUVA S/FORRO").tokens.map((t) => t.f)).toEqual(["luva", "sem", "forro"]);
    expect(analisarDescricao("LUVA C/FORRO").tokens.map((t) => t.f)).toEqual(analisarDescricao("LUVA COM FORRO").tokens.map((t) => t.f));
    const itens = [item(1, "A", "COPO DESCARTAVEL COM TAMPA BRANCO"), item(2, "B", "COPO DESCARTAVEL SEM TAMPA")]; expect(aplicarObservacao(itens, undefined)).toBe(itens);
    const iguais = [item(1, "A", "LUVA C/FORRO AZUL"), item(2, "B", "LUVA COM FORRO")]; expect(aplicarObservacao(iguais, undefined)[0].duplicidade.porObservacao).toBe(true);
  });
  it("não confunde código de modelo com medida (número colado em letras) e aceita descrição vazia", () => {
    expect(analisarDescricao("BOMBA BS2G").medidas).toEqual([]);
    expect(analisarDescricao("").tokens).toEqual([]); expect(analisarDescricao(null).medidas).toEqual([]);
  });
});

describe("variante é observação: itens que só diferem por ela são o mesmo produto", () => {
  it("CLEAR e NEUTRO: o detergente é o mesmo produto (já vêm como observação nos grupos de limpeza)", () => {
    const r = aplicarObservacao(DETERGENTES, undefined); const m = porLinha(r);
    const a = m.get(10).duplicidade; const b = m.get(11).duplicidade;
    expect(a.grupo).toBe(b.grupo); expect(a.nivel).toBe("MUITO_PROVAVEL"); expect(a.porObservacao).toBe(true);
    expect(a.observacao.palavras).toEqual(["CLEAR"]); expect(b.observacao.palavras).toEqual(["NEUTRO"]); expect(observacaoDoItem(m.get(11))).toEqual(["NEUTRO"]);
    expect(a.candidatos.map((c) => c.linha)).toEqual([11]); expect(a.candidatos[0].motivos[0]).toBe("mesmo produto (DETERGENTE YPE 5 L): a diferença é só observação, CLEAR × NEUTRO");
    expect(m.get(10).candidatos_duplicidade).toEqual([11]);
  });
  it("as salvaguardas do detector valem: unidade ausente ou NCM diferente nunca dão indicação alta, e o motivo diz por quê; o mesmo NCM (ou nenhum) dá", () => {
    const par = (a, b) => { const r = aplicarObservacao([item(1, "A", "DETERGENTE YPE 5LTS CLEAR", a), item(2, "B", "DETERGENTE YPE 5LTS NEUTRO", b)], undefined); return [r[0].duplicidade, r[1].duplicidade]; };
    const [semUn] = par({ unidade: "" }, { unidade: "" });
    expect(semUn.nivel).toBe("POSSIVEL"); expect(semUn.grupo).toBeUndefined(); expect(semUn.candidatos[0].motivos).toContain("unidade ausente em um dos itens");
    const [difNcm, difNcmB] = par({ ncm: "34022000" }, { ncm: "34029000" });
    expect(difNcm.nivel).toBe("POSSIVEL"); expect(difNcm.candidatos[0].motivos).toContain("NCM diferente (34022000 × 34029000) — revisar também a classificação"); expect(difNcmB.grupo).toBeUndefined();
    const [umNcm] = par({ ncm: "34022000" }, {}); expect(umNcm.nivel).toBe("POSSIVEL"); expect(umNcm.candidatos[0].motivos).toContain("NCM informado em só um dos itens");
    const [mesmoNcm, mesmoNcmB] = par({ ncm: "3402.20.00" }, { ncm: "34022000" }); expect(mesmoNcm.nivel).toBe("MUITO_PROVAVEL"); expect(mesmoNcm.grupo).toBe(mesmoNcmB.grupo); // NCM com ou sem pontos é o mesmo
    const [semNcm] = par({}, {}); expect(semNcm.nivel).toBe("MUITO_PROVAVEL");
    expect(montarConjuntos(aplicarObservacao([item(1, "A", "DETERGENTE YPE 5LTS CLEAR", { ncm: "34022000" }), item(2, "B", "DETERGENTE YPE 5LTS NEUTRO", { ncm: "34029000" })], undefined))[0].nivel).toBe("POSSIVEL"); // fora do "aceitar em bloco"
  });
  it("a indicação da regra se identifica (origem) e só conta o que ela acrescentou: o par que o detector já tinha com a mesma força não é mexido", () => {
    const r = aplicarObservacao(DETERGENTES, undefined); expect(r[0].duplicidade.candidatos[0].origem).toBe("observacao");
    const exatos = [item(1, "A", "ESPONJA DUPLA FACE 3 UN AZUL", { duplicidade: dup(5, [2]) }), item(2, "B", "ESPONJA DUPLA FACE 3 UN AZUL", { duplicidade: dup(5, [1]) })];
    expect(aplicarObservacao(exatos, undefined)).toBe(exatos); // o detector já tinha o par como idêntico: nada a acrescentar, nada de "ligado pela regra"
    expect(efeitoObservacao(aplicarObservacao(exatos, undefined))).toEqual({ itens: 0, conjuntos: 0 });
    // o detector tinha o par só como possível: a regra o promove (e passa a contar)
    const possiveis = [item(1, "A", "ESPONJA DUPLA FACE 3 UN AZUL", { duplicidade: dup(null, [2], "POSSIVEL", 0.8) }), item(2, "B", "ESPONJA DUPLA FACE 3 UN VERDE", { duplicidade: dup(null, [1], "POSSIVEL", 0.8) })];
    const p = aplicarObservacao(possiveis, undefined); expect(p.map((x) => [x.duplicidade.nivel, x.duplicidade.porObservacao])).toEqual([["MUITO_PROVAVEL", true], ["MUITO_PROVAVEL", true]]);
    // num conjunto onde a regra acrescentou um item, os que o detector já tinha entram junto, com a variante de cada um
    const misto = [item(1, "A", "ESPONJA AZUL", { duplicidade: dup(0, [2]) }), item(2, "B", "ESPONJA AZUL", { duplicidade: dup(0, [1]) }), item(3, "C", "ESPONJA VERDE")];
    const m = porLinha(aplicarObservacao(misto, undefined)); expect([1, 2, 3].map((l) => m.get(l).duplicidade.grupo)).toEqual([0, 0, 0]); expect([1, 2, 3].map((l) => m.get(l).duplicidade.porObservacao)).toEqual([true, true, true]);
    expect(m.get(2).duplicidade.observacao.palavras).toEqual(["AZUL"]); expect(efeitoObservacao([...m.values()])).toEqual({ itens: 3, conjuntos: 1 });
  });
  it("o efeito conta conjuntos de verdade: um par só possível entre grupos é um conjunto, não zero nem um grupo fantasma", () => {
    const r = aplicarObservacao([item(1, "A", "DETERGENTE YPE 5LTS CLEAR", { grupo_atual: "LIMPEZA" }), item(2, "B", "DETERGENTE YPE 5LTS NEUTRO", { grupo_atual: "COPA E COZINHA" })], undefined);
    expect(efeitoObservacao(r)).toEqual({ itens: 2, conjuntos: 1 });
  });
  it("a medida e a unidade continuam separando: 5 L e 500 ml, ou UN e CX, são produtos diferentes", () => {
    expect(aplicarObservacao([item(1, "A", "DETERGENTE YPE 5LTS CLEAR"), item(2, "B", "DETERGENTE YPE 500ML NEUTRO")], undefined)).toHaveLength(2);
    const itens = [item(1, "A", "DETERGENTE YPE 5LTS CLEAR"), item(2, "B", "DETERGENTE YPE 5LTS NEUTRO", { unidade: "CX" })];
    expect(aplicarObservacao(itens, undefined)).toBe(itens);
    const marca = [item(1, "A", "DETERGENTE YPE 5LTS CLEAR"), item(2, "B", "DETERGENTE LIMPOL 5LTS NEUTRO")]; expect(aplicarObservacao(marca, undefined)).toBe(marca); // outra marca é outro produto
  });
  it("as quatro ceras só viram a mesma coisa quando o analista aprova as palavras (as cores já vêm aprovadas)", () => {
    expect(aplicarObservacao(CERAS, undefined)).toBe(CERAS); // PASTA, LÍQUIDA, BRAVO e PISO ainda são produto: nada muda
    const r = aplicarObservacao(CERAS, CERA_APROVADA); const m = porLinha(r);
    expect(new Set(r.map((x) => x.duplicidade.grupo)).size).toBe(1);
    expect(r.every((x) => x.duplicidade.nivel === "MUITO_PROVAVEL" && x.duplicidade.porObservacao)).toBe(true);
    expect(m.get(2).duplicidade.observacao.palavras).toEqual(["PASTA", "INCOLOR", "PISO"]); expect(m.get(3).duplicidade.observacao.palavras).toEqual(["LIQUIDA", "BRAVO", "INCOLOR"]); expect(m.get(4).duplicidade.observacao.palavras).toEqual(["VERMELHA"]);
    const conjuntos = montarConjuntos(r); expect(conjuntos).toHaveLength(1); expect(conjuntos[0].membros.map((x) => x.linha).sort()).toEqual([1, 2, 3, 4]); expect(conjuntos[0].nivel).toBe("MUITO_PROVAVEL");
  });
  it("aprovar só parte das palavras junta só parte: sem aprovar BRAVO, a cera vermelha e a de piso formam um conjunto e a BRAVO outro", () => {
    const cfg = aprovarPalavras(observacaoInicial(), ["pasta", "liquida", "piso"]); const r = aplicarObservacao(CERAS, cfg); const m = porLinha(r);
    expect(m.get(1).duplicidade.grupo).toBe(m.get(3).duplicidade.grupo); expect(m.get(2).duplicidade.grupo).toBe(m.get(4).duplicidade.grupo); expect(m.get(1).duplicidade.grupo).not.toBe(m.get(2).duplicidade.grupo);
  });
  it("o item sem palavra de observação entra no conjunto, e os idênticos entre si seguem com o detector", () => {
    const itens = [item(1, "A", "SABAO EM BARRA 200G"), item(2, "B", "SABAO EM BARRA 200G"), item(3, "C", "SABAO BARRA 200G BRANCO")];
    const r = aplicarObservacao(itens, observacaoInicial()); const m = porLinha(r);
    expect(new Set(r.map((x) => x.duplicidade.grupo)).size).toBe(1);
    expect(m.get(1).duplicidade.candidatos.map((c) => c.linha)).toEqual([3]); expect(m.get(3).duplicidade.candidatos.map((c) => c.linha).sort()).toEqual([1, 2]);
  });
  it("só os grupos marcados: peças de cores diferentes continuam sendo itens diferentes, até o analista marcar o grupo", () => {
    const pecas = [item(1, "P1", "PARAFUSO AZUL 10MM", { grupo_atual: "FERRAGENS" }), item(2, "P2", "PARAFUSO VERMELHO 10MM", { grupo_atual: "FERRAGENS" })];
    expect(aplicarObservacao(pecas, undefined)).toBe(pecas);
    const r = aplicarObservacao(pecas, definirGrupo(observacaoInicial(), "FERRAGENS", true)); expect(r[0].duplicidade.grupo).toBe(r[1].duplicidade.grupo);
    expect(aplicarObservacao(DETERGENTES, definirGrupo(observacaoInicial(), "LIMPEZA", false))).toBe(DETERGENTES); // desmarcado: CLEAR e NEUTRO voltam a ser produto
  });
  it("tirar uma palavra padrão (ignorá-la) a devolve a produto", () => {
    const itens = [item(1, "A", "ESPONJA AZUL"), item(2, "B", "ESPONJA VERDE")];
    expect(aplicarObservacao(itens, undefined)).not.toBe(itens);
    expect(aplicarObservacao(itens, ignorarPalavra(ignorarPalavra(observacaoInicial(), "azul"), "verde"))).toBe(itens);
  });
  it("entre dois grupos marcados a indicação é só possível e não forma grupo de duplicados", () => {
    const itens = [item(1, "A", "DETERGENTE YPE 5LTS CLEAR", { grupo_atual: "LIMPEZA" }), item(2, "B", "DETERGENTE YPE 5LTS NEUTRO", { grupo_atual: "COPA E COZINHA" })];
    const r = aplicarObservacao(itens, undefined);
    expect(r.map((x) => [x.duplicidade.nivel, x.duplicidade.grupo ?? null])).toEqual([["POSSIVEL", null], ["POSSIVEL", null]]);
    expect(r[0].duplicidade.candidatos[0].motivos).toEqual(["mesmo produto (DETERGENTE YPE 5 L): a diferença é só observação, CLEAR × NEUTRO", "grupos de itens diferentes (LIMPEZA × COPA E COZINHA)"]);
    expect(montarConjuntos(r)).toHaveLength(1); // ainda aparece para o analista comparar
  });
  it("junta ao grupo de duplicados que o detector já tinha (todos os membros dele) e mantém o que o detector disse", () => {
    const itens = [item(1, "A", "DETERGENTE YPE 5LTS CLEAR", { duplicidade: dup(3, [5]) }), item(5, "E", "DETERGENTE YPE 5LTS CLEAR LIMAO", { duplicidade: dup(3, [1]) }), item(2, "B", "DETERGENTE YPE 5LTS NEUTRO", { saldo: 50 })];
    const r = aplicarObservacao(itens, aprovarPalavras(observacaoInicial(), ["limao"])); const m = porLinha(r);
    expect([1, 2, 5].map((l) => m.get(l).duplicidade.grupo)).toEqual([3, 3, 3]); // o rótulo do detector vale
    expect(m.get(1).duplicidade.nivel).toBe("EXATA"); expect(m.get(1).duplicidade.candidatos.map((c) => [c.linha, c.nivel])).toEqual([[5, "EXATA"], [2, "MUITO_PROVAVEL"]]);
    expect(m.get(1).duplicidade.candidatos[0].motivos).toEqual(["descrições iguais", expect.stringContaining("mesmo produto")]);
    expect([1, 2, 5].map((l) => m.get(l).duplicidade.mestre)).toEqual([2, 2, 2]); // mestre pelo critério de quem fica: o de maior saldo
  });
  it("dois grupos do detector ligados pela regra viram um só, com o menor rótulo", () => {
    const itens = [item(1, "A", "ESPONJA AZUL", { duplicidade: dup(7, [3]) }), item(3, "C", "ESPONJA AZUL ", { duplicidade: dup(7, [1]) }), item(2, "B", "ESPONJA VERDE", { duplicidade: dup(4, [6]) }), item(6, "F", "ESPONJA VERDE ", { duplicidade: dup(4, [2]) })];
    const r = aplicarObservacao(itens, undefined); expect(r.map((x) => x.duplicidade.grupo)).toEqual([4, 4, 4, 4]);
  });
  it("um conjunto novo recebe um rótulo que não colide com os do detector", () => {
    const itens = [item(1, "X", "TUDO OUTRA COISA", { duplicidade: dup(0, [9]) }), item(9, "Y", "TUDO OUTRA COISA ", { duplicidade: dup(0, [1]) }), ...DETERGENTES];
    const r = porLinha(aplicarObservacao(itens, undefined)); expect(r.get(10).duplicidade.grupo).toBe(1); expect(r.get(11).duplicidade.grupo).toBe(1); expect(r.get(1).duplicidade.grupo).toBe(0);
  });
  it("descrição só de palavras de observação não tem produto e fica de fora", () => {
    const itens = [item(1, "A", "AZUL"), item(2, "B", "AZUL CLARO"), item(3, "C", "")]; expect(aplicarObservacao(itens, undefined)).toBe(itens);
  });
  it("não altera os itens recebidos e é estável: aplicar de novo dá o mesmo resultado", () => {
    const entrada = structuredClone(CERAS); const congelada = entrada.map((x) => Object.freeze({ ...x }));
    const r = aplicarObservacao(congelada, CERA_APROVADA); expect(entrada).toEqual(CERAS);
    expect(aplicarObservacao(r, CERA_APROVADA)).toEqual(r);
  });
  it("itens fora dos grupos marcados passam intactos (mesmo objeto)", () => {
    const outro = item(99, "Z", "PARAFUSO AZUL", { grupo_atual: "FERRAGENS" }); const r = aplicarObservacao([...DETERGENTES, outro], undefined); expect(r[2]).toBe(outro);
  });
  it("o achado de Duplicidade passa a existir para esses itens (o teste lê a indicação do item)", () => {
    const crit = CRITERIOS.find((c) => c.id === "duplicidade"); const r = aplicarObservacao(DETERGENTES, undefined);
    expect(achadosDoCriterio(crit, DETERGENTES, criarTestes(DETERGENTES, {}))).toHaveLength(0);
    expect(achadosDoCriterio(crit, r, criarTestes(r, {})).map((a) => a.item.linha)).toEqual([10, 11]);
  });
  it("uma base grande é processada de uma vez (sem custo quadrático), mesmo com milhares de itens iguais no mesmo balde", () => {
    const grandes = []; for (let i = 0; i < 12000; i++) grandes.push(item(i + 1, `K${i}`, `PRODUTO ${i % 3000} EXTRA ${i % 7} ${i % 2 ? "AZUL" : ""}`));
    const t0 = Date.now(); const r = aplicarObservacao(grandes, undefined); expect(r).toHaveLength(12000); expect(Date.now() - t0).toBeLessThan(5000);
    const iguais = []; for (let i = 0; i < 16000; i++) iguais.push(item(i + 1, `S${i}`, "SABAO EM BARRA 200G")); iguais.push(item(16001, "S-AZUL", "SABAO EM BARRA 200G AZUL"));
    const t1 = Date.now(); const s = aplicarObservacao(iguais, undefined); expect(s[0].duplicidade.candidatos.map((c) => c.linha)).toEqual([16001]); expect(Date.now() - t1).toBeLessThan(3000); // antes: 27 s
  });
});

describe("sugestões de palavras de observação", () => {
  it("as palavras que mudam entre itens parecidos, das mais frequentes às menos; as já aprovadas e as ignoradas ficam de fora", () => {
    const itens = [...CERAS, item(5, "C5", "CERA EM PASTA 500G"), item(6, "C6", "CERA LIQUIDA 500G"), item(7, "C7", "CERA LIQUIDA 500G AMARELA")];
    expect(sugerirPalavras(CERAS, undefined).map((s) => s.forma).sort()).toEqual(["bravo", "liquida", "pasta", "piso"]);
    const s = sugerirPalavras(itens, undefined); const pasta = s.find((x) => x.forma === "pasta");
    expect(pasta.palavra).toBe("PASTA"); expect(pasta.itens).toBeGreaterThanOrEqual(3); expect(pasta.exemplos.length).toBeGreaterThan(0);
    expect(sugerirPalavras(CERAS, aprovarPalavras(observacaoInicial(), ["pasta"])).map((x) => x.forma)).not.toContain("pasta");
    expect(sugerirPalavras(CERAS, ignorarPalavra(observacaoInicial(), "bravo")).map((x) => x.forma)).not.toContain("bravo");
    expect(s.map((x) => x.forma)).not.toContain("incolor"); // já é observação
  });
  it("números e palavras de uma letra não são sugeridos; grupos desmarcados não entram; sem par não há sugestão", () => {
    const itens = [item(1, "A", "SACO LIXO 100L PRETO 30"), item(2, "B", "SACO LIXO 100L 40"), item(3, "C", "SACO LIXO 100L B")];
    expect(sugerirPalavras(itens, undefined)).toEqual([]);
    expect(sugerirPalavras(CERAS.map((x) => ({ ...x, grupo_atual: "FERRAGENS" })), undefined)).toEqual([]);
    expect(sugerirPalavras([CERAS[0]], undefined)).toEqual([]);
  });
});

describe("editar os parâmetros (sempre um objeto novo)", () => {
  it("o que é produto ou sabor na copa e na cozinha não vem como observação (VINHO, LARANJA), mas o analista pode aprovar; a palavra digitada vira palavras, sem conectivos", () => {
    const taca = [item(1, "T1", "TACA VINHO 300ML", { grupo_atual: "COPA E COZINHA" }), item(2, "T2", "TACA 300ML", { grupo_atual: "COPA E COZINHA" }), item(3, "S1", "SUCO DE LARANJA 1L", { grupo_atual: "COPA E COZINHA" }), item(4, "S2", "SUCO 1L", { grupo_atual: "COPA E COZINHA" })];
    expect(aplicarObservacao(taca, undefined)).toBe(taca); expect(aplicarObservacao(taca, aprovarPalavras(observacaoInicial(), ["vinho"]))).not.toBe(taca);
    const a = aprovarPalavras(observacaoInicial(), ["em pasta", "anti-bacteriano", "a", "5"]);
    expect(Object.keys(a.palavras).sort()).toEqual(["anti", "bacteriano", "pasta"]); // "em" e "a" são conectivos e letra solta; "5" é número de um dígito
    expect(Object.keys(ignorarPalavra(observacaoInicial(), "de sol").palavras)).toEqual(["sol"]);
  });
  it("aprovar, ignorar e restaurar palavras; as grafias da mesma palavra são uma só", () => {
    const base = observacaoInicial(); const a = aprovarPalavras(base, ["LÍQUIDA", "Pastas"]);
    expect(base).toEqual({ grupos: {}, palavras: {} }); expect(a.palavras).toEqual({ liquida: true, pasta: true });
    expect([...palavrasAprovadas(a)]).toEqual(expect.arrayContaining(["liquida", "pasta", "incolor", "neutro", "clear"]));
    const i = ignorarPalavra(a, "azul"); expect(palavrasAprovadas(i).has("azul")).toBe(false); expect(palavrasIgnoradas(i)).toEqual([{ forma: "azul", palavra: "AZUL" }]);
    expect(palavrasAprovadas(restaurarPalavra(i, "azul")).has("azul")).toBe(true); expect(palavrasAprovadas(restaurarPalavra(i, "pasta")).has("pasta")).toBe(false);
    expect(palavrasAprovadas(aprovarPalavras(i, ["azul"])).has("azul")).toBe(true); // aprovar tira da lista das ignoradas
  });
  it("a lista em vigor diz quais são padrão e quais são do analista, e mostra as palavras como foram escritas (com acento)", () => {
    const v = palavrasEmVigor(aprovarPalavras(ignorarPalavra(observacaoInicial(), "verde"), ["pasta", "LÍQUIDA"]));
    expect(v.find((x) => x.forma === "pasta")).toEqual({ forma: "pasta", palavra: "PASTA", padrao: false }); expect(v.find((x) => x.forma === "azul").padrao).toBe(true); expect(v.some((x) => x.forma === "verde")).toBe(false);
    expect(v.find((x) => x.forma === "liquida").palavra).toBe("LÍQUIDA"); expect(v.find((x) => x.forma === "lila")).toMatchObject({ palavra: "LILÁS", padrao: true }); // o plural simples não estraga o rótulo
    expect(palavrasIgnoradas(ignorarPalavra(observacaoInicial(), "Sólido"))).toEqual([{ forma: "solido", palavra: "SÓLIDO" }]);
    expect(restaurarPalavra(aprovarPalavras(observacaoInicial(), ["LÍQUIDA"]), "liquida").rotulos).toEqual({}); // voltar ao que era apaga também o rótulo
    expect(v.map((x) => x.palavra)).toEqual([...v.map((x) => x.palavra)].sort((x, y) => x.localeCompare(y, "pt-BR")));
  });
  it("a assinatura diz se a regra liga os mesmos itens: marcar o que já é padrão, ou aprovar o que já é observação, não muda nada", () => {
    const nomes = ["LIMPEZA", "FERRAGENS"]; const a = (cfg) => assinaturaObservacao(cfg, nomes);
    const base = a(observacaoInicial());
    expect(a(definirGrupo(observacaoInicial(), "LIMPEZA", true))).toBe(base); expect(a(aprovarPalavras(observacaoInicial(), ["azul"]))).toBe(base); expect(a(ignorarPalavra(observacaoInicial(), "pasta"))).toBe(base); // ignorar o que não é observação só tira a palavra das sugestões
    expect(a(definirGrupo(observacaoInicial(), "FERRAGENS", true))).not.toBe(base); expect(a(definirGrupo(observacaoInicial(), "LIMPEZA", false))).not.toBe(base);
    expect(a(aprovarPalavras(observacaoInicial(), ["pasta"]))).not.toBe(base); expect(a(ignorarPalavra(observacaoInicial(), "azul"))).not.toBe(base);
  });
  it("o efeito da regra na base: itens ligados e conjuntos formados", () => {
    expect(efeitoObservacao(aplicarObservacao([...DETERGENTES, ...CERAS], CERA_APROVADA))).toEqual({ itens: 6, conjuntos: 2 });
    expect(efeitoObservacao([item(1, "A", "X")])).toEqual({ itens: 0, conjuntos: 0 });
  });
});
