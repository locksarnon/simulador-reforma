/**
 * Simulador "Simples puro × Híbrido (IBS/CBS regular)" — motor de cálculo.
 * Desacoplado de dados: recebe os números do negócio (RBT12, folha, receita)
 * e os parâmetros do ano de transição (mesmo TransicaoAno que o taxEngine já
 * usa: ibs_efetivo, ibs_uf_aliquota, ibs_mun_aliquota, cbs_efetiva) e devolve
 * os dois cenários — ficar no Simples puro, ou optar pelo regime regular do
 * IBS/CBS mantendo o DAS (LC 214/2025, art. 47, §9º) — mais os pontos de
 * equilíbrio de preço.
 *
 * Base legal (conferida linha a linha contra LC 123/2006, LC 214/2025 e
 * LC 227/2026 já carregadas no NormaLegal; ver notas inline por função):
 *   - Faixas/alíquotas/deduções dos Anexos I-V: LC 123/2006, Anexos
 *     XVIII-XXII, na redação dada pela LC 227/2026 para 2027/2028.
 *   - Fator R (corte de 28%, Anexo III se ≥28%, V se <28%): LC 123/2006,
 *     art. 18, §§5º-J e 5º-M (texto conferido contra o NormaLegal do app —
 *     citação mais forte que a Resolução CGSN 140/2018, que é só a norma
 *     operacional).
 *   - Crédito do adquirente no regime regular sobre compras do Simples,
 *     limitado ao valor que efetivamente entrou no DAS: LC 214/2025,
 *     art. 47, §9º, II (texto conferido contra o NormaLegal do app).
 *
 * As duas pendências de QA abaixo (CBS do Anexo III 3ª/4ª faixa; cbs_efetiva
 * do regime regular) foram revisadas e fechadas em 2026-10-01 — ver notas
 * inline em ANEXOS_2027["Anexo III"] e em calcularHibrido():
 *   1. CBS do Anexo III (3ª/4ª faixa) = 16,41%: confirmado por duas fontes
 *      secundárias independentes que convergem no mesmo número (ver nota na
 *      tabela abaixo) — as leituras de 16,42%/16,60% da tentativa anterior
 *      eram ruído de um fetch automatizado mal-sucedido numa única página,
 *      não um valor concorrente real (não reapareceram em nenhuma outra
 *      fonte pesquisada).
 *   2. cbs_efetiva do regime regular: a alíquota de referência OFICIAL ainda
 *      não existe — por lei (LC 214/2025, art. 14), o Senado só a fixa até
 *      15/12/2026. Até lá, 9,21% (já no TransicaoAno) é a melhor estimativa
 *      disponível, por ter origem rastreável a um ato do próprio Comitê
 *      Gestor (ver nota em calcularHibrido()); 8,90% (planilha do usuário)
 *      não tem fonte rastreável além de citar os mesmos artigos da lei, que
 *      não fixam número nenhum. Mantido 9,21% como padrão; o campo continua
 *      editável na tela pra quando o Senado publicar o valor definitivo.
 */

export const VERSAO_MOTOR_SIMPLES_HIBRIDO = "0.1.0";

const num = (v) => (typeof v === "number" ? v : Number(v) || 0);

export const FATOR_R_CORTE = 0.28;
export const RBT12_LIMITE_SIMPLES = 4_800_000;

/**
 * Tabelas 2027/2028 dos Anexos I a V (LC 123/2006, redação da LC 227/2026).
 * cbsPct/ibsPct = repartição do CBS/IBS dentro do DAS pago (não é a alíquota
 * do regime regular — é quanto do DAS já corresponde a IBS/CBS, usado pra
 * calcular o crédito que o cliente recebe no Simples puro).
 */
