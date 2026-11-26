/**
 * Atividades do cliente (lista fechada) e sugestão a partir dos CNAEs do cadastro do CNPJ.
 * Função pura. A sugestão NUNCA confirma nada: a trava de atividades é do consultor (plano, seção 2).
 * Fonte dos códigos: CNAE 2.0 (IBGE/Concla), divisões, grupos e classes citados no motivo de cada regra.
 * CNAE sem regra fica fora (sem chute) e é devolvido em `semMapeamento`.
 */

export const ATIVIDADES = [
  'PRODUCAO_AGRICOLA', 'PECUARIA', 'PRODUCAO_FLORESTAL', 'REVENDA_INSUMOS', 'COMERCIO_ATACADISTA', 'COMERCIO_VAREJISTA',
  'INDUSTRIALIZACAO', 'VENDA_RESIDUOS', 'PRESTACAO_SERVICO', 'TRANSPORTE', 'IMPORTACAO', 'EXPORTACAO', 'ARMAZENAGEM',
] as const;
export type Atividade = (typeof ATIVIDADES)[number];

export const ROTULO_ATIVIDADE: Record<Atividade, string> = {
  PRODUCAO_AGRICOLA: 'Produção agrícola (lavoura, sementes e mudas)',
  PECUARIA: 'Pecuária (criação de animais)',
  PRODUCAO_FLORESTAL: 'Produção florestal (silvicultura e extração)',
  REVENDA_INSUMOS: 'Revenda de insumos agropecuários',
  COMERCIO_ATACADISTA: 'Comércio atacadista',
  COMERCIO_VAREJISTA: 'Comércio varejista',
  INDUSTRIALIZACAO: 'Industrialização e beneficiamento',
  VENDA_RESIDUOS: 'Venda de resíduos e sucata',
  PRESTACAO_SERVICO: 'Prestação de serviço (inclui apoio agropecuário e manutenção)',
  TRANSPORTE: 'Transporte de cargas',
  IMPORTACAO: 'Importação',
  EXPORTACAO: 'Exportação',
  ARMAZENAGEM: 'Armazenagem',
};

export const ehAtividade = (v: unknown): v is Atividade => typeof v === 'string' && (ATIVIDADES as readonly string[]).includes(v);

/** Opções típicas do produtor rural pessoa física (lista marcada à mão; o Sintegra está fora do escopo). */
export const atividadesPF: Atividade[] = ['PRODUCAO_AGRICOLA', 'PECUARIA', 'PRODUCAO_FLORESTAL', 'PRESTACAO_SERVICO', 'ARMAZENAGEM', 'VENDA_RESIDUOS', 'EXPORTACAO', 'IMPORTACAO'];

type Regra = { prefixo: string; atividades: Atividade[]; motivo: string };

/** O prefixo mais longo vale (subclasse > classe > grupo > divisão). Só dígitos, sem pontuação. */
const REGRAS: Regra[] = [
  { prefixo: '011', atividades: ['PRODUCAO_AGRICOLA'], motivo: 'CNAE 01.1: cultivo de lavouras temporárias' },
  { prefixo: '012', atividades: ['PRODUCAO_AGRICOLA'], motivo: 'CNAE 01.2: horticultura e floricultura' },
  { prefixo: '013', atividades: ['PRODUCAO_AGRICOLA'], motivo: 'CNAE 01.3: cultivo de lavouras permanentes' },
  { prefixo: '014', atividades: ['PRODUCAO_AGRICOLA'], motivo: 'CNAE 01.4: produção de sementes e mudas certificadas' },
  { prefixo: '015', atividades: ['PECUARIA'], motivo: 'CNAE 01.5: pecuária' },
  { prefixo: '0161', atividades: ['PRESTACAO_SERVICO'], motivo: 'CNAE 01.61: atividades de apoio à agricultura' },
  { prefixo: '0162', atividades: ['PRESTACAO_SERVICO'], motivo: 'CNAE 01.62: atividades de apoio à pecuária' },
  { prefixo: '0163', atividades: ['PRESTACAO_SERVICO'], motivo: 'CNAE 01.63: atividades de pós-colheita' },
  { prefixo: '021', atividades: ['PRODUCAO_FLORESTAL'], motivo: 'CNAE 02.1: produção florestal em florestas plantadas' },
  { prefixo: '022', atividades: ['PRODUCAO_FLORESTAL'], motivo: 'CNAE 02.2: produção florestal em florestas nativas' },
  // Indústria de transformação: divisões 10 a 32 (a divisão 33, manutenção e instalação de máquinas, é serviço)
  ...Array.from({ length: 23 }, (_, i) => 10 + i).map((d): Regra => ({ prefixo: String(d), atividades: ['INDUSTRIALIZACAO'], motivo: `CNAE divisão ${d}: indústria de transformação` })),
  { prefixo: '33', atividades: ['PRESTACAO_SERVICO'], motivo: 'CNAE divisão 33: manutenção, reparação e instalação de máquinas e equipamentos' },
  { prefixo: '383', atividades: ['VENDA_RESIDUOS'], motivo: 'CNAE 38.3: recuperação de materiais (metálicos e não metálicos); as demais classes da divisão 38 (coleta, tratamento e disposição) ficam sem regra' },
  { prefixo: '452', atividades: ['PRESTACAO_SERVICO'], motivo: 'CNAE 45.2: manutenção e reparação de veículos automotores' },
  { prefixo: '46', atividades: ['COMERCIO_ATACADISTA'], motivo: 'CNAE divisão 46: comércio por atacado' },
  { prefixo: '461', atividades: [], motivo: 'CNAE 46.1: representantes e agentes do comércio (intermediação, não é comércio próprio)' },
  { prefixo: '4683', atividades: ['REVENDA_INSUMOS', 'COMERCIO_ATACADISTA'], motivo: 'CNAE 46.83-4: atacadista de defensivos agrícolas, adubos, fertilizantes e corretivos do solo' },
  { prefixo: '4687', atividades: ['VENDA_RESIDUOS', 'COMERCIO_ATACADISTA'], motivo: 'CNAE 46.87-7: atacadista de resíduos e sucatas' },
  { prefixo: '47', atividades: ['COMERCIO_VAREJISTA'], motivo: 'CNAE divisão 47: comércio varejista' },
  { prefixo: '4930', atividades: ['TRANSPORTE'], motivo: 'CNAE 49.30-2: transporte rodoviário de carga (49.2 e demais, de passageiros, ficam sem regra)' },
  { prefixo: '521', atividades: ['ARMAZENAGEM'], motivo: 'CNAE 52.1: armazenamento' },
];

