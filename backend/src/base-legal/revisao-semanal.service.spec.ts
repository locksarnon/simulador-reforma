import { describe, expect, it, vi } from 'vitest';
import { RevisaoSemanalService, semanaIso } from './revisao-semanal.service';

const AGORA = new Date(Date.UTC(2026, 10, 25, 8, 0)); // quarta-feira, 05h em Brasília

type Norma = { id: string; chave: string; numero: string; titulo: string; grupo: string; formato: string; monitorar: boolean; prioridade: number; total_dispositivos: number; url_oficial: string; situacao: string; atos_modificadores: unknown[] };
const norma = (o: Partial<Norma> & { chave: string; numero: string }): Norma => ({
  id: `id-${o.chave}`, titulo: `Título de ${o.numero}`, grupo: 'reforma', formato: 'html', monitorar: true, prioridade: 0, total_dispositivos: 100,
  url_oficial: `https://www.planalto.gov.br/${o.chave}.htm`, situacao: 'vigente', atos_modificadores: [], ...o,
});

const docSenado = (norma: string, numero: string, data: string, ementa: string, id: string) => ({ id, tipo: norma.split('-')[0], numero, norma, normaNome: `${norma} ${data}`, ementa, dataassinatura: data, anoassinatura: data.slice(-4) });
const listaSenado = (docs: unknown[]) => ({ ListaDocumento: { documentos: { documento: docs } } });
const LC_239 = docSenado('LCP-239-2026-11-24', '239', '24/11/2026', 'Altera a Lei Complementar nº 235, de 27 de agosto de 2026, para conferir ao Poder Executivo novos instrumentos de gestão.', '44462499');
const LEI_CREDITO = docSenado('LEI-15551-2026-11-19', '15551', '19/11/2026', 'Abre ao Orçamento Fiscal da União crédito suplementar no valor de R$ 11.785.853,00.', '44456426');
const LC_225 = docSenado('LCP-225-2026-01-08', '225', '08/01/2026', 'Institui o Código de Defesa do Contribuinte.', '1');

const html = (...links: [string, string][]) => `<html><body>${links.map(([t, u]) => `<a href="${u}">${t}</a>`).join('\n')}</body></html>`;
const LINKS_BASE: [string, string][] = [['Resolução 1', 'https://www.cgibs.gov.br/upload/arquivos/r1.pdf'], ['Resolução 2', 'https://www.cgibs.gov.br/upload/arquivos/r2.pdf'], ['Resolução 3', 'https://www.cgibs.gov.br/upload/arquivos/r3.pdf'], ['Início', 'https://www.cgibs.gov.br/']];

type Opcoes = {
  normas?: Norma[];
  env?: Record<string, string>;
  senado?: Record<string, unknown[]>;
  portal?: (url: string) => string;
  importar?: (chave: string) => Promise<Record<string, unknown>> | Record<string, unknown>;
  novidadesDaRodada?: Record<string, unknown>[];
  naoConsolidadas?: Record<string, unknown>[];
  jaRegistradas?: Record<string, unknown>[];
  artigos?: Record<string, { tipo: string; rotulo: string; caminho: string; texto: string }[]>;
  mudancasTexto?: Record<string, unknown>[];
  citacoes?: Record<string, unknown>[];
  emCurso?: boolean;
  ia?: boolean;
};

