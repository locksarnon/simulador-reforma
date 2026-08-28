/**
 * Motor de cálculo do Simulador FAL da Reforma Tributária — paridade v0.18.
 * Desacoplado de dados: recebe a operação + parâmetros normativos (ano de
 * transição, classificação tributária, catálogo de crédito presumido e
 * cenário) e devolve os cinco módulos do Excel:
 *   1. Sistema atual (PIS/Cofins/ICMS/FCP/ST/ISS/IPI)
 *   2. IBS/CBS (débitos, créditos, split, crédito presumido, split UF/Município)
 *   3. Transição (remanescente + IBS/CBS financeiro)
 *   4. Preço e margem (gross-up híbrido para margem-alvo)
 *   5. Caixa e split payment (realização de créditos e funding)
 *
 * Fórmulas reproduzem a aba "Caixa e Split" e "Preço e margem" do Excel v0.16.
 */

const num = (v) => (typeof v === "number" ? v : Number(v) || 0);

/** Módulo 1 — Sistema atual */
export function calcSistemaAtual(op) {
  const vb = num(op.valor_bruto);
  const isEntrada = op.direcao === "Entrada";
  const pis = vb * num(op.pis_pct);
  const cofins = vb * num(op.cofins_pct);
  const icmsProprio = vb * num(op.icms_pct);
  const fcp = vb * num(op.fcp_pct);
  const baseST = vb * (1 + num(op.mva_st_pct));
  const icmsSt = Math.max(0, baseST * num(op.icms_pct) - icmsProprio);
  const iss = vb * num(op.iss_pct);
  const ipi = vb * num(op.ipi_pct);
  const tributosBrutos = pis + cofins + icmsProprio + fcp + icmsSt + iss + ipi;
  // Créditos do sistema atual (entrada) — PIS + Cofins + ICMS próprio + FCP + IPI.
  // Não incluem ICMS-ST nem ISS (conforme Excel v0.14).
  const baseCredito = pis + cofins + icmsProprio + fcp + ipi;
  const creditosAtuais = isEntrada ? baseCredito * num(op.credito_elegivel_pct) : 0;
  const tributosLiquidos = tributosBrutos - creditosAtuais;
  const cargaEfetiva = vb > 0 ? tributosLiquidos / vb : 0;
  return {
    pis, cofins, icmsProprio, fcp, baseST, icmsSt, iss, ipi,
    tributosBrutos, creditosAtuais, tributosLiquidos, cargaEfetiva,
  };
}

/**
 * Módulo 2 — IBS/CBS.
 * @param credPres registro do catálogo CredPres (metodo_calculo, ibs/cbs aplicável)
 * @param cenario  cenário ativo (fatores de volume/preço/custo)
 */
