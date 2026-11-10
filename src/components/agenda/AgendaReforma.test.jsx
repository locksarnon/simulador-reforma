import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import AgendaReforma from "./AgendaReforma";
import LembretesAgenda from "./LembretesAgenda";

const FONTE_LC214 = {
  instrumento: "Lei Complementar nº 214, de 16 de janeiro de 2025", dispositivo: "art. 381, § 4º, I", data: "2025-01-16", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm",
  trecho: "deverá ser apurado e apropriado até o último dia de junho de 2027", norma_chave: "lcp-214-2025", caminho: "art-381",
};
const FONTE_CGSN = { instrumento: "Resolução CGSN nº 194, de 25 de setembro de 2026", dispositivo: "art. 2º", data: "2026-09-25", url: "https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/153801", trecho: "poderá ser cancelada pelo solicitante em caráter irretratável", norma_chave: null, caminho: null };

const marco = (extra) => ({
  id: extra.chave, titulo: extra.chave, descricao: "Descrição do marco.", categoria: "Transição", tipo: "marco", data: "2027-01-01", data_fim: null, regimes: [], ufs: [],
  fontes: [FONTE_LC214], confirmado: true, lida_em: "2026-11-10", observacao: null, situacao: "futuro", dias_para: 52, em_revisao: [], ...extra,
});

const RESPOSTA = (marcos, extra = {}) => ({
  hoje: "2026-11-10", filtros: {}, empresa: null, total: marcos.length, marcos,
  opcoes: { regimes: ["Lucro Real", "Lucro Presumido", "Simples Nacional", "Produtor rural PF"], ufs: ["AM", "SP"], categorias: ["Transição", "Simples Nacional"] }, ...extra,
});

const FILTROS_VAZIOS = { empresaId: "", regime: "", uf: "", categoria: "", passados: false };

function desenhar({ resposta, filtros = FILTROS_VAZIOS, props = {}, empresas = [] }) {
  const qc = new QueryClient();
  qc.setQueryData(["agenda-reforma", filtros], resposta);
  qc.setQueryData(["agenda-empresas"], empresas);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><StaticRouter location="/"><AgendaReforma {...props} /></StaticRouter></QueryClientProvider>);
}

