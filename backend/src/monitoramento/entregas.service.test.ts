import { describe, expect, it } from 'vitest';
import { OBRIGACOES } from './catalogo';
import { DECLARACOES_SEM_API, EntregasService } from './entregas.service';

function montar() {
  const entregas: Record<string, unknown>[] = [];
  const arquivos: Record<string, unknown>[] = [];
  const prisma = {
    empresa: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'E1' ? { id: 'E1' } : null) },
    entregaDeclaracao: {
      findMany: async ({ where }: { where: { empresa_id: string; competencia: { startsWith: string } } }) => entregas.filter((e) => e.empresa_id === where.empresa_id && String(e.competencia).startsWith(where.competencia.startsWith)),
      upsert: async ({ where, update, create }: { where: { empresa_id_obrigacao_competencia: Record<string, string> }; update: Record<string, unknown>; create: Record<string, unknown> }) => {
        const k = where.empresa_id_obrigacao_competencia;
        const atual = entregas.find((e) => e.empresa_id === k.empresa_id && e.obrigacao === k.obrigacao && e.competencia === k.competencia);
        if (atual) return Object.assign(atual, update);
        const novo = { id: `N${entregas.length}`, ...create };
        entregas.push(novo);
        return novo;
      },
      findUnique: async ({ where }: { where: { id: string } }) => entregas.find((e) => e.id === where.id) ?? null,
      delete: async ({ where }: { where: { id: string } }) => { entregas.splice(entregas.findIndex((e) => e.id === where.id), 1); },
    },
    obrigacaoDispensada: { findMany: async () => [{ empresa_id: 'E1', obrigacao: 'DIRBI' }] },
    arquivoEmpresa: {
      findMany: async () => arquivos,
      create: async ({ data }: { data: Record<string, unknown> }) => { const a = { id: `A${arquivos.length}`, ...data }; arquivos.push(a); return a; },
    },
  };
  const storage = { guardar: async () => undefined };
  return { s: new EntregasService(prisma as never, storage as never), entregas, arquivos };
}

describe('declarações sem API: registro de entrega', () => {
  it('as quatro entram na lista de obrigações (para "este cliente não tem")', () => {
    for (const d of DECLARACOES_SEM_API) expect(OBRIGACOES.map((o) => o.id)).toContain(d.id);
  });

  it('registra por competência com o recibo em PDF, atualiza sem duplicar e monta o quadro do ano', async () => {
    const t = montar();
    await t.s.registrar('E1', { obrigacao: 'EFD_REINF', competencia: '2026-09', recibo: '12345-67', transmitida_em: '2026-10-14' }, { buffer: Buffer.from('%PDF-1.4') }, { email: 'qa@fal' });
    expect(t.arquivos[0]).toMatchObject({ pasta: 'Recibos de declarações', nome: 'Recibo EFD-Reinf 09-2026.pdf' });
    await t.s.registrar('E1', { obrigacao: 'EFD_REINF', competencia: '202609', recibo: '99999-00' }, undefined, { email: 'qa@fal' });
    expect(t.entregas).toHaveLength(1);
    expect(t.entregas[0]).toMatchObject({ recibo: '99999-00', arquivo_id: 'A0' });
    const q = await t.s.doAno('E1', '2026');
    expect(q.entregas[0]).toMatchObject({ competencia: '202609', arquivo: { id: 'A0' } });
    expect(q.declaracoes.find((d) => d.id === 'DIRBI')!.dispensada).toBe(true);
  });

  it('recusa declaração desconhecida, competência inválida e exclusão por quem não é administrador', async () => {
    const t = montar();
    await expect(t.s.registrar('E1', { obrigacao: 'ECD', competencia: '202609' }, undefined, {})).rejects.toThrow(/desconhecida/);
    await expect(t.s.registrar('E1', { obrigacao: 'DIRBI', competencia: '2026' }, undefined, {})).rejects.toThrow(/AAAAMM/);
    await expect(t.s.registrar('X', { obrigacao: 'DIRBI', competencia: '202609' }, undefined, {})).rejects.toThrow(/não encontrado/);
    const e = await t.s.registrar('E1', { obrigacao: 'DIRBI', competencia: '202609' }, undefined, {});
    await expect(t.s.excluir(String(e.id), { role: 'user' })).rejects.toThrow(/administradores/);
    await t.s.excluir(String(e.id), { role: 'admin' });
    expect(t.entregas).toHaveLength(0);
  });
});
