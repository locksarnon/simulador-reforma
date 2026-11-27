/** Navegação e visão (avaliação com a base real): Cobertura compacta, Visão geral priorizada, Tabela, liberação de versão e Diretrizes em lote. */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "a@b.c" } }) }));

import { chaves } from "./api";
import Cobertura, { ordemDeAnalise, seloDaCamada, textoDasAnalises, textoDesatualizada } from "./Cobertura";
import TabelaUnica, { fixasDaTabela } from "./TabelaUnica";
import { textoDaLiberacao } from "./Versoes";
import VisaoGeral, { matrizOrdenada } from "./VisaoGeral";
import Diretrizes, { GruposSemRegra, PreviaVarias } from "./diretrizes/Diretrizes";
import { falhasDaReanalise, gruposSemRegraAgrupados, regrasParaAplicar, resumoPreviaVarias, separarParaAprovar } from "./diretrizes/logica";
import { conteudoPadrao } from "./diretrizes/logica";
import SaneamentoEstoquesPagina from "@/pages/saneamento-estoques/SaneamentoEstoquesPagina";

const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/\s+/g, " ");
const novoCliente = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
const montar = (ui, preparar, local = "/") => {
  const qc = novoCliente();
  preparar?.(qc);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><StaticRouter location={local}>{ui}</StaticRouter></QueryClientProvider>);
};
const projeto = (o = {}) => ({ id: "p1", empresa_id: "e1", versao: 3, estabelecimentos: [], data_base: "2026-12-31T00:00:00.000Z", parametros: {}, modulos: {}, atividades: [], atividadesConfirmadas: true, ...o });

describe("Cobertura numa linha", () => {
  const visao = { camadas: [], grupos: [{ grupo: "A", itens: 3, camadas: { QUALIDADE: { PROPOSTO: 2, SEM_PROBLEMA: 1 }, NCM: { SEM_PROBLEMA: 3 }, TRIBUTARIO: { PROPOSTO: 3 } } }] };
  const estado = { camadas: [
    { camada: "QUALIDADE", abertos: 9265, aguardando: 12, aprovados: 0, executadaEm: "2026-11-20T10:00:00Z", desatualizada: null },
    { camada: "NCM", abertos: 0, aguardando: 0, aprovados: 4, executadaEm: "2026-11-20T10:00:00Z", desatualizada: null },
    { camada: "TRIBUTARIO", abertos: 3, aguardando: 0, aprovados: 0, executadaEm: "2026-11-20T10:00:00Z", desatualizada: { por: ["GRUPOS_FINALIDADE"], desde: "2026-11-21T12:00:00Z" } },
  ] };
  const preparar = (qc) => { qc.setQueryData(chaves.visao("p1"), visao); qc.setQueryData(chaves.camadas(), ["QUALIDADE", "NCM", "TRIBUTARIO"]); qc.setQueryData(chaves.estadoCamadas("p1"), estado); };
  it("selo por camada: em aberto / aguardando, em dia, desatualizada; e Analisar todas (na ordem)", () => {
    const html = montar(<Cobertura projeto={projeto()} />, preparar);
    const t = texto(html);
    expect(t).toContain("Qualidade 9.265 em aberto / 12 aguardando");
    expect(t).toContain("NCM em dia");
    expect(t).toContain("Tratamento tributário 3 em aberto desatualizada");
    expect(t).toContain("Analisar todas (na ordem)");
    expect(html).toContain('aria-label="Analisar Qualidade"');
    expect(t).not.toMatch(/GRUPOS_FINALIDADE|TRIBUTARIO/);
  });
  it("funções: selo, ordem da análise, dica e resumo", () => {
    expect(seloDaCamada({ estado: "SEM_ANALISE" })).toEqual({ texto: "análise indisponível", tom: "neutro" });
    expect(seloDaCamada({ estado: "NAO_ANALISADA", aguardando: 0 }, { abertos: 0, aguardando: 0 }).texto).toBe("não analisada");
    expect(seloDaCamada({ estado: "COM_DADOS", aguardando: 0 }, { abertos: 0, aguardando: 2 })).toEqual({ texto: "2 aguardando", tom: "alerta" });
    expect(ordemDeAnalise([{ camada: "A", analisavel: true, estado: "COM_DADOS" }, { camada: "B", analisavel: false, estado: "SEM_ANALISE" }, { camada: "C", analisavel: true, estado: "SEM_ITENS" }])).toEqual(["A"]);
    expect(textoDesatualizada({ por: ["GRUPOS_FINALIDADE", "NCM"], desde: "2026-11-21T12:00:00Z" })).toMatch(/^Grupos e finalidade e NCM: decisões de \d\d\/11\/2026/);
    expect(textoDasAnalises([{ camada: "NCM", analisados: 10, casosNovos: 2, casosJaExistentes: 1 }, { camada: "TRIBUTARIO", analisados: 10, casosNovos: 3, casosJaExistentes: 0, semDados: { itens: 1, motivo: "x" } }]))
      .toBe("2 camadas analisadas, na ordem; 5 caso(s) novo(s). Faltou dado em: Tratamento tributário.");
  });
  const rota = (local) => {
    const qc = novoCliente();
    qc.setQueryData(chaves.projeto("d1"), projeto());
    return texto(renderToStaticMarkup(<QueryClientProvider client={qc}><StaticRouter location={local}><Routes><Route path="/s/:id" element={<SaneamentoEstoquesPagina />} /></Routes></StaticRouter></QueryClientProvider>));
  };
  it("a Cobertura aparece acima de todas as abas", () => {
    for (const aba of ["configuracao", "importacao", "visao", "casos", "tabela", "versoes", "diretrizes", "unificacoes", "impacto"]) expect(rota(`/s/d1?aba=${aba}`), aba).toContain("Cobertura das camadas");
  });
});

