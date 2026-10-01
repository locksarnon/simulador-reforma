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
 * ATENÇÃO — duas pendências de QA antes de usar em produção:
 *   1. A repartição de CBS do Anexo III na 3ª/4ª faixa está em 16,41% (fonte:
 *      planilha do usuário, que afirma ter corrigido o valor). A publicação
 *      oficial do Senado (mesma URL citada na planilha) foi consultada duas
 *      vezes por fetch automatizado e voltou 16,42% e 16,60% em tentativas
 *      diferentes — ou seja, a extração automática não é confiável nessa
 *      casa decimal. Confirmar manualmente, lendo a tabela na tela, antes de
 *      shippar.
 *   2. anoParams.cbs_efetiva: o TransicaoAno já carregado no banco tem
 *      9,21% para 2027/2028; a planilha do usuário usa 8,90% para a mesma
 *      base legal (LC 214/2025, arts. 344 e 347). É a mesma premissa com
 *      dois valores diferentes — precisa de decisão humana (qual fonte/
 *      metodologia prevalece) antes de ligar esse simulador em produção.
 *      Até lá, a função aceita o valor via anoParams para não hardcodar
 *      nenhum dos dois.
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
  // ATENÇÃO (ver header do arquivo): CBS 16,41% das faixas 3/4 não confirmado
  // contra a publicação oficial — cross-check automatizado deu resultados
  // inconsistentes (16,42% e 16,60% em duas tentativas). Verificar manualmente.
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

  return {
    ...enquadramento, fatorR, aliquotaEfetiva, ibsCbsSimplesPct,
    dasMensal, ibsCbsNoSimples, creditoClientePuro,
  };
}

/**
 * Cenário "híbrido": mantém o DAS (menos a parcela de IBS/CBS já embutida) e
 * passa a recolher IBS/CBS pelo regime regular sobre o preço cheio — LC
 * 214/2025, art. 47, §9º c/c art. 41, §3º. anoParams vem do MESMO
 * TransicaoAno que o taxEngine usa (ibs_efetivo, cbs_efetiva) — ver nota 2
 * no header deste arquivo sobre a divergência de cbs_efetiva.
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
 *  - equilibrio: repasse que mantém o resultado líquido igual ao Simples puro.
 *  - neutroCliente: repasse máximo em que o custo líquido do cliente não piora.
 */
export function calcularPontosEquilibrio({ aliquotaEfetivaSimples, ibsCbsSimplesPct, cargaHibridaPct, ibsCbsRegularPct }) {
  const markupEquilibrio = (1 - aliquotaEfetivaSimples) / (1 - cargaHibridaPct) - 1;
  const markupNeutroCliente = (1 - ibsCbsSimplesPct) / (1 - ibsCbsRegularPct) - 1;
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
  });

  return { puro, hibrido, pontos };
}
