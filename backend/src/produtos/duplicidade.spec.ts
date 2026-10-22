import { describe, expect, it } from 'vitest';
import { detectarDuplicidades, fonetica, normalizar, unidadeCanonica, ItemDup } from './duplicidade';

const item = (descricao: string, unidade = 'KG', extra: Partial<ItemDup> = {}): ItemDup => ({ descricao, unidade, ncm: '', principio: '', barras: '', codigo: '', ...extra });
// Cadastro "de fundo" distinto, para que o IDF (raridade das palavras) funcione como num cadastro real.
const FUNDO = ['Arroz agulhinha tipo 1', 'Feijao carioca', 'Oleo de soja refinado', 'Acucar cristal', 'Sal refinado iodado', 'Cafe torrado moido', 'Macarrao espaguete', 'Farinha de trigo especial',
  'Leite integral UHT', 'Detergente neutro', 'Sabao em po', 'Papel higienico folha dupla', 'Cimento CP II', 'Tinta acrilica fosca', 'Parafuso sextavado', 'Cabo flexivel 2,5mm',
  'Lampada LED 9W', 'Pilha alcalina AA', 'Caderno universitario', 'Caneta esferografica azul', 'Mouse optico USB', 'Teclado ABNT2', 'Cadeira escritorio', 'Mesa reuniao',
  'Racao cães adultos', 'Racao bovinos leite', 'Sal mineral bovinos', 'Vacina aftosa', 'Vermifugo bovino injetavel', 'Semente milho hibrido', 'Semente soja convencional', 'Inseticida lagarta',
  'Fungicida ferrugem asiatica', 'Adubo NPK 04-14-08', 'Calcario dolomitico', 'Cloreto de potassio', 'Ureia agricola', 'Trator pneu traseiro', 'Filtro oleo motor', 'Correia dentada'].map((d) => item(d, 'UN'));

const detecta = (a: ItemDup, b: ItemDup, opc = { exigirPrincipio: false }) => {
  const r = detectarDuplicidades([a, b, ...FUNDO], opc);
  return r[0].candidatos.find((c) => c.idx === 1) ?? null;
};

describe('normalização', () => {
  it('converte medidas equivalentes e embalagens', () => {
    expect(normalizar('Oleo 0,9 L').medidas.get('volume')).toEqual(new Set(['900']));
    expect(normalizar('Oleo 900 ml').medidas.get('volume')).toEqual(new Set(['900']));
    expect(normalizar('Arroz 1 kg').medidas.get('massa')).toEqual(new Set(['1000']));
    expect(normalizar('Arroz 1000g').medidas.get('massa')).toEqual(new Set(['1000']));
    expect(normalizar('Herbicida 500 g/L').medidas.get('conc')).toEqual(normalizar('Herbicida 500mg/ml').medidas.get('conc'));
    expect(normalizar('Refri 12x350ml').medidas.get('pack')).toEqual(new Set(['12']));
  });
  it('trata códigos de variedade como códigos, não como palavras', () => {
    expect([...normalizar('Milho 30F35 PRO3').codigos]).toEqual(['30f35', 'pro3'].filter((c) => /\d/.test(c)));
  });
  it('unidades e fonética', () => {
    expect(unidadeCanonica('KGS')).toBe('kg'); expect(unidadeCanonica('Lt')).toBe('l'); expect(unidadeCanonica('PÇ')).toBe('un');
    expect(fonetica('glifozato')).toBe(fonetica('glifosato'));
  });
});

