import { describe, expect, it, vi } from 'vitest';
import { BaseLegalService } from './base-legal.service';
import { paginaDoPortal } from './base-legal.deteccao';

describe('página inicial ou lista de portal não é o endereço de um ato', () => {
  it('reconhece a página inicial e a lista do portal (com ou sem idioma no caminho)', () => {
    for (const u of ['https://www.cgibs.gov.br', 'https://www.cgibs.gov.br/', 'https://www.gov.br/receitafederal', 'https://www.gov.br/receitafederal/pt-br', 'https://www.cgibs.gov.br/atos-tecnicos-conjuntos']) {
      expect(paginaDoPortal(u), u).toBe(true);
    }
  });

  it('aceita a página ou o PDF do próprio ato', () => {
    for (const u of [
      'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/D13140.htm',
      'https://www.cgibs.gov.br/upload/arquivos/202610/30102301-atc-10-vf-assinado-assinado-261030-102245.pdf',
      'https://legis.senado.leg.br/norma/43615089',
      'https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=127905',
      'https://www.sefa.pa.gov.br/lei.pdf',
    ]) {
      expect(paginaDoPortal(u), u).toBe(false);
    }
  });
});

describe('aprovar aviso de norma nova citada no Radar', () => {
  function montar(existia = false) {
    const prisma = {
      alertaBaseLegal: {
        findUnique: vi.fn(async () => ({ id: 'a1', tipo: 'nova_norma', status: 'pendente', referencia: 'decreto 13140/2026', titulo: 'Decreto 13140/2026 citada no Radar e ainda não está na Base legal', url: 'https://www.gov.br/receitafederal' })),
        update: vi.fn(async () => ({})),
      },
      normaLegal: {
        findUnique: vi.fn(async () => (existia ? { id: 'n1' } : null)),
        upsert: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const service = new BaseLegalService(prisma as any, { get: () => undefined } as any, {} as any);
    return { prisma, service };
  }

  it('recusa a página inicial do portal (o endereço que o Radar guardou) sem cadastrar nada', async () => {
    const { service, prisma } = montar();
    await expect(service.resolverAlerta('a1', 'aprovar', 'admin@x')).rejects.toThrow('página inicial');
    expect(prisma.normaLegal.upsert).not.toHaveBeenCalled();
    expect(prisma.alertaBaseLegal.update).not.toHaveBeenCalled();
  });

  it('texto não lido: a norma recém-criada sai do cadastro (só se continuar sem dispositivo) e o aviso continua pendente', async () => {
    const { service, prisma } = montar(false);
    vi.spyOn(service, 'importar').mockRejectedValue(new Error('Não foi possível identificar os dispositivos'));
    await expect(service.resolverAlerta('a1', 'aprovar', 'admin@x', 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/D13140.htm')).rejects.toThrow('dispositivos');
    const chave = (prisma.normaLegal.upsert.mock.calls[0] as any[])[0].where.chave;
    expect(prisma.normaLegal.deleteMany).toHaveBeenCalledWith({ where: { chave, total_dispositivos: 0 } });
    expect(prisma.alertaBaseLegal.update).not.toHaveBeenCalled();
  });

  it('norma que já existia não é apagada quando a leitura falha', async () => {
    const { service, prisma } = montar(true);
    vi.spyOn(service, 'importar').mockRejectedValue(new Error('fora do ar'));
    await expect(service.resolverAlerta('a1', 'aprovar', 'admin@x', 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/D13140.htm')).rejects.toThrow('fora do ar');
    expect(prisma.normaLegal.deleteMany).not.toHaveBeenCalled();
  });

  it('com o endereço do ato, carrega o texto e marca o aviso como aprovado', async () => {
    const { service, prisma } = montar(false);
    vi.spyOn(service, 'importar').mockResolvedValue({ chave: 'decreto-13140-2026', alterada: true, dispositivos: 3 } as any);
    const r = await service.resolverAlerta('a1', 'aprovar', 'admin@x', 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/D13140.htm');
    expect(r.resultado).toMatchObject({ dispositivos: 3 });
    expect(prisma.normaLegal.deleteMany).not.toHaveBeenCalled();
    expect(prisma.alertaBaseLegal.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'aprovado' }) }));
  });
});
