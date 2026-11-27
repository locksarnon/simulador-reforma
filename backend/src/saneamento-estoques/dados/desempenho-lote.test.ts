/** Desempenho do lote de finalidades (QA: 7 casos de ~3,7 mil itens em 55,7 s): o trabalho dos itens é gravado em bloco, não item a item. */
import { describe, expect, it } from 'vitest';
import { BLOCO_APROVACAO, SanCasosService } from './casos.service';
import { SanImportacaoService } from './importacao.service';
import type { ImportadorPort, ItemImportado } from './portas';
import { criarPrismaFalso, liberarFase2 } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };
const ARQ = { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' };
const item = (codigo: string, grupo: string, linha: number): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo, ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha,
});
type Sql = { sql: string; values: unknown[] };

/** Prisma em memória com o UPDATE ... FROM jsonb_to_recordset da aprovação emulado (conferência de versão) e contagem de idas ao banco. */
function montar(n: number, grupos: number) {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', erp: 'SAP', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const fila = { itens: Array.from({ length: n }, (_, i) => item(`C${i}`, `G${i % grupos}`, i + 1)) };
  const importador: ImportadorPort = { ler: async () => ({ itens: fila.itens, mapeamento: {}, relatorio: { aceitas: fila.itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const projetos = new SanProjetoService(prisma as never);
  return { prisma, db, projetos, casos: new SanCasosService(prisma as never, projetos), importacao: new SanImportacaoService(prisma as never, projetos, importador) };
}
function ligarSqlBruto(c: ReturnType<typeof montar>, antes?: () => void) {
  const brutos: string[] = [];
  c.prisma.$executeRaw = async (q: Sql) => {
    brutos.push(q.sql);
    antes?.();
    let n = 0;
    for (const l of JSON.parse(String(q.values[0])) as Record<string, unknown>[]) {
      const i = c.db.sanItem.find((x) => x.id === l.id);
      if (!i || i.versao !== l.versao) continue;
      for (const k of ['trabalho', 'descricao', 'grupo', 'finalidade', 'tambem_usado_como', 'conjunto_chave', 'ativo']) i[k] = l[k];
      i.versao += 1; n++;
    }
    return n;
  };
  return brutos;
}
function contar(prisma: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const n: Record<string, number> = {};
  for (const m of Object.keys(prisma)) {
    const mod = prisma[m];
    if (!mod || typeof mod !== 'object') continue;
    for (const k of Object.keys(mod)) { const f = mod[k]; if (typeof f === 'function') mod[k] = (...a: unknown[]) => { n[`${m}.${k}`] = (n[`${m}.${k}`] ?? 0) + 1; return f(...a); }; }
  }
  return n;
}
async function comFinalidades(c: ReturnType<typeof montar>) {
  const p = await c.projetos.criar('D1', USER);
  await c.projetos.confirmarAtividades(p.id, 1, USER);
  await c.importacao.confirmar(p.id, ARQ, undefined, [], USER);
  liberarFase2(c.db, p.id);
  const porGrupo = new Map<string, string[]>();
  for (const i of c.db.sanItem) { const l = porGrupo.get(i.grupo) ?? []; l.push(i.id); porGrupo.set(i.grupo, l); }
  await c.casos.registrarResultado(p.id, { camada: 'FINALIDADE', analisados: c.db.sanItem.length, semDados: null, semProblema: [], casos: [...porGrupo].map(([g, itens]) => ({ camada: 'FINALIDADE', tipo: 'FINALIDADE_GRUPO', itens, problema: `Finalidade ${g}`, evidencia: [], atual: { finalidade: null }, proposta: { finalidade: 'REVENDA' }, justificativa: 'Finalidade do grupo.', fundamento: null, impactos: [], origem: 'REGRA', afeta: ['TRIBUTARIO', 'OBRIGACOES'] })) } as never, { interno: true });
  const previa = await c.casos.lotePrevia(p.id, { filtro: { camada: 'FINALIDADE' } });
  return { projetoId: p.id, versoes: Object.fromEntries(previa.aprovaveis.map((a) => [a.casoId, a.versao])) };
}

describe('lote de finalidades: gravação em bloco', () => {
  it('7 casos de 530 itens (3.710): um UPDATE por caso, nenhum por item; idas ao banco caem de 3.865 para menos de 200', async () => {
    const c = montar(3710, 7);
    const { projetoId, versoes } = await comFinalidades(c);
    const brutos = ligarSqlBruto(c);
    const n = contar(c.prisma as never);
    const r = await c.casos.loteAprovar(projetoId, { filtro: { camada: 'FINALIDADE' }, versoes, orcamentoMs: 60_000 }, USER);
    expect(r).toMatchObject({ aprovados: 7, restantes: [] });
    expect(n['sanItem.updateMany'] ?? 0).toBe(0);
    expect(brutos.filter((s) => s.includes('UPDATE "SanItem"'))).toHaveLength(7); // 530 itens cabem num bloco de BLOCO_APROVACAO
    expect(BLOCO_APROVACAO).toBeGreaterThanOrEqual(1000);
    const total = Object.values(n).reduce((s, x) => s + x, 0) + brutos.length;
    console.log(`[lote finalidades] 3.710 itens: ${total} idas ao banco (antes 3.865, das quais 3.710 UPDATE por item)`);
    expect(total).toBeLessThan(200);
    // As regras não mudam: todos com a finalidade, versão +1 e uma decisão por item.
    expect(c.db.sanItem.every((i) => i.finalidade === 'REVENDA' && i.trabalho.finalidade === 'REVENDA' && i.versao === 2)).toBe(true);
    expect(c.db.sanDecisao.filter((d) => d.campo === 'finalidade' && d.tipo === 'aprovar')).toHaveLength(3710);
    expect(c.db.sanCaso.every((x) => x.situacao === 'APROVADO')).toBe(true);
  }, 120_000);

  it('item alterado por outra pessoa no meio: o UPDATE em bloco casa menos linhas, o caso vira exceção e nada dele é gravado', async () => {
    const c = montar(40, 2);
    const { projetoId, versoes } = await comFinalidades(c);
    let mexeu = false;
    ligarSqlBruto(c, () => { if (!mexeu) { mexeu = true; c.db.sanItem[0].versao += 5; } });
    const r = await c.casos.loteAprovar(projetoId, { filtro: { camada: 'FINALIDADE' }, versoes }, USER);
    expect(r.aprovados).toBe(1);
    expect(r.excecoes).toHaveLength(1);
    expect(r.excecoes[0].motivo).toMatch(/alterado por outra pessoa/);
    const g0 = c.db.sanItem.filter((i) => i.grupo === c.db.sanItem[0].grupo);
    expect(g0.every((i) => i.finalidade == null)).toBe(true);
  });
});