function montar(o: Opcoes = {}) {
  const normas = o.normas ?? [norma({ chave: 'lcp-214-2025', numero: 'LC 214/2025' }), norma({ chave: 'lcp-235-2026', numero: 'LC 235/2026' })];
  const fontes = new Map<string, Record<string, any>>();
  const prisma = {
    revisaoSemanal: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'rev1', ...data })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
      findFirst: vi.fn(async (a: { where: { status: unknown } }) => (typeof a.where.status === 'string' && o.emCurso ? { id: 'rev0' } : null)),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
    },
    normaLegal: {
      findMany: vi.fn(async (a: { where?: any } = {}) => {
        const w = a.where ?? {};
        return normas.filter((n) => (w.formato?.not ? n.formato !== w.formato.not : true) && (w.monitorar === undefined || n.monitorar === w.monitorar)
          && (w.total_dispositivos?.gt === undefined || n.total_dispositivos > w.total_dispositivos.gt) && (!w.chave?.in || w.chave.in.includes(n.chave)));
      }),
    },
    dispositivoLegal: { findMany: vi.fn(async (a: { where: { norma_id: string } }) => o.artigos?.[a.where.norma_id] ?? []) },
    novidadeLegal: {
      findMany: vi.fn(async (a: { where: any }) => {
        const w = a.where;
        if (w.tipo === 'nao_consolidada') return o.naoConsolidadas ?? [];
        if (w.detectada_em) return o.jaRegistradas ?? [];
        if (w.origem === 'texto_oficial') return o.mudancasTexto ?? [];
        return o.novidadesDaRodada ?? [];
      }),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    fonteMonitorada: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const atual = fontes.get(where.chave);
        const novo = atual ? { ...atual, ...update } : { id: where.chave, hash_atual: null, itens: [], ativo: true, verificada_em: null, alterada_em: null, erro: null, ...create };
        fontes.set(where.chave, novo);
        return novo;
      }),
      findUnique: vi.fn(async ({ where }: any) => fontes.get(where.chave) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const novo = { id: data.chave, hash_atual: null, itens: [], ativo: true, verificada_em: null, alterada_em: null, erro: null, ...data };
        fontes.set(data.chave, novo);
        return novo;
      }),
      update: vi.fn(async ({ where, data }: any) => { const k = where.id ?? where.chave; fontes.set(k, { ...fontes.get(k), ...data }); return fontes.get(k); }),
      updateMany: vi.fn(async ({ where, data }: any) => { if (fontes.has(where.chave)) fontes.set(where.chave, { ...fontes.get(where.chave), ...data }); return { count: 1 }; }),
      findMany: vi.fn(async () => [...fontes.values()].filter((f) => f.ativo && !f.chave.startsWith('senado-'))),
    },
    referenciaLegal: { findMany: vi.fn(async () => o.citacoes ?? []) },
  };

  const baixarBruto = vi.fn(async (url: string) => {
    if (url.startsWith('https://legis.senado.leg.br')) {
      const tipo = /tipo=([A-Z]+)/.exec(url)![1];
      return { corpo: Buffer.from(JSON.stringify(listaSenado(o.senado?.[tipo] ?? []))), tipo: 'application/json', url };
    }
    return { corpo: Buffer.from((o.portal ?? (() => html(...LINKS_BASE)))(url), 'utf8'), tipo: 'text/html', url };
  });
  const baseLegal = {
    garantirNormas: vi.fn(async () => undefined),
    importar: vi.fn(async (chave: string) => (o.importar ? o.importar(chave) : { chave, alterada: false, dispositivos: 100, novos: 0, alterados: 0, removidos: 0, revogados: 0, hash: 'h' })),
    verificarAtualizacoes: vi.fn(async () => ({ verificadas: 2, alertas: 1, erros: [] as string[] })),
    baixarBruto,
    registrarNorma: vi.fn(async () => ({ chave: 'nova', jaExistia: false, resultado: null })),
    registrarNovidades: vi.fn(async (l: unknown[]) => l.length),
    iaConfigurada: vi.fn(() => o.ia ?? false),
    iaComBusca: vi.fn(async () => ({ texto: '{"itens":[]}', grounding: null, modelo: 'teste' })),
    urlResponde: vi.fn(async () => true),
  };
  const mail = { emailInterno: 'admin@fal.test', configurado: true, urlPublica: 'https://intax.test', enviar: vi.fn(async () => ({ enviado: true })) };
  const config = { get: (k: string) => o.env?.[k] };
  const service = new RevisaoSemanalService(prisma as any, config as any, baseLegal as any, mail as any);
  service.pausaMs = 0;
  service.agora = () => AGORA;
  return { service, prisma, baseLegal, mail, fontes };
}

const registradas = (baseLegal: ReturnType<typeof montar>['baseLegal']) => baseLegal.registrarNovidades.mock.calls.flatMap((c) => c[0] as Record<string, any>[]);
const ultimoUpdate = (prisma: ReturnType<typeof montar>['prisma']) => (prisma.revisaoSemanal.update.mock.calls.at(-1)![0] as { data: Record<string, any> }).data;

describe('semana da revisão', () => {
  it('semana ISO no horário de Brasília', () => {
    expect(semanaIso(new Date(Date.UTC(2026, 10, 23, 8, 0)))).toBe('2026-S48');
    expect(semanaIso(new Date(Date.UTC(2026, 10, 23, 1, 0)))).toBe('2026-S47'); // domingo à noite em Brasília
    expect(semanaIso(new Date(Date.UTC(2026, 0, 1, 12)))).toBe('2026-S01');
    expect(semanaIso(new Date(Date.UTC(2025, 11, 29, 12)))).toBe('2026-S01');
    expect(semanaIso(new Date(Date.UTC(2027, 0, 3, 12)))).toBe('2026-S53');
  });
});

