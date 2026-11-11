import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import mapaCsv from "../../docs/mapa-completo-veri-intax.csv?raw";
import appFonte from "@/App.jsx?raw";
import { CAMINHO_REPOSITORIO_XML } from "@/lib/bpoCaminhos";
import { MODULOS, SITUACAO } from "./navegacao";
import { FUNCOES_PREVISTAS } from "./funcoesPlanejadas";
import { ROTEIRO } from "./roteiroTestes";
import { FAQ_SECOES } from "@/components/manual/faqData";

/** Lê o CSV do mapa (separador ";", campos entre aspas, BOM no início). */
function lerCsv(texto) {
  const t = texto.replace(/^﻿/, "");
  const linhas = [];
  let linha = [], campo = "", aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ";") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo.replace(/\r$/, "")); linhas.push(linha); linha = []; campo = ""; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...resto] = linhas.filter((l) => l.length > 1);
  return resto.map((l) => Object.fromEntries(cab.map((c, i) => [c, l[i]])));
}

const FUNCOES = lerCsv(mapaCsv);
const ehPrevista = (f) => /^[34]$/.test(f.Fase);
const ehFora = (f) => f["Situação"].startsWith("fora");
const emAndamento = FUNCOES.filter((f) => !ehPrevista(f) && !ehFora(f));
const ROTAS_EXTRAS = [CAMINHO_REPOSITORIO_XML];
const rotaExiste = (rota) => ROTAS_EXTRAS.includes(rota) || appFonte.includes(`path="${rota}"`) || MODULOS.some((m) => m.to === rota);

describe("aderência ao mapa Veri × InTAX (docs/mapa-completo-veri-intax.csv)", () => {
  it("tem as 125 funções, numeradas de V001 a V125, sem repetição", () => {
    expect(FUNCOES).toHaveLength(125);
    expect(new Set(FUNCOES.map((f) => f.ID)).size).toBe(125);
    expect(FUNCOES.map((f) => f.ID)).toEqual(Array.from({ length: 125 }, (_, i) => `V${String(i + 1).padStart(3, "0")}`));
  });

  it("nenhuma função ficou como 'a fazer'", () => {
    expect(FUNCOES.filter((f) => f["Situação"] === "a fazer" || !f["Situação"]).map((f) => f.ID)).toEqual([]);
  });

  it("toda função das fases 0, 1 e 2 (e as que já existiam) tem tela, FAQ e roteiro", () => {
    const sem = emAndamento.filter((f) => !f.Tela || !f.FAQ || (!f.Roteiro && f.ID !== "V115"));
    expect(sem.map((f) => f.ID)).toEqual([]);
  });

  it("as telas citadas existem nas rotas do InTAX", () => {
    const rotas = emAndamento.map((f) => f.Tela.split(" ")[0]).filter((t) => t.startsWith("/"));
    expect(rotas.filter((r) => !rotaExiste(r))).toEqual([]);
  });

  it("os arquivos de teste citados existem", () => {
    const citados = FUNCOES.flatMap((f) => f.Teste.split(";").map((s) => s.trim()).filter(Boolean));
    expect(citados.length).toBeGreaterThan(40);
    expect([...new Set(citados)].filter((a) => !existsSync(resolve(process.cwd(), a)))).toEqual([]);
  });

  it("o FAQ e o roteiro citados existem", () => {
    const titulosFaq = new Set(FAQ_SECOES.map((s) => s.titulo));
    const idsRoteiro = new Set(ROTEIRO.map((r) => r.id));
    expect(FUNCOES.filter((f) => f.FAQ && f.FAQ !== "todas" && !titulosFaq.has(f.FAQ)).map((f) => f.ID)).toEqual([]);
    expect(FUNCOES.filter((f) => f.Roteiro && !idsRoteiro.has(f.Roteiro)).map((f) => f.ID)).toEqual([]);
  });

  it("toda função das fases 3 e 4 aparece como prevista num módulo do menu, com a dependência", () => {
    const porId = new Map(FUNCOES_PREVISTAS.map((p) => [p.id, p]));
    const previstas = FUNCOES.filter(ehPrevista);
    expect(previstas.filter((f) => !porId.has(f.ID)).map((f) => f.ID)).toEqual([]);
    for (const f of previstas) {
      expect(f["Situação"], f.ID).toMatch(/^em breve: depende d/);
      const modulo = MODULOS.find((m) => m.id === porId.get(f.ID).modulo);
      expect(modulo, f.ID).toBeTruthy();
      expect(f.Tela, f.ID).toBe(modulo.to);
    }
  });

  it("os módulos em breve dizem do que dependem", () => {
    const emBreve = MODULOS.filter((m) => m.situacao === SITUACAO.EM_BREVE);
    expect(emBreve.filter((m) => !m.quando).map((m) => m.id)).toEqual([]);
  });
});
