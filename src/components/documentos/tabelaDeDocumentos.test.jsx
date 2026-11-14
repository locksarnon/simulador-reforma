import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TabelaDeDocumentos, { abreNoNavegador, formatoDoNome } from "./TabelaDeDocumentos";

const montar = (props) => {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  return renderToString(<QueryClientProvider client={qc}><TabelaDeDocumentos id="t" ariaLabel="Documentos" {...props} /></QueryClientProvider>).replace(/<!-- -->/g, "");
};
const linha = (id, nome, pasta = "") => ({ id, documento: nome, pasta, formato: formatoDoNome(nome), tamanho: 2048, data: "2026-11-10T12:00:00Z", url: `/documentos/arquivos/${id}/download`, nome, ver: abreNoNavegador(nome), item: { tipo: "arquivo", arquivo_id: id } });

describe("tabela de documentos (a mesma no Monitoramento e em Arquivos e documentos)", () => {
  it("marca, baixa em ZIP e envia por e-mail; Ver e Baixar no fim da linha; pasta e colunas extras quando pedidas", () => {
    const html = montar({
      linhas: [linha("a1", "CND federal.pdf", "Certidões"), linha("a2", "EFD 2026-01.txt", "SPED/EFD")], envioBase: "/monitoramento/empresas/E1", mostrarPasta: true, mostrarOrigem: false,
      colunasExtras: [{ chave: "enviado_por", rotulo: "Enviado por", valor: () => "qa@fal" }],
    });
    expect(html).toContain('aria-label="Marcar todas"');
    expect(html).toContain("Marque os documentos para baixar ou enviar por e-mail.");
    for (const r of [">Documento<", ">Pasta<", ">Formato<", ">Tamanho<", ">Enviado por<"]) expect(html).toContain(r);
    expect(html).not.toContain(">Origem<");
    expect(html).toContain('aria-label="Ver CND federal.pdf"');
    expect(html).toContain('aria-label="Baixar EFD 2026-01.txt"');
    expect(html).toContain("SPED/EFD");
  });

  it("sem envioBase a tabela só lista (sem marcar nem enviar)", () => {
    const html = montar({ linhas: [linha("a1", "x.zip")] });
    expect(html).not.toContain('aria-label="Marcar todas"');
    expect(html).not.toContain('aria-label="Ver x.zip"'); // ZIP não abre no navegador
  });

  it("formato e o que abre no navegador vêm do nome do arquivo", () => {
    expect(formatoDoNome("recibo.REC")).toBe("REC");
    expect(formatoDoNome("sem-extensao")).toBe("");
    expect(abreNoNavegador("a.pdf")).toBe(true);
    expect(abreNoNavegador("a.xlsx")).toBe(false);
  });
});