export const soDigitosCnae = (c: unknown) => String(c ?? '').replace(/\D/g, '');

/** CNAE em 7 dígitos (subclasse) ou 5 (classe) formatado para exibição (0111-3/01). */
export function formatarCnae(c: string): string {
  const d = soDigitosCnae(c);
  if (d.length >= 7) return `${d.slice(0, 4)}-${d[4]}/${d.slice(5, 7)}`;
  if (d.length === 5) return `${d.slice(0, 4)}-${d[4]}`;
  return d;
}

export function regraDoCnae(cnae: string): Regra | null {
  const d = soDigitosCnae(cnae);
  if (d.length < 4) return null;
  let melhor: Regra | null = null;
  for (const r of REGRAS) if (d.startsWith(r.prefixo) && (!melhor || r.prefixo.length > melhor.prefixo.length)) melhor = r;
  return melhor;
}

export type SugestaoAtividade = { atividade: Atividade; cnae: string; tipo: 'PRINCIPAL' | 'SECUNDARIA'; motivo: string };
export type ResultadoAtividades = { sugestoes: SugestaoAtividade[]; semMapeamento: { cnae: string; tipo: 'PRINCIPAL' | 'SECUNDARIA' }[] };

export function sugerirAtividades(cnaePrincipal: string | null | undefined, cnaesSecundarios: string[] = []): ResultadoAtividades {
  const sugestoes: SugestaoAtividade[] = []; const semMapeamento: ResultadoAtividades['semMapeamento'] = [];
  const vistos = new Set<string>();
  const lista: { cnae: string; tipo: 'PRINCIPAL' | 'SECUNDARIA' }[] = [];
  if (cnaePrincipal && soDigitosCnae(cnaePrincipal)) lista.push({ cnae: soDigitosCnae(cnaePrincipal), tipo: 'PRINCIPAL' });
  for (const c of cnaesSecundarios) { const d = soDigitosCnae(c); if (d) lista.push({ cnae: d, tipo: 'SECUNDARIA' }); }
  for (const { cnae, tipo } of lista) {
    const k = `${cnae}|${tipo}`; if (vistos.has(k)) continue; vistos.add(k);
    const r = regraDoCnae(cnae);
    if (!r || r.atividades.length === 0) { semMapeamento.push({ cnae, tipo }); continue; }
    for (const atividade of r.atividades) sugestoes.push({ atividade, cnae, tipo, motivo: r.motivo });
  }
  return { sugestoes, semMapeamento };
}

/** Atividades distintas da sugestão, na ordem do cadastro (para pré-marcar a tela). */
export const atividadesDistintas = (r: ResultadoAtividades): Atividade[] => [...new Set(r.sugestoes.map((s) => s.atividade))];

export type MapaDeAtividades = { mapeadas: { codigo: string; atividade: Atividade; rotulo: string }[]; semMapeamento: string[] };

/** Para a tela de confirmação: quais CNAEs viram atividade (e qual) e quais ficam sem efeito. Um código pode gerar mais de uma atividade. */
export function mapaDeAtividades(codigosConfirmados: string[]): MapaDeAtividades {
  const mapeadas: MapaDeAtividades['mapeadas'] = []; const semMapeamento: string[] = []; const vistos = new Set<string>();
  for (const bruto of codigosConfirmados) {
    const codigo = soDigitosCnae(bruto);
    if (!codigo || vistos.has(codigo)) continue; vistos.add(codigo);
    const r = regraDoCnae(codigo);
    if (!r || r.atividades.length === 0) { semMapeamento.push(codigo); continue; }
    for (const atividade of r.atividades) mapeadas.push({ codigo, atividade, rotulo: ROTULO_ATIVIDADE[atividade] });
  }
  return { mapeadas, semMapeamento };
}
