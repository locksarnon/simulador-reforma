import { describe, expect, it } from 'vitest';
import type { ContextoAnalise, ItemTrabalho } from '../tipos';
import { AnalisadorDuplicidade, AnalisadorGrupos, AnalisadorIdentificacao, AnalisadorNcm, AnalisadorNomesUnidades, AnalisadorQualidade, camadasAfetadas, executarMotor, type ContextoMotor, type TabelaNcm } from './index';

let n = 0;
const item = (codigo: string, descricao: string, extra: Partial<ItemTrabalho> = {}): ItemTrabalho => ({
  id: `i${++n}`, codigo, estabelecimento: null, descricao, unidade: 'UN', ncm: null, grupo: null, ativo: true, saldo: null, ultimaMovimentacao: null,
  fabricante: null, referencia: null, finalidade: null, campos: {}, ...extra,
});
const ctx: ContextoAnalise = { dataBase: '2026-11-25', atividades: [], erp: null, corteMovimentacao: null };
const tipos = (r: { casos: { tipo: string }[] }) => r.casos.map((c) => c.tipo);

/** Cadastro "de fundo", para o IDF (raridade das palavras) funcionar como num cadastro real. */
const FUNDO = ['Arroz agulhinha tipo 1', 'Feijao carioca', 'Oleo de soja refinado', 'Acucar cristal', 'Sal refinado iodado', 'Cafe torrado moido', 'Macarrao espaguete', 'Farinha de trigo especial',
  'Leite integral UHT', 'Detergente neutro', 'Sabao em po', 'Papel higienico folha dupla', 'Cimento CP II', 'Tinta acrilica fosca', 'Parafuso sextavado', 'Cabo flexivel 2,5mm',
  'Lampada LED 9W', 'Pilha alcalina AA', 'Caderno universitario', 'Caneta esferografica azul', 'Mouse optico USB', 'Teclado ABNT2', 'Cadeira escritorio', 'Mesa reuniao',
  'Racao caes adultos', 'Racao bovinos leite', 'Sal mineral bovinos', 'Vacina aftosa', 'Vermifugo bovino injetavel', 'Semente milho hibrido', 'Semente soja convencional', 'Inseticida lagarta',
  'Fungicida ferrugem asiatica', 'Calcario dolomitico', 'Cloreto de potassio', 'Ureia agricola', 'Trator pneu traseiro', 'Filtro oleo motor', 'Correia dentada'];
const fundo = () => FUNDO.map((d, i) => item(`F${i}`, d.toUpperCase()));

describe('IDENTIFICACAO', () => {
  const r = new AnalisadorIdentificacao().analisar([
    item('', 'ITEM SEM CODIGO LONGO'), item(' A1 ', 'PARAFUSO 10MM'), item('X1', 'ANEL 5MM'), item('X1', 'ANEL 6MM'),
    item('001', 'BUCHA 8MM'), item('1', 'BUCHA 8MM'), item('007', 'CABO 2MM', { estabelecimento: 'M' }), item('007', 'TUBO PVC 20MM', { estabelecimento: 'F' }),
    item('N1', 'LUVA', { campos: { codigoAntigo: 'A1' } }), item('Z', 'SEM ESTAB', { estabelecimento: null }),
  ], { ...ctx, parametros: { exigeEstabelecimento: true } } as ContextoMotor);
  it('detecta ausente, formato, repetido, zeros à esquerda, descrições divergentes, código antigo e estabelecimento', () => {
    const t = tipos(r);
    for (const x of ['CODIGO_AUSENTE', 'CODIGO_FORMATO', 'CODIGO_REPETIDO', 'CODIGO_ZEROS_ESQUERDA', 'CODIGO_DESCRICOES_DIVERGENTES', 'ESTABELECIMENTO_AUSENTE']) expect(t, x).toContain(x);
    expect(t.some((x) => x.startsWith('CODIGO_ANTIGO'))).toBe(true);
  });
  it('o código repetido vale por estabelecimento: 007 em M e F não é repetido', () => {
    expect(r.casos.filter((c) => c.tipo === 'CODIGO_REPETIDO')).toHaveLength(1);
  });
  it('todo caso diz a origem e a providência', () => {
    for (const c of r.casos) { expect(c.evidencia.some((e) => e.rotulo === 'Origem')).toBe(true); expect(c.justificativa).toContain('Providência:'); }
  });
});

