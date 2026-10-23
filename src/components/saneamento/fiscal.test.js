import { describe, expect, it } from "vitest";
import { ACOES, COLUNAS_MATRIZ, ORDEM_SITUACOES, SITUACOES, decisaoValida, itensDoGrupoFiscal, leituraFiscal, linhasMatriz, mapaClasses, pareceServico, podeConcluir, resultadoFiscal, resumoFiscal, situacaoFiscal } from "./fiscal";

const sug = (extra = {}) => ({ c_class_trib: "200003", descricao: "Alimentação humana (Anexo I)", reducao: 1, confianca: "Alta (NCM completo no anexo)", ambiguo: false, anexo: "Anexo I, item 3", ...extra });
const item = (linha, extra = {}) => ({ linha, codigo: `C${linha}`, descricao: "FEIJAO CARIOCA", unidade: "KG", grupo_atual: "Grãos", ncm: "07133319", ncm_original: "07133319", problemas: [], c_class_trib_informado: "200003", sugestao: sug(), ...extra });
const prob = (codigo, mensagem = codigo) => ({ codigo, severidade: "alerta", mensagem });
const classes = mapaClasses([
  { c_class_trib: "200003", cst: "200", descricao_oficial: "Alimentação humana (Anexo I)", pct_reducao_ibs: 1, pct_reducao_cbs: 1, status: "Ativo", vigencia_inicio: "2026-01-01" },
  { c_class_trib: "200003", cst: "999", descricao_oficial: "Versão antiga", pct_reducao_ibs: 0.6, pct_reducao_cbs: 0.6, status: "Inativo", vigencia_inicio: "2027-01-01" },
  { c_class_trib: "000001", cst: "000", descricao_oficial: "Tributação integral", pct_reducao_ibs: 0, pct_reducao_cbs: 0, status: "Ativo", vigencia_inicio: "2026-01-01" },
]);

describe("situação fiscal do item", () => {
  it("cada caso da validação cai na sua situação, da mais grave à mais tranquila", () => {
    const casos = [
      [item(1), "CONFERE"],
      [item(2, { c_class_trib_informado: "" }), "SEM_CLASSE"],
      [item(3, { c_class_trib_informado: "000001", problemas: [prob("BENEFICIO_POSSIVELMENTE_PERDIDO")] }), "BENEFICIO"],
      [item(4, { problemas: [prob("REDUCAO_MAIOR_QUE_ESPERADO")] }), "REDUCAO_MAIOR"],
      [item(5, { sugestao: sug({ c_class_trib: null }), problemas: [prob("SEM_AMPARO_NO_ANEXO")] }), "SEM_AMPARO"],
      [item(6, { problemas: [prob("CLASSE_DIVERGENTE")] }), "DIVERGENTE"],
      [item(7, { sugestao: sug({ c_class_trib: null, referencia: true, confianca: "Referência por capítulo — revisar requisitos" }) }), "REFERENCIA"],
      [item(8, { sugestao: sug({ c_class_trib: null, ambiguo: true, descricao: "Possíveis: 200003, 200004" }) }), "AMBIGUO"],
      [item(9, { c_class_trib_informado: "", sugestao: sug({ c_class_trib: "000001", padrao: true, reducao: 0, anexo: null }) }), "PADRAO"],
      [item(10, { ncm: "123", ncm_original: "123", problemas: [prob("NCM_FORMATO")] }), "NCM"],
      [item(11, { sugestao: null }), "SEM_ANALISE"],
      [item(12, { descricao: "SERVICO DE IMAGENS VIA SATELITE" }), "SERVICO"],
    ];
    for (const [it, esperado] of casos) expect(situacaoFiscal(it), `linha ${it.linha}`).toBe(esperado);
    expect(ORDEM_SITUACOES[0]).toBe("NCM"); expect(Object.keys(SITUACOES)).toEqual(ORDEM_SITUACOES);
  });
  it("NCM inválido ou serviço vêm antes de qualquer leitura de classe", () => {
    expect(situacaoFiscal(item(1, { ncm: "1234567", problemas: [prob("NCM_INEXISTENTE"), prob("BENEFICIO_POSSIVELMENTE_PERDIDO")] }))).toBe("NCM");
    expect(situacaoFiscal(item(2, { descricao: "SERVICO DE PODA", ncm: "123", problemas: [prob("NCM_FORMATO")] }))).toBe("SERVICO");
    expect(pareceServico({ descricao: "Serviço de manutenção", unidade: "UN" })).toBe(true); expect(pareceServico({ descricao: "MAO DE OBRA TERCEIRIZADA", unidade: "UN" })).toBe(true);
    expect(pareceServico({ descricao: "ITEM QUALQUER", unidade: "SV" })).toBe(true); expect(pareceServico({ descricao: "SERVIDOR DE REDE", unidade: "UN" })).toBe(false); expect(pareceServico({ descricao: "FEIJAO", unidade: "SE" })).toBe(false);
  });
  it("o catálogo de classes vale pela versão vigente (Ativo), e a leitura traz CST, redução e fundamento", () => {
    expect(classes.get("200003").cst).toBe("200");
    const l = leituraFiscal(item(1, { c_class_trib_informado: "" }), classes);
    expect(l).toMatchObject({ situacao: "SEM_CLASSE", sugerida: "200003", reducao: "100%", cstSugerida: "200", reducaoIbs: "100%", reducaoCbs: "100%", fundamento: "Anexo I, item 3 da LC 214/2025", confianca: "Alta (NCM completo no anexo)" });
    expect(l.proposta).toBe("Informar a classe 200003 (redução de 100%)");
    expect(leituraFiscal(item(2, { c_class_trib_informado: "000001" }), classes).cstInformada).toBe("000");
  });
  it("NCM corrigido pela ferramenta (zero à esquerda) é sinalizado; padrão não afirma ausência de benefício por outra base legal", () => {
    const l = leituraFiscal(item(1, { ncm: "07133319", ncm_original: "7133319" }), classes); expect(l.ncmCorrigido).toBe(true);
    expect(leituraFiscal(item(2), classes).ncmCorrigido).toBe(false);
    const p = leituraFiscal(item(3, { c_class_trib_informado: "", sugestao: sug({ c_class_trib: "000001", padrao: true, reducao: 0, anexo: null }) }), classes);
    expect(p.fundamento).toContain("não indica, por si só, ausência de benefício por outra base legal");
  });
});

