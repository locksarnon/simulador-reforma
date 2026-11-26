/**
 * Conteúdo das regras: padrão por aspecto, validação (400 claro, nada de erro de servidor), mescla biblioteca + alterações do projeto e
 * abrangência. Funções puras, sem Nest nem Prisma (as exceções são as do Nest só para o código HTTP).
 */
import { BadRequestException } from '@nestjs/common';
import {
  ASPECTOS, COMPONENTES_NOME, type Abrangencia, type Aspecto, type ComponenteNome, type ConteudoRegra, type LinhaLimite, type RegraAtributos, type RegraFiscal, type RegraLimites,
  type RegraNomes, type RegraUnidades,
} from './tipos';

type Json = Record<string, unknown>;
const erro = (m: string) => new BadRequestException({ statusCode: 400, codigo: 'DIRETRIZ_INVALIDA', message: m });

/** Rótulo do item sem grupo (vale também como "grupo" numa abrangência). */
export const SEM_GRUPO = '(sem grupo)';

/** Conteúdo padrão de cada aspecto: o que uma regra nova (sem biblioteca) começa tendo. Nada que afogue a fila (caixa preservada). */
export function conteudoPadrao(aspecto: Aspecto): ConteudoRegra {
  switch (aspecto) {
    case 'NOMES': return { aspecto, componentes: [...COMPONENTES_NOME], obrigatorios: ['NOME'], separador: ' ', capitalizacao: 'PRESERVAR', removerEspacosDuplicados: true, abreviacoes: [], termosProibidos: [] };
    case 'ATRIBUTOS': return { aspecto, atributos: [] };
    case 'UNIDADES': return { aspecto, criterioEstoque: 'MENOR_PRATICA', unidadeDefinida: null, unidadesCompra: [], unidadesSaida: [], conversoes: [], conversaoDesconhecida: 'PENDENCIA' };
    case 'LIMITES': return { aspecto, linhas: [] };
    case 'FISCAL': return { aspecto, validarNcm: true, excecoesNcm: [], validarCClassTrib: true, cenarios: ['ENTRADA', 'SAIDA', 'USO_INTERNO'], ausente: 'PENDENCIA', ambiguo: 'REVISAO_FISCAL' };
  }
}

export function validarAspecto(v: unknown): Aspecto {
  if (typeof v !== 'string' || !(ASPECTOS as readonly string[]).includes(v)) throw erro(`Aspecto inválido: use ${ASPECTOS.join(', ')}.`);
  return v as Aspecto;
}

const ehObjeto = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