describe("Agenda da Reforma: tela", () => {
  const marcos = [
    marco({ chave: "simples-cancelamento", titulo: "Cancelamento irretratável da opção pelo Simples Nacional", categoria: "Simples Nacional", tipo: "prazo", data: "2026-11-03", data_fim: "2026-12-20", regimes: ["Simples Nacional"], situacao: "em_andamento", dias_para: 40, fontes: [FONTE_CGSN] }),
    marco({ chave: "zfm", titulo: "Zona Franca de Manaus", categoria: "Zona Franca de Manaus", ufs: ["AM"], data: "2027-01-01" }),
    marco({ chave: "percentuais", titulo: "Percentuais do crédito presumido", tipo: "prazo", data: "2027-09-01", data_fim: "2027-09-30", confirmado: false, lida_em: null, observacao: "A lei indica o mês, não o dia: não confirmado em fonte oficial.", dias_para: 323 }),
  ];

  it("agrupa por mês e mostra, em cada data, a fonte oficial com o link da Base legal e o endereço oficial", () => {
    const html = desenhar({ resposta: RESPOSTA(marcos) });
    expect(html).toContain("novembro de 2026");
    expect(html).toContain("janeiro de 2027");
    expect(html).toContain("setembro de 2027");
    expect(html).toContain("de 03/11/2026 a 20/12/2026");
    expect(html).toContain("termina em 40 dias");
    expect(html).toContain("Lei Complementar nº 214, de 16 de janeiro de 2025, art. 381, § 4º, I (ato de 16/01/2025)");
    expect(html).toContain('href="/base-legal/lcp-214-2025/art-381"');
    expect(html).toContain('href="https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/153801"');
    expect(html).toContain("“deverá ser apurado e apropriado até o último dia de junho de 2027”");
    expect(html).toContain("Data conferida no texto oficial em 10/11/2026.");
  });

  it("mostra a quem a data se aplica e marca o que não foi confirmado em fonte oficial", () => {
    const html = desenhar({ resposta: RESPOSTA(marcos) });
    expect(html).toContain("Simples Nacional"); // regime
    expect(html).toContain("Todos os regimes");
    expect(html).toContain("UF: AM");
    expect(html.split("Não confirmado em fonte oficial").length - 1).toBe(1); // o selo do marco não confirmado
    expect(html).toContain("A lei indica o mês, não o dia");
  });

  it("tem os filtros de regime, UF e assunto, o calendário e os lembretes; o botão de carregar as datas é só do administrador", () => {
    const comum = desenhar({ resposta: RESPOSTA(marcos) });
    for (const t of ["Regime tributário", "Lucro Presumido", "Produtor rural PF", ">UF<", ">AM<", "Assunto", "Mostrar datas já passadas", "Baixar calendário (.ics)", "Lembretes por e-mail", "Nenhuma (filtrar à mão)"]) expect(comum, t).toContain(t);
    expect(comum).not.toContain("Atualizar datas oficiais");
    expect(desenhar({ resposta: RESPOSTA(marcos), props: { admin: true } })).toContain("Atualizar datas oficiais");
  });

  it("na aba da empresa, regime e UF vêm do cadastro e não se escolhem", () => {
    const empresa = { id: "e1", razao_social: "Alfa Simples Ltda", regime_atual: "Simples Nacional", uf: "SP" };
    const resposta = RESPOSTA([marcos[0]], { empresa: { ...empresa, sem_regime: false, sem_uf: false } });
    const html = desenhar({ resposta, filtros: { ...FILTROS_VAZIOS, empresaId: "e1" }, props: { empresa } });
    expect(html).not.toContain("Nenhuma (filtrar à mão)");
    expect(html).toContain('<option value="" selected="">Simples Nacional</option>');
    expect(html).toContain('<option value="" selected="">SP</option>');
    expect(html.match(/disabled=""/g)?.length).toBe(2);
    expect(html).not.toContain("está sem");
  });

  it("empresa sem regime ou sem UF no cadastro recebe o aviso de que só aparecem as datas gerais", () => {
    const empresa = { id: "e3", razao_social: "Gama", regime_atual: null, uf: null };
    const resposta = RESPOSTA([], { empresa: { ...empresa, sem_regime: true, sem_uf: true } });
    const html = desenhar({ resposta, filtros: { ...FILTROS_VAZIOS, empresaId: "e3" }, props: { empresa } });
    expect(html).toContain("O cadastro da empresa está sem regime tributário e UF: só aparecem as datas que valem para todos.");
  });

  it("sem datas para o filtro: o administrador é orientado a carregar a agenda, o consultor a pedir", () => {
    const vazio = RESPOSTA([]);
    expect(desenhar({ resposta: vazio, props: { admin: true } })).toContain("use Atualizar datas oficiais");
    const consultor = desenhar({ resposta: vazio });
    expect(consultor).toContain("Nenhuma data para estes filtros.");
    expect(consultor).toContain("peça a um administrador");
  });

  it("data cuja fonte mudou na Base legal vem com o aviso; só o administrador vê o botão de conferir", () => {
    const emRevisao = marco({ chave: "estoque", titulo: "Prazo do estoque", em_revisao: [{ id: "r1", norma: "lcp-214-2025", numero: "LC 214/2025", caminho: "art-381", rotulo: "Art. 381", mudanca: "alterado", detalhe: "O texto do dispositivo mudou.", mudou_em: "2026-11-12T15:00:00.000Z" }] });
    const comum = desenhar({ resposta: RESPOSTA([emRevisao]) });
    expect(comum).toContain("Fonte em revisão");
    expect(comum).toContain("O texto da lei citado como fonte mudou depois da última conferência desta data");
    expect(comum).toContain("(LC 214/2025) alterado em 12/11/2026. O texto do dispositivo mudou.");
    expect(comum).toContain("Confirme a data no texto oficial antes de agir.");
    expect(comum).not.toContain("Marcar como conferido");
    expect(desenhar({ resposta: RESPOSTA([emRevisao]), props: { admin: true } })).toContain("Marcar como conferido");
    expect(comum).not.toContain("não gera lembrete por e-mail");
  });

  it("fonte revogada ou trecho fora do texto da lei: a data pode ter deixado de valer e não gera lembrete", () => {
    const critica = marco({ chave: "estoque", titulo: "Prazo do estoque", em_revisao: [{ id: "r1", norma: "lcp-214-2025", numero: "LC 214/2025", caminho: "art-381", rotulo: "Art. 381", mudanca: "alterado", detalhe: "O trecho de onde a data foi lida não consta mais no texto do dispositivo.", critica: true, mudou_em: "2026-11-12T15:00:00.000Z" }] });
    const html = desenhar({ resposta: RESPOSTA([critica]) });
    expect(html).toContain("A data pode ter deixado de valer");
    expect(html).toContain("Enquanto não for conferida, esta data não gera lembrete por e-mail.");
    expect(html).toContain("border-red-500/50");
  });
});

