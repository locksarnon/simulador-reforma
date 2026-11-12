import { describe, expect, it, vi } from 'vitest';
import { dataDoEvento, EscritorioService, protocoloDe } from './escritorio.service';

const ok = (dados: unknown, demonstracao = false) => ({ http: 200, status: 200, dados, mensagens: [], bruto: '', demonstracao });

function montar(respostas: Record<string, unknown[]>, extra: { modo?: string } = {}) {
  const eventos: Record<string, unknown>[] = [];
  const consultas: string[] = [];
  const chamadas: { servico: string; dados: string; contribuinte?: unknown }[] = [];
  const m = {
    modo: async () => extra.modo ?? 'PRODUCAO',
    empresasDoBpoPublico: async () => ['E1', 'E2', 'E3'],
    consultarPelaRotina: vi.fn(async (id: string, chave: string) => { consultas.push(`${id}:${chave}`); }),
    chamarDoEscritorio: vi.fn(async (p: { servico: string; dados: string; contribuinte?: unknown }) => { chamadas.push(p); const fila = respostas[p.servico] ?? []; return fila.length > 1 ? fila.shift() : fila[0]; }),
  };
  const prisma = {
    empresa: { findMany: async () => [{ id: 'E1', cnpj_cpf: '11.111.111/0001-11', razao_social: 'UM', arquivado_em: null }, { id: 'E2', cnpj_cpf: '22222222000122', razao_social: 'DOIS', arquivado_em: null }, { id: 'E3', cnpj_cpf: '123.456.789-09', razao_social: 'PF', arquivado_em: null }] },
    eventoReceita: {
      findUnique: async ({ where }: { where: { empresa_id_evento: { empresa_id: string; evento: string } } }) => eventos.find((e) => e.empresa_id === where.empresa_id_evento.empresa_id && e.evento === where.empresa_id_evento.evento) ?? null,
      upsert: async ({ create, update, where }: { create: Record<string, unknown>; update: Record<string, unknown>; where: { empresa_id_evento: { empresa_id: string; evento: string } } }) => { const a = eventos.find((e) => e.empresa_id === where.empresa_id_evento.empresa_id && e.evento === where.empresa_id_evento.evento); if (a) return Object.assign(a, update); eventos.push({ ...create }); return create; },
      update: async ({ where, data }: { where: { empresa_id_evento: { empresa_id: string; evento: string } }; data: Record<string, unknown> }) => Object.assign(eventos.find((e) => e.empresa_id === where.empresa_id_evento.empresa_id && e.evento === where.empresa_id_evento.evento)!, data),
      findMany: async () => eventos,
    },
  };
  const s = new EscritorioService(prisma as never, m as never);
  s.pausaMs = 0;
  return { s, m, eventos, consultas, chamadas };
}

describe('escritório: eventos de atualização', () => {
  it('lê o protocolo mesmo do JSON malformado do ambiente de demonstração', () => {
    expect(protocoloDe('{"protocolo":"q90n3455-fa91","TempoEsperaMedioEmMs":277,"TempoLimiteEmMin":5')).toEqual({ protocolo: 'q90n3455-fa91', TempoEsperaMedioEmMs: 277 });
    expect(protocoloDe({ protocolo: 'P', TempoEsperaMedioEmMs: 10 })).toEqual({ protocolo: 'P', TempoEsperaMedioEmMs: 10 });
  });

  it('lê a data AAMMDD; vazio ou "x" não é evento', () => {
    expect(dataDoEvento('230417')!.toISOString().slice(0, 10)).toBe('2023-04-17');
    expect(dataDoEvento('')).toBeNull();
    expect(dataDoEvento('x')).toBeNull();
  });

  it('pede o lote só com os CNPJs, espera o 202, grava a novidade e consulta o assunto sozinho uma vez', async () => {
    const t = montar({
      SOLICEVENTOSPJ132: [ok({ protocolo: 'P1', TempoEsperaMedioEmMs: 300 })],
      OBTEREVENTOSPJ134: [{ http: 202, status: 202, dados: null, mensagens: [], bruto: '', demonstracao: false }, ok([['11111111000111', '261110'], ['22222222000122', '']])],
    });
    const r = await t.s.atualizarEventos(true);
    const sol = t.chamadas.find((c) => c.servico === 'SOLICEVENTOSPJ132')!;
    expect(sol.contribuinte).toEqual({ numero: '11111111000111,22222222000122', tipo: 4 });
    expect(r).toMatchObject({ clientes: 2, novidades: 3 });
    expect(t.consultas).toEqual(['E1:dctfweb-recibo', 'E1:caixa-postal', 'E1:pagamentos']);
    expect(t.eventos.every((e) => e.atendido_em)).toBe(true);
    t.consultas.length = 0;
    await t.s.atualizarEventos(true);
    expect(t.consultas).toEqual([]);
  });

  it('na demonstração não grava nada em cliente', async () => {
    const t = montar({ SOLICEVENTOSPJ132: [ok({ protocolo: 'P1' }, true)], OBTEREVENTOSPJ134: [ok([['11111111000111', '261110']], true)] });
    const r = await t.s.atualizarEventos(true);
    expect(r.novidades).toBe(0);
    expect(t.eventos).toHaveLength(0);
  });
});

describe('escritório: Redesim', () => {
  it('lista os vínculos marcando quem já é cliente', async () => {
    const t = montar({ CONSVINCULOS261: [ok({ cnpjs: [{ cnpj: '22222222000122', tipoEstabelecimento: 'Matriz', situacaoCadastral: { descricao: 'Ativa' }, uf: 'MT', nomeMunicipio: 'SORRISO' }, { cnpj: '33333333000133', tipoEstabelecimento: 'Filial', situacaoCadastral: { descricao: 'Ativa' }, uf: 'GO' }] })] });
    const r = await t.s.vinculos();
    expect(r.vinculos).toEqual([
      expect.objectContaining({ cnpj: '22222222000122', municipio: 'SORRISO', cliente: expect.objectContaining({ id: 'E2' }) }),
      expect.objectContaining({ cnpj: '33333333000133', cliente: null }),
    ]);
  });

  it('comprovante de renúncia sai em PDF; erro do Serpro vira mensagem', async () => {
    const t = montar({ COMPRENUNCIA264: [ok('JVBERi0xLjMK' + 'A'.repeat(60))] });
    const a = await t.s.comprovanteRenuncia('2558');
    expect(a.buffer.subarray(0, 4).toString()).toBe('%PDF');
    await expect(t.s.comprovanteRenuncia('abc')).rejects.toThrow(/inválido/);
  });
});
