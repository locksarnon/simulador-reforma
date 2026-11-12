import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { CertificadoInvalidoError, lerPfx } from '../certificados/certificado-pfx';
import { estadoBx, servicosBx } from './receitanetbx.cliente';

type Usuario = { email?: string; role?: string } | undefined;
const BASE = () => process.env.RECEITANETBX_ENTREGA_DIR || '/bx';
const lerJson = async (f: string) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return null; } };
const existe = async (f: string) => { try { return (await stat(f)).size > 0; } catch { return false; } };

/**
 * Administração > Integrações > ReceitanetBX: o administrador envia o certificado A1 e a senha do primário (empresa) e do
 * secundário (sócio). O InTAX confere a senha, entrega o arquivo na pasta compartilhada com o serviço e o próprio serviço
 * preenche o configurador oficial do programa (que cifra a senha) e apaga o arquivo da senha em seguida.
 */
@Injectable()
export class ReceitanetbxConfigService {
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
    const pasta = join(BASE(), s.id);
    await mkdir(pasta, { recursive: true });
    await rm(join(pasta, 'status.json'), { force: true });
    await writeFile(join(pasta, 'certificado.pfx'), pfx, { mode: 0o600 });
    await writeFile(join(pasta, 'titular.json'), JSON.stringify({ titular: lido.titular, documento: lido.documento, tipo: lido.tipoDocumento, valido_ate: lido.validoAte, enviado_por: usuario?.email ?? null, enviado_em: new Date() }));
    // A senha vai por último: é ela que dispara a configuração no serviço, que apaga o arquivo logo depois.
    await writeFile(join(pasta, 'senha'), senha, { mode: 0o600 });
    await chmod(join(pasta, 'senha'), 0o600).catch(() => undefined);
    return this.estado();
  }
}
