import { describe, expect, it, vi } from "vitest";
import {
  alteracoesParaSalvar, aplicarComPrevia, ASPECTOS, chaveTransferencias, conteudoPadrao, conteudoParaTela, diferencasRegra, ehSobreposicao, enderecoDaPolitica, inicialDoCaso, lerExemplos,
  lerFator, lerHistorico, lerLimite, mensagemDiretriz, mover, moverPara, nomeDaPolitica, normalizarConteudo, previaEstrutura, regrasPorAspecto, resumoLimites, resumoPrevia,
  subgruposDisponiveis, textoAbrangencia, transferencias, validarRegra,
} from "./logica";

const erro409 = (codigo) => Object.assign(new Error("Request failed with status code 409"), { status: 409, response: { data: codigo ? { codigo } : {} } });
const TODOS = { todos: true };

describe("conteúdo padrão e validação por aspecto", () => {
  it("cada um dos 5 aspectos tem conteúdo padrão válido", () => {
    for (const a of ASPECTOS) expect(validarRegra({ nome: "Regra", abrangencia: TODOS, conteudo: conteudoPadrao(a) }), a).toEqual([]);
  });
  it("comum: nome e grupos obrigatórios", () => {
    const e = validarRegra({ nome: " ", abrangencia: { todos: false, grupos: [] }, conteudo: conteudoPadrao("FISCAL") });
    expect(e).toContain("Dê um nome à regra.");
    expect(e).toContain("Escolha os grupos da regra ou marque Todos os grupos.");
  });
  it("A. Nomes: componentes, obrigatório fora da estrutura, abreviação incompleta e termo vazio", () => {
    const c = { ...conteudoPadrao("NOMES"), componentes: [], obrigatorios: ["MARCA"], abreviacoes: [{ completa: "Caixa", abreviacao: "" }], termosProibidos: [{ termo: "", substituicao: "" }] };
    const e = validarRegra({ nome: "N", abrangencia: TODOS, conteudo: c });
    expect(e).toEqual(expect.arrayContaining([
      "Escolha ao menos um componente da descrição.", "Componente obrigatório precisa estar na estrutura.",
      expect.stringContaining("abreviação"), expect.stringContaining("termos proibidos"),
    ]));
  });
  it("B. Atributos: campo próprio e condição quando aplicável", () => {
    const c = { aspecto: "ATRIBUTOS", atributos: [{ atributo: "MARCA", onde: "CAMPO_PROPRIO", campo: "", aplicabilidade: "QUANDO_APLICAVEL", condicao: "" }] };
    const e = validarRegra({ nome: "A", abrangencia: TODOS, conteudo: c });
    expect(e).toEqual(["Atributo 1 (Marca): informe o campo próprio.", "Atributo 1 (Marca): descreva quando se aplica."]);
    const n = normalizarConteudo({ aspecto: "ATRIBUTOS", atributos: [{ atributo: " PRINCIPIO_ATIVO ", onde: "DESCRICAO", campo: "x", aplicabilidade: "OBRIGATORIO", condicao: "y" }] });
    expect(n.atributos[0]).toEqual({ atributo: "PRINCIPIO_ATIVO", onde: "DESCRICAO", campo: null, aplicabilidade: "OBRIGATORIO", condicao: null });
  });
  it("C. Unidades: fator lido no padrão brasileiro; inválido, zero e mesma unidade são barrados", () => {
    expect(lerFator("1.000")).toBe(1000);
    expect(lerFator("0,5")).toBe(0.5);
    expect(lerFator("12")).toBe(12);
    expect(lerFator("0")).toBeNull();
    expect(lerFator("abc")).toBeNull();
    const c = { ...conteudoPadrao("UNIDADES"), criterioEstoque: "DEFINIDA", unidadeDefinida: "", conversoes: [{ origem: "cx", destino: "CX", fator: "abc", abrangencia: "PRODUTO", codigoProduto: "" }] };
    const e = validarRegra({ nome: "U", abrangencia: TODOS, conteudo: c });
    expect(e).toEqual(["Escolha a unidade definida para o grupo.", "Conversão 1: origem e destino são a mesma unidade.", "Conversão 1: digite um fator maior que zero (ex.: 1.000 ou 0,5).", "Conversão 1: informe o código do produto."]);
    const n = normalizarConteudo({ ...conteudoPadrao("UNIDADES"), conversoes: [{ origem: "cx", destino: "un", fator: "1.000", abrangencia: "GRUPO", codigoProduto: "x" }] });
    expect(n.conversoes[0]).toEqual({ origem: "CX", destino: "UN", fator: 1000, abrangencia: "GRUPO", codigoProduto: null });
    expect(n.conversaoDesconhecida).toBe("PENDENCIA");
  });
  it("C. Unidades: o fator volta para a tela com vírgula", () => {
    expect(conteudoParaTela("UNIDADES", { conversoes: [{ origem: "CX", destino: "UN", fator: 0.5, abrangencia: "GRUPO" }] }).conversoes[0].fator).toBe("0,5");
  });
  it("D. Limites: vazio = não confirmado; texto que não é inteiro é barrado", () => {
    expect(lerLimite("")).toEqual({ valor: null, invalido: false });
    expect(lerLimite("120")).toEqual({ valor: 120, invalido: false });
    expect(lerLimite("12a").invalido).toBe(true);
    expect(lerLimite("1,5").invalido).toBe(true);
    const c = { aspecto: "LIMITES", linhas: [{ destino: "", campo: "", campoItem: "descricao", limite: "x", origem: "ERP", confirmado: true, tratamento: "SOLICITAR_REVISAO", preservar: [] }] };
    expect(validarRegra({ nome: "L", abrangencia: TODOS, conteudo: c })).toHaveLength(3);
    const n = normalizarConteudo({ aspecto: "LIMITES", linhas: [{ destino: "NF-e", campo: "xProd", campoItem: "descricao", limite: "", origem: "LEIAUTE_OFICIAL", referencia: "", url: "", confirmado: true, tratamento: "SUGERIR_ABREVIACAO", preservar: ["NOME"] }] });
    expect(n.linhas[0]).toMatchObject({ limite: null, confirmado: false, referencia: null, url: null });
  });
  it("E. Fiscal: exceção sem justificativa e cClassTrib sem cenário; regras fixas garantidas", () => {
    const c = { ...conteudoPadrao("FISCAL"), excecoesNcm: [{ alvo: "Serviços", justificativa: "" }], cenarios: [] };
    expect(validarRegra({ nome: "F", abrangencia: TODOS, conteudo: c })).toEqual(["Cada exceção de NCM precisa do item ou grupo e da justificativa.", "Escolha ao menos um cenário para validar o cClassTrib."]);
    const n = normalizarConteudo({ ...conteudoPadrao("FISCAL"), ausente: "X", ambiguo: "Y" });
    expect(n.ausente).toBe("PENDENCIA");
    expect(n.ambiguo).toBe("REVISAO_FISCAL");
  });
});

