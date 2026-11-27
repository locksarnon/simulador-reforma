/**
 * Parte prática da resposta consultiva: o passo a passo ("o que eu faço?") e o cálculo modelo ("como calculo?").
 *
 * O modelo de IA descreve a conta e o InTAX a refaz. Regras:
 * - valor da operação é premissa de EXEMPLO (P1, P2...);
 * - número da lei (alíquota, percentual, redução, limite) é parâmetro (A1, A2...) e só entra com o id de um dispositivo fornecido
 *   cujo texto traz aquele número; senão o cálculo inteiro é descartado, com o motivo;
 * - cada linha (L1, L2...) é uma conta só com P#, A#, linhas anteriores, + - * / e parênteses (o único número direto é 1);
 *   parâmetro e premissa em % valem como fração (4% = 0,04);
 * - o resultado mostrado é sempre o que o InTAX calculou; se o modelo errou a conta, a linha é corrigida e o ajuste aparece.
 * Funções puras (sem banco): testáveis.
 */
import type { Candidato } from './base-legal.assistente';

export type Unidade = 'R$' | '%' | '';
export type PremissaCalculo = { id: string; descricao: string; valor: number; unidade: Unidade; valor_texto: string };
export type ParametroCalculo = {
  id: string; descricao: string; valor: number; unidade: Unidade; valor_texto: string;
  fundamento: { norma: string; numero: string; rotulo: string; caminho: string };
};
export type LinhaCalculo = { id: string; descricao: string; expressao: string; conta: string; resultado: number; unidade: Unidade; valor_texto: string };
export type CalculoModelo = { formula: string; premissas: PremissaCalculo[]; parametros: ParametroCalculo[]; linhas: LinhaCalculo[]; ajustes: string[] };
export type Pratica = { passos: string[]; calculo: CalculoModelo | null; sem_calculo: string | null };

const MAX_PASSOS = 10;
const MAX_PREMISSAS = 8;
const MAX_PARAMETROS = 8;
const MAX_LINHAS = 12;

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const unidadeDe = (v: unknown): Unidade => {
  const u = String(v ?? '').trim().toUpperCase();
  return u === 'R$' || u === 'BRL' || u === 'REAIS' ? 'R$' : u === '%' ? '%' : '';
};
const numeroDe = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/R\$|%|\s/g, '');
  const n = /,\d+$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const fmtNumero = (v: number, casas = 4) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas }).format(v);
/** Valor como o leitor o vê: R$ 4.000,00; 4%; 1,6%; 12. Na conta, parâmetro em % vale fração; aqui ele aparece em %. */
export function formatarValor(valor: number, unidade: Unidade): string {
  if (unidade === 'R$') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor).replace(/[  ]/g, ' ');
  if (unidade === '%') return `${fmtNumero(valor)}%`;
  return fmtNumero(valor);
}

/** Números escritos no texto da lei (4%, 1,6%, 3.600.000,00, 12), para conferir que o parâmetro citado está mesmo no dispositivo. */
export function numerosDoTexto(t: string): number[] {
  const achados: number[] = [];
  for (const m of String(t || '').matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g)) {
    const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) achados.push(n);
  }
  return achados;
}
const igual = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9);

// ───────────── Conta: + - * / e parênteses sobre P#, A#, L# (e o número 1) ─────────────

type Simbolo = { tipo: 'num'; v: number; bruto: string } | { tipo: 'id'; v: string } | { tipo: 'op'; v: string };

