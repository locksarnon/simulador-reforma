import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "a@b.c" } }) }));

import { api } from "@/api/client";
import { san } from "./api";
import { PermissaoContext } from "./comuns";
import Casos from "./Casos";
import PlanilhaDecisao, { aplicarEmRodadas, PainelPlanilha, temOQueAplicar } from "./PlanilhaDecisao";

const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const projeto = { id: "p1", modulos: { conciliacao: false } };
const montar = (ui, pode = true) => renderToStaticMarkup(
  <PermissaoContext.Provider value={{ podeAlterar: pode }}>
    <QueryClientProvider client={new QueryClient()}><StaticRouter location="/">{ui}</StaticRouter></QueryClientProvider>
  </PermissaoContext.Provider>,
);
const previa = {
  arquivo: { nome: "decisao.xlsx", sha: "abc123abc123" }, linhas: 5,
  contagem: { aprovar: 2, rejeitar: 1, pedirInformacao: 0, semDecisao: 1, recusadas: 1, jaAplicadas: 0 },
  recusadas: [{ linha: 9, casoId: "k9", tipo: "NCM_INEXISTENTE", codigo: "000123", motivo: "O caso mudou depois que a planilha foi gerada (versão 1 na planilha, 2 agora). Baixe a planilha de novo." }],
};

describe("Planilha de decisão: tela", () => {
  it("a aba Casos traz o botão ao lado do lote", () => {
    expect(texto(montar(<Casos projeto={{ ...projeto, versao: 1 }} />))).toContain("Planilha de decisão");
  });

  it("o botão abre o diálogo (fechado, só o botão)", () => {
    const t = texto(montar(<PlanilhaDecisao projeto={projeto} camada="NCM" />));
    expect(t).toContain("Planilha de decisão");
    expect(t).not.toContain("Baixar planilha da camada");
  });

  it("sem camada (filtro Todas): pede a camada e trava baixar e reimportar; o campo de arquivo é o padrão do InTAX", () => {
    const html = montar(<PainelPlanilha projeto={projeto} camadaInicial="" />);
    expect(texto(html)).toContain("escolha a camada acima");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^]*?Baixar planilha da camada/);
    expect(html).toContain('role="button"'); // CampoArquivo
    expect(texto(html)).not.toContain("Estoque"); // módulo desligado
  });

  it("com camada: baixar habilitado; prévia com as contagens, a tabela das recusadas e o botão de aplicar", () => {
    const html = montar(<PainelPlanilha projeto={projeto} camadaInicial="NCM" inicial={{ previa, arquivo: "decisao.xlsx" }} />);
    const t = texto(html);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>[^]*?Baixar planilha da camada/);
    for (const r of ["a aprovar", "a rejeitar", "com pedido de informação", "sem decisão", "recusadas", "já aplicadas"]) expect(t).toContain(r);
    expect(t).toContain("000123 · NCM inexistente");
    expect(t).toContain("O caso mudou depois que a planilha foi gerada");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Aplicar as decisões/);
  });

  it("sem permissão de alterar, ou sem decisão válida, não aplica", () => {
    expect(montar(<PainelPlanilha projeto={projeto} camadaInicial="NCM" inicial={{ previa }} />, false)).toMatch(/<button[^>]*disabled=""[^>]*>Aplicar as decisões/);
    const vazia = { ...previa, contagem: { ...previa.contagem, aprovar: 0, rejeitar: 0 } };
    expect(temOQueAplicar(vazia)).toBe(false);
    expect(temOQueAplicar(previa)).toBe(true);
  });

  it("resultado: o que foi aplicado e as linhas que ficaram de fora", () => {
    const resultado = { aplicadas: { aprovar: 2, rejeitar: 1, pedirInformacao: 0 }, recusadas: previa.recusadas, restantes: 0 };
    const t = texto(montar(<PainelPlanilha projeto={projeto} camadaInicial="NCM" inicial={{ resultado }} />));
    expect(t).toContain("2 aprovado(s), 1 rejeitado(s), 0 com pedido de informação");
    expect(t).toContain("1 linha(s) não foram aplicadas");
  });
});

describe("Planilha de decisão: fluxo", () => {
  it("as chamadas vão às rotas da camada, com o arquivo e a confirmação", async () => {
    const upload = vi.spyOn(api, "upload").mockResolvedValue({});
    const baixar = vi.spyOn(api, "baixar").mockResolvedValue(undefined);
    const arq = { name: "decisao.xlsx" };
    await san.baixarPlanilhaDecisao("p1", "NCM");
    await san.previaPlanilhaDecisao("p1", "NCM", arq);
    await san.aplicarPlanilhaDecisao("p1", "NCM", arq);
    expect(baixar).toHaveBeenCalledWith("GET", "/saneamento-estoques/projetos/p1/camadas/NCM/planilha", expect.objectContaining({ nomeDoServidor: true }));
    expect(upload).toHaveBeenNthCalledWith(1, "/saneamento-estoques/projetos/p1/camadas/NCM/planilha/previa", arq);
    expect(upload).toHaveBeenNthCalledWith(2, "/saneamento-estoques/projetos/p1/camadas/NCM/planilha/aplicar", arq, { confirmar: "true" });
    upload.mockRestore(); baixar.mockRestore();
  });

  it("aplica em rodadas até acabar, somando o que foi aplicado; as recusas são as da última rodada", async () => {
    const respostas = [
      { aplicadas: { aprovar: 2, rejeitar: 0, pedirInformacao: 0 }, recusadas: [{ linha: 9, motivo: "x" }], restantes: 3 },
      { aplicadas: { aprovar: 1, rejeitar: 2, pedirInformacao: 0 }, recusadas: [{ linha: 9, motivo: "x" }], restantes: 0 },
    ];
    const chamar = vi.fn(async () => respostas.shift());
    const progresso = [];
    const r = await aplicarEmRodadas(chamar, { aoProgresso: (p) => progresso.push(p) });
    expect(chamar).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ aplicadas: { aprovar: 3, rejeitar: 2, pedirInformacao: 0 }, restantes: 0, rodadas: 2 });
    expect(r.recusadas).toHaveLength(1);
    expect(progresso.at(-1)).toMatchObject({ aprovar: 3, restantes: 0 });
  });

  it("para quando a rodada não anda (evita repetir sem fim)", async () => {
    const chamar = vi.fn(async () => ({ aplicadas: { aprovar: 0, rejeitar: 0, pedirInformacao: 0 }, recusadas: [], restantes: 4 }));
    const r = await aplicarEmRodadas(chamar);
    expect(chamar).toHaveBeenCalledTimes(1);
    expect(r.restantes).toBe(4);
  });
});
