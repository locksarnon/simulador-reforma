import { describe, expect, it } from 'vitest';
import { corrigirMapeamento, sugerirMapeamento, validarMapeamento } from './mapeamento';

describe('mapeamento por nome de cabeçalho', () => {
  it('SAP B1 (OITM): reconhece e deixa o resto como campos', () => {
    const cab = ['ItemCode', 'ItemName', 'ItmsGrpCod', 'ItmsGrpNam', 'InvntryUom', 'SalUnitMsr', 'NCMCode', 'frozenFor', 'OnHand', 'LastPurDat', 'CodeBars', 'WhsCode', 'FirmName', 'SuppCatNum'];
    const s = sugerirMapeamento(cab);
    expect(s.mapeamento).toMatchObject({ codigo: 0, descricao: 1, grupo: 3, unidade: 4, ncm: 6, ativo: 7, saldo: 8, ultimaMovimentacao: 9, estabelecimento: 11, fabricante: 12, referencia: 13 });
    expect(s.semanticaAtivo).toBe('BLOQUEADO');
    expect(s.faltando).toEqual([]);
    expect(s.colunas[0].certeza).toBe('ALTA');
    expect(s.colunas[2].campo).toBeNull(); // ItmsGrpCod: o nome do grupo vence
    expect(s.colunas[10].campo).toBeNull(); // CodeBars vira campo adicional
  });
  it('Protheus e Datasul', () => {
    const p = sugerirMapeamento(['B1_COD', 'B1_DESC', 'B1_UM', 'B1_POSIPI', 'B1_GRUPO', 'B1_MSBLQL', 'B1_UCOM', 'B1_FILIAL']);
    expect(p.mapeamento).toMatchObject({ codigo: 0, descricao: 1, unidade: 2, ncm: 3, grupo: 4, ativo: 5, ultimaMovimentacao: 6, estabelecimento: 7 });
    expect(p.semanticaAtivo).toBe('BLOQUEADO');
    const d = sugerirMapeamento(['it-codigo', 'desc-item', 'un', 'class-fiscal', 'cod-estabel']);
    expect(d.mapeamento).toMatchObject({ codigo: 0, descricao: 1, unidade: 2, ncm: 3, estabelecimento: 4 });
  });
  it('português com acentos e aproximação (certeza média)', () => {
    const s = sugerirMapeamento(['Código do Produto', 'Descrição', 'Unidade de Medida', 'Dt. Última Compra', 'Finalidade do item', 'Grupo Contábil']);
    expect(s.mapeamento).toMatchObject({ codigo: 0, descricao: 1, unidade: 2, ultimaMovimentacao: 3, finalidade: 4 });
    expect(s.mapeamento.grupo).toBeUndefined(); // "Grupo Contábil" não é grupo do produto
    const m = sugerirMapeamento(['Cod', 'Descricao detalhada', 'Fabricação']);
    expect(m.colunas[1]).toMatchObject({ campo: 'descricao', certeza: 'MEDIA' });
  });
  it('não confunde "Descrição do grupo" com a descrição', () => {
    const s = sugerirMapeamento(['Codigo', 'Descricao', 'Descricao do grupo']);
    expect(s.mapeamento.descricao).toBe(1);
    expect(s.colunas[2].campo).toBeNull();
  });
  it('campo obrigatório sem coluna aparece em faltando e não valida', () => {
    const s = sugerirMapeamento(['X', 'Y']);
    expect(s.faltando).toEqual(['codigo', 'descricao']);
    expect(validarMapeamento(s.mapeamento, 2)).toHaveLength(2);
  });
  it('correção do consultor: troca a coluna e libera a anterior', () => {
    const s = sugerirMapeamento(['A', 'ItemCode', 'ItemName', 'Outro']);
    const m = corrigirMapeamento(s.mapeamento, { codigo: 0, ncm: 3, descricao: 0 });
    expect(m.codigo).toBeNull(); // a coluna 0 passou para a descrição
    expect(m.descricao).toBe(0);
    expect(m.ncm).toBe(3);
    expect(validarMapeamento({ codigo: 1, descricao: 1 }, 4).join(' ')).toMatch(/mesma coluna/);
    expect(validarMapeamento({ codigo: 1, descricao: 9 }, 4).join(' ')).toMatch(/não existe/);
  });
});
