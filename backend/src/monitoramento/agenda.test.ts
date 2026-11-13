import { describe, expect, it } from 'vitest';
import { agendaDocumentos, agendasDosServicos, caiHoje, servicosAgendaveis, textoDaAgenda, validarAgenda } from './agenda';

describe('agenda do monitoramento por serviço e por documento', () => {
  it('só entram consultas que rodam sozinhas (nada que mude dados na Receita)', () => {
    const l = servicosAgendaveis();
    expect(l.some((s) => s.chave === 'sitfis')).toBe(true);
    expect(l.some((s) => s.acao)).toBe(false);
  });

  it('sem escolha salva, herda o dia do assunto para os serviços da rotina; os demais ficam desligados', () => {
    const a = agendasDosServicos(undefined, { situacao: 3, declaracoes: 0 });
    expect(a.sitfis).toEqual({ frequencia: 'MENSAL', dia: 3 });
    expect(a['dctfweb-recibo']).toEqual({ frequencia: 'DESLIGADA', dia: 1 });
    expect(agendasDosServicos({ sitfis: { frequencia: 'SEMANAL', dia: 1 } }, { situacao: 3 }).sitfis).toEqual({ frequencia: 'SEMANAL', dia: 1 });
  });

  it('cai hoje pelo dia de Brasília (semana de segunda a domingo e dia do mês)', () => {
    const segunda16 = new Date('2026-11-16T12:00:00Z');
    expect(caiHoje({ frequencia: 'DIARIA', dia: 1 }, segunda16)).toBe(true);
    expect(caiHoje({ frequencia: 'SEMANAL', dia: 1 }, segunda16)).toBe(true);
    expect(caiHoje({ frequencia: 'SEMANAL', dia: 2 }, segunda16)).toBe(false);
    expect(caiHoje({ frequencia: 'MENSAL', dia: 16 }, segunda16)).toBe(true);
    // 02:00 UTC do dia 17 ainda é dia 16 em Brasília.
    expect(caiHoje({ frequencia: 'MENSAL', dia: 16 }, new Date('2026-11-17T02:00:00Z'))).toBe(true);
    expect(caiHoje({ frequencia: 'DESLIGADA', dia: 1 }, segunda16)).toBe(false);
  });

  it('valida o dia, descreve a agenda e completa as certidões com o padrão', () => {
    expect(() => validarAgenda({ frequencia: 'MENSAL', dia: 31 }, 'X')).toThrow('dia do mês de 1 a 28');
    expect(() => validarAgenda({ frequencia: 'SEMANAL', dia: 8 }, 'X')).toThrow('dia da semana');
    expect(textoDaAgenda({ frequencia: 'SEMANAL', dia: 6 })).toBe('Todo sábado');
    expect(textoDaAgenda({ frequencia: 'MENSAL', dia: 5 })).toBe('Todo dia 5');
    const d = agendaDocumentos({ certidoes: { FGTS: { ativa: false, dias_antes: 3 } } as never });
    expect(d.certidoes.FGTS).toEqual({ ativa: false, dias_antes: 3 });
    expect(d.certidoes.FEDERAL).toEqual({ ativa: true, dias_antes: 15 });
    expect(d.sped.frequencia).toBe('MENSAL');
  });
});