describe("ordem dos componentes", () => {
  it("setas e arrastar mudam a ordem sem perder item", () => {
    expect(mover(["A", "B", "C"], 1, -1)).toEqual(["B", "A", "C"]);
    expect(mover(["A", "B", "C"], 0, -1)).toEqual(["A", "B", "C"]);
    expect(moverPara(["A", "B", "C", "D"], 0, 2)).toEqual(["B", "C", "A", "D"]);
    expect(moverPara(["A", "B"], 1, 1)).toEqual(["A", "B"]);
  });
});

describe("prévia da estrutura de nomes", () => {
  it("monta a estrutura e o exemplo com separador, abreviação, termo proibido e maiúsculas", () => {
    const p = previaEstrutura({ ...conteudoPadrao("NOMES"), componentes: ["NOME", "APRESENTACAO"], obrigatorios: ["NOME"], separador: " - ", capitalizacao: "MAIUSCULAS", abreviacoes: [{ completa: "Caixa", abreviacao: "Cx" }], termosProibidos: [{ termo: "com", substituicao: "C/" }] });
    expect(p.estrutura).toBe("Nome (obrigatório) + Apresentação");
    expect(p.exemplo).toBe("PARAFUSO SEXTAVADO - CX C/ 100");
  });
});

describe("abrangência e transferência", () => {
  const regras = [
    { id: "r1", aspecto: "NOMES", codigo: "N01", nome: "Geral", abrangencia: TODOS },
    { id: "r2", aspecto: "NOMES", codigo: "N02", nome: "Ferragens", abrangencia: { todos: false, grupos: ["Ferragens", "Parafusos"] } },
    { id: "r3", aspecto: "UNIDADES", codigo: "U01", nome: "Peças", abrangencia: { todos: false, grupos: ["Ferragens"] } },
  ];
  it("grupo já coberto por outra regra do MESMO aspecto pede transferência", () => {
    const t = transferencias({ abrangencia: { todos: false, grupos: ["Ferragens", "Tintas"] }, aspecto: "NOMES", regraId: null, regras });
    expect(t).toEqual([{ grupo: "Ferragens", regraId: "r2", codigo: "N02", nome: "Ferragens", padrao: false }]);
  });
  it("regra de outro aspecto e a regra Todos os grupos não contam como transferência", () => {
    expect(transferencias({ abrangencia: { todos: false, grupos: ["Tintas"] }, aspecto: "NOMES", regraId: null, regras })).toEqual([]);
    expect(transferencias({ abrangencia: { todos: false, grupos: ["Ferragens"] }, aspecto: "NOMES", regraId: "r2", regras })).toEqual([]);
  });
  it("marcar Todos os grupos quando outra regra já é o padrão do aspecto", () => {
    const t = transferencias({ abrangencia: TODOS, aspecto: "NOMES", regraId: "r2", regras });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ regraId: "r1", padrao: true });
    expect(chaveTransferencias(t)).toBe("Todos os grupos (padrão)>r1");
  });
  it("texto da abrangência e subgrupos disponíveis", () => {
    expect(textoAbrangencia(TODOS)).toBe("Todos os grupos");
    expect(textoAbrangencia({ todos: false, grupos: ["A", "B"], subgrupos: ["A1"] })).toBe("A, B (subgrupos: A1)");
    expect(subgruposDisponiveis([{ grupo: "A", subgrupos: ["A2", "A1"] }, { grupo: "B", subgrupos: ["B1"] }], ["A"])).toEqual(["A1", "A2"]);
  });
  it("regras por aspecto na ordem do código", () => {
    const r = regrasPorAspecto([{ id: "x", aspecto: "NOMES", codigo: "N10" }, { id: "y", aspecto: "NOMES", codigo: "N02" }]);
    expect(r.NOMES.map((x) => x.codigo)).toEqual(["N02", "N10"]);
    expect(r.FISCAL).toEqual([]);
  });
});

