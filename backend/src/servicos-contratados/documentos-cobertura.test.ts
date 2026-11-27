/** Controle de documentos da consultoria: só a cobertura TOTAL pela importação dispensa o arquivo de evidência. */
import { describe, expect, it, vi } from 'vitest';
import { ConsultoriaService } from './consultoria.service';

const PERIODO = '2026-01-01/2026-12-31';
function servico(mapeamento: Record<string, string>) {
  const upsert = vi.fn(async ({ create }) => create);
  const prisma = {
    vinculoConsultoria: { findUnique: vi.fn(async () => ({ id: 'v1' })) },
    empresa: { findFirst: vi.fn(async () => ({ id: 'PJ1' })) },
    arquivoEmpresa: { findFirst: vi.fn(async ({ where }) => (where.id === 'arq1' ? { id: 'arq1' } : null)) },
    sanProjeto: { findMany: vi.fn(async () => [{ id: 'P1' }]) },
    sanImportacao: { findMany: vi.fn(async () => [{ arquivo: 'cadastro.xlsx', usuario: 'ana', createdAt: new Date('2026-11-01T00:00:00Z'), mapeamento }]) },
    controleDocumentoConsultoria: { upsert, deleteMany: vi.fn() },
  };
  return { s: new ConsultoriaService(prisma as never), upsert };
}
const marcar = (s: ConsultoriaService, situacao: string, arquivo_id?: string) =>
  s.controlarDocumento('saneamento-estoques', 'PJ1', { item: 'Cadastro de itens do ERP', periodo: PERIODO, situacao, ...(arquivo_id ? { arquivo_id } : {}) }, 'ana@fal.test');

describe('documentos: cobertura pela importação e evidência', () => {
  it('cobertura parcial não dispensa o arquivo para Recebido, Validado ou Divergente; com o arquivo, grava', async () => {
    const { s, upsert } = servico({ codigo: 'Código', descricao: 'Descrição' }); // faltam unidade, NCM, grupo e situação
    for (const sit of ['RECEBIDO', 'VALIDADO', 'DIVERGENTE']) await expect(marcar(s, sit), sit).rejects.toThrow('Vincule uma evidência do repositório.');
    expect(upsert).not.toHaveBeenCalled();
    await expect(marcar(s, 'VALIDADO', 'arq1')).resolves.toMatchObject({ situacao: 'VALIDADO', arquivo_id: 'arq1' });
    await expect(marcar(s, 'PENDENTE')).resolves.toMatchObject({ situacao: 'PENDENTE' });
  });

  it('cobertura total pela importação dispensa o arquivo', async () => {
    const { s } = servico({ codigo: 'Código', descricao: 'Descrição', unidade: 'UN', ncm: 'NCM', grupo: 'Grupo', ativo: 'Ativo' });
    await expect(marcar(s, 'VALIDADO')).resolves.toMatchObject({ situacao: 'VALIDADO', arquivo_id: null });
  });
});
