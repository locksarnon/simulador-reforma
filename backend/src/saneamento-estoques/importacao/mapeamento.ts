import { simplificar } from './normalizacao';
import { CAMPOS_BASE, CAMPOS_OBRIGATORIOS, ROTULO_CAMPO, type CampoBase, type Certeza, type Mapeamento, type SemanticaAtivo, type SugestaoColuna, type SugestaoMapeamento } from './tipos';

/**
 * Nomes de cabeçalho (já simplificados: sem acento, minúsculos, só letras e números) que cada campo costuma ter, em português e nos
 * ERPs: SAP B1 (OITM: ItemCode, ItemName, InvntryUom, ItmsGrpNam, OnHand, frozenFor, LastPurDat), Protheus (B1_COD, B1_DESC, B1_UM,
 * B1_POSIPI, B1_GRUPO, B1_MSBLQL, B1_UCOM, B1_FILIAL, B1_LOCPAD) e Datasul/TOTVS (it-codigo, desc-item, un, class-fiscal, ge-codigo, cod-estabel).
 * A ordem da lista é a preferência quando duas colunas casam com o mesmo campo.
 */
export const SINONIMOS: Record<CampoBase, string[]> = {
  codigo: ['codigo', 'codigodoproduto', 'codigoproduto', 'codigodoitem', 'codigoitem', 'itemcode', 'b1cod', 'itcodigo', 'cod', 'codproduto', 'codprod', 'coditem',
    'material', 'sku', 'codigointerno', 'numerodoitem', 'numeroitem', 'matnr'],
  descricao: ['descricao', 'descricaodoproduto', 'descricaoproduto', 'descricaodoitem', 'descricaoitem', 'itemname', 'b1desc', 'descitem', 'descproduto', 'descrproduto',
    'descrprod', 'desc', 'denominacao', 'nome', 'nomedoproduto', 'textobreve', 'descricaomaterial', 'produto'],
  // O código da unidade (UN, KG, L: até 6 caracteres, como no SPED) vem antes do nome ("UNIDADE", "QUILOGRAMA").
  unidade: ['codigodaunidadedemedida', 'codigodaunidadedemedidadeestoque', 'codigounidademedida', 'codigodaunidade', 'codunidade', 'codum', 'uomcode',
    'unidadedemedidadeestoque', 'unidademedidaestoque', 'unidadedeestoque', 'invntryuom', 'unidade', 'unidademedida', 'unidadedemedida', 'un', 'um', 'unid', 'b1um', 'salunitmsr'],
  ncm: ['ncm', 'codigoncm', 'codncm', 'ncmcode', 'b1posipi', 'posipi', 'classificacaofiscal', 'classfiscal', 'steuc', 'nbm', 'ncmsh'],
  grupo: ['grupodoproduto', 'grupoproduto', 'grupo', 'descricaodogrupodeitens', 'descricaogrupodeitens', 'itmsgrpnam', 'grupodeitens', 'itmsgrpcod', 'b1grupo', 'gecodigo', 'familia', 'categoria'],
  ativo: ['ativo', 'itemativo', 'ativoinativo', 'status', 'situacao', 'validfor', 'bloqueado', 'inativo', 'frozenfor', 'b1msblql', 'bloqueio'],
  saldo: ['saldoemestoque', 'saldoestoque', 'saldo', 'quantidadeemestoque', 'qtdeemestoque', 'qtdemestoque', 'estoqueatual', 'onhand', 'b2qatu', 'qatu', 'estoque', 'quantidade', 'qtd'],
  ultimaMovimentacao: ['ultimamovimentacao', 'dataultimamovimentacao', 'dtultimamovimentacao', 'ultimomovimento', 'datamovimento', 'dtmovimento', 'ultmov', 'dtultmov',
    'dataultimaentrada', 'dataultimasaida', 'dataultimacompra', 'ultimacompra', 'dtultcompra', 'lastpurdat', 'b1ucom', 'dataultimavenda', 'ultimavenda', 'dtultvenda'],
  fabricante: ['fabricante', 'firmname', 'b1fabric', 'fabric', 'manufacturer', 'marca'],
  referencia: ['referencia', 'codigoreferencia', 'codref', 'ref', 'suppcatnum', 'numerocatalogo', 'codigofabricante', 'partnumber', 'pn'],
  estabelecimento: ['estabelecimento', 'codestabel', 'codigodoestabelecimento', 'estab', 'filial', 'b1filial', 'deposito', 'codigodeposito', 'whscode', 'armazem', 'b1locpad'],
  finalidade: ['finalidade', 'finalidadedoitem', 'usodoitem', 'usoitem'],
  // Opcional (Diretrizes: regra por grupo e subgrupo). Vai para `campos.subgrupo` do item.
  subgrupo: ['subgrupo', 'subgrupodoproduto', 'subgrupoproduto', 'subgrupodeitens', 'subfamilia', 'subcategoria', 'b1subgrupo', 'subgrp'],
};

