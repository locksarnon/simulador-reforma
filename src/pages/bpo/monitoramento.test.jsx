import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "qa@fal" } }) }));

const MonitoramentoPagina = (await import("./MonitoramentoPagina")).default;
const MonitoramentoEmpresaPagina = (await import("./MonitoramentoEmpresaPagina")).default;
const ProcuracoesPagina = (await import("../clientes/ProcuracoesPagina")).default;
const ParametrosRotinasPagina = (await import("../admin/ParametrosRotinasPagina")).default;
const PainelDeRisco = (await import("@/components/monitoramento/PainelDeRisco")).default;
const CartaoServico = (await import("@/components/monitoramento/CartaoServico")).default;
const { cruzarDados } = await import("@/components/monitoramento/PainelDeRisco");
const { formatarCelula, piorNivel, servicosDoGrupo } = await import("@/lib/monitoramento");

const GRUPOS = [{ id: "situacao", rotulo: "Situação fiscal" }, { id: "declaracoes", rotulo: "Declarações" }, { id: "guias", rotulo: "Guias e pagamentos" }, { id: "mensagens", rotulo: "Caixa postal" }];
const SERVICOS = [
  { chave: "sitfis", rotulo: "Relatório de situação fiscal", grupo: "situacao", alvo: "TODOS", descricao: "O relatório", parametros: [] },
  { chave: "das", rotulo: "DAS do Simples: gerar a guia", grupo: "guias", alvo: "PJ", para: "SIMPLES", descricao: "O DAS", parametros: [{ nome: "periodo", rotulo: "Competência (AAAAMM)", tipo: "periodo", padrao: "202610", obrigatorio: true }] },
  { chave: "caixa-postal", rotulo: "Caixa postal do e-CAC", grupo: "mensagens", alvo: "TODOS", descricao: "As mensagens", parametros: [] },
  { chave: "dctfweb-recibo", rotulo: "DCTFWeb: recibo", grupo: "declaracoes", alvo: "PJ", para: "NORMAL", descricao: "Recibo", parametros: [] },
];
const ESTADO = { modo: "DEMONSTRACAO", contrato: false, consultas_24h: 3, grupos: GRUPOS, obrigacoes: [{ id: "DCTFWEB", rotulo: "DCTFWeb" }, { id: "MIT", rotulo: "MIT (DCTFWeb)" }], servicos: SERVICOS };
const EMPRESAS = [
  { id: "E1", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58509112000152", regime_atual: "Lucro Presumido", grupo: "#001" },
  { id: "E2", razao_social: "Beta Comércio", cnpj_cpf: "12345678000195", regime_atual: "Simples Nacional", grupo: "#002" },
  { id: "E3", razao_social: "Só Diagnóstico Ltda", cnpj_cpf: "11222333000181", regime_atual: "Lucro Real", grupo: "#003" },
];
const SERVICOS_CONTRATADOS = [
  { id: "S1", empresa_id: "E1", tipo: "BPO_FISCAL", situacao: "ATIVO" }, { id: "S1b", empresa_id: "E1", tipo: "DIAGNOSTICO_PONTUAL", situacao: "ATIVO" },
  { id: "S2", empresa_id: "E2", tipo: "BPO_FISCAL", situacao: "ATIVO" }, { id: "S3", empresa_id: "E3", tipo: "DIAGNOSTICO_PONTUAL", situacao: "ATIVO" },
];
const PAINEL = [{ empresa_id: "E1", grupos: { situacao: "OK", mensagens: "CRITICO" }, atualizado: "2026-11-11T12:00:00Z", simulado: true, score: 75, alertas: [{ chave: "caixa-postal", nivel: "CRITICO", titulo: "50 mensagens; 10 não lida(s), 2 relevante(s)." }] }];
const ULTIMA_CAIXA = { id: "C1", chave: "caixa-postal", nivel: "CRITICO", sucesso: true, simulado: true, createdAt: "2026-11-11T12:00:00Z", solicitado_por: "qa@fal", arquivos: [], resumo: { titulo: "50 mensagens; 10 não lida(s), 2 relevante(s).", destaques: [{ rotulo: "Dados", valor: "Exemplo oficial do Serpro (ambiente de demonstração)" }], tabela: { colunas: [{ chave: "data", rotulo: "Data", tipo: "data" }, { chave: "assunto", rotulo: "Assunto" }], linhas: [{ data: "20220802", assunto: "Termo de intimação" }] } } };
const ULTIMA_SITFIS = { id: "C2", chave: "sitfis", nivel: "OK", sucesso: true, simulado: true, createdAt: "2026-11-11T12:00:00Z", arquivos: [{ indice: 0, nome: "sitfis-documento.pdf", tamanho: 1000 }], resumo: { titulo: "Relatório de situação fiscal emitido.", destaques: [] } };

function renderizar(elemento, local = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, enabled: false } } });
  qc.setQueryData(["monitoramento", "estado"], ESTADO);
  qc.setQueryData(["monitoramento", "painel"], PAINEL);
  qc.setQueryData(["empresas", "carteiras"], EMPRESAS);
  qc.setQueryData(["grupos"], []);
  qc.setQueryData(["servicos-contratados"], SERVICOS_CONTRATADOS);
  qc.setQueryData(["servicos-contratados", "resumo"], {});
  qc.setQueryData(["empresa", "E1"], EMPRESAS[0]);
  qc.setQueryData(["monitoramento", "empresa", "E1"], { ultimas: { "caixa-postal": ULTIMA_CAIXA, sitfis: ULTIMA_SITFIS }, dispensas: [{ obrigacao: "MIT" }], servicos_indicados: ["sitfis", "caixa-postal", "dctfweb-recibo"] });
  qc.setQueryData(["monitoramento", "procuracoes"], [
    { empresa_id: "E1", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58509112000152", certificado: { valido_ate: "2027-05-01T00:00:00Z", dias: 170, situacao: "VALIDO" }, procuracao: null, caminho: "TERMO_A1" },
    { empresa_id: "E2", razao_social: "Beta Comércio", cnpj_cpf: "12345678000195", certificado: null, procuracao: { nivel: "CRITICO", titulo: "Procuração vencida: peça ao cliente que renove no e-CAC.", consultado_em: "2026-11-11T12:00:00Z", simulado: true }, caminho: "SEM_ACESSO" },
  ]);
  qc.setQueryData(["monitoramento", "rotina"], { ativa: true, dias: { situacao: 1, declaracoes: 21, guias: 0, mensagens: 1 }, guias: { ativa: true, dia: 10, enviar_email: false },
    servicos: { sitfis: { frequencia: "MENSAL", dia: 1 }, "caixa-postal": { frequencia: "SEMANAL", dia: 1 } },
    documentos: { sped: { frequencia: "MENSAL", dia: 20 }, certidoes: { FEDERAL: { ativa: true, dias_antes: 15 }, FGTS: { ativa: false, dias_antes: 5 } } },
    agendaveis: [{ chave: "sitfis", rotulo: "Relatório de situação fiscal", grupo: "situacao", para: null }, { chave: "caixa-postal", rotulo: "Caixa postal do e-CAC", grupo: "mensagens", para: null }],
    certidoes: ["FEDERAL", "FGTS"] });
  qc.setQueryData(["documentos", "todos"], [{ id: "D1", empresa_id: "E2", tipo: { nome: "CND federal (Receita e PGFN)" }, situacao: "VENCIDO", validade: "2026-10-01T00:00:00Z" }]);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location={local}>{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Monitoramento fiscal: a carteira", () => {
  it("mostra a faixa de demonstração, os números, uma linha por cliente com a nota e o alerta", () => {
    const html = renderizar(<MonitoramentoPagina />);
    expect(html).toContain("Dados fictícios do Serpro");
    expect(html).toContain("Com algo crítico");
    expect(html).toContain("EXTRA AGRO LTDA");
    expect(html).toContain("Beta Comércio");
    expect(html).toContain(">75<");
    expect(html).toContain("50 mensagens");
    expect(html).toContain("Preparar atualização");
    expect(html).toContain(">CNPJ<");
    expect(html).toContain(">Regime<");
    expect(html).toContain("Legenda das cores");
    expect(html.indexOf("Beta Comércio")).toBeLessThan(html.indexOf("EXTRA AGRO LTDA"));
  });
  it("o gatilho é o BPO fiscal: quem é BPO e diagnóstico aparece; quem é só diagnóstico, não", () => {
    const html = renderizar(<MonitoramentoPagina />);
    expect(html).toContain("EXTRA AGRO LTDA");
    expect(html).not.toContain("Só Diagnóstico Ltda");
    expect(renderizar(<ProcuracoesPagina />)).not.toContain("Só Diagnóstico Ltda");
  });
});