describe("Visão geral priorizada", () => {
  const visao = { camadas: ["QUALIDADE", "NCM"], grupos: [
    { grupo: "Pequeno", itens: 2, camadas: { QUALIDADE: { PROPOSTO: 2 }, NCM: { AGUARDANDO_INFORMACAO: 2 } } },
    { grupo: "Grande", itens: 50, camadas: { QUALIDADE: { PENDENTE: 5, PROPOSTO: 45 }, NCM: { APROVADO: 50 } } },
  ] };
  it("grupos por itens (maior primeiro) e linha de totais", () => {
    const { grupos, total } = matrizOrdenada(visao);
    expect(grupos.map((g) => g.grupo)).toEqual(["Grande", "Pequeno"]);
    expect(total.itens).toBe(52);
    expect(total.camadas.QUALIDADE).toMatchObject({ PENDENTE: 5, PROPOSTO: 47 });
  });
  it("a tela: total no topo, cor só para pendente e aguardando, proposto neutro, primeira coluna fixa", () => {
    const html = montar(<VisaoGeral projeto={projeto()} aoAbrirCasos={() => {}} aoAbrirTabela={() => {}} />, (qc) => qc.setQueryData(chaves.visao("p1"), visao));
    const t = texto(html);
    expect(t.indexOf("Total (2 grupos) 52")).toBeGreaterThan(-1);
    expect(t.indexOf("Total")).toBeLessThan(t.indexOf("Grande"));
    expect(t.indexOf("Grande")).toBeLessThan(t.indexOf("Pequeno"));
    expect(html).toMatch(/bg-orange-500\/10[^>]*>Pendente/);
    expect(html).toMatch(/bg-sky-500\/10[^>]*>Aguardando/);
    expect(html).toMatch(/class="text-xs text-foreground\/80">Proposto/);
    expect(html).not.toContain("bg-amber-500/15");
    expect(html).toMatch(/<th scope="row" class="sticky left-0/);
  });
});

describe("Tabela: estabelecimento único", () => {
  const filtro = { busca: "", camada: "", situacao: "", grupo: "", revisar: false, ordem: "codigo" };
  const item = (o = {}) => ({ id: "i1", codigo: "2", estabelecimento: "", descricao: "PARAFUSO", grupo: "G", finalidade: null, ativo: true, versao: 1, celulas: [], ...o });
  it("sem a coluna Estabelec. quando há um só; com ela quando há mais de um", () => {
    expect(fixasDaTabela([], [item()]).map((c) => c.id)).toEqual(["codigo", "descricao"]);
    expect(fixasDaTabela(["01", "02"], []).map((c) => c.id)).toEqual(["codigo", "descricao", "estabelecimento"]);
    expect(fixasDaTabela([], [item({ estabelecimento: "01" }), item({ estabelecimento: "02" })]).map((c) => c.id)).toContain("estabelecimento");
    const pagina = { pages: [{ itens: [item()], proximo: null, total: 1 }], pageParams: [undefined] };
    const html = montar(<TabelaUnica projeto={projeto()} />, (qc) => qc.setQueryData(chaves.itens("p1", filtro), pagina));
    expect(texto(html)).not.toContain("Estabelec.");
    expect(html).toContain('aria-colcount="');
  });
});

describe("Liberar versão: o que entra e o que fica fora", () => {
  it("conta aprovados com o efeito no cadastro, pendentes e aguardando", () => {
    expect(textoDaLiberacao({ aprovados: 2142, abertos: 53129, aguardando: 1843, efeitos: { inativados: 10024, unificacoes: 46, finalidade: 29482, descricao: 200, unidade: 0, ncm: 0, tributario: 0 } }))
      .toBe("Entram: 2.142 casos aprovados (10.024 itens inativados, 46 unificações, 29.482 itens com finalidade, 200 descrições padronizadas).\nFicam fora: 53.129 pendentes de decisão, 1.843 aguardando informação.");
    expect(textoDaLiberacao({ aprovados: 0, abertos: 1, aguardando: 0, efeitos: {} })).toBe("Entram: 0 casos aprovados.\nFicam fora: 1 pendente de decisão, 0 aguardando informação.");
    expect(textoDaLiberacao(null)).toBe("");
  });
});

describe("Diretrizes em lote", () => {
  const regra = (o = {}) => ({ id: "r1", aspecto: "NOMES", codigo: "N01", nome: "Nomes", abrangencia: { todos: true }, conteudoEfetivo: conteudoPadrao("NOMES"), situacao: "RASCUNHO", revisar: false, versao: 1, ativa: true, aplicada: false, pendenteAplicar: true, ...o });
  const regras = [regra(), regra({ id: "r2", codigo: "N02", abrangencia: { todos: false, grupos: ["G1"] }, aplicada: true, pendenteAplicar: false }), regra({ id: "r3", codigo: "A01", aspecto: "ATRIBUTOS", situacao: "APROVADA", aplicada: true, pendenteAplicar: false })];
  const grupos = Array.from({ length: 52 }, (_, n) => `G${String(n + 1).padStart(2, "0")}`);
  const dados = {
    cabecalho: { situacao: "RASCUNHO", versao: 1 }, regras, grupos: grupos.map((g) => ({ grupo: g, subgrupos: [], itens: 1 })),
    gruposSemRegra: [{ aspecto: "NOMES", grupos: [] }, { aspecto: "ATRIBUTOS", grupos: [] }, { aspecto: "UNIDADES", grupos }, { aspecto: "LIMITES", grupos }, { aspecto: "FISCAL", grupos }], atualizacoesBiblioteca: [],
  };
  const preparar = (qc) => { qc.setQueryData(chaves.diretrizes("p1"), dados); qc.setQueryData(chaves.importacoes("p1"), []); qc.setQueryData(chaves.cliente("e1"), { razao_social: "X" }); };
  it("botões Aplicar todas (as não aplicadas), Aplicar e Aprovar selecionadas; caixa por regra; selo Não aplicada", () => {
    const html = montar(<Diretrizes projeto={projeto()} />, preparar);
    const t = texto(html);
    expect(t).toContain("Aplicar todas as regras (1)");
    expect(t).toContain("Aplicar selecionadas (0)");
    expect(t).toContain("Aprovar selecionadas (0)");
    expect(t).toContain("Não aplicada");
    expect(html).toContain('aria-label="Marcar a regra N01"');
  });
  it("Grupos sem regra: contagem por aspecto e a lista uma vez só, expansível", () => {
    const t = texto(montar(<GruposSemRegra dados={dados} />));
    expect(t).toContain("Unidades e embalagens 52 grupos pendentes");
    expect(t).toContain("52 grupos sem regra de unidades e embalagens, limites de caracteres, classificação fiscal");
    expect((t.match(/G01/g) || []).length).toBe(1);
    expect(gruposSemRegraAgrupados([{ aspecto: "NOMES", grupos: ["A"] }, { aspecto: "FISCAL", grupos: ["A", "B"] }]).conjuntos).toEqual([{ aspectos: ["NOMES", "FISCAL"], grupos: ["A"] }, { aspectos: ["FISCAL"], grupos: ["B"] }]);
  });
  it("prévia agregada em janela: regras, itens, análises; disputa entre escolhidas bloqueia; sobreposição pede a transferência", () => {
    const previa = { regras: [{ id: "r1", codigo: "N01", nome: "Nomes" }, { id: "r3", codigo: "A01", nome: "Atributos" }], grupos: ["G1", "G2"], itens: 120, camadas: ["QUALIDADE", "NOMES_UNIDADES"], sobreposicoes: [], entreEscolhidas: [] };
    const html = montar(<PreviaVarias previa={previa} aoConfirmar={() => {}} aoCancelar={() => {}} />);
    const t = texto(html);
    expect(html).toContain('role="dialog"');
    expect(t).toContain("2 regras: 120 itens de 2 grupos serão analisados de novo, numa só reanálise.");
    expect(t).toContain("Qualidade, Nomes e unidades");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[^])*Confirmar e aplicar/);
    const disputa = montar(<PreviaVarias previa={{ ...previa, entreEscolhidas: [{ regra: "N02", grupo: "G1", regraAtual: "N01" }] }} aoConfirmar={() => {}} aoCancelar={() => {}} />);
    expect(texto(disputa)).toContain("Regras escolhidas disputam o mesmo grupo");
    expect(disputa).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[^])*Confirmar e aplicar/);
    const sobre = montar(<PreviaVarias previa={{ ...previa, sobreposicoes: [{ regra: "N01", grupo: "G1", regraAtual: "N09" }] }} aoConfirmar={() => {}} aoCancelar={() => {}} />);
    expect(texto(sobre)).toContain("G1: hoje na regra N09, passa para N01");
    expect(sobre).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[^])*Confirmar e aplicar/);
  });
  it("lógica: o que aplicar, o que aprovar, textos e falhas da reanálise", () => {
    expect(regrasParaAplicar([...regras, regra({ id: "r9", ativa: false })]).map((r) => r.codigo)).toEqual(["N01"]);
    const { aprovaveis, fora } = separarParaAprovar(regras);
    expect(aprovaveis.map((r) => r.codigo)).toEqual(["N02"]);
    expect(fora.map((r) => r.codigo)).toEqual(["N01"]);
    expect(resumoPreviaVarias({ regras: [{}], grupos: ["A"], itens: 1, camadas: [] }).textoFeito(1)).toBe("1 regra aplicada: 1 item de 1 grupo foi analisado de novo.");
    expect(falhasDaReanalise({ camadas: [{ camada: "NCM", executada: false, motivo: "fora" }, { camada: "QUALIDADE", executada: true }] })).toEqual(["NCM: fora"]);
  });
});