function separar(expressao: string): Simbolo[] {
  const s = expressao.replace(/[×xX]/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const saida: Simbolo[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if ('+-*/()'.includes(c)) { saida.push({ tipo: 'op', v: c }); i++; continue; }
    const id = /^[PAL]\d{1,2}/i.exec(s.slice(i));
    if (id) { saida.push({ tipo: 'id', v: id[0].toUpperCase() }); i += id[0].length; continue; }
    const num = /^\d+(?:[.,]\d+)?/.exec(s.slice(i));
    if (num) { saida.push({ tipo: 'num', v: Number(num[0].replace(',', '.')), bruto: num[0] }); i += num[0].length; continue; }
    throw new Error(`a conta tem um símbolo que não é permitido ("${c}")`);
  }
  return saida;
}

/** Avalia a conta com os valores conhecidos (descida recursiva: soma/subtração, multiplicação/divisão, sinal, parênteses). */
export function avaliarConta(expressao: string, valores: Map<string, number>): number {
  const simbolos = separar(expressao);
  if (!simbolos.length) throw new Error('a conta está vazia');
  let pos = 0;
  const olhar = () => simbolos[pos];
  const soma = (): number => {
    let v = produto();
    while (olhar()?.tipo === 'op' && (olhar().v === '+' || olhar().v === '-')) {
      const op = simbolos[pos++].v;
      const d = produto();
      v = op === '+' ? v + d : v - d;
    }
    return v;
  };
  const produto = (): number => {
    let v = fator();
    while (olhar()?.tipo === 'op' && (olhar().v === '*' || olhar().v === '/')) {
      const op = simbolos[pos++].v;
      const d = fator();
      if (op === '/' && d === 0) throw new Error('a conta divide por zero');
      v = op === '*' ? v * d : v / d;
    }
    return v;
  };
  const fator = (): number => {
    const s = simbolos[pos++];
    if (!s) throw new Error('a conta termina no meio');
    if (s.tipo === 'op' && (s.v === '-' || s.v === '+')) return s.v === '-' ? -fator() : fator();
    if (s.tipo === 'op' && s.v === '(') {
      const v = soma();
      const f = simbolos[pos++];
      if (!f || f.tipo !== 'op' || f.v !== ')') throw new Error('falta fechar um parêntese na conta');
      return v;
    }
    if (s.tipo === 'num') {
      if (s.v !== 1) throw new Error(`o número ${s.bruto} entrou direto na conta (todo número precisa ser premissa ou parâmetro com o artigo)`);
      return 1;
    }
    if (s.tipo === 'id') {
      if (!valores.has(s.v)) throw new Error(`a conta usa ${s.v}, que não foi definido antes`);
      return valores.get(s.v) as number;
    }
    throw new Error('a conta está mal formada');
  };
  const v = soma();
  if (pos !== simbolos.length) throw new Error('a conta está mal formada');
  if (!Number.isFinite(v)) throw new Error('a conta não dá um número');
  return v;
}

/** A conta para o leitor: "R$ 100.000,00 × 4%" em vez de "P1 * A1". */
export function contaLegivel(expressao: string, textos: Map<string, string>): string {
  return separar(expressao)
    .map((s) => (s.tipo === 'id' ? textos.get(s.v) ?? s.v : s.tipo === 'num' ? (s.v === 1 ? '100%' : s.bruto) : s.v === '*' ? '×' : s.v === '/' ? '÷' : s.v === '-' ? '−' : s.v))
    .join(' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')');
}

const arredondar = (v: number, unidade: Unidade) => (unidade === 'R$' ? Math.round((v + Number.EPSILON) * 100) / 100 : Math.round(v * 1e8) / 1e8);

/**
 * Confere o cálculo que o modelo descreveu e o refaz. Devolve o cálculo conferido ou o motivo de não exibi-lo
 * (nunca um número sem origem: o cálculo vai inteiro ou não vai).
 */
export function conferirCalculo(bruto: unknown, candidatos: Candidato[]): { calculo: CalculoModelo | null; motivo: string | null } {
  const c = (bruto ?? {}) as { formula?: unknown; premissas?: unknown; parametros?: unknown; linhas?: unknown };
  const porId = new Map(candidatos.map((x) => [`${x.chave}/${x.caminho}`, x]));
  const valores = new Map<string, number>(); // valor na conta (% como fração)
  const textos = new Map<string, string>(); // valor como o leitor vê
  const vistos = new Set<string>();
  const descarta = (motivo: string) => ({ calculo: null, motivo });
  const idValido = (id: string, letra: string) => new RegExp(`^${letra}\\d{1,2}$`).test(id) && !vistos.has(id);

  const premissas: PremissaCalculo[] = [];
  for (const p of (Array.isArray(c.premissas) ? c.premissas : []).slice(0, MAX_PREMISSAS)) {
    const id = String((p as { id?: unknown })?.id ?? '').trim().toUpperCase();
    const descricao = texto((p as { descricao?: unknown })?.descricao, 160);
    const valor = numeroDe((p as { valor?: unknown })?.valor);
    const unidade = unidadeDe((p as { unidade?: unknown })?.unidade);
    if (!idValido(id, 'P') || !descricao || valor === null) return descarta('uma premissa do exemplo veio incompleta');
    vistos.add(id);
    premissas.push({ id, descricao, valor, unidade, valor_texto: formatarValor(valor, unidade) });
    valores.set(id, unidade === '%' ? valor / 100 : valor);
    textos.set(id, formatarValor(valor, unidade));
  }

  const parametros: ParametroCalculo[] = [];
  for (const p of (Array.isArray(c.parametros) ? c.parametros : []).slice(0, MAX_PARAMETROS)) {
    const id = String((p as { id?: unknown })?.id ?? '').trim().toUpperCase();
    const descricao = texto((p as { descricao?: unknown })?.descricao, 160);
    const valor = numeroDe((p as { valor?: unknown })?.valor);
    const unidade = unidadeDe((p as { unidade?: unknown })?.unidade);
    const fonte = porId.get(String((p as { fundamento?: unknown })?.fundamento ?? '').trim());
    if (!idValido(id, 'A') || !descricao || valor === null) return descarta('um parâmetro da lei veio incompleto');
    if (!fonte) return descarta(`o parâmetro "${descricao}" não veio com um dos dispositivos consultados`);
    if (!numerosDoTexto(fonte.texto).some((n) => igual(n, valor))) {
      return descarta(`o número ${formatarValor(valor, unidade)} ("${descricao}") não está no texto de ${fonte.numero}, ${fonte.rotulo}`);
    }
    vistos.add(id);
    parametros.push({ id, descricao, valor, unidade, valor_texto: formatarValor(valor, unidade), fundamento: { norma: fonte.chave, numero: fonte.numero, rotulo: fonte.rotulo, caminho: fonte.caminho } });
    valores.set(id, unidade === '%' ? valor / 100 : valor);
    textos.set(id, formatarValor(valor, unidade));
  }

  const linhas: LinhaCalculo[] = [];
  const ajustes: string[] = [];
  const brutas = (Array.isArray(c.linhas) ? c.linhas : []).slice(0, MAX_LINHAS);
  if (!brutas.length) return descarta('o cálculo veio sem as contas');
  for (const l of brutas) {
    const id = String((l as { id?: unknown })?.id ?? '').trim().toUpperCase();
    const descricao = texto((l as { descricao?: unknown })?.descricao, 160);
    const expressao = texto((l as { expressao?: unknown })?.expressao, 200);
    const unidade = unidadeDe((l as { unidade?: unknown })?.unidade);
    if (!idValido(id, 'L') || !descricao || !expressao) return descarta('uma linha da conta veio incompleta');
    let bruto: number;
    try {
      bruto = avaliarConta(expressao, valores);
    } catch (e) {
      return descarta(`${descricao}: ${(e as Error).message}`);
    }
    // Linha em % guarda a fração (0,4) e aparece como 40%.
    const resultado = arredondar(unidade === '%' ? bruto * 100 : bruto, unidade);
    const doModelo = numeroDe((l as { resultado?: unknown })?.resultado);
    // Até 5 centavos é arredondamento de passo intermediário, não erro de conta.
    if (doModelo !== null && Math.abs(doModelo - resultado) > (unidade === 'R$' ? 0.05 : Math.max(1e-6, Math.abs(resultado) * 1e-6))) {
      const razao = resultado !== 0 ? doModelo / resultado : 0;
      // Diferença de 100 vezes é confusão entre percentual e fração: a conta não diz o que o modelo quis dizer.
      if (Math.abs(razao - 100) < 1e-6 || Math.abs(razao - 0.01) < 1e-9) return descarta(`${descricao}: a conta e o resultado do modelo não batem (percentual tratado como número inteiro)`);
      ajustes.push(`${descricao}: o modelo chegou a ${formatarValor(doModelo, unidade)}; a conta dá ${formatarValor(resultado, unidade)} e vale a do InTAX.`);
    }
    const valorTexto = formatarValor(resultado, unidade);
    linhas.push({ id, descricao, expressao, conta: contaLegivel(expressao, textos), resultado, unidade, valor_texto: valorTexto });
    vistos.add(id);
    valores.set(id, unidade === '%' ? resultado / 100 : resultado);
    textos.set(id, valorTexto);
  }

  return { calculo: { formula: texto(c.formula, 300), premissas, parametros, linhas, ajustes }, motivo: null };
}

/** A parte prática da resposta: passos e cálculo conferido. Pergunta só conceitual (ou nada aproveitável): null. */
export function conferirPratica(bruta: unknown, candidatos: Candidato[]): Pratica | null {
  if (!bruta || typeof bruta !== 'object') return null;
  const p = bruta as { passos?: unknown; calculo?: unknown; sem_calculo?: unknown };
  const passos = (Array.isArray(p.passos) ? p.passos : []).map((x) => texto(x, 500)).filter(Boolean).slice(0, MAX_PASSOS);
  let calculo: CalculoModelo | null = null;
  let semCalculo = texto(p.sem_calculo, 400) || null;
  if (p.calculo && typeof p.calculo === 'object') {
    const r = conferirCalculo(p.calculo, candidatos);
    calculo = r.calculo;
    if (r.motivo) semCalculo = `O cálculo modelo não foi exibido porque ${r.motivo}. Nenhum número sem base legal vai para a tela.`;
  }
  if (!passos.length && !calculo && !semCalculo) return null;
  return { passos, calculo, sem_calculo: calculo ? null : semCalculo };
}

/** O cálculo em linhas de texto (copiar a resposta, e-mail). */
export function calculoEmTexto(c: CalculoModelo): string[] {
  return [
    ...(c.formula ? [`Fórmula: ${c.formula}`] : []),
    ...c.premissas.map((p) => `${p.descricao}: ${p.valor_texto} (exemplo)`),
    ...c.parametros.map((p) => `${p.descricao}: ${p.valor_texto} (${p.fundamento.numero}, ${p.fundamento.rotulo})`),
    ...c.linhas.map((l) => `${l.descricao}: ${l.conta} = ${l.valor_texto}`),
  ];
}