export const ANEXOS_2027 = {
  "Anexo I": [
    { faixa: 1, min: 0, max: 180_000, aliquotaNominal: 0.04, parcelaDeduzir: 0, cbsPct: 0.1533, ibsPct: 0.0017 },
    { faixa: 2, min: 180_000.01, max: 360_000, aliquotaNominal: 0.073, parcelaDeduzir: 5_940, cbsPct: 0.1533, ibsPct: 0.0017 },
    { faixa: 3, min: 360_000.01, max: 720_000, aliquotaNominal: 0.095, parcelaDeduzir: 13_860, cbsPct: 0.1533, ibsPct: 0.0017 },
    { faixa: 4, min: 720_000.01, max: 1_800_000, aliquotaNominal: 0.107, parcelaDeduzir: 22_500, cbsPct: 0.1533, ibsPct: 0.0017 },
    { faixa: 5, min: 1_800_000.01, max: 3_600_000, aliquotaNominal: 0.143, parcelaDeduzir: 87_300, cbsPct: 0.1533, ibsPct: 0.0017 },
    { faixa: 6, min: 3_600_000.01, max: 4_800_000, aliquotaNominal: 0.189, parcelaDeduzir: 378_000, cbsPct: 0.3402, ibsPct: 0 },
  ],
  "Anexo II": [
    { faixa: 1, min: 0, max: 180_000, aliquotaNominal: 0.045, parcelaDeduzir: 0, cbsPct: 0.1385, ibsPct: 0.0015 },
    { faixa: 2, min: 180_000.01, max: 360_000, aliquotaNominal: 0.078, parcelaDeduzir: 5_940, cbsPct: 0.1385, ibsPct: 0.0015 },
    { faixa: 3, min: 360_000.01, max: 720_000, aliquotaNominal: 0.1, parcelaDeduzir: 13_860, cbsPct: 0.1385, ibsPct: 0.0015 },
    { faixa: 4, min: 720_000.01, max: 1_800_000, aliquotaNominal: 0.112, parcelaDeduzir: 22_500, cbsPct: 0.1385, ibsPct: 0.0015 },
    { faixa: 5, min: 1_800_000.01, max: 3_600_000, aliquotaNominal: 0.147, parcelaDeduzir: 85_500, cbsPct: 0.1385, ibsPct: 0.0015 },
    { faixa: 6, min: 3_600_000.01, max: 4_800_000, aliquotaNominal: 0.299, parcelaDeduzir: 720_000, cbsPct: 0.2522, ibsPct: 0 },
  ],
  // CBS 16,41% nas faixas 3/4: confirmado em 2026-10-01 por duas fontes
  // secundárias independentes (mentorfiscal.com.br — tabela própria do
  // Anexo III 2027/2028 — e valorfinal.com.br, que usa 16,41%+0,19% num
  // exemplo de cálculo independente) — ambas convergem no mesmo número que
  // a planilha do usuário. Pendência de QA fechada (ver header do arquivo).
  "Anexo III": [
    { faixa: 1, min: 0, max: 180_000, aliquotaNominal: 0.06, parcelaDeduzir: 0, cbsPct: 0.1543, ibsPct: 0.0017 },
    { faixa: 2, min: 180_000.01, max: 360_000, aliquotaNominal: 0.112, parcelaDeduzir: 9_360, cbsPct: 0.1691, ibsPct: 0.0019 },
    { faixa: 3, min: 360_000.01, max: 720_000, aliquotaNominal: 0.135, parcelaDeduzir: 17_640, cbsPct: 0.1641, ibsPct: 0.0019 },
    { faixa: 4, min: 720_000.01, max: 1_800_000, aliquotaNominal: 0.16, parcelaDeduzir: 35_640, cbsPct: 0.1641, ibsPct: 0.0019 },
    { faixa: 5, min: 1_800_000.01, max: 3_600_000, aliquotaNominal: 0.21, parcelaDeduzir: 125_640, cbsPct: 0.1543, ibsPct: 0.0017 },
    { faixa: 6, min: 3_600_000.01, max: 4_800_000, aliquotaNominal: 0.329, parcelaDeduzir: 648_000, cbsPct: 0.1929, ibsPct: 0 },
  ],
  "Anexo IV": [
    { faixa: 1, min: 0, max: 180_000, aliquotaNominal: 0.045, parcelaDeduzir: 0, cbsPct: 0.2126, ibsPct: 0.0024 },
    { faixa: 2, min: 180_000.01, max: 360_000, aliquotaNominal: 0.09, parcelaDeduzir: 8_100, cbsPct: 0.2473, ibsPct: 0.0027 },
    { faixa: 3, min: 360_000.01, max: 720_000, aliquotaNominal: 0.102, parcelaDeduzir: 12_420, cbsPct: 0.2374, ibsPct: 0.0026 },
    { faixa: 4, min: 720_000.01, max: 1_800_000, aliquotaNominal: 0.14, parcelaDeduzir: 39_780, cbsPct: 0.2275, ibsPct: 0.0025 },
    { faixa: 5, min: 1_800_000.01, max: 3_600_000, aliquotaNominal: 0.22, parcelaDeduzir: 183_780, cbsPct: 0.2176, ibsPct: 0.0024 },
    { faixa: 6, min: 3_600_000.01, max: 4_800_000, aliquotaNominal: 0.329, parcelaDeduzir: 828_000, cbsPct: 0.247, ibsPct: 0 },
  ],
  "Anexo V": [
    { faixa: 1, min: 0, max: 180_000, aliquotaNominal: 0.155, parcelaDeduzir: 0, cbsPct: 0.1696, ibsPct: 0.0019 },
    { faixa: 2, min: 180_000.01, max: 360_000, aliquotaNominal: 0.18, parcelaDeduzir: 4_500, cbsPct: 0.1696, ibsPct: 0.0019 },
    { faixa: 3, min: 360_000.01, max: 720_000, aliquotaNominal: 0.195, parcelaDeduzir: 9_900, cbsPct: 0.1795, ibsPct: 0.002 },
    { faixa: 4, min: 720_000.01, max: 1_800_000, aliquotaNominal: 0.205, parcelaDeduzir: 17_100, cbsPct: 0.1894, ibsPct: 0.0021 },
    { faixa: 5, min: 1_800_000.01, max: 3_600_000, aliquotaNominal: 0.23, parcelaDeduzir: 62_100, cbsPct: 0.1696, ibsPct: 0.0019 },
    { faixa: 6, min: 3_600_000.01, max: 4_800_000, aliquotaNominal: 0.304, parcelaDeduzir: 540_000, cbsPct: 0.1978, ibsPct: 0 },
  ],
};

