import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "a@b.c" } }) }));

import { chaves, renovarAposRestauracao } from "./api";
import { estiloTabela } from "./comuns";
import Abas from "./Abas";
import CasoDetalhe, { ParecerIa } from "./CasoDetalhe";
import Casos from "./Casos";
import Cobertura from "./Cobertura";
import Configuracao from "./Configuracao";
import Impacto from "./Impacto";
import Importacao, { AvisosDeSeparador, Reimportacao } from "./Importacao";
import TabelaUnica from "./TabelaUnica";
import Unificacoes from "./Unificacoes";
import Versoes, { ContinuarVersao } from "./Versoes";
import VisaoGeral from "./VisaoGeral";
import SaneamentoEstoquesPagina from "@/pages/saneamento-estoques/SaneamentoEstoquesPagina";

const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const novoCliente = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
const ERRO = Object.assign(new Error("Servidor fora do ar."), { status: 500 });
const falhar = (qc, chave) => qc.getQueryCache().build(qc, { queryKey: chave }).setState({ status: "error", error: ERRO, fetchStatus: "idle", data: undefined, errorUpdateCount: 1, dataUpdateCount: 0 });
const pagina = (itens, extra = {}) => ({ pages: [{ itens, proximo: null, total: itens.length, ...extra }], pageParams: [undefined] });
const paginas = (linhas, extra = {}) => ({ pages: [{ linhas, proximo: null, total: linhas.length, totalGeral: extra.total ?? linhas.length, porTipo: {}, ...extra }], pageParams: [undefined] });
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
  it("antes da confirmação: lista as atividades e o botão; módulos ainda não disponíveis não aparecem", () => {
    const t = texto(montar(<Configuracao projeto={projeto()} recarregar={() => {}} />));
    expect(t).toContain("Confirmo as atividades");
    expect(t).toContain("Comércio atacadista de animais vivos");
    for (const m of ["Conciliação de estoque", "Blocos K e G do SPED", "Arquivo para o ERP", "a desenvolver", "Desligado"]) expect(t).not.toContain(m);
    expect(t).not.toContain("Reabrir para alterar");
  });
  it("traz o campo da última competência de escrituração já entregue, com o valor salvo", () => {
    const html = montar(<Configuracao projeto={projeto({ parametros: { corteMovimentacao: null, competenciaEntregue: "2026-10" } })} recarregar={() => {}} />);
    expect(texto(html)).toContain("Última competência de escrituração já entregue (SPED)");
    expect(html).toMatch(/<input type="month"[^>]*value="2026-10"/);
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
  it("lista vazia: diz o motivo e oferece buscar pelo CNPJ; pessoa física marca na lista", () => {
    const pj = montar(<Configuracao projeto={projeto({ atividades: [], cliente: { tipoDocumento: "PJ", temCnae: false } })} recarregar={() => {}} />);
    expect(texto(pj)).toContain("O cadastro do cliente não tem CNAE e a consulta ao CNPJ não trouxe atividades");
    expect(pj).toMatch(/<button[^>]*>[^]*?Buscar atividades pelo CNPJ/);
    const pf = texto(montar(<Configuracao projeto={projeto({ atividades: [], cliente: { tipoDocumento: "PF" } })} recarregar={() => {}} />));
    expect(pf).toContain("Pessoa física: marque na lista");
    expect(pf).not.toContain("Consultando o CNPJ");
    expect(pf.match(/Buscar atividades pelo CNPJ/g)).toHaveLength(1); // só a menção no texto de ajuda; sem botão
  });
  it("com atividades: o botão de buscar pelo CNPJ fica ao lado da lista; CNAE formatado, origem, rótulo e motivo do mapeamento", () => {
    const t = texto(montar(<Configuracao projeto={projeto({
      atividades: [atividade({ codigo: "0111301", descricao: "Cultivo de arroz" }), atividade({ id: "a2", codigo: "6911701", descricao: "Advocacia" })],
      cliente: { tipoDocumento: "PJ", temCnae: true, cnaePrincipal: "0111301" },
      mapaAtividades: { mapeadas: [{ codigo: "0111301", atividade: "PRODUCAO_AGRICOLA", rotulo: "Produção agrícola (lavoura, sementes e mudas)", motivo: "CNAE 01.1: cultivo de lavouras temporárias" }], semMapeamento: ["6911701"] },
      listaAtividades: [{ codigo: "PECUARIA", rotulo: "Pecuária (criação de animais)" }],
    })} recarregar={() => {}} />));
    expect(t.match(/Buscar atividades pelo CNPJ/g).length).toBeGreaterThanOrEqual(2);
    expect(t).toContain("0111-3/01");
    expect(t).toContain("CNPJ · principal");
    expect(t).toContain("CNPJ · secundário");
    expect(t).not.toContain("CNPJprincipal");
    expect(t).toContain("Vira: Produção agrícola (lavoura, sementes e mudas)");
    expect(t).not.toContain("Vira: PRODUCAO_AGRICOLA");
    expect(t).toContain("CNAE 01.1: cultivo de lavouras temporárias");
    expect(t).toContain("CNAE sem atividade correspondente — inclua manualmente se aplicável");
    expect(t).toContain("Pecuária (criação de animais)");
  });
  it("seções com faixa de título (linha verde), borda nítida, rótulos legíveis e campos em fundo de campo", () => {
    const html = montar(<Configuracao projeto={projeto()} recarregar={() => {}} />);
    for (const [id, t] of [["san-cfg-dados", "Dados do projeto"], ["san-cfg-ativ", "Atividades do cliente"]]) {
      expect(html, t).toMatch(new RegExp(`<section aria-labelledby="${id}" class="border border-foreground/50 bg-card[^"]*"><div class="[^"]*border-b-2 border-primary bg-muted[^"]*"><h2 id="${id}"[^>]*>${t}</h2>`));
    }
    expect(texto(html)).not.toContain("Módulos opcionais"); // nenhum disponível: a seção não aparece
    expect(texto(html)).not.toContain("a desenvolver");
    expect(html).toContain("w-full border border-input bg-background");
    expect(html).toContain("mb-1 block text-xs font-medium text-foreground/80");
    expect(html).not.toMatch(/<(input|select|textarea)[^>]*border-border/);
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
  const caso = { id: "c1", camada: "NCM", tipo: "NCM_FORMATO", itens: ["i1"], qtdItens: 1, problema: "NCM com 7 dígitos", situacao: "PROPOSTO", origem: "REGRA", versao: 1, parecer_ia: null, item: { codigo: "2186", descricao: "RETENTOR 45X62", grupo: "Peças" } };
  const chaveLista = chaves.casos("p1", filtro);
  const seed = (casos) => (qc) => qc.setQueryData(chaveLista, { pages: [{ casos, proximo: null }], pageParams: [undefined] });
  it("carregando, erro e vazio", () => {
    expect(texto(montar(<Casos projeto={projeto()} />))).toContain("Carregando os casos");
    expect(texto(montar(<Casos projeto={projeto()} />, (qc) => falhar(qc, chaveLista)))).toContain("Não foi possível carregar os casos");
    expect(texto(montar(<Casos projeto={projeto()} />, seed([])))).toContain("Nenhum caso em aberto com este filtro");
  });
  it("lista os casos e oferece o lote", () => {
    const t = texto(montar(<Casos projeto={projeto()} />, seed([caso])));
    expect(t).toContain("NCM com 7 dígitos");
    expect(t).toContain("Decidir em lote");
    expect(t).toContain("Em aberto (plano de ajustes)");
    expect(t).toContain("Escolha um caso");
  });
  it("tabela no layout da aba Tabela: cabeçalho fixo, colunas fixas, linhas de 38 px com zebra, selo de situação e contador no topo", () => {
    const outro = { ...caso, id: "c2", camada: "QUALIDADE", tipo: "SEM_MOVIMENTACAO", qtdItens: 12, situacao: "RASCUNHO", origem: "IA", problema: "Item parado desde o corte de movimentação, sem saldo, no grupo Ferragens e em outros quatro grupos do cadastro de itens" };
    const html = montar(<Casos projeto={projeto()} />, seed([caso, outro]));
    const t = texto(html);
    // mesmas classes da aba Tabela
    for (const cls of [estiloTabela.area, estiloTabela.cabecalho, estiloTabela.tituloFixo, estiloTabela.linha]) expect(html, cls).toContain(cls);
    const unica = montar(<TabelaUnica projeto={projeto({ atividadesConfirmadas: true })} />, (qc) => qc.setQueryData(chaves.itens("p1", filtroInicial), pagina([item()])));
    for (const cls of [estiloTabela.area, estiloTabela.cabecalho, estiloTabela.tituloFixo, estiloTabela.linha]) expect(unica, cls).toContain(cls);
    expect(html).toContain('role="table" aria-label="Casos"');
    expect(html).toContain("min-height:38px");
    expect(html).toContain(estiloTabela.fundoFixo(1, false)); // zebra nas colunas fixas
    expect(html).toMatch(/class="sticky z-10[^"]*"[^>]*style="left:36px/); // Código fixo logo depois da caixa de marcar
    for (const x of ["Código", "Descrição", "Grupo", "Problema", "Itens", "Situação", "Camada", "Proposto", "Rascunho", "2186", "RETENTOR 45X62", "Peças", "12 itens (1º: 2186)", "2 carregado(s).", "Buscar nesta lista", "Filtros por coluna", "Colunas"]) expect(t, x).toContain(x);
    // Origem, Parecer da IA e Tipo começam ocultas (o consultor liga em Colunas); nenhum código interno de tipo na lista.
    expect(html).not.toContain('aria-label="Filtrar Origem"');
    expect(html).not.toMatch(/role="columnheader"[^>]*>(?:(?!<\/div>).)*Origem/);
    expect(t).not.toContain("NCM_FORMATO");
    expect(t).not.toContain("SEM_MOVIMENTACAO");
    expect(html).toContain('aria-label="Marcar todas"');
    expect(html).toContain('aria-label="Marcar a linha"');
    expect(html).toContain('aria-sort="none"');
    // texto longo numa linha só, com o texto inteiro no título
    expect(html).toContain(`title="${outro.problema}"`);
    expect(t).not.toContain("Limpar filtros");
  });
  it("lista com mais páginas: o contador avisa e o botão Carregar mais casos continua", () => {
    const t = texto(montar(<Casos projeto={projeto()} />, (qc) => qc.setQueryData(chaveLista, { pages: [{ casos: [caso], proximo: "c9" }], pageParams: [undefined] })));
    expect(t).toContain("role até o fim para carregar mais");
    expect(t).toContain("Carregar mais casos");
  });
  it("recorte da visão geral: aviso do grupo, filtro de camada e Limpar filtros (que mantém o recorte)", () => {
    const f = { camada: "NCM", situacao: "ABERTOS", tipo: "", origem: "", grupo: "Ferragens" };
    const t = texto(montar(<Casos projeto={projeto()} recorte={{ camada: "NCM", grupo: "Ferragens" }} />, (qc) => qc.setQueryData(chaves.casos("p1", f), { pages: [{ casos: [caso], proximo: null }], pageParams: [undefined] })));
    for (const x of ["Recorte da visão geral", "Ferragens", "Tirar o recorte", "Limpar filtros", "1 carregado(s)."]) expect(t, x).toContain(x);
  });
  it("filtro de tipo em lista, com rótulo e contagem; o contador mostra o total do filtro", () => {
    const html = montar(<Casos projeto={projeto()} />, (qc) => qc.setQueryData(chaveLista, { pages: [{ casos: [caso], proximo: "c9", tipos: [{ tipo: "NCM_FORMATO", n: 1200 }, { tipo: "ABREVIACAO_ESCONDE_ATRIBUTO", n: 3 }] }], pageParams: [undefined] }));
    const t = texto(html);
    expect(t).toContain("Formato do NCM (1.200)");
    expect(t).toContain("Abreviação que esconde atributo (3)");
    expect(t).toContain("1.203 caso(s) em aberto");
    expect(t).not.toContain("ABREVIACAO_ESCONDE_ATRIBUTO");
    expect(t).not.toContain("texto exato");
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
  it("unificação com unidades diferentes oferece os campos do fator com a direção (1 unidade de, equivale a, fator); sem a diferença, não", () => {
    const dup = { ...caso, camada: "DUPLICIDADE", tipo: "DUPLICIDADE_INDICACAO_ALTA", problema: "2 códigos com indicação alta", evidencia: [{ rotulo: "Diferença", valor: "unidades diferentes: UN, CX" }], atual: { codigos: "100 | 200" }, proposta: { decisao: "PROPOR_CONSOLIDACAO", manter: "100", consolidar: "200" } };
    const html = montar(<CasoDetalhe projeto={projeto()} casoId="c1" />, (qc) => qc.setQueryData(chaves.caso("c1"), dup));
    for (const r of ["Fator: 1 unidade de", "Fator: equivale a (unidade)"]) expect(html).toContain(`aria-label="Proposta para ${r}"`);
    expect(html).toMatch(/aria-label="Proposta para Fator[^"]*conver/i);
    const sem = montar(<CasoDetalhe projeto={projeto()} casoId="c1" />, (qc) => qc.setQueryData(chaves.caso("c1"), { ...dup, evidencia: [] }));
    expect(sem).not.toContain("Proposta para Fator: 1 unidade de");
  });
  it("caso de 1 item: bloco fixo do item e o campo-alvo (NCM) editável mesmo sem proposta", () => {
    const ncm = { ...caso, camada: "NCM", tipo: "NCM_INEXISTENTE", itens: ["i1"], problema: "NCM 12022090 não existe na tabela", atual: { ncm: "12022090" }, proposta: {}, resumoItens: [{ id: "i1", codigo: "2186", descricao: "RETENTOR 45X62", grupo: "Peças", ncm: "12022090", unidade: "UN", saldo: 24, ultimaMovimentacao: "2025-03-10" }] };
    const html = montar(<CasoDetalhe projeto={projeto()} casoId="c1" />, (qc) => qc.setQueryData(chaves.caso("c1"), ncm));
    const t = texto(html);
    for (const x of ["Item", "2186", "RETENTOR 45X62", "Peças", "UN", "24", "10/03/2025", "NCM inexistente", "digite o valor correto em NCM"]) expect(t, x).toContain(x);
    expect(html).toContain('aria-label="Proposta para NCM"');
  });
  it("duplicidade: decisão em lista rotulada, itens em tabela, decisões possíveis fora da grade, nada de código interno", () => {
    const dup = { ...caso, camada: "DUPLICIDADE", tipo: "DUPLICIDADE_EXATA", itens: ["i1", "i2"], problema: "2 códigos iguais", evidencia: [], atual: { codigos: "100 | 200", descricoes: "LUVA | LUVA" },
      proposta: { decisao: "PROPOR_INATIVACAO", decisoesPossiveis: "MANTER_DISTINTOS | PROPOR_CONSOLIDACAO | PROPOR_INATIVACAO | SOLICITAR_INFORMACAO", manter: "100", consolidar: "200" },
      resumoItens: [{ id: "i1", codigo: "100", descricao: "LUVA", grupo: "EPI", ncm: null, unidade: "UN", saldo: 0 }, { id: "i2", codigo: "200", descricao: "LUVA", grupo: "EPI", ncm: null, unidade: "PAR", saldo: 3 }] };
    const html = montar(<CasoDetalhe projeto={projeto()} casoId="c1" />, (qc) => qc.setQueryData(chaves.caso("c1"), dup));
    const t = texto(html);
    expect(html).toMatch(/<select[^>]*aria-label="Proposta para Decisão"/);
    for (const x of ["Propor inativação", "Manter distintos", "Propor consolidação", "Itens do caso (2)", "Código mantido", "Duplicidade exata"]) expect(t, x).toContain(x);
    for (const x of ["PROPOR_INATIVACAO", "MANTER_DISTINTOS", "Decisões possíveis", "decisoesPossiveis", "DUPLICIDADE_EXATA", "codigos"]) expect(t, x).not.toContain(x);
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
    expect(texto(montar(<Impacto projeto={projeto()} />, (qc) => { qc.setQueryData(chaves.impactos("p1"), paginas([])); }))).toContain("Nenhum impacto registrado ainda");
  });
  it("com linhas: tipos de ajuste e colunas do checklist", () => {
    const linha = { id: "1", tipo_ajuste: "ESCRITURACAO_ENTREGUE", obrigacao: "EFD ICMS/IPI", competencia: "2026-01", versao_leiaute: "019", registro: "0200", campo: "COD_NCM", valor_original: "1234", valor_proposto: "12345678", motivo: "NCM corrigido", evidencia: "Tabela TIPI", inicio: "2027-01-01", avaliar_anteriores: true, responsavel: "Ana" };
    const t = texto(montar(<Impacto projeto={projeto()} />, (qc) => qc.setQueryData(chaves.impactos("p1"), paginas([linha], { total: 38976, porTipo: { ESCRITURACAO_ENTREGUE: 38976 }, proximo: "2" }))));
    expect(t).toContain("Impacto em escrituração já entregue");
    expect(t).toContain("EFD ICMS/IPI");
    expect(t).toContain("0200");
    expect(t).toContain("Avaliar períodos anteriores");
    // Tabela densa: motivo e evidência numa linha só, com o texto inteiro no título.
    const longo = { ...linha, id: "2", motivo: "Inativou código: Código inativado: deixa de ser apresentado no 0200 do período em que não for referenciado nos demais blocos (sem documento nem inventário); o código não pode ser reutilizado para outro item" };
    const html = montar(<Impacto projeto={projeto()} />, (qc) => qc.setQueryData(chaves.impactos("p1"), paginas([longo])));
    expect(html).toContain(`title="${longo.motivo}"`);
    expect(html).toMatch(/class="[^"]*truncate[^"]*"[^>]*>Inativou código/);
    expect(html).not.toContain("min-w-[16rem]");
    // paginado: mostra quantas linhas estão carregadas do total do servidor e oferece carregar mais
    expect(t).toContain("Todos (38.976)");
    expect(t).toContain("Mostrando 1 de 38.976 linha(s)");
    expect(t).toContain("Carregar mais linhas");
  });
});

describe("Reimportação grande", () => {
  const previa = {
    novos: 0, alterados: 28970, inalterados: 10, ausentesDoArquivo: 0,
    totais: { novos: 0, alterados: 28970, inalterados: 10, ausentes: 0, alteradosComProtegido: 30, alteradosIncorporaveis: 28970, camposProtegidos: 30 },
    diferencas: [{ itemId: "i1", codigo: "001", estabelecimento: "", campos: [{ campo: "descricao", antes: "A", depois: "B", protegido: true }, { campo: "grupo", antes: "X", depois: "Y", protegido: false }] }],
    paginaDiferencas: { pagina: 2, limite: 200, filtro: "TODAS", total: 28970, paginas: 145 },
  };
  const ver = (modo) => texto(renderToStaticMarkup(<Reimportacao previa={previa} escolhidos={new Set()} aoMudar={() => {}} modo={modo} aoMudarModo={() => {}} aoPaginar={() => {}} paginando={false} />));
  it("totais do arquivo inteiro, página atual e escolha por filtro sem listar ids", () => {
    const t = ver("ITENS");
    expect(t).toContain("28.970");
    expect(t).toContain("Com campo protegido");
    expect(t).toContain("Página 2 de 145");
    expect(t).toContain("Protegido (decisão)");
    expect(t).toContain("Todos os alterados (campos protegidos ficam como estão)");
    expect(t).not.toContain("só as 200 primeiras");
    expect(ver("ALTERADOS")).toContain("Vale para todas as diferenças do arquivo, não só para a página abaixo: 28.970 item(ns)");
    expect(ver("ALTERADOS_SEM_PROTEGIDO")).toContain("28.940 item(ns)");
  });
});

describe("Reimportação: separador decimal mudou", () => {
  it("mostra o aviso em destaque (alerta) e nada quando não mudou", () => {
    const msg = "O separador decimal da coluna \"Saldo\" mudou de BR para ponto desde a última importação: 2 saldos mudam por isso; confira antes de incorporar.";
    const html = renderToStaticMarkup(<AvisosDeSeparador relatorio={{ separadorMudou: [msg] }} />);
    expect(html).toContain("role=\"alert\"");
    expect(texto(html)).toContain("Separador decimal mudou");
    expect(texto(html)).toContain("2 saldos mudam por isso; confira antes de incorporar");
    expect(renderToStaticMarkup(<AvisosDeSeparador relatorio={{ separadorMudou: [] }} />)).toBe("");
    expect(renderToStaticMarkup(<AvisosDeSeparador relatorio={undefined} />)).toBe("");
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
    expect(t).toContain("Continuar a partir desta versão");
  });
  it("mostra as restaurações feitas a partir da versão, com Desfazer (ou o selo de desfeita)", () => {
    const r = (o) => ({ id: "r1", quando: "2026-11-21T12:00:00Z", usuario: "ana@x.com", justificativa: "Cliente pediu voltar", itens: 3, campos: 5, casosDecididosDepois: 1, desfeita: null, ...o });
    const t = texto(montar(<Versoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.versoes("p1"), [{ id: "v1", numero: 1, rotulo: "Entrega 1", usuario: "ana@x.com", createdAt: "2026-11-20T12:00:00Z", resumo: { itens: 500, restauracoes: [r(), r({ id: "r2", desfeita: { por: "b", em: "2026-11-22T12:00:00Z" } })] } }])));
    expect(t).toContain("Base restaurada a esta versão em");
    expect(t).toContain("Cliente pediu voltar");
    expect(t).toContain("Desfazer restauração");
    expect(t).toContain("Desfeita em");
  });
  it("continuar: prévia com itens e campos que mudam, exemplos e justificativa obrigatória (botão desabilitado até preencher)", () => {
    const v = { id: "v1", numero: 1, rotulo: "Entrega 1" };
    const previa = { versao: v, versaoProjeto: 3, previa: "abc", totais: { itens: 2, campos: 3, itensNaFoto: 2, itensNovosDepois: 0, itensAusentes: 0, casosDecididosDepois: 1 }, porCampo: [{ campo: "ncm", itens: 2 }, { campo: "descricao", itens: 1 }], camadasRevisar: ["NCM"], amostra: [{ id: "i1", codigo: "000123", campos: [{ campo: "ncm", antes: "31051000", depois: "31010000" }] }], ignorados: [] };
    const html = montar(<ContinuarVersao projeto={projeto()} versao={v} aoFechar={() => {}} />, (qc) => qc.setQueryData(chaves.continuar("p1", "v1"), previa));
    const t = texto(html);
    expect(t).toContain("Continuar a partir da versão 1 (Entrega 1)");
    expect(t).toContain("2 itens e 3 campos voltam aos valores da versão 1.");
    expect(t).toContain("1 caso aprovado depois desta versão volta a proposto");
    expect(t).toContain("000123");
    expect(t).toContain("31051000 → 31010000");
    expect(t).toContain("Justificativa (obrigatória, ao menos 10 caracteres)");
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""/);
    expect(t).toContain("Restaurar e continuar");
    const igual = texto(montar(<ContinuarVersao projeto={projeto()} versao={v} aoFechar={() => {}} />, (qc) => qc.setQueryData(chaves.continuar("p1", "v1"), { ...previa, totais: { ...previa.totais, itens: 0, campos: 0 }, porCampo: [], amostra: [] })));
    expect(igual).toContain("nada a restaurar");
    expect(igual).not.toContain("Restaurar e continuar");
    expect(texto(montar(<ContinuarVersao projeto={projeto()} versao={v} aoFechar={() => {}} />))).toContain("Montando a prévia");
  });
});

