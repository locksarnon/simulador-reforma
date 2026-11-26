/**
 * Memória com 30 mil itens (QA com Postgres real: pico de 2,9 GiB no comparar e no Excel de revisão; liberar a v2, 2,4 GiB).
 * Base sintética com o tamanho do QA: 30 mil itens, 9 camadas (270 mil células), 190 mil decisões e casos de conjunto.
 * A medição pesada só roda com SAN_MEMORIA=excel | comparar | liberar (um cenário por processo: o pico do RSS não volta);
 * sem a variável, o mesmo caminho roda com 2 mil itens para conferir o resultado.
 *   npx vitest run src/saneamento-estoques/entregaveis/memoria.test.ts   (com SAN_MEMORIA=excel no ambiente)
 */
import { describe, expect, it } from 'vitest';
import { SanVersoesService } from '../dados/versoes.service';
import { criarPrismaFalso } from '../dados/prisma-falso';
import { gerarExcelDeDados } from './excel';

const CENARIO = process.env.SAN_MEMORIA ?? '';
const N = CENARIO ? 30_000 : 2_000;
const DECISOES = CENARIO ? 190_000 : 12_000;
const CAMADAS = ['IDENTIFICACAO', 'QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE', 'NOMES_UNIDADES', 'NCM', 'TRIBUTARIO', 'OBRIGACOES', 'ESTOQUE'];
const MB = (b: number) => Math.round(b / 1048576);
const picoRss = () => process.resourceUsage().maxRSS * 1024; // maxRSS vem em KB

function base() {
  const sanItem = []; const sanCelula = []; const sanDecisao = []; const sanCaso = [];
  for (let k = 0; k < N; k++) {
    const id = `it${String(k).padStart(6, '0')}`;
    sanItem.push({
      id, projeto_id: 'P1', codigo: String(k).padStart(8, '0'), estabelecimento: '', descricao: `PRODUTO AGRÍCOLA ${k} EMBALAGEM 20KG`, grupo: `GRUPO ${k % 40}`, finalidade: 'REVENDA', tambem_usado_como: [],
      conjunto_chave: '31052000|REVENDA', ativo: true, versao: 2,
      trabalho: { descricao: `PRODUTO AGRÍCOLA ${k} EMBALAGEM 20KG`, unidade: 'KG', ncm: '31052000', grupo: `GRUPO ${k % 40}`, ativo: true, finalidade: 'REVENDA', fabricante: 'FABRICANTE PADRÃO LTDA', campos: { cClassTrib: '200003', cst: '200', unidadeCompra: 'TON', fatorConversao: 1000 } },
    });
    CAMADAS.forEach((camada, j) => sanCelula.push({ id: `ce${k}_${j}`, projeto_id: 'P1', item_id: id, camada, situacao: k % 5 ? 'APROVADO' : 'PROPOSTO', revisar: false, caso_id: k % 5 ? null : `ca${k % 500}`, grupo: `GRUPO ${k % 40}` }));
  }
  for (let c = 0; c < 2_000; c++) {
    const itens = Array.from({ length: c < 20 ? 1_000 : 5 }, (_, j) => sanItem[(c * 7 + j) % N].id);
    sanCaso.push({
      id: `ca${c}`, projeto_id: 'P1', camada: CAMADAS[c % 8], tipo: 'UNIDADE_CONVERSAO', itens, problema: `Unidade fora do padrão no conjunto ${c}`, evidencia: [{ rotulo: 'Itens do conjunto', valor: String(itens.length) }],
      atual: { unidade: 'TON' }, proposta: { unidade: 'KG', fatorConversao: 1000 }, justificativa: 'Conversão pela tabela de unidades', fundamento: 'Política de unidades', situacao: c % 3 ? 'APROVADO' : 'PROPOSTO',
      motivo: null, responsavel: 'ana', decidido_por: 'ana@fal.test', decidido_em: new Date('2026-11-10T12:00:00Z'), origem: 'REGRA', parecer_ia: null, createdAt: new Date(Date.UTC(2026, 10, 1) + c * 1000),
    });
  }
  for (let d = 0; d < DECISOES; d++) {
    sanDecisao.push({
      id: `de${String(d).padStart(7, '0')}`, projeto_id: 'P1', item_id: sanItem[d % N].id, caso_id: `ca${d % 2_000}`, campo: d % 2 ? 'unidade' : 'descricao',
      antes: d % 2 ? 'TON' : `PROD ${d}`, depois: d % 2 ? 'KG' : `PRODUTO AGRÍCOLA ${d}`, fundamento: 'Política de unidades e nomes', usuario: 'ana@fal.test', tipo: 'aprovar', quando: new Date(Date.UTC(2026, 10, 1) + d * 1000),
    });
  }
  const r = criarPrismaFalso({
    sanProjeto: [{ id: 'P1', diagnostico_id: 'D1', empresa_id: 'E1', data_base: new Date('2026-12-31T00:00:00Z'), erp: 'SAP', modulos: { conciliacao: true }, parametros: {}, atividades: [] }],
    sanItem, sanCelula, sanDecisao, sanCaso,
  });
  // Sem a cópia de segurança do Prisma em memória (JSON da base inteira), que não existe no Postgres e sujaria a medição.
  r.prisma.$transaction = (fn: (tx: unknown) => Promise<unknown>) => fn(r.prisma);
  return r;
}

