import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ atual: "admin" }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "A1", role: papel.atual, email: "a@fal" } }) }));

import { chaves, san } from "../api";
import Abas from "../Abas";
import CasoDetalhe from "../CasoDetalhe";
import Versoes from "../Versoes";
import Diretrizes, { CabecalhoDiretrizes, mensagemErroVigencia, salvarVigencia, situacaoDoCabecalho, textoModeloAplicado, vigenciaDaTela } from "./Diretrizes";
import FormularioRegra, { AvisoTransferencia, PreviaAplicar } from "./FormularioRegra";
import TransformarEmRegra, { ResultadoTransformacao } from "./TransformarEmRegra";
import { BlocoAtributos, BlocoFiscal, BlocoLimites, BlocoNomes, BlocoUnidades } from "./Blocos";
import { conteudoPadrao, conteudoParaTela } from "./logica";
import BibliotecaDiretrizesPagina, { FichaRegraBiblioteca, ModeloLeitura, ProcedimentoLeitura } from "@/pages/admin/BibliotecaDiretrizesPagina";

const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const montar = (ui, preparar, local = "/") => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
  preparar?.(qc);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><StaticRouter location={local}>{ui}</StaticRouter></QueryClientProvider>);
};

const projeto = (o = {}) => ({ id: "p1", empresa_id: "e1", versao: 3, erp: "SAP Business One", erp_nome: "SAP Business One", erp_versao: "10.0", data_base: "2026-12-31T00:00:00.000Z", atividadesConfirmadas: true, parametros: {}, modulos: {}, atividades: [], ...o });
const regra = (o = {}) => ({ id: "r1", projetoId: "p1", aspecto: "NOMES", codigo: "N01", nome: "Descrição padrão", abrangencia: { todos: true }, observacao: null, bibliotecaId: null, bibliotecaVersao: null, alteracoes: null, conteudoEfetivo: conteudoPadrao("NOMES"), situacao: "RASCUNHO", revisar: false, aprovadaPor: null, aprovadaEm: null, versao: 2, ...o });
const DADOS = {
  cabecalho: { vigencia: "2027-01-01", situacao: "RASCUNHO", revisar: true, versao: 4 },
  regras: [
    regra(),
    regra({ id: "r2", codigo: "N02", nome: "Ferragens", abrangencia: { todos: false, grupos: ["Ferragens"] }, situacao: "APROVADA", bibliotecaId: "b1", bibliotecaVersao: 1 }),
    regra({ id: "r3", aspecto: "FISCAL", codigo: "F01", nome: "NCM e cClassTrib", conteudoEfetivo: conteudoPadrao("FISCAL"), revisar: true }),
  ],
  grupos: [{ grupo: "Ferragens", subgrupos: [], itens: 120 }, { grupo: "Defensivos", subgrupos: ["Herbicidas", "Fungicidas"], itens: 40 }],
  gruposSemRegra: [{ aspecto: "ATRIBUTOS", grupos: ["Ferragens", "Defensivos"] }, { aspecto: "NOMES", grupos: [] }],
  atualizacoesBiblioteca: [{ regraId: "r2", versaoNova: 3 }],
};
const comDiretrizes = (dados = DADOS) => (qc) => {
  qc.setQueryData(chaves.diretrizes("p1"), dados);
  qc.setQueryData(chaves.cliente("e1"), { id: "e1", razao_social: "Agropecuária Teste Ltda" });
  qc.setQueryData(chaves.importacoes("p1"), [{ id: "i1", createdAt: "2026-11-20T12:00:00Z", arquivo: "itens.xlsx" }, { id: "i0", createdAt: "2026-11-10T12:00:00Z", arquivo: "antigo.xlsx" }]);
  qc.setQueryData(chaves.biblioteca(), [{ id: "b1", aspecto: "NOMES", nome: "Nomes FAL", indicadaPara: "Revenda", versao: 3, ativa: true, conteudo: conteudoPadrao("NOMES") }]);
};

