import { describe, expect, it } from 'vitest';
import {
  competenciaDe, competenciasDaRodada, estaAtrasada, geraNaCompetencia, hojeEmBrasilia, lerCompetencia, lerData, naJanelaDeGeracao,
  prazoDaCompetencia, tituloGerado, utcDe,
} from './tarefas.regras';

describe('datas em Brasília', () => {
  it('à noite em UTC ainda é o dia anterior em Brasília', () => {
    expect(hojeEmBrasilia(new Date('2026-11-12T01:30:00Z'))).toEqual({ ano: 2026, mes: 11, dia: 11 });
    expect(hojeEmBrasilia(new Date('2026-11-12T03:00:00Z'))).toEqual({ ano: 2026, mes: 11, dia: 12 });
    expect(hojeEmBrasilia(new Date('2027-01-01T02:59:00Z'))).toEqual({ ano: 2026, mes: 12, dia: 31 });
  });
  it('lê datas AAAA-MM-DD válidas e rejeita as impossíveis', () => {
    expect(lerData('2026-11-30')?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
    expect(lerData('2026-02-30')).toBeUndefined();
    expect(lerData('30/11/2026')).toBeUndefined();
    expect(lerData('')).toBeNull();
    expect(lerData(null)).toBeNull();
    expect(lerData(undefined)).toBeUndefined();
  });
  it('lê a competência AAAA-MM', () => {
    expect(lerCompetencia('2026-11')).toEqual({ ano: 2026, mes: 11 });
    expect(lerCompetencia('2026-13')).toBeNull();
    expect(lerCompetencia('11/2026')).toBeNull();
    expect(competenciaDe(2026, 3)).toBe('2026-03');
  });
});

describe('prazo e recorrência', () => {
  it('o dia 31 num mês curto cai no último dia do mês', () => {
    expect(prazoDaCompetencia('2026-11', 20).toISOString().slice(0, 10)).toBe('2026-11-20');
    expect(prazoDaCompetencia('2026-11', 31).toISOString().slice(0, 10)).toBe('2026-11-30');
    expect(prazoDaCompetencia('2027-02', 31).toISOString().slice(0, 10)).toBe('2027-02-28');
    expect(prazoDaCompetencia('2028-02', 30).toISOString().slice(0, 10)).toBe('2028-02-29'); // ano bissexto
  });
  it('mensal gera todo mês; trimestral em jan, abr, jul e out; anual só no mês dele', () => {
    expect(geraNaCompetencia({ recorrencia: 'MENSAL', mes: null }, '2026-05')).toBe(true);
    expect(['2026-01', '2026-04', '2026-07', '2026-10'].every((c) => geraNaCompetencia({ recorrencia: 'TRIMESTRAL', mes: null }, c))).toBe(true);
    expect(['2026-02', '2026-03', '2026-05', '2026-12'].some((c) => geraNaCompetencia({ recorrencia: 'TRIMESTRAL', mes: null }, c))).toBe(false);
    expect(geraNaCompetencia({ recorrencia: 'ANUAL', mes: 3 }, '2026-03')).toBe(true);
    expect(geraNaCompetencia({ recorrencia: 'ANUAL', mes: 3 }, '2026-04')).toBe(false);
    expect(geraNaCompetencia({ recorrencia: 'ANUAL', mes: null }, '2026-04')).toBe(false);
    expect(geraNaCompetencia({ recorrencia: 'SEMANAL', mes: null }, '2026-04')).toBe(false);
    expect(geraNaCompetencia({ recorrencia: 'MENSAL', mes: null }, 'lixo')).toBe(false);
  });
  it('a rodada avalia o mês de hoje e o seguinte, inclusive na virada do ano', () => {
    expect(competenciasDaRodada({ ano: 2026, mes: 11, dia: 11 })).toEqual(['2026-11', '2026-12']);
    expect(competenciasDaRodada({ ano: 2026, mes: 12, dia: 28 })).toEqual(['2026-12', '2027-01']);
  });
  it('a tarefa nasce 10 dias antes do prazo e até o prazo; antes e depois não', () => {
    const prazo = prazoDaCompetencia('2026-11', 20);
    expect(naJanelaDeGeracao(prazo, { ano: 2026, mes: 11, dia: 9 })).toBe(false); // 11 dias antes
    expect(naJanelaDeGeracao(prazo, { ano: 2026, mes: 11, dia: 10 })).toBe(true); // exatamente 10 dias antes
    expect(naJanelaDeGeracao(prazo, { ano: 2026, mes: 11, dia: 20 })).toBe(true); // no próprio dia
    expect(naJanelaDeGeracao(prazo, { ano: 2026, mes: 11, dia: 21 })).toBe(false); // passou: não cria atrasada
    const dia5 = prazoDaCompetencia('2026-12', 5); // a janela atravessa a virada do mês
    expect(naJanelaDeGeracao(dia5, { ano: 2026, mes: 11, dia: 25 })).toBe(true);
    expect(naJanelaDeGeracao(dia5, { ano: 2026, mes: 11, dia: 24 })).toBe(false);
  });
  it('título gerado leva o mês e o ano', () => {
    expect(tituloGerado('Conferir apuração', '2026-03')).toBe('Conferir apuração — 03/2026');
  });
});

describe('atraso', () => {
  const hoje = { ano: 2026, mes: 11, dia: 11 };
  it('só tarefa em aberto com prazo antes de hoje está atrasada', () => {
    expect(estaAtrasada({ status: 'ABERTA', prazo: utcDe({ ano: 2026, mes: 11, dia: 10 }) }, hoje)).toBe(true);
    expect(estaAtrasada({ status: 'ABERTA', prazo: utcDe(hoje) }, hoje)).toBe(false); // vence hoje: ainda no prazo
    expect(estaAtrasada({ status: 'CONCLUIDA', prazo: utcDe({ ano: 2026, mes: 1, dia: 1 }) }, hoje)).toBe(false);
    expect(estaAtrasada({ status: 'EM_ANDAMENTO', prazo: null }, hoje)).toBe(false);
  });
});
