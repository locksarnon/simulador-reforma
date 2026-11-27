import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { ChecklistDocumentos } from "./SolicitacoesConsultoria";
import { linhasDoPeriodo, situacaoDasLinhas, textoDasPendencias } from "@/lib/consultoriaDocumentos";

const S = "saneamento-estoques";
const PER = "2026-12-31/2026-12-31";
const evid = [{ arquivo: "cadastro.xlsx", usuario: "ana@fal", data: "2026-11-20T10:00:00.000Z" }];
const AUTOMATICOS = [
  { item: "Cadastro de itens do ERP", periodo: PER, cobertura: "TOTAL", situacao: "RECEBIDO", faltam: [], colunas: [{ rotulo: "Código", coluna: "ItemCode", arquivo: "cadastro.xlsx" }], evidencias: evid, atualizado_em: evid[0].data, prevalece: true },
  { item: "Saldo de estoque na data-base", periodo: PER, cobertura: "TOTAL", situacao: "RECEBIDO", faltam: [], colunas: [{ rotulo: "Saldo", coluna: "OnHand", arquivo: "cadastro.xlsx" }], evidencias: evid, atualizado_em: evid[0].data, prevalece: true },
  { item: "Tabela de equivalência de códigos", periodo: PER, cobertura: "PARCIAL", situacao: "PENDENTE", faltam: ["Fabricante"], colunas: [{ rotulo: "Referência", coluna: "Ref", arquivo: "cadastro.xlsx" }], evidencias: evid, atualizado_em: evid[0].data, prevalece: true },
];
const linhas = (dados) => situacaoDasLinhas(linhasDoPeriodo(S, "2026-12-31", "2026-12-31"), { arquivos: [], controles: [], sped: [], automaticos: AUTOMATICOS, ...dados });
const html = (l) => renderToString(<ChecklistDocumentos linhas={l} />).replace(/<!-- -->/g, "");
const doGrupo = (l, g) => l.filter((x) => x.grupo === g).map((x) => x.item);

describe("Documentos do projeto: situação automática pela importação do Saneamento", () => {
  it("coberto pela importação vira Recebido automático; parcial e sem evidência ficam pendentes", () => {
    const l = linhas();
    expect(doGrupo(l, "COBERTO")).toEqual(["Cadastro de itens do ERP", "Saldo de estoque na data-base"]);
    expect(doGrupo(l, "PENDENTE")).toContain("Tabela de equivalência de códigos");
    expect(doGrupo(l, "PENDENTE")).toHaveLength(6);
    expect(l.find((x) => x.item === "Cadastro de itens do ERP")).toMatchObject({ situacao: "RECEBIDO", origem: "AUTOMATICO" });
  });

  it("controle manual mais novo que a importação vence (etiqueta manual); controle antigo perde para a importação", () => {
    const manual = { item: "Saldo de estoque na data-base", periodo: PER, situacao: "DIVERGENTE", arquivo_id: null };
    const automaticos = AUTOMATICOS.map((a) => a.item === manual.item ? { ...a, prevalece: false } : a);
    const saldo = linhas({ controles: [manual], automaticos }).find((x) => x.item === manual.item);
    expect(saldo).toMatchObject({ situacao: "DIVERGENTE", origem: "MANUAL", grupo: "PENDENTE" });
    expect(linhas({ controles: [manual] }).find((x) => x.item === manual.item)).toMatchObject({ situacao: "RECEBIDO", origem: "AUTOMATICO" });
  });

  it("agrupa: Pendente aberto com o que falta; Coberto pela importação fechado numa linha, com a evidência no lugar do seletor de arquivo", () => {
    const h = html(linhas());
    expect(h).toContain("Pendente (6)");
    expect(h).toContain("Coberto pela importação (2): Cadastro de itens do ERP · Saldo de estoque na data-base");
    expect(h).toMatch(/<details[^>]*><summary[^>]*>Coberto pela importação/);
    expect(h).not.toMatch(/<details[^>]*open/);
    expect(h).toContain("automático");
    expect(h).toContain("Importação no Saneamento: cadastro.xlsx (20/11/2026, ana@fal). Colunas: Saldo ← OnHand.");
    expect(h).toContain("Recebido em parte. Faltam: Fabricante.");
    // Linha coberta: sem seletor de arquivo. Linha pendente: com seletor.
    expect(h).not.toContain('aria-label="Evidência para Saldo de estoque na data-base');
    expect(h).toContain('aria-label="Evidência para Movimentação dos itens');
    // Um período por documento (data-base): sem a coluna Período.
    expect(h).not.toContain(">Período<");
  });

  it("lista de pendências: só o que falta, e o parcial diz o que ainda falta", () => {
    const t = textoDasPendencias(linhas());
    expect(t).not.toContain("Cadastro de itens do ERP");
    expect(t).not.toContain("Saldo de estoque na data-base");
    expect(t).toContain("Tabela de equivalência de códigos — de-para de fornecedor, fabricante e códigos paralelos, se existir. (recebido em parte; faltam: Fabricante)");
    expect(t.split("\n")).toHaveLength(6);
  });

  it("sem importação: tudo pendente e nenhum grupo de cobertos", () => {
    const h = html(linhas({ automaticos: [] }));
    expect(h).toContain("Pendente (8)");
    expect(h).not.toContain("Coberto pela importação");
  });
});
