import { chaveCredPres } from "@/motor/taxEngine";

/**
 * Os quatro créditos presumidos do catálogo oficial de cCredPres (Portal da Conformidade Fácil, SVRS/RFB, tabela
 * conferida em 29/10/2026). O cálculo está em taxEngine.js (calcIbsCbs); aqui ficam os nomes e a orientação de uso da tela.
 * O código é gravado com dois dígitos, como no XML do DF-e ("02"); a tabela da Conformidade Fácil e a tela mostram "2".
 * Todos valem para quem COMPRA de fornecedor que não é contribuinte do IBS/CBS (por isso só em operação de Entrada) e a
 * mesma compra não gera também o crédito normal.
 */
export const CREDITOS_PRESUMIDOS = [
  {
    codigo: "01",
    nome: "Produtor rural não contribuinte (art. 168)",
    baseLegal: "LC 214, art. 168; Decreto 12.955, arts. 245 a 249",
    orientacao:
      "Compra de bens e serviços de produtor rural (ou produtor integrado) que não é contribuinte. Crédito = valor pago × C ÷ (1 + C), em que C é o percentual do ato conjunto do Ministro da Fazenda e do CGIBS, divulgado até setembro do ano anterior (art. 168, §4º); com IBS e CBS informados juntos, há um só valor líquido e o divisor leva a soma dos dois percentuais (art. 168, §§1º a 3º). Em 29/10/2026 o ato de 2027 não foi localizado em fonte oficial: informe o percentual nos campos de crédito presumido acima (o resultado fica marcado como estimativa). Admite o ressarcimento (art. 168, §8º).",
  },
  {
    codigo: "02",
    nome: "Frete de transportador autônomo de carga (art. 169)",
    baseLegal: "LC 214, art. 169; Decreto 12.955, arts. 250 a 255",
    orientacao:
      "Frete contratado de transportador autônomo pessoa física que não é contribuinte (ou MEI). Só vale para o contratante que suporta a cobrança do frete: se o frete está embutido no preço da mercadoria comprada, ainda que destacado na nota, não há crédito (art. 169, §1º). O valor da operação é o que foi pago ao autônomo, e o crédito é valor × C ÷ (1 + C), com C o percentual do ato conjunto do Ministro da Fazenda e do CGIBS (art. 169, §4º; Decreto 12.955, art. 253); com IBS e CBS informados juntos, o divisor leva a soma dos dois percentuais (um só valor líquido, art. 169, §2º, III). Em 29/10/2026 o ato de 2027 não foi localizado em fonte oficial: informe o percentual nos campos de crédito presumido acima (o resultado fica marcado como estimativa). Só compensa o tributo devido, sem ressarcimento (art. 169, §7º; Decreto, art. 254), e é apropriado à medida que os pagamentos ao autônomo são confirmados (Decreto, art. 250, §2º, II).",
  },
  {
    codigo: "03",
    nome: "Resíduos para reciclagem (art. 170)",
    baseLegal: "LC 214, art. 170",
    orientacao:
      "Resíduos sólidos comprados de coletores incentivados (pessoa física, associação ou cooperativa) para destinação final ambientalmente adequada. Os percentuais estão na lei (art. 170, §2º): CBS de 7% e IBS de 1,3% em 2029, 2,6% em 2030, 3,9% em 2031, 5,2% em 2032 e 13% de 2033 em diante; deixe os percentuais de crédito presumido acima em branco para usá-los. Não vale para agrotóxicos, medicamentos, pilhas e baterias, pneus, eletroeletrônicos, óleos lubrificantes (salvo o usado ou contaminado coletado por rerrefinador autorizado), lâmpadas e sucata de cobre (§§3º e 4º). Só compensa o tributo devido.",
  },
  {
    codigo: "04",
    nome: "Bem móvel usado de pessoa física, para revenda (art. 171)",
    baseLegal: "LC 214, art. 171",
    orientacao:
      "Bem móvel usado comprado de pessoa física (que não é contribuinte, ou MEI) para revenda. O percentual é a alíquota de IBS e de CBS do próprio bem (art. 171, §1º); o InTAX usa as alíquotas do ano, e basta deixar os percentuais de crédito presumido acima em branco. O crédito só pode ser usado na revenda desse mesmo bem (art. 171, §2º).",
  },
];

/** Código antigo do InTAX para o produtor rural (hoje o oficial é o 01). */
export const CODIGO_ANTIGO_PRODUTOR_RURAL = "CP-RURAL";

/** Texto curto do código para a tela: "2" para "02"; os demais ficam como estão. */
export function codigoParaTela(codigo) {
  return chaveCredPres(codigo);
}

export function creditoPresumidoPorCodigo(codigo) {
  const chave = chaveCredPres(codigo);
  if (!chave) return null;
  if (chave === CODIGO_ANTIGO_PRODUTOR_RURAL) return { ...CREDITOS_PRESUMIDOS[0], codigo: chave, nome: "Produtor rural (código antigo; o oficial é 1)" };
  return CREDITOS_PRESUMIDOS.find((x) => chaveCredPres(x.codigo) === chave) || null;
}