describe("limites: menor confirmado e alerta do ERP", () => {
  const l = (o) => ({ destino: "X", campo: "c", campoItem: "descricao", limite: 100, origem: "CLIENTE", confirmado: true, ...o });
  it("vale o menor confirmado; não confirmado fica pendente", () => {
    const [r] = resumoLimites([l({ destino: "NF-e", limite: 120, origem: "LEIAUTE_OFICIAL" }), l({ destino: "SAP", limite: 100, origem: "ERP" }), l({ destino: "Cliente", limite: 60, confirmado: false })]);
    expect(r).toMatchObject({ campoItem: "descricao", efetivo: 100, origemEfetivo: "ERP", pendentes: 1, alertas: [] });
  });
  it("ERP confirmado acima do leiaute oficial gera alerta", () => {
    const [r] = resumoLimites([l({ destino: "SPED", limite: 100, origem: "LEIAUTE_OFICIAL" }), l({ destino: "SAP Business One", limite: 200, origem: "ERP" })]);
    expect(r.efetivo).toBe(100);
    expect(r.alertas[0]).toContain("SAP Business One aceita 200 caracteres");
    expect(r.alertas[0]).toContain("leiaute oficial (100)");
  });
  it("só linhas sem número: efetivo não confirmado", () => {
    expect(resumoLimites([l({ limite: "" })])[0]).toMatchObject({ efetivo: null, pendentes: 1 });
  });
});

