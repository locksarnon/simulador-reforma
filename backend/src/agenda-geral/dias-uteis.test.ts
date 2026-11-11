import { describe, expect, it } from 'vitest';
import { data, diasSemExpedienteBancario, diaUtilAnterior, ehDiaUtil, enesimoDiaUtil, iso, pascoa, proximoDiaUtil, somarMeses, ultimoDiaUtilAte, ultimoDiaUtilDoMes } from './dias-uteis';
import { OBRIGACOES_FEDERAIS } from './obrigacoes.tabela';
import { calcularData, competenciaQueVence, seAplica, vencimentosDoMes, vencimentosNoPeriodo, type Obrigacao } from './obrigacoes';

describe('dias úteis', () => {
  it('fim de semana e feriado nacional fixo não são dias úteis', () => {
    expect(ehDiaUtil(data(2026, 11, 13))).toBe(true); // sexta
    expect(ehDiaUtil(data(2026, 11, 14))).toBe(false); // sábado
    expect(ehDiaUtil(data(2026, 11, 20))).toBe(false); // Consciência Negra (sexta)
    expect(ehDiaUtil(data(2026, 11, 2))).toBe(false); // Finados
    expect(ehDiaUtil(data(2026, 12, 25))).toBe(false);
    expect(ehDiaUtil(data(2026, 10, 12))).toBe(false); // Nossa Senhora Aparecida
  });

  it('carnaval (segunda e terça) e Corpus Christi não têm expediente bancário (Res. CMN 4.880/2020)', () => {
    expect(iso(pascoa(2026))).toBe('2026-04-05');
    expect(iso(pascoa(2027))).toBe('2027-03-28');
    expect(diasSemExpedienteBancario(2026)).toEqual(['2026-02-16', '2026-02-17', '2026-06-04']);
    expect(ehDiaUtil(data(2026, 2, 16))).toBe(false);
    expect(ehDiaUtil(data(2026, 2, 18))).toBe(true); // quarta de cinzas
    expect(ehDiaUtil(data(2026, 4, 3))).toBe(true); // Sexta da Paixão é municipal: não entra
  });

  it('anda para frente e para trás até o dia útil', () => {
    expect(iso(proximoDiaUtil(data(2026, 11, 20)))).toBe('2026-11-23'); // sexta feriado → segunda
    expect(iso(diaUtilAnterior(data(2026, 11, 20)))).toBe('2026-11-19'); // → quinta
    expect(iso(proximoDiaUtil(data(2026, 11, 18)))).toBe('2026-11-18'); // já é útil
  });

  it('último dia útil, n-ésimo dia útil e último dia útil até um dia', () => {
    expect(iso(ultimoDiaUtilDoMes(2026, 1))).toBe('2026-01-30'); // 31/01/2026 é sábado
    expect(iso(enesimoDiaUtil(2026, 1, 1))).toBe('2026-01-02'); // 1º de janeiro é feriado
    expect(iso(enesimoDiaUtil(2026, 11, 10))).toBe('2026-11-16'); // 2/11 feriado
    expect(iso(ultimoDiaUtilAte(2026, 12, 20))).toBe('2026-12-18'); // 20/12/2026 é domingo
    expect(somarMeses(2026, 12, 1)).toEqual({ ano: 2027, mes: 1 });
    expect(somarMeses(2026, 1, -1)).toEqual({ ano: 2025, mes: 12 });
  });
});

const T: Obrigacao[] = [
  { id: 'a', nome: 'Paga dia 20 (prorroga)', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1, regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'PRORROGA' }, regimes: ['Simples Nacional'], fonte: null, confirmado: false },
  { id: 'b', nome: 'Paga dia 20 (antecipa)', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1, regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'ANTECIPA' }, regimes: 'TODOS', fonte: null, confirmado: false },
  { id: 'c', nome: 'Trimestral', tipo: 'PAGAMENTO', periodicidade: 'TRIMESTRAL', mesesDepois: 1, regra: { tipo: 'ULTIMO_DIA_UTIL' }, regimes: ['Lucro Presumido', 'Lucro Real'], fonte: null, confirmado: false },
  { id: 'd', nome: 'Anual em março', tipo: 'DECLARACAO', periodicidade: 'ANUAL', mesesDepois: 0, mesAnual: 3, regra: { tipo: 'DIA_FIXO', dia: 31, ajuste: 'NENHUM' }, regimes: ['Simples Nacional'], fonte: null, confirmado: false },
  { id: 'e', nome: '10º dia útil do 2º mês', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 2, regra: { tipo: 'ENESIMO_DIA_UTIL', n: 10 }, regimes: ['Lucro Presumido', 'Lucro Real'], fonte: null, confirmado: false },
];