/** Fator R = folha de pagamento / receita bruta, ambos nos últimos 12 meses (LC 123/2006, art. 18, §5º-K). */
export function calcularFatorR(folha12, receita12) {
  const f = num(folha12);
  const r = num(receita12);
  if (r === 0 && f === 0) return 0.01; // sem receita nem folha: trata como abaixo do corte, sem dividir por zero
  if (r === 0) return FATOR_R_CORTE; // receita zero com folha positiva: não há base para o índice — assume o corte
  return f / r;
}

/**
 * @param modo "automatico" (Fator R decide III/V) ou um Anexo fixo ("Anexo I".."Anexo V")
 * @returns { anexo, faixa, acimaDoLimite } — acimaDoLimite = true se RBT12 > R$ 4,8 milhões (LC 123/2006, art. 3º, §2º)
 */
export function determinarAnexoEFaixa({ modo, rbt12, fatorR }) {
  const r = num(rbt12);
  if (r > RBT12_LIMITE_SIMPLES) return { anexo: null, faixa: null, acimaDoLimite: true };

  const anexo = modo === "automatico" ? (fatorR >= FATOR_R_CORTE ? "Anexo III" : "Anexo V") : modo;
  const tabela = ANEXOS_2027[anexo];
  if (!tabela) throw new Error(`Anexo desconhecido: ${anexo}`);

  const linha = tabela.find((f) => r >= f.min && r <= f.max) ?? tabela[tabela.length - 1];
  return { anexo, faixa: linha.faixa, acimaDoLimite: false, linha };
}

/** Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) / RBT12 (LC 123/2006, art. 18, §1º). */
export function calcularAliquotaEfetiva(rbt12, linha) {
  const r = num(rbt12);
  if (r === 0) return 0;
  return (r * linha.aliquotaNominal - linha.parcelaDeduzir) / r;
}

/**
 * Repartição de IBS/CBS dentro do DAS. Reproduz a regra especial de teto de
 * ISS da 5ª faixa dos Anexos III e IV (Resolução CGSN 140/2018, Anexo VI):
 * acima do teto de 5% de ISS/IBS municipal, o excedente da alíquota efetiva
 * é redistribuído para CBS/IBS federal/estadual na proporção informada.
 */
