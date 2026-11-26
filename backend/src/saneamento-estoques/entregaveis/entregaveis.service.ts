import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PdfService } from '../../pdf/pdf.service';
import { fatiar, TIPOS_EXCECAO } from '../dados/constantes';
import { SanVersoesService } from '../dados/versoes.service';
import type { DadosEntrega, EntregaveisPort } from '../dados/portas';
import { paramInteiro, paramTexto } from '../dados/validacao';
import { escalaDaBase } from '../motor/conjuntos';
import { gerarExcelDeDados, gerarExcelMapa } from './excel';
import { montarRelatorio } from './relatorio';
import { carregarPerfil } from '../../erps/erps.service';
import { contarMapa, filtrarMapa, montarMapa, saldoDe, type CasoMapa, type FiltroMapa, type ItemMapa, type LinhaMapa } from './unificacoes';

export type FiltroUnificacoes = FiltroMapa & { pagina?: string | number; limite?: string | number };
const SITUACOES_MAPA = ['PROPOSTA', 'APROVADA', 'AGUARDANDO', 'REGISTRADA'];
const TIPOS_MAPA = ['UNIFICACAO', 'INATIVACAO', 'EQUIVALENCIA', 'TROCA_CODIGO'];
function listaValida(v: unknown, nome: string, validos: string[]): string | undefined {
  const t = paramTexto(v, nome);
  if (t && t.split(',').some((x) => !validos.includes(x.trim()))) throw new BadRequestException(`Valor inválido em "${nome}".`);
  return t;
}

/** Nome de arquivo seguro (ASCII, sem espaços): o cliente vira "agropecuaria-crestani-ltda". */
export function fatiaDoNome(texto: string): string {
  const s = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'cliente';
}

export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PDF = 'application/pdf';

export function nomeDoExcel(cliente: string, versao: { numero: number } | null, hoje = new Date()): string {
  const base = `saneamento-estoques_${fatiaDoNome(cliente)}`;
  return versao ? `${base}_entrega-v${versao.numero}.xlsx` : `${base}_revisao_${hoje.toISOString().slice(0, 10)}.xlsx`;
}
export const nomeDoRelatorio = (cliente: string, versao: { numero: number }) => `relatorio-fechamento_${fatiaDoNome(cliente)}_v${versao.numero}.pdf`;

/** Entregáveis do Saneamento de Estoques: Excel de 6 abas e relatório de fechamento em PDF. É o provider do token SAN_ENTREGAVEIS. */
@Injectable()
export class EntregaveisService implements EntregaveisPort {
  constructor(private readonly pdf: PdfService, private readonly versoes: SanVersoesService, private readonly prisma: PrismaService) {}

  gerarExcel(dados: DadosEntrega): Promise<Buffer> { return gerarExcelDeDados(dados); }

  async gerarRelatorioPdf(dados: DadosEntrega): Promise<Buffer> {
    if (!dados.liberada || !dados.versao) throw new BadRequestException('O relatório de fechamento é gerado a partir de uma versão liberada.');
    return this.pdf.gerar(montarRelatorio(dados));
  }