describe('QUALIDADE', () => {
  const itens = [
    item('1', ''), item('2', 'LUVA'), item('3', 'OLEO LUBRIFICANTE 5L', { unidade: 'KG' }), item('4', 'ADUBO NPK', { unidade: null }),
    item('5', 'PARAFUSO SEXTAVADO 10MM', { ultimaMovimentacao: '2025-01-31' }), item('6', 'PARAFUSO SEXTAVADO 12MM', { ultimaMovimentacao: '31/01/2025' }),
    item('7', 'PARAFUSO SEXTAVADO 14MM'), item('8', 'ARRUELA LISA 10MM', { ativo: false, saldo: 3 }), item('9', 'ARRUELA LISA 12MM', { saldo: -2, ultimaMovimentacao: '2027-01-01' }),
    item('10', 'PORCA SEXTAVADA 10MM', { fabricante: null }),
  ];
  const r = new AnalisadorQualidade().analisar(itens, { ...ctx, parametros: { camposObrigatorios: ['fabricante'] } } as ContextoMotor);
  it('cobre descrição, unidade, formato de data, saldo, inativo com uso, sem data e campo obrigatório', () => {
    const t = tipos(r);
    for (const x of ['DESCRICAO_INSUFICIENTE', 'UNIDADE_AUSENTE', 'UNIDADE_INCOMPATIVEL', 'DATA_MOVIMENTACAO_INVALIDA', 'SALDO_NEGATIVO', 'ITEM_INATIVO_COM_USO', 'SEM_DATA_MOVIMENTACAO', 'CAMPO_OBRIGATORIO_VAZIO']) expect(t, x).toContain(x);
  });
  it('base sem data nem saldo: semDados diz o que não foi verificado', () => {
    const s = new AnalisadorQualidade().analisar([item('a', 'PARAFUSO SEXTAVADO 10MM'), item('b', 'PARAFUSO SEXTAVADO 12MM')], ctx);
    expect(s.semDados?.motivo).toContain('data de movimentação'); expect(s.semDados?.motivo).toContain('saldo'); expect(s.semDados?.itens).toBe(2);
  });
  it('base sem nenhuma data de movimentação não gera 1 caso por item', () => {
    const s = new AnalisadorQualidade().analisar([item('a', 'PARAFUSO SEXTAVADO 10MM'), item('b', 'PARAFUSO SEXTAVADO 12MM')], ctx);
    expect(tipos(s)).not.toContain('SEM_DATA_MOVIMENTACAO'); expect(s.semProblema).toHaveLength(2);
  });
  it('parâmetro ANTERIOR_AO_CORTE tira o item sem data do alerta', () => {
    const s = new AnalisadorQualidade().analisar(itens, { ...ctx, parametros: { semDataMovimentacao: 'ANTERIOR_AO_CORTE' } } as ContextoMotor);
    expect(tipos(s)).not.toContain('SEM_DATA_MOVIMENTACAO');
  });
});

