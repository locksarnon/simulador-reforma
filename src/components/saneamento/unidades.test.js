import { describe, expect, it } from "vitest";
import { achadosUnidade, chaveUnidade, classificarUnidade, conteudoNaUnidade, fatorDaDecisao, fatorPelaDescricao, precisaFator, resumoUnidades, rotulosPadrao, unidadeCanonica } from "./unidades";
import { criarTestes } from "./logica";

const it1 = (unidade, descricao = "ITEM", linha = 2) => ({ linha, unidade, descricao, problemas: [] });
// Base de apoio que já usa os nomes do cliente para as unidades padrão (como na base real: QUILOGRAM, LITRO, METRO, UNIDADE).
const apoio = [it1("QUILOGRAM", "ADUBO", 90), it1("QUILOGRAM", "OUTRO", 91), it1("LITRO", "OLEO", 92), it1("METRO", "CABO", 93), it1("UNIDADE", "PARAFUSO", 94), it1("UNIDADE", "PORCA", 95)];
const roda = (itens, opcoes) => achadosUnidade([...apoio, ...itens], opcoes);

describe("chave e classe da unidade", () => {
  it("ignora acento, ponto, espaço e expoente", () => {
    expect(chaveUnidade("M²")).toBe("m2"); expect(chaveUnidade("M³")).toBe("m3"); expect(chaveUnidade("Big Bag")).toBe("bigbag"); expect(chaveUnidade("PÇ.")).toBe("pc"); expect(chaveUnidade("METRO CUB")).toBe("metrocub");
  });
  it("junta as grafias da mesma unidade e não inventa as que não conhece", () => {
    expect(unidadeCanonica("KGS")).toBe("kg"); expect(unidadeCanonica("Lt.")).toBe("l"); expect(unidadeCanonica("QUILOGRAM")).toBe("kg");
    expect(unidadeCanonica("METRO QUA")).toBe("m2"); expect(unidadeCanonica("PÇ")).toBe("un"); expect(unidadeCanonica("PC")).toBe("un");
    expect(unidadeCanonica("xyz")).toBeNull(); expect(unidadeCanonica("")).toBeNull(); expect(unidadeCanonica(undefined)).toBeNull();
  });
});

describe("classificação por medida (o conceito, não só os exemplos)", () => {
  const casos = [
    // massa
    ["MG", "menor", "massa", 1e-6], ["GRAMA", "menor", "massa", 0.001], ["KG", "padrao", "massa", 1], ["QUILOGRAM", "padrao", "massa", 1], ["TONELADA", "maior", "massa", 1000], ["T", "maior", "massa", 1000],
    // volume
    ["ML", "menor", "volume", 0.001], ["LITRO", "padrao", "volume", 1], ["LT", "padrao", "volume", 1], ["HL", "maior", "volume", 100], ["METRO CUB", "maior", "volume", 1000], ["M³", "maior", "volume", 1000],
    // comprimento
    ["MM", "menor", "comprimento", 0.001], ["CM", "menor", "comprimento", 0.01], ["MT", "padrao", "comprimento", 1], ["METRO", "padrao", "comprimento", 1], ["KM", "maior", "comprimento", 1000],
    // área
    ["CM2", "menor", "area", 0.0001], ["METRO QUA", "padrao", "area", 1], ["M2", "padrao", "area", 1], ["HA", "maior", "area", 10000], ["KM2", "maior", "area", 1e6],
    // contagem
    ["UNIDADE", "padrao", "contagem", 1], ["PECA", "padrao", "contagem", 1], ["DOSE", "padrao", "contagem", 1], ["CABECA", "padrao", "contagem", 1], ["DZ", "maior", "contagem", 12], ["DUZIA", "maior", "contagem", 12], ["CENTO", "maior", "contagem", 100], ["MILHAR", "maior", "contagem", 1000],
  ];
  it.each(casos)("%s → %s de %s (fator %s)", (unidade, nivel, grandeza, fator) => {
    expect(classificarUnidade(unidade)).toMatchObject({ nivel, grandeza, fator });
  });
  it.each(["maior"])("fator exato por definição é evidência universal (%s)", (nivel) => {
    for (const [u, n] of casos) if (n === nivel) expect(classificarUnidade(u).evidencia).toBe("universal");
  });
  it("embalagens têm a medida, mas o conteúdo vem do item", () => {
    for (const [u, g] of [["SACA", "massa"], ["SC", "massa"], ["BIG BAG", "massa"], ["BB", "massa"], ["GALAO", "volume"], ["GL", "volume"], ["CAIXA", "contagem"], ["CX", "contagem"], ["PACOTE", "contagem"], ["FARDO", "contagem"]]) {
      expect(classificarUnidade(u)).toMatchObject({ nivel: "embalagem", grandeza: g, fator: null });
    }
  });
  it("conjuntos são aceitos como estão (o item é o conjunto)", () => {
    for (const u of ["JOGO", "JG", "CONJUNTO", "CJ", "KIT", "PAR"]) expect(classificarUnidade(u)).toMatchObject({ nivel: "conjunto" });
  });
  it("unidade ambígua ou desconhecida não é adivinhada: fica sem regra", () => {
    for (const u of ["ROLO", "BARRA", "BALDE", "TAMBOR", "BOMBONA", "FRASCO", "LATA", "SE", "SV", "PT", "P", "DS", "ESTERO", "MEGAWATT", "BD20"]) expect(classificarUnidade(u)).toBeNull();
    expect(classificarUnidade("")).toBeNull();
  });
});

