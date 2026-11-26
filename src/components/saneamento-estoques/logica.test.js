import { describe, expect, it } from "vitest";
import {
  ABAS, abaBloqueada, abaInicial, abaPorTecla, acoesDoCaso, alternarIncorporar, aposConflito, camadasAtivas, camposObrigatoriosSemColuna, casoAberto, celulaDa, colunasDaTabela,
  colunasDoArquivo, converterValor, coberturaDeCamadas, corpoDoLote, corrigirMapeamento, ehConflitoVersao, ehReimportacao, ehTravaNaoConfirmada, enderecoDeEntrega,
  estadoDaTrava, formaDaSituacao, gruposDeColunas, itensIncorporaveis, janelaVisivel, larguraTotal, LARGURA_FIXA, lerParecer,
  linhasDeMapeamento, loteTemEscolha, mensagemDeErro, mensagemDoParecer, montarExcecao, montarFiltroCasos, montarFiltroItens, MENSAGEM_TRAVA, nomeDeEntrega, precisaCarregarMais,
  proximoCasoAberto, proximoPendente, resumirRelatorio, rolagemParaLinha, rotuloSituacao, situacaoAgregada, textoDaCelula, textoDoConjunto, versoesDaPrevia, edicaoSuja, edicaoInicial,
  paginasDeImpacto, corpoIncorporar, quantosIncorporar, lerNumeroBr, ALTURA_LINHA, LISTA_SITUACOES, fmtData, converterProposta, razaoSemAprovar, efeitoDaAtividade, interpretarRespostaParecer, textoDoEnquadramento, avisosDaLiberacao,
  versaoCriada, idsDoLote, rotuloDoCaso, rotuloSituacaoCaso, ehErroDeRede, ehPropostaDesatualizada, camposDivergentes, casoValeParaEnquadramento,
  justificativaBasta, podeRestaurar, restauracoesDaVersao, linhasDaPrevia, paramsDoMapa, enderecoDoMapa, fmtSaldo,
} from "./logica";

const erro = (status, data) => Object.assign(new Error(data?.message || "x"), { status, response: { data } });

describe("situações das células", () => {
  it("são 5, cada uma com rótulo e forma própria (não só cor)", () => {
    expect(LISTA_SITUACOES).toEqual(["PENDENTE", "SEM_PROBLEMA", "PROPOSTO", "APROVADO", "AGUARDANDO_INFORMACAO"]);
    expect(LISTA_SITUACOES.map(rotuloSituacao)).toEqual(["Pendente", "Sem problema", "Proposto", "Aprovado", "Aguardando informação"]);
    const formas = LISTA_SITUACOES.map(formaDaSituacao);
    expect(new Set(formas).size).toBe(5);
  });
  it('"revisar" é marca, não situação', () => {
    expect(textoDaCelula({ situacao: "PROPOSTO", revisar: true })).toBe("Proposto, revisar");
    expect(textoDaCelula({ situacao: "APROVADO", revisar: false })).toBe("Aprovado");
    expect(textoDaCelula(null)).toBe("Sem dados");
    expect(LISTA_SITUACOES).not.toContain("REVISAR");
  });
  it("a situação agregada mostra primeiro o que exige trabalho", () => {
    expect(situacaoAgregada({ PENDENTE: 1, APROVADO: 9 })).toBe("PENDENTE");
    expect(situacaoAgregada({ AGUARDANDO_INFORMACAO: 2, PROPOSTO: 1 })).toBe("AGUARDANDO_INFORMACAO");
    expect(situacaoAgregada({ PROPOSTO: 1, APROVADO: 5 })).toBe("PROPOSTO");
    expect(situacaoAgregada({ APROVADO: 5, SEM_PROBLEMA: 4 })).toBe("APROVADO");
    expect(situacaoAgregada({ SEM_PROBLEMA: 4 })).toBe("SEM_PROBLEMA");
    expect(situacaoAgregada({})).toBeNull();
  });
  it("acha a célula da camada e liga o módulo de estoque só quando existe", () => {
    expect(celulaDa({ celulas: [{ camada: "NCM", situacao: "PENDENTE" }] }, "NCM").situacao).toBe("PENDENTE");
    expect(celulaDa({ celulas: [] }, "NCM")).toBeNull();
    expect(camadasAtivas({ conciliacao: false })).not.toContain("ESTOQUE");
    expect(camadasAtivas({ conciliacao: true })).toContain("ESTOQUE");
    expect(camadasAtivas(undefined)).toHaveLength(8);
  });
});

