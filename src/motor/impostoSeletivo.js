/**
 * Imposto Seletivo (LC 214/2025, arts. 409 a 438).
 *
 * O QUE ESTÁ FIXADO EM LEI
 *  - Incide uma única vez, sem crédito para quem compra e sem aproveitar crédito anterior (art. 410), a
 *    partir de 2027 (EC 132/2023, ADCT art. 126, I, "b"). Quem paga é o fabricante (no primeiro
 *    fornecimento), o importador, o arrematante, o extrativista e o fornecedor do serviço (art. 424).
 *  - Alcança os bens e serviços do Anexo XVII: veículos, aeronaves e embarcações, fumígenos, bebidas
 *    alcoólicas, bebidas açucaradas, bens minerais e concursos de prognósticos (art. 409, §1º).
 *  - Base de cálculo da alíquota ad valorem na venda: o valor integral cobrado, incluindo os tributos
 *    incidentes na operação (art. 415, V), mas SEM os tributos do art. 12, §2º (IBS, CBS, IPI e, de 2026 a 2032,
 *    ICMS, ISS, PIS e Cofins), SEM o próprio IS e sem descontos incondicionais (art. 417, I e II; §4º repete
 *    ICMS e ISS até 31/12/2032). Como o IS faz parte do valor da operação, ele está "por dentro" do preço.
 *  - O IS integra a base do IBS e da CBS (art. 12, §1º, V; ele não consta das exclusões do §2º). Por isso o
 *    motor não muda a base de IBS/CBS: o valor da operação já o contém.
 *  - Bens minerais extraídos: alíquota máxima de 0,25% (art. 422, §2º).
 *
 * APROXIMAÇÃO DECLARADA: nem todo IS é sobre o valor de venda. A base é o "valor de referência" na extração de bem
 * mineral e na comercialização e importação de produtos fumígenos (art. 414, III, "b" e "c"), definido por ato do
 * Executivo (§§ 2º e 3º), e o valor de mercado ou contábil em outras hipóteses (art. 414, IV a VI). O motor usa o
 * valor da operação como base e AVISA nesses casos (`aproximacaoBase`).
 *
 * O QUE NÃO ESTÁ FIXADO (e o motor não inventa)
 *  - As alíquotas dos demais itens dependem de lei ordinária ainda não publicada (arts. 419, 421 e 422).
 *    Por isso a alíquota é um campo que o usuário informa na operação (`is_pct`, ad valorem). Fumígenos e
 *    bebidas alcoólicas terão também alíquota específica (por unidade), que não é modelada aqui.
 */

const num = (v) => (typeof v === "number" ? v : Number(v) || 0);
const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/** Teto legal do IS na extração de bens minerais (art. 422, §2º). */
export const TETO_IS_BENS_MINERAIS = 0.0025;
/** Último ano em que ICMS, ISS, PIS e Cofins ficam fora da base do IS (arts. 12, §2º, V, 415, V, e 417, §4º). */
export const ULTIMO_ANO_ICMS_ISS_FORA_BASE = 2032;
export const PRIMEIRO_ANO_IS = 2027;

const AVISO_VALOR_DE_REFERENCIA =
  "A base legal é o valor de referência, definido por ato do Poder Executivo (art. 414, III e §§ 2º e 3º): o cálculo usa o valor da operação como aproximação.";

/**
 * Anexo XVII da LC 214/2025 — códigos NCM/SH. `prefixos` casa pelo início do código só com dígitos;
 * `excecoes` tira códigos específicos; `confirmar` vira aviso quando o texto da lei tem ressalva que a
 * NCM sozinha não resolve; `valorDeReferencia` marca onde a base legal não é o valor da operação.
 */
