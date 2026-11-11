import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dividirEmLotes, fmtData, fmtDoc, fmtMoeda, importavelNoImportador } from "./formatos";

const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: auth.role, email: "fulano@fal" } }) }));
vi.mock("@/components/ConfirmProvider", () => ({ useConfirmar: () => async () => true }));

const DocumentosXml = (await import("./DocumentosXml")).default;
const CertificadoXml = (await import("./CertificadoXml")).default;
const CapturaXml = (await import("./CapturaXml")).default;

const PARAMETROS = { tipo: "", origem: "", conteudo: "", de: "", ate: "", pendentes: undefined, q: undefined };
const certificado = (extra = {}) => ({
  id: "c1", titular: "EMPRESA TESTE LTDA:12345678000195", emissor: "AC TESTE", documento: "12345678000195", documento_formatado: "12.345.678/0001-95",
  valido_de: "2026-01-01T00:00:00Z", valido_ate: "2027-01-01T00:00:00Z", dias_para_vencer: 200, situacao: "ATIVO", enviado_por: "admin@fal", enviado_em: "2026-11-01T10:00:00Z",
  ...extra,
});
const dadosCofre = (extra = {}) => ({ cofre_configurado: true, empresa: { id: "E1", razao_social: "EMPRESA TESTE", cnpj_formatado: "12.345.678/0001-95" }, certificado: null, ...extra });

function renderizar(elemento, { cache = [] } = {}) {
  // staleTime infinito: com o cache já preenchido, a renderização no servidor não marca a lista como "Atualizando…".
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  for (const [chave, dados] of cache) qc.setQueryData(chave, dados);
  // O React separa textos vizinhos com comentários (<!-- -->); tirá-los deixa as comparações no texto que a pessoa lê.
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/">{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("formatos do repositório de XML", () => {
  it("o envio é dividido em pedidos de até 100 arquivos e 100 MB (o servidor recusa pedidos acima de 120 MB)", () => {
    const MB = 1024 * 1024;
    const arquivo = (mb) => ({ size: mb * MB });
    expect(dividirEmLotes([])).toEqual([]);
    expect(dividirEmLotes(Array.from({ length: 250 }, () => arquivo(0.01))).map((l) => l.length)).toEqual([100, 100, 50]);
    expect(dividirEmLotes([arquivo(30), arquivo(30), arquivo(30), arquivo(30), arquivo(30)]).map((l) => l.length)).toEqual([3, 2]);
    expect(dividirEmLotes([arquivo(30), arquivo(80), arquivo(1)]).map((l) => l.length)).toEqual([1, 2]);
    // nenhum arquivo se perde nem se repete
    const todos = Array.from({ length: 37 }, (_, i) => ({ size: (i % 7 + 1) * 5 * MB, id: i }));
    expect(dividirEmLotes(todos).flat().map((f) => f.id)).toEqual(todos.map((f) => f.id));
  });

  it("CNPJ, CNPJ alfanumérico e CPF com a pontuação de costume", () => {
    expect(fmtDoc("12345678000195")).toBe("12.345.678/0001-95");
    expect(fmtDoc("12abc34501de35")).toBe("12.ABC.345/01DE-35");
    expect(fmtDoc("12345678909")).toBe("123.456.789-09");
    expect(fmtDoc(null)).toBe("—");
  });
  it("valor e data em pt-BR no fuso de Brasília", () => {
    expect(fmtMoeda(15250.9).replace(/\s/g, " ")).toBe("R$ 15.250,90");
    expect(fmtMoeda(null)).toBe("—");
    expect(fmtData("2026-11-05T01:00:00Z")).toBe("04/11/2026");
  });
});

