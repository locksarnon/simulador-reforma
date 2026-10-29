import { describe, expect, it } from 'vitest';
import { CAMPOS, Mapeamento, sugerirMapeamento } from './campos';
import { EmpresaRef, OPCOES_PADRAO, acharEmpresa, converterLinha, dataBR, direcaoDe, numeroBR, pctParaFracao, regimeNormalizado, simNaoDe, tipoDe } from './conversao';
import { icmsInterestadual } from './tributos-padrao';

describe('numeroBR', () => {
  it.each([
    ['1.234,56', 'csv', 1234.56],
    ['1234,56', 'csv', 1234.56],
    ['1,234.56', 'csv', 1234.56],
    ['1234.56', 'csv', 1234.56],
    ['R$ 12.500,00', 'csv', 12500],
    ['(100,00)', 'csv', -100],
    ['100,00-', 'csv', -100],
    ['-100', 'csv', -100],
    ['1.234', 'csv', 1234], // milhar no CSV brasileiro
    ['1.234', 'xlsx', 1.234], // decimal no XLSX
    ['0.65', 'csv', 0.65],
    ['12500.5', 'csv', 12500.5],
    ['1.234.567', 'xlsx', 1234567],
    ['1,234,567', 'csv', 1234567],
    ['18%', 'csv', 18],
    ['-R$ 1.234,56', 'csv', -1234.56],
    ['R$ -1.234,56', 'csv', -1234.56],
    ['R$ (100,00)', 'csv', -100],
    ['100,00 D', 'csv', -100],
    ['100,00 C', 'csv', 100],
    ['0.500', 'csv', 0.5], // não é quinhentos
    ['0.125', 'csv', 0.125],
    ['12,5', 'xlsx', 12.5],
  ] as const)('%s (%s) vira %s', (texto, formato, esperado) => {
    expect(numeroBR(texto, formato)).toBeCloseTo(esperado, 8);
  });

  it.each(['', 'abc', '12a', '--', '.', ',', '1,2,x'])('“%s” não é número', (texto) => {
    expect(numeroBR(texto)).toBeNull();
  });
});

describe('dataBR', () => {
  it.each([
    ['15/01/2027', '2027-01-15'], ['2027-01-15', '2027-01-15'], ['2027-01-15T10:30:00', '2027-01-15'],
    ['5/1/2027', '2027-01-05'], ['15-01-27', '2027-01-15'], ['15.01.2027', '2027-01-15'], ['15/01/2027 08:00', '2027-01-15'],
  ])('%s vira %s', (texto, iso) => {
    expect(dataBR(texto)?.toISOString().slice(0, 10)).toBe(iso);
  });
  it.each(['', 'ontem', '31/02/2027', '2027-13-01', '32/01/2027', '15/01/1899'])('“%s” é inválida', (texto) => {
    expect(dataBR(texto)).toBeNull();
  });
});

describe('percentuais', () => {
  it('em pontos: 18 é 18% e 1,65 é 1,65%', () => {
    expect(pctParaFracao('18', 'pontos')).toBeCloseTo(0.18, 10);
    expect(pctParaFracao('1,65', 'pontos')).toBeCloseTo(0.0165, 10);
  });
  it('em fração: 0,18 é 18%', () => {
    expect(pctParaFracao('0,18', 'fracao')).toBeCloseTo(0.18, 10);
  });
  it('com o sinal % o valor é sempre em pontos, qualquer que seja a unidade escolhida', () => {
    expect(pctParaFracao('18%', 'fracao')).toBeCloseTo(0.18, 10);
    expect(pctParaFracao('7,6 %', 'pontos')).toBeCloseTo(0.076, 10);
  });
  it('texto que não é número devolve nulo', () => {
    expect(pctParaFracao('x', 'pontos')).toBeNull();
  });
});

