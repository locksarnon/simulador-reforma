import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "a@b.c" } }) }));

import { chaves } from "./api";
import Abas from "./Abas";
import CasoDetalhe, { ParecerIa } from "./CasoDetalhe";
import Casos from "./Casos";
import Cobertura from "./Cobertura";
import Configuracao from "./Configuracao";
import Impacto from "./Impacto";
import Importacao from "./Importacao";
import TabelaUnica from "./TabelaUnica";
import Versoes from "./Versoes";
import VisaoGeral from "./VisaoGeral";
import SaneamentoEstoquesPagina from "@/pages/saneamento-estoques/SaneamentoEstoquesPagina";

const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const novoCliente = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
const ERRO = Object.assign(new Error("Servidor fora do ar."), { status: 500 });
const falhar = (qc, chave) => qc.getQueryCache().build(qc, { queryKey: chave }).setState({ status: "error", error: ERRO, fetchStatus: "idle", data: undefined, errorUpdateCount: 1, dataUpdateCount: 0 });
const pagina = (itens, extra = {}) => ({ pages: [{ itens, proximo: null, total: itens.length, ...extra }], pageParams: [undefined] });
const montar = (ui, preparar) => {
  const qc = novoCliente();
  preparar?.(qc);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><StaticRouter location="/">{ui}</StaticRouter></QueryClientProvider>);
};

const atividade = (o = {}) => ({ id: "a1", codigo: "4623-1/99", descricao: "Comércio atacadista de animais vivos", origem: "CNPJ", mantida: true, ...o });
const projeto = (o = {}) => ({ id: "p1", versao: 3, erp: "SAP", erp_versao: "10", responsavel: "Ana", estabelecimentos: [], data_base: "2026-12-31T00:00:00.000Z", parametros: { corteMovimentacao: null }, modulos: { conciliacao: false, blocosKG: false, arquivoErp: false }, atividades: [atividade()], atividadesConfirmadas: false, cnpjDesatualizado: false, ...o });
const item = (o = {}) => ({ id: "i1", codigo: "000123", estabelecimento: "", descricao: "PARAFUSO SEXTAVADO", grupo: "Ferragens", finalidade: "REVENDA", conjunto_chave: "73181500|REVENDA", ativo: true, versao: 1, celulas: [{ camada: "QUALIDADE", situacao: "PROPOSTO", revisar: true, caso_id: "c1" }, { camada: "NCM", situacao: "PENDENTE", revisar: false }], ...o });
const filtroInicial = { busca: "", camada: "", situacao: "", grupo: "", revisar: false, ordem: "codigo" };

describe("Configuração", () => {
  it("antes da confirmação: lista as atividades, o botão e os módulos 'a desenvolver' desligados", () => {
    const t = texto(montar(<Configuracao projeto={projeto()} recarregar={() => {}} />));
    expect(t).toContain("Confirmo as atividades");
    expect(t).toContain("Comércio atacadista de animais vivos");
    expect(t).toContain("Conciliação de estoque");
    expect(t).toContain("Blocos K e G do SPED");
    expect(t).toContain("Arquivo para o ERP");
    expect((t.match(/a desenvolver/g) || []).length).toBe(3);
    expect(t).toContain("Desligado");
    expect(t).not.toContain("Reabrir para alterar");
  });
  it("sem atividade mantida o botão de confirmar fica desabilitado", () => {
    const html = montar(<Configuracao projeto={projeto({ atividades: [atividade({ mantida: false })] })} recarregar={() => {}} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^]*?Confirmo as atividades/);
    expect(texto(html)).toContain("Mantenha ou acrescente pelo menos uma atividade");
  });
  it("confirmada: mostra quem e quando, permite reabrir e não deixa alterar", () => {
    const t = texto(montar(<Configuracao projeto={projeto({ atividadesConfirmadas: true, atividades_confirmadas_por: "ana@x.com", atividades_confirmadas_em: "2026-11-20T12:00:00Z" })} recarregar={() => {}} />));
    expect(t).toContain("Atividades confirmadas");
    expect(t).toContain("ana@x.com");
    expect(t).toContain("Reabrir para alterar");
    expect(t).not.toContain("Acrescentar");
  });
  it("CNPJ desatualizado pede para revisar as atividades", () => {
    expect(texto(montar(<Configuracao projeto={projeto({ cnpjDesatualizado: true })} recarregar={() => {}} />))).toContain("Revisar atividades");
  });
});

