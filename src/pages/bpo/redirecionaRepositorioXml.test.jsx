import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { Route, Routes } from "react-router-dom";
import appFonte from "@/App.jsx?raw";

// No servidor o <Navigate> não faz nada (só navega em efeito); aqui ele vira um marcador com o destino e o modo.
vi.mock("react-router-dom", async (importarOriginal) => ({
  ...(await importarOriginal()),
  Navigate: ({ to, replace }) => React.createElement("i", { "data-para": to, "data-troca": String(!!replace) }),
}));

const RedirecionaRepositorioXml = (await import("./RedirecionaRepositorioXml")).default;

describe("endereço antigo do Repositório de XML", () => {
  it("leva da aba antiga da empresa ao repositório novo, trocando a entrada do histórico", () => {
    const html = renderToString(
      <StaticRouter location="/workroom/cmvbh86fi0002mv437b4uq0tg/empresas/cmvjo7god0000pp42bgborr4h/repositorio-xml">
        <Routes><Route path="/workroom/:id/empresas/:empresaId/repositorio-xml" element={<RedirecionaRepositorioXml />} /></Routes>
      </StaticRouter>,
    );
    expect(html).toContain('data-para="/bpo/repositorio-xml/cmvjo7god0000pp42bgborr4h"');
    expect(html).toContain('data-troca="true"');
  });

  it("o App liga o endereço antigo a esse redirecionamento", () => {
    expect(appFonte).toContain('path="/workroom/:id/empresas/:empresaId/repositorio-xml" element={<RedirecionaRepositorioXml />}');
  });
});