export function calcularReparticaoIbsCbs(anexo, linha, aliquotaEfetiva) {
  const ae = num(aliquotaEfetiva);
  if (anexo === "Anexo III" && linha.faixa === 5 && ae > 0.1492537) {
    return { cbsPct: ((ae - 0.05) * 0.232) / ae, ibsPct: ((ae - 0.05) * 0.0026) / ae };
  }
  if (anexo === "Anexo IV" && linha.faixa === 5 && ae > 0.125) {
    return { cbsPct: ((ae - 0.05) * 0.3627) / ae, ibsPct: ((ae - 0.05) * 0.004) / ae };
  }
  return { cbsPct: linha.cbsPct, ibsPct: linha.ibsPct };
}

/**
 * Cenário "Simples puro": o que a empresa paga hoje, e quanto de crédito o
 * cliente no regime regular recebe (limitado ao que entrou no DAS — LC
 * 214/2025, art. 47, §9º, II).
 */
export function calcularSimplesPuro({ receitaMensal, rbt12, folha12, modo, pctClientesRegimeRegular = 1 }) {
  const fatorR = calcularFatorR(folha12, rbt12);
  const enquadramento = determinarAnexoEFaixa({ modo, rbt12, fatorR });
  if (enquadramento.acimaDoLimite) return { ...enquadramento, fatorR };

  const { anexo, linha } = enquadramento;
  const aliquotaEfetiva = calcularAliquotaEfetiva(rbt12, linha);
  const { cbsPct, ibsPct } = calcularReparticaoIbsCbs(anexo, linha, aliquotaEfetiva);
  const ibsCbsSimplesPct = aliquotaEfetiva * (cbsPct + ibsPct);

  const dasMensal = receitaMensal * aliquotaEfetiva;
  const ibsCbsNoSimples = receitaMensal * ibsCbsSimplesPct;
  // Crédito = o que entrou no DAS (art. 47, §9º, II), só aproveitado pela
  // fração de clientes que é contribuinte do regime regular — um cliente
  // consumidor final ou do próprio Simples não credita nada.
  const creditoClientePuro = ibsCbsNoSimples * num(pctClientesRegimeRegular);

  // A partir da 6ª faixa, ICMS/ISS saem do DAS e passam a ser recolhidos à
  // parte, pelo regime normal (LC 123/2006, art. 18, §20) — o DAS mensal
  // acima NÃO inclui esse valor.
  const avisoIcmsIssForaDas = linha.faixa === 6;
  // No Anexo IV, a CPP (contribuição patronal) nunca entra no DAS: é sempre
  // recolhida por fora, pelo regime normal (LC 123/2006, art. 18, §5º-C).
  const avisoCppForaDas = anexo === "Anexo IV";

  return {
    ...enquadramento, fatorR, aliquotaEfetiva, ibsCbsSimplesPct,
    dasMensal, ibsCbsNoSimples, creditoClientePuro,
    avisoIcmsIssForaDas, avisoCppForaDas,
  };
}

/**
 * Cenário "híbrido": mantém o DAS (menos a parcela de IBS/CBS já embutida) e
 * passa a recolher IBS/CBS pelo regime regular sobre o preço cheio — LC
 * 123/2006, art. 13, §9º, c/c LC 214/2025, art. 47, §9º, e art. 41, §3º.
 * anoParams vem do MESMO TransicaoAno que o taxEngine usa (ibs_efetivo,
 * cbs_efetiva).
 *
 * cbs_efetiva ainda não é um número oficial e definitivo: por lei (LC
 * 214/2025, art. 14), a alíquota de referência só será fixada pelo Senado
 * até 15/12/2026. O valor usado como padrão (9,21%, já no TransicaoAno) tem
 * origem rastreável na Resolução CGIBS nº 14, de 29/07/2026 (estimativa
 * metodológica de 18,70 p.p. de IBS + 9,21 p.p. de CBS = 27,91%, usada para
 * subsidiar o cálculo da arrecadação do IBS em 2027 — não é a alíquota
 * definitiva, mas é a estimativa mais oficial disponível até a resolução do
 * Senado). O valor alternativo de 8,90% (planilha do usuário) não tem fonte
 * rastreável além de citar os mesmos artigos da lei, que não fixam número —
 * por isso não foi adotado como padrão. O campo é editável na tela pública
 * exatamente para não depender de código quando o Senado publicar o valor
 * definitivo.
 */
