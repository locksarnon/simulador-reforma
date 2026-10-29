/**
 * Combustíveis no regime específico do IBS e da CBS (LC 214/2025, arts. 172 a 180).
 *
 * COMO A LEI FUNCIONA
 *  - Incidência única (monofásica): o tributo é cobrado de quem produz, refina, formula ou importa o
 *    combustível (art. 176, que inclui o produtor nacional de biocombustíveis e a cooperativa de
 *    produtores de etanol). Quem vem depois na cadeia não recolhe de novo (art. 172).
 *  - Alíquota específica: reais por unidade de medida (litro ou quilograma), uniforme no país e
 *    diferente por produto (arts. 173 e 174). Tributo = quantidade × alíquota.
 *  - CBS de 2027: Portaria MF nº 3.074/2026 (DOU 09/10/2026), com base no Decreto nº 13.133/2026 e na
 *    metodologia da Portaria Conjunta MF/CGIBS nº 14/2026. Efeitos a partir de 08/01/2027.
 *  - IBS: em 2027 e 2028, 0,05% estadual + 0,05% municipal sobre o valor da operação (art. 344,
 *    parágrafo único, III), que pode ser deduzido da CBS a recolher (art. 347, §2º). A alíquota
 *    específica do IBS (por litro) só vale de 2029 em diante e será divulgada pelo CGIBS no ano anterior
 *    (art. 174, §4º): ainda não existe, e o motor a trata como PENDENTE em vez de inventar um número.
 *  - Crédito: quem compra combustível para consumir (ex.: diesel da lavoura) credita o valor de IBS e
 *    CBS registrado na nota, sem precisar provar o recolhimento (art. 47, §§ 4º e 5º). Quem compra para
 *    distribuir, comercializar ou revender não credita (art. 180, caput).
 *  - Vendas posteriores à incidência única (distribuidor, posto): cClassTrib 620006 ("tributação
 *    monofásica cobrada anteriormente"), sem débito de IBS/CBS.
 *  - A compra pela administração pública NÃO tem redutor quando a alíquota é nacionalmente uniforme
 *    (art. 472, parágrafo único, II): o redutor de compras governamentais não se aplica aqui.
 *
 * PREMISSAS DO MOTOR (declaradas na tela)
 *  - A Portaria produz efeitos a partir do 91º dia contado da publicação (8/1/2027 pela contagem usual da
 *    anterioridade nonagesimal): o motor aplica a CBS específica a todo o ano de 2027, sem tratar 1º a 7/1.
 *  - O crédito de quem compra segue os valores registrados na nota (CBS específica cheia + IBS); a dedução do
 *    art. 347, §2º, reduz só o que o fornecedor recolhe, então em 2027–2028 o crédito pode exceder em até o
 *    IBS (0,1% do valor) o que o fornecedor recolheu líquido.
 *  - Revenda por distribuidor ou posto (tributo já cobrado antes) deve usar cClassTrib 620006, sem débito: com outra
 *    classe o motor cobra de novo. As classes 620004 e 620005 (mistura de EAC acima ou abaixo do obrigatório,
 *    art. 179) não são modeladas; 620007 (perecimento) é tratada como sem débito.
 *
 * NÃO MODELADO (sem valor oficial): gás natural processado, biometano e GNV (art. 172, IX a XI, que
 * podem ter o regime adiado por ato conjunto, §3º) e os "outros combustíveis" do inciso XII.
 */

export const PRODUTOS_COMBUSTIVEL = [
  { id: "gasolina", nome: "Gasolina e suas correntes", unidade: "litro", inciso: "I" },
  { id: "eac", nome: "Etanol anidro combustível (EAC)", unidade: "litro", inciso: "II" },
  { id: "diesel", nome: "Óleo diesel e suas correntes", unidade: "litro", inciso: "III" },
  { id: "b100", nome: "Biodiesel (B100)", unidade: "litro", inciso: "IV" },
  { id: "glp", nome: "GLP (inclusive GLGN)", unidade: "kg", inciso: "V" },
  { id: "ehc", nome: "Etanol hidratado combustível (EHC)", unidade: "litro", inciso: "VI" },
  { id: "qav", nome: "Querosene de aviação (QAV)", unidade: "litro", inciso: "VII" },
  { id: "oleo_combustivel", nome: "Óleo combustível", unidade: "kg", inciso: "VIII" },
];

/** cClassTrib que significam "o tributo já foi cobrado antes na cadeia" ou perda do bem: sem débito nesta saída. */
const CLASSES_SEM_DEBITO = new Set(["620006", "620007"]);

const num = (v) => (typeof v === "number" ? v : Number(v) || 0);
const temNumero = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

export const nomeProdutoCombustivel = (id) => PRODUTOS_COMBUSTIVEL.find((p) => p.id === id)?.nome || id;

/** Exceções que o anexo da Portaria MF nº 3.074/2026 faz a certos produtos: a alíquota do catálogo não vale para elas. */
const EXCECOES_PORTARIA = {
  glp: "GLP destinado ao uso doméstico e envasado em recipientes de até 13 kg fica fora desta alíquota (Portaria MF nº 3.074/2026, item V).",
  b100: "B100 produzido com matéria-prima da agricultura familiar fica fora desta alíquota, e ato do Executivo pode reduzi-la (LC 214, art. 175, §6º; Portaria, item IV).",
};