describe("Monitoramento fiscal: o cliente", () => {
  const pagina = () => renderizar(<Routes><Route path="/bpo/monitoramento/:empresaId" element={<MonitoramentoEmpresaPagina />} /></Routes>, "/bpo/monitoramento/E1");
  it("abas dos assuntos indicados, com subabas: a leitura do relatório e um serviço por subaba; e a saúde fiscal", () => {
    const html = pagina();
    for (const t of ["Situação fiscal", "Declarações", "Caixa postal", "Certidões"]) expect(html).toContain(t);
    expect(html).toMatch(/role="tab"[^>]*>Situação fiscal</);
    expect(html).toMatch(/role="tab"[^>]*>Relatório de situação fiscal</);
    expect(html).toContain("Saúde fiscal");
    expect(html).toContain("Preparar atualização");
  });
  it("o painel de cada serviço: resultado, documentos em tabela com Ver e Baixar no fim, e demonstração marcada", () => {
    const html = renderizar(<CartaoServico servico={SERVICOS[0]} ultima={ULTIMA_SITFIS} base="/monitoramento/empresas/E1" desligado={false} />);
    expect(html).toContain("Relatório de situação fiscal emitido.");
    expect(html).toContain("sitfis-documento.pdf");
    expect(html).toContain('aria-label="Ver sitfis-documento.pdf"');
    expect(html).toContain('aria-label="Baixar sitfis-documento.pdf"');
    expect(html).toContain(">Documentos<");
    expect(html).toContain("Filtrar");
    expect(html).toContain("· demonstração");
    expect(html).toMatch(/role="tab"[^>]*>Histórico</);
    expect(html).not.toMatch(/role="tab"[^>]*>Resultado</);
    expect(html).toContain("Marque os documentos para baixar ou enviar por e-mail.");
  });
  it("lê só o que o regime pede: Presumido não tem DAS na lista principal", () => {
    expect(servicosDoGrupo(SERVICOS, "guias", ["sitfis"]).indicados).toHaveLength(0);
    expect(servicosDoGrupo(SERVICOS, "guias", ["sitfis"]).outros.map((s) => s.chave)).toEqual(["das"]);
  });
});