/** Casamento aproximado (certeza MÉDIA): padrão que o nome deve ter e, se houver, o que o desqualifica. */
const APROXIMADOS: Partial<Record<CampoBase, { tem: RegExp; nao?: RegExp }>> = {
  descricao: { tem: /^descri/, nao: /grupo|unid|ncm|famil|conta|fiscal|tribut|classe|barras/ },
  ncm: { tem: /ncm/, nao: /descri|desc/ },
  unidade: { tem: /^unid|^cod(igo)?(da)?unid/, nao: /compra|venda|embalagem|negocio/ },
  grupo: { tem: /^grupo/, nao: /contabil|conta|tribut/ },
  ultimaMovimentacao: { tem: /ultim.*(mov|compra|venda|entrada|saida)|(mov|compra|venda|entrada|saida).*ultim|^dtult|^dataultim/ },
  fabricante: { tem: /fabric/, nao: /codigo|cod$/ },
  // "Depósito Última Compra", "Depósito padrão": é onde o item foi comprado ou costuma entrar, não o estabelecimento do item; sugerir dividiria o
  // mesmo item por depósito.
  estabelecimento: { tem: /^(estab|deposito|filial)/, nao: /ultim|compra|venda|mov|padrao/ },
  finalidade: { tem: /finalid/ },
  subgrupo: { tem: /^sub(grupo|famil|categ)/ },
};

/** Cabeçalho que indica coluna de BLOQUEIO (S = bloqueado) em vez de "ativo". */
const BLOQUEIO = /bloq|frozen|inativ|msblql/;

type Candidato = { indice: number; campo: CampoBase; certeza: Certeza; rank: number; motivo: string };

/** Maior tamanho de unidade que o leiaute oficial aceita (0190 UNID, uCom e uTrib da NF-e: 6 caracteres). */
export const MAX_CARACTERES_UNIDADE = 6;
/** Quantos valores de exemplo cada coluna mostra no mapeamento. */
const MAX_EXEMPLOS = 3;

/** Valores distintos e não vazios de cada coluna: os das primeiras linhas (`amostra`) e, na falta, o primeiro valor da coluna (`exemplos`). */
function valoresPorColuna(largura: number, exemplos: string[], amostra: string[][]): string[][] {
  return Array.from({ length: largura }, (_, i) => {
    const vistos = new Set<string>();
    for (const l of amostra) { const t = String(l[i] ?? '').trim(); if (t) vistos.add(t); }
    const primeiro = String(exemplos[i] ?? '').trim();
    if (primeiro) vistos.add(primeiro);
    return [...vistos];
  });
}

/**
 * Colunas do export do ERP selecionado no projeto (Cadastro de ERPs, conhecimento COLUNA_EXPORT): campo → cabeçalhos. Casam antes de tudo
 * (certeza ALTA), porque vêm do perfil do ERP; sem perfil, vale só o nome do cabeçalho.
 */
export type ColunasDoErp = { erp: string; colunas: Partial<Record<string, string[]>> };

function candidatos(indice: number, nome: string, doErp?: ColunasDoErp): Candidato[] {
  const s = simplificar(nome);
  if (!s) return [];
  const lista: Candidato[] = [];
  for (const campo of CAMPOS_BASE) {
    const posErp = doErp?.colunas[campo]?.findIndex((c) => simplificar(c) === s) ?? -1;
    // Do perfil do ERP: antes de tudo, na ordem do perfil (o código da unidade antes do nome).
    if (posErp >= 0) { lista.push({ indice, campo, certeza: 'ALTA', rank: posErp - 100, motivo: `"${nome}" é a coluna de ${ROTULO_CAMPO[campo].toLowerCase()} no export do ${doErp!.erp} (Cadastro de ERPs)` }); continue; }
    const rank = SINONIMOS[campo].indexOf(s);
    if (rank >= 0) { lista.push({ indice, campo, certeza: 'ALTA', rank, motivo: `o nome "${nome}" é um nome conhecido de ${ROTULO_CAMPO[campo].toLowerCase()}` }); continue; }
    const ap = APROXIMADOS[campo];
    if (ap && ap.tem.test(s) && !(ap.nao && ap.nao.test(s))) lista.push({ indice, campo, certeza: 'MEDIA', rank: 99, motivo: `o nome "${nome}" lembra ${ROTULO_CAMPO[campo].toLowerCase()}` });
  }
  return lista;
}