describe("alterações do projeto (só as exceções da biblioteca)", () => {
  it("com biblioteca, guarda só o que mudou (mais o que já estava alterado)", () => {
    const base = { aspecto: "NOMES", separador: " ", capitalizacao: "MAIUSCULAS", abreviacoes: [] };
    const editado = { ...base, separador: " - " };
    expect(alteracoesParaSalvar({ bibliotecaId: "b1", base, editado, anteriores: { capitalizacao: "MAIUSCULAS" } })).toEqual({ capitalizacao: "MAIUSCULAS", separador: " - ", aspecto: "NOMES" });
    expect(alteracoesParaSalvar({ bibliotecaId: "b1", base, editado: base, anteriores: null })).toBeNull();
  });
  it("sem biblioteca, o conteúdo inteiro é a regra", () => {
    const c = conteudoPadrao("FISCAL");
    expect(alteracoesParaSalvar({ bibliotecaId: null, base: null, editado: c })).toEqual(c);
  });
});

describe("Aplicar e reanalisar: prévia sempre antes", () => {
  const PREVIA = { regraId: "r1", grupos: ["Ferragens"], itens: 12, sobreposicoes: [], camadas: ["NOMES_UNIDADES"] };
  it("busca a prévia, espera a confirmação e só então aplica", async () => {
    const ordem = [];
    const r = await aplicarComPrevia({
      buscarPrevia: async () => { ordem.push("previa"); return PREVIA; },
      confirmar: async (p) => { ordem.push(`confirmar:${p.itens}`); return { ok: true }; },
      aplicar: async (extra) => { ordem.push(`aplicar:${JSON.stringify(extra)}`); return { versao: 5 }; },
    });
    expect(ordem).toEqual(["previa", "confirmar:12", "aplicar:{}"]);
    expect(r).toMatchObject({ aplicado: true, resultado: { versao: 5 } });
  });
  it("cancelar a prévia não aplica nada", async () => {
    const aplicar = vi.fn();
    const r = await aplicarComPrevia({ buscarPrevia: async () => PREVIA, confirmar: async () => false, aplicar });
    expect(aplicar).not.toHaveBeenCalled();
    expect(r.aplicado).toBe(false);
  });
  it("com sobreposição: sem marcar a transferência não aplica; marcando, envia confirmarTransferencia", async () => {
    const comSobreposicao = { ...PREVIA, sobreposicoes: [{ grupo: "Ferragens", regraAtual: "N01" }] };
    const aplicar = vi.fn(async () => ({}));
    const sem = await aplicarComPrevia({ buscarPrevia: async () => comSobreposicao, confirmar: async () => ({ ok: true, confirmarTransferencia: false }), aplicar });
    expect(sem.aplicado).toBe(false);
    expect(sem.motivo).toContain("transferência");
    expect(aplicar).not.toHaveBeenCalled();
    await aplicarComPrevia({ buscarPrevia: async () => comSobreposicao, confirmar: async () => ({ ok: true, confirmarTransferencia: true }), aplicar });
    expect(aplicar).toHaveBeenCalledWith({ confirmarTransferencia: true });
  });
  it("resumo da prévia com rótulos das análises", () => {
    expect(resumoPrevia({ grupos: ["A", "B"], itens: 1234, camadas: ["NCM", "TRIBUTARIO"], sobreposicoes: [] })).toMatchObject({ texto: "1.234 itens de 2 grupos serão analisados de novo.", camadas: ["NCM", "Tratamento tributário"] });
    expect(resumoPrevia({ grupos: ["A"], itens: 1, camadas: [] }).texto).toBe("1 item de 1 grupo será analisado de novo.");
  });
});

