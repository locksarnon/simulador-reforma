import { describe, expect, it } from 'vitest';
import type { ContextoInfosimples } from './base';
import { classeDaSituacao, lerPerdcomp, servicos } from './perdcomp';

const ctx = (x: Partial<ContextoInfosimples> = {}): ContextoInfosimples => ({
  cnpj: '11222333000181', uf: 'MT', municipio: 'Cuiabá', codigoIbge: '5103403', inscricaoEstadual: null, inscricaoMunicipal: null, params: {}, ...x,
});
const s = servicos[0];
const consulta = s.infosimples!;

describe('PER/DCOMP (Infosimples)', () => {
  it('cadastro do serviço', () => {
    expect(servicos).toHaveLength(1);
    expect(s.chave).toBe('is-perdcomp');
    expect(s.grupo).toBe('declaracoes');
    expect(s.ufs).toBeUndefined();
  });

  it('rota e parâmetros iguais em qualquer UF, sem certificado', () => {
    for (const uf of ['MT', 'MS', 'GO', 'MA', 'PA', null]) {
      expect(consulta.rota(ctx({ uf }))).toBe('receita-federal/perdcomp');
      const p = consulta.parametros(ctx({ uf }));
      expect(p).toEqual({ cnpj: '11222333000181' });
      expect(Object.keys(p).some((k) => /pkcs12/.test(k))).toBe(false);
    }
  });

  it('número do PER/DCOMP opcional vai só com dígitos', () => {
    expect(consulta.parametros(ctx({ params: { perdcomp: '12345.67890.010125.1.3.02-1234' } }))).toEqual({ cnpj: '11222333000181', perdcomp: '123456789001012513021234' });
  });

  it('falta de CNPJ no cadastro', () => {
    expect(() => consulta.parametros(ctx({ cnpj: '' }))).toThrow(/CNPJ válido/);
    expect(() => consulta.parametros(ctx({ cnpj: '123' }))).toThrow(/CNPJ válido/);
  });

  it('sem pedidos', () => {
    const r = lerPerdcomp([{ perdcomp: [] }]);
    expect(r.nivel).toBe('OK');
    expect(r.titulo).toMatch(/Nenhum PER\/DCOMP/);
    expect(lerPerdcomp([]).nivel).toBe('OK');
  });

  it('não homologado e indeferido = crítico, com tabela e contagem', () => {
    const r = consulta.ler([{
      perdcomp: [
        { perdcomp: '11111.11111.010125.1.3.02-0001', cnpj: '11.222.333/0001-81', data_transmissao: '10/01/2025', situacao: 'Não Homologado', situacao_detalhamento: 'Despacho decisório emitido', tipo_credito: 'Saldo Negativo de IRPJ', tipo_documento: 'Declaração de Compensação' },
        { perdcomp: '22222.22222.020225.1.2.02-0002', data_transmissao: '2025-02-02', situacao: 'Indeferido', tipo_credito: 'Pagamento Indevido ou a Maior', tipo_documento: 'Pedido de Restituição' },
        { perdcomp: '33333.33333.030325.1.1.02-0003' },
      ],
    }], { code: 200 });
    expect(r.nivel).toBe('CRITICO');
    expect(r.titulo).toMatch(/^2 PER\/DCOMP indeferido/);
    const d = Object.fromEntries(r.destaques.map((x) => [x.rotulo, x.valor]));
    expect(d['PER/DCOMP encontrados']).toBe('3');
    expect(d['Não homologados']).toBe('1');
    expect(d['Indeferidos']).toBe('1');
    expect(d['Sem situação no retorno (consulte pelo número)']).toBe('1');
    expect(r.tabela?.linhas[0]).toMatchObject({ numero: '11111.11111.010125.1.3.02-0001', tipoDocumento: 'Declaração de Compensação', tipoCredito: 'Saldo Negativo de IRPJ', transmissao: '20250110', situacao: 'Não Homologado' });
    expect(r.tabela?.linhas[1].transmissao).toBe('20250202');
    expect(r.tabela?.colunas.find((c) => c.chave === 'transmissao')?.tipo).toBe('data');
  });

  it('em análise = informativo; deferido = OK', () => {
    expect(lerPerdcomp([{ perdcomp: { perdcomp: '1', situacao: 'Em análise' } }]).nivel).toBe('INFO');
    const ok = lerPerdcomp([{ perdcomp: [{ perdcomp: '1', situacao: 'Deferido' }, { perdcomp: '2', situacao: 'Homologado' }] }]);
    expect(ok.nivel).toBe('OK');
    expect(ok.destaques.find((x) => x.rotulo === 'Deferidos ou homologados')?.valor).toBe('2');
  });

  it('classes de situação', () => {
    expect(classeDaSituacao('NÃO HOMOLOGADA')).toBe('nao-homologado');
    expect(classeDaSituacao('Homologação parcial')).toBe('nao-homologado');
    expect(classeDaSituacao('Deferimento parcial')).toBe('indeferido');
    expect(classeDaSituacao('Indeferido')).toBe('indeferido');
    expect(classeDaSituacao('Aguardando análise')).toBe('em-analise');
    expect(classeDaSituacao('Deferido')).toBe('deferido');
    expect(classeDaSituacao('Cancelado')).toBe('outra');
  });
});
