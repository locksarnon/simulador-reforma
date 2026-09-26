/**
 * Base legal de cada ponto do cálculo — só dispositivos conferidos no texto carregado na Base legal.
 * O texto exibido no "i" vem da própria Base legal (sempre o vigente); aqui ficam apenas a ligação e
 * a explicação de COMO o cálculo usa o dispositivo. `revisado: false` = ligação ainda não validada
 * pelo especialista tributário (aparece no "i").
 */
export const FUNDAMENTOS = {
  aliquotas_transicao: {
    titulo: "Alíquotas de IBS e CBS na transição",
    nota: "Em 2026 o IBS entra a 0,1% e a CBS a 0,9%, compensáveis com PIS/Cofins. Em 2027 e 2028 o IBS é 0,05% estadual mais 0,05% municipal e a CBS tem redução de 0,1 ponto percentual. Os demais anos vêm da aba Transição 2026–2033.",
    refs: [{ norma: "cf-1988", caminho: "adct-art-125" }, { norma: "cf-1988", caminho: "adct-art-127" }],
    revisado: false,
  },
  extincao_pis_cofins: {
    titulo: "Fim do PIS e da Cofins",
    nota: "A partir de 2027 a CBS é cobrada e o PIS/Cofins são extintos, por isso o fator de PIS/Cofins cai a zero nos anos seguintes.",
    refs: [{ norma: "cf-1988", caminho: "adct-art-126" }],
    revisado: false,
  },
  icms_iss_transicao: {
    titulo: "Redução gradual do ICMS e do ISS",
    nota: "De 2029 a 2032 as alíquotas de ICMS e ISS valem 9/10, 8/10, 7/10 e 6/10 das fixadas em lei. É o fator de ICMS/ISS da aba Transição.",
    refs: [{ norma: "cf-1988", caminho: "adct-art-128" }],
    revisado: false,
  },
  credito_ibs_cbs: {
    titulo: "Crédito de IBS e CBS nas compras",
    nota: "O crédito é amplo: vale para as aquisições, exceto uso e consumo pessoal, com documento fiscal eletrônico idôneo. IBS e CBS são apurados separadamente, sem compensação entre si.",
    refs: [{ norma: "lcp-214-2025", caminho: "art-47" }],
    revisado: false,
  },
  credito_presumido: {
    titulo: "Crédito presumido (compras de produtor rural não contribuinte)",
    nota: "Os percentuais são definidos e divulgados anualmente, até setembro, por ato conjunto do Ministro da Fazenda e do Comitê Gestor do IBS, com vigência a partir de 1º de janeiro seguinte. Enquanto não confirmados, o valor é estimativa e pode não ser o real.",
    refs: [{ norma: "lcp-214-2025", caminho: "art-168" }],
    revisado: false,
  },
  split_payment: {
    titulo: "Split payment",
    nota: "O IBS e a CBS são segregados e recolhidos na liquidação financeira do pagamento. O cálculo mostra o valor retido e o efeito no caixa.",
    refs: [
      { norma: "lcp-214-2025", caminho: "art-31" }, { norma: "lcp-214-2025", caminho: "art-32" }, { norma: "lcp-214-2025", caminho: "art-33" },
      { norma: "lcp-214-2025", caminho: "art-34" }, { norma: "lcp-214-2025", caminho: "art-35" },
    ],
    revisado: false,
  },
  local_operacao: {
    titulo: "Local da operação",
    nota: "Para bens móveis materiais, o IBS segue o local da entrega ou disponibilização ao destinatário.",
    refs: [{ norma: "lcp-214-2025", caminho: "art-11" }],
    revisado: false,
  },
  produtor_rural: {
    titulo: "Produtor rural não contribuinte",
    nota: "Produtor com receita anual abaixo do limite (atualizado pelo IPCA) e produtor integrado não são contribuintes de IBS e CBS.",
    refs: [{ norma: "lcp-214-2025", caminho: "art-164" }, { norma: "lcp-214-2025", caminho: "art-167" }],
    revisado: false,
  },
};