describe("conteúdo escrito na própria unidade", () => {
  it("lê a medida colada à embalagem", () => {
    expect(conteudoNaUnidade("BALDE 20KG")).toEqual({ nome: "balde", grandeza: "massa", fator: 20 });
    expect(conteudoNaUnidade("SACA 50 KG")).toEqual({ nome: "saca", grandeza: "massa", fator: 50 });
    expect(conteudoNaUnidade("FRASCO 500ML")).toEqual({ nome: "frasco", grandeza: "volume", fator: 0.5 });
    expect(conteudoNaUnidade("TAMBOR 200L")).toEqual({ nome: "tambor", grandeza: "volume", fator: 200 });
    expect(conteudoNaUnidade("CAIXA 12 UN")).toEqual({ nome: "caixa", grandeza: "contagem", fator: 12 });
  });
  it("número sem medida só vale para embalagem conhecida (CX12, SC60); BD20 pode ser kg ou litro e não é adivinhado", () => {
    expect(conteudoNaUnidade("CX12")).toEqual({ nome: "cx", grandeza: "contagem", fator: 12 });
    expect(conteudoNaUnidade("SC60")).toEqual({ nome: "sc", grandeza: "massa", fator: 60 });
    for (const u of ["BD20", "M2", "M3", "ROLO", "20KG", "KG", "C/12", ""]) expect(conteudoNaUnidade(u)).toBeNull();
  });
  it("a classificação usa esse conteúdo como evidência da própria unidade", () => {
    expect(classificarUnidade("BALDE 20KG")).toMatchObject({ origem: "unidade", nivel: "embalagem", grandeza: "massa", fator: 20, evidencia: "unidade" });
  });
});