describe('DUPLICIDADE', () => {
  it('descrições iguais com códigos diferentes: consolidação sugere quem fica pelo saldo, e marca o impacto do saldo', () => {
    const a = item('A', 'FERTILIZANTE SUPERFOSFATO SIMPLES SACO 50 KG', { unidade: 'KG', saldo: 10, ultimaMovimentacao: '2026-10-01' });
    const b = item('B', 'Fert. Superfosfato Simples saco 50kg', { unidade: 'KG', saldo: 300, ultimaMovimentacao: '2026-11-01' });
    const r = new AnalisadorDuplicidade().analisar([a, b, ...fundo()], ctx);
    const caso = r.casos.find((c) => c.itens.includes(a.id) && c.itens.includes(b.id))!;
    expect(caso).toBeTruthy();
    expect(caso.tipo).toBe('DUPLICIDADE_COM_SALDO');
    expect(caso.proposta.decisao).toBe('PROPOR_CONSOLIDACAO'); expect(caso.proposta.manter).toBe('B'); expect(caso.proposta.consolidar).toBe('A');
    expect(caso.impactos.join(' ')).toContain('Saldo a transferir'); expect(caso.afeta).toContain('OBRIGACOES');
    expect(caso.evidencia.some((e) => e.rotulo === 'Critério')).toBe(true);
    expect(caso.evidencia.some((e) => e.rotulo.includes('não é probabilidade'))).toBe(true);
  });
  it('item inativo (por decisão ou na base) não é sugerido como o que fica quando há alternativa ativa', () => {
    const a = item('A', 'FERTILIZANTE SUPERFOSFATO SIMPLES SACO 50 KG', { unidade: 'KG', saldo: 10, ultimaMovimentacao: '2026-10-01' });
    const b = item('B', 'Fert. Superfosfato Simples saco 50kg', { unidade: 'KG', saldo: 300, ultimaMovimentacao: '2026-11-01', ativo: false });
    const caso = new AnalisadorDuplicidade().analisar([a, b, ...fundo()], ctx).casos.find((c) => c.itens.includes(a.id) && c.itens.includes(b.id))!;
    expect(caso.proposta.manter).toBe('A');
    expect(caso.proposta.consolidar).toBe('B');
    expect(caso.evidencia.find((e) => e.rotulo === 'Sugestão de qual fica')?.valor).toContain('item ativo');
    // Todos inativos: volta aos critérios de sempre (maior saldo).
    const a2 = { ...a, ativo: false }; const b2 = { ...b };
    const todos = new AnalisadorDuplicidade().analisar([a2, b2, ...fundo()], ctx).casos.find((c) => c.itens.includes(a2.id) && c.itens.includes(b2.id))!;
    expect(todos.proposta.manter).toBe('B');
  });
  it('sem saldo nem movimentação nos que saem: consolidação simples', () => {
    const r = new AnalisadorDuplicidade().analisar([item('A', 'FERTILIZANTE SUPERFOSFATO SIMPLES SACO 50 KG', { unidade: 'KG', saldo: 0, ultimaMovimentacao: '2020-01-01' }), item('B', 'Fert. Superfosfato Simples saco 50kg', { unidade: 'KG', saldo: 5, ultimaMovimentacao: '2020-01-01' }), ...fundo()], { ...ctx, corteMovimentacao: '2025-01-01' });
    expect(r.casos[0].tipo).toBe('DUPLICIDADE_EXATA'); expect(r.casos[0].proposta.tratamentoDoSaldo).toContain('sem saldo');
  });
  it('dado ausente é desconhecido: sem saldo e sem data nos que saem não propõe consolidação nem inativação', () => {
    const mk = () => [item('A', 'FERTILIZANTE SUPERFOSFATO SIMPLES SACO 50 KG', { unidade: 'KG', saldo: 9, ultimaMovimentacao: '2020-01-01' }), item('B', 'Fert. Superfosfato Simples saco 50kg', { unidade: 'KG' }), ...fundo()];
    const r = new AnalisadorDuplicidade().analisar(mk(), ctx);
    expect(r.casos[0].proposta.decisao).toBe('SOLICITAR_INFORMACAO'); expect(String(r.casos[0].proposta.tratamentoDoSaldo)).toContain('desconhecidos');
    const s = new AnalisadorDuplicidade().analisar(mk(), { ...ctx, parametros: { semDataMovimentacao: 'ANTERIOR_AO_CORTE' } } as ContextoMotor);
    expect(s.casos[0].proposta.decisao).toBe('PROPOR_CONSOLIDACAO');
  });
  it('sem nenhum saldo nem data na base: semDados explica; sem descrição utilizável também', () => {
    const r = new AnalisadorDuplicidade().analisar([item('A', 'FERTILIZANTE SUPERFOSFATO'), ...fundo()], ctx);
    expect(r.semDados?.motivo).toContain('nenhum saldo nem data'); expect(r.semDados?.itens).toBe(40);
    expect(new AnalisadorDuplicidade().analisar([item('A', ''), item('B', '')], ctx).semDados?.motivo).toContain('nenhuma descrição');
  });
  it('parâmetro paralelosNoMesmoCodigo: o padrão mantém original e paralelo distintos; ligado, a condição não separa', () => {
    const mk = () => [item('P1', 'FILTRO AR ORIGINAL 300MM', { unidade: 'UN', saldo: 0, ultimaMovimentacao: '2020-01-01' }), item('P2', 'FILTRO AR PARALELO 300MM', { unidade: 'UN', saldo: 0, ultimaMovimentacao: '2020-01-01' }), ...fundo()];
    const padrao = new AnalisadorDuplicidade().analisar(mk(), ctx);
    expect(padrao.casos.find((c) => c.itens.length === 2 && String(c.atual.codigos).includes('P1'))).toBeUndefined();
    const ligado = new AnalisadorDuplicidade().analisar(mk(), { ...ctx, parametros: { paralelosNoMesmoCodigo: true } } as ContextoMotor);
    expect(ligado.casos.find((c) => String(c.atual.codigos).includes('P1'))).toBeTruthy();
  });
  it('mesmo código em dois estabelecimentos é um produto só, não duplicidade', () => {
    const r = new AnalisadorDuplicidade().analisar([item('A', 'FERTILIZANTE SUPERFOSFATO SIMPLES 50 KG', { unidade: 'KG', estabelecimento: 'M' }), item('A', 'FERTILIZANTE SUPERFOSFATO SIMPLES 50 KG', { unidade: 'KG', estabelecimento: 'F' }), ...fundo()], ctx);
    expect(r.casos).toHaveLength(0);
  });
  it('referência igual com fabricantes diferentes NÃO prova equivalência: pede informação', () => {
    const r = new AnalisadorDuplicidade().analisar([
      item('R1', 'ROLAMENTO RIGIDO ESFERAS', { referencia: '6203DU', fabricante: 'NSK', unidade: 'UN' }), item('R2', 'MANCAL CONICO ACO', { referencia: '6203-DU', fabricante: 'SKF', unidade: 'UN' }), ...fundo()], ctx);
    const c = r.casos.find((x) => x.tipo === 'REFERENCIA_FABRICANTES_DIFERENTES')!;
    expect(c.proposta.decisao).toBe('SOLICITAR_INFORMACAO'); expect(c.justificativa).toContain('NÃO prova');
  });
  it('original x paralelo com a mesma referência e fabricante não são consolidados', () => {
    const r = new AnalisadorDuplicidade().analisar([
      item('P1', 'FILTRO AR ORIGINAL', { referencia: 'AF2345', fabricante: 'CNH', unidade: 'UN' }), item('P2', 'ELEMENTO FILTRANTE PARALELO', { referencia: 'AF2345', fabricante: 'CNH', unidade: 'UN' }), ...fundo()], ctx);
    expect(r.casos.map((c) => c.proposta.decisao)).not.toContain('PROPOR_CONSOLIDACAO');
  });
  it('mesmo produto em embalagens diferentes: relaciona apresentações com fator, sem fundir', () => {
    const r = new AnalisadorDuplicidade().analisar([item('G1', 'HERBICIDA GLIFOSATO 480 G/L GALAO 5 L', { unidade: 'UN' }), item('G2', 'HERBICIDA GLIFOSATO 480 G/L GALAO 20 L', { unidade: 'UN' }), ...fundo()], ctx);
    const c = r.casos.find((x) => x.tipo === 'APRESENTACOES_DISTINTAS')!;
    expect(c.proposta.decisao).toBe('RELACIONAR_APRESENTACOES'); expect(c.proposta.fatorConversao).toBe(4);
  });
  it('concentração diferente é atributo conflitante: manter distintos', () => {
    const r = new AnalisadorDuplicidade().analisar([item('C1', 'HERBICIDA GLIFOSATO 480 G/L', { unidade: 'L' }), item('C2', 'HERBICIDA GLIFOSATO 360 G/L', { unidade: 'L' }), ...fundo()], ctx);
    expect(r.casos.find((x) => x.tipo === 'ATRIBUTOS_CONFLITANTES')!.proposta.decisao).toBe('MANTER_DISTINTOS');
  });
});

