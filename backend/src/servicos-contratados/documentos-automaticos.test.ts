import { describe, expect, it, vi } from 'vitest';
import { COBERTURA_SANEAMENTO, documentosAutomaticos } from './documentos-automaticos';
import { ConsultoriaService } from './consultoria.service';
import { PrismaService } from '../prisma/prisma.service';

const S = 'saneamento-estoques';
const PER = '2026-12-31/2026-12-31';
const imp = (arquivo: string, quando: string, mapeamento: Record<string, string>) => ({ arquivo, usuario: 'ana@fal', createdAt: new Date(quando), mapeamento });
const porItem = (lista: ReturnType<typeof documentosAutomaticos>) => Object.fromEntries(lista.map((d) => [d.item, d]));

describe('Documentos automáticos do Saneamento (cobertura pela importação)', () => {
  it('os itens da regra são exatamente documentos da lista de solicitações do saneamento', () => {
    expect(COBERTURA_SANEAMENTO.map((r) => r.item)).toEqual(['Cadastro de itens do ERP', 'Saldo de estoque na data-base', 'Movimentação dos itens', 'Tabela de equivalência de códigos']);
  });

  it('cobertura total: uma planilha com tudo mapeado cobre os quatro documentos, com arquivo, usuário e colunas', () => {
    const r = porItem(documentosAutomaticos(S, PER, [imp('cadastro.xlsx', '2026-11-20T10:00:00Z', {
      codigo: 'ItemCode', descricao: 'ItemName', unidade: 'UN', ncm: 'NCM', grupo: 'Grupo', ativo: 'frozenFor', saldo: 'OnHand',
      ultimaMovimentacao: 'UltMov', referencia: 'Ref', fabricante: 'Fab',
    })]));
    expect(Object.keys(r)).toHaveLength(4);
    for (const d of Object.values(r)) { expect(d.cobertura).toBe('TOTAL'); expect(d.situacao).toBe('RECEBIDO'); expect(d.prevalece).toBe(true); }
    expect(r['Saldo de estoque na data-base'].colunas).toEqual([{ rotulo: 'Saldo', coluna: 'OnHand', arquivo: 'cadastro.xlsx' }]);
    expect(r['Cadastro de itens do ERP'].evidencias).toEqual([{ arquivo: 'cadastro.xlsx', usuario: 'ana@fal', data: '2026-11-20T10:00:00.000Z' }]);
  });

  it('cobertura parcial diz o que falta; documento sem nenhum campo mapeado fica de fora (controle manual)', () => {
    const r = porItem(documentosAutomaticos(S, PER, [imp('itens.csv', '2026-11-20T10:00:00Z', { codigo: 'Cod', descricao: 'Desc', ncm: 'NCM', referencia: 'Ref' })]));
    expect(r['Cadastro de itens do ERP']).toMatchObject({ cobertura: 'PARCIAL', situacao: 'PENDENTE', faltam: ['Unidade', 'Grupo', 'Situação (ativo/bloqueado)'] });
    expect(r['Tabela de equivalência de códigos']).toMatchObject({ cobertura: 'PARCIAL', faltam: ['Fabricante'] });
    expect(r['Saldo de estoque na data-base']).toBeUndefined();
    expect(r['Movimentação dos itens']).toBeUndefined();
    expect(documentosAutomaticos(S, PER, [])).toEqual([]);
    expect(documentosAutomaticos('pis-cofins', PER, [imp('x.xlsx', '2026-11-20T10:00:00Z', { saldo: 'S' })])).toEqual([]);
  });

  it('nova importação completa o que faltava e atualiza a evidência (vale a mais recente de cada campo)', () => {
    const primeira = imp('itens.csv', '2026-11-20T10:00:00Z', { codigo: 'Cod', descricao: 'Desc', unidade: 'Un', ncm: 'NCM', grupo: 'Gr' });
    const segunda = imp('complemento.xlsx', '2026-11-21T09:00:00Z', { codigo: 'Codigo', descricao: 'Descricao', ativo: 'Bloqueado', saldo: 'Saldo' });
    const r = porItem(documentosAutomaticos(S, PER, [primeira, segunda]));
    expect(r['Cadastro de itens do ERP']).toMatchObject({ cobertura: 'TOTAL', situacao: 'RECEBIDO', faltam: [], atualizado_em: '2026-11-21T09:00:00.000Z' });
    expect(r['Cadastro de itens do ERP'].evidencias.map((e) => e.arquivo)).toEqual(['complemento.xlsx', 'itens.csv']);
    expect(r['Cadastro de itens do ERP'].colunas.find((c) => c.rotulo === 'Código')).toEqual({ rotulo: 'Código', coluna: 'Codigo', arquivo: 'complemento.xlsx' });
    expect(r['Saldo de estoque na data-base'].cobertura).toBe('TOTAL');
  });

  it('situação manual gravada depois da importação prevalece; reimportação posterior volta ao automático', () => {
    const importacao = imp('cadastro.xlsx', '2026-11-20T10:00:00Z', { codigo: 'C', descricao: 'D', saldo: 'S' });
    const manual = { item: 'Saldo de estoque na data-base', periodo: PER, situacao: 'DIVERGENTE', updatedAt: new Date('2026-11-20T11:00:00Z') };
    expect(porItem(documentosAutomaticos(S, PER, [importacao], [manual]))['Saldo de estoque na data-base'].prevalece).toBe(false);
    // Outro período não interfere.
    expect(porItem(documentosAutomaticos(S, PER, [importacao], [{ ...manual, periodo: '2025-12-31/2025-12-31' }]))['Saldo de estoque na data-base'].prevalece).toBe(true);
    const reimportacao = imp('cadastro-v2.xlsx', '2026-11-22T08:00:00Z', { codigo: 'C', descricao: 'D', saldo: 'Saldo atual' });
    expect(porItem(documentosAutomaticos(S, PER, [importacao, reimportacao], [manual]))['Saldo de estoque na data-base'].prevalece).toBe(true);
  });
});

