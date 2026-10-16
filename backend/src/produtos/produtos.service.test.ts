import { describe, it, expect } from 'vitest';
import { ProdutosService } from './produtos.service';
import { lerOpcoes, OPCOES_PADRAO } from './opcoes-validacao';
const service = new ProdutosService({ ncm: { findMany: async () => [] } } as any, { base: async () => ({ lista: [], classes: new Map() }) } as any);
const file = (s: string) => ({ buffer: Buffer.from(s), originalname: 'produtos.csv' }) as Express.Multer.File;
const opcoes = { ...OPCOES_PADRAO, cClassTrib: false, duplicidades: true };
describe('saneamento cadastral', () => {
 it('distingue duplicidade exata e princípio ativo divergente', async () => {
  const f = file('Codigo;Descricao;NCM;Unidade;PrincipioAtivo\nA;Herbicida 500;12345678;LT;Glifosato 500\nB;Herbicida 500;12345678;LT;Glifosato 500\nC;Herbicida 500;12345678;LT;Outro 500');
  const r = await service.validar(f, undefined, undefined, { ...opcoes, principioAtivo: true });
  expect(r.itens[0].candidatos_duplicidade).toEqual([3]); expect(r.itens[2].candidatos_duplicidade).toEqual([]);
 });
 it('preserva a linha original no corte inclusivo de datas', async () => {
  const f = file('Codigo;Descricao;NCM;Unidade;Data\nA;Milho;12345678;KG;01/01/2026\nB;Soja;12345678;KG;31/01/2026');
  const r = await service.validar(f, undefined, undefined, { ...opcoes, dataInicio:'2026-01-31', dataFim:'2026-01-31' });
  expect(r.itens.map(i=>i.linha)).toEqual([3]);
 });
 it('não aproxima doses diferentes', async () => {
  const f = file('Codigo;Descricao;NCM;Unidade\nA;Herbicida produto agrícola 500;12345678;LT\nB;Herbicida produto agrícola 600;12345678;LT');
  expect((await service.validar(f,undefined,undefined,opcoes)).itens[0].candidatos_duplicidade).toEqual([]);
 });
 it('rejeita período sem coluna de data', async () => { await expect(service.validar(file('NCM\n12345678'),undefined,undefined,{...OPCOES_PADRAO,dataInicio:'2026-01-01'})).rejects.toThrow('coluna de data'); });
 it('rejeita datas e opções inválidas', () => { expect(()=>lerOpcoes('{"dataInicio":"2026-02-30"}')).toThrow(); expect(()=>lerOpcoes('{"dataInicio":"2026-02-02","dataFim":"2026-01-01"}')).toThrow(); });
 it('mantém NCM obrigatório mesmo com cClassTrib desligado', async () => { await expect(service.validar(file('Codigo;Descricao\nA;Milho'),undefined,undefined,opcoes)).rejects.toThrow('NCM'); });
});
