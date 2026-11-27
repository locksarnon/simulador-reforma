/** "O que foi considerado" na aba Análise: fechado por padrão, aberto com a lista, critério alterado pede nova análise e o texto livre. */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "a@b.c" } }) }));

import { chaves } from "./api";
import Cobertura, { textoDesatualizada } from "./Cobertura";
import Considerado, { TEXTO_CRITERIO_ALTERADO, textoDoResultadoLivre, textoDoValor } from "./Considerado";

const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/\s+/g, " ");
const montar = (ui, preparar) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  preparar?.(qc);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};
const SIM = { chave: "similaridadeMinima", tipo: "percentual", padrao: 78, min: 70, max: 100, unidade: "%", ajuda: "Pontuação de semelhança (não é probabilidade).", valor: 85, alterado: true };
const dados = {
  camada: "DUPLICIDADE", rotulo: "Duplicidades", alteradoEm: null,
  criterios: [
    { id: "dup-similaridade", texto: "Similaridade mínima para indicar duplicidade", origem: null, parametro: SIM },
    { id: "dup-embalagens", texto: "Embalagens ou apresentações diferentes são itens diferentes", origem: null, parametro: { chave: "embalagensDiferentesSaoItensDiferentes", tipo: "booleano", padrao: true, ajuda: "Sim: não é duplicidade.", valor: true, alterado: false } },
    { id: "dup-vetos", texto: "Não são duplicidade: medida, dose, cor, tamanho, variedade ou referência diferentes", origem: null },
  ],
  manuais: [{ id: "m1", camada: "DUPLICIDADE", texto: "Fornecedores diferentes nunca são duplicados", criadoPor: "x", criadoEm: "2026-11-27", nota: null }],
};
const props = { projetoId: "p1", camada: "DUPLICIDADE", rotulo: "Duplicidades", dados };

describe("O que foi considerado", () => {
  it("fica fechado por padrão: só o botão, com aria-expanded falso", () => {
    const html = montar(<Considerado {...props} />);
    expect(html).toContain('aria-expanded="false"');
    expect(texto(html)).toContain("O que foi considerado (4)");
    expect(texto(html)).not.toContain("Similaridade mínima");
  });
  it("aberto: lista os critérios, o valor editável, o padrão, a verificação manual e o texto livre separado", () => {
    const html = montar(<Considerado {...props} abertoInicial />);
    const t = texto(html);
    expect(html).toContain('aria-expanded="true"');
    expect(t).toContain("Similaridade mínima para indicar duplicidade:");
    expect(html).toMatch(/type="number"[^>]*value="85"/);
    expect(t).toContain("padrão: 78%");
    expect(t).toContain("Não são duplicidade: medida");
    expect(t).toContain("Fornecedores diferentes nunca são duplicados verificação manual");
    expect(t).toContain("Acrescentar critério (texto livre)");
    expect(t).not.toContain(TEXTO_CRITERIO_ALTERADO);
  });
  it("critério alterado: pede para analisar a camada de novo, com o botão", () => {
    const t = texto(montar(<Considerado {...props} abertoInicial alteradoInicial aoAnalisar={() => {}} />));
    expect(t).toContain(TEXTO_CRITERIO_ALTERADO);
    expect(t).toContain("Analisar de novo");
  });
  it("Diretrizes e Configuração levam até lá, sem editar aqui", () => {
    const d = { ...dados, criterios: [{ id: "nu-limites", texto: "Limite de caracteres, conforme as Diretrizes do projeto", origem: "DIRETRIZES" }, { id: "q-corte", texto: "Corte de movimentação", origem: "CONFIGURACAO", valorConfiguracao: "2025-12-31" }], manuais: [] };
    const t = texto(montar(<Considerado {...props} dados={d} abertoInicial aoIrPara={() => {}} />));
    expect(t).toContain("Ver nas Diretrizes");
    expect(t).toContain("Corte de movimentação: 31/12/2025");
    expect(t).toMatch(/Alterar em Fase 1 (&gt;|>) 1.1 Preparar e diretrizes/);
    expect(t).not.toContain("Alterar na Configuração");
  });
  it("texto livre: encaixado vira proposta a confirmar; manual vai para a política; sem IA, manual com aviso", () => {
    const proposta = { resultado: "PROPOSTA", iaDisponivel: true, proposta: { camada: "DUPLICIDADE", chave: "similaridadeMinima", valor: 90, criterio: "Similaridade mínima para indicar duplicidade", textoValor: "90%", textoAtual: "78%", igualAoAtual: false } };
    expect(textoDoResultadoLivre(proposta).titulo).toBe("Encaixado no critério \"Similaridade mínima para indicar duplicidade\" com valor 90%");
    const t = texto(montar(<Considerado {...props} abertoInicial resultadoInicial={proposta} />));
    expect(t).toContain("Encaixado no critério");
    expect(t).toContain("Aplicar");
    expect(t).toContain("Descartar");
    expect(t).toContain("Nada foi alterado");
    const manual = textoDoResultadoLivre({ resultado: "MANUAL", iaDisponivel: true, explicacao: "Depende de conferência." });
    expect(manual.titulo).toBe("Vai para a política como verificação manual (o sistema não aplica sozinho)");
    const semIa = textoDoResultadoLivre({ resultado: "MANUAL", iaDisponivel: false });
    expect(semIa.tom).toBe("alerta");
    expect(semIa.texto).toContain("A IA não estava disponível");
  });
  it("valores escritos para gente", () => {
    expect(textoDoValor(SIM, 85)).toBe("85%");
    expect(textoDoValor({ tipo: "booleano" }, false)).toBe("Não");
    expect(textoDoValor({ tipo: "numero", unidade: "itens" }, 5)).toBe("5 itens");
  });
  it("na Cobertura: cada camada tem o botão (fechado); critério alterado aparece no selo e no quadro", () => {
    const estado = { camadas: [{ camada: "DUPLICIDADE", abertos: 2, aguardando: 0, aprovados: 0, executadaEm: "2026-11-20T10:00:00Z", desatualizada: { por: [], desde: "2026-11-21T12:00:00Z", criterio: true } }] };
    const html = montar(<Cobertura projeto={{ id: "p1", modulos: {}, parametros: {}, atividadesConfirmadas: true }} fase="FASE1" />, (qc) => {
      qc.setQueryData(chaves.visao("p1"), { camadas: [], grupos: [] });
      qc.setQueryData(chaves.camadas(), ["DUPLICIDADE"]);
      qc.setQueryData(chaves.estadoCamadas("p1"), estado);
      qc.setQueryData(chaves.fases("p1"), { fases: [] });
      qc.setQueryData(chaves.criterios("p1"), { camadas: [dados], historico: [] });
    });
    const t = texto(html);
    expect(t).toContain("O que foi considerado (4)");
    expect(html).toContain('aria-expanded="false"');
    expect(t).toContain(TEXTO_CRITERIO_ALTERADO);
    expect(textoDesatualizada(estado.camadas[0].desatualizada)).toContain("Critério desta camada alterado");
  });
});