describe("fator pela descrição (só com uma medida inequívoca)", () => {
  it("massa, volume, comprimento e contagem", () => {
    expect(fatorPelaDescricao("massa", "SEMENTE MILHO SACO 60 KG")).toBe(60);
    expect(fatorPelaDescricao("massa", "PRODUTO 500 G")).toBe(0.5);
    expect(fatorPelaDescricao("massa", "SAL GROSSO 1.000 KG")).toBe(1000);
    expect(fatorPelaDescricao("volume", "DILUENTE P/ EPOXI 5 LT")).toBe(5);
    expect(fatorPelaDescricao("volume", "OLEO 0,9 L")).toBe(0.9);
    expect(fatorPelaDescricao("volume", "FRASCO 250 ML")).toBe(0.25);
    expect(fatorPelaDescricao("volume", "OLEO 15W40 20L")).toBe(20);
    expect(fatorPelaDescricao("comprimento", "FITA ROLO 50 M")).toBe(50);
    expect(fatorPelaDescricao("contagem", "LUVA NITRILICA C/12")).toBe(12);
    expect(fatorPelaDescricao("contagem", "PARAFUSO COM 100 UN")).toBe(100);
    expect(fatorPelaDescricao("contagem", "CAIXA COM 12 UNIDADES")).toBe(12);
  });
  it("medidas diferentes na mesma descrição = não dá para saber qual é o conteúdo", () => {
    expect(fatorPelaDescricao("massa", "TELA 2KG X 50KG")).toBeNull();
    expect(fatorPelaDescricao("comprimento", "TELA 2M X 50M")).toBeNull();
    expect(fatorPelaDescricao("massa", "SACO 50KG - 50 KG")).toBe(50);
  });
  it("dimensão do produto e códigos não são conteúdo", () => {
    expect(fatorPelaDescricao("comprimento", "TUBO 20MM")).toBeNull();
    expect(fatorPelaDescricao("comprimento", "TOALHA 20CM X 21 CM")).toBeNull();
    expect(fatorPelaDescricao("massa", "REF ABC5KG")).toBeNull();
    expect(fatorPelaDescricao("massa", "SEMENTE DE SOJA 22025HB4 (TMG 430 HB4)")).toBeNull();
    expect(fatorPelaDescricao("massa", "SEM MEDIDA")).toBeNull();
    expect(fatorPelaDescricao("area", "PISO 10 M2")).toBeNull();
    expect(fatorPelaDescricao("massa", "")).toBeNull();
  });
});

