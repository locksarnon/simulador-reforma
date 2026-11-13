import { describe, it, expect } from "vitest";
import { FAQ_SECOES } from "./faqData";
import { SECAO_REPOSITORIO_XML } from "./faqRepositorioXml";
import { ROTEIRO } from "@/lib/roteiroTestes";
import { ROTEIRO_REPOSITORIO_XML } from "@/lib/roteiroRepositorioXml";
import { MAX_PDF_NO_ZIP } from "@/components/repositorio-xml/formatos";
import documentosFonte from "@/components/repositorio-xml/DocumentosXml.jsx?raw";
import certificadoFonte from "@/components/repositorio-xml/CertificadoXml.jsx?raw";
import capturaFonte from "@/components/repositorio-xml/CapturaXml.jsx?raw";
import cartoesFonte from "@/components/repositorio-xml/CartoesDoRepositorio.jsx?raw";
import relatoriosFonte from "@/components/repositorio-xml/RelatoriosXml.jsx?raw";
import paginaFonte from "@/pages/bpo/RepositorioXmlEmpresa.jsx?raw";
import configuracaoFonte from "@/components/repositorio-xml/ConfiguracaoCaptura.jsx?raw";
import interruptorFonte from "@/components/repositorio-xml/InterruptorCaptura.jsx?raw";
import fichaFonte from "@/pages/clientes/FichaClientePagina.jsx?raw";

const TELAS = [documentosFonte, certificadoFonte, capturaFonte, cartoesFonte, relatoriosFonte, paginaFonte, configuracaoFonte, interruptorFonte, fichaFonte].join(" ");

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

  it("a resposta do PDF cita os cinco documentos, o limite do ZIP, o que não tem PDF e que o XML é o documento fiscal", () => {
    const pdf = SECAO_REPOSITORIO_XML.itens.find((i) => i.p.includes("PDF dos documentos"));
    expect(pdf, "falta a pergunta do PDF").toBeTruthy();
    expect(pdf.r).toContain(`até ${MAX_PDF_NO_ZIP} documentos por ZIP`);
    for (const doc of ["DANFE", "DANFE NFC-e", "DACTE", "DAMDFE", "DANFSe"]) expect(pdf.r, doc).toContain(doc);
    for (const sem of ["Eventos", "CT-e OS", "só resumo"]) expect(pdf.r, sem).toContain(sem);
    expect(pdf.r).toContain("O que vale como documento fiscal é o XML");
    expect(pdf.f).toContain("Ajuste SINIEF 07/05");
    expect(pdf.f).toContain("Nota Técnica nº 008/2026");
    expect(pdf.f).toContain("Não confirmado");
  });

  it("a pergunta do resumo manda para o item Resumos e eventos SEFAZ e diz que os eventos ficam nele", () => {
    const resumo = SECAO_REPOSITORIO_XML.itens.find((i) => i.p.includes("Só resumo"));
    expect(resumo.r).toContain("item Resumos e eventos SEFAZ");
    expect(resumo.r).toContain("junto com os eventos");
    expect(resumo.r).toContain("passa para o item do tipo dele");
  });

  it("a resposta dos relatórios diz os dois relatórios, os limites e os formatos", () => {
    const rel = SECAO_REPOSITORIO_XML.itens.find((i) => i.p.includes("relatórios"));
    expect(rel, "falta a pergunta dos relatórios").toBeTruthy();
    for (const termo of ["Geral", "Produtos", "2.000 notas", "500 linhas", "20.000 linhas", "Baixar Excel", "Baixar CSV", "Gerar relatório"]) expect(rel.r, termo).toContain(termo);
  });

  it("o menu da empresa é descrito com os itens na ordem em que aparecem", () => {
    const menu = SECAO_REPOSITORIO_XML.itens.find((i) => i.p.startsWith("O que é o Repositório de XML"));
    expect(menu.r).toContain("NF-e | NFC-e, CT-e, NFS-e e MDF-e");
    expect(menu.r).toContain("Resumos e eventos SEFAZ");
    expect(menu.r).toContain("Relatórios");
    expect(SECAO_REPOSITORIO_XML.nota).toContain("Certificado, Captura, um item por tipo de documento");
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
      "Enviar certificado A1", "Substituir certificado", "Guardar no cofre", "Remover do cofre",
      "Auditoria do cofre (últimos 20 registros)", "Escolher arquivos", "Baixar ZIP dos filtros", "Incluir os PDF dos documentos", "Visualizar o PDF", "Baixar o PDF", "Ciência da Operação", "Abrir Importação XML", "Menu do repositório", "NF-e | NFC-e", "Relatórios", "Gerar relatório", "Baixar Excel", "Baixar CSV", "Contar também os que só têm o resumo", "Buscar nos itens", "Somar por", "Buscar (chave, número, emitente)",
      "Capturar agora", "Últimas execuções", "Certificado digital A1", "Captura de XML", "Período da busca automática", "Documentos capturados", "Registrar a Ciência em nome dos clientes", "Captura ligada", "Captura desligada",
      "Certificado guardado no cofre", "Envio concluído", "Enviado ao importador",
      "Ambiente da SEFAZ", "Estados atendidos", "Ambiente atualizado", "Próxima busca",
      "Como baixar nas SEFAZ as notas que o cliente emitiu (MT, MS, GO, MA e PA)", "Só os que faltam enviar ao importador",
      "Documentos no repositório", "Enviados por arquivo", "Captura automática", "Resumos e eventos SEFAZ", "Aguardando o importador",
    ];
    for (const r of rotulos) expect(TELAS, r).toContain(r);
  });
});