export function calcIbsCbs(op, anoParams, classTrib = {}, cenario = {}, credPres = {}) {
  const vb = num(op.valor_bruto);
  const isEntrada = op.direcao === "Entrada";
  const redIbs = num(classTrib.pct_reducao_ibs);
  const redCbs = num(classTrib.pct_reducao_cbs);
  const ibsNominal = num(anoParams.ibs_efetivo);
  const cbsNominal = num(anoParams.cbs_efetiva);
  const ibsEfetiva = ibsNominal * (1 - redIbs);
  const cbsEfetiva = cbsNominal * (1 - redCbs);
  const creditoElegivel = num(op.credito_elegivel_pct);

  const debitoIbs = isEntrada ? 0 : vb * ibsEfetiva;
  const debitoCbs = isEntrada ? 0 : vb * cbsEfetiva;
  // Crédito normal do Excel v0.16: vb × alíquota efetiva × crédito elegível.
  // O fator de crédito do cenário NÃO integra as fórmulas do Excel v0.16.
  const creditoIbs = isEntrada ? vb * ibsEfetiva * creditoElegivel : 0;
  const creditoCbs = isEntrada ? vb * cbsEfetiva * creditoElegivel : 0;

  // Crédito presumido (cCredPres) — somente quando localizado e não pendente.
  const credPresLocalizado = Boolean(credPres?.c_cred_pres);
  const credPresPendente =
    credPresLocalizado &&
    String(credPres.percentual_oficial || "").toLowerCase().includes("pendente");
  const podeCalcularCredPres = isEntrada && credPresLocalizado && !credPresPendente;
  const ibsAplicavel =
    credPresLocalizado &&
    String(credPres.ibs_aplicavel || "").toLowerCase() === "sim";
  const cbsAplicavel =
    credPresLocalizado &&
    String(credPres.cbs_aplicavel || "").toLowerCase() === "sim";
  // Método "Por Fora" (circular: CP = VO×C/(1+C)) ou "Direto" (CP = VO×C).
  const metodoPorFora = String(credPres.metodo_calculo || "").includes("Fora");
  const cpIbsPct = num(op.credito_presumido_ibs_pct);
  const cpCbsPct = num(op.credito_presumido_cbs_pct);
  const credPresIbs =
    podeCalcularCredPres && ibsAplicavel
      ? (metodoPorFora ? (vb * cpIbsPct) / (1 + cpIbsPct) : vb * cpIbsPct)
      : 0;
  const credPresCbs =
    podeCalcularCredPres && cbsAplicavel
      ? (metodoPorFora ? (vb * cpCbsPct) / (1 + cpCbsPct) : vb * cpCbsPct)
      : 0;
  const credPresTotal = credPresIbs + credPresCbs;
  // Status do crédito presumido para o detalhe da operação.
  const statusCredPres = !op.c_cred_pres
    ? "Não informado"
    : !credPresLocalizado
      ? "Não localizado"
      : credPresPendente
        ? "Pendente"
        : "Localizado";

  // Líquido nunca fica negativo — o excedente vira crédito acumulado (caixa).
  const ibsCbsLiquido = Math.max(
    0,
    debitoIbs + debitoCbs - creditoIbs - creditoCbs - credPresTotal
  );
  const splitRetido =
    (debitoIbs + debitoCbs) * num(op.split_pct) * num(anoParams.efeito_financeiro);
  const cargaEfetiva = vb > 0 ? ibsCbsLiquido / vb : 0;

  // Split IBS UF / Município — débitos
  const aliqUf = num(anoParams.ibs_uf_aliquota);
  const aliqMun = num(anoParams.ibs_mun_aliquota);
  const aliqTotal = aliqUf + aliqMun;
  const debitoIbsUf = isEntrada ? 0 : (aliqTotal > 0 ? vb * aliqUf * (1 - redIbs) : 0);
  const debitoIbsMun = isEntrada ? 0 : (aliqTotal > 0 ? vb * aliqMun * (1 - redIbs) : 0);

  // Split IBS UF / Município — créditos (proporcionais à alíquota de cada ente)
  const creditoIbsUf = isEntrada && aliqTotal > 0
    ? vb * aliqUf * (1 - redIbs) * creditoElegivel
    : 0;
  const creditoIbsMun = isEntrada && aliqTotal > 0
    ? vb * aliqMun * (1 - redIbs) * creditoElegivel
    : 0;

  // Saldos por ente (débito - crédito, nunca negativo individualmente)
  const saldoIbsUf = Math.max(0, debitoIbsUf - creditoIbsUf);
  const saldoIbsMun = Math.max(0, debitoIbsMun - creditoIbsMun);

  return {
    ibsNominal, cbsNominal, ibsEfetiva, cbsEfetiva,
    debitoIbs, debitoCbs, creditoIbs, creditoCbs,
    credPresIbs, credPresCbs, credPresTotal,
    ibsCbsLiquido, cargaEfetiva, splitRetido,
    debitoIbsUf, debitoIbsMun,
    creditoIbsUf, creditoIbsMun,
    saldoIbsUf, saldoIbsMun,
    statusClassificacao: classTrib?.c_class_trib ? "Localizada" : "Pendente",
    credPresPendente, statusCredPres,
  };
}