describe("Importação", () => {
  it("bloqueada pela trava: diz o que fazer e não mostra o envio de arquivo", () => {
    const t = texto(montar(<Importacao projeto={projeto()} podeImportar />));
    expect(t).toContain("Confirme as atividades do cliente para continuar");
    expect(t).not.toContain("Ler e mostrar a prévia");
  });
  const liberada = projeto({ atividadesConfirmadas: true });
  it("carregando, vazio e erro do histórico", () => {
    expect(texto(montar(<Importacao projeto={liberada} />))).toContain("Carregando");
    expect(texto(montar(<Importacao projeto={liberada} />, (qc) => qc.setQueryData(chaves.importacoes("p1"), [])))).toContain("Nenhuma importação feita ainda");
    const e = texto(montar(<Importacao projeto={liberada} />, (qc) => falhar(qc, chaves.importacoes("p1"))));
    expect(e).toContain("Não foi possível carregar as importações");
    expect(e).toContain("Tentar de novo");
  });
  it("mostra o envio do arquivo e avisa quando falta a função de importar", () => {
    const t = texto(montar(<Importacao projeto={liberada} podeImportar={false} />));
    expect(t).toContain("Ler e mostrar a prévia");
    expect(t).toContain("importar");
  });
  it("lista as importações anteriores", () => {
    const t = texto(montar(<Importacao projeto={liberada} />, (qc) => qc.setQueryData(chaves.importacoes("p1"), [{ id: "1", createdAt: "2026-11-20T12:00:00Z", arquivo: "itens.xlsx", usuario: "ana@x.com", aceitas: 100, rejeitadas: 2, pendentes: 1 }])));
    expect(t).toContain("itens.xlsx");
  });
});

describe("Tabela única", () => {
  const liberada = projeto({ atividadesConfirmadas: true });
  it("carregando", () => { expect(texto(montar(<TabelaUnica projeto={liberada} />))).toContain("Carregando os produtos"); });
  it("erro, com tentar de novo", () => {
    const t = texto(montar(<TabelaUnica projeto={liberada} />, (qc) => falhar(qc, chaves.itens("p1", filtroInicial))));
    expect(t).toContain("Não foi possível carregar os produtos");
    expect(t).toContain("Tentar de novo");
  });
  it("vazio: manda importar", () => {
    const t = texto(montar(<TabelaUnica projeto={liberada} />, (qc) => qc.setQueryData(chaves.itens("p1", filtroInicial), pagina([]))));
    expect(t).toContain("Nenhum produto importado");
    expect(t).toContain("Importe o cadastro");
  });
  it("vazio com atividades não confirmadas: mostra a trava", () => {
    expect(texto(montar(<TabelaUnica projeto={projeto()} />, (qc) => qc.setQueryData(chaves.itens("p1", filtroInicial), pagina([]))))).toContain("Confirme as atividades do cliente para continuar");
  });
  it("com dados: colunas fixas, camadas, situações em texto e a marca revisar", () => {
    const html = montar(<TabelaUnica projeto={liberada} />, (qc) => qc.setQueryData(chaves.itens("p1", filtroInicial), pagina([item(), item({ id: "i2", codigo: "000124", celulas: [{ camada: "NCM", situacao: "AGUARDANDO_INFORMACAO", revisar: false }] })], { total: 30000 })));
    const t = texto(html);
    for (const c of ["Identificação", "Qualidade", "Duplicidades", "Grupos e finalidade", "Nomes e unidades", "NCM", "Tratamento tributário", "Impacto nas obrigações"]) expect(t).toContain(c);
    expect(t).not.toContain(" Estoque ");
    expect(t).toContain("000123");
    expect(t).toContain("Proposto");
    expect(t).toContain("revisar");
    expect(t).toContain("Aguardando");
    expect(t).toContain("73181500 · Revenda");
    expect(t).toContain("30.000 produto(s)");
    expect(html).toContain("sticky");
    expect(html).toContain('aria-rowcount="30002"');
  });
  it("30 mil linhas carregadas: desenha só a janela", () => {
    const itens = Array.from({ length: 30000 }, (_, n) => item({ id: `i${n}`, codigo: String(n).padStart(6, "0") }));
    const html = montar(<TabelaUnica projeto={liberada} />, (qc) => qc.setQueryData(chaves.itens("p1", filtroInicial), pagina(itens)));
    expect((html.match(/role="row"/g) || []).length).toBeLessThan(60);
    expect(html).toContain(`height:${30000 * 38}px`);
  });
  it("com o módulo de conciliação ligado, a camada Estoque aparece", () => {
    const html = montar(<TabelaUnica projeto={projeto({ atividadesConfirmadas: true, modulos: { conciliacao: true } })} />, (qc) => qc.setQueryData(chaves.itens("p1", filtroInicial), pagina([item()])));
    expect(texto(html)).toContain("Estoque");
  });
  it("o filtro vindo da visão geral (grupo) é aplicado", () => {
    const t = texto(montar(<TabelaUnica projeto={liberada} recorte={{ grupo: "Ferragens" }} />, (qc) => qc.setQueryData(chaves.itens("p1", { ...filtroInicial, grupo: "Ferragens" }), pagina([item()]))));
    expect(t).toContain("com estes filtros");
  });
});

