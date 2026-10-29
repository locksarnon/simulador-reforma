import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { OperacoesPlanilhaService, lerMapeamento, lerOpcoes, nomeDoArquivo } from './operacoes-planilha.service';

const EMPRESAS = [
  { id: 'db-t1', id_empresa: 'TRANSP-01', cnpj_cpf: '12.345.678/0001-95', regime_atual: 'Lucro Presumido', status: 'Ativa' },
  { id: 'db-t2', id_empresa: 'TRANSP-02', cnpj_cpf: null, regime_atual: 'Simples Nacional', status: 'Ativa' },
];
const CHAVE_NFE = '35270112345678000195550010000001231000001230';

type Extras = { xml?: { empresa_id: string; chave_nfe: string; numero_item?: number }[]; classes?: string[]; empresas?: unknown[]; grupo?: { numero: string } | null };

/** Banco em memória: os modelos que o serviço consulta e a transação (que roda a função com o próprio objeto). */
function criar(existentes: { id_operacao: string; empresa_id: string }[] = [], extras: Extras = {}) {
  const prisma: any = {
    empresa: { findMany: vi.fn().mockResolvedValue(extras.empresas ?? EMPRESAS) },
    grupo: { findUnique: vi.fn().mockResolvedValue(extras.grupo === undefined ? { numero: 'G1' } : extras.grupo) },
    classTrib: { findMany: vi.fn().mockResolvedValue((extras.classes ?? []).map((c) => ({ c_class_trib: c }))) },
    operacao: {
      findMany: vi.fn().mockResolvedValue(existentes),
      createMany: vi.fn().mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    },
    historicoXML: { findMany: vi.fn().mockResolvedValue(extras.xml ?? []) },
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma, service: new OperacoesPlanilhaService(prisma as never) };
}

const gravadasDe = (prisma: ReturnType<typeof criar>['prisma']) =>
  prisma.operacao.createMany.mock.calls.flatMap((c: any[]) => c[0].data) as Record<string, any>[];
/** O que o banco devolve de operações já gravadas: as linhas inteiras, como foram gravadas. */
const jaGravadas = (gravadas: Record<string, any>[]) => gravadas.map((g) => ({ ...g })) as unknown as { id_operacao: string; empresa_id: string }[];

const CABECALHO = 'Empresa;Data;Entrada/Saída;Valor;UF Origem;UF Destino;ICMS %;Documento';
const csv = (linhas: string[], nome = 'fretes.csv') => ({ buffer: Buffer.from([CABECALHO, ...linhas].join('\n'), 'utf8'), originalname: nome });
const MAPA = JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3, uf_origem: 4, uf_destino: 5, icms_pct: 6, documento: 7 });

async function xlsx(cabecalho: string[], linhas: unknown[][], formatos: Record<string, string> = {}, nome = 'fretes.xlsx') {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Operações');
  ws.addRow(cabecalho);
  for (const l of linhas) ws.addRow(l);
  for (const [ref, fmt] of Object.entries(formatos)) ws.getCell(ref).numFmt = fmt;
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), originalname: nome };
}

