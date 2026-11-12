import { BadRequestException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { CertificadoInvalidoError, lerPfx } from '../certificados/certificado-pfx';
import { CofreService } from '../certificados/cofre.service';
import { PrismaService } from '../prisma/prisma.service';
import { estadoBx, servicosBx } from './receitanetbx.cliente';

type Usuario = { email?: string; role?: string } | undefined;
const BASE = () => process.env.RECEITANETBX_ENTREGA_DIR || '/bx';
const CONTEXTO = 'integracao:receitanetbx';
const idSegredo = (id: string) => `receitanetbx-${id}`;
const lerJson = async (f: string) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return null; } };
const existe = async (f: string) => { try { return (await stat(f)).size > 0; } catch { return false; } };

/**
 * Administração > Integrações > ReceitanetBX: o administrador envia o certificado A1 e a senha do primário (empresa) e do
 * secundário (sócio). O InTAX confere a senha, guarda os dois no cofre (AES-256-GCM) e entrega o arquivo na pasta
 * compartilhada com o serviço; o próprio serviço preenche o configurador oficial do programa (que cifra a senha) e apaga o
 * arquivo da senha em seguida. A senha cifrada pelo programa vale só para aquela máquina: quando o serviço volta sem
 * configuração (novo deploy, reinício do servidor), o InTAX reentrega sozinho o que está no cofre.
 */
@Injectable()
export class ReceitanetbxConfigService {
  private readonly log = new Logger(ReceitanetbxConfigService.name);
  private readonly ultimaReentrega = new Map<string, number>();

  constructor(@Optional() private readonly prisma?: PrismaService, @Optional() private readonly cofre?: CofreService) {}

  async estado() {
    return Promise.all(servicosBx().map(async (s) => {
      const pasta = join(BASE(), s.id);
      const [api, titular, status, configurando] = await Promise.all([estadoBx(s.url), lerJson(join(pasta, 'titular.json')), lerJson(join(pasta, 'status.json')), existe(join(pasta, 'senha'))]);
      return { id: s.id, rotulo: s.rotulo, ...api, titular, ultima_configuracao: status, configurando };
    }));
  }

  async salvar(id: string, pfx: Buffer | undefined, senha: string | undefined, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores configuram integrações.');
    const s = servicosBx().find((x) => x.id === id);
    if (!s) throw new BadRequestException('Escolha o certificado primário ou o secundário.');
    if (!pfx?.length) throw new BadRequestException('Envie o certificado A1 (arquivo .pfx ou .p12).');
    if (!senha) throw new BadRequestException('Informe a senha do certificado.');
    let lido;
    try { lido = lerPfx(pfx, senha); } catch (e) {
      throw new BadRequestException(e instanceof CertificadoInvalidoError ? e.message : 'Não foi possível abrir o certificado com essa senha.');
    }
    if (lido.validoAte.getTime() < Date.now()) throw new BadRequestException(`Este certificado venceu em ${lido.validoAte.toLocaleDateString('pt-BR')}.`);
    const titular = { titular: lido.titular, documento: lido.documento, tipo: lido.tipoDocumento, valido_ate: lido.validoAte, enviado_por: usuario?.email ?? null, enviado_em: new Date() };
    if (this.prisma && this.cofre) {
      const c = this.cofre.cifrar(JSON.stringify({ pfx: pfx.toString('base64'), senha, titular }), idSegredo(s.id), CONTEXTO);
      const dados = { segredo_cifrado: c.cifrado, segredo_iv: c.iv, segredo_tag: c.tag, chave_id: c.chaveId, atualizado_por: usuario?.email ?? null };
      await this.prisma.integracaoSegredo.upsert({ where: { id: idSegredo(s.id) }, update: dados as never, create: { id: idSegredo(s.id), ...dados } as never });
    }
    await this.entregar(s.id, pfx, senha, titular);
    return this.estado();
  }

  /** Escreve certificado, titular e, por último, a senha (é ela que dispara a configuração no serviço). */
  private async entregar(id: string, pfx: Buffer, senha: string, titular: unknown) {
    const pasta = join(BASE(), id);
    await mkdir(pasta, { recursive: true });
    await rm(join(pasta, 'status.json'), { force: true });
    await writeFile(join(pasta, 'certificado.pfx'), pfx, { mode: 0o600 });
    await writeFile(join(pasta, 'titular.json'), JSON.stringify(titular));
    await writeFile(join(pasta, 'senha'), senha, { mode: 0o600 });
    await chmod(join(pasta, 'senha'), 0o600).catch(() => undefined);
  }

  /** A cada 5 minutos: serviço no ar mas sem configuração, e com certificado no cofre → reentrega (no máximo a cada 30 min). */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reentregar() {
    if (!this.prisma || !this.cofre) return { reentregues: 0 };
    let n = 0;
    for (const s of servicosBx()) {
      try {
        const reg = await this.prisma.integracaoSegredo.findUnique({ where: { id: idSegredo(s.id) } });
        if (!reg) continue;
        if (Date.now() - (this.ultimaReentrega.get(s.id) ?? 0) < 30 * 60_000) continue;
        if (await existe(join(BASE(), s.id, 'senha'))) continue;
        const api = await estadoBx(s.url);
        if (!api.disponivel || api.configurado) continue;
        const seg = JSON.parse(this.cofre.decifrar({ cifrado: Buffer.from(reg.segredo_cifrado), iv: Buffer.from(reg.segredo_iv), tag: Buffer.from(reg.segredo_tag), chaveId: reg.chave_id }, idSegredo(s.id), CONTEXTO).toString('utf8')) as { pfx: string; senha: string; titular: unknown };
        this.ultimaReentrega.set(s.id, Date.now());
        await this.entregar(s.id, Buffer.from(seg.pfx, 'base64'), seg.senha, seg.titular);
        this.log.log(`ReceitanetBX ${s.rotulo}: sem configuração no serviço; certificado reentregue do cofre.`);
        n++;
      } catch (e) { this.log.warn(`ReceitanetBX ${s.rotulo}: ${(e as Error).message}`); }
    }
    return { reentregues: n };
  }
}
