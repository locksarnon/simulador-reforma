import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

const CHAVE = 'certificado.pin';
const PIN = /^\d{4,8}$/;

/**
 * PIN de uso do cofre de certificados: quando definido, enviar, substituir ou remover um certificado A1 exige o PIN, além de ser
 * administrador. Guardado só como hash (argon2). Para trocar ou tirar o PIN é preciso informar o atual.
 */
@Injectable()
export class PinCertificadoService {
  constructor(private readonly prisma: PrismaService) {}

  private async hash() {
    return (await this.prisma.parametroSistema.findUnique({ where: { chave: CHAVE } }))?.valor || null;
  }

  async estado() {
    return { ativo: !!(await this.hash()) };
  }

  /** Confere o PIN quando ele está ligado; sem PIN definido, passa direto. */
  async conferir(pin: unknown) {
    const h = await this.hash();
    if (!h) return;
    if (typeof pin !== 'string' || !pin || !(await argon2.verify(h, pin))) throw new ForbiddenException('PIN do cofre de certificados incorreto.');
  }

  /** Define, troca (novo) ou tira (novo vazio) o PIN; com PIN ligado, o atual é obrigatório. */
  async definir(e: { atual?: string; novo?: string }) {
    await this.conferir(e.atual);
    const novo = String(e.novo ?? '');
    if (!novo) {
      await this.prisma.parametroSistema.deleteMany({ where: { chave: CHAVE } });
      return { ativo: false };
    }
    if (!PIN.test(novo)) throw new BadRequestException('O PIN tem de 4 a 8 números.');
    const valor = await argon2.hash(novo);
    await this.prisma.parametroSistema.upsert({ where: { chave: CHAVE }, create: { chave: CHAVE, valor, descricao: 'PIN de uso do cofre de certificados (hash)' }, update: { valor } });
    return { ativo: true };
  }
}
