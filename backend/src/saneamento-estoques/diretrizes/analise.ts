/**
 * Ligação das Diretrizes com o motor: as regras efetivas de cada grupo comandam as camadas. Sem regra aplicada, nada passa por aqui
 * (comportamento de antes, byte a byte). Com regras:
 * - NOMES_UNIDADES: a análise de sempre roda pelo parâmetro efetivo de cada aspecto (parametrosDaParticao), com conjuntos de unidade e grafia
 *   dominante sobre a base inteira (ver nomesUnidades); regra nova acrescenta DESCRICAO_FORA_PADRAO, TERMO_PROIBIDO, COMPONENTE_AUSENTE, UNIDADE_NAO_PERMITIDA,
 *   UNIDADE_FORA_CRITERIO, EXCEDE_LIMITE_DESTINO e LIMITE_NAO_CONFIRMADO. Regra convertida dos parâmetros antigos (legado) reproduz o de antes.
 * - QUALIDADE: a análise de sempre sobre todos os itens + ATRIBUTO_AUSENTE pela regra de ATRIBUTOS do grupo.
 * - NCM e TRIBUTARIO: a regra FISCAL do grupo decide se o item é validado (exceção justificada de NCM, validar NCM/cClassTrib).
 * Todo caso de grupo com regra leva a referência da regra na evidência ("Regra N01 — nome"). Nunca inventa componente, não preenche
 * atributo e nunca corta texto: excesso de limite sugere abreviação aprovada ou pede revisão. Funções puras.
 */
import { ev, justificar, montarResultado, rotuloItem, valorComum } from '../motor/base';
import { parametrosDe, type ContextoMotor, type ParametrosMotor } from '../motor/contexto';
import { novoCaso } from '../motor/dependencias';
import { padronizarDescricao } from '../motor/nomes-unidades';
import { GENERICOS, campoDe, palavras, semAcento, txt } from '../motor/texto';
import { chaveUnidade, classificarUnidade, grandezasNaDescricao, unidadeCanonica } from '../motor/unidades';
import type { AnalisadorCamada, Camada, CasoProposto, ContextoAnalise, ItemTrabalho, ResultadoCamada } from '../tipos';
import { canonico } from './conteudo-regra';
import { limitesEfetivos, parametrosDaParticao } from './parametros';
import { subgrupoDosCampos, type IndiceDiretrizes, type RegraResolvivel } from './resolucao';
import type { Aspecto, ComponenteNome, LinhaLimite, RegraAtributos, RegraFiscal, RegraLimites, RegraNomes, RegraUnidades } from './tipos';

type Parcial = Parameters<typeof novoCaso>[0];
/** Subgrupo do item (campos.subgrupo ou, em base antiga, a coluna extra "Subgrupo"). */
const subgrupoDe = (it: ItemTrabalho) => subgrupoDosCampos(it.campos);
export const referenciaRegra = (r: Pick<RegraResolvivel, 'codigo' | 'nome'>) => `${r.codigo} — ${r.nome}`;
const fundamentoRegra = (r: RegraResolvivel) => `Regra ${referenciaRegra(r)} (Diretrizes do projeto)`;
const comRegra = (c: CasoProposto, r: RegraResolvivel | undefined): CasoProposto => (r ? { ...c, evidencia: [...c.evidencia, ev('Regra', referenciaRegra(r))] } : c);

/** Aspecto que gerou cada tipo de caso de NOMES_UNIDADES (para a referência da regra). */
export function aspectoDoTipo(tipo: string): Aspecto {
  if (tipo.startsWith('UNIDADE_')) return 'UNIDADES';
  if (tipo === 'TAMANHO_EXCEDIDO' || tipo === 'EXCEDE_LIMITE_DESTINO' || tipo === 'LIMITE_NAO_CONFIRMADO') return 'LIMITES';
  return 'NOMES';
}

/** Até 5 exemplos (código e descrição) e a quantidade de itens do conjunto. */
const exemplos = (grupo: ItemTrabalho[]) => [
  ...(grupo.length > 1 ? [ev('Itens do conjunto', grupo.length)] : []),
  ...grupo.slice(0, 5).map((x) => ev(grupo.length > 1 ? 'Exemplo' : 'Item', `${rotuloItem(x)}: ${x.descricao ?? ''}`.slice(0, 300))),
];
const gruposDoConjunto = (grupo: ItemTrabalho[]) => {
  const g = [...new Set(grupo.map((i) => txt(i.grupo) || '(sem grupo)'))];
  return ev(g.length > 1 ? 'Grupos' : 'Grupo', g.length > 8 ? `${g.slice(0, 8).join(', ')} e mais ${g.length - 8}` : g.join(', '));
};

/** Junta itens por assinatura, na ordem de chegada (casos de conjunto com itens que nunca se repetem no mesmo tipo). */
function porAssinatura<T>(): { add(k: string, it: ItemTrabalho, info: T): void; lista(): { itens: ItemTrabalho[]; info: T }[] } {
  const m = new Map<string, { itens: ItemTrabalho[]; info: T }>();
  return {
    add(k, it, info) { const g = m.get(k); if (g) g.itens.push(it); else m.set(k, { itens: [it], info }); },
    lista: () => [...m.values()],
  };
}

// ── Texto: localizar expressões sem depender de acento e caixa ───────────────