describe('motor de vencimentos', () => {
  it('ajusta para frente ou para trás conforme a regra', () => {
    expect(calcularData({ tipo: 'DIA_FIXO', dia: 20, ajuste: 'PRORROGA' }, 2026, 11)).toEqual({ legal: data(2026, 11, 20), efetiva: data(2026, 11, 23) });
    expect(calcularData({ tipo: 'DIA_FIXO', dia: 20, ajuste: 'ANTECIPA' }, 2026, 11).efetiva).toEqual(data(2026, 11, 19));
    expect(calcularData({ tipo: 'DIA_FIXO', dia: 20, ajuste: 'NENHUM' }, 2026, 11).efetiva).toEqual(data(2026, 11, 20));
    expect(calcularData({ tipo: 'DIA_FIXO', dia: 31, ajuste: 'NENHUM' }, 2027, 2).legal).toEqual(data(2027, 2, 28)); // mês curto
  });

  it('competência: mensal (mês anterior), trimestral (só depois do fim do trimestre) e anual (ano anterior)', () => {
    expect(competenciaQueVence(T[0], 2026, 1)).toBe('2025-12');
    expect(competenciaQueVence(T[2], 2026, 4)).toBe('2026-T1');
    expect(competenciaQueVence(T[2], 2026, 5)).toBeNull();
    expect(competenciaQueVence(T[3], 2027, 3)).toBe('2026');
    expect(competenciaQueVence(T[3], 2027, 4)).toBeNull();
    expect(competenciaQueVence(T[4], 2026, 11)).toBe('2026-09');
  });

  it('filtra pelo regime; sem regime no cadastro, mostra tudo', () => {
    expect(seAplica(T[0], 'Lucro Real')).toBe(false);
    expect(seAplica(T[1], 'Lucro Real')).toBe(true);
    expect(seAplica(T[0], null)).toBe(true);
    const nov = vencimentosDoMes(2026, 11, 'Lucro Presumido', T).map((v) => v.obrigacao);
    expect(nov).toEqual(['e', 'b']); // 16/11 (10º dia útil) e 19/11 (antecipado)
  });

  it('os vencimentos do mês vêm em ordem de data, com a data legal e a movida', () => {
    const v = vencimentosDoMes(2026, 11, null, T);
    expect(v.map((x) => [x.obrigacao, x.data, x.movida])).toEqual([['e', '2026-11-16', false], ['b', '2026-11-19', true], ['a', '2026-11-23', true]]);
    expect(v[2]).toMatchObject({ data_legal: '2026-11-20', competencia: '2026-10' });
  });

  it('tabela oficial: toda obrigação tem fonte com norma, dispositivo, URL oficial e trecho; não confirmada explica por quê', () => {
    for (const o of OBRIGACOES_FEDERAIS) {
      expect(o.fonte, o.id).toBeTruthy();
      expect(o.fonte!.url, o.id).toMatch(/^https:\/\/(www\.planalto\.gov\.br|normas\.receita\.fazenda\.gov\.br)\//);
      expect(o.fonte!.trecho.length, o.id).toBeGreaterThan(10);
      if (!o.confirmado) expect(o.observacao, o.id).toBeTruthy();
    }
  });

  it('tabela oficial: datas de novembro de 2026 (Lucro Presumido) e a troca da DEFIS em 2027', () => {
    const nov = vencimentosDoMes(2026, 11, 'Lucro Presumido');
    const d = Object.fromEntries(nov.map((v) => [v.obrigacao, v.data]));
    expect(d['efd-reinf']).toBe('2026-11-16'); // 15 é domingo: prorroga
    expect(d['efd-contribuicoes']).toBe('2026-11-16'); // 10º dia útil (2/11 feriado)
    expect(d['previdencia']).toBe('2026-11-19'); // 20 é feriado: antecipa
    expect(d['irrf-trabalho']).toBe('2026-11-19');
    expect(d['pis-cofins']).toBe('2026-11-25');
    expect(d['dctfweb']).toBe('2026-11-30');
    expect(d['das-simples']).toBeUndefined(); // não é do regime
    const mar26 = vencimentosDoMes(2026, 3, 'Simples Nacional').map((v) => v.obrigacao);
    const mar27 = vencimentosDoMes(2027, 3, 'Simples Nacional').map((v) => v.obrigacao);
    expect(mar26).toContain('defis');
    expect(mar27).not.toContain('defis');
    expect(mar27).toContain('socioeconomicas-pgdas');
  });

  it('o período pega a virada de mês', () => {
    const v = vencimentosNoPeriodo('2026-03-25', '2026-04-05', null, T);
    expect(v.map((x) => x.obrigacao)).toEqual(['d']); // DEFIS 31/03
    expect(vencimentosNoPeriodo('2026-04-01', '2026-04-30', 'Lucro Real', T).map((x) => x.obrigacao)).toContain('c');
  });
});
