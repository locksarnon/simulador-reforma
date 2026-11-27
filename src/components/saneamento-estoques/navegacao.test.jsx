/** Navegação e visão (avaliação com a base real): Cobertura compacta, Visão geral priorizada, Tabela, liberação de versão e Diretrizes em lote. */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "a@b.c" } }) }));

import { chaves } from "./api";
import Cobertura, { bloqueioDaFase, faseDaExecucao, ordemDeAnalise, seloDaCamada, textoDasAnalises, textoDesatualizada } from "./Cobertura";
import TabelaUnica, { fixasDaTabela } from "./TabelaUnica";
import { REGRA_FINALIDADE } from "./logica";
import { Roteiro } from "./RoteiroProjeto";
import { FASES_ROTEIRO, situacaoDaEtapa, situacaoDaLiberacao } from "./roteiro";
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

describe("Cobertura das camadas", () => {
  const visao = { camadas: [], grupos: [{ grupo: "A", itens: 3, camadas: { QUALIDADE: { PROPOSTO: 2, SEM_PROBLEMA: 1 }, NCM: { SEM_PROBLEMA: 3 }, TRIBUTARIO: { PROPOSTO: 3 } } }] };
  const estado = { camadas: [
    { camada: "QUALIDADE", abertos: 9265, aguardando: 12, aprovados: 0, executadaEm: "2026-11-20T10:00:00Z", desatualizada: null },
    { camada: "NCM", abertos: 0, aguardando: 0, aprovados: 4, executadaEm: "2026-11-20T10:00:00Z", desatualizada: null },
    { camada: "TRIBUTARIO", abertos: 3, aguardando: 0, aprovados: 0, executadaEm: "2026-11-20T10:00:00Z", desatualizada: { por: ["FINALIDADE"], desde: "2026-11-21T12:00:00Z" } },
  ] };
  const fasesLiberadas = { fases: [{ fase: "FASE1", camadas: [], liberada: { versaoId: "v1", numero: 1, em: "2026-11-20T10:00:00Z" }, bloqueio: null }, { fase: "FASE2", camadas: [], liberada: null, bloqueio: null }] };
  const preparar = (qc, fases = fasesLiberadas) => { qc.setQueryData(chaves.visao("p1"), visao); qc.setQueryData(chaves.camadas(), ["QUALIDADE", "NCM", "TRIBUTARIO"]); qc.setQueryData(chaves.estadoCamadas("p1"), estado); qc.setQueryData(chaves.fases("p1"), fases); };
  it("selo por camada: em aberto / aguardando, em dia, desatualizada; e Analisar a fase (na ordem)", () => {
    const html = montar(<Cobertura projeto={projeto()} />, preparar);
    const t = texto(html);
    expect(t).toContain("Qualidade 9.265 em aberto / 12 aguardando");
    expect(t).toContain("Validar NCM em dia");
    expect(t).toContain("Tratamento tributário 3 em aberto desatualizada");
    expect(t).toContain("Analisar a fase (na ordem)");
    expect(html).toContain('aria-label="Analisar Qualidade"');
    expect(t).not.toMatch(/GRUPOS_FINALIDADE|TRIBUTARIO|FASE1|FASE2/);
  });
  it("agrupada por fase: Fase 1 com as camadas do saneamento, Fase 2 com Finalidade, Classificação NCM, Tratamento tributário e Impacto no SPED", () => {
    const html = montar(<Cobertura projeto={projeto()} />, preparar);
    const t = texto(html);
    const i1 = t.indexOf("Fase 1 · Saneamento de estoques"); const i2 = t.indexOf("Fase 2 · Tributário e Reforma");
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
    const fase1 = t.slice(i1, i2); const fase2 = t.slice(i2);
    for (const c of ["Identificação", "Qualidade", "Duplicidades", "Grupos", "Nomes e unidades", "Validar NCM", "Impacto no SPED"]) expect(fase1, c).toContain(c);
    for (const c of ["Finalidade", "Classificação NCM", "Tratamento tributário", "Impacto no SPED"]) expect(fase2, c).toContain(c);
    expect(fase1).not.toContain("Tratamento tributário");
    expect(fase2).not.toContain("Duplicidades");
    expect((html.match(/Analisar a fase \(na ordem\)/g) || []).length).toBe(2);
    expect(html).toContain('aria-label="Analisar a Fase 1 (na ordem)"');
    expect(html).toContain('aria-label="Analisar a Fase 2 (na ordem)"');
    expect(t).toContain("Cobertura das camadas");
    expect(t).not.toContain("ainda não liberada");
  });
  it("Fase 2 bloqueada: mostra o motivo do servidor, o atalho para resolver e desliga os botões só da Fase 2", () => {
    const bloq = (codigo, mensagem) => ({ fases: [{ fase: "FASE1", camadas: [], liberada: null, bloqueio: null }, { fase: "FASE2", camadas: [], liberada: null, bloqueio: { codigo, mensagem } }] });
    const html = montar(<Cobertura projeto={projeto()} aoIrPara={() => {}} />, (qc) => preparar(qc, bloq("FASE1_NAO_LIBERADA", "Libere a versão da Fase 1 antes.")));
    const t = texto(html);
    expect(t).toContain("Fase 2 ainda não liberada");
    expect(t).toContain("Libere a versão da Fase 1 antes.");
    expect(t).toContain("Ir para Versões");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Analisar a Fase 2 \(na ordem\)"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Analisar Tratamento tributário"/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Analisar a Fase 1 \(na ordem\)"/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Analisar Qualidade"/);
    const regime = texto(montar(<Cobertura projeto={projeto()} aoIrPara={() => {}} />, (qc) => preparar(qc, bloq("REGIME_NAO_INFORMADO", ""))));
    expect(regime).toContain("Informe o regime do cliente");
    expect(regime).toContain("Ir para a Configuração");
    const ativ = texto(montar(<Cobertura projeto={projeto()} aoIrPara={() => {}} />, (qc) => preparar(qc, bloq("ATIVIDADES_NAO_CONFIRMADAS", "Confirme as atividades."))));
    expect(ativ).toContain("Ir para a Configuração");
  });
  it("funções da fase: bloqueio pela resposta (ou falta dela) e fase da análise em andamento", () => {
    expect(bloqueioDaFase("FASE1", undefined)).toBeNull();
    expect(bloqueioDaFase("FASE2", undefined, { carregando: true }).mensagem).toContain("Conferindo");
    expect(bloqueioDaFase("FASE2", undefined).mensagem).toContain("Não foi possível conferir");
    expect(bloqueioDaFase("FASE2", { fases: [{ fase: "FASE2", bloqueio: null }] })).toBeNull();
    expect(bloqueioDaFase("FASE2", { fases: [{ fase: "FASE2", bloqueio: { codigo: "REGIME_NAO_INFORMADO" } }] }).mensagem).toContain("regime do cliente");
    expect(faseDaExecucao({ camadas: ["QUALIDADE", "NCM"] })).toBe("FASE1");
    expect(faseDaExecucao({ camadas: ["FINALIDADE", "OBRIGACOES"] })).toBe("FASE2");
    expect(faseDaExecucao({ camadas: ["OBRIGACOES"] })).toBe("FASE1");
    expect(faseDaExecucao(null)).toBeNull();
  });
  it("análise em segundo plano: mostra o andamento vindo do servidor e avisa que pode sair da tela", () => {
    const html = montar(<Cobertura projeto={projeto()} />, (qc) => {
      preparar(qc);
      qc.setQueryData(chaves.analises("p1"), { execucao: { rodando: true, camadas: ["QUALIDADE", "NCM", "OBRIGACOES"], atual: "NCM", feitas: [{ camada: "QUALIDADE" }], erro: null, iniciadaEm: "2026-11-27T09:00:00Z", terminadaEm: null } });
    });
    const t = texto(html);
    expect(t).toContain("Analisando 2 de 3…");
    expect((t.match(/Analisando 2 de 3/g) || []).length).toBe(1); // só no botão da fase que está rodando
    expect(t).toContain("pode sair desta tela ou do sistema, ela continua");
    expect(t).toContain("Validar NCM analisando…");
  });
  it("análise terminada há pouco: resumo com Fechar; parada por erro diz onde", () => {
    const agora = new Date().toISOString();
    const ok = texto(montar(<Cobertura projeto={projeto()} />, (qc) => { preparar(qc); qc.setQueryData(chaves.analises("p1"), { execucao: { rodando: false, camadas: ["QUALIDADE", "NCM"], atual: null, feitas: [{ camada: "QUALIDADE", casosNovos: 2 }, { camada: "NCM", casosNovos: 3 }], erro: null, iniciadaEm: agora, terminadaEm: agora } }); }));
    expect(ok).toContain("2 camadas analisadas, na ordem; 5 caso(s) novo(s).");
    expect(ok).toContain("Fechar");
    const erro = texto(montar(<Cobertura projeto={projeto()} />, (qc) => { preparar(qc); qc.setQueryData(chaves.analises("p1"), { execucao: { rodando: false, camadas: ["QUALIDADE", "NCM"], atual: null, feitas: [{ camada: "QUALIDADE" }], erro: { camada: "NCM", mensagem: "falhou" }, iniciadaEm: agora, terminadaEm: agora } }); }));
    expect(erro).toContain("1 camada(s) analisada(s); parou em Validar NCM: falhou");
    const antiga = texto(montar(<Cobertura projeto={projeto()} />, (qc) => { preparar(qc); qc.setQueryData(chaves.analises("p1"), { execucao: { rodando: false, camadas: ["NCM"], atual: null, feitas: [{ camada: "NCM", casosNovos: 1 }], erro: null, iniciadaEm: "2026-01-01T00:00:00Z", terminadaEm: "2026-01-01T00:01:00Z" } }); }));
    expect(antiga).not.toContain("Fechar");
  });
  it("funções: selo, ordem da análise, dica e resumo", () => {
    expect(seloDaCamada({ estado: "SEM_ANALISE" })).toEqual({ texto: "análise indisponível", tom: "neutro" });
    expect(seloDaCamada({ estado: "NAO_ANALISADA", aguardando: 0 }, { abertos: 0, aguardando: 0 }).texto).toBe("não analisada");
    expect(seloDaCamada({ estado: "COM_DADOS", aguardando: 0 }, { abertos: 0, aguardando: 2 })).toEqual({ texto: "2 aguardando", tom: "alerta" });
    expect(ordemDeAnalise([{ camada: "A", analisavel: true, estado: "COM_DADOS" }, { camada: "B", analisavel: false, estado: "SEM_ANALISE" }, { camada: "C", analisavel: true, estado: "SEM_ITENS" }])).toEqual(["A"]);
    expect(textoDesatualizada({ por: ["FINALIDADE", "NCM_CLASSIFICACAO"], desde: "2026-11-21T12:00:00Z" })).toMatch(/^Finalidade e Classificação NCM: decisões de \d\d\/11\/2026/);
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
  it("finalidade sugerida (caso em aberto) em itálico com selo; a aprovada sem selo; botão i com a regra no título", () => {
    const pagina = { pages: [{ itens: [item({ id: "i1", codigo: "1", finalidadeSugerida: "INSUMO_PRODUCAO" }), item({ id: "i2", codigo: "2", finalidade: "USO_CONSUMO", finalidadeSugerida: null })], proximo: null, total: 2 }], pageParams: [undefined] };
    const html = montar(<TabelaUnica projeto={projeto()} />, (qc) => qc.setQueryData(chaves.itens("p1", filtro), pagina));
    const t = texto(html);
    expect(t).toContain("Insumo de produção sugerida");
    expect(t).toMatch(/Uso e consumo(?! sugerida)/);
    expect(html).toContain('aria-label="Sobre: regra da finalidade"');
    expect(REGRA_FINALIDADE.join(" ")).toContain("atividades (CNAE) confirmadas");
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
    expect(falhasDaReanalise({ camadas: [{ camada: "NCM", executada: false, motivo: "fora" }, { camada: "QUALIDADE", executada: true }] })).toEqual(["Validar NCM: fora"]);
  });
});

describe("Roteiro do projeto", () => {
  const estado = new Map([
    ["IDENTIFICACAO", { camada: "IDENTIFICACAO", abertos: 0, aguardando: 0, aprovados: 3, executadaEm: "2026-11-20T10:00:00Z" }],
    ["QUALIDADE", { camada: "QUALIDADE", abertos: 12, aguardando: 2, aprovados: 1, executadaEm: "2026-11-20T10:00:00Z" }],
  ]);
  const etapa = (fase, id) => FASES_ROTEIRO.find((f) => f.id === fase).etapas.find((e) => e.id === id);
  it("situação real da Fase 1; Fase 2 pelas camadas, premissas e liberação; o que ainda não é medido como próxima fase", () => {
    const ctx = { estado, itens: 29694, liberadas: 0 };
    expect(situacaoDaEtapa("fase1", etapa("fase1", "preparar"), ctx)).toMatchObject({ texto: "Concluída", detalhe: "29.694 itens importados" });
    expect(situacaoDaEtapa("fase1", etapa("fase1", "identificacao"), ctx)).toMatchObject({ texto: "Concluída", detalhe: "3 aprovados" });
    expect(situacaoDaEtapa("fase1", etapa("fase1", "qualidade"), ctx)).toMatchObject({ texto: "Em andamento", detalhe: "12 em aberto · 2 aguardando o cliente · 1 aprovados" });
    expect(situacaoDaEtapa("fase1", etapa("fase1", "duplicidades"), ctx).texto).toBe("Não iniciada");
    expect(situacaoDaEtapa("fase1", etapa("fase1", "preparar"), { ...ctx, itens: 0 }).texto).toBe("Não iniciada");
    expect(situacaoDaEtapa("fase2", etapa("fase2", "tratamento"), ctx).texto).toBe("Não iniciada");
    expect(situacaoDaEtapa("fase2", etapa("fase2", "operacoes"), ctx).texto).toBe("Próxima fase");
    expect(situacaoDaEtapa("fase2", etapa("fase2", "estoque"), ctx).texto).toBe("Próxima fase");
    expect(situacaoDaEtapa("fechamento", etapa("fechamento", "parecer"), ctx).texto).toBe("Próxima fase");
    // Camadas da Fase 2: finalidade, NCM (reclassificação), tratamento e SPED tributário.
    expect(etapa("fase2", "finalidade").camada).toBe("FINALIDADE");
    expect(etapa("fase2", "ncm2").camada).toBe("NCM_CLASSIFICACAO");
    expect(etapa("fase2", "tratamento").camada).toBe("TRIBUTARIO");
    expect(etapa("fase2", "sped2").camada).toBe("OBRIGACOES");
    const comTrib = new Map([["TRIBUTARIO", { camada: "TRIBUTARIO", abertos: 4, aguardando: 0, aprovados: 2, executadaEm: "2026-11-20T10:00:00Z" }]]);
    expect(situacaoDaEtapa("fase2", etapa("fase2", "tratamento"), { ...ctx, estado: comTrib })).toMatchObject({ texto: "Em andamento", detalhe: "4 em aberto · 2 aprovados" });
    const bloqueada = { fases: [{ fase: "FASE1", liberada: null, bloqueio: null }, { fase: "FASE2", liberada: null, bloqueio: { codigo: "FASE1_NAO_LIBERADA", mensagem: "Libere a Fase 1." } }] };
    expect(situacaoDaEtapa("fase2", etapa("fase2", "finalidade"), { ...ctx, fases: bloqueada })).toMatchObject({ texto: "Aguardando liberação", detalhe: "Libere a Fase 1." });
    // Premissas: regime e atividades.
    expect(situacaoDaEtapa("fase2", etapa("fase2", "premissas"), { ...ctx, projeto: {} }).texto).toBe("Não iniciada");
    expect(situacaoDaEtapa("fase2", etapa("fase2", "premissas"), { ...ctx, projeto: { parametros: { regimeCliente: "REGULAR" } } })).toMatchObject({ texto: "Em andamento", detalhe: "Regime: Regime regular · atividades a confirmar" });
    expect(situacaoDaEtapa("fase2", etapa("fase2", "premissas"), { ...ctx, projeto: { parametros: { regimeCliente: "REGULAR" }, atividadesConfirmadas: true } }).texto).toBe("Concluída");
    // Liberações pela resposta de GET fases (sem ela, a Fase 1 pelas versões).
    const liberadas = { fases: [{ fase: "FASE1", liberada: { versaoId: "v1", numero: 2 } }, { fase: "FASE2", liberada: null }] };
    expect(situacaoDaLiberacao("fase1", { fases: liberadas })).toMatchObject({ texto: "Concluída", detalhe: "Versão 2" });
    expect(situacaoDaLiberacao("fase2", { fases: liberadas }).texto).toBe("Não iniciada");
    expect(situacaoDaLiberacao("fase1", { liberadas: 1 }).texto).toBe("Concluída");
    expect(situacaoDaLiberacao("fechamento", {}).texto).toBe("Próxima fase");
  });
  it("modo apresentação esconde os números; o detalhe da etapa mostra o que é feito, o que o cliente fornece e recebe", () => {
    const props = { nome: "Crestani", estado, itens: 29694, liberadas: 0, selecionada: "duplicidades", aoSelecionar: () => {} };
    const normal = texto(renderToStaticMarkup(<Roteiro {...props} apresentacao={false} />));
    expect(normal).toContain("12 em aberto");
    expect(normal).toContain("Fase 1 · Saneamento de estoques");
    expect(normal).toContain("Crédito do estoque");
    expect(normal).toContain("O que o cliente fornece");
    expect(normal).toContain("Mapa de unificações pronto para o time do ERP executar.");
    const apres = texto(renderToStaticMarkup(<Roteiro {...props} apresentacao />));
    expect(apres).not.toContain("12 em aberto");
    expect(apres).toContain("Em andamento");
  });
});
