import { describe, expect, it } from 'vitest';
import { DIAS_PADRAO, lembretesDoDia, MarcoParaEmail, montarEmailLembrete, normalizarDias } from './agenda.lembretes';
import { lerDataIso, MarcoBase } from './agenda.regras';

const d = (iso: string) => lerDataIso(iso) as Date;
const hoje = d('2026-11-10');

const marco = (extra: Partial<MarcoBase & { confirmado: boolean }> & { chave: string }): MarcoBase & { confirmado: boolean } => ({
  id: extra.chave, titulo: extra.titulo ?? extra.chave, tipo: 'marco', categoria: 'Transição', data: d('2027-01-01'), data_fim: null, regimes: [], ufs: [], confirmado: true, ...extra,
});

describe('antecedência dos lembretes', () => {
  it('aceita só as antecedências previstas, sem repetir, da maior para a menor', () => {
    expect(normalizarDias([1, 30, 7, 7, 99, -2, 'x'])).toEqual([30, 7, 1]);
    expect(normalizarDias([0, 15])).toEqual([15, 0]);
  });

  it('vazio ou inválido volta ao padrão (30, 7 e 1 dia)', () => {
    expect(normalizarDias([])).toEqual(DIAS_PADRAO);
    expect(normalizarDias(undefined)).toEqual(DIAS_PADRAO);
    expect(normalizarDias('7')).toEqual(DIAS_PADRAO);
    expect(normalizarDias([99, 5])).toEqual(DIAS_PADRAO);
  });
});

describe('quais marcos entram no aviso de hoje', () => {
  it('só os confirmados, e só quando faltam exatamente N dias', () => {
    const marcos = [
      marco({ chave: 'em-7', data: d('2026-11-17') }),
      marco({ chave: 'amanha', data: d('2026-11-11') }),
      marco({ chave: 'em-30', data: d('2026-12-10') }),
      marco({ chave: 'em-8', data: d('2026-11-18') }),
      marco({ chave: 'nao-confirmado', data: d('2026-11-17'), confirmado: false }),
      marco({ chave: 'ja-passou', data: d('2026-11-03') }),
    ];
    const r = lembretesDoDia(marcos, hoje, [30, 7, 1]);
    expect(r.map((x) => `${x.marco.chave}:${x.diasAntes}`)).toEqual(['amanha:1', 'em-7:7', 'em-30:30']);
  });

  it('prazo com período conta do último dia; marco de vigência conta do início', () => {
    const prazo = marco({ chave: 'prazo', tipo: 'prazo', data: d('2026-11-03'), data_fim: d('2026-12-20') });
    const vigencia = marco({ chave: 'vigencia', tipo: 'marco', data: d('2026-11-17'), data_fim: d('2032-12-31') });
    expect(lembretesDoDia([prazo], d('2026-11-20'), [30]).map((x) => x.diasAntes)).toEqual([30]);
    expect(lembretesDoDia([prazo], d('2026-11-13'), [30])).toEqual([]); // faltam 37 dias para o último dia
    expect(lembretesDoDia([vigencia], hoje, [7]).map((x) => x.marco.chave)).toEqual(['vigencia']);
  });

  it('no próprio dia (0) também avisa, se a pessoa escolheu', () => {
    expect(lembretesDoDia([marco({ chave: 'hoje', data: hoje })], hoje, [0]).map((x) => x.diasAntes)).toEqual([0]);
    expect(lembretesDoDia([marco({ chave: 'hoje', data: hoje })], hoje, [7])).toEqual([]);
  });
});

describe('e-mail de lembrete', () => {
  const m = (extra: Partial<MarcoParaEmail> & { chave: string }): MarcoParaEmail => ({
    ...marco(extra), descricao: 'Descrição do marco.', fontes: ['Lei Complementar nº 214, de 16 de janeiro de 2025, art. 381, § 4º, I'], ...extra,
  });

  it('traz data, categoria, descrição, fonte oficial e o link da agenda', () => {
    const e = montarEmailLembrete(
      [{ diasAntes: 7, marco: m({ chave: 'estoque', titulo: 'Prazo do estoque', tipo: 'prazo', data: d('2026-11-17'), categoria: 'Crédito presumido do estoque' }) }],
      hoje, { urlPublica: 'https://simulador.clarityib.com.br/' },
    );
    expect(e.assunto).toBe('[InTAX] Agenda da Reforma: 1 data para acompanhar');
    for (const t of ['Prazo do estoque', 'Crédito presumido do estoque', '17/11/2026', 'em 7 dias', 'Descrição do marco.', 'Lei Complementar nº 214']) {
      expect(e.html, t).toContain(t);
      expect(e.texto, t).toContain(t);
    }
    expect(e.texto).toContain('Fonte oficial: Lei Complementar nº 214');
    expect(e.html).toContain('href="https://simulador.clarityib.com.br/agenda-reforma"');
    expect(e.texto).toContain('Agenda completa: https://simulador.clarityib.com.br/agenda-reforma');
  });

  it('prazo com período mostra "até" o último dia', () => {
    const e = montarEmailLembrete([{ diasAntes: 30, marco: m({ chave: 'p', tipo: 'prazo', data: d('2026-11-03'), data_fim: d('2026-12-20') }) }], d('2026-11-20'), { urlPublica: 'https://x' });
    expect(e.texto).toContain('até 20/12/2026 (em 30 dias)');
  });

  it('lista as empresas cadastradas a que o marco se aplica (e conta o que passa de oito)', () => {
    const nomes = Array.from({ length: 10 }, (_, i) => `Empresa ${i + 1}`);
    const e = montarEmailLembrete([{ diasAntes: 1, marco: m({ chave: 'x' }) }], hoje, { urlPublica: 'https://x', empresas: new Map([['x', nomes]]) });
    expect(e.texto).toContain('Empresas cadastradas a que se aplica: Empresa 1, Empresa 2, Empresa 3, Empresa 4, Empresa 5, Empresa 6, Empresa 7, Empresa 8 e mais 2');
    expect(montarEmailLembrete([{ diasAntes: 1, marco: m({ chave: 'x' }) }], hoje, { urlPublica: 'https://x' }).texto).not.toContain('Empresas cadastradas');
  });

  it('avisa quando a fonte do marco mudou e a revisão está pendente', () => {
    const e = montarEmailLembrete([{ diasAntes: 1, marco: m({ chave: 'x', aviso: 'Fonte em revisão: Art. 381 (LC 214/2025) alterado em 12/11/2026.' }) }], hoje, { urlPublica: 'https://x' });
    expect(e.html).toContain('Fonte em revisão: Art. 381');
    expect(e.texto).toContain('Fonte em revisão: Art. 381');
  });

  it('mensagem de teste leva o rótulo no assunto e no corpo; títulos com HTML são escapados', () => {
    const e = montarEmailLembrete([{ diasAntes: 3, marco: m({ chave: 'x', titulo: '<b>Título</b> & cia' }) }, { diasAntes: 4, marco: m({ chave: 'y' }) }], hoje, { urlPublica: 'https://x', teste: true, escopo: 'Empresa Alfa' });
    expect(e.assunto.startsWith('[TESTE] [InTAX] Agenda da Reforma: 2 datas')).toBe(true);
    expect(e.texto.startsWith('Mensagem de teste')).toBe(true);
    expect(e.html).toContain('&lt;b&gt;Título&lt;/b&gt; &amp; cia');
    expect(e.html).not.toContain('<b>Título</b>');
    expect(e.html).toContain('(Empresa Alfa)');
  });
});