describe('revisão semanal: rodada sem novidades', () => {
  it('confere as normas e os portais, grava o histórico e não manda e-mail', async () => {
    const { service, prisma, baseLegal, mail } = montar({ senado: { LCP: [LC_225] } });
    const r = await service.executar('agendada');
    expect(r).toEqual({ id: 'rev1', status: 'concluida' });
    expect(baseLegal.importar).toHaveBeenCalledTimes(2);
    expect(baseLegal.importar).toHaveBeenCalledWith('lcp-214-2025', { automatico: true, execucaoId: 'rev1', semAviso: true });
    const fim = ultimoUpdate(prisma);
    expect(fim).toMatchObject({ status: 'concluida', normas_verificadas: 2, normas_atualizadas: 0, erros: [] });
    expect(fim.resumo).toContain('2 normas conferidas');
    expect(fim.resumo).toContain('sem mudanças');
    expect(mail.enviar).not.toHaveBeenCalled();
    expect(prisma.revisaoSemanal.create.mock.calls[0][0].data).toMatchObject({ semana: '2026-S48', disparo: 'agendada', status: 'executando' });
  });

  it('só a primeira leitura de um portal: guarda a lista como ponto de partida, sem aviso', async () => {
    const { service, prisma, baseLegal } = montar();
    await service.executar('agendada');
    expect(registradas(baseLegal).filter((n) => n.tipo === 'fonte_atualizada')).toEqual([]);
    expect(prisma.fonteMonitorada.update.mock.calls.some((c: any[]) => c[0].data.itens?.length === 4)).toBe(true);
    expect(ultimoUpdate(prisma).resumo).toContain('sem mudanças');
  });
});