export function texto(v: unknown, campo: string, max: number, opcional = false): string | null {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (opcional) return null;
    throw erro(`Informe ${campo}.`);
  }
  if (typeof v !== 'string') throw erro(`${campo} deve ser texto.`);
  const t = v.trim();
  if (t.length > max) throw erro(`${campo}: no máximo ${max} caracteres.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(t)) throw erro(`${campo}: caractere de controle não é aceito.`);
  return t;
}
const booleano = (v: unknown, campo: string): boolean => { if (typeof v !== 'boolean') throw erro(`${campo} deve ser verdadeiro ou falso.`); return v; };
const umDe = <T extends string>(v: unknown, lista: readonly T[], campo: string): T => {
  if (typeof v !== 'string' || !lista.includes(v as T)) throw erro(`${campo}: use ${lista.join(', ')}.`);
  return v as T;
};
function lista<T>(v: unknown, campo: string, max: number, cada: (x: unknown, i: number) => T): T[] {
  if (!Array.isArray(v)) throw erro(`${campo} deve ser uma lista.`);
  if (v.length > max) throw erro(`${campo}: no máximo ${max} linhas.`);
  return v.map((x, i) => cada(x, i));
}
const chaveTexto = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function semRepetir<T>(xs: T[], chave: (x: T) => string, campo: string): T[] {
  const vistos = new Set<string>();
  for (const x of xs) { const k = chave(x); if (vistos.has(k)) throw erro(`${campo}: "${k}" aparece mais de uma vez.`); vistos.add(k); }
  return xs;
}
const componentes = (v: unknown, campo: string): ComponenteNome[] => semRepetir(lista(v, campo, COMPONENTES_NOME.length, (x) => umDe(x, COMPONENTES_NOME, campo)), (x) => x, campo);
const unidadeTexto = (v: unknown, campo: string) => texto(v, campo, 20) as string;

const CAMPOS_ITEM = ['descricao', 'codigo', 'unidade', 'referencia', 'fabricante'] as const;
const ORIGENS = ['LEIAUTE_OFICIAL', 'ERP', 'CLIENTE'] as const;

/** Uma linha de limite: limite nulo = não confirmado (pendência). Confirmado sem número não existe; número genérico nunca é inventado aqui. */
export function validarLinhaLimite(x: unknown, i: number): LinhaLimite {
  const campo = `Limite, linha ${i + 1}`;
  if (!ehObjeto(x)) throw erro(`${campo}: formato inválido.`);
  let limite: number | null = null;
  if (x.limite !== null && x.limite !== undefined && x.limite !== '') {
    if (typeof x.limite !== 'number' || !Number.isInteger(x.limite) || x.limite < 1 || x.limite > 100_000) throw erro(`${campo}: o limite é um número inteiro de caracteres (1 a 100000) ou vazio (não confirmado).`);
    limite = x.limite;
  }
  const confirmado = x.confirmado === undefined ? false : booleano(x.confirmado, `${campo}, confirmado`);
  if (confirmado && limite == null) throw erro(`${campo}: limite confirmado precisa do número de caracteres.`);
  const url = texto(x.url, `${campo}, endereço da fonte`, 500, true);
  if (url && !/^https?:\/\//i.test(url)) throw erro(`${campo}: o endereço da fonte deve começar com http:// ou https://.`);
  return {
    destino: texto(x.destino, `${campo}, destino`, 120) as string,
    campo: texto(x.campo, `${campo}, campo do destino`, 120) as string,
    campoItem: umDe(x.campoItem, CAMPOS_ITEM, `${campo}, campo do item`),
    limite,
    origem: umDe(x.origem, ORIGENS, `${campo}, origem`),
    referencia: texto(x.referencia, `${campo}, referência`, 500, true),
    url,
    confirmado,
    tratamento: umDe(x.tratamento ?? 'SOLICITAR_REVISAO', ['SUGERIR_ABREVIACAO', 'SOLICITAR_REVISAO'] as const, `${campo}, tratamento do excesso`),
    preservar: x.preservar === undefined ? [] : componentes(x.preservar, `${campo}, componentes a preservar`),
  };
}

