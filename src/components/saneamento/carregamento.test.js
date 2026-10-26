import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { podeCarregarEstado } from "./carregamento";

const lido = (extra = {}) => ({ data: { estado: {} }, isFetchedAfterMount: true, isError: false, ...extra });

describe("quando o estado do projeto pode ser carregado na tela", () => {
  it("só com a leitura feita depois de a tela abrir, sem erro e uma única vez", () => {
    expect(podeCarregarEstado(lido(), false)).toBe(true);
    expect(podeCarregarEstado(lido({ isFetchedAfterMount: false }), false)).toBe(false); // a cópia do cache, de antes do último salvamento
    expect(podeCarregarEstado(lido({ isError: true }), false)).toBe(false); // a leitura nova falhou: o cache velho não pode ser salvo por cima
    expect(podeCarregarEstado(lido({ data: undefined }), false)).toBe(false);
    expect(podeCarregarEstado(lido(), true)).toBe(false);
    expect(podeCarregarEstado(null, false)).toBe(false);
  });

  it("com o react-query de verdade: ao reabrir dentro do tempo do cache, o primeiro resultado é a cópia velha e não pode ser carregado; o seguinte, a leitura nova, pode", async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let servidor = { estado: { passo: 1 } }; const leitura = () => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(servidor))), 20));
    const abrir = () => { const o = new QueryObserver(cliente, { queryKey: ["saneamento", "p1"], queryFn: leitura }); const resultados = []; const sair = o.subscribe((r) => resultados.push({ data: r.data, isFetchedAfterMount: r.isFetchedAfterMount, isError: r.isError })); return { o, resultados, sair }; };
    const primeira = abrir(); await new Promise((r) => setTimeout(r, 60)); primeira.sair(); // abriu, leu e saiu (o cache guarda a leitura)
    servidor = { estado: { passo: 4, trabalhoNovo: true } }; // o analista trabalhou e o salvamento automático gravou
    const segunda = abrir(); const primeiroResultado = segunda.o.getCurrentResult();
    expect(primeiroResultado.data.estado.passo).toBe(1); // a cópia velha do cache
    expect(podeCarregarEstado(primeiroResultado, false)).toBe(false); // antes do conserto, a tela carregaria isto e o salvamento gravaria por cima
    await new Promise((r) => setTimeout(r, 60)); const depois = segunda.o.getCurrentResult(); segunda.sair();
    expect(depois.data.estado.passo).toBe(4); expect(podeCarregarEstado(depois, false)).toBe(true);
  });
});
