import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { CAMPOS, lerSaldo, ProdutosService } from './produtos.service';
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

describe('comparativo de duplicidade', () => {
  it('encontra abreviação, grafia errada e ordem diferente, com nota, motivos, grupo e mestre; não funde doses diferentes', async () => {
    const f = file([
      'Codigo;Descricao;NCM;Unidade;EAN',
      'A;Fertilizante Superfosfato Simples 50kg;31031100;KG;',
      'B;Fert. Superfosfato Simples Saco 50 Kg;31031100;KG;',
      'C;SUPERFOSFATO SIMPLES FERTILIZANTE 50 KG;31031100;KG;',
      'D;Herbicida Glifosato 480 g/L 20L;38089329;L;',
      'E;Herbicida Glifosto 480 g/L 20 L;38089329;L;',
      'F;Herbicida Glifosato 360 g/L 20L;38089329;L;',
      'G;Arroz agulhinha tipo 1 5kg;10063021;KG;',
    ].join('\n'));
    const r = await service.validar(f, undefined, undefined, opcoes);
    const [a, b, c, d, e, ff, g2] = r.itens;
    expect(a.candidatos_duplicidade).toEqual(expect.arrayContaining([3, 4]));
    expect(a.duplicidade?.grupo).not.toBeNull();
    expect(a.duplicidade?.candidatos.every((x) => x.motivos.length > 0)).toBe(true);
    expect(new Set([a.duplicidade?.grupo, b.duplicidade?.grupo, c.duplicidade?.grupo]).size).toBe(1);
    expect(d.candidatos_duplicidade).toContain(6);
    expect(d.candidatos_duplicidade).not.toContain(7);
    expect(ff.candidatos_duplicidade).toEqual([]);
    expect(g2.duplicidade).toBeNull();
    expect(a.problemas.some((p) => /DUPLICIDADE/.test(p.codigo))).toBe(true);
  });
});