type Token = { ini: number; fim: number; n: string };
const tokensDe = (s: string): Token[] => [...s.matchAll(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g)].map((m) => ({ ini: m.index!, fim: m.index! + m[0].length, n: semAcento(m[0]).toLowerCase() }));
const palavrasDaExpressao = (s: string): string[] => semAcento(s).toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Trechos [início, fim) do texto onde a expressão aparece como palavras inteiras (sem acento nem caixa; pontuação entre as palavras é livre). */
export function localizar(texto: string, expressao: string): [number, number][] {
  const alvo = palavrasDaExpressao(expressao);
  if (!alvo.length) {
    // Só símbolos (", //, ;, #): o próprio texto, sem caixa.
    const e = expressao.trim();
    const out: [number, number][] = [];
    if (!e) return out;
    const t = texto.toLowerCase(); const x = e.toLowerCase();
    for (let i = t.indexOf(x); i >= 0; i = t.indexOf(x, i + x.length)) out.push([i, i + x.length]);
    return out;
  }
  const toks = tokensDe(texto);
  const out: [number, number][] = [];
  for (let i = 0; i + alvo.length <= toks.length; i++) {
    let ok = true;
    for (let j = 0; j < alvo.length && ok; j++) {
      if (toks[i + j].n !== alvo[j]) ok = false;
      else if (j > 0 && toks[i + j].ini - toks[i + j - 1].fim > 3) ok = false;
    }
    if (ok) { out.push([toks[i].ini, toks[i + alvo.length - 1].fim]); i += alvo.length - 1; }
  }
  return out;
}
/** Troca os trechos (do fim para o começo, para os índices não mudarem). */
function trocar(texto: string, trechos: [number, number][], por: string): string {
  let s = texto;
  for (const [a, b] of [...trechos].sort((x, y) => y[0] - x[0])) s = s.slice(0, a) + por + s.slice(b);
  return s;
}
const contem = (texto: string, valor: string) => {
  const v = semAcento(valor).toLowerCase().replace(/[^a-z0-9]/g, '');
  return !!v && semAcento(texto).toLowerCase().replace(/[^a-z0-9]/g, '').includes(v);
};

/**
 * Abrevia com as abreviações APROVADAS até caber no limite (a que mais economiza primeiro). Nunca corta: se não couber, devolve `cabe: false`.
 * `protegidos` = valores que não se abreviam (componentes a preservar: referência, marca).
 */
export function abreviarAte(texto: string, limite: number, abreviacoes: RegraNomes['abreviacoes'], protegidos: string[] = []): { texto: string; cabe: boolean; usadas: string[] } {
  let s = texto; const usadas: string[] = [];
  const ordem = [...abreviacoes].sort((a, b) => (b.completa.length - b.abreviacao.length) - (a.completa.length - a.abreviacao.length) || (a.completa < b.completa ? -1 : 1));
  for (const a of ordem) {
    if (s.length <= limite) break;
    if (a.abreviacao.length >= a.completa.length) continue;
    const proibidos = protegidos.flatMap((p) => localizar(s, p));
    const trechos = localizar(s, a.completa).filter(([i, f]) => !proibidos.some(([pi, pf]) => i < pf && f > pi));
    if (!trechos.length) continue;
    s = trocar(s, trechos, a.abreviacao);
    usadas.push(`${a.completa} → ${a.abreviacao}`);
  }
  return { texto: s, cabe: s.length <= limite, usadas };
}

// ── Componentes do nome (só os verificáveis; nunca inventa) ──────────────────

const EMBALAGENS = new Set(['saco', 'sacos', 'saca', 'sacas', 'sc', 'caixa', 'caixas', 'cx', 'galao', 'galoes', 'gl', 'frasco', 'frascos', 'fr', 'balde', 'baldes', 'bd', 'lata', 'latas',
  'bombona', 'bombonas', 'bag', 'bigbag', 'pacote', 'pacotes', 'pct', 'fardo', 'fardos', 'fd', 'rolo', 'rolos', 'rl', 'kit', 'kits', 'tambor', 'tambores', 'ampola', 'ampolas', 'blister',
  'envelope', 'garrafa', 'garrafas', 'pote', 'potes', 'tubo', 'tubos', 'bisnaga', 'sache', 'saches', 'bobina', 'bobinas', 'jogo', 'jogos', 'par', 'pares']);
const MEDIDA_TOKEN = /^\d+([.,]\d+)?(kg|kgs|g|gr|mg|l|lt|lts|ml|m|mt|mm|cm|un|und|pc|pcs|pol|v|w|hp|cv|a|ah|x)?$/i;
/** Componentes que a análise consegue verificar no texto; os demais (característica, complemento) ficam para a revisão humana. */
export const COMPONENTES_VERIFICAVEIS: ComponenteNome[] = ['NOME', 'REFERENCIA', 'MARCA', 'APRESENTACAO'];

/** O componente está na descrição? null = não dá para saber pelo cadastro (não vira caso). */
export function componentePresente(it: ItemTrabalho, comp: ComponenteNome): boolean | null {
  const d = String(it.descricao ?? '');
  switch (comp) {
    case 'NOME': return palavras(d).some((p) => /[a-z]{3,}/.test(p) && !GENERICOS.has(p));
    case 'REFERENCIA': {
      const ref = txt(it.referencia) || txt(it.campos?.referencia);
      if (ref) return contem(d, ref);
      return d.split(/\s+/).some((t) => /\d/.test(t) && t.replace(/[^A-Za-z0-9]/g, '').length >= 3 && !MEDIDA_TOKEN.test(t.replace(/[^A-Za-z0-9.,]/g, '')));
    }
    case 'MARCA': {
      const marca = txt(it.fabricante) || txt(it.campos?.marca) || txt(it.campos?.Marca);
      return marca ? contem(d, marca) : null;
    }
    case 'APRESENTACAO': {
      const s = semAcento(d).toLowerCase();
      if (grandezasNaDescricao(d).length) return true;
      if (/(?<![a-z0-9])c\s*\/\s*\d+/.test(s) || /\d+\s*(un|und|unid|pc|pcs|pecas?)(?![a-z0-9])/.test(s)) return true;
      return (s.match(/[a-z0-9]+/g) ?? []).some((t) => EMBALAGENS.has(t));
    }
    default: return null;
  }
}
const ROTULO_COMPONENTE: Record<ComponenteNome, string> = { NOME: 'nome', REFERENCIA: 'referência', MARCA: 'marca', CARACTERISTICA: 'característica técnica', APRESENTACAO: 'apresentação', COMPLEMENTO: 'complemento' };

// ── NOMES (regra nova) ───────────────────────────────────────────────────────

