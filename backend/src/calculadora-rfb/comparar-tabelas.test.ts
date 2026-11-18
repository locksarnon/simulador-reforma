import { describe, expect, it } from 'vitest';
import { compararTabelas } from './comparar-tabelas';

const of = (cd: string, cst: string, cbs: number | null, ibs = cbs) => ({ c_class_trib: cd, cst, pct_reducao_cbs: cbs, pct_reducao_ibs: ibs, documentos: [], inicio_vigencia: '2026-01-01', fim_vigencia: null });
const inx = (cd: string, cst: string, red: number, extra: Record<string, unknown> = {}) => ({ c_class_trib: cd, cst, pct_reducao_cbs: red, pct_reducao_ibs: red, status: 'Ativo', vigencia_fim: null, ...extra });
const vinc = (codigo: string, cd: string, excecoes: string[] = []) => ({ tipo: 'NCM', codigo, c_class_trib: cd, anexo: 'I', item: '19', excecoes, fim_vigencia: null });
const cor = (ncm: string, cd: string, excecao = false) => ({ ncm, c_class_trib: cd, anexo: 'I', item_lei: 19, excecao });
const HOJE = new Date('2026-11-18T12:00:00Z');

describe('comparação das tabelas do InTAX com a calculadora oficial', () => {
  it('aponta classe só de um lado, CST e redução divergentes; CST 400/410 não conta como divergência de redução', () => {
    const r = compararTabelas({
      oficial: [of('000001', '000', 0), of('200038', '200', 60), of('000007', '000', 0), of('410004', '410', 0)],
      intax: [inx('000001', '000', 0), inx('200038', '200', 0.5), inx('200056', '200', 0.3), inx('410004', '410', 1)],
      vinculos: [], correlacao: [],
    }, HOJE);
    expect(r.resumo).toMatchObject({ 'cClassTrib só na calculadora': 1, 'cClassTrib só no InTAX': 1, 'Redução CBS divergente': 1, 'Redução IBS divergente': 1 });
    expect(r.lista.find((d) => d.grupo === 'Redução CBS divergente')).toMatchObject({ chave: '200038', intax: '50%', oficial: '60%' });
    expect(Object.keys(r.resumo)).not.toContain('CST divergente');
  });
  it('classe com fim de vigência no InTAX deixa de contar', () => {
    const r = compararTabelas({ oficial: [of('000001', '000', 0)], intax: [inx('000001', '000', 0), inx('220001', '220', 0, { vigencia_fim: new Date('2026-01-01') })], vinculos: [], correlacao: [] }, HOJE);
    expect(r.resumo['cClassTrib só no InTAX']).toBeUndefined();
  });
  it('correlação: NCM do InTAX que a calculadora trata como exceção ou não vincula é apontado; o que tem amparo não', () => {
    const r = compararTabelas({
      oficial: [of('200003', '200', 100)], intax: [inx('200003', '200', 1)],
      vinculos: [vinc('0207', '200003', ['02074300']), vinc('02101', '200003')],
      correlacao: [cor('02.07', '200003'), cor('0207.43.00', '200003'), cor('0210.1', '200003'), cor('9999.99', '200003')],
    }, HOJE);
    expect(r.resumo['Correlação do InTAX sem amparo na calculadora']).toBe(2);
    const achados = r.lista.filter((d) => d.grupo.startsWith('Correlação'));
    expect(achados).toEqual(expect.arrayContaining([
      expect.objectContaining({ chave: '0207.43.00 → 200003', oficial: 'NCM é exceção na calculadora' }),
      expect.objectContaining({ chave: '9999.99 → 200003', oficial: 'NCM fora dos vínculos' }),
    ]));
  });
  it('linha de exceção do InTAX não é cobrada como inclusão', () => {
    const r = compararTabelas({ oficial: [of('200003', '200', 100)], intax: [inx('200003', '200', 1)], vinculos: [vinc('0207', '200003', ['02074300'])], correlacao: [cor('02.07', '200003'), cor('0207.43.00', '200003', true)] }, HOJE);
    expect(r.resumo['Correlação do InTAX sem amparo na calculadora']).toBeUndefined();
  });
  it('vínculo da calculadora que o InTAX não cobre é apontado', () => {
    const r = compararTabelas({ oficial: [of('200003', '200', 100)], intax: [inx('200003', '200', 1)], vinculos: [vinc('0207', '200003'), vinc('0210991', '200003')], correlacao: [cor('02.07', '200003')] }, HOJE);
    expect(r.resumo['Vínculo da calculadora ausente no InTAX']).toBe(1);
  });
});
