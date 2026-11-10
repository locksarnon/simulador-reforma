import { describe, expect, it, vi } from 'vitest';
import { RevisaoLegalService } from './revisao-legal.service';

const LC214 = { chave: 'lcp-214-2025', numero: 'LC 214/2025' };

const CARTAO_PUBLICADO = {
  id: 'c1', pergunta: 'Qual o limite do produtor rural?', status: 'revisado',
  fundamentos: [{ norma: 'lcp-214-2025', caminho: 'art-164', trecho: 'receita inferior a R$ 3.600.000,00' }],
};
const CARTAO_RASCUNHO = { id: 'c2', pergunta: 'Como é o split payment?', status: 'rascunho', fundamentos: [{ norma: 'lcp-214-2025', caminho: 'art-31', trecho: '' }] };

/** Prisma e e-mail falsos com só o que a fila de revisão usa. */
function montar(cenario: { cartoes?: unknown[]; marcos?: unknown[]; para?: string; configurado?: boolean; falhaNoEnvio?: boolean } = {}) {
  const prisma = {
    cartaoLegal: { findMany: vi.fn().mockResolvedValue(cenario.cartoes ?? []), updateMany: vi.fn().mockReturnValue('atualiza-cartoes') },
    agendaMarco: { findMany: vi.fn().mockResolvedValue(cenario.marcos ?? []) },
    revisaoLegal: {
      createMany: vi.fn().mockReturnValue('grava-fila'), findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }), deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const mail = {
    emailInterno: cenario.para ?? 'admin@falagro.com.br', configurado: cenario.configurado ?? true, urlPublica: 'https://simulador.clarityib.com.br',
    enviar: cenario.falhaNoEnvio ? vi.fn().mockRejectedValue(new Error('SMTP caiu')) : vi.fn().mockResolvedValue({ enviado: true }),
  };
  return { prisma, mail, service: new RevisaoLegalService(prisma as any, mail as any) };
}

