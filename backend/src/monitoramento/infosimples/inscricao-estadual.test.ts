import { describe, expect, it } from 'vitest';
import type { ContextoInfosimples } from './base';
import { classificarSituacao, lerSintegra, servicos } from './inscricao-estadual';

const ctx = (c: Partial<ContextoInfosimples>): ContextoInfosimples => ({
  cnpj: '12.345.678/0001-90', uf: 'MT', municipio: null, codigoIbge: null, inscricaoEstadual: null, inscricaoMunicipal: null, params: {}, ...c,
});
const servico = servicos.find((s) => s.chave === 'is-sintegra')!;
const consulta = servico.infosimples!;

describe('Inscrição estadual (SINTEGRA)', () => {
  it('fica no assunto Situação e atende as UFs do escritório', () => {
    expect(servico.grupo).toBe('situacao');
    for (const uf of ['MT', 'MS', 'GO', 'MA', 'PA']) expect(servico.ufs).toContain(uf);
    expect(servico.ufs).not.toContain('PE');
    expect(servico.ufs).not.toContain('SE');
  });

  it('usa a consulta unificada com UF e CNPJ', () => {
    for (const uf of ['MT', 'MS', 'GO', 'MA', 'PA']) {
      expect(consulta.rota(ctx({ uf }))).toBe('sintegra/unificada');
      expect(consulta.parametros(ctx({ uf: uf.toLowerCase() }))).toEqual({ uf, cnpj: '12345678000190' });
    }
    expect(consulta.rota(ctx({ uf: 'PE' }))).toBeNull();
    expect(consulta.rota(ctx({ uf: null }))).toBeNull();
  });

  it('pede o cadastro quando falta CNPJ ou UF', () => {
    expect(() => consulta.parametros(ctx({ cnpj: '123' }))).toThrow(/CNPJ/);
    expect(() => consulta.parametros(ctx({ uf: null }))).toThrow(/UF/);
  });

  it('classifica a situação', () => {
    expect(classificarSituacao('ATIVO')).toBe('ATIVA');
    expect(classificarSituacao('HABILITADO')).toBe('ATIVA');
    expect(classificarSituacao('Não Habilitado')).toBe('IRREGULAR');
    expect(classificarSituacao('INATIVA')).toBe('IRREGULAR');
    expect(classificarSituacao('SUSPENSO')).toBe('IRREGULAR');
    expect(classificarSituacao('BAIXADO')).toBe('IRREGULAR');
    expect(classificarSituacao('Inapta')).toBe('IRREGULAR');
    expect(classificarSituacao('Em análise')).toBe('OUTRA');
  });

  it('lê inscrição ativa (MT)', () => {
    const r = lerSintegra([{
      razao_social: 'FAZENDA EXEMPLO LTDA', inscricao_estadual: '13.123.456-7', normalizado_inscricao_estadual: '131234567',
      situacao_cadastral: 'ATIVO', situacao_cadastral_data: '10/03/2020', normalizado_situacao_cadastral_data: '10/03/2020',
      forma_tributacao: 'NORMAL', atividade_economica: '0115-6/00 - Cultivo de soja',
      endereco_logradouro: 'ROD MT 130', endereco_numero: 'S/N', endereco_bairro: 'ZONA RURAL', endereco_municipio: 'PRIMAVERA DO LESTE', endereco_uf: 'MT', endereco_cep: '78850-000',
    }]);
    expect(r.nivel).toBe('OK');
    expect(r.titulo).toBe('Inscrição estadual 131234567 ativa na SEFAZ.');
    expect(r.destaques).toContainEqual({ rotulo: 'Situação', valor: 'ATIVO desde 10/03/2020' });
    expect(r.destaques).toContainEqual({ rotulo: 'Regime de apuração', valor: 'NORMAL' });
    expect(r.destaques).toContainEqual({ rotulo: 'CNAE', valor: '0115-6/00 - Cultivo de soja' });
    expect(r.tabela!.linhas[0]).toMatchObject({ inscricao: '131234567', data: '20200310', endereco: 'ROD MT 130, S/N - ZONA RURAL - PRIMAVERA DO LESTE/MT - CEP 78850-000' });
  });

  it('marca como crítico a inscrição suspensa', () => {
    const r = lerSintegra([{ razao_social: 'X', inscricao_estadual: '15.111.222-3', situacao_cadastral: 'SUSPENSO', situacao_cadastral_data: '01/02/2026', regime_apuracao: 'SIMPLES NACIONAL' }]);
    expect(r.nivel).toBe('CRITICO');
    expect(r.titulo).toBe('Inscrição estadual 15.111.222-3 com situação suspenso na SEFAZ.');
  });

  it('mostra uma linha por inscrição quando o CNPJ tem mais de uma (PA)', () => {
    const r = lerSintegra([
      { razao_social: 'AGRO PA LTDA', inscricao_estadual: '151111111', situacao_cadastral: 'ATIVO', regime_apuracao: 'NORMAL' },
      { inscricao_estadual: '152222222', situacao_cadastral: 'BAIXADO', situacao_cadastral_data: '2025-06-30' },
    ]);
    expect(r.nivel).toBe('CRITICO');
    expect(r.titulo).toBe('1 de 2 inscrições estaduais com situação irregular na SEFAZ.');
    expect(r.destaques).toContainEqual({ rotulo: 'Inscrições', valor: '2' });
    expect(r.tabela!.linhas).toHaveLength(2);
    expect(r.tabela!.linhas[1]).toMatchObject({ inscricao: '152222222', situacao: 'BAIXADO', data: '20250630', regime: '—' });
    expect(r.tabela!.linhas[1]).not.toHaveProperty('_s');
  });

  it('pede atenção na situação especial (MS) e no texto desconhecido', () => {
    expect(lerSintegra([{ inscricao_estadual: '28.000.000-1', situacao_cadastral: 'ATIVO', situacao_especial: 'Regime especial', regime_pagamento: 'NORMAL' }]).nivel).toBe('ATENCAO');
    expect(lerSintegra([{ inscricao_estadual: '28.000.000-1', situacao_cadastral: 'EM ANÁLISE' }]).nivel).toBe('ATENCAO');
  });

  it('informa quando não há inscrição', () => {
    const r = lerSintegra([]);
    expect(r.nivel).toBe('INFO');
    expect(r.tabela).toBeUndefined();
  });
});
