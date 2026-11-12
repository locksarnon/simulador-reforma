import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { textoDoPdf } from '../pre-analise/leitor-certidoes';
import { analiseSimples, lerDeclaracaoPgdasd } from './pgdasd-leitura';

// Declaração oficial de exemplo do Serpro (CONSDECREC15 no ambiente de demonstração; dados fictícios).
const FIX = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'demonstracao.json'), 'utf8'));
const PDF = Buffer.from(JSON.parse(FIX.CONSDECREC15.dados).declaracao.pdf, 'base64');

describe('leitura da declaração do PGDAS-D', () => {
  it('lê período, receitas do PA, RBT12, RBA, RBAA, limite, sublimite e as receitas dos meses anteriores', async () => {
    const l = lerDeclaracaoPgdasd(await textoDoPdf(PDF));
    expect(l).toMatchObject({ periodo: '2018-01', numero: '00000000201801001', regime: 'Competência', rpa: 20000, rbt12: 12000, rba: 20000, rbaa: 12000, limite: 4800000, sublimite: 3600000, debitoTotal: 800 });
    expect(l.receitas).toHaveLength(12);
    expect(l.receitas[0]).toEqual({ competencia: '2017-01', interno: 10000, externo: 0 });
    expect(l.folha).toEqual([]);
    expect(l.fatorRTexto).toMatch(/Não se aplica/);
  });

  it('análise: sublimite e limite, faturamento de 13 meses e Fator R pela folha', () => {
    const base = { periodo: '2026-10', numero: '1', regime: 'Competência', rpa: 100000, rbt12: 1000000, rba: 3000000, rbaa: null, limite: 4800000, sublimite: 3600000, debitoTotal: 0, receitas: [{ competencia: '2026-09', interno: 90000, externo: 10000 }], folha: [{ competencia: '2026-09', valor: 300000 }], fatorR: null, fatorRTexto: null };
    const a = analiseSimples(base);
    expect(a.sublimite).toMatchObject({ percentual_sublimite: 83.3, situacao: 'ATENCAO' });
    expect(a.faturamento.map((f) => f.competencia)).toEqual(['2026-09', '2026-10']);
    expect(a.fator_r).toMatchObject({ percentual: 30, anexo: 'III' });
    expect(analiseSimples({ ...base, rba: 3700000 }).sublimite.situacao).toBe('EXCEDEU');
  });
});
