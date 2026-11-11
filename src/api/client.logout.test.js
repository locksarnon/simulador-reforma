import { describe, it, expect, vi, beforeEach } from "vitest";

// O logout tem de revogar a sessão no servidor ANTES de apagar os tokens: o endpoint /auth/logout exige o access token.
const post = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { create: () => ({ post, interceptors: { request: { use: () => {} }, response: { use: () => {} } } }) },
}));

const memoria = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
    setItem: (k, v) => { memoria.set(k, String(v)); },
    removeItem: (k) => { memoria.delete(k); },
  },
});
const janela = { location: { href: "/painel" } };
Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: janela });

const { api } = await import("./client");

beforeEach(() => {
  post.mockReset();
  memoria.clear();
  janela.location.href = "/painel";
});

describe("api.auth.logout", () => {
  it("chama o servidor com o access token ainda guardado, depois limpa os tokens e vai ao login", async () => {
    memoria.set("sr_access_token", "acesso");
    memoria.set("sr_refresh_token", "renovacao");
    let tokenNaChamada = null;
    post.mockImplementation(async () => { tokenNaChamada = localStorage.getItem("sr_access_token"); return { data: { ok: true } }; });

    await api.auth.logout("/login");

    expect(post).toHaveBeenCalledWith("/auth/logout", { refreshToken: "renovacao" }, expect.objectContaining({ timeout: expect.any(Number) }));
    expect(tokenNaChamada).toBe("acesso");
    expect(localStorage.getItem("sr_access_token")).toBeNull();
    expect(localStorage.getItem("sr_refresh_token")).toBeNull();
    expect(window.location.href).toBe("/login");
  });

  it("se o servidor não responde, a sessão deste navegador termina do mesmo jeito", async () => {
    memoria.set("sr_access_token", "acesso");
    memoria.set("sr_refresh_token", "renovacao");
    post.mockRejectedValue(new Error("sem rede"));

    await expect(api.auth.logout("/login")).resolves.toBeUndefined();

    expect(localStorage.getItem("sr_access_token")).toBeNull();
    expect(localStorage.getItem("sr_refresh_token")).toBeNull();
    expect(window.location.href).toBe("/login");
  });

  it("sem refresh token guardado não chama o servidor, mas limpa e redireciona", async () => {
    memoria.set("sr_access_token", "acesso");

    await api.auth.logout("/login");

    expect(post).not.toHaveBeenCalled();
    expect(localStorage.getItem("sr_access_token")).toBeNull();
    expect(window.location.href).toBe("/login");
  });

  it("sem endereço de destino só encerra a sessão, sem mudar de página", async () => {
    memoria.set("sr_access_token", "acesso");
    memoria.set("sr_refresh_token", "renovacao");
    post.mockResolvedValue({ data: { ok: true } });

    await api.auth.logout();

    expect(localStorage.getItem("sr_refresh_token")).toBeNull();
    expect(window.location.href).toBe("/painel");
  });
});
