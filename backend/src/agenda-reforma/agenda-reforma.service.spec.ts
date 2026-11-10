import { describe, expect, it, vi } from 'vitest';
import { AgendaReformaService } from './agenda-reforma.service';
import { MARCOS_INICIAIS } from './agenda.marcos';
import { lerDataIso } from './agenda.regras';

const d = (iso: string) => lerDataIso(iso) as Date;
const AGORA = new Date('2026-11-10T12:00:00Z'); // 10/11/2026 em Brasília

const FONTE = { instrumento: 'Lei Complementar nº 214, de 16 de janeiro de 2025', dispositivo: 'art. 381, § 4º, I', data: '2025-01-16', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm', trecho: 'até o último dia de junho de 2027', norma_chave: 'lcp-214-2025', caminho: 'art-381' };

/** Linha da tabela AgendaMarco como o Prisma devolve. */
const linha = (extra: Record<string, unknown> & { chave: string }) => ({
  id: extra.chave, titulo: extra.chave, descricao: 'Descrição do marco.', categoria: 'Transição', tipo: 'marco', data: d('2027-01-01'), data_fim: null,
  regimes: [] as string[], ufs: [] as string[], fontes: [FONTE], confirmado: true, lida_em: d('2026-11-10'), observacao: null, ativo: true,
  createdAt: new Date('2026-11-01T00:00:00Z'), updatedAt: new Date('2026-11-01T00:00:00Z'), ...extra,
});

const EMPRESAS = [
  { id: 'e1', razao_social: 'Alfa Simples Ltda', regime_atual: 'Simples Nacional', uf: 'SP' },
  { id: 'e2', razao_social: 'Beta Real S.A.', regime_atual: 'Lucro Real', uf: 'AM' },
  { id: 'e3', razao_social: 'Gama sem regime', regime_atual: null, uf: null },
];

function montar(cenario: { marcos?: ReturnType<typeof linha>[]; configurado?: boolean; envia?: boolean; assinaturas?: unknown[]; envios?: unknown[]; pendentes?: Map<string, unknown[]> } = {}) {
  const marcos = cenario.marcos ?? [];
  const prisma = {
    empresa: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => EMPRESAS.find((e) => e.id === where.id) ?? null),
      findMany: vi.fn().mockResolvedValue(EMPRESAS),
    },
    agendaMarco: {
      findMany: vi.fn().mockImplementation(async ({ where }: { where?: { confirmado?: boolean } } = {}) => marcos.filter((m) => where?.confirmado === undefined || m.confirmado === where.confirmado)),
      findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}),
    },
    dispositivoLegal: { findFirst: vi.fn() },
    agendaLembrete: {
      findMany: vi.fn().mockResolvedValue(cenario.assinaturas ?? []), upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'L1', ...create })),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue({}),
    },
    agendaLembreteEnvio: { findMany: vi.fn().mockResolvedValue(cenario.envios ?? []), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const mail = {
    configurado: cenario.configurado ?? true, urlPublica: 'https://simulador.clarityib.com.br',
    enviar: vi.fn().mockResolvedValue(cenario.envia === false ? { enviado: false, motivo: 'SMTP caiu' } : { enviado: true }),
  };
  const revisao = { pendentesPorAlvo: vi.fn().mockResolvedValue(cenario.pendentes ?? new Map()) };
  return { prisma, mail, revisao, service: new AgendaReformaService(prisma as any, mail as any, revisao as any) };
}

