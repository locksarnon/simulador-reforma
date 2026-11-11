import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CertificadoInvalidoError, documentoCompativel, lerPfx, limparDocumento } from './certificado-pfx';
import { CofreService } from './cofre.service';

export type MaterialCertificado = {
  certificadoId: string;
  documento: string;
  keyPem: string;
  certPem: string;
  cadeiaPem: string[];
};

export type AcaoUso = 'USO_CAPTURA' | 'USO_MANIFESTACAO';

const DIA = 86_400_000;
const contexto = (empresaId: string, certId: string) => `empresa:${empresaId}|certificado:${certId}`;

export function formatarDocumento(doc: string): string {
  const d = limparDocumento(doc);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return doc;
}

type Registro = {
  id: string; titular: string; emissor: string | null; documento: string; serie_hex: string | null; impressao_sha256: string;
  valido_de: Date; valido_ate: Date; status: string; enviado_por: string; revogado_em: Date | null; revogado_por: string | null; createdAt: Date;
};

/** Só metadados: o material sensível nunca sai daqui em respostas da API. */
function metadados(c: Registro) {
  const dias = Math.floor((c.valido_ate.getTime() - Date.now()) / DIA);
  return {
    id: c.id,
    titular: c.titular,
    emissor: c.emissor,
    documento: c.documento,
    documento_formatado: formatarDocumento(c.documento),
    serie_hex: c.serie_hex,
    impressao_sha256: c.impressao_sha256,
    valido_de: c.valido_de,
    valido_ate: c.valido_ate,
    dias_para_vencer: dias,
    situacao: c.status === 'REVOGADO' ? 'REVOGADO' : dias < 0 ? 'VENCIDO' : 'ATIVO',
    enviado_por: c.enviado_por,
    enviado_em: c.createdAt,
    revogado_em: c.revogado_em,
    revogado_por: c.revogado_por,
  };
}

/**
 * Cofre de certificados A1 por empresa. O arquivo .pfx é aberto na hora do envio; guardam-se apenas a chave privada e a cadeia,
 * cifradas no cofre (a senha do arquivo não é guardada). Todo envio, uso e revogação entra na trilha de auditoria.
 */