describe("achados do critério de unidade", () => {
  it("unidade maior vira unidade de compra: sugere a unidade padrão com o nome que a base já usa e o fator exato", () => {
    const x = it1("TONELADA", "MILHO GRAO");
    expect(roda([x])(x)).toMatchObject({ achado: true, sugerida: "QUILOGRAM", extra: { tipo: "conversao", de: "TONELADA", grandeza: "massa", nivel: "maior", fator: 1000, evidencia: "universal" } });
    expect(roda([x])(x).motivo).toBe("Maior que a unidade padrão de massa (QUILOGRAM): 1 TONELADA = 1.000 QUILOGRAM");
  });
  it("a regra vale para qualquer medida, não só para tonelada e galão", () => {
    const casos = [["HL", "LITRO", 100], ["METRO CUB", "LITRO", 1000], ["KM", "METRO", 1000], ["DZ", "UNIDADE", 12], ["CENTO", "UNIDADE", 100], ["MILHAR", "UNIDADE", 1000]];
    for (const [u, alvo, fator] of casos) { const x = it1(u); expect(roda([x])(x)).toMatchObject({ achado: true, sugerida: alvo, extra: { fator, evidencia: "universal" } }); }
    const ha = it1("HA"); expect(roda([ha])(ha)).toMatchObject({ sugerida: "M2", extra: { fator: 10000 } });
  });
  it("sem a unidade padrão na base, usa o nome da política (KG, LITRO, UNIDADE, METRO)", () => {
    const solo = (u, d) => { const x = it1(u, d); return achadosUnidade([x])(x); };
    expect(solo("TON", "SOJA").sugerida).toBe("KG"); expect(solo("GALAO", "HERBICIDA 5L").sugerida).toBe("LITRO");
    expect(solo("CAIXA", "LUVA C/12").sugerida).toBe("UNIDADE"); expect(solo("HA", "TERRA").sugerida).toBe("M2");
  });
  it("embalagem: fator da descrição fica para confirmar; sem medida inequívoca fica a informar (nunca inventado)", () => {
    const a = it1("SACA", "SEMENTE MILHO SACO 60 KG"); expect(roda([a])(a)).toMatchObject({ sugerida: "QUILOGRAM", extra: { fator: 60, evidencia: "descricao" } });
    expect(roda([a])(a).motivo).toBe("Embalagem de massa: a descrição indica 1 SACA = 60 QUILOGRAM (confirmar)");
    const g = it1("GALAO", "DILUENTE P/ EPOXI 5 LT"); expect(roda([g])(g)).toMatchObject({ sugerida: "LITRO", extra: { fator: 5, evidencia: "descricao" } });
    const c = it1("CX", "LUVA NITRILICA C/12"); expect(roda([c])(c).extra).toMatchObject({ fator: 12, evidencia: "descricao" });
    const b = it1("BB", "SEMENTE DE SOJA 22025HB4 (TMG 430 HB4)"); const rb = roda([b])(b);
    expect(rb.extra).toMatchObject({ fator: null, evidencia: null }); expect(rb.motivo).toBe("Embalagem de massa: informe quantos QUILOGRAM há em cada BB");
    const p = it1("PACOTE", "ROSQUINHA MABEL SABOR COCO 700G"); expect(roda([p])(p).extra.fator).toBeNull(); // 700G é o peso do produto, não a quantidade do pacote
    const f = it1("FARDO", "TOALHA DE PAPEL INTERFOLHA 20CM X 21 CM"); expect(roda([f])(f).extra.fator).toBeNull();
  });
  it("conteúdo escrito na unidade vale como evidência", () => {
    const x = it1("BALDE 20KG", "OLEO TRANSMISSAO PREMIUM 10W30");
    expect(roda([x])(x)).toMatchObject({ achado: true, sugerida: "QUILOGRAM", extra: { fator: 20, evidencia: "unidade" } });
    expect(roda([x])(x).motivo).toBe("Embalagem de massa: o conteúdo está na própria unidade: 1 BALDE 20KG = 20 QUILOGRAM");
  });
  it("unidade já na padrão, ainda menor, dose, cabeça e conjunto não são achado", () => {
    for (const u of ["QUILOGRAM", "LITRO", "METRO", "UNIDADE", "GRAMA", "MG", "ML", "CM", "MM", "METRO QUA", "DOSE", "CABECA", "JOGO", "CONJUNTO", "PAR", "KIT"]) {
      const x = it1(u); const r = roda([x])(x); expect(r.achado, u).toBe(false);
    }
  });
  it("unidade vazia e unidade sem regra são pendência, e a mensagem diz o que fazer", () => {
    expect(roda([])(it1("")).motivo).toBe("Sem unidade de medida");
    const x = it1("ROLO"); expect(roda([x])(x)).toMatchObject({ achado: true }); expect(roda([x])(x).motivo).toContain("sem regra na política");
    expect(roda([x])(x).sugerida).toBeUndefined();
  });
  it("grafia diferente da dominante sugere a dominante", () => {
    const x = it1("KG", "SEMENTE DE ALGODAO"); const y = it1("KGS"); const z = it1("UN");
    expect(roda([x])(x)).toMatchObject({ achado: true, sugerida: "QUILOGRAM", extra: { tipo: "grafia", de: "KG" }, motivo: 'Grafia "KG" difere da dominante "QUILOGRAM"' });
    expect(roda([y])(y).sugerida).toBe("QUILOGRAM"); expect(roda([z])(z).sugerida).toBe("UNIDADE");
    const m2 = [it1("METRO QUA"), it1("METRO QUA"), it1("M2")]; expect(achadosUnidade(m2)(m2[2]).sugerida).toBe("METRO QUA");
    const pc = it1("PECA", "ANEL"); expect(roda([pc])(pc)).toMatchObject({ achado: true, sugerida: "UNIDADE", extra: { tipo: "grafia" } }); // peça e unidade: uma grafia só
  });
  it("com a política desligada só restam as regras de grafia", () => {
    const x = it1("TONELADA", "MILHO"); expect(roda([x], { politica: false })(x).achado).toBe(false);
    const x2 = it1("TONELADA", "TRIGO", 4); const y = it1("TON", "SOJA", 5);
    expect(roda([x, x2, y], { politica: false })(y)).toMatchObject({ achado: true, sugerida: "TONELADA", extra: { tipo: "grafia" } });
    expect(roda([x, x2, y], { politica: false })(x2).achado).toBe(false);
    expect(criarTestes([...apoio, x], { politicaUnidade: { ativa: false } }).unidade(x).achado).toBe(false);
    expect(criarTestes([...apoio, x], {}).unidade(x).achado).toBe(true);
  });
});