describe("aba Diretrizes na página do saneamento", () => {
  it("fica junto com Preparar (1.1 Preparar e diretrizes) na Fase 1 e com Premissas (2.1 Premissas e diretrizes) na Fase 2, antes da Análise", () => {
    const t = texto(montar(<Abas fase="fase1" atual="preparar" aoMudar={() => {}} />));
    expect(t).toContain("1.1 Preparar e diretrizes 1.2 Análise");
    expect(t).not.toMatch(/\d\.\d Diretrizes/);
    const t2 = texto(montar(<Abas fase="fase2" atual="premissas" aoMudar={() => {}} />));
    expect(t2).toContain("2.1 Premissas e diretrizes 2.2 Análise");
    expect(t2).not.toMatch(/\d\.\d Diretrizes/);
  });
  it("por fase: a Fase 1 mostra nomes, atributos, unidades e limites; a Fase 2, só a classificação fiscal", () => {
    const f1 = texto(montar(<Diretrizes projeto={projeto()} aspectos={["NOMES", "ATRIBUTOS", "UNIDADES", "LIMITES"]} />, comDiretrizes()));
    for (const x of ["Padrão de nomes", "Atributos técnicos", "Unidades e embalagens", "Limites de caracteres", "N01"]) expect(f1, x).toContain(x);
    expect(f1).not.toContain("Classificação fiscal");
    expect(f1).not.toContain("F01");
    const f2 = texto(montar(<Diretrizes projeto={projeto()} aspectos={["FISCAL"]} />, comDiretrizes()));
    expect(f2).toContain("Classificação fiscal");
    expect(f2).toContain("F01");
    expect(f2).not.toContain("Padrão de nomes");
    expect(f2).not.toContain("N01");
  });
  it("cabeçalho numa linha ao lado do título: só a vigência (editável) e a situação; cliente, base importada, ERP e data-base não se repetem", () => {
    const html = montar(<Diretrizes projeto={projeto()} titulo="Diretrizes da Fase 1 (nomes, atributos, unidades e limites)" tituloId="t1" />, comDiretrizes());
    const t = texto(html);
    for (const s of ["Diretrizes da Fase 1", "Vigência da política", "Salvar vigência", "Situação", "Rascunho", "revisar"]) expect(t, s).toContain(s);
    for (const s of ["Agropecuária Teste Ltda", "itens.xlsx", "Base importada", "SAP Business One", "31/12/2026", "Data-base", "Cliente"]) expect(t, s).not.toContain(s);
    expect(html).toMatch(/<input type="date"[^>]*value="2027-01-01"/);
    // A faixa do título leva o cabeçalho: o h2 com o id da seção e, logo depois, o grupo da vigência e da situação.
    expect(html).toMatch(/<h2 id="t1"[^>]*>Diretrizes da Fase 1[^<]*<\/h2><div role="group" aria-label="Cabeçalho das diretrizes"/);
  });
  it("lista as regras por aspecto com código, grupos, situação, revisar e o aviso de atualização da biblioteca", () => {
    const t = texto(montar(<Diretrizes projeto={projeto()} />, comDiretrizes()));
    for (const s of ["Padrão de nomes", "Atributos técnicos", "Unidades e embalagens", "Limites de caracteres", "Classificação fiscal", "N01", "N02", "F01", "Todos os grupos", "Aprovada", "Regra atualizada na biblioteca (versão 3)", "Adotar"]) expect(t, s).toContain(s);
    expect(t.indexOf("N01")).toBeLessThan(t.indexOf("F01"));
  });
  it("quadro Grupos sem regra por aspecto, botões Adicionar regra, Aplicar modelo e Política (PDF)", () => {
    const t = texto(montar(<Diretrizes projeto={projeto()} />, comDiretrizes()));
    expect(t).toContain("Grupos sem regra");
    expect(t).toContain("2 grupos pendentes");
    expect(t).toContain("Todos os grupos têm regra");
    for (const s of ["Adicionar regra", "Aplicar modelo da biblioteca", "Política (PDF)"]) expect(t).toContain(s);
  });
  it("antes da importação: abre e avisa que os grupos aparecem depois de importar", () => {
    const t = texto(montar(<Diretrizes projeto={projeto({ atividadesConfirmadas: false })} />, comDiretrizes({ ...DADOS, regras: [], grupos: [], gruposSemRegra: [] })));
    expect(t).toContain("Os grupos aparecem depois de importar o cadastro");
    expect(t).toContain("Adicionar regra");
  });
  it("?regra= abre o formulário da regra (vindo de Transformar em regra)", () => {
    const t = texto(montar(<Diretrizes projeto={projeto()} />, comDiretrizes(), "/?aba=diretrizes&regra=r3"));
    expect(t).toContain("Regra F01 — Classificação fiscal");
    expect(t).toContain("Voltar às diretrizes");
  });
  it("situação: Aprovada (verde) quando o servidor diz APROVADA; Rascunho sem situação; revisar só quando marcado", () => {
    const aprovada = montar(<CabecalhoDiretrizes cabecalho={{ vigencia: null, situacao: "APROVADA", revisar: false, versao: 2 }} aoSalvarVigencia={() => {}} podeAlterar />);
    expect(texto(aprovada)).toContain("Aprovada");
    expect(texto(aprovada)).not.toContain("revisar");
    expect(aprovada).toContain("data-situacao=\"APROVADA\"");
    expect(aprovada).toContain("emerald");
    expect(texto(montar(<CabecalhoDiretrizes cabecalho={null} aoSalvarVigencia={() => {}} podeAlterar />))).toContain("Rascunho");
    expect(situacaoDoCabecalho({ situacao: "RASCUNHO", revisar: true })).toEqual({ rotulo: "Rascunho", tom: "neutro", revisar: true });
  });
  it("vigência: sem permissão, campo e botão desabilitados; sem mudança, Salvar vigência desabilitado", () => {
    const sem = montar(<CabecalhoDiretrizes cabecalho={DADOS.cabecalho} aoSalvarVigencia={() => {}} podeAlterar={false} razao="Sem permissão" />);
    expect(sem).toMatch(/<input type="date"[^>]*disabled=""/);
    expect(sem).toMatch(/<button[^>]*disabled=""[^>]*>Salvar vigência/);
    const com = montar(<CabecalhoDiretrizes cabecalho={DADOS.cabecalho} aoSalvarVigencia={() => {}} podeAlterar />);
    expect(com).not.toMatch(/<input type="date"[^>]*disabled=""/);
    expect(com).toMatch(/<button[^>]*disabled=""[^>]*>Salvar vigência/);
  });
  it("vigência: salva com PUT das diretrizes levando a data e a versão do cabeçalho (vazia = null); erro e conflito viram mensagem", async () => {
    const put = vi.spyOn(san, "salvarCabecalhoDiretrizes").mockResolvedValue({ id: "d1", vigencia: "2027-03-01", versao: 5 });
    await salvarVigencia("p1", "2027-03-01", DADOS.cabecalho);
    expect(put).toHaveBeenLastCalledWith("p1", { vigencia: "2027-03-01", versao: 4 });
    await salvarVigencia("p1", "", DADOS.cabecalho);
    expect(put).toHaveBeenLastCalledWith("p1", { vigencia: null, versao: 4 });
    put.mockRestore();
    expect(vigenciaDaTela({ vigencia: "2027-01-01T00:00:00.000Z" })).toBe("2027-01-01");
    expect(vigenciaDaTela(null)).toBe("");
    expect(mensagemErroVigencia({ status: 400, message: "A vigência deve ser uma data (aaaa-mm-dd)." })).toEqual({ tom: "erro", texto: "A vigência deve ser uma data (aaaa-mm-dd)." });
    expect(mensagemErroVigencia({ status: 409 })).toMatchObject({ tom: "alerta", texto: expect.stringContaining("Recarregamos os dados") });
  });
  it("mensagem do modelo aplicado", () => {
    expect(textoModeloAplicado({ criadas: 5, jaExistiam: 2 }, { nome: "Modelo FAL" })).toBe("\"Modelo FAL\" foi aplicado: 5 regras criadas em rascunho; 2 já existiam.");
    expect(textoModeloAplicado(undefined, null)).toBe("O modelo foi aplicado. As regras novas estão em rascunho.");
  });
});

