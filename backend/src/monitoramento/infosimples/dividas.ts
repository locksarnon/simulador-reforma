import type { Servico } from '../catalogo';
import type { Coluna, Resumo } from '../interpretar';
import { type ContextoInfosimples, servicoInfosimples, txt } from './base';

/**
 * Dívida ativa estadual e lista de devedores da PGFN pela Infosimples.
 * Conferido no catálogo oficial (https://infosimples.com/consultas/apis.json, 839 consultas, 13/11/2026):
 * - Dívida ativa estadual consultável só por CNPJ, sem login: MT (pge/mt/divida-ativa) e MA (sefaz/ma/certidao-divida-ativa).
 *   MS, GO e PA não têm consulta de dívida ativa; nelas só há a CND estadual (sefaz/<uf>/certidao-debitos), já usada nas certidões automáticas.
 * - Dívida ativa municipal: nenhuma prefeitura de MT, MS, GO, MA e PA tem a consulta (só a CND municipal, já nas certidões automáticas).
 * - CADIN federal: não há consulta na Infosimples (só os CADIN estaduais de SP, MG, PR e RS e o municipal de São Paulo).
 */

const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');

function exigirCnpj(c: ContextoInfosimples): string {
  const cnpj = so(c.cnpj);
  if (cnpj.length !== 14) throw new Error('Cadastre o CNPJ do cliente (14 dígitos) para consultar a dívida ativa.');
  return cnpj;
}

/** 1234.5 ou "R$ 1.234,56" → 1234.56; sem número → o texto como veio. */
function valor(v: unknown): number | string {
  if (typeof v === 'number') return v;
  const s = txt(v);
  if (!s) return '';
  const limpo = s.replace(/[^\d,.-]/g, '');
  const n = Number(/,\d{1,2}$/.test(limpo) ? limpo.replace(/\./g, '').replace(',', '.') : limpo.replace(/,/g, ''));
  return Number.isFinite(n) && /\d/.test(limpo) ? n : s;
}
const moeda = (v: number | string) => (typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : v);
const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);
/** Primeiro campo com valor cujo nome casa com o padrão. */
const campo = (o: Record<string, unknown>, re: RegExp) => { const k = Object.keys(o).find((x) => re.test(x) && txt(o[x])); return k ? o[k] : ''; };

