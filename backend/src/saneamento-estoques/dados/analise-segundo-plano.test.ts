/** Análise em segundo plano: roda as camadas na ordem no servidor, recusa uma segunda ao mesmo tempo e para na que falhar. */
import { describe, expect, it } from 'vitest';
import type { AnalisadorCamada } from '../tipos';
import { SanCasosService } from './casos.service';
import { SanImportacaoService } from './importacao.service';
import { SanOrquestracaoService } from './orquestracao.service';
import { motorDeAnalisadores, type ImportadorPort, type ItemImportado } from './portas';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };
const item = (codigo: string, linha: number): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo: 'Adubos', ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha,
});
const vazio = (camada: string) => ({ camada: camada as never, analisados: 1, semDados: null, semProblema: [], casos: [] as never });

async function montar(analisadores: AnalisadorCamada[]) {
  const { prisma } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', erp: 'SAP', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const itens = [item('A1', 1), item('A2', 2)];
  const importador: ImportadorPort = { ler: async () => ({ itens, mapeamento: {}, relatorio: { aceitas: 2, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const orq = new SanOrquestracaoService(prisma as never, projetos, casos, motorDeAnalisadores(analisadores));
  const p = await projetos.criar('D1', USER);
  await projetos.confirmarAtividades(p.id, 1, USER);
  await new SanImportacaoService(prisma as never, projetos, importador).confirmar(p.id, { buffer: Buffer.from('x'), nome: 'c.xlsx' }, undefined, [], USER);
  return { orq, projetoId: p.id };
}
const terminar = async (orq: SanOrquestracaoService, id: string) => { for (let n = 0; n < 200 && orq.execucao(id)?.rodando; n++) await new Promise((ok) => setTimeout(ok, 5)); return orq.execucao(id)!; };

describe('análise em segundo plano', () => {
  it('responde na hora, roda as camadas na ordem e guarda o resultado', async () => {
    const ordem: string[] = [];
    let soltar!: () => void;
    const segura = new Promise<void>((ok) => { soltar = ok; });
    const { orq, projetoId } = await montar([
      { camada: 'QUALIDADE', analisar: () => { ordem.push('QUALIDADE'); return vazio('QUALIDADE'); } },
      { camada: 'NCM', analisar: () => { ordem.push('NCM'); return vazio('NCM'); } },
    ]);
    expect(orq.execucao(projetoId)).toBeNull();
    // segura o primeiro passo para conferir a recusa de uma segunda análise
    const original = orq.executarCamada.bind(orq);
    orq.executarCamada = (async (...a: Parameters<typeof original>) => { await segura; return original(...a); }) as typeof original;
    const ex = await orq.iniciarExecucao(projetoId, ['QUALIDADE', 'NCM']);
    expect(ex.rodando).toBe(true);
    await expect(orq.iniciarExecucao(projetoId, ['NCM'])).rejects.toThrow('Já há uma análise rodando');
    soltar();
    const fim = await terminar(orq, projetoId);
    expect(fim.rodando).toBe(false);
    expect(fim.erro).toBeNull();
    expect(fim.feitas.map((f) => f.camada)).toEqual(['QUALIDADE', 'NCM']);
    expect(ordem).toEqual(['QUALIDADE', 'NCM']);
    expect(fim.terminadaEm).toBeTruthy();
  });

  it('para na camada que falhar e diz onde', async () => {
    const { orq, projetoId } = await montar([
      { camada: 'QUALIDADE', analisar: () => vazio('QUALIDADE') },
      { camada: 'NCM', analisar: () => { throw new Error('falhou o NCM'); } },
      { camada: 'TRIBUTARIO', analisar: () => vazio('TRIBUTARIO') },
    ]);
    await orq.iniciarExecucao(projetoId, ['QUALIDADE', 'NCM', 'TRIBUTARIO']);
    const fim = await terminar(orq, projetoId);
    expect(fim.feitas.map((f) => f.camada)).toEqual(['QUALIDADE']);
    expect(fim.erro).toEqual({ camada: 'NCM', mensagem: 'falhou o NCM' });
  });

  it('recusa lista vazia e camada inválida antes de começar', async () => {
    const { orq, projetoId } = await montar([]);
    await expect(orq.iniciarExecucao(projetoId, [])).rejects.toThrow('Informe as camadas');
    await expect(orq.iniciarExecucao(projetoId, ['XYZ'])).rejects.toThrow();
    expect(orq.execucao(projetoId)).toBeNull();
  });
});