describe("conflitos (409)", () => {
  it("conflito de versão: mensagem pede conferir e salvar de novo", () => {
    expect(mensagemDiretriz(erro409("CONFLITO_VERSAO"))).toContain("Recarregamos a regra");
    expect(mensagemDiretriz(erro409())).toContain("Recarregamos a regra");
  });
  it("sobreposição ao aplicar é outra situação", () => {
    expect(ehSobreposicao(erro409("SOBREPOSICAO"))).toBe(true);
    expect(ehSobreposicao(erro409("CONFLITO_VERSAO"))).toBe(false);
    expect(mensagemDiretriz(erro409("SOBREPOSICAO"))).toContain("confirme a transferência");
  });
});

describe("transformar em regra, histórico, exemplos e política", () => {
  it("pré-preenche pelo caso: camada → aspecto, problema → nome, grupos do caso", () => {
    expect(inicialDoCaso({ camada: "NCM", problema: "NCM inválido" }, { grupos: [{ grupo: "Defensivos", itens: 3 }] })).toEqual({ aspecto: "FISCAL", nome: "NCM inválido", todos: false, grupos: ["Defensivos"], destino: "PROJETO" });
    expect(inicialDoCaso({ camada: "NOMES_UNIDADES", problema: "Unidade", proposta: { unidade: "KG", fatorConversao: 1000 } }, null)).toMatchObject({ aspecto: "UNIDADES", todos: true, grupos: [] });
    expect(inicialDoCaso({ camada: "QUALIDADE", problema: "x" }, null).aspecto).toBe("ATRIBUTOS");
  });
  it("histórico em texto (quem, quando, antes → depois)", () => {
    const [h] = lerHistorico([{ id: "h1", createdAt: "2026-11-20T10:00:00Z", usuario: "ana", acao: "ALTEROU", antes: { nome: "A", situacao: "APROVADA" }, depois: { nome: "B", situacao: "RASCUNHO" } }]);
    expect(h).toMatchObject({ quem: "ana", acao: "Alterou", mudou: "Nome: A → B; Situação: Aprovada → Rascunho" });
    expect(diferencasRegra(null, { nome: "x" })).toBe("Criada");
    expect(lerHistorico({ linhas: [{ acao: "APROVOU" }] })[0].acao).toBe("Aprovou");
  });
  it("exemplos aceitam lista ou { itens }", () => {
    expect(lerExemplos({ itens: [{ id: "i1", codigo: "1", grupo: "G", descricaoAtual: "a", descricaoProposta: "A" }] })[0]).toMatchObject({ atual: "a", proposta: "A" });
    expect(lerExemplos([{ codigo: "2", descricao: "b", comoFicaria: "B" }])[0]).toMatchObject({ atual: "b", proposta: "B" });
    expect(lerExemplos(null)).toEqual([]);
  });
  it("endereço e nome do PDF da política, com e sem versão", () => {
    expect(enderecoDaPolitica("p1")).toBe("/saneamento-estoques/projetos/p1/politica/pdf");
    expect(enderecoDaPolitica("p1", "v 1")).toBe("/saneamento-estoques/projetos/p1/politica/pdf?versaoId=v%201");
    expect(nomeDaPolitica({ numero: 2 })).toBe("politica-de-cadastro-e-estoques-versao-2.pdf");
    expect(nomeDaPolitica(null)).toBe("politica-de-cadastro-e-estoques.pdf");
  });
});
