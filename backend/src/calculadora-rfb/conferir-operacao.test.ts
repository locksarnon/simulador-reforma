import { describe, expect, it } from 'vitest';
import { lerConferencia, pedidoDaOperacao } from './conferir-operacao';

const base = { ano: 2029, data: '2029-06-15', cst: '000', cClassTrib: '000001', ncm: '8471.49.00', valorBruto: 1000, pisPct: 0.0165, cofinsPct: 0.076, icmsPct: 0.18, fatores: { pisCofins: 0, icms: 0.9, iss: 0.9 }, aliquotas: { cbs: 9.21, ibsUf: 1.477, ibsMun: 0.393 } };

describe('pedido da operação para a calculadora oficial', () => {
  it('bem: PIS/Cofins zerados em 2029 pelo fator, ICMS pelo fator do ano, alíquotas nominais informadas', () => {
    const p = pedidoDaOperacao(base);
    expect(p.dhFatoGerador).toBe('2029-06-15T12:00:00-03:00');
    expect(p.itens[0]).toEqual({ numero: 1, ncm: '84714900', cst: '000', cClassTrib: '000001', gComponentesBC: { vProd: 1000, vICMS: 162 }, aliquotasNominais: { cbs: 9.21, ibsEstadual: 1.477, ibsMunicipal: 0.393 } });
  });
  it('2026: PIS/Cofins e ICMS cheios e nenhuma alíquota informada (a calculadora as proíbe antes de 2027)', () => {
    const p = pedidoDaOperacao({ ...base, ano: 2026, data: '2026-06-15', fatores: { pisCofins: 1, icms: 1, iss: 1 } });
    expect(p.itens[0].gComponentesBC).toEqual({ vProd: 1000, vPIS: 16.5, vCOFINS: 76, vICMS: 180 });
    expect(p.itens[0]).not.toHaveProperty('aliquotasNominais');
  });
  it('serviço (NBS): ISS no lugar do ICMS e documento de serviço', () => {
    const p = pedidoDaOperacao({ ...base, ncm: undefined, nbs: '1.0101.10.00', issPct: 0.05, icmsPct: 0 });
    expect(p.tpDoc).toBe(65);
    expect(p.itens[0].gComponentesBC).toEqual({ vProd: 1000, vISSQN: 45 });
  });
});

describe('leitura da resposta oficial', () => {
  it('item calculado vira valores comparáveis', () => {
    const r = lerConferencia({ estadoItem: 'CALCULADO', tribCalc: { IBSCBS: { gIBSCBS: { vBC: '838.00', gIBSUF: { vIBSUF: '12.38' }, gIBSMun: { vIBSMun: '3.29' }, vIBS: '15.67', gCBS: { vCBS: '77.18' } } } } });
    expect(r).toMatchObject({ estado: 'COMPARAVEL', oficial: { vBC: 838, vCBS: 77.18, vIBS: 15.67, vIBSUF: 12.38, vIBSMun: 3.29 } });
  });
  it('NCM faltando (REG-015) pede o NCM; não implementado e falha viram "fora do alcance" ou erro com motivo', () => {
    expect(lerConferencia({ estadoItem: 'INCONSISTENCIA_ENTRADA', erros: [{ code: 'REG-015', detail: 'NCM incompleto' }] }).motivo).toMatch(/Informe o NCM/);
    expect(lerConferencia({ estadoItem: 'NAO_IMPLEMENTADO' }).estado).toBe('FORA_DO_ALCANCE');
    expect(lerConferencia(undefined).estado).toBe('ERRO');
  });
});
