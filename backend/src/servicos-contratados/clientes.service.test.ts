import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ClientesService, formatarDocumento, proximoNumeroDeGrupo } from './clientes.service';

/** Prisma de mentira, em memória: grupos, empresas, serviços, usuários e vínculos. */
function montar() {
  const db = {
    grupo: [{ id: 'G1', numero: '#001', nome: 'Grupo Antigo' }, { id: 'G2', numero: '002', nome: 'Outro' }] as Record<string, unknown>[],
    empresa: [{ id: 'E1', razao_social: 'JA EXISTE LTDA', cnpj_cpf: '11.222.333/0001-81' }] as Record<string, unknown>[],
    servicoContratado: [] as Record<string, unknown>[],
    user: [{ id: 'U1' }] as Record<string, unknown>[],
    vinculoColaborador: [] as Record<string, unknown>[],
  };
  let seq = 0;
  const tabela = (nome: keyof typeof db) => ({
    findMany: async () => db[nome],
    findFirst: async ({ where }: { where: Record<string, unknown> }) => db[nome].find((l) => Object.entries(where).every(([k, v]) => l[k] === v)) ?? null,
    findUnique: async ({ where }: { where: { id: string } }) => db[nome].find((l) => l.id === where.id) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => { const l = { id: `${nome}-${++seq}`, ...data }; db[nome].push(l); return l; },
  });
  const tx = { grupo: tabela('grupo'), empresa: tabela('empresa'), servicoContratado: tabela('servicoContratado'), user: tabela('user'), vinculoColaborador: tabela('vinculoColaborador') };
  const prisma = { ...tx, $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) };
  return { service: new ClientesService(prisma as never), db };
}

describe('clientes: funções puras', () => {
  it('formata CNPJ e CPF e recusa outro tamanho', () => {
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarDocumento('12345678901')).toBe('123.456.789-01');
    expect(formatarDocumento('')).toBeNull();
    expect(() => formatarDocumento('123')).toThrow(BadRequestException);
  });
  it('acha o próximo número de grupo a partir do maior, aceitando # ou não', () => {
    expect(proximoNumeroDeGrupo(['#001', '002', '#010'])).toBe('#011');
    expect(proximoNumeroDeGrupo([])).toBe('#001');
  });
});

describe('ClientesService.criar', () => {
  it('sem grupo escolhido, o cliente vira o próprio grupo e ganha os serviços marcados', async () => {
    const { service, db } = montar();
    const e = await service.criar({ razao_social: 'Nova Agro Ltda', cnpj_cpf: '45.997.418/0001-53', servicos: ['BPO_FISCAL', 'DIAGNOSTICO_PONTUAL'], responsavel: 'Ana' }, { email: 'a@fal', role: 'user' });
    expect(e).toMatchObject({ razao_social: 'Nova Agro Ltda', grupo: '#003', cnpj_cpf: '45.997.418/0001-53', id_empresa: '45997418' });
    expect(db.grupo.at(-1)).toMatchObject({ numero: '#003', nome: 'Nova Agro Ltda', tipo: 'Cliente individual' });
    expect(db.servicoContratado.map((s) => s.tipo)).toEqual(['BPO_FISCAL', 'DIAGNOSTICO_PONTUAL']);
    expect(db.servicoContratado[0]).toMatchObject({ situacao: 'ATIVO', responsavel: 'Ana', atualizado_por: 'a@fal' });
  });

  it('com grupo escolhido, usa o grupo existente e não cria outro', async () => {
    const { service, db } = montar();
    const e = await service.criar({ razao_social: 'Filial', grupo: '002' });
    expect(e.grupo).toBe('002');
    expect(db.grupo).toHaveLength(2);
  });

  it('recusa documento repetido, avisando qual cliente já tem', async () => {
    const { service } = montar();
    await expect(service.criar({ razao_social: 'X', cnpj_cpf: '11222333000181' })).rejects.toThrow(ConflictException);
  });

  it('recusa sem nome, serviço desconhecido e grupo inexistente', async () => {
    const { service } = montar();
    await expect(service.criar({ razao_social: '  ' })).rejects.toThrow(/razão social/);
    await expect(service.criar({ razao_social: 'X', servicos: ['OUTRO'] })).rejects.toThrow(/Serviço inválido/);
    await expect(service.criar({ razao_social: 'X', grupo: '#999' })).rejects.toThrow(/não existe/);
  });

  it('só administrador liga o colaborador responsável', async () => {
    const { service, db } = montar();
    await service.criar({ razao_social: 'A', colaborador_id: 'U1' }, { role: 'user' });
    expect(db.vinculoColaborador).toHaveLength(0);
    await service.criar({ razao_social: 'B', colaborador_id: 'U1' }, { role: 'admin' });
    expect(db.vinculoColaborador).toHaveLength(1);
  });
});