describe("trava das atividades", () => {
  const ativ = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i), mantida: true }));
  it("sem confirmação bloqueia, com a mensagem do plano", () => {
    const t = estadoDaTrava({ atividadesConfirmadas: false, atividades: ativ(2) });
    expect(t.bloqueada).toBe(true);
    expect(t.mensagem).toBe("Confirme as atividades do cliente para continuar");
    expect(MENSAGEM_TRAVA).toBe(t.mensagem);
    expect(t.podeConfirmar).toBe(true);
    expect(t.editavel).toBe(true);
  });
  it("exige pelo menos uma atividade mantida para confirmar", () => {
    const t = estadoDaTrava({ atividadesConfirmadas: false, atividades: [{ id: "1", mantida: false }] });
    expect(t.podeConfirmar).toBe(false);
    expect(t.motivoSemConfirmar).toContain("pelo menos uma");
    expect(estadoDaTrava({ atividades: [] }).podeConfirmar).toBe(false);
  });
  it("confirmada libera e trava a edição; o CNPJ desatualizado só avisa", () => {
    const t = estadoDaTrava({ atividadesConfirmadas: true, atividades: ativ(1), cnpjDesatualizado: true });
    expect(t.bloqueada).toBe(false);
    expect(t.editavel).toBe(false);
    expect(t.revisarAtividades).toBe(true);
    expect(t.mensagem).toBeNull();
  });
  it("só a importação fica travada por inteiro", () => {
    const aberto = { atividadesConfirmadas: false, atividades: [] };
    expect(abaBloqueada("importacao", aberto)).toBe(true);
    expect(abaBloqueada("tabela", aberto)).toBe(false);
    expect(abaBloqueada("importacao", { atividadesConfirmadas: true })).toBe(false);
  });
});

describe("erros e conflito de versão (409)", () => {
  it("reconhece o conflito e a trava", () => {
    expect(ehConflitoVersao(erro(409, { codigo: "CONFLITO_VERSAO" }))).toBe(true);
    expect(ehConflitoVersao(erro(409, { codigo: "CAMPO_ALTERADO_DEPOIS" }))).toBe(false);
    expect(ehConflitoVersao(erro(400, { codigo: "CONFLITO_VERSAO" }))).toBe(false);
    expect(ehTravaNaoConfirmada(erro(400, { codigo: "ATIVIDADES_NAO_CONFIRMADAS" }))).toBe(true);
  });
  it("a mensagem do conflito diz o que aconteceu e que o digitado foi mantido", () => {
    const m = mensagemDeErro(erro(409, { codigo: "CONFLITO_VERSAO" }));
    expect(m).toContain("Outra pessoa alterou");
    expect(m).toContain("mantivemos o que você digitou");
    expect(mensagemDeErro(erro(409, { codigo: "CAMPO_ALTERADO_DEPOIS" , message: "Não dá para desfazer: x" }))).toBe("Não dá para desfazer: x");
    expect(mensagemDeErro(new Error("Request failed with status code 500"), "padrão")).toBe("padrão");
  });
  it("depois do conflito mantém o que o usuário digitou e passa a usar a versão nova", () => {
    const digitado = { id: "c1", proposta: { finalidade: "REVENDA" }, justificativa: "meu texto", fundamento: "" };
    const visto = { proposta: { finalidade: "INSUMO_PRODUCAO" }, situacao: "PROPOSTO", versao: 3 };
    const igual = aposConflito(digitado, { ...visto, versao: 4 }, visto);
    expect(igual.edicao).toEqual(digitado);
    expect(igual.versao).toBe(4);
    expect(igual.mudou).toBe(false);
    const mudou = aposConflito(digitado, { ...visto, situacao: "APROVADO", versao: 4 }, visto);
    expect(mudou.mudou).toBe(true);
    expect(mudou.aviso).toContain("mudou no servidor");
  });
  it("a edição só é 'suja' se algo foi alterado", () => {
    const caso = { id: "1", proposta: { ncm: "123" }, justificativa: "a", fundamento: null };
    const e = edicaoInicial(caso);
    expect(edicaoSuja(e, caso)).toBe(false);
    expect(edicaoSuja({ ...e, justificativa: "b" }, caso)).toBe(true);
    expect(edicaoSuja({ ...e, proposta: { ncm: "999" } }, caso)).toBe(true);
  });
});

describe("virtualização", () => {
  it("30 mil linhas: só desenha a janela, com a altura total certa", () => {
    const j = janelaVisivel({ rolagem: 0, alturaVisivel: 600, alturaLinha: ALTURA_LINHA, total: 30000 });
    expect(j.alturaTotal).toBe(30000 * ALTURA_LINHA);
    expect(j.inicio).toBe(0);
    expect(j.fim - j.inicio).toBeLessThan(40);
  });
  it("no meio, desenha a folga acima e abaixo", () => {
    const j = janelaVisivel({ rolagem: 38 * 1000, alturaVisivel: 380, alturaLinha: 38, total: 30000, folga: 5 });
    expect(j.inicio).toBe(995);
    expect(j.fim).toBe(1000 + 10 + 5);
    expect(j.topo).toBe(995 * 38);
  });
  it("no fim da lista não passa do total", () => {
    const j = janelaVisivel({ rolagem: 1e9, alturaVisivel: 600, alturaLinha: 38, total: 100 });
    expect(j.fim).toBe(100);
    expect(j.inicio).toBeLessThan(100);
  });
  it("lista vazia e rolagem negativa", () => {
    expect(janelaVisivel({ total: 0 })).toEqual({ inicio: 0, fim: 0, topo: 0, alturaTotal: 0 });
    expect(janelaVisivel({ rolagem: -50, total: 10 }).inicio).toBe(0);
  });
  it("manda carregar a próxima página perto do fim do que foi carregado", () => {
    expect(precisaCarregarMais({ fim: 250, carregadas: 300, temMais: true })).toBe(true);
    expect(precisaCarregarMais({ fim: 100, carregadas: 300, temMais: true })).toBe(false);
    expect(precisaCarregarMais({ fim: 299, carregadas: 300, temMais: false })).toBe(false);
  });
  it("põe a linha no terço de cima", () => {
    expect(rolagemParaLinha(100, 38, 600)).toBe(3800 - 200);
    expect(rolagemParaLinha(1, 38, 600)).toBe(0);
  });
  it("as colunas fixas somam a largura que o cabeçalho usa", () => {
    const col = colunasDaTabela(camadasAtivas({}));
    expect(larguraTotal(col)).toBe(LARGURA_FIXA + col.reduce((s, c) => s + c.largura, 0));
    const grupos = gruposDeColunas(col);
    expect(grupos.map((g) => g.camada)).toEqual(camadasAtivas({}));
    expect(grupos.reduce((s, g) => s + g.largura, 0)).toBe(col.reduce((s, c) => s + c.largura, 0));
    expect(col.filter((c) => c.tipo === "situacao")).toHaveLength(8);
  });
});

