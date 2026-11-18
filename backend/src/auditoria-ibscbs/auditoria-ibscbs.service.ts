import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { CalculadoraRfbService } from '../calculadora-rfb/calculadora-rfb.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { compararItem, montarPedido, REGRA_CONFERENCIA, ResultadoItem, situacaoDaNota } from './conferencia';
import { lerNotaIbsCbs } from './leitor-ibscbs';

const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const soma = (itens: ResultadoItem[], f: (i: ResultadoItem) => number | null | undefined) => {
  const v = itens.filter((i) => i.situacao !== 'SEM_GRUPO').map(f);
  return v.some((x) => x != null) ? Math.round(v.reduce<number>((s, x) => s + (x ?? 0), 0) * 100) / 100 : null;
};

/**
 * Auditoria do IBS/CBS das notas: toda NF-e/NFC-e do Repositório de XML emitida a partir de 2026 é conferida com a
 * calculadora oficial da Receita (enquadramento, base do art. 12, alíquotas, redução, diferimento e valores). Roda sozinha
 * a cada 20 minutos e confere de novo quando a versão da calculadora muda. Não altera a nota nem o repositório.
 */
@Injectable()
export class AuditoriaIbsCbsService {
  private readonly log = new Logger(AuditoriaIbsCbsService.name);
  private rodando = false;
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly calc: CalculadoraRfbService) {}

  @Cron('*/20 * * * *', { timeZone: 'America/Sao_Paulo' })
  async rodar(limite = 200) {
    if (this.rodando || String(process.env.AUDITORIA_IBSCBS ?? '').toLowerCase() === 'off') return { conferidas: 0 };
    this.rodando = true;
    try {
      const versao = await this.calc.versaoServico();
      if (!versao) return { conferidas: 0, motivo: 'calculadora oficial fora do ar' };
      const marca = `${versao.versaoDb}+${REGRA_CONFERENCIA}`;
      const pendentes = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        select d.id from "DocumentoXml" d left join "AuditoriaIbsCbs" a on a.documento_id = d.id
        where d.tipo = 'NFE' and d.conteudo = 'COMPLETO' and d.evento_tipo = '' and d.storage_key is not null
          and d.data_emissao >= '2026-01-01' and (a.id is null or a.versao_db <> ${marca})
        order by d.data_emissao desc limit ${limite}`);
      if (!pendentes.length) return { conferidas: 0 };
      const classes = new Set((await this.prisma.classTrib.findMany({ select: { c_class_trib: true } })).map((c) => c.c_class_trib));
      let n = 0;
      for (const { id } of pendentes) {
        try { await this.conferir(id, marca, classes); n++; } catch (e) { this.log.warn(`Auditoria IBS/CBS do documento ${id}: ${(e as Error).message}`); }
      }
      if (n) this.log.log(`Auditoria IBS/CBS: ${n} notas conferidas (calculadora ${versao.versaoApp}, banco ${versao.versaoDb}).`);
      return { conferidas: n };
    } finally {
      this.rodando = false;
    }
  }

  async conferir(documentoId: string, versaoDb: string, classes: Set<string>) {
    const d = await this.prisma.documentoXml.findUniqueOrThrow({ where: { id: documentoId } });
    const empresa = await this.prisma.empresa.findUnique({ where: { id: d.empresa_id }, select: { cnpj_cpf: true } });
    const xml = (await this.storage.getObjectBuffer(d.storage_key!)).toString('utf8');
    const nota = lerNotaIbsCbs(xml);
    let itens: ResultadoItem[];
    let situacao;
    if (nota.ambiente === '2') {
      itens = [];
      situacao = 'HOMOLOGACAO';
    } else if (!nota.itens.some((i) => i.ibscbs)) {
      itens = nota.itens.map((i) => compararItem(i, undefined, classes));
      situacao = 'SEM_GRUPO';
    } else {
      const pedido = montarPedido(nota);
      const r = pedido.itens.length ? await this.calc.post<{ objetos?: { nObj: number; estadoItem: string }[] }>('/observabilidade/regime-geral', pedido, 120_000) : { http: 200, json: { objetos: [] } };
      if (r.http >= 400 && !r.json?.objetos) throw new Error(`calculadora respondeu ${r.http}`);
      const objs = r.json?.objetos ?? [];
      itens = nota.itens.map((i) => compararItem(i, objs.find((o) => o.nObj === i.numero) as never, classes));
      situacao = situacaoDaNota(itens);
    }
    const dados = {
      empresa_id: d.empresa_id, chave: d.chave, modelo: nota.modelo || d.modelo, data_emissao: d.data_emissao, emitente_doc: d.emitente_doc, emitente_nome: d.emitente_nome,
      papel: so(nota.emitente) && so(nota.emitente) === so(empresa?.cnpj_cpf) ? 'EMITIDA' : 'RECEBIDA', situacao,
      itens: itens.filter((i) => i.situacao !== 'SEM_GRUPO').length, itens_divergentes: itens.filter((i) => ['DIVERGENTE', 'ENQUADRAMENTO'].includes(i.situacao)).length,
      vbc_nota: soma(itens, (i) => i.nota.vBC), vbc_oficial: soma(itens, (i) => i.oficial?.vBC), ibs_nota: soma(itens, (i) => i.nota.vIBS), ibs_oficial: soma(itens, (i) => i.oficial?.vIBS),
      cbs_nota: soma(itens, (i) => i.nota.vCBS), cbs_oficial: soma(itens, (i) => i.oficial?.vCBS),
      detalhes: itens as unknown as Prisma.InputJsonValue, versao_db: versaoDb, conferido_em: new Date(),
    };
    await this.prisma.auditoriaIbsCbs.upsert({ where: { documento_id: d.id }, update: dados, create: { ...dados, documento_id: d.id } });
  }

  /** Lista da empresa no período (pela emissão), com o resumo por situação. */
  async listar(empresaId: string, de?: string, ate?: string) {
    const periodo = de || ate ? { ...(de ? { gte: new Date(`${de}T00:00:00-03:00`) } : {}), ...(ate ? { lte: new Date(`${ate}T23:59:59-03:00`) } : {}) } : null;
    const where: Prisma.AuditoriaIbsCbsWhereInput = { empresa_id: empresaId, ...(periodo ? { data_emissao: periodo } : {}) };
    const [linhas, versao] = await Promise.all([
      this.prisma.auditoriaIbsCbs.findMany({ where, orderBy: { data_emissao: 'desc' }, take: 5000 }),
      this.calc.versaoServico(),
    ]);
    const resumo: Record<string, number> = {};
    for (const l of linhas) resumo[l.situacao] = (resumo[l.situacao] ?? 0) + 1;
    const pendentes = await this.prisma.documentoXml.count({ where: { empresa_id: empresaId, tipo: 'NFE', conteudo: 'COMPLETO', evento_tipo: '', storage_key: { not: null }, data_emissao: { gte: new Date(Math.max(Date.parse('2026-01-01T00:00:00-03:00'), periodo?.gte?.getTime() ?? 0)), ...(periodo?.lte ? { lte: periodo.lte } : {}) } } }) - linhas.length;
    return { versao, resumo, pendentes: Math.max(0, pendentes), linhas };
  }
}