describe('revisão semanal: texto oficial das normas', () => {
  it('soma o que mudou, conta norma carregada pela primeira vez e manda um e-mail com tudo', async () => {
    const normas = [norma({ chave: 'lcp-214-2025', numero: 'LC 214/2025' }), norma({ chave: 'lei-9430-1996', numero: 'Lei 9.430/1996' }), norma({ chave: 'decreto-1-2026', numero: 'Decreto 1/2026', total_dispositivos: 0 })];
    const { service, prisma, mail } = montar({
      normas,
      importar: (chave) => ({
        'lcp-214-2025': { chave, alterada: true, dispositivos: 610, novos: 1, alterados: 3, removidos: 0, revogados: 1, hash: 'h', revisao: { cartoes: 2, cartoes_despublicados: 1, fundamentos: 1, marcos: 0, itens: 3 } },
        'lei-9430-1996': { chave, alterada: false, dispositivos: 100, novos: 0, alterados: 0, removidos: 0, revogados: 0, hash: 'h' },
        'decreto-1-2026': { chave, alterada: true, dispositivos: 12, novos: 12, alterados: 0, removidos: 0, revogados: 0, hash: 'h' },
      } as Record<string, Record<string, unknown>>)[chave],
      novidadesDaRodada: [{ tipo: 'alteracao', titulo: 'LC 214/2025: 3 dispositivos alterados pela LC 227/2026', resumo: 'Art. 5º', url: 'https://x.gov.br/a', oficial: true, confirmada: true }],
    });
    await service.executar('agendada');
    const fim = ultimoUpdate(prisma);
    expect(fim).toMatchObject({ status: 'concluida', normas_verificadas: 3, normas_atualizadas: 1, normas_novas: 1, dispositivos_alterados: 3, dispositivos_revogados: 1 });
    expect(mail.enviar).toHaveBeenCalledTimes(1);
    const email = mail.enviar.mock.calls[0][0] as Record<string, string>;
    expect(email.to).toBe('admin@fal.test');
    expect(email.subject).toContain('3 dispositivos alterados');
    expect(email.subject).toContain('1 revogado');
    expect(email.html).toContain('Isto devolveu 3 itens para a sua revisão');
    expect(email.text).toContain('LC 214/2025: 3 dispositivos alterados pela LC 227/2026');
  });

  it('norma relida com o leitor novo não conta como mudança da lei: vira só uma anotação, e a revisão que ela gerou segue no resumo', async () => {
    const { service, prisma, mail } = montar({
      importar: (chave) => ({ chave, alterada: true, reprocessada: true, dispositivos: 610, novos: 0, alterados: 5, removidos: 0, revogados: 2, hash: 'h', revisao: { cartoes: 1, cartoes_despublicados: 1, fundamentos: 0, marcos: 0, itens: 1 } }),
    });
    await service.executar('agendada');
    const fim = ultimoUpdate(prisma);
    expect(fim).toMatchObject({ status: 'concluida', normas_atualizadas: 0, dispositivos_alterados: 0, dispositivos_revogados: 0 });
    const email = mail.enviar.mock.calls[0][0] as Record<string, string>;
    expect(email.subject).toContain('sem mudanças');
    expect(email.html).toContain('LC 214/2025: reprocessada com a leitura nova do texto oficial (7 dispositivos ajustados); não é mudança da lei.');
    expect(email.html).toContain('Isto devolveu 2 itens para a sua revisão'); // as duas normas da rodada trouxeram um item cada
  });

  it('erro em uma norma não impede as demais: a rodada termina como parcial', async () => {
    const { service, prisma, baseLegal } = montar({ importar: (chave) => { if (chave === 'lcp-214-2025') throw new Error('Fonte oficial respondeu 503'); return { chave, alterada: false, dispositivos: 1, novos: 0, alterados: 0, removidos: 0, revogados: 0, hash: 'h' }; } });
    const r = await service.executar('agendada');
    expect(r!.status).toBe('parcial');
    expect(baseLegal.importar).toHaveBeenCalledTimes(2);
    expect(ultimoUpdate(prisma).erros).toEqual(['LC 214/2025: Fonte oficial respondeu 503']);
  });

  it('página oficial que mudou de forma: atualização segurada vira anotação da rodada', async () => {
    const { service, prisma } = montar({ importar: (chave) => ({ chave, alterada: false, dispositivos: 100, novos: 0, alterados: 0, removidos: 0, revogados: 0, hash: 'h', motivo: 'A página oficial trouxe 8 dispositivos e a base tem 100. Nada foi gravado.' }) });
    const { service: s2, mail } = montar({ importar: (chave) => ({ chave, alterada: false, dispositivos: 100, novos: 0, alterados: 0, removidos: 0, revogados: 0, hash: 'h', motivo: 'A página oficial trouxe 8 dispositivos e a base tem 100.' }), novidadesDaRodada: [{ tipo: 'estrutura_suspeita', titulo: 'LC 214/2025: atualização segurada', resumo: 'x', url: null, oficial: true, confirmada: true }] });
    await service.executar('agendada');
    await s2.executar('agendada');
    expect(prisma.revisaoSemanal.update).toHaveBeenCalled();
    expect((mail.enviar.mock.calls[0][0] as Record<string, string>).html).toContain('atualização segurada porque a página oficial mudou de forma');
  });

  it('modo com aprovação: só as normas ainda não carregadas são importadas; as demais viram aviso para aprovar', async () => {
    const normas = [norma({ chave: 'lcp-214-2025', numero: 'LC 214/2025' }), norma({ chave: 'decreto-1-2026', numero: 'Decreto 1/2026', total_dispositivos: 0 })];
    const { service, baseLegal, prisma } = montar({ normas, env: { BASE_LEGAL_APLICAR_AUTOMATICO: 'false' } });
    await service.executar('agendada');
    expect(baseLegal.importar).toHaveBeenCalledTimes(1);
    expect(baseLegal.importar.mock.calls[0][0]).toBe('decreto-1-2026');
    expect(baseLegal.verificarAtualizacoes).toHaveBeenCalledWith('agendada');
    expect(ultimoUpdate(prisma).normas_verificadas).toBe(3);
  });
});