describe('GRUPOS', () => {
  const g = (grupo: string, desc: string, k: number) => Array.from({ length: k }, (_, i) => item(`${grupo.slice(0, 2)}${desc.slice(0, 3)}${i}`, `${desc} MODELO${i}`, { grupo }));
  const base = [...g('PECAS', 'ROLAMENTO', 12), ...g('PECAS', 'CORREIA', 8), ...g('Insumos', 'FUNGICIDA', 12), ...g('INSUMOS', 'HERBICIDA', 10), ...g('DIVERSOS', 'MANGUEIRA', 14)];
  const deslocado = item('D1', 'ROLAMENTO ESPECIAL', { grupo: 'INSUMOS' }); const sem = item('S1', 'CORREIA DENTADA', { grupo: null }); const semNovo = g('', 'ESCADA', 0);
  const r = new AnalisadorGrupos().analisar([...base, deslocado, sem, ...semNovo], ctx);
  it('padroniza nomes, aponta genérico com subgrupos, item deslocado e item sem grupo, sem mover nada', () => {
    const t = tipos(r);
    expect(t).toContain('GRUPO_NOME_VARIANTE'); expect(t).toContain('GRUPO_GENERICO');
    expect(r.casos.find((c) => c.tipo === 'ITEM_DESLOCADO')!.proposta.grupo).toBe('PECAS');
    expect(r.casos.find((c) => c.tipo === 'ITEM_SEM_GRUPO')!.proposta.grupo).toBe('PECAS');
    expect(String(r.casos.find((c) => c.tipo === 'GRUPO_GENERICO' && c.atual.grupo === 'DIVERSOS')!.proposta.arvore)).toContain('DIVERSOS > MANGUEIRA');
  });
});