describe("Procurações e certificados", () => {
  it("mostra o caminho de acesso de cada cliente e o que falta", () => {
    const html = renderizar(<ProcuracoesPagina />);
    expect(html).toContain("Pelo A1 do cliente");
    expect(html).toContain("Sem acesso");
    expect(html).toContain("Procuração vencida");
    expect(html).toContain("Guardar o A1");
  });
});

describe("Parâmetros e rotinas", () => {
  it("agenda por serviço e por documento, guias e o botão de gerar agora", () => {
    const html = renderizar(<ParametrosRotinasPagina />);
    expect(html).toContain("Atualização automática ligada");
    expect(html).toContain("Atualização por serviço");
    expect(html).toContain("Caixa postal do e-CAC");
    expect(html).toContain('aria-label="Dia da semana: Caixa postal do e-CAC"');
    expect(html).toContain("SPED e EFD (ECD, ECF, EFD ICMS/IPI, EFD Contribuições)");
    expect(html).toContain("dias antes do vencimento");
    expect(html).toContain("Gerar as guias todo mês");
    expect(html).toContain("Gerar as guias agora (2 clientes)");
  });
});

describe("Análise de risco: painel", () => {
  it("saúde média, top 5, fila de prioridade e radar de certidões", () => {
    const html = renderizar(<PainelDeRisco ehAdmin />);
    expect(html).toContain("Saúde fiscal média");
    expect(html).toContain("Top 5 em risco");
    expect(html).toContain("Fila de prioridade (1)");
    expect(html).toContain("Radar de certidões");
    expect(html).toContain("Vencida");
  });
  it("conferência: cliente do BPO nunca consultado e regime divergente do DTE", () => {
    const painel = new Map(PAINEL.map((p) => [p.empresa_id, p]));
    const ultimas = new Map([["E1", { dte: { resumo: { titulo: "CNPJ Optante Simples" } } }]]);
    const a = cruzarDados({ empresas: EMPRESAS, bpo: new Set(["E1", "E2"]), painel, ultimasPorEmpresa: ultimas, agora: new Date("2026-11-12").getTime() });
    expect(a.map((x) => x.texto).join(" | ")).toMatch(/nunca consultado/);
    expect(a.some((x) => x.nivel === "CRITICO" && /Optante Simples/.test(x.texto))).toBe(true);
  });
  it("formata datas, competências e moeda; pega o pior nível", () => {
    expect(formatarCelula("20220802", "data")).toBe("02/08/2022");
    expect(formatarCelula(201801, "periodo")).toBe("01/2018");
    expect(formatarCelula(58.15, "moeda")).toMatch(/R\$\s?58,15/);
    expect(piorNivel(["OK", "ATENCAO", "INFO"])).toBe("ATENCAO");
    expect(piorNivel([])).toBeUndefined();
  });
});
