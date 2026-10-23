import { describe, expect, it } from 'vitest';
import { detectarDuplicidades, normalizar, ItemDup } from './duplicidade';

// Produto + complemento: o nome é o produto (CORANTE ALIMENTÍCIO LÍQUIDO); a cor, o tamanho, o lado, o material... são complementos que fazem OUTRO item.
const item = (descricao: string, unidade = 'UN', extra: Partial<ItemDup> = {}): ItemDup => ({ descricao, unidade, ncm: '', principio: '', barras: '', codigo: '', ...extra });
const FUNDO = ['Arroz agulhinha tipo 1', 'Feijao carioca', 'Oleo de soja refinado', 'Acucar cristal', 'Sal refinado iodado', 'Cafe torrado moido', 'Macarrao espaguete', 'Farinha de trigo especial',
  'Leite integral UHT', 'Detergente neutro', 'Sabao em po', 'Papel higienico folha dupla', 'Cimento CP II', 'Tinta acrilica fosca', 'Parafuso sextavado', 'Lampada LED 9W', 'Pilha alcalina AA',
  'Caderno universitario', 'Mouse optico USB', 'Teclado ABNT2', 'Cadeira escritorio', 'Mesa reuniao', 'Racao bovinos leite', 'Vacina aftosa', 'Semente soja convencional', 'Inseticida lagarta',
  'Adubo NPK 04-14-08', 'Calcario dolomitico', 'Ureia agricola', 'Filtro oleo motor', 'Correia dentada', 'Bota de borracha cano longo', 'Luva de vaqueta', 'Capacete de seguranca aba frontal'].map((d) => item(d));
const detecta = (a: ItemDup, b: ItemDup) => detectarDuplicidades([a, b, ...FUNDO], { exigirPrincipio: false })[0].candidatos.find((c) => c.idx === 1) ?? null;
const d = (a: string, b: string, extra: Partial<ItemDup> = {}) => detecta(item(a, 'UN', extra), item(b, 'UN', extra));

describe('a cor (e os demais complementos) faz outro item, não duplicidade', () => {
  it('o caso dos corantes: mesmo produto, cor diferente', () => {
    const base = 'CORANTE ALIMENTÍCIO LÍQ.CONFEITARIA';
    for (const [x, y] of [['ROSA', 'VERDE'], ['AMARELO', 'AZUL'], ['VINHO', 'BRANCO'], ['PRETO', 'LARANJA']]) expect(d(`${base} ${x}`, `${base} ${y}`), `${x} x ${y}`).toBeNull();
    expect(d(`${base} ROSA`, `${base}  rosa`)?.nivel).toBe('POSSIVEL'); // a mesma cor continua sendo indicação (possível: a descrição é genérica, sem referência nem medida)
  });
  it('o ponto da abreviação não cola a palavra seguinte (LÍQ.CONFEITARIA = LÍQ. CONFEITARIA), mas decimais e siglas ficam como estão', () => {
    const t = normalizar('CORANTE LÍQ.CONFEITARIA ROSA').tokens.map((x) => x.t);
    expect(t).toEqual(['corante', 'liquido', 'confeitaria', 'rosa']);
    expect(d('CORANTE ALIMENTÍCIO LÍQ.CONFEITARIA ROSA', 'CORANTE ALIMENTÍCIO LÍQUIDO CONFEITARIA ROSA')).not.toBeNull(); // antes a palavra colada não casava com "LÍQUIDO CONFEITARIA"
    expect(normalizar('FIO 2.5 MM').medidas.get('compr')).toEqual(new Set(['2.5'])); expect(normalizar('CAMISETA M.L').tokens.map((x) => x.t)).toEqual(['camiseta', 'ml']);
  });
  it('tamanho, posição, condição, material e sabor diferentes são itens diferentes', () => {
    expect(d('COLETE CINZA FAIXA REFLEXIVA P', 'COLETE CINZA FAIXA REFLEXIVA GG')).toBeNull();
    expect(d('COLETE CINZA FAIXA REFLEXIVA GG', 'COLETE CINZA FAIXA REFLEXIVA GG')).not.toBeNull(); // o mesmo tamanho continua sendo indicação
    expect(d('FIXACAO CAVALETE TRASEIRO DIREITO', 'FIXACAO CAVALETE TRASEIRO ESQUERDO')).toBeNull();
    expect(d('ENGATE RAPIDO MACHO 3/4 NPT', 'ENGATE RAPIDO FEMEA 3/4 NPT')).toBeNull();
    expect(d('FILTRO DE AR ORIGINAL AXOR', 'FILTRO DE AR PARALELO AXOR')).toBeNull();
    expect(d('GARFO DE MESA INOX LISO', 'GARFO DE MESA ACO LISO')).toBeNull();
    expect(d('MISTURA PARA BOLO LIMAO', 'MISTURA PARA BOLO CHOCOLATE')).toBeNull();
    expect(d('TINTA ESMALTE VERDE ESCURO 3.6LT', 'TINTA ESMALTE VERDE CLARO 3.6LT')).toBeNull(); // o tom também é complemento
  });
  it('complemento só de um lado: a outra descrição está incompleta, e isso é outro achado', () => {
    expect(d('CABO FLEX 2,5 MM2 BRANCO', 'CABO FLEX 2,5 MM2')).toBeNull();
    expect(d('BOTA PVC PRETA Nº46', 'BOTA PVC Nº46')).toBeNull();
    expect(d('SUPORTE PARA COPO DESCARTAVEL INOX', 'SUPORTE PARA COPO DESCARTAVEL')).toBeNull();
  });
  it('erro de grafia da própria cor ou do lado não esconde duplicidade', () => {
    expect(d('BICO PULVERIZADOR CONE ATRAS 1.5 MARRON', 'BICO PULVERIZADOR CONE ATRAS 1.5 MARROM')).not.toBeNull();
    expect(d('RETENTOR CUBO TRASEIRO HYSTER', 'RETENTOR DO CUBO TRAZEIRO HYSTER')).not.toBeNull();
  });
  it('regra geral: palavras diferentes nos dois lados (fora da lista) também são itens diferentes; palavra só de um lado segue como possível', () => {
    expect(d('PLUG INDUSTRIAL 3P+T 32A 380V', 'TOMADA INDUSTRIAL 3P+T 32A 380V')).toBeNull();
    expect(d('CONEXAO MF 13/16 ORFS RETO', 'CONEXAO FG 13/16 ORFS RETO')).toBeNull();
    expect(d('CAPACETE CINZA PRO SAFETY', 'CAPACETE C/ CARNEIRA CINZA PRO SAFETY')).not.toBeNull(); // só um lado traz "carneira": descrição incompleta
  });
  it('a mesma referência de fabricante e o mesmo código de barras afastam a regra geral e a lista de complementos', () => {
    // marcas diferentes nos dois lados (palavras que sobram em cada um): sem referência em comum são itens diferentes; com a mesma referência é a mesma peça
    expect(d('ANEL VEDACAO ESCAPE MOTOR BROZ 150 HONDA', 'ANEL VEDACAO ESCAPE MOTOR BROZ 150 TITAN')).toBeNull();
    expect(d('ANEL VEDACAO ESCAPE MOTOR BROZ 150 HONDA 18291-MN5-650', 'ANEL VEDACAO ESCAPE MOTOR BROZ 150 TITAN 18291-MN5-650')).not.toBeNull();
    expect(d('CORANTE LIQUIDO ROSA', 'CORANTE LIQUIDO VERDE', { barras: '7891234567895' })).not.toBeNull();
  });
});
