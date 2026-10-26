import { describe, expect, it } from "vitest";
import { aplicarEscopo, agruparPorGrupo, criarTestes } from "./logica";
import { calcularAchados, contarAchados } from "./analise";
import { COLUNAS_REGRAS, SECOES, contarDecisoes, linhasRegras, montarPolitica } from "./politica";

const item = (linha, extra = {}) => ({ linha, codigo: `C${linha}`, descricao: "PARAFUSO", unidade: "UN", grupo_atual: "Peças", ultima_mov: "2026-03-01", ncm: "73181500", ncm_original: "73181500", problemas: [], ...extra });
const itens = [item(2, { descricao: "ANEL  TRAVA" }), item(3, { unidade: "QUILOGRAM", descricao: "ADUBO" }), item(4, { grupo_atual: "Insumos", descricao: "ADUBO NPK", unidade: "KG" }), item(5, { ultima_mov: "2020-01-01" })];
const base = (estadoExtra = {}) => {
  const estado = { params: { desde: "2025-01-01", semData: "manter" }, criterios: {}, decisoes: {}, saneados: {}, piloto: {}, padronizacao: { regras: {}, abreviacoes: { sext: { para: "SEXTAVADO", aprovada: true } } }, ...estadoExtra };
  const escopo = aplicarEscopo(itens, estado.params, estado.gruposFora);
  const achados = calcularAchados(escopo.emEscopo, criarTestes(escopo.emEscopo, estado)); const contagem = contarAchados(achados, escopo.emEscopo.length);
  return { estado, escopo, contagem, grupos: agruparPorGrupo(escopo.emEscopo), nomeProjeto: "Projeto X", nomeBase: "itens.xlsx" };
};
const aprov = (por = "ana") => ({ aprovado: true, por, em: "2026-10-20" });
// Grupo saneado de verdade: os três critérios de conferência manual e os que têm achado nele aprovados e tratados no grupo (os demais abrem aprovados, sem achados).
const saneavel = (grupo, comAchado = []) => { const ids = ["identidade", "saldos", "cartilhas", ...comAchado]; return { criterios: Object.fromEntries(ids.map((id) => [id, aprov()])), tratados: Object.fromEntries(ids.map((id) => [`${grupo}|${id}`, ["identidade", "saldos", "cartilhas"].includes(id) ? { por: "ana", em: "2026-10-23", resultado: "SEM_ACHADOS", nota: "conferido no ERP" } : { por: "ana", em: "2026-10-23" }])) }; };
const regra = (p, id) => p.secoes.flatMap((s) => s.regras).find((r) => r.id === id);

