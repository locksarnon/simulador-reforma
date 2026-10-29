/**
 * Base legal de cada ponto do cálculo — só dispositivos conferidos no texto carregado na Base legal.
 * O texto exibido no "i" vem da própria Base legal (sempre o vigente); aqui ficam apenas a ligação e
 * a explicação de COMO o cálculo usa o dispositivo. `revisado: false` = ligação ainda não validada
 * pelo especialista tributário (aparece no "i").
 */
export const FUNDAMENTOS = {
  aliquotas_transicao: {
    titulo: "Alíquotas de IBS e CBS na transição",
    nota: "Em 2026 o IBS entra a 0,1% e a CBS a 0,9%, só informativos: compensáveis com PIS/Cofins ou dispensados. Em 2027 e 2028 o IBS é 0,05% estadual mais 0,05% municipal e a CBS é a referência menos 0,1 ponto percentual. De 2029 a 2033 o Senado ainda não fixou nada (fixa em outubro do ano anterior, com cálculo do TCU): os valores seguem o cenário de alíquotas escolhido na aba Transição 2026–2033.",
    refs: [{ norma: "cf-1988", caminho: "adct-art-125" }, { norma: "cf-1988", caminho: "adct-art-127" }, { norma: "lcp-214-2025", caminho: "art-349" }],
    revisado: false,
  },
  compras_governamentais: {
    titulo: "Redutor nas compras governamentais",
    nota: "Nas vendas a pessoa jurídica de direito público interno (administração direta, autarquias, fundações públicas e consórcio público de direito público), as alíquotas de IBS e CBS são reduzidas de modo uniforme pelo redutor do ano (fixado pelo Senado com cálculo do TCU). Não vale para compra presencial dispensada de licitação, para alíquota nacionalmente uniforme (combustíveis) nem para fornecedor do Simples ou MEI.",
    refs: [{ norma: "lcp-214-2025", caminho: "art-472" }, { norma: "lcp-214-2025", caminho: "art-349" }, { norma: "lcp-214-2025", caminho: "art-370" }],
    revisado: false,
  },
  imposto_seletivo: {
    titulo: "Imposto Seletivo",
    nota: "Incide uma única vez, a partir de 2027, sobre veículos, aeronaves e embarcações, fumígenos, bebidas alcoólicas e açucaradas e bens minerais (Anexo XVII). Não gera crédito. Entra no valor da operação (e na base de IBS e CBS) e sua própria base exclui os tributos do art. 12, §2º (IBS, CBS, IPI e, até 2032, ICMS, ISS, PIS e Cofins) e o próprio IS. Em bens minerais e fumígenos a base legal é o valor de referência (art. 414, III), que o cálculo aproxima pelo valor da operação. As alíquotas dependem de lei ordinária ainda não publicada; bens minerais têm teto de 0,25%.",
    refs: [{ norma: "lcp-214-2025", caminho: "art-410" }, { norma: "lcp-214-2025", caminho: "art-417" }, { norma: "lcp-214-2025", caminho: "art-422" }],
    revisado: false,
  },
  combustiveis: {
    titulo: "Combustíveis: alíquota específica por unidade",
    nota: "IBS e CBS incidem uma única vez (monofásico), com alíquota em reais por litro ou quilo, igual em todo o país. A CBS de 2027 está na Portaria MF nº 3.074/2026. Em 2027 e 2028 o IBS é 0,1% do valor e pode ser deduzido da CBS; a alíquota específica do IBS começa em 2029 e ainda não foi divulgada. Quem compra para revender não credita; quem compra para consumir credita o valor registrado na nota.",
    refs: [{ norma: "lcp-214-2025", caminho: "art-172" }, { norma: "lcp-214-2025", caminho: "art-174" }, { norma: "lcp-214-2025", caminho: "art-180" }],
    revisado: false,
  },
  credito_estoque: {
    titulo: "Crédito presumido de CBS sobre o estoque",
    nota: "O contribuinte do regime regular da CBS pode apropriar crédito presumido sobre o estoque de 31/12/2026 nas hipóteses do art. 381 (regime cumulativo de PIS/Cofins, compra com ST ou monofásica, parcela com vedação parcial de crédito), em bens novos comprados de pessoa jurídica no País ou importados. Compra nacional: 9,25% do valor; importação: o PIS/Cofins-Importação pago. Apropriar até junho de 2027 e usar em 12 parcelas mensais, só contra CBS.",
    refs: [{ norma: "lcp-214-2025", caminho: "art-381" }, { norma: "dec-12955-2026", caminho: "art-607" }, { norma: "dec-12955-2026", caminho: "art-609" }],
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
    titulo: "Crédito presumido (compras de quem não é contribuinte)",
    nota: "Vale para a compra de produtor rural não contribuinte (art. 168), de frete de transportador autônomo (art. 169), de resíduos para reciclagem (art. 170) e de bem usado de pessoa física para revenda (art. 171). No produtor rural e no transportador autônomo o crédito é valor × C ÷ (1 + C) (com IBS e CBS juntos, C é a soma dos dois percentuais), e os percentuais são definidos e divulgados até setembro, por ato conjunto do Ministro da Fazenda e do Comitê Gestor do IBS, para valer em 1º de janeiro seguinte; enquanto não confirmados, o valor é estimativa. Nos resíduos e no bem usado o percentual está na lei. O do transportador autônomo, o dos resíduos e o do bem usado só compensam o tributo devido (sem ressarcimento). A mesma compra não gera também o crédito normal.",
    refs: [
      { norma: "lcp-214-2025", caminho: "art-168" }, { norma: "lcp-214-2025", caminho: "art-169" },
      { norma: "lcp-214-2025", caminho: "art-170" }, { norma: "lcp-214-2025", caminho: "art-171" },
      { norma: "dec-12955-2026", caminho: "art-247" }, { norma: "dec-12955-2026", caminho: "art-253" }, { norma: "dec-12955-2026", caminho: "art-254" },
    ],
    revisado: false,
  },
  base_calculo_ibs_cbs: {
    titulo: "Base de cálculo do IBS e da CBS",
    nota: "De 2026 a 2032 o ICMS, o ISS, o PIS e a Cofins ainda cobrados na operação não integram a base de cálculo do IBS e da CBS. O valor da operação já os traz embutidos, então o cálculo tira da base a parte que ainda é cobrada no ano: o PIS/Cofins some em 2027 e o ICMS e o ISS caem de 2029 a 2032. Também ficam fora da base o IBS e a CBS da própria operação, o IPI e os descontos incondicionais. A partir de 2033 a base é o valor da operação.",
    refs: [{ norma: "lcp-214-2025", caminho: "art-12" }],
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