describe("formulário da regra", () => {
  it("regra existente: identificação, 4 ações e situação", () => {
    const t = texto(montar(<FormularioRegra projeto={projeto()} dados={DADOS} regraId="r2" aoFechar={() => {}} />, comDiretrizes()));
    for (const s of ["Regra N02", "Aspecto", "Nome da regra", "Todos os grupos", "Grupos abrangidos", "Observação", "Salvar rascunho", "Aplicar e reanalisar", "Aprovar", "Histórico", "Aprovada", "Da biblioteca (versão 1)"]) expect(t, s).toContain(s);
    expect(t).not.toContain("Partir de uma regra da biblioteca");
  });
  it("regra nova: oferece partir de uma regra da biblioteca do mesmo aspecto", () => {
    const t = texto(montar(<FormularioRegra projeto={projeto()} dados={DADOS} inicial={{ aspecto: "NOMES" }} aoFechar={() => {}} />, comDiretrizes()));
    expect(t).toContain("Partir de uma regra da biblioteca");
    expect(t).toContain("Nomes FAL — Revenda (versão 3)");
    expect(t).toContain("Salve o rascunho para ver exemplos com itens reais");
  });
  it("grupo já coberto por outra regra do mesmo aspecto mostra a regra atual e pede confirmação", () => {
    const t = texto(montar(<FormularioRegra projeto={projeto()} dados={DADOS} inicial={{ aspecto: "NOMES", todos: false, grupos: ["Ferragens"] }} aoFechar={() => {}} />, comDiretrizes()));
    expect(t).toContain("Grupo já coberto por outra regra");
    expect(t).toContain("Ferragens: hoje na regra N02 — Ferragens");
    expect(t).toContain("Confirmo a transferência");
  });
  it("subgrupos aparecem quando o grupo escolhido tem a coluna", () => {
    const t = texto(montar(<FormularioRegra projeto={projeto()} dados={DADOS} inicial={{ aspecto: "FISCAL", todos: false, grupos: ["Defensivos"] }} aoFechar={() => {}} />, comDiretrizes()));
    expect(t).toContain("Subgrupos");
    expect(t).toContain("Herbicidas");
  });
  it("aviso de transferência isolado", () => {
    expect(texto(montar(<AvisoTransferencia lista={[{ grupo: "Todos os grupos (padrão)", regraId: "r1", codigo: "N01", nome: "Geral", padrao: true }]} confirmado={false} aoConfirmar={() => {}} />))).toContain("Outra regra já vale para todos os grupos");
    expect(montar(<AvisoTransferencia lista={[]} confirmado aoConfirmar={() => {}} />)).toBe("");
  });
  it("prévia antes de aplicar: grupos, itens, análises; sobreposição exige marcar a transferência", () => {
    const html = montar(<PreviaAplicar previa={{ grupos: ["Ferragens"], itens: 120, camadas: ["NOMES_UNIDADES"], sobreposicoes: [{ grupo: "Ferragens", regraAtual: "N01" }] }} aoConfirmar={() => {}} aoCancelar={() => {}} />);
    const t = texto(html);
    expect(t).toContain("Antes de aplicar, confira o que muda");
    expect(t).toContain("120 itens de 1 grupo serão analisados de novo.");
    expect(t).toContain("Nomes e unidades");
    expect(t).toContain("Ferragens: hoje na regra N01");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[^])*Confirmar e aplicar/);
    const sem = montar(<PreviaAplicar previa={{ grupos: ["A"], itens: 1, camadas: [], sobreposicoes: [] }} aoConfirmar={() => {}} aoCancelar={() => {}} />);
    expect(sem).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[^])*Confirmar e aplicar/);
    expect(sem).toContain("Confirmar e aplicar");
  });
});