/** Descrição como a regra manda, com o motivo de cada mudança (só reorganiza e normaliza o que existe; termo proibido só troca quando a regra dá a substituição). */
export function descricaoPelaRegra(desc: string, c: RegraNomes): { sugerida: string; motivos: string[]; trocouTermo: boolean } {
  const forma = padronizarDescricao(desc, { espacos: c.removerEspacosDuplicados, pontoColado: true, parenteses: true, unidadeColada: true, caixaAlta: false }, {});
  let s = forma.sugerida; const motivos = [...forma.motivos]; let trocouTermo = false;
  for (const t of c.termosProibidos) {
    if (t.substituicao == null) continue;
    const trechos = localizar(s, t.termo);
    if (!trechos.length) continue;
    s = trocar(s, trechos, t.substituicao); trocouTermo = true;
    motivos.push(`termo proibido: ${t.termo.toUpperCase()} → ${t.substituicao.toUpperCase()}`);
  }
  if (c.removerEspacosDuplicados) { const x = s.replace(/\s+/g, ' ').trim(); if (x !== s && !motivos.includes('espaços duplicados ou nas pontas')) motivos.push('espaços duplicados ou nas pontas'); s = x; }
  if (c.capitalizacao === 'MAIUSCULAS' && s !== s.toUpperCase()) { s = s.toUpperCase(); motivos.push('caixa alta'); }
  if (c.capitalizacao === 'MINUSCULAS' && s !== s.toLowerCase()) { s = s.toLowerCase(); motivos.push('caixa baixa'); }
  return { sugerida: s, motivos, trocouTermo };
}

function casosNomes(itens: ItemTrabalho[], r: RegraResolvivel): CasoProposto[] {
  const c = r.conteudo as RegraNomes;
  const out: CasoProposto[] = [];
  const termos = porAssinatura<string[]>();
  const componentes = porAssinatura<ComponenteNome[]>();
  const obrigatorios = c.obrigatorios.filter((o) => COMPONENTES_VERIFICAVEIS.includes(o));
  const semTroca = c.termosProibidos.filter((t) => t.substituicao == null);
  for (const it of itens) {
    const desc = String(it.descricao ?? '');
    if (!txt(desc)) continue; // descrição vazia é caso da Qualidade
    const p = descricaoPelaRegra(desc, c);
    if (p.sugerida !== desc) {
      out.push(novoCaso({
        camada: 'NOMES_UNIDADES', tipo: 'DESCRICAO_FORA_PADRAO', itens: [it.id], problema: `Descrição fora do padrão da regra ${r.codigo}: ${p.motivos.join('; ')}`,
        evidencia: [ev('Origem', 'Coluna da descrição na base importada'), ...p.motivos.map((m) => ev('Ajuste', m))], atual: { codigo: it.codigo, descricao: desc }, proposta: { descricao: p.sugerida },
        fundamento: fundamentoRegra(r),
        justificativa: justificar(p.trocouTermo ? 'A regra do grupo proíbe termos da descrição e dá a substituição; o resto só muda grafia, espaços e caixa.' : 'A forma da descrição segue a regra do grupo; só muda grafia, espaços e caixa, nada do conteúdo. Padronizar o nome não funde itens.', 'aprovar a descrição sugerida (a original fica no histórico).'),
        ...(p.trocouTermo ? {} : { afeta: [] }),
      }));
    }
    const achados = semTroca.filter((t) => localizar(desc, t.termo).length).map((t) => t.termo.toUpperCase());
    if (achados.length) termos.add(achados.join('\u0000'), it, achados);
    const faltam = obrigatorios.filter((o) => componentePresente(it, o) === false);
    if (faltam.length) componentes.add(faltam.join('|'), it, faltam);
  }
  for (const { itens: grupo, info } of termos.lista()) {
    out.push(novoCaso({
      camada: 'NOMES_UNIDADES', tipo: 'TERMO_PROIBIDO', itens: grupo.map((x) => x.id),
      problema: `Termo proibido pela regra ${r.codigo} na descrição: ${info.join(', ')}${grupo.length > 1 ? ` (${grupo.length} itens)` : ''}`,
      evidencia: [ev('Origem', 'Coluna da descrição na base importada'), ev('Termos', info.join(', ')), gruposDoConjunto(grupo), ...exemplos(grupo)],
      atual: grupo.length === 1 ? { codigo: grupo[0].codigo, descricao: grupo[0].descricao } : {}, fundamento: fundamentoRegra(r),
      justificativa: justificar('A regra do grupo proíbe estes termos e não define substituição: o motor não reescreve a descrição sozinho.', 'reescrever a descrição sem o termo (ou definir a substituição na regra e reaplicar).'),
    }));
  }
  for (const { itens: grupo, info } of componentes.lista()) {
    out.push(novoCaso({
      camada: 'NOMES_UNIDADES', tipo: 'COMPONENTE_AUSENTE', itens: grupo.map((x) => x.id),
      problema: `Componente obrigatório ausente na descrição (regra ${r.codigo}): ${info.map((x) => ROTULO_COMPONENTE[x]).join(', ')}${grupo.length > 1 ? ` (${grupo.length} itens)` : ''}`,
      evidencia: [
        ev('Origem', 'Descrição, referência e fabricante da base importada'), ev('Componentes obrigatórios da regra', c.obrigatorios.map((x) => ROTULO_COMPONENTE[x]).join(', ')),
        ev('Ausentes', info.map((x) => ROTULO_COMPONENTE[x]).join(', ')), ev('Verificação', 'indicação pelo texto da descrição (referência e marca conferidas com os campos do item quando preenchidos)'),
        gruposDoConjunto(grupo), ...exemplos(grupo),
      ],
      atual: grupo.length === 1 ? { codigo: grupo[0].codigo, descricao: grupo[0].descricao } : {}, fundamento: fundamentoRegra(r),
      justificativa: justificar('A regra do grupo exige estes componentes na descrição. O motor não inventa componente nem copia de item parecido.', 'completar a descrição com a informação do cliente (ficha técnica, nota de compra); item em que o componente não se aplica vira exceção.'),
    }));
  }
  return out;
}

// ── UNIDADES (regra nova) ────────────────────────────────────────────────────