describe('saldo em estoque (coluna opcional, usada para sugerir qual duplicado fica)', () => {
  const xlsx = async (linhas: unknown[][]) => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Itens');
    linhas.forEach((l) => ws.addRow(l));
    return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), originalname: 'itens.xlsx' } as Express.Multer.File;
  };
  const cabecalho = ['Código', 'Descrição', 'NCM'];

  it('lê o saldo de uma célula: pt-BR, americano, inteiro e sinal; o resto vira null', () => {
    const casos: [string, number | null][] = [
      ['0', 0], ['3', 3], ['1500000', 1500000], ['0.5', 0.5], ['0.500', 0.5], ['1234.56', 1234.56], ['1234,56', 1234.56], ['0,5', 0.5],
      ['1.234,56', 1234.56], ['12.345,6', 12345.6], ['1.234.567', 1234567], ['1.234', 1234], ['1,234', 1.234], ['1,234,567', 1234567], ['1,234.56', 1234.56],
      ['-5', -5], ['+5', 5], ['-0', 0], ['1.5E6', 1500000], ['  7  ', 7],
      ['', null], ['   ', null], ['Y', null], ['N', null], ['ABC', null], ['12 345', null], ['10-', null], ['1.234,5,6', null], ['1..2', null], ['--', null], ['1e999', null],
    ];
    for (const [texto, esperado] of casos) expect([texto, lerSaldo(texto)]).toEqual([texto, esperado]);
    expect(lerSaldo(undefined as unknown as string)).toBeNull();
  });
  it('em coluna numérica de XLSX o ponto é sempre decimal; em texto, "1.234" é milhar', () => {
    expect(lerSaldo('1.234', true)).toBe(1.234);
    expect(lerSaldo('1.234', false)).toBe(1234);
    expect(lerSaldo('12.345', true)).toBe(12.345);
    expect(lerSaldo('1.234,5', true)).toBe(1234.5); // texto com vírgula numa coluna mista segue o costume brasileiro
  });

  it('lê o saldo da coluna "Quantidade em Estoque", sem escalar nem arredondar', async () => {
    const f = file('Codigo;Descricao;NCM;Unidade;Quantidade em Estoque\nA;Item A;12345678;UN;1.234,56\nB;Item B;12345678;UN;\nC;Item C;12345678;UN;abc\nD;Item D;12345678;UN;0\nE;Item E;12345678;UN;1500000\nF;Item F;12345678;UN;-3');
    const r = await service.validar(f, undefined, undefined, opcoes);
    expect(r.mapeamento.saldo).toBe(4);
    expect(r.itens.map((i) => i.saldo)).toEqual([1234.56, null, null, 0, 1500000, -3]);
  });
  it('sem a coluna, o saldo é null em todos os itens', async () => {
    const r = await service.validar(file('Codigo;Descricao;NCM;Unidade\nA;Item A;12345678;UN'), undefined, undefined, opcoes);
    expect(r.mapeamento.saldo).toBeNull();
    expect(r.itens[0].saldo).toBeNull();
  });
  it('XLSX: número de verdade vale como está (sem escala); texto segue o costume brasileiro', async () => {
    const numerica = await xlsx([
      ['Codigo', 'Descricao', 'NCM', 'Unidade', 'Quantidade em Estoque'],
      ['A', 'Item A', '12345678', 'UN', 1500000], ['B', 'Item B', '12345678', 'UN', 1234.567], ['C', 'Item C', '12345678', 'UN', 0],
      ['D', 'Item D', '12345678', 'UN', '1.234,5'], ['E', 'Item E', '12345678', 'UN', 'Y'], ['F', 'Item F', '12345678', 'UN', null], ['G', 'Item G', '12345678', 'UN', 1.234],
    ]);
    expect((await service.validar(numerica, undefined, undefined, opcoes)).itens.map((i) => i.saldo)).toEqual([1500000, 1234.567, 0, 1234.5, null, null, 1.234]);
    const texto = await xlsx([['Codigo', 'Descricao', 'NCM', 'Unidade', 'Quantidade em Estoque'], ['A', 'Item A', '12345678', 'UN', '1.234'], ['B', 'Item B', '12345678', 'UN', '12,5']]);
    expect((await service.validar(texto, undefined, undefined, opcoes)).itens.map((i) => i.saldo)).toEqual([1234, 12.5]);
  });

  it('não confunde unidade de medida de estoque, estoque mínimo ou máximo com o saldo', async () => {
    const m = service.detectarMapeamento([...cabecalho, 'Unidade de Medida de Estoque', 'Estoque Mínimo', 'Estoque Máximo', 'Quantidade em Estoque']);
    expect(m).toMatchObject({ unidade: 3, saldo: 6 });
    const sem = service.detectarMapeamento([...cabecalho, 'Unidade de Medida de Estoque', 'Estoque Mínimo', 'Estoque Máximo', 'Estoque de Segurança', 'Saldo Mínimo', 'Lead time estoque']);
    expect(sem.unidade).toBe(3); expect(sem.saldo).toBeNull();
    const r = await service.validar(file('Codigo;Descricao;NCM;Unidade de Medida de Estoque;Estoque Minimo\nA;Item;12345678;UN;5'), undefined, undefined, opcoes);
    expect(r.mapeamento).toMatchObject({ unidade: 3, saldo: null });
    expect(r.itens[0]).toMatchObject({ unidade: 'UN', saldo: null });
  });
  it('reconhece os nomes de coluna de saldo mais comuns, só pelo nome exato', () => {
    for (const nome of ['Quantidade em Estoque', 'Qtd. em Estoque', 'Qtde em estoque', 'Saldo em Estoque', 'Saldo Estoque', 'Saldo', 'Estoque Atual', 'Estoque', 'Em Estoque', 'Quantidade em Estoque Total', 'OnHand']) {
      expect([nome, service.detectarMapeamento([...cabecalho, nome]).saldo]).toEqual([nome, 3]);
    }
  });
  it('mapeamento manual: a coluna escolhida vale, "não tenho" desliga e o mapeamento salvo antes do campo existir ainda detecta', async () => {
    const csv = 'Codigo;Descricao;NCM;Unidade;Qtd atual;Quantidade em Estoque\nA;Item A;12345678;UN;7;9';
    const todos = Object.fromEntries(CAMPOS.map((c) => [c, null])); const base = { codigo: 0, descricao: 1, ncm: 2, unidade: 3 };
    expect((await service.validar(file(csv), { ...todos, ...base, saldo: 4 }, undefined, opcoes)).itens[0].saldo).toBe(7);
    expect((await service.validar(file(csv), { ...todos, ...base, saldo: null }, undefined, opcoes)).itens[0].saldo).toBeNull();
    const { saldo: _fora, ...antigo } = { ...todos, ...base };
    expect((await service.validar(file(csv), antigo as any, undefined, opcoes)).itens[0].saldo).toBe(9);
  });
  it('a tela de colunas ganha o campo opcional, já mapeado quando a planilha traz o saldo', async () => {
    const p = await service.previa(file('Codigo;Descricao;NCM;Quantidade em Estoque\nA;x;12345678;5'));
    expect(p.campos.find((c) => c.campo === 'saldo')).toMatchObject({ obrigatorio: false });
    expect(p.mapeamento.saldo).toBe(3);
  });
});