describe("regras do projeto sobre a política", () => {
  const regra = (unidade, r) => ({ [chaveUnidade(unidade)]: r });
  it("manter: a unidade é aceita como unidade de estoque", () => {
    const x = it1("METRO CUB", "LENHA EUCALIPTO");
    expect(roda([x], { regras: regra("METRO CUB", { manter: true }) })(x).achado).toBe(false);
    const t = it1("TONELADA"); expect(roda([t], { regras: regra("TONELADA", { manter: true }) })(t).achado).toBe(false);
    const se = it1("SE", "SERVICO"); expect(roda([se], { regras: regra("SE", { manter: true }) })(se).achado).toBe(false);
  });
  it("classificar unidade desconhecida: embalagem de uma medida, com ou sem conteúdo fixo", () => {
    const x = it1("ROLO", "CABO FLEXIVEL ROLO 100 M");
    const regras = regra("ROLO", { grandeza: "comprimento", fator: null });
    expect(roda([x], { regras })(x)).toMatchObject({ achado: true, sugerida: "METRO", extra: { fator: 100, evidencia: "descricao", nivel: "embalagem" } });
    const y = it1("ROLO", "TELA 2M X 50M"); expect(roda([y], { regras })(y).extra.fator).toBeNull();
    const fixa = regra("ROLO", { grandeza: "comprimento", fator: 50 });
    expect(roda([y], { regras: fixa })(y)).toMatchObject({ sugerida: "METRO", extra: { fator: 50, evidencia: "regra" }, motivo: "Maior que a unidade padrão de comprimento (METRO): 1 ROLO = 50 METRO (regra do projeto)" });
  });
  it("fator 1 = é a própria unidade padrão; menor que 1 = ainda menor (aceita)", () => {
    const x = it1("ROLO"); expect(roda([x], { regras: regra("ROLO", { grandeza: "contagem", fator: 1 }) })(x).achado).toBe(false);
    const d = it1("DOSE"); expect(roda([d], { regras: regra("DOSE", { grandeza: "volume", fator: 0.01 }) })(d).achado).toBe(false);
  });
  it("a regra do projeto vence a tabela (ex.: PT é pacote de 12 neste cliente)", () => {
    const x = it1("PT", "BOLACHA");
    expect(roda([x])(x).motivo).toContain("sem regra");
    expect(roda([x], { regras: regra("PT", { grandeza: "contagem", fator: 12 }) })(x)).toMatchObject({ sugerida: "UNIDADE", extra: { fator: 12, evidencia: "regra" } });
  });
  it("regra incompleta ou medida inválida é ignorada (volta para a tabela)", () => {
    expect(classificarUnidade("TONELADA", regra("TONELADA", { grandeza: "inexistente", fator: 3 }))).toMatchObject({ origem: "tabela", fator: 1000 });
    expect(classificarUnidade("ROLO", regra("ROLO", { grandeza: "comprimento", fator: -2 }))).toBeNull();
  });
});