describe('NOMES_UNIDADES', () => {
  const itens = [
    item('1', 'ANEL  TRAVA 1440478X1'), item('2', 'MATERIAL DIVERSO'), item('3', 'LUVA ESQ NITRILICA'), item('4', 'SEMENTE MILHO SACO 60 KG', { unidade: 'SACA' }), item('5', 'ADUBO', { unidade: 'KGS' }), item('6', 'ADUBO UREIA', { unidade: 'KG' }),
    item('7', 'OLEO', { unidade: 'ROLO' }), item('8', 'PARAFUSO TEXTO\u0001', { unidade: 'UN' }),
  ];
  const r = new AnalisadorNomesUnidades().analisar(itens, { ...ctx, parametros: { limites: { descricao: 12 } } } as ContextoMotor);
  it('cobre padronização, genérico, abreviação ambígua, conversão com fator, grafia, unidade sem regra, caracteres e tamanho', () => {
    const t = tipos(r);
    for (const x of ['DESCRICAO_FORA_DO_PADRAO', 'TERMO_GENERICO', 'ABREVIACAO_ESCONDE_ATRIBUTO', 'UNIDADE_CONVERSAO', 'UNIDADE_GRAFIA', 'UNIDADE_SEM_REGRA', 'CARACTERES_INVALIDOS', 'TAMANHO_EXCEDIDO']) expect(t, x).toContain(x);
    const conv = r.casos.find((c) => c.tipo === 'UNIDADE_CONVERSAO')!;
    expect(conv.proposta).toMatchObject({ unidade: 'KG', unidadeCompra: 'SACA', fatorConversao: 60, fatorSituacao: 'CONFIRMAR' });
  });
  it('conversão sem fator sai marcada: exigeFator e fatorSituacao INFORMAR; com fator exato, DEFINIDO', () => {
    const q = new AnalisadorNomesUnidades().analisar([item('b', 'SEMENTE DE SOJA TMG', { unidade: 'BB' }), item('t', 'MILHO', { unidade: 'TONELADA' })], ctx);
    const por = (k: string) => q.casos.find((c) => c.tipo === 'UNIDADE_CONVERSAO' && c.atual.unidade === k)!.proposta;
    expect(por('BB')).toMatchObject({ fatorConversao: null, fatorSituacao: 'INFORMAR', exigeFator: 'SIM' });
    expect(por('TONELADA')).toMatchObject({ fatorConversao: 1000, fatorSituacao: 'DEFINIDO', exigeFator: 'NAO' });
  });
  it('caixa alta é opcional: por padrão não gera caso; ligada, gera', () => {
    const it1 = [item('1', 'Parafuso sextavado 10mm')];
    expect(tipos(new AnalisadorNomesUnidades().analisar(it1, ctx))).not.toContain('DESCRICAO_FORA_DO_PADRAO');
    expect(tipos(new AnalisadorNomesUnidades().analisar(it1, { ...ctx, parametros: { padronizarCaixaAlta: true } } as ContextoMotor))).toContain('DESCRICAO_FORA_DO_PADRAO');
  });
  it('sem limites informados, nunca emite caso de tamanho', () => {
    expect(tipos(new AnalisadorNomesUnidades().analisar(itens, ctx))).not.toContain('TAMANHO_EXCEDIDO');
  });
  it('padronizar a descrição não marca NCM nem outras camadas (só forma)', () => {
    expect(r.casos.find((c) => c.tipo === 'DESCRICAO_FORA_DO_PADRAO')!.afeta).toEqual([]);
  });
});