/** Mede o pico do RSS de uma etapa acima da base já carregada (o Prisma em memória segura a base inteira, como o Postgres não faria). */
async function medir<T>(rotulo: string, f: () => Promise<T>): Promise<T> {
  (globalThis as { gc?: () => void }).gc?.();
  const antes = process.memoryUsage();
  const picoAntes = picoRss();
  const t0 = performance.now();
  const r = await f();
  const depois = process.memoryUsage();
  // eslint-disable-next-line no-console
  console.log(`[memória ${rotulo}] ${N} itens, ${DECISOES} decisões: ${((performance.now() - t0) / 1000).toFixed(1)} s · RSS antes ${MB(antes.rss)} MB · pico do processo ${MB(Math.max(picoRss(), picoAntes))} MB (subiu ${MB(Math.max(0, picoRss() - antes.rss))} MB acima do RSS de antes) · heap depois ${MB(depois.heapUsed)} MB`);
  return r;
}

describe('Memória do Saneamento com base grande', () => {
  // Referência: só a base em memória (o menor teto de heap com que ela cabe; os cenários abaixo somam a isso).
  it.runIf(CENARIO === 'base')('só a base sintética', () => {
    const { db } = base();
    expect(db.sanItem).toHaveLength(N);
  });

  it.runIf(!CENARIO || CENARIO === 'excel')('Excel de revisão (base atual)', async () => {
    const { prisma } = base();
    const v = new SanVersoesService(prisma as never);
    const buf = await medir('excel', async () => gerarExcelDeDados(await v.exportarAtual('P1'), { consumir: true }));
    expect(buf.length).toBeGreaterThan(100_000);
  }, 600_000);

  it.runIf(!CENARIO || CENARIO === 'liberar')('liberar uma versão', async () => {
    const { prisma } = base();
    const v = new SanVersoesService(prisma as never);
    const r = await medir('liberar', () => v.criar('P1', { rotulo: 'Entrega 1' }, { email: 'ana@fal.test' }));
    const dados = await v.exportar('P1', r.id);
    expect(dados.itens).toHaveLength(N);
    expect(dados.decisoes).toHaveLength(DECISOES);
    expect(dados.celulas).toHaveLength(N * CAMADAS.length);
  }, 600_000);

  it.runIf(!CENARIO || CENARIO === 'comparar')('comparar duas versões', async () => {
    const { prisma, db } = base();
    const v = new SanVersoesService(prisma as never);
    const v1 = await v.criar('P1', { rotulo: 'Entrega 1' }, { email: 'ana@fal.test' });
    for (let k = 0; k < N; k += 10) db.sanItem[k].trabalho = { ...db.sanItem[k].trabalho, unidade: 'SC' };
    db.sanCelula[0].situacao = 'SEM_PROBLEMA';
    db.sanCaso[1].situacao = 'REJEITADO';
    const v2 = await v.criar('P1', { rotulo: 'Entrega 2' }, { email: 'ana@fal.test' });
    db.sanDecisao.length = 0; db.sanCelula.length = 0; db.sanCaso.length = 0; // a comparação só lê as fotos
    const r = await medir('comparar', () => v.comparar('P1', v1.id, v2.id));
    expect(r.totais).toEqual({ acrescentados: 0, retirados: 0, alterados: N / 10, celulasMudaram: 1, casosMudaram: 1 });
    expect(r.alterados[0].campos).toEqual([{ campo: 'unidade', antes: 'KG', depois: 'SC' }]);
  }, 600_000);
});
