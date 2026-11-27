/**
 * "O que foi considerado": catálogo dos critérios de cada camada de análise, em português simples para o cliente. É a FONTE ÚNICA: a tela
 * (aba Análise de cada fase, GET projetos/:id/criterios), o motor (valores ajustados) e a política (seção "Critérios das análises") leem daqui.
 *
 * Cada critério descreve o que o motor realmente faz (motor/*.ts e fiscal/*.ts). Os que têm `parametro` podem ser ajustados no projeto: o valor
 * fica em `SanProjeto.parametros.criterios[camada][chave]` e o motor o lê por `valorCriterio`. Os de `origem` DIRETRIZES ou CONFIGURACAO são
 * editados lá (a tela só leva até a aba certa). Funções puras, sem banco.
 */
import { CAMADAS, type Camada } from '../tipos';

export type TipoParametro = 'numero' | 'percentual' | 'data' | 'booleano' | 'lista';
export type ParametroCriterio = {
  chave: string;
  tipo: TipoParametro;
  padrao: number | boolean | string;
  min?: number;
  max?: number;
  /** Texto curto depois do número ("%", "itens"). */
  unidade?: string;
  /** Só para `lista`. */
  opcoes?: { valor: string; rotulo: string }[];
  /** Explicação em uma frase (dica na tela e regra do prompt da IA). */
  ajuda: string;
};
export type Criterio = {
  id: string;
  camada: Camada;
  texto: string;
  parametro?: ParametroCriterio;
  /** Quem define o valor: as Diretrizes do projeto ou a Configuração (corte de movimentação). A tela leva até lá. */
  origem?: 'DIRETRIZES' | 'CONFIGURACAO';
};

const DIR = 'DIRETRIZES' as const;

