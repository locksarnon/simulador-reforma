import { describe, expect, it } from 'vitest';
import {
  descreverJanela, descreverPeriodo, dentroDaJanela, janelaDoPeriodo, minutoDoDia, PERIODO_PADRAO, periodoDe, periodoValido, proximaAbertura,
} from './captura-janela';

// Brasília é UTC-3 o ano todo (sem horário de verão desde 2019): 05:00Z = 02:00 em Brasília.
const emBrasilia = (hhmm: string, dia = '2026-11-10') => new Date(`${dia}T${hhmm}:00-03:00`);

describe('períodos Noturno e Diurno', () => {
  it('o padrão é o noturno, das 18:00 às 05:59; o diurno vai das 06:00 às 17:59', () => {
    expect(PERIODO_PADRAO).toBe('NOTURNO');
    expect(janelaDoPeriodo('NOTURNO')).toEqual({ inicioMin: 1080, fimMin: 360 });
    expect(janelaDoPeriodo('DIURNO')).toEqual({ inicioMin: 360, fimMin: 1080 });
    expect(descreverJanela(janelaDoPeriodo('NOTURNO'))).toBe('das 18:00 às 05:59 (horário de Brasília)');
    expect(descreverJanela(janelaDoPeriodo('DIURNO'))).toBe('das 06:00 às 17:59 (horário de Brasília)');
    expect(descreverPeriodo('NOTURNO')).toBe('Noturno, das 18:00 às 05:59 (horário de Brasília)');
    expect(descreverJanela(null)).toBe('a qualquer hora do dia');
  });

  it('valor ausente ou desconhecido cai no noturno, sem derrubar nada', () => {
    expect(periodoValido('NOTURNO')).toBe(true);
    expect(periodoValido('DIURNO')).toBe(true);
    for (const ruim of ['noturno', 'MADRUGADA', '', null, undefined, 1]) {
      expect(periodoValido(ruim), String(ruim)).toBe(false);
      expect(periodoDe(ruim), String(ruim)).toBe('NOTURNO');
    }
    expect(periodoDe('DIURNO')).toBe('DIURNO');
  });

  it('o noturno e o diurno se completam: a cada minuto do dia, um deles está aberto e o outro fechado', () => {
    const noturno = janelaDoPeriodo('NOTURNO');
    const diurno = janelaDoPeriodo('DIURNO');
    for (let m = 0; m < 1440; m += 1) {
      const d = new Date(emBrasilia('00:00').getTime() + m * 60_000);
      expect(dentroDaJanela(d, noturno) !== dentroDaJanela(d, diurno), `minuto ${m}`).toBe(true);
    }
  });
});

describe('dentroDaJanela', () => {
  const noturno = janelaDoPeriodo('NOTURNO');
  const diurno = janelaDoPeriodo('DIURNO');

  it('conta no horário de Brasília, com o fim exclusivo (o noturno vale até 05:59:59)', () => {
    expect(minutoDoDia(new Date('2026-11-10T21:00:00Z'))).toBe(18 * 60);
    expect(dentroDaJanela(emBrasilia('17:59'), noturno)).toBe(false);
    expect(dentroDaJanela(emBrasilia('18:00'), noturno)).toBe(true);
    expect(dentroDaJanela(emBrasilia('23:59'), noturno)).toBe(true);
    expect(dentroDaJanela(emBrasilia('00:00'), noturno)).toBe(true);
    expect(dentroDaJanela(emBrasilia('05:59'), noturno)).toBe(true);
    expect(dentroDaJanela(emBrasilia('06:00'), noturno)).toBe(false);
    expect(dentroDaJanela(emBrasilia('12:00'), noturno)).toBe(false);
    expect(dentroDaJanela(emBrasilia('06:00'), diurno)).toBe(true);
    expect(dentroDaJanela(emBrasilia('17:59'), diurno)).toBe(true);
    expect(dentroDaJanela(emBrasilia('18:00'), diurno)).toBe(false);
  });

  it('o instante em UTC não engana: 21:00Z já é 18:00 em Brasília, e 03:00Z ainda é 00:00', () => {
    expect(dentroDaJanela(new Date('2026-11-10T20:59:59Z'), noturno)).toBe(false);
    expect(dentroDaJanela(new Date('2026-11-10T21:00:00Z'), noturno)).toBe(true);
    expect(dentroDaJanela(new Date('2026-11-10T08:59:59Z'), noturno)).toBe(true); // 05:59:59
    expect(dentroDaJanela(new Date('2026-11-10T09:00:00Z'), noturno)).toBe(false); // 06:00
  });

  it('meia-noite em Brasília é o minuto 0, não 24', () => {
    expect(minutoDoDia(emBrasilia('00:00'))).toBe(0);
    expect(minutoDoDia(emBrasilia('23:59'))).toBe(1439);
  });

  it('sem janela (null), sempre aberto', () => {
    expect(dentroDaJanela(emBrasilia('13:00'), null)).toBe(true);
  });
});

describe('proximaAbertura', () => {
  const noturno = janelaDoPeriodo('NOTURNO');
  const diurno = janelaDoPeriodo('DIURNO');

  it('dentro da janela, é o próprio instante', () => {
    const agora = emBrasilia('02:30');
    expect(proximaAbertura(agora, noturno)).toBe(agora);
    expect(proximaAbertura(agora, null)).toBe(agora);
  });

  it('fora da janela, é a próxima abertura: hoje se ainda não passou, amanhã se já passou', () => {
    expect(proximaAbertura(emBrasilia('12:00'), noturno).toISOString()).toBe(emBrasilia('18:00').toISOString());
    expect(proximaAbertura(emBrasilia('06:00'), noturno).toISOString()).toBe(emBrasilia('18:00').toISOString());
    expect(proximaAbertura(emBrasilia('05:00'), diurno).toISOString()).toBe(emBrasilia('06:00').toISOString());
    expect(proximaAbertura(emBrasilia('18:00'), diurno).toISOString()).toBe(emBrasilia('06:00', '2026-11-11').toISOString());
    expect(proximaAbertura(emBrasilia('23:30'), diurno).toISOString()).toBe(emBrasilia('06:00', '2026-11-11').toISOString());
  });

  it('abre sempre no minuto cheio, mesmo que o instante de partida tenha segundos', () => {
    const quase = new Date(emBrasilia('17:59').getTime() + 30_000); // 17:59:30
    expect(proximaAbertura(quase, noturno).toISOString()).toBe(emBrasilia('18:00').toISOString());
  });
});
