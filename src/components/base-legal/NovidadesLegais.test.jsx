import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it } from "vitest";
import { TabelaDeNovidades } from "./NovidadesLegais";
import { EstadoDaRotina, DetalheDaRodada, TabelaDeFontes, TabelaDeRodadas } from "./RevisaoSemanalPainel";
import { urlOficial } from "./AlertasBaseLegal";
import { CabecalhoDaNorma, SituacaoDoDispositivo } from "@/pages/BaseLegalNormaPage";

const nov = (extra) => ({
  id: "n1", tipo: "alteracao", origem: "texto_oficial", norma_chave: "lcp-214-2025", norma_numero: "LC 214/2025", caminho: null, rotulo: null,
  titulo: "LC 214/2025: 3 dispositivos alterados pela LC 239/2026", resumo: "Art. 5º, Art. 7º, Art. 9º", ato: "LC 239/2026", ato_ref: "lc 239/2026",
  url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm", oficial: true, confirmada: true, status: "nova", detectada_em: "2026-11-24T08:00:00.000Z",
  detalhes: [{ rotulo: "Art. 5º", caminho: "art-5" }, { rotulo: "Art. 7º", caminho: "art-7" }], ...extra,
});
const html = (el) => renderToStaticMarkup(<StaticRouter location="/">{el}</StaticRouter>);

describe("tabela das novidades", () => {
  it("mostra tipo, norma, o que mudou com os dispositivos que dá para abrir, o ato e a fonte oficial", () => {
    const h = html(<TabelaDeNovidades itens={[nov()]} />);
    expect(h).toContain("Alteração");
    expect(h).toContain('href="/base-legal/lcp-214-2025"');
    expect(h).toContain("LC 214/2025: 3 dispositivos alterados pela LC 239/2026");
    expect(h).toContain('href="/base-legal/lcp-214-2025/art-5"');
    expect(h).toContain("LC 239/2026");
    expect(h).toContain("Texto oficial");
    expect(h).toContain("Fonte oficial");
    expect(h).not.toContain("a confirmar");
  });

  it("o que veio da pesquisa na web aparece como “a confirmar”; os botões de curadoria são só do administrador", () => {
    const web = nov({ id: "n2", tipo: "regulamentacao", origem: "busca_web", confirmada: false, norma_chave: null, norma_numero: null, detalhes: [] });
    const comum = html(<TabelaDeNovidades itens={[web]} />);
    expect(comum).toContain("a confirmar");
    expect(comum).toContain("Pesquisa na web");
    expect(comum).not.toContain("Confirmar");
    expect(comum).not.toContain("Descartar");
    const admin = html(<TabelaDeNovidades itens={[web, nov({ status: "descartada" })]} admin />);
    expect(admin).toContain("Confirmar");
    expect(admin).toContain("Descartar");
    expect(admin).toContain("Reabrir");
    expect(admin).toContain("Vista");
  });

  it("portal atualizado lista os documentos novos com link para a fonte", () => {
    const portal = nov({ tipo: "fonte_atualizada", origem: "fonte_monitorada", norma_chave: null, norma_numero: null, titulo: "NFS-e nacional: 2 documentos novos", detalhes: [{ rotulo: "Nota Técnica 004", url: "https://www.gov.br/nfse/nt004.pdf" }, { rotulo: "Perigo", url: "javascript:alert(1)" }] });
    const h = html(<TabelaDeNovidades itens={[portal]} />);
    expect(h).toContain("Portal atualizado");
    expect(h).toContain('href="https://www.gov.br/nfse/nt004.pdf"');
    expect(h).not.toContain("javascript:");
  });
});

describe("revisão semanal", () => {
  const rodada = (extra) => ({
    id: "r1", semana: "2026-S48", disparo: "agendada", status: "concluida", iniciado_em: "2026-11-23T08:00:00.000Z", concluido_em: "2026-11-23T08:06:00.000Z",
    resumo: "70 normas conferidas, 13 fontes oficiais: 2 normas atualizadas.", normas_verificadas: 70, normas_atualizadas: 2, normas_novas: 0, dispositivos_alterados: 12,
    dispositivos_revogados: 3, atos_relacionados: 4, fontes_verificadas: 13, fontes_alteradas: 1, erros: [], ...extra,
  });

  it("estado da rotina: ligada, atualização automática e pesquisa na web", () => {
    const h = html(<EstadoDaRotina estado={{ ligada: true, aplica_automaticamente: false, pesquisa_na_web: true, em_andamento: true, agenda: "Toda segunda-feira, às 5h (horário de Brasília)" }} />);
    expect(h).toContain("Toda segunda-feira, às 5h (horário de Brasília)");
    expect(h).toContain("As mudanças viram avisos para o administrador aprovar.");
    expect(h).toContain("Uma revisão está em andamento neste momento.");
    expect(EstadoDaRotina({ estado: null })).toBeNull();
  });

  it("histórico: semana, duração, situação e erros; o detalhe lista o que não deu para conferir e o que foi registrado", () => {
    const h = html(<TabelaDeRodadas rodadas={[rodada(), rodada({ id: "r2", semana: "2026-S47", status: "parcial", erros: ["LC 123/2006: Fonte oficial respondeu 503"] })]} />);
    expect(h).toContain("2026-S48");
    expect(h).toContain("6 min");
    expect(h).toContain("Concluída com erros");
    const d = html(<DetalheDaRodada rodada={rodada({ erros: ["LC 123/2006: Fonte oficial respondeu 503"], novidades: [nov(), nov({ id: "n3", confirmada: false, norma_chave: null, titulo: "IN RFB nova" })] })} />);
    expect(d).toContain("Não foi possível conferir (1)");
    expect(d).toContain("LC 123/2006: Fonte oficial respondeu 503");
    expect(d).toContain("O que a rodada registrou (2)");
    expect(d).toContain("a confirmar");
  });

  it("portais acompanhados: última leitura, situação e erro", () => {
    const h = html(<TabelaDeFontes fontes={[
      { id: "f1", chave: "cgibs-resolucoes", titulo: "CGIBS: resoluções", url: "https://www.cgibs.gov.br/resolucoes", grupo: "reforma", verificada_em: "2026-11-23T08:01:00.000Z", alterada_em: null, erro: null },
      { id: "f2", chave: "carf", titulo: "CARF: jurisprudência", url: "https://www.gov.br/carf", grupo: "operacional", verificada_em: null, alterada_em: null, erro: "página sem lista de links" },
    ]} />);
    expect(h).toContain("CGIBS: resoluções");
    expect(h).toContain("Reforma do consumo");
    expect(h).toContain("Com erro: página sem lista de links");
  });
});

