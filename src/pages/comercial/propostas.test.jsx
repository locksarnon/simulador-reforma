import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ atual: "admin" }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "U1", role: papel.atual, email: "maria@fal" } }) }));

const PropostasPagina = (await import("./PropostasPagina")).default;
const { AbaTabela, AbaModelos } = await import("./PropostasPagina");
const { montarPdfDaProposta } = await import("@/lib/propostaPdf");
const { totaisDosItens, validadePadrao } = await import("@/lib/propostas");

const PROPOSTAS = [
  { id: "P1", numero: 7, cliente_nome: "EXTRA AGRO LTDA", servico: "BPO_FISCAL", honorario_mensal: 2500, valor_total: 3000, status: "ENVIADA", createdAt: "2026-11-11T12:00:00Z", validade: "2026-11-26T00:00:00Z", criado_por: "U1", itens: [] },
  { id: "P2", numero: 8, cliente_nome: "Beta SA", servico: "DIAGNOSTICO_PONTUAL", honorario_mensal: null, valor_total: 12000, status: "ACEITA", createdAt: "2026-11-10T12:00:00Z", criado_por: "U2", itens: [] },
];
const TABELA = { base: { "Simples Nacional": 900, "Lucro Presumido": 1800, "Lucro Real": 3500, "Produtor rural PF": 1200 }, por_nota: 1.5, franquia_notas: 300, por_estabelecimento: 400, modulos: { XML: 250, MONITORAMENTO: 350, OBRIGACOES: 300, TAREFAS: 0, ARQUIVOS: 100 }, complexidade: { BAIXA: 0.9, MEDIA: 1, ALTA: 1.35 }, valor_hora: 350, exemplo: true };

function renderizar(elemento) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["empresas", "carteiras"], []);
  qc.setQueryData(["propostas", "lista"], PROPOSTAS);
  qc.setQueryData(["propostas", "tabela"], TABELA);
  qc.setQueryData(["propostas", "modelos"], [{ id: "M1", nome: "BPO padrão", servico: "BPO_FISCAL", ativo: true, itens: [] }]);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/comercial/propostas">{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Propostas e honorários", () => {
  it("lista com número, cliente, serviço, valores e situação; aceita não tem editar nem excluir", () => {
    const html = renderizar(<PropostasPagina />);
    for (const t of ["EXTRA AGRO LTDA", "BPO fiscal", "Diagnóstico pontual", "Enviada", "Aceita", "Nova proposta", "Tabela de honorários", "Modelos"]) expect(html).toContain(t);
    expect(html).toMatch(/R\$\s?2\.500,00/);
    expect(html).toContain('aria-label="Editar a proposta 7"');
    expect(html).not.toContain('aria-label="Editar a proposta 8"');
    expect(html).not.toContain('aria-label="Excluir a proposta 8"');
    expect(html).toContain('aria-label="Baixar o PDF da proposta 8"');
  });

  it("tabela de honorários avisa quando é exemplo; só administrador edita", () => {
    expect(renderizar(<AbaTabela ehAdmin />)).toContain("valores de exemplo");
    expect(renderizar(<AbaTabela ehAdmin />)).toContain("Salvar a tabela");
    const consultor = renderizar(<AbaTabela ehAdmin={false} />);
    expect(consultor).not.toContain("Salvar a tabela");
    expect(consultor).toContain("disabled");
    expect(renderizar(<AbaModelos ehAdmin={false} />)).toContain("Só administradores criam e mudam modelos.");
  });

  it("totais e validade padrão", () => {
    expect(totaisDosItens([{ quantidade: 1, valor_unitario: 2500, recorrente: true }, { quantidade: 2, valor_unitario: 1500 }])).toEqual({ mensal: 2500, unico: 3000 });
    expect(validadePadrao(new Date("2026-11-11T12:00:00Z"))).toBe("2026-11-26");
  });

  it("o PDF traz o número, o cliente, os itens, o mensal e o valor único", () => {
    const doc = montarPdfDaProposta({ numero: 7, cliente_nome: "EXTRA AGRO LTDA", cliente_documento: "58.509.112/0001-52", servico: "BPO_FISCAL", escopo: "Rotina fiscal mensal.", itens: [{ descricao: "BPO fiscal", quantidade: 1, valor_unitario: 2500, recorrente: true }, { descricao: "Implantação", quantidade: 1, valor_unitario: 3000 }], condicoes: "Reajuste anual pelo IPCA.", validade: "2026-11-26T00:00:00Z" }, { hoje: new Date("2026-11-11T12:00:00Z") });
    const texto = doc.output();
    for (const t of ["Proposta comercial", "EXTRA AGRO LTDA", "Honorário mensal", "Valor único", "Reajuste anual pelo IPCA."]) expect(texto).toContain(t);
    expect(texto).toContain("BPO fiscal \\(mensal\\)"); // parênteses vêm escapados no texto do PDF
    expect(texto).toMatch(/Implanta/);
  });
});
