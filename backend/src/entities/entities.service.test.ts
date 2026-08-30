import { describe, it, expect } from 'vitest';
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
