import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ClientesService } from './clientes.service';
import { EntitiesController } from '../entities/entities.controller';
import { nivelPgfn, tituloPgfn } from '../monitoramento/monitoramento.service';

function montar() {
  const empresa = { id: 'E1', razao_social: 'EXTRA AGRO LTDA', status: 'Ativa', arquivado_em: null as Date | null, arquivado_por: null as string | null };
  const servicos = [{ empresa_id: 'E1', situacao: 'ATIVO' }, { empresa_id: 'E1', situacao: 'ENCERRADO' }];
  const capturas = [{ empresa_id: 'E1', ativo: true }];
  const prisma = {
    empresa: {
      findUnique: async () => empresa,
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(empresa, data),
    },
    servicoContratado: { updateMany: async ({ where, data }: { where: { situacao: { in: string[] } }; data: Record<string, unknown> }) => { for (const s of servicos) if (where.situacao.in.includes(s.situacao)) Object.assign(s, data); } },
    capturaXmlConfig: { updateMany: async ({ data }: { data: Record<string, unknown> }) => { for (const c of capturas) Object.assign(c, data); } },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { service: new ClientesService(prisma as never), empresa, servicos, capturas };
}

describe('clientes não são excluídos, só arquivados', () => {
  it('arquivar marca o cliente, pausa os serviços em aberto e desliga a captura; desarquivar volta às listas', async () => {
    const { service, empresa, servicos, capturas } = montar();
    await service.arquivar('E1', { email: 'a@fal', role: 'admin' });
    expect(empresa).toMatchObject({ status: 'Arquivada', arquivado_por: 'a@fal' });
    expect(empresa.arquivado_em).toBeInstanceOf(Date);
    expect(servicos.map((s) => s.situacao)).toEqual(['PAUSADO', 'ENCERRADO']);
    expect(capturas[0].ativo).toBe(false);
    await service.desarquivar('E1', { role: 'admin' });
    expect(empresa).toMatchObject({ status: 'Ativa', arquivado_em: null });
  });

  it('só administrador arquiva', async () => {
    const { service } = montar();
    await expect(service.arquivar('E1', { role: 'user' })).rejects.toThrow(ForbiddenException);
  });

  it('a API recusa excluir cliente (mesmo administrador)', async () => {
    const entities = { remove: vi.fn(), exigirGrupoVazio: vi.fn() };
    const c = new EntitiesController(entities as never);
    await expect(c.remove('Empresa', 'E1', { role: 'admin' } as never)).rejects.toThrow(/não são excluídos/);
    expect(entities.remove).not.toHaveBeenCalled();
    await c.remove('Grupo', 'G1', { role: 'admin' } as never);
    expect(entities.exigirGrupoVazio).toHaveBeenCalledWith('G1');
  });
});

describe('parcelamentos da PGFN', () => {
  const hoje = new Date('2026-11-11T12:00:00Z');
  const base = { numero: '1234567', situacao: 'EM_DIA', valor_parcela: 512.3, modalidade: 'Transação excepcional', proximo_vencimento: null as Date | null };
  it('nível pela situação e pelo vencimento', () => {
    expect(nivelPgfn({ ...base, proximo_vencimento: new Date('2026-11-30') }, hoje)).toBe('OK');
    expect(nivelPgfn({ ...base, proximo_vencimento: new Date('2026-11-14') }, hoje)).toBe('ATENCAO');
    expect(nivelPgfn({ ...base, proximo_vencimento: new Date('2026-11-10') }, hoje)).toBe('CRITICO');
    expect(nivelPgfn({ ...base, situacao: 'EM_ATRASO' }, hoje)).toBe('CRITICO');
    expect(nivelPgfn({ ...base, situacao: 'RESCINDIDO' }, hoje)).toBe('CRITICO');
    expect(nivelPgfn({ ...base, situacao: 'LIQUIDADO', proximo_vencimento: new Date('2026-01-01') }, hoje)).toBe('INFO');
  });
  it('a frase diz a situação, a parcela e o valor', () => {
    expect(tituloPgfn({ ...base, proximo_vencimento: new Date('2026-11-30') }, hoje)).toMatch(/^PGFN 1234567 \(Transação excepcional\): em dia; próxima parcela em 30\/11\/2026 \(R\$\s?512,30\)\.$/);
    expect(tituloPgfn({ ...base, proximo_vencimento: new Date('2026-11-10') }, hoje)).toContain('parcela vencida em 10/11/2026');
  });
});
