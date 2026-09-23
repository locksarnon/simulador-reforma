import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AvaliacaoNcm, ClasseInfo, CorrelacaoNcmRow, avaliarNcm, prepararLista, soDigitos, textoConfianca,
} from './ncm-classe';

const CACHE_MS = 5 * 60 * 1000;

export type Tratamento = {
  situacao: 'ALIQUOTA_ZERO' | 'REDUCAO' | 'PADRAO_OU_OUTRA_BASE' | 'AMBIGUO';
  titulo: string;
  classes: { c_class_trib: string; descricao: string | null; pct_reducao_ibs: number; pct_reducao_cbs: number; cst: string | null }[];
  anexos: { anexo: string; item_lei: number | null; produto: string | null }[];
  confianca: string;
  aviso: string;
};

/**
 * Base de conhecimento NCM x classificação em memória (a tabela tem centenas
 * de linhas, não milhões — cache de 5 min evita ir ao banco a cada consulta).
 */
@Injectable()
export class ClassificacaoService {
  private lista: ReturnType<typeof prepararLista> = [];
  private classes = new Map<string, ClasseInfo>();
  private carregadoEm = 0;

  constructor(private readonly prisma: PrismaService) {}

  async garantirBase() {
    if (Date.now() - this.carregadoEm < CACHE_MS && this.lista.length > 0) return;
    const [corr, cls] = await Promise.all([
      this.prisma.correlacaoNcm.findMany(),
      this.prisma.classTrib.findMany({ where: { status: 'Ativo' } }),
    ]);
    this.lista = prepararLista(corr as CorrelacaoNcmRow[]);
    this.classes = new Map(cls.map((c) => [c.c_class_trib, c as unknown as ClasseInfo]));
    this.carregadoEm = Date.now();
  }

  async base() {
    await this.garantirBase();
    return { lista: this.lista, classes: this.classes };
  }

  async avaliar(ncm: string) {
    await this.garantirBase();
    return avaliarNcm(ncm, this.lista);
  }

  tratamentoDe(av: AvaliacaoNcm): Tratamento {
    const aviso =
      'Resultado orientativo, baseado nos anexos da LC 214/2025 já mapeados. Não substitui a classificação fiscal do contribuinte nem a análise de um especialista.';
    if (!av.encontrado) {
      return {
        situacao: 'PADRAO_OU_OUTRA_BASE',
        titulo: 'Sem tratamento diferenciado nos anexos consultados',
        classes: [], anexos: [], confianca: '—',
        aviso: `${aviso} Isso não exclui benefício por outra base legal (produtor rural, regime específico, etc.).`,
      };
    }
    const classes = av.classes.map((c) => {
      const info = this.classes.get(c);
      return {
        c_class_trib: c,
        descricao: info?.descricao_oficial ?? null,
        pct_reducao_ibs: Number(info?.pct_reducao_ibs ?? 0),
        pct_reducao_cbs: Number(info?.pct_reducao_cbs ?? 0),
        cst: info?.cst ?? null,
      };
    });
    const anexos = av.matches.map((m) => ({ anexo: m.anexo, item_lei: m.item_lei, produto: m.descricao_produto }));
    const maior = Math.max(...classes.map((c) => Math.max(c.pct_reducao_ibs, c.pct_reducao_cbs)));
    const situacao: Tratamento['situacao'] = av.ambiguo ? 'AMBIGUO' : maior >= 1 ? 'ALIQUOTA_ZERO' : maior > 0 ? 'REDUCAO' : 'PADRAO_OU_OUTRA_BASE';
    const titulo = av.ambiguo
      ? 'O NCM cobre produtos com tratamentos diferentes — depende do produto'
      : situacao === 'ALIQUOTA_ZERO' ? 'Alíquota zero de IBS/CBS'
      : situacao === 'REDUCAO' ? `Redução de ${Math.round(maior * 100)}% de IBS/CBS`
      : 'Tratamento específico previsto na lei';
    return { situacao, titulo, classes, anexos, confianca: textoConfianca(av.confianca), aviso };
  }

  /** Consulta por código (prefixo) ou por texto da descrição. */
  async consultar(q: string, limite = 25) {
    const termo = (q || '').trim();
    if (termo.length < 2) return { total: 0, itens: [], truncado: false };
    await this.garantirBase();

    const d = soDigitos(termo);
    const ehCodigo = d.length >= 2 && /^[\d.\s-]+$/.test(termo);
    const where = ehCodigo
      ? { codigo: { startsWith: d } }
      : { descricao: { contains: termo, mode: 'insensitive' as const } };

    const [total, rows] = await Promise.all([
      this.prisma.ncm.count({ where }),
      this.prisma.ncm.findMany({ where, orderBy: { codigo: 'asc' }, take: limite }),
    ]);

    const itens = rows.map((n) => {
      const av = avaliarNcm(n.codigo, this.lista);
      return {
        codigo: n.codigo,
        codigo_formatado: `${n.codigo.slice(0, 4)}.${n.codigo.slice(4, 6)}.${n.codigo.slice(6, 8)}`,
        descricao: n.descricao,
        status: n.status,
        tratamento: this.tratamentoDe(av),
      };
    });
    return { total, itens, truncado: total > limite };
  }
}