describe("blocos por aspecto", () => {
  const nada = () => {};
  it("A. Nomes: componentes com ordem e obrigatório, separador, capitalização, espaços, abreviações, termos e prévia", () => {
    const valor = { ...conteudoPadrao("NOMES"), abreviacoes: [{ completa: "Caixa", abreviacao: "CX" }], termosProibidos: [{ termo: "Diversos", substituicao: null }] };
    const html = montar(<BlocoNomes valor={valor} aoMudar={nada} />);
    const t = texto(html);
    for (const s of ["Componentes e ordem", "Característica técnica", "Obrigatório", "Separador entre componentes", "Maiúsculas e minúsculas", "Remover espaços duplicados", "Abreviações aprovadas", "Termos proibidos e substituições", "Prévia", "Estrutura", "Nome (obrigatório) + Característica técnica"]) expect(t, s).toContain(s);
    expect(html).toContain('aria-label="Subir Marca"');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('value="Caixa"');
  });
  it("B. Atributos: lista + outro, onde (com o campo) e quando aplicável (com a condição)", () => {
    const valor = { aspecto: "ATRIBUTOS", atributos: [{ atributo: "PRINCIPIO_ATIVO", onde: "AMBOS", campo: "Princípio", aplicabilidade: "QUANDO_APLICAVEL", condicao: "defensivos" }] };
    const t = texto(montar(<BlocoAtributos valor={valor} aoMudar={nada} />));
    for (const s of ["Atributos exigidos", "Princípio ativo", "Onde deve constar", "Campo próprio", "Exigência", "Quando se aplica"]) expect(t, s).toContain(s);
  });
  it("C. Unidades: critério, unidades permitidas, conversões e o aviso fixo", () => {
    const valor = conteudoParaTela("UNIDADES", { criterioEstoque: "DEFINIDA", unidadeDefinida: "KG", unidadesCompra: ["SC"], conversoes: [{ origem: "SC", destino: "KG", fator: 50, abrangencia: "GRUPO" }] });
    const html = montar(<BlocoUnidades valor={valor} aoMudar={nada} />);
    const t = texto(html);
    for (const s of ["Menor unidade prática (padrão)", "Unidade definida", "Unidades de compra permitidas", "Unidades de saída permitidas", "Conversões", "Conversão desconhecida vira pendência pedindo o fator"]) expect(t, s).toContain(s);
    expect(html).toContain('value="50"');
  });
  it("C. Unidades: fator inválido aparece marcado", () => {
    const valor = conteudoParaTela("UNIDADES", { conversoes: [{ origem: "SC", destino: "KG", fator: "abc", abrangencia: "GRUPO" }] });
    expect(texto(montar(<BlocoUnidades valor={valor} aoMudar={nada} />))).toContain("Número inválido");
  });
  it("D. Limites: linhas, não confirmado, limite efetivo = menor confirmado e alerta do ERP acima do leiaute", () => {
    const valor = conteudoParaTela("LIMITES", { linhas: [
      { destino: "SPED EFD ICMS/IPI", campo: "0200 DESCR_ITEM", campoItem: "descricao", limite: 100, origem: "LEIAUTE_OFICIAL", referencia: "Guia Prático", confirmado: true, tratamento: "SUGERIR_ABREVIACAO", preservar: ["NOME"] },
      { destino: "SAP Business One", campo: "OITM.ItemName", campoItem: "descricao", limite: 200, origem: "ERP", referencia: null, confirmado: true, tratamento: "SOLICITAR_REVISAO", preservar: [] },
      { destino: "Cliente", campo: "Descrição", campoItem: "descricao", limite: null, origem: "CLIENTE", referencia: null, confirmado: false, tratamento: "SOLICITAR_REVISAO", preservar: [] },
    ] });
    const t = texto(montar(<BlocoLimites valor={valor} aoMudar={nada} />));
    for (const s of ["Leiaute oficial", "Não confirmado", "Limite efetivo", "100 caracteres — menor confirmado (Leiaute oficial: SPED EFD ICMS/IPI)", "SAP Business One aceita 200 caracteres", "Tratamento do excesso", "Componentes a preservar"]) expect(t, s).toContain(s);
  });
  it("E. Fiscal: NCM com exceções, cClassTrib, cenários e textos fixos", () => {
    const t = texto(montar(<BlocoFiscal valor={conteudoPadrao("FISCAL")} aoMudar={nada} />));
    for (const s of ["Validar o NCM", "Exceções justificadas", "Validar o cClassTrib", "Entrada", "Saída", "Uso interno", "Classificação ausente vira pendência.", "Classificação ambígua vai para revisão fiscal."]) expect(t, s).toContain(s);
  });
  it("somente leitura: campos desabilitados e sem botões de alterar", () => {
    const html = montar(<BlocoNomes valor={conteudoPadrao("NOMES")} aoMudar={nada} desabilitado />);
    expect(html).not.toContain("Acrescentar linha");
    expect(html).not.toContain('aria-label="Subir');
  });
});