@Injectable()
export class CertificadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cofre: CofreService,
  ) {}

  private async empresa(empresaId: string) {
    const e = await this.prisma.empresa.findUnique({ where: { id: empresaId } }).catch(() => null);
    if (!e) throw new NotFoundException('Empresa não localizada.');
    return e;
  }

  async obter(empresaId: string) {
    const empresa = await this.empresa(empresaId);
    const cert = await this.prisma.certificadoDigital.findFirst({ where: { empresa_id: empresaId }, orderBy: { createdAt: 'desc' } });
    return {
      cofre_configurado: this.cofre.disponivel(),
      empresa: { id: empresa.id, razao_social: empresa.razao_social, cnpj_cpf: empresa.cnpj_cpf, cnpj_formatado: empresa.cnpj_cpf ? formatarDocumento(empresa.cnpj_cpf) : null },
      certificado: cert ? metadados(cert) : null,
    };
  }

  async enviar(empresaId: string, pfx: Buffer, senha: string, usuario: string) {
    if (!this.cofre.disponivel()) {
      throw new BadRequestException('O cofre de certificados não está configurado no servidor. Peça ao administrador do servidor para definir CERT_VAULT_KEY.');
    }
    const empresa = await this.empresa(empresaId);
    if (!limparDocumento(empresa.cnpj_cpf)) {
      throw new BadRequestException('Cadastre o CNPJ ou CPF da empresa antes de enviar o certificado.');
    }
    let lido;
    try {
      lido = lerPfx(pfx, senha);
    } catch (e) {
      if (e instanceof CertificadoInvalidoError) throw new BadRequestException(e.message);
      throw e;
    }
    const agora = new Date();
    if (lido.validoAte.getTime() <= agora.getTime()) {
      throw new BadRequestException(`O certificado está vencido (venceu em ${lido.validoAte.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}).`);
    }
    if (lido.validoDe.getTime() > agora.getTime()) {
      throw new BadRequestException('O certificado ainda não está em vigor.');
    }
    if (!documentoCompativel(lido.documento, empresa.cnpj_cpf!)) {
      throw new BadRequestException(`O certificado é de outro titular (${formatarDocumento(lido.documento)}). Envie o certificado da própria empresa (${formatarDocumento(empresa.cnpj_cpf!)}).`);
    }

    const id = randomUUID();
    const segredo = this.cofre.cifrar(
      JSON.stringify({ v: 1, key: lido.keyPem, cert: lido.certPem, cadeia: lido.cadeiaPem }),
      id,
      contexto(empresaId, id),
    );
    const [, criado] = await this.prisma.$transaction([
      this.prisma.certificadoDigital.updateMany({
        where: { empresa_id: empresaId, status: 'ATIVO' },
        data: { status: 'REVOGADO', revogado_em: agora, revogado_por: `${usuario} (substituído por novo envio)`, segredo_cifrado: null, segredo_iv: null, segredo_tag: null, chave_id: null },
      }),
      this.prisma.certificadoDigital.create({
        data: {
          id,
          empresa_id: empresaId,
          titular: lido.titular,
          emissor: lido.emissor,
          documento: lido.documento,
          serie_hex: lido.serieHex,
          impressao_sha256: lido.impressaoSha256,
          valido_de: lido.validoDe,
          valido_ate: lido.validoAte,
          segredo_cifrado: segredo.cifrado as never,
          segredo_iv: segredo.iv as never,
          segredo_tag: segredo.tag as never,
          chave_id: segredo.chaveId,
          enviado_por: usuario,
        },
      }),
      this.prisma.auditoriaCertificado.create({
        data: {
          empresa_id: empresaId,
          certificado_id: id,
          acao: 'ENVIO',
          usuario,
          detalhe: `${lido.titular} · ${formatarDocumento(lido.documento)} · válido até ${lido.validoAte.toISOString().slice(0, 10)}`,
        },
      }),
    ]);
    return metadados(criado);
  }

  async revogar(empresaId: string, usuario: string) {
    await this.empresa(empresaId);
    const ativo = await this.prisma.certificadoDigital.findFirst({ where: { empresa_id: empresaId, status: 'ATIVO' } });
    if (!ativo) throw new NotFoundException('Não há certificado ativo para esta empresa.');
    await this.prisma.$transaction([
      // Todos os ativos saem: dois envios simultâneos podem ter deixado mais de um, e nenhuma chave pode sobrar no cofre.
      this.prisma.certificadoDigital.updateMany({
        where: { empresa_id: empresaId, status: 'ATIVO' },
        data: { status: 'REVOGADO', revogado_em: new Date(), revogado_por: usuario, segredo_cifrado: null, segredo_iv: null, segredo_tag: null, chave_id: null },
      }),
      this.prisma.capturaXmlConfig.updateMany({ where: { empresa_id: empresaId }, data: { ativo: false } }),
      this.prisma.auditoriaCertificado.create({ data: { empresa_id: empresaId, certificado_id: ativo.id, acao: 'REVOGACAO', usuario, detalhe: 'Certificado removido do cofre; captura desativada.' } }),
    ]);
    return { ok: true };
  }

  async auditoria(empresaId: string, limite = 100) {
    await this.empresa(empresaId);
    return this.prisma.auditoriaCertificado.findMany({
      where: { empresa_id: empresaId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limite, 1), 500),
    });
  }

  /**
   * USO INTERNO (captura e manifestação): abre o material do certificado ativo. Exige certificado dentro da validade e titular igual
   * ao CNPJ/CPF cadastrado da empresa, e grava a trilha de auditoria. O resultado nunca deve ser logado nem devolvido pela API.
   */
  async material(empresaId: string, acao: AcaoUso, usuario = 'sistema', detalhe?: string): Promise<MaterialCertificado> {
    const cert = await this.prisma.certificadoDigital.findFirst({ where: { empresa_id: empresaId, status: 'ATIVO' }, orderBy: { createdAt: 'desc' } });
    if (!cert || !cert.segredo_cifrado || !cert.segredo_iv || !cert.segredo_tag || !cert.chave_id) {
      throw new NotFoundException('A empresa não tem certificado ativo no cofre.');
    }
    if (cert.valido_ate.getTime() <= Date.now()) {
      throw new ForbiddenException('O certificado da empresa está vencido. Envie um certificado novo.');
    }
    // O cadastro da empresa pode ter mudado depois do envio (a tela de empresas edita o CNPJ): o certificado só serve ao titular certo.
    const empresa = await this.empresa(empresaId);
    if (!empresa.cnpj_cpf || !documentoCompativel(cert.documento, empresa.cnpj_cpf)) {
      throw new ForbiddenException(`O CNPJ/CPF cadastrado da empresa não confere com o titular do certificado guardado (${formatarDocumento(cert.documento)}). Corrija o cadastro ou envie o certificado do titular correto.`);
    }
    const bruto = this.cofre.decifrar(
      { cifrado: Buffer.from(cert.segredo_cifrado), iv: Buffer.from(cert.segredo_iv), tag: Buffer.from(cert.segredo_tag), chaveId: cert.chave_id },
      cert.id,
      contexto(empresaId, cert.id),
    );
    const dados = JSON.parse(bruto.toString('utf8')) as { key: string; cert: string; cadeia: string[] };
    await this.prisma.auditoriaCertificado.create({ data: { empresa_id: empresaId, certificado_id: cert.id, acao, usuario, detalhe: detalhe ?? null } });
    return { certificadoId: cert.id, documento: cert.documento, keyPem: dados.key, certPem: dados.cert, cadeiaPem: dados.cadeia };
  }
}