describe("base real da Crestani (unidade de estoque, 26 grafias)", () => {
  // Distribuição observada na exportação do SAP B1, reduzida; descrições reais.
  const montar = () => {
    const l = []; let n = 100;
    const add = (u, d, q = 1) => { for (let i = 0; i < q; i += 1) { n += 1; l.push({ linha: n, unidade: u, descricao: d, problemas: [] }); } };
    add("UNIDADE", "ROLAMENTO NSK 6203DU", 270); add("QUILOGRAM", "ADUBO", 90); add("LITRO", "OLEO", 66); add("METRO", "CABO", 50); add("", "239", 2);
    add("JOGO", "JOGO DE ANEL 120MM", 3); add("CAIXA", "DOCE BRIGADEIRO 950G", 3); add("PACOTE", "ROSQUINHA MABEL SABOR COCO 700G", 3); add("BB", "SEMENTE DE SOJA 22025HB4 (TMG 430 HB4)", 2); add("BIG BAG", "SEMENTE DE SOJA TMG 2776 IPRO");
    add("METRO QUA", "PISO", 3); add("METRO CUB", "LENHA EUCALIPTO", 2); add("UN", "GRAXA SACHE 25G", 2); add("DOSE", "AZOMAX", 2); add("CONJUNTO", "KIT EMBREAGEM"); add("PAR", "LUVA PARA GUIDAO");
    add("BALDE 20KG", "GRAXA MPFBI A405.K03", 2); add("GRAMA", "GENGIBRE"); add("KG", "SEMENTE DE ALGODAO"); add("M2", "GRAMA ESMERALDA TAPETE"); add("PC", "SEPARADORES DE SERRAS");
    add("GALAO", "DILUENTE P/ EPOXI 5 LT"); add("FARDO", "TOALHA DE PAPEL"); add("ESTERO", "LENHA RESIDUO MADEIRA"); add("BALDE", "MEIO DE CULTURA AUXAER"); add("SE", "SERVICO DE IMAGENS VIA SATELITE");
    return l;
  };
  const itens = montar();
  const teste = achadosUnidade(itens);
  const por = (u) => itens.filter((i) => i.unidade === u).map((i) => teste(i));

  it("o que já segue o conceito não gera achado", () => {
    for (const u of ["UNIDADE", "QUILOGRAM", "LITRO", "METRO", "JOGO", "CONJUNTO", "PAR", "DOSE", "GRAMA", "METRO QUA"]) expect(por(u).every((r) => !r.achado), u).toBe(true);
  });
  it("embalagens e unidade maior viram sugestão de estoque na menor unidade, com o fator quando é certo", () => {
    expect(por("CAIXA")[0]).toMatchObject({ achado: true, sugerida: "UNIDADE", extra: { fator: null } });
    expect(por("PACOTE")[0]).toMatchObject({ sugerida: "UNIDADE", extra: { fator: null } });
    expect(por("BB")[0]).toMatchObject({ sugerida: "QUILOGRAM", extra: { fator: null } });
    expect(por("BIG BAG")[0]).toMatchObject({ sugerida: "QUILOGRAM", extra: { fator: null } });
    expect(por("BALDE 20KG")[0]).toMatchObject({ sugerida: "QUILOGRAM", extra: { fator: 20, evidencia: "unidade" } });
    expect(por("METRO CUB")[0]).toMatchObject({ sugerida: "LITRO", extra: { fator: 1000, evidencia: "universal" } });
    expect(por("GALAO")[0]).toMatchObject({ sugerida: "LITRO", extra: { fator: 5, evidencia: "descricao" } });
    expect(por("FARDO")[0]).toMatchObject({ sugerida: "UNIDADE", extra: { fator: null } });
  });
  it("grafias diferentes da dominante, vazio e unidades sem regra ficam como pendência", () => {
    expect(por("UN")[0]).toMatchObject({ achado: true, sugerida: "UNIDADE" }); expect(por("PC")[0].sugerida).toBe("UNIDADE");
    expect(por("KG")[0].sugerida).toBe("QUILOGRAM"); expect(por("M2")[0].sugerida).toBe("METRO QUA");
    expect(por("")[0].motivo).toBe("Sem unidade de medida");
    for (const u of ["ESTERO", "BALDE", "SE"]) expect(por(u)[0].motivo, u).toContain("sem regra na política");
  });
  it("totais: só o que foge do conceito entra na análise", () => {
    const achados = itens.filter((i) => teste(i).achado);
    const porUnidade = achados.reduce((a, i) => ({ ...a, [i.unidade || "(vazio)"]: (a[i.unidade || "(vazio)"] || 0) + 1 }), {});
    expect(porUnidade).toEqual({ CAIXA: 3, PACOTE: 3, BB: 2, "BIG BAG": 1, "METRO CUB": 2, UN: 2, "BALDE 20KG": 2, KG: 1, M2: 1, PC: 1, GALAO: 1, FARDO: 1, ESTERO: 1, BALDE: 1, SE: 1, "(vazio)": 2 });
  });
  it("a tabela de unidades resume a base, com contagem e classificação", () => {
    const r = resumoUnidades(itens);
    expect(r.semUnidade).toBe(2); expect(r.padroes).toMatchObject({ massa: "QUILOGRAM", volume: "LITRO", comprimento: "METRO", area: "METRO QUA", contagem: "UNIDADE" });
    expect(r.linhas[0]).toMatchObject({ rotulo: "UNIDADE", n: 270 });
    const l = (u) => r.linhas.find((x) => x.rotulo === u);
    expect(l("METRO CUB").texto).toBe("Maior que a padrão de volume: 1 METRO CUB = 1.000 LITRO");
    expect(l("BB").texto).toBe("Embalagem de massa: conteúdo a informar em cada item");
    expect(l("BALDE 20KG").texto).toBe("Embalagem de massa: 1 BALDE 20KG = 20 QUILOGRAM");
    expect(l("GRAMA").texto).toBe("Menor que a padrão de massa, aceita (1 GRAMA = 0,001 QUILOGRAM)");
    expect(l("JOGO").texto).toBe("Conjunto: o item é o conjunto (aceito)");
    expect(l("ESTERO").texto).toBe("Sem regra na política: classifique");
    expect(l("UNIDADE").texto).toBe("Unidade de estoque padrão de contagem");
  });
  it("classificar as unidades sem regra na tabela zera esses achados", () => {
    const regras = { [chaveUnidade("ESTERO")]: { grandeza: "volume", fator: 1000 }, [chaveUnidade("BALDE")]: { grandeza: "massa", fator: null }, [chaveUnidade("SE")]: { manter: true } };
    const t = achadosUnidade(itens, { regras }); const x = (u) => t(itens.find((i) => i.unidade === u));
    expect(x("SE").achado).toBe(false);
    expect(x("ESTERO")).toMatchObject({ sugerida: "LITRO", extra: { fator: 1000, evidencia: "regra" } });
    expect(x("BALDE")).toMatchObject({ sugerida: "QUILOGRAM", extra: { fator: null } });
    expect(resumoUnidades(itens, { regras }).linhas.find((l) => l.rotulo === "ESTERO")).toMatchObject({ regra: { grandeza: "volume", fator: 1000 } });
  });
});

