import { describe, it, expect, vi } from 'vitest';
import { EntitiesService } from './entities.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * sanitize() só usa Prisma.dmmf (metadado estático) — não toca this.prisma —
 * então dá pra testar sem subir um Postgres de verdade, passando um
 * PrismaService fake.
 */
const service = new EntitiesService({} as PrismaService);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sanitize = (model: string, data: Record<string, unknown>) => (service as any).sanitize(model, data);

describe('EntitiesService.sanitize', () => {
  it('regressão: converte "" para null em campo DateTime (bug real do formulário de Operação em 2026-08-29)', () => {
    const out = sanitize('Operacao', { id_operacao: 'OP-001', data: '', valor_bruto: 1000 });
    expect(out.data).toBeNull();
    expect(out.valor_bruto).toBe(1000);
  });

  it('converte "" para null em campos Int e Float', () => {
    const out = sanitize('ImportacaoXMLItem', { numero_item: '', quantidade: '' });
    expect(out.numero_item).toBeNull();
    expect(out.quantidade).toBeNull();
  });

  it('mantém "" em campos String — só DateTime/Int/Float são coagidos', () => {
    const out = sanitize('Grupo', { nome: '', observacao: '' });
    expect(out.nome).toBe('');
    expect(out.observacao).toBe('');
  });

  it('descarta chaves que não existem no model (evita "Unknown argument" do Prisma)', () => {
    const out = sanitize('Grupo', { nome: 'Teste', campo_que_nao_existe: 'lixo' });
    expect(out).toEqual({ nome: 'Teste' });
  });

  it('preserva valores normais intactos', () => {
    const out = sanitize('Operacao', { valor_bruto: 1000, direcao: 'Saida' });
    expect(out).toEqual({ valor_bruto: 1000, direcao: 'Saida' });
  });

  it('regressão: completa data-only "YYYY-MM-DD" (o que <input type="date"> manda) com hora, senão Prisma rejeita (bug real do cadastro de vigência em 2026-08-30)', () => {
    const out = sanitize('ClassTrib', { c_class_trib: '000001', vigencia_inicio: '2026-07-01' });
    expect(out.vigencia_inicio).toBe('2026-07-01T00:00:00.000Z');
  });

  it('não mexe numa data que já vem completa em ISO', () => {
    const out = sanitize('ClassTrib', { vigencia_inicio: '2026-07-01T14:30:00.000Z' });
    expect(out.vigencia_inicio).toBe('2026-07-01T14:30:00.000Z');
  });
});

describe('EntitiesService.assertAllowed', () => {
  it('aceita os 14 modelos de dados permitidos', () => {
    expect(() => service.assertAllowed('Operacao')).not.toThrow();
    expect(() => service.assertAllowed('Simulacao')).not.toThrow();
  });

  it('bloqueia User/RefreshToken/PasswordResetToken — nunca expostos via CRUD genérico', () => {
    expect(() => service.assertAllowed('User')).toThrow();
    expect(() => service.assertAllowed('RefreshToken')).toThrow();
    expect(() => service.assertAllowed('PasswordResetToken')).toThrow();
  });

  it('bloqueia nomes de modelo inexistentes', () => {
    expect(() => service.assertAllowed('TabelaQualquer')).toThrow();
  });
});

