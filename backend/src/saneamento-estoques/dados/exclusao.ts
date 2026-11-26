import { fatiar } from './constantes';

/** O mínimo do cliente do Prisma que a exclusão usa (serve ao PrismaService e ao cliente de transação). */
type Cliente = {
  sanProjeto: { findMany(a: unknown): Promise<{ id: string }[]>; deleteMany(a: unknown): Promise<unknown> };
  sanVersao: { findMany(a: unknown): Promise<{ id: string }[]>; deleteMany(a: unknown): Promise<unknown> };
  sanVersaoSnapshot: { deleteMany(a: unknown): Promise<unknown> };
  sanImpactoSped: { deleteMany(a: unknown): Promise<unknown> };
  sanVinculoCodigo: { deleteMany(a: unknown): Promise<unknown> };
  sanDecisao: { deleteMany(a: unknown): Promise<unknown> };
  sanCaso: { deleteMany(a: unknown): Promise<unknown> };
  sanCelula: { deleteMany(a: unknown): Promise<unknown> };
  sanItem: { deleteMany(a: unknown): Promise<unknown> };
  sanImportacao: { deleteMany(a: unknown): Promise<unknown> };
  sanAtividade: { deleteMany(a: unknown): Promise<unknown> };
  // Diretrizes (opcionais no tipo: clientes antigos dos testes não as têm).
  sanDiretrizHistorico?: { deleteMany(a: unknown): Promise<unknown> };
  sanDiretrizRegra?: { deleteMany(a: unknown): Promise<unknown> };
  sanDiretrizes?: { deleteMany(a: unknown): Promise<unknown> };
};

/**
 * Apaga o(s) projeto(s) de saneamento e TODOS os filhos, na ordem certa (do que depende para o que é dependido). Chamar dentro da
 * transação de quem exclui (projeto de consultoria ou empresa), para nunca sobrar órfão.
 */
export async function apagarSaneamento(tx: Cliente, where: { diagnostico_id?: string | { in: string[] }; empresa_id?: string | { in: string[] } }): Promise<number> {
  const projetos = (await tx.sanProjeto.findMany({ where, select: { id: true } })).map((p) => p.id);
  if (!projetos.length) return 0;
  for (const lote of fatiar(projetos, 100)) {
    const doProjeto = { projeto_id: { in: lote } };
    const versoes = (await tx.sanVersao.findMany({ where: doProjeto, select: { id: true } })).map((v) => v.id);
    for (const v of fatiar(versoes, 500)) await tx.sanVersaoSnapshot.deleteMany({ where: { versao_id: { in: v } } });
    await tx.sanVersao.deleteMany({ where: doProjeto });
    await tx.sanImpactoSped.deleteMany({ where: doProjeto });
    await tx.sanVinculoCodigo.deleteMany({ where: doProjeto });
    await tx.sanDecisao.deleteMany({ where: doProjeto });
    await tx.sanCaso.deleteMany({ where: doProjeto });
    await tx.sanCelula.deleteMany({ where: doProjeto });
    await tx.sanItem.deleteMany({ where: doProjeto });
    await tx.sanImportacao.deleteMany({ where: doProjeto });
    await tx.sanAtividade.deleteMany({ where: doProjeto });
    await tx.sanDiretrizHistorico?.deleteMany({ where: doProjeto });
    await tx.sanDiretrizRegra?.deleteMany({ where: doProjeto });
    await tx.sanDiretrizes?.deleteMany({ where: doProjeto });
    await tx.sanProjeto.deleteMany({ where: { id: { in: lote } } });
  }
  return projetos.length;
}
