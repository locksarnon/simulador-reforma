import { describe, expect, it } from "vitest";
import { caminhoDoDiagnostico, contarRapidos, filtrarClientes, grupoVisivel, mascararDocumento } from "./clientes";

const empresas = [
  { id: "A", razao_social: "Extra Agro Ltda", cnpj_cpf: "12.345.678/0001-90", regime_atual: "Lucro Presumido", uf: "MT", municipio: "Sorriso", grupo: "#001" },
  { id: "B", razao_social: "Ávila Transportes", cnpj_cpf: "98.765.432/0001-10", regime_atual: "Lucro Real", uf: "MT", municipio: "Rondonópolis", grupo: "#002" },
  { id: "C", razao_social: "Fazenda Boa Vista", cnpj_cpf: "123.456.789-01", regime_atual: null, uf: "GO", municipio: "Rio Verde", grupo: "#003" },
];
const grupos = [
  { id: "g1", numero: "#001", nome: "Família Extra", tipo: "Grupo familiar" },
  { id: "g2", numero: "#002", nome: "Ávila Transportes", tipo: "Cliente individual" },
  { id: "g3", numero: "#003", nome: "Fazenda Boa Vista", tipo: "Cliente individual" },
];
const mapa = new Map([
  ["A", { BPO_FISCAL: { situacao: "ATIVO" }, DIAGNOSTICO_PONTUAL: { situacao: "ATIVO" } }],
  ["B", { BPO_FISCAL: { situacao: "ENCERRADO" } }],
]);
const atendidas = new Set(["A"]);

describe("lista de clientes", () => {
  it("filtros rápidos: BPO, diagnóstico, sem serviço e sem responsável", () => {
    const ids = (rapido) => filtrarClientes(empresas, { rapido }, mapa, grupos, atendidas).map((e) => e.id);
    expect(ids("todos")).toEqual(["B", "A", "C"]);
    expect(ids("bpo")).toEqual(["A"]);
    expect(ids("diagnostico")).toEqual(["A"]);
    expect(ids("sem-servico")).toEqual(["B", "C"]);
    expect(ids("sem-responsavel")).toEqual(["B", "C"]);
    expect(contarRapidos(empresas, mapa, atendidas)).toEqual({ todos: 3, bpo: 1, diagnostico: 1, "sem-servico": 2, "sem-responsavel": 2 });
  });

  it("busca por nome sem acento, CNPJ sem pontuação, cidade e nome do grupo", () => {
    const busca = (q) => filtrarClientes(empresas, { busca: q }, mapa, grupos, atendidas).map((e) => e.id);
    expect(busca("avila")).toEqual(["B"]);
    expect(busca("678.000/1")).toEqual(["A"]);
    expect(busca("12345678")).toEqual(["A", "C"]);
    expect(busca("rio verde")).toEqual(["C"]);
    expect(busca("família extra")).toEqual(["A"]);
  });

  it("filtra por regime (inclusive sem regime) e UF", () => {
    expect(filtrarClientes(empresas, { regime: "Lucro Real" }, mapa, grupos).map((e) => e.id)).toEqual(["B"]);
    expect(filtrarClientes(empresas, { regime: "—" }, mapa, grupos).map((e) => e.id)).toEqual(["C"]);
    expect(filtrarClientes(empresas, { uf: "GO" }, mapa, grupos).map((e) => e.id)).toEqual(["C"]);
  });

  it("grupo de cliente individual não aparece como grupo; grupo de verdade aparece", () => {
    expect(grupoVisivel(grupos[0], empresas)).toBe(grupos[0]);
    expect(grupoVisivel(grupos[1], empresas)).toBeNull();
    expect(grupoVisivel(grupos[1], [...empresas, { id: "D", grupo: "#002" }])).toBe(grupos[1]);
  });

  it("o caminho do diagnóstico usa o grupo da empresa; documento ganha máscara", () => {
    expect(caminhoDoDiagnostico(empresas[0], grupos)).toBe("/workroom/g1/empresas/A");
    expect(caminhoDoDiagnostico({ id: "X", grupo: "#999" }, grupos)).toBeNull();
    expect(mascararDocumento("12345678000190")).toBe("12.345.678/0001-90");
    expect(mascararDocumento("12345678901")).toBe("123.456.789-01");
    expect(mascararDocumento("abc")).toBe("abc");
  });
});
