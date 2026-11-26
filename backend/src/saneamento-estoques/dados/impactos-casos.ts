import type { PrismaService } from '../../prisma/prisma.service';
import { linhasDeImpactoDoCaso } from './ajustes';
import { EXCECAO_VIVA, TIPOS_EXCECAO, ehExcecao, fatiar, propostaAplicavel, type Json } from './constantes';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
type CasoComItens = { id: string; projeto_id: string; camada: string; tipo: string; itens: string[] };

/**
 * Itens com exceção própria viva (aberta, aguardando ou aprovada) na camada: item → id da exceção. Com `campos` (aprovação), entram
 * também os itens com caso individual em edição (rascunho) da mesma camada que mexe em algum desses campos: o caso de regra não passa
 * por cima do que o consultor está editando. A exceção prevalece sobre o rascunho.
 */
export async function mapaExcecoes(db: Pick<Tx, 'sanCaso'>, projetoId: string, camada: string, campos?: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const lista = await db.sanCaso.findMany({ where: { projeto_id: projetoId, camada, tipo: { in: TIPOS_EXCECAO }, situacao: { in: EXCECAO_VIVA } }, select: { id: true, itens: true } });
  if (campos?.length) {
    const rascunhos = await db.sanCaso.findMany({ where: { projeto_id: projetoId, camada, situacao: 'RASCUNHO' }, select: { id: true, itens: true, tipo: true, proposta: true } });
    for (const r of rascunhos) {
      if (ehExcecao(r.tipo) || r.itens.length !== 1) continue;
      if (Object.keys(propostaAplicavel(camada, (r.proposta as Json) ?? {})).some((k) => campos.includes(k))) m.set(r.itens[0], r.id);
    }
  }
  for (const e of lista) for (const i of e.itens) m.set(i, e.id);
  return m;
}

/** O caso de regra (de conjunto ou de um item) sem os itens que têm exceção própria; a exceção fica como está. */
export async function semExcecoes<T extends CasoComItens>(db: Pick<Tx, 'sanCaso'>, c: T, mapa?: Map<string, string>): Promise<T> {
  if (ehExcecao(c.tipo)) return c;
  const m = mapa ?? (await mapaExcecoes(db, c.projeto_id, c.camada));
  if (!m.size) return c;
  const itens = c.itens.filter((i) => { const dono = m.get(i); return !dono || dono === c.id; });
  return itens.length === c.itens.length ? c : { ...c, itens };
}

/**
 * Regrava as linhas de impacto no SPED dos casos (apaga e recria as ligadas ao caso; caso que não gera ajuste fica sem linhas). Idempotente.
 * O caso de regra conta só os itens a que ele de fato se aplica (o item com exceção viva fica fora). A última competência de escrituração
 * já entregue (parâmetro do projeto) classifica a linha como "impacto em escrituração já entregue". ÚNICA fonte para decisão de caso,
 * reexecução de obrigações, restauração de versão e o desfazer dela.
 */
export async function regravarImpactosDosCasos(tx: Tx, projetoId: string, casoIds: string[], dataBase: string) {
  if (!casoIds.length) return;
  const parametros = (await tx.sanProjeto.findUnique({ where: { id: projetoId }, select: { parametros: true } }))?.parametros as Json | undefined;
  const competenciaEntregue = typeof parametros?.competenciaEntregue === 'string' ? parametros.competenciaEntregue : null;
  const mapas = new Map<string, Map<string, string>>();
  for (const lote of fatiar(casoIds, 500)) {
    const casos = await tx.sanCaso.findMany({ where: { projeto_id: projetoId, id: { in: lote } }, select: { id: true, projeto_id: true, camada: true, tipo: true, itens: true, justificativa: true, situacao: true, atual: true, proposta: true } });
    await tx.sanImpactoSped.deleteMany({ where: { projeto_id: projetoId, caso_id: { in: lote } } });
    const efetivos = [];
    for (const c of casos) {
      if (!mapas.has(c.camada)) mapas.set(c.camada, await mapaExcecoes(tx, projetoId, c.camada));
      const e = await semExcecoes(tx, c, mapas.get(c.camada));
      if (e.itens.length) efetivos.push(e);
    }
    const linhas = efetivos.flatMap((c) => linhasDeImpactoDoCaso(c, dataBase, competenciaEntregue));
    for (const l of fatiar(linhas, 1000)) await tx.sanImpactoSped.createMany({ data: l as never });
  }
}