describe("leitor da norma", () => {
  const norma = { chave: "lcp-214-2025", numero: "LC 214/2025", data_publicacao: "2025-01-16", capturada_em: "2026-11-23T08:00:00.000Z", atualizada_em: "2026-11-22T10:00:00.000Z", situacao: "parcialmente_revogada", formato: "pdf", atos_modificadores: [{ ato: "LC 227/2026", referencia: "lc 227/2026", dispositivos: 130, tipos: ["redacao", "revogacao"] }] };

  it("cabeçalho: situação, atos que alteraram e novidades abertas com o link para ver todas", () => {
    const h = html(<CabecalhoDaNorma norma={norma} total={609} chave="lcp-214-2025" novidades={[nov({ tipo: "nao_consolidada", titulo: "LC 239/2026 altera a LC 214/2025, mas o texto compilado ainda não traz a mudança" }), nov({ id: "x", status: "descartada" })]} />);
    expect(h).toContain("Em vigor (parte revogada)");
    expect(h).toContain("texto lido de PDF oficial");
    expect(h).toContain("Alterada por 1 ato");
    expect(h).toContain("LC 227/2026: 130 dispositivos (nova redação, revogação)");
    expect(h).toContain("Ainda não consolidada");
    expect(h).toContain('href="/base-legal?aba=novidades&amp;norma=lcp-214-2025"');
    expect(h.split("alterados pela LC 239/2026").length - 1).toBe(0); // a descartada não aparece
  });

  it("dispositivo: aviso de alteração não consolidada, histórico oficial, redação anterior riscada, temas e remissões", () => {
    const disp = {
      norma: { situacao: "vigente" },
      dispositivo: {
        alteracoes: [{ tipo: "redacao", trecho: "(Redação dada pela Lei Complementar nº 227, de 2026)" }], temas: ["split_payment", "tema_novo"],
        redacoes_anteriores: ["Texto que valia antes."],
      },
      avisos: [{ id: "a1", titulo: "LC 239/2026 altera a LC 214/2025, mas o texto compilado ainda não traz a mudança", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp239.htm" }],
      cita: [{ referencia: "lc 214/2025", caminho: "art-38", norma: { chave: "lcp-214-2025", numero: "LC 214/2025" } }, { referencia: "lei 9430/1996", caminho: "art-81", norma: null }],
      citado_por: [{ rotulo: "Art. 4º", caminho: "art-4", norma: { chave: "res-cgibs-6", numero: "Res. CGIBS 6/2026" } }],
    };
    const h = html(<SituacaoDoDispositivo disp={disp} chave="lcp-214-2025" />);
    expect(h).toContain("Alteração ainda não consolidada no texto compilado");
    expect(h).toContain('href="https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp239.htm"');
    expect(h).toContain("Histórico oficial:");
    expect(h).toContain("Redação dada pela Lei Complementar nº 227, de 2026");
    expect(h).toContain("Redação anterior (estava riscada no texto oficial; não vale mais)");
    expect(h).toContain("Texto que valia antes.");
    expect(h).toContain("Split payment");
    expect(h).toContain("tema_novo");
    expect(h).toContain('href="/base-legal/lcp-214-2025/art-38"');
    expect(h).toContain("LEI 9430/1996, Art. 81 (fora da base)");
    expect(h).toContain('href="/base-legal/res-cgibs-6/art-4"');
  });

  it("norma revogada: o leitor avisa que o texto é histórico", () => {
    const h = html(<SituacaoDoDispositivo disp={{ norma: { situacao: "revogada", revogada_por: "Lei 15.000/2026" }, dispositivo: {}, avisos: [], cita: [], citado_por: [] }} chave="x" />);
    expect(h).toContain("Esta norma consta como revogada pelo Lei 15.000/2026. O texto abaixo é histórico.");
  });
});

describe("endereço oficial do aviso de norma nova", () => {
  it("aceita qualquer órgão oficial por https, como o servidor, e recusa o resto", () => {
    for (const u of ["https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp239.htm", "https://normas.receita.fazenda.gov.br/sijut2consulta/x", "https://www.cgibs.gov.br/upload/a.pdf", "https://www2.camara.leg.br/legin/x", "https://www.stf.jus.br/x"]) expect(urlOficial(u), u).toBe(true);
    for (const u of ["http://www.planalto.gov.br/x", "https://exemplo.com.br/x", "https://gov.br.malicioso.com/x", "https://user:senha@www.gov.br/x", "https://www.gov.br:8443/x", "javascript:alert(1)", ""]) expect(urlOficial(u), u).toBe(false);
  });
});