describe("Política (PDF) e Transformar em regra", () => {
  it("Versões: Política (PDF) para a base de agora e para cada versão liberada", () => {
    const html = montar(<Versoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.versoes("p1"), [{ id: "v1", numero: 1, rotulo: "Entrega 1", usuario: "ana", createdAt: "2026-11-20T12:00:00Z", resumo: { itens: 10, casosAbertos: 0 } }]));
    expect(html).toContain('aria-label="Baixar a política (PDF)"');
    expect(html).toContain('aria-label="Baixar a política (PDF) da versão 1"');
  });
  it("detalhe do caso traz o botão Transformar em regra", () => {
    const caso = { id: "c1", camada: "NCM", situacao: "PROPOSTO", origem: "REGRA", itens: ["i1", "i2"], problema: "NCM inválido", evidencia: [], atual: {}, proposta: { ncm: "10059010" }, versao: 1 };
    expect(texto(montar(<CasoDetalhe projeto={projeto()} casoId="c1" />, (qc) => qc.setQueryData(chaves.caso("c1"), caso)))).toContain("Transformar em regra");
  });
  it("formulário pré-preenchido: aspecto, nome, grupos do caso e destino (Biblioteca só para o administrador)", () => {
    const caso = { id: "c1", camada: "NCM", problema: "NCM inválido em defensivos", proposta: {} };
    const prep = (qc) => qc.setQueryData(chaves.gruposDoCaso("p1", "c1"), { total: 3, grupos: [{ grupo: "Defensivos", itens: 3 }] });
    papel.atual = "admin";
    let html = montar(<TransformarEmRegra projeto={projeto()} caso={caso} abertoInicial />, prep);
    let t = texto(html);
    expect(html).toMatch(/<option value="FISCAL" selected="">Classificação fiscal<\/option>/);
    expect(html).toContain('value="NCM inválido em defensivos"');
    expect(t).toContain("Defensivos");
    expect(t).toContain("Neste projeto (Diretrizes do cliente)");
    expect(t).toContain("A regra nasce em rascunho");
    expect(t).not.toContain("só o administrador");
    papel.atual = "user";
    html = montar(<TransformarEmRegra projeto={projeto()} caso={caso} abertoInicial />, prep);
    expect(texto(html)).toContain("só o administrador");
    papel.atual = "admin";
  });
  it("depois de criar: regra do projeto abre nas Diretrizes (prévia antes de aplicar); da biblioteca cria também a regra em rascunho no projeto", () => {
    const t = texto(montar(<ResultadoTransformacao resultado={{ id: "r9", codigo: "F02" }} destino="PROJETO" />));
    expect(t).toContain("Regra F02 criada em rascunho");
    expect(t).toContain("Abrir nas Diretrizes");
    // As Diretrizes da Fase 1 ficam em 1.1 Preparar e diretrizes; a regra fiscal abre nas da Fase 2, em 2.1 Premissas e diretrizes.
    expect(montar(<ResultadoTransformacao resultado={{ id: "r9", codigo: "N02" }} destino="PROJETO" />)).toContain('href="/?fase=1&amp;aba=preparar&amp;regra=r9"');
    expect(montar(<ResultadoTransformacao resultado={{ id: "r8", codigo: "F02", aspecto: "FISCAL" }} destino="PROJETO" />)).toContain('href="/?fase=2&amp;aba=premissas&amp;regra=r8"');
    const bib = texto(montar(<ResultadoTransformacao resultado={{ id: "r10", codigo: "F03" }} destino="BIBLIOTECA" />));
    expect(bib).toContain("Regra criada na biblioteca e F03 em rascunho neste projeto");
    expect(bib).toContain("sem códigos de item deste cliente");
    expect(bib).toContain("Abrir nas Diretrizes");
    expect(bib).not.toContain("Nada mudou neste projeto");
  });
});

