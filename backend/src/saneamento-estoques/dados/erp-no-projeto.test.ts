import { describe, expect, it } from 'vitest';
import { CARGA_ERPS, idDoItemDaCarga } from '../../erps/carga';
import { SanCasosService } from './casos.service';
import { SanImpactosService } from './impactos.service';
import { SanImportacaoService } from './importacao.service';
import type { EntradaImportacao, ImportadorPort, ItemImportado } from './portas';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };
const sap = CARGA_ERPS.find((e) => e.id === 'erp-sap-b1')!;
const item = (codigo: string, linha: number): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `ITEM ${codigo}`, unidade: 'KG', ncm: '31010000', grupo: null, ativo: true, saldo: 1,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha,
});

function montar(empresa: Record<string, unknown>) {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z'), responsavel: 'Ana' }],
    empresa: [{ id: 'E1', erp_versao: '10.0', cnae_principal: '4683400', cnae_descricao: 'Comércio', dados_publicos_em: null, ...empresa }],
    erp: [{ id: sap.id, nome: sap.nome, fabricante: sap.fabricante, produto: sap.produto, versoes: sap.versoes, situacao: sap.situacao, ativo: true }],
    erpConhecimento: sap.itens.map((i, ordem) => ({ id: idDoItemDaCarga(sap.id, i.k), erp_id: sap.id, tipo: i.tipo, tipo_ajuste: i.tipo_ajuste ?? null, chave: i.chave, texto: i.texto, campo_erp: i.campo_erp ?? null, fonte_url: i.fonte_url, grau: i.grau, ordem, ativo: true })),
  });
  const recebido: EntradaImportacao[] = [];
  const importador: ImportadorPort = {
    ler: async (e) => { recebido.push(e); return { itens: [item('1', 1)], mapeamento: { codigo: 'ItemCode' }, relatorio: { aceitas: 1, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }; },
  };
  const projetos = new SanProjetoService(prisma as never);
  return { prisma, db, recebido, projetos, importacao: new SanImportacaoService(prisma as never, projetos, importador), casos: new SanCasosService(prisma as never, projetos), impactos: new SanImpactosService(prisma as never) };
}

describe('ERP do cliente no projeto de saneamento', () => {
  it('o projeto abre com o ERP do cadastro do cliente (vínculo e texto) e pode trocar para este trabalho', async () => {
    const c = montar({ erp: 'SAP Business One', erp_id: sap.id });
    const p = await c.projetos.criar('D1', USER);
    expect([p.erp, p.erp_id]).toEqual(['SAP Business One', sap.id]);
    const sem = await c.projetos.configurar(p.id, { versao: p.versao, erp_id: null });
    expect([sem.erp, sem.erp_id]).toEqual(['SAP Business One', null]); // tirar a seleção não apaga o texto
    const de_novo = await c.projetos.configurar(p.id, { versao: sem.versao, erp_id: sap.id });
    expect(de_novo.erp_id).toBe(sap.id);
    await expect(c.projetos.configurar(p.id, { versao: de_novo.versao, erp_id: 'nao-existe' })).rejects.toThrow(/selecione na lista/);
  });

  it('texto antigo sem vínculo fica no projeto como estava', async () => {
    const c = montar({ erp: 'Sankhya', erp_id: null });
    const p = await c.projetos.criar('D1', USER);
    expect([p.erp, p.erp_id]).toEqual(['Sankhya', null]);
  });

  it('importação: com o ERP selecionado, as colunas do export vão para o pré-mapeamento; sem ERP, não', async () => {
    const c = montar({ erp: 'SAP Business One', erp_id: sap.id });
    const p = await c.projetos.criar('D1', USER);
    await c.projetos.confirmarAtividades(p.id, p.versao, USER);
    await c.importacao.previa(p.id, { buffer: Buffer.from('x'), nome: 'oitm.xlsx' });
    expect(c.recebido[0].colunasDoErp?.erp).toBe('SAP Business One');
    expect(c.recebido[0].colunasDoErp?.colunas.ncm).toEqual(['NcmCode']);
    const s = montar({ erp: null, erp_id: null });
    const q = await s.projetos.criar('D1', USER);
    await s.projetos.confirmarAtividades(q.id, q.versao, USER);
    await s.importacao.previa(q.id, { buffer: Buffer.from('x'), nome: 'a.xlsx' });
    expect(s.recebido[0].colunasDoErp).toBeUndefined();
  });

  it('o caso traz os tipos de ajuste (para as restrições do ERP) e a lista de impactos também', async () => {
    const c = montar({ erp: 'SAP Business One', erp_id: sap.id });
    const p = await c.projetos.criar('D1', USER);
    c.db.sanCaso.push({ id: 'K1', projeto_id: p.id, camada: 'NOMES_UNIDADES', tipo: 'UNIDADE', itens: [], situacao: 'PROPOSTO', proposta: { unidade: 'KG' }, atual: {}, versao: 1 });
    expect((await c.casos.obter('K1')).tiposAjuste).toEqual(['MUDOU_UNIDADE']);
    const r = await c.impactos.listarImpactos(p.id, {});
    expect(r.tiposAjuste).toEqual(['MUDOU_UNIDADE']);
  });
});