describe('revisão semanal: legislação federal nova (Senado, dados abertos)', () => {
  it('ato que altera norma da base vira novidade ligada a ela, o texto é carregado e o crédito orçamentário é ignorado', async () => {
    const { service, baseLegal, prisma } = montar({ senado: { LCP: [LC_239, LC_225], LEI: [LEI_CREDITO] } });
    await service.executar('agendada');
    const nova = registradas(baseLegal).find((n) => n.ato_ref === 'lc 239/2026')!;
    expect(nova).toMatchObject({
      tipo: 'alteracao', origem: 'api_oficial', norma_chave: 'lcp-235-2026', norma_numero: 'LC 235/2026', titulo: 'LC 239/2026 altera LC 235/2026',
      url: 'https://legis.senado.leg.br/norma/44462499', oficial: true, confirmada: true, execucao_id: 'rev1',
    });
    // LC 225 é de janeiro (fora dos 45 dias da primeira leitura) e o crédito orçamentário não interessa
    expect(registradas(baseLegal).filter((n) => n.origem === 'api_oficial')).toHaveLength(1);
    expect(baseLegal.registrarNorma).toHaveBeenCalledTimes(1);
    expect(baseLegal.registrarNorma.mock.calls[0][0]).toMatchObject({ referencia: 'lc 239/2026', numero: 'LC 239/2026', tipo: 'Lei Complementar', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp239.htm', grupo: 'federal' });
    expect(baseLegal.registrarNorma.mock.calls[0][1]).toEqual({ automatico: true, execucaoId: 'rev1', semAviso: true });
    const fim = ultimoUpdate(prisma);
    expect(fim).toMatchObject({ normas_novas: 1, atos_relacionados: 1 });
  });

  it('segunda leitura: só é novo o que a lista anterior não tinha; ato que já está na base não é carregado de novo', async () => {
    const { service, baseLegal, fontes } = montar({ senado: { LCP: [LC_239] } });
    await service.executar('agendada');
    expect(fontes.get('senado-lcp-2026')!.itens).toEqual([{ titulo: expect.any(String), url: 'https://legis.senado.leg.br/norma/44462499' }]);
    baseLegal.registrarNovidades.mockClear();
    baseLegal.registrarNorma.mockClear();
    await service.executar('agendada');
    expect(registradas(baseLegal).filter((n) => n.origem === 'api_oficial')).toEqual([]);
    // o ato continua sem texto na base (o mock não o cadastra): a rodada tenta de novo, sem repetir o aviso
    expect(baseLegal.registrarNorma).toHaveBeenCalledTimes(1);
  });

  it('texto ainda não publicado no Planalto: a rodada segue e anota a nova tentativa', async () => {
    const { service, baseLegal, prisma } = montar({ senado: { LCP: [LC_239] } });
    baseLegal.registrarNorma.mockRejectedValue(new Error('Fonte oficial respondeu 404'));
    const r = await service.executar('agendada');
    expect(r!.status).toBe('concluida');
    expect(ultimoUpdate(prisma).normas_novas).toBe(0);
    expect(registradas(baseLegal).some((n) => n.ato_ref === 'lc 239/2026')).toBe(true);
  });

  it('a API do Senado fora do ar vira erro da rodada, sem derrubar as outras etapas', async () => {
    const { service, baseLegal, prisma } = montar();
    const original = baseLegal.baixarBruto.getMockImplementation()!;
    baseLegal.baixarBruto.mockImplementation(async (url: string, ...r: unknown[]) => { if (url.includes('senado')) throw new Error('Fonte oficial respondeu 500'); return (original as any)(url, ...r); });
    const r = await service.executar('agendada');
    expect(r!.status).toBe('parcial');
    expect(ultimoUpdate(prisma).erros.some((e: string) => e.includes('Senado Federal') && e.includes('500'))).toBe(true);
    expect(baseLegal.importar).toHaveBeenCalledTimes(2);
  });
});

describe('revisão semanal: portais oficiais', () => {
  it('documento novo no portal vira novidade com a lista dos links; link que não é documento é ignorado', async () => {
    let rodada = 0;
    const { service, baseLegal, fontes } = montar({
      portal: () => (rodada++ < 10 ? html(...LINKS_BASE) : html(...LINKS_BASE, ['Portaria Conjunta nº 4 sobre leiaute', 'https://www.gov.br/nfse/x/portaria-4.pdf'], ['Fale conosco', 'https://www.gov.br/contato'])),
    });
    await service.executar('agendada'); // primeira leitura dos 8 portais
    baseLegal.registrarNovidades.mockClear();
    await service.executar('agendada');
    const avisos = registradas(baseLegal).filter((n) => n.tipo === 'fonte_atualizada');
    expect(avisos.length).toBeGreaterThan(0);
    expect(avisos[0]).toMatchObject({ origem: 'fonte_monitorada', oficial: true, confirmada: true, detalhes: [{ rotulo: 'Portaria Conjunta nº 4 sobre leiaute', url: 'https://www.gov.br/nfse/x/portaria-4.pdf' }] });
    expect(avisos[0].titulo).toContain('1 documento novo');
    expect([...fontes.values()].some((f) => f.alterada_em)).toBe(true);
  });

  it('ato do CGIBS que muda a regra do IBS/CBS entra na base com o texto; o que é orçamento não', async () => {
    let rodada = 0;
    const { service, baseLegal } = montar({
      portal: (url) => (rodada++ < 10 || !url.includes('cgibs.gov.br/regulamentos')
        ? html(...LINKS_BASE)
        : html(...LINKS_BASE, ['Resolução CGIBS nº 9: regulamento do split payment do IBS e da CBS', 'https://www.cgibs.gov.br/upload/arquivos/res9.pdf'], ['Orçamento do CGIBS para 2027', 'https://www.cgibs.gov.br/upload/arquivos/orcamento.pdf'])),
    });
    await service.executar('agendada');
    baseLegal.registrarNorma.mockClear();
    await service.executar('agendada');
    const cargas = baseLegal.registrarNorma.mock.calls.filter((c) => (c[0] as { orgao: string }).orgao === 'Comitê Gestor do IBS');
    expect(cargas).toHaveLength(1);
    expect(cargas[0][0]).toMatchObject({ url: 'https://www.cgibs.gov.br/upload/arquivos/res9.pdf', grupo: 'reforma', tipo: 'Ato do CGIBS' });
  });

  it('página de notícias vale por qualquer link novo de órgão oficial; nos demais portais, só o que parece ato', async () => {
    let rodada = 0;
    const { service, baseLegal } = montar({
      portal: (url) => (rodada++ < 10 ? html(...LINKS_BASE) : html(...LINKS_BASE, ['Regulamento do IBS é publicado na página do Comitê Gestor', url.includes('Noticias') ? 'https://www.cgibs.gov.br/regulamento-publicado' : 'https://www.gov.br/x/noticia-qualquer'])),
    });
    await service.executar('agendada');
    baseLegal.registrarNovidades.mockClear();
    await service.executar('agendada');
    const avisos = registradas(baseLegal).filter((n) => n.tipo === 'fonte_atualizada');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].titulo).toContain('Portal da NF-e (SVRS): notícias');
  });

  it('a lista do Confaz é do ano; trocar o endereço (virada de ano) recomeça o ponto de partida, e a lista do ano que ainda não saiu em janeiro não é erro', async () => {
    const a = montar();
    await a.service.executar('agendada');
    expect(a.fontes.get('confaz-convenios')!.url).toBe('https://www.confaz.fazenda.gov.br/legislacao/convenios/2026');
    expect(a.baseLegal.baixarBruto.mock.calls.some((c) => c[0] === 'https://www.confaz.fazenda.gov.br/legislacao/atos/2026')).toBe(true);
    // virada de ano: o endereço muda e a lista guardada (de 2026) deixa de valer
    a.service.agora = () => new Date(Date.UTC(2027, 0, 11, 8, 0));
    const original = a.baseLegal.baixarBruto.getMockImplementation()!;
    a.baseLegal.baixarBruto.mockImplementation(async (url: string, ...r: unknown[]) => {
      if (url.includes('confaz') && url.includes('2027')) throw new Error('Fonte oficial respondeu 404');
      return (original as any)(url, ...r);
    });
    a.baseLegal.registrarNovidades.mockClear();
    const r = await a.service.executar('agendada');
    expect(r!.status).toBe('concluida');
    expect(a.fontes.get('confaz-convenios')).toMatchObject({ url: 'https://www.confaz.fazenda.gov.br/legislacao/convenios/2027', hash_atual: null, itens: [] });
    expect(ultimoUpdate(a.prisma).erros).toEqual([]);
    expect(registradas(a.baseLegal).filter((n) => n.tipo === 'fonte_atualizada')).toEqual([]);
  });

  it('página que veio com muito menos links que antes não substitui a lista guardada (site mudou)', async () => {
    const muitos: [string, string][] = Array.from({ length: 12 }, (_, i) => [`Documento ${i}`, `https://www.gov.br/esocial/doc${i}.pdf`]);
    let rodada = 0;
    const { service, prisma, fontes } = montar({ portal: () => (rodada++ < 10 ? html(...muitos) : html(...muitos.slice(0, 3))) });
    await service.executar('agendada');
    const r = await service.executar('agendada');
    expect(r!.status).toBe('parcial');
    expect(ultimoUpdate(prisma).erros.some((e: string) => e.includes('a lista guardada foi mantida'))).toBe(true);
    expect(fontes.get('cgibs-regulamentos')!.itens).toHaveLength(12);
  });
});

