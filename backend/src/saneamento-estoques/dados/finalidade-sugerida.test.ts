/** Tabela: a finalidade proposta pela camada Grupos e finalidade aparece como "sugerida" enquanto o caso não é aprovado. */
import { describe, expect, it } from 'vitest';
import { SanCasosService } from './casos.service';
import { SanImportacaoService } from './importacao.service';
import { SanItensService } from './itens.service';
import { type ImportadorPort, type ItemImportado } from './portas';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };
const item = (codigo: string, linha: number, finalidade: string | null = null): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo: 'Adubos', ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: finalidade as never, campos: {}, linha,
});
const caso = (tipo: string, itens: string[], finalidade: string) => ({
  camada: 'GRUPOS_FINALIDADE', tipo, itens, problema: 'p', evidencia: [], atual: { finalidade: null }, proposta: { finalidade }, justificativa: 'j', fundamento: null, impactos: [], origem: 'REGRA' as const, afeta: [],
});

describe('finalidade sugerida na tabela', () => {
  it('caso em aberto: sugerida (exceção vale mais que o grupo); item com finalidade não recebe sugestão', async () => {
    const { prisma, db } = criarPrismaFalso({
      projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
      empresa: [{ id: 'E1', erp: 'SAP', cnae_principal: '0115600', cnae_descricao: 'Soja', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
    });
    const itens = [item('A1', 1), item('A2', 2), item('A3', 3, 'REVENDA')];
    const importador: ImportadorPort = { ler: async () => ({ itens, mapeamento: {}, relatorio: { aceitas: 3, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
    const projetos = new SanProjetoService(prisma as never);
    const casos = new SanCasosService(prisma as never, projetos);
    const p = await projetos.criar('D1', USER);
    await projetos.confirmarAtividades(p.id, 1, USER);
    await new SanImportacaoService(prisma as never, projetos, importador).confirmar(p.id, { buffer: Buffer.from('x'), nome: 'c.xlsx' }, undefined, [], USER);
    const id = Object.fromEntries(db.sanItem.map((i) => [i.codigo, i.id]));
    await casos.registrarResultado(p.id, { camada: 'GRUPOS_FINALIDADE', analisados: 3, semDados: null, semProblema: [], casos: [
      caso('FINALIDADE_GRUPO', [id.A1, id.A3], 'INSUMO_PRODUCAO'), caso('FINALIDADE_EXCECAO', [id.A2], 'USO_CONSUMO'),
    ] } as never);
    const l = await new SanItensService(prisma as never).listar(p.id, { limite: 10 });
    const sug = Object.fromEntries(l.itens.map((i) => [i.codigo, (i as { finalidadeSugerida: string | null }).finalidadeSugerida]));
    expect(sug).toEqual({ A1: 'INSUMO_PRODUCAO', A2: 'USO_CONSUMO', A3: null });
  });
});