describe('direção, tipo e sim/não', () => {
  it('reconhece Saída e Entrada em várias grafias', () => {
    for (const t of ['Saída', 'SAIDA', 'saida', 'S', 'Venda', 'Receita', 'faturamento']) expect(direcaoDe(t), t).toBe('Saida');
    for (const t of ['Entrada', 'E', 'Compra', 'Despesa', 'custo', 'Aquisição']) expect(direcaoDe(t), t).toBe('Entrada');
    for (const t of ['', 'xyz', 'talvez']) expect(direcaoDe(t), t).toBeNull();
  });
  it('mercadoria, serviço e outro', () => {
    expect(tipoDe('Serviço')).toBe('Servico');
    expect(tipoDe('Prestação de serviços')).toBe('Servico');
    expect(tipoDe('Produto')).toBe('Mercadoria');
    expect(tipoDe('Outros')).toBe('Outro');
    expect(tipoDe('abc')).toBeNull();
  });
  it('sim e não, com vazio como não', () => {
    expect(simNaoDe('Sim')).toBe('Sim');
    expect(simNaoDe('S')).toBe('Sim');
    expect(simNaoDe('Não')).toBe('Não');
    expect(simNaoDe('')).toBe('Não');
    expect(simNaoDe('quem sabe')).toBeNull();
  });
});

describe('empresa e regime', () => {
  const empresas: EmpresaRef[] = [
    { id_empresa: 'TRANSP-01', cnpj_cpf: '12.345.678/0001-95', regime_atual: 'Lucro Presumido', status: 'Ativa' },
    { id_empresa: 'FAZ-02', cnpj_cpf: '123.456.789-09', regime_atual: 'Produtor rural PF', status: 'Ativa' },
  ];
  it('pelo ID, sem diferenciar maiúsculas, ou pelo CNPJ/CPF só com os dígitos', () => {
    expect(acharEmpresa('transp-01', empresas)?.id_empresa).toBe('TRANSP-01');
    expect(acharEmpresa('12345678000195', empresas)?.id_empresa).toBe('TRANSP-01');
    expect(acharEmpresa('12.345.678/0001-95', empresas)?.id_empresa).toBe('TRANSP-01');
    expect(acharEmpresa('12345678909', empresas)?.id_empresa).toBe('FAZ-02');
    expect(acharEmpresa('99999999000100', empresas)).toBeUndefined();
    expect(acharEmpresa('inexistente', empresas)).toBeUndefined();
  });
  it('regime reconhecido por parte do nome', () => {
    expect(regimeNormalizado('Lucro Real')).toBe('Lucro Real');
    expect(regimeNormalizado('lucro presumido')).toBe('Lucro Presumido');
    expect(regimeNormalizado('SIMPLES NACIONAL')).toBe('Simples Nacional');
    expect(regimeNormalizado('Produtor rural PF')).toBe('Produtor rural PF');
    expect(regimeNormalizado('')).toBe('');
  });
});

describe('ICMS interestadual (Resolução do Senado 22/1989)', () => {
  it('7% de Sul/Sudeste (menos ES) para N, NE, CO e ES; 12% nos demais; nada se for a mesma UF ou faltar uma', () => {
    expect(icmsInterestadual('SP', 'MA')).toBe(0.07);
    expect(icmsInterestadual('PR', 'ES')).toBe(0.07);
    expect(icmsInterestadual('MT', 'PR')).toBe(0.12);
    expect(icmsInterestadual('SP', 'MG')).toBe(0.12);
    expect(icmsInterestadual('SP', 'SP')).toBeNull();
    expect(icmsInterestadual('SP', '')).toBeNull();
  });
});

describe('sugestão de colunas', () => {
  it('reconhece os nomes mais comuns de uma exportação de ERP, sem usar a mesma coluna duas vezes', () => {
    const cab = ['Data de Emissão', 'Valor Total', 'CFOP', 'UF Origem', 'UF Destino', 'Entrada/Saída', 'Empresa', 'ICMS %', 'Algo sem nome', 'Valor'];
    const m = sugerirMapeamento(cab);
    expect(m).toMatchObject({ data: 0, valor_bruto: 1, cfop_servico: 2, uf_origem: 3, uf_destino: 4, direcao: 5, empresa: 6, icms_pct: 7 });
    expect(m.ncm).toBeNull();
    // “Valor” (coluna 9) não pode repetir a coluna 1, já usada pelo valor da operação.
    expect(Object.values(m).filter((v) => v === 9)).toHaveLength(0);
  });
});

