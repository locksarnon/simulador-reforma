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

// Cobertura do cClassTrib sugerido: zero à esquerda perdido em CSV e classe padrão para NCM fora dos anexos.
import { prepararLista } from '../classificacao/ncm-classe';
const catalogo = [
  ...Array.from({ length: 120 }, (_, i) => ({ codigo: String(90000000 + i), status: 'Ativo', descricao: 'x' })),
  { codigo: '07133319', status: 'Ativo', descricao: 'Feijão' }, { codigo: '84713012', status: 'Ativo', descricao: 'Notebook' },
];
const classes = new Map<string, any>([
  ['000001', { c_class_trib: '000001', descricao_oficial: 'Tributação integral', pct_reducao_ibs: 0, pct_reducao_cbs: 0 }],
  ['200003', { c_class_trib: '200003', descricao_oficial: 'Alimentação humana (Anexo I)', pct_reducao_ibs: 1, pct_reducao_cbs: 1 }],
]);
const lista = prepararLista([{ ncm: '0713.33.19', c_class_trib: '200003', anexo: 'I', item_lei: 1, descricao_produto: 'Feijão' }]);
const comBase = new ProdutosService({ ncm: { findMany: async () => catalogo } } as any, { base: async () => ({ lista, classes }) } as any);
const opcoesClasse = { ...OPCOES_PADRAO, cClassTrib: true };

describe('cClassTrib sugerido', () => {
  it('restaura o zero à esquerda do NCM em CSV quando a tabela oficial confirma', async () => {
    const r = await comBase.validar(file('Codigo;Descricao;NCM\nA;Feijão;7133319'), undefined, undefined, opcoesClasse);
    expect(r.itens[0].ncm).toBe('07133319');
    expect(r.itens[0].sugestao?.c_class_trib).toBe('200003');
  });
  it('NCM válido fora dos anexos recebe a classe padrão, marcada como padrão', async () => {
    const r = await comBase.validar(file('Codigo;Descricao;NCM\nB;Notebook;84713012'), undefined, undefined, opcoesClasse);
    expect(r.itens[0].sugestao).toMatchObject({ c_class_trib: '000001', padrao: true });
    expect(r.resumo.tributacao_padrao).toBe(1);
    expect(r.resumo.com_sugestao).toBe(0);
  });
  it('NCM inexistente ou com formato errado nunca recebe sugestão', async () => {
    const r = await comBase.validar(file('Codigo;Descricao;NCM\nC;Inexistente;99999999\nD;Curto;1234'), undefined, undefined, opcoesClasse);
    expect(r.itens.every((i) => !i.sugestao?.c_class_trib)).toBe(true);
  });
});

describe('grupos e conta contábil', () => {
  const csv = 'Codigo;Descricao;NCM;Grupo do produto;Conta contabil\nA;Feijão;07133319;Mercearia;3.1.99\nB;Notebook;84713012;;3.1.02\nC;Inexistente;99999999;X;1';
  it('grupo sugerido vem do tratamento tributário, com flag; sem sugestão não inventa grupo', async () => {
    const r = await comBase.validar(file(csv), undefined, undefined, { ...opcoesClasse, grupos: true });
    expect(r.itens[0]).toMatchObject({ grupo_atual: 'Mercearia', grupo_flag: 'DIFERENTE' });
    expect(r.itens[0].grupo_sugerido).toContain('limentação humana');
    expect(r.itens[1]).toMatchObject({ grupo_sugerido: 'Tributação integral (padrão IBS/CBS)', grupo_flag: 'SEM_ATUAL' });
    expect(r.itens[2]).toMatchObject({ grupo_sugerido: null, grupo_flag: 'SEM_SUGESTAO' });
    expect(r.resumo.grupos?.[0].qtd).toBe(1);
  });
  it('conta sugerida só existe com de-para; sem regra, não inventa', async () => {
    const plano = { nome: 'p.csv', linhas: 2, regras: { '200003': '3.1.01 — Alimentos', '000001': '3.1.02' } };
    const opc = { ...opcoesClasse, gruposContabeis: true };
    const sem = await comBase.validar(file(csv), undefined, undefined, opc);
    expect(sem.itens.every((i) => i.conta_flag === 'SEM_PLANO' && i.conta_sugerida === null)).toBe(true);
    const com = await comBase.validar(file(csv), undefined, undefined, opc, plano);
    expect(com.itens.map((i) => i.conta_flag)).toEqual(['DIFERENTE', 'IGUAL', 'SEM_REGRA']);
    expect(com.itens[0].conta_sugerida).toBe('3.1.01 — Alimentos');
  });
  it('exige a coluna da conta atual na análise contábil', async () => {
    await expect(comBase.validar(file('Codigo;Descricao;NCM\nA;x;07133319'), undefined, undefined, { ...opcoesClasse, gruposContabeis: true })).rejects.toThrow('conta contábil');
  });
});