describe("política de uso dos estoques", () => {
  it("critério pendente não gera regra e aparece como pendência; critério sem achados (aprovado sozinho) gera a regra preventiva", () => {
    const p = montarPolitica(base({ criterios: { padrao: aprov() } }));
    expect(regra(p, "criar.descricao")).toBeTruthy(); expect(regra(p, "criar.unidade")).toBeFalsy(); // unidade tem achados e não foi aprovada
    expect(p.pendencias).toContain('O critério "Unidade de medida" ainda não foi aprovado: a regra correspondente não entra na política.');
    expect(regra(p, "criar.ncm").origem).toBe('Critério "NCM e classificação cadastral", aprovado automaticamente (sem achados na base)'); // sem achados: abre aprovado
    expect(regra(p, "criar.ncm").evidencia).toBe("nenhum achado na base analisada.");
  });
  it("a regra de descrição traz o padrão aprovado, as abreviações e a evidência do que foi encontrado e aprovado", () => {
    const p = montarPolitica(base({ criterios: { padrao: aprov() }, decisoes: { "C2|padrao": { acao: "ENC", status: "APR", sugerida: "ANEL TRAVA" }, "ZZ9|padrao": { acao: "ENC", status: "PROP" } } }));
    const r = regra(p, "criar.descricao");
    expect(r.texto).toContain("NOME + REFERÊNCIA + COMPLEMENTO"); expect(r.texto).toContain("caixa alta"); expect(r.texto).toContain("só abreviações da lista aprovada (1 abreviação)"); expect(r.texto).not.toContain("(ex.:");
    expect(r.origem).toBe('Critério "Padronização da descrição", aprovado por ana em 20/10/2026');
    expect(r.evidencia).toBe("1 item em escopo com achado na base analisada; 1 correção aprovada de 2 encaminhadas.");
  });
  it("a exceção por grupo da observação entra na regra de duplicidade e na política estruturada (cor, tipo e apresentação não geram código próprio)", () => {
    const sem = montarPolitica(base({ criterios: { duplicidade: aprov() } }));
    expect(regra(sem, "criar.duplicidade").texto).not.toContain("Exceção por grupo"); expect(sem.estruturada.duplicidade.varianteEhObservacao.grupos).toEqual([]);
    const com = montarPolitica(base({ criterios: { duplicidade: aprov() }, observacao: { grupos: { Insumos: true }, palavras: { pasta: true } } }));
    const texto = regra(com, "criar.duplicidade").texto;
    expect(texto).toContain("Exceção por grupo: nos grupos Insumos a variante (cor, tipo, apresentação: "); expect(texto).toContain("PASTA"); expect(texto).toContain("não gera código próprio e é registrada no campo adicional do item");
    expect(com.estruturada.duplicidade.varianteEhObservacao).toMatchObject({ grupos: ["Insumos"] }); expect(com.estruturada.duplicidade.varianteEhObservacao.palavras).toEqual(expect.arrayContaining(["PASTA", "AZUL", "NEUTRO"]));
    expect(montarPolitica(base({ criterios: { duplicidade: aprov() }, observacao: { grupos: { Insumos: false }, palavras: {} } })).estruturada.duplicidade.varianteEhObservacao.grupos).toEqual([]);
  });
  it("a regra de descontinuação diz que o corte só seleciona candidatos e que a inativação exige aprovação em lista fechada ou individual", () => {
    const p = montarPolitica(base({}));
    expect(regra(p, "descontinuar.aprovacao").texto).toContain("não autoriza a inativação"); expect(regra(p, "descontinuar.aprovacao").texto).toContain("lista fechada de códigos"); expect(regra(p, "descontinuar.aprovacao").texto).toContain("não cobre itens que entrem depois na lista");
    expect(p.estruturada.descontinuacao).toMatchObject({ candidatosInativacao: 1, inativacaoAprovada: 0 }); expect(p.estruturada.descontinuacao.aprovacao).toContain("so seleciona candidatos");
  });
  it("a unidade usa os nomes padrão do projeto, e a descontinuação o corte por data e o tratamento dos itens sem data", () => {
    const p = montarPolitica(base({ criterios: { unidade: aprov() }, politicaUnidade: { ativa: true, regras: {}, rotulos: { massa: "QUILOGRAM" } } }));
    expect(regra(p, "criar.unidade").texto).toContain("massa em QUILOGRAM"); expect(regra(p, "criar.unidade").texto).toContain("volume em L");
    expect(regra(p, "descontinuar.corte").texto).toContain("desde 01/01/2025"); expect(regra(p, "descontinuar.corte").texto).toContain("permanece no escopo, sinalizado");
    expect(regra(p, "descontinuar.corte").evidencia).toBe("1 item fora do escopo pelo parâmetro de saneamento (candidatos à inativação); 0 com a inativação aprovada.");
    expect(regra(p, "descontinuar.corte").origem).toBe("Parâmetro de saneamento do projeto");
    expect(regra(montarPolitica(base({ params: { desde: "2025-01-01", semData: "anterior" } })), "descontinuar.corte").texto).toContain("tratado como anterior à data");
    expect(regra(montarPolitica(base({ params: { desde: "" } })), "descontinuar.corte").texto).toContain("sem data de corte definida");
  });
  it("procedimentos: cinco seções, cada uma com regras, e a aprovação só com responsável e controle em todas", () => {
    const e0 = base({ criterios: { padrao: aprov(), duplicidade: aprov(), unidade: aprov() } });
    const p0 = montarPolitica(e0);
    expect(p0.secoes.map((s) => s.id)).toEqual(SECOES.map((s) => s.id)); expect(p0.secoes.every((s) => s.regras.length > 0)).toBe(true);
    expect(p0.prontaParaAprovar).toBe(false); expect(p0.situacao).toBe("Rascunho"); expect(p0.pendencias).toContain('Falta o responsável ou o controle de "Comprar".');
    const preenchido = Object.fromEntries(SECOES.map((s) => [s.id, { responsavel: "Gestor de cadastro", controle: "Revisão semestral" }]));
    const p1 = montarPolitica({ ...e0, estado: { ...e0.estado, politica: { secoes: preenchido } } });
    expect(p1.prontaParaAprovar).toBe(true); expect(p1.pendencias.some((x) => x.startsWith("Falta o responsável"))).toBe(false);
    const p2 = montarPolitica({ ...e0, estado: { ...e0.estado, politica: { secoes: preenchido, aprovada: { por: "ana", em: "2026-10-23" } } } });
    expect(p2.situacao).toBe("Aprovada"); expect(p2.estruturada).toMatchObject({ situacao: "Aprovada", aprovadaPor: "ana" });
  });
  it("por grupo: situação do grupo, pendências de critério e a regra escrita pelo analista", () => {
    const b = base({ ...saneavel("Peças", ["padrao", "unidade"]), saneados: { "Peças": true }, fiscal: { grupos: { "Peças": { por: "ana", em: "2026-10-23" } } }, politica: { grupos: { "Insumos": { regra: "Adubo só em KG" } } } });
    const p = montarPolitica(b);
    expect(p.porGrupo.find((g) => g.grupo === "Peças")).toMatchObject({ itens: 2, saneado: true, fiscal: "Revisão concluída" });
    expect(p.porGrupo.find((g) => g.grupo === "Insumos")).toMatchObject({ itens: 1, saneado: false, fiscal: "Não liberado", regra: "Adubo só em KG" });
    expect(montarPolitica(base({ ...saneavel("Peças", ["padrao", "unidade"]), saneados: { "Peças": true } })).pendencias).toContain('A revisão fiscal do grupo "Peças" não foi concluída.');
    // marcado como saneado sem cumprir os critérios (aqui, os de conferência manual sem aprovação): não vale como saneado nem libera a revisão fiscal
    const sem = montarPolitica(base({ criterios: { padrao: aprov(), unidade: aprov() }, saneados: { "Peças": true } }));
    expect(sem.porGrupo.find((g) => g.grupo === "Peças")).toMatchObject({ saneado: false, fiscal: "Não liberado" });
    expect(sem.pendencias.some((x) => x.startsWith("A revisão fiscal do grupo"))).toBe(false);
  });
  it("critério sem a análise executada ou não aplicável não gera regra: aparece como pendência ou com a justificativa", () => {
    const b = base({ criterios: { padrao: aprov(), identidade: { aprovado: false, naoAplicavel: { por: "ana", em: "2026-10-23", justificativa: "Fabricante único no cadastro deste cliente." } } } });
    const c = contarAchados(calcularAchados(b.escopo.emEscopo, criarTestes(b.escopo.emEscopo, b.estado)), b.escopo.emEscopo.length, { grupo: { completa: false, opcao: "grupos", falta: "a sugestão de grupos de produto" } });
    const p = montarPolitica({ ...b, contagem: c });
    expect(regra(p, "criar.grupo")).toBeFalsy(); // sem a análise, "sem achados" não prova nada
    expect(p.pendencias).toContain("O critério \"Grupo de itens\" não pode ser dado como verificado: a sugestão de grupos de produto não foi executada nesta base. A regra não entra na política até a análise ser feita ou o critério ser declarado não aplicável, com justificativa.");
    expect(regra(p, "criar.identidade")).toBeFalsy(); expect(p.pendencias.some((x) => x.includes("Identidade do produto"))).toBe(false);
    expect(p.estruturada.criteriosNaoAplicaveis).toEqual([{ id: "identidade", criterio: "Identidade do produto", justificativa: "Fabricante único no cadastro deste cliente.", por: "ana", em: "2026-10-23" }]);
  });
  it("a versão estruturada traz o padrão, as unidades, a duplicidade com complementos, o fiscal, a descontinuação, os grupos e os procedimentos", () => {
    const b = base({ criterios: { padrao: aprov(), unidade: aprov(), duplicidade: aprov() } });
    const { estruturada: s } = montarPolitica(b);
    expect(s.descricao).toMatchObject({ formato: "NOME + REFERENCIA + COMPLEMENTO", limiteCaracteres: 100, abreviacoesAprovadas: { sext: "SEXTAVADO" } }); expect(s.descricao.regrasDeFormato).toMatchObject({ caixaAlta: true, pontoColado: true });
    expect(s.unidade.nomesPadrao).toMatchObject({ massa: "KG", volume: "L", comprimento: "M", area: "M2" }); expect(s.unidade.tabela.map((t) => t.unidade)).toEqual(expect.arrayContaining(["UN", "QUILOGRAM", "KG"]));
    expect(s.duplicidade.complementosQueFazemOutroItem).toEqual(expect.arrayContaining(["cor", "tamanho", "material"])); expect(s.duplicidade.ordemParaEscolherQuemFica[0]).toBe("maior saldo em estoque");
    expect(s.descontinuacao).toMatchObject({ semMovimentoDesde: "2025-01-01", itensSemData: "manter", itensForaDoEscopo: 1 });
    expect(s.grupos.map((g) => g.nome)).toEqual(["Peças", "Insumos"]); expect(s.procedimentos.map((x) => x.id)).toEqual(SECOES.map((x) => x.id));
    expect(s.aviso).toContain("Nada foi alterado no cadastro");
    expect(() => JSON.stringify(s)).not.toThrow();
  });
  it("conta as decisões por critério e emite uma linha por regra para a planilha", () => {
    const decs = { "C2|padrao": { status: "APR" }, "C3|padrao": { status: "PROP" }, "C4|unidade": { status: "REJ" } };
    expect(contarDecisoes(decs)).toEqual({ padrao: { total: 2, PROP: 1, APR: 1, REJ: 0, SEM_VALIDADE: 0 }, unidade: { total: 1, PROP: 0, APR: 0, REJ: 1, SEM_VALIDADE: 0 } });
    // a decisão que perdeu a validade (cadastro mudou, código repetido) entra no total e não conta como aprovada, rejeitada nem aguardando
    expect(contarDecisoes(decs, (k) => k !== "C2|padrao")).toEqual({ padrao: { total: 2, PROP: 1, APR: 0, REJ: 0, SEM_VALIDADE: 1 }, unidade: { total: 1, PROP: 0, APR: 0, REJ: 1, SEM_VALIDADE: 0 } });
    const p = montarPolitica(base({ criterios: { padrao: aprov() }, politica: { secoes: { criar: { responsavel: "Gestor", controle: "Amostragem" } } } }));
    const linhas = linhasRegras(p);
    expect(linhas.length).toBe(p.secoes.reduce((n, s) => n + s.regras.length, 0)); expect(linhas[0]).toMatchObject({ procedimento: "Criar o cadastro", responsavel: "Gestor", controle: "Amostragem" });
    for (const [, chave] of COLUNAS_REGRAS) expect(linhas[0], chave).toHaveProperty(chave);
  });
});