describe("próximo pendente", () => {
  const item = (...cel) => ({ celulas: cel.map(([camada, situacao]) => ({ camada, situacao })) });
  const itens = [item(["NCM", "APROVADO"]), item(["NCM", "PENDENTE"]), item(["QUALIDADE", "PENDENTE"]), item(["NCM", "PENDENTE"])];
  it("acha o próximo depois do índice atual", () => {
    expect(proximoPendente(itens, -1)).toBe(1);
    expect(proximoPendente(itens, 1)).toBe(2);
    expect(proximoPendente(itens, 3)).toBe(-1);
  });
  it("com camada, ignora as outras", () => {
    expect(proximoPendente(itens, 1, "NCM")).toBe(3);
    expect(proximoPendente(itens, -1, "TRIBUTARIO")).toBe(-1);
  });
});

describe("filtros", () => {
  it("itens: só o que foi preenchido, com limite", () => {
    expect(montarFiltroItens({})).toEqual({ limite: 300 });
    expect(montarFiltroItens({ camada: "NCM", situacao: "PENDENTE", revisar: true, busca: "  parafuso ", grupo: "(sem grupo)", ordem: "grupo" }, { cursor: "x", limite: 50 }))
      .toEqual({ camada: "NCM", situacao: "PENDENTE", grupo: "(sem grupo)", revisar: "true", busca: "parafuso", ordem: "grupo", cursor: "x", limite: 50 });
    expect(montarFiltroItens({ revisar: false, ordem: "codigo" })).toEqual({ limite: 300 });
  });
  it("casos: 'em aberto' vira proposto + rascunho no servidor, com grupo", () => {
    expect(montarFiltroCasos({ situacao: "ABERTOS", camada: "NCM", grupo: "Ferragens" })).toEqual({ camada: "NCM", situacao: "PROPOSTO,RASCUNHO", grupo: "Ferragens", limite: 200 });
    expect(montarFiltroCasos({ situacao: "APROVADO", origem: "IA", tipo: "X" })).toEqual({ situacao: "APROVADO", origem: "IA", tipo: "X", limite: 200 });
    expect(montarFiltroCasos({ situacao: "" })).toEqual({ limite: 200 });
    expect(casoAberto({ situacao: "REJEITADO" })).toBe(false);
    expect(casoAberto({ situacao: "OBSOLETO" })).toBe(false);
    expect(rotuloSituacaoCaso("OBSOLETO")).toBe("Substituído");
  });
});

describe("casos: ações, próximo e lote", () => {
  it("cada situação admite só as ações que o servidor aceita", () => {
    expect(acoesDoCaso({ situacao: "PROPOSTO" })).toMatchObject({ aprovar: true, rejeitar: true, pedirInformacao: true, reabrir: false, salvarRascunho: true });
    expect(acoesDoCaso({ situacao: "APROVADO" })).toMatchObject({ aprovar: false, reabrir: true, desfaz: true, editar: false });
    expect(acoesDoCaso({ situacao: "REJEITADO" })).toMatchObject({ aprovar: false, reabrir: true, desfaz: false });
    expect(acoesDoCaso({ situacao: "AGUARDANDO_INFORMACAO" })).toMatchObject({ aprovar: false, reabrir: true, salvarRascunho: true });
    expect(acoesDoCaso(undefined).aprovar).toBe(false);
  });
  it("o próximo caso aberto vem depois do atual e volta ao começo se preciso", () => {
    const casos = [{ id: "a", situacao: "PROPOSTO" }, { id: "b", situacao: "APROVADO" }, { id: "c", situacao: "RASCUNHO" }];
    expect(proximoCasoAberto(casos, "a")).toBe("c");
    expect(proximoCasoAberto(casos, "c")).toBe("a");
    expect(proximoCasoAberto([{ id: "x", situacao: "APROVADO" }], "x")).toBeNull();
  });
  it("lote: ids marcados ou filtro; a aprovação usa as versões da prévia", () => {
    expect(corpoDoLote({ ids: ["1", "2"], fundamento: " F " })).toEqual({ ids: ["1", "2"], fundamento: "F" });
    expect(corpoDoLote({ filtro: { camada: "NCM", tipo: "", origem: "IA" } })).toEqual({ filtro: { camada: "NCM", origem: "IA" } });
    expect(loteTemEscolha(corpoDoLote({ filtro: { camada: "", tipo: "", origem: "" } }))).toBe(false);
    expect(loteTemEscolha(corpoDoLote({ ids: ["1"] }))).toBe(true);
    expect(versoesDaPrevia({ aprovaveis: [{ casoId: "a", versao: 2 }, { casoId: "b", versao: 5 }] })).toEqual({ a: 2, b: 5 });
    expect(versoesDaPrevia(null)).toEqual({});
  });
  it("converte o texto digitado conforme o valor anterior", () => {
    expect(converterValor("12,5", 3)).toBe(12.5);
    expect(converterValor(" abc ", "x")).toBe("abc");
    expect(converterValor("", "x")).toBeNull();
    expect(converterValor("sim", true)).toBe(true);
    expect(converterValor("00123", "x")).toBe("00123");
  });
});