const mesmaUnidade = (a: unknown, b: unknown) => chaveUnidade(a) === chaveUnidade(b) || (!!unidadeCanonica(a) && unidadeCanonica(a) === unidadeCanonica(b));
const permitida = (v: unknown, lista: string[]) => lista.some((u) => mesmaUnidade(u, v));

/** Fator da unidade do item para a unidade definida: conversão da regra (produto, depois grupo) ou medida exata da tabela; null = a informar. */
function fatorParaDefinida(it: ItemTrabalho, u: string, definida: string, c: RegraUnidades): { fator: number | null; situacao: 'DEFINIDO' | 'INFORMAR'; origem: string } {
  const conv = c.conversoes.find((x) => x.abrangencia === 'PRODUTO' && x.codigoProduto === it.codigo && mesmaUnidade(x.origem, u) && mesmaUnidade(x.destino, definida))
    ?? c.conversoes.find((x) => x.abrangencia === 'GRUPO' && mesmaUnidade(x.origem, u) && mesmaUnidade(x.destino, definida));
  if (conv) return { fator: conv.fator, situacao: 'DEFINIDO', origem: `conversão da regra (${conv.abrangencia === 'PRODUTO' ? `produto ${conv.codigoProduto}` : 'grupo'})` };
  const a = classificarUnidade(u); const b = classificarUnidade(definida);
  if (a?.origem === 'tabela' && b?.origem === 'tabela' && a.grandeza && a.grandeza === b.grandeza && a.fator != null && b.fator != null && ['padrao', 'menor', 'maior'].includes(a.nivel) && ['padrao', 'menor', 'maior'].includes(b.nivel)) {
    return { fator: Math.round((a.fator / b.fator) * 1e9) / 1e9, situacao: 'DEFINIDO', origem: 'medida exata (tabela de unidades)' };
  }
  return { fator: null, situacao: 'INFORMAR', origem: 'nenhuma: a informar' };
}

function casosUnidades(itens: ItemTrabalho[], r: RegraResolvivel): CasoProposto[] {
  const c = r.conteudo as RegraUnidades;
  const out: CasoProposto[] = [];
  const naoPermitidas = porAssinatura<{ compra: string | null; saida: string | null }>();
  const foraCriterio = porAssinatura<{ u: string; fator: number | null; situacao: string; origem: string }>();
  for (const it of itens) {
    const compra = txt(it.campos?.unidadeCompra) || null;
    const saida = txt(it.campos?.unidadeSaida) || txt(it.campos?.unidadeVenda) || null;
    const compraFora = compra && c.unidadesCompra.length && !permitida(compra, c.unidadesCompra) ? compra : null;
    const saidaFora = saida && c.unidadesSaida.length && !permitida(saida, c.unidadesSaida) ? saida : null;
    if (compraFora || saidaFora) naoPermitidas.add(`${compraFora ?? ''}\u0000${saidaFora ?? ''}`, it, { compra: compraFora, saida: saidaFora });
    const u = txt(it.unidade);
    if (c.criterioEstoque === 'DEFINIDA' && c.unidadeDefinida && u && !mesmaUnidade(u, c.unidadeDefinida)) {
      const f = fatorParaDefinida(it, u, c.unidadeDefinida, c);
      foraCriterio.add(`${u}\u0000${f.fator ?? ''}\u0000${f.situacao}\u0000${f.origem}`, it, { u, ...f });
    }
  }
  for (const { itens: grupo, info } of naoPermitidas.lista()) {
    const partes = [info.compra ? `compra em ${info.compra.toUpperCase()} (permitidas: ${c.unidadesCompra.join(', ')})` : null, info.saida ? `saída em ${info.saida.toUpperCase()} (permitidas: ${c.unidadesSaida.join(', ')})` : null].filter(Boolean);
    out.push(novoCaso({
      camada: 'NOMES_UNIDADES', tipo: 'UNIDADE_NAO_PERMITIDA', itens: grupo.map((x) => x.id),
      problema: `Unidade não permitida pela regra ${r.codigo}: ${partes.join('; ')}${grupo.length > 1 ? ` (${grupo.length} itens)` : ''}`,
      evidencia: [ev('Origem', 'Unidade de compra e de saída do item'), ...(info.compra ? [ev('Unidade de compra', info.compra)] : []), ...(info.saida ? [ev('Unidade de saída', info.saida)] : []), gruposDoConjunto(grupo), ...exemplos(grupo)],
      atual: { ...(info.compra ? { unidadeCompra: info.compra } : {}), ...(info.saida ? { unidadeSaida: info.saida } : {}) }, fundamento: fundamentoRegra(r),
      justificativa: justificar('A regra do grupo define as unidades de compra e de saída aceitas; outra unidade pede conversão conferida.', 'trocar para uma unidade permitida (com o fator de conversão) ou incluir a unidade na regra e reaplicar.'),
    }));
  }
  for (const { itens: grupo, info } of foraCriterio.lista()) {
    const proposta = { unidade: String(c.unidadeDefinida).trim().toUpperCase(), unidadeCompra: info.u, fatorConversao: info.fator, fatorSituacao: info.situacao, exigeFator: info.fator == null ? 'SIM' : 'NAO' };
    const atual: Record<string, string | number | null> = grupo.length === 1 ? { codigo: grupo[0].codigo, unidade: grupo[0].unidade } : { unidade: grupo[0].unidade };
    for (const k of ['unidadeCompra', 'fatorConversao']) {
      const v = valorComum(grupo.map((x) => (x.campos?.[k] ?? null) as string | number | null));
      if (v != null || (proposta as Record<string, unknown>)[k] != null) atual[k] = v;
    }
    out.push(novoCaso({
      camada: 'NOMES_UNIDADES', tipo: 'UNIDADE_FORA_CRITERIO', itens: grupo.map((x) => x.id),
      problema: `Unidade de estoque ${info.u.toUpperCase()} fora do critério da regra ${r.codigo} (unidade definida: ${proposta.unidade})${grupo.length > 1 ? ` (${grupo.length} itens)` : ''}`,
      evidencia: [ev('Origem', 'Coluna da unidade na base importada'), ev('Unidade atual', info.u), ev('Unidade definida para o grupo', proposta.unidade), ev('Evidência do fator', info.origem), gruposDoConjunto(grupo), ...exemplos(grupo)],
      atual, proposta, fundamento: fundamentoRegra(r),
      impactos: ['Unidades e fatores de conversão (SPED 0190, 0220) e itens dos documentos'],
      justificativa: justificar('A regra do grupo fixa a unidade de estoque; a atual passa a ser a de compra.', info.fator == null ? 'informar quantas unidades definidas há em cada unidade atual (conversão desconhecida é pendência: o motor não adivinha).' : 'conferir o fator e aprovar a conversão.'),
    }));
  }
  return out;
}

