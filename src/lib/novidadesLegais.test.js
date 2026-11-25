import { describe, expect, it } from "vitest";
import {
  dispositivosDaNovidade, duracaoDaRodada, fraseDoResumo, linksDaNovidade, notasDeAlteracao, ROTULO_STATUS_RODADA, ROTULO_TIPO_NOVIDADE, situacaoDaNorma, TIPOS_DE_ATENCAO,
} from "./novidadesLegais";

describe("situação da norma", () => {
  it("referência, não carregada, em vigor, em vigor com parte revogada e revogada", () => {
    expect(situacaoDaNorma({ formato: "externo" })).toMatchObject({ chave: "referencia", rotulo: "Só referência" });
    expect(situacaoDaNorma({ formato: "html", total_dispositivos: 0 })).toMatchObject({ chave: "nao_carregada" });
    expect(situacaoDaNorma({ formato: "html", total_dispositivos: 10, situacao: "vigente" })).toMatchObject({ chave: "vigente", rotulo: "Em vigor" });
    expect(situacaoDaNorma({ formato: "html", total_dispositivos: 10, situacao: "parcialmente_revogada" })).toMatchObject({ chave: "parcial", rotulo: "Em vigor (parte revogada)" });
    expect(situacaoDaNorma({ formato: "html", total_dispositivos: 10, situacao: "revogada", revogada_por: "Lei 15.000/2026" })).toMatchObject({ chave: "revogada", rotulo: "Revogada pelo Lei 15.000/2026" });
    expect(situacaoDaNorma({ formato: "html", total_dispositivos: 10, situacao: "revogada" }).rotulo).toBe("Revogada");
  });
});

describe("novidades", () => {
  it("todo tipo que o servidor grava tem rótulo, e os de atenção são conhecidos", () => {
    for (const t of ["alteracao", "revogacao", "inclusao", "norma_revogada", "nova_norma", "regulamentacao", "aplicacao", "interpretacao", "fonte_atualizada", "estrutura_suspeita", "nao_consolidada", "reprocessada"]) expect(ROTULO_TIPO_NOVIDADE[t], t).toBeTruthy();
    for (const t of TIPOS_DE_ATENCAO) expect(ROTULO_TIPO_NOVIDADE[t], t).toBeTruthy();
  });

  it("dispositivos abríveis (norma e caminho) e links https, com o que ficou de fora", () => {
    const n = { norma_chave: "lcp-214-2025", detalhes: Array.from({ length: 9 }, (_, i) => ({ rotulo: `Art. ${i + 1}`, caminho: `art-${i + 1}` })) };
    expect(dispositivosDaNovidade(n)).toMatchObject({ restantes: 3 });
    expect(dispositivosDaNovidade(n).itens).toHaveLength(6);
    expect(dispositivosDaNovidade({ ...n, norma_chave: null })).toEqual({ itens: [], restantes: 0 });
    expect(dispositivosDaNovidade({ norma_chave: "x", detalhes: "lixo" })).toEqual({ itens: [], restantes: 0 });
    const p = { detalhes: [{ rotulo: "A", url: "https://www.gov.br/a.pdf" }, { rotulo: "B", url: "javascript:alert(1)" }, { rotulo: "C", url: "http://x.gov.br/c" }] };
    expect(linksDaNovidade(p)).toEqual({ itens: [{ rotulo: "A", url: "https://www.gov.br/a.pdf" }], restantes: 0 });
  });

  it("frase do resumo e das rodadas", () => {
    expect(fraseDoResumo(null)).toBe("");
    expect(fraseDoResumo({ novas: 1, a_confirmar: 0, nao_consolidadas: 0 })).toBe("1 novidade nova");
    expect(fraseDoResumo({ novas: 3, a_confirmar: 2, nao_consolidadas: 1 })).toBe("3 novidades novas · 2 a confirmar · 1 alteração ainda não consolidada");
    expect(ROTULO_STATUS_RODADA.parcial).toBe("Concluída com erros");
    expect(duracaoDaRodada({ iniciado_em: "2026-11-23T08:00:00Z", concluido_em: "2026-11-23T08:00:35Z" })).toBe("35 s");
    expect(duracaoDaRodada({ iniciado_em: "2026-11-23T08:00:00Z", concluido_em: "2026-11-23T08:04:30Z" })).toBe("5 min");
    expect(duracaoDaRodada({ iniciado_em: "2026-11-23T08:00:00Z", concluido_em: null })).toBe("—");
  });
});

describe("notas de alteração do dispositivo", () => {
  it("só notas que dizem quem mudou o texto, sem repetir e sem parênteses", () => {
    const d = {
      alteracoes: [
        { tipo: "redacao", trecho: "(Redação dada pela Lei Complementar nº 227, de 2026)" },
        { tipo: "redacao", trecho: "(Redação dada pela Lei Complementar nº 227, de 2026)" },
        { tipo: "vide", trecho: "(Vide Lei X)" },
        { tipo: "inclusao", trecho: "(Incluído pela Lei Complementar nº 235, de 2026)" },
        { tipo: "revogacao", trecho: "" },
      ],
    };
    expect(notasDeAlteracao(d)).toEqual([
      { tipo: "redacao", texto: "Redação dada pela Lei Complementar nº 227, de 2026" },
      { tipo: "inclusao", texto: "Incluído pela Lei Complementar nº 235, de 2026" },
    ]);
    expect(notasDeAlteracao({})).toEqual([]);
  });
});