describe("CertificadoXml", () => {
  it("administrador sem certificado: vê o envio e a auditoria, e nenhum pedido de termo", () => {
    auth.role = "admin";
    const html = renderizar(<CertificadoXml empresaId="E1" />, { cache: [[["repo-xml-cert", "E1"], dadosCofre()], [["repo-xml-auditoria", "E1"], []]] });
    expect(html).toContain("Enviar certificado A1");
    expect(html).toContain("Nenhum certificado guardado para");
    expect(html).toContain("EMPRESA TESTE");
    expect(html).not.toContain("Termo de autorização");
    expect(html).not.toContain("Registrar termo");
    expect(html).toContain("Auditoria do cofre");
    expect(html).toContain("A senha do arquivo é usada só no envio e não é guardada");
  });

  it("cofre sem chave no servidor: avisa e não oferece o envio", () => {
    auth.role = "admin";
    const html = renderizar(<CertificadoXml empresaId="E1" />, { cache: [[["repo-xml-cert", "E1"], dadosCofre({ cofre_configurado: false })], [["repo-xml-auditoria", "E1"], []]] });
    expect(html).toContain("CERT_VAULT_KEY");
    expect(html).not.toContain("Enviar certificado A1");
  });

  it("usuário comum vê o estado, sem enviar, remover nem auditoria", () => {
    auth.role = "user";
    const html = renderizar(<CertificadoXml empresaId="E1" />, {
      cache: [[["repo-xml-cert", "E1"], dadosCofre({ certificado: certificado() })]],
    });
    expect(html).toContain("EMPRESA TESTE LTDA:12345678000195");
    expect(html).toContain("Ativo");
    expect(html).not.toContain("Substituir certificado");
    expect(html).not.toContain("Enviar certificado A1");
    expect(html).not.toContain("Remover do cofre");
    expect(html).not.toContain("Auditoria do cofre");
  });

  it("a auditoria mostra cada ação com palavras, nunca o código interno", () => {
    auth.role = "admin";
    const codigos = [
      "ENVIO", "REVOGACAO", "USO_CAPTURA", "USO_MANIFESTACAO",
      "CAPTURA_ATIVADA", "CAPTURA_DESATIVADA", "CAPTURA_AMBIENTE", "CAPTURA_PERIODO", "CIENCIA_ATIVADA", "CIENCIA_DESATIVADA", "EMPRESA_EXCLUIDA",
    ];
    const linhas = codigos.map((acao, i) => ({ id: `a${i}`, createdAt: "2026-11-10T12:00:00Z", acao, usuario: "admin@fal", detalhe: "detalhe" }));
    const html = renderizar(<CertificadoXml empresaId="E1" />, { cache: [[["repo-xml-cert", "E1"], dadosCofre()], [["repo-xml-auditoria", "E1"], linhas]] });
    for (const codigo of codigos) expect(html, codigo).not.toContain(`>${codigo}<`);
    for (const rotulo of ["Captura ativada", "Captura desativada", "Ambiente da SEFAZ alterado", "Período da busca alterado", "Ciência automática ativada", "Ciência automática desativada", "Empresa excluída", "Uso na captura"]) {
      expect(html, rotulo).toContain(`>${rotulo}<`);
    }
  });

  it("certificado vencido e certificado removido aparecem com o rótulo certo", () => {
    auth.role = "admin";
    const vencido = renderizar(<CertificadoXml empresaId="E1" />, { cache: [[["repo-xml-cert", "E1"], dadosCofre({ certificado: certificado({ situacao: "VENCIDO", dias_para_vencer: -5 }) })], [["repo-xml-auditoria", "E1"], []]] });
    expect(vencido).toContain("Vencido");
    expect(vencido).toContain("vencido");
    const removido = renderizar(<CertificadoXml empresaId="E1" />, { cache: [[["repo-xml-cert", "E1"], dadosCofre({ certificado: certificado({ situacao: "REVOGADO", revogado_em: "2026-11-03T10:00:00Z", revogado_por: "admin@fal" }) })], [["repo-xml-auditoria", "E1"], []]] });
    expect(removido).toContain("Removido do cofre");
    expect(removido).toContain("Enviar certificado A1");
    expect(removido).not.toContain("Remover do cofre</button>");
  });
});

