import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import TabelaPadrao, { aplicarTabela, CaixaBusca, textoDaColuna } from "./TabelaPadrao";
import { linhasDaLeitura } from "./monitoramento/LeituraSitfis";
import { linhasDaEsfera, situacaoPelaValidade } from "./monitoramento/CertidoesCliente";

const COLUNAS = [
  { chave: "nome", rotulo: "Nome" },
  { chave: "valor", rotulo: "Valor", tipo: "moeda" },
  { chave: "data", rotulo: "Data", tipo: "data" },
  { chave: "comp", rotulo: "Competência", tipo: "periodo" },
];
const LINHAS = [
  { id: 1, nome: "Declaração São Paulo", valor: 1500.5, data: "2026-11-10", comp: "202610" },
  { id: 2, nome: "Guia Cuiabá", valor: 20, data: "2026-01-05", comp: "202601" },
  { id: 3, nome: "Recibo Goiânia", valor: null, data: "20260301", comp: "202603" },
];

describe("tabela padrão do InTAX", () => {
  it("formata moeda, data (ISO e AAAAMMDD) e competência", () => {
    expect(textoDaColuna(COLUNAS[1], LINHAS[0])).toMatch(/R\$\s?1\.500,50/);
    expect(textoDaColuna(COLUNAS[2], LINHAS[0])).toBe("10/11/2026");
    expect(textoDaColuna(COLUNAS[2], LINHAS[2])).toBe("01/03/2026");
    expect(textoDaColuna(COLUNAS[3], LINHAS[1])).toBe("01/2026");
  });

  it("busca geral e filtro por coluna sem acento; ordena números, datas e deixa vazio no fim", () => {
    expect(aplicarTabela(LINHAS, COLUNAS, { busca: "cuiaba" }).map((l) => l.id)).toEqual([2]);
    expect(aplicarTabela(LINHAS, COLUNAS, { filtros: { nome: "GOIANIA" } }).map((l) => l.id)).toEqual([3]);
    expect(aplicarTabela(LINHAS, COLUNAS, { filtros: { comp: "10/2026" } }).map((l) => l.id)).toEqual([1]);
    expect(aplicarTabela(LINHAS, COLUNAS, { ordem: { chave: "valor", dir: 1 } }).map((l) => l.id)).toEqual([2, 1, 3]);
    expect(aplicarTabela(LINHAS, COLUNAS, { ordem: { chave: "valor", dir: -1 } }).map((l) => l.id)).toEqual([1, 2, 3]);
    expect(aplicarTabela(LINHAS, COLUNAS, { ordem: { chave: "data", dir: 1 } }).map((l) => l.id)).toEqual([2, 3, 1]);
  });

  it("tem busca, filtros por coluna, cabeçalhos que ordenam e arrastam, e documentos sempre na última coluna", () => {
    const html = renderToString(<TabelaPadrao id="teste" colunas={COLUNAS} linhas={LINHAS} ariaLabel="Teste" documentos={(l) => <button type="button">Ver {l.id}</button>} />);
    expect(html).toContain("Buscar em todas as colunas");
    expect(html).toContain('aria-label="Filtrar Nome"');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain("Colunas");
    const cab = html.match(/<thead[\s\S]*?<\/tr>/)[0];
    expect(cab.lastIndexOf("Documentos")).toBeGreaterThan(cab.lastIndexOf("Competência"));
    expect(html).toContain("3 linhas");
  });
});

/** Acha, na árvore de elementos devolvida por um componente sem estado, o primeiro elemento que satisfaz `teste`. */
function acharElemento(no, teste) {
  if (!no || typeof no !== "object") return null;
  if (Array.isArray(no)) { for (const n of no) { const r = acharElemento(n, teste); if (r) return r; } return null; }
  if (teste(no)) return no;
  return acharElemento(no.props?.children, teste);
}