/** Módulo 3 — Transição */
export function calcTransicao(op, sisAtual, ibsCbs, anoParams) {
  const vb = num(op.valor_bruto);
  const fPisCofins = num(anoParams.pis_cofins_fator);
  const fIpi = num(anoParams.ipi_fator_geral);
  const fIcms = num(anoParams.icms_fator);
  const fIss = num(anoParams.iss_fator);

  const pisCofinsAtual = (sisAtual.pis + sisAtual.cofins) * fPisCofins;
  const ipiAtual = sisAtual.ipi * fIpi;
  const icmsFcpStAtual = (sisAtual.icmsProprio + sisAtual.fcp + sisAtual.icmsSt) * fIcms;
  const issAtual = sisAtual.iss * fIss;
  const sistemaAtualRemanescente = pisCofinsAtual + ipiAtual + icmsFcpStAtual + issAtual;

  const ibsCbsLiquidoFinal = ibsCbs.ibsCbsLiquido;
  const ibsCbsFinanceiro = ibsCbs.ibsCbsLiquido * num(anoParams.efeito_financeiro);
  const cargaTotalTransicao = sistemaAtualRemanescente + ibsCbsFinanceiro;
  const cargaEfetiva = vb > 0 ? cargaTotalTransicao / vb : 0;
  const diferencaVsAtual = cargaTotalTransicao - sisAtual.tributosLiquidos;
  const diferencaPct = vb > 0 ? diferencaVsAtual / vb : 0;

  return {
    pisCofinsAtual, ipiAtual, icmsFcpStAtual, issAtual,
    sistemaAtualRemanescente, ibsCbsLiquidoFinal, ibsCbsFinanceiro,
    cargaTotalTransicao, cargaEfetiva, diferencaVsAtual, diferencaPct,
    carater: anoParams.carater || "",
  };
}

/** Módulo 4 — Preço e margem (gross-up híbrido do Excel v0.16) */
export function calcPrecoMargem(op, sisAtual, transicao, cenario = {}, config = {}) {
  const vb = num(op.valor_bruto);
  const isEntrada = op.direcao === "Entrada";
  const fVol = num(cenario.fator_volume) || 1;
  const fPrec = num(cenario.fator_preco) || 1;
  const fCust = num(cenario.fator_custo) || 1;

  const receita = vb * fVol * fPrec;
  const custoBase = (isEntrada ? vb : vb * num(op.custo_base_pct)) * fCust;
  const tributosAtuais = sisAtual.tributosLiquidos;
  const tributosTransicao = transicao.cargaTotalTransicao;

  const margemAtual = isEntrada ? 0 : receita - custoBase - tributosAtuais;
  const margemTransicao = isEntrada ? 0 : receita - custoBase - tributosTransicao;
  const margemPctAtual = receita > 0 ? margemAtual / receita : 0;
  const margemPctTransicao = receita > 0 ? margemTransicao / receita : 0;

  // Gross-up híbrido: tributos atuais remanescentes na base (divisor) e
  // IBS/CBS financeiro adicionado por fora (multiplicador).
  // Margem-meta é global (Configuração!B17); a operação só fallback.
  const margemMeta = num(config.margem_meta_pct) || num(op.margem_meta_pct) || 0.18;
  const cargaRemanescenteRate = receita > 0 ? transicao.sistemaAtualRemanescente / receita : 0;
  const ibsCbsFinRate = receita > 0 ? transicao.ibsCbsFinanceiro / receita : 0;
  const divisor = 1 - margemMeta - cargaRemanescenteRate;
  const precoBrutoAlvo = isEntrada || divisor <= 0
    ? 0
    : (custoBase / divisor) * (1 + ibsCbsFinRate);
  const diferencaPreco = precoBrutoAlvo - vb;
  const alerta = !isEntrada && margemPctTransicao < margemMeta ? "Margem abaixo da meta" : null;

  return {
    receita, custoBase, tributosAtuais, tributosTransicao,
    margemAtual, margemTransicao, margemPctAtual, margemPctTransicao,
    precoBrutoAlvo, diferencaPreco, alerta,
  };
}