describe('converterLinha', () => {
  const empresas: EmpresaRef[] = [{ id_empresa: 'TRANSP-01', cnpj_cpf: '12.345.678/0001-95', regime_atual: 'Lucro Presumido', status: 'Ativa' }];
  const vazio: Mapeamento = Object.fromEntries(CAMPOS.map((c) => [c.id, null]));
  const mapa = (extra: Mapeamento): Mapeamento => ({ ...vazio, ...extra });
  const ctx = (m: Mapeamento, opcoes = {}, extra = {}) => ({
    mapeamento: m, opcoes: { ...OPCOES_PADRAO, ...opcoes }, empresas, formato: 'csv' as const, nomeArquivo: 'frete.csv', arquivoHash: 'abc12345', ...extra,
  });
  // Colunas: empresa, data, direção, valor, UF origem, UF destino, ICMS, PIS, Cofins
  const M = mapa({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3, uf_origem: 4, uf_destino: 5, icms_pct: 6, pis_pct: 7, cofins_pct: 8 });

  it('linha completa vira operação com os percentuais em fração e o ano da data; o ID sai do conteúdo (gerado pelo serviço)', () => {
    const r = converterLinha(['TRANSP-01', '15/01/2027', 'Saída', '12.500,00', 'MT', 'PR', '12', '0,65', '3'], 2, ctx(M));
    expect(r.ok).toBe(true);
    expect(r.erros).toEqual([]);
    expect(r.dados).toMatchObject({
      empresa_id: 'TRANSP-01', ano: 2027, direcao: 'Saida', tipo: 'Mercadoria', valor_bruto: 12500,
      quantidade: 1, preco_unitario: 12500, uf_origem: 'MT', uf_destino: 'PR', documento: 'Planilha', c_class_trib: '000001', cst_ibs_cbs: '000',
      regime_atual: 'Lucro Presumido', credito_elegivel_pct: 0,
    });
    expect((r.dados!.icms_pct as number)).toBeCloseTo(0.12, 10);
    expect((r.dados!.pis_pct as number)).toBeCloseTo(0.0065, 10);
    expect((r.dados!.cofins_pct as number)).toBeCloseTo(0.03, 10);
    expect(r.padroes).toEqual([]);
    expect(r.dados!.observacao_dfe).toContain('frete.csv (arquivo abc12345), linha 2');
    expect(r.dados).not.toHaveProperty('id_operacao');
    expect(r.idInformado).toBe(false);
    expect(r.chaveConteudo).toContain('TRANSP-01|2027-01-15|Saida|12500.00|');
    expect(r.chaveConteudo).toMatch(/\|MT\|PR\|1$/);
  });

  it('PIS, Cofins e ICMS em branco: tabela da legislação pelo regime da empresa e pelas UFs (e avisa o que preencheu)', () => {
    const r = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'SP', 'MA', '', '', ''], 3, ctx(M));
    expect(r.ok).toBe(true);
    expect(r.dados!.pis_pct).toBe(0.0065);
    expect(r.dados!.cofins_pct).toBe(0.03);
    expect(r.dados!.icms_pct).toBe(0.07);
    expect(r.padroes).toEqual(['PIS', 'Cofins', 'ICMS interestadual']);
  });

  it('compra: a tabela NÃO preenche PIS e Cofins (são os do fornecedor, e o regime do comprador não os revela), só o ICMS interestadual', () => {
    const r = converterLinha(['TRANSP-01', '2027-01-15', 'Entrada', '1000', 'MT', 'PR', '', '', ''], 3, ctx(M));
    expect(r.ok).toBe(true);
    expect(r.dados).toMatchObject({ direcao: 'Entrada', pis_pct: 0, cofins_pct: 0 });
    expect(r.dados!.icms_pct).toBe(0.12);
    expect(r.padroes).toEqual(['ICMS interestadual']);
  });

  it('compra com PIS e Cofins informados na planilha: valem como vieram', () => {
    const r = converterLinha(['TRANSP-01', '2027-01-15', 'Entrada', '1000', 'MT', 'PR', '', '1,65', '7,6'], 3, ctx(M));
    expect(r.dados!.pis_pct).toBeCloseTo(0.0165, 10);
    expect(r.dados!.cofins_pct).toBeCloseTo(0.076, 10);
  });

  it('com a opção desligada, o que falta fica zerado', () => {
    const r = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'SP', 'MA', '', '', ''], 3, ctx(M, { preencherTributos: false }));
    expect(r.dados).toMatchObject({ pis_pct: 0, cofins_pct: 0, icms_pct: 0 });
    expect(r.padroes).toEqual([]);
  });

  it('erros: empresa inexistente, data inválida, direção desconhecida e valor zerado — a linha não vira operação', () => {
    const r = converterLinha(['OUTRA', '31/02/2027', 'talvez', '0', 'SP', 'MA', '', '', ''], 5, ctx(M));
    expect(r.ok).toBe(false);
    expect(r.dados).toBeNull();
    expect(r.erros).toHaveLength(4);
    expect(r.erros.join(' ')).toMatch(/Empresa “OUTRA”/);
    expect(r.erros.join(' ')).toMatch(/Data “31\/02\/2027” inválida/);
    expect(r.erros.join(' ')).toMatch(/Direção “talvez”/);
    expect(r.erros.join(' ')).toMatch(/zerado/);
  });

  it('percentual fora do intervalo é erro com a dica dos pontos percentuais', () => {
    const r = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'SP', 'MA', '180', '', ''], 2, ctx(M));
    expect(r.ok).toBe(false);
    expect(r.erros[0]).toMatch(/18 = 18%/);
  });

  it('percentuais em fração: 0,12 é 12%', () => {
    const r = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '0,12', '', ''], 2, ctx(M, { unidadePct: 'fracao' }));
    expect(r.dados!.icms_pct).toBeCloseTo(0.12, 10);
  });

  it('empresa e direção para todas as linhas, quando a planilha não traz as colunas', () => {
    const m = mapa({ data: 0, valor_bruto: 1 });
    const r = converterLinha(['15/01/2027', '500'], 2, ctx(m, { empresaPadrao: 'TRANSP-01', direcaoPadrao: 'Entrada' }));
    expect(r.ok).toBe(true);
    expect(r.dados).toMatchObject({ empresa_id: 'TRANSP-01', direcao: 'Entrada' });
  });

  it('crédito elegível: a escolha da tela vale só para compras; a coluna da planilha vale sempre que existir', () => {
    const compra = converterLinha(['TRANSP-01', '2027-01-15', 'Entrada', '1000', 'MT', 'MT', '', '', ''], 2, ctx(M, { creditoElegivelCompras: 1 }));
    const venda = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'MT', '', '', ''], 2, ctx(M, { creditoElegivelCompras: 1 }));
    expect(compra.dados!.credito_elegivel_pct).toBe(1);
    expect(venda.dados!.credito_elegivel_pct).toBe(0);
    const m = mapa({ ...M, credito_elegivel_pct: 9 });
    const comColuna = converterLinha(['TRANSP-01', '2027-01-15', 'Entrada', '1000', 'MT', 'MT', '', '', '', '60'], 2, ctx(m, { creditoElegivelCompras: 1 }));
    expect(comColuna.dados!.credito_elegivel_pct).toBeCloseTo(0.6, 10);
  });

  it('serviço quando há NBS; combustível exige quantidade para ser calculado; cCredPres fora da tabela e em saída avisam', () => {
    const m = mapa({ ...M, nbs: 9, quantidade: 10, combustivel_produto: 11, c_cred_pres: 12 });
    const base = ['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '12', '0,65', '3'];
    const servico = converterLinha([...base, '1.0901.10.00', '', '', ''], 2, ctx(m));
    expect(servico.dados!.tipo).toBe('Servico');
    expect(servico.dados!.nbs).toBe('1090110' + '00');
    const comb = converterLinha([...base, '', '1.000,5', 'Diesel', ''], 2, ctx(m));
    expect(comb.dados).toMatchObject({ combustivel_produto: 'diesel', quantidade: 1000.5 });
    const semQtd = converterLinha([...base, '', '', 'diesel', ''], 2, ctx(m));
    expect(semQtd.avisos.join(' ')).toMatch(/Combustível sem quantidade/);
    const cred = converterLinha([...base, '', '', '', '2'], 2, ctx(m));
    expect(cred.avisos.join(' ')).toMatch(/só em compra/);
    const credFora = converterLinha([...base, '', '', '', '9'], 2, ctx(m));
    expect(credFora.avisos.join(' ')).toMatch(/fora da tabela oficial/);
  });

  it('cCredPres digitado como 2 ou 02 é gravado com dois dígitos, como no XML; só vale em compra', () => {
    const m = mapa({ ...M, c_cred_pres: 9 });
    const compra = (cod: string) => converterLinha(['TRANSP-01', '2027-01-15', 'Entrada', '1000', 'MT', 'PR', '12', '0,65', '3', cod], 2, ctx(m));
    expect(compra('2').dados!.c_cred_pres).toBe('02');
    expect(compra('02').dados!.c_cred_pres).toBe('02');
    expect(compra('2').avisos).toEqual([]);
    expect(compra('cp-rural').dados!.c_cred_pres).toBe('CP-RURAL');
  });

  it('valor negativo é devolução (aviso, não erro)', () => {
    const r = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '-300,00', 'MT', 'PR', '12', '0,65', '3'], 2, ctx(M));
    expect(r.ok).toBe(true);
    expect(r.dados!.valor_bruto).toBe(-300);
    expect(r.avisos.join(' ')).toMatch(/devolução/);
  });

  it('quantidade informada vira preço unitário = valor ÷ quantidade', () => {
    const m = mapa({ ...M, quantidade: 9 });
    const r = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '12', '0,65', '3', '4'], 2, ctx(m));
    expect(r.dados).toMatchObject({ quantidade: 4, preco_unitario: 250, valor_bruto: 1000 });
  });

  it('a chave de conteúdo não depende dos percentuais nem da opção de preencher tributos: a mesma linha com outro imposto é a mesma operação', () => {
    const a = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '12', '0,65', '3'], 2, ctx(M));
    const b = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '', '', ''], 9, ctx(M, { preencherTributos: false }));
    expect(a.chaveConteudo).toBe(b.chaveConteudo);
    const outroValor = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1001', 'MT', 'PR', '12', '0,65', '3'], 2, ctx(M));
    expect(outroValor.chaveConteudo).not.toBe(a.chaveConteudo);
    expect(a.chaveConteudo).not.toBeNull();
  });

  it('ID informado na planilha vale como veio (até 80 caracteres) e não é refeito pelo conteúdo', () => {
    const m = mapa({ ...M, id_operacao: 9 });
    const r = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '12', '0,65', '3', 'NF-123'], 2, ctx(m));
    expect(r.idInformado).toBe(true);
    expect(r.dados!.id_operacao).toBe('NF-123');
  });

  it('a empresa escolhida na tela vale para TODAS as linhas: a coluna Empresa, que costuma ser o CNPJ do cliente, não manda a linha para outra empresa', () => {
    const duas: EmpresaRef[] = [...empresas, { id_empresa: 'OUTRA-02', cnpj_cpf: '11.222.333/0001-81', regime_atual: 'Lucro Real', status: 'Ativa' }];
    const r = converterLinha(['11222333000181', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '12', '0,65', '3'], 2, { ...ctx(M, { empresaPadrao: 'TRANSP-01' }), empresas: duas });
    expect(r.ok).toBe(true);
    expect(r.dados!.empresa_id).toBe('TRANSP-01');
    // sem empresa escolhida, a coluna vale
    const semPadrao = converterLinha(['11222333000181', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '12', '0,65', '3'], 2, { ...ctx(M), empresas: duas });
    expect(semPadrao.dados!.empresa_id).toBe('OUTRA-02');
  });

  it('o Excel tira o zero à esquerda de código digitado como número: cClassTrib 1 vira 000001, CST 10 vira 010 e NCM de 7 dígitos ganha o zero', () => {
    const m = mapa({ ...M, c_class_trib: 9, cst_ibs_cbs: 10, ncm: 11 });
    const r = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '12', '0,65', '3', '1', '10', '1012100'], 2, ctx(m));
    expect(r.dados).toMatchObject({ c_class_trib: '000001', cst_ibs_cbs: '010', ncm: '01012100' });
    expect(r.avisos.join(' ')).not.toMatch(/8 dígitos/);
    const ok = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '12', '0,65', '3', '200003', '200', '10059010'], 2, ctx(m));
    expect(ok.dados).toMatchObject({ c_class_trib: '200003', cst_ibs_cbs: '200', ncm: '10059010' });
  });

  it('cClassTrib que não existe no catálogo avisa (a operação ficaria pendente); sem catálogo carregado não confere', () => {
    const m = mapa({ ...M, c_class_trib: 9 });
    const linha = ['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '12', '0,65', '3', '123456'];
    const com = converterLinha(linha, 2, ctx(m, {}, { classesCatalogo: new Set(['000001', '200003']) }));
    expect(com.avisos.join(' ')).toMatch(/cClassTrib 123456 não existe no catálogo/);
    expect(converterLinha(linha, 2, ctx(m, {}, { classesCatalogo: new Set(['123456']) })).avisos).toEqual([]);
    expect(converterLinha(linha, 2, ctx(m, {}, { classesCatalogo: new Set() })).avisos).toEqual([]);
    expect(converterLinha(linha, 2, ctx(m)).avisos).toEqual([]);
  });

  it('ICMS interestadual da tabela não vale para exportação (EX), UF inválida nem serviço de ISS (NBS ou ISS informado)', () => {
    const l = (o: string, d: string) => ['TRANSP-01', '2027-01-15', 'Saída', '1000', o, d, '', '', ''];
    expect(converterLinha(l('SP', 'MG'), 2, ctx(M)).dados!.icms_pct).toBe(0.12);
    expect(converterLinha(l('SP', 'EX'), 2, ctx(M)).dados!.icms_pct).toBe(0);
    expect(converterLinha(l('EX', 'SP'), 2, ctx(M)).dados!.icms_pct).toBe(0);
    const invalida = converterLinha(l('São Paulo', 'Bahia'), 2, ctx(M));
    expect(invalida.dados!.icms_pct).toBe(0);
    expect(invalida.avisos.join(' ')).toMatch(/não é uma sigla de estado válida/);
    const ms = mapa({ ...M, nbs: 9 });
    const servico = converterLinha([...l('SP', 'MG'), '1.1506.20.00'], 2, ctx(ms));
    expect(servico.dados).toMatchObject({ tipo: 'Servico', icms_pct: 0 });
    const msIss = mapa({ ...M, iss_pct: 9 });
    expect(converterLinha([...l('SP', 'MG'), '5'], 2, ctx(msIss, { tipoPadrao: 'Servico' })).dados!.icms_pct).toBe(0);
  });

  it('regime que a tabela não reconhece (ex.: "LR") avisa em vez de calar: PIS e Cofins ficam como a planilha trouxe', () => {
    const m = mapa({ ...M, regime_atual: 9 });
    const r = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '12', '', '', 'LR'], 2, ctx(m));
    expect(r.avisos.join(' ')).toMatch(/Regime “LR” não reconhecido/);
    expect(r.dados).toMatchObject({ pis_pct: 0, cofins_pct: 0 });
    const certo = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '12', '', '', 'Lucro Real'], 2, ctx(m));
    expect(certo.avisos).toEqual([]);
    expect(certo.dados).toMatchObject({ pis_pct: 0.0165, cofins_pct: 0.076 });
  });

  it('empresa inativa não importa', () => {
    const r = converterLinha(['TRANSP-01', '2027-01-15', 'Saída', '1000', 'MT', 'PR', '', '', ''], 2, { ...ctx(M), empresas: [{ ...empresas[0], status: 'Inativa' }] });
    expect(r.ok).toBe(false);
    expect(r.erros[0]).toMatch(/inativa/);
  });
});
