import { SetMetadata } from '@nestjs/common';
import { FuncaoId } from './permissoes';

export const PERMISSAO_KEY = 'permissaoFuncoes';

/**
 * Funções que o endpoint exige (todas). Com a marca, o guarda confere estas funções no lugar da regra geral
 * ("Alterar dados" para escrita, "Excluir registros" para DELETE).
 */
export const Permissao = (...funcoes: FuncaoId[]) => SetMetadata(PERMISSAO_KEY, funcoes);