describe('fila de revisão pela lei', () => {
  it('cartão publicado que cita o dispositivo volta para rascunho, entra na fila com o motivo e o administrador é avisado', async () => {
    const { service, prisma, mail } = montar({ cartoes: [CARTAO_PUBLICADO, CARTAO_RASCUNHO] });
    const r = await service.registrarMudancas(LC214, [{ caminho: 'art-164', rotulo: 'Art. 164', mudanca: 'alterado', texto: 'Receita inferior a R$ 4.800.000,00' }]);

    const gravado = prisma.revisaoLegal.createMany.mock.calls[0][0].data;
    expect(gravado).toEqual(expect.arrayContaining([
      expect.objectContaining({ tipo: 'cartao', alvo_id: 'c1', caminho: 'art-164', rotulo: 'Art. 164', norma_numero: 'LC 214/2025', mudanca: 'alterado', detalhe: 'O trecho citado no cartão não consta mais no texto do dispositivo.' }),
      expect.objectContaining({ tipo: 'fundamento', alvo_id: 'produtor_rural', caminho: 'art-164' }),
    ]));
    expect(prisma.cartaoLegal.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['c1'] }, status: 'revisado' }, data: { status: 'rascunho', revisado_por: null, revisado_em: null } });
    expect(prisma.$transaction).toHaveBeenCalledWith(['grava-fila', 'atualiza-cartoes']);
    expect(r).toEqual({ cartoes: 1, cartoes_despublicados: 1, fundamentos: 1, marcos: 0, itens: 2 });

    expect(mail.enviar).toHaveBeenCalledTimes(1);
    const email = mail.enviar.mock.calls[0][0];
    expect(email.to).toBe('admin@falagro.com.br');
    expect(email.subject).toContain('para revisar: LC 214/2025 mudou na Base legal');
    expect(email.text).toContain('Qual o limite do produtor rural?');
  });

  it('cartão que já era rascunho entra na fila mas não é "despublicado" de novo', async () => {
    const { service, prisma } = montar({ cartoes: [CARTAO_RASCUNHO] });
    const r = await service.registrarMudancas(LC214, [{ caminho: 'art-31', rotulo: 'Art. 31', mudanca: 'revogado' }]);
    expect(prisma.cartaoLegal.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(['grava-fila']);
    expect(r.cartoes).toBe(1);
    expect(r.cartoes_despublicados).toBe(0);
  });

  it('marcos da agenda cuja fonte mudou entram na fila', async () => {
    const marco = { id: 'm1', titulo: 'Inventário do estoque', norma_chave: 'lcp-214-2025', caminho: 'art-381', fonte_trecho: 'último dia de junho de 2027' };
    const { service, prisma } = montar({ marcos: [marco] });
    const r = await service.registrarMudancas(LC214, [{ caminho: 'art-381', rotulo: 'Art. 381', mudanca: 'alterado', texto: 'até o último dia de junho de 2027' }]);
    expect(prisma.agendaMarco.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ativo: true, norma_chave: 'lcp-214-2025', caminho: { in: ['art-381'] } } }));
    expect(r.marcos).toBe(1);
    expect(prisma.revisaoLegal.createMany.mock.calls[0][0].data).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: 'marco', alvo_id: 'm1' })]));
  });

  it('mudança em dispositivo que ninguém cita não grava nada nem manda e-mail', async () => {
    const { service, prisma, mail } = montar({ cartoes: [CARTAO_PUBLICADO] });
    const r = await service.registrarMudancas(LC214, [{ caminho: 'art-1', rotulo: 'Art. 1º', mudanca: 'alterado', texto: 'x' }]);
    expect(r).toEqual({ cartoes: 0, cartoes_despublicados: 0, fundamentos: 0, marcos: 0, itens: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mail.enviar).not.toHaveBeenCalled();
  });

  it('sem lista de mudanças não consulta o banco', async () => {
    const { service, prisma } = montar();
    expect(await service.registrarMudancas(LC214, [])).toMatchObject({ itens: 0 });
    expect(prisma.cartaoLegal.findMany).not.toHaveBeenCalled();
  });

  it('sem endereço interno ou com o e-mail desligado, a fila é gravada e só o aviso por e-mail deixa de sair', async () => {
    for (const cenario of [{ para: '' }, { configurado: false }]) {
      const { service, prisma, mail } = montar({ cartoes: [CARTAO_PUBLICADO], ...cenario });
      const r = await service.registrarMudancas(LC214, [{ caminho: 'art-164', rotulo: 'Art. 164', mudanca: 'alterado' }]);
      expect(r.itens).toBeGreaterThan(0);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mail.enviar).not.toHaveBeenCalled();
    }
  });

  it('falha no envio do e-mail não desfaz nem derruba a revisão', async () => {
    const { service, prisma, mail } = montar({ cartoes: [CARTAO_PUBLICADO], falhaNoEnvio: true });
    const r = await service.registrarMudancas(LC214, [{ caminho: 'art-164', rotulo: 'Art. 164', mudanca: 'alterado' }]);
    expect(mail.enviar).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(r.cartoes_despublicados).toBe(1);
  });

  it('o impacto só lê: conta quem cita e não grava', async () => {
    const { service, prisma } = montar({ cartoes: [CARTAO_PUBLICADO, CARTAO_RASCUNHO] });
    const i = await service.impacto(LC214, [{ caminho: 'art-164', rotulo: 'Art. 164', mudanca: 'alterado' }, { caminho: 'art-31', rotulo: 'Art. 31', mudanca: 'alterado' }]);
    expect(i).toEqual({ cartoes: 2, publicados: 1, fundamentos: 2, marcos: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(await service.impacto(LC214, [])).toEqual({ cartoes: 0, publicados: 0, fundamentos: 0, marcos: 0 });
  });

  it('conferir um item tira da fila só as revisões pendentes dele', async () => {
    const { service, prisma } = montar();
    const r = await service.resolver('fundamento', 'split_payment', 'ana@falagro.com.br');
    expect(r).toEqual({ resolvidas: 2 });
    expect(prisma.revisaoLegal.updateMany).toHaveBeenCalledWith({
      where: { tipo: 'fundamento', alvo_id: 'split_payment', status: 'pendente' },
      data: { status: 'resolvida', resolvida_por: 'ana@falagro.com.br', resolvida_em: expect.any(Date) },
    });
  });

  it('agrupa as pendências por item e apaga a fila de um cartão excluído', async () => {
    const { service, prisma } = montar();
    prisma.revisaoLegal.findMany.mockResolvedValue([{ id: 'r1', alvo_id: 'c1' }, { id: 'r2', alvo_id: 'c1' }, { id: 'r3', alvo_id: 'c2' }]);
    const porAlvo = await service.pendentesPorAlvo('cartao', ['c1', 'c2', 'c3']);
    expect(porAlvo.get('c1')).toHaveLength(2);
    expect(porAlvo.get('c2')).toHaveLength(1);
    expect(porAlvo.has('c3')).toBe(false);
    expect((await service.pendentesPorAlvo('cartao', [])).size).toBe(0);
    await service.descartar('cartao', 'c1');
    expect(prisma.revisaoLegal.deleteMany).toHaveBeenCalledWith({ where: { tipo: 'cartao', alvo_id: 'c1' } });
  });
});