/** Valida cada chave presente. `parcial` = alterações do projeto (só as chaves enviadas); senão o conteúdo inteiro é exigido. */
export function validarConteudo(aspecto: Aspecto, bruto: unknown, parcial: boolean): Partial<ConteudoRegra> {
  if (!ehObjeto(bruto)) throw erro('O conteúdo da regra deve ser um objeto.');
  if (bruto.aspecto !== undefined && bruto.aspecto !== aspecto) throw erro('O conteúdo é de outro aspecto.');
  const tem = (k: string) => bruto[k] !== undefined;
  const exige = (ks: string[]) => { if (!parcial) for (const k of ks) if (!tem(k)) throw erro(`Falta "${k}" no conteúdo da regra.`); };
  const conhecidas: Record<Aspecto, string[]> = {
    NOMES: ['componentes', 'obrigatorios', 'separador', 'capitalizacao', 'removerEspacosDuplicados', 'abreviacoes', 'termosProibidos'],
    ATRIBUTOS: ['atributos'],
    UNIDADES: ['criterioEstoque', 'unidadeDefinida', 'unidadesCompra', 'unidadesSaida', 'conversoes', 'conversaoDesconhecida'],
    LIMITES: ['linhas'],
    FISCAL: ['validarNcm', 'excecoesNcm', 'validarCClassTrib', 'cenarios', 'ausente', 'ambiguo'],
  };
  for (const k of Object.keys(bruto)) if (k !== 'aspecto' && !conhecidas[aspecto].includes(k)) throw erro(`Campo desconhecido no conteúdo da regra: "${k}".`);
  const out: Json = {};
  if (aspecto === 'NOMES') {
    exige(['componentes', 'obrigatorios', 'separador', 'capitalizacao', 'removerEspacosDuplicados', 'abreviacoes', 'termosProibidos']);
    if (tem('componentes')) out.componentes = componentes(bruto.componentes, 'Componentes');
    if (tem('obrigatorios')) out.obrigatorios = componentes(bruto.obrigatorios, 'Componentes obrigatórios');
    if (tem('separador')) {
      if (typeof bruto.separador !== 'string' || bruto.separador.length < 1 || bruto.separador.length > 3 || /[\u0000-\u001f]/.test(bruto.separador)) throw erro('Separador: de 1 a 3 caracteres (ex.: espaço ou hífen).');
      out.separador = bruto.separador;
    }
    if (tem('capitalizacao')) out.capitalizacao = umDe(bruto.capitalizacao, ['MAIUSCULAS', 'MINUSCULAS', 'PRESERVAR'] as const, 'Capitalização');
    if (tem('removerEspacosDuplicados')) out.removerEspacosDuplicados = booleano(bruto.removerEspacosDuplicados, 'Remover espaços duplicados');
    if (tem('abreviacoes')) {
      out.abreviacoes = semRepetir(lista(bruto.abreviacoes, 'Abreviações', 2000, (x, i) => {
        if (!ehObjeto(x)) throw erro(`Abreviação ${i + 1}: formato inválido.`);
        const completa = texto(x.completa, `Abreviação ${i + 1}, expressão completa`, 120) as string;
        const abreviacao = texto(x.abreviacao, `Abreviação ${i + 1}, abreviação`, 60) as string;
        if (chaveTexto(completa) === chaveTexto(abreviacao)) throw erro(`Abreviação ${i + 1}: a abreviação é igual à expressão completa.`);
        return { completa, abreviacao };
      }), (x) => chaveTexto(x.completa), 'Abreviações');
    }
    if (tem('termosProibidos')) {
      out.termosProibidos = semRepetir(lista(bruto.termosProibidos, 'Termos proibidos', 2000, (x, i) => {
        if (!ehObjeto(x)) throw erro(`Termo proibido ${i + 1}: formato inválido.`);
        const termo = texto(x.termo, `Termo proibido ${i + 1}`, 120) as string;
        return { termo, substituicao: texto(x.substituicao, `Termo proibido ${i + 1}, substituição`, 120, true) };
      }), (x) => chaveTexto(x.termo), 'Termos proibidos');
    }
  } else if (aspecto === 'ATRIBUTOS') {
    exige(['atributos']);
    if (tem('atributos')) {
      out.atributos = semRepetir(lista(bruto.atributos, 'Atributos', 200, (x, i) => {
        if (!ehObjeto(x)) throw erro(`Atributo ${i + 1}: formato inválido.`);
        const atributo = (texto(x.atributo, `Atributo ${i + 1}`, 40) as string).toUpperCase().replace(/\s+/g, '_');
        if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(atributo)) throw erro(`Atributo ${i + 1}: use letras, números e _ (ex.: PRINCIPIO_ATIVO).`);
        const onde = umDe(x.onde, ['DESCRICAO', 'CAMPO_PROPRIO', 'AMBOS'] as const, `Atributo ${i + 1}, onde deve constar`);
        const campo = texto(x.campo, `Atributo ${i + 1}, campo próprio`, 60, true);
        if (campo && !/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(campo)) throw erro(`Atributo ${i + 1}: nome de campo inválido.`);
        // Campo próprio sem nome (regra-modelo genérica): a coluna é definida no projeto; até lá o atributo não é verificável (não vira caso).
        const aplicabilidade = umDe(x.aplicabilidade, ['OBRIGATORIO', 'QUANDO_APLICAVEL'] as const, `Atributo ${i + 1}, aplicabilidade`);
        const condicao = texto(x.condicao, `Atributo ${i + 1}, condição`, 300, true);
        if (aplicabilidade === 'QUANDO_APLICAVEL' && !condicao) throw erro(`Atributo ${i + 1}: descreva a condição de "obrigatório quando aplicável".`);
        return { atributo, onde, campo, aplicabilidade, condicao };
      }), (x) => x.atributo, 'Atributos');
    }
  } else if (aspecto === 'UNIDADES') {
    exige(['criterioEstoque', 'unidadesCompra', 'unidadesSaida', 'conversoes']);
    if (tem('criterioEstoque')) out.criterioEstoque = umDe(bruto.criterioEstoque, ['MENOR_PRATICA', 'DEFINIDA'] as const, 'Critério da unidade de estoque');
    if (tem('unidadeDefinida')) out.unidadeDefinida = texto(bruto.unidadeDefinida, 'Unidade definida', 20, true);
    if (tem('unidadesCompra')) out.unidadesCompra = semRepetir(lista(bruto.unidadesCompra, 'Unidades de compra', 200, (x) => unidadeTexto(x, 'Unidade de compra')), chaveTexto, 'Unidades de compra');
    if (tem('unidadesSaida')) out.unidadesSaida = semRepetir(lista(bruto.unidadesSaida, 'Unidades de saída', 200, (x) => unidadeTexto(x, 'Unidade de saída')), chaveTexto, 'Unidades de saída');
    if (tem('conversoes')) {
      out.conversoes = semRepetir(lista(bruto.conversoes, 'Conversões', 5000, (x, i) => {
        if (!ehObjeto(x)) throw erro(`Conversão ${i + 1}: formato inválido.`);
        const origem = unidadeTexto(x.origem, `Conversão ${i + 1}, unidade de origem`);
        const destino = unidadeTexto(x.destino, `Conversão ${i + 1}, unidade de destino`);
        if (chaveTexto(origem) === chaveTexto(destino)) throw erro(`Conversão ${i + 1}: origem e destino iguais.`);
        if (typeof x.fator !== 'number' || !Number.isFinite(x.fator) || x.fator <= 0) throw erro(`Conversão ${i + 1}: o fator é um número maior que zero (conversão desconhecida fica como pendência, sem linha aqui).`);
        const abrangencia = umDe(x.abrangencia ?? 'GRUPO', ['GRUPO', 'PRODUTO'] as const, `Conversão ${i + 1}, abrangência`);
        const codigoProduto = texto(x.codigoProduto, `Conversão ${i + 1}, código do produto`, 60, true);
        if (abrangencia === 'PRODUTO' && !codigoProduto) throw erro(`Conversão ${i + 1}: informe o código do produto.`);
        return { origem, destino, fator: x.fator, abrangencia, codigoProduto: abrangencia === 'PRODUTO' ? codigoProduto : null };
      }), (x) => `${chaveTexto(x.origem)}→${chaveTexto(x.destino)}@${x.abrangencia}:${x.codigoProduto ?? ''}`, 'Conversões');
    }
    if (tem('conversaoDesconhecida')) out.conversaoDesconhecida = umDe(bruto.conversaoDesconhecida, ['PENDENCIA'] as const, 'Conversão desconhecida');
  } else if (aspecto === 'LIMITES') {
    exige(['linhas']);
    if (tem('linhas')) out.linhas = lista(bruto.linhas, 'Limites', 300, validarLinhaLimite);
  } else {
    exige(['validarNcm', 'excecoesNcm', 'validarCClassTrib', 'cenarios']);
    if (tem('validarNcm')) out.validarNcm = booleano(bruto.validarNcm, 'Validar NCM');
    if (tem('validarCClassTrib')) out.validarCClassTrib = booleano(bruto.validarCClassTrib, 'Validar cClassTrib');
    if (tem('excecoesNcm')) {
      out.excecoesNcm = semRepetir(lista(bruto.excecoesNcm, 'Exceções de NCM', 5000, (x, i) => {
        if (!ehObjeto(x)) throw erro(`Exceção ${i + 1}: formato inválido.`);
        const justificativa = texto(x.justificativa, `Exceção ${i + 1}, justificativa`, 500) as string;
        if (justificativa.length < 5) throw erro(`Exceção ${i + 1}: a justificativa precisa de ao menos 5 caracteres.`);
        return { alvo: texto(x.alvo, `Exceção ${i + 1}, item ou grupo`, 120) as string, justificativa };
      }), (x) => chaveTexto(x.alvo), 'Exceções de NCM');
    }
    if (tem('cenarios')) out.cenarios = semRepetir(lista(bruto.cenarios, 'Cenários', 3, (x) => umDe(x, ['ENTRADA', 'SAIDA', 'USO_INTERNO'] as const, 'Cenário')), (x) => x, 'Cenários');
    if (tem('ausente')) out.ausente = umDe(bruto.ausente, ['PENDENCIA'] as const, 'Ausência');
    if (tem('ambiguo')) out.ambiguo = umDe(bruto.ambiguo, ['REVISAO_FISCAL'] as const, 'Ambiguidade');
  }
  return (parcial ? out : { aspecto, ...out }) as Partial<ConteudoRegra>;
}

