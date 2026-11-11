import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ atual: "admin" }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "U1", role: papel.atual, email: "maria@fal" } }) }));

const ArquivosPagina = (await import("./ArquivosPagina")).default;
const { AbaDownloads, AbaTipos } = await import("./ArquivosPagina");
const PessoasFisicasPagina = (await import("@/pages/clientes/PessoasFisicasPagina")).default;
const { situacaoDoCertificado } = await import("@/pages/clientes/PessoasFisicasPagina");
const { contarSituacoes, expiraEm, tamanhoLegivel, trilhaDaPasta } = await import("@/lib/documentos");

const EMPRESAS = [{ id: "E1", id_empresa: "EXTRA", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58.509.112/0001-52" }];
const TIPOS = [{ id: "T1", nome: "Alvará de funcionamento", orgao: "Prefeitura", alerta_dias: 30 }];
const DOCS = [
  { id: "D1", empresa_id: "E1", tipo_id: "T1", tipo: TIPOS[0], numero: "123", validade: "2026-11-01T00:00:00.000Z", situacao: "VENCIDO", arquivo_id: "A1" },
  { id: "D2", pessoa_fisica_id: "P1", tipo_id: null, tipo: null, descricao: "CNH", validade: "2030-01-01T00:00:00.000Z", situacao: "VALIDO" },
];
const PESSOAS = [{ id: "P1", nome: "Jose Carlos Bianchi", cpf: "529.982.247-25", email: "jose@x", empresa_id: "E1", certificado_tipo: "A1", certificado_validade: "2020-01-01T00:00:00.000Z" }];

function renderizar(elemento) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["empresas", "carteiras"], EMPRESAS);
  qc.setQueryData(["pessoas-fisicas"], PESSOAS);
  qc.setQueryData(["documentos", "tipos"], TIPOS);
  qc.setQueryData(["documentos", "lista"], DOCS);
  qc.setQueryData(["downloads"], [{ id: "L1", nome: "notas.zip", arquivos: 3, tamanho: 2_500_000, expira_em: new Date(Date.now() + 3 * 86_400_000).toISOString() }]);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/bpo/arquivos">{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Arquivos e documentos", () => {
  it("abre nos documentos: cartões por situação, de quem é cada documento e o atalho do arquivo", () => {
    const html = renderizar(<ArquivosPagina />);
    for (const t of ["Documentos com validade", "Arquivos", "Meus downloads", "Tipos de documento", "Vencido", "Vence em breve", "Válido", "Alvará de funcionamento", "nº 123 · Prefeitura", "EXTRA AGRO LTDA", "Jose Carlos Bianchi", "CNH", "Novo documento"]) expect(html).toContain(t);
    expect(html).toContain('aria-label="Baixar o arquivo do documento"');
  });
  it("meus downloads mostra tamanho e quando expira; tipos só o administrador muda", () => {
    expect(renderizar(<AbaDownloads />)).toMatch(/notas\.zip[\s\S]*3 arquivo\(s\) · 2,4 MB · Expira em 3 dias/);
    expect(renderizar(<AbaTipos ehAdmin tipos={TIPOS} />)).toContain("Avisar (dias antes)");
    expect(renderizar(<AbaTipos ehAdmin={false} tipos={TIPOS} />)).toContain("Só administradores mudam os tipos de documento.");
  });
  it("utilitários: tamanho, trilha da pasta, contagem e expiração", () => {
    expect(tamanhoLegivel(512)).toBe("512 B");
    expect(tamanhoLegivel(2048)).toBe("2 KB");
    expect(tamanhoLegivel(2_500_000)).toBe("2,4 MB");
    expect(trilhaDaPasta("Contratos/2026")).toEqual([{ nome: "Contratos", pasta: "Contratos" }, { nome: "2026", pasta: "Contratos/2026" }]);
    expect(contarSituacoes(DOCS)).toEqual({ VENCIDO: 1, A_VENCER: 0, VALIDO: 1, SEM_VALIDADE: 0 });
    const agora = new Date("2026-11-11T12:00:00Z");
    expect(expiraEm("2026-11-11T20:00:00Z", agora)).toBe("Expira amanhã");
    expect(expiraEm("2026-11-15T12:00:00Z", agora)).toBe("Expira em 4 dias");
  });
});

describe("Pessoas físicas", () => {
  it("lista nome, CPF, empresa ligada e a situação do certificado", () => {
    const html = renderizar(<PessoasFisicasPagina />);
    for (const t of ["Jose Carlos Bianchi", "529.982.247-25", "EXTRA AGRO LTDA", "A1 · Vencido há", "Nova pessoa física"]) expect(html).toContain(t);
    expect(html).toContain('aria-label="Excluir Jose Carlos Bianchi"');
    papel.atual = "user";
    expect(renderizar(<PessoasFisicasPagina />)).not.toContain('aria-label="Excluir Jose Carlos Bianchi"');
    papel.atual = "admin";
  });
  it("situação do certificado", () => {
    expect(situacaoDoCertificado(null).rotulo).toBe("Sem certificado informado");
    expect(situacaoDoCertificado("2026-11-01", "2026-11-11").rotulo).toBe("Vencido há 10 dia(s)");
    expect(situacaoDoCertificado("2026-11-21", "2026-11-11").rotulo).toBe("Vence em 10 dia(s)");
    expect(situacaoDoCertificado("2027-11-21", "2026-11-11").rotulo).toBe("Válido até 21/11/2027");
  });
});
