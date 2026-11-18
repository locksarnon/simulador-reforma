import { describe, expect, it } from 'vitest';
import { montarLaudo } from './laudo';

const it_ = (numero: number, cst: string | null, ct: string | null, cfop: string, situacao: string, extra: Record<string, unknown> = {}) =>
  ({ numero, ncm: '84714900', cfop, descricao: 'P', cst, cClassTrib: ct, situacao, campos: [], erros: [], aviso: null, nota: { vBC: 1, vIBS: 1, vCBS: 1 }, oficial: null, ...extra });
const nota = (chave: string, itens: unknown[], extra: Record<string, unknown> = {}) => ({ empresa_id: 'E1', chave, papel: 'EMITIDA', situacao: 'CONFERE', data_emissao: new Date('2026-10-10'), detalhes: itens, ...extra });

describe('laudo de homologação do ERP', () => {
  const laudo = montarLaudo([
    nota('N1', [it_(1, '000', '000001', '5102', 'CONFERE'), it_(2, '000', '000001', '5102', 'CONFERE')]),
    nota('N2', [it_(1, '000', '000001', '5102', 'DIVERGENTE', { campos: [{ campo: 'Base de cálculo', nota: 3.19, oficial: 2.9 }] })]),
    nota('N3', [it_(1, '200', '200003', '5101', 'ENQUADRAMENTO', { erros: [{ codigo: 'REG-011', mensagem: 'NCM de código 02074300 não vinculada…' }] })]),
    nota('N4', [it_(1, null, null, '5102', 'SEM_GRUPO')]),
    nota('N5', [it_(1, '620', '620006', '5656', 'NAO_COBERTO')]),
    nota('N6', [it_(1, '000', '000001', '5102', 'CONFERE')], { papel: 'RECEBIDA' }),
    nota('N7', [it_(1, '000', '000001', '5102', 'CONFERE')], { ambiente: 'HOMOLOGACAO' }),
  ]);
  const por = (ct: string) => laudo.cenarios.find((c) => c.cClassTrib === ct)!;

  it('só entram as notas que o ERP emitiu (as recebidas ficam de fora); as de ambiente de homologação ENTRAM e são contadas', () => {
    expect(laudo.resumo).toMatchObject({ notas: 6, itens: 7, notas_homologacao: 1 });
  });
  it('um cenário com item divergente é reprovado, mesmo com itens que conferem', () => {
    expect(por('000001')).toMatchObject({ situacao: 'REPROVADO', aprovados: 3, reprovados: 1, notas: 3 });
    expect(por('000001').achados[0]).toMatchObject({ tipo: 'DIVERGENTE', regra: 'Base de cálculo', texto: 'Base de cálculo: nota 3.19 × oficial 2.9', ocorrencias: 1, exemplo: { chave: 'N2', item: 1 } });
  });
  it('enquadramento reprovado traz o código e a mensagem oficiais', () => {
    expect(por('200003')).toMatchObject({ situacao: 'REPROVADO' });
    expect(por('200003').achados[0]).toMatchObject({ tipo: 'ENQUADRAMENTO', regra: 'REG-011' });
  });
  it('sem grupo = sem destaque; não coberto fica à parte; reprovados vêm primeiro', () => {
    expect(por('sem grupo').situacao).toBe('SEM_DESTAQUE');
    expect(por('620006').situacao).toBe('NAO_COBERTO');
    expect(laudo.cenarios[0].situacao).toBe('REPROVADO');
    expect(laudo.resumo).toMatchObject({ reprovados: 2, sem_destaque: 1, nao_cobertos: 1, aprovados: 0 });
  });
  it('cenário todo conferido é aprovado', () => {
    const l = montarLaudo([nota('X', [it_(1, '000', '000001', '5102', 'CONFERE')])]);
    expect(l.cenarios[0].situacao).toBe('APROVADO');
  });
});