describe('leitura do mapeamento e das opções', () => {
  it('mapeamento: só campos conhecidos e índices inteiros', () => {
    expect(lerMapeamento('{"data":1,"valor_bruto":"3","ncm":null}')).toEqual({ data: 1, valor_bruto: 3, ncm: null });
    expect(() => lerMapeamento(undefined)).toThrow(BadRequestException);
    expect(() => lerMapeamento('{"inexistente":1}')).toThrow(BadRequestException);
    expect(() => lerMapeamento('{"data":-1}')).toThrow(BadRequestException);
    expect(() => lerMapeamento('{"data":1.5}')).toThrow(BadRequestException);
    expect(() => lerMapeamento('[1,2]')).toThrow(BadRequestException);
    expect(() => lerMapeamento('não é json')).toThrow(BadRequestException);
  });

  it('opções: valores estranhos voltam ao padrão e o crédito das compras fica entre 0 e 1', () => {
    expect(lerOpcoes(undefined)).toMatchObject({ unidadePct: 'pontos', preencherTributos: true, tipoPadrao: 'Mercadoria', direcaoPadrao: null, creditoElegivelCompras: null, grupoId: null });
    expect(lerOpcoes('{"unidadePct":"fracao","direcaoPadrao":"Entrada","tipoPadrao":"Servico","creditoElegivelCompras":1,"preencherTributos":false,"grupoId":"g1"}'))
      .toMatchObject({ unidadePct: 'fracao', direcaoPadrao: 'Entrada', tipoPadrao: 'Servico', creditoElegivelCompras: 1, preencherTributos: false, grupoId: 'g1' });
    expect(lerOpcoes('{"unidadePct":"xx","direcaoPadrao":"talvez","grupoId":5}')).toMatchObject({ unidadePct: 'pontos', direcaoPadrao: null, grupoId: null });
    expect(() => lerOpcoes('{"creditoElegivelCompras":1.5}')).toThrow(BadRequestException);
    expect(() => lerOpcoes('lixo')).toThrow(BadRequestException);
  });

  it('o nome do arquivo vem do multer em latin1: acento é corrigido e o que já estava certo fica como está', () => {
    expect(nomeDoArquivo({ buffer: Buffer.alloc(0), originalname: 'operaÃ§Ãµes-janeiro.csv' })).toBe('operações-janeiro.csv');
    expect(nomeDoArquivo({ buffer: Buffer.alloc(0), originalname: 'operações.csv' })).toBe('operações.csv');
    expect(nomeDoArquivo({ buffer: Buffer.alloc(0), originalname: 'fretes.csv' })).toBe('fretes.csv');
    expect(nomeDoArquivo({ buffer: Buffer.alloc(0), originalname: 'preço €.csv' })).toBe('preço €.csv');
    expect(nomeDoArquivo({ buffer: Buffer.alloc(0) })).toBe('planilha');
  });
});

describe('modelo de planilha', () => {
  it('o modelo gerado volta pelo mesmo leitor: todas as colunas são reconhecidas e a linha de exemplo é uma operação válida', async () => {
    const { service } = criar();
    const buffer = await service.modelo();
    const arquivo = { buffer, originalname: 'modelo-operacoes-intax.xlsx' };
    const p = await service.previa(arquivo);
    expect(p.formato).toBe('xlsx');
    expect(p.total).toBe(1);
    // Cada campo cai na sua própria coluna (nenhum fica sem coluna e nenhuma coluna é usada duas vezes).
    const indices = Object.values(p.mapeamentoSugerido);
    expect(indices.every((i) => i !== null)).toBe(true);
    expect(new Set(indices).size).toBe(p.campos.length);
    const r = await service.validar(arquivo, JSON.stringify(p.mapeamentoSugerido), undefined);
    expect(r).toMatchObject({ total: 1, novas: 1, comErro: 0 });
  });

  it('títulos de coluna únicos e reconhecidos por qualquer outro campo? não: cada título só vale para o seu campo', async () => {
    const { CAMPOS, sugerirMapeamento } = await import('./campos');
    const m = sugerirMapeamento(CAMPOS.map((c) => c.coluna));
    CAMPOS.forEach((c, i) => expect(m[c.id], c.id).toBe(i));
  });
});