describe('revisão semanal: alterações ainda não consolidadas', () => {
  const ART_174 = { tipo: 'artigo', rotulo: 'Art. 174', caminho: 'art-174', texto: 'Art. 174. A Lei Complementar nº 214, de 16 de janeiro de 2025, passa a vigorar com as seguintes alterações:\n“Art. 12. Texto novo.” (NR)\n“Art. 30-A. Artigo incluído.”' };
  const normas = () => [
    norma({ chave: 'lcp-214-2025', numero: 'LC 214/2025', id: 'n214' }),
    norma({ chave: 'lcp-300-2026', numero: 'LC 300/2026', id: 'n300', atos_modificadores: [] }),
  ];

  it('o ato altera a norma e o texto compilado dela não cita o ato: pendência registrada, ligada à norma alterada', async () => {
    const { service, baseLegal } = montar({ normas: normas(), artigos: { n300: [ART_174] } });
    await service.executar('agendada');
    const p = registradas(baseLegal).find((n) => n.tipo === 'nao_consolidada')!;
    expect(p).toMatchObject({ norma_chave: 'lcp-214-2025', norma_numero: 'LC 214/2025', ato: 'LC 300/2026', ato_ref: 'lc 300/2026', origem: 'texto_oficial', confirmada: true });
    expect(p.titulo).toBe('LC 300/2026 altera a LC 214/2025, mas o texto compilado da LC 214/2025 ainda não traz a mudança');
    expect(p.detalhes).toEqual([{ rotulo: 'Art. 12', caminho: 'art-12' }, { rotulo: 'Art. 30-A', caminho: 'art-30-a' }]);
    expect(p.resumo).toContain('Pelos Art. 174 da LC 300/2026');
  });

  it('quando o compilado passa a citar o ato, a pendência aberta é dada como resolvida', async () => {
    const n = normas();
    n[0].atos_modificadores = [{ ato: 'LC 300/2026', referencia: 'lc 300/2026', dispositivos: 2, tipos: ['redacao'] }];
    const { service, prisma, baseLegal } = montar({ normas: n, artigos: { n300: [ART_174] }, naoConsolidadas: [{ id: 'nv1', norma_chave: 'lcp-214-2025', ato_ref: 'lc 300/2026', status: 'nova' }] });
    await service.executar('agendada');
    expect(registradas(baseLegal).filter((x) => x.tipo === 'nao_consolidada')).toEqual([]);
    expect(prisma.novidadeLegal.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['nv1'] } }, data: { status: 'resolvida', resolvida_por: 'sistema', resolvida_em: AGORA } });
  });

  it('pendência já registrada não se repete; a que a equipe descartou continua descartada', async () => {
    const { service, prisma, baseLegal } = montar({ normas: normas(), artigos: { n300: [ART_174] }, naoConsolidadas: [{ id: 'nv1', norma_chave: 'lcp-214-2025', ato_ref: 'lc 300/2026', status: 'descartada' }] });
    await service.executar('agendada');
    expect(registradas(baseLegal).filter((x) => x.tipo === 'nao_consolidada')).toEqual([]);
    expect(prisma.novidadeLegal.update).not.toHaveBeenCalled();
    expect(prisma.novidadeLegal.updateMany).not.toHaveBeenCalled();
  });
});

