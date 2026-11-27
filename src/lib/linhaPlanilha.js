/**
 * Linha que o usuário vê: a linha de verdade no arquivo dele (o que o Excel mostra), vinda do backend em `linha_planilha`. O campo `linha`
 * continua sendo a chave interna do item (liga duplicidade, mestre, exclusões e o que já está salvo) e não muda. Item antigo, salvo antes de
 * existir `linha_planilha`, mostra a chave (era igual à linha do arquivo quando o cabeçalho ficava na linha 1).
 */
export const linhaNaPlanilha = (it) => it?.linha_planilha ?? it?.linha;