describe("Visão geral", () => {
  const visao = { camadas: ["QUALIDADE", "NCM"], grupos: [{ grupo: "Ferragens", itens: 12, camadas: { QUALIDADE: { PENDENTE: 2, PROPOSTO: 3, SEM_PROBLEMA: 7, APROVADO: 0, AGUARDANDO_INFORMACAO: 0, revisar: 1 }, NCM: { PENDENTE: 0, SEM_PROBLEMA: 0, PROPOSTO: 0, APROVADO: 12, AGUARDANDO_INFORMACAO: 0, revisar: 0 } } }] };
  it("carregando, erro e vazio", () => {
    expect(texto(montar(<VisaoGeral projeto={projeto()} />))).toContain("Carregando");
    expect(texto(montar(<VisaoGeral projeto={projeto()} />, (qc) => falhar(qc, chaves.visao("p1"))))).toContain("Não foi possível carregar a visão geral");
    expect(texto(montar(<VisaoGeral projeto={projeto()} />, (qc) => qc.setQueryData(chaves.visao("p1"), { camadas: [], grupos: [] })))).toContain("Importe o cadastro de itens");
  });
  it("matriz grupo × camada com situação agregada e contagens", () => {
    const t = texto(montar(<VisaoGeral projeto={projeto()} aoAbrirCasos={() => {}} aoAbrirTabela={() => {}} />, (qc) => qc.setQueryData(chaves.visao("p1"), visao)));
    expect(t).toContain("Ferragens");
    expect(t).toContain("Pendente");
    expect(t).toContain("2 pend. · 3 prop. · 7 s/ prob.");
    expect(t).toContain("Aprovado");
    expect(t).toContain("revisar");
  });
});

describe("Casos", () => {
  const filtro = { camada: "", situacao: "ABERTOS", tipo: "", origem: "", grupo: "" };
  const caso = { id: "c1", camada: "NCM", tipo: "NCM_INVALIDO", itens: ["i1"], qtdItens: 1, problema: "NCM com 7 dígitos", situacao: "PROPOSTO", origem: "REGRA", versao: 1, parecer_ia: null };
  const chaveLista = chaves.casos("p1", filtro);
  const seed = (casos) => (qc) => qc.setQueryData(chaveLista, { pages: [{ casos, proximo: null }], pageParams: [undefined] });
  it("carregando, erro e vazio", () => {
    expect(texto(montar(<Casos projeto={projeto()} />))).toContain("Carregando os casos");
    expect(texto(montar(<Casos projeto={projeto()} />, (qc) => falhar(qc, chaveLista)))).toContain("Não foi possível carregar os casos");
    expect(texto(montar(<Casos projeto={projeto()} />, seed([])))).toContain("Nenhum caso ainda");
  });
  it("lista os casos e oferece o lote", () => {
    const t = texto(montar(<Casos projeto={projeto()} />, seed([caso])));
    expect(t).toContain("NCM com 7 dígitos");
    expect(t).toContain("Aprovar em lote");
    expect(t).toContain("Em aberto (plano de ajustes)");
    expect(t).toContain("Escolha um caso");
  });
});