// ── LIMITES (regra nova) ─────────────────────────────────────────────────────

const ROTULO_CAMPO_ITEM: Record<LinhaLimite['campoItem'], string> = { descricao: 'Descrição', codigo: 'Código', unidade: 'Unidade', referencia: 'Referência', fabricante: 'Fabricante' };
/** Campos que aceitam abreviação aprovada; código, unidade e referência só por revisão (nunca se encurta identificador). */
const ABREVIAVEIS = new Set<LinhaLimite['campoItem']>(['descricao', 'fabricante']);

/** `nomesDe` = regra de NOMES de cada item (as abreviações aprovadas são as do grupo do item; o conjunto de pendências é da regra de limites). */
function casosLimites(itens: ItemTrabalho[], r: RegraResolvivel, nomesDe: (it: ItemTrabalho) => RegraResolvivel | undefined): CasoProposto[] {
  const c = r.conteudo as RegraLimites;
  const out: CasoProposto[] = [];
  const efetivos = limitesEfetivos(c.linhas);
  const abreviacoesDe = (it: ItemTrabalho) => { const nomes = nomesDe(it); return nomes && !nomes.legado ? (nomes.conteudo as RegraNomes).abreviacoes : []; };
  const pendentes = c.linhas.filter((l) => !l.confirmado || l.limite == null);
  const camposPendentes = new Set(pendentes.map((l) => l.campoItem));
  const comPendencia: ItemTrabalho[] = [];
  for (const it of itens) {
    const abreviacoes = abreviacoesDe(it);
    const proposta: Record<string, string> = {}; const evid = [] as ReturnType<typeof ev>[]; const campos: string[] = []; let pedeRevisao = false; let abreviou = false;
    for (const [campo, { limite, linha }] of efetivos) {
      const valor = String(campoDe(it, campo) ?? '');
      if (valor.length <= limite) continue;
      campos.push(ROTULO_CAMPO_ITEM[campo]);
      const protegidos = [...(linha.preservar.includes('REFERENCIA') ? [txt(it.referencia)] : []), ...(linha.preservar.includes('MARCA') ? [txt(it.fabricante)] : [])].filter(Boolean);
      for (const l of c.linhas.filter((x) => x.campoItem === campo && x.confirmado && x.limite != null && valor.length > (x.limite as number)).sort((a, b) => (a.limite as number) - (b.limite as number))) {
        evid.push(ev(`${l.destino} (${l.campo})`, `${valor.length} caracteres; limite ${l.limite} (${l.origem === 'LEIAUTE_OFICIAL' ? 'leiaute oficial' : l.origem === 'ERP' ? 'ERP' : 'cliente'}${l.referencia ? `: ${l.referencia}` : ''})`));
        if (ABREVIAVEIS.has(campo) && l.tratamento === 'SUGERIR_ABREVIACAO') {
          const v = abreviarAte(valor, l.limite as number, abreviacoes, protegidos);
          evid.push(ev(`Variante para ${l.destino}`, v.cabe ? `${v.texto} (${v.texto.length} caracteres; ${v.usadas.join('; ')})` : 'as abreviações aprovadas não bastam: revisar a descrição'));
        }
      }
      const v = ABREVIAVEIS.has(campo) && linha.tratamento === 'SUGERIR_ABREVIACAO' ? abreviarAte(valor, limite, abreviacoes, protegidos) : null;
      if (v?.cabe) { proposta[campo] = v.texto; abreviou = true; } else pedeRevisao = true;
    }
    if (campos.length) {
      out.push(novoCaso({
        camada: 'NOMES_UNIDADES', tipo: 'EXCEDE_LIMITE_DESTINO', itens: [it.id],
        problema: `Acima do limite de caracteres do destino (regra ${r.codigo}): ${campos.join(', ')}`,
        evidencia: [ev('Origem', 'Limites confirmados da regra (vale o menor)'), ...evid],
        atual: { codigo: it.codigo, ...Object.fromEntries([...efetivos.keys()].filter((k) => proposta[k] !== undefined).map((k) => [k, String(campoDe(it, k) ?? '')])) },
        proposta, fundamento: fundamentoRegra(r),
        justificativa: justificar(
          'O destino não aceita texto maior que o limite confirmado; o motor nunca corta o texto.',
          abreviou && !pedeRevisao ? 'aprovar a versão com as abreviações aprovadas da regra de nomes (a original fica no histórico).' : pedeRevisao && abreviou ? 'aprovar a abreviação sugerida e revisar à mão o campo que não coube.' : 'reescrever o campo dentro do limite (as abreviações aprovadas não bastam ou a regra pede revisão).',
        ),
        afeta: [],
      }));
    }
    if (pendentes.length && [...camposPendentes].some((k) => txt(campoDe(it, k)))) comPendencia.push(it);
  }
  if (comPendencia.length) {
    out.push(novoCaso({
      camada: 'NOMES_UNIDADES', tipo: 'LIMITE_NAO_CONFIRMADO', itens: comPendencia.map((x) => x.id),
      problema: `Limite de caracteres não confirmado na regra ${r.codigo}: ${pendentes.map((l) => `${l.destino} (${l.campo})`).join('; ')}`,
      evidencia: [ev('Origem', 'Linhas de limite da regra sem número confirmado'), ...pendentes.map((l) => ev(`${l.destino} (${l.campo})`, `${l.limite == null ? 'sem número' : `${l.limite} (não confirmado)`}${l.referencia ? `; fonte: ${l.referencia}` : ''}`)), gruposDoConjunto(comPendencia), ...exemplos(comPendencia)],
      fundamento: fundamentoRegra(r),
      justificativa: justificar('Sem o limite confirmado na fonte (leiaute oficial, Cadastro de ERPs ou cliente) não se afirma se o campo cabe; nenhum número genérico é usado.', 'confirmar o limite na fonte e registrar na regra; depois reaplicar.'),
    }));
  }
  return out;
}

