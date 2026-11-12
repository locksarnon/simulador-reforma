import { describe, expect, it, vi } from 'vitest';
import { BaseLegalService } from './base-legal.service';
import { extrairDispositivos, htmlParaTexto, sha256 } from './base-legal.parser';

const HTML_ANTIGO = '<p>Art. 1º Primeiro.</p><p>Art. 2º Segundo, texto antigo.</p><p>Art. 3º Terceiro, texto antigo.</p><p>Art. 4º Quarto.</p>';
const HTML_NOVO = '<p>Art. 1º Primeiro.</p><p>Art. 2º Segundo, texto novo.</p><p>Art. 3º (Revogado pela Lei X)</p><p>Art. 5º Quinto, novo.</p>';

const NORMA = { id: 'n1', chave: 'lcp-214-2025', numero: 'LC 214/2025', url_oficial: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm', hash_atual: 'hash-velho', total_dispositivos: 4 };

/** Dispositivos como estavam gravados antes da atualização. */
const gravados = () => extrairDispositivos(htmlParaTexto(HTML_ANTIGO)).map((d, i) => ({ id: `d${i + 1}`, caminho: d.caminho, rotulo: d.rotulo, texto: d.texto, hash: sha256(d.texto), revogado: d.revogado }));

const RESUMO = { cartoes: 1, cartoes_despublicados: 1, fundamentos: 0, marcos: 0, itens: 1 };

function montar(opcoes: { revisao?: Record<string, unknown>; texto?: string } = {}) {
  const prisma = {
    normaLegal: { upsert: vi.fn(), findUnique: vi.fn().mockResolvedValue(NORMA), findMany: vi.fn().mockResolvedValue([NORMA]), update: vi.fn() },
    dispositivoLegal: { findMany: vi.fn().mockResolvedValue(gravados()), update: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
    dispositivoLegalVersao: { create: vi.fn() },
    alertaBaseLegal: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'a1' }), update: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const revisao = {
    registrarMudancas: vi.fn().mockResolvedValue(RESUMO),
    impacto: vi.fn().mockResolvedValue({ cartoes: 0, publicados: 0, fundamentos: 0, marcos: 0 }),
    ...opcoes.revisao,
  };
  const service = new BaseLegalService(prisma as any, { get: () => undefined } as any, revisao as any);
  vi.spyOn(service as any, 'baixarTexto').mockResolvedValue(htmlParaTexto(opcoes.texto ?? HTML_NOVO));
  return { prisma, revisao, service };
}

describe('atualização da Base legal devolve para revisão o que cita o texto alterado', () => {
  it('entrega à fila de revisão só o que mudou: texto alterado, revogado pelo texto e artigo que saiu; artigo novo e igual ficam de fora', async () => {
    const { service, revisao } = montar();
    const r = await service.importar('lcp-214-2025');

    expect(revisao.registrarMudancas).toHaveBeenCalledTimes(1);
    const [norma, mudancas] = revisao.registrarMudancas.mock.calls[0];
    expect(norma).toEqual({ chave: 'lcp-214-2025', numero: 'LC 214/2025' });
    expect(mudancas).toEqual([
      expect.objectContaining({ caminho: 'art-2', mudanca: 'alterado', texto: expect.stringContaining('texto novo') }),
      expect.objectContaining({ caminho: 'art-3', mudanca: 'revogado' }),
      { caminho: 'art-4', rotulo: 'Art. 4º', mudanca: 'revogado' },
    ]);
    expect(r).toMatchObject({ alterada: true, novos: 1, alterados: 2, removidos: 1, revisao: RESUMO });
  });

  it('a fila é registrada ANTES de o texto novo ser gravado', async () => {
    const { service, revisao, prisma } = montar();
    await service.importar('lcp-214-2025');
    const registro = revisao.registrarMudancas.mock.invocationCallOrder[0];
    const primeiraGravacao = Math.min(
      ...[prisma.$transaction, prisma.dispositivoLegal.update, prisma.dispositivoLegal.createMany, prisma.dispositivoLegal.updateMany, prisma.normaLegal.update]
        .flatMap((fn) => fn.mock.invocationCallOrder),
    );
    expect(registro).toBeLessThan(primeiraGravacao);
  });

  it('se a fila não puder ser gravada, nada do texto é gravado e a atualização pode ser repetida', async () => {
    const { service, prisma } = montar({ revisao: { registrarMudancas: vi.fn().mockRejectedValue(new Error('banco indisponível')) } });
    await expect(service.importar('lcp-214-2025')).rejects.toThrow('banco indisponível');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.dispositivoLegal.update).not.toHaveBeenCalled();
    expect(prisma.dispositivoLegal.createMany).not.toHaveBeenCalled();
    expect(prisma.dispositivoLegal.updateMany).not.toHaveBeenCalled();
    expect(prisma.normaLegal.update).not.toHaveBeenCalled();
  });

  it('um dispositivo que já estava revogado e continua fora do texto não volta à fila', async () => {
    const { service, prisma, revisao } = montar();
    prisma.dispositivoLegal.findMany.mockResolvedValue([...gravados().map((g) => (g.caminho === 'art-4' ? { ...g, revogado: true } : g))]);
    await service.importar('lcp-214-2025');
    const mudancas = revisao.registrarMudancas.mock.calls[0][1];
    expect(mudancas.map((m: { caminho: string }) => m.caminho)).toEqual(['art-2', 'art-3']);
  });

  it('um dispositivo que tinha saído do texto e voltou igual deixa de constar como revogado, sem ir para a fila', async () => {
    const { service, prisma, revisao } = montar({ texto: HTML_ANTIGO });
    prisma.dispositivoLegal.findMany.mockResolvedValue(gravados().map((g) => (g.caminho === 'art-4' ? { ...g, revogado: true } : g)));
    await service.importar('lcp-214-2025');
    expect(revisao.registrarMudancas.mock.calls[0][1]).toEqual([]);
    expect(prisma.dispositivoLegal.update).toHaveBeenCalledWith({ where: { id: 'd4' }, data: expect.objectContaining({ revogado: false }) });
    // os que não mudaram de situação não recebem o campo
    const doPrimeiro = prisma.dispositivoLegal.update.mock.calls.find((c: { where: { id: string } }[]) => c[0].where.id === 'd1')![0];
    expect(doPrimeiro.data).not.toHaveProperty('revogado');
  });

  it('texto oficial igual ao carregado não mexe na fila', async () => {
    const { service, prisma, revisao } = montar();
    prisma.normaLegal.findUnique.mockResolvedValue({ ...NORMA, hash_atual: sha256(htmlParaTexto(HTML_NOVO)) });
    const r = await service.importar('lcp-214-2025');
    expect(r.alterada).toBe(false);
    expect(revisao.registrarMudancas).not.toHaveBeenCalled();
  });

  it('o aviso de texto alterado diz quantos cartões, notas e marcos citam o que vai mudar', async () => {
    const { service, prisma, revisao } = montar();
    revisao.impacto.mockResolvedValue({ cartoes: 2, publicados: 1, fundamentos: 1, marcos: 0 });
    const r = await service.verificarAtualizacoes('manual');
    expect(r).toMatchObject({ verificadas: 1, alertas: 1 });
    const alerta = prisma.alertaBaseLegal.create.mock.calls[0][0].data;
    expect(alerta.detalhe).toContain('2 dispositivos alterados: Art. 2º, Art. 3º');
    expect(alerta.detalhe).toContain('Citam estes dispositivos: 2 cartões de pergunta frequente (1 publicado), 1 nota do cálculo.');
    // o impacto foi calculado sobre os dispositivos alterados e o que saiu do texto
    const citados = revisao.impacto.mock.calls[0][1].map((m: { caminho: string; mudanca: string }) => `${m.caminho}:${m.mudanca}`);
    expect(citados).toEqual(['art-2:alterado', 'art-3:alterado', 'art-4:revogado']);
  });

  it('se o cálculo do impacto falhar, o aviso de texto alterado sai do mesmo jeito, sem a frase', async () => {
    const { service, prisma } = montar({ revisao: { impacto: vi.fn().mockRejectedValue(new Error('x')) } });
    const r = await service.verificarAtualizacoes('manual');
    expect(r.alertas).toBe(1);
    expect(prisma.alertaBaseLegal.create.mock.calls[0][0].data.detalhe).not.toContain('Citam estes dispositivos');
  });
});