describe('Agenda da Reforma: consulta', () => {
  const marcos = [
    linha({ chave: 'todos', titulo: 'Para todos', data: d('2027-01-01') }),
    linha({ chave: 'simples', titulo: 'Só Simples', data: d('2026-11-03'), data_fim: d('2026-12-20'), tipo: 'prazo', regimes: ['Simples Nacional'], categoria: 'Simples Nacional' }),
    linha({ chave: 'zfm', titulo: 'Só Amazonas', data: d('2027-01-01'), ufs: ['AM'], categoria: 'Zona Franca de Manaus' }),
    linha({ chave: 'passado', titulo: 'Já passou', data: d('2026-08-03') }),
  ];

  it('filtra pelo regime e pela UF da empresa e esconde o que já passou', async () => {
    const { service } = montar({ marcos });
    const r = await service.listar({ empresa_id: 'e1' }, AGORA); // Simples, SP
    expect(r.marcos.map((m) => m.chave)).toEqual(['simples', 'todos']);
    expect(r.empresa).toMatchObject({ id: 'e1', razao_social: 'Alfa Simples Ltda', sem_regime: false, sem_uf: false });
    expect(r.hoje).toBe('2026-11-10');
    const beta = await service.listar({ empresa_id: 'e2' }, AGORA); // Lucro Real, AM
    expect(beta.marcos.map((m) => m.chave)).toEqual(['todos', 'zfm']);
  });

  it('empresa sem regime e sem UF só vê os marcos sem restrição, e a tela é avisada', async () => {
    const { service } = montar({ marcos });
    const r = await service.listar({ empresa_id: 'e3' }, AGORA);
    expect(r.marcos.map((m) => m.chave)).toEqual(['todos']);
    expect(r.empresa).toMatchObject({ sem_regime: true, sem_uf: true });
  });

  it('regime e UF pedidos por cima valem mais do que os da empresa', async () => {
    const { service } = montar({ marcos });
    const r = await service.listar({ empresa_id: 'e1', regime: 'Lucro Real', uf: 'AM' }, AGORA);
    expect(r.marcos.map((m) => m.chave)).toEqual(['todos', 'zfm']);
    expect(r.filtros).toMatchObject({ regime: 'Lucro Real', uf: 'AM' });
  });

  it('sem filtro algum mostra tudo o que ainda não passou; com passados=1, também o resto', async () => {
    const { service } = montar({ marcos });
    expect((await service.listar({}, AGORA)).marcos.map((m) => m.chave)).toEqual(['simples', 'todos', 'zfm']);
    expect((await service.listar({ passados: '1' }, AGORA)).marcos.map((m) => m.chave)).toEqual(['passado', 'simples', 'todos', 'zfm']);
    expect((await service.listar({ categoria: 'zona franca de manaus' }, AGORA)).marcos.map((m) => m.chave)).toEqual(['zfm']);
  });

  it('devolve a fonte oficial, a situação, os dias que faltam e as opções dos filtros', async () => {
    const { service } = montar({ marcos });
    const r = await service.listar({ categoria: 'Simples Nacional' }, AGORA);
    expect(r.marcos[0]).toMatchObject({
      chave: 'simples', data: '2026-11-03', data_fim: '2026-12-20', situacao: 'em_andamento', dias_para: 40, confirmado: true,
      fontes: [expect.objectContaining({ instrumento: FONTE.instrumento, dispositivo: 'art. 381, § 4º, I', norma_chave: 'lcp-214-2025', caminho: 'art-381' })],
    });
    expect(r.opcoes.regimes).toContain('Produtor rural PF');
    expect(r.opcoes.ufs).toHaveLength(27);
    expect(r.opcoes.categorias).toContain('Simples Nacional');
  });

  it('marco com a fonte em revisão chega com o motivo', async () => {
    const pendentes = new Map([['todos', [{ id: 'r1', norma_chave: 'lcp-214-2025', norma_numero: 'LC 214/2025', caminho: 'art-381', rotulo: 'Art. 381', mudanca: 'alterado', detalhe: 'O texto do dispositivo mudou.', mudou_em: new Date('2026-11-12T15:00:00Z') }]]]);
    const { service, revisao } = montar({ marcos, pendentes });
    const r = await service.listar({}, AGORA);
    expect(revisao.pendentesPorAlvo).toHaveBeenCalledWith('marco', expect.arrayContaining(['todos']));
    expect(r.marcos.find((m) => m.chave === 'todos')?.em_revisao).toEqual([expect.objectContaining({ rotulo: 'Art. 381', numero: 'LC 214/2025', mudanca: 'alterado' })]);
    expect(r.marcos.find((m) => m.chave === 'zfm')?.em_revisao).toEqual([]);
  });

  it('recusa regime, UF, categoria ou empresa que não existem', async () => {
    const { service } = montar({ marcos });
    await expect(service.listar({ regime: 'MEI' })).rejects.toThrow('Regime inválido');
    await expect(service.listar({ uf: 'XX' })).rejects.toThrow('UF inválida');
    await expect(service.listar({ categoria: 'Outra' })).rejects.toThrow('Categoria inválida');
    await expect(service.listar({ empresa_id: 'nao-existe' })).rejects.toThrow('Empresa não encontrada');
  });

  it('o .ics traz os eventos do filtro, com a fonte, e o nome da empresa no calendário', async () => {
    const { service } = montar({ marcos });
    const ics = await service.calendario({ empresa_id: 'e1' }, AGORA);
    const l = ics.replace(/\r\n /g, '').split('\r\n');
    expect(l).toContain('X-WR-CALNAME:Agenda da Reforma Tributária (Alfa Simples Ltda · Simples Nacional · SP)');
    expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(l).toContain('UID:simples@simulador.clarityib.com.br');
    expect(l).toContain('DTSTART;VALUE=DATE:20261103');
    expect(l).toContain('DTEND;VALUE=DATE:20261221');
    expect(l.some((x) => x.startsWith('DESCRIPTION:') && x.includes('Fonte oficial:'))).toBe(true);
    expect(l.find((x) => x.startsWith('URL:'))).toBe(`URL:${FONTE.url}`);
  });
});

