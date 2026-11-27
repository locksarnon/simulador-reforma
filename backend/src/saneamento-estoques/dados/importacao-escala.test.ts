/** A2: a escolha "dividir por 1.000.000" vai da prévia à confirmação e fica registrada na importação. */
import { describe, expect, it } from 'vitest';
import { SanImportacaoService } from './importacao.service';
import { ImportadorPlanilha } from './importador.provider';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };
const CSV = Buffer.from(['Codigo;Descricao;Unidade de Medida de Estoque;Codigo da Unidade de Medida;Quantidade em Estoque', '118;ANEL ELASTICO;UNIDADE;UN;24000000', '12320;CONECTOR 8 VIAS;UNIDADE;UN;2000000', '2186;ADUBO;QUILOGRAM;KG;0', '77;LONA;METRO QUA;M2;9070000'].join('\n'), 'utf8');

async function montar() {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-10-31T00:00:00Z'), responsavel: 'Ana' }],
    empresa: [{ id: 'E1', cnae_principal: '0115600', cnae_descricao: 'Soja', dados_publicos_em: null }],
  });
  const projetos = new SanProjetoService(prisma as never);
  const importacao = new SanImportacaoService(prisma as never, projetos, new ImportadorPlanilha());
  const p = await projetos.criar('D1', USER);
  await projetos.confirmarAtividades(p.id, p.versao, USER);
  return { db, importacao, p };
}

describe('importação com o saldo ×1.000.000', () => {
  it('prévia: detecta e sugere a unidade pelo código; sem escolha, nada é dividido', async () => {
    const { importacao, p } = await montar();
    const r = await importacao.previa(p.id, { buffer: CSV, nome: 'itens.csv' });
    expect(r.relatorio.escalaSaldo).toMatchObject({ coluna: 'Quantidade em Estoque', detectada: 1e6, aplicada: 1, anterior: null });
    expect(r.mapeamento.unidade).toBe('Codigo da Unidade de Medida');
    expect(r.sugestao.colunas.find((c) => c.nome === 'Codigo da Unidade de Medida')?.exemplos).toEqual(['UN', 'KG', 'M2']);
  });
  it('confirmação com a escolha: saldos divididos, registro no relatório e a próxima prévia lembra o divisor anterior', async () => {
    const { db, importacao, p } = await montar();
    const r = await importacao.confirmar(p.id, { buffer: CSV, nome: 'itens.csv' }, undefined, [], USER, '1000000');
    expect(r.escalaSaldo).toMatchObject({ detectada: 1e6, aplicada: 1e6 });
    expect(db.sanItem.map((i: { trabalho: { saldo: number } }) => i.trabalho.saldo)).toEqual([24, 2, 0, 9.07]);
    expect((db.sanImportacao[0].relatorio as { escalaSaldo: { aplicada: number } }).escalaSaldo.aplicada).toBe(1e6);
    const de_novo = await importacao.previa(p.id, { buffer: CSV, nome: 'itens.csv' }, undefined, { escalaSaldo: '1000000' });
    expect(de_novo.relatorio.escalaSaldo).toMatchObject({ aplicada: 1e6, anterior: 1e6 });
    expect(de_novo.alterados).toBe(0); // mesma escolha: nenhum saldo muda
    await expect(importacao.previa(p.id, { buffer: CSV, nome: 'itens.csv' }, undefined, { escalaSaldo: 'x' })).rejects.toThrow(/inteiro positivo/);
  });
});
