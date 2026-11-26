import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { analisarArquivo, conferirBase, gerarPrevia, importarArquivo } from './index';
import { corrigirMapeamento } from './mapeamento';

const csv = (linhas: string[][], sep = ';') => ({ buffer: Buffer.from(linhas.map((l) => l.join(sep)).join('\n'), 'utf8'), originalname: 'estoque.csv' });

const CAB = ['ItemCode', 'ItemName', 'InvntryUom', 'NCMCode', 'ItmsGrpNam', 'frozenFor', 'OnHand', 'LastPurDat', 'WhsCode', 'Cor'];
const BASE = [
  CAB,
  ['00123', 'Parafuso sextavado', 'UN', '73181500', 'Fixadores', 'N', '1.250,5', '15/03/2024', '01', 'azul'],
  ['00124', 'Porca M10', 'UN', '01012100', 'Fixadores', 'Y', '10', '2024-01-02', '01', ''],
  ['', 'Sem código', 'UN', '73181500', 'Fixadores', 'N', '1', '', '01', ''],
  ['00125', '', 'UN', '73181500', 'Fixadores', 'N', '1', '', '01', ''],
  ['00123', 'Parafuso repetido', 'UN', '73181500', 'Fixadores', 'N', '1', '', '01', ''], // duplicada (mesmo estab.)
  ['00123', 'Parafuso da filial 2', 'UN', '73181500', 'Fixadores', 'N', '2', '', '02', ''], // mesmo código, outro estab.: vale
  ['1E5', 'Código que parece número', '', '1E5', '', '', 'abc', '31/02/2024', '01', ''], // pendente em vários pontos
];

describe('importação: do arquivo à base', () => {
  it('analisa o arquivo e sugere o mapeamento', async () => {
    const { previa, sugestao } = await analisarArquivo(csv(BASE));
    expect(previa.total).toBe(7);
    expect(previa.cabecalho).toEqual(CAB);
    expect(previa.exemplos[0]).toBe('00123');
    expect(sugestao.faltando).toEqual([]);
    expect(sugestao.semanticaAtivo).toBe('BLOQUEADO');
  });

  it('confere linha a linha: aceitas, rejeitadas (com motivo), pendentes e duplicidade só no mesmo estabelecimento', async () => {
    const { sugestao } = await analisarArquivo(csv(BASE));
    const r = await importarArquivo(csv(BASE), { mapeamento: sugestao.mapeamento, semanticaAtivo: sugestao.semanticaAtivo, hoje: new Date(Date.UTC(2026, 10, 25)) });
    expect(r.relatorio.totais).toEqual({ linhas: 7, aceitas: 3, pendentes: 1, rejeitadas: 3, importaveis: 4 });
    const motivos = Object.fromEntries(r.relatorio.motivosRejeicao.map((m) => [m.codigo, m]));
    expect(motivos.CODIGO_VAZIO.quantidade).toBe(1);
    expect(motivos.DESCRICAO_VAZIA.quantidade).toBe(1);
    expect(motivos.DUPLICADO_NO_ARQUIVO.quantidade).toBe(1);
    expect(motivos.DUPLICADO_NO_ARQUIVO.exemplos[0]).toMatchObject({ linha: 6, codigo: '00123' });
    expect(r.relatorio.linhasRejeitadas.find((l) => l.linha === 6)?.ocorrencias[0]).toMatch(/primeira ocorrência na linha 2/);
    // itens: primeira ocorrência vale; filial 02 do mesmo código entra
    expect(r.itens.map((i) => `${i.codigo}/${i.estabelecimento}`)).toEqual(['00123/01', '00124/01', '00123/02', '1E5/01']);
    expect(r.origem.map((o) => o.linhaOrigem)).toEqual([2, 3, 7, 8]);
    expect(new Set(r.origem.map((o) => o.chave)).size).toBe(4);
    const [a, b, , p] = r.itens;
    expect(a).toMatchObject({ codigo: '00123', descricao: 'Parafuso sextavado', unidade: 'UN', ncm: '73181500', grupo: 'Fixadores', ativo: true, saldo: 1250.5, ultimaMovimentacao: '2024-03-15', campos: { Cor: 'azul' } });
    expect(b).toMatchObject({ ncm: '01012100', ativo: false, ultimaMovimentacao: '2024-01-02' }); // frozenFor=Y -> inativo; zero do NCM preservado
    expect(p).toMatchObject({ codigo: '1E5', ncm: '1E5', saldo: null, ultimaMovimentacao: null });
    const pend = Object.fromEntries(r.relatorio.pendencias.map((m) => [m.codigo, m.quantidade]));
    expect(pend).toMatchObject({ UNIDADE_AUSENTE: 1, NCM_INVALIDO: 1, GRUPO_AUSENTE: 1, ATIVO_INDEFINIDO: 1, SALDO_INVALIDO: 1, DATA_INVALIDA: 1 });
  });

  it('relatório traz arquivo, hash sha256 estável e o mapeamento usado', async () => {
    const arq = csv(BASE);
    const { sugestao } = await analisarArquivo(arq);
    const r1 = await importarArquivo(arq, { mapeamento: sugestao.mapeamento });
    const r2 = await importarArquivo(csv(BASE), { mapeamento: sugestao.mapeamento });
    expect(r1.relatorio.arquivo).toMatchObject({ nome: 'estoque.csv', formato: 'csv', tamanhoBytes: arq.buffer.length });
    expect(r1.relatorio.arquivo.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r1.relatorio.arquivo.sha256).toBe(r2.relatorio.arquivo.sha256);
    expect(r1.relatorio.mapeamentoUsado.codigo).toEqual({ indice: 0, nome: 'ItemCode' });
    expect(r1.relatorio.colunasExtras).toEqual(['Cor']);
  });

  it('prévia: total, primeiro valor por coluna, 10 primeiras linhas normalizadas e contagens, sem itens', async () => {
    const { sugestao } = await analisarArquivo(csv(BASE));
    const p = await gerarPrevia(csv(BASE), { mapeamento: sugestao.mapeamento, semanticaAtivo: 'BLOQUEADO' });
    expect(p.totalLinhas).toBe(7);
    expect(p.colunas[3]).toEqual({ indice: 3, nome: 'NCMCode', primeiroValor: '73181500' });
    expect(p.amostra).toHaveLength(7);
    expect(p.amostra[2].situacao).toBe('REJEITADA');
    expect(p.contagens).toMatchObject({ aceitas: 3, pendentes: 1, rejeitadas: 3 });
  });

  it('correção do consultor muda o resultado; mapeamento inválido é recusado', async () => {
    const { sugestao, previa } = await analisarArquivo(csv(BASE));
    const m = corrigirMapeamento(sugestao.mapeamento, { grupo: null, estabelecimento: null });
    const r = await importarArquivo(csv(BASE), { mapeamento: m, colunasExtras: 'nenhuma' }, previa.cabecalho);
    expect(r.itens.every((i) => i.estabelecimento === null && i.grupo === null && Object.keys(i.campos).length === 0)).toBe(true);
    expect(r.relatorio.totais.rejeitadas).toBe(4); // sem estabelecimento, a filial 02 também é repetida
    await expect(importarArquivo(csv(BASE), { mapeamento: { codigo: 0 } })).rejects.toThrow(/descrição/i);
  });

  it('estabelecimento fixo para planilha de um depósito só', async () => {
    const r = await importarArquivo(csv([['Codigo', 'Descricao'], ['A1', 'Item']]), { mapeamento: { codigo: 0, descricao: 1 }, estabelecimentoFixo: 'DEP 01' });
    expect(r.itens[0].estabelecimento).toBe('DEP 01');
    expect(r.origem[0].chave).toBe('6:DEP 01|A1');
  });

  it('coluna numérica do Excel: NCM de 7 dígitos recupera o zero e o aviso aparece', () => {
    const r = conferirBase(
      { cabecalho: ['Codigo', 'Descricao', 'NCM'], linhas: [['10', 'Cavalo', '1012100']], ncmNumerico: [true, false, true] },
      { mapeamento: { codigo: 0, descricao: 1, ncm: 2 } }, { nome: 'x.xlsx', buffer: Buffer.from('x'), formato: 'xlsx' },
    );
    expect(r.itens[0].ncm).toBe('01012100');
    expect(r.relatorio.avisos.join(' ')).toMatch(/zeros à esquerda/);
  });

  it('lê XLSX com código e NCM em texto (padrão dos testes de Excel; no Windows esta leitura falha por ambiente)', async () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Itens');
    ws.addRow(['Código', 'Descrição', 'NCM', 'Última movimentação', 'Saldo']);
    ws.addRow(['000123', 'Parafuso', '01012100', new Date(Date.UTC(2026, 0, 15)), 1234.5]);
    const arq = { buffer: Buffer.from(await wb.xlsx.writeBuffer()), originalname: 'e.xlsx' };
    const { sugestao } = await analisarArquivo(arq);
    const r = await importarArquivo(arq, { mapeamento: sugestao.mapeamento });
    expect(r.itens[0]).toMatchObject({ codigo: '000123', ncm: '01012100', ultimaMovimentacao: '2026-01-15', saldo: 1234.5 });
  });
});