describe('duplicados: o que DEVE ser encontrado', () => {
  it('descrição idêntica, em outra ordem, com acento/caixa/pontuação diferentes', () => {
    const r = detecta(item('Fertilizante Superfosfato Simples 50kg'), item('SUPERFOSFATO SIMPLES, FERTILIZANTE - 50 KG'));
    expect(r?.nivel).toBe('EXATA');
  });
  it('abreviações de mercado e palavra de embalagem a mais', () => {
    const r = detecta(item('Fertilizante Superfosfato Simples 50kg'), item('Fert. Superfosfato Simples Saco 50 Kg'));
    expect(r && r.nivel !== 'POSSIVEL').toBe(true);
    expect(r?.motivos.join(' ')).toContain('abreviação');
  });
  it('nome truncado e unidade por extenso', () => {
    const r = detecta(item('Herbicida Roundup Original 5L', 'LT'), item('HERBIC. ROUNDUP ORIG. 5 LITROS', 'L'));
    expect(r).not.toBeNull();
    expect(r!.nivel).not.toBe('POSSIVEL');
    expect(r!.motivos.join(' ')).toMatch(/truncado|abreviação/);
  });
  it('grafia errada', () => {
    const r = detecta(item('Glifosato Atanor 480 SL 20L', 'L'), item('Glifosto Atanor 480 SL 20 L', 'L'));
    expect(r).not.toBeNull();
    expect(r!.motivos.join(' ')).toContain('grafia próxima');
  });
  it('medida equivalente em unidade diferente (0,9 L = 900 ml)', () => {
    const r = detecta(item('Oleo de soja refinado 0,9 L', 'L'), item('Óleo soja refinado 900 ml', 'ML'));
    expect(r?.nivel).toBeDefined();
    expect(r!.motivos.join(' ')).toContain('equivalentes');
  });
  it('mesmo código de barras sinaliza mesmo com descrição diferente', () => {
    const r = detecta(item('Cafe Pilao tradicional 500g', 'UN', { barras: '7896089012345' }), item('PILAO CAFE TRAD. 500G', 'UN', { barras: '7896089012345' }));
    expect(r).not.toBeNull();
    expect(r!.motivos.join(' ')).toContain('código de barras');
  });
});

describe('duplicados: o que NÃO pode ser confundido', () => {
  it.each([
    ['dose diferente', item('Herbicida Glifosato 480 g/L 20L', 'L'), item('Herbicida Glifosato 360 g/L 20L', 'L')],
    ['volume diferente', item('Herbicida Roundup Original 5L', 'L'), item('Herbicida Roundup Original 1L', 'L')],
    ['variedade/código diferente', item('Semente Milho Hibrido 30F35', 'SC'), item('Semente Milho Hibrido 30F53', 'SC')],
    ['tipo/número diferente', item('Arroz Agulhinha Tipo 1 5kg'), item('Arroz Agulhinha Tipo 2 5kg')],
    ['unidade de grandeza diferente', item('Prego 18x27', 'KG'), item('Prego 18x27', 'UN')],
    ['produtos diferentes que dividem palavras', item('Fertilizante Superfosfato Simples 50kg'), item('Fertilizante Cloreto de Potassio 50kg')],
    ['peso diferente', item('Fertilizante Ureia Agricola 50kg'), item('Fertilizante Ureia Agricola 25kg')],
  ])('%s', (_n, a, b) => { expect(detecta(a, b)).toBeNull(); });

  it('princípio ativo diferente veta quando a opção está ligada', () => {
    const a = item('Herbicida Total 20L', 'L', { principio: 'Glifosato 480' }); const b = item('Herbicida Total 20L', 'L', { principio: '2,4-D 806' });
    expect(detecta(a, b, { exigirPrincipio: true })).toBeNull();
    expect(detecta(a, b, { exigirPrincipio: false })?.nivel).toBe('EXATA');
  });
  it('palavras curtas parecidas não viram erro de grafia (soja x sora)', () => {
    expect(detecta(item('Farelo de soja 50kg'), item('Farelo de sora 50kg'))).toBeNull();
  });
});