describe("parecer da IA", () => {
  it("lê o parecer gravado e ignora o que não é parecer", () => {
    expect(lerParecer({ parecer_ia: null })).toBeNull();
    expect(lerParecer({ parecer_ia: {} })).toBeNull();
    const p = lerParecer({ parecer_ia: { recomendacao: "Aprovar", confianca: "alta", aFavor: ["a"], contra: [], oQueConfirmar: ["b"], fontes: ["LC 214"], praticaDeMercado: "Muitos fazem assim" } });
    expect(p).toMatchObject({ recomendacao: "Aprovar", confianca: "alta", aFavor: ["a"], praticaDeMercado: "Muitos fazem assim" });
    expect(lerParecer({ parecer_ia: { recomendacao: "x", confianca: "???" } }).confianca).toBeNull();
  });
  it("rota ausente ou erro: mensagem que diz que o caso segue sem parecer", () => {
    expect(mensagemDoParecer(erro(404, {}))).toContain("não está disponível");
    expect(mensagemDoParecer(erro(500, {}))).toContain("não respondeu");
    expect(mensagemDoParecer(erro(404, {}))).toContain("sem parecer");
  });
});

describe("importação: mapeamento e relatório", () => {
  const previa = {
    mapeamento: { codigo: "Cód", descricao: "Desc", ncm: "NCM" },
    colunas: [{ indice: 0, nome: "Cód" }, { indice: 1, nome: "Desc" }, { indice: 2, nome: "NCM" }, { indice: 3, nome: "Grupo" }],
    sugestao: { colunas: [{ campo: "codigo", certeza: "ALTA" }, { campo: "ncm", certeza: "MEDIA" }] },
  };
  it("lista as colunas do arquivo e a certeza de cada sugestão", () => {
    expect(colunasDoArquivo(previa)).toEqual(["Cód", "Desc", "NCM", "Grupo"]);
    expect(colunasDoArquivo({ mapeamento: { codigo: "A", descricao: "B" } })).toEqual(["A", "B"]);
    const l = linhasDeMapeamento(previa);
    expect(l.find((x) => x.campo === "codigo")).toMatchObject({ coluna: "Cód", certeza: "ALTA", obrigatorio: true });
    expect(l.find((x) => x.campo === "ncm").certeza).toBe("MEDIA");
    expect(l.find((x) => x.campo === "grupo").coluna).toBe("");
  });
  it("o consultor corrige e a prévia exige código e descrição", () => {
    const m = corrigirMapeamento(previa.mapeamento, "grupo", "Grupo");
    expect(m).toEqual({ codigo: "Cód", descricao: "Desc", ncm: "NCM", grupo: "Grupo" });
    expect(previa.mapeamento.grupo).toBeUndefined();
    expect(corrigirMapeamento(m, "descricao", "")).not.toHaveProperty("descricao");
    expect(camposObrigatoriosSemColuna({ codigo: "A" })).toEqual(["Descrição"]);
    expect(camposObrigatoriosSemColuna(m)).toEqual([]);
  });
  it("resume o relatório do importador e o da porta, com motivos agrupados e exemplos", () => {
    const porta = resumirRelatorio({
      aceitas: 8, rejeitadas: 3, pendentes: 1,
      linhasRejeitadas: [{ linha: 2, codigo: "A", motivo: "Sem código" }, { linha: 5, codigo: "B", motivo: "Sem código" }, { linha: 9, codigo: "C", motivo: "NCM inválido" }],
      linhasPendentes: [{ linha: 4, codigo: "D", motivo: "Sem NCM" }],
    });
    expect(porta).toMatchObject({ aceitas: 8, rejeitadas: 3, pendentes: 1 });
    expect(porta.motivosRejeicao[0]).toMatchObject({ texto: "Sem código", quantidade: 2 });
    expect(porta.motivosRejeicao[0].exemplos).toHaveLength(2);
    const imp = resumirRelatorio({ totais: { aceitas: 1, rejeitadas: 2, pendentes: 0 }, motivosRejeicao: [{ codigo: "X", texto: "Duplicada", quantidade: 2, exemplos: [{ linha: 3, codigo: "Z", descricao: "d" }] }], avisos: ["a"] });
    expect(imp.rejeitadas).toBe(2);
    expect(imp.motivosRejeicao[0].texto).toBe("Duplicada");
    expect(imp.avisos).toEqual(["a"]);
    expect(resumirRelatorio(null).aceitas).toBe(0);
  });
  it("reimportação: o que pode ser incorporado ignora os campos protegidos", () => {
    const dif = [
      { itemId: "1", campos: [{ campo: "ncm", protegido: true }] },
      { itemId: "2", campos: [{ campo: "ncm", protegido: true }, { campo: "unidade", protegido: false }] },
    ];
    expect(itensIncorporaveis(dif)).toEqual(["2"]);
    expect(ehReimportacao({ novos: 5, inalterados: 0, alterados: 0, ausentesDoArquivo: 0 })).toBe(false);
    expect(ehReimportacao({ inalterados: 3 })).toBe(true);
    expect(ehReimportacao(null)).toBe(false);
    const s = alternarIncorporar(new Set(["a"]), "b");
    expect([...s]).toEqual(["a", "b"]);
    expect([...alternarIncorporar(s, "a")]).toEqual(["b"]);
  });
});

