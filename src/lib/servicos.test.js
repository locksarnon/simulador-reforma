import { describe, it, expect } from "vitest";
import { carteiraDaEmpresa, filtrarEmpresas, indexarPorEmpresa, naCarteira } from "./servicos";

const s = (extra) => ({ id: "s", empresa_id: "E1", tipo: "BPO_FISCAL", situacao: "ATIVO", createdAt: "2026-01-01T00:00:00Z", ...extra });

describe("serviços contratados: carteira", () => {
  it("só ativo e pausado entram na carteira; proposta e encerrado ficam fora", () => {
    expect(naCarteira(s({ situacao: "ATIVO" }))).toBe(true);
    expect(naCarteira(s({ situacao: "PAUSADO" }))).toBe(true);
    expect(naCarteira(s({ situacao: "PROPOSTA" }))).toBe(false);
    expect(naCarteira(s({ situacao: "ENCERRADO" }))).toBe(false);
    expect(naCarteira(null)).toBe(false);
  });

  it("de cada tipo vale o serviço em aberto mais recente; sem nenhum em aberto, o encerrado mais recente", () => {
    const mapa = indexarPorEmpresa([
      s({ id: "a", situacao: "ENCERRADO", createdAt: "2025-01-01T00:00:00Z" }),
      s({ id: "b", situacao: "ATIVO", createdAt: "2024-01-01T00:00:00Z" }), // mais antigo, mas em aberto: vence o encerrado
      s({ id: "c", tipo: "DIAGNOSTICO_PONTUAL", situacao: "ENCERRADO", createdAt: "2025-01-01T00:00:00Z" }),
      s({ id: "d", tipo: "DIAGNOSTICO_PONTUAL", situacao: "ENCERRADO", createdAt: "2026-02-01T00:00:00Z" }),
    ]);
    expect(mapa.get("E1").BPO_FISCAL.id).toBe("b");
    expect(mapa.get("E1").DIAGNOSTICO_PONTUAL.id).toBe("d");
  });

  it("diz em que carteira a empresa está", () => {
    expect(carteiraDaEmpresa({ BPO_FISCAL: s({}), DIAGNOSTICO_PONTUAL: s({ tipo: "DIAGNOSTICO_PONTUAL" }) })).toBe("ambas");
    expect(carteiraDaEmpresa({ BPO_FISCAL: s({}) })).toBe("bpo");
    expect(carteiraDaEmpresa({ DIAGNOSTICO_PONTUAL: s({ situacao: "PAUSADO" }) })).toBe("diagnostico");
    expect(carteiraDaEmpresa({ BPO_FISCAL: s({ situacao: "ENCERRADO" }) })).toBe("nenhuma");
    expect(carteiraDaEmpresa(undefined)).toBe("nenhuma");
  });
});

describe("serviços contratados: filtro das empresas", () => {
  const empresas = [
    { id: "E1", id_empresa: "EXTRA-AGRO", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58.509.112/0001-52", grupo: "090" },
    { id: "E2", id_empresa: "EMP-2", razao_social: "Álvares Comércio SA", cnpj_cpf: "12.345.678/0001-95", grupo: "001" },
    { id: "E3", id_empresa: "EMP-3", razao_social: "Sem Serviço Ltda", cnpj_cpf: null, grupo: "001" },
  ];
  const mapa = indexarPorEmpresa([s({ empresa_id: "E1" }), s({ empresa_id: "E2", tipo: "DIAGNOSTICO_PONTUAL" })]);

  it("busca por nome sem acento, código e CNPJ com ou sem pontuação", () => {
    const ids = (busca) => filtrarEmpresas(empresas, mapa, { busca }).map((e) => e.id);
    expect(ids("alvares")).toEqual(["E2"]);
    expect(ids("extra-agro")).toEqual(["E1"]);
    expect(ids("58509112")).toEqual(["E1"]);
    expect(ids("58.509.112/0001-52")).toEqual(["E1"]);
    expect(ids("nada")).toEqual([]);
  });

  it("filtra por grupo e por carteira, inclusive as empresas sem carteira", () => {
    expect(filtrarEmpresas(empresas, mapa, { grupo: "001" }).map((e) => e.id)).toEqual(["E2", "E3"]);
    expect(filtrarEmpresas(empresas, mapa, { carteira: "bpo" }).map((e) => e.id)).toEqual(["E1"]);
    expect(filtrarEmpresas(empresas, mapa, { carteira: "diagnostico" }).map((e) => e.id)).toEqual(["E2"]);
    expect(filtrarEmpresas(empresas, mapa, { carteira: "nenhuma" }).map((e) => e.id)).toEqual(["E3"]);
  });
});