describe("Biblioteca de diretrizes (Administração)", () => {
  const LISTA = [{ id: "b1", aspecto: "LIMITES", nome: "Limites oficiais", indicadaPara: "Todos", versao: 2, ativa: true, conteudo: conteudoPadrao("LIMITES") }, { id: "b2", aspecto: "NOMES", nome: "Nomes de peças", indicadaPara: null, versao: 1, ativa: false }];
  it("tabela padrão com aspecto, nome, indicada para, versão e ativa; admin cria", () => {
    papel.atual = "admin";
    const t = texto(montar(<BibliotecaDiretrizesPagina />, (qc) => qc.setQueryData(chaves.biblioteca(), LISTA), "/admin/diretrizes"));
    for (const s of ["Biblioteca de diretrizes", "Regras-modelo", "Procedimentos", "Modelos", "Limites de caracteres", "Limites oficiais", "Nomes de peças", "Indicada para", "Versão", "Ativa", "Nova regra-modelo"]) expect(t, s).toContain(s);
  });
  it("quem não é administrador só consulta", () => {
    papel.atual = "user";
    const t = texto(montar(<BibliotecaDiretrizesPagina />, (qc) => qc.setQueryData(chaves.biblioteca(), LISTA), "/admin/diretrizes"));
    expect(t).not.toContain("Nova regra-modelo");
    const f = texto(montar(<FichaRegraBiblioteca regra={LISTA[0]} admin={false} aoSalvar={() => {}} />));
    expect(f).toContain("Somente administradores alteram a biblioteca.");
    expect(f).not.toContain("Salvar nova versão");
    papel.atual = "admin";
  });
  it("ficha usa os mesmos blocos do projeto; admin salva nova versão", () => {
    const t = texto(montar(<FichaRegraBiblioteca regra={{ ...LISTA[0], conteudo: { aspecto: "LIMITES", linhas: [{ destino: "NF-e", campo: "xProd", campoItem: "descricao", limite: 120, origem: "LEIAUTE_OFICIAL", confirmado: true, tratamento: "SUGERIR_ABREVIACAO", preservar: ["NOME"] }] } }} admin aoSalvar={() => {}} />));
    for (const s of ["Indicada para (tipo de grupo)", "Ativa (aparece para os projetos)", "Limite efetivo", "120 caracteres", "Salvar nova versão"]) expect(t, s).toContain(s);
  });
  it("procedimento com fluxo (passos e decisão) e modelo com as regras e grupos", () => {
    const p = { id: "p1", titulo: "Retirada e uso de materiais", objetivo: "Comprovar o uso na atividade.", fluxo: [{ tipo: "passo", texto: "Pedido", responsavel: "Requisitante" }, { tipo: "decisao", pergunta: "Autorizado?", sim: "Retirar", nao: "Devolver" }], regras: ["Registrar o centro de custo"], evidencias: ["Requisição assinada"], fundamento: "LC 214/2025, art. 57, § 3º" };
    const t = texto(montar(<ProcedimentoLeitura procedimento={p} />));
    for (const s of ["Retirada e uso de materiais", "Pedido", "(Requisitante)", "Decisão: Autorizado?", "Sim: Retirar · Não: Devolver", "Regras práticas", "Evidências a guardar", "Fundamento: LC 214/2025"]) expect(t, s).toContain(s);
    const m = texto(montar(<ModeloLeitura modelo={{ id: "m1", nome: "Modelo FAL — Revenda de insumos agro", descricao: "Base Crestani", atribuicoes: [{ aspecto: "LIMITES", bibliotecaId: "b1", grupos: "TODOS" }, { aspecto: "NOMES", bibliotecaId: "zz", grupos: ["Peças"] }] }} regras={LISTA} />));
    for (const s of ["Modelo FAL — Revenda de insumos agro", "Limites oficiais", "Todos os grupos", "Regra não encontrada na biblioteca", "Peças"]) expect(m, s).toContain(s);
  });
});