describe('grupos de duplicados e cadastro mestre', () => {
  it('agrupa variantes e sugere o cadastro mais completo como mestre', () => {
    const itens = [
      item('Fert. Superfosfato Simples 50kg', 'KG'),
      item('Fertilizante Superfosfato Simples Saco 50 Kg', 'KG', { codigo: 'F-100', ncm: '31031100', barras: '' }),
      item('FERTILIZANTE SUPERFOSFATO SIMPLES 50KG', 'KG', { codigo: 'F-200' }),
      ...FUNDO,
    ];
    const r = detectarDuplicidades(itens, { exigirPrincipio: false });
    expect(r[0].grupo).not.toBeNull();
    expect(new Set([r[0].grupo, r[1].grupo, r[2].grupo]).size).toBe(1);
    expect(r[0].mestre).toBe(1); // o com código e NCM
    expect(r[3].grupo).toBeNull(); // itens de fundo não entram em grupo
  });
  it('desempenho: 3 mil itens em poucos segundos', () => {
    const marcas = ['alfa', 'beta', 'gama', 'delta', 'omega', 'sigma', 'tauro', 'zenit', 'nobre', 'forte'];
    const itens = Array.from({ length: 3000 }, (_, i) => item(`Produto ${marcas[i % 10]} modelo ${i} linha ${marcas[(i * 7) % 10]}`, 'UN'));
    const t0 = Date.now();
    detectarDuplicidades(itens, { exigirPrincipio: false });
    expect(Date.now() - t0).toBeLessThan(15000);
  });
});

describe('peças e manutenção (referência no nome, descrições curtas)', () => {
  const un = (d: string, g = 'PEÇAS') => item(d, 'UNIDADE', { grupo: g });
  it('referência diferente veta, mesmo com o nome igual', () => {
    expect(detecta(un('ANEL TRAVA  1440478X1'), un('ANEL TRAVA 2801154M1'))).toBeNull();
    expect(detecta(un('CORREIA A-72'), un('CORREIA B74'))).toBeNull();
    expect(detecta(un('ARRUELA A90671'), un('ARRUELA 1.1/8'))).toBeNull();
  });
  it('mesma referência com formatação diferente é o mesmo item', () => {
    expect(detecta(un('GUIA CORRENTE 80364194'), un('GUIA DA CORRENTE 8036-4194'))?.nivel).toBe('EXATA');
    expect(detecta(un('FILTRO AR CONDICIONADO G (11186)'), un('FILTRO AR CONDICIONADO G 11186'))?.nivel).toBe('EXATA');
  });
  it('dimensões em outra ordem de palavras', () => {
    expect(detecta(un('PNEU 1000X20 - BORRACHUDO'), un('PNEU BORRACHUDO 1000X20'))?.nivel).toBe('EXATA');
    expect(detecta(un('ABRACADEIRA NYLON 4X200MM'), un('ABRACADEIRA NYLON 20X4MM'))).toBeNull();
  });
  it('descrição genérica idêntica não prova duplicidade', () => {
    const r = detecta(un('RETENTOR'), un('RETENTOR'));
    expect(r?.nivel).toBe('POSSIVEL');
    expect(r?.motivos.join(' ')).toContain('genérica');
  });
  it('genérico x específico não é duplicidade', () => { expect(detecta(un('ANEL DE PRESSAO L219493'), un('ANEL DE PRESSAO'))).toBeNull(); });
  it('gênero (bezerra x bezerro) não é erro de grafia', () => { expect(detecta(item('BEZERRA ATE 12 MESES', 'CABECA'), item('BEZERRO ATE 12 MESES', 'CABECA'))).toBeNull(); });
  it('variante em letra solta (M.L x M.C) são itens diferentes', () => { expect(detecta(un('CAMISETE TRIC. 1426 M.L GG'), un('CAMISETE TRIC. 1426 M.C GG'))).toBeNull(); });
  it('mesmo item em grupos diferentes continua idêntico e avisa o grupo', () => {
    const r = detecta(un('ROLAMENTO C1VV1215A', 'ANEIS/ROLAMENTOS'), un('ROLAMENTO C1VV1215A', 'MANUTENCAO'));
    expect(r?.nivel).toBe('EXATA');
    expect(r?.motivos.join(' ')).toContain('grupos de itens diferentes');
  });
});
