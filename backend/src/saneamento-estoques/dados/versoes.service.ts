import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { gunzipSync, gzipSync } from 'node:zlib';
import { PrismaService } from '../../prisma/prisma.service';
import { CASO_ABERTO, TX_LONGA, conflito, igual, quem, type Json, type Usuario } from './constantes';
import type { DadosEntrega } from './portas';

/**
 * Foto CONGELADA da versão liberada (formato 2): itens, células, casos, decisões, impactos, vínculos, importações e o projeto, tudo como
 * estava na hora de liberar. Exportar e comparar leem SÓ daqui, nunca do estado de agora. Células em tuplas [item, camada, situação, revisar, caso].
 */
type Foto = {
  formato: 2;
  projeto: Json;
  itens: Json[];
  celulas: [string, string, string, 0 | 1, string | null][];
  casos: Json[];
  decisoes: Json[];
  impactosSped: Json[];
  vinculos: Json[];
  importacoes: Json[];
};

type CelulaSel = { id: string; item_id: string; camada: string; situacao: string; revisar: boolean; caso_id: string | null };
const flat = (t: Json): Json => { const { campos, ...topo } = t; return { ...topo, ...((campos as Json) ?? {}) }; };
const LOTE_ITENS = 5000;
/** Ordem estável das exportações: código e, em empate, id (a leitura em lotes é por id). */
const porCodigo = (a: Json, b: Json) => (String(a.codigo) < String(b.codigo) ? -1 : String(a.codigo) > String(b.codigo) ? 1 : String(a.id) < String(b.id) ? -1 : 1);
const LOTE_CELULAS = 20_000;

const SEL_ITEM = { id: true, codigo: true, estabelecimento: true, descricao: true, trabalho: true, grupo: true, finalidade: true, tambem_usado_como: true, conjunto_chave: true, ativo: true } as const;
const SEL_CELULA = { id: true, item_id: true, camada: true, situacao: true, revisar: true, caso_id: true } as const;
const SEL_CASO = {
  id: true, camada: true, tipo: true, itens: true, problema: true, evidencia: true, atual: true, proposta: true, justificativa: true, fundamento: true, situacao: true, motivo: true,
  responsavel: true, decidido_por: true, decidido_em: true, origem: true, parecer_ia: true, createdAt: true,
} as const;
const SEL_DECISAO = { item_id: true, caso_id: true, campo: true, antes: true, depois: true, fundamento: true, usuario: true, tipo: true, quando: true } as const;
const SEL_IMPORTACAO = { id: true, arquivo: true, usuario: true, aceitas: true, rejeitadas: true, pendentes: true, createdAt: true } as const;
const SEL_PROJETO = {
  id: true, diagnostico_id: true, empresa_id: true, data_base: true, erp: true, erp_versao: true, estabelecimentos: true, responsavel: true, modulos: true, parametros: true,
  atividades_confirmadas_por: true, atividades_confirmadas_em: true, cnpj_versao: true, atividades: { select: { codigo: true, descricao: true, origem: true, mantida: true } },
} as const;

/**
 * Versão liberada = foto da base em JSON comprimido (gzip), numa tabela à parte dentro do próprio banco: a foto fica na mesma
 * transação e no mesmo backup da base, sem depender do MinIO.
 *
 * Memória (estimativa para 30 mil itens × 9 camadas, ~270 mil células): leitura em lotes de 5 mil itens e 20 mil células com `select` só dos
 * campos usados (nada de `original` nem `lido`); itens ≈ 25 MB e células em tuplas ≈ 20 MB de objetos JS, JSON ≈ 45 MB, gzip ≈ 6 MB:
 * pico em torno de 150 a 200 MB, bem abaixo de 300 MB. A comparação carrega uma versão por vez (reduz a um mapa) e depois a outra.
 * Estimativa por contas de tamanho, NÃO medida com 30 mil itens reais.
 */