describe('NCM', () => {
  const tabela: TabelaNcm = {
    existe: (n) => ['12019000', '31010000', '84821010', '01012100'].includes(n),
    vigente: (n) => n !== '31010000', descricao: (n) => ({ '12019000': 'Soja, mesmo triturada, exceto para semeadura', '84821010': 'Rolamentos de esferas' } as Record<string, string>)[n] ?? null,
    sucessores: (n) => (n === '31010000' ? ['31010010'] : []),
  };
  const itens = [
    item('1', 'SOJA EM GRAOS', { ncm: '12019000' }), item('2', 'SOJA EM GRAOS', { ncm: '12019000' }), item('3', 'ADUBO ORGANICO COMPOSTO', { ncm: null }), item('4', 'CAVALO REPRODUTOR PURO', { ncm: '1012100' }),
    item('5', 'SEMENTE AZEVEM', { ncm: '1201.90.00' }), item('6', 'ESTERCO CURTIDO', { ncm: '31010000' }), item('7', 'INSETICIDA LAGARTA', { ncm: '99999999' }), item('8', 'ROLAMENTO RIGIDO ESFERAS NSK', { ncm: '12019000' }),
    item('9', 'DIVERSOS', { ncm: '12019000' }), item('10', 'SOJA EM GRAOS', { ncm: '84821010' }), item('11', 'ARRUELA LISA', { ncm: 'ABC' }), item('12', 'X', { ncm: '00000000' }),
  ];
  const r = new AnalisadorNcm().analisar(itens, { ...ctx, tabelaNcm: tabela } as ContextoMotor);
  const por = (t: string) => r.casos.filter((c) => c.tipo === t);
  it('formato, zeros à esquerda, vigência com sucessor, inexistente, incompatível, divergente e informação insuficiente', () => {
    expect(por('NCM_AUSENTE')).toHaveLength(1);
    expect(por('NCM_FORMATO').find((c) => c.itens[0] === itens[3].id)!.proposta.ncm).toBe('01012100');
    expect(por('NCM_FORMATO').find((c) => c.itens[0] === itens[4].id)!.proposta.ncm).toBe('12019000');
    expect(por('NCM_CLASSIFICACAO_ANTIGA')[0].proposta.ncm).toBe('31010010');
    expect(por('NCM_INEXISTENTE')).toHaveLength(1);
    expect(por('NCM_INCOMPATIVEL_DESCRICAO').map((c) => c.itens[0])).toContain(itens[7].id);
    expect(por('NCM_DIVERGENTE_ENTRE_ITENS_IGUAIS')).toHaveLength(1);
    expect(por('NCM_INFO_INSUFICIENTE').map((c) => c.itens[0])).toContain(itens[8].id);
    expect(por('NCM_PREENCHIMENTO_INVALIDO')).toHaveLength(1);
    expect(r.semDados).toBeNull();
  });
  it('texto de NCM encerrado não afirma vigência por data', () => {
    const c = por('NCM_CLASSIFICACAO_ANTIGA')[0];
    expect(c.problema).toContain('não consta como ativo na tabela atual'); expect(c.problema).not.toContain('vigente na data-base');
  });
  it('NCM corrigido afeta tratamento e obrigações; não afeta a própria camada', () => {
    expect(por('NCM_FORMATO')[0].afeta).toEqual(['TRIBUTARIO', 'OBRIGACOES']);
  });
  it('sem tabela injetada, só a parte formal e semDados explica', () => {
    const s = new AnalisadorNcm().analisar(itens, ctx);
    expect(s.semDados?.motivo).toContain('Tabela NCM'); expect(tipos(s)).not.toContain('NCM_INEXISTENTE');
  });
});

