import { describe, expect, it, vi } from 'vitest';
import { AuthUser } from '../auth/auth.types';
import { SaneamentoService, validarEstado } from './saneamento.service';

describe('estado do projeto de saneamento', () => {
  it('aceita objeto e rejeita o resto', () => {
    expect(JSON.parse(validarEstado({ a: 1 }))).toEqual({ a: 1 });
    for (const ruim of [null, [], 'x', 3, undefined]) expect(() => validarEstado(ruim)).toThrow();
  });
  it('rejeita estado gigante', () => {
    expect(() => validarEstado({ x: 'a'.repeat(9 * 1024 * 1024) })).toThrow('limite');
  });
});

describe('exclusão de projeto de saneamento', () => {
  const user = { email: 'ana@x.com', role: 'user' } as AuthUser;
  const montar = (opts: { projeto?: Record<string, unknown> | null; outros?: number; validacao?: Record<string, unknown> | null } = {}) => {
    const projeto = opts.projeto === undefined ? { id: 'P1', empresa_id: 'E1', criado_por: 'ana@x.com', validacao_id: 'V1' } : opts.projeto;
    const prisma = {
      saneamentoProjeto: { findUnique: vi.fn().mockResolvedValue(projeto), delete: vi.fn(), count: vi.fn().mockResolvedValue(opts.outros ?? 0) },
      validacaoCadastro: { findUnique: vi.fn().mockResolvedValue(opts.validacao === undefined ? { id: 'V1', criado_por: 'ana@x.com', storage_key: 'validacoes/x.xlsx' } : opts.validacao), delete: vi.fn() },
    };
    const storage = { removeObject: vi.fn().mockResolvedValue(undefined) };
    return { prisma, storage, service: new SaneamentoService(prisma as any, storage as any) };
  };

  it('exclui só o projeto por padrão: a base importada continua no histórico', async () => {
    const { prisma, storage, service } = montar();
    await expect(service.excluir('P1', user, 'E1')).resolves.toEqual({ ok: true, base_apagada: false });
    expect(prisma.saneamentoProjeto.delete).toHaveBeenCalledWith({ where: { id: 'P1' } });
    expect(prisma.validacaoCadastro.delete).not.toHaveBeenCalled(); expect(storage.removeObject).not.toHaveBeenCalled();
  });
  it('com apagar_base, apaga também a análise e o arquivo guardado', async () => {
    const { prisma, storage, service } = montar();
    await expect(service.excluir('P1', user, 'E1', true)).resolves.toEqual({ ok: true, base_apagada: true });
    expect(prisma.validacaoCadastro.delete).toHaveBeenCalledWith({ where: { id: 'V1' } });
    expect(storage.removeObject).toHaveBeenCalledWith('validacoes/x.xlsx');
  });
  it('mantém a base quando outro projeto a usa ou quando a pessoa não é quem a enviou, e diz o motivo', async () => {
    const a = montar({ outros: 1 });
    expect((await a.service.excluir('P1', user, 'E1', true))).toMatchObject({ base_apagada: false, aviso: expect.stringContaining('outro projeto') });
    expect(a.prisma.validacaoCadastro.delete).not.toHaveBeenCalled();
    const b = montar({ validacao: { id: 'V1', criado_por: 'bia@x.com', storage_key: 'k' } });
    expect((await b.service.excluir('P1', user, 'E1', true))).toMatchObject({ base_apagada: false, aviso: expect.stringContaining('bia@x.com') });
    expect(b.storage.removeObject).not.toHaveBeenCalled();
  });
  it('não remove do armazenamento chave que é endereço externo', async () => {
    const { storage, service } = montar({ validacao: { id: 'V1', criado_por: 'ana@x.com', storage_key: 'https://exemplo.com/a.xlsx' } });
    await service.excluir('P1', user, 'E1', true);
    expect(storage.removeObject).not.toHaveBeenCalled();
  });
  it('recusa outra pessoa (com o nome de quem criou), projeto de outra empresa e projeto inexistente', async () => {
    const { prisma, service } = montar({ projeto: { id: 'P1', empresa_id: 'E1', criado_por: 'bia@x.com', validacao_id: null } });
    await expect(service.excluir('P1', user, 'E1')).rejects.toThrow('bia@x.com');
    expect(prisma.saneamentoProjeto.delete).not.toHaveBeenCalled();
    await expect(service.excluir('P1', { ...user, role: 'admin' } as AuthUser, 'E1')).resolves.toMatchObject({ ok: true });
    await expect(montar().service.excluir('P1', user, 'OUTRA')).rejects.toThrow('nesta empresa');
    await expect(montar({ projeto: null }).service.excluir('P9', user, 'E1')).rejects.toThrow('não encontrado');
  });
});
