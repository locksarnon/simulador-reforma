import { describe, it, expect, vi, beforeEach } from "vitest";

// Download de arquivo: o corpo de uma resposta de erro também chega como Blob (responseType: "blob"); o cliente lê o JSON
// para que a mensagem do servidor (por exemplo, "Só o resumo está guardado...") chegue à tela em vez de "Request failed with status code 400".
const request = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { create: () => ({ request, post: vi.fn(), interceptors: { request: { use: () => {} }, response: { use: () => {} } } }) },
}));

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});

const { api } = await import("./client");

const erroHttp = (status, corpo, tipo = "application/json") => ({
  message: `Request failed with status code ${status}`,
  response: { status, data: new Blob([corpo], { type: tipo }) },
});

// Com chaves: um beforeEach que devolve o mock seria chamado pelo vitest como "limpeza" ao fim de cada teste.
beforeEach(() => { request.mockReset(); });

describe("api.baixar", () => {
  it("em caso de erro, mostra a mensagem que o servidor mandou, mesmo ela vindo dentro de um Blob", async () => {
    request.mockRejectedValue(erroHttp(400, JSON.stringify({ message: "Só o resumo está guardado: falta o XML completo para gerar o PDF." })));
    await expect(api.baixar("get", "/x/pdf", { nome: "a.pdf" })).rejects.toThrow("Só o resumo está guardado: falta o XML completo para gerar o PDF.");
  });

  it("junta as mensagens quando o servidor devolve uma lista, e guarda o status", async () => {
    request.mockRejectedValue(erroHttp(422, JSON.stringify({ message: ["primeira", "segunda"] })));
    const erro = await api.baixar("post", "/x/zip", { body: {}, nome: "a.zip" }).catch((e) => e);
    expect(erro.message).toBe("primeira, segunda");
    expect(erro.status).toBe(422);
  });

  it("se o corpo do erro não é JSON (página de erro do proxy), fica a mensagem genérica da requisição", async () => {
    request.mockRejectedValue(erroHttp(502, "<html>Bad Gateway</html>", "text/html"));
    await expect(api.baixar("get", "/x/arquivo", { nome: "a.xml" })).rejects.toThrow("Request failed with status code 502");
  });

  it("erro sem resposta (rede caiu) continua com a mensagem do próprio erro", async () => {
    request.mockRejectedValue(new Error("Network Error"));
    await expect(api.baixar("get", "/x/arquivo", { nome: "a.xml" })).rejects.toThrow("Network Error");
  });

  it("em caso de sucesso, entrega o arquivo ao navegador com o nome pedido", async () => {
    const link = { click: vi.fn(), remove: vi.fn(), href: "", download: "" };
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => link, body: { appendChild: vi.fn() } } });
    URL.createObjectURL = vi.fn(() => "blob:teste");
    URL.revokeObjectURL = vi.fn();
    request.mockResolvedValue({ data: new Blob(["%PDF-1.3"], { type: "application/pdf" }) });

    await api.baixar("get", "/x/pdf", { nome: "DANFE-123.pdf" });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "get", url: "/x/pdf", responseType: "blob" }));
    expect(link.download).toBe("DANFE-123.pdf");
    expect(link.href).toBe("blob:teste");
    expect(link.click).toHaveBeenCalledTimes(1);
  });
});

describe("api.visualizar", () => {
  const janela = () => {
    const aba = { document: { write: vi.fn() }, location: { href: "" }, close: vi.fn() };
    globalThis.window = { open: vi.fn(() => aba) };
    return aba;
  };

  it("abre a aba já no clique, enquanto o arquivo é gerado, e leva a ela o endereço do PDF quando chega", async () => {
    const aba = janela();
    URL.createObjectURL = vi.fn(() => "blob:pdf-teste");
    request.mockImplementation(async () => {
      expect(window.open).toHaveBeenCalledTimes(1); // a aba abriu antes da resposta
      return { data: new Blob(["%PDF-1.3"], { type: "application/pdf" }) };
    });

    await api.visualizar("get", "/x/pdf");

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "get", url: "/x/pdf", responseType: "blob" }));
    expect(aba.document.write).toHaveBeenCalledWith(expect.stringContaining("Gerando o PDF"));
    expect(aba.location.href).toBe("blob:pdf-teste");
    expect(aba.close).not.toHaveBeenCalled();
  });

  it("se o PDF não pôde ser gerado, fecha a aba e mostra a mensagem do servidor", async () => {
    const aba = janela();
    request.mockRejectedValue(erroHttp(400, JSON.stringify({ message: "Não foi possível gerar o PDF: XML ruim" })));
    await expect(api.visualizar("get", "/x/pdf")).rejects.toThrow("Não foi possível gerar o PDF: XML ruim");
    expect(aba.close).toHaveBeenCalledTimes(1);
  });

  it("se o navegador bloqueou a aba aberta no clique, tenta abrir o PDF por outro caminho", async () => {
    globalThis.window = { open: vi.fn().mockReturnValueOnce(null).mockReturnValueOnce({}) };
    URL.createObjectURL = vi.fn(() => "blob:pdf-teste");
    request.mockResolvedValue({ data: new Blob(["%PDF-1.3"], { type: "application/pdf" }) });
    await api.visualizar("get", "/x/pdf");
    expect(window.open).toHaveBeenLastCalledWith("blob:pdf-teste", "_blank");
  });

  it("se o navegador bloqueia as duas tentativas, avisa o que fazer em vez de não fazer nada", async () => {
    globalThis.window = { open: vi.fn(() => null) };
    URL.createObjectURL = vi.fn(() => "blob:pdf-teste");
    request.mockResolvedValue({ data: new Blob(["%PDF-1.3"], { type: "application/pdf" }) });
    await expect(api.visualizar("get", "/x/pdf")).rejects.toThrow(/bloqueou a nova aba.*Baixar o PDF/);
  });
});
