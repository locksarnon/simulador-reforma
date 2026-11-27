import React from "react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TabelaPadrao, { aplicarTabela, assinaturaDaTela, medirTabela } from "./TabelaPadrao";
import FiltroPorTags from "./clientes/FiltroPorTags";
import { normalizarCrumbs } from "./PageHeader";
import { casaTextoDaEmpresa } from "@/lib/servicos";
import { casaTextoDaTarefa } from "@/lib/tarefas";
import { TRILHA_CARREGANDO, trilhaDoProjeto } from "@/lib/trilhas";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "U1", role: "admin", email: "qa@fal" } }) }));
const ClientesPagina = (await import("@/pages/clientes/ClientesPagina")).default;

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), "utf8");

const COLUNAS = [
  { chave: "nome", rotulo: "Nome" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "cnpj", rotulo: "CNPJ" },
];
const LINHAS = [
  { id: 1, nome: "Extra Agro", email: "fiscal@extra.test", cnpj: "58.509.112/0001-52" },
  { id: 2, nome: "Beta Comércio", email: "contato@beta.test", cnpj: "12.345.678/0001-95" },
  { id: 3, nome: "Gama", email: "", cnpj: "" },
];

describe("busca da página continua buscando em todas as colunas (achado 1)", () => {
  it("aplicarTabela soma a regra da página (corresponde) à busca em todas as colunas", () => {
    const soDigitos = (l, t) => String(l.cnpj).replace(/\D/g, "").includes(t.replace(/\D/g, "")) && t.replace(/\D/g, "").length >= 3;
    expect(aplicarTabela(LINHAS, COLUNAS, { busca: "beta.test" }).map((l) => l.id)).toEqual([2]); // e-mail, que a página não buscava
    expect(aplicarTabela(LINHAS, COLUNAS, { busca: "58509112" }).map((l) => l.id)).toEqual([]); // dígitos não casam com o CNPJ pontuado…
    expect(aplicarTabela(LINHAS, COLUNAS, { busca: "58509112", corresponde: soDigitos }).map((l) => l.id)).toEqual([1]); // …a regra da página casa
  });

  it("TabelaPadrao com a busca da página acha pelo e-mail e o rodapé mostra 'N de M' com o total sem filtro", () => {
    const html = renderToString(<TabelaPadrao id="t-busca-colunas" colunas={COLUNAS} linhas={LINHAS} ariaLabel="Teste"
      busca={{ valor: "contato@", aoMudar: () => {} }} totalSemFiltro={10} />);
    expect(html).toContain("Beta Comércio");
    expect(html).not.toContain("Extra Agro");
    expect(html).toContain("1 de 10 linhas");
  });

  it("rodapé com filtro só da página (sem texto): 'N de M' pelo totalSemFiltro (achado 14)", () => {
    const html = renderToString(<TabelaPadrao id="t-total" colunas={COLUNAS} linhas={LINHAS.slice(0, 2)} ariaLabel="Teste"
      busca={{ valor: "", aoMudar: () => {} }} totalSemFiltro={3} />);
    expect(html.replace(/<!-- -->/g, "")).toContain("2 de 3 linhas");
  });

  it("as regras de texto das páginas continuam (CNPJ só com dígitos, código; tarefa pela empresa)", () => {
    const e = { razao_social: "EXTRA AGRO LTDA", id_empresa: "EXTRA", cnpj_cpf: "58.509.112/0001-52" };
    expect(casaTextoDaEmpresa(e, "58509")).toBe(true);
    expect(casaTextoDaEmpresa(e, "extra")).toBe(true);
    expect(casaTextoDaEmpresa(e, "beta")).toBe(false);
    expect(casaTextoDaTarefa({ titulo: "Conferir", descricao: null, empresa_id: "E1" }, "agro", () => "Extra Agro")).toBe(true);
  });

  it("as 9 páginas com busca local passam o texto para a tabela e não filtram antes; as do servidor marcam noServidor", () => {
    const locais = ["pages/clientes/ClientesPagina.jsx", "pages/clientes/CarteiraPagina.jsx", "pages/clientes/ServicosContratadosPagina.jsx",
      "pages/bpo/TarefasPagina.jsx", "pages/comercial/PropostasPagina.jsx", "pages/ConsultoriaPagina.jsx", "pages/diagnostico/DiagnosticosPagina.jsx",
      "pages/LeadsPage.jsx", "pages/bpo/RepositorioXmlLista.jsx"];
    for (const f of locais) expect(ler(f), f).not.toMatch(/noServidor/);
    expect(ler("pages/clientes/ClientesPagina.jsx")).toMatch(/busca: "", \.\.\.\(vendoArquivados/);
    expect(ler("pages/bpo/TarefasPagina.jsx")).toMatch(/\{ \.\.\.filtros, busca: "" \}/);
    for (const f of ["pages/admin/AcessosPagina.jsx", "components/base-legal/NovidadesLegais.jsx"]) expect(ler(f), f).toMatch(/noServidor: true/);
  });
});

function renderizarClientes({ erroComDados = false, erroSemDados = false } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, enabled: false, retry: false } } });
  if (!erroSemDados) qc.setQueryData(["empresas", "carteiras"], [{ id: "E1", id_empresa: "EXTRA", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58509112000152", grupo: "#001" }]);
  qc.setQueryData(["grupos"], []);
  qc.setQueryData(["servicos-contratados"], []);
  qc.setQueryData(["tags"], []);
  qc.setQueryData(["tags", "por-empresa"], {});
  qc.setQueryData(["carteira", "colaboradores"], []);
  qc.setQueryData(["consultoria", "catalogo"], []);
  qc.setQueryData(["consultoria", "vinculos"], []);
  if (erroComDados || erroSemDados) {
    qc.getQueryCache().build(qc, { queryKey: ["empresas", "carteiras"] }).setState({ status: "error", error: new Error("falhou"), fetchStatus: "idle" });
  }
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/"><ClientesPagina /></StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("falha ao atualizar ao voltar para a aba não esconde a lista (achados 2 e 12)", () => {
  it("com dados já carregados: a tabela continua e aparece só um aviso discreto", () => {
    const html = renderizarClientes({ erroComDados: true });
    expect(html).toContain("EXTRA AGRO LTDA");
    expect(html).toContain("Não foi possível atualizar a lista agora");
    expect(html).not.toContain("Não foi possível carregar os clientes");
  });

  it("sem dado nenhum: erro de tela inteira, mas 'Importar planilha' continua disponível", () => {
    const html = renderizarClientes({ erroSemDados: true });
    expect(html).toContain("Não foi possível carregar os clientes");
    expect(html).toContain("Importar planilha");
  });

  it("Carteira, Serviços contratados e Tarefas seguem o mesmo padrão", () => {
    for (const f of ["pages/clientes/CarteiraPagina.jsx", "pages/clientes/ServicosContratadosPagina.jsx"]) expect(ler(f), f).toContain("<AvisoFalhaAtualizar");
    const tarefas = ler("pages/bpo/TarefasPagina.jsx");
    expect(tarefas).toContain("lista.error && lista.data && <AvisoFalhaAtualizar");
    expect(tarefas).toContain("{!lista.isLoading && lista.data && (");
  });
});

describe("medição das larguras (achados 3 e 10)", () => {
  const base = { chaveVisiveis: "nome|email", pagina: 0, tamanho: 25, total: 3, visiveis: COLUNAS, chaveLinha: (l) => l.id };
  it("arrays novos com o mesmo conteúdo dão a mesma assinatura; mudar uma linha, a página ou as colunas muda", () => {
    const a = assinaturaDaTela({ ...base, exibidas: LINHAS });
    expect(assinaturaDaTela({ ...base, exibidas: LINHAS.map((l) => ({ ...l })) })).toBe(a);
    expect(assinaturaDaTela({ ...base, exibidas: [{ ...LINHAS[0], nome: "Extra Agro Ltda" }, ...LINHAS.slice(1)] })).not.toBe(a);
    expect(assinaturaDaTela({ ...base, pagina: 1, exibidas: LINHAS })).not.toBe(a);
    expect(assinaturaDaTela({ ...base, chaveVisiveis: "nome", exibidas: LINHAS })).not.toBe(a);
  });

  it("a mensagem de lista vazia (colSpan) fica fora da medida e volta depois", () => {
    const estilo = () => ({ width: "", tableLayout: "", minWidth: "", display: "" });
    const vazia = { style: estilo() };
    const th = { dataset: { coluna: "nome" }, style: estilo(), getBoundingClientRect: () => ({ width: vazia.style.display === "none" ? 80 : 600 }) };
    const t = {
      style: estilo(), getBoundingClientRect: () => ({ width: 1000 }),
      tHead: { rows: [{ cells: [th] }], querySelector: () => null },
      tBodies: [{ querySelector: (sel) => (sel === "tr.linha-vazia" ? vazia : null) }],
    };
    expect(medirTabela(t)).toEqual({ nome: 80 });
    expect(vazia.style.display).toBe("");
    const html = renderToString(<TabelaPadrao id="t-vazia" colunas={COLUNAS} linhas={[]} ariaLabel="Teste" />);
    expect(html).toContain('<tr class="linha-vazia">');
  });
});

describe("formulário da empresa não se refaz a cada atualização da lista (achado 4)", () => {
  it("o preenchimento depende de abrir e do id da empresa, não da identidade do objeto", () => {
    const src = ler("components/empresas/EmpresaFormDialog.jsx");
    expect(src).toContain('const chaveEdicao = editing === "new" ? "new" : editing?.id ?? null;');
    expect(src).toContain("}, [open, chaveEdicao, grupoNumero]);");
    expect(src).not.toContain("}, [open, editing, grupoNumero]);");
  });
});

describe("cartões das tarefas se atualizam ao voltar para a aba (achado 5)", () => {
  it("o resumo usa refetchOnWindowFocus como a lista", () => {
    expect(ler("pages/bpo/TarefasPagina.jsx")).toMatch(/queryKey: \["tarefas", "resumo"\][^\n]*refetchOnWindowFocus: true/);
  });
});

describe("trilha (achados 6 e 7)", () => {
  it("o último item é a tela aberta (sem link); a Sala de trabalho termina na aba aberta, e o cliente antes dela mantém o link", () => {
    const t = normalizarCrumbs([{ label: "Clientes", to: "/" }, { label: "EXTRA", to: "/clientes/E1" }, { label: "Serviços" }], "/workroom/1/empresas/E1/servicos");
    expect(t[t.length - 2]).toEqual({ label: "EXTRA", to: "/clientes/E1" });
    const atual = normalizarCrumbs([{ label: "Clientes", to: "/" }, { label: "Grupo", to: "/workroom/1/" }], "/workroom/1");
    expect(atual[atual.length - 1].to).toBeUndefined();
    expect(ler("pages/EmpresaWorkroom.jsx")).toContain("...(abaAtual ? [{ label: abaAtual.label }] : [])");
  });

  it("projeto ou cliente carregando: só 'Início > Consultoria Tributária'", () => {
    const rotulos = (c) => c.map((x) => x.label).join(" > ");
    expect(rotulos(trilhaDoProjeto({ projeto: undefined, cliente: null, carregando: true }))).toBe("Início > Consultoria Tributária");
    expect(trilhaDoProjeto({ projeto: { id: "p", nome: "Saneamento · X", servico_consultoria: "s", empresa_ids: ["e"] }, cliente: { publico: "PJ", id: "e", nome: "", carregando: true } })).toBe(TRILHA_CARREGANDO);
    expect(rotulos(trilhaDoProjeto({ projeto: { id: "p", nome: "Saneamento · X", servico_consultoria: "s", empresa_ids: ["e"] }, cliente: { publico: "PJ", id: "e", nome: "X" } })))
      .toBe("Início > Consultoria Tributária > Carteira de Consultoria > X > Saneamento");
  });
});

describe("CSS: calendário, impressão e botões (achados 8, 9 e 11)", () => {
  const css = ler("index.css");
  it("o título verde das tabelas não pinta o calendário da Agenda", () => {
    expect(css).toContain(":where(table:not(.sem-cabecalho-verde) > thead) :where(th)");
    expect(css).not.toMatch(/^\s*:where\(thead\) :where\(th\)/m);
    expect(ler("pages/bpo/AgendaPagina.jsx")).toContain('<table className="sem-cabecalho-verde');
  });
  it("na impressão a tabela volta ao layout automático e o texto quebra em vez de ser cortado", () => {
    const impressao = css.slice(css.indexOf("@media print"));
    expect(impressao).toMatch(/table \{ table-layout: auto !important; min-width: 0 !important/);
    expect(impressao).toMatch(/text-overflow: clip !important; white-space: normal !important/);
  });
  it("botão sem will-change permanente; dentro de célula só sobe, sem crescer", () => {
    expect(css).not.toContain("will-change: transform");
    expect(css).toMatch(/:is\(td, th\) \.botao-acao:hover \{ transform: translateY\(-1px\); \}/);
  });
});

describe("filtro por etiquetas compacto diz a contagem no nome acessível (achado 13)", () => {
  it("com etiquetas ligadas, o aria-label inclui quantas", () => {
    const tags = [{ id: "a", nome: "Agro", cor: "#0a0" }, { id: "b", nome: "Soja", cor: "#aa0" }];
    const ligado = renderToString(<FiltroPorTags compacto tags={tags} escolhidas={["a", "b"]} modo="qualquer" aoMudar={() => {}} />);
    expect(ligado).toContain('aria-label="Filtrar por etiquetas (2 ligadas)"');
    const um = renderToString(<FiltroPorTags compacto tags={tags} escolhidas={["a"]} modo="qualquer" aoMudar={() => {}} />);
    expect(um).toContain('aria-label="Filtrar por etiquetas (1 ligada)"');
    const nenhum = renderToString(<FiltroPorTags compacto tags={tags} escolhidas={[]} modo="qualquer" aoMudar={() => {}} />);
    expect(nenhum).toContain('aria-label="Filtrar por etiquetas"');
  });
});