/** Coerência do conteúdo efetivo (depois da mescla). */
export function conferirCoerencia(c: ConteudoRegra): void {
  if (c.aspecto === 'NOMES') {
    const fora = c.obrigatorios.filter((o) => !c.componentes.includes(o));
    if (fora.length) throw erro(`Componentes obrigatórios fora da lista de componentes: ${fora.join(', ')}.`);
  }
  if (c.aspecto === 'UNIDADES' && c.criterioEstoque === 'DEFINIDA' && !c.unidadeDefinida) throw erro('Critério "unidade definida para o grupo": informe a unidade.');
}

/** Conteúdo efetivo = base (biblioteca na versão adotada, ou padrão do aspecto) + alterações do projeto (chave a chave; listas substituem). */
export function conteudoEfetivo(aspecto: Aspecto, base: ConteudoRegra | null, alteracoes: Partial<ConteudoRegra> | null | undefined): ConteudoRegra {
  const b = base && base.aspecto === aspecto ? base : conteudoPadrao(aspecto);
  const saida = { ...b } as Json;
  for (const [k, v] of Object.entries(alteracoes ?? {})) if (k !== 'aspecto' && v !== undefined) saida[k] = v;
  saida.aspecto = aspecto;
  return saida as ConteudoRegra;
}

/** Abrangência validada. `vaziaPermitida` só para o uso interno (regra que perdeu todos os grupos numa transferência). */
export function validarAbrangencia(v: unknown, vaziaPermitida = false): Abrangencia {
  if (!ehObjeto(v)) throw erro('Abrangência: informe "todos" ou a lista de grupos.');
  if (v.todos === true) return { todos: true };
  if (v.todos !== false && v.todos !== undefined) throw erro('Abrangência: "todos" deve ser verdadeiro ou falso.');
  // Espaços repetidos não distinguem grupos (a importação já os reduz a um): "PARAFUSOS  E FIXADORES" = "PARAFUSOS E FIXADORES".
  const nome = (x: unknown, campo: string) => (texto(x, campo, 120) as string).replace(/\s+/g, ' ');
  const grupos = semRepetir(lista(v.grupos ?? [], 'Grupos', 5000, (x) => nome(x, 'Grupo')), (x) => x, 'Grupos');
  if (!grupos.length && !vaziaPermitida) throw erro('Escolha ao menos um grupo ou "Todos os grupos".');
  const subgrupos = v.subgrupos === undefined || v.subgrupos === null ? [] : semRepetir(lista(v.subgrupos, 'Subgrupos', 5000, (x) => nome(x, 'Subgrupo')), (x) => x, 'Subgrupos');
  return subgrupos.length ? { todos: false, grupos, subgrupos } : { todos: false, grupos };
}

export const abrangenciaVazia = (a: Abrangencia): boolean => !a.todos && a.grupos.length === 0;

/** JSON canônico (chaves em ordem): compara conteúdos sem depender da ordem em que foram montados. */
export function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object' && !(v instanceof Date)) return `{${Object.keys(v as Json).filter((k) => (v as Json)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonico((v as Json)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

export type { RegraAtributos, RegraFiscal, RegraLimites, RegraNomes, RegraUnidades };