describe("Agenda da Reforma: lembretes por e-mail", () => {
  const DADOS = {
    email_configurado: false, dias_padrao: [30, 7, 1], dias_permitidos: [60, 30, 15, 7, 3, 1, 0],
    lembretes: [
      { id: "L1", escopo: "todas", empresa: null, dias_antes: [30, 7, 1], ativo: true },
      { id: "L2", escopo: "e1", empresa: "Alfa Simples Ltda", dias_antes: [7], ativo: false },
    ],
  };
  function painel(dados, empresa) {
    const qc = new QueryClient();
    qc.setQueryData(["agenda-lembretes"], dados);
    return renderToStaticMarkup(<QueryClientProvider client={qc}><LembretesAgenda empresa={empresa} /></QueryClientProvider>);
  }

  it("lista os lembretes da pessoa, com o escopo e as antecedências, e avisa quando o e-mail não está configurado", () => {
    const html = painel(DADOS, null);
    expect(html).toContain("Lembretes por e-mail");
    expect(html).toContain("O envio de e-mail ainda não está configurado no servidor");
    expect(html).toContain("Todas as empresas");
    expect(html).toContain("30 dias antes, 7 dias antes, 1 dia antes");
    expect(html).toContain("Alfa Simples Ltda");
    expect(html).toContain("pausado");
    expect(html).toContain("Reativar");
    expect(html).toContain("Pausar");
  });

  it("oferece as antecedências (30, 7 e 1 dia já marcadas), salvar e o e-mail de teste", () => {
    const html = painel({ ...DADOS, email_configurado: true, lembretes: [] }, null);
    expect(html).not.toContain("ainda não está configurado");
    for (const t of ["60 dias antes", "15 dias antes", "3 dias antes", "no dia", "Salvar lembrete", "Enviar e-mail de teste para mim"]) expect(html, t).toContain(t);
    expect(html.match(/checked=""/g)?.length).toBe(3);
  });

  it("quem já tem lembrete para o escopo vê as antecedências que escolheu, não o padrão", () => {
    const html = painel({ ...DADOS, lembretes: [{ id: "L1", escopo: "todas", empresa: null, dias_antes: [7], ativo: true }] }, null);
    expect(html.match(/checked=""/g)?.length).toBe(1);
    expect(html).toContain('<input type="checkbox" checked=""/> 7 dias antes');
  });

  it("com uma empresa em foco, deixa escolher entre todas as empresas e ela", () => {
    const html = painel({ ...DADOS, lembretes: [] }, { id: "e1", razao_social: "Alfa Simples Ltda" });
    expect(html).toContain("Avisar sobre");
    expect(html).toContain('<option value="e1" selected="">Alfa Simples Ltda</option>');
  });
});