describe('Agenda da Reforma: semente', () => {
  /** Base legal falsa: devolve, para cada dispositivo, todos os trechos que a semente cita nele. */
  function baseLegalFalsa(prisma: ReturnType<typeof montar>['prisma'], semDispositivo: string[] = [], semTrecho: string[] = []) {
    prisma.dispositivoLegal.findFirst.mockImplementation(async ({ where }: { where: { caminho: string; norma: { chave: string } } }) => {
      const chave = `${where.norma.chave}/${where.caminho}`;
      if (semDispositivo.includes(chave)) return null;
      if (semTrecho.includes(chave)) return { texto: 'Texto que já não traz a passagem citada.' };
      const trechos = MARCOS_INICIAIS.flatMap((m) => m.fontes).filter((f) => f.norma_chave === where.norma.chave && f.caminho === where.caminho).map((f) => f.trecho);
      return { texto: trechos.join(' ... ') };
    });
  }

  it('grava todas as datas; as ligadas à Base legal só ficam confirmadas porque o trecho consta no texto', async () => {
    const { service, prisma } = montar();
    baseLegalFalsa(prisma);
    const r = await service.semear(AGORA);
    expect(r.criados).toBe(MARCOS_INICIAIS.length);
    expect(r.atualizados).toBe(0);
    expect(r.divergentes).toEqual([]);
    expect(r.confirmados).toBe(MARCOS_INICIAIS.filter((m) => m.confirmado).length);
    const gravado = prisma.agendaMarco.create.mock.calls.map((c) => c[0].data);
    const estoque = gravado.find((m) => m.chave === 'estoque-apropriacao-2027');
    expect(estoque).toMatchObject({ confirmado: true, categoria: 'Crédito presumido do estoque', tipo: 'prazo', regimes: [], ufs: [] });
    expect(estoque.data).toEqual(d('2027-06-30'));
    expect(estoque.lida_em).toEqual(d('2026-11-10'));
    expect(estoque.fontes[0]).toMatchObject({ norma_chave: 'lcp-214-2025', caminho: 'art-381', trecho: expect.stringContaining('último dia de junho de 2027') });
    const simples = gravado.find((m) => m.chave === 'simples-cancelamento-opcao-2027');
    expect(simples).toMatchObject({ confirmado: true, data: d('2026-11-03'), data_fim: d('2026-12-20'), lida_em: d('2026-11-10') });
    expect(simples.fontes[0].norma_chave).toBeUndefined(); // fonte fora da Base legal
    const naoConfirmado = gravado.find((m) => m.chave === 'percentuais-credito-presumido-2026');
    expect(naoConfirmado).toMatchObject({ confirmado: false, lida_em: null });
    expect(naoConfirmado.observacao).toMatch(/não confirmado em fonte oficial/);
  });

  it('se o trecho não consta mais no texto da lei, o marco é gravado como não confirmado e o problema aparece', async () => {
    const { service, prisma } = montar();
    baseLegalFalsa(prisma, ['dec-12955-2026/art-243'], ['lcp-214-2025/art-381']);
    const r = await service.semear(AGORA);
    const chaves = r.divergentes.map((x) => x.split(':')[0]);
    expect(chaves).toEqual(expect.arrayContaining(['produtor-rural-contribuinte-2026', 'estoque-apropriacao-2027', 'estoque-inventario-2026']));
    expect(r.divergentes.find((x) => x.startsWith('produtor-rural-contribuinte-2026'))).toContain('dec-12955-2026/art-243: dispositivo não encontrado na Base legal');
    expect(r.divergentes.find((x) => x.startsWith('estoque-apropriacao-2027'))).toContain('o trecho não consta no texto');
    const gravado = prisma.agendaMarco.create.mock.calls.map((c) => c[0].data);
    const estoque = gravado.find((m) => m.chave === 'estoque-apropriacao-2027');
    expect(estoque.confirmado).toBe(false);
    expect(estoque.lida_em).toBeNull();
    expect(estoque.observacao).toMatch(/Não confirmado em fonte oficial\.$/);
    // o que não depende desses dispositivos continua confirmado
    expect(gravado.find((m) => m.chave === 'icms-iss-extincao-2033').confirmado).toBe(true);
  });

  it('rodar de novo atualiza as datas existentes em vez de duplicar', async () => {
    const { service, prisma } = montar();
    baseLegalFalsa(prisma);
    prisma.agendaMarco.findUnique.mockResolvedValue({ id: 'existente' });
    const r = await service.semear(AGORA);
    expect(r.criados).toBe(0);
    expect(r.atualizados).toBe(MARCOS_INICIAIS.length);
    expect(prisma.agendaMarco.create).not.toHaveBeenCalled();
    expect(prisma.agendaMarco.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'existente' } }));
  });
});