// ── ATRIBUTOS (Qualidade) ────────────────────────────────────────────────────

const CAMPO_PADRAO: Record<string, string> = { MARCA: 'fabricante', REFERENCIA: 'referencia' };
const PADRAO_NA_DESCRICAO: Record<string, RegExp> = {
  CONCENTRACAO: /\d+([.,]\d+)?\s*(%|g\s*\/\s*(l|kg)|ml\s*\/\s*l|mg\s*\/\s*(l|kg)|ppm)/i,
  DIMENSAO: /\d+([.,]\d+)?\s*(x\s*\d+([.,]\d+)?\s*)*(mm|cm|m|pol|")(?![a-z])/i,
};
const valorDoCampo = (it: ItemTrabalho, nome: string): string => {
  const direto = campoDe(it, nome);
  if (direto != null && txt(direto)) return txt(direto);
  const k = Object.keys(it.campos ?? {}).find((x) => x.toLowerCase() === nome.toLowerCase());
  return k ? txt(it.campos[k]) : '';
};
/** O atributo consta? null = não verificável pelo cadastro (condição em texto, atributo sem campo nem padrão na descrição). */
export function atributoPresente(it: ItemTrabalho, a: RegraAtributos['atributos'][number]): { presente: boolean | null; onde: string } {
  const campo = a.campo || CAMPO_PADRAO[a.atributo] || null;
  const noCampo = (): boolean | null => (campo ? !!valorDoCampo(it, campo) : null);
  const naDescricao = (): boolean | null => {
    const d = String(it.descricao ?? '');
    if (a.atributo === 'APRESENTACAO') return componentePresente(it, 'APRESENTACAO');
    const re = PADRAO_NA_DESCRICAO[a.atributo];
    if (re) return re.test(semAcento(d));
    const v = campo ? valorDoCampo(it, campo) : '';
    return v ? contem(d, v) : null;
  };
  if (a.onde === 'CAMPO_PROPRIO') return { presente: noCampo(), onde: `campo ${campo}` };
  if (a.onde === 'DESCRICAO') return { presente: naDescricao(), onde: 'descrição' };
  const x = noCampo(); const y = naDescricao();
  return { presente: x === false || y === false ? false : x == null && y == null ? null : true, onde: `campo ${campo} e descrição` };
}

function casosAtributos(itens: ItemTrabalho[], r: RegraResolvivel): CasoProposto[] {
  const c = r.conteudo as RegraAtributos;
  const obrig = c.atributos.filter((a) => a.aplicabilidade === 'OBRIGATORIO');
  if (!obrig.length) return [];
  const conj = porAssinatura<string[]>();
  for (const it of itens) {
    const faltam = obrig.map((a) => ({ a, p: atributoPresente(it, a) })).filter((x) => x.p.presente === false).map((x) => `${x.a.atributo} (${x.p.onde})`);
    if (faltam.length) conj.add(faltam.join('|'), it, faltam);
  }
  return conj.lista().map(({ itens: grupo, info }) => novoCaso({
    camada: 'QUALIDADE', tipo: 'ATRIBUTO_AUSENTE', itens: grupo.map((x) => x.id),
    problema: `Atributo técnico exigido pela regra ${r.codigo} ausente: ${info.join(', ')}${grupo.length > 1 ? ` (${grupo.length} itens)` : ''}`,
    evidencia: [ev('Origem', 'Campos e descrição da base importada'), ev('Ausentes', info.join(', ')), gruposDoConjunto(grupo), ...exemplos(grupo), ev('Regra', referenciaRegra(r))],
    atual: grupo.length === 1 ? { codigo: grupo[0].codigo } : {}, fundamento: fundamentoRegra(r),
    justificativa: justificar('A regra do grupo exige estes atributos técnicos; sem eles a classificação e a comparação de itens ficam sem base. O motor não preenche atributo.', 'obter o atributo com o cliente (ficha técnica, rótulo, nota de compra) e completar o cadastro; o parecer da IA pode indicar de onde tirar, sem preencher.'),
  }));
}

// ── Montagem ─────────────────────────────────────────────────────────────────

function juntarSemDados(lista: (ResultadoCamada['semDados'])[]): ResultadoCamada['semDados'] {
  const v = lista.filter((x): x is NonNullable<ResultadoCamada['semDados']> => !!x);
  if (!v.length) return null;
  if (v.length === 1) return v[0];
  return { motivo: [...new Set(v.map((x) => x.motivo))].join('. '), itens: v.reduce((s, x) => s + x.itens, 0) };
}

/** Resultado final: casos em ordem estável; `semProblema` = os das partições/base menos os itens que entraram em caso. */
function montar(camada: Camada, itens: ItemTrabalho[], casos: CasoProposto[], semProblemaBase: Iterable<string>, semDados: ResultadoCamada['semDados']): ResultadoCamada {
  const r = montarResultado(camada, itens, casos, semDados);
  const emCaso = new Set<string>();
  for (const c of r.casos) for (const i of c.itens) emCaso.add(i);
  const vistos = new Set<string>(); const semProblema: string[] = [];
  for (const id of semProblemaBase) if (!emCaso.has(id) && !vistos.has(id)) { vistos.add(id); semProblema.push(id); }
  return { ...r, semProblema };
}

/** Parte dos parâmetros do motor que cada aspecto comanda na camada Nomes e unidades (o resto da camada não depende das regras). */
const PARAMETROS_DO_ASPECTO: Record<'NOMES' | 'UNIDADES' | 'LIMITES', (p: ParametrosMotor) => unknown> = {
  NOMES: (p) => ({ abreviacoesAprovadas: p.abreviacoesAprovadas ?? {}, padronizarCaixaAlta: p.padronizarCaixaAlta === true }),
  UNIDADES: (p) => p.politicaUnidade ?? {},
  LIMITES: (p) => p.limites ?? null,
};
const ASPECTOS_NU = ['NOMES', 'UNIDADES', 'LIMITES'] as const;

/** Referência da(s) regra(s) do aspecto dos itens do caso (uma regra: igual à de sempre; várias com os mesmos parâmetros: todas). */
function comRegras(c: CasoProposto, regraDoItem: Map<string, RegraResolvivel | undefined>): CasoProposto {
  const regras = [...new Map(c.itens.map((i) => regraDoItem.get(i)).filter((x): x is RegraResolvivel => !!x).map((x) => [x.id, x])).values()];
  if (!regras.length) return c;
  if (regras.length === 1) return comRegra(c, regras[0]);
  const refs = regras.map(referenciaRegra).sort();
  return { ...c, evidencia: [...c.evidencia, ev('Regra', refs.length > 3 ? `${refs.slice(0, 3).join('; ')} e mais ${refs.length - 3}` : refs.join('; '))] };
}

/**
 * Camada Nomes e unidades com as regras de NOMES, UNIDADES e LIMITES de cada grupo. A análise de sempre roda por PARÂMETRO EFETIVO de cada
 * aspecto (não pela combinação de regras): casos de nome por item usam os parâmetros de nome do item; casos de unidade (inclusive os de
 * conjunto) juntam só itens com a mesma política de unidade, com grafia dominante e nome padrão calculados sobre a base inteira; tamanho, os
 * limites do item. Assim uma regra de NOMES num grupo não mexe nos casos de unidade nem nos de outro grupo. Os casos das regras novas são
 * montados por regra (o conjunto de uma regra não se parte pelo que outras regras do item mandam).
 */
function nomesUnidades(base: AnalisadorCamada, itens: ItemTrabalho[], contexto: ContextoAnalise, indice: IndiceDiretrizes): ResultadoCamada {
  type Info = { it: ItemTrabalho; regras: Partial<Record<Aspecto, RegraResolvivel>>; produto: string | null };
  const infos: Info[] = itens.map((it) => {
    const rs = indice.resolver(it.grupo, subgrupoDe(it));
    const u = rs.UNIDADES;
    const produto = u && !u.legado && (u.conteudo as RegraUnidades).conversoes.some((c) => c.abrangencia === 'PRODUTO' && c.codigoProduto === it.codigo && mesmaUnidade(c.origem, it.unidade)) ? it.codigo : null;
    return { it, regras: { NOMES: rs.NOMES, UNIDADES: u, LIMITES: rs.LIMITES }, produto };
  });
  // Nenhum item com regra destes aspectos: a camada roda como sempre (mesmo objeto de resultado).
  if (infos.every((i) => !i.regras.NOMES && !i.regras.UNIDADES && !i.regras.LIMITES)) return base.analisar(itens, contexto);
  const baseParametros = parametrosDe(contexto);
  const memo = new Map<string, ParametrosMotor>();
  const parametrosDe_ = (i: Info) => {
    const k = [i.regras.NOMES?.id ?? '', i.regras.UNIDADES?.id ?? '', i.regras.LIMITES?.id ?? '', i.produto ?? ''].join('\u0000');
    let p = memo.get(k);
    if (!p) { p = parametrosDaParticao(baseParametros, i.regras, i.produto); memo.set(k, p); }
    return p;
  };
  // Partições por aspecto: itens com o mesmo parâmetro efetivo daquele aspecto.
  const particoes = Object.fromEntries(ASPECTOS_NU.map((a) => {
    const m = new Map<string, { itens: ItemTrabalho[]; parametros: ParametrosMotor }>();
    for (const i of infos) {
      const p = parametrosDe_(i);
      const k = canonico(PARAMETROS_DO_ASPECTO[a](p));
      const g = m.get(k);
      if (g) g.itens.push(i.it); else m.set(k, { itens: [i.it], parametros: p });
    }
    return [a, [...m.values()]];
  })) as Record<(typeof ASPECTOS_NU)[number], { itens: ItemTrabalho[]; parametros: ParametrosMotor }[]>;
  const regraDoItem = Object.fromEntries(ASPECTOS_NU.map((a) => [a, new Map(infos.map((i) => [i.it.id, i.regras[a]]))])) as Record<(typeof ASPECTOS_NU)[number], Map<string, RegraResolvivel | undefined>>;
  const casos: CasoProposto[] = []; const semDados: ResultadoCamada['semDados'][] = [];
  const guardar = (c: CasoProposto) => {
    const a = aspectoDoTipo(c.tipo) as (typeof ASPECTOS_NU)[number];
    const n = regraDoItem.NOMES.get(c.itens[0]);
    if (c.tipo === 'DESCRICAO_FORA_DO_PADRAO' && n && !n.legado) return; // a regra nova do item dá a forma (DESCRICAO_FORA_PADRAO)
    casos.push(comRegras(c, regraDoItem[a]));
  };
  const universo = itens;
  if (ASPECTOS_NU.every((a) => particoes[a].length === 1)) {
    // Mesmos parâmetros para todos os itens: uma só passada (o caso de sempre, inclusive regra convertida "Todos os grupos").
    const r = base.analisar(itens, { ...contexto, parametros: particoes.NOMES[0].parametros, universoUnidades: universo } as ContextoMotor);
    for (const c of r.casos) guardar(c);
    semDados.push(r.semDados);
  } else {
    for (const a of ASPECTOS_NU) {
      for (const p of particoes[a]) {
        const r = base.analisar(p.itens, { ...contexto, parametros: p.parametros, universoUnidades: universo } as ContextoMotor);
        for (const c of r.casos) if (aspectoDoTipo(c.tipo) === a) guardar(c);
        if (a === 'NOMES') semDados.push(r.semDados);
      }
    }
  }
  // Casos das regras novas, por regra.
  const porRegra = (a: Aspecto) => {
    const m = new Map<string, { regra: RegraResolvivel; itens: ItemTrabalho[] }>();
    for (const i of infos) { const r = i.regras[a]; if (!r || r.legado) continue; const g = m.get(r.id); if (g) g.itens.push(i.it); else m.set(r.id, { regra: r, itens: [i.it] }); }
    return [...m.values()];
  };
  for (const { regra, itens: lista } of porRegra('NOMES')) for (const c of casosNomes(lista, regra)) casos.push(comRegra(c, regra));
  for (const { regra, itens: lista } of porRegra('UNIDADES')) for (const c of casosUnidades(lista, regra)) casos.push(comRegra(c, regra));
  for (const { regra, itens: lista } of porRegra('LIMITES')) for (const c of casosLimites(lista, regra, (it) => regraDoItem.NOMES.get(it.id))) casos.push(comRegra(c, regra));
  return montar('NOMES_UNIDADES', itens, casos, itens.map((i) => i.id), juntarSemDados(semDados));
}

/**
 * Tipos de caso que uma regra do aspecto pode mudar, por camada (para a prévia "itens que podem mudar" fechar só pelos conjuntos que a
 * regra mexe). Nomes e unidades: o aspecto de cada tipo; Qualidade: só ATRIBUTO_AUSENTE; NCM e Tributário: todos.
 */
export function tipoMudaComAspecto(aspecto: Aspecto, camada: string, tipo: string): boolean {
  if (camada === 'NOMES_UNIDADES') return aspectoDoTipo(tipo) === aspecto;
  if (camada === 'QUALIDADE') return aspecto === 'ATRIBUTOS' && tipo === 'ATRIBUTO_AUSENTE';
  return aspecto === 'FISCAL' && (camada === 'NCM' || camada === 'TRIBUTARIO');
}

function qualidade(base: AnalisadorCamada, itens: ItemTrabalho[], contexto: ContextoAnalise, indice: IndiceDiretrizes): ResultadoCamada {
  const r = base.analisar(itens, contexto);
  const porRegra = new Map<string, { regra: RegraResolvivel; itens: ItemTrabalho[] }>();
  for (const it of itens) {
    const a = indice.resolver(it.grupo, subgrupoDe(it)).ATRIBUTOS;
    if (!a) continue;
    const g = porRegra.get(a.id);
    if (g) g.itens.push(it); else porRegra.set(a.id, { regra: a, itens: [it] });
  }
  const extras: CasoProposto[] = [];
  for (const { regra, itens: lista } of porRegra.values()) for (const c of casosAtributos(lista, regra)) extras.push(c);
  if (!extras.length) return r;
  return montar('QUALIDADE', itens, [...r.casos, ...extras], r.semProblema, r.semDados);
}

/** O item fica fora da validação de NCM pela regra FISCAL do grupo? Devolve a justificativa. */
export function foraDoNcm(it: ItemTrabalho, f: RegraFiscal): string | null {
  if (!f.validarNcm) return 'a regra fiscal do grupo não valida NCM';
  const cod = txt(it.codigo).toLowerCase(); const grupo = txt(it.grupo).replace(/\s+/g, ' ').toLowerCase();
  const x = f.excecoesNcm.find((e) => { const a = txt(e.alvo).replace(/\s+/g, ' ').toLowerCase(); return a === cod || (!!grupo && a === grupo); });
  return x ? x.justificativa : null;
}

function fiscal(base: AnalisadorCamada, itens: ItemTrabalho[], contexto: ContextoAnalise, indice: IndiceDiretrizes): ResultadoCamada {
  const camada = base.camada;
  const regraDe = new Map<string, RegraResolvivel>();
  const dentro: ItemTrabalho[] = []; const fora: string[] = [];
  for (const it of itens) {
    const f = indice.resolver(it.grupo, subgrupoDe(it)).FISCAL;
    if (f) regraDe.set(it.id, f);
    const conteudo = f?.conteudo as RegraFiscal | undefined;
    const excluido = conteudo && (camada === 'NCM' ? foraDoNcm(it, conteudo) != null : camada === 'TRIBUTARIO' ? !conteudo.validarCClassTrib : false);
    if (excluido) fora.push(it.id); else dentro.push(it);
  }
  if (!regraDe.size) return base.analisar(itens, contexto);
  const r = dentro.length ? base.analisar(dentro, contexto) : { camada, analisados: 0, semDados: null, casos: [], semProblema: [] };
  const casos = r.casos.map((c) => {
    const codigos = [...new Set(c.itens.map((i) => regraDe.get(i)).filter((x): x is RegraResolvivel => !!x).map((x) => referenciaRegra(x)))];
    return codigos.length ? { ...c, evidencia: [...c.evidencia, ev('Regra', codigos.length > 3 ? `${codigos.slice(0, 3).join('; ')} e mais ${codigos.length - 3}` : codigos.join('; '))] } : c;
  });
  // Item fora da validação pela regra (exceção justificada ou validação desligada): "sem problema" nesta camada, pela regra.
  return { camada, analisados: itens.length, semDados: r.semDados, casos, semProblema: [...r.semProblema, ...fora] };
}

/** Envolve o analisador da camada com as regras aplicadas do projeto. Camada sem aspecto (Identificação, Duplicidade...) passa direto. */
export function envolverComDiretrizes(base: AnalisadorCamada, indice: IndiceDiretrizes): AnalisadorCamada {
  if (!indice.regras.length) return base;
  switch (base.camada) {
    case 'NOMES_UNIDADES': return { camada: base.camada, analisar: (itens, ctx) => nomesUnidades(base, itens, ctx, indice) };
    case 'QUALIDADE': return { camada: base.camada, analisar: (itens, ctx) => qualidade(base, itens, ctx, indice) };
    case 'NCM': case 'TRIBUTARIO': return { camada: base.camada, analisar: (itens, ctx) => fiscal(base, itens, ctx, indice) };
    default: return base;
  }
}
