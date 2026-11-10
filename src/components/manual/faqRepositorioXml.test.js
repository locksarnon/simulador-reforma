import { describe, it, expect } from "vitest";
import { FAQ_SECOES } from "./faqData";
import { SECAO_REPOSITORIO_XML } from "./faqRepositorioXml";
import { ROTEIRO } from "@/lib/roteiroTestes";
import { ROTEIRO_REPOSITORIO_XML } from "@/lib/roteiroRepositorioXml";
import documentosFonte from "@/components/repositorio-xml/DocumentosXml.jsx?raw";
import certificadoFonte from "@/components/repositorio-xml/CertificadoXml.jsx?raw";
import capturaFonte from "@/components/repositorio-xml/CapturaXml.jsx?raw";

const TELAS = `${documentosFonte}\n${certificadoFonte}\n${capturaFonte}`;

describe("FAQ do Repositório de XML", () => {
  it("entra logo depois da Importação de XML", () => {
    const titulos = FAQ_SECOES.map((s) => s.titulo);
    expect(titulos.indexOf(SECAO_REPOSITORIO_XML.titulo)).toBe(titulos.indexOf("Importação de XML (NF-e, CT-e) e de planilhas") + 1);
  });

  it("cada resposta que cita nota técnica, ajuste, código da SEFAZ ou norma traz a fonte", () => {
    const cita = /\bNT \d|Ajuste SINIEF|\b(656|589|280)\b|Decreto|Lei Complementar|\bLC \d/;
    for (const item of SECAO_REPOSITORIO_XML.itens) {
      if (cita.test(item.r)) expect(item.f, `falta a fonte em "${item.p}"`).toBeTruthy();
    }
  });

  it("não afirma o que o InTAX não faz", () => {
    const tudo = JSON.stringify(SECAO_REPOSITORIO_XML.itens.map((i) => i.r)).toLowerCase();
    expect(tudo).not.toMatch(/registra a confirma|registra o desconhecimento|calcula o fethab|raspa(gem)? os portais/);
    // O que a tela diz sobre a Ciência: só a Ciência é automática.
    expect(tudo).toContain("registra apenas a ciência");
  });

  it("os limites citados são os do envio por arquivo", () => {
    const envio = SECAO_REPOSITORIO_XML.itens.find((i) => i.p.startsWith("Como envio os XML"))?.r || "";
    expect(envio).toContain("2 MB");
    expect(envio).toContain("5.000 arquivos");
    expect(envio).toContain("200 MB");
  });
});

describe("Roteiro do Repositório de XML", () => {
  it("vem logo depois da Importação de XML e tem a estrutura dos demais", () => {
    const ids = ROTEIRO.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.indexOf(ROTEIRO_REPOSITORIO_XML[0].id)).toBe(ids.indexOf("xml") + 1);
    for (const r of ROTEIRO_REPOSITORIO_XML) {
      for (const campo of ["id", "grupo", "titulo", "rota", "objetivo", "criterio"]) expect(typeof r[campo] === "string" && r[campo].length > 0, `${r.id}.${campo}`).toBe(true);
      expect(r.preparo.length, r.id).toBeGreaterThan(0);
      expect(r.cuidados.length, r.id).toBeGreaterThan(0);
      for (const passo of r.passos) {
        expect(passo.f?.length, `${r.id}: passo sem ação`).toBeGreaterThan(0);
        expect(passo.e?.length, `${r.id}: passo sem resultado esperado`).toBeGreaterThan(0);
      }
    }
  });

  it("os botões e avisos citados existem nas telas", () => {
    const rotulos = [
      "Enviar certificado A1", "Substituir certificado", "Guardar no cofre", "Registrar termo", "Revogar termo", "Remover do cofre",
      "Auditoria do cofre (últimos 20 registros)", "Escolher arquivos", "Baixar ZIP dos filtros", "Abrir Importação XML", "Buscar (chave, número, emitente)",
      "Capturar agora", "Ativar captura", "Ativar Ciência automática", "Cumpra os requisitos acima", "Últimas execuções", "Antes de ativar",
      "Ciência da Operação (libera o XML completo das compras)", "Certificado guardado no cofre", "Envio concluído", "Enviado ao importador",
      "Ambiente da SEFAZ", "UF do interessado", "Estados atendidos", "Captura ativada", "Captura desativada", "Ambiente atualizado", "Período da busca automática", "Período da busca automática atualizado", "Período da busca alterado", "Próxima busca automática",
      "Como baixar nas SEFAZ as notas que o cliente emitiu (MT, MS, GO, MA e PA)", "Só os que faltam enviar ao importador",
      "Documentos no repositório", "Enviados por arquivo", "Captura automática", "Só o resumo (sem XML)", "Aguardando o importador",
    ];
    for (const r of rotulos) expect(TELAS, r).toContain(r);
  });
});