describe("CapturaXml", () => {
  const tipo = (extra = {}) => ({
    tipo: "NFE", ativo: false, ultimo_nsu: "000000000000000", max_nsu: null, proxima_consulta_em: null, bloqueado_ate: null, ultima_consulta_em: null,
    ultimo_cstat: null, ultimo_motivo: null, em_execucao: false, liberado_em: null, ...extra,
  });
  const captura = (extra = {}) => ({ ambiente: "PRODUCAO", uf_autor: "51", requisitos: { certificado_ativo: true }, tipos: [tipo()], execucoes: [], ...extra });
  const montar = (dados) => renderizar(<CapturaXml empresaId="E1" />, { cache: [[["repo-xml-captura", "E1"], dados]] });
  const botaoAtivar = (html) => html.match(/<button[^>]*>(?:(?!<\/button>).)*Ativar captura<\/button>/)?.[0] ?? "";

  it("estados atendidos (MT, MS, GO, MA, PA) vêm primeiro na escolha da UF", () => {
    auth.role = "admin";
    const html = montar(captura());
    const grupo = html.slice(html.indexOf("Estados atendidos"), html.indexOf("Outros estados"));
    const ordem = ["MT (51)", "MS (50)", "GO (52)", "MA (21)", "PA (15)"].map((u) => grupo.indexOf(u));
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(grupo).not.toContain("SP (35)");
    expect(html.slice(html.indexOf("Outros estados"))).toContain("SP (35)");
  });

  it("Ciência da Operação: explica o que é, mostra os números e oferece ativar (a confirmação expressa vem na janela)", () => {
    auth.role = "admin";
    const ciencia = { ativa: false, consentida_em: null, consentida_por: null, resumos_sem_ciencia: 12, registradas: 40, nao_aplicaveis: 3 };
    const html = montar(captura({ ciencia }));
    expect(html).toContain("Ciência da Operação (libera o XML completo das compras)");
    expect(html).toContain("O InTAX registra apenas a Ciência, nunca a Confirmação, o Desconhecimento nem a Operação não Realizada");
    expect(html).toContain("Ativar Ciência automática");
    const botao = html.match(/<button[^>]*>Ativar Ciência automática<\/button>/)?.[0] ?? "";
    expect(botao).not.toContain('disabled=""');
    for (const [rotulo, numero] of [["Resumos aguardando", "12"], ["Ciência registrada", "40"], ["Fora do prazo ou não aplicável", "3"]]) {
      expect(html).toContain(`${rotulo}</dt><dd class="tabular-nums">${numero}</dd>`);
    }
  });

  it("Ciência ativa mostra quem autorizou e oferece desativar; usuário comum só acompanha", () => {
    const ciencia = { ativa: true, consentida_em: "2026-11-10T12:00:00Z", consentida_por: "admin@fal", resumos_sem_ciencia: 0, registradas: 5, nao_aplicaveis: 0 };
    auth.role = "admin";
    const admin = montar(captura({ ciencia }));
    expect(admin).toContain("Autorizada por admin@fal");
    expect(admin).toContain("Ativa: o InTAX registra a Ciência, em nome do cliente");
    expect(admin).not.toContain("Ativar Ciência automática");
    auth.role = "user";
    const comum = montar(captura({ ciencia }));
    expect(comum).toContain("Autorizada por admin@fal");
    expect(comum).not.toContain("Ativar Ciência automática");
  });

  it("avisa quando o agendador está desligado no servidor e fica quieto quando está ligado", () => {
    auth.role = "admin";
    expect(montar(captura({ agendador_ativo: false }))).toContain("O agendador da captura está desligado neste servidor");
    expect(montar(captura({ agendador_ativo: true }))).not.toContain("O agendador da captura está desligado");
  });

  it("administrador com requisitos cumpridos pode ativar; sem certificado, não", () => {
    auth.role = "admin";
    expect(botaoAtivar(montar(captura()))).not.toContain('disabled=""');
    const sem = montar(captura({ requisitos: { certificado_ativo: false } }));
    expect(botaoAtivar(sem)).toContain('disabled=""');
    expect(sem).toContain("Certificado digital A1 do cliente guardado e dentro da validade");
  });

  it("captura ativa mostra Capturar agora e Desativar; antes da janela da SEFAZ o botão fica travado com o motivo", () => {
    auth.role = "admin";
    const futuro = new Date(Date.now() + 40 * 60_000).toISOString();
    const html = montar(captura({ tipos: [tipo({ ativo: true, ultimo_nsu: "000000000000070", max_nsu: "000000000000070", ultimo_cstat: "137", ultimo_motivo: "Nenhum documento novo.", proxima_consulta_em: futuro, liberado_em: futuro })] }));
    expect(html).toContain("Captura ativa");
    expect(html).toContain("Desativar");
    expect(html).toContain("Capturar agora");
    expect(html).toContain("A SEFAZ só permite nova consulta a partir de");
    expect(html).toContain("000000000000070 de 000000000000070");
    expect(html).toContain("Nenhum documento novo.");
  });

  it("usuário comum só acompanha; o texto explica o que a captura não traz", () => {
    auth.role = "user";
    const html = montar(captura({ tipos: [tipo({ ativo: true })], execucoes: [{ id: "x1", iniciado_em: "2026-11-10T12:00:00Z", origem: "AGENDADOR", usuario: null, consultas: 2, docs_recebidos: 70, docs_novos: 68, ultimo_cstat: "138", mensagem: "68 documento(s) novo(s), 2 já existiam.", finalizado_em: "2026-11-10T12:00:05Z" }] }));
    expect(html).not.toContain("Ativar captura");
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*Capturar agora<\/button>/); // o texto da tela cita o botão, mas o botão não existe para usuário comum
    expect(html).toContain("As notas que o próprio cliente emitiu não vêm por este serviço");
    expect(html).toContain("90 dias");
    expect(html).toContain("68 documento(s) novo(s), 2 já existiam.");
    expect(html).toContain("Automática");
  });

  it("NFS-e Nacional aparece como terceiro tipo de captura, e o texto avisa que depende do município compartilhar as notas", () => {
    auth.role = "admin";
    const html = montar(captura({ tipos: [tipo(), tipo({ tipo: "CTE" }), tipo({ tipo: "NFSE", ativo: true, ultimo_nsu: "000000000000042" })] }));
    expect(html).toContain("NFS-e Nacional (notas de serviço em que o cliente é prestador, tomador ou intermediário)");
    expect(html).toContain("000000000000042");
    expect(html).toContain("Ambiente de Dados Nacional (ADN)");
    expect(html).toContain("compartilham as suas NFS-e com o ambiente nacional");
    expect(html).toContain("a documentação do ADN não é conclusiva");
    expect(html).toContain("Retorno do ADN");
    expect(html).not.toContain(">NFSE<");
  });

  const periodoNoturno = { atual: "NOTURNO", texto: "Noturno, das 18:00 às 05:59 (horário de Brasília)", aberto_agora: false, opcoes: [{ valor: "NOTURNO", texto: "Noturno, das 18:00 às 05:59 (horário de Brasília)" }, { valor: "DIURNO", texto: "Diurno, das 06:00 às 17:59 (horário de Brasília)" }] };

  it("o período da busca automática (Noturno ou Diurno) é escolhido na tela, e o texto diz quando a rotina consulta", () => {
    auth.role = "admin";
    const html = montar(captura({ agendador_ativo: true, periodo: periodoNoturno, tipos: [tipo({ ativo: true, proxima_automatica_em: "2099-11-11T21:00:00Z" })] }));
    expect(html).toContain("Período da busca automática");
    expect(html).toContain("Noturno, das 18:00 às 05:59 (horário de Brasília)");
    expect(html).toContain("Diurno, das 06:00 às 17:59 (horário de Brasília)");
    expect(html).toContain("Captura ativa: a rotina automática consulta a SEFAZ no período Noturno, das 18:00 às 05:59 (horário de Brasília)");
    expect(html).toContain("funciona a qualquer hora");
    expect(html).toContain("Próxima busca automática");
    expect(html).toMatch(/<option value="NOTURNO" selected="">/);
    // usuário comum vê o período, mas não troca
    auth.role = "user";
    const comum = montar(captura({ periodo: periodoNoturno }));
    expect(comum).toMatch(/Período da busca automática<\/span><select[^>]*disabled=""/);
  });

  it("com o agendador desligado o texto não promete rotina automática, e sem busca agendada a próxima é um traço", () => {
    auth.role = "admin";
    const html = montar(captura({ agendador_ativo: false, periodo: { ...periodoNoturno, atual: "DIURNO" }, tipos: [tipo({ ativo: true, proxima_automatica_em: null })] }));
    expect(html).toContain("Captura ativa, mas o agendador está desligado neste servidor");
    expect(html).not.toContain("a rotina automática consulta");
    expect(html).toMatch(/Próxima busca automática<\/dt><dd>—<\/dd>/);
    expect(html).toMatch(/<option value="DIURNO" selected="">/);
  });

  it("a NFS-e não exige a UF do interessado para ser ativada; a NF-e e o CT-e continuam exigindo", () => {
    auth.role = "admin";
    const html = montar(captura({ uf_autor: null, tipos: [tipo(), tipo({ tipo: "CTE" }), tipo({ tipo: "NFSE" })] }));
    const botoes = html.match(/<button[^>]*>(?:(?!<\/button>).)*Ativar captura<\/button>/g) ?? [];
    expect(botoes).toHaveLength(3);
    expect(botoes[0]).toContain('disabled=""'); // NF-e
    expect(botoes[1]).toContain('disabled=""'); // CT-e
    expect(botoes[2]).not.toContain('disabled=""'); // NFS-e
    expect(html).toContain("necessária para NF-e e CT-e, não para NFS-e");
    // sem certificado, nenhuma é liberada
    const sem = montar(captura({ uf_autor: "51", requisitos: { certificado_ativo: false }, tipos: [tipo({ tipo: "NFSE" })] }));
    expect(botaoAtivar(sem)).toContain('disabled=""');
  });
});