describe("Detalhe do caso", () => {
  const caso = { id: "c1", camada: "TRIBUTARIO", tipo: "CONJUNTO", itens: ["i1", "i2"], problema: "Enquadramento do conjunto 73181500 × Revenda", evidencia: [{ rotulo: "Conjunto", valor: "73181500 × Revenda" }], atual: { cClassTrib: null }, proposta: { cClassTrib: "000001", cst: "000", enquadramentoLegal: "Alíquota padrão", artigo: "art. 11", origem: "HERDADO" }, justificativa: "Regra geral", fundamento: "LC 214/2025", impactos: ["Conferir C170"], origem: "REGRA", situacao: "PROPOSTO", versao: 2, motivo: null, parecer_ia: null };
  it("carregando e erro", () => {
    expect(texto(montar(<CasoDetalhe projeto={projeto()} casoId="c1" />))).toContain("Carregando");
    expect(texto(montar(<CasoDetalhe projeto={projeto()} casoId="c1" />, (qc) => falhar(qc, chaves.caso("c1"))))).toContain("Não foi possível carregar o caso");
  });
  it("mostra problema, evidência, proposta editável, etiqueta herdado e as ações", () => {
    const t = texto(montar(<CasoDetalhe projeto={projeto()} casoId="c1" aoIrAoProximo={() => {}} />, (qc) => qc.setQueryData(chaves.caso("c1"), caso)));
    expect(t).toContain("Enquadramento do conjunto 73181500 × Revenda");
    expect(t).toContain("Evidência");
    expect(t).toContain("herdado do conjunto");
    expect(t).toContain("Alíquota padrão");
    for (const b of ["Aprovar", "Salvar rascunho", "Salvar e ir ao próximo pendente", "Rejeitar", "Pedir informação", "Pedir parecer da IA"]) expect(t).toContain(b);
    expect(t).not.toContain("Desfazer aprovação");
  });
  it("caso aprovado oferece desfazer, não aprovar", () => {
    const t = texto(montar(<CasoDetalhe projeto={projeto()} casoId="c1" />, (qc) => qc.setQueryData(chaves.caso("c1"), { ...caso, situacao: "APROVADO" })));
    expect(t).toContain("Desfazer aprovação");
    expect(t).not.toContain("Salvar rascunho");
  });
  it("parecer da IA rotulado, com prática de mercado separada da norma", () => {
    const t = texto(renderToStaticMarkup(<ParecerIa parecer={{ recomendacao: "Aprovar a classe 000001", confianca: "media", aFavor: ["a"], contra: ["c"], oQueConfirmar: ["x"], fontes: ["LC 214/2025"], praticaDeMercado: "É comum tratar assim" }} />));
    expect(t).toContain("Confiança média");
    expect(t).toContain("Prática de mercado, não é norma");
    expect(t).toContain("quem decide é o consultor");
    const com = texto(montar(<CasoDetalhe projeto={projeto()} casoId="c1" />, (qc) => qc.setQueryData(chaves.caso("c1"), { ...caso, parecer_ia: { recomendacao: "Aprovar", confianca: "alta", aFavor: [], contra: [], oQueConfirmar: [], fontes: [], praticaDeMercado: null } })));
    expect(com).toContain("Pedir novo parecer da IA");
  });
});

describe("Impacto nas obrigações", () => {
  it("carregando, erro e vazio", () => {
    expect(texto(montar(<Impacto projeto={projeto()} />))).toContain("Carregando");
    expect(texto(montar(<Impacto projeto={projeto()} />, (qc) => falhar(qc, chaves.impactos("p1"))))).toContain("Não foi possível carregar o impacto");
    expect(texto(montar(<Impacto projeto={projeto()} />, (qc) => { qc.setQueryData(chaves.impactos("p1"), []); }))).toContain("Nenhum impacto registrado ainda");
  });
  it("com linhas: tipos de ajuste e colunas do checklist", () => {
    const linha = { id: "1", tipo_ajuste: "ESCRITURACAO_ENTREGUE", obrigacao: "EFD ICMS/IPI", competencia: "2026-01", versao_leiaute: "019", registro: "0200", campo: "COD_NCM", valor_original: "1234", valor_proposto: "12345678", motivo: "NCM corrigido", evidencia: "Tabela TIPI", inicio: "2027-01-01", avaliar_anteriores: true, responsavel: "Ana" };
    const t = texto(montar(<Impacto projeto={projeto()} />, (qc) => qc.setQueryData(chaves.impactos("p1"), [linha])));
    expect(t).toContain("Impacto em escrituração já entregue");
    expect(t).toContain("EFD ICMS/IPI");
    expect(t).toContain("0200");
    expect(t).toContain("Avaliar períodos anteriores");
  });
});