/**
 * Sugere o mapeamento coluna → campo pelo NOME do cabeçalho. Cada campo recebe no máximo uma coluna e cada coluna no máximo um campo; certeza ALTA
 * (nome conhecido) vence MÉDIA (nome parecido). Colunas sem campo ficam com `campo: null` e viram `campos`. `exemplos` (primeiro valor não vazio de
 * cada coluna, vindo de `lerPrevia`) e `amostra` (as primeiras linhas) mostram ao consultor até 3 valores por coluna. Campo obrigatório sem coluna
 * aparece em `faltando`.
 * Unidade: havendo uma coluna com o código (todos os valores com até 6 caracteres, "UN") e outra com o nome ("UNIDADE", "QUILOGRAM"), vale a do
 * código, a que cabe no 0190 do SPED e na NF-e; a do nome vira campo adicional.
 */
export function sugerirMapeamento(cabecalho: string[], exemplos: string[] = [], doErp?: ColunasDoErp, amostra: string[][] = []): SugestaoMapeamento {
  const valores = valoresPorColuna(cabecalho.length, exemplos, amostra);
  const longa = (i: number) => valores[i].some((v) => v.length > MAX_CARACTERES_UNIDADE);
  let todos = cabecalho.flatMap((nome, i) => candidatos(i, nome, doErp));
  const unidades = todos.filter((c) => c.campo === 'unidade');
  if (unidades.some((c) => valores[c.indice].length && !longa(c.indice))) todos = todos.filter((c) => c.campo !== 'unidade' || !longa(c.indice));
  todos.sort((a, b) => (a.certeza === b.certeza ? 0 : a.certeza === 'ALTA' ? -1 : 1) || a.rank - b.rank || a.indice - b.indice || CAMPOS_BASE.indexOf(a.campo) - CAMPOS_BASE.indexOf(b.campo));
  const mapeamento: Mapeamento = {};
  const usadas = new Set<number>();
  const escolha = new Map<number, Candidato>();
  for (const c of todos) {
    if (mapeamento[c.campo] != null || usadas.has(c.indice)) continue;
    mapeamento[c.campo] = c.indice; usadas.add(c.indice); escolha.set(c.indice, c);
  }
  const colunas: SugestaoColuna[] = cabecalho.map((nome, indice) => {
    const c = escolha.get(indice);
    return { indice, nome, exemplo: exemplos[indice] ?? '', exemplos: valores[indice].slice(0, MAX_EXEMPLOS), campo: c?.campo ?? null, certeza: c?.certeza ?? null, motivo: c?.motivo ?? 'sem campo correspondente: entra como campo adicional' };
  });
  const semanticaAtivo: SemanticaAtivo = mapeamento.ativo != null && BLOQUEIO.test(simplificar(cabecalho[mapeamento.ativo])) ? 'BLOQUEADO' : 'ATIVO';
  const faltando = CAMPOS_OBRIGATORIOS.filter((c) => mapeamento[c] == null);
  return { colunas, mapeamento, semanticaAtivo, faltando };
}

/**
 * Aplica as correções do consultor sobre o mapeamento sugerido. `correcoes[campo] = índice` escolhe a coluna; `null` tira o campo.
 * Se a coluna escolhida já era de outro campo, esse outro campo fica sem coluna (uma coluna não alimenta dois campos).
 */
export function corrigirMapeamento(base: Mapeamento, correcoes: Mapeamento): Mapeamento {
  const r: Mapeamento = { ...base };
  for (const campo of CAMPOS_BASE) {
    if (!(campo in correcoes)) continue;
    const v = correcoes[campo];
    if (v == null) { r[campo] = null; continue; }
    for (const outro of CAMPOS_BASE) if (outro !== campo && r[outro] === v) r[outro] = null;
    r[campo] = v;
  }
  return r;
}

/** Erros que impedem importar (lista vazia = pode seguir): obrigatório sem coluna, índice fora da planilha, coluna usada em dois campos. */
export function validarMapeamento(m: Mapeamento, totalColunas: number): string[] {
  const erros: string[] = [];
  for (const c of CAMPOS_OBRIGATORIOS) if (m[c] == null) erros.push(`Escolha a coluna de ${ROTULO_CAMPO[c].toLowerCase()}.`);
  const vistos = new Map<number, CampoBase>();
  for (const campo of CAMPOS_BASE) {
    const v = m[campo];
    if (v == null) continue;
    if (!Number.isInteger(v) || v < 0 || v >= totalColunas) { erros.push(`A coluna escolhida para ${ROTULO_CAMPO[campo].toLowerCase()} não existe na planilha.`); continue; }
    const outro = vistos.get(v);
    if (outro) erros.push(`A mesma coluna foi escolhida para ${ROTULO_CAMPO[outro].toLowerCase()} e para ${ROTULO_CAMPO[campo].toLowerCase()}.`);
    else vistos.set(v, campo);
  }
  return erros;
}
