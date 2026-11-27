import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { excelDaConsulta, type ConsultaParaRelatorio } from './relatorio-consulta';

const consulta: ConsultaParaRelatorio = {
  id: 'c1', chave: 'k', sistema: 'SITFIS', servico: 'RELATORIO', createdAt: new Date('2026-11-10T12:00:00Z'), solicitado_por: 'ana@fal.test', simulado: false,
  sucesso: true, nivel: 'OK', dados: null, mensagens: null, arquivos: null, parametros: null,
  resumo: {
    titulo: 'Sem pendências', destaques: [],
    tabela: { colunas: [{ chave: 'tributo', rotulo: 'Tributo' }, { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' }], linhas: [{ tributo: 'IRPJ', valor: 10.5 }] },
  },
};

describe('Excel da consulta do monitoramento', () => {
  it('logo da FAL na linha 1 das duas abas; títulos, filtro e congelamento logo abaixo', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await excelDaConsulta(consulta, 'Situação fiscal', { nome: 'Cliente', documento: '12345678000195' })) as never);
    for (const ws of wb.worksheets) {
      expect(ws.getImages().length, ws.name).toBeGreaterThanOrEqual(1);
      expect(ws.getImages()[0].range.tl.nativeRow, ws.name).toBe(0);
      expect(ws.getRow(1).cellCount, ws.name).toBe(0);
    }
    expect(wb.getWorksheet('Resumo')!.getCell('A2').value).toBe('Consulta');
    const d = wb.getWorksheet('Detalhe')!;
    expect(d.getRow(2).values).toEqual([undefined, 'Tributo', 'Valor']);
    expect(d.getCell('A3').value).toBe('IRPJ');
    expect(d.getCell('B3').value).toBe(10.5);
    expect(d.views[0]).toMatchObject({ state: 'frozen', ySplit: 2 });
    expect(String(d.autoFilter)).toMatch(/^A2:/);
  });
});
