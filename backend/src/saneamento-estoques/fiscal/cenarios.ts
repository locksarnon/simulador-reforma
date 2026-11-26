/**
 * Cenários tributários (4, fixos pelo plano) e suas regras de crédito. Tabelas puras, sem catálogo.
 * Só entra aqui o que tem fonte: o crédito do IBS/CBS (LC 214/2025, art. 47, caput, § 1º, II, e § 2º), a vedação do crédito sobre uso ou
 * consumo pessoal (art. 57, caput e §§ 3º e 5º, redação da LC 227/2026) e a devolução (art. 12, § 7º, art. 17 e art. 47, § 12, incluído
 * pela LC 227/2026), conferidos no texto compilado do Planalto em 26/11/2026 (docs/sped-conferencia-2026-11-26.md).
 * O que não foi conferido fica como "VERIFICAR" com o motivo dito (nada de regra inventada).
 */
import { Cenario, Finalidade } from '../tipos';

export type CenarioBase = Exclude<Cenario, 'DEVOLUCAO'>;

/**
 * Quais cenários fazem sentido para cada finalidade. Aquisições de matéria-prima, insumo e embalagem usam o cenário
 * COMPRA_REVENDA (único de aquisição com crédito pleno entre os 4): a regra de crédito é a mesma e a observação diz isso.
 * Devolução espelha a operação original (a venda, para revenda; a aquisição, para as demais).
 */
export const CENARIOS_POR_FINALIDADE: Record<Finalidade, Cenario[]> = {
  REVENDA: ['COMPRA_REVENDA', 'VENDA', 'DEVOLUCAO'],
  MATERIA_PRIMA: ['COMPRA_REVENDA', 'DEVOLUCAO'],
  INSUMO_PRODUCAO: ['COMPRA_REVENDA', 'DEVOLUCAO'],
  EMBALAGEM: ['COMPRA_REVENDA', 'DEVOLUCAO'],
  USO_CONSUMO: ['USO_CONSUMO', 'DEVOLUCAO'],
  MANUTENCAO: ['USO_CONSUMO', 'DEVOLUCAO'],
  IMOBILIZADO: ['USO_CONSUMO', 'DEVOLUCAO'],
  MATERIAL_TERCEIROS: [],
};

export const cenariosAplicaveis = (f: Finalidade): Cenario[] => CENARIOS_POR_FINALIDADE[f];

/** Operação original que a devolução espelha, quando o chamador não informa. */
export const operacaoOriginalPadrao = (f: Finalidade): CenarioBase | null => {
  if (f === 'REVENDA') return 'VENDA';
  return (CENARIOS_POR_FINALIDADE[f].find((x) => x !== 'DEVOLUCAO') as CenarioBase | undefined) ?? null;
};

export type Credito = {
  situacao: 'EM_REGRA' | 'VERIFICAR' | 'NAO_SE_APLICA';
  descricao: string;
  fundamento: string | null;
};

const CREDITO_PLENO: Finalidade[] = ['REVENDA', 'MATERIA_PRIMA', 'INSUMO_PRODUCAO', 'EMBALAGEM'];

/** Regra de crédito do cenário para a finalidade. `art47Carregado` = o art. 47 da LC 214 existe na Base legal. */
export function regraCredito(cenario: CenarioBase, finalidade: Finalidade, art47Carregado: boolean): Credito {
  const fundamento = art47Carregado ? 'LC 214/2025, art. 47, caput, e art. 57, caput e §§ 3º e 5º (redação da LC 227/2026)' :'LC 214/2025, art. 47 (dispositivo não encontrado na Base legal: não confirmado)';
  if (cenario === 'VENDA') return { situacao: 'NAO_SE_APLICA', descricao: 'Operação de saída: débito conforme o CST e o cClassTrib da linha; o crédito é o da aquisição do item', fundamento: null };
  if (CREDITO_PLENO.includes(finalidade)) {
    return {
      situacao: 'EM_REGRA',
      descricao: 'Crédito na aquisição (regime regular) quando extinto o débito da operação e comprovado por documento fiscal eletrônico idôneo; valor = imposto destacado e extinto ou crédito presumido (LC 214/2025, art. 47, caput, § 1º, II, e § 2º); confirmar o regime do cliente',
      fundamento: art47Carregado ? 'LC 214/2025, art. 47, caput, § 1º, II, e § 2º; art. 57, caput e §§ 3º e 5º (redação da LC 227/2026)' : fundamento,
    };
  }
  if (finalidade === 'MATERIAL_TERCEIROS') return { situacao: 'VERIFICAR', descricao: 'Material de terceiros: a regra de crédito não foi conferida nesta base', fundamento: null };
  return {
    situacao: 'VERIFICAR',
    descricao: finalidade === 'IMOBILIZADO'
      ? 'Crédito amplo (LC 214/2025, art. 47, caput), exceto bens e serviços de uso ou consumo pessoal, cujo crédito é vedado (art. 57, § 5º; conceito no caput e exceções no § 3º); a regra específica de apropriação do ativo imobilizado não foi conferida nesta base'
      : 'Crédito amplo (LC 214/2025, art. 47, caput), exceto bens e serviços de uso ou consumo pessoal, cujo crédito é vedado (art. 57, § 5º). Uso ou consumo pessoal = itens do art. 57, caput, I (joias, bebidas alcoólicas, tabaco, armas, bens recreativos, esportivos e estéticos etc.) e II (fornecidos sem ônus ou abaixo do mercado a sócios, administradores, empregados e parentes), salvo os usados preponderantemente na atividade econômica (art. 57, § 3º). Classificar o item',
    fundamento,
  };
}

/**
 * Devolução (texto compilado da LC 214/2025 no Planalto, conferido em 26/11/2026): base de cálculo e alíquota da operação original
 * (art. 12, § 7º, e art. 17); nas operações com adquirente contribuinte do regime regular, o efeito no crédito ou no débito segue o
 * art. 47, § 12, I (adquirente: débito ou estorno de crédito) e II (fornecedor: crédito ou estorno de débito), incluído pela LC 227/2026,
 * com procedimento a disciplinar em regulamento (regulamento não confirmado nesta base). Fica "a verificar".
 */
export const FUNDAMENTO_DEVOLUCAO = 'LC 214/2025, art. 12, § 7º, art. 17 e art. 47, § 12, I e II (incluído pela LC 227/2026); regulamento não confirmado nesta base';
const TEXTO_DEVOLUCAO = 'base e alíquota da operação original (LC 214/2025, art. 12, § 7º, e art. 17); efeito no crédito ou débito conforme o art. 47, § 12, I e II (incluído pela LC 227/2026), com procedimento a definir em regulamento (regulamento não confirmado nesta base)';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function regraCreditoDevolucao(original: CenarioBase, _finalidade: Finalidade, _art47Carregado: boolean): Credito {
  const quem = original === 'VENDA' ? 'Devolução de venda (o cliente é o fornecedor: art. 47, § 12, II)' : 'Devolução de compra (o cliente é o adquirente: art. 47, § 12, I)';
  return { situacao: 'VERIFICAR', descricao: `${quem}: ${TEXTO_DEVOLUCAO}`, fundamento: FUNDAMENTO_DEVOLUCAO };
}