export const ANEXO_XVII = [
  {
    categoria: "veiculos", nome: "Veículos",
    prefixos: ["8703", "870421", "870431", "87044100", "87045100", "87046000", "87049000"],
    confirmar: "A lei exclui os caminhões das posições 8704 e os veículos de uso operacional das Forças Armadas e da segurança pública.",
  },
  {
    categoria: "aeronaves_embarcacoes", nome: "Aeronaves e embarcações",
    prefixos: ["8802", "8903"], excecoes: ["88026000"],
    confirmar: "Em 8903 só entram embarcações com motor; ficam de fora as de uso operacional das Forças Armadas e da segurança pública.",
  },
  {
    categoria: "fumigenos", nome: "Produtos fumígenos", prefixos: ["2401", "2402", "2403", "2404"], valorDeReferencia: true,
    confirmar: `Incide quando acondicionado em embalagem primária destinada ao consumidor final (art. 409, §2º). ${AVISO_VALOR_DE_REFERENCIA}`,
  },
  { categoria: "bebidas_alcoolicas", nome: "Bebidas alcoólicas", prefixos: ["2203", "2204", "2205", "2206", "2208"], confirmar: "Incide quando acondicionada em embalagem primária destinada ao consumidor final (art. 409, §2º)." },
  { categoria: "bebidas_acucaradas", nome: "Bebidas açucaradas", prefixos: ["22021000"] },
  {
    categoria: "bens_minerais", nome: "Bens minerais", prefixos: ["2601", "27090010", "27111100", "27112100"],
    teto: TETO_IS_BENS_MINERAIS, valorDeReferencia: true,
    confirmar: `Incide na extração, com alíquota máxima de 0,25% (art. 422, §2º), inclusive sobre o que é exportado. ${AVISO_VALOR_DE_REFERENCIA} O art. 409, §1º inclui também o carvão mineral, que o Anexo XVII não lista por NCM: confira o enquadramento.`,
  },
];

/** Enquadra uma NCM no Anexo XVII. Devolve null se a NCM não está sujeita ao IS. */
export function classificarImpostoSeletivo(ncm) {
  const d = soDigitos(ncm);
  if (d.length < 4) return null;
  for (const grupo of ANEXO_XVII) {
    if (grupo.excecoes?.some((e) => d.startsWith(e))) continue;
    if (grupo.prefixos.some((p) => d.startsWith(p))) {
      return {
        categoria: grupo.categoria, nome: grupo.nome, teto: grupo.teto ?? null,
        valorDeReferencia: Boolean(grupo.valorDeReferencia), confirmar: grupo.confirmar ?? null,
      };
    }
  }
  return null;
}

/**
 * IS de uma operação de SAÍDA em que a empresa é contribuinte do IS, com a alíquota ad valorem informada.
 * `valor_bruto` é o valor da operação já com o IS dentro; a base exclui o próprio IS e os tributos do art. 12, §2º:
 * IPI e, até 2032, ICMS, ISS, PIS e Cofins (todos já calculados em `sisAtual` e reduzidos pelos fatores do ano).
 *
 *   IS = i × (V − deduções) / (1 + i)
 */
export function calcImpostoSeletivo(op, sisAtual = {}, anoParams = {}) {
  const i = Math.max(0, num(op?.is_pct));
  const vb = num(op?.valor_bruto);
  const ano = num(anoParams.ano) || num(op?.ano);
  const enq = classificarImpostoSeletivo(op?.ncm);
  const base = {
    aliquota: i, base: 0, valor: 0, deducoesBase: 0, aplicavel: false,
    categoria: enq?.categoria ?? null, aproximacaoBase: Boolean(enq?.valorDeReferencia),
    teto: enq?.teto ?? null, acimaDoTeto: enq?.teto != null && i > enq.teto + 1e-12,
  };
  if (i <= 0 || vb <= 0) return base;
  if (op?.direcao === "Entrada") return { ...base, motivo: "O IS é pago por quem fabrica, importa ou extrai; na compra ele já vem dentro do preço e não gera crédito (art. 410)." };
  if (ano > 0 && ano < PRIMEIRO_ANO_IS) return { ...base, motivo: "O IS só é cobrado a partir de 2027 (ADCT, art. 126, I, b)." };

  const ateAno2032 = ano > 0 && ano <= ULTIMO_ANO_ICMS_ISS_FORA_BASE;
  const fator = (v) => (v === undefined || v === null ? 1 : num(v));
  const deducoes =
    num(sisAtual.ipi) * fator(anoParams.ipi_fator_geral) +
    (ateAno2032
      ? (num(sisAtual.pis) + num(sisAtual.cofins)) * fator(anoParams.pis_cofins_fator) +
        (num(sisAtual.icmsProprio) + num(sisAtual.fcp) + num(sisAtual.icmsSt)) * fator(anoParams.icms_fator) +
        num(sisAtual.iss) * fator(anoParams.iss_fator)
      : 0);
  const baseSemIs = Math.max(0, vb - deducoes);
  const valor = (i * baseSemIs) / (1 + i);
  return { ...base, base: baseSemIs - valor, valor, deducoesBase: deducoes, aplicavel: true };
}