describe('Agenda da Reforma: cadastro de lembretes', () => {
  it('guarda o lembrete do próprio usuário (e-mail em minúsculas), com antecedências válidas', async () => {
    const { service, prisma } = montar();
    const r = await service.salvarLembrete('Ana@FalAgro.com.br', { escopo: 'todas', dias_antes: [1, 30, 99, 7] });
    expect(prisma.agendaLembrete.upsert).toHaveBeenCalledWith({
      where: { user_email_escopo: { user_email: 'ana@falagro.com.br', escopo: 'todas' } },
      create: { user_email: 'ana@falagro.com.br', escopo: 'todas', dias_antes: [30, 7, 1], ativo: true },
      update: { dias_antes: [30, 7, 1], ativo: true },
    });
    expect(r).toMatchObject({ escopo: 'todas', dias_antes: [30, 7, 1], ativo: true });
  });

  it('lembrete por empresa exige que a empresa exista; sem escopo vale para todas', async () => {
    const { service, prisma } = montar();
    await expect(service.salvarLembrete('a@x.com', { escopo: 'nao-existe' })).rejects.toThrow('Empresa não encontrada');
    await service.salvarLembrete('a@x.com', { escopo: 'e1', ativo: false });
    expect(prisma.agendaLembrete.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ escopo: 'e1', ativo: false, dias_antes: [30, 7, 1] }) }));
    await service.salvarLembrete('a@x.com', {});
    expect(prisma.agendaLembrete.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ create: expect.objectContaining({ escopo: 'todas' }) }));
  });

  it('só remove o lembrete do próprio usuário', async () => {
    const { service, prisma } = montar();
    await service.removerLembrete('Ana@x.com', 'L1');
    expect(prisma.agendaLembrete.deleteMany).toHaveBeenCalledWith({ where: { id: 'L1', user_email: 'ana@x.com' } });
    prisma.agendaLembrete.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.removerLembrete('ana@x.com', 'de-outro')).rejects.toThrow('Lembrete não encontrado');
  });

  it('lista os lembretes com o nome da empresa e diz se o e-mail está configurado', async () => {
    const { service } = montar({ assinaturas: [{ id: 'L1', escopo: 'todas', dias_antes: [30, 7, 1], ativo: true }, { id: 'L2', escopo: 'e2', dias_antes: [7], ativo: false }] });
    const r = await service.meusLembretes('ana@x.com');
    expect(r.email_configurado).toBe(true);
    expect(r.dias_padrao).toEqual([30, 7, 1]);
    expect(r.lembretes).toEqual([
      { id: 'L1', escopo: 'todas', empresa: null, dias_antes: [30, 7, 1], ativo: true },
      { id: 'L2', escopo: 'e2', empresa: 'Beta Real S.A.', dias_antes: [7], ativo: false },
    ]);
  });
});