describe("Versões", () => {
  it("carregando, erro e vazio", () => {
    expect(texto(montar(<Versoes projeto={projeto()} />))).toContain("Carregando");
    expect(texto(montar(<Versoes projeto={projeto()} />, (qc) => falhar(qc, chaves.versoes("p1"))))).toContain("Não foi possível carregar as versões");
    const t = texto(montar(<Versoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.versoes("p1"), [])));
    expect(t).toContain("Nenhuma versão liberada");
    expect(t).toContain("Para revisão");
    expect(t).toContain("Não é entrega");
  });
  it("lista versões liberadas, com Excel e relatório de cada uma", () => {
    const t = texto(montar(<Versoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.versoes("p1"), [{ id: "v1", numero: 1, rotulo: "Entrega 1", usuario: "ana@x.com", createdAt: "2026-11-20T12:00:00Z", resumo: { itens: 500, casosAbertos: 4 } }])));
    expect(t).toContain("Entrega 1");
    expect(t).toContain("Liberada");
    expect(t).toContain("Relatório PDF");
    expect(t).toContain("Marque A (antes) e B (depois)");
  });
});

describe("Cobertura, abas e página", () => {
  it("cobertura: carregando e com dados", () => {
    expect(texto(montar(<Cobertura projeto={projeto()} />))).toContain("Carregando a cobertura");
    const html = montar(<Cobertura projeto={projeto({ atividadesConfirmadas: true })} />, (qc) => {
      qc.setQueryData(chaves.visao("p1"), { camadas: [], grupos: [{ grupo: "A", itens: 1, camadas: { QUALIDADE: { PROPOSTO: 1 }, TRIBUTARIO: { AGUARDANDO_INFORMACAO: 1 } } }] });
      qc.setQueryData(chaves.camadas(), ["QUALIDADE", "TRIBUTARIO"]);
    });
    const t = texto(html);
    expect(t).toContain("Com dados");
    expect(t).toContain("Depende de informação");
    expect(t).toContain("Análise ainda não disponível");
  });
  it("cobertura: sem confirmação as análises ficam bloqueadas", () => {
    const html = montar(<Cobertura projeto={projeto()} />, (qc) => { qc.setQueryData(chaves.visao("p1"), { camadas: [], grupos: [] }); qc.setQueryData(chaves.camadas(), ["QUALIDADE"]); });
    expect(texto(html)).toContain("as análises ficam bloqueadas");
    expect(html).toMatch(/<button[^>]*disabled/);
  });
  it("as sete abas, com a atual marcada", () => {
    const html = montar(<Abas atual="casos" aoMudar={() => {}} />);
    expect(texto(html)).toContain("Configuração Importação Tabela Visão geral Casos Impacto nas obrigações Versões");
    expect(html).toContain('aria-selected="true"');
    expect((html.match(/role="tab"/g) || []).length).toBe(7);
  });
  const rota = (qc) => renderToStaticMarkup(
    <QueryClientProvider client={qc}><StaticRouter location="/diagnostico/projetos/d1/saneamento"><Routes><Route path="/diagnostico/projetos/:id/saneamento" element={<SaneamentoEstoquesPagina />} /></Routes></StaticRouter></QueryClientProvider>,
  );
  it("a página: carregando, erro, projeto ainda não aberto e aberto", () => {
    expect(texto(rota(novoCliente()))).toContain("Abrindo o projeto");
    const e = novoCliente(); falhar(e, chaves.projeto("d1"));
    expect(texto(rota(e))).toContain("Não foi possível abrir o projeto de saneamento");
    const nao = novoCliente();
    nao.getQueryCache().build(nao, { queryKey: chaves.projeto("d1") }).setState({ status: "error", error: Object.assign(new Error("Este projeto ainda não foi aberto."), { status: 404 }), fetchStatus: "idle", data: undefined, errorUpdateCount: 1 });
    expect(texto(rota(nao))).toContain("Abrir o saneamento deste projeto");
    const ok = novoCliente(); ok.setQueryData(chaves.projeto("d1"), projeto());
    const t = texto(rota(ok));
    expect(t).toContain("Saneamento de estoques e cadastro de produtos");
    expect(t).toContain("Cobertura das camadas");
    expect(t).toContain("Confirmo as atividades");
  });
});