export const CATALOGO_CRITERIOS: Criterio[] = [
  // ── Identificação ──
  { id: 'id-ausente', camada: 'IDENTIFICACAO', texto: 'Item sem código' },
  { id: 'id-repetido', camada: 'IDENTIFICACAO', texto: 'O mesmo código repetido no mesmo estabelecimento' },
  { id: 'id-formato', camada: 'IDENTIFICACAO', texto: 'Código fora do formato ou que difere de outro só por zeros à esquerda' },
  { id: 'id-antigo', camada: 'IDENTIFICACAO', texto: 'Código antigo ainda em uso' },
  { id: 'id-descricoes', camada: 'IDENTIFICACAO', texto: 'O mesmo código com descrições diferentes em estabelecimentos diferentes' },
  { id: 'id-estabelecimento', camada: 'IDENTIFICACAO', texto: 'Estabelecimento em branco, quando o projeto exige estabelecimento' },

  // ── Qualidade ──
  { id: 'q-corte', camada: 'QUALIDADE', origem: 'CONFIGURACAO', texto: 'Corte de movimentação: item ativo sem movimento desde esta data e sem saldo é proposto para inativar; com saldo, pede regularizar o saldo antes' },
  { id: 'q-saldo', camada: 'QUALIDADE', texto: 'Saldo negativo ou ilegível' },
  { id: 'q-inativo', camada: 'QUALIDADE', texto: 'Item inativo que ainda tem saldo ou uso' },
  { id: 'q-data', camada: 'QUALIDADE', texto: 'Data da última movimentação em branco ou ilegível' },
  { id: 'q-descricao', camada: 'QUALIDADE', texto: 'Descrição que não basta para identificar o item' },
  { id: 'q-unidade', camada: 'QUALIDADE', texto: 'Unidade em branco ou que não combina com a medida escrita na descrição' },
  { id: 'q-campos', camada: 'QUALIDADE', texto: 'Campos que o projeto definiu como obrigatórios e estão em branco' },

  // ── Duplicidades ──
  {
    id: 'dup-similaridade', camada: 'DUPLICIDADE', texto: 'Similaridade mínima para indicar duplicidade',
    parametro: { chave: 'similaridadeMinima', tipo: 'percentual', padrao: 78, min: 70, max: 100, unidade: '%', ajuda: 'Pontuação de semelhança entre as descrições (não é probabilidade). Mais alta: menos casos, só os muito parecidos. Mais baixa: mais casos para conferir.' },
  },
  {
    id: 'dup-embalagens', camada: 'DUPLICIDADE', texto: 'Embalagens ou apresentações diferentes são itens diferentes (ex.: 20 L × 5 L, saco de 50 kg × saco de 25 kg, caixa com 12 × unidade)',
    parametro: { chave: 'embalagensDiferentesSaoItensDiferentes', tipo: 'booleano', padrao: true, ajuda: 'Sim: o mesmo produto em embalagens diferentes não é duplicidade; vira caso de apresentações a relacionar. Não: esses pares também podem ser indicados como duplicidade.' },
  },
  { id: 'dup-comparacao', camada: 'DUPLICIDADE', texto: 'A comparação entende acentos, abreviações, medidas convertidas (0,5 L = 500 ml), erros de digitação e palavras em outra ordem' },
  { id: 'dup-vetos', camada: 'DUPLICIDADE', texto: 'Não são duplicidade: medida, dose, cor, tamanho, variedade ou referência diferentes' },
  { id: 'dup-referencia', camada: 'DUPLICIDADE', texto: 'A mesma referência de fabricante em códigos diferentes (referência igual de fabricantes diferentes não prova que o produto é o mesmo)' },
  { id: 'dup-composicao', camada: 'DUPLICIDADE', texto: 'O mesmo nome com concentração ou composição diferente é produto diferente' },
  { id: 'dup-saldo', camada: 'DUPLICIDADE', texto: 'Código que sai com saldo ou movimento: transferir o saldo e manter o vínculo do código antigo (registro 0205 da EFD)' },

  // ── Grupos ──
  {
    id: 'gr-participacao', camada: 'GRUPOS_FINALIDADE', texto: 'Participação mínima para indicar o grupo do item',
    parametro: { chave: 'participacaoMinima', tipo: 'percentual', padrao: 90, min: 50, max: 100, unidade: '%', ajuda: 'Dos itens que têm a mesma palavra na descrição, quantos precisam estar no mesmo grupo para o sistema indicar esse grupo.' },
  },
  {
    id: 'gr-minimo', camada: 'GRUPOS_FINALIDADE', texto: 'Mínimo de itens com a mesma palavra para valer como evidência',
    parametro: { chave: 'minimoItensEvidencia', tipo: 'numero', padrao: 5, min: 2, max: 100, unidade: 'itens', ajuda: 'Palavra que aparece em menos itens do que isto não serve para indicar grupo.' },
  },
  { id: 'gr-grafias', camada: 'GRUPOS_FINALIDADE', texto: 'Grafias diferentes do mesmo grupo' },
  { id: 'gr-generico', camada: 'GRUPOS_FINALIDADE', texto: 'Grupo genérico (Diversos, Outros) com subgrupos sugeridos' },
  { id: 'gr-sobrepostos', camada: 'GRUPOS_FINALIDADE', texto: 'Grupos sobrepostos' },
  { id: 'gr-item', camada: 'GRUPOS_FINALIDADE', texto: 'Item no grupo errado ou sem grupo, pelo uso que o próprio cliente faz na base' },
  { id: 'gr-novo', camada: 'GRUPOS_FINALIDADE', texto: 'Itens sem grupo que pedem um grupo novo' },

  // ── Nomes e unidades (Diretrizes) ──
  { id: 'nu-nome', camada: 'NOMES_UNIDADES', origem: DIR, texto: 'Componentes e ordem do nome, conforme as Diretrizes do projeto' },
  { id: 'nu-atributos', camada: 'NOMES_UNIDADES', origem: DIR, texto: 'Atributos obrigatórios (medida, concentração, apresentação), conforme as Diretrizes do projeto' },
  { id: 'nu-termos', camada: 'NOMES_UNIDADES', origem: DIR, texto: 'Termos proibidos, termos genéricos e abreviações, conforme as Diretrizes do projeto' },
  { id: 'nu-unidades', camada: 'NOMES_UNIDADES', origem: DIR, texto: 'Unidade de estoque, de compra e de saída, com as conversões, conforme as Diretrizes do projeto' },
  { id: 'nu-limites', camada: 'NOMES_UNIDADES', origem: DIR, texto: 'Limite de caracteres da nota fiscal e do SPED, conforme as Diretrizes do projeto' },
  { id: 'nu-caracteres', camada: 'NOMES_UNIDADES', texto: 'Caracteres inválidos na descrição' },

  // ── Validar NCM ──
  { id: 'ncm-ausente', camada: 'NCM', texto: 'NCM em branco' },
  { id: 'ncm-formato', camada: 'NCM', texto: 'NCM com formato inválido ou só com zeros' },
  { id: 'ncm-inexistente', camada: 'NCM', texto: 'NCM que não existe na tabela oficial (Siscomex)' },
  { id: 'ncm-vigencia', camada: 'NCM', texto: 'NCM fora de vigência ou de classificação antiga, com o sucessor indicado' },

  // ── Estoque (módulo opcional) ──
  { id: 'est-conciliacao', camada: 'ESTOQUE', texto: 'Conciliação do saldo do cadastro com o estoque informado (módulo de conciliação)' },

  // ── Fase 2 ──
  { id: 'fin-grupo', camada: 'FINALIDADE', texto: 'Tipo do item do registro 0200 da EFD por grupo, a partir do grupo, do nome e das atividades confirmadas' },
  { id: 'fin-excecao', camada: 'FINALIDADE', texto: 'Exceções por item, com motivo' },
  { id: 'fin-pessoal', camada: 'FINALIDADE', texto: 'Uso ou consumo pessoal, sem crédito (LC 214, art. 57)' },
  { id: 'fin-estoque', camada: 'FINALIDADE', texto: 'Itens que contam para o crédito do estoque de transição (LC 214, art. 381)' },
  { id: 'ncm2-incompativel', camada: 'NCM_CLASSIFICACAO', texto: 'NCM que não combina com a descrição (indicação pelo texto, não prova)' },
  { id: 'ncm2-insuficiente', camada: 'NCM_CLASSIFICACAO', texto: 'Informação técnica insuficiente para confirmar a classificação' },
  { id: 'ncm2-divergente', camada: 'NCM_CLASSIFICACAO', texto: 'NCM diferente entre itens de descrição igual (o sistema nunca copia a classificação de um item parecido)' },
  { id: 'trib-conjunto', camada: 'TRIBUTARIO', texto: 'Um enquadramento por conjunto de itens com o mesmo NCM e a mesma finalidade' },
  { id: 'trib-classificacao', camada: 'TRIBUTARIO', texto: 'cClassTrib e CST por operação, participante, NCM e tipo do item, pela tabela oficial' },
  { id: 'trib-fundamento', camada: 'TRIBUTARIO', texto: 'Fundamento legal de cada linha; sem NCM válido ou sem finalidade, o caso aguarda informação' },
  { id: 'obr-0200', camada: 'OBRIGACOES', texto: 'Reflexo no registro 0200 (cadastro do item)' },
  { id: 'obr-0205', camada: 'OBRIGACOES', texto: 'Reflexo no registro 0205 (troca de código)' },
  { id: 'obr-h010', camada: 'OBRIGACOES', texto: 'Reflexo no registro H010 (inventário: item inativado não pode ter saldo)' },
  { id: 'obr-entregue', camada: 'OBRIGACOES', texto: 'Escrituração já entregue: o ajuste vale dali em diante' },
];