describe("cobertura, exceções, impacto e entregas", () => {
  it("diz o que tem dados, o que depende de informação e o que não é analisável", () => {
    const camadas = ["QUALIDADE", "NCM", "TRIBUTARIO", "OBRIGACOES"];
    const visao = { grupos: [{ camadas: { QUALIDADE: { PROPOSTO: 3, PENDENTE: 1 }, NCM: { PENDENTE: 4 }, TRIBUTARIO: { AGUARDANDO_INFORMACAO: 4 }, OBRIGACOES: {} } }] };
    const c = Object.fromEntries(coberturaDeCamadas(camadas, ["QUALIDADE", "NCM", "TRIBUTARIO"], visao).map((x) => [x.camada, x.estado]));
    expect(c).toEqual({ QUALIDADE: "COM_DADOS", NCM: "NAO_ANALISADA", TRIBUTARIO: "AGUARDA_INFORMACAO", OBRIGACOES: "SEM_ANALISE" });
    expect(coberturaDeCamadas(["NCM"], ["NCM"], { grupos: [] })[0].estado).toBe("SEM_ITENS");
  });
  it("a exceção de item vira um caso individual e exige motivo", () => {
    const item = { id: "i1", codigo: "001", estabelecimento: null, trabalho: { finalidade: "REVENDA" } };
    const r = montarExcecao({ camada: "GRUPOS_FINALIDADE", item, valores: { finalidade: "USO_CONSUMO" }, motivo: "Item de uso interno" });
    expect(r.casos).toHaveLength(1);
    expect(r.casos[0]).toMatchObject({ itens: ["i1"], proposta: { finalidade: "USO_CONSUMO" }, atual: { finalidade: "REVENDA" }, origem: "REGRA", justificativa: "Item de uso interno" });
    expect(() => montarExcecao({ camada: "GRUPOS_FINALIDADE", item, valores: { finalidade: "USO_CONSUMO" }, motivo: " " })).toThrow("motivo");
    expect(() => montarExcecao({ camada: "GRUPOS_FINALIDADE", item, valores: {}, motivo: "x" })).toThrow("valor");
    expect(() => montarExcecao({ camada: "NCM", item, valores: {}, motivo: "x" })).toThrow("não admite");
    expect(montarExcecao({ camada: "TRIBUTARIO", item, valores: { cClassTrib: "000001" }, motivo: "m" }).casos[0].proposta.origem).toBe("EXCECAO");
  });
  it("QA 30 mil: aprovar \"solicitar informação\" fica bloqueado; exceção de conversão de unidade por item; incorporar por filtro", () => {
    const dup = { tipo: "DUPLICIDADE_EXATA", situacao: "PROPOSTO", proposta: { decisao: "SOLICITAR_INFORMACAO", manter: "A" } };
    expect(razaoSemAprovar(dup)).toMatch(/Pedir informação/);
    expect(razaoSemAprovar(dup, { ...dup.proposta, decisao: "MANTER_DISTINTOS" })).toBeNull();
    const item = { id: "i1", codigo: "001", estabelecimento: null, trabalho: { unidade: "BB", campos: {} } };
    const r = montarExcecao({ camada: "NOMES_UNIDADES", item, valores: { unidade: "KG", unidadeCompra: "BB", fatorConversao: "1.000" }, motivo: "Big bag de 1 t" });
    expect(r.casos[0]).toMatchObject({ tipo: "EXCECAO_MANUAL", itens: ["i1"], proposta: { unidade: "KG", unidadeCompra: "BB", fatorConversao: 1000 }, atual: { unidade: "BB", unidadeCompra: null, fatorConversao: null } });
    expect(() => montarExcecao({ camada: "NOMES_UNIDADES", item, valores: { unidade: "KG", unidadeCompra: "BB", fatorConversao: "zero" }, motivo: "m" })).toThrow("maior que zero");
    expect(() => montarExcecao({ camada: "NOMES_UNIDADES", item, valores: { fatorConversao: "10" }, motivo: "m" })).toThrow("unidade de estoque");
    expect(lerNumeroBr("0,5")).toBe(0.5);
    expect(lerNumeroBr("1.000")).toBe(1000);
    expect(lerNumeroBr("")).toBeNull();
    expect(corpoIncorporar("ALTERADOS", new Set(["a"]))).toEqual({ filtro: "ALTERADOS" });
    expect(corpoIncorporar("ALTERADOS_SEM_PROTEGIDO")).toEqual({ filtro: "ALTERADOS_SEM_PROTEGIDO" });
    expect(corpoIncorporar("ITENS", new Set(["a", "b"]))).toEqual(["a", "b"]);
    expect(corpoIncorporar("NENHUM", new Set(["a"]))).toEqual([]);
    const previa = { alterados: 100, totais: { alterados: 100, alteradosComProtegido: 3, alteradosIncorporaveis: 99 } };
    expect(quantosIncorporar(previa, "ALTERADOS")).toBe(99);
    expect(quantosIncorporar(previa, "ALTERADOS_SEM_PROTEGIDO")).toBe(97);
    expect(quantosIncorporar(previa, "ITENS", new Set(["x"]))).toBe(1);
  });
  it("conta o checklist por tipo de ajuste", () => {
    // impactos paginados: as contagens vêm do servidor (filtro inteiro), as linhas são as páginas carregadas
    const pag = paginasDeImpacto({ pages: [{ linhas: [{ id: "1" }, { id: "2" }], proximo: "3", total: 5, totalGeral: 9, porTipo: { CADASTRAL_FUTURO: 7, ESCRITURACAO_ENTREGUE: 2 } }, { linhas: [{ id: "3" }], proximo: null }] });
    expect(pag).toEqual({ linhas: [{ id: "1" }, { id: "2" }, { id: "3" }], total: 5, totalGeral: 9, porTipo: { CADASTRAL_FUTURO: 7, REGULARIZACAO_SALDO: 0, ESCRITURACAO_ENTREGUE: 2 } });
    expect(paginasDeImpacto(undefined)).toMatchObject({ linhas: [], total: 0, totalGeral: 0 });
  });
  it("liberada e para revisão têm endereços e nomes diferentes", () => {
    expect(enderecoDeEntrega("p1", "excel", "v9")).toBe("/saneamento-estoques/projetos/p1/entregas/excel?versaoId=v9");
    expect(enderecoDeEntrega("p1", "pdf")).toBe("/saneamento-estoques/projetos/p1/entregas/relatorio");
    expect(nomeDeEntrega("excel", { numero: 2 })).toBe("saneamento-estoques-versao-2-liberada.xlsx");
    expect(nomeDeEntrega("excel", null)).toBe("saneamento-estoques-para-revisao.xlsx");
  });
  it("o conjunto aparece como NCM · finalidade", () => {
    expect(textoDoConjunto("12345678|REVENDA")).toBe("12345678 · Revenda");
    expect(textoDoConjunto(null)).toBe("");
  });
});