describe('EntitiesService.remove', () => {
  const montar = (custodia: string[] = ['E1']) => {
    const grupos = vi.fn().mockResolvedValue(custodia.map((empresa_id) => ({ empresa_id })));
    const prisma = {
      empresa: { delete: vi.fn() }, grupo: { delete: vi.fn() },
      validacaoCadastro: { findMany: vi.fn().mockResolvedValue([{ storage_key: 'validacoes/a.xlsx' }, { storage_key: 'https://externo/x.xlsx' }]), deleteMany: vi.fn() },
      saneamentoProjeto: { deleteMany: vi.fn() }, analiseEmpresa: { deleteMany: vi.fn() },
      documentoXml: { findMany: vi.fn().mockResolvedValue([{ storage_key: 'repositorio/E1/importacao/2026/11/a.xml' }]), deleteMany: vi.fn(), groupBy: grupos },
      certificadoDigital: { deleteMany: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) }, capturaXmlConfig: { deleteMany: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
      capturaXmlExecucao: { deleteMany: vi.fn() }, xmlEmpresaConfig: { deleteMany: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) }, auditoriaCertificado: { create: vi.fn() }, servicoContratado: { deleteMany: vi.fn() },
      vinculoColaborador: { deleteMany: vi.fn() }, empresaTag: { deleteMany: vi.fn() }, tarefa: { deleteMany: vi.fn() }, eventoAgenda: { updateMany: vi.fn() },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    };
    const storage = { removeObject: vi.fn().mockResolvedValue(undefined) };
    return { prisma, storage, service: new EntitiesService(prisma as unknown as PrismaService, storage as never) };
  };

  it('excluir empresa leva junto análises salvas, validações (com o arquivo) e projetos de saneamento', async () => {
    const { prisma, storage, service } = montar();
    await service.remove('Empresa', 'E1');
    expect(prisma.saneamentoProjeto.deleteMany).toHaveBeenCalledWith({ where: { empresa_id: 'E1' } });
    expect(prisma.analiseEmpresa.deleteMany).toHaveBeenCalledWith({ where: { empresa_id: 'E1' } });
    expect(prisma.validacaoCadastro.deleteMany).toHaveBeenCalledWith({ where: { empresa_id: 'E1' } });
    expect(storage.removeObject).toHaveBeenCalledTimes(2); // o endereço externo não é apagado
    expect(storage.removeObject).toHaveBeenCalledWith('validacoes/a.xlsx');
    expect(prisma.empresa.delete).toHaveBeenCalledWith({ where: { id: 'E1' } });
  });

  it('excluir empresa apaga o certificado (chave cifrada), os XML do repositório e as configurações da captura', async () => {
    const { prisma, storage, service } = montar();
    await service.remove('Empresa', 'E1');
    expect(prisma.certificadoDigital.deleteMany).toHaveBeenCalledWith({ where: { empresa_id: 'E1' } });
    expect(prisma.documentoXml.deleteMany).toHaveBeenCalledWith({ where: { empresa_id: 'E1' } });
    expect(prisma.capturaXmlConfig.deleteMany).toHaveBeenCalledWith({ where: { empresa_id: 'E1' } });
    expect(prisma.xmlEmpresaConfig.deleteMany).toHaveBeenCalledWith({ where: { empresa_id: 'E1' } });
    expect(prisma.servicoContratado.deleteMany).toHaveBeenCalledWith({ where: { empresa_id: 'E1' } }); // a carteira também sai junto
    expect(prisma.vinculoColaborador.deleteMany).toHaveBeenCalledWith({ where: { empresa_id: 'E1' } });
    expect(prisma.empresaTag.deleteMany).toHaveBeenCalledWith({ where: { empresa_id: 'E1' } });
    expect(prisma.tarefa.deleteMany).toHaveBeenCalledWith({ where: { empresa_id: 'E1' } });
    expect(prisma.eventoAgenda.updateMany).toHaveBeenCalledWith({ where: { empresa_id: 'E1' }, data: { empresa_id: null } }); // o evento fica, sem a empresa
    expect(prisma.auditoriaCertificado.create).toHaveBeenCalledWith({ data: expect.objectContaining({ empresa_id: 'E1', acao: 'EMPRESA_EXCLUIDA' }) });
    expect(storage.removeObject).toHaveBeenCalledWith('repositorio/E1/importacao/2026/11/a.xml');
  });

  it('empresa com certificado, XML ou captura guardados só é excluída por administrador, e a auditoria diz quem apagou', async () => {
    const t = montar();
    await expect(t.service.remove('Empresa', 'E1', { email: 'ana@fal', role: 'user' })).rejects.toThrow(/apenas administradores podem excluí-la/);
    expect(t.prisma.empresa.delete).not.toHaveBeenCalled();
    expect(t.prisma.certificadoDigital.deleteMany).not.toHaveBeenCalled();
    expect(t.storage.removeObject).not.toHaveBeenCalled();

    const a = montar();
    await a.service.remove('Empresa', 'E1', { email: 'adm@fal', role: 'admin' });
    expect(a.prisma.empresa.delete).toHaveBeenCalledWith({ where: { id: 'E1' } });
    expect(a.prisma.auditoriaCertificado.create).toHaveBeenCalledWith({ data: expect.objectContaining({ empresa_id: 'E1', acao: 'EMPRESA_EXCLUIDA', usuario: 'adm@fal' }) });
  });

  it('empresa sem nada guardado no repositório continua podendo ser excluída por qualquer usuário, sem linha de auditoria', async () => {
    const t = montar([]);
    await t.service.remove('Empresa', 'E2', { email: 'ana@fal', role: 'user' });
    expect(t.prisma.empresa.delete).toHaveBeenCalledWith({ where: { id: 'E2' } });
    expect(t.prisma.auditoriaCertificado.create).not.toHaveBeenCalled();
  });

  it('outras entidades seguem sendo excluídas sem cascata', async () => {
    const { prisma, service } = montar();
    await service.remove('Grupo', 'G1');
    expect(prisma.grupo.delete).toHaveBeenCalledWith({ where: { id: 'G1' } });
    expect(prisma.validacaoCadastro.findMany).not.toHaveBeenCalled();
  });
});
