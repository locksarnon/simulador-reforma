import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PinCertificadoService } from './pin.service';

function montar() {
  const p = new Map<string, { chave: string; valor: string }>();
  const prisma = {
    parametroSistema: {
      findUnique: async ({ where }: { where: { chave: string } }) => p.get(where.chave) ?? null,
      upsert: async ({ where, create, update }: { where: { chave: string }; create: { chave: string; valor: string }; update: { valor: string } }) => { p.set(where.chave, p.has(where.chave) ? { ...p.get(where.chave)!, ...update } : create); },
      deleteMany: async ({ where }: { where: { chave: string } }) => { p.delete(where.chave); },
    },
  };
  return { s: new PinCertificadoService(prisma as never), p };
}

describe('PIN do cofre de certificados', () => {
  it('sem PIN tudo passa; com PIN exige o certo; guarda só o hash', async () => {
    const { s, p } = montar();
    expect(await s.estado()).toEqual({ ativo: false });
    await expect(s.conferir(undefined)).resolves.toBeUndefined();
    await s.definir({ novo: '4321' });
    expect(p.get('certificado.pin')!.valor).not.toContain('4321');
    await expect(s.conferir('1111')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.conferir(undefined)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.conferir('4321')).resolves.toBeUndefined();
  });
  it('trocar ou tirar exige o atual; o PIN tem 4 a 8 números', async () => {
    const { s } = montar();
    await expect(s.definir({ novo: '12' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.definir({ novo: 'abcd' })).rejects.toBeInstanceOf(BadRequestException);
    await s.definir({ novo: '123456' });
    await expect(s.definir({ atual: '000000', novo: '999999' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.definir({ atual: '123456', novo: '' })).resolves.toEqual({ ativo: false });
  });
});
