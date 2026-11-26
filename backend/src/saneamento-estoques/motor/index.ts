/**
 * Motor de análise do Saneamento de Estoques: camadas puras (sem banco) que recebem os itens de trabalho e devolvem casos propostos.
 * Ordem de execução: Identificação → Qualidade → Duplicidade → Grupos → Nomes e unidades → NCM (as camadas não dependem umas das outras: a ordem só fixa a saída).
 * Tributário, Estoque e Obrigações são de outros agentes; a IA nunca entra aqui.
 */
import type { AnalisadorCamada, ResultadoCamada, ItemTrabalho } from '../tipos';
import type { ContextoMotor } from './contexto';
import { AnalisadorDuplicidade } from './duplicidade';
import { AnalisadorGrupos } from './grupos';
import { AnalisadorIdentificacao } from './identificacao';
import { AnalisadorNcm } from './ncm';
import { AnalisadorNomesUnidades } from './nomes-unidades';
import { AnalisadorQualidade } from './qualidade';

export * from './contexto';
export { VARIA_POR_ITEM, valorComum } from './base';
export { camadasAfetadas, novoCaso } from './dependencias';
export { AnalisadorDuplicidade, DECISOES_DUPLICIDADE, type DecisaoDuplicidade } from './duplicidade';
export { AnalisadorGrupos } from './grupos';
export { AnalisadorIdentificacao } from './identificacao';
export { AnalisadorNcm } from './ncm';
export { AnalisadorNomesUnidades, padronizarDescricao, ABREVIACOES_AMBIGUAS } from './nomes-unidades';
export { AnalisadorQualidade } from './qualidade';
export { detectarEscalaSaldo, escalaDaBase, montarConjuntos, saldoNaEscala, sugerirSobrevivente } from './conjuntos';
export { achadosUnidade, classificarUnidade, chaveUnidade, fatorPelaDescricao, fatorDaDecisao, precisaFator, rotulosPadrao, unidadeCanonica, conteudoNaUnidade, lerFator } from './unidades';

/** As camadas do motor, na ordem de execução (instâncias novas a cada chamada: sem estado entre execuções). */
export const analisadoresPadrao = (): AnalisadorCamada[] => [
  new AnalisadorIdentificacao(), new AnalisadorQualidade(), new AnalisadorDuplicidade(), new AnalisadorGrupos(), new AnalisadorNomesUnidades(), new AnalisadorNcm(),
];

/**
 * Roda as camadas na ordem dada (padrão: todas) sobre os mesmos itens e devolve um resultado por camada. Determinístico: mesma entrada (itens na mesma ordem,
 * mesmo contexto) → mesma saída, com os casos em ordem estável. Não altera os itens recebidos.
 */
export function executarMotor(itens: ItemTrabalho[], contexto: ContextoMotor, camadas: AnalisadorCamada[] = analisadoresPadrao()): ResultadoCamada[] {
  return camadas.map((a) => a.analisar(itens, contexto));
}
