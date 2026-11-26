/** Foto da versão escrita em partes e lida por seção (memória com 30 mil itens): o formato continua o mesmo do JSON.stringify antigo. */
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { criarPrismaFalso } from './prisma-falso';
import { gzipDaFoto, secoesDoJson, SanVersoesService } from './versoes.service';

const fotoExemplo = () => ({
  formato: 2, projeto: { id: 'P1', data_base: new Date('2026-12-31T00:00:00Z'), nome: 'Ação "teste" {com} [chaves], e vírgulas' },
  itens: Array.from({ length: 2500 }, (_, k) => ({ id: `i${k}`, codigo: String(k).padStart(6, '0'), trabalho: { descricao: `ITEM ${k} \\ "aspas" }{ ][`, campos: { casos: [1, 2], decisoes: 'x' } } })),
  celulas: [['i0', 'NCM', 'PROPOSTO', 1, null]],
  casos: [{ id: 'c1', situacao: 'APROVADO', proposta: { itens: '{"a":1}' } }],
  decisoes: [{ item_id: 'i0', campo: 'descricao', antes: '}', depois: '"', quando: new Date('2026-11-10T12:00:00Z') }],
  impactosSped: [], vinculos: [], importacoes: [{ id: 'imp', arquivo: 'a,b.xlsx' }],
});

describe('Foto da versão em partes', () => {
  it('o gzip escrito em partes descomprime para o mesmo JSON de JSON.stringify', async () => {
    const f = fotoExemplo();
    const novo = gunzipSync(await gzipDaFoto(f as never)).toString('utf8');
    expect(novo).toBe(JSON.stringify(f));
  });

  it('acha as seções do primeiro nível mesmo com chaves, aspas e nomes repetidos dentro dos valores', () => {
    const f = fotoExemplo();
    const texto = JSON.stringify(f);
    const s = secoesDoJson(texto);
    expect([...s.keys()]).toEqual(['formato', 'projeto', 'itens', 'celulas', 'casos', 'decisoes', 'impactosSped', 'vinculos', 'importacoes']);
    for (const k of s.keys()) {
      const [a, b] = s.get(k)!;
      expect(JSON.parse(texto.slice(a, b))).toEqual(JSON.parse(JSON.stringify((f as Record<string, unknown>)[k])));
    }
  });

  it('comparar lê fotos antigas (gravadas com JSON.stringify) e novas do mesmo jeito', async () => {
    const { prisma, db } = criarPrismaFalso({
      sanProjeto: [{ id: 'P1', atividades: [] }],
      sanItem: [{ id: 'i1', projeto_id: 'P1', codigo: '001', trabalho: { unidade: 'KG', campos: {} } }, { id: 'i2', projeto_id: 'P1', codigo: '002', trabalho: { unidade: 'UN', campos: {} } }],
      sanCelula: [{ id: 'ce1', projeto_id: 'P1', item_id: 'i1', camada: 'NCM', situacao: 'PROPOSTO' }],
      sanCaso: [{ id: 'c1', projeto_id: 'P1', camada: 'NCM', situacao: 'PROPOSTO', itens: ['i1'] }],
      sanDecisao: [{ id: 'd1', projeto_id: 'P1', item_id: 'i1', campo: 'unidade', antes: 'UN', depois: 'KG', tipo: 'aprovar', quando: new Date() }],
    });
    const v = new SanVersoesService(prisma as never);
    const v1 = await v.criar('P1', { rotulo: 'V1' });
    // regrava a v1 como as versões antigas eram gravadas
    const snap = db.sanVersaoSnapshot.find((s) => s.versao_id === v1.id)!;
    snap.dados = gzipSync(Buffer.from(JSON.stringify(JSON.parse(gunzipSync(Buffer.from(snap.dados)).toString('utf8'))), 'utf8'));
    db.sanItem[0].trabalho = { unidade: 'SC', campos: {} };
    db.sanCelula[0].situacao = 'APROVADO';
    db.sanCaso[0].situacao = 'APROVADO';
    const v2 = await v.criar('P1', { rotulo: 'V2' });
    const r = await v.comparar('P1', v1.id, v2.id);
    expect(r.totais).toEqual({ acrescentados: 0, retirados: 0, alterados: 1, celulasMudaram: 1, casosMudaram: 1 });
    expect(r.alterados[0]).toMatchObject({ codigo: '001', campos: [{ campo: 'unidade', antes: 'KG', depois: 'SC' }] });
    const exp = await v.exportar('P1', v2.id);
    expect(exp.decisoes).toEqual([expect.objectContaining({ campo: 'unidade', antes: 'UN', depois: 'KG' })]);
    expect(exp.decisoes[0]).not.toHaveProperty('id');
  });
});