/** Módulo 5 — Caixa e split payment (fiel à aba "Caixa e Split" do Excel v0.16) */
export function calcCaixaSplit(op, ibsCbs, transicao, sisAtual, config = {}) {
  const vb = num(op.valor_bruto);
  const isEntrada = op.direcao === "Entrada";
  const debitoIbsCbs = ibsCbs.debitoIbs + ibsCbs.debitoCbs;
  const creditoIbsCbsTotal =
    ibsCbs.creditoIbs + ibsCbs.creditoCbs + ibsCbs.credPresTotal;
  const splitRetido = ibsCbs.splitRetido;

  // Crédito acumulado = excedente de créditos sobre débitos (nunca negativo).
  const creditoAcumulado = Math.max(0, creditoIbsCbsTotal - debitoIbsCbs);

  const caixaImediato = isEntrada ? -vb : vb - splitRetido;
  const prazo = num(config.prazo_realizacao_credito_dias) || 60;
  const taxaMensal = num(config.taxa_custo_financeiro_pct) || 0.015;
  // Custo financeiro = crédito acumulado × taxa mensal × prazo / 30.
  const custoFinanceiro = creditoAcumulado * taxaMensal * (prazo / 30);
  const caixaAposRealizacao = caixaImediato - custoFinanceiro + creditoAcumulado;

  // Caixa de referência do sistema atual.
  const caixaReferenciaAtual = isEntrada
    ? -vb + num(sisAtual.creditosAtuais)
    : vb - num(sisAtual.tributosLiquidos);
  const diferencaCaixa = caixaAposRealizacao - caixaReferenciaAtual;
  const fundingTributario = Math.max(0, -diferencaCaixa);

  // Faixas de classificação do Excel: Crítica >10% vb, Alta >5%, Moderada >0, Baixa =0.
  let classificacao = "Baixa";
  if (fundingTributario > vb * 0.10) classificacao = "Crítica";
  else if (fundingTributario > vb * 0.05) classificacao = "Alta";
  else if (fundingTributario > 0) classificacao = "Moderada";

  return {
    debitoIbsCbs, creditoIbsCbsTotal, splitRetido,
    caixaImediato, creditoAcumulado, prazo, custoFinanceiro,
    caixaAposRealizacao, diferencaCaixaVsAtual: diferencaCaixa,
    fundingTributario, classificacao,
  };
}

/** Orquestra todos os módulos para uma operação */
export function calcOperacao(op, anoParams, classTrib, cenario, config, credPresMap = {}) {
  const sisAtual = calcSistemaAtual(op);
  const credPres =
    (credPresMap && credPresMap.get && credPresMap.get(op.c_cred_pres)) || {};
  const ibsCbs = calcIbsCbs(op, anoParams || {}, classTrib || {}, cenario || {}, credPres);
  const transicao = calcTransicao(op, sisAtual, ibsCbs, anoParams || {});
  const precoMargem = calcPrecoMargem(op, sisAtual, transicao, cenario || {}, config || {});
  const caixa = calcCaixaSplit(op, ibsCbs, transicao, sisAtual, config || {});
  return { sistemaAtual: sisAtual, ibsCbs, transicao, precoMargem, caixa };
}

/**
 * Apuração consolidada por empresa e período (competência).
 * Diferente da soma de operações isoladas, compensa débitos e créditos
 * da empresa no período ANTES de aplicar Math.max(0, ...).
 *
 * @param operacoesCalculadas — array de { op, sistemaAtual, ibsCbs, transicao, ... }
 * @param filtro — { empresa_id?, ano? } opcional para escopar a apuração
 * @returns array de apurações por empresa+ano
 */
