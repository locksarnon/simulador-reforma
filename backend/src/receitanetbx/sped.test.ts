import { describe, expect, it } from 'vitest';
import { ESCRITURACOES, entradaPesquisa, lerArquivo, porMes } from './sped';

describe('SPED transmitido (ReceitanetBX)', () => {
  it('monta a pesquisa como procurador do cliente ou como o próprio contribuinte', () => {
    const icms = entradaPesquisa(ESCRITURACOES[0], '11222333000181', 2025, false);
    expect(icms).toContain('<identificacao perfil="proc" sistema="2" tipoarquivo="1602" tipopesquisa="porCNPJIEPeriodoContribuinte" nirepresentado="11222333000181" tiponirepresentado="cnpj"/>');
    expect(icms).toContain('<campo nome="dataInicio" valor="01/01/2025"/><campo nome="dataFim" valor="31/12/2025"/><campo nome="opcaoTodosEstabelecimentos" valor="V"/>');
    expect(entradaPesquisa(ESCRITURACOES[1], '11222333000181', 2025, true)).toContain('<identificacao perfil="contr" sistema="7" tipoarquivo="EFD" tipopesquisa="exercicio"/>');
  });

  it('lê período, transmissão, recibo e retificadora pelos nomes dos atributos e monta o mês a mês', () => {
    const a = lerArquivo({ id: 'A1', atributos: { dataInicio: '01/03/2026', dataFim: '31/03/2026', dataTransmissao: '15/04/2026 10:00', recibo: 'AB.CD', finalidade: 'Retificadora' } });
    const b = lerArquivo({ id: 'A2', atributos: { dataInicio: '01/03/2026', dataFim: '31/03/2026', dataTransmissao: '10/04/2026 09:00', recibo: 'XY', finalidade: 'Original' } });
    expect(a).toMatchObject({ retificadora: true, recibo: 'AB.CD' });
    const meses = porMes(2026, [b, a], new Date('2026-05-10T12:00:00Z'));
    expect(meses[2]).toMatchObject({ competencia: '2026-03', situacao: 'TRANSMITIDA', transmissoes: 2 });
    expect(meses[2].ultima!.recibo).toBe('AB.CD');
    expect(meses[1].situacao).toBe('NAO_ENCONTRADA');
    expect(meses[6].situacao).toBe('FUTURA');
  });
});

describe('leitura da resposta da pesquisa', () => {
  it('aceita arquivo com os dados nos próprios atributos e limita a data final a hoje no ano corrente', async () => {
    const { lerPesquisa } = await import('./receitanetbx.cliente');
    expect(lerPesquisa('<retornopesquisa><arquivos><arquivo id="9" periodo="01/03/2026 a 31/03/2026" recibo="R1"/></arquivos></retornopesquisa>').arquivos).toEqual([{ id: '9', atributos: { periodo: '01/03/2026 a 31/03/2026', recibo: 'R1' } }]);
    expect(entradaPesquisa(ESCRITURACOES[1], '11222333000181', 2026, false, new Date(2026, 10, 12))).toContain('<campo nome="dataFim" valor="12/11/2026"/>');
    expect(entradaPesquisa(ESCRITURACOES[1], '11222333000181', 2025, false, new Date(2026, 10, 12))).toContain('<campo nome="dataFim" valor="31/12/2025"/>');
  });
});