describe('desempenho: 30 mil linhas x 40 colunas', () => {
  it('lê, confere e importa sem estourar memória', async () => {
    const cab = ['ItemCode', 'ItemName', 'InvntryUom', 'NCMCode', 'ItmsGrpNam', 'frozenFor', 'OnHand', 'LastPurDat', ...Array.from({ length: 32 }, (_, i) => `Campo${i + 1}`)];
    const linhas: string[] = [cab.join(';')];
    for (let i = 0; i < 30000; i++) {
      const base = [String(i).padStart(7, '0'), `Item sintético ${i}`, 'UN', '73181500', `Grupo ${i % 50}`, i % 7 ? 'N' : 'Y', String((i % 500) + 0.5).replace('.', ','), '15/03/2024'];
      for (let c = 0; c < 32; c++) base.push(c % 4 ? `v${c}-${i % 97}` : '');
      linhas.push(base.join(';'));
    }
    const arq = { buffer: Buffer.from(linhas.join('\n'), 'utf8'), originalname: 'grande.csv' };
    const antes = process.memoryUsage().rss; const t0 = Date.now();
    const { sugestao, previa } = await analisarArquivo(arq);
    const r = await importarArquivo(arq, { mapeamento: sugestao.mapeamento, semanticaAtivo: sugestao.semanticaAtivo }, previa.cabecalho);
    const ms = Date.now() - t0; const mb = Math.round((process.memoryUsage().rss - antes) / 1048576);
    console.log(`30 mil linhas x 40 colunas: ${ms} ms, rss +${mb} MB`);
    expect(r.relatorio.totais).toMatchObject({ linhas: 30000, aceitas: 30000, rejeitadas: 0 });
    expect(r.itens[29999].codigo).toBe('0029999');
    expect(Object.keys(r.itens[0].campos)).toHaveLength(32 - 8); // 8 colunas vazias nunca viram campo
    expect(ms).toBeLessThan(30000);
    expect(mb).toBeLessThan(800);
  }, 60000);
});