describe("DocumentosXml", () => {
  const resumo = { total: 7, por_origem: { UPLOAD: 5, CAPTURA: 2 }, por_tipo: { NFE: 6, EVENTO: 1 }, so_resumo: 1, nao_enviados_ao_importador: 3 };
  const doc = {
    id: "d1", tipo: "NFE", chave: "51261112345678000195550010000001231000000010", evento_tipo: "", sequencia: 0, modelo: "55", numero: "123", serie: "1",
    data_emissao: "2026-11-05T13:15:00Z", emitente_doc: "12345678000195", emitente_nome: "FORNECEDOR AGRO LTDA", valor_total: 15250.9, conteudo: "COMPLETO",
    situacao: "CANCELADA", origem: "UPLOAD", lote_importacao_id: null, importado_em: null,
  };

  it("mostra a área de envio, os filtros, os totais e a lista", () => {
    auth.role = "admin";
    const html = renderizar(<DocumentosXml empresaId="E1" empresa={{ id_empresa: "EMP-1" }} />, {
      cache: [[["repo-xml-resumo", "E1"], resumo], [["repo-xml-docs", "E1", PARAMETROS, 0, 50], { total: 1, itens: [doc] }]],
    });
    expect(html).toContain("Arraste aqui os XML ou ZIP do cliente");
    expect(html).toContain("Documentos que não citam o CNPJ desta empresa são recusados");
    expect(html).toContain("Só o resumo (sem XML)");
    expect(html).toContain("Aguardando o importador");
    expect(html).toContain("Enviar pendentes ao importador");
    expect(html).toContain("Baixar ZIP dos filtros");
    expect(html).toContain("Só os que faltam enviar ao importador");
    expect(html).toContain("FORNECEDOR AGRO LTDA");
    expect(html).toContain("12.345.678/0001-95");
    expect(html).toContain("R$");
    expect(html).toContain("Cancelada");
    expect(html).toContain("Pendente");
    expect(html).toContain("1 documento(s)");
  });

  it("tabela compacta: o emitente cabe numa linha só (nome e CNPJ juntos, ou só o CNPJ quando a captura não traz o nome)", () => {
    auth.role = "admin";
    const evento = { ...doc, id: "d2", tipo: "EVENTO", evento_tipo: "610514", numero: "33874", serie: "1", emitente_nome: null, emitente_doc: "33683111000107", valor_total: null, conteudo: "RESUMO", situacao: null, origem: "CAPTURA" };
    const html = renderizar(<DocumentosXml empresaId="E1" empresa={null} />, {
      cache: [[["repo-xml-resumo", "E1"], resumo], [["repo-xml-docs", "E1", PARAMETROS, 0, 50], { total: 2, itens: [doc, evento] }]],
    });
    expect(html).toContain('FORNECEDOR AGRO LTDA <span class="text-xs text-muted-foreground tabular-nums">12.345.678/0001-95</span>');
    expect(html).toContain('<span class="block truncate"><span class="tabular-nums">33.683.111/0001-07</span></span>');
    // linhas baixas: pouco espaço vertical nas células e letra um pouco menor
    const corpo = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
    expect(corpo).not.toContain("py-2");
    expect(corpo).toContain('<td class="py-1 pr-3 whitespace-nowrap">');
    expect(html).toContain('<table class="w-full text-[13px] leading-5">');
  });

  it("deixa escolher quantos documentos mostrar: 10, 50, 100, 500 ou todos (50 por padrão, com paginação)", () => {
    auth.role = "user";
    const html = renderizar(<DocumentosXml empresaId="E1" empresa={null} />, {
      cache: [[["repo-xml-resumo", "E1"], resumo], [["repo-xml-docs", "E1", PARAMETROS, 0, 50], { total: 120, itens: [doc] }]],
    });
    const seletor = html.match(/<select[^>]*aria-label="Documentos por página"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? "";
    expect([...seletor.matchAll(/<option value="(\d+)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]])).toEqual([["10", "10"], ["50", "50"], ["100", "100"], ["500", "500"], ["0", "Todos"]]);
    expect(seletor).toMatch(/<option value="50" selected="">/);
    expect(html).toContain("1–50 de 120");
    expect(html).toContain("Próxima");
  });

  it("em Todos não há paginação, e acima do teto de 5.000 a tela avisa para filtrar", () => {
    auth.role = "user";
    const antes = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "0", setItem: () => {} } });
    try {
      const html = renderizar(<DocumentosXml empresaId="E1" empresa={null} />, {
        cache: [[["repo-xml-resumo", "E1"], resumo], [["repo-xml-docs", "E1", PARAMETROS, 0, 0], { total: 6000, itens: [doc] }]],
      });
      expect(html).toMatch(/<option value="0" selected="">Todos<\/option>/);
      expect(html).toContain("Mostrando os primeiros 5.000 de 6.000 documentos");
      expect(html).not.toContain("Próxima");
      expect(html).toContain("Selecionar todos os exibidos");
    } finally {
      if (antes) Object.defineProperty(globalThis, "localStorage", antes); else delete globalThis.localStorage;
    }
  });

  it("orienta onde baixar nas SEFAZ as notas emitidas pelo cliente nos cinco estados, com link só onde há fonte oficial", () => {
    auth.role = "user";
    const html = renderizar(<DocumentosXml empresaId="E1" empresa={null} />, {
      cache: [[["repo-xml-resumo", "E1"], { total: 0 }], [["repo-xml-docs", "E1", PARAMETROS, 0, 50], { total: 0, itens: [] }]],
    });
    expect(html).toContain("Como baixar nas SEFAZ as notas que o cliente emitiu (MT, MS, GO, MA e PA)");
    expect(html).toContain("autXML");
    for (const uf of ["MT", "MS", "GO", "MA", "PA"]) expect(html).toContain(`<span class="font-semibold w-7 shrink-0">${uf}</span>`);
    expect(html.match(/Página oficial/g)).toHaveLength(3);
    expect(html).toContain("https://efazenda.servicos.ms.gov.br/e-fazenda/inicio.html");
  });

  it("repositório vazio orienta o envio", () => {
    auth.role = "user";
    const html = renderizar(<DocumentosXml empresaId="E1" empresa={null} />, {
      cache: [[["repo-xml-resumo", "E1"], { ...resumo, total: 0 }], [["repo-xml-docs", "E1", PARAMETROS, 0, 50], { total: 0, itens: [] }]],
    });
    expect(html).toContain("Nenhum documento neste repositório ainda");
  });

  it("NFS-e e MDF-e ficam só guardados: a coluna do importador mostra o traço com o motivo, e não \"Pendente\"", () => {
    auth.role = "admin";
    const nfse = { ...doc, id: "d2", tipo: "NFSE", chave: "51034032212345678000195000000000012326119999999990", modelo: null, situacao: "AUTORIZADA", origem: "CAPTURA" };
    const html = renderizar(<DocumentosXml empresaId="E1" empresa={null} />, {
      cache: [[["repo-xml-resumo", "E1"], resumo], [["repo-xml-docs", "E1", PARAMETROS, 0, 50], { total: 1, itens: [nfse] }]],
    });
    expect(html).toContain("NFS-e Nacional");
    expect(html).toContain("O importador ainda não lê este tipo de documento (NFS-e e MDF-e); ele fica guardado aqui");
    expect(html).not.toContain(">Pendente<");
  });

  it("só NF-e, NFC-e e CT-e com os eventos deles vão ao importador", () => {
    expect(importavelNoImportador({ tipo: "NFE", modelo: "55" })).toBe(true);
    expect(importavelNoImportador({ tipo: "CTE", modelo: "57" })).toBe(true);
    expect(importavelNoImportador({ tipo: "EVENTO", modelo: "55" })).toBe(true);
    expect(importavelNoImportador({ tipo: "EVENTO", modelo: "67" })).toBe(true);
    expect(importavelNoImportador({ tipo: "NFSE", modelo: null })).toBe(false);
    expect(importavelNoImportador({ tipo: "MDFE", modelo: "58" })).toBe(false);
    expect(importavelNoImportador({ tipo: "EVENTO", modelo: null })).toBe(false);
    expect(importavelNoImportador({ tipo: "EVENTO", modelo: "58" })).toBe(false);
  });
});
