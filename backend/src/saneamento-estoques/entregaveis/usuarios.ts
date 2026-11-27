/**
 * Nome do usuário no lugar do e-mail nos entregáveis. As decisões guardam o e-mail de quem decidiu; o material do cliente mostra o nome
 * do cadastro de usuários quando houver (sem nome, fica o e-mail; "sistema" vira "Sistema").
 */
import type { DadosEntrega } from '../dados/portas';

type PrismaUsuarios = { user?: { findMany?: (a: unknown) => Promise<{ email: string; name: string | null }[]> } };
export type NomesDeUsuarios = Map<string, string>;

const ehEmail = (v: unknown): v is string => typeof v === 'string' && /^[^\s@]+@[^\s@]+$/.test(v.trim());

/** E-mail (minúsculo) → nome, só dos usuários com nome no cadastro. Sem a tabela (testes), mapa vazio. */
export async function nomesDeUsuarios(prisma: unknown, valores: Iterable<unknown>): Promise<NomesDeUsuarios> {
  const emails = [...new Set([...valores].filter(ehEmail).map((e) => e.trim().toLowerCase()))];
  const u = (prisma as PrismaUsuarios).user;
  if (!emails.length || typeof u?.findMany !== 'function') return new Map();
  const linhas = await u.findMany({ where: { email: { in: emails, mode: 'insensitive' } }, select: { email: true, name: true } });
  const m: NomesDeUsuarios = new Map();
  for (const l of linhas) if (l.name?.trim()) m.set(l.email.toLowerCase(), l.name.trim());
  return m;
}

/** Nome de quem fez: o do cadastro, senão o próprio texto ("sistema" → "Sistema"). */
export function nomeDe(nomes: NomesDeUsuarios, v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  if (s === 'sistema') return 'Sistema';
  return (ehEmail(s) && nomes.get(s.toLowerCase())) || s;
}

/** Campos de quem fez, em cada lista dos dados da entrega. */
const CAMPOS: Record<string, string[]> = {
  decisoes: ['usuario'], casos: ['decidido_por', 'responsavel'], impactosSped: ['responsavel'], vinculos: ['criado_por'], importacoes: ['usuario'],
};
const CAMPOS_PROJETO = ['responsavel', 'atividades_confirmadas_por'];

/** Troca, nos dados da entrega, o e-mail pelo nome (cópia das linhas que mudam; as listas são da requisição). */
export async function comNomesDeUsuarios(prisma: unknown, dados: DadosEntrega): Promise<DadosEntrega> {
  const valores: unknown[] = CAMPOS_PROJETO.map((c) => dados.projeto[c]);
  for (const [lista, campos] of Object.entries(CAMPOS)) for (const l of (dados as unknown as Record<string, Record<string, unknown>[]>)[lista] ?? []) for (const c of campos) valores.push(l[c]);
  const nomes = await nomesDeUsuarios(prisma, valores);
  if (!nomes.size) return dados;
  const trocar = (l: Record<string, unknown>, campos: string[]) => {
    let r = l;
    for (const c of campos) if (ehEmail(l[c]) && nomes.has(String(l[c]).trim().toLowerCase())) { if (r === l) r = { ...l }; r[c] = nomeDe(nomes, l[c]); }
    return r;
  };
  const out = { ...dados, projeto: trocar(dados.projeto, CAMPOS_PROJETO) } as DadosEntrega;
  for (const [lista, campos] of Object.entries(CAMPOS)) {
    const l = (dados as unknown as Record<string, Record<string, unknown>[]>)[lista];
    if (Array.isArray(l)) (out as unknown as Record<string, unknown>)[lista] = l.map((x) => trocar(x, campos));
  }
  return out;
}

/** Política: aprovador da identificação (um ou vários, separados por vírgula) e o "Aprovada por" de cada regra, pelo nome. */
export async function politicaComNomesDeUsuarios<T extends { identificacao: { aprovador: string | null }; regras: { aprovadaPor?: string | null }[] }>(prisma: unknown, d: T): Promise<T> {
  const aprovadores = (d.identificacao.aprovador ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const nomes = await nomesDeUsuarios(prisma, [...aprovadores, ...d.regras.map((r) => r.aprovadaPor)]);
  if (!nomes.size) return d;
  return {
    ...d,
    identificacao: { ...d.identificacao, aprovador: aprovadores.length ? [...new Set(aprovadores.map((a) => nomeDe(nomes, a)))].join(', ') : d.identificacao.aprovador },
    regras: d.regras.map((r) => (r.aprovadaPor ? { ...r, aprovadaPor: nomeDe(nomes, r.aprovadaPor) } : r)),
  };
}
