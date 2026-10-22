import { describe, expect, it, vi } from 'vitest';
import { LimpezaService } from './limpeza.service';

const user = { email: 'ana@x.com', role: 'user' } as any;

/** Prisma falso com só o que a limpeza usa; cada tabela devolve as linhas combinadas no cenário. */
function montar(cenario: { projetos?: { id: string; validacao_id: string | null }[]; validacoesDaEmpresa?: { id: string; storage_key: string }[]; validacoesPorId?: { id: string; storage_key: string }[]; analises?: { id: string }[] } = {}) {
  const tabelas = ['importacaoXMLItem', 'historicoXML', 'importacaoXMLArquivo', 'importacaoXMLLote', 'operacao', 'cfopEmpresaRegra', 'simulacao', 'diagnostico', 'empresa', 'saneamentoProjeto', 'analiseEmpresa', 'validacaoCadastro'];
  const tx: Record<string, { deleteMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> }> = {};
  for (const t of tabelas) tx[t] = { deleteMany: vi.fn(), updateMany: vi.fn() };
  const prisma = {
    grupo: { findUnique: vi.fn().mockResolvedValue({ id: 'G1', numero: '001' }) },
    empresa: { findMany: vi.fn().mockResolvedValue([{ id: 'E1', id_empresa: 'EMP-1' }]) },
    saneamentoProjeto: { findMany: vi.fn().mockResolvedValue(cenario.projetos ?? []) },
    validacaoCadastro: {
      findMany: vi.fn().mockImplementation(async ({ where }: { where: { id?: unknown; empresa_id?: unknown } }) => (where.id ? cenario.validacoesPorId ?? [] : cenario.validacoesDaEmpresa ?? [])),
    },
    analiseEmpresa: { findMany: vi.fn().mockResolvedValue(cenario.analises ?? []) },
    operacao: { findMany: vi.fn().mockResolvedValue([]) },
    cfopEmpresaRegra: { findMany: vi.fn().mockResolvedValue([]) },
    simulacao: { findMany: vi.fn().mockResolvedValue([]) },
    diagnostico: { findMany: vi.fn().mockResolvedValue([]) },
    importacaoXMLLote: { findMany: vi.fn().mockResolvedValue([]) },
    importacaoXMLArquivo: { findMany: vi.fn().mockResolvedValue([]) },
    importacaoXMLItem: { findMany: vi.fn().mockResolvedValue([]) },
    historicoXML: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<void>) => fn(tx)),
  };
  const storage = { removeObject: vi.fn().mockResolvedValue(undefined) };
  return { prisma, tx, storage, service: new LimpezaService(prisma as any, storage as any) };
}

describe('limpeza das análises salvas e do saneamento', () => {
  it('exige a empresa: limpar "análises" ou "saneamento" nunca vale para o workroom inteiro', async () => {
    const { service } = montar();
    await expect(service.previa({ tela: 'analises', grupo_id: 'G1' }, user)).rejects.toThrow('empresa_id');
    await expect(service.previa({ tela: 'saneamento', grupo_id: 'G1' }, user)).rejects.toThrow('empresa_id');
  });

  it('"analises": conta e apaga análises de serviços, projetos e validações da empresa, com os arquivos, sem tocar na empresa', async () => {
    const { service, tx, storage } = montar({
      projetos: [{ id: 'P1', validacao_id: 'V1' }], validacoesDaEmpresa: [{ id: 'V1', storage_key: 'validacoes/a.xlsx' }, { id: 'V2', storage_key: 'validacoes/b.xlsx' }], analises: [{ id: 'A1' }],
    });
    const previa = await service.previa({ tela: 'analises', grupo_id: 'G1', empresa_id: 'E1' }, user);
    expect(previa.contagens).toMatchObject({ 'Projetos de saneamento': 1, 'Validações de cadastro e bases importadas': 2, 'Análises de serviços salvas': 1, 'Arquivos no armazenamento': 2 });
    expect(previa.contagens['Empresas']).toBeUndefined();
    await expect(service.executar({ tela: 'analises', grupo_id: 'G1', empresa_id: 'E1', confirmacao: 'nao' }, user)).rejects.toThrow('APAGAR');
    const r = await service.executar({ tela: 'analises', grupo_id: 'G1', empresa_id: 'E1', confirmacao: 'apagar' }, user);
    expect(tx.saneamentoProjeto.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['P1'] } } });
    expect(tx.validacaoCadastro.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['V1', 'V2'] } } });
    expect(tx.analiseEmpresa.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['A1'] } } });
    expect(tx.empresa.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [] } } });
    expect(storage.removeObject).toHaveBeenCalledTimes(2);
    expect(r.arquivos_removidos).toBe(2);
  });

  it('"saneamento": só os projetos e as bases importadas neles; as demais análises da empresa ficam', async () => {
    const { service, tx, prisma, storage } = montar({ projetos: [{ id: 'P1', validacao_id: 'V1' }], validacoesPorId: [{ id: 'V1', storage_key: 'validacoes/a.xlsx' }], validacoesDaEmpresa: [{ id: 'V9', storage_key: 'validacoes/outra.xlsx' }], analises: [{ id: 'A1' }] });
    await service.executar({ tela: 'saneamento', grupo_id: 'G1', empresa_id: 'E1', confirmacao: 'APAGAR' }, user);
    expect(tx.saneamentoProjeto.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['P1'] } } });
    expect(tx.validacaoCadastro.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['V1'] } } }); // V9 (outra análise) não entra
    expect(tx.analiseEmpresa.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [] } } });
    expect(prisma.analiseEmpresa.findMany).not.toHaveBeenCalled();
    expect(storage.removeObject).toHaveBeenCalledWith('validacoes/a.xlsx');
    expect(storage.removeObject).not.toHaveBeenCalledWith('validacoes/outra.xlsx');
  });

  it('limpar empresas leva junto o que estava na lista delas (antes ficava órfão)', async () => {
    const { service, tx } = montar({ projetos: [{ id: 'P1', validacao_id: null }], validacoesDaEmpresa: [{ id: 'V1', storage_key: 'k.xlsx' }], analises: [{ id: 'A1' }] });
    await service.executar({ tela: 'empresas', grupo_id: 'G1', confirmacao: 'APAGAR' }, user);
    expect(tx.empresa.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['E1'] } } });
    expect(tx.saneamentoProjeto.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['P1'] } } });
    expect(tx.validacaoCadastro.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['V1'] } } });
    expect(tx.analiseEmpresa.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['A1'] } } });
  });

  it('projetos que sobram não ficam apontando para uma base apagada', async () => {
    const { service, tx } = montar({ validacoesDaEmpresa: [{ id: 'V1', storage_key: 'k.xlsx' }] });
    await service.executar({ tela: 'analises', grupo_id: 'G1', empresa_id: 'E1', confirmacao: 'APAGAR' }, user);
    expect(tx.saneamentoProjeto.updateMany).toHaveBeenCalledWith({ where: { validacao_id: { in: ['V1'] } }, data: { validacao_id: null } });
  });
});