/**
 * Monta, para um ano, o mapa { produto → alíquotas } a partir das linhas de AliquotaCombustivel.
 * CBS: se o ano ainda não tem linha, repete a do último ano divulgado (a lei reajusta a CBS pelo preço
 * médio ao consumidor, art. 174, §3º; sem o índice, a premissa neutra é manter o valor) e avisa.
 * IBS: nunca é repetido, porque a alíquota específica do IBS não existe antes de 2029.
 */
export function aliquotasCombustivelDoAno(linhas = [], ano) {
  const porProduto = new Map();
  for (const l of linhas) {
    if (!porProduto.has(l.produto)) porProduto.set(l.produto, []);
    porProduto.get(l.produto).push(l);
  }
  const out = {};
  for (const [produto, ls] of porProduto) {
    const doAno = ls.find((l) => Number(l.ano) === Number(ano));
    const anteriores = ls.filter((l) => Number(l.ano) < Number(ano) && temNumero(l.cbs_por_unidade)).sort((a, b) => b.ano - a.ano);
    const baseCbs = temNumero(doAno?.cbs_por_unidade) ? doAno : anteriores[0];
    out[produto] = {
      unidade: (doAno || ls[0]).unidade,
      cbs: baseCbs ? num(baseCbs.cbs_por_unidade) : null,
      cbsRepetidaDe: baseCbs && Number(baseCbs.ano) !== Number(ano) ? Number(baseCbs.ano) : null,
      ibs: temNumero(doAno?.ibs_por_unidade) ? num(doAno.ibs_por_unidade) : null,
      fonte: (baseCbs || doAno || ls[0]).fonte || "",
    };
  }
  return out;
}

/**
 * Cálculo do regime específico para UMA operação. Devolve null quando a operação não é de combustível
 * (campo vazio ou desconhecido). `anoParams.combustiveis` vem de aliquotasCombustivelDoAno().
 *
 * @returns null | {
 *   aplicavel, produto, nome, unidade, quantidade, avisos[],
 *   cbsAdRem, ibsValor, ibsPendente, semDebito, cbsPorUnidade, cbsRepetidaDe
 * } — `aplicavel` falso significa "faltou dado para o regime específico": o motor segue o cálculo comum e mostra o aviso.
 */
export function calcCombustivel(op, anoParams = {}, classTrib = {}) {
  const produto = String(op?.combustivel_produto || "").trim();
  const meta = PRODUTOS_COMBUSTIVEL.find((p) => p.id === produto);
  if (!meta) return null;

  const ano = num(anoParams.ano) || num(op.ano);
  const quantidade = num(op.quantidade);
  const taxa = anoParams.combustiveis?.[produto] || null;
  const vb = num(op.valor_bruto);
  const avisos = [];

  const base = { produto, nome: meta.nome, unidade: meta.unidade, quantidade, avisos, aplicavel: false };
  if (ano > 0 && ano < 2027) {
    // Em 2026 as alíquotas de teste (CBS 0,9% e IBS 0,1%) não se aplicam aos combustíveis (art. 348, III, b).
    avisos.push("Em 2026 as alíquotas de teste de CBS e IBS não se aplicam a combustíveis (LC 214, art. 348, III, b): sem IBS/CBS no ano.");
    return { ...base, aplicavel: true, semDebito: true, cbsAdRem: 0, ibsValor: 0, ibsPendente: false, cbsPorUnidade: null, cbsRepetidaDe: null };
  }
  if (!(quantidade > 0)) {
    avisos.push(`Informe a quantidade em ${meta.unidade === "kg" ? "quilogramas" : "litros"} para calcular a alíquota específica (LC 214, art. 173).`);
    return base;
  }
  if (!taxa || taxa.cbs === null) {
    avisos.push(`Sem alíquota específica de CBS cadastrada para ${meta.nome} (cadastre em Catálogos > Combustíveis).`);
    return base;
  }

  const codigoClasse = String(classTrib?.c_class_trib || op.c_class_trib || "");
  const semDebito = CLASSES_SEM_DEBITO.has(codigoClasse);
  if (codigoClasse && !codigoClasse.startsWith("620")) {
    avisos.push(`Combustível com cClassTrib ${codigoClasse}: o regime específico usa as classes 620001 a 620007 (CST 620, tributação monofásica).`);
  }
  if (taxa.cbsRepetidaDe) {
    avisos.push(`CBS por ${meta.unidade} de ${ano} ainda não divulgada: usada a de ${taxa.cbsRepetidaDe} (a lei reajusta pelo preço médio, art. 174, §3º).`);
  }

  if (EXCECOES_PORTARIA[produto]) avisos.push(EXCECOES_PORTARIA[produto]);

  const cbsAdRem = quantidade * taxa.cbs;
  let ibsValor = 0;
  let ibsPendente = false;
  if (taxa.ibs !== null) {
    ibsValor = quantidade * taxa.ibs;
  } else if (ano >= 2029) {
    ibsPendente = true;
    avisos.push("IBS por unidade de 2029 em diante ainda não divulgado pelo CGIBS: o IBS deste combustível ficou fora do cálculo.");
  } else if (ano >= 2027) {
    ibsValor = vb * num(anoParams.ibs_efetivo); // 0,05% + 0,05% sobre o valor da operação (art. 344, parágrafo único, III)
  }

  return {
    ...base, aplicavel: true, semDebito, cbsAdRem, ibsValor, ibsPendente,
    cbsPorUnidade: taxa.cbs, cbsRepetidaDe: taxa.cbsRepetidaDe,
  };
}
