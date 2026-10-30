import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import ListaSolicitacoesButton from "./ListaSolicitacoesButton";
import { SERVICOS } from "@/lib/servicosEmpresa";

describe("botão da lista de solicitações no cartão do serviço", () => {
  it("aparece em todos os serviços da tela Serviços e análises", () => {
    for (const [rota] of SERVICOS) {
      const html = renderToString(<ListaSolicitacoesButton servico={rota} empresa={{ razao_social: "Empresa A" }} />);
      expect(html, rota).toContain("Lista de solicitações (Excel)");
    }
  });

  it("não mostra nada para um serviço sem lista", () => {
    expect(renderToString(<ListaSolicitacoesButton servico="servico-inexistente" empresa={{}} />)).toBe("");
  });
});
