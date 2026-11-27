/**
 * A linha mostrada ao usuário é a linha de verdade no arquivo (a que o Excel mostra), também nos modelos do InTAX, que têm a logo da FAL na
 * linha 1. A chave interna dos itens (`linha`) não muda.
 */
import { describe, expect, it } from "vitest";
import { montarXlsx } from "./exportarLista";
import { analisarImportacao, analisarVinculos, lerCsv, lerPlanilha, linhaNoArquivo } from "./importacaoCadastro";
import { linhaNaPlanilha } from "./linhaPlanilha";
import { linhasRelacao } from "@/components/saneamento/relacoes";

const COLS = [{ chave: "razao", rotulo: "Razão social" }, { chave: "doc", rotulo: "CNPJ/CPF" }, { chave: "uf", rotulo: "UF" }];
const LINHAS = [{ razao: "BOA LTDA", doc: "58.509.112/0001-52", uf: "MT" }, { razao: "RUIM LTDA", doc: "123", uf: "MT" }];

describe("linha mostrada = linha real do arquivo (importação de empresas)", () => {
  it("modelo do InTAX em Excel (logo na linha 1, títulos na 2): o erro aponta a linha do Excel", async () => {
    const buf = await montarXlsx("Modelo de importação de empresas", COLS, LINHAS);
    const linhas = await lerPlanilha({ name: "modelo.xlsx", arrayBuffer: async () => buf });
    expect(linhaNoArquivo(linhas, 0)).toBe(2);
    const r = analisarImportacao(linhas, [], []);
    expect(r.novas.map((n) => n.linha)).toEqual([3]);
    expect(r.erros.map((e) => e.linha)).toEqual([4]);
  });
  it("arquivo comum (títulos na linha 1), em CSV: o erro aponta a mesma linha do arquivo", () => {
    const linhas = lerCsv("Razão social;CNPJ/CPF;UF\r\nBOA LTDA;58.509.112/0001-52;MT\r\nRUIM LTDA;123;MT\r\n");
    expect(analisarImportacao(linhas, [], []).erros.map((e) => e.linha)).toEqual([3]);
  });
  it("CSV com linha em branco no meio ou no topo: conta a linha física", () => {
    const linhas = lerCsv(";;\r\nRazão social;CNPJ/CPF;UF\r\n\r\nRUIM LTDA;123;MT\r\n");
    expect(linhaNoArquivo(linhas, 0)).toBe(2);
    expect(analisarImportacao(linhas, [], []).erros.map((e) => e.linha)).toEqual([4]);
  });
  it("vínculos de colaboradores: mesma regra", async () => {
    const buf = await montarXlsx("Modelo de vínculos", [{ chave: "doc", rotulo: "CNPJ/CPF" }, { chave: "email", rotulo: "E-mail do colaborador" }], [{ doc: "999", email: "x@fal" }]);
    const linhas = await lerPlanilha({ name: "v.xlsx", arrayBuffer: async () => buf });
    expect(analisarVinculos(linhas, [], []).erros.map((e) => e.linha)).toEqual([3]);
  });
  it("sem a informação (linhas montadas à mão), conta a partir de 1 como antes", () => {
    expect(analisarImportacao([["Razão social", "CNPJ/CPF"], ["X", "1"]], [], []).erros[0].linha).toBe(2);
  });
});

describe("linha mostrada nas telas e relatórios do saneamento e do validador", () => {
  it("usa a linha do arquivo quando o backend a manda; item antigo mostra a chave", () => {
    expect(linhaNaPlanilha({ linha: 2, linha_planilha: 3 })).toBe(3);
    expect(linhaNaPlanilha({ linha: 2 })).toBe(2);
  });
  it("relação do saneamento (Excel): coluna Linha da planilha com a linha real", () => {
    const it2 = { linha: 2, linha_planilha: 3, codigo: "A1", descricao: "X", ultima_mov: null };
    const [l] = linhasRelacao([it2], { fora: [], semData: [], foraGrupos: [] }, "2025-01-01");
    expect(l.linha).toBe(3);
  });
});