describe("padrão de cores dos formulários (quadros, seções, rótulos e campos)", () => {
  const nada = () => {};
  const comuns = { faixaQuadro: "bg-primary/10", corpoQuadro: "bg-muted p-3", bordaQuadro: "border-foreground/50", campo: "border border-input bg-background", rotulo: "font-medium text-foreground/80", faixaSecao: "border-b-2 border-primary bg-muted" };
  const quadros = (html) => html.match(/<li[^>]*class="border border-foreground\/50 bg-card shadow-sm[^"]*"/g) || [];
  it("Limites: cada Limite N é um quadro com borda nítida, faixa de cabeçalho com título e selos, corpo com fundo próprio e espaço entre os quadros", () => {
    const valor = conteudoParaTela("LIMITES", { linhas: [
      { destino: "SPED", campo: "0200", campoItem: "descricao", limite: 100, origem: "LEIAUTE_OFICIAL", confirmado: true, tratamento: "SUGERIR_ABREVIACAO", preservar: [] },
      { destino: "ERP", campo: "Nome", campoItem: "descricao", limite: null, origem: "ERP", confirmado: false, tratamento: "SOLICITAR_REVISAO", preservar: [] },
    ] });
    const html = montar(<BlocoLimites valor={valor} aoMudar={nada} />);
    expect(quadros(html)).toHaveLength(2);
    expect(html).toContain('class="space-y-3" aria-label="Linhas de limite"');
    expect(html).toMatch(/bg-primary\/10[^"]*"><span id="[^"]+" class="text-sm font-semibold text-foreground">Limite 1<\/span>/);
    expect(html).toMatch(/Limite 2<\/span><span[^>]*>ERP<\/span><span[^>]*>Não confirmado/);
    expect(html).toContain(comuns.corpoQuadro);
    expect(html).toContain('aria-label="Remover o limite 1"');
    // campos em fundo de campo e borda forte; rótulos legíveis; nada do cinza pálido antigo nos campos
    expect(html).toContain(comuns.campo);
    expect(html).toContain(comuns.rotulo);
    expect(html).not.toMatch(/<(input|select|textarea)[^>]*border-border/);
  });
  it("Atributos, Nomes, Unidades e Fiscal usam o mesmo quadro (atributo como quadro; seções com faixa)", () => {
    const atr = montar(<BlocoAtributos valor={{ atributos: [{ atributo: "fabricante", onde: "DESCRICAO", aplicabilidade: "OBRIGATORIO" }] }} aoMudar={nada} />);
    expect(quadros(atr)).toHaveLength(1);
    for (const html of [atr, montar(<BlocoNomes valor={conteudoPadrao("NOMES")} aoMudar={nada} />), montar(<BlocoUnidades valor={conteudoPadrao("UNIDADES")} aoMudar={nada} />), montar(<BlocoFiscal valor={conteudoPadrao("FISCAL")} aoMudar={nada} />)]) {
      expect(html).toContain(comuns.faixaQuadro);
      expect(html).toContain(comuns.bordaQuadro);
      expect(html).not.toContain("<legend");
    }
  });
  it("formulário da regra: Identificação, o bloco do aspecto e Ações com faixa de título que marca o início e o fim", () => {
    const html = montar(<FormularioRegra projeto={projeto()} dados={DADOS} regraId="r2" aoFechar={() => {}} />, comDiretrizes());
    const faixas = html.match(new RegExp(`${comuns.faixaSecao}[^"]*"><h3 id="[^"]+" class="text-sm font-semibold text-foreground">([^<]+)</h3>`, "g")) || [];
    const titulos = faixas.map((f) => f.replace(/.*>([^<]+)<\/h3>$/, "$1"));
    expect(titulos).toHaveLength(3); // Identificação, o bloco do aspecto e Ações
    expect(titulos[0]).toBe("Identificação");
    expect(titulos[2]).toBe("Ações");
    expect(html).toMatch(/<section aria-labelledby="[^"]+" class="border border-foreground\/50 bg-card/);
    expect(html).toContain(comuns.campo);
  });
  it("lista de regras e detalhe do caso no mesmo padrão", () => {
    const lista = montar(<Diretrizes projeto={projeto()} />, comDiretrizes());
    expect(lista).toMatch(/<header class="[^"]*border-foreground\/50 bg-primary\/10/);
    const caso = { id: "c1", camada: "NCM", situacao: "PROPOSTO", origem: "REGRA", itens: ["i1", "i2"], problema: "NCM inválido", evidencia: [{ rotulo: "NCM", valor: "1005901" }], atual: { ncm: "1005901" }, proposta: { ncm: "10059010" }, versao: 1 };
    const det = montar(<CasoDetalhe projeto={projeto()} casoId="c1" />, (qc) => qc.setQueryData(chaves.caso("c1"), caso));
    for (const t of ["Evidência", "Dados e proposta", "Justificativa e fundamento", "Decisão"]) expect(det, t).toMatch(new RegExp(`class="[^"]*(bg-primary/10)[^"]*"[^>]*>(<[^>]+>)?${t}<`));
    expect(det).toContain(comuns.campo);
  });
});

