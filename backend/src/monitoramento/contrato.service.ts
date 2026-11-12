import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CofreService } from '../certificados/cofre.service';
import { CertificadoInvalidoError, lerPfx } from '../certificados/certificado-pfx';
import { Credenciais, ErroIntegra, pedirTokenSapi } from './integra.cliente';

export type CredenciaisContrato = Credenciais & { contratante: string; nome: string };
type Usuario = { email?: string; role?: string } | undefined;
type Segredo = { consumerKey: string; consumerSecret: string; pfx: string; senha: string };

const ID = 'unico';
const CONTEXTO = 'integra-contador:contrato';
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** Credenciais pelo .env do servidor (o caminho antigo, que continua valendo quando não há contrato salvo pela tela). */
export function credenciaisDoAmbiente(env: NodeJS.ProcessEnv = process.env): CredenciaisContrato | null {
  const key = env.SERPRO_CONSUMER_KEY?.trim();
  const secret = env.SERPRO_CONSUMER_SECRET?.trim();
  const pfx64 = env.SERPRO_CERT_PFX_BASE64?.trim();
  const arquivo = env.SERPRO_CERT_PFX_ARQUIVO?.trim();
  const cnpj = so(env.SERPRO_CONTRATANTE_CNPJ);
  if (!key || !secret || (!pfx64 && !arquivo) || cnpj.length !== 14) return null;
  let pfx: Buffer;
  try { pfx = pfx64 ? Buffer.from(pfx64, 'base64') : require('fs').readFileSync(arquivo!); } catch { return null; }
  return { consumerKey: key, consumerSecret: secret, pfx, senha: env.SERPRO_CERT_SENHA ?? '', contratante: cnpj, nome: env.SERPRO_CONTRATANTE_NOME?.trim() || 'CONTRATANTE' };
}

/**
 * Administração > Integrações > Contrato do Integra Contador: o administrador sobe o e-CNPJ A1 do escritório, a senha e as chaves do
 * Serpro. Tudo fica cifrado no cofre; a tela só vê titular, CNPJ e validade. O que está salvo aqui vence o .env.
 */
@Injectable()
export class ContratoIntegraService {
  private cache: { valor: CredenciaisContrato | null; em: number } | null = null;

  constructor(private readonly prisma: PrismaService, private readonly cofre: CofreService) {}

  /** Credenciais em uso (contrato salvo pela tela; senão o .env). Fica em memória por 1 minuto. */
  async credenciais(): Promise<CredenciaisContrato | null> {
    if (this.cache && Date.now() - this.cache.em < 60_000) return this.cache.valor;
    let valor: CredenciaisContrato | null = null;
    const r = await this.prisma.contratoIntegraContador.findUnique({ where: { id: ID } }).catch(() => null);
    if (r && this.cofre.disponivel()) {
      try {
        const s = JSON.parse(this.cofre.decifrar({ cifrado: Buffer.from(r.segredo_cifrado), iv: Buffer.from(r.segredo_iv), tag: Buffer.from(r.segredo_tag), chaveId: r.chave_id }, ID, CONTEXTO).toString('utf8')) as Segredo;
        valor = { consumerKey: s.consumerKey, consumerSecret: s.consumerSecret, pfx: Buffer.from(s.pfx, 'base64'), senha: s.senha, contratante: r.documento, nome: r.titular };
      } catch { valor = null; }
    }
    if (!valor) valor = credenciaisDoAmbiente();
    this.cache = { valor, em: Date.now() };
    return valor;
  }

  /** O que a tela pode ver: nunca as chaves nem a senha. */
  async estado() {
    const r = await this.prisma.contratoIntegraContador.findUnique({ where: { id: ID } }).catch(() => null);
    const amb = credenciaisDoAmbiente();
    return {
      configurado: !!r || !!amb,
      origem: r ? 'TELA' : amb ? 'SERVIDOR' : null,
      titular: r?.titular ?? amb?.nome ?? null,
      cnpj: r?.documento ?? amb?.contratante ?? null,
      valido_ate: r?.valido_ate ?? null,
      atualizado_por: r?.atualizado_por ?? null,
      atualizado_em: r?.updatedAt ?? null,
      cofre: this.cofre.disponivel(),
    };
  }

  async salvar(e: { pfx?: Buffer; senha?: string; consumerKey?: string; consumerSecret?: string }, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores configuram o contrato do Integra Contador.');
    if (!this.cofre.disponivel()) throw new BadRequestException('O cofre de certificados não está configurado no servidor (CERT_VAULT_KEY).');
    const atual = await this.credenciais();
    const consumerKey = (e.consumerKey ?? '').trim() || atual?.consumerKey || '';
    const consumerSecret = (e.consumerSecret ?? '').trim() || atual?.consumerSecret || '';
    if (!consumerKey || !consumerSecret) throw new BadRequestException('Informe a Consumer Key e a Consumer Secret (Área do Cliente do Serpro).');
    const pfx = e.pfx ?? atual?.pfx;
    const senha = e.pfx ? (e.senha ?? '') : (e.senha || atual?.senha || '');
    if (!pfx) throw new BadRequestException('Envie o certificado e-CNPJ A1 do escritório (arquivo .pfx ou .p12).');
    let lido;
    try { lido = lerPfx(pfx, senha); } catch (err) {
      if (err instanceof CertificadoInvalidoError) throw new BadRequestException(err.message);
      throw err;
    }
    if (lido.tipoDocumento !== 'CNPJ') throw new BadRequestException('O certificado precisa ser e-CNPJ (o mesmo usado na contratação do Integra Contador).');
    if (lido.validoAte.getTime() <= Date.now()) throw new BadRequestException(`O certificado venceu em ${lido.validoAte.toLocaleDateString('pt-BR')}.`);
    const segredo: Segredo = { consumerKey, consumerSecret, pfx: pfx.toString('base64'), senha };
    const c = this.cofre.cifrar(JSON.stringify(segredo), ID, CONTEXTO);
    const dados = {
      titular: lido.titular.replace(/:\d{11,14}$/, '').trim(), documento: lido.documento, valido_ate: lido.validoAte,
      segredo_cifrado: c.cifrado as never, segredo_iv: c.iv as never, segredo_tag: c.tag as never, chave_id: c.chaveId, atualizado_por: usuario?.email ?? null,
    };
    await this.prisma.contratoIntegraContador.upsert({ where: { id: ID }, update: dados, create: { id: ID, ...dados } });
    this.cache = null;
    return this.estado();
  }

  async remover(usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores removem o contrato.');
    await this.prisma.contratoIntegraContador.deleteMany({ where: { id: ID } });
    this.cache = null;
    return this.estado();
  }

  /** Pede um token ao Serpro com o contrato salvo: confirma chaves e certificado sem consultar nenhum cliente (não é cobrado). */
  async testar(usuario: Usuario, obterToken = pedirTokenSapi) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores testam o contrato.');
    const c = await this.credenciais();
    if (!c) return { ok: false, mensagem: 'Nenhum contrato configurado.' };
    try {
      await obterToken(c);
      return { ok: true, mensagem: `O Serpro aceitou as chaves e o certificado de ${c.nome} (${c.contratante}).` };
    } catch (e) {
      return { ok: false, mensagem: e instanceof ErroIntegra ? e.message : `Falha: ${(e as Error).message}` };
    }
  }
}
