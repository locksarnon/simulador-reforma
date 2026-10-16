import { BadRequestException } from '@nestjs/common';
import { normalizarProduto } from './opcoes-validacao';

/**
 * De-para contábil enviado pelo cliente: para cada cClassTrib (6 dígitos) ou "grupo sugerido" (texto), a conta contábil
 * que o cliente quer usar. O InTAX NÃO adivinha conta: sem regra para o item, a conta sugerida fica vazia (flag SEM_REGRA).
 */
export type PlanoContas = { nome: string; linhas: number; regras: Record<string, string> };

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const COL_CHAVE = ['cclasstrib', 'classtrib', 'classetributaria', 'classificacaotributaria', 'gruposugerido', 'grupotributario', 'tratamento', 'grupo'];
const COL_CONTA = ['contacontabil', 'contasugerida', 'conta', 'codigoconta', 'codconta', 'contacod', 'grupocontabil'];
const COL_NOME = ['nomeconta', 'descricaoconta', 'nomedaconta', 'descricaodaconta', 'descricao'];

/** Chave canônica: cClassTrib de 6 dígitos fica como está; qualquer outro texto vira o nome normalizado do grupo. */
export const chavePlano = (k: string) => (/^\d{6}$/.test(k.trim()) ? k.trim() : normalizarProduto(k));

export function montarPlanoContas(nome: string, cabecalho: string[], linhas: string[][]): PlanoContas {
  const h = cabecalho.map(norm);
  const achar = (alvos: string[]) => { for (const a of alvos) { const i = h.indexOf(a); if (i >= 0) return i; } return -1; };
  const iChave = achar(COL_CHAVE);
  const iConta = achar(COL_CONTA);
  const iNome = achar(COL_NOME);
  if (iChave < 0 || iConta < 0) {
    throw new BadRequestException('Não encontrei as colunas do de-para. Use uma coluna "cClassTrib" (ou "Grupo sugerido") e uma coluna "Conta contábil".');
  }
  const regras: Record<string, string> = {};
  linhas.forEach((l, i) => {
    const chaveBruta = (l[iChave] ?? '').trim();
    const codigo = (l[iConta] ?? '').trim();
    if (!chaveBruta && !codigo) return;
    if (!chaveBruta || !codigo) throw new BadRequestException(`Linha ${i + 2} do de-para está incompleta (precisa de chave e conta).`);
    const nomeConta = iNome >= 0 && iNome !== iConta ? (l[iNome] ?? '').trim() : '';
    const conta = nomeConta ? `${codigo} — ${nomeConta}` : codigo;
    const k = chavePlano(chaveBruta);
    if (regras[k] && regras[k] !== conta) throw new BadRequestException(`A chave "${chaveBruta}" aparece na linha ${i + 2} com uma conta diferente da anterior.`);
    regras[k] = conta;
  });
  if (!Object.keys(regras).length) throw new BadRequestException('O de-para não tem nenhuma regra.');
  return { nome, linhas: Object.keys(regras).length, regras };
}
