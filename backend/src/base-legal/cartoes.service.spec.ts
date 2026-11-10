import { describe, expect, it, vi } from 'vitest';
import { CartoesService } from './cartoes.service';

const CARTAO = {
  id: 'c1', tema: 'Produtor rural', pergunta: 'Qual o limite do produtor rural?', sinonimos: null, resposta: 'R$ 3,6 milhões.', ressalvas: null, status: 'rascunho',
  revisado_por: null, revisado_em: null, createdAt: new Date('2026-09-26'), updatedAt: new Date('2026-09-26'),
  fundamentos: [{ norma: 'lcp-214-2025', caminho: 'art-164', trecho: 'receita inferior a R$ 3.600.000,00' }],
};

function montar(cenario: { texto?: string | null; pendentes?: Map<string, unknown[]> } = {}) {
  const prisma = {
    cartaoLegal: {
      findUnique: vi.fn().mockResolvedValue(CARTAO), findMany: vi.fn().mockResolvedValue([CARTAO]),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...CARTAO, ...data })), delete: vi.fn().mockResolvedValue({}),
    },
    dispositivoLegal: {
      findFirst: vi.fn().mockResolvedValue(cenario.texto === null ? null : { texto: cenario.texto ?? 'O produtor com receita inferior a R$ 3.600.000,00 não é contribuinte.' }),
      findMany: vi.fn().mockResolvedValue([{ caminho: 'art-164', rotulo: 'Art. 164', norma: { chave: 'lcp-214-2025' } }]),
    },
    normaLegal: { findMany: vi.fn().mockResolvedValue([{ chave: 'lcp-214-2025', numero: 'LC 214/2025' }]) },
  };
  const revisao = {
    resolver: vi.fn().mockResolvedValue({ resolvidas: 1 }), descartar: vi.fn().mockResolvedValue(undefined),
    pendentesPorAlvo: vi.fn().mockResolvedValue(cenario.pendentes ?? new Map()),
  };
  return { prisma, revisao, service: new CartoesService(prisma as any, revisao as any) };
}

describe('revisar e publicar um cartão', () => {
  it('publica quando o trecho citado ainda consta no texto da lei, e tira o motivo pendente da fila', async () => {
    const { service, prisma, revisao } = montar();
    const r = await service.definirStatus('c1', 'revisado', 'admin@falagro.com.br');
    expect(r.status).toBe('revisado');
    expect(prisma.cartaoLegal.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: expect.objectContaining({ status: 'revisado', revisado_por: 'admin@falagro.com.br' }) });
    expect(revisao.resolver).toHaveBeenCalledWith('cartao', 'c1', 'admin@falagro.com.br');
  });

  it('não publica se o trecho citado já não consta no texto da lei, e a fila continua pendente', async () => {
    const { service, prisma, revisao } = montar({ texto: 'O produtor com receita inferior a R$ 4.800.000,00 não é contribuinte.' });
    await expect(service.definirStatus('c1', 'revisado', 'admin@falagro.com.br')).rejects.toThrow(/Não é possível publicar: lcp-214-2025\/art-164: o trecho não consta no texto/);
    expect(prisma.cartaoLegal.update).not.toHaveBeenCalled();
    expect(revisao.resolver).not.toHaveBeenCalled();
  });

  it('não publica se o dispositivo deixou de existir na Base legal', async () => {
    const { service, prisma } = montar({ texto: null });
    await expect(service.definirStatus('c1', 'revisado', 'admin@falagro.com.br')).rejects.toThrow('dispositivo não encontrado');
    expect(prisma.cartaoLegal.update).not.toHaveBeenCalled();
  });

  it('despublicar (voltar para rascunho) não depende do texto da lei e não mexe na fila', async () => {
    const { service, prisma, revisao } = montar({ texto: null });
    const r = await service.definirStatus('c1', 'rascunho', 'admin@falagro.com.br');
    expect(r.status).toBe('rascunho');
    expect(prisma.dispositivoLegal.findFirst).not.toHaveBeenCalled();
    expect(revisao.resolver).not.toHaveBeenCalled();
  });

  it('cartão que não existe', async () => {
    const { service, prisma } = montar();
    prisma.cartaoLegal.findUnique.mockResolvedValue(null);
    await expect(service.definirStatus('x', 'revisado', 'a@x.com')).rejects.toThrow('Cartão não encontrado');
  });
});

describe('lista de cartões e exclusão', () => {
  it('o administrador recebe os motivos pendentes de cada cartão; o consultor não', async () => {
    const pendentes = new Map([['c1', [{ id: 'r1', norma_chave: 'lcp-214-2025', norma_numero: 'LC 214/2025', caminho: 'art-164', rotulo: 'Art. 164', mudanca: 'alterado', detalhe: 'O texto do dispositivo mudou.', critica: false, mudou_em: new Date('2026-11-12T15:00:00Z') }]]]);
    const { service, revisao } = montar({ pendentes });
    const admin = await service.listar(true);
    expect(revisao.pendentesPorAlvo).toHaveBeenCalledWith('cartao', ['c1']);
    expect((admin[0] as { revisoes_pendentes: unknown[] }).revisoes_pendentes).toEqual([
      { id: 'r1', norma: 'lcp-214-2025', numero: 'LC 214/2025', caminho: 'art-164', rotulo: 'Art. 164', mudanca: 'alterado', detalhe: 'O texto do dispositivo mudou.', critica: false, mudou_em: new Date('2026-11-12T15:00:00Z') },
    ]);
    revisao.pendentesPorAlvo.mockClear();
    const consultor = await service.listar(false);
    expect(revisao.pendentesPorAlvo).not.toHaveBeenCalled();
    expect(consultor[0]).not.toHaveProperty('revisoes_pendentes');
  });

  it('excluir um cartão apaga também a fila dele', async () => {
    const { service, revisao } = montar();
    await service.remover('c1');
    expect(revisao.descartar).toHaveBeenCalledWith('cartao', 'c1');
  });
});