describe('Agenda da Reforma: envio diário dos lembretes', () => {
  const emSete = linha({ chave: 'em-7', titulo: 'Prazo em sete dias', tipo: 'prazo', data: d('2026-11-17'), categoria: 'Simples Nacional', regimes: ['Simples Nacional'] });
  const emUm = linha({ chave: 'em-1', titulo: 'Marco amanhã', data: d('2026-11-11') });
  const longe = linha({ chave: 'longe', data: d('2027-06-30') });
  const semConfirmar = linha({ chave: 'duvida', data: d('2026-11-17'), confirmado: false });
  const assinatura = (extra: Record<string, unknown> = {}) => ({ id: 'L1', user_email: 'ana@falagro.com.br', escopo: 'todas', dias_antes: [30, 7, 1], ativo: true, ...extra });

  it('manda um só e-mail com as datas do dia e registra cada envio', async () => {
    const { service, prisma, mail } = montar({ marcos: [emSete, emUm, longe, semConfirmar], assinaturas: [assinatura()] });
    const r = await service.enviarLembretes(AGORA);
    expect(r).toEqual({ avisos: 1, falhas: 0, desativados: 0 });
    expect(mail.enviar).toHaveBeenCalledTimes(1);
    const email = mail.enviar.mock.calls[0][0];
    expect(email.to).toBe('ana@falagro.com.br');
    expect(email.subject).toBe('[InTAX] Agenda da Reforma: 2 datas para acompanhar');
    expect(email.text).toContain('Marco amanhã');
    expect(email.text).toContain('Prazo em sete dias');
    expect(email.text).not.toContain('longe');
    expect(email.text).toContain('Empresas cadastradas a que se aplica: Alfa Simples Ltda'); // o prazo é só do Simples
    expect(prisma.agendaLembreteEnvio.createMany).toHaveBeenCalledWith({
      data: [{ lembrete_id: 'L1', marco_id: 'em-1', dias_antes: 1 }, { lembrete_id: 'L1', marco_id: 'em-7', dias_antes: 7 }],
      skipDuplicates: true,
    });
  });

  it('não repete o que já foi enviado', async () => {
    const { service, mail } = montar({ marcos: [emSete, emUm], assinaturas: [assinatura()], envios: [{ marco_id: 'em-7', dias_antes: 7 }, { marco_id: 'em-1', dias_antes: 1 }] });
    expect(await service.enviarLembretes(AGORA)).toEqual({ avisos: 0, falhas: 0, desativados: 0 });
    expect(mail.enviar).not.toHaveBeenCalled();
  });

  it('se o envio falhar, nada é registrado (a falha é contada)', async () => {
    const { service, prisma } = montar({ marcos: [emUm], assinaturas: [assinatura()], envia: false });
    expect(await service.enviarLembretes(AGORA)).toEqual({ avisos: 0, falhas: 1, desativados: 0 });
    expect(prisma.agendaLembreteEnvio.createMany).not.toHaveBeenCalled();
  });

  it('respeita as antecedências escolhidas por cada pessoa', async () => {
    const { service, mail } = montar({ marcos: [emSete, emUm], assinaturas: [assinatura({ dias_antes: [7] })] });
    await service.enviarLembretes(AGORA);
    const texto = mail.enviar.mock.calls[0][0].text as string;
    expect(texto).toContain('Prazo em sete dias');
    expect(texto).not.toContain('Marco amanhã');
  });

  it('lembrete de uma empresa só traz os marcos que valem para o regime e a UF dela', async () => {
    const { service, mail } = montar({ marcos: [emSete, emUm], assinaturas: [assinatura({ escopo: 'e2' })] }); // e2 = Lucro Real
    await service.enviarLembretes(AGORA);
    const texto = mail.enviar.mock.calls[0][0].text as string;
    expect(texto).toContain('Marco amanhã');
    expect(texto).not.toContain('Prazo em sete dias'); // só do Simples
    expect(mail.enviar.mock.calls[0][0].html).toContain('(Beta Real S.A.)');
  });

  it('empresa que deixou de existir desativa o lembrete, sem enviar nada', async () => {
    const { service, prisma, mail } = montar({ marcos: [emUm], assinaturas: [assinatura({ escopo: 'excluida' })] });
    expect(await service.enviarLembretes(AGORA)).toEqual({ avisos: 0, falhas: 0, desativados: 1 });
    expect(prisma.agendaLembrete.update).toHaveBeenCalledWith({ where: { id: 'L1' }, data: { ativo: false } });
    expect(mail.enviar).not.toHaveBeenCalled();
  });

  it('sem e-mail configurado ou sem ninguém inscrito, não faz nada', async () => {
    const semEmail = montar({ marcos: [emUm], assinaturas: [assinatura()], configurado: false });
    expect(await semEmail.service.enviarLembretes(AGORA)).toEqual({ avisos: 0, falhas: 0, desativados: 0 });
    expect(semEmail.prisma.agendaLembrete.findMany).not.toHaveBeenCalled();
    const ninguem = montar({ marcos: [emUm], assinaturas: [] });
    expect(await ninguem.service.enviarLembretes(AGORA)).toEqual({ avisos: 0, falhas: 0, desativados: 0 });
    expect(ninguem.prisma.agendaMarco.findMany).not.toHaveBeenCalled();
  });

  it('a mensagem de teste usa as datas confirmadas dos próximos 60 dias e vai só ao próprio usuário', async () => {
    const { service, mail } = montar({ marcos: [emSete, emUm, longe, semConfirmar] });
    const r = await service.enviarTeste('ana@falagro.com.br', 'todas', AGORA);
    expect(r).toEqual({ enviado: true, datas: 2 });
    const email = mail.enviar.mock.calls[0][0];
    expect(email.to).toBe('ana@falagro.com.br');
    expect(email.subject.startsWith('[TESTE] ')).toBe(true);
    expect(email.text).not.toContain('duvida');
  });

  it('teste: avisa quando o e-mail não está configurado ou quando não há datas no período', async () => {
    await expect(montar({ marcos: [emUm], configurado: false }).service.enviarTeste('a@x.com', 'todas', AGORA)).rejects.toThrow('ainda não está configurado');
    await expect(montar({ marcos: [longe] }).service.enviarTeste('a@x.com', 'todas', AGORA)).rejects.toThrow('Não há datas confirmadas nos próximos 60 dias');
    await expect(montar({ marcos: [emUm], envia: false }).service.enviarTeste('a@x.com', 'todas', AGORA)).rejects.toThrow('Não foi possível enviar: SMTP caiu');
  });
});
