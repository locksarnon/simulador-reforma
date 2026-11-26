/**
 * Cenários tributários (4, fixos pelo plano) e suas regras de crédito. Tabelas puras, sem catálogo.
 * Só entra aqui o que tem fonte: o crédito amplo do IBS/CBS (LC 214/2025, art. 47, conforme as notas já usadas pelo motor do projeto).
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
  const fundamento = art47Carregado ? 'LC 214/2025, art. 47' : 'LC 214/2025, art. 47 (dispositivo não encontrado na Base legal: não confirmado)';
  if (cenario === 'VENDA') return { situacao: 'NAO_SE_APLICA', descricao: 'Operação de saída: gera débito de IBS/CBS; o crédito é o da aquisição do item', fundamento: null };
  if (CREDITO_PLENO.includes(finalidade)) {
    return { situacao: 'EM_REGRA', descricao: 'Crédito amplo na aquisição (regime regular), condicionado a documento fiscal eletrônico idôneo; confirmar o regime do cliente', fundamento };
  }
  if (finalidade === 'MATERIAL_TERCEIROS') return { situacao: 'VERIFICAR', descricao: 'Material de terceiros: a regra de crédito não foi conferida nesta base', fundamento: null };
  return {
    situacao: 'VERIFICAR',
    descricao: finalidade === 'IMOBILIZADO'
      ? 'Crédito amplo, exceto uso e consumo pessoal; a regra específica de apropriação do ativo imobilizado não foi conferida nesta base; sobre uso e consumo pessoal, art. 57: conferir no texto oficial'
      : 'Crédito amplo, exceto uso e consumo pessoal; o repositório indica o art. 57 da LC 214/2025 para uso e consumo pessoal, mas o texto não foi lido nesta entrega (art. 57: conferir no texto oficial). Classificar o item',
    fundamento,
  };
}

/** Crédito da devolução: espelha o da operação original (estorno do crédito, nas aquisições; anulação do débito, na venda). */
export function regraCreditoDevolucao(original: CenarioBase, finalidade: Finalidade, art47Carregado: boolean): Credito {
  const interna = 'Regra operacional interna do saneamento (interpretação, não é norma): conferir';
  if (original === 'VENDA') return { situacao: 'NAO_SE_APLICA', descricao: 'Devolução de venda: anula o débito da operação original (regra operacional; conferir)', fundamento: interna };
  const c = regraCredito(original, finalidade, art47Carregado);
  return { ...c, descricao: `Devolução de compra: estorna o crédito da operação original (regra operacional; conferir). ${c.descricao}`, fundamento: [interna, c.fundamento].filter(Boolean).join(' · ') };
}
