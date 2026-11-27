/** Achados A1, A2 e A15 da avaliação com a base real da Crestani: mapeamento, saldo em escala e entrada no saneamento. */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { escalaAplicada, escalaDetectada, exemplosDaColuna, seloDoMapeamento, textoEscalaAplicada, textoEscalaSaldo } from "./importacaoTela";
import { EscalaDoSaldo, Mapeamento, Resultado } from "./Importacao";
import { rotuloDaOrigem } from "./Configuracao";
import { nomeDizSemPerfil, rotuloNaListaDeErps } from "@/lib/erps";

const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const previa = {
  mapeamento: { codigo: "Código do Item", descricao: "Descrição do Item", unidade: "Código da Unidade de Medida" },
  colunas: [{ indice: 0, nome: "Código do Item" }, { indice: 1, nome: "Descrição do Item" }, { indice: 2, nome: "Unidade de Medida de Estoque" }, { indice: 3, nome: "Código da Unidade de Medida" }],
  sugestao: {
    colunas: [
      { indice: 0, nome: "Código do Item", exemplo: "118", exemplos: ["118", "12320"], campo: "codigo", certeza: "ALTA" },
      { indice: 1, nome: "Descrição do Item", exemplo: "ANEL", exemplos: ["ANEL", "CONECTOR"], campo: "descricao", certeza: "ALTA" },
      { indice: 2, nome: "Unidade de Medida de Estoque", exemplo: "UNIDADE", exemplos: ["UNIDADE", "QUILOGRAM", "METRO QUA"], campo: null, certeza: null },
      { indice: 3, nome: "Código da Unidade de Medida", exemplo: "UN", exemplos: ["UN", "KG", "M2"], campo: "unidade", certeza: "MEDIA" },
    ],
  },
  relatorio: { aceitas: 4 },
};

describe("A1: mapeamento com exemplos e selo de certeza", () => {
  it("exemplos: até 3 valores da coluna escolhida (o primeiro valor, sem a lista)", () => {
    expect(exemplosDaColuna(previa, "Código da Unidade de Medida")).toEqual(["UN", "KG", "M2"]);
    expect(exemplosDaColuna({ sugestao: { colunas: [{ nome: "A", exemplo: "x" }] } }, "A")).toEqual(["x"]);
    expect(exemplosDaColuna(previa, "")).toEqual([]);
  });
  it("o selo de certeza some quando o consultor troca a coluna", () => {
    expect(seloDoMapeamento(previa, "unidade", "Código da Unidade de Medida")).toBe("MEDIA");
    expect(seloDoMapeamento(previa, "unidade", "Unidade de Medida de Estoque")).toBeNull();
    expect(seloDoMapeamento(previa, "ncm", "Unidade de Medida de Estoque")).toBeNull();
    expect(seloDoMapeamento({ mapeamento: { codigo: "Cod" } }, "codigo", "Cod")).toBe("RECONHECIDA"); // sem sugestão do servidor
  });
  it("a tabela mostra a coluna Exemplos e, com a coluna trocada, nenhum selo na linha", () => {
    const sugerido = texto(renderToStaticMarkup(<Mapeamento previa={previa} mapeamento={null} aoCorrigir={() => {}} aoAtualizar={() => {}} carregando={false} />));
    expect(sugerido).toContain("Exemplos");
    expect(sugerido).toContain("UN · KG · M2");
    expect(sugerido).toContain("Certeza média");
    const trocado = texto(renderToStaticMarkup(<Mapeamento previa={previa} mapeamento={{ ...previa.mapeamento, unidade: "Unidade de Medida de Estoque" }} aoCorrigir={() => {}} aoAtualizar={() => {}} carregando={false} />));
    expect(trocado).toContain("UNIDADE · QUILOGRAM · METRO QUA");
    expect(trocado).not.toContain("Certeza média");
    expect(trocado).toContain("Atualizar a prévia com este mapeamento");
  });
});