describe('dependências (camadasAfetadas)', () => {
  const caso = (camada: any, tipo: string, proposta: Record<string, any>) => camadasAfetadas({ camada, tipo, proposta });
  it('segue a seção 4 do plano', () => {
    expect(caso('QUALIDADE', 'X', { referencia: 'A' })).toEqual(['NCM', 'TRIBUTARIO', 'OBRIGACOES']);
    expect(caso('NCM', 'X', { ncm: '12345678' })).toEqual(['TRIBUTARIO', 'OBRIGACOES']);
    expect(caso('NOMES_UNIDADES', 'UNIDADE_CONVERSAO', { unidade: 'KG', fatorConversao: 60 })).toEqual(['DUPLICIDADE', 'OBRIGACOES']);
    // Unificação e inativação dependem uma da outra (o código que fica não pode ser inativado): cada uma marca a outra camada.
    expect(caso('DUPLICIDADE', 'X', { decisao: 'PROPOR_CONSOLIDACAO', manter: 'A' })).toEqual(['QUALIDADE', 'OBRIGACOES']);
    expect(caso('QUALIDADE', 'SEM_MOVIMENTACAO', { decisao: 'PROPOR_INATIVACAO', ativo: false })).toEqual(['DUPLICIDADE', 'OBRIGACOES']);
    expect(caso('GRUPOS_FINALIDADE', 'X', { finalidade: 'REVENDA' })).toEqual(['TRIBUTARIO', 'OBRIGACOES']);
    expect(caso('NOMES_UNIDADES', 'DESCRICAO_FORA_DO_PADRAO', { descricao: 'A' })).toEqual([]);
    expect(caso('QUALIDADE', 'DESCRICAO_INSUFICIENTE', { descricao: 'LUVA NITRILICA 9' })).toEqual(['NCM', 'TRIBUTARIO', 'OBRIGACOES']);
    expect(caso('QUALIDADE', 'X', {})).toEqual([]);
  });
});

describe('executarMotor', () => {
  const itens = [...fundo(), item('A', 'FERTILIZANTE SUPERFOSFATO SIMPLES SACO 50 KG', { unidade: 'KG' }), item('B', 'Fert. Superfosfato Simples saco 50kg', { unidade: 'KG' }), item('', 'X')];
  it('roda as 6 camadas na ordem, é determinístico e não altera a entrada', () => {
    const copia = JSON.stringify(itens);
    const a = executarMotor(itens, ctx); const b = executarMotor(itens, ctx);
    expect(a.map((x) => x.camada)).toEqual(['IDENTIFICACAO', 'QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE', 'NOMES_UNIDADES', 'NCM']);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); expect(JSON.stringify(itens)).toBe(copia);
    for (const r of a) expect(r.analisados).toBe(itens.length);
  });
  it('zeros à esquerda: código e NCM seguem texto, sem virar número', () => {
    const r = executarMotor([item('000123', 'PARAFUSO SEXTAVADO 10MM', { ncm: '07019000' })], { ...ctx, tabelaNcm: { existe: () => true, vigente: () => true, descricao: () => null, sucessores: () => [] } });
    for (const x of r) for (const c of x.casos) expect(String(c.atual.codigo ?? '000123')).toBe('000123');
    expect(r.flatMap((x) => x.casos.map((c) => c.tipo))).not.toContain('NCM_FORMATO');
  });
});
