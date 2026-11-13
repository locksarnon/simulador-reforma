import { describe, expect, it } from 'vitest';
import { lerDasnSimei, lerSimples, servicos, situacaoDoAno } from './simei-simples';
import type { ContextoInfosimples } from './base';

const ctx = (cnpj: string, uf: string | null = 'MT'): ContextoInfosimples => ({ cnpj, uf, municipio: null, codigoIbge: null, inscricaoEstadual: null, inscricaoMunicipal: null, params: {} });
const dasn = servicos.find((s) => s.chave === 'is-dasn-simei')!;
const simples = servicos.find((s) => s.chave === 'is-simples-situacao')!;
const HOJE = new Date(Date.UTC(2026, 10, 13));

describe('catálogo', () => {
  it('registra os dois serviços nos grupos certos', () => {
    expect(dasn).toMatchObject({ grupo: 'mei', para: 'MEI', fonte: 'INFOSIMPLES', sistema: 'INFOSIMPLES' });
    expect(simples).toMatchObject({ grupo: 'situacao', fonte: 'INFOSIMPLES' });
    expect(simples.para).toBeUndefined();
    expect(dasn.infosimples!.adicional).toBe(0.1);
    expect(simples.infosimples!.adicional).toBe(0.08);
  });

  it.each(['MT', 'MS', 'GO', 'MA', 'PA', null])('rota e parâmetros iguais para a UF %s', (uf) => {
    const c = ctx('12.345.678/0001-90', uf);
    expect(dasn.infosimples!.rota(c)).toBe('receita-federal/simples-dasn');
    expect(simples.infosimples!.rota(c)).toBe('receita-federal/simples');
    expect(dasn.infosimples!.parametros(c)).toEqual({ cnpj: '12345678000190' });
    expect(simples.infosimples!.parametros(c)).toEqual({ cnpj: '12345678000190' });
  });

  it('sem CNPJ válido no cadastro a consulta não sai', () => {
    expect(() => dasn.infosimples!.parametros(ctx(''))).toThrow(/CNPJ/);
    expect(() => simples.infosimples!.parametros(ctx('123'))).toThrow(/14 dígitos/);
  });
});

describe('DASN-SIMEI', () => {
  it('tudo entregue = OK, com tabela por ano', () => {
    const r = lerDasnSimei([{ cnpj: '12.345.678/0001-90', razao_social: 'FULANO MEI', original: { 2023: 'Apresentada', 2024: 'Apresentada' }, retificadora: { 2023: 'Apresentada', 2024: '' } }], HOJE);
    expect(r.nivel).toBe('OK');
    expect(r.tabela!.linhas).toEqual([
      { ano: '2024', situacao: 'Apresentada', retificadora: '—' },
      { ano: '2023', situacao: 'Apresentada', retificadora: 'Apresentada' },
    ]);
    expect(r.destaques).toContainEqual({ rotulo: 'Anos em atraso', valor: 'Nenhum' });
  });

  it('ano vencido sem entrega = CRITICO', () => {
    const r = lerDasnSimei([{ original: { 2022: 'Não apresentada', 2023: 'Apresentada', 2024: false } }], HOJE);
    expect(r.nivel).toBe('CRITICO');
    expect(r.titulo).toBe('DASN-SIMEI em atraso: anos-calendário 2024, 2022.');
    expect(r.tabela!.linhas[0]).toMatchObject({ ano: '2024', situacao: 'Em atraso' });
    expect(r.tabela!.linhas[2]).toMatchObject({ ano: '2022', situacao: 'Em atraso (Não apresentada)' });
  });

  it('ano ainda no prazo = ATENCAO', () => {
    const r = lerDasnSimei([{ original: { 2025: 'Não apresentada', 2024: 'Apresentada' } }], new Date(Date.UTC(2026, 2, 1)));
    expect(r.nivel).toBe('ATENCAO');
    expect(r.tabela!.linhas[0].situacao).toBe('Não entregue, no prazo até 31/05/2026');
  });

  it('sem anos listados = INFO', () => {
    expect(lerDasnSimei([{ cnpj: '1' }], HOJE).nivel).toBe('INFO');
  });

  it('texto desconhecido fica como veio', () => {
    expect(situacaoDoAno(2020, 'Fora do período de enquadramento', HOJE)).toEqual({ situacao: 'OUTRA', texto: 'Fora do período de enquadramento' });
  });
});

