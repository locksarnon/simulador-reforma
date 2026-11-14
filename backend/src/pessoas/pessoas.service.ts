import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { servicosConsultoria } from '../servicos-contratados/consultoria.service';
import { lerData } from '../tarefas/tarefas.regras';

type Ator = { id: string; email?: string; role?: string };
const TIPOS_CERTIFICADO = ['A1', 'A3', 'e-CPF em nuvem'];

/** CPF válido pelos dígitos verificadores (11 dígitos, não repetidos). */
export function cpfValido(cpf: string): boolean {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string, peso: number) => {
    const soma = base.split('').reduce((s, c, i) => s + Number(c) * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

export const formatarCpf = (cpf: string) => String(cpf).replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');

/**
 * Pessoas físicas da carteira (sócios, produtores rurais PF): cadastro com CPF validado, vínculo com uma empresa e o vencimento do
 * certificado digital dela (só a data e o tipo; o arquivo do certificado não fica guardado aqui). A procuração e o monitoramento da
 * pessoa física dependem do Integra Contador (fase 3).
 */
@Injectable()
export class PessoasService {
  private readonly logger = new Logger(PessoasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  listar() {
    return this.prisma.pessoaFisica.findMany({ orderBy: { nome: 'asc' } });
  }

  private async dados(e: Record<string, unknown>, parcial: boolean, id?: string) {
    const d: Record<string, unknown> = {};
    if (!parcial || e.nome !== undefined) {
      const nome = String(e.nome ?? '').trim().replace(/\s+/g, ' ');
      if (!nome) throw new BadRequestException('Informe o nome.');
      d.nome = nome.slice(0, 200);
    }
    if (!parcial || e.cpf !== undefined) {
      const cpf = String(e.cpf ?? '').replace(/\D/g, '');
      if (!cpfValido(cpf)) throw new BadRequestException('CPF inválido.');
      const outro = await this.prisma.pessoaFisica.findUnique({ where: { cpf: formatarCpf(cpf) } });
      if (outro && outro.id !== id) throw new ConflictException('Já existe uma pessoa com esse CPF.');
      d.cpf = formatarCpf(cpf);
    }
    if (e.email !== undefined) {
      const em = e.email ? String(e.email).trim() : '';
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new BadRequestException('E-mail inválido.');
      d.email = em || null;
    }
    for (const [k, max] of [['telefone', 30], ['grupo', 30], ['observacao', 2000]] as const) if (e[k] !== undefined) d[k] = e[k] ? String(e[k]).trim().slice(0, max) : null;
    if (e.empresa_id !== undefined) {
      if (e.empresa_id && !(await this.prisma.empresa.count({ where: { id: String(e.empresa_id) } }))) throw new NotFoundException('Empresa não encontrada.');
      d.empresa_id = e.empresa_id || null;
    }
    if (e.certificado_tipo !== undefined) {
      if (e.certificado_tipo && !TIPOS_CERTIFICADO.includes(String(e.certificado_tipo))) throw new BadRequestException(`Tipo de certificado inválido. Use ${TIPOS_CERTIFICADO.join(', ')}.`);
      d.certificado_tipo = e.certificado_tipo || null;
    }
    if (e.certificado_validade !== undefined) {
      const v = lerData(e.certificado_validade);
      if (v === undefined) throw new BadRequestException('Validade do certificado inválida. Use AAAA-MM-DD.');
      d.certificado_validade = v;
    }
    return d;
  }

  async criar(user: Ator, e: Record<string, unknown>) {
    const consultoria = servicosConsultoria(e.servicos_consultoria, 'PF');
    const data = { ...(await this.dados(e, false)), criado_por: user.email ?? user.id } as never;
    if (!consultoria.length) return this.prisma.pessoaFisica.create({ data });
    return this.prisma.$transaction(async (tx) => {
      const pessoa = await tx.pessoaFisica.create({ data });
      await tx.vinculoConsultoria.createMany({ data: consultoria.map((servico) => ({
        publico: 'PF', cliente_id: pessoa.id, servico, criado_por: user.email ?? user.id,
      })) });
      return pessoa;
    });
  }

  async atualizar(id: string, e: Record<string, unknown>) {
    if (!(await this.prisma.pessoaFisica.findUnique({ where: { id } }))) throw new NotFoundException('Pessoa física não encontrada.');
    return this.prisma.pessoaFisica.update({ where: { id }, data: await this.dados(e, true, id) });
  }

  /** Excluir leva junto os documentos e os arquivos dela (do banco e do armazenamento). Só administrador. */
  async excluir(user: Ator, id: string) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores excluem pessoas físicas.');
    if (!(await this.prisma.pessoaFisica.findUnique({ where: { id } }))) throw new NotFoundException('Pessoa física não encontrada.');
    const arquivos = await this.prisma.arquivoEmpresa.findMany({ where: { pessoa_fisica_id: id }, select: { storage_key: true } });
    await this.prisma.$transaction([
      this.prisma.documentoEmpresa.deleteMany({ where: { pessoa_fisica_id: id } }),
      this.prisma.arquivoEmpresa.deleteMany({ where: { pessoa_fisica_id: id } }),
      this.prisma.pessoaFisica.delete({ where: { id } }),
    ]);
    for (const a of arquivos) await this.storage.removeObject(a.storage_key).catch((e) => this.logger.warn(`Arquivo ${a.storage_key} não removido: ${(e as Error).message}`));
    return { excluida: true };
  }
}