describe("abas", () => {
  it("sem aba na URL: Configuração até confirmar as atividades, Tabela depois", () => {
    expect(abaInicial(null, { atividadesConfirmadas: false })).toBe("configuracao");
    expect(abaInicial(null, { atividadesConfirmadas: true })).toBe("tabela");
    expect(abaInicial("versoes", { atividadesConfirmadas: false })).toBe("versoes");
    expect(abaInicial("inexistente", { atividadesConfirmadas: true })).toBe("tabela");
    expect(ABAS.map((a) => a.id)).toEqual(["configuracao", "importacao", "diretrizes", "tabela", "visao", "casos", "impacto", "unificacoes", "versoes"]);
  });
  it("setas, Home e End navegam em círculo", () => {
    expect(abaPorTecla("versoes", "ArrowRight")).toBe("configuracao");
    expect(abaPorTecla("configuracao", "ArrowLeft")).toBe("versoes");
    expect(abaPorTecla("tabela", "Home")).toBe("configuracao");
    expect(abaPorTecla("tabela", "End")).toBe("versoes");
    expect(abaPorTecla("tabela", "a")).toBeNull();
  });
});

describe("revisão C: datas, proposta, parecer, lote e enquadramento", () => {
  it("data sem hora nunca recua um dia (31/12 continua 31/12)", () => {
    expect(fmtData("2026-12-31T00:00:00.000Z")).toBe("31/12/2026");
    expect(fmtData("2026-12-31")).toBe("31/12/2026");
    expect(fmtData(null)).toBe("");
  });
  it("proposta numérica: o texto digitado (0,05) vira número só ao salvar", () => {
    const r = converterProposta({ fatorConversao: "0,05", ncm: "00123", valor: "12,5", vazio: "" }, { valor: 3, fatorConversao: null });
    expect(r.valor).toEqual({ fatorConversao: 0.05, ncm: "00123", valor: 12.5, vazio: null });
    expect(r.invalidos).toEqual([]);
    expect(converterProposta({ fatorConversao: "abc" }, {}).invalidos).toEqual(["fatorConversao"]);
    expect(converterProposta({ valor: "x" }, { valor: 3 }).invalidos).toEqual(["valor"]);
  });
  it("edição 0,06 digitada conta como alterada; a original não", () => {
    const caso = { id: "1", proposta: { fatorConversao: 0.05 }, justificativa: "", fundamento: null };
    expect(edicaoSuja(edicaoInicial(caso), caso)).toBe(false);
    expect(edicaoSuja({ ...edicaoInicial(caso), proposta: { fatorConversao: "0,06" } }, caso)).toBe(true);
  });
  it("aprovar fica desligado, com a razão, nos casos que o servidor recusa", () => {
    expect(razaoSemAprovar({ situacao: "AGUARDANDO_INFORMACAO", proposta: { a: 1 } })).toContain("aguarda informação");
    expect(razaoSemAprovar({ situacao: "PROPOSTO", tipo: "AGUARDANDO_NCM", proposta: { a: 1 } })).toContain("aguarda informação");
    expect(razaoSemAprovar({ situacao: "PROPOSTO", proposta: {} })).toContain("Não há proposta");
    const unidade = { situacao: "PROPOSTO", proposta: { unidade: "KG", fatorSituacao: "INFORMAR", fatorConversao: null } };
    expect(razaoSemAprovar(unidade)).toContain("fator de conversão");
    expect(razaoSemAprovar(unidade, { ...unidade.proposta, fatorConversao: "0" })).toContain("fator");
    expect(razaoSemAprovar(unidade, { ...unidade.proposta, fatorConversao: "2,5" })).toBeNull();
    expect(razaoSemAprovar({ situacao: "PROPOSTO", proposta: { ncm: "1" } })).toBeNull();
    // exceção à finalidade do grupo: sem motivo escrito não se aprova
    const ex = { situacao: "PROPOSTO", tipo: "FINALIDADE_EXCECAO", proposta: { finalidade: "USO_CONSUMO" }, justificativa: "" };
    expect(razaoSemAprovar(ex)).toContain("Exceção exige motivo");
    expect(razaoSemAprovar(ex, ex.proposta, "abc")).toContain("Exceção exige motivo");
    expect(razaoSemAprovar(ex, ex.proposta, "Luva usada no armazém")).toBeNull();
  });
  it("mapa de atividades: em que o CNAE vira, ou sem efeito; ausente não quebra", () => {
    const mapa = { mapeadas: [{ codigo: "4623-1/99", atividade: "COMERCIO", rotulo: "Comércio atacadista" }], semMapeamento: ["9999-9/99"] };
    expect(efeitoDaAtividade(mapa, "4623-1/99")).toBe("Vira: Comércio atacadista");
    expect(efeitoDaAtividade(mapa, "9999-9/99")).toBe("Sem efeito nas sugestões");
    expect(efeitoDaAtividade(mapa, "1111")).toBeNull();
    expect(efeitoDaAtividade(undefined, "1")).toBeNull();
  });
  it("parecer da IA: só é sucesso quando veio o parecer; cada motivo tem a sua mensagem", () => {
    expect(interpretarRespostaParecer({ parecer: { recomendacao: "x" } })).toEqual({ ok: true, texto: "Parecer da IA gerado." });
    expect(interpretarRespostaParecer({ parecer: null, motivo: "nao_e_borda" }).texto).toBe("Este caso é decidido pela regra; não precisa de parecer.");
    expect(interpretarRespostaParecer({ motivo: "ia_indisponivel" }).texto).toBe("A IA não está disponível agora; o caso segue sem parecer.");
    expect(interpretarRespostaParecer({ motivo: "sem_resposta" })).toMatchObject({ ok: false, texto: "A IA não está disponível agora; o caso segue sem parecer." });
    expect(interpretarRespostaParecer(null).ok).toBe(false);
  });
  it("lote: o recorte é o que a tela mostra, e a exceção identifica o caso", () => {
    const casos = [{ id: "a1", situacao: "PROPOSTO", camada: "NCM", problema: "NCM curto" }, { id: "b2", situacao: "APROVADO" }, { id: "c3", situacao: "RASCUNHO" }, { id: "d4", situacao: "OBSOLETO" }];
    expect(idsDoLote(new Set(), casos)).toEqual(["a1", "c3"]);
    expect(idsDoLote(new Set(["b2"]), casos)).toEqual(["b2"]);
    expect(rotuloDoCaso(casos, "a1")).toBe("NCM: NCM curto");
    expect(rotuloDoCaso(casos, "zzzzzzzzzz")).toBe("Caso zzzzzzzz");
  });
  it("coluna tributária: enquadramento do servidor com etiqueta; 'Aguardando revisão' se revisar", () => {
    const item = { conjunto_chave: "1|REVENDA", celulas: [{ camada: "TRIBUTARIO", situacao: "PROPOSTO", revisar: false }], enquadramento: { enquadramentoLegal: "Alíquota padrão", artigo: "art. 11", cClassTrib: "000001", cst: "000", origem: "EXCECAO" } };
    expect(textoDoEnquadramento(item)).toEqual({ aguardando: false, texto: "Alíquota padrão · art. 11 · cClassTrib 000001 · CST 000", origem: "exceção" });
    expect(textoDoEnquadramento({ ...item, enquadramento: { ...item.enquadramento, origem: "HERDADO" } }).origem).toBe("herdado do conjunto");
    expect(textoDoEnquadramento({ ...item, celulas: [{ camada: "TRIBUTARIO", revisar: true }] })).toEqual({ aguardando: true, texto: "Aguardando revisão", origem: null });
    expect(textoDoEnquadramento({ conjunto_chave: "123|REVENDA", celulas: [] }).texto).toBe("123 · Revenda");
    expect(casoValeParaEnquadramento({ situacao: "APROVADO" })).toBe(true);
    expect(casoValeParaEnquadramento({ situacao: "REJEITADO" })).toBe(false);
    expect(casoValeParaEnquadramento({ situacao: "OBSOLETO" })).toBe(false);
  });
  it("liberação de versão: avisos do servidor pedem confirmação antes", () => {
    expect(avisosDaLiberacao({ avisos: ["3 células em revisar", { texto: "outro" }] })).toEqual(["3 células em revisar", "outro"]);
    expect(avisosDaLiberacao({})).toEqual([]);
    expect(versaoCriada({ id: "v1" })).toBe(true);
    expect(versaoCriada({ avisos: ["x"] })).toBe(false);
  });
  it("erro de rede em português e erros novos do servidor", () => {
    expect(mensagemDeErro(Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }))).toContain("Sem conexão");
    expect(mensagemDeErro(Object.assign(new Error("timeout of 5000ms exceeded"), { code: "ECONNABORTED" }))).toContain("tempo esgotou");
    const e = erro(409, { codigo: "PROPOSTA_DESATUALIZADA", campos: [{ campo: "ncm", atual: "1", esperado: "2" }] });
    expect(ehPropostaDesatualizada(e)).toBe(true);
    expect(ehConflitoVersao(e)).toBe(false);
    expect(camposDivergentes(e)).toEqual([{ campo: "ncm", atual: "1", esperado: "2" }]);
    expect(ehErroDeRede(erro(500, {}))).toBe(false);
  });
});