describe("barra única da tabela padrão", () => {
  const barraDe = (html) => html.slice(html.indexOf("data-barra-lista"), html.indexOf("<table"));

  it("busca controlada pela página: troca a caixa interna, mostra o valor e não filtra de novo as linhas", () => {
    const html = renderToString(<TabelaPadrao id="t-busca" colunas={COLUNAS} linhas={LINHAS} ariaLabel="Teste"
      busca={{ valor: "cuiaba", aoMudar: () => {}, placeholder: "Nome ou CNPJ", rotulo: "Buscar por nome ou CNPJ" }} />);
    expect(html).not.toContain("Buscar em todas as colunas");
    expect(html.match(/type="search"/g)).toHaveLength(1);
    expect(html).toContain('placeholder="Nome ou CNPJ"');
    expect(html).toContain('value="cuiaba"');
    expect(html).toContain("Buscar por nome ou CNPJ");
    expect(html).toContain("Limpar filtros"); // a busca da página conta como filtro ligado
    expect(html).toContain("3 linhas"); // quem filtra é a página: a tabela mostra as linhas que recebeu
  });

  it("a caixa de busca devolve o texto digitado e o X limpa", () => {
    const recebidos = [];
    const caixa = CaixaBusca({ valor: "abc", aoMudar: (v) => recebidos.push(v), placeholder: "Busca da página" });
    const input = acharElemento(caixa, (e) => e.type === "input");
    expect(input.props.value).toBe("abc");
    expect(input.props.placeholder).toBe("Busca da página");
    input.props.onChange({ target: { value: "goiania" } });
    acharElemento(caixa, (e) => e.props?.["aria-label"] === "Limpar a busca").props.onClick();
    expect(recebidos).toEqual(["goiania", ""]);
  });

  it("sem busca controlada, mantém a busca interna em todas as colunas", () => {
    const html = renderToString(<TabelaPadrao id="t-interna" colunas={COLUNAS} linhas={LINHAS} ariaLabel="Teste" />);
    expect(html).toContain('placeholder="Buscar em todas as colunas"');
  });

  it("uma linha só: filtros extras, busca, Filtros por coluna, Colunas, Exportar e ações, na mesma barra e com a mesma altura", () => {
    const html = renderToString(<TabelaPadrao id="t-barra" colunas={COLUNAS} linhas={LINHAS} ariaLabel="Teste"
      filtrosExtras={<select aria-label="Situação"><option>Situação: todas</option></select>}
      acoes={<button type="button">Ação da página</button>} />);
    expect(html).toMatch(/<div class="flex flex-wrap items-center gap-1\.5" data-barra-lista="">/);
    const barra = barraDe(html);
    const ordem = ['aria-label="Situação"', 'type="search"', "Filtros por coluna", "Colunas", "Exportar", "Ação da página"].map((t) => barra.indexOf(t));
    expect(ordem.every((p) => p >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(html.match(/data-barra-lista/g)).toHaveLength(1); // nenhuma segunda linha de controles
    for (const rotulo of ["Filtros por coluna", "Colunas", "Exportar"]) {
      const botao = barra.slice(0, barra.indexOf(rotulo)).split("<button").pop();
      expect(botao).toContain("h-8");
      expect(botao).toContain("botao-acao");
    }
  });

  it("com a busca da página, ela vem antes dos filtros extras", () => {
    const html = renderToString(<TabelaPadrao id="t-ordem" colunas={COLUNAS} linhas={LINHAS} ariaLabel="Teste"
      busca={{ valor: "", aoMudar: () => {} }} filtrosExtras={<select aria-label="Regime"><option>Regime: todos</option></select>} />);
    const barra = barraDe(html);
    expect(barra.indexOf('type="search"')).toBeLessThan(barra.indexOf('aria-label="Regime"'));
  });
});

describe("botão de filtro (sem pílula)", () => {
  it("ativo é verde cheio com texto branco; inativo tem fundo da tela; ambos com o relevo dos botões e cantos levemente arredondados", async () => {
    const { default: BotaoFiltro, classeBotaoFiltro } = await import("./BotaoFiltro");
    expect(classeBotaoFiltro(true)).toMatch(/botao-acao.*bg-primary.*text-primary-foreground/);
    expect(classeBotaoFiltro(false)).toContain("bg-background");
    for (const a of [true, false]) { expect(classeBotaoFiltro(a)).toContain("rounded-md"); expect(classeBotaoFiltro(a)).not.toContain("rounded-full"); }
    const html = renderToString(<BotaoFiltro ativo contagem={3}>Todos</BotaoFiltro>);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toMatch(/Todos<span class="tabular-nums opacity-80">3<\/span>/);
  });
});

describe("relatório de situação fiscal e certidões em tabela", () => {
  const leitura = {
    certidao: { tipo: "Certidão Negativa", codigo: "ABCD", emissao: "25/06/2026", validade: "22/12/2026" },
    secoes: [
      { titulo: "Pendência - Débito (SIEF)", orgao: "RFB", tipo: "PENDENCIA", assunto: "DEBITO", linhas: ["Receita PA/Exerc. Dt. Vcto", "6912-01 - PIS 09/2025", "2172-01 - COFINS 09/2025"] },
      { titulo: "Parcelamento com Exigibilidade Suspensa (SISPAR)", orgao: "PGFN", tipo: "SUSPENSO", assunto: "PARCELAMENTO", linhas: ["Conta", "004760792 TRANSACAO"] },
    ],
  };
  it("uma linha por item, com a seção e o cabeçalho do próprio relatório", () => {
    const l = linhasDaLeitura(leitura);
    expect(l.map((x) => [x.orgao, x.secao, x.item])).toEqual([
      ["Receita Federal", "Pendência - Débito (SIEF)", "6912-01 - PIS 09/2025"],
      ["Receita Federal", "Pendência - Débito (SIEF)", "2172-01 - COFINS 09/2025"],
      ["PGFN", "Parcelamento com Exigibilidade Suspensa (SISPAR)", "004760792 TRANSACAO"],
    ]);
    expect(linhasDaLeitura(leitura, (s) => s.assunto === "PARCELAMENTO")).toHaveLength(1);
  });
  it("a esfera federal junta as certidões guardadas e a do relatório de situação fiscal, com a vigência pela validade", () => {
    const c = { tipo: "FEDERAL", historico: [{ id: "D1", descricao: "CND federal (Receita e PGFN): Negativa (API Consulta CND)", validade: "2027-01-10T12:00:00Z", situacao: "VALIDO" }] };
    const l = linhasDaEsfera(c, { leitura });
    expect(l.map((x) => [x.regularidade, x.origem ?? ""])).toEqual([["Negativa", ""], ["Certidão Negativa", "Relatório de situação fiscal"]]);
    expect(l[1].validade).toBe("2026-12-22");
    expect(situacaoPelaValidade("2026-12-22", Date.parse("2026-11-12T12:00:00-03:00"))).toBe("VALIDO");
    expect(situacaoPelaValidade("2026-11-20", Date.parse("2026-11-12T12:00:00-03:00"))).toBe("A_VENCER");
    expect(situacaoPelaValidade("2026-11-01", Date.parse("2026-11-12T12:00:00-03:00"))).toBe("VENCIDO");
    expect(linhasDaEsfera({ tipo: "ESTADUAL", historico: [] }, { leitura })).toHaveLength(0);
  });
});
