/**
 * Relatórios do Repositório de XML, no espírito dos do Notalize: o Geral (quantos documentos, de que tipo, em que situação e quanto
 * valem) e o de Produtos (os itens das NF-e e NFC-e, soltos ou agrupados por produto, NCM ou CFOP).
 * O Geral sai só do índice do banco. O de Produtos lê cada XML guardado, então tem teto de notas por relatório.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ErroLeituraDocumento } from './pdf/erros';
import { ItemNfe, lerNfe } from './pdf/nfe-leitor';
import { FiltrosDocumentos, construirWhere, emLotes } from './repositorio-xml.service';

export type FiltrosRelatorio = FiltrosDocumentos & {
  /** Relatório Geral: conta também os documentos que só têm o resumo. */
  incluirResumos?: boolean;
  /** Relatório de Produtos: texto procurado no código, na descrição, no NCM e no CFOP dos itens. */
  busca?: string;
  /** Relatório de Produtos: `itens` (cada item de cada nota), `produto`, `ncm` ou `cfop`. */
  agrupar?: string;
};

export const TIPOS_DE_DOCUMENTO = ['NFE', 'CTE', 'MDFE', 'NFSE'];
/** Linhas que o relatório devolve; o que passar disso é cortado e o relatório diz que foi cortado. */
export const MAX_LINHAS_RELATORIO = 20000;
/** O relatório de Produtos abre um XML por nota: acima disso a pessoa reduz o período. */
export const MAX_NOTAS_PRODUTOS = 2000;
const PARALELISMO = 8;
const MAX_FALHAS_LISTADAS = 20;

