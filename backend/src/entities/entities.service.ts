import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AVISO_CUSTODIA_SO_ADMIN, empresasComCustodiaXml } from '../common/custodia-xml';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/**
 * Nomes de entidade expostos via /entities/:model — espelham exatamente os
 * nomes de model em prisma/schema.prisma e o que o frontend chama via
 * api.entities.<Nome>.
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
  'AliquotaIssMunicipio',
  'AliquotaCombustivel',
  'NoticiaReforma',
  'RadarReformaItem',
  'RadarReformaExecucao',
  'Lead',
  'NewsletterInscrito',
  'NewsletterEdicao',
] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

function delegateKey(model: AllowedModel): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

@Injectable()
export class EntitiesService {
  private readonly log = new Logger(EntitiesService.name);

  constructor(private readonly prisma: PrismaService, @Optional() private readonly storage?: StorageService) {}

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

  /** `user` é quem pediu a exclusão pela API (a regra de custódia usa o papel dele); chamadas internas não o passam. */
  /** Grupo só sai sem empresas (as empresas não podem ficar sem grupo, e cliente não é excluído). */
  async exigirGrupoVazio(id: string) {
    const g = await this.prisma.grupo.findUnique({ where: { id } });
    if (!g) return;
    const n = await this.prisma.empresa.count({ where: { grupo: g.numero } });
    if (n > 0) throw new ForbiddenException(`O grupo tem ${n} empresa(s). Clientes não são excluídos: mova as empresas para outro grupo ou arquive-as.`);
  }

  async remove(modelName: string, id: string, user?: { email?: string; role?: string }) {
    const model = this.assertAllowed(modelName);
    if (model === 'Empresa') await this.apagarAnalisesDaEmpresa(id, user);
    await this.delegate(model).delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Ao excluir uma empresa, saem junto os itens da lista "Análises salvas" dela (análises de serviços, validações de cadastro com o arquivo guardado e
   * projetos de saneamento). Sem isso ficavam registros órfãos, sem empresa para abri-los nem como excluí-los.
   */
  private async apagarAnalisesDaEmpresa(empresa_id: string, user?: { email?: string; role?: string }) {
    // O certificado do cliente e os XML dele são custódia da FAL: só administrador exclui a empresa que os guarda.
    const comCustodia = (await empresasComCustodiaXml(this.prisma, [empresa_id])).length > 0;
    if (comCustodia && user && user.role !== 'admin') throw new ForbiddenException(AVISO_CUSTODIA_SO_ADMIN);
    const validacoes = await this.prisma.validacaoCadastro.findMany({ where: { empresa_id }, select: { storage_key: true } });
    const xmls = await this.prisma.documentoXml.findMany({ where: { empresa_id }, select: { storage_key: true } });
    const arquivos = await this.prisma.arquivoEmpresa.findMany({ where: { empresa_id }, select: { storage_key: true } });
    // PDF das consultas do monitoramento fiscal (guias, relatórios) também saem do armazenamento.
    const consultas = await this.prisma.consultaFiscal.findMany({ where: { empresa_id }, select: { arquivos: true } });
    const pdfs = consultas.flatMap((c) => (Array.isArray(c.arquivos) ? (c.arquivos as { key?: string }[]) : [])).map((a) => ({ storage_key: a?.key ?? null }));
    await this.prisma.$transaction([
      this.prisma.saneamentoProjeto.deleteMany({ where: { empresa_id } }),
      this.prisma.analiseEmpresa.deleteMany({ where: { empresa_id } }),
      this.prisma.validacaoCadastro.deleteMany({ where: { empresa_id } }),
      // Repositório de XML: o certificado do cliente (chave cifrada) e os XML não podem sobrar sem a empresa. A trilha de auditoria fica.
      this.prisma.documentoXml.deleteMany({ where: { empresa_id } }),
      this.prisma.certificadoDigital.deleteMany({ where: { empresa_id } }),
      this.prisma.capturaXmlConfig.deleteMany({ where: { empresa_id } }),
      this.prisma.capturaXmlExecucao.deleteMany({ where: { empresa_id } }),
      this.prisma.xmlEmpresaConfig.deleteMany({ where: { empresa_id } }),
      // Serviços contratados (carteira do BPO e do diagnóstico): não ficam sem a empresa.
      this.prisma.servicoContratado.deleteMany({ where: { empresa_id } }),
      // Núcleo operacional: a carteira por colaborador, as etiquetas e as tarefas da empresa saem junto; os eventos do calendário só perdem o vínculo.
      this.prisma.vinculoColaborador.deleteMany({ where: { empresa_id } }),
      this.prisma.empresaTag.deleteMany({ where: { empresa_id } }),
      this.prisma.tarefa.deleteMany({ where: { empresa_id } }),
      this.prisma.eventoAgenda.updateMany({ where: { empresa_id }, data: { empresa_id: null } }),
      // Arquivos e documentos da empresa saem junto (os arquivos também do armazenamento, logo abaixo).
      this.prisma.documentoEmpresa.deleteMany({ where: { empresa_id } }),
      this.prisma.arquivoEmpresa.deleteMany({ where: { empresa_id } }),
      // Monitoramento fiscal: as consultas e as obrigações dispensadas da empresa; os projetos de diagnóstico só perdem a empresa.
      this.prisma.consultaFiscal.deleteMany({ where: { empresa_id } }),
      this.prisma.obrigacaoDispensada.deleteMany({ where: { empresa_id } }),
      this.prisma.$executeRaw`UPDATE "ProjetoDiagnostico" SET "empresa_ids" = array_remove("empresa_ids", ${empresa_id})`,
      // A trilha de auditoria fica e diz quem apagou; só se registra quando havia algo guardado.
      ...(comCustodia
        ? [this.prisma.auditoriaCertificado.create({
          data: { empresa_id, acao: 'EMPRESA_EXCLUIDA', usuario: user?.email || 'sistema', detalhe: 'Certificado, XML e configurações da captura apagados junto com a empresa.' },
        })]
        : []),
    ]);
    for (const v of [...validacoes, ...xmls, ...arquivos, ...pdfs]) {
      if (!this.storage || !v.storage_key || /^https?:\/\//i.test(v.storage_key)) continue;
      await this.storage.removeObject(v.storage_key).catch((e) => this.log.warn(`Arquivo ${v.storage_key} não removido do armazenamento: ${(e as Error).message}`));
    }
  }

  async bulkCreate(modelName: string, rows: Record<string, unknown>[]) {
    const model = this.assertAllowed(modelName);
    const delegate = this.delegate(model);
    // Prisma createMany não retorna as linhas criadas — cria uma a uma numa
    // transação para poder devolver os registros completos (com id), que é
    // o contrato que o código que consome a resposta espera.
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