export function apuracaoPorEmpresa(operacoesCalculadas, filtro = {}) {
  const map = new Map();
  for (const oc of operacoesCalculadas) {
    const empId = oc.op.empresa_id;
    const ano = oc.op.ano;
    if (filtro.empresa_id && empId !== filtro.empresa_id) continue;
    if (filtro.ano && ano !== filtro.ano) continue;
    const key = `${empId}|${ano}`;
    if (!map.has(key)) {
      map.set(key, {
        empresa_id: empId, ano,
        totalSaidas: 0, totalEntradas: 0,
        debitoIbsTotal: 0, debitoCbsTotal: 0,
        creditoIbsTotal: 0, creditoCbsTotal: 0,
        credPresTotal: 0,
        tributosAtuaisLiquidos: 0,
        cargaTransicao: 0,
        splitRetido: 0,
        funding: 0,
      });
    }
    const a = map.get(key);
    const vb = num(oc.op.valor_bruto);
    const isEntrada = oc.op.direcao === "Entrada";
    if (isEntrada) {
      a.totalEntradas += vb;
      a.creditoIbsTotal += oc.ibsCbs.creditoIbs;
      a.creditoCbsTotal += oc.ibsCbs.creditoCbs;
    } else {
      a.totalSaidas += vb;
      a.debitoIbsTotal += oc.ibsCbs.debitoIbs;
      a.debitoCbsTotal += oc.ibsCbs.debitoCbs;
    }
    a.credPresTotal += oc.ibsCbs.credPresTotal;
    a.tributosAtuaisLiquidos += oc.sistemaAtual.tributosLiquidos;
    a.cargaTransicao += oc.transicao.cargaTotalTransicao;
    a.splitRetido += oc.ibsCbs.splitRetido;
    a.funding += oc.caixa.fundingTributario;
  }

  const resultado = [];
  for (const a of map.values()) {
    // Compensa débitos e créditos no nível da empresa/competência
    const saldoIbs = Math.max(0, a.debitoIbsTotal - a.creditoIbsTotal - a.credPresTotal);
    const saldoCbs = Math.max(0, a.debitoCbsTotal - a.creditoCbsTotal);
    const ibsCbsApurado = saldoIbs + saldoCbs;
    const creditoAcumuladoApurado = Math.max(0,
      (a.creditoIbsTotal + a.creditoCbsTotal + a.credPresTotal) - (a.debitoIbsTotal + a.debitoCbsTotal)
    );
    resultado.push({
      ...a,
      saldoIbs, saldoCbs, ibsCbsApurado, creditoAcumuladoApurado,
    });
  }
  return resultado.sort((x, y) => {
    if (x.empresa_id !== y.empresa_id) return String(x.empresa_id).localeCompare(String(y.empresa_id));
    return x.ano - y.ano;
  });
}

/** Agrega operações calculadas por ano (para o painel executivo) */
export function consolidarPorAno(operacoesCalculadas) {
  const porAno = {};
  for (const oc of operacoesCalculadas) {
    const ano = oc.op.ano;
    if (!porAno[ano]) {
      porAno[ano] = {
        ano, valorBruto: 0, tributosAtuaisLiquidos: 0, ibsCbsLiquido: 0,
        cargaTransicao: 0, margemAtual: 0, margemTransicao: 0,
        splitRetido: 0, creditoAcumulado: 0, funding: 0,
      };
    }
    const a = porAno[ano];
    a.valorBruto += num(oc.op.valor_bruto);
    a.tributosAtuaisLiquidos += oc.sistemaAtual.tributosLiquidos;
    a.ibsCbsLiquido += oc.ibsCbs.ibsCbsLiquido;
    a.cargaTransicao += oc.transicao.cargaTotalTransicao;
    a.margemAtual += oc.precoMargem.margemAtual;
    a.margemTransicao += oc.precoMargem.margemTransicao;
    a.splitRetido += oc.ibsCbs.splitRetido;
    a.creditoAcumulado += oc.caixa.creditoAcumulado;
    a.funding += oc.caixa.fundingTributario;
  }
  return Object.values(porAno).sort((x, y) => x.ano - y.ano);
}