const COLUNAS: Coluna[] = [
  { chave: 'numero', rotulo: 'Inscrição (CDA)' },
  { chave: 'orgao', rotulo: 'Órgão' },
  { chave: 'natureza', rotulo: 'Natureza' },
  { chave: 'placa', rotulo: 'Placa' },
  { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' },
  { chave: 'situacao', rotulo: 'Situação' },
  { chave: 'data', rotulo: 'Data da inscrição', tipo: 'data' },
];
/** Tabela com as colunas que têm algum valor (cada portal traz campos diferentes). */
function tabela(linhas: Record<string, unknown>[]) {
  const colunas = COLUNAS.filter((c) => linhas.some((l) => l[c.chave] !== '' && l[c.chave] !== undefined && l[c.chave] !== null));
  return { colunas, linhas };
}
const QUITADA = /quitad|liquidad|pag[oa]\b|extint|cancelad|baixad/i;

/** PGE-MT: lista de CDAs do CNPJ (número da CDA, placa quando é IPVA, situação e tipo de processo). */
export function lerDividaMt(data: Record<string, unknown>[]): Resumo {
  const d = data[0] ?? {};
  const linhas = data.flatMap((x) => lista(x.debitos)).map((b) => ({
    numero: txt(b.cda) || txt(campo(b, /inscricao|numero/i)), orgao: 'PGE-MT', natureza: txt(b.tipo_processo) || txt(campo(b, /natureza|tributo|tipo/i)),
    placa: txt(b.placa), valor: valor(campo(b, /^normalizado_valor|^valor|total/i)), situacao: txt(b.situacao), data: txt(campo(b, /data/i)),
  }));
  const ativas = linhas.filter((l) => !QUITADA.test(l.situacao));
  const paginas = Number(d.total_paginas) || 1;
  const devedor = { rotulo: 'Devedor', valor: txt(d.devedor) };
  const destaques = [
    devedor,
    { rotulo: 'Inscrições na consulta', valor: String(linhas.length) },
    { rotulo: 'Inscrições em aberto', valor: String(ativas.length) },
    { rotulo: 'Páginas no portal', valor: paginas > 1 ? `1 de ${paginas} (a consulta traz a primeira)` : '' },
  ].filter((x) => x.valor);
  if (!linhas.length) return { nivel: 'OK', titulo: 'Nada consta na dívida ativa do Estado de Mato Grosso.', destaques: devedor.valor ? [devedor] : [] };
  return {
    nivel: ativas.length ? 'CRITICO' : 'OK',
    titulo: ativas.length
      ? `${ativas.length === 1 ? '1 inscrição' : `${ativas.length} inscrições`} em dívida ativa no Estado de Mato Grosso.`
      : 'Sem inscrição em aberto na dívida ativa do Estado de Mato Grosso.',
    destaques,
    tabela: tabela(linhas),
  };
}

/** SEFAZ-MA: certidão de dívida ativa (negativa emitida = nada consta). */
export function lerDividaMa(data: Record<string, unknown>[]): Resumo {
  const d = data[0] ?? {};
  const negativa = d.conseguiu_emitir_certidao_negativa === true || /^(sim|true)$/i.test(txt(d.conseguiu_emitir_certidao_negativa));
  const validade = txt(d.validade_data);
  const destaques = [
    { rotulo: 'Certidão', valor: negativa ? 'Negativa de dívida ativa' : 'Negativa não emitida' },
    { rotulo: 'Código da certidão', valor: txt(d.certidao_codigo) },
    { rotulo: 'Emissão', valor: txt(d.emissao_data) },
    { rotulo: 'Validade', valor: validade },
    { rotulo: 'Mensagem da SEFAZ-MA', valor: txt(d.mensagem) },
  ].filter((x) => x.valor);
  return negativa
    ? { nivel: 'OK', titulo: `Nada consta na dívida ativa do Estado do Maranhão${validade ? `: certidão negativa válida até ${validade}` : ''}.`, destaques }
    : { nivel: 'CRITICO', titulo: 'A SEFAZ-MA não emitiu a certidão negativa de dívida ativa: há inscrição em dívida ativa do Estado do Maranhão.', destaques };
}

/** Rota da dívida ativa estadual por UF do cadastro. */
const ROTA_ESTADUAL: Record<string, string> = { MT: 'pge/mt/divida-ativa', MA: 'sefaz/ma/certidao-divida-ativa' };

/** Lista de devedores da PGFN (dívida ativa da União e do FGTS, como devedor principal, corresponsável ou solidário). */
export function lerDevedoresPgfn(data: Record<string, unknown>[]): Resumo {
  const d = data[0] ?? {};
  const linhas = lista(d.naturezas_debitos).flatMap((n) => {
    const natureza = txt(n.descricao) || txt(campo(n, /natureza|tipo/i));
    const debitos = lista(n.debitos);
    if (!debitos.length) return [{ numero: '', orgao: 'PGFN', natureza, placa: '', valor: valor(n.total), situacao: '', data: '' }];
    return debitos.map((b) => ({
      numero: txt(campo(b, /inscricao|numero|cda/i)), orgao: 'PGFN', natureza: txt(campo(b, /natureza|descricao|tipo|receita/i)) || natureza, placa: '',
      valor: valor(campo(b, /^normalizado_valor|^valor|total|saldo/i)), situacao: txt(campo(b, /situacao/i)), data: txt(campo(b, /data/i)),
    }));
  });
  const total = valor(d.total_divida);
  const consta = (typeof total === 'number' ? total > 0 : !!total) || linhas.length > 0;
  const nome = { rotulo: 'Nome', valor: txt(d.nome) };
  const destaques = [
    nome,
    { rotulo: 'Total inscrito', valor: moeda(total) },
    { rotulo: 'Tributário', valor: moeda(valor(d.total_tributario)) },
    { rotulo: 'Não tributário', valor: moeda(valor(d.total_nao_tributario)) },
  ].filter((x) => x.valor);
  if (!consta) return { nivel: 'OK', titulo: 'Não consta na lista de devedores da PGFN.', destaques: nome.valor ? [nome] : [] };
  return {
    nivel: 'CRITICO',
    titulo: `Consta na lista de devedores da PGFN${typeof total === 'number' && total > 0 ? `: ${moeda(total)} inscritos em dívida ativa da União` : ''}.`,
    destaques,
    tabela: linhas.length ? tabela(linhas) : undefined,
  };
}

export const servicos: Servico[] = [
  servicoInfosimples({
    chave: 'is-divida-ativa-estadual',
    rotulo: 'Dívida ativa estadual',
    grupo: 'situacao',
    descricao: 'Inscrições do CNPJ na dívida ativa do Estado (PGE-MT; certidão de dívida ativa da SEFAZ-MA).',
    ufs: ['MT', 'MA'],
    consulta: {
      rota: (c) => ROTA_ESTADUAL[String(c.uf ?? '').toUpperCase()] ?? null,
      parametros: (c) => ({ cnpj: exigirCnpj(c) }),
      ler: (data) => (data.some((x) => 'conseguiu_emitir_certidao_negativa' in x) ? lerDividaMa(data) : lerDividaMt(data)),
      semDados: (r) => ({ nivel: 'OK', titulo: 'Nada consta.', destaques: [{ rotulo: 'Resposta da origem', valor: r.code_message || 'sem registros' }] }),
    },
  }),
  servicoInfosimples({
    chave: 'is-pgfn-devedores',
    rotulo: 'Lista de devedores da PGFN',
    grupo: 'situacao',
    descricao: 'Presença do CNPJ na lista pública de devedores da PGFN (dívida ativa da União e do FGTS), com o total por natureza.',
    consulta: {
      rota: () => 'receita-federal/pgfn/devedores',
      parametros: (c) => ({ cnpj: exigirCnpj(c) }),
      ler: (data) => lerDevedoresPgfn(data),
      semDados: (r) => ({ nivel: 'OK', titulo: 'Nada consta.', destaques: [{ rotulo: 'Resposta da origem', valor: r.code_message || 'sem registros' }] }),
      adicional: 0.1,
    },
  }),
];