export const criteriosDaCamada = (camada: Camada): Criterio[] => CATALOGO_CRITERIOS.filter((c) => c.camada === camada);
export const criterioPorChave = (camada: Camada, chave: string): Criterio | undefined => CATALOGO_CRITERIOS.find((c) => c.camada === camada && c.parametro?.chave === chave);
/** Critérios que o usuário pode ajustar aqui (com parâmetro). */
export const criteriosAjustaveis = (): Criterio[] => CATALOGO_CRITERIOS.filter((c) => !!c.parametro);

export type ValorCriterio = number | boolean | string;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Valida e normaliza o valor de um parâmetro; devolve { ok, valor } ou { ok: false, erro } com a mensagem para o usuário. */
export function validarValor(p: ParametroCriterio, bruto: unknown): { ok: true; valor: ValorCriterio } | { ok: false; erro: string } {
  if (p.tipo === 'booleano') {
    if (typeof bruto === 'boolean') return { ok: true, valor: bruto };
    const t = String(bruto ?? '').trim().toLowerCase();
    if (['sim', 'true', 's'].includes(t)) return { ok: true, valor: true };
    if (['não', 'nao', 'false', 'n'].includes(t)) return { ok: true, valor: false };
    return { ok: false, erro: 'Escolha Sim ou Não.' };
  }
  if (p.tipo === 'numero' || p.tipo === 'percentual') {
    const n = typeof bruto === 'number' ? bruto : Number(String(bruto ?? '').replace('%', '').replace(',', '.').trim());
    if (bruto === '' || bruto == null || !Number.isFinite(n)) return { ok: false, erro: 'Informe um número.' };
    if (!Number.isInteger(n)) return { ok: false, erro: 'Informe um número inteiro.' };
    const u = p.unidade === '%' ? '%' : p.unidade ? ` ${p.unidade}` : '';
    if ((p.min != null && n < p.min) || (p.max != null && n > p.max)) return { ok: false, erro: `O valor deve ficar entre ${p.min}${u} e ${p.max}${u}.` };
    return { ok: true, valor: n };
  }
  if (p.tipo === 'data') {
    const t = String(bruto ?? '').trim();
    return ISO.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`)) ? { ok: true, valor: t } : { ok: false, erro: 'Informe uma data (aaaa-mm-dd).' };
  }
  const t = String(bruto ?? '').trim();
  return (p.opcoes ?? []).some((o) => o.valor === t) ? { ok: true, valor: t } : { ok: false, erro: 'Escolha uma das opções da lista.' };
}

/** Valores gravados no projeto: `parametros.criterios` = { [camada]: { [chave]: valor } }. */
export type CriteriosGravados = Partial<Record<string, Record<string, unknown>>>;

/** Valor efetivo de um parâmetro: o gravado, se válido; senão o padrão do catálogo. */
export function valorCriterio(gravados: CriteriosGravados | null | undefined, camada: Camada, chave: string): ValorCriterio | undefined {
  const c = criterioPorChave(camada, chave);
  if (!c?.parametro) return undefined;
  const bruto = gravados?.[camada]?.[chave];
  if (bruto === undefined) return c.parametro.padrao;
  const v = validarValor(c.parametro, bruto);
  return v.ok ? v.valor : c.parametro.padrao;
}

/** O valor escrito para gente: "85%", "5 itens", "Sim". */
export function textoDoValor(p: ParametroCriterio, v: unknown): string {
  if (p.tipo === 'booleano') return v === true ? 'Sim' : 'Não';
  if (p.tipo === 'percentual') return `${v}%`;
  if (p.tipo === 'numero') return `${v}${p.unidade ? ` ${p.unidade}` : ''}`;
  if (p.tipo === 'data') { const s = String(v ?? ''); return ISO.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s; }
  return p.opcoes?.find((o) => o.valor === v)?.rotulo ?? String(v ?? '');
}

/** Critério escrito à mão pelo usuário (texto livre que não se encaixou num critério ajustável): vai para a política; o motor não aplica. */
export type CriterioManual = { id: string; camada: Camada; texto: string; criadoPor: string; criadoEm: string; nota?: string | null };
/** Uma mudança nos critérios (quem, quando, de → para). */
export type MudancaCriterio = { quando: string; quem: string; camada: Camada; acao: 'AJUSTE' | 'MANUAL_INCLUIDO' | 'MANUAL_REMOVIDO'; criterio: string; de: string | null; para: string | null };
/** Tamanho máximo do histórico guardado no projeto (as mais antigas saem). */
export const MAX_HISTORICO = 200;

export const camadasDoCatalogo = (): Camada[] => CAMADAS.filter((c) => CATALOGO_CRITERIOS.some((x) => x.camada === c));