describe("continuar a partir de uma versão", () => {
  const previa = (totais = {}, extra = {}) => ({ versao: { numero: 2 }, totais: { itens: 3, campos: 5, itensNaFoto: 10, itensNovosDepois: 0, itensAusentes: 0, casosDecididosDepois: 0, ...totais }, camadasRevisar: [], ignorados: [], ...extra });
  it("só restaura com algo a mudar e justificativa de ao menos 10 caracteres", () => {
    expect(justificativaBasta("  curta   ")).toBe(false);
    expect(justificativaBasta("Cliente pediu")).toBe(true);
    expect(podeRestaurar(previa(), "Cliente pediu")).toBe(true);
    expect(podeRestaurar(previa(), "")).toBe(false);
    expect(podeRestaurar(previa({ campos: 0, itens: 0 }), "Cliente pediu")).toBe(false);
    expect(podeRestaurar(null, "Cliente pediu")).toBe(false);
  });
  it("a prévia diz quantos itens e campos mudam, o que fica revisar e o que fica de fora", () => {
    const l = linhasDaPrevia(previa({ casosDecididosDepois: 1, itensNovosDepois: 2, itensAusentes: 1 }, { camadasRevisar: ["NCM", "TRIBUTARIO"], ignorados: [{ campo: "codigo" }] }));
    expect(l[0]).toBe("3 itens e 5 campos voltam aos valores da versão 2.");
    expect(l.join(" ")).toContain("1 caso aprovado depois desta versão volta a proposto");
    expect(l.join(" ")).toContain("Ficam “revisar” nos itens restaurados: NCM");
    expect(l.join(" ")).toContain("2 itens importados depois desta versão não estão na foto e ficam como estão.");
    expect(l.join(" ")).toContain("1 item da foto não existe mais na base e fica de fora.");
    expect(l.join(" ")).toContain("1 código continua como está");
    expect(l[l.length - 1]).toContain("pode ser desfeita");
    expect(linhasDaPrevia(previa({ campos: 0, itens: 0 }))).toEqual(["A base de trabalho já está igual à versão 2: nada a restaurar."]);
    expect(linhasDaPrevia(previa({ itens: 30000, campos: 60000 }))[0]).toBe("30.000 itens e 60.000 campos voltam aos valores da versão 2.");
  });
  it("restaurações da versão, mais recente primeiro", () => {
    expect(restauracoesDaVersao({ resumo: {} })).toEqual([]);
    expect(restauracoesDaVersao({ resumo: { restauracoes: [{ id: "a" }, { id: "b" }] } }).map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("mapa de unificações", () => {
  it("parâmetros só com o que foi preenchido; o Excel leva o filtro e não a página", () => {
    expect(paramsDoMapa({})).toEqual({});
    expect(paramsDoMapa({ situacao: "APROVADA", tipo: "", busca: "  0012 ", pagina: 3 })).toEqual({ situacao: "APROVADA", busca: "0012", pagina: 3 });
    expect(enderecoDoMapa("p1", { situacao: "PROPOSTA", busca: "0012", pagina: 4 })).toBe("/saneamento-estoques/projetos/p1/unificacoes/excel?situacao=PROPOSTA&busca=0012");
    expect(enderecoDoMapa("p1")).toBe("/saneamento-estoques/projetos/p1/unificacoes/excel");
  });
  it("saldo em pt-BR; vazio sem saldo", () => {
    expect(fmtSaldo(1234.5)).toBe("1.234,5");
    expect(fmtSaldo(0)).toBe("0");
    expect(fmtSaldo(null)).toBe("");
  });
});