describe("decisão do analista", () => {
  const dec = (acao, extra = {}) => ({ acao, por: "ana", em: "2026-10-23", ...extra });
  it("só valem as ações previstas para a situação; MANTER nos casos de alerta exige o fundamento escrito", () => {
    const l = leituraFiscal(item(1, { problemas: [prob("REDUCAO_MAIOR_QUE_ESPERADO")] }), classes);
    expect(decisaoValida("REDUCAO_MAIOR", l, dec("ACEITAR"))).toBe(true);
    expect(decisaoValida("REDUCAO_MAIOR", l, dec("MANTER"))).toBe(false); expect(decisaoValida("REDUCAO_MAIOR", l, dec("MANTER", { obs: "ok" }))).toBe(false);
    expect(decisaoValida("REDUCAO_MAIOR", l, dec("MANTER", { obs: "Produtor rural: art. 138 da LC 214" }))).toBe(true);
    expect(decisaoValida("REDUCAO_MAIOR", l, dec("NCM", { ncm: "07133319" }))).toBe(false); // ação que a situação não prevê
    expect(decisaoValida("CONFERE", l, dec("REVISAR"))).toBe(false); expect(decisaoValida("NCM", l, undefined)).toBe(false);
  });
  it("NCM exige 8 dígitos; aceitar exige classe sugerida; revisar sempre vale", () => {
    const l = leituraFiscal(item(1, { ncm: "123", ncm_original: "123", problemas: [prob("NCM_FORMATO")] }), classes);
    expect(decisaoValida("NCM", l, dec("NCM", { ncm: "0713.33.19" }))).toBe(true); expect(decisaoValida("NCM", l, dec("NCM", { ncm: "1234" }))).toBe(false); expect(decisaoValida("NCM", l, dec("REVISAR"))).toBe(true);
    const ref = leituraFiscal(item(2, { sugestao: sug({ c_class_trib: null, referencia: true }) }), classes);
    expect(decisaoValida("REFERENCIA", ref, dec("ACEITAR"))).toBe(false); // REFERENCIA não prevê ACEITAR (nada foi sugerido)
    expect(decisaoValida("AMBIGUO", leituraFiscal(item(3, { sugestao: sug({ c_class_trib: null, ambiguo: true }) }), classes), dec("ACEITAR"))).toBe(false); // sem classe sugerida
  });
  it("o resultado diz a classe e o NCM que valem, ou por que ainda não há", () => {
    const sem = leituraFiscal(item(1, { c_class_trib_informado: "" }), classes);
    expect(resultadoFiscal(sem, undefined)).toEqual({ classe: "", ncm: "07133319", validacao: "Pendente de decisão" });
    expect(resultadoFiscal(sem, dec("ACEITAR"))).toMatchObject({ classe: "200003", validacao: "Decidido pelo analista: classe sugerida adotada" });
    expect(resultadoFiscal(sem, dec("REVISAR"))).toMatchObject({ classe: "", validacao: "A revisar com especialista" });
    const nc = leituraFiscal(item(2, { ncm: "123", ncm_original: "123", problemas: [prob("NCM_FORMATO")] }), classes);
    expect(resultadoFiscal(nc, dec("NCM", { ncm: "07133319" }))).toMatchObject({ ncm: "07133319", validacao: "NCM informado pelo analista (validar ao refazer a análise)" });
    expect(resultadoFiscal(leituraFiscal(item(3), classes), undefined)).toEqual({ classe: "200003", ncm: "07133319", validacao: "Confere" });
    expect(resultadoFiscal(leituraFiscal(item(4, { sugestao: null }), classes), undefined).validacao).toBe("Sem análise de cClassTrib");
  });
});

