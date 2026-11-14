import { describe, expect, it } from 'vitest';
import { SaneamentoService } from './saneamento.service';

function montar(updatedAt: Date) {
  let gravado = 0;
  const prisma = {
    saneamentoProjeto: {
      findUnique: async () => ({ id: 'P1', empresa_id: 'E1', updatedAt, estado_json: '{}' }),
      update: async () => { gravado += 1; return { updatedAt: new Date(updatedAt.getTime() + 1000) }; },
    },
  };
  return { s: new SaneamentoService(prisma as never, {} as never), gravados: () => gravado };
}

describe('saneamento: duas pessoas no mesmo projeto', () => {
  it('grava quando a versão vista é a atual e devolve a nova versão', async () => {
    const t = new Date('2026-11-13T20:00:00.123Z');
    const { s, gravados } = montar(t);
    const r = await s.salvar('P1', { estado: { a: 1 }, versao: t.toISOString() }, 'E1');
    expect(gravados()).toBe(1);
    expect(r.salvo_em).toBe('2026-11-13T20:00:01.123Z');
  });

  it('recusa quando outra pessoa salvou depois (não apaga as decisões dela)', async () => {
    const { s, gravados } = montar(new Date('2026-11-13T20:05:00.000Z'));
    await expect(s.salvar('P1', { estado: { a: 2 }, versao: '2026-11-13T20:00:00.123Z' }, 'E1')).rejects.toThrow('Outra pessoa salvou este projeto');
    expect(gravados()).toBe(0);
  });
});
