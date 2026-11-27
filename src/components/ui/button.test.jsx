import React from "react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { Button } from "./button";

const classe = (props) => renderToString(<Button {...props}>Ação</Button>).match(/class="([^"]*)"/)[1].split(/\s+/);

describe("Button: contorno verde com relevo nos botões de ação", () => {
  it("aplica botao-acao em default, outline, secondary e destructive", () => {
    for (const variant of [undefined, "default", "outline", "secondary", "destructive"]) {
      expect(classe({ variant })).toContain("botao-acao");
    }
    expect(classe({ variant: "destructive" })).toContain("botao-acao-perigo");
    expect(classe({ variant: "outline" })).not.toContain("border-input");
  });

  it("não aplica em ghost nem link", () => {
    expect(classe({ variant: "ghost" })).not.toContain("botao-acao");
    expect(classe({ variant: "link" })).not.toContain("botao-acao");
  });

  it("a classe está definida no CSS com borda de 2px e respeita movimento reduzido", () => {
    const css = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../index.css"), "utf8");
    expect(css).toMatch(/\.botao-acao \{[^}]*border-width: 2px/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[^@]*\.botao-acao:hover/);
  });
});
