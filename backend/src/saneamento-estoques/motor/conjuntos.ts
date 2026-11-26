/**
 * Conjuntos de itens iguais ou parecidos e escolha de qual código fica (porte de src/components/saneamento/conjuntos.js).
 * Só SUGERE: nada é alterado no cadastro. Os membros usam os nomes de campo da base importada (linha, ultima_mov, grupo_atual...) para manter a paridade com os testes do frontend;
 * a camada de duplicidade adapta o ItemTrabalho para este formato.
 */
import { dataBr, numeroBr, txt } from './texto';

export type NivelDuplicidade = 'EXATA' | 'MUITO_PROVAVEL' | 'POSSIVEL';
export const NIVEL_ORDEM: Record<NivelDuplicidade, number> = { EXATA: 0, MUITO_PROVAVEL: 1, POSSIVEL: 2 };
const colador = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

export type CandidatoConjunto = { linha: number; score: number; nivel: NivelDuplicidade; motivos?: string[] };
export type MembroConjunto = {
  linha: number; codigo: string; descricao?: string | null; unidade?: string | null; ncm?: string | null; ncm_original?: string | null; principio_ativo?: string | null;
  grupo_atual?: string | null; saldo?: number | null; ultima_mov?: string | null;
  /** false = inativo (na base ou por decisão aprovada): nunca é sugerido como o que fica se houver alternativa ativa. */
  ativo?: boolean | null;
  duplicidade?: { nivel: NivelDuplicidade; score: number; grupo: number | null; candidatos?: CandidatoConjunto[] } | null;
};
export type Sugestao = { linha: number | null; id: string | null; criterio: string; motivo: string; ordem: number[] };
export type Conjunto<M extends MembroConjunto = MembroConjunto> = { id: string; nivel: NivelDuplicidade; score: number; grupo: string; membros: M[]; sugestao: Sugestao };

export const SEM_GRUPO = '(sem grupo)';
const grupoDe = (m: MembroConjunto): string => txt(m.grupo_atual) || SEM_GRUPO;
const idItem = (m: MembroConjunto): string => txt(m.codigo);

/** Saldo na escala escolhida (a base da Crestani traz o saldo ×1.000.000); null continua null. */
export const saldoNaEscala = (saldo: number | null | undefined, escala = 1): number | null => (saldo == null || !Number.isFinite(Number(saldo)) ? null : Number(saldo) / (escala || 1));

/** Escala provável do saldo: 1.000.000 quando todos os saldos não nulos e diferentes de zero são múltiplos exatos de 1.000.000 (ao menos 3); senão 1. */
export function detectarEscalaSaldo(itens: { saldo?: number | null }[]): number {
  const v: number[] = [];
  for (const it of itens) { const s = Number(it.saldo); if (it.saldo != null && Number.isFinite(s) && s !== 0) v.push(Math.abs(s)); }
  return v.length >= 3 && v.every((s) => s >= 1e6 && s % 1e6 === 0) ? 1e6 : 1;
}

/**
 * Escala do saldo da BASE do projeto: a mesma detecção da Duplicidade (`detectarEscalaSaldo`), sobre os saldos somados por código (itens com o
 * mesmo código em estabelecimentos distintos são um produto; sem código, o item é o próprio produto). Uma fonte só para Duplicidade, Qualidade,
 * mapa de unificações e Excel: com a base ×1.000.000, todos mostram 3 onde a planilha traz 3.000.000.
 */
export function escalaDaBase(itens: { id?: unknown; codigo?: unknown; saldo?: unknown }[]): number {
  const porCodigo = new Map<string, number | null>();
  for (const i of itens) {
    const cod = txt(i.codigo);
    const k = cod ? `c:${cod}` : `i:${txt(i.id)}`;
    const s = i.saldo == null || i.saldo === '' ? NaN : Number(i.saldo);
    const atual = porCodigo.has(k) ? porCodigo.get(k)! : null;
    porCodigo.set(k, Number.isFinite(s) ? (atual ?? 0) + s : atual);
  }
  const saldos: { saldo: number | null }[] = [];
  for (const s of porCodigo.values()) saldos.push({ saldo: s });
  return detectarEscalaSaldo(saldos);
}

/** Campos do cadastro preenchidos (NCM, unidade, princípio ativo e grupo): quem tem mais é o cadastro mais completo. */
const completude = (m: MembroConjunto) => [m.ncm || m.ncm_original, m.unidade, m.principio_ativo, m.grupo_atual].filter((x) => String(x ?? '').trim()).length;

/**
 * Quem a ferramenta sugere manter e por quê. Critérios, nesta ordem, cada um só decide se separa os que ainda empatam:
 * 0) item ativo (o inativo, `ativo = false`, só fica se todos estiverem inativos); 1) maior saldo em estoque (menos estoque a transferir); 2) movimentação mais recente; 3) cadastro mais completo; 4) menor código (o mais antigo).
 * `ordem` = linhas da mais para a menos indicada. Determinístico.
 */