/** Nome do documento como a tela mostra: a NFC-e e o CT-e OS são do tipo NF-e e CT-e no repositório, e o modelo os distingue. */
export function rotuloDoDocumento(tipo: string, modelo: string | null): string {
  if (tipo === 'NFE') return modelo === '65' ? 'NFC-e' : 'NF-e';
  if (tipo === 'CTE') return modelo === '67' ? 'CT-e OS' : 'CT-e';
  if (tipo === 'MDFE') return 'MDF-e';
  if (tipo === 'NFSE') return 'NFS-e';
  return tipo;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const numero = (txt: string | null | undefined): number => {
  const n = Number(String(txt ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

// ── Relatório Geral ──────────────────────────────────────────────────

export interface LinhaGeral {
  id: string; documento: string; numero: string | null; serie: string | null; data_emissao: string | null; chave: string;
  emitente_nome: string | null; emitente_doc: string | null; destinatario_doc: string | null; valor_total: number | null;
  situacao: string | null; origem: string; conteudo: string; importado: boolean;
}
export interface ResumoPorDocumento {
  documento: string; total: number; autorizadas: number; canceladas: number; denegadas: number; sem_situacao: number;
  valor_total: number; valor_autorizadas: number;
}
export interface RelatorioGeral {
  resumo: { documentos: number; valor_autorizadas: number; canceladas: number; por_documento: ResumoPorDocumento[] };
  linhas: LinhaGeral[];
  truncado: boolean;
}

// ── Relatório de Produtos ────────────────────────────────────────────

export interface LinhaProduto {
  data_emissao: string | null; numero: string; serie: string; chave: string; emitente_nome: string; emitente_doc: string;
  item: string; codigo: string; descricao: string; ncm: string; cfop: string; unidade: string;
  quantidade: number; valor_unitario: number; valor_total: number; desconto: number; valor_icms: number; valor_ipi: number;
}
export interface GrupoProduto {
  chave: string; descricao: string; ncm: string; cfop: string; unidade: string; produtos: number; notas: number; itens: number;
  quantidade: number; valor_total: number; desconto: number; valor_icms: number; valor_ipi: number;
}
export interface RelatorioProdutos {
  modo: 'itens' | 'produto' | 'ncm' | 'cfop';
  resumo: { notas: number; notas_com_falha: number; itens: number; valor_total: number; desconto: number };
  linhas: LinhaProduto[];
  grupos: GrupoProduto[];
  truncado: boolean;
  falhas: { chave: string; motivo: string }[];
}

type Modo = RelatorioProdutos['modo'];
const MODOS: Modo[] = ['itens', 'produto', 'ncm', 'cfop'];

function chaveDoGrupo(l: LinhaProduto, modo: Exclude<Modo, 'itens'>): string {
  if (modo === 'ncm') return l.ncm || '(sem NCM)';
  if (modo === 'cfop') return l.cfop || '(sem CFOP)';
  return `${l.descricao.trim().toUpperCase()}|${l.unidade.trim().toUpperCase()}`;
}

/** Soma os itens por produto (descrição e unidade), por NCM ou por CFOP, do maior valor para o menor. */
export function agruparLinhas(linhas: LinhaProduto[], modo: Exclude<Modo, 'itens'>): GrupoProduto[] {
  const mapa = new Map<string, { g: GrupoProduto; notas: Set<string>; descricoes: Set<string>; ncms: Set<string>; cfops: Set<string> }>();
  for (const l of linhas) {
    const k = chaveDoGrupo(l, modo);
    let e = mapa.get(k);
    if (!e) {
      e = {
        g: { chave: k, descricao: l.descricao, ncm: l.ncm, cfop: l.cfop, unidade: l.unidade, produtos: 0, notas: 0, itens: 0, quantidade: 0, valor_total: 0, desconto: 0, valor_icms: 0, valor_ipi: 0 },
        notas: new Set(), descricoes: new Set(), ncms: new Set(), cfops: new Set(),
      };
      mapa.set(k, e);
    }
    e.notas.add(l.chave);
    e.descricoes.add(l.descricao.trim().toUpperCase());
    if (l.ncm) e.ncms.add(l.ncm);
    if (l.cfop) e.cfops.add(l.cfop);
    e.g.itens += 1;
    e.g.quantidade += l.quantidade;
    e.g.valor_total += l.valor_total;
    e.g.desconto += l.desconto;
    e.g.valor_icms += l.valor_icms;
    e.g.valor_ipi += l.valor_ipi;
  }
  return [...mapa.values()]
    .map(({ g, notas, descricoes, ncms, cfops }) => ({
      ...g,
      // Mais de um NCM ou CFOP no mesmo produto aparece como lista, para a pessoa ver que há divergência.
      ncm: [...ncms].slice(0, 3).join(' / ') || g.ncm,
      cfop: [...cfops].slice(0, 3).join(' / ') || g.cfop,
      produtos: descricoes.size,
      notas: notas.size,
      quantidade: r4(g.quantidade), valor_total: r2(g.valor_total), desconto: r2(g.desconto), valor_icms: r2(g.valor_icms), valor_ipi: r2(g.valor_ipi),
    }))
    .sort((a, b) => b.valor_total - a.valor_total || a.chave.localeCompare(b.chave));
}

function linhaDoItem(doc: { data_emissao: Date | null; numero: string | null; serie: string | null; chave: string; emitente_nome: string | null; emitente_doc: string | null }, i: ItemNfe): LinhaProduto {
  return {
    data_emissao: doc.data_emissao ? doc.data_emissao.toISOString() : null,
    numero: doc.numero ?? '', serie: doc.serie ?? '', chave: doc.chave, emitente_nome: doc.emitente_nome ?? '', emitente_doc: doc.emitente_doc ?? '',
    item: i.numero, codigo: i.codigo, descricao: i.descricao, ncm: i.ncm, cfop: i.cfop, unidade: i.unidade,
    quantidade: numero(i.quantidade), valor_unitario: numero(i.valorUnitario), valor_total: numero(i.valorTotal), desconto: numero(i.desconto),
    valor_icms: numero(i.valorIcms), valor_ipi: numero(i.valorIpi),
  };
}

const contem = (txt: string, busca: string) => txt.toLowerCase().includes(busca);

@Injectable()
export class RelatoriosXmlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async garantirEmpresa(empresaId: string) {
    const e = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true } });
    if (!e) throw new NotFoundException('Empresa não localizada.');
  }

  /** Documentos do período por tipo e situação, com a lista de cada um. Os eventos não entram: o cancelamento já vale na situação do documento. */
  async geral(empresaId: string, f: FiltrosRelatorio): Promise<RelatorioGeral> {
    await this.garantirEmpresa(empresaId);
    const doc = (await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { cnpj_cpf: true } }))?.cnpj_cpf ?? '';
    const where = construirWhere(empresaId, { ...f, tipo: undefined, conteudo: f.incluirResumos ? undefined : 'COMPLETO', pendentes: false, documento_empresa: doc });
    where.tipo = f.tipo && TIPOS_DE_DOCUMENTO.includes(f.tipo) ? f.tipo : { in: TIPOS_DE_DOCUMENTO };

    const [grupos, docs] = await Promise.all([
      this.prisma.documentoXml.groupBy({ by: ['tipo', 'modelo', 'situacao'], where, _count: { _all: true }, _sum: { valor_total: true } }),
      this.prisma.documentoXml.findMany({
        where, orderBy: [{ data_emissao: 'asc' }, { createdAt: 'asc' }], take: MAX_LINHAS_RELATORIO + 1,
        select: {
          id: true, tipo: true, modelo: true, numero: true, serie: true, data_emissao: true, chave: true, emitente_nome: true, emitente_doc: true,
          destinatario_doc: true, valor_total: true, situacao: true, origem: true, conteudo: true, lote_importacao_id: true,
        },
      }),
    ]);

    const porDocumento = new Map<string, ResumoPorDocumento>();
    for (const g of grupos) {
      const rotulo = rotuloDoDocumento(g.tipo, g.modelo);
      const r = porDocumento.get(rotulo) ?? { documento: rotulo, total: 0, autorizadas: 0, canceladas: 0, denegadas: 0, sem_situacao: 0, valor_total: 0, valor_autorizadas: 0 };
      const qtd = g._count._all;
      const valor = g._sum.valor_total ?? 0;
      r.total += qtd;
      r.valor_total += valor;
      if (g.situacao === 'AUTORIZADA') { r.autorizadas += qtd; r.valor_autorizadas += valor; }
      else if (g.situacao === 'CANCELADA') r.canceladas += qtd;
      else if (g.situacao === 'DENEGADA') r.denegadas += qtd;
      else r.sem_situacao += qtd;
      porDocumento.set(rotulo, r);
    }
    const por_documento = [...porDocumento.values()].map((r) => ({ ...r, valor_total: r2(r.valor_total), valor_autorizadas: r2(r.valor_autorizadas) }));
    const truncado = docs.length > MAX_LINHAS_RELATORIO;
    return {
      resumo: {
        documentos: por_documento.reduce((a, r) => a + r.total, 0),
        valor_autorizadas: r2(por_documento.reduce((a, r) => a + r.valor_autorizadas, 0)),
        canceladas: por_documento.reduce((a, r) => a + r.canceladas, 0),
        por_documento,
      },
      linhas: (truncado ? docs.slice(0, MAX_LINHAS_RELATORIO) : docs).map((d) => ({
        id: d.id, documento: rotuloDoDocumento(d.tipo, d.modelo), numero: d.numero, serie: d.serie, data_emissao: d.data_emissao ? d.data_emissao.toISOString() : null, chave: d.chave,
        emitente_nome: d.emitente_nome, emitente_doc: d.emitente_doc, destinatario_doc: d.destinatario_doc, valor_total: d.valor_total,
        situacao: d.situacao, origem: d.origem, conteudo: d.conteudo, importado: !!d.lote_importacao_id,
      })),
      truncado,
    };
  }

  /**
   * Itens das NF-e e NFC-e com XML completo do período (autorizadas, salvo se o filtro pedir todas), lidos do XML guardado.
   * `agrupar` junta os itens por produto, NCM ou CFOP. Nota que não dá para ler entra na lista de falhas, sem derrubar o relatório.
   */
  async produtos(empresaId: string, f: FiltrosRelatorio): Promise<RelatorioProdutos> {
    await this.garantirEmpresa(empresaId);
    const modo: Modo = MODOS.includes(f.agrupar as Modo) ? (f.agrupar as Modo) : 'itens';
    const where = construirWhere(empresaId, {
      ...f, tipo: 'NFE', grupo: undefined, papel_cte: undefined, conteudo: 'COMPLETO', pendentes: false,
      situacao: f.situacao === 'TODAS' ? undefined : f.situacao || 'AUTORIZADA',
    });
    if (!f.modelo) where.modelo = { in: ['55', '65'] };
    where.storage_key = { not: null };

    const total = await this.prisma.documentoXml.count({ where });
    if (total > MAX_NOTAS_PRODUTOS) {
      throw new BadRequestException(`Há ${total} notas nos filtros e o relatório de Produtos aceita até ${MAX_NOTAS_PRODUTOS.toLocaleString('pt-BR')}. Reduza o período.`);
    }
    const docs = total
      ? await this.prisma.documentoXml.findMany({
        where, orderBy: [{ data_emissao: 'asc' }, { createdAt: 'asc' }],
        select: { chave: true, numero: true, serie: true, data_emissao: true, emitente_nome: true, emitente_doc: true, storage_key: true },
      })
      : [];

    const falhas: { chave: string; motivo: string }[] = [];
    let notasComFalha = 0;
    const porNota = await emLotes(docs, PARALELISMO, async (d) => {
      try {
        const buffer = await this.storage.getObjectBuffer(d.storage_key!);
        const nfe = lerNfe(buffer.toString('utf8').replace(/^﻿/, ''));
        return nfe.itens.map((i) => linhaDoItem(d, i));
      } catch (e) {
        notasComFalha += 1;
        if (falhas.length < MAX_FALHAS_LISTADAS) falhas.push({ chave: d.chave, motivo: e instanceof ErroLeituraDocumento ? e.message : 'Não foi possível ler o XML guardado.' });
        return [] as LinhaProduto[];
      }
    });

    const busca = (f.busca ?? '').trim().toLowerCase();
    let linhas = porNota.flat();
    if (busca) linhas = linhas.filter((l) => contem(l.codigo, busca) || contem(l.descricao, busca) || contem(l.ncm, busca) || contem(l.cfop, busca));

    const resumo = {
      notas: docs.length - notasComFalha, notas_com_falha: notasComFalha, itens: linhas.length,
      valor_total: r2(linhas.reduce((a, l) => a + l.valor_total, 0)), desconto: r2(linhas.reduce((a, l) => a + l.desconto, 0)),
    };
    if (modo !== 'itens') {
      const grupos = agruparLinhas(linhas, modo);
      const truncado = grupos.length > MAX_LINHAS_RELATORIO;
      return { modo, resumo, linhas: [], grupos: truncado ? grupos.slice(0, MAX_LINHAS_RELATORIO) : grupos, truncado, falhas };
    }
    const truncado = linhas.length > MAX_LINHAS_RELATORIO;
    return { modo, resumo, linhas: truncado ? linhas.slice(0, MAX_LINHAS_RELATORIO) : linhas, grupos: [], truncado, falhas };
  }
}
