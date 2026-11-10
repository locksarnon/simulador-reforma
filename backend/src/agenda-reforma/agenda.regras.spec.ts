import { describe, expect, it } from 'vitest';
import {
  aplicaAoPerfil, categoriaConhecida, chaveDeTexto, dataAlvo, dataBr, diasEntre, filtrarMarcos, hojeBrasilia, lerDataIso, MarcoBase, paraIso,
  quandoEmPalavras, regimeConhecido, situacaoDoMarco, ufConhecida,
} from './agenda.regras';

const d = (iso: string) => lerDataIso(iso) as Date;
const marco = (extra: Partial<MarcoBase> & { chave: string }): MarcoBase => ({
  id: extra.chave, titulo: extra.titulo ?? extra.chave, tipo: 'marco', categoria: 'Transição', data: d('2027-01-01'), data_fim: null, regimes: [], ufs: [], ...extra,
});

describe('datas da agenda', () => {
  it('lê só datas de calendário válidas (AAAA-MM-DD)', () => {
    expect(paraIso(lerDataIso('2026-12-31'))).toBe('2026-12-31');
    expect(lerDataIso('2026-02-30')).toBeNull();
    expect(lerDataIso('31/12/2026')).toBeNull();
    expect(lerDataIso('')).toBeNull();
    expect(lerDataIso(undefined)).toBeNull();
    expect(dataBr(lerDataIso('2027-06-30'))).toBe('30/06/2027');
    expect(dataBr(null)).toBe('');
  });

  it('"hoje" é o dia de Brasília, não o de Greenwich', () => {
    expect(paraIso(hojeBrasilia(new Date('2026-11-10T02:30:00Z')))).toBe('2026-11-09'); // 23h30 do dia 9 em Brasília
    expect(paraIso(hojeBrasilia(new Date('2026-11-10T12:00:00Z')))).toBe('2026-11-10');
    expect(paraIso(hojeBrasilia(new Date('2026-11-10T03:00:00Z')))).toBe('2026-11-10'); // meia-noite em Brasília
  });

  it('conta dias entre datas e escreve o prazo em palavras', () => {
    expect(diasEntre(d('2026-11-10'), d('2026-12-20'))).toBe(40);
    expect(diasEntre(d('2026-11-10'), d('2026-11-09'))).toBe(-1);
    expect([0, 1, 7, -1, -3].map(quandoEmPalavras)).toEqual(['hoje', 'amanhã', 'em 7 dias', 'ontem', 'há 3 dias']);
  });
});

describe('regime, UF e categoria', () => {
  it('reconhece o regime sem se importar com acento e caixa', () => {
    expect(regimeConhecido('lucro  presumido')).toBe('Lucro Presumido');
    expect(regimeConhecido('PRODUTOR RURAL pf')).toBe('Produtor rural PF');
    expect(regimeConhecido('MEI')).toBeNull();
    expect(regimeConhecido(null)).toBeNull();
    expect(chaveDeTexto('  Transição ')).toBe('transicao');
    expect(categoriaConhecida('transicao')).toBe('Transição');
    expect(categoriaConhecida('outra')).toBeNull();
  });

  it('UF em qualquer caixa; sigla inexistente não vale', () => {
    expect(ufConhecida(' am ')).toBe('AM');
    expect(ufConhecida('XX')).toBeNull();
    expect(ufConhecida(undefined)).toBeNull();
  });
});

describe('aplicação do marco ao perfil da empresa', () => {
  const todos = marco({ chave: 'todos' });
  const soSimples = marco({ chave: 'simples', regimes: ['Simples Nacional'] });
  const soAmazonas = marco({ chave: 'am', ufs: ['AM'] });
  const simplesNoAm = marco({ chave: 'simples-am', regimes: ['Simples Nacional'], ufs: ['AM'] });

  it('sem critério (undefined) não filtra nada', () => {
    for (const m of [todos, soSimples, soAmazonas, simplesNoAm]) expect(aplicaAoPerfil(m, {})).toBe(true);
  });

  it('marco sem restrição vale para qualquer regime e UF', () => {
    expect(aplicaAoPerfil(todos, { regime: 'Lucro Real', uf: 'SP' })).toBe(true);
  });

  it('filtra pelo regime da empresa', () => {
    expect(aplicaAoPerfil(soSimples, { regime: 'Simples Nacional' })).toBe(true);
    expect(aplicaAoPerfil(soSimples, { regime: 'simples nacional' })).toBe(true);
    expect(aplicaAoPerfil(soSimples, { regime: 'Lucro Real' })).toBe(false);
  });

  it('filtra pela UF da empresa', () => {
    expect(aplicaAoPerfil(soAmazonas, { uf: 'AM' })).toBe(true);
    expect(aplicaAoPerfil(soAmazonas, { uf: 'am' })).toBe(true);
    expect(aplicaAoPerfil(soAmazonas, { uf: 'SP' })).toBe(false);
  });

  it('empresa sem regime ou sem UF informados (null) só vê os marcos sem restrição desse critério', () => {
    expect(aplicaAoPerfil(todos, { regime: null, uf: null })).toBe(true);
    expect(aplicaAoPerfil(soSimples, { regime: null })).toBe(false);
    expect(aplicaAoPerfil(soAmazonas, { uf: null })).toBe(false);
    expect(aplicaAoPerfil(soAmazonas, { regime: null, uf: 'AM' })).toBe(true);
  });

  it('regime e UF juntos: os dois precisam bater', () => {
    expect(aplicaAoPerfil(simplesNoAm, { regime: 'Simples Nacional', uf: 'AM' })).toBe(true);
    expect(aplicaAoPerfil(simplesNoAm, { regime: 'Simples Nacional', uf: 'SP' })).toBe(false);
    expect(aplicaAoPerfil(simplesNoAm, { regime: 'Lucro Real', uf: 'AM' })).toBe(false);
  });
});