export function sugerirSobrevivente(membros: MembroConjunto[], { escala = 1 }: { escala?: number } = {}): Sugestao {
  const saldo = (m: MembroConjunto) => { const s = saldoNaEscala(m.saldo, escala); return s != null && s > 0 ? s : 0; };
  type Crit = { id: string; v: (m: MembroConjunto) => any; melhor: (a: any, b: any) => number; motivo: (a: any, b: any) => string };
  const criterios: Crit[] = [
    { id: 'ativo', v: (m) => (m.ativo === false ? 0 : 1), melhor: (a, b) => a - b, motivo: () => 'item ativo (o outro código está inativo)' },
    { id: 'saldo', v: saldo, melhor: (a, b) => a - b, motivo: (a, b) => `maior saldo em estoque (${numeroBr(a)} contra ${numeroBr(b)})` },
    { id: 'movimentacao', v: (m) => m.ultima_mov || '', melhor: (a, b) => (a < b ? -1 : a > b ? 1 : 0), motivo: (a, b) => `movimentação mais recente (${dataBr(a)} contra ${b ? dataBr(b) : 'sem data'})` },
    { id: 'completude', v: (m) => [completude(m), String(m.descricao ?? '').length], melhor: (a, b) => a[0] - b[0] || a[1] - b[1], motivo: () => 'cadastro mais completo' },
    { id: 'codigo', v: (m) => String(m.codigo ?? ''), melhor: (a, b) => colador.compare(b, a), motivo: () => 'menor código (cadastro mais antigo)' },
  ];
  const ordenados = [...membros].sort((x, y) => { for (const c of criterios) { const r = c.melhor(c.v(y), c.v(x)); if (r) return r; } return x.linha - y.linha; });
  const [topo, segundo] = ordenados;
  let criterio = 'unico'; let motivo = '';
  if (segundo) {
    criterio = 'linha'; motivo = 'cadastros iguais nos critérios de escolha: sugerido o primeiro da planilha';
    for (const c of criterios) { if (c.melhor(c.v(topo), c.v(segundo)) !== 0) { criterio = c.id; motivo = c.motivo(c.v(topo), c.v(segundo)); break; } }
  }
  return { linha: topo?.linha ?? null, id: topo ? idItem(topo) : null, criterio, motivo, ordem: ordenados.map((m) => m.linha) };
}

/**
 * Conjuntos de duplicados entre os itens dados (só os com indicação estruturada em `duplicidade`). Cada item se liga ao seu candidato mais forte e os itens do mesmo
 * grupo forte (indicação alta ou idêntico) ficam juntos; os conjuntos são os componentes ligados. Candidato fora dos itens dados é ignorado e conjunto de um item só
 * é descartado. Cada conjunto: { id, nivel, score, grupo, membros (o sugerido primeiro), sugestao }, dos mais fortes aos mais fracos.
 */
export function montarConjuntos<M extends MembroConjunto>(itens: M[], { escala = 1 }: { escala?: number } = {}): Conjunto<M>[] {
  const porLinha = new Map<number, M>(); for (const it of itens) if (it.duplicidade) porLinha.set(it.linha, it);
  const pai = new Map<number, number>([...porLinha.keys()].map((l) => [l, l]));
  const raiz = (x: number): number => { while (pai.get(x) !== x) { pai.set(x, pai.get(pai.get(x)!)!); x = pai.get(x)!; } return x; };
  const uniao = (a: number, b: number) => { const x = raiz(a); const y = raiz(b); if (x !== y) pai.set(Math.max(x, y), Math.min(x, y)); };
  const primeiroDoGrupo = new Map<number, number>();
  for (const it of porLinha.values()) {
    const d = it.duplicidade!;
    if (d.grupo != null) { const g0 = primeiroDoGrupo.get(d.grupo); if (g0 === undefined) primeiroDoGrupo.set(d.grupo, it.linha); else uniao(it.linha, g0); }
    const topo = d.candidatos?.[0]; if (topo && porLinha.has(topo.linha)) uniao(it.linha, topo.linha);
  }
  const comp = new Map<number, M[]>();
  for (const l of porLinha.keys()) { const r = raiz(l); const a = comp.get(r); if (a) a.push(porLinha.get(l)!); else comp.set(r, [porLinha.get(l)!]); }
  const conjuntos: Conjunto<M>[] = [];
  for (const lista of comp.values()) {
    if (lista.length < 2) continue;
    const sug = sugerirSobrevivente(lista, { escala }); const pos = new Map(sug.ordem.map((l, i) => [l, i]));
    const membros = [...lista].sort((a, b) => pos.get(a.linha)! - pos.get(b.linha)!);
    const nivel = lista.reduce<NivelDuplicidade>((n, m) => (NIVEL_ORDEM[m.duplicidade!.nivel] < NIVEL_ORDEM[n] ? m.duplicidade!.nivel : n), 'POSSIVEL');
    const contagem = new Map<string, number>(); for (const m of lista) { const g = grupoDe(m); contagem.set(g, (contagem.get(g) || 0) + 1); }
    const grupo = [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0][0];
    // o identificador do conjunto é o menor código: não muda de uma extração para outra
    const menorCodigo = lista.map((m) => idItem(m) || `L${m.linha}`).sort((a, b) => colador.compare(a, b))[0];
    conjuntos.push({ id: `c:${menorCodigo}`, nivel, score: lista.reduce((mx, m) => Math.max(mx, Number(m.duplicidade!.score) || 0), -Infinity), grupo, membros, sugestao: sug });
  }
  return conjuntos.sort((a, b) => NIVEL_ORDEM[a.nivel] - NIVEL_ORDEM[b.nivel] || b.membros.length - a.membros.length || a.membros[0].linha - b.membros[0].linha);
}
