import { describe, expect, it } from 'vitest';
import type { ContextoInfosimples } from './base';
import { servicos } from './dividas';

const ctx = (uf: string | null, cnpj = '12.345.678/0001-90'): ContextoInfosimples => ({
  cnpj, uf, municipio: null, codigoIbge: null, inscricaoEstadual: null, inscricaoMunicipal: null, params: {},
});
const estadual = servicos.find((s) => s.chave === 'is-divida-ativa-estadual')!;
const pgfn = servicos.find((s) => s.chave === 'is-pgfn-devedores')!;

describe('Infosimples: dívida ativa estadual', () => {
  it('rota por UF e parâmetros', () => {
    expect(estadual.grupo).toBe('situacao');
    expect(estadual.ufs).toEqual(['MT', 'MA']);
    expect(estadual.infosimples!.rota(ctx('MT'))).toBe('pge/mt/divida-ativa');
    expect(estadual.infosimples!.rota(ctx('ma'))).toBe('sefaz/ma/certidao-divida-ativa');
    for (const uf of ['MS', 'GO', 'PA', null]) expect(estadual.infosimples!.rota(ctx(uf))).toBeNull();
    expect(estadual.infosimples!.parametros(ctx('MT'))).toEqual({ cnpj: '12345678000190' });
  });

  it('falta de CNPJ no cadastro vira mensagem clara', () => {
    expect(() => estadual.infosimples!.parametros(ctx('MT', ''))).toThrow(/Cadastre o CNPJ/);
    expect(() => pgfn.infosimples!.parametros(ctx('GO', '123'))).toThrow(/Cadastre o CNPJ/);
  });

  it('MT com inscrições: crítico, uma linha por CDA', () => {
    const r = estadual.infosimples!.ler([{
      cpf_cnpj: '12.345.678/0001-90', devedor: 'EMPRESA TESTE LTDA', total_paginas: 2,
      debitos: [
        { cda: '20231234567', placa: 'ABC1D23', situacao: 'Ativa', tipo_processo: 'IPVA' },
        { cda: '20199999999', placa: '', situacao: 'Quitada', tipo_processo: 'ICMS' },
      ],
    }], { code: 200 });
    expect(r.nivel).toBe('CRITICO');
    expect(r.titulo).toBe('1 inscrição em dívida ativa no Estado de Mato Grosso.');
    expect(r.tabela!.linhas).toHaveLength(2);
    expect(r.tabela!.linhas[0]).toMatchObject({ numero: '20231234567', orgao: 'PGE-MT', natureza: 'IPVA', placa: 'ABC1D23', situacao: 'Ativa' });
    expect(r.tabela!.colunas.map((c) => c.chave)).toEqual(['numero', 'orgao', 'natureza', 'placa', 'situacao']);
    expect(r.destaques).toContainEqual({ rotulo: 'Páginas no portal', valor: '1 de 2 (a consulta traz a primeira)' });
  });

  it('MT sem inscrição: OK', () => {
    const r = estadual.infosimples!.ler([{ cpf_cnpj: '12.345.678/0001-90', debitos: [], total_paginas: 0 }], { code: 200 });
    expect(r.nivel).toBe('OK');
    expect(r.titulo).toBe('Nada consta na dívida ativa do Estado de Mato Grosso.');
    expect(r.tabela).toBeUndefined();
  });

  it('MA: certidão negativa = OK; não emitida = crítico', () => {
    const ok = estadual.infosimples!.ler([{ conseguiu_emitir_certidao_negativa: true, certidao_codigo: 'ABC123', emissao_data: '13/11/2026', validade_data: '12/02/2027', mensagem: '' }], { code: 200 });
    expect(ok.nivel).toBe('OK');
    expect(ok.titulo).toBe('Nada consta na dívida ativa do Estado do Maranhão: certidão negativa válida até 12/02/2027.');
    expect(ok.destaques).toContainEqual({ rotulo: 'Código da certidão', valor: 'ABC123' });
    const ruim = estadual.infosimples!.ler([{ conseguiu_emitir_certidao_negativa: false, mensagem: 'Contribuinte possui débitos inscritos em dívida ativa.' }], { code: 200 });
    expect(ruim.nivel).toBe('CRITICO');
    expect(ruim.destaques).toContainEqual({ rotulo: 'Mensagem da SEFAZ-MA', valor: 'Contribuinte possui débitos inscritos em dívida ativa.' });
  });
});

describe('Infosimples: lista de devedores da PGFN', () => {
  it('rota, parâmetros e adicional', () => {
    expect(pgfn.ufs).toBeUndefined();
    expect(pgfn.infosimples!.rota(ctx('GO'))).toBe('receita-federal/pgfn/devedores');
    expect(pgfn.infosimples!.parametros(ctx('PA'))).toEqual({ cnpj: '12345678000190' });
    expect(pgfn.infosimples!.adicional).toBe(0.1);
  });

  it('consta: crítico, total e linhas por natureza', () => {
    const r = pgfn.infosimples!.ler([{
      nome: 'EMPRESA TESTE LTDA', cpf_cnpj: '12.345.678/0001-90', uf: 'MT', municipio: 'CUIABA',
      total_divida: 'R$ 15.000,50', total_tributario: 'R$ 12.000,00', total_nao_tributario: 'R$ 3.000,50',
      naturezas_debitos: [
        { descricao: 'Previdenciária', total: 'R$ 12.000,00', debitos: [] },
        { descricao: 'FGTS', total: 3000.5, debitos: [{ numero_inscricao: 'FGMT201900001', valor: 'R$ 3.000,50', situacao: 'Ativa ajuizada', data_inscricao: '10/05/2019' }] },
      ],
    }], { code: 200 });
    expect(r.nivel).toBe('CRITICO');
    expect(r.titulo).toBe(`Consta na lista de devedores da PGFN: ${(15000.5).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} inscritos em dívida ativa da União.`);
    expect(r.tabela!.linhas).toHaveLength(2);
    expect(r.tabela!.linhas[0]).toMatchObject({ natureza: 'Previdenciária', valor: 12000, orgao: 'PGFN' });
    expect(r.tabela!.linhas[1]).toMatchObject({ numero: 'FGMT201900001', natureza: 'FGTS', valor: 3000.5, situacao: 'Ativa ajuizada', data: '10/05/2019' });
  });

  it('não consta: OK', () => {
    const r = pgfn.infosimples!.ler([{ nome: 'EMPRESA TESTE LTDA', total_divida: 0, naturezas_debitos: [] }], { code: 200 });
    expect(r.nivel).toBe('OK');
    expect(r.titulo).toBe('Não consta na lista de devedores da PGFN.');
  });
});