describe("ajustes da revisão C nas telas", () => {
  it("a data-base de 31/12 não recua para 30/12", () => {
    expect(texto(montar(<Configuracao projeto={projeto()} recarregar={() => {}} />))).toContain("31/12/2026");
  });
  it("o mapa de atividades aparece na confirmação, e a ausência dele não quebra", () => {
    const com = texto(montar(<Configuracao projeto={projeto({ mapaAtividades: { mapeadas: [{ codigo: "4623-1/99", atividade: "COMERCIO", rotulo: "Comércio atacadista" }], semMapeamento: [] } })} recarregar={() => {}} />));
    expect(com).toContain("Vira: Comércio atacadista");
    expect(texto(montar(<Configuracao projeto={projeto()} recarregar={() => {}} />))).not.toContain("Efeito nas sugestões");
  });
  it("Para revisão só tem Excel; o PDF só em versão liberada", () => {
    const vazio = montar(<Versoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.versoes("p1"), []));
    expect(vazio).toContain("Baixar o Excel: para revisão");
    expect(vazio).not.toContain("relatório PDF: para revisão");
    const com = montar(<Versoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.versoes("p1"), [{ id: "v1", numero: 1, rotulo: "E1", usuario: "a", createdAt: "2026-11-20T12:00:00Z", resumo: {} }]));
    expect(com).toContain("relatório PDF: versão 1");
  });
  it("coluna tributária mostra o enquadramento do servidor, a etiqueta e Aguardando revisão", () => {
    const itens = [
      item({ id: "e1", codigo: "E1", celulas: [{ camada: "TRIBUTARIO", situacao: "APROVADO", revisar: false }], enquadramento: { enquadramentoLegal: "Alíquota padrão", artigo: "art. 11", cClassTrib: "000001", cst: "000", origem: "EXCECAO" } }),
      item({ id: "e2", codigo: "E2", celulas: [{ camada: "TRIBUTARIO", situacao: "PROPOSTO", revisar: true }], enquadramento: { enquadramentoLegal: "Outro", origem: "HERDADO" } }),
    ];
    const t = texto(montar(<TabelaUnica projeto={projeto({ atividadesConfirmadas: true })} />, (qc) => qc.setQueryData(chaves.itens("p1", filtroInicial), pagina(itens))));
    expect(t).toContain("Alíquota padrão · art. 11 · cClassTrib 000001 · CST 000");
    expect(t).toContain("exceção");
    expect(t).toContain("Aguardando revisão");
  });
  it("caso sem proposta: aprovar desligado com a razão; sem botão de IA fora de aberto", () => {
    const caso = { id: "c9", camada: "NCM", tipo: "X", itens: ["i1"], problema: "Alerta", evidencia: [], atual: {}, proposta: {}, justificativa: "", fundamento: null, impactos: [], origem: "REGRA", situacao: "PROPOSTO", versao: 1, parecer_ia: null };
    const html = montar(<CasoDetalhe projeto={projeto()} casoId="c9" />, (qc) => qc.setQueryData(chaves.caso("c9"), caso));
    expect(texto(html)).toContain("Não há proposta");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Aprovar<\/button>/);
    const ap = texto(montar(<CasoDetalhe projeto={projeto()} casoId="c9" />, (qc) => qc.setQueryData(chaves.caso("c9"), { ...caso, situacao: "APROVADO" })));
    expect(ap).not.toContain("Pedir parecer da IA");
  });
  it("mudança de unidade sem fator: destaca o campo fatorConversao e bloqueia aprovar", () => {
    const caso = { id: "c8", camada: "NOMES_UNIDADES", tipo: "UNIDADE_CONVERSAO", itens: ["i1"], problema: "Unidade", evidencia: [], atual: { unidade: "CX" }, proposta: { unidade: "KG", fatorSituacao: "INFORMAR" }, justificativa: "", fundamento: null, impactos: [], origem: "REGRA", situacao: "PROPOSTO", versao: 1, parecer_ia: null };
    const html = montar(<CasoDetalhe projeto={projeto()} casoId="c8" />, (qc) => qc.setQueryData(chaves.caso("c8"), caso));
    expect(html).toContain('aria-label="Proposta para Fator de conversão"');
    expect(texto(html)).toContain("Informe o fator de conversão");
  });
});