describe("Diretrizes compactas (campos lado a lado, rótulos de mesma altura, explicações no botão i)", () => {
  const nada = () => {};
  const ROT = "flex h-5 items-center gap-1 whitespace-nowrap text-xs font-medium";
  it("Limites: até 4 campos por linha, rótulos de mesma altura ligados ao campo, explicação da ordem de confiança atrás do i", () => {
    const valor = conteudoParaTela("LIMITES", { linhas: [{ destino: "SPED", campo: "0200", campoItem: "descricao", limite: 100, origem: "LEIAUTE_OFICIAL", confirmado: true, tratamento: "SUGERIR_ABREVIACAO", preservar: [] }] });
    const html = montar(<BlocoLimites valor={valor} aoMudar={nada} />);
    expect(html).toContain("lg:grid-cols-4");
    expect(html).toContain(ROT);
    // Cada rótulo aponta para o seu campo (label for = id do campo).
    const fors = [...html.matchAll(/<label for="([^"]+)"/g)].map((m) => m[1]);
    expect(fors.length).toBeGreaterThanOrEqual(8);
    for (const id of fors) expect(html).toContain(`id="${id}"`);
    // A explicação fica atrás do "i" (fechado por padrão).
    expect(html).toContain('aria-label="Sobre: Como o limite é escolhido"');
    expect(html).toContain('aria-expanded="false"');
    expect(texto(html)).not.toContain("Ordem de confiança");
    expect(texto(html)).toContain("Confirmado na fonte");
  });
  it("seções dos blocos: a dica fica no i da faixa (Nomes, Unidades); campos curtos lado a lado", () => {
    const nomes = montar(<BlocoNomes valor={conteudoPadrao("NOMES")} aoMudar={nada} />);
    expect(nomes).toContain('aria-label="Sobre: Componentes e ordem"');
    expect(texto(nomes)).not.toContain("Arraste ou use as setas");
    expect(nomes).toContain("lg:grid-cols-4");
    const un = montar(<BlocoUnidades valor={conteudoPadrao("UNIDADES")} aoMudar={nada} />);
    expect(un).toContain('aria-label="Sobre: Conversões"');
    expect(texto(un)).not.toContain("Fator: quantas unidades");
    expect(un).toContain("lg:grid-cols-3");
  });
  it("lista de regras e formulário: o que cada aspecto cobre fica no i; Identificação em até 4 colunas", () => {
    const lista = montar(<Diretrizes projeto={projeto()} aspectos={["NOMES"]} />, comDiretrizes());
    expect(lista).toContain('aria-label="Sobre: Padrão de nomes"');
    expect(lista).toContain('aria-label="Sobre: Grupos sem regra"');
    expect(texto(lista)).not.toContain("Grupo sem regra entra na política como pendência");
    const form = montar(<FormularioRegra projeto={projeto()} dados={DADOS} inicial={{ aspecto: "NOMES" }} aoFechar={() => {}} />, comDiretrizes());
    expect(form).toContain("lg:grid-cols-4");
    expect(form).toContain('aria-label="Sobre: Aspecto"');
    expect(form).toContain('aria-label="Sobre: Partir de uma regra da biblioteca (opcional)"');
    expect(texto(form)).not.toContain("O conteúdo da biblioteca é carregado abaixo");
  });
});