describe('OperacoesPlanilhaService', () => {
  it('prévia: cabeçalho, total, amostra e as colunas sugeridas pelo nome', async () => {
    const { service } = criar();
    const p = await service.previa(csv(['TRANSP-01;15/01/2027;Saída;12.500,00;MT;PR;12;CT-e', 'TRANSP-01;16/01/2027;Saída;8.000,00;MT;SP;12;CT-e']));
    expect(p.formato).toBe('csv');
    expect(p.total).toBe(2);
    expect(p.cabecalho).toEqual(['Empresa', 'Data', 'Entrada/Saída', 'Valor', 'UF Origem', 'UF Destino', 'ICMS %', 'Documento']);
    expect(p.mapeamentoSugerido).toMatchObject({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3, uf_origem: 4, uf_destino: 5, icms_pct: 6, documento: 7 });
    expect(p.campos.find((c) => c.id === 'valor_bruto')).toMatchObject({ obrigatorio: true });
  });

  it('validar: conta novas, com erro e já importadas, e não grava nada', async () => {
    const { service, prisma } = criar();
    const r = await service.validar(csv([
      'TRANSP-01;15/01/2027;Saída;12.500,00;MT;PR;12;CT-e',
      'TRANSP-01;16/01/2027;Saída;8.000,00;MT;SP;;CT-e', // ICMS em branco: tabela (12%)
      'XXX;17/01/2027;Saída;100,00;MT;PR;12;CT-e', // empresa inexistente
    ]), MAPA, undefined);
    expect(r).toMatchObject({ total: 3, novas: 2, comErro: 1, duplicadas: 0 });
    expect(r.padroes).toMatchObject({ PIS: 2, Cofins: 2, 'ICMS interestadual': 1 });
    expect(r.porAno).toEqual({ '2027': 2 });
    expect(r.amostraErros).toHaveLength(1);
    expect(r.amostraErros[0].erros[0]).toMatch(/Empresa “XXX”/);
    expect(r.amostraErros[0].linha).toBe(4); // cabeçalho = linha 1
    expect(prisma.operacao.createMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled(); // validar só lê: sem transação nem trava
  });

  it('importar grava só as linhas válidas, em fração, com ano e empresa', async () => {
    const { service, prisma } = criar();
    const r = await service.importar(csv([
      'TRANSP-01;15/01/2027;Saída;12.500,00;MT;PR;12;CT-e',
      'TRANSP-02;16/01/2027;Entrada;3.000,00;MT;MT;;NF-e',
      'XXX;17/01/2027;Saída;100,00;MT;PR;12;CT-e',
    ]), MAPA, undefined);
    expect(r).toMatchObject({ importadas: 2, comErro: 1, jaExistiam: 0, total: 3 });
    const gravadas = gravadasDe(prisma);
    expect(gravadas).toHaveLength(2);
    expect(gravadas[0]).toMatchObject({ empresa_id: 'TRANSP-01', ano: 2027, direcao: 'Saida', valor_bruto: 12500, documento: 'CT-e' });
    expect(gravadas[0].icms_pct).toBeCloseTo(0.12, 10);
    expect(gravadas[1]).toMatchObject({ empresa_id: 'TRANSP-02', direcao: 'Entrada', pis_pct: 0, cofins_pct: 0 }); // Simples: PIS/Cofins dentro do DAS
    expect(gravadas[0].id_operacao).toMatch(/^PL[0-9a-f]{12}-1$/);
    expect(gravadas[0].observacao_dfe).toMatch(/Importado da planilha fretes\.csv \(arquivo [0-9a-f]{8}\), linha 2\./);
  });

  it('importar roda numa transação, com a trava de importação antes da consulta das já existentes', async () => {
    const { service, prisma } = criar();
    await service.importar(csv(['TRANSP-01;15/01/2027;Saída;12.500,00;MT;PR;12;CT-e']), MAPA, undefined);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][1]).toMatchObject({ timeout: expect.any(Number) });
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    const ordem = [prisma.$executeRawUnsafe.mock.invocationCallOrder[0], prisma.operacao.findMany.mock.invocationCallOrder[0], prisma.operacao.createMany.mock.invocationCallOrder[0]];
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });

  it('a consulta das já existentes é por empresa e por ID (usa o índice da empresa)', async () => {
    const { service, prisma } = criar();
    await service.validar(csv(['TRANSP-01;15/01/2027;Saída;12.500,00;MT;PR;12;CT-e', 'TRANSP-02;15/01/2027;Saída;100,00;MT;PR;12;CT-e']), MAPA, undefined);
    const onde = prisma.operacao.findMany.mock.calls[0][0].where;
    expect(onde.empresa_id.in.sort()).toEqual(['TRANSP-01', 'TRANSP-02']);
    expect(onde.id_operacao.in).toHaveLength(2);
  });

  it('importar o mesmo arquivo de novo não duplica: o ID é o mesmo e as linhas já gravadas ficam de fora', async () => {
    const arquivo = csv(['TRANSP-01;15/01/2027;Saída;12.500,00;MT;PR;12;CT-e', 'TRANSP-01;16/01/2027;Saída;8.000,00;MT;SP;12;CT-e']);
    const primeira = criar();
    await primeira.service.importar(arquivo, MAPA, undefined);
    const segunda = criar(jaGravadas(gravadasDe(primeira.prisma)));
    const r = await segunda.service.importar(arquivo, MAPA, undefined);
    expect(r).toMatchObject({ importadas: 0, jaExistiam: 2, comErro: 0 });
    expect(segunda.prisma.operacao.createMany).not.toHaveBeenCalled();
  });

  it('planilha CORRIGIDA e reenviada: as linhas iguais ficam de fora e só a corrigida entra (o ID não depende do arquivo inteiro)', async () => {
    const certa = 'TRANSP-01;15/01/2027;Saída;12.500,00;MT;PR;12;CT-e';
    const primeira = criar();
    const r1 = await primeira.service.importar(csv([certa, 'TRANSP-01;16/01/2027;Saída;0;MT;SP;12;CT-e']), MAPA, undefined); // valor zerado: erro
    expect(r1).toMatchObject({ importadas: 1, comErro: 1 });
    const segunda = criar(jaGravadas(gravadasDe(primeira.prisma)));
    const r2 = await segunda.service.importar(csv([certa, 'TRANSP-01;16/01/2027;Saída;8.000,00;MT;SP;12;CT-e']), MAPA, undefined);
    expect(r2).toMatchObject({ importadas: 1, jaExistiam: 1, comErro: 0 });
    expect(gravadasDe(segunda.prisma)).toHaveLength(1);
    expect(gravadasDe(segunda.prisma)[0]).toMatchObject({ valor_bruto: 8000 });
  });

  it('o mesmo conteúdo com CRLF, outra ordem de linhas ou outra opção de tributos continua sendo a mesma operação', async () => {
    const l1 = 'TRANSP-01;15/01/2027;Saída;12.500,00;MT;PR;12;CT-e';
    const l2 = 'TRANSP-01;16/01/2027;Saída;8.000,00;MT;SP;12;CT-e';
    const primeira = criar();
    await primeira.service.importar(csv([l1, l2]), MAPA, undefined);
    const crlf = { buffer: Buffer.from([CABECALHO, l2, l1].join('\r\n'), 'utf8'), originalname: 'outro-nome.csv' };
    const segunda = criar(jaGravadas(gravadasDe(primeira.prisma)));
    const r = await segunda.service.importar(crlf, MAPA, '{"preencherTributos":false}');
    expect(r).toMatchObject({ importadas: 0, jaExistiam: 2 });
  });

  it('duas linhas idênticas na mesma planilha são duas operações (IDs -1 e -2), e o reenvio continua sem duplicar', async () => {
    const igual = 'TRANSP-01;15/01/2027;Saída;100,00;MT;PR;12;CT-e';
    const primeira = criar();
    await primeira.service.importar(csv([igual, igual]), MAPA, undefined);
    const gravadas = gravadasDe(primeira.prisma);
    expect(gravadas).toHaveLength(2);
    expect(gravadas[0].id_operacao).toMatch(/^PL[0-9a-f]{12}-1$/);
    expect(gravadas[1].id_operacao).toMatch(/-2$/);
    expect(gravadas[0].id_operacao.slice(0, -2)).toBe(gravadas[1].id_operacao.slice(0, -2));
    const segunda = criar(jaGravadas(gravadas));
    expect(await segunda.service.importar(csv([igual, igual]), MAPA, undefined)).toMatchObject({ importadas: 0, jaExistiam: 2 });
  });

  it('com a empresa escolhida para todas as linhas a coluna Empresa não é lida: a linha não vai para outra empresa do grupo', async () => {
    const { service, prisma } = criar();
    const r = await service.importar(csv(['12345678000195;15/01/2027;Saída;12.500,00;MT;PR;12;CT-e']), MAPA, '{"empresaPadrao":"TRANSP-02"}');
    expect(r).toMatchObject({ importadas: 1, comErro: 0 });
    expect(gravadasDe(prisma)[0].empresa_id).toBe('TRANSP-02'); // o CNPJ da coluna seria o da TRANSP-01
  });

  it('com o grupo informado só as empresas dele valem; grupo inexistente é recusado', async () => {
    const { service, prisma } = criar();
    await service.validar(csv(['TRANSP-01;15/01/2027;Saída;100,00;MT;PR;12;CT-e']), MAPA, '{"grupoId":"g-1"}');
    expect(prisma.grupo.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'g-1' } }));
    expect(prisma.empresa.findMany.mock.calls[0][0].where).toEqual({ grupo: 'G1' });
    const semGrupo = criar([], { grupo: null });
    await expect(semGrupo.service.validar(csv(['TRANSP-01;15/01/2027;Saída;100,00;MT;PR;12;CT-e']), MAPA, '{"grupoId":"g-x"}')).rejects.toThrow(/Grupo não encontrado/);
  });

  it('nota que já entrou pelo XML (mesma chave, mesma empresa) fica de fora e é contada à parte', async () => {
    const mapa = JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3, documento_chave: 4 });
    const arquivo = {
      buffer: Buffer.from(['Empresa;Data;Entrada/Saída;Valor;Chave', `TRANSP-01;15/01/2027;Saída;1.000,00;${CHAVE_NFE}`, 'TRANSP-01;16/01/2027;Saída;2.000,00;'].join('\n'), 'utf8'),
      originalname: 'notas.csv',
    };
    const { service, prisma } = criar([], { xml: [{ empresa_id: 'db-t1', chave_nfe: CHAVE_NFE }] });
    const r = await service.importar(arquivo, mapa, undefined);
    expect(r).toMatchObject({ importadas: 1, jaExistiam: 1, jaExistiamPorXml: 1 });
    expect(r.alertas.join(' ')).toMatch(/já entrou pelo XML/);
    expect(gravadasDe(prisma)).toHaveLength(1);
    expect(gravadasDe(prisma)[0].valor_bruto).toBe(2000);
    // outra empresa com a mesma chave não é barrada
    const outra = criar([], { xml: [{ empresa_id: 'db-t2', chave_nfe: CHAVE_NFE }] });
    expect(await outra.service.importar(arquivo, mapa, undefined)).toMatchObject({ importadas: 2, jaExistiamPorXml: 0 });
  });

  it('matriz e filial dividem o id_empresa (a raiz do CNPJ): a nota importada por XML numa delas é achada, qualquer que seja a ordem do cadastro', async () => {
    const matriz = { id: 'db-matriz', id_empresa: '12345678', cnpj_cpf: '12.345.678/0001-95', regime_atual: 'Lucro Presumido', status: 'Ativa' };
    const filial = { id: 'db-filial', id_empresa: '12345678', cnpj_cpf: '12.345.678/0002-76', regime_atual: 'Lucro Presumido', status: 'Ativa' };
    const mapa = JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3, documento_chave: 4 });
    const arquivo = { buffer: Buffer.from(['Empresa;Data;Entrada/Saída;Valor;Chave', `12345678;15/01/2027;Saída;1.000,00;${CHAVE_NFE}`].join('\n'), 'utf8'), originalname: 'notas.csv' };
    for (const ordem of [[matriz, filial], [filial, matriz]]) {
      const { service } = criar([], { empresas: ordem, xml: [{ empresa_id: 'db-matriz', chave_nfe: CHAVE_NFE, numero_item: 1 }] });
      const r = await service.validar(arquivo, mapa, undefined);
      expect(r).toMatchObject({ novas: 0, duplicadas: 1, duplicadasPorXml: 1 });
    }
  });

  it('nota importada em parte pelo XML: se o XML trouxe tantos itens quantas são as linhas, a nota está dentro; se trouxe menos, as linhas entram com aviso', async () => {
    const mapa = JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3, documento_chave: 4 });
    const arquivo = {
      buffer: Buffer.from(['Empresa;Data;Entrada/Saída;Valor;Chave', `TRANSP-01;15/01/2027;Saída;1.000,00;${CHAVE_NFE}`, `TRANSP-01;15/01/2027;Saída;2.000,00;${CHAVE_NFE}`].join('\n'), 'utf8'),
      originalname: 'itens.csv',
    };
    const tresItens = criar([], { xml: [1, 2, 3].map((n) => ({ empresa_id: 'db-t1', chave_nfe: CHAVE_NFE, numero_item: n })) });
    expect(await tresItens.service.validar(arquivo, mapa, undefined)).toMatchObject({ novas: 0, duplicadas: 2, duplicadasPorXml: 2 });
    const umItem = criar([], { xml: [{ empresa_id: 'db-t1', chave_nfe: CHAVE_NFE, numero_item: 1 }] });
    const r = await umItem.service.validar(arquivo, mapa, undefined);
    expect(r).toMatchObject({ novas: 2, duplicadas: 0, duplicadasPorXml: 0, comAviso: 2 });
    expect(r.alertas.join(' ')).toMatch(/1 nota\(s\) já têm itens importados por XML, mas menos que as linhas/);
    expect(r.amostraValidas[0].avisos.join(' ')).toMatch(/já tem 1 item\(ns\) importado\(s\) por XML e a planilha traz 2 linha\(s\)/);
  });

  it('linha já importada com percentual ou classificação diferente: não é alterada, e o resumo conta e avisa', async () => {
    const linha = 'TRANSP-01;15/01/2027;Saída;12.500,00;MT;PR;12;CT-e';
    const primeira = criar();
    await primeira.service.importar(csv([linha]), MAPA, undefined);
    const gravadas = gravadasDe(primeira.prisma);
    // a mesma linha, sem mudança: nada diferente
    const igual = criar(jaGravadas(gravadas));
    expect(await igual.service.validar(csv([linha]), MAPA, undefined)).toMatchObject({ duplicadas: 1, jaExistiamDiferentes: 0 });
    // a mesma linha com o ICMS corrigido (12% → 7%): é a mesma operação e o gravado não muda
    const corrigido = criar(jaGravadas(gravadas));
    const r = await corrigido.service.importar(csv(['TRANSP-01;15/01/2027;Saída;12.500,00;MT;PR;7;CT-e']), MAPA, undefined);
    expect(r).toMatchObject({ importadas: 0, jaExistiam: 1, jaExistiamDiferentes: 1 });
    expect(r.alertas.join(' ')).toMatch(/1 linha\(s\) já importada\(s\) trazem percentual ou classificação diferente.*NÃO foram alteradas/);
    expect(corrigido.prisma.operacao.createMany).not.toHaveBeenCalled();
    // só mudou a opção de preencher os tributos (PIS/Cofins pela tabela viram 0): também é diferença
    const semTabela = criar(jaGravadas(gravadas));
    expect(await semTabela.service.validar(csv([linha]), MAPA, '{"preencherTributos":false}')).toMatchObject({ jaExistiamDiferentes: 1 });
  });

  it('formato com "%" só como texto (0,00"%") não multiplica por 100: PIS 0,65 continua 0,65% e não vira 65%', async () => {
    const cab = ['Empresa', 'Data', 'Entrada/Saída', 'Valor', 'PIS %'];
    const mapaP = JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3, pis_pct: 4 });
    const arquivo = await xlsx(cab, [['TRANSP-01', '15/01/2027', 'Saída', 1000, 0.65]], { E2: '0.00"%"' });
    const { service, prisma } = criar();
    await service.importar(arquivo, mapaP, '{"preencherTributos":false}');
    expect(gravadasDe(prisma)[0].pis_pct).toBeCloseTo(0.0065, 10);
    const real = await xlsx(cab, [['TRANSP-01', '15/01/2027', 'Saída', 1000, 0.0065]], { E2: '0.00%' });
    const outra = criar();
    await outra.service.importar(real, mapaP, '{"preencherTributos":false}');
    expect(gravadasDe(outra.prisma)[0].pis_pct).toBeCloseTo(0.0065, 10);
  });

  it('ID da operação repetido na planilha: a segunda ocorrência vira erro', async () => {
    const { service } = criar();
    const mapa = JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3, id_operacao: 7 });
    const r = await service.validar(csv(['TRANSP-01;15/01/2027;Saída;100;;;;A1', 'TRANSP-01;16/01/2027;Saída;200;;;;A1']), mapa, undefined);
    expect(r).toMatchObject({ novas: 1, comErro: 1 });
    expect(r.amostraErros[0].erros[0]).toMatch(/repetido/);
  });

  it('compras sem crédito elegível geram um alerta único no resumo', async () => {
    const { service } = criar();
    const r = await service.validar(csv(['TRANSP-01;15/01/2027;Entrada;1.000,00;MT;MT;12;NF-e', 'TRANSP-01;16/01/2027;Entrada;2.000,00;MT;MT;12;NF-e']), MAPA, undefined);
    expect(r.comprasSemCredito).toBe(2);
    expect(r.alertas.join(' ')).toMatch(/2 compra\(s\) entram sem crédito elegível/);
    expect(r.alertas.join(' ')).toMatch(/2 compra\(s\) entram sem PIS\/Cofins/);
    const comCredito = await service.validar(csv(['TRANSP-01;15/01/2027;Entrada;1.000,00;MT;MT;12;NF-e']), MAPA, '{"creditoElegivelCompras":1}');
    expect(comCredito.comprasSemCredito).toBe(0);
  });

  it('suspeita de percentual em fração lido como pontos', async () => {
    const { service } = criar();
    const linhas = ['A', 'B', 'C'].map((_, i) => `TRANSP-01;1${i}/01/2027;Saída;1.000,00;MT;PR;0,12;CT-e`);
    const r = await service.validar(csv(linhas), MAPA, undefined);
    expect(r.alertas.join(' ')).toMatch(/Se a planilha traz fração/);
    const certo = await service.validar(csv(linhas), MAPA, '{"unidadePct":"fracao"}');
    expect(certo.alertas.join(' ')).not.toMatch(/Se a planilha traz fração/);
  });

  it('a suspeita vale também para PIS e Cofins, e o alerta sai na importação, não só na conferência', async () => {
    const cab = 'Empresa;Data;Entrada/Saída;Valor;PIS %;Cofins %';
    const linhas = [0, 1, 2].map((i) => `TRANSP-01;1${i}/01/2027;Saída;1.000,00;0,0165;0,076`);
    const arquivo = { buffer: Buffer.from([cab, ...linhas].join('\n'), 'utf8'), originalname: 'pis.csv' };
    const mapa = JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3, pis_pct: 4, cofins_pct: 5 });
    const { service } = criar();
    const v = await service.validar(arquivo, mapa, undefined);
    expect(v.alertas.join(' ')).toMatch(/Todos os valores de PIS ficaram abaixo de 0,1%/);
    expect(v.alertas.join(' ')).toMatch(/Todos os valores de Cofins ficaram abaixo de 0,1%/); // 0,076 em pontos é 0,076%: fração de 7,6%
    const i = await criar().service.importar(arquivo, mapa, undefined);
    expect(i.alertas.join(' ')).toMatch(/Todos os valores de PIS ficaram abaixo de 0,1%/);
  });

  it('PIS de 0,65% (Lucro Presumido) em pontos NÃO dispara o alerta de fração', async () => {
    const cab = 'Empresa;Data;Entrada/Saída;Valor;PIS %;Cofins %';
    const linhas = [0, 1, 2].map((i) => `TRANSP-01;1${i}/01/2027;Saída;1.000,00;0,65;3`);
    const mapa = JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3, pis_pct: 4, cofins_pct: 5 });
    const r = await criar().service.validar({ buffer: Buffer.from([cab, ...linhas].join('\n'), 'utf8'), originalname: 'pis.csv' }, mapa, undefined);
    expect(r.alertas.join(' ')).not.toMatch(/ficaram abaixo/);
  });

  it('mapeamento incompleto é recusado com a razão', async () => {
    const { service } = criar();
    const arq = csv(['TRANSP-01;15/01/2027;Saída;100;MT;PR;12;CT-e']);
    await expect(service.validar(arq, JSON.stringify({ empresa: 0, direcao: 2, valor_bruto: 3 }), undefined)).rejects.toThrow(/data/);
    await expect(service.validar(arq, JSON.stringify({ empresa: 0, data: 1, direcao: 2 }), undefined)).rejects.toThrow(/valor/);
    await expect(service.validar(arq, JSON.stringify({ data: 1, direcao: 2, valor_bruto: 3 }), undefined)).rejects.toThrow(/empresa/);
    await expect(service.validar(arq, JSON.stringify({ empresa: 0, data: 1, valor_bruto: 3 }), undefined)).rejects.toThrow(/Entrada ou Saída/);
    await expect(service.validar(arq, JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 2 }), undefined)).rejects.toThrow(/mesma coluna/);
  });

  it('formato .xls e arquivo vazio são recusados', async () => {
    const { service } = criar();
    await expect(service.previa({ buffer: Buffer.from('x'), originalname: 'a.xls' })).rejects.toThrow(/\.xls/);
    await expect(service.previa({ buffer: Buffer.alloc(0), originalname: 'a.csv' })).rejects.toThrow(BadRequestException);
  });

  it('um CSV em Latin-1 (exportação comum de ERP brasileiro) é lido com os acentos', async () => {
    const { service } = criar();
    const latin1 = Buffer.from([CABECALHO, 'TRANSP-01;15/01/2027;Saída;100,00;MT;PR;12;CT-e'].join('\n'), 'latin1');
    const p = await service.previa({ buffer: latin1, originalname: 'erp.csv' });
    expect(p.cabecalho[2]).toBe('Entrada/Saída');
    const r = await service.validar({ buffer: latin1, originalname: 'erp.csv' }, MAPA, undefined);
    expect(r.novas).toBe(1);
  });

  it('o nome do arquivo com acento chega do multer em latin1 e vai certo para a observação da operação', async () => {
    const { service, prisma } = criar();
    await service.importar({ ...csv(['TRANSP-01;15/01/2027;Saída;100,00;MT;PR;12;CT-e']), originalname: 'operaÃ§Ãµes.csv' }, MAPA, undefined);
    expect(gravadasDe(prisma)[0].observacao_dfe).toContain('operações.csv');
  });

  it('a linha informada num erro é a linha física do arquivo, mesmo com linhas em branco no meio (CSV)', async () => {
    const { service } = criar();
    const arquivo = csv(['TRANSP-01;15/01/2027;Saída;100,00;MT;PR;12;CT-e', '', '', 'XXX;17/01/2027;Saída;100,00;MT;PR;12;CT-e']);
    const r = await service.validar(arquivo, MAPA, undefined);
    expect(r.amostraErros[0].linha).toBe(5); // cabeçalho 1, linha boa 2, brancas 3 e 4, erro 5
  });
});