describe("A2: saldo exportado sem a vírgula das casas decimais", () => {
  const e = { coluna: "Quantidade em Estoque", detectada: 1e6, aplicada: 1, naoNulos: 4302, exemplo: 24e6, anterior: null };
  it("texto com a regra, a contagem e o exemplo; a importação anterior é lembrada", () => {
    expect(textoEscalaSaldo(e)).toBe('Os 4.302 saldos não zerados da coluna "Quantidade em Estoque" têm 1.000.000 ou mais (nenhum entre zero e um milhão): o ERP pode ter exportado a quantidade sem a vírgula das casas decimais. Exemplo: 24.000.000 vira 24.');
    expect(textoEscalaSaldo({ ...e, detectada: 1000, exemplo: 3000, anterior: 1e6 })).toContain("são múltiplos de 1.000");
    expect(textoEscalaSaldo({ ...e, anterior: 1e6 })).toContain("Na importação anterior, os saldos foram divididos por 1.000.000.");
  });
  it("sem escala detectada não há aviso; a confirmação envia o divisor aplicado na prévia", () => {
    expect(escalaDetectada({ escalaSaldo: { ...e, detectada: 1 } })).toBeNull();
    expect(escalaDetectada({})).toBeNull();
    expect(escalaAplicada({ escalaSaldo: e })).toBe(1);
    expect(escalaAplicada({ escalaSaldo: { ...e, aplicada: 1e6 } })).toBe(1e6);
    expect(escalaAplicada(null)).toBe(1);
  });
  it("o aviso traz a escolha explícita, desmarcada por padrão e marcada depois de escolher", () => {
    const html = renderToStaticMarkup(<EscalaDoSaldo relatorio={{ escalaSaldo: e }} aoEscolher={() => {}} carregando={false} />);
    expect(texto(html)).toContain("Dividir os saldos por 1.000.000");
    expect(html).not.toMatch(/checked/);
    expect(renderToStaticMarkup(<EscalaDoSaldo relatorio={{ escalaSaldo: { ...e, aplicada: 1e6 } }} aoEscolher={() => {}} carregando={false} />)).toMatch(/checked/);
    expect(renderToStaticMarkup(<EscalaDoSaldo relatorio={{ escalaSaldo: { ...e, detectada: 1 } }} aoEscolher={() => {}} />)).toBe("");
  });
  it("o relatório da importação diz por quanto dividiu e leva às Diretrizes", () => {
    expect(textoEscalaAplicada({ ...e, aplicada: 1e6 })).toBe('Saldos da coluna "Quantidade em Estoque" divididos por 1.000.000, por escolha na prévia.');
    expect(textoEscalaAplicada(e)).toBe("");
    const t = texto(renderToStaticMarkup(<Resultado r={{ aceitas: 4, rejeitadas: 0, pendentes: 0, novos: 4, escalaSaldo: { ...e, aplicada: 1e6 } }} aoIrParaDiretrizes={() => {}} />));
    expect(t).toContain("divididos por 1.000.000");
    expect(t).toContain("Ir para Diretrizes");
    expect(texto(renderToStaticMarkup(<Resultado r={{ aceitas: 1 }} />))).not.toContain("Ir para Diretrizes");
  });
});

describe("A15: textos da entrada e da Configuração", () => {
  it("origem numa etiqueta só: CNPJ · principal / CNPJ · secundário / Manual", () => {
    const p = { cliente: { cnaePrincipal: "5250804" } };
    expect(rotuloDaOrigem({ origem: "CNPJ", codigo: "5250804" }, p)).toBe("CNPJ · principal");
    expect(rotuloDaOrigem({ origem: "CNPJ", codigo: "4930202" }, p)).toBe("CNPJ · secundário");
    expect(rotuloDaOrigem({ origem: "CNPJ", codigo: "4930202" }, {})).toBe("CNPJ");
    expect(rotuloDaOrigem({ origem: "MANUAL", codigo: "X" }, p)).toBe("Manual");
  });
  it("ERP genérico sem o \"(perfil a desenvolver)\" repetido", () => {
    expect(rotuloNaListaDeErps({ nome: "Outro ERP (sem perfil)", situacao: "A_DESENVOLVER" })).toBe("Outro ERP (sem perfil)");
    expect(rotuloNaListaDeErps({ nome: "Sankhya", situacao: "A_DESENVOLVER" })).toBe("Sankhya (perfil a desenvolver)");
    expect(rotuloNaListaDeErps({ nome: "SAP Business One", situacao: "COMPLETO" })).toBe("SAP Business One");
    expect(nomeDizSemPerfil({ nome: "Outro ERP (sem perfil)" })).toBe(true);
  });
});
