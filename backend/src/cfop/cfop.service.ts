import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CFOP_PADRAO, TRATAMENTOS_VALIDOS, descricaoCfop, somenteDigitos } from './cfop.regras';

@Injectable()
export class CfopService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista-padrão + ajustes de cada empresa (por Empresa.id). */
  async tratamentos(empresaIds: string[]) {
    const ids = [...new Set(empresaIds.filter(Boolean))].slice(0, 200);
    const ajustes = ids.length ? await this.prisma.cfopEmpresaRegra.findMany({ where: { empresa_id: { in: ids } } }) : [];
    const porEmpresa: Record<string, Record<string, string>> = {};
    for (const a of ajustes) (porEmpresa[a.empresa_id] ||= {})[a.cfop] = a.tratamento;
    return {
      padrao: Object.fromEntries(CFOP_PADRAO.map((r) => [r.cfop, { tratamento: r.tratamento, categoria: r.categoria, descricao: r.descricao }])),
      empresas: porEmpresa,
    };
  }

  /** Só os ajustes de uma empresa (usado na confirmação da importação). */
  async ajustesDaEmpresa(empresaId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.cfopEmpresaRegra.findMany({ where: { empresa_id: empresaId } });
    return Object.fromEntries(rows.map((r) => [r.cfop, r.tratamento]));
  }

  async definir(empresaId: string, cfopRaw: string, tratamento: string, email: string) {
    const cfop = somenteDigitos(cfopRaw);
    if (cfop.length !== 4) throw new BadRequestException('CFOP deve ter 4 dígitos.');
    if (!(TRATAMENTOS_VALIDOS as string[]).includes(tratamento)) throw new BadRequestException('Tratamento inválido.');
    if (!empresaId) throw new BadRequestException('Empresa obrigatória.');
    const r = await this.prisma.cfopEmpresaRegra.upsert({
      where: { empresa_id_cfop: { empresa_id: empresaId, cfop } },
      create: { empresa_id: empresaId, cfop, tratamento, atualizado_por: email },
      update: { tratamento, atualizado_por: email },
    });
    return { cfop: r.cfop, tratamento: r.tratamento, descricao: descricaoCfop(cfop) };
  }

  /** Desfaz o ajuste: volta ao padrão. */
  async desfazer(empresaId: string, cfopRaw: string) {
    await this.prisma.cfopEmpresaRegra.deleteMany({ where: { empresa_id: empresaId, cfop: somenteDigitos(cfopRaw) } });
    return { ok: true };
  }
}
