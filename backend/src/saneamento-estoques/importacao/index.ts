/**
 * Importação e base do Saneamento de Estoques (docs/saneamento-estoques.md, seção 3). Funções puras, sem banco.
 *
 * Fluxo para o Agente 1 e o integrador:
 *  1. `analisarArquivo(arquivo)` -> { previa, sugestao }: cabeçalho, total de linhas, 1º valor de cada coluna, 10 linhas brutas e o
 *     mapeamento sugerido por nome de coluna (SAP B1, Protheus, Datasul, português), com certeza ALTA/MEDIA por coluna.
 *  2. O consultor corrige: `corrigirMapeamento(sugestao.mapeamento, { ncm: 7, ativo: null })` e confere `validarMapeamento(m, nColunas)`.
 *  3. `gerarPrevia(arquivo, config)` -> total, 10 primeiras linhas já normalizadas e contagens aceitas/rejeitadas/pendentes + relatório.
 *  4. `importarArquivo(arquivo, config)` -> { itens, origem, relatorio }: `itens` (sem id) para gravar; `origem[i]` = linha do arquivo e
 *     chave de reconciliação do item i; `relatorio` traz arquivo, sha256, mapeamento usado, contagens e motivos agrupados com exemplos.
 *     O usuário e a data do registro são do Agente 1.
 *  5. Reimportação: `compararBases(atuais, novos, { camposComparados })` com `achatarItem` -> novos, ausentes, inalterados, alterados por
 *     campo e conflitos (campo com decisão aprovada que o arquivo novo muda). Nunca remove nada sozinha.
 *
 * `arquivo` = { buffer, originalname } (o mesmo objeto do multer usado em produtos/). Limite: 50.000 linhas por envio (MAX_LINHAS de
 * leitura-planilha.ts); a leitura é em fluxo e só guarda as colunas mapeadas e as adicionais.
 */
export { CAMPOS_BASE, CAMPOS_OBRIGATORIOS, ROTULO_CAMPO } from './tipos';
export type {
  CampoBase, Mapeamento, SemanticaAtivo, Certeza, SugestaoColuna, SugestaoMapeamento, ConfigImportacao, SituacaoLinha, Ocorrencia, ItemImportado,
  LinhaConferida, ExemploLinha, GrupoOcorrencia, TotaisImportacao, RelatorioImportacao, PreviaImportacao,
} from './tipos';
export { sugerirMapeamento, corrigirMapeamento, validarMapeamento, SINONIMOS } from './mapeamento';
export { normalizarCodigo, normalizarNcm, lerNumero, lerData, lerAtivo, lerFinalidade, chaveReconciliacao, normalizarEstabelecimento } from './normalizacao';
export { Conferidor, conferirLinhaPreparada, prepararConfig, colunasNecessarias, TEXTO_OCORRENCIA, CODIGOS_REJEICAO } from './conferencia';
export { sha256 } from './relatorio';
export { analisarArquivo, gerarPrevia, importarArquivo, conferirBase, formatoDoArquivo } from './importacao';
export type { ArquivoEntrada, BaseLida, ResultadoConferencia } from './importacao';
export { compararBases, achatarItem, PREFIXO_CAMPOS } from './reimportacao';
export type { CamposPlanos, EntradaAtual, EntradaNova, Mudanca, ItemNovo, ItemAlterado, Conflito, ComparacaoBases, Valor } from './reimportacao';