describe('revisão semanal: pesquisa na web', () => {
  const resposta = (...itens: Record<string, unknown>[]) => ({ texto: JSON.stringify({ itens }), grounding: null, modelo: 'teste' });
  const item = (o: Record<string, unknown> = {}) => ({ tipo: 'regulamentacao', norma: 'LC 214/2025', ato: 'Instrução Normativa RFB nº 2.300, de 2026', data: '2026-11-20', titulo: 'IN RFB regulamenta o crédito presumido', resumo: 'Regula o crédito.', url: 'https://normas.receita.fazenda.gov.br/sijut2consulta/a', ...o });

  it('sem motor de IA ou com a pesquisa desligada, não pesquisa e avisa na rodada', async () => {
    const a = montar({ ia: false });
    await a.service.executar('agendada');
    expect(a.baseLegal.iaComBusca).not.toHaveBeenCalled();
    const b = montar({ ia: true, env: { BASE_LEGAL_BUSCA_WEB: 'false' } });
    await b.service.executar('agendada');
    expect(b.baseLegal.iaComBusca).not.toHaveBeenCalled();
  });

  it('item da pesquisa entra como novidade "a confirmar"; endereço que não abre e item repetido são descartados', async () => {
    const { service, baseLegal, prisma } = montar({
      ia: true,
      jaRegistradas: [{ url: 'https://normas.receita.fazenda.gov.br/sijut2consulta/repetida', ato_ref: null, norma_chave: null }],
    });
    baseLegal.iaComBusca.mockImplementation(async (prompt: string) => (prompt.includes('Reforma do consumo')
      ? resposta(item(), item({ url: 'https://normas.receita.fazenda.gov.br/sijut2consulta/inventada', titulo: 'Ato com link inventado pela IA' }), item({ url: 'https://normas.receita.fazenda.gov.br/sijut2consulta/repetida', titulo: 'Ato que já está registrado' }))
      : resposta()));
    baseLegal.urlResponde.mockImplementation(async (url: string) => !url.endsWith('/inventada'));
    await service.executar('agendada');
    const web = registradas(baseLegal).filter((n) => n.origem === 'busca_web');
    expect(web).toHaveLength(1);
    expect(web[0]).toMatchObject({ confirmada: false, oficial: true, norma_chave: 'lcp-214-2025', execucao_id: 'rev1' });
    expect(ultimoUpdate(prisma).atos_relacionados).toBe(1);
  });

  it('a pesquisa que falha em um bloco vira erro daquele bloco e a rodada continua', async () => {
    const { service, baseLegal, prisma } = montar({ ia: true });
    baseLegal.iaComBusca.mockRejectedValue(new Error('motor indisponível'));
    const r = await service.executar('agendada');
    expect(r!.status).toBe('parcial');
    expect(ultimoUpdate(prisma).erros[0]).toBe('Pesquisa na web (Reforma do consumo): motor indisponível');
  });
});

