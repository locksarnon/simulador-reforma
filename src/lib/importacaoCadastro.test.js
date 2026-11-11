import { describe, expect, it } from "vitest";
import { analisarImportacao, analisarVinculos, lerCsv, mapearCabecalho } from "./importacaoCadastro";

const EMPRESAS = [{ id: "E1", id_empresa: "EXTRA", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58.509.112/0001-52", regime_atual: "Lucro Real", uf: "MT", email_contato: null }];
const GRUPOS = [{ id: "G1", numero: "090" }];

describe("importação do cadastro", () => {
  it("reconhece o cabeçalho sem ligar para acento e maiúscula", () => {
    expect(mapearCabecalho(["RAZÃO SOCIAL", "Cnpj", "e-mail de contato", "x"])).toEqual({ razao_social: 0, cnpj_cpf: 1, email_contato: 2 });
  });
  it("lê CSV com ponto e vírgula e aspas", () => {
    expect(lerCsv('﻿Razão social;CNPJ\r\n"A; B";1\r\n')).toEqual([["Razão social", "CNPJ"], ["A; B", "1"]]);
  });
  it("separa novas, a atualizar (só o que muda; vazio não apaga), sem mudança e erros com o motivo", () => {
    const r = analisarImportacao([
      ["Razão social", "CNPJ/CPF", "Grupo", "Regime", "UF", "E-mail de contato"],
      ["", "58509112000152", "", "lucro real", "mt", "fiscal@extra.agro"],
      ["Nova Agro", "12.345.678/0001-95", "090", "Simples Nacional", "GO", ""],
      ["Sem Grupo", "11.222.333/0001-81", "", "", "", ""],
      ["X", "123", "090", "", "", ""],
      ["Y", "11.444.777/0001-61", "999", "", "", ""],
      ["Z", "11.444.777/0001-62", "090", "Lucro Total", "", ""],
      ["W", "11.444.777/0001-63", "090", "", "XX", ""],
    ], EMPRESAS, GRUPOS);
    expect(r.atualizar).toEqual([{ linha: 2, id: "E1", razao_social: "EXTRA AGRO LTDA", mudancas: { email_contato: "fiscal@extra.agro" } }]);
    expect(r.novas.map((n) => n.dados.razao_social)).toEqual(["Nova Agro"]);
    expect(r.novas[0].dados).toMatchObject({ grupo: "090", regime_atual: "Simples Nacional", uf: "GO", status: "Ativa" });
    expect(r.erros.map((e) => e.linha)).toEqual([4, 5, 6, 7, 8]);
    expect(r.erros[0].motivo).toMatch(/sem grupo/);
    expect(r.erros[2].motivo).toMatch(/Grupo 999 não existe/);
  });
  it("recusa cabeçalho sem razão social nem CNPJ", () => {
    expect(analisarImportacao([["a", "b"], ["1", "2"]], EMPRESAS, GRUPOS).erros[0].motivo).toMatch(/cabeçalho/);
  });
  it("vínculos: agrupa por colaborador e aponta empresa ou colaborador que não existe", () => {
    const r = analisarVinculos([["CNPJ/CPF", "E-mail do colaborador"], ["58.509.112/0001-52", "maria@fal"], ["58509112000152", "MARIA@fal"], ["999", "maria@fal"], ["58.509.112/0001-52", "ninguem@fal"]], EMPRESAS, [{ id: "U1", email: "maria@fal", name: "Maria" }]);
    expect(r.porColaborador).toEqual([{ user_id: "U1", nome: "Maria", empresa_ids: ["E1"] }]);
    expect(r.erros.map((e) => e.linha)).toEqual([4, 5]);
  });
});
