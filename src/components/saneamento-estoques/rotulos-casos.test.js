import { describe, expect, it } from "vitest";
import * as servidor from "../../../backend/src/saneamento-estoques/rotulos";
import {
  campoAlvoDoCaso, CAMPOS_FORA_DA_GRADE, decisoesDoCaso, opcoesDeTipo, propostaParaEnviar, razaoSemAprovar, ROTULO_CAMPO, ROTULO_TIPO_CASO, ROTULO_VALOR, rotuloDoCampo,
  rotuloTipoCaso, textoDoValor, textoLegivel,
} from "./logica";

describe("rótulos dos casos: um dicionário só, sem código interno na tela", () => {
  it("tipos, campos e valores da tela são os mesmos do material do cliente", () => {
    expect(ROTULO_TIPO_CASO).toEqual(servidor.ROTULO_TIPO_CASO);
    for (const [k, v] of Object.entries(servidor.ROTULO_CAMPO)) expect([k, ROTULO_CAMPO[k]]).toEqual([k, v]);
    expect(ROTULO_VALOR).toEqual(servidor.ROTULO_VALOR);
  });

  it("todo tipo que o motor gera tem rótulo (os da avaliação com a base real incluídos)", () => {
    for (const t of ["ABREVIACAO_ESCONDE_ATRIBUTO", "DESCRICAO_FORA_PADRAO", "EXCEDE_LIMITE_DESTINO", "REFERENCIA_COINCIDENTE", "NCM_NAO_VIGENTE", "TERMO_PROIBIDO", "ATRIBUTO_AUSENTE"]) {
      expect(ROTULO_TIPO_CASO[t]).toBeTruthy();
      expect(rotuloTipoCaso(t)).not.toContain("_");
    }
    expect(rotuloTipoCaso("TIPO_NOVO_QUALQUER")).toBe("Tipo novo qualquer");
  });

  it("valores legíveis: Ativo Sim/Não, decisões e finalidades rotuladas; descrição nunca passa pelo dicionário", () => {
    expect(textoDoValor(false, "ativo")).toBe("Não");
    expect(textoDoValor("true")).toBe("Sim");
    expect(textoDoValor("PROPOR_INATIVACAO", "decisao")).toBe("Propor inativação");
    expect(textoDoValor(["REVENDA", "MANUTENCAO"], "tambemUsadoComo")).toBe("Revenda, Manutenção");
    expect(textoDoValor("EMBALAGEM", "descricao")).toBe("EMBALAGEM");
    expect(textoDoValor({ ncm: "1", ativo: false })).toBe("NCM: 1; Ativo: Não");
    expect(rotuloDoCampo("decisoesPossiveis")).toBe("Decisões possíveis");
    expect(rotuloDoCampo("campos.manter")).toBe("Código mantido");
    expect(textoLegivel('Confirmar a finalidade do grupo "X": Manutenção (confiança media)')).toContain("confiança média");
    expect(textoLegivel("media (80% no dominante)")).toBe("média (80% no dominante)");
  });

  it("decisão vira lista das decisões possíveis; códigos, descrições e decisões possíveis saem da grade", () => {
    expect(decisoesDoCaso({ decisao: "PROPOR_CONSOLIDACAO", decisoesPossiveis: "MANTER_DISTINTOS | PROPOR_CONSOLIDACAO | SOLICITAR_INFORMACAO" })).toEqual(["MANTER_DISTINTOS", "PROPOR_CONSOLIDACAO", "SOLICITAR_INFORMACAO"]);
    expect(decisoesDoCaso({ decisao: "X" })).toEqual(["X"]);
    expect(CAMPOS_FORA_DA_GRADE).toEqual(["decisoesPossiveis", "codigos", "descricoes"]);
  });

  it("o campo-alvo (NCM, descrição, unidade) fica editável no caso de 1 item, mesmo sem proposta, e só aprova com valor", () => {
    const ncm = { tipo: "NCM_INEXISTENTE", camada: "NCM", situacao: "PROPOSTO", itens: ["i1"], proposta: {} };
    expect(campoAlvoDoCaso(ncm)).toBe("ncm");
    expect(campoAlvoDoCaso({ ...ncm, itens: ["i1", "i2"] })).toBeNull();
    expect(campoAlvoDoCaso({ tipo: "ABREVIACAO_ESCONDE_ATRIBUTO", camada: "NOMES_UNIDADES", itens: ["i"] })).toBe("descricao");
    expect(campoAlvoDoCaso({ tipo: "UNIDADE_AUSENTE", camada: "QUALIDADE", itens: ["i"] })).toBe("unidade");
    expect(campoAlvoDoCaso({ tipo: "EXCEDE_LIMITE_DESTINO", camada: "NOMES_UNIDADES", itens: ["i"], atual: { unidade: "UNIDADE" } })).toBe("unidade");
    expect(campoAlvoDoCaso({ tipo: "AGUARDANDO_NCM", camada: "TRIBUTARIO", itens: ["i"] })).toBeNull();
    expect(razaoSemAprovar(ncm, { ncm: "" })).toContain("Digite o valor correto em NCM");
    expect(razaoSemAprovar(ncm, { ncm: "73181500" })).toBeNull();
    expect(propostaParaEnviar({ ncm: null, descricao: "X" }, {})).toEqual({ descricao: "X" });
    expect(propostaParaEnviar({ ncm: null }, { ncm: "1" })).toEqual({ ncm: null });
  });

  it("filtro de tipo: rótulo e contagem, e o tipo escolhido continua na lista", () => {
    expect(opcoesDeTipo([{ tipo: "NCM_INEXISTENTE", n: 616 }, { tipo: "DUPLICIDADE_EXATA", n: 1200 }])).toEqual([
      { valor: "DUPLICIDADE_EXATA", rotulo: "Duplicidade exata (1.200)" }, { valor: "NCM_INEXISTENTE", rotulo: "NCM inexistente (616)" },
    ]);
    expect(opcoesDeTipo([], "NCM_AUSENTE")).toEqual([{ valor: "NCM_AUSENTE", rotulo: "NCM ausente (0)" }]);
  });
});
