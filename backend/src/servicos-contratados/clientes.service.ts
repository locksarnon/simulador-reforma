import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TIPOS_DE_SERVICO } from './servicos-contratados.service';

/** O que a tela "Novo cliente" manda. Só a razão social é obrigatória; o grupo econômico é opcional. */
export type NovoCliente = {
  razao_social?: string; cnpj_cpf?: string | null; regime_atual?: string | null; uf?: string | null; municipio?: string | null;
  email_contato?: string | null; whatsapp_contato?: string | null; inscricao_estadual?: string | null; produtor_rural?: string | null;
  observacao?: string | null; grupo?: string | null; servicos?: string[]; responsavel?: string | null; colaborador_id?: string | null;
  cnae_principal?: string | null; cnae_descricao?: string | null; porte?: string | null; natureza_juridica?: string | null; codigo_municipio_ibge?: string | null;
};
type Usuario = { email?: string; role?: string } | undefined;

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const limpo = (v: unknown, max = 200) => {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
};

/** CNPJ ou CPF formatado como no resto do cadastro; vazio vira null. */
export function formatarDocumento(v: unknown): string | null {
  const d = digitos(v);
  if (!d) return null;
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  throw new BadRequestException('O CNPJ tem 14 dígitos e o CPF tem 11.');
}

/** Próximo número de grupo livre no formato #NNN, olhando o maior número já usado (aceita "#001" e "001"). */
export function proximoNumeroDeGrupo(numeros: string[]): string {
  const maior = numeros.reduce((m, n) => Math.max(m, Number(digitos(n)) || 0), 0);
  return `#${String(maior + 1).padStart(3, '0')}`;
}

/**
 * Clientes > Novo cliente: cria a empresa, o grupo (quando não foi escolhido um, o cliente vira o próprio grupo, para as telas
 * de diagnóstico que trabalham por grupo continuarem valendo) e os serviços marcados, tudo de uma vez.
 */
@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(entrada: NovoCliente, usuario?: Usuario) {
    const razao = limpo(entrada.razao_social, 200);
    if (!razao) throw new BadRequestException('Informe o nome ou a razão social do cliente.');
    const doc = formatarDocumento(entrada.cnpj_cpf);
    const servicos = [...new Set(entrada.servicos ?? [])];
    if (servicos.some((s) => !TIPOS_DE_SERVICO.includes(s as never))) throw new BadRequestException(`Serviço inválido. Use ${TIPOS_DE_SERVICO.join(' ou ')}.`);

    if (doc) {
      const todas = await this.prisma.empresa.findMany({ where: { cnpj_cpf: { not: null } }, select: { id: true, razao_social: true, cnpj_cpf: true } });
      const igual = todas.find((e) => digitos(e.cnpj_cpf) === digitos(doc));
      if (igual) throw new ConflictException({ message: `Já existe um cliente com esse documento: ${igual.razao_social}.`, empresa_id: igual.id });
    }

    return this.prisma.$transaction(async (tx) => {
      let numeroGrupo = limpo(entrada.grupo, 40);
      if (numeroGrupo) {
        const existe = await tx.grupo.findFirst({ where: { numero: numeroGrupo } });
        if (!existe) throw new BadRequestException('O grupo econômico escolhido não existe mais.');
      } else {
        const numeros = (await tx.grupo.findMany({ select: { numero: true } })).map((g) => g.numero);
        numeroGrupo = proximoNumeroDeGrupo(numeros);
        await tx.grupo.create({ data: { numero: numeroGrupo, nome: razao, tipo: 'Cliente individual' } });
      }
      const empresa = await tx.empresa.create({
        data: {
          razao_social: razao,
          id_empresa: (digitos(doc).slice(0, 8) || razao.replace(/\s+/g, '').slice(0, 12)).toUpperCase(),
          grupo: numeroGrupo,
          cnpj_cpf: doc,
          regime_atual: limpo(entrada.regime_atual, 60),
          uf: limpo(entrada.uf, 2)?.toUpperCase() ?? null,
          municipio: limpo(entrada.municipio, 120),
          email_contato: limpo(entrada.email_contato, 200),
          whatsapp_contato: limpo(entrada.whatsapp_contato, 30),
          inscricao_estadual: limpo(entrada.inscricao_estadual, 30),
          produtor_rural: limpo(entrada.produtor_rural, 10),
          observacao: limpo(entrada.observacao, 2000),
          cnae_principal: limpo(entrada.cnae_principal, 10),
          cnae_descricao: limpo(entrada.cnae_descricao, 300),
          porte: limpo(entrada.porte, 60),
          natureza_juridica: limpo(entrada.natureza_juridica, 120),
          codigo_municipio_ibge: limpo(entrada.codigo_municipio_ibge, 7),
          dados_publicos_em: entrada.cnae_principal || entrada.porte ? new Date() : null,
          status: 'Ativa',
        },
      });
      const responsavel = limpo(entrada.responsavel, 120);
      for (const tipo of servicos) {
        await tx.servicoContratado.create({
          data: { empresa_id: empresa.id, tipo, situacao: 'ATIVO', inicio: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'), responsavel, atualizado_por: usuario?.email ?? null },
        });
      }
      const colaborador = limpo(entrada.colaborador_id, 60);
      if (colaborador && usuario?.role === 'admin') {
        const user = await tx.user.findUnique({ where: { id: colaborador }, select: { id: true } });
        if (user) await tx.vinculoColaborador.create({ data: { user_id: user.id, empresa_id: empresa.id } });
      }
      return empresa;
    });
  }
}