describe("nome da unidade padrão e decisões", () => {
  it("usa o nome que a base já usa, ou o da política quando não há", () => {
    expect(rotulosPadrao(apoio)).toEqual({ massa: "QUILOGRAM", volume: "LITRO", comprimento: "METRO", area: "M2", contagem: "UNIDADE" });
    expect(rotulosPadrao([])).toEqual({ massa: "KG", volume: "LITRO", comprimento: "METRO", area: "M2", contagem: "UNIDADE" });
  });
  it("conversão sem fator não pode ser aprovada; o fator do analista vale mais que o sugerido", () => {
    expect(precisaFator({ tipo: "conversao", para: "KG", fator: null })).toBe(true);
    expect(precisaFator({ tipo: "conversao", para: "KG", fator: 20 })).toBe(false);
    expect(precisaFator({ tipo: "conversao", para: "KG", fator: null, fatorFinal: 25 })).toBe(false);
    expect(precisaFator({ tipo: "conversao", para: "KG", fator: 20, fatorFinal: "" })).toBe(true);
    expect(precisaFator({ tipo: "grafia", para: "UNIDADE" })).toBe(false); expect(precisaFator({ tipo: "conversao" })).toBe(false); expect(precisaFator(undefined)).toBe(false);
    expect(fatorDaDecisao({ fator: 20, fatorFinal: 25 })).toBe(25); expect(fatorDaDecisao({ fator: 20 })).toBe(20); expect(fatorDaDecisao({ fator: 0 })).toBeNull(); expect(fatorDaDecisao({})).toBeNull();
  });
});