describe('XLSX: o tipo da célula decide a leitura', () => {
  const CAB = ['Empresa', 'Data', 'Entrada/Saída', 'Valor', 'PIS %', 'Cofins %', 'ICMS %'];
  const MAPA_X = JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3, pis_pct: 4, cofins_pct: 5, icms_pct: 6 });

  it('célula formatada como percentual (1,65% guardado como 0,0165) é lida como 1,65%, sem dividir por 100 de novo', async () => {
    const arquivo = await xlsx(CAB, [['TRANSP-01', '15/01/2027', 'Saída', 12500, 0.0165, 0.076, 0.12]], { E2: '0.00%', F2: '0.00%', G2: '0%' });
    const { service, prisma } = criar();
    const r = await service.importar(arquivo, MAPA_X, undefined);
    expect(r).toMatchObject({ importadas: 1, comErro: 0 });
    const g = gravadasDe(prisma)[0];
    expect(g.pis_pct).toBeCloseTo(0.0165, 10);
    expect(g.cofins_pct).toBeCloseTo(0.076, 10);
    expect(g.icms_pct).toBeCloseTo(0.12, 10);
    expect(r.alertas.join(' ')).not.toMatch(/ficaram abaixo/);
  });

  it('número comum (sem formato de percentual) continua em pontos: 12 é 12%', async () => {
    const arquivo = await xlsx(CAB, [['TRANSP-01', '15/01/2027', 'Saída', 12500, 1.65, 7.6, 12]]);
    const { service, prisma } = criar();
    await service.importar(arquivo, MAPA_X, undefined);
    const g = gravadasDe(prisma)[0];
    expect(g.pis_pct).toBeCloseTo(0.0165, 10);
    expect(g.icms_pct).toBeCloseTo(0.12, 10);
  });

  it('texto "12.500" numa célula de texto vale 12.500, como no CSV; o número 12500,5 e o texto "12.500,00" também', async () => {
    const arquivo = await xlsx(['Empresa', 'Data', 'Entrada/Saída', 'Valor'], [
      ['TRANSP-01', '15/01/2027', 'Saída', '12.500'],
      ['TRANSP-01', '16/01/2027', 'Saída', 12500.5],
      ['TRANSP-01', '17/01/2027', 'Saída', '12.500,00'],
      ['TRANSP-01', '18/01/2027', 'Saída', '-R$ 1.234,56'],
    ]);
    const { service, prisma } = criar();
    await service.importar(arquivo, JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3 }), undefined);
    expect(gravadasDe(prisma).map((g) => g.valor_bruto)).toEqual([12500, 12500.5, 12500, -1234.56]);
  });

  it('data como célula de data do Excel e a linha física do erro (linhas em branco no meio)', async () => {
    const arquivo = await xlsx(['Empresa', 'Data', 'Entrada/Saída', 'Valor'], [
      ['TRANSP-01', new Date(Date.UTC(2027, 0, 15)), 'Saída', 100],
      [],
      [],
      ['XXX', new Date(Date.UTC(2027, 0, 16)), 'Saída', 100],
    ]);
    const { service } = criar();
    const r = await service.validar(arquivo, JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3 }), undefined);
    expect(r).toMatchObject({ novas: 1, comErro: 1 });
    expect(r.amostraErros[0].linha).toBe(5);
    expect(r.porAno).toEqual({ '2027': 1 });
  });

  it('código desfigurado pelo Excel: cClassTrib 1 e NCM sem o zero viram 000001 e 01012100', async () => {
    const arquivo = await xlsx(['Empresa', 'Data', 'Entrada/Saída', 'Valor', 'cClassTrib', 'NCM'], [['TRANSP-01', '15/01/2027', 'Saída', 100, 1, 1012100]]);
    const { service, prisma } = criar();
    await service.importar(arquivo, JSON.stringify({ empresa: 0, data: 1, direcao: 2, valor_bruto: 3, c_class_trib: 4, ncm: 5 }), undefined);
    expect(gravadasDe(prisma)[0]).toMatchObject({ c_class_trib: '000001', ncm: '01012100' });
  });
});
