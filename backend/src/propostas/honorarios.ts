import { plural } from '../common/plural';
/**
 * Calculadora de honorários do BPO fiscal. A tabela (valores) é do escritório: fica em ParametroSistema e o administrador muda
 * pela tela. Os valores iniciais são de EXEMPLO, para a tela funcionar; a tela avisa enquanto ninguém salvou a tabela.
 */
export type TabelaHonorarios = {
  /** Base mensal por regime (R$). */
  base: Record<string, number>;
  /** Por nota fiscal acima da franquia, por mês (R$). */
  por_nota: number;
  franquia_notas: number;
  /** Por estabelecimento (CNPJ) além do primeiro (R$/mês). */
  por_estabelecimento: number;
  /** Acréscimo mensal por módulo do BPO ligado (R$). */
  modulos: Record<string, number>;
  /** Multiplicador pela complexidade. */
  complexidade: Record<string, number>;
  /** Valor da hora para diagnóstico pontual (R$). */
  valor_hora: number;
  exemplo?: boolean;
};

export const TABELA_EXEMPLO: TabelaHonorarios = {
  base: { 'Simples Nacional': 900, 'Lucro Presumido': 1800, 'Lucro Real': 3500, 'Produtor rural PF': 1200 },
  por_nota: 1.5,
  franquia_notas: 300,
  por_estabelecimento: 400,
  modulos: { XML: 250, MONITORAMENTO: 350, OBRIGACOES: 300, TAREFAS: 0, ARQUIVOS: 100 },
  complexidade: { BAIXA: 0.9, MEDIA: 1, ALTA: 1.35 },
  valor_hora: 350,
  exemplo: true,
};

export type EntradaHonorarios = { regime?: string; notas_mes?: number; estabelecimentos?: number; modulos?: string[]; complexidade?: string };

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
const centavos = (v: number) => Math.round(v * 100) / 100;

/** Honorário mensal sugerido, com cada parcela da conta (para a proposta mostrar de onde veio o número). */
export function calcularHonorarioMensal(t: TabelaHonorarios, e: EntradaHonorarios) {
  const base = t.base[e.regime ?? ''] ?? Math.min(...Object.values(t.base));
  const notasExtras = Math.max(0, n(e.notas_mes) - n(t.franquia_notas));
  const volume = notasExtras * n(t.por_nota);
  const estabelecimentos = Math.max(0, n(e.estabelecimentos || 1) - 1) * n(t.por_estabelecimento);
  const modulos = (e.modulos ?? []).reduce((s, m) => s + n(t.modulos[m]), 0);
  const fator = t.complexidade[e.complexidade ?? 'MEDIA'] ?? 1;
  const subtotal = base + volume + estabelecimentos + modulos;
  return {
    parcelas: [
      { descricao: `Base do regime (${e.regime || 'não informado'})`, valor: centavos(base) },
      ...(volume ? [{ descricao: `${plural(notasExtras, 'nota', 'notas')} acima da franquia de ${t.franquia_notas}`, valor: centavos(volume) }] : []),
      ...(estabelecimentos ? [{ descricao: `${plural(n(e.estabelecimentos) - 1, 'estabelecimento', 'estabelecimentos')} a mais`, valor: centavos(estabelecimentos) }] : []),
      ...(modulos ? [{ descricao: `Módulos do BPO (${(e.modulos ?? []).join(', ')})`, valor: centavos(modulos) }] : []),
    ],
    fator,
    total: centavos(subtotal * fator),
  };
}

/** Confere a tabela enviada pela tela: números não negativos, sem chaves estranhas. */
export function validarTabela(bruta: unknown): TabelaHonorarios {
  const b = (bruta && typeof bruta === 'object' ? bruta : {}) as Record<string, unknown>;
  const mapa = (v: unknown, chaves: string[]) => Object.fromEntries(chaves.map((k) => [k, n((v as Record<string, unknown> | undefined)?.[k])]));
  const complex = mapa(b.complexidade, ['BAIXA', 'MEDIA', 'ALTA']);
  for (const k of Object.keys(complex)) if (!complex[k]) complex[k] = 1;
  return {
    base: mapa(b.base, Object.keys(TABELA_EXEMPLO.base)),
    por_nota: n(b.por_nota),
    franquia_notas: Math.round(n(b.franquia_notas)),
    por_estabelecimento: n(b.por_estabelecimento),
    modulos: mapa(b.modulos, Object.keys(TABELA_EXEMPLO.modulos)),
    complexidade: complex,
    valor_hora: n(b.valor_hora),
  };
}
