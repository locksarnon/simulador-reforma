import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Nomes de entidade expostos via /entities/:model — espelham exatamente os
 * nomes de model em prisma/schema.prisma (por sua vez portados 1:1 de
 * base44/entities/*.jsonc) e o que o frontend chama via base44.entities.<Nome>.
 * NUNCA inclui User/RefreshToken/PasswordResetToken — essas tabelas só são
 * acessíveis via /auth/*.
 */
const ALLOWED_MODELS = [
  'Grupo',
  'Empresa',
  'Operacao',
  'Cenario',
  'TransicaoAno',
  'ClassTrib',
  'CstIbsCbs',
  'CredPres',
  'Configuracao',
  'Diagnostico',
  'ImportacaoXMLLote',
  'ImportacaoXMLArquivo',
  'ImportacaoXMLItem',
  'HistoricoXML',
  'Simulacao',
  'Ncm',
  'Cfop',
  'BeneficioFiscal',
  'CorrelacaoServico',
  'CorrelacaoNcm',
  'NoticiaReforma',
] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

function delegateKey(model: AllowedModel): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

@Injectable()
export class EntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  assertAllowed(model: string): AllowedModel {
    if (!(ALLOWED_MODELS as readonly string[]).includes(model)) {
      throw new NotFoundException(`Entidade "${model}" não existe.`);
    }
    return model as AllowedModel;
  }

  private allowedFields(model: AllowedModel): Set<string> {
    const meta = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
    if (!meta) throw new NotFoundException(`Entidade "${model}" não existe.`);
    return new Set(meta.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => f.name));
  }

  /**
   * O frontend manda "" para campos numéricos/data deixados em branco (ex:
   * um <input type="date"> vazio, ou um <input type="number"> limpo pelo
   * usuário) — Prisma rejeita "" para DateTime/Int/Float com um erro baixo
   * nível ("premature end of input. Expected ISO-8601 DateTime"). Converte
   * "" para null nesses campos antes de mandar pro Prisma.
   *
   * <input type="date"> também manda só "YYYY-MM-DD" (sem hora) quando
   * preenchido — que Prisma TAMBÉM rejeita com o mesmo erro ("premature end
   * of input", porque ISO-8601 completo exige a parte de hora). Completa
   * com "T00:00:00.000Z" nesse caso.
   *
   * Ignora campos que não existem no model (evita "Unknown argument" em
   * payloads com lixo).
   */
  private sanitize(model: AllowedModel, data: Record<string, unknown>): Record<string, unknown> {
    const meta = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
    if (!meta) throw new NotFoundException(`Entidade "${model}" não existe.`);
    const fieldTypes = new Map(meta.fields.map((f) => [f.name, f.type]));
    const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!fieldTypes.has(key)) continue;
      const type = fieldTypes.get(key) as string;
      if (value === '' && ['DateTime', 'Int', 'Float'].includes(type)) {
        out[key] = null;
      } else if (type === 'DateTime' && typeof value === 'string' && DATE_ONLY.test(value)) {
        out[key] = `${value}T00:00:00.000Z`;
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  private delegate(model: AllowedModel) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as any)[delegateKey(model)];
  }

  private buildWhere(model: AllowedModel, filter?: Record<string, unknown>) {
    if (!filter || Object.keys(filter).length === 0) return {};
    const allowed = this.allowedFields(model);
    const where: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(filter)) {
      if (!allowed.has(key)) {
        throw new BadRequestException(`Campo de filtro inválido para ${model}: "${key}"`);
      }
      where[key] = value;
    }
    return where;
  }

  private buildOrderBy(model: AllowedModel, sort?: string) {
    if (!sort) return undefined;
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;
    const allowed = this.allowedFields(model);
    if (!allowed.has(field)) {
      throw new BadRequestException(`Campo de ordenação inválido para ${model}: "${field}"`);
    }
    return { [field]: desc ? 'desc' : 'asc' };
  }

  async list(modelName: string) {
    const model = this.assertAllowed(modelName);
    return this.delegate(model).findMany();
  }

  async query(modelName: string, body: { filter?: Record<string, unknown>; sort?: string; limit?: number }) {
    const model = this.assertAllowed(modelName);
    const where = this.buildWhere(model, body?.filter);
    const orderBy = this.buildOrderBy(model, body?.sort);
    return this.delegate(model).findMany({
      where,
      ...(orderBy ? { orderBy } : {}),
      ...(body?.limit ? { take: body.limit } : {}),
    });
  }

  async get(modelName: string, id: string) {
    const model = this.assertAllowed(modelName);
    const row = await this.delegate(model).findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`${model} "${id}" não encontrado.`);
    return row;
  }

  async create(modelName: string, data: Record<string, unknown>) {
    const model = this.assertAllowed(modelName);
    return this.delegate(model).create({ data: this.sanitize(model, data) });
  }

  async update(modelName: string, id: string, data: Record<string, unknown>) {
    const model = this.assertAllowed(modelName);
    const { id: _drop, ...rest } = data;
    return this.delegate(model).update({ where: { id }, data: this.sanitize(model, rest) });
  }

  async remove(modelName: string, id: string) {
    const model = this.assertAllowed(modelName);
    await this.delegate(model).delete({ where: { id } });
    return { ok: true };
  }

  async bulkCreate(modelName: string, rows: Record<string, unknown>[]) {
    const model = this.assertAllowed(modelName);
    const delegate = this.delegate(model);
    // Prisma createMany não retorna as linhas criadas — cria uma a uma numa
    // transação para poder devolver os registros completos (com id), que é
    // o contrato que o SDK base44 original (e o código que consome a
    // resposta) espera.
    return this.prisma.$transaction(rows.map((row) => delegate.create({ data: this.sanitize(model, row) })));
  }

  async bulkUpdate(modelName: string, rows: { id: string; [key: string]: unknown }[]) {
    const model = this.assertAllowed(modelName);
    const delegate = this.delegate(model);
    return this.prisma.$transaction(
      rows.map(({ id, ...rest }) => delegate.update({ where: { id }, data: this.sanitize(model, rest) })),
    );
  }
}