@Injectable()
export class SanVersoesService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(projetoId: string, e: { rotulo?: string }, usuario?: Usuario) {
    const rotulo = String(e.rotulo ?? '').trim().slice(0, 120);
    if (!rotulo) throw new BadRequestException('Dê um rótulo à versão (ex.: "Entrega 1").');
    if (!(await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { id: true } }))) throw new NotFoundException('Projeto de saneamento não encontrado.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const projeto = await tx.sanProjeto.findUnique({ where: { id: projetoId }, select: SEL_PROJETO });
        const itens: Json[] = [];
        let cursor: string | undefined;
        for (;;) {
          const lote = await tx.sanItem.findMany({ where: { projeto_id: projetoId }, orderBy: { id: 'asc' }, take: LOTE_ITENS, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: SEL_ITEM });
          for (const i of lote) itens.push({ ...i });
          if (lote.length < LOTE_ITENS) break;
          cursor = lote[lote.length - 1].id;
        }
        itens.sort(porCodigo);
        const celulas: Foto['celulas'] = [];
        const porSituacao: Record<string, number> = {};
        const revisarPorCamada: Record<string, number> = {};
        cursor = undefined;
        for (;;) {
          const lote: CelulaSel[] = await tx.sanCelula.findMany({ where: { projeto_id: projetoId }, orderBy: { id: 'asc' }, take: LOTE_CELULAS, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: SEL_CELULA });
          for (const c of lote) {
            celulas.push([c.item_id, c.camada, c.situacao, c.revisar ? 1 : 0, c.caso_id]);
            porSituacao[c.situacao] = (porSituacao[c.situacao] ?? 0) + 1;
            if (c.revisar) revisarPorCamada[c.camada] = (revisarPorCamada[c.camada] ?? 0) + 1;
          }
          if (lote.length < LOTE_CELULAS) break;
          cursor = lote[lote.length - 1].id;
        }
        const casos = await tx.sanCaso.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'asc' }, select: SEL_CASO });
        const porSituacaoCaso: Record<string, number> = {};
        for (const c of casos) porSituacaoCaso[c.situacao] = (porSituacaoCaso[c.situacao] ?? 0) + 1;
        const foto: Foto = {
          formato: 2, projeto: projeto as never, itens, celulas, casos: casos as never,
          decisoes: (await tx.sanDecisao.findMany({ where: { projeto_id: projetoId }, orderBy: { quando: 'asc' }, select: SEL_DECISAO })) as never,
          impactosSped: (await tx.sanImpactoSped.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'asc' } })) as never,
          vinculos: (await tx.sanVinculoCodigo.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'asc' } })) as never,
          importacoes: (await tx.sanImportacao.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'asc' }, select: SEL_IMPORTACAO })) as never,
        };
        const totalRevisar = Object.values(revisarPorCamada).reduce((s, n) => s + n, 0);
        const resumo = {
          itens: itens.length, celulasPorSituacao: porSituacao, celulasRevisar: totalRevisar, revisarPorCamada, casosPorSituacao: porSituacaoCaso,
          casosAbertos: casos.filter((c) => CASO_ABERTO.includes(c.situacao as never)).length,
        };
        const ultimo = await tx.sanVersao.findFirst({ where: { projeto_id: projetoId }, orderBy: { numero: 'desc' }, select: { numero: true } });
        const v = await tx.sanVersao.create({ data: { projeto_id: projetoId, numero: (ultimo?.numero ?? 0) + 1, rotulo, usuario: quem(usuario), resumo: resumo as never } });
        await tx.sanVersaoSnapshot.create({ data: { versao_id: v.id, dados: gzipSync(Buffer.from(JSON.stringify(foto), 'utf8')), itens: itens.length } });
        // Aviso, não bloqueio: itens com célula "revisar" não saem como aprovados na entrega liberada.
        const aviso = totalRevisar
          ? { celulasRevisar: totalRevisar, porCamada: revisarPorCamada, mensagem: `${totalRevisar} célula(s) ainda marcadas para revisão (${Object.entries(revisarPorCamada).map(([c, n]) => `${c}: ${n}`).join(', ')}). Elas saem como "Aguardando revisão" na entrega.` }
          : null;
        return { ...v, aviso };
      }, { ...TX_LONGA, isolationLevel: 'RepeatableRead' as never });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw conflito('Outra pessoa criou uma versão ao mesmo tempo. Tente de novo.');
      throw err;
    }
  }

  listar(projetoId: string) {
    return this.prisma.sanVersao.findMany({ where: { projeto_id: projetoId }, orderBy: { numero: 'desc' } });
  }

  private async foto(projetoId: string, versaoId: string): Promise<{ versao: { id: string; numero: number; rotulo: string; createdAt: Date; usuario: string }; foto: Foto }> {
    const v = await this.prisma.sanVersao.findFirst({ where: { id: versaoId, projeto_id: projetoId }, include: { snapshot: true } });
    if (!v || !v.snapshot) throw new NotFoundException('Versão não encontrada.');
    const f = JSON.parse(gunzipSync(Buffer.from(v.snapshot.dados)).toString('utf8')) as Partial<Foto>;
    const foto: Foto = {
      formato: 2, projeto: f.projeto ?? {}, itens: f.itens ?? [], celulas: f.celulas ?? [], casos: f.casos ?? [], decisoes: f.decisoes ?? [], impactosSped: f.impactosSped ?? [],
      vinculos: f.vinculos ?? [], importacoes: f.importacoes ?? [],
    };
    return { versao: { id: v.id, numero: v.numero, rotulo: v.rotulo, createdAt: v.createdAt, usuario: v.usuario }, foto };
  }

  /** Reduz uma versão ao que a comparação usa e solta o resto (uma foto por vez na memória). */
  private async reduzida(projetoId: string, versaoId: string) {
    const { versao, foto } = await this.foto(projetoId, versaoId);
    const itens = new Map<string, { codigo: string; trabalho: Json }>();
    for (const i of foto.itens) itens.set(String(i.id), { codigo: String(i.codigo), trabalho: (i.trabalho as Json) ?? {} });
    const celulas = new Map<string, string>();
    for (const [item, camada, situacao] of foto.celulas) celulas.set(`${item}|${camada}`, situacao);
    const casos = new Map<string, string>();
    for (const c of foto.casos) casos.set(String(c.id), String(c.situacao));
    return { versao, itens, celulas, casos };
  }

  /** Compara duas versões: itens acrescentados, retirados e alterados (por campo), células e casos que mudaram de situação. */
  async comparar(projetoId: string, a: string, b: string) {
    if (!a || !b || a === b) throw new BadRequestException('Escolha duas versões diferentes para comparar.');
    const A = await this.reduzida(projetoId, a);
    const B = await this.reduzida(projetoId, b);
    const acrescentados: { id: string; codigo: string }[] = [];
    const alterados: { id: string; codigo: string; campos: { campo: string; antes: unknown; depois: unknown }[] }[] = [];
    for (const [id, i] of B.itens) {
      const x = A.itens.get(id);
      if (!x) { acrescentados.push({ id, codigo: i.codigo }); continue; }
      const fa = flat(x.trabalho);
      const fb = flat(i.trabalho);
      const campos = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter((c) => !igual(fa[c], fb[c])).map((campo) => ({ campo, antes: fa[campo] ?? null, depois: fb[campo] ?? null }));
      if (campos.length) alterados.push({ id, codigo: i.codigo, campos });
    }
    const retirados = [...A.itens].filter(([id]) => !B.itens.has(id)).map(([id, i]) => ({ id, codigo: i.codigo }));
    const celulas: { item_id: string; camada: string; antes: string; depois: string }[] = [];
    for (const [k, depois] of B.celulas) {
      const antes = A.celulas.get(k);
      if (antes !== undefined && antes !== depois) { const [item_id, camada] = k.split('|'); celulas.push({ item_id, camada, antes, depois }); }
    }
    const casosMudaram = [...B.casos].filter(([id, s]) => A.casos.has(id) && A.casos.get(id) !== s).length;
    const LIM = 1000;
    return {
      de: A.versao, para: B.versao,
      totais: { acrescentados: acrescentados.length, retirados: retirados.length, alterados: alterados.length, celulasMudaram: celulas.length, casosMudaram },
      acrescentados: acrescentados.slice(0, LIM), retirados: retirados.slice(0, LIM), alterados: alterados.slice(0, LIM), celulas: celulas.slice(0, LIM),
      truncado: [acrescentados, retirados, alterados, celulas].some((l) => l.length > LIM),
    };
  }

  /** Dados da versão para o Excel e o relatório: SÓ da foto congelada (nada do estado de agora). */
  async exportar(projetoId: string, versaoId: string): Promise<DadosEntrega> {
    const { versao, foto } = await this.foto(projetoId, versaoId);
    return {
      projeto: foto.projeto, versao: { numero: versao.numero, rotulo: versao.rotulo, criadaEm: versao.createdAt.toISOString() }, liberada: true,
      itens: foto.itens, celulas: foto.celulas.map(([item_id, camada, situacao, revisar, caso_id]) => ({ item_id, camada, situacao, revisar: revisar === 1, caso_id })),
      casos: foto.casos, decisoes: foto.decisoes, impactosSped: foto.impactosSped, vinculos: foto.vinculos, importacoes: foto.importacoes,
    };
  }

  /** Exportação para REVISÃO: a base de agora (não é a entrega liberada). Só as colunas que as planilhas usam. */
  async exportarAtual(projetoId: string): Promise<DadosEntrega> {
    const projeto = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: SEL_PROJETO });
    if (!projeto) throw new NotFoundException('Projeto de saneamento não encontrado.');
    const itens: Json[] = [];
    let cursor: string | undefined;
    for (;;) {
      const lote = await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId }, orderBy: { id: 'asc' }, take: LOTE_ITENS, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: SEL_ITEM });
      for (const i of lote) itens.push({ ...i });
      if (lote.length < LOTE_ITENS) break;
      cursor = lote[lote.length - 1].id;
    }
    itens.sort(porCodigo);
    const celulas: Json[] = [];
    cursor = undefined;
    for (;;) {
      const lote: CelulaSel[] = await this.prisma.sanCelula.findMany({ where: { projeto_id: projetoId }, orderBy: { id: 'asc' }, take: LOTE_CELULAS, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: SEL_CELULA });
      for (const c of lote) celulas.push({ item_id: c.item_id, camada: c.camada, situacao: c.situacao, revisar: c.revisar, caso_id: c.caso_id });
      if (lote.length < LOTE_CELULAS) break;
      cursor = lote[lote.length - 1].id;
    }
    const [casos, decisoes, impactosSped, vinculos, importacoes] = await Promise.all([
      this.prisma.sanCaso.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'asc' }, select: SEL_CASO }),
      this.prisma.sanDecisao.findMany({ where: { projeto_id: projetoId }, orderBy: { quando: 'asc' }, select: SEL_DECISAO }),
      this.prisma.sanImpactoSped.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.sanVinculoCodigo.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.sanImportacao.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'asc' }, select: SEL_IMPORTACAO }),
    ]);
    return {
      projeto: projeto as never, versao: null, liberada: false, itens, celulas, casos: casos as never, decisoes: decisoes as never, impactosSped: impactosSped as never,
      vinculos: vinculos as never, importacoes: importacoes as never,
    };
  }
}