describe('situação e data de referência do marco', () => {
  const hoje = d('2026-11-10');

  it('marco de um dia só: passado, hoje ou futuro', () => {
    expect(situacaoDoMarco(marco({ chave: 'a', data: d('2026-11-09') }), hoje)).toBe('passado');
    expect(situacaoDoMarco(marco({ chave: 'b', data: d('2026-11-10') }), hoje)).toBe('em_andamento');
    expect(situacaoDoMarco(marco({ chave: 'c', data: d('2026-11-11') }), hoje)).toBe('futuro');
  });

  it('período: em andamento entre o início e o fim, inclusive no último dia', () => {
    const periodo = marco({ chave: 'p', data: d('2026-11-03'), data_fim: d('2026-12-20') });
    expect(situacaoDoMarco(periodo, hoje)).toBe('em_andamento');
    expect(situacaoDoMarco(periodo, d('2026-12-20'))).toBe('em_andamento');
    expect(situacaoDoMarco(periodo, d('2026-12-21'))).toBe('passado');
  });

  it('o lembrete conta do último dia do prazo, ou do início da vigência', () => {
    expect(dataAlvo(marco({ chave: 'x', tipo: 'prazo', data: d('2026-11-03'), data_fim: d('2026-12-20') }))).toEqual(d('2026-12-20'));
    expect(dataAlvo(marco({ chave: 'y', tipo: 'prazo', data: d('2026-12-31') }))).toEqual(d('2026-12-31'));
    expect(dataAlvo(marco({ chave: 'z', tipo: 'marco', data: d('2029-01-01'), data_fim: d('2032-12-31') }))).toEqual(d('2029-01-01'));
  });
});

describe('filtro da agenda', () => {
  const hoje = d('2026-11-10');
  const marcos = [
    marco({ chave: 'depois', titulo: 'Depois', data: d('2027-01-01') }),
    marco({ chave: 'passado', titulo: 'Passado', data: d('2026-08-03'), categoria: 'Documentos fiscais' }),
    marco({ chave: 'simples', titulo: 'Simples', data: d('2026-11-03'), data_fim: d('2026-12-20'), regimes: ['Simples Nacional'], categoria: 'Simples Nacional', tipo: 'prazo' }),
    marco({ chave: 'am', titulo: 'ZFM', data: d('2027-01-01'), ufs: ['AM'], categoria: 'Zona Franca de Manaus' }),
  ];

  it('por padrão esconde o que já passou e ordena pela data', () => {
    expect(filtrarMarcos(marcos, { hoje }).map((m) => m.chave)).toEqual(['simples', 'depois', 'am']); // no mesmo dia, pelo título
  });

  it('com datas passadas, mostra tudo na ordem da data', () => {
    expect(filtrarMarcos(marcos, { hoje, incluirPassados: true }).map((m) => m.chave)).toEqual(['passado', 'simples', 'depois', 'am']);
  });

  it('combina regime, UF e categoria', () => {
    expect(filtrarMarcos(marcos, { hoje, regime: 'Lucro Real' }).map((m) => m.chave)).toEqual(['depois', 'am']);
    expect(filtrarMarcos(marcos, { hoje, regime: 'Lucro Real', uf: 'SP' }).map((m) => m.chave)).toEqual(['depois']);
    expect(filtrarMarcos(marcos, { hoje, categoria: 'Simples Nacional' }).map((m) => m.chave)).toEqual(['simples']);
    expect(filtrarMarcos(marcos, { hoje, uf: 'AM', regime: 'Simples Nacional' }).map((m) => m.chave)).toEqual(['simples', 'depois', 'am']);
  });
});
