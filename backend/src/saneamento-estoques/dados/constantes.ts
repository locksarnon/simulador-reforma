import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CAMADAS, FINALIDADES, type Camada, type Situacao } from '../tipos';

export type Json = Record<string, unknown>;
export type Usuario = { email?: string; role?: string } | undefined;
export const quem = (u: Usuario) => u?.email ?? 'sistema';

export const SITUACOES_CASO = ['PROPOSTO', 'RASCUNHO', 'APROVADO', 'REJEITADO', 'AGUARDANDO_INFORMACAO', 'OBSOLETO'] as const;
export type SituacaoCaso = (typeof SITUACOES_CASO)[number];
/** Casos ainda abertos para decisão. */
export const CASO_ABERTO: SituacaoCaso[] = ['PROPOSTO', 'RASCUNHO'];

export const MODULOS_PADRAO = { conciliacao: false, blocosKG: false, arquivoErp: false };

/** Camadas que dependem das atividades do cliente (reabrir atividades as marca "revisar"). */
export const CAMADAS_DAS_ATIVIDADES: Camada[] = ['GRUPOS_FINALIDADE', 'TRIBUTARIO', 'OBRIGACOES'];

/** Situação da célula conforme a situação do caso. Rejeitar = o consultor mantém como está, logo "sem problema". */
export const CELULA_DO_CASO: Record<SituacaoCaso, Situacao> = {
  PROPOSTO: 'PROPOSTO', RASCUNHO: 'PROPOSTO', APROVADO: 'APROVADO', REJEITADO: 'SEM_PROBLEMA', AGUARDANDO_INFORMACAO: 'AGUARDANDO_INFORMACAO', OBSOLETO: 'PENDENTE',
};

/** Campos do ItemTrabalho que uma decisão pode alterar (os demais vão para `campos`). Nunca: id, codigo, estabelecimento. */
export const CAMPOS_TOPO = ['codigo', 'descricao', 'unidade', 'ncm', 'grupo', 'ativo', 'saldo', 'ultimaMovimentacao', 'fabricante', 'referencia', 'finalidade', 'tambemUsadoComo'] as const;
export const CAMPOS_PROIBIDOS = ['id', 'estabelecimento'];

/** Chaves da proposta que são só informação para o consultor (decisão de duplicidade, árvore, tipo de impacto...): não vão para o item. */
export const CHAVES_INFORMATIVAS = ['decisao', 'decisoesPossiveis', 'tratamentoDoSaldo', 'manter', 'consolidar', 'arvore', 'subgrupos', 'fatorSituacao', 'origem', 'tipoImpacto', 'valorProposto'];

/** O que, da proposta do caso, vira alteração no item. A camada de obrigações só orienta a conferência: nunca altera o cadastro. */
export function propostaAplicavel(camada: string, proposta: Json | null | undefined): Json {
  if (camada === 'OBRIGACOES') return {};
  return Object.fromEntries(Object.entries(proposta ?? {}).filter(([k]) => !CHAVES_INFORMATIVAS.includes(k)));
}

/** Quais camadas voltam a "revisar" quando um campo muda por reimportação (nas decisões vale o `afeta` do caso). */
export const CAMPO_AFETA: Record<string, Camada[]> = {
  descricao: ['QUALIDADE', 'DUPLICIDADE', 'NOMES_UNIDADES', 'NCM'],
  unidade: ['NOMES_UNIDADES', 'DUPLICIDADE', 'OBRIGACOES'],
  ncm: ['NCM', 'TRIBUTARIO', 'OBRIGACOES'],
  grupo: ['GRUPOS_FINALIDADE'],
  finalidade: ['GRUPOS_FINALIDADE', 'TRIBUTARIO'],
};

export const camadasAtivas = (modulos: Json | null | undefined): Camada[] => CAMADAS.filter((c) => c !== 'ESTOQUE' || modulos?.conciliacao === true);

export function validarCamada(c: string): Camada {
  if (!(CAMADAS as readonly string[]).includes(c)) throw new BadRequestException('Camada inválida.');
  return c as Camada;
}

export const chaveCaso = (camada: string, tipo: string, itens: string[]) =>
  createHash('sha1').update([camada, tipo, ...[...itens].sort()].join('|')).digest('hex');

export const chaveConjunto = (ncm: unknown, finalidade: unknown) => (ncm && finalidade ? `${String(ncm)}|${String(finalidade)}` : null);

export const conflito = (mensagem = 'Este registro foi alterado por outra pessoa depois que você o abriu. Recarregue a tela e refaça a alteração.') =>
  new ConflictException({ statusCode: 409, codigo: 'CONFLITO_VERSAO', message: mensagem });

/** Exige que o cliente informe a versão que viu (bloqueio otimista). */
export function exigirVersao(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new BadRequestException('Informe a versão do registro que você está vendo (campo "versao").');
  return n;
}

/** `campos.nome` força o campo extra; sem prefixo, vale o nome (campo de topo se for um deles). Bloqueia nomes que mexem no protótipo. */
export function nomeDoCampo(bruto: string, estrito = true): { campo: string; extra: boolean } {
  const extra = bruto.startsWith('campos.');
  const campo = extra ? bruto.slice(7) : bruto;
  if ((estrito ? !/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(campo) : campo.length < 1 || campo.length > 160) || ['__proto__', 'constructor', 'prototype'].includes(campo)) throw new BadRequestException(`Nome de campo inválido: "${bruto}".`);
  return { campo, extra };
}

/** Aplica um campo ao `trabalho` do item. Devolve o valor anterior. */
export function aplicarCampo(trabalho: Json, campoBruto: string, valor: unknown, estrito = true): unknown {
  const { campo, extra } = nomeDoCampo(campoBruto, estrito);
  if (CAMPOS_PROIBIDOS.includes(campo)) throw new BadRequestException(`O campo "${campo}" não pode ser alterado por decisão.`);
  if (campo === 'finalidade' && valor != null && !(FINALIDADES as readonly string[]).includes(String(valor))) throw new BadRequestException(`Finalidade inválida: ${String(valor)}.`);
  if (!extra && (CAMPOS_TOPO as readonly string[]).includes(campo)) {
    const antes = trabalho[campo] ?? null;
    trabalho[campo] = valor ?? null;
    return antes;
  }
  const extras = { ...((trabalho.campos as Json) ?? {}) };
  const antes = extras[campo] ?? null;
  extras[campo] = valor ?? null;
  trabalho.campos = extras;
  return antes;
}

export function valorDoCampo(trabalho: Json, campoBruto: string): unknown {
  const { campo, extra } = nomeDoCampo(campoBruto, false);
  if (!extra && (CAMPOS_TOPO as readonly string[]).includes(campo)) return trabalho[campo] ?? null;
  return ((trabalho.campos as Json) ?? {})[campo] ?? null;
}

/** Colunas derivadas do `trabalho` (para filtro, grupo e conjunto). */
export function derivadosDoTrabalho(t: Json) {
  const tambem = Array.isArray(t.tambemUsadoComo) ? t.tambemUsadoComo : [];
  return {
    descricao: String(t.descricao ?? ''),
    grupo: t.grupo == null || t.grupo === '' ? null : String(t.grupo),
    finalidade: t.finalidade == null ? null : String(t.finalidade),
    tambem_usado_como: tambem as never,
    conjunto_chave: chaveConjunto(t.ncm, t.finalidade),
    ativo: typeof t.ativo === 'boolean' ? t.ativo : null,
  };
}

export const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function fatiar<T>(lista: T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n));
  return r;
}

export const TX_LONGA = { timeout: 300_000, maxWait: 15_000 };