describe("Restauração: depois de erro", () => {
  it("renova o projeto (versão nova) e as versões, para o Desfazer não ficar preso no 409", async () => {
    const qc = novoCliente();
    qc.setQueryData(chaves.projeto("d1"), { id: "p1", versao: 3 });
    qc.setQueryData(chaves.versoes("p1"), []);
    qc.setQueryData(chaves.itens("p1", {}), []);
    await renovarAposRestauracao(qc, "p1");
    expect(qc.getQueryState(chaves.projeto("d1")).isInvalidated).toBe(true);
    expect(qc.getQueryState(chaves.versoes("p1")).isInvalidated).toBe(true);
    expect(qc.getQueryState(chaves.itens("p1", {})).isInvalidated).toBe(false);
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
    expect(t).toContain("Qualidade analisada");
    expect(t).toContain("Tratamento tributário 1 aguardando");
    expect(t).toContain("análise indisponível");
    expect(t).toContain("Analisar todas (na ordem)");
  });
  it("cobertura: sem confirmação as análises ficam bloqueadas", () => {
    const html = montar(<Cobertura projeto={projeto()} />, (qc) => { qc.setQueryData(chaves.visao("p1"), { camadas: [], grupos: [] }); qc.setQueryData(chaves.camadas(), ["QUALIDADE"]); });
    expect(texto(html)).toContain("as análises ficam bloqueadas");
    expect(html).toMatch(/<button[^>]*disabled/);
  });
  it("as nove abas, com a atual marcada (Diretrizes entre a Importação e as análises)", () => {
    const html = montar(<Abas atual="casos" aoMudar={() => {}} />);
    expect(texto(html)).toContain("Configuração Importação Diretrizes Tabela Visão geral Casos Impacto nas obrigações Unificações Versões");
    expect(html).toContain('aria-selected="true"');
    expect((html.match(/role="tab"/g) || []).length).toBe(9);
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
    expect(texto(rota(nao))).toContain("Abrindo o saneamento"); // criado ao entrar, sem a tela intermediária
    expect(texto(rota(nao))).not.toContain("Abrir o saneamento deste projeto");
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

describe("Unificações", () => {
  const FILTRO = { situacao: "", tipo: "", busca: "", pagina: 1 };
  const resposta = (linhas, o = {}) => ({ linhas, pagina: 1, limite: 100, total: linhas.length, totalGeral: linhas.length, porSituacao: { PROPOSTA: 1, APROVADA: 1, AGUARDANDO: 0, REGISTRADA: 0 }, porTipo: { UNIFICACAO: 1, INATIVACAO: 1 }, comAlerta: 1, corteDefinido: true, ...o });
  const unif = { tipo: "UNIFICACAO", situacao: "PROPOSTA", casoId: "c1", morre: { codigo: "000456", estab: "", descricao: "SEMENTE SOJA", unidade: "SC", saldo: 4 }, fica: { codigo: "00123", descricao: "SEMENTE SOJA 40KG", unidade: "KG", saldo: 1234.5 }, saldoEntra: null, saldoConsolidado: null, acao: "Converter o saldo de 000456 para a unidade de 00123 (KG), transferir para 00123 e inativar 000456", inicio: "2026-12-31T00:00:00.000Z", justificativa: "Mesmo produto.", alertas: ["Unidades diferentes (SC × KG): saldo não somável direto; converter antes de somar (sem fator de conversão aprovado)."], responsavel: "", decididoEm: null };
  const inat = { tipo: "INATIVACAO", situacao: "APROVADA", casoId: "c2", morre: { codigo: "0789", estab: "", descricao: "PEÇA TRATOR", unidade: "UN", saldo: 0 }, fica: null, saldoEntra: null, saldoConsolidado: null, acao: "Inativar 0789", inicio: "2026-12-31T00:00:00.000Z", justificativa: "Sem movimento.", alertas: [], responsavel: "ana@fal.test", decididoEm: "2026-11-20T12:00:00.000Z" };
  it("carregando, erro e vazio", () => {
    expect(texto(montar(<Unificacoes projeto={projeto()} />))).toContain("Carregando");
    expect(texto(montar(<Unificacoes projeto={projeto()} />, (qc) => falhar(qc, chaves.unificacoes("p1", FILTRO))))).toContain("Não foi possível carregar as unificações");
    expect(texto(montar(<Unificacoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.unificacoes("p1", FILTRO), resposta([], { totalGeral: 0 }))))).toContain("Nenhuma unificação nem inativação ainda");
  });
  it("mapa: código que morre, que fica, saldos, situação, ação no ERP, alerta, filtro e download", () => {
    const t = texto(montar(<Unificacoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.unificacoes("p1", FILTRO), resposta([unif, inat]))));
    for (const x of ["Código que morre", "Código que fica", "Saldo consolidado", "Ação no ERP", "000456", "00123", "1.234,5", "Inativar 0789", "Proposta", "Aprovada", "converter antes de somar", "Baixar lista (Excel)", "Todas (2)", "Proposta (1)", "Unificação de códigos (1)", "1 linha(s) com alerta de coerência"]) expect(t, x).toContain(x);
    expect(t).not.toContain("c1");
    expect(t).not.toContain("corte de movimentação não está definido");
  });
  it("tabela densa: textos longos numa linha só, cortados com reticências e com o texto inteiro no título (sem células que quebram)", () => {
    const longa = "Conflito: o código que fica (00123) tem inativação aprovada (Qualidade, sem movimentação): a inativação também está neste mapa; reabrir ou rejeitar o caso de inativação antes de transferir o saldo.";
    const html = montar(<Unificacoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.unificacoes("p1", FILTRO), resposta([{ ...unif, alertas: [longa] }, inat])));
    expect(html).toContain(`title="${longa}"`);
    expect(html).toContain(`title="${unif.acao}"`);
    expect(html).toMatch(/class="[^"]*truncate[^"]*"[^>]*>Converter o saldo/);
    expect(html).not.toContain("min-w-[16rem]"); // a classe das colunas que quebram linha (linhas de mais de 100 px)
    expect(html).not.toMatch(/whitespace-normal/);
  });
  it("tipo da inativação diz a origem; base com saldo em escala é avisada", () => {
    const dup = { ...inat, casoId: "c3", morre: { ...inat.morre, codigo: "0790" }, origem: "DUPLICIDADE", rotuloTipo: "Inativação (duplicidade)" };
    const t = texto(montar(<Unificacoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.unificacoes("p1", FILTRO), resposta([{ ...inat, origem: "QUALIDADE", rotuloTipo: "Inativação (sem movimentação)" }, dup], { escalaSaldo: 1000000 }))));
    for (const x of ["Inativação (sem movimentação)", "Inativação (duplicidade)", "saldo multiplicado por 1.000.000"]) expect(t, x).toContain(x);
    const sem = texto(montar(<Unificacoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.unificacoes("p1", FILTRO), resposta([unif], { escalaSaldo: 1 }))));
    expect(sem).not.toContain("saldo multiplicado");
  });
  it("tabela no layout da aba Tabela: cabeçalho fixo, Tipo e Código que morre fixos, selos de situação, contador no topo e páginas", () => {
    const html = montar(<Unificacoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.unificacoes("p1", FILTRO), resposta([unif, inat])));
    const t = texto(html);
    for (const cls of [estiloTabela.area, estiloTabela.cabecalho, estiloTabela.tituloFixo, estiloTabela.linha, estiloTabela.celula]) expect(html, cls).toContain(cls);
    expect(html).toContain('role="table" aria-label="Unificações e inativações"');
    expect(html).toMatch(/class="sticky z-10[^"]*"[^>]*style="left:0/);
    expect(html).toMatch(/class="sticky z-10[^"]*"[^>]*style="left:190px/);
    expect(html).not.toContain('aria-label="Marcar todas"'); // somente leitura: sem caixas de marcar
    for (const x of ["Linhas 1 a 2 de 2.", "Página 1 de 1", "Anterior", "Próxima", "Buscar nesta lista", "Filtros por coluna", "Colunas", "Código (que morre ou que fica)", "Buscar"]) expect(t, x).toContain(x);
    expect(t).not.toContain("Limpar filtros");
    expect(html).toMatch(/border-orange-600\/50[^"]*"[^>]*>Proposta/); // selo de situação com cor e texto
    expect(html).toMatch(/border-emerald-600\/50[^"]*"[^>]*>Aprovada/);
    expect(t).not.toContain("com estes filtros");
  });
  it("sem corte definido, avisa que os itens parados não foram avaliados", () => {
    const t = texto(montar(<Unificacoes projeto={projeto()} />, (qc) => qc.setQueryData(chaves.unificacoes("p1", FILTRO), resposta([unif], { corteDefinido: false }))));
    expect(t).toContain("O corte de movimentação não está definido na Configuração");
  });
  it("Configuração: corte de movimentação editável, com o botão de explicação", () => {
    const html = montar(<Configuracao projeto={projeto({ parametros: { corteMovimentacao: "2024-01-01" } })} recarregar={() => {}} />);
    expect(html).toMatch(/<input id="san-cfg-corte" type="date"[^>]*value="2024-01-01"/);
    expect(html).toContain('aria-label="Sobre: Corte de movimentação"');
    expect(html).toContain('aria-controls="san-cfg-corte-info"');
  });
});
