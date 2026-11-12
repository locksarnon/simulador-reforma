import { describe, expect, it } from 'vitest';
import { CustosService, ROTINA } from './custos.service';

describe('custos das ferramentas externas', () => {
  function montar(precos: Record<string, number> = {}) {
    const consultas = [
      { chave: 'sitfis', sistema: 'SITFIS', solicitado_por: 'ana@fal.com', status: 200 },
      { chave: 'das', sistema: 'PGDASD', solicitado_por: 'ana@fal.com', status: 200 },
      { chave: 'caixa-postal', sistema: 'CAIXAPOSTAL', solicitado_por: 'rotina', status: 200 },
      { chave: 'das', sistema: 'PGDASD', solicitado_por: 'ana@fal.com', status: null },
    ];
    const usos = [{ servico: 'INFOSIMPLES_CNDT', usuario: 'ANA@fal.com' }, { servico: 'SERPRO_CND', usuario: null }];
    let salvo = JSON.stringify({ precos, fixos: [{ rotulo: 'Servidor', valor: 100 }] });
    const prisma = {
      consultaFiscal: { findMany: async () => consultas },
      usoExterno: { findMany: async () => usos },
      parametroSistema: { findUnique: async () => ({ valor: salvo }), upsert: async ({ create }: { create: { valor: string } }) => { salvo = create.valor; } },
    };
    return new CustosService(prisma as never);
  }

  it('conta por usuário (rotina à parte), multiplica pelo preço e soma os fixos no total do escritório', async () => {
    const s = montar({ INTEGRA_APOIAR: 0.5, INTEGRA_EMITIR: 1, INFOSIMPLES_CNDT: 0.3, SERPRO_CND: 0.8, INTEGRA_CONSULTAR: 0.2 });
    const meu = await s.meu('ana@fal.com', '2026-11');
    expect(meu.chamadas).toBe(4); // SITFIS conta 2, DAS 1 (a sem resposta não conta), Infosimples 1
    expect(meu.total).toBe(2.8);
    const g = await s.geral('2026-11', { role: 'admin' });
    expect(g.usuarios.map((u) => u.usuario)).toEqual(['ana@fal.com', ROTINA]);
    expect(g.variavel).toBe(3.8);
    expect(g.total).toBe(103.8);
    await expect(s.geral('2026-11', { role: 'user' })).rejects.toThrow(/administradores/);
  });

  it('preços: só administrador, sem negativo, fixos sem nome caem', async () => {
    const s = montar();
    await expect(s.salvarPrecos({ precos: { SERPRO_CND: 1 } }, { role: 'user' })).rejects.toThrow();
    const p = await s.salvarPrecos({ precos: { SERPRO_CND: 1.25, INFOSIMPLES_CRF: -3 }, fixos: [{ rotulo: 'VPS', valor: 90 }, { rotulo: ' ', valor: 5 }] }, { role: 'admin' });
    expect(p.precos.SERPRO_CND).toBe(1.25);
    expect(p.precos.INFOSIMPLES_CRF).toBe(0);
    expect(p.fixos).toEqual([{ rotulo: 'VPS', valor: 90 }]);
  });
});
