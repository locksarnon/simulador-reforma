import { describe, expect, it } from "vitest";
import {
  agruparPorMes, fmtIso, nomeDoArquivoIcs, paramsDaAgenda, periodoDoMarco, quando, regimesDoMarco, ROTULO_ANTECEDENCIA, situacaoEmPalavras, textoDaFonte, ufsDoMarco, urlDoCalendario,
} from "./agendaReforma";

const m = (extra) => ({ tipo: "marco", data: "2027-01-01", data_fim: null, regimes: [], ufs: [], situacao: "futuro", dias_para: 52, ...extra });

describe("Agenda da Reforma: textos", () => {
  it("escreve a data em dd/mm/aaaa sem passar por fuso", () => {
    expect(fmtIso("2026-12-31")).toBe("31/12/2026");
    expect(fmtIso("2027-01-01T00:00:00.000Z")).toBe("01/01/2027");
    expect(fmtIso(null)).toBe("");
    expect(fmtIso("lixo")).toBe("");
  });

  it("diz quando a data cai", () => {
    expect([0, 1, 7, -1, -5].map(quando)).toEqual(["hoje", "amanhã", "em 7 dias", "ontem", "há 5 dias"]);
  });

  it("descreve o período: dia único, janela ou vigência a partir de", () => {
    expect(periodoDoMarco(m({ tipo: "prazo", data: "2027-06-30" }))).toBe("30/06/2027");
    expect(periodoDoMarco(m({ tipo: "prazo", data: "2026-11-03", data_fim: "2026-12-20" }))).toBe("de 03/11/2026 a 20/12/2026");
    expect(periodoDoMarco(m({ data: "2027-01-01" }))).toBe("a partir de 01/01/2027");
    expect(periodoDoMarco(m({ data: "2029-01-01", data_fim: "2032-12-31" }))).toBe("de 01/01/2029 a 31/12/2032");
  });

  it("diz a situação: prazo conta do último dia, marco de vigência do começo", () => {
    expect(situacaoEmPalavras(m({ situacao: "futuro", dias_para: 7 }))).toBe("em 7 dias");
    expect(situacaoEmPalavras(m({ tipo: "prazo", situacao: "em_andamento", dias_para: 40 }))).toBe("termina em 40 dias");
    expect(situacaoEmPalavras(m({ tipo: "prazo", situacao: "em_andamento", dias_para: 0 }))).toBe("último dia do prazo");
    expect(situacaoEmPalavras(m({ situacao: "em_andamento", dias_para: -30 }))).toBe("em vigor");
    expect(situacaoEmPalavras(m({ tipo: "prazo", situacao: "passado", dias_para: -3 }))).toBe("prazo encerrado há 3 dias");
    expect(situacaoEmPalavras(m({ situacao: "passado", dias_para: -100 }))).toBe("já passou");
  });

  it("agrupa por mês de início, na ordem recebida", () => {
    const grupos = agruparPorMes([m({ data: "2026-11-03" }), m({ data: "2026-11-30" }), m({ data: "2026-12-22" }), m({ data: "2027-01-01" })]);
    expect(grupos.map((g) => [g.chave, g.rotulo, g.marcos.length])).toEqual([
      ["2026-11", "novembro de 2026", 2], ["2026-12", "dezembro de 2026", 1], ["2027-01", "janeiro de 2027", 1],
    ]);
    expect(agruparPorMes()).toEqual([]);
  });

  it("cita a fonte com o dispositivo e a data do ato; mostra a quem o marco se aplica", () => {
    expect(textoDaFonte({ instrumento: "Lei Complementar nº 214, de 16 de janeiro de 2025", dispositivo: "art. 381, § 4º, I", data: "2025-01-16" }))
      .toBe("Lei Complementar nº 214, de 16 de janeiro de 2025, art. 381, § 4º, I (ato de 16/01/2025)");
    expect(textoDaFonte({ instrumento: "Ato", dispositivo: "art. 1º" })).toBe("Ato, art. 1º");
    expect(regimesDoMarco(m({}))).toBe("Todos os regimes");
    expect(regimesDoMarco(m({ regimes: ["Lucro Real", "Lucro Presumido"] }))).toBe("Lucro Real, Lucro Presumido");
    expect(ufsDoMarco(m({}))).toBe("");
    expect(ufsDoMarco(m({ ufs: ["AM"] }))).toBe("AM");
  });
});

describe("Agenda da Reforma: consulta e arquivo", () => {
  it("só envia o que foi escolhido", () => {
    expect(paramsDaAgenda({})).toEqual({});
    expect(paramsDaAgenda({ empresaId: "e1", regime: "Lucro Real", uf: "SP", categoria: "Transição", passados: true }))
      .toEqual({ empresa_id: "e1", regime: "Lucro Real", uf: "SP", categoria: "Transição", passados: "1" });
    expect(paramsDaAgenda({ regime: "", uf: "", passados: false })).toEqual({});
  });

  it("monta o endereço do calendário com os mesmos filtros", () => {
    expect(urlDoCalendario({})).toBe("/agenda-reforma/calendario.ics");
    expect(urlDoCalendario({ empresaId: "e1", categoria: "Simples Nacional" })).toBe("/agenda-reforma/calendario.ics?empresa_id=e1&categoria=Simples+Nacional");
  });

  it("nome do arquivo sem acento nem símbolo", () => {
    expect(nomeDoArquivoIcs()).toBe("agenda-reforma.ics");
    expect(nomeDoArquivoIcs("Cangaia Armazéns & Transportes S.A.")).toBe("agenda-reforma-cangaia-armazens-transportes-s-a.ics");
  });

  it("rótulos de antecedência", () => {
    expect([0, 1, 7, 30].map(ROTULO_ANTECEDENCIA)).toEqual(["no dia", "1 dia antes", "7 dias antes", "30 dias antes"]);
  });
});
