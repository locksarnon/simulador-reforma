import { BadRequestException } from '@nestjs/common';
import { CAMADAS, FINALIDADES, type ResultadoCamada } from '../tipos';
import { nomeDoCampo, type Json } from './constantes';

const MAX_TEXTO = 2000;
const MAX_CHAVES = 40;
/**
 * Teto de casos por chamada de POST projetos/:id/casos: protege o servidor de um corpo HTTP enorme (o JSON inteiro fica em memória antes de
 * qualquer validação). O caminho interno (executar camada) não passa por HTTP: o resultado já está em memória, as gravações são em blocos e
 * o teto não protege nada ali; por isso ele usa `semTeto` (a camada nunca fica PENDENTE só porque a base é grande).
 */
export const MAX_CASOS = 20_000;
const MAX_ITENS_POR_CASO = 50_000;

const ehObjetoSimples = (v: unknown): v is Json => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const erro = (m: string) => new BadRequestException(m);

/**
 * Forma de uma proposta (ou do "atual"): objeto simples; chaves de campo seguras (campo de topo, `campos.nome` ou nome simples, nunca
 * __proto__/constructor/prototype); valores escalares curtos. `regras` aplica as regras de cada campo da proposta (NCM com 8 dígitos
 * em texto, `ativo` booleano, `saldo` numérico, finalidade da lista fechada). Para `atual` não se exige o formato (é o valor como estava).
 */
export function validarProposta(v: unknown, nome = 'proposta', regras = true): Json {
  if (v === undefined || v === null) return {};
  if (!ehObjetoSimples(v)) throw erro(`A ${nome} deve ser um objeto simples (campo → valor).`);
  const chaves = Object.keys(v);
  if (chaves.length > MAX_CHAVES) throw erro(`A ${nome} tem campos demais (máximo ${MAX_CHAVES}).`);
  for (const k of chaves) {
    nomeDoCampo(k); // lança 400 para nome inseguro
    const x = v[k];
    if (x === undefined) continue;
    const base = k.startsWith('campos.') ? k.slice(7) : k;
    if (Array.isArray(x)) {
      if (base !== 'tambemUsadoComo' || x.length > 8 || x.some((y) => typeof y !== 'string' || !(FINALIDADES as readonly string[]).includes(y))) throw erro(`Valor inválido em "${k}" (${nome}).`);
      continue;
    }
    if (x !== null && !['string', 'number', 'boolean'].includes(typeof x)) throw erro(`Valor inválido em "${k}" (${nome}): só texto, número ou verdadeiro/falso.`);
    if (typeof x === 'string' && x.length > MAX_TEXTO) throw erro(`Texto longo demais em "${k}" (${nome}; máximo ${MAX_TEXTO}).`);
    if (typeof x === 'number' && !Number.isFinite(x)) throw erro(`Número inválido em "${k}" (${nome}).`);
    if (!regras || x === null) continue;
    if (base === 'ncm' && !(typeof x === 'string' && /^\d{8}$/.test(x))) throw erro('O NCM deve ser texto com 8 dígitos.');
    if (base === 'ativo' && typeof x !== 'boolean') throw erro('O campo "ativo" deve ser verdadeiro ou falso.');
    if (base === 'saldo' && typeof x !== 'number') throw erro('O campo "saldo" deve ser numérico.');
    if (base === 'codigo' && !(typeof x === 'string' && x.trim() && x.length <= 60)) throw erro('O código deve ser um texto de até 60 caracteres.');
    if (base === 'finalidade' && !(typeof x === 'string' && (FINALIDADES as readonly string[]).includes(x))) throw erro(`Finalidade inválida: ${String(x)}.`);
  }
  return v;
}

/** Valida e normaliza (itens sem repetição) o resultado de uma camada. 400 claro em vez de erro de servidor. */
export function validarResultado(r: unknown, opcoes: { semTeto?: boolean } = {}): ResultadoCamada {
  if (!ehObjetoSimples(r)) throw erro('Envie o resultado da camada como objeto.');
  if (typeof r.camada !== 'string' || !(CAMADAS as readonly string[]).includes(r.camada)) throw erro('Camada inválida.');
  if (!Array.isArray(r.casos ?? [])) throw erro('"casos" deve ser uma lista.');
  const casosBrutos = (r.casos ?? []) as unknown[];
  if (!opcoes.semTeto && casosBrutos.length > MAX_CASOS) throw erro(`Casos demais em uma só chamada (máximo ${MAX_CASOS}).`);
  const lista = (v: unknown, n: string): string[] => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw erro(`"${n}" deve ser uma lista de textos.`);
    return v as string[];
  };
  const casos = casosBrutos.map((cb, i) => {
    if (!ehObjetoSimples(cb)) throw erro(`Caso ${i + 1}: formato inválido.`);
    const c = cb as Json;
    const onde = `Caso ${i + 1}`;
    if (c.camada !== r.camada) throw erro(`${onde}: camada diferente da do resultado.`);
    if (typeof c.tipo !== 'string' || !c.tipo.trim() || c.tipo.length > 80) throw erro(`${onde}: informe o tipo (texto de até 80 caracteres).`);
    if (typeof c.problema !== 'string' || !c.problema.trim()) throw erro(`${onde}: informe o problema.`);
    if (typeof c.justificativa !== 'string') throw erro(`${onde}: informe a justificativa.`);
    if (c.fundamento != null && typeof c.fundamento !== 'string') throw erro(`${onde}: o fundamento deve ser texto.`);
    if (c.origem !== 'REGRA' && c.origem !== 'IA') throw erro(`${onde}: a origem deve ser REGRA ou IA.`);
    const itens = [...new Set(lista(c.itens, 'itens'))];
    if (!itens.length) throw erro(`${onde} (${c.tipo}): não cita nenhum item.`);
    if (itens.length > MAX_ITENS_POR_CASO) throw erro(`${onde}: itens demais.`);
    const afeta = lista(c.afeta, 'afeta');
    if (afeta.some((a) => !(CAMADAS as readonly string[]).includes(a))) throw erro(`${onde}: camada inválida em "afeta".`);
    const evidencia = c.evidencia ?? [];
    if (!Array.isArray(evidencia) || evidencia.length > 200 || evidencia.some((e) => !ehObjetoSimples(e) || typeof e.rotulo !== 'string')) throw erro(`${onde}: evidência inválida.`);
    return {
      ...c, itens, afeta, evidencia, atual: validarProposta(c.atual, 'atual', false), proposta: validarProposta(c.proposta, 'proposta'), impactos: lista(c.impactos, 'impactos'),
      fundamento: (c.fundamento as string | null | undefined) ?? null,
    };
  });
  return {
    camada: r.camada as never, analisados: Number(r.analisados) || 0, casos: casos as never, semProblema: [...new Set(lista(r.semProblema, 'semProblema'))],
    semDados: r.semDados && ehObjetoSimples(r.semDados) && typeof r.semDados.motivo === 'string' ? { motivo: r.semDados.motivo, itens: Number(r.semDados.itens) || 0 } : null,
  };
}

/** Parâmetro de query: só texto simples (array ou objeto vira 400). */
export function paramTexto(v: unknown, nome: string): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw erro(`O parâmetro "${nome}" deve ser um texto único.`);
  return v;
}
export function paramInteiro(v: unknown, nome: string): number | undefined {
  if (typeof v === 'number') return Number.isInteger(v) ? v : undefined;
  const t = paramTexto(v, nome);
  if (t === undefined) return undefined;
  const n = Number(t);
  if (!Number.isInteger(n)) throw erro(`O parâmetro "${nome}" deve ser um número inteiro.`);
  return n;
}