  /** Dados da versão (liberada) ou da base atual (revisão), com o nome do cliente e do projeto para o cabeçalho. */
  async dados(projetoId: string, versaoId?: string): Promise<DadosEntrega> {
    const d = versaoId ? await this.versoes.exportar(projetoId, versaoId) : await this.versoes.exportarAtual(projetoId);
    const { foto: _foto, ...dados } = d as DadosEntrega & { foto?: unknown };
    const projeto = dados.projeto;
    const empresa = projeto.empresa_id ? await this.prisma.empresa.findUnique({ where: { id: String(projeto.empresa_id) }, select: { razao_social: true, cnpj_cpf: true } }) : null;
    const diag = projeto.diagnostico_id ? await this.prisma.projetoDiagnostico.findUnique({ where: { id: String(projeto.diagnostico_id) }, select: { nome: true } }) : null;
    // Foto liberada antes do Cadastro de ERPs não tem erp_id: vale o ERP atual do projeto.
    const erpId = projeto.erp_id !== undefined ? (projeto.erp_id as string | null) : (await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { erp_id: true } }))?.erp_id ?? null;
    const perfilErp = await carregarPerfil(this.prisma, erpId);
    return { ...dados, perfilErp, projeto: { ...projeto, clienteNome: empresa?.razao_social ?? '', clienteDocumento: empresa?.cnpj_cpf ?? '', diagnosticoNome: diag?.nome ?? '' } };
  }

  async excel(projetoId: string, versaoId?: string): Promise<{ buffer: Buffer; nome: string }> {
    const dados = await this.dados(projetoId, versaoId);
    const nome = nomeDoExcel(String(dados.projeto.clienteNome ?? ''), dados.versao);
    // Os dados são só desta requisição: o gerador esvazia as listas brutas depois de montar o modelo (menos memória no pico).
    return { buffer: await gerarExcelDeDados(dados, { consumir: true }), nome };
  }

  /**
   * Mapa de unificações e inativações da base atual (o mesmo da aba "De para e equivalências" da exportação para revisão). Lê só o que o
   * mapa usa: os casos de Duplicidades, as inativações e exceções da Qualidade, os itens citados (em blocos: o que a linha mostra), de todos
   * os itens só código e saldo extraídos do JSON pelo banco (`codigosESaldos`: a escala do saldo, a mesma detecção da Duplicidade) e os vínculos.
   */
  async mapaAtual(projetoId: string): Promise<{ linhas: LinhaMapa[]; corteDefinido: boolean; escalaSaldo: number }> {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { data_base: true, parametros: true, erp_id: true } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    const brutos = await this.prisma.sanCaso.findMany({
      where: { projeto_id: projetoId, situacao: { in: ['PROPOSTO', 'RASCUNHO', 'APROVADO', 'AGUARDANDO_INFORMACAO'] }, OR: [{ camada: 'DUPLICIDADE' }, { camada: 'QUALIDADE', tipo: { in: ['SEM_MOVIMENTACAO', ...TIPOS_EXCECAO] } }] },
      orderBy: { id: 'asc' },
      select: { id: true, camada: true, tipo: true, itens: true, proposta: true, justificativa: true, motivo: true, situacao: true, decidido_por: true, decidido_em: true },
    });
    const casos: CasoMapa[] = brutos.map((c) => ({
      id: c.id, camada: c.camada, tipo: c.tipo, itens: c.itens, proposta: (c.proposta ?? {}) as Record<string, unknown>, justificativa: c.justificativa ?? '', motivo: c.motivo ?? '',
      situacao: c.situacao, decididoPor: c.decidido_por ?? '', decididoEm: c.decidido_em ?? null,
    }));
    const ids = new Set<string>();
    for (const c of casos) for (const id of c.itens) ids.add(id);
    const itens = new Map<string, ItemMapa>();
    for (const lote of fatiar([...ids], 5000)) {
      for (const i of await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId, id: { in: lote } }, select: { id: true, codigo: true, estabelecimento: true, trabalho: true, ativo: true } })) {
        const t = (i.trabalho ?? {}) as Record<string, unknown>;
        itens.set(i.id, { id: i.id, codigo: String(t.codigo ?? i.codigo), estab: i.estabelecimento ?? '', descricao: String(t.descricao ?? ''), unidade: String(t.unidade ?? ''), saldo: saldoDe(t.saldo), ativo: typeof t.ativo === 'boolean' ? t.ativo : (i.ativo ?? null) });
      }
    }
    const escala = escalaDaBase(await this.codigosESaldos(projetoId));
    const vinculos = await this.prisma.sanVinculoCodigo.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'asc' } });
    const linhas = montarMapa({
      liberada: false, dataBase: p.data_base, casos, item: (id) => itens.get(id), escala, perfilErp: await carregarPerfil(this.prisma, p.erp_id),
      vinculos: vinculos.map((v) => ({ de: v.de, para: v.para, inicio: v.inicio, justificativa: v.justificativa, criadoPor: v.criado_por ?? '' })),
    });
    const corte = (p.parametros as { corteMovimentacao?: unknown } | null)?.corteMovimentacao;
    return { linhas, corteDefinido: typeof corte === 'string' && corte !== '', escalaSaldo: escala };
  }

  /**
   * Código (o de trabalho, senão o da importação) e saldo de todos os itens, só para a escala do saldo. No Postgres, uma consulta que
   * extrai os dois campos do JSON (antes cada página lia o `trabalho` inteiro de 30 mil itens); sem SQL bruto (testes), em blocos.
   */
  async codigosESaldos(projetoId: string): Promise<{ id: string; codigo: string; saldo: number | null }[]> {
    if (typeof (this.prisma as unknown as { $queryRaw?: unknown }).$queryRaw === 'function') {
      const linhas = await this.prisma.$queryRaw<{ id: string; codigo: string | null; saldo: string | null }[]>(Prisma.sql`SELECT "id", COALESCE("trabalho"->>'codigo', "codigo") AS "codigo", "trabalho"->>'saldo' AS "saldo" FROM "SanItem" WHERE "projeto_id" = ${projetoId}`);
      return linhas.map((l) => ({ id: l.id, codigo: String(l.codigo ?? ''), saldo: saldoDe(l.saldo) }));
    }
    const out: { id: string; codigo: string; saldo: number | null }[] = [];
    let cursor: string | undefined;
    for (;;) {
      const lote = await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId }, orderBy: { id: 'asc' }, take: 5000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, codigo: true, trabalho: true } });
      for (const i of lote) { const t = (i.trabalho ?? {}) as Record<string, unknown>; out.push({ id: i.id, codigo: String(t.codigo ?? i.codigo), saldo: saldoDe(t.saldo) }); }
      if (lote.length < 5000) break;
      cursor = lote[lote.length - 1].id;
    }
    return out;
  }

  /** Consulta "Unificações" da tela: filtro por situação, tipo e código; página (`pagina` a partir de 1, `limite` até 500). */
  async unificacoes(projetoId: string, f: FiltroUnificacoes = {}) {
    const filtro: FiltroMapa = { situacao: listaValida(f.situacao, 'situacao', SITUACOES_MAPA), tipo: listaValida(f.tipo, 'tipo', TIPOS_MAPA), busca: paramTexto(f.busca, 'busca') };
    const limite = Math.min(Math.max(paramInteiro(f.limite, 'limite') ?? 100, 1), 500);
    const pagina = Math.max(paramInteiro(f.pagina, 'pagina') ?? 1, 1);
    const { linhas, corteDefinido, escalaSaldo } = await this.mapaAtual(projetoId);
    const filtradas = filtrarMapa(linhas, filtro);
    return {
      linhas: filtradas.slice((pagina - 1) * limite, pagina * limite), pagina, limite, total: filtradas.length, totalGeral: linhas.length,
      ...contarMapa(linhas), corteDefinido, escalaSaldo,
    };
  }

  /** Excel só do mapa (com o mesmo filtro da tela): o que vai para quem faz os ajustes no ERP. */
  async excelUnificacoes(projetoId: string, f: FiltroMapa = {}): Promise<{ buffer: Buffer; nome: string }> {
    const filtro: FiltroMapa = { situacao: listaValida(f.situacao, 'situacao', SITUACOES_MAPA), tipo: listaValida(f.tipo, 'tipo', TIPOS_MAPA), busca: paramTexto(f.busca, 'busca') };
    const { linhas, escalaSaldo } = await this.mapaAtual(projetoId);
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { empresa_id: true } });
    const empresa = p?.empresa_id ? await this.prisma.empresa.findUnique({ where: { id: String(p.empresa_id) }, select: { razao_social: true } }) : null;
    const nome = `unificacoes-e-inativacoes_${fatiaDoNome(empresa?.razao_social ?? '')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return { buffer: await gerarExcelMapa(filtrarMapa(linhas, filtro), { escala: escalaSaldo }), nome };
  }

  /** Sem `versaoId`, usa a última versão liberada; sem nenhuma versão, recusa. */
  async relatorio(projetoId: string, versaoId?: string): Promise<{ buffer: Buffer; nome: string }> {
    let id = versaoId;
    if (!id) {
      const [ultima] = await this.versoes.listar(projetoId);
      if (!ultima) throw new BadRequestException('Libere uma versão do cadastro antes de gerar o relatório de fechamento.');
      id = ultima.id;
    }
    const dados = await this.dados(projetoId, id);
    return { buffer: await this.gerarRelatorioPdf(dados), nome: nomeDoRelatorio(String(dados.projeto.clienteNome ?? ''), dados.versao!) };
  }
}
