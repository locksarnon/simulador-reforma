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
import { prepararLista, prepararReferencias } from '../classificacao/ncm-classe';
const catalogo = [
  ...Array.from({ length: 120 }, (_, i) => ({ codigo: String(90000000 + i), status: 'Ativo', descricao: 'x' })),
  { codigo: '07133319', status: 'Ativo', descricao: 'Feijão' }, { codigo: '84713012', status: 'Ativo', descricao: 'Notebook' },
  { codigo: '31039011', status: 'Ativo', descricao: 'Adubo fosfatado' },
];
const classes = new Map<string, any>([
  ['000001', { c_class_trib: '000001', descricao_oficial: 'Tributação integral', pct_reducao_ibs: 0, pct_reducao_cbs: 0 }],
  ['200003', { c_class_trib: '200003', descricao_oficial: 'Alimentação humana (Anexo I)', pct_reducao_ibs: 1, pct_reducao_cbs: 1 }],
]);
const linhasMapa = [
  { ncm: '0713.33.19', c_class_trib: '200003', anexo: 'I', item_lei: 1, descricao_produto: 'Feijão' },
  { ncm: '31', c_class_trib: null, anexo: 'IX', item_lei: 2, descricao_produto: 'Fertilizantes (adubos), em conformidade com a legislação específica — Capítulo 31' },
];
const lista = prepararLista(linhasMapa as any);
const referencias = prepararReferencias(linhasMapa as any);
const comBase = new ProdutosService({ ncm: { findMany: async () => catalogo } } as any, { base: async () => ({ lista, classes, referencias }) } as any);
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

describe('SAP Business One', () => {
  it('avisa que NCM curto parece o código interno (OITM.NCMCode) só quando SAP está selecionado', async () => {
    const csv = 'Codigo;Descricao;NCM\nA;Item;4521';
    const sap = await comBase.validar(file(csv), undefined, undefined, { ...opcoesClasse, erps: ['SAP'] });
    expect(sap.itens[0].problemas.map((p) => p.codigo)).toContain('NCM_CHAVE_SAP');
    const outro = await comBase.validar(file(csv), undefined, undefined, { ...opcoesClasse, erps: ['Protheus'] });
    expect(outro.itens[0].problemas.map((p) => p.codigo)).toContain('NCM_FORMATO');
  });
});

describe('NCM em capítulo citado por anexo (referência) e texto sem conclusão indevida', () => {
  it('31039011 (Capítulo 31, Anexo IX item 2): não diz "padrão" nem sugere classe — manda revisar', async () => {
    const r = await comBase.validar(file('Codigo;Descricao;NCM\nF;Superfosfato;31039011'), undefined, undefined, opcoesClasse);
    const it0 = r.itens[0];
    expect(it0.sugestao).toMatchObject({ c_class_trib: null, referencia: true, anexo: 'Anexo IX, item 2' });
    expect(it0.sugestao?.padrao).toBeUndefined();
    expect(it0.problemas.map((p) => p.codigo)).toContain('REFERENCIA_ANEXO');
    expect(r.resumo.tributacao_padrao).toBe(0);
    expect(r.resumo.referencias_anexo).toBe(1);
  });
  it('NCM sem nenhuma referência: "Sem enquadramento nos anexos consultados (padrão)", sem afirmar ausência de benefício', async () => {
    const r = await comBase.validar(file('Codigo;Descricao;NCM\nB;Notebook;84713012'), undefined, undefined, opcoesClasse);
    expect(r.itens[0].sugestao?.confianca).toBe('Sem enquadramento nos anexos consultados (padrão)');
    expect(r.itens[0].sugestao?.padrao).toBe(true);
  });
  it('classe declarada com redução em NCM referenciado não vira "sem amparo": fica como revisão', async () => {
    const f = file('Codigo;Descricao;NCM;cClassTrib\nF;Superfosfato;31039011;200003');
    const r = await comBase.validar(f, undefined, undefined, opcoesClasse);
    expect(r.itens[0].problemas.map((p) => p.codigo)).not.toContain('SEM_AMPARO_NO_ANEXO');
    expect(r.itens[0].problemas.map((p) => p.codigo)).toContain('REFERENCIA_ANEXO');
  });
});

describe('grupos pelo uso do próprio cliente (certeza alta)', () => {
  const linhas = (n: number, grupo: string, ncm = '84713012') => Array.from({ length: n }, (_, i) => `P${grupo}${i};Item ${i};${ncm};${grupo}`).join('\n');
  const opcG = { ...opcoesClasse, grupos: true };
  it('sugere o grupo dominante do mesmo NCM quando há evidência forte (>=3 outros itens e >=90%)', async () => {
    const csv = 'Codigo;Descricao;NCM;Grupo do produto\n' + linhas(10, 'Informatica') + '\nX;Fora do grupo;84713012;Outros\nY;Sem grupo;84713012;';
    const r = await comBase.validar(file(csv), undefined, undefined, opcG);
    const x = r.itens.find((i) => i.codigo === 'X')!; const y = r.itens.find((i) => i.codigo === 'Y')!;
    expect(x).toMatchObject({ grupo_atual: 'Outros', grupo_sugerido: 'Informatica', grupo_flag: 'DIFERENTE' });
    expect(x.grupo_evidencia).toContain('10 de 10');
    expect(y.grupo_evidencia).toContain('10 de 11'); // 90,9%: ainda passa o limiar de 90%
    expect(y).toMatchObject({ grupo_sugerido: 'Informatica', grupo_flag: 'SEM_ATUAL' });
    expect(r.itens.find((i) => i.codigo === 'PInformatica0')).toMatchObject({ grupo_flag: 'IGUAL' });
  });
  it('não sugere com pouca evidência, com grupos misturados ou sem outros itens', async () => {
    const poucos = await comBase.validar(file('Codigo;Descricao;NCM;Grupo do produto\n' + linhas(2, 'A') + '\nZ;Sem grupo;84713012;'), undefined, undefined, opcG);
    expect(poucos.itens.find((i) => i.codigo === 'Z')).toMatchObject({ grupo_sugerido: null, grupo_flag: 'SEM_SUGESTAO' });
    expect(poucos.itens.find((i) => i.codigo === 'Z')?.grupo_evidencia).toContain('insuficiente');
    const mistos = await comBase.validar(file('Codigo;Descricao;NCM;Grupo do produto\n' + linhas(3, 'A') + '\n' + linhas(3, 'B') + '\nZ;Sem grupo;84713012;'), undefined, undefined, opcG);
    expect(mistos.itens.find((i) => i.codigo === 'Z')?.grupo_sugerido).toBeNull();
    const unico = await comBase.validar(file('Codigo;Descricao;NCM;Grupo do produto\nU;Único;84713012;Solo'), undefined, undefined, opcG);
    expect(unico.itens[0]).toMatchObject({ grupo_sugerido: null, grupo_flag: 'SEM_SUGESTAO' });
  });
  it('exige a coluna do grupo de produto: a sugestão usa os grupos que o cliente já tem', async () => {
    await expect(comBase.validar(file('Codigo;Descricao;NCM\nA;x;84713012'), undefined, undefined, opcG)).rejects.toThrow('grupo de produto');
  });
});