export function calcularHibrido({ receitaMensal, aliquotaEfetivaSimples, ibsCbsSimplesPct, anoParams, pctClientesRegimeRegular = 1 }) {
  const ibsCbsRegularPct = num(anoParams.ibs_efetivo) + num(anoParams.cbs_efetiva);
  const dasResidualPct = aliquotaEfetivaSimples - ibsCbsSimplesPct;
  const cargaHibridaPct = dasResidualPct + ibsCbsRegularPct;

  // Carga híbrida (o que a empresa PAGA) incide sobre 100% da receita,
  // independente de quem é o cliente — isso não muda com o mix de clientes.
  const dasResidual = receitaMensal * dasResidualPct;
  const ibsCbsRegular = receitaMensal * ibsCbsRegularPct;
  const cargaHibridaMensal = dasResidual + ibsCbsRegular;
  // Crédito ao cliente, por outro lado, só existe pra quem é contribuinte do
  // regime regular — mesma ponderação de calcularSimplesPuro.
  const creditoClienteHibrido = ibsCbsRegular * num(pctClientesRegimeRegular);

  return { ibsCbsRegularPct, dasResidualPct, cargaHibridaPct, cargaHibridaMensal, creditoClienteHibrido };
}

/**
 * Pontos de preço:
 *  - equilibrio: repasse que mantém o resultado líquido do VENDEDOR igual ao
 *    do Simples puro. Não depende do mix de clientes — a carga híbrida incide
 *    sobre 100% da receita, seja o cliente empresa ou consumidor final.
 *  - neutroCliente: repasse máximo em que o custo líquido médio da CARTEIRA
 *    de clientes não piora. Pondera pela fração de clientes que é
 *    contribuinte do regime regular (pctClientesRegimeRegular): só esses
 *    recuperam crédito de IBS/CBS, nos dois cenários. Um consumidor final
 *    (fração 1-pctClientesRegimeRegular) nunca credita nada — pra ele, todo
 *    repasse de preço é piora líquida, então o ponto neutro da carteira
 *    converge pra 0% quando pctClientesRegimeRegular → 0.
 *    Dedução: custoHoje = 1 - p·ibsCbsSimplesPct; custoNovo = (1+m)·(1 - p·ibsCbsRegularPct);
 *    igualando custoHoje = custoNovo e isolando m. Com p=1, reduz à fórmula
 *    "só empresas" original; com p=0, dá m=0 (nenhuma margem de repasse).
 */
export function calcularPontosEquilibrio({ aliquotaEfetivaSimples, ibsCbsSimplesPct, cargaHibridaPct, ibsCbsRegularPct, pctClientesRegimeRegular = 1 }) {
  const p = num(pctClientesRegimeRegular);
  const markupEquilibrio = (1 - aliquotaEfetivaSimples) / (1 - cargaHibridaPct) - 1;
  const markupNeutroCliente = (1 - p * ibsCbsSimplesPct) / (1 - p * ibsCbsRegularPct) - 1;
  return { markupEquilibrio, markupNeutroCliente, gapComercial: markupEquilibrio - markupNeutroCliente };
}

/** Orquestra os dois cenários + pontos de equilíbrio a partir dos inputs das telas 1 e 2. */
export function simularSimplesHibrido({ receitaMensal, rbt12, folha12, modo, pctClientesRegimeRegular = 1 }, anoParams) {
  const puro = calcularSimplesPuro({ receitaMensal, rbt12, folha12, modo, pctClientesRegimeRegular });
  if (puro.acimaDoLimite) return { puro };

  const hibrido = calcularHibrido({
    receitaMensal,
    aliquotaEfetivaSimples: puro.aliquotaEfetiva,
    ibsCbsSimplesPct: puro.ibsCbsSimplesPct,
    anoParams,
    pctClientesRegimeRegular,
  });

  const pontos = calcularPontosEquilibrio({
    aliquotaEfetivaSimples: puro.aliquotaEfetiva,
    ibsCbsSimplesPct: puro.ibsCbsSimplesPct,
    cargaHibridaPct: hibrido.cargaHibridaPct,
    ibsCbsRegularPct: hibrido.ibsCbsRegularPct,
    pctClientesRegimeRegular,
  });

  return { puro, hibrido, pontos };
}