describe('Simples Nacional, SIMEI e Regime Regular IBS/CBS', () => {
  const base = {
    cnpj: '12.345.678/0001-90', razao_social: 'EMPRESA LTDA',
    simples_nacional_situacao: 'Optante pelo Simples Nacional desde 01/01/2020',
    simei_situacao: 'NÃO enquadrado no SIMEI',
    simples_nacional_periodos_anteriores: [{ inicio_data: '01/07/2007', fim_data: '31/12/2015', normalizado_inicio_data: '01/07/2007', normalizado_fim_data: '31/12/2015', detalhamento: 'Excluída por comunicação' }],
    simei_periodos_anteriores: [],
    simples_nacional_eventos_futuros: [],
    simei_eventos_futuros: [],
  };

  it('optante, sem eventos = INFO com destaques e tabela de períodos', () => {
    const r = lerSimples([base], HOJE);
    expect(r.nivel).toBe('INFO');
    expect(r.titulo).toBe('Optante pelo Simples Nacional.');
    expect(r.destaques).toEqual([
      { rotulo: 'Simples Nacional', valor: 'Optante pelo Simples Nacional desde 01/01/2020' },
      { rotulo: 'SIMEI', valor: 'NÃO enquadrado no SIMEI' },
      { rotulo: 'Regime Regular IBS/CBS', valor: 'Não informado na consulta' },
      { rotulo: 'Próximo evento', valor: 'Nenhum' },
    ]);
    expect(r.tabela!.linhas).toEqual([{ regime: 'Simples Nacional', tipo: 'Período anterior', inicio: '20070701', fim: '20151231', descricao: 'Excluída por comunicação' }]);
  });

  it('exclusão agendada = ATENCAO, e o Regime Regular IBS/CBS entra nos destaques e na tabela', () => {
    const r = lerSimples([{
      ...base,
      simples_nacional_eventos_futuros: [{ data_efeito: '01/01/2027', normalizado_data_efeito: '2027-01-01', descricao_evento: 'Exclusão por débitos' }],
      regime_regular_ibs_cbs_situacao: 'Optante pelo Regime Regular do IBS e da CBS',
      regime_regular_ibs_cbs_eventos_futuros: [{ data_efeito: '01/01/2027', descricao_evento: 'Opção pelo regime regular' }],
    }], HOJE);
    expect(r.nivel).toBe('ATENCAO');
    expect(r.titulo).toBe('Exclusão ou desenquadramento agendado com efeito em 01/01/2027 (Simples Nacional).');
    expect(r.destaques).toContainEqual({ rotulo: 'Regime Regular IBS/CBS', valor: 'Optante pelo Regime Regular do IBS e da CBS' });
    expect(r.destaques).toContainEqual({ rotulo: 'Próximo evento', valor: '01/01/2027: Exclusão por débitos (Simples Nacional)' });
    expect(r.tabela!.linhas.map((l) => l.regime)).toEqual(['Simples Nacional', 'Regime Regular IBS/CBS', 'Simples Nacional']);
  });

  it('não optante e MEI', () => {
    expect(lerSimples([{ simples_nacional_situacao: 'Não optante pelo Simples Nacional', simei_situacao: 'Não enquadrado no SIMEI' }], HOJE).titulo).toBe('Não optante pelo Simples Nacional.');
    const mei = lerSimples([{ simples_nacional_situacao: 'Optante pelo Simples Nacional', simei_situacao: 'Enquadrado no SIMEI desde 01/03/2021' }], HOJE);
    expect(mei.titulo).toBe('Optante pelo Simples Nacional e enquadrada no SIMEI (MEI).');
    expect(mei.tabela).toBeUndefined();
  });
});
