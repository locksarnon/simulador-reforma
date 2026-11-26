/**
 * Catálogos fiscais que o enquadramento consulta, por interface. As funções de enquadramento são puras e síncronas
 * sobre um instantâneo (`CatalogosFiscais`); `CatalogosFiscaisPrisma.carregar()` monta o instantâneo a partir das tabelas reais:
 *   CorrelacaoNcm (Anexos da LC 214 por NCM) · ClassTrib (tabela cClassTrib da SVRS, com vigência) · Ncm (tabela oficial) · DispositivoLegal (Base legal).
 * Regra de ouro do projeto: tabela cClassTrib da SVRS > texto da LC 214 > calculadora oficial.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AvaliacaoNcm, CorrelacaoNcmRow, ReferenciaAnexo, avaliarNcm, prepararLista, prepararReferencias, referenciasNcm, soDigitos,
} from '../../classificacao/ncm-classe';

export type ClasseFiscal = {
  cClassTrib: string;
  cst: string | null;
  descricao: string | null;
  pctReducaoIbs: number;
  pctReducaoCbs: number;
  /** yyyy-mm-dd; null = sem limite */
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  ativa: boolean;
  fonte: string | null;
};

export interface CatalogosFiscais {
  /** true/false conforme a tabela oficial de NCM; null quando a tabela não está carregada (não dá para afirmar). */
  ncmExiste(ncm: string): boolean | null;
  /** Casamento do NCM com os Anexos da LC 214 (prefixo mais específico; pode ser ambíguo). */
  avaliarNcm(ncm: string): AvaliacaoNcm;
  /** Itens de anexo que citam capítulo/posição inteira (sem classe própria): servem para "revisar", nunca para sugerir classe. */
  referencias(ncm: string): ReferenciaAnexo[];
  /** Todas as versões da classe (vigências distintas); a vigente na data-base é escolhida pelo enquadramento. */
  versoesDaClasse(cClassTrib: string): ClasseFiscal[];
  /** O dispositivo (ex.: norma 'lcp-214-2025', caminho 'art-47') está carregado na Base legal? */
  dispositivoExiste(norma: string, caminho: string): boolean;
}

export type DadosCatalogos = {
  correlacao: CorrelacaoNcmRow[];
  classes: ClasseFiscal[];
  /** Códigos de NCM da tabela oficial (só dígitos) ou null se a tabela não está carregada. */
  ncms: string[] | null;
  dispositivos: { norma: string; caminho: string }[];
};

/** Monta o instantâneo a partir de dados já lidos (usado pelo adaptador Prisma e pelos testes). */
export function criarCatalogos(d: DadosCatalogos): CatalogosFiscais {
  const lista = prepararLista(d.correlacao);
  const refs = prepararReferencias(d.correlacao);
  const ncms = d.ncms ? new Set(d.ncms.map(soDigitos)) : null;
  const classes = new Map<string, ClasseFiscal[]>();
  for (const c of d.classes) (classes.get(c.cClassTrib) ?? classes.set(c.cClassTrib, []).get(c.cClassTrib)!).push(c);
  const disp = new Set(d.dispositivos.map((x) => `${x.norma}|${x.caminho}`));
  return {
    ncmExiste: (n) => (ncms && ncms.size > 0 ? ncms.has(soDigitos(n)) : null),
    avaliarNcm: (n) => avaliarNcm(n, lista),
    referencias: (n) => referenciasNcm(n, refs),
    versoesDaClasse: (c) => classes.get(String(c).trim()) ?? [],
    dispositivoExiste: (norma, caminho) => disp.has(`${norma}|${caminho}`),
  };
}

const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Adaptador Prisma (sem registro em módulo: o integrador injeta). */
@Injectable()
export class CatalogosFiscaisPrisma {
  constructor(private readonly prisma: PrismaService) {}

  async carregar(): Promise<CatalogosFiscais> {
    const [correlacao, classes, ncms, dispositivos] = await Promise.all([
      this.prisma.correlacaoNcm.findMany(),
      this.prisma.classTrib.findMany(),
      this.prisma.ncm.findMany({ where: { status: 'Ativo' }, select: { codigo: true } }),
      this.prisma.dispositivoLegal.findMany({ where: { norma: { chave: 'lcp-214-2025' } }, select: { caminho: true, norma: { select: { chave: true } } } }),
    ]);
    return criarCatalogos({
      correlacao: correlacao as unknown as CorrelacaoNcmRow[],
      classes: classes.map((c) => ({
        cClassTrib: c.c_class_trib, cst: c.cst, descricao: c.descricao_oficial, pctReducaoIbs: Number(c.pct_reducao_ibs ?? 0), pctReducaoCbs: Number(c.pct_reducao_cbs ?? 0),
        vigenciaInicio: dia(c.vigencia_inicio), vigenciaFim: dia(c.vigencia_fim), ativa: c.status === 'Ativo', fonte: c.fonte,
      })),
      ncms: ncms.length ? ncms.map((n) => n.codigo) : null,
      dispositivos: dispositivos.map((x) => ({ norma: x.norma.chave, caminho: x.caminho })),
    });
  }
}
