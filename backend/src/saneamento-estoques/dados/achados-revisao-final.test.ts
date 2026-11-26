/**
 * Achados da revisão final do Saneamento: inativação vinda de Duplicidades conta só os códigos que saem (o que fica não é inativado) e a
 * reimportação avisa quando o separador decimal da coluna de saldo muda em relação à importação anterior.
 */
import { describe, expect, it } from 'vitest';
import { ajustesDosCasos, itensDoAjuste, linhasDeImpactoDoCaso } from './ajustes';
import { codigosParaAjustes } from './impactos-casos';
import { ImportadorPlanilha } from './importador.provider';
import { SanImportacaoService } from './importacao.service';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };

describe('INATIVOU vindo de Duplicidades: só os itens de `consolidar`', () => {
  const dup = { id: 'c1', projeto_id: 'P1', camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', itens: ['fica', 'sai'], justificativa: 'Inativar o duplicado', situacao: 'APROVADO', atual: {}, proposta: { decisao: 'PROPOR_INATIVACAO', manter: '100', consolidar: '200' } };
  const codigos = new Map([['fica', '100'], ['sai', '200']]);

  it('o ajuste por item e a linha de impacto contam só o código que sai', () => {
    const ajustes = ajustesDosCasos([dup], { dataBase: '2027-01-01', codigos });
    expect(ajustes.map((a) => [a.tipo, a.itemId])).toEqual([['INATIVOU', 'sai']]);
    const linhas = linhasDeImpactoDoCaso(dup, '2027-01-01', null, codigos);
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) expect(String(l.evidencia)).toMatch(/^Itens afetados: 1 ·/);
  });
  it('sem o código dos itens, nenhum item é dado como inativado (nunca o que fica)', () => {
    expect(itensDoAjuste(dup, 'INATIVOU')).toEqual([]);
    expect(linhasDeImpactoDoCaso(dup, '2027-01-01')).toEqual([]);
  });
  it('Qualidade sem movimentação: todos os itens do caso', () => {
    const sm = { ...dup, camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', proposta: { decisao: 'PROPOR_INATIVACAO', ativo: false } };
    expect(ajustesDosCasos([sm], { codigos: new Map() }).map((a) => a.itemId)).toEqual(['fica', 'sai']);
    for (const l of linhasDeImpactoDoCaso(sm, '2027-01-01')) expect(String(l.evidencia)).toMatch(/^Itens afetados: 2 ·/);
  });
  it('codigosParaAjustes lê o código só dos itens dos casos que precisam dele', async () => {
    const { prisma } = criarPrismaFalso({ sanItem: [{ id: 'fica', projeto_id: 'P1', codigo: '100' }, { id: 'sai', projeto_id: 'P1', codigo: '200' }, { id: 'outro', projeto_id: 'P1', codigo: '300' }] });
    const m = await codigosParaAjustes(prisma as never, [dup, { camada: 'QUALIDADE', proposta: { decisao: 'PROPOR_INATIVACAO' }, itens: ['outro'] }]);
    expect([...m.entries()].sort()).toEqual([['fica', '100'], ['sai', '200']]);
  });
});

describe('reimportação: separador decimal da coluna de saldo mudou', () => {
  const csv = (saldos: string[]) => ({ buffer: Buffer.from(['Codigo;Descricao;Saldo', ...saldos.map((s, i) => `C${i};Item ${i};${s}`)].join('\n'), 'utf8'), nome: 'estoque.csv' });
  async function montar() {
    const { prisma, db } = criarPrismaFalso({
      projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
      empresa: [{ id: 'E1', erp: 'SAP', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
    });
    const projetos = new SanProjetoService(prisma as never);
    const importacao = new SanImportacaoService(prisma as never, projetos, new ImportadorPlanilha());
    const p = await projetos.criar('D1', USER);
    await projetos.confirmarAtividades(p.id, 1, USER);
    return { db, importacao, projetoId: p.id };
  }

  it('importação guarda o separador; reimportação lida de outro jeito avisa quantos saldos mudam por isso', async () => {
    const c = await montar();
    // 1ª importação: só "x.yyy" (ambíguo) → lida como BR (milhar).
    const r1 = await c.importacao.confirmar(c.projetoId, csv(['1.250', '2.500', '12']), undefined, [], USER);
    expect(r1.separadores).toEqual({ saldo: { coluna: 'Saldo', separador: 'BR' } });
    expect(r1.separadorMudou).toEqual([]);
    expect((c.db.sanImportacao[0].relatorio as { separadores: unknown }).separadores).toEqual({ saldo: { coluna: 'Saldo', separador: 'BR' } });
    // Reimportação com "12.5": a coluna passa a ser lida com ponto; "1.250" e "2.500" mudam (1250 → 1,25; 2500 → 2,5), "12" e "12.5" não.
    const previa = await c.importacao.previa(c.projetoId, csv(['1.250', '2.500', '12', '12.5']));
    expect(previa.relatorio.separadorMudou).toEqual(['O separador decimal da coluna "Saldo" mudou de BR para ponto desde a última importação: 2 saldos mudam por isso; confira antes de incorporar.']);
    // Mesmo separador: sem aviso.
    const igual = await c.importacao.previa(c.projetoId, csv(['1.250', '7']));
    expect(igual.relatorio.separadorMudou).toEqual([]);
  });
  it('avisos da leitura chegam à prévia, à resposta da importação e ao relatório gravado (antes o importador os perdia)', async () => {
    const c = await montar();
    const ambiguo = 'Separador decimal ambíguo na coluna "Saldo": lido como milhar; confira (ex.: "1.250" foi lido como mil duzentos e cinquenta).';
    const previa = await c.importacao.previa(c.projetoId, csv(['1.250']));
    expect(previa.relatorio.avisos).toContain(ambiguo);
    const r = await c.importacao.confirmar(c.projetoId, csv(['1.250']), undefined, [], USER);
    expect(r.avisos).toContain(ambiguo);
    expect((c.db.sanImportacao[0].relatorio as { avisos: string[] }).avisos).toContain(ambiguo);
    const misturada = await c.importacao.previa(c.projetoId, csv(['12.5', '1.250', '1,5']));
    expect(misturada.relatorio.avisos).toContain('Coluna "Saldo" com separadores decimais misturados: lida como BR; confira a linha 2.');
  });
  it('primeira importação (sem anterior) não avisa', async () => {
    const c = await montar();
    const previa = await c.importacao.previa(c.projetoId, csv(['1.250', '12.5']));
    expect(previa.relatorio.separadorMudou).toEqual([]);
    expect(previa.relatorio.separadores).toEqual({ saldo: { coluna: 'Saldo', separador: 'PONTO' } });
  });
});
