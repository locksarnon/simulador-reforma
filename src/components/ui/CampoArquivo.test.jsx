import React from "react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import CampoArquivo, { aceitaArquivo, criarManipuladores, descreverAccept, separarArquivos, teclaAbreSeletor } from "./CampoArquivo";

const arq = (name, type = "") => ({ name, type });
const evento = (extra = {}) => ({ preventDefault: vi.fn(), ...extra });
const soltar = (arquivos) => evento({ dataTransfer: { files: arquivos, types: ["Files"] } });

function montar(props = {}) {
  const aoEscolher = vi.fn(); const aoRecusar = vi.fn(); const aoArrastar = vi.fn(); const abrirSeletor = vi.fn();
  const m = criarManipuladores({ aoEscolher, aoRecusar, aoArrastar, abrirSeletor, ...props });
  return { m, aoEscolher, aoRecusar, aoArrastar, abrirSeletor };
}

describe("CampoArquivo: arrastar e soltar", () => {
  it("soltar um arquivo aceito chama o aoEscolher com ele, sem deixar o navegador abrir o arquivo", () => {
    const { m, aoEscolher, aoArrastar } = montar({ accept: ".xlsx,.xls,.csv" });
    const e = soltar([arq("cadastro.xlsx")]);
    m.onDrop(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(aoEscolher).toHaveBeenCalledWith([arq("cadastro.xlsx")]);
    expect(aoArrastar).toHaveBeenLastCalledWith(false);
  });

  it("arrastar arquivo por cima liga o realce; sair da área desliga", () => {
    const { m, aoArrastar } = montar();
    const sobre = evento({ dataTransfer: { types: ["Files"] } });
    m.onDragOver(sobre);
    expect(sobre.preventDefault).toHaveBeenCalled();
    expect(aoArrastar).toHaveBeenLastCalledWith(true);
    m.onDragLeave(evento({ currentTarget: { contains: () => false }, relatedTarget: null }));
    expect(aoArrastar).toHaveBeenLastCalledWith(false);
  });

  it("arrastar algo que não é arquivo (coluna de tabela, texto) não é interceptado", () => {
    const { m, aoArrastar } = montar();
    const e = evento({ dataTransfer: { types: ["text/plain"] } });
    m.onDragOver(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(aoArrastar).not.toHaveBeenCalled();
  });

  it("extensão errada é recusada com mensagem clara e não chama o aoEscolher", () => {
    const { m, aoEscolher, aoRecusar } = montar({ accept: ".xlsx,.csv" });
    m.onDrop(soltar([arq("foto.png", "image/png")]));
    expect(aoEscolher).not.toHaveBeenCalled();
    expect(aoRecusar).toHaveBeenLastCalledWith("Arquivo recusado: foto.png. Este campo aceita .xlsx, .csv.");
  });

  it("campo de um arquivo só recusa vários de uma vez", () => {
    const { m, aoEscolher, aoRecusar } = montar({ accept: ".pdf" });
    m.onDrop(soltar([arq("a.pdf"), arq("b.pdf")]));
    expect(aoEscolher).not.toHaveBeenCalled();
    expect(aoRecusar).toHaveBeenLastCalledWith("Solte um arquivo só neste campo.");
  });

  it("campo múltiplo recebe todos os aceitos e avisa dos recusados", () => {
    const { m, aoEscolher, aoRecusar } = montar({ accept: ".xml,.zip", multiple: true });
    m.onDrop(soltar([arq("a.xml"), arq("b.ZIP"), arq("c.txt")]));
    expect(aoEscolher).toHaveBeenCalledWith([arq("a.xml"), arq("b.ZIP")]);
    expect(aoRecusar).toHaveBeenLastCalledWith("Arquivo recusado: c.txt. Este campo aceita .xml, .zip.");
  });

  it("desabilitado: soltar não chama nada (mas o navegador também não abre o arquivo) e o clique não abre o seletor", () => {
    const { m, aoEscolher, abrirSeletor } = montar({ disabled: true });
    const e = soltar([arq("a.xlsx")]);
    m.onDrop(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(aoEscolher).not.toHaveBeenCalled();
    m.onClick(evento());
    m.onKeyDown(evento({ key: "Enter" }));
    expect(abrirSeletor).not.toHaveBeenCalled();
  });
});

describe("CampoArquivo: teclado e clique", () => {
  it("Enter e Espaço abrem o seletor; outras teclas não", () => {
    const { m, abrirSeletor } = montar();
    m.onKeyDown(evento({ key: "Enter" }));
    m.onKeyDown(evento({ key: " " }));
    const tab = evento({ key: "Tab" });
    m.onKeyDown(tab);
    expect(abrirSeletor).toHaveBeenCalledTimes(2);
    expect(tab.preventDefault).not.toHaveBeenCalled();
    expect(teclaAbreSeletor("a")).toBe(false);
  });

  it("o clique abre o seletor uma vez só (anula a ativação de um rótulo em volta)", () => {
    const { m, abrirSeletor } = montar();
    const e = evento();
    m.onClick(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(abrirSeletor).toHaveBeenCalledTimes(1);
  });

  it("o arquivo escolhido pelo seletor passa pelo mesmo filtro", () => {
    const { m, aoEscolher, aoRecusar } = montar({ accept: ".xlsx" });
    m.receber([arq("ok.xlsx")]);
    expect(aoEscolher).toHaveBeenCalledWith([arq("ok.xlsx")]);
    expect(aoRecusar).toHaveBeenLastCalledWith("");
  });
});

describe("CampoArquivo: accept", () => {
  it("entende extensão, tipo MIME (mesmo sem tipo informado pelo sistema) e curinga", () => {
    expect(aceitaArquivo(arq("Contrato.PDF"), "application/pdf")).toBe(true);
    expect(aceitaArquivo(arq("cert.p12"), ".pfx,.p12,application/x-pkcs12")).toBe(true);
    expect(aceitaArquivo(arq("nota.xml", "text/xml"), ".xml,text/xml,application/xml")).toBe(true);
    expect(aceitaArquivo(arq("foto.jpg", "image/jpeg"), "image/*")).toBe(true);
    expect(aceitaArquivo(arq("planilha.xlsx"), "application/pdf")).toBe(false);
    expect(aceitaArquivo(arq("qualquer.bin"), undefined)).toBe(true);
    expect(descreverAccept("application/pdf,.pdf")).toBe(".pdf");
    expect(separarArquivos([arq("a.csv")], { accept: ".csv" })).toEqual({ aceitos: [arq("a.csv")], mensagem: "" });
  });
});

describe("CampoArquivo: tela", () => {
  it("mostra o convite para arrastar, é focável como botão e leva accept/multiple ao seletor", () => {
    const html = renderToString(<CampoArquivo accept=".xml,.zip" multiple aoEscolher={() => {}} />);
    expect(html).toContain("Arraste os arquivos aqui ou clique para escolher");
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('accept=".xml,.zip"');
    expect(html).toContain("multiple");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("hover:border-primary");
  });

  it("mostra o nome do arquivo escolhido e o trocar", () => {
    const html = renderToString(<CampoArquivo accept=".xlsx" arquivo={{ name: "itens.xlsx" }} rotulo="Arquivo do cadastro de itens" aoEscolher={() => {}} />);
    expect(html).toContain("itens.xlsx");
    expect(html).toContain("trocar");
    expect(html).toContain("Arquivo do cadastro de itens (escolhido: itens.xlsx; clique para trocar)");
  });

  it("desabilitado sai da ordem de foco e fica marcado", () => {
    const html = renderToString(<CampoArquivo disabled aoEscolher={() => {}} />);
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("cursor-not-allowed");
  });

  it("nenhum campo de arquivo do app fica fora do componente (todo envio aceita arrastar)", () => {
    const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const soltos = [];
    const varrer = (dir) => {
      for (const nome of fs.readdirSync(dir)) {
        const p = path.join(dir, nome);
        if (fs.statSync(p).isDirectory()) varrer(p);
        else if (/\.jsx?$/.test(nome) && !/\.test\./.test(nome) && !p.endsWith(`ui${path.sep}CampoArquivo.jsx`) && /type=["']file["']/.test(fs.readFileSync(p, "utf8"))) soltos.push(path.relative(raiz, p));
      }
    };
    varrer(raiz);
    expect(soltos).toEqual([]);
  });
});