describe("revisão do grupo", () => {
  const itens = [item(1), item(2, { c_class_trib_informado: "" }), item(3, { c_class_trib_informado: "000001", problemas: [prob("BENEFICIO_POSSIVELMENTE_PERDIDO")] }),
    item(4, { grupo_atual: "Outros" }), item(5, { ncm: "123", ncm_original: "123", problemas: [prob("NCM_FORMATO")] })];
  it("o grupo só inclui os itens que ficam (o unificado em outro código não precisa de classificação)", () => {
    expect(itensDoGrupoFiscal(itens, "Grãos", new Set([3])).map((i) => i.linha)).toEqual([1, 2, 5]); expect(itensDoGrupoFiscal(itens, "Grãos").map((i) => i.linha)).toEqual([1, 2, 3, 5]);
  });
  it("conta por situação, pendências, a revisar e decididos; só conclui sem pendência", () => {
    const grupo = itensDoGrupoFiscal(itens, "Grãos");
    const r0 = resumoFiscal(grupo, classes, {});
    expect(r0).toMatchObject({ total: 4, pendentes: 3, revisar: 0, decididos: 0, precisaDecidir: 3 }); expect(r0.porSit).toMatchObject({ CONFERE: 1, SEM_CLASSE: 1, BENEFICIO: 1, NCM: 1 }); expect(podeConcluir(r0)).toBe(false);
    const d = { 2: { acao: "ACEITAR" }, 3: { acao: "MANTER", obs: "Produtor rural" }, 5: { acao: "REVISAR" } };
    const r1 = resumoFiscal(grupo, classes, d);
    expect(r1).toMatchObject({ pendentes: 0, revisar: 1, decididos: 2 }); expect(podeConcluir(r1)).toBe(true);
    expect(resumoFiscal(grupo, classes, { ...d, 3: { acao: "MANTER", obs: "x" } }).pendentes).toBe(1); // fundamento curto demais: decisão incompleta
    expect(podeConcluir(resumoFiscal([], classes, {}))).toBe(false);
  });
  it("a matriz traz uma linha por item, das situações mais graves para as mais tranquilas, com proposta, fundamento e validação", () => {
    const linhas = linhasMatriz(itensDoGrupoFiscal(itens, "Grãos"), classes, { 2: { acao: "ACEITAR", por: "ana", em: "2026-10-23" } });
    expect(linhas.map((l) => [l.linha, l.situacao])).toEqual([[5, "NCM"], [3, "BENEFICIO"], [2, "SEM_CLASSE"], [1, "CONFERE"]]);
    expect(linhas[2]).toMatchObject({ decisao: ACOES.ACEITAR, classeFinal: "200003", validacao: "Decidido pelo analista: classe sugerida adotada", por: "ana", em: "23/10/2026", rotuloSituacao: SITUACOES.SEM_CLASSE.rotulo });
    expect(linhas[1]).toMatchObject({ decisao: "", classeFinal: "", validacao: "Pendente de decisão" });
    for (const [, chave] of COLUNAS_MATRIZ) expect(linhas[0], chave).toHaveProperty(chave);
  });
});
