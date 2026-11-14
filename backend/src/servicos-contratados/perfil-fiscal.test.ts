import { describe, expect, it } from 'vitest';
import { lerEfd, lerMit } from './perfil-fiscal';

const mit = (balanco?: boolean, situacaoApuracao = 3) => ({
  situacaoApuracao,
  dadosApuracaoMit: {
    PeriodoApuracao: { AnoApuracao: 2026, MesApuracao: 2 },
    DadosIniciais: { SemMovimento: false, TributacaoLucro: 1, VariacoesMonetarias: 1 },
    Debitos: { BalancoLucroReal: balanco },
  },
});

describe('Perfil fiscal automático', () => {
  it('usa só MIT encerrado e nunca interpreta ausência de balancete como estimativa', () => {
    expect(lerMit(mit(true, 1))).toBeNull();
    expect(lerMit(mit())).toEqual({ competencia: '2026-02', forma: 'Lucro Real Anual', metodo: null });
    expect(lerMit(JSON.stringify(mit(true)))?.metodo).toBe('Balancete de suspensão ou redução');
    expect(lerMit(mit(false))?.metodo).toBe('Sem balancete declarado');
  });

  it('confere titular e competência e só lê o indicador no cumulativo', () => {
    const cab = '|0000|006|0|||01022026|28022026|EMPRESA|12345678000100|';
    for (const [indicador, esperado] of [['1', 'Caixa'], ['2', 'Competência'], ['9', 'Competência'], ['', null]]) {
      expect(lerEfd(`${cab}\n|0110|2||1|${indicador}|`, '12345678000100', '2026-02')).toBe(esperado);
    }
    expect(lerEfd(`${cab}\n|0110|1||1|1|`, '12345678000100', '2026-02')).toBeNull();
    expect(lerEfd(`${cab}\n|0110|2||1|1|`, '12345678000200', '2026-02')).toBeNull();
    expect(lerEfd(`${cab}\n|0110|2||1|1|`, '12345678000100', '2026-03')).toBeNull();
  });
});