describe('revisão semanal: aplicações e controle de rodadas', () => {
  it('regulamento que cita artigo que mudou vira aviso de aplicação, ligado ao regulamento', async () => {
    const { service, baseLegal } = montar({
      mudancasTexto: [{ norma_chave: 'lcp-214-2025', detalhes: [{ rotulo: 'Art. 12', caminho: 'art-12' }, { rotulo: 'Art. 30', caminho: 'art-30' }] }],
      citacoes: [{ rotulo: 'Art. 4º', caminho: 'art-4', norma: { chave: 'res-cgibs-6', numero: 'Res. CGIBS 6/2026' } }, { rotulo: 'Art. 9º', caminho: 'art-9', norma: { chave: 'res-cgibs-6', numero: 'Res. CGIBS 6/2026' } }],
    });
    await service.executar('agendada');
    const a = registradas(baseLegal).find((n) => n.tipo === 'aplicacao')!;
    expect(a).toMatchObject({ origem: 'remissao', norma_chave: 'res-cgibs-6', confirmada: true });
    expect(a.titulo).toBe('Res. CGIBS 6/2026: 2 dispositivos citam artigos da LC 214/2025 que mudaram');
    expect(a.resumo).toContain('Art. 4º, Art. 9º');
  });

  it('disparo manual: responde na hora, não duplica quando já há rodada em andamento', async () => {
    const a = montar();
    const r = await a.service.iniciar('adm@fal.test');
    expect(r).toEqual({ id: 'rev1', status: 'executando', ja_em_andamento: false });
    expect(a.prisma.revisaoSemanal.create.mock.calls[0][0].data).toMatchObject({ disparo: 'manual', resumo: 'Disparada por adm@fal.test.' });
    await new Promise((ok) => setTimeout(ok, 50)); // deixa a rodada em segundo plano terminar

    const b = montar({ emCurso: true });
    expect(await b.service.iniciar('adm@fal.test')).toEqual({ id: 'rev0', status: 'executando', ja_em_andamento: true });
    expect(await b.service.executar('agendada')).toBeNull();
    expect(b.prisma.revisaoSemanal.create).not.toHaveBeenCalled();
  });

  it('rodada travada há mais de 3 horas é encerrada como falha antes de uma nova', async () => {
    const { service, prisma } = montar();
    await service.executar('agendada');
    expect(prisma.revisaoSemanal.updateMany).toHaveBeenCalledWith({
      where: { status: 'executando', iniciado_em: { lt: new Date(AGORA.getTime() - 3 * 3_600_000) } },
      data: expect.objectContaining({ status: 'falhou' }),
    });
  });

  it('rotina desligada por variável de ambiente não roda; o estado informa o que está ligado', async () => {
    const { service, prisma } = montar({ env: { BASE_LEGAL_REVISAO_SEMANAL: 'false' } });
    await service.agendada();
    expect(prisma.revisaoSemanal.create).not.toHaveBeenCalled();
    expect(service.estado()).toMatchObject({ ligada: false, aplica_automaticamente: true, agenda: 'Toda segunda-feira, às 5h (horário de Brasília)' });
  });
});
