import { describe, expect, it, vi } from 'vitest';
import { BaseLegalService } from './base-legal.service';

const linha = (o: Record<string, unknown> = {}) => ({
  chave: 'lcp-214-2025', numero: 'LC 214/2025', norma_situacao: 'vigente', rotulo: 'Art. 5º', caminho: 'art-5', secao: null, revogado: false, parcialmente_revogado: false, trecho: 'ouro como [[ativo financeiro]]', rank: 0.4, ...o,
});

function montar(linhas: unknown[][] = [[linha()]]) {
  const consultas = [...linhas];
  const prisma = {
    $queryRawUnsafe: vi.fn(async () => consultas.shift() ?? []),
    dispositivoLegal: { findMany: vi.fn(async () => []) },
  };
  return { prisma, service: new BaseLegalService(prisma as any, { get: () => undefined } as any, {} as any) };
}

describe('busca de texto em todas as normas', () => {
  it('devolve, por achado, se o dispositivo e a norma estão revogados, e a consulta põe o revogado por último', async () => {
    const achados = [linha(), ...Array.from({ length: 5 }, (_, i) => linha({ caminho: `art-${10 + i}`, rotulo: `Art. ${10 + i}` })), linha({ caminho: 'art-3', rotulo: 'Art. 3º', revogado: true, norma_situacao: 'revogada' })];
    const { service, prisma } = montar([achados]);
    const r = await service.buscar('ouro paga IBS');
    expect(r.resultados).toHaveLength(7);
    expect(r.resultados.at(-1)).toMatchObject({ revogado: true, norma_situacao: 'revogada' });
    const sql = (prisma.$queryRawUnsafe.mock.calls[0] as unknown[])[0] as string;
    expect(sql).toContain('n."situacao" AS "norma_situacao"');
    expect(sql).toContain('d."revogado", d."parcialmente_revogado"');
    expect(sql).toContain('ORDER BY d."revogado" ASC, rank DESC');
    // procura em todas as normas: sem filtro de norma
    expect(sql).not.toContain('n."chave" = $2');
  });

  it('restringe a uma norma quando pedido, e a busca por artigo traz o revogado e a situação da norma', async () => {
    const { service, prisma } = montar([[linha()]]);
    await service.buscar('crédito presumido do produtor', 'lcp-214-2025');
    const chamada = prisma.$queryRawUnsafe.mock.calls[0] as unknown[];
    expect(chamada[0]).toContain('n."chave" = $2');
    expect(chamada.slice(1)).toEqual(['crédito presumido do produtor', 'lcp-214-2025']);

    await service.buscar('art 164');
    const select = (prisma.dispositivoLegal.findMany.mock.calls[0] as any[])[0].select;
    expect(select).toMatchObject({ revogado: true, norma: { select: { chave: true, numero: true, situacao: true } } });
  });

  it('pergunta de poucas palavras reforça com "qualquer palavra" sem repetir o que já veio', async () => {
    const { service } = montar([[linha()], [linha(), linha({ caminho: 'art-9', rotulo: 'Art. 9º' })]]);
    const r = await service.buscar('ouro paga imposto sobre bens e serviços');
    expect(r.parcial).toBe(true);
    expect(r.resultados.map((x: { caminho: string }) => x.caminho)).toEqual(['art-5', 'art-9']);
  });

  it('texto curto demais não consulta o banco', async () => {
    const { service, prisma } = montar();
    expect(await service.buscar('a')).toEqual({ exatos: [], resultados: [], parcial: false });
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