describe('Serviço de documentos da consultoria com as importações do saneamento', () => {
  function ambiente() {
    const db = {
      vinculoConsultoria: { findUnique: vi.fn(async () => ({ id: 'V1' })) },
      empresa: { findFirst: vi.fn(async () => ({ id: 'PJ1' })) },
      arquivoEmpresa: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
      controleDocumentoConsultoria: {
        findMany: vi.fn(async () => [{ item: 'Saldo de estoque na data-base', periodo: '2026-12-31/2026-12-31', situacao: 'VALIDADO', arquivo_id: null, updatedAt: new Date('2026-11-25T00:00:00Z') }]),
        upsert: vi.fn(async ({ create }) => create), deleteMany: vi.fn(async () => ({ count: 1 })),
      },
      spedDownload: { findMany: vi.fn(async () => []) },
      documentoXml: { groupBy: vi.fn(async () => []) },
      sanProjeto: { findMany: vi.fn(async () => [{ id: 'SP1' }]) },
      sanImportacao: { findMany: vi.fn(async () => [imp('cadastro.xlsx', '2026-11-20T10:00:00Z', { codigo: 'C', descricao: 'D', saldo: 'S' })]) },
    };
    return { db, service: new ConsultoriaService(db as unknown as PrismaService) };
  }

  it('devolve os automáticos do período (data-base do projeto) com o controle manual mais novo prevalecendo', async () => {
    const { db, service } = ambiente();
    const r = await service.documentos(S, 'PJ1', '2026-12-31', '2026-12-31');
    expect(db.sanProjeto.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { empresa_id: 'PJ1', data_base: { gte: new Date('2026-12-31T00:00:00Z'), lt: new Date('2027-01-01T00:00:00Z') } } }));
    const porNome = porItem(r.automaticos);
    expect(porNome['Saldo de estoque na data-base']).toMatchObject({ cobertura: 'TOTAL', prevalece: false });
    expect(porNome['Cadastro de itens do ERP']).toMatchObject({ cobertura: 'PARCIAL', prevalece: true });
  });

  it('outros serviços não consultam o saneamento', async () => {
    const { db, service } = ambiente();
    const r = await service.documentos('pis-cofins', 'PJ1', '2026-01-01', '2026-12-31');
    expect(r.automaticos).toEqual([]);
    expect(db.sanProjeto.findMany).not.toHaveBeenCalled();
  });

  it('documento coberto pela importação aceita situação manual sem arquivo; sem cobertura continua exigindo; AUTOMATICO apaga o controle', async () => {
    const { db, service } = ambiente();
    await expect(service.controlarDocumento(S, 'PJ1', { item: 'Saldo de estoque na data-base', periodo: '2026-12-31/2026-12-31', situacao: 'VALIDADO' })).resolves.toMatchObject({ situacao: 'VALIDADO', arquivo_id: null });
    await expect(service.controlarDocumento(S, 'PJ1', { item: 'Movimentação dos itens', periodo: '2026-12-31/2026-12-31', situacao: 'RECEBIDO' })).rejects.toThrow('Vincule uma evidência');
    await expect(service.controlarDocumento(S, 'PJ1', { item: 'Saldo de estoque na data-base', periodo: '2026-12-31/2026-12-31', situacao: 'AUTOMATICO' })).resolves.toEqual({ removido: true });
    expect(db.controleDocumentoConsultoria.deleteMany).toHaveBeenCalledWith({ where: { publico: 'PJ', cliente_id: 'PJ1', servico: S, item: 'Saldo de estoque na data-base', periodo: '2026-12-31/2026-12-31' } });
  });
});
