import { describe, expect, it, vi } from 'vitest';
import { BaseLegalService } from './base-legal.service';
import { extrairDispositivos, htmlParaTexto, sha256 } from './base-legal.parser';

const ANTIGO = '<p>Art. 1º Primeiro.</p><p>Art. 2º Segundo, texto antigo.</p><p>Art. 3º Terceiro.</p><p>Art. 4º Quarto.</p>';
const NOVO = `<p>Art. 1º Primeiro.</p>
  <p>Art. 2º <s>Segundo, texto antigo.</s> Segundo, texto novo. (Redação dada pela Lei Complementar nº 239, de 2026)</p>
  <p>Art. 3º (Revogado pela Lei Complementar nº 239, de 2026)</p>
  <p>Art. 4º Quarto.</p>
  <p>Art. 5º Quinto, novo. (Incluído pela Lei Complementar nº 239, de 2026)</p>`;

const NORMA = { id: 'n1', chave: 'lcp-214-2025', numero: 'LC 214/2025', url_oficial: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm', hash_atual: 'hash-velho', total_dispositivos: 4, formato: 'html', situacao: 'vigente', revogada_em: null };

const gravados = (html = ANTIGO) => extrairDispositivos(htmlParaTexto(html)).map((d, i) => ({
  id: `d${i + 1}`, caminho: d.caminho, rotulo: d.rotulo, texto: d.texto, hash: sha256(d.texto), revogado: d.revogado, ordem: d.ordem, secao: d.secao,
  parcialmente_revogado: false, revogado_por: null, alteracoes: [], redacoes_anteriores: [], temas: [],
}));

function montar(opcoes: { html?: string; existentes?: unknown[]; formato?: 'html' | 'pdf'; texto?: string } = {}) {
  const prisma = {
    normaLegal: { upsert: vi.fn(), findUnique: vi.fn().mockResolvedValue(NORMA), findMany: vi.fn().mockResolvedValue([NORMA]), update: vi.fn() },
    dispositivoLegal: { findMany: vi.fn().mockResolvedValue(opcoes.existentes ?? gravados()), update: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
    dispositivoLegalVersao: { create: vi.fn() },
    alertaBaseLegal: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'a1' }), update: vi.fn() },
    referenciaLegal: { deleteMany: vi.fn(), createMany: vi.fn() },
    novidadeLegal: { createMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const revisao = { registrarMudancas: vi.fn().mockResolvedValue({ cartoes: 0, cartoes_despublicados: 0, fundamentos: 0, marcos: 0, itens: 0 }), impacto: vi.fn().mockResolvedValue({ cartoes: 0, publicados: 0, fundamentos: 0, marcos: 0 }) };
  const service = new BaseLegalService(prisma as any, { get: () => undefined } as any, revisao as any);
  vi.spyOn(service as any, 'baixarDocumento').mockResolvedValue({ texto: opcoes.texto ?? htmlParaTexto(opcoes.html ?? NOVO), formato: opcoes.formato ?? 'html' });
  return { prisma, revisao, service };
}

const novidades = (prisma: ReturnType<typeof montar>['prisma']) => (prisma.novidadeLegal.createMany.mock.calls[0]?.[0].data ?? []) as Record<string, any>[];

describe('atualização da norma alimenta a base de conhecimento', () => {
  it('registra o que mudou agrupado por ato: alteração, revogação e dispositivo novo, lidos do texto oficial', async () => {
    const { service, prisma } = montar();
    const r = await service.importar('lcp-214-2025');
    // alterados conta os dispositivos cujo texto mudou (o art. 2º e o art. 3º, que virou "(Revogado...)"); revogados, só os que passaram a revogados
    expect(r).toMatchObject({ alterada: true, alterados: 2, novos: 1, revogados: 1 });
    const n = novidades(prisma);
    expect(n.map((x) => x.tipo).sort()).toEqual(['alteracao', 'inclusao', 'revogacao']);
    expect(n.find((x) => x.tipo === 'alteracao')).toMatchObject({ titulo: 'LC 214/2025: 1 dispositivo alterado pela LC 239/2026', ato: 'LC 239/2026', origem: 'texto_oficial', confirmada: true, oficial: true });
    expect(n.find((x) => x.tipo === 'revogacao')).toMatchObject({ titulo: 'LC 214/2025: 1 dispositivo revogado pela LC 239/2026', resumo: 'Art. 3º' });
    expect(n.find((x) => x.tipo === 'inclusao')!.detalhes).toEqual([{ rotulo: 'Art. 5º', caminho: 'art-5' }]);
  });

  it('o dispositivo alterado guarda a redação anterior (o que estava riscado), as notas e a data da mudança; o revogado, o ato', async () => {
    const { service, prisma } = montar();
    await service.importar('lcp-214-2025');
    const art2 = prisma.dispositivoLegal.update.mock.calls.find((c: any[]) => c[0].where?.id === 'd2')?.[0] ?? prisma.$transaction.mock.calls[0][0][1];
    // a atualização do art. 2º vai dentro de $transaction([versão, update]); o spy do update recebe os mesmos argumentos
    const data = prisma.dispositivoLegal.update.mock.calls.map((c: any[]) => c[0]).find((c: any) => c.where.id === 'd2')!.data;
    expect(art2).toBeTruthy();
    expect(data.texto).toContain('texto novo');
    expect(data.texto).not.toContain('texto antigo');
    expect(data.redacoes_anteriores).toEqual(['Segundo, texto antigo.']);
    expect(data.alteracoes).toEqual([expect.objectContaining({ tipo: 'redacao', ato: 'LC 239/2026' })]);
    expect(data.alterado_em).toBeInstanceOf(Date);
    const art3 = prisma.dispositivoLegal.update.mock.calls.map((c: any[]) => c[0]).find((c: any) => c.where.id === 'd3')!.data;
    expect(art3).toMatchObject({ revogado: true, revogado_por: 'LC 239/2026' });
  });

  it('a norma recebe a lista de atos que a modificaram, a situação e a data da última atualização', async () => {
    const { service, prisma } = montar();
    await service.importar('lcp-214-2025');
    const data = prisma.normaLegal.update.mock.calls.at(-1)![0].data;
    expect(data.atos_modificadores).toEqual([expect.objectContaining({ ato: 'LC 239/2026', referencia: 'lc 239/2026', dispositivos: 3, tipos: expect.arrayContaining(['redacao', 'revogacao', 'inclusao']) })]);
    expect(data.situacao).toBe('parcialmente_revogada');
    expect(data.atualizada_em).toBeInstanceOf(Date);
    expect(data.formato).toBe('html');
  });

  it('primeira carga: uma novidade só ("norma carregada"), sem uma linha por dispositivo', async () => {
    const { service, prisma } = montar({ existentes: [] });
    const r = await service.importar('lcp-214-2025');
    expect(r.novos).toBe(5);
    expect(novidades(prisma)).toEqual([expect.objectContaining({ tipo: 'nova_norma', titulo: 'LC 214/2025 carregada na base de conhecimento' })]);
    // e a norma não aparece como "atualizada" por ter sido carregada agora
    expect(prisma.normaLegal.update.mock.calls.at(-1)![0].data).not.toHaveProperty('atualizada_em');
  });

  it('PDF: o formato fica gravado na norma', async () => {
    const { service, prisma } = montar({ formato: 'pdf' });
    await service.importar('lcp-214-2025');
    expect(prisma.normaLegal.update.mock.calls.at(-1)![0].data.formato).toBe('pdf');
  });

  it('sem aviso por norma quando a rotina semanal manda um só e-mail', async () => {
    const { service, revisao } = montar();
    await service.importar('lcp-214-2025', { semAviso: true });
    expect(revisao.registrarMudancas.mock.calls[0][2]).toEqual({ avisar: false });
    await service.importar('lcp-214-2025');
    expect(revisao.registrarMudancas.mock.calls[1][2]).toEqual({ avisar: true });
  });

  it('a revogação que o leitor passa a reconhecer vai para a fila de revisão mesmo com o texto igual', async () => {
    // o texto não mudou, mas o artigo estava gravado como em vigor e o texto oficial o dá como revogado
    const existentes = extrairDispositivos(htmlParaTexto(NOVO)).map((d, i) => ({ id: `d${i + 1}`, caminho: d.caminho, rotulo: d.rotulo, texto: d.texto, hash: sha256(d.texto), revogado: d.caminho === 'art-3' ? false : d.revogado, ordem: d.ordem, secao: d.secao }));
    const { service, revisao } = montar({ existentes });
    await service.importar('lcp-214-2025');
    expect(revisao.registrarMudancas.mock.calls[0][1]).toEqual([expect.objectContaining({ caminho: 'art-3', mudanca: 'revogado' })]);
  });
});

describe('proteção contra página oficial que mudou de forma', () => {
  const muitos = Array.from({ length: 30 }, (_, i) => `<p>Art. ${i + 1}º Texto ${i + 1}.</p>`).join('');
  const poucos = Array.from({ length: 8 }, (_, i) => `<p>Art. ${i + 1}º Texto ${i + 1}.</p>`).join('');

  it('a atualização automática que perde mais de 30% dos dispositivos não grava nada e avisa', async () => {
    const { service, prisma } = montar({ html: poucos, existentes: gravados(muitos) });
    const r = await service.importar('lcp-214-2025', { automatico: true, execucaoId: 'rev1' });
    expect(r.alterada).toBe(false);
    expect(r.motivo).toContain('8 dispositivos');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.dispositivoLegal.createMany).not.toHaveBeenCalled();
    expect(prisma.dispositivoLegal.updateMany).not.toHaveBeenCalled();
    expect(prisma.normaLegal.update).not.toHaveBeenCalled();
    expect(novidades(prisma)).toEqual([expect.objectContaining({ tipo: 'estrutura_suspeita', execucao_id: 'rev1' })]);
    expect(prisma.alertaBaseLegal.create).toHaveBeenCalledTimes(1);
  });

  it('a mesma atualização feita à mão (por quem conferiu a página) é gravada', async () => {
    const { service, prisma } = montar({ html: poucos, existentes: gravados(muitos) });
    const r = await service.importar('lcp-214-2025');
    expect(r.alterada).toBe(true);
    expect(prisma.dispositivoLegal.updateMany).toHaveBeenCalled(); // os 22 que sumiram constam como revogados
  });

  it('norma pequena pode mesmo encolher: a guarda só vale de 20 dispositivos para cima', async () => {
    const dez = Array.from({ length: 10 }, (_, i) => `<p>Art. ${i + 1}º Texto ${i + 1}.</p>`).join('');
    const cinco = Array.from({ length: 5 }, (_, i) => `<p>Art. ${i + 1}º Texto ${i + 1}.</p>`).join('');
    const { service } = montar({ html: cinco, existentes: gravados(dez) });
    expect((await service.importar('lcp-214-2025', { automatico: true })).alterada).toBe(true);
  });

  it('página que não traz nenhum dispositivo nunca é gravada, nem à mão', async () => {
    const { service, prisma } = montar({ html: '<p>Página de manutenção do site.</p>' });
    await expect(service.importar('lcp-214-2025')).rejects.toThrow('Não foi possível identificar os dispositivos');
    expect(prisma.dispositivoLegal.updateMany).not.toHaveBeenCalled();
  });
});

describe('norma gravada por um leitor anterior (reprocessamento)', () => {
  const antiga = { ...NORMA, leitor_versao: 0 };

  it('relê mesmo com o texto idêntico, grava os campos que o leitor novo deriva e a versão do leitor, sem marcar mudança da lei', async () => {
    const { service, prisma } = montar({ existentes: gravados(NOVO) });
    prisma.normaLegal.findUnique.mockResolvedValue({ ...antiga, hash_atual: sha256(htmlParaTexto(NOVO)) });
    const r = await service.importar('lcp-214-2025');
    expect(r).toMatchObject({ alterada: true, reprocessada: true, alterados: 0 });
    const art2 = prisma.dispositivoLegal.update.mock.calls.map((c: any[]) => c[0]).find((c: any) => c.where.id === 'd2')!.data;
    expect(art2.alteracoes).toEqual([expect.objectContaining({ tipo: 'redacao', ato: 'LC 239/2026' })]);
    expect(art2).not.toHaveProperty('alterado_em');
    const norma = prisma.normaLegal.update.mock.calls.at(-1)![0].data;
    expect(norma.leitor_versao).toBe(2);
    expect(norma).not.toHaveProperty('atualizada_em');
    // nada mudou no texto: não há novidade a contar
    expect(novidades(prisma)).toEqual([]);
  });

  it('o que mudou no texto gravado vira UMA novidade de reprocessamento (não "alteração pela LC 239"), e a fila de revisão recebe o que citava o texto antigo', async () => {
    const antigos = gravados();
    const { service, prisma, revisao } = montar({ existentes: [...antigos, { ...antigos[0], id: 'd9', caminho: 'art-9', rotulo: 'Art. 9º', texto: 'Art. 9º Que saiu do texto oficial.', hash: 'x' }] });
    prisma.normaLegal.findUnique.mockResolvedValue(antiga);
    const r = await service.importar('lcp-214-2025');
    expect(r).toMatchObject({ alterada: true, reprocessada: true, alterados: 2, removidos: 1 });
    const n = novidades(prisma);
    expect(n.map((x) => x.tipo)).toEqual(['reprocessada']);
    expect(n[0].titulo).toBe('LC 214/2025: texto reprocessado com a leitura nova do texto oficial');
    expect(n[0].resumo).toContain('Isso não é mudança da lei');
    expect(n[0].detalhes.map((d: { caminho: string }) => d.caminho).sort()).toEqual(['art-2', 'art-3', 'art-9']);
    // a fila de revisão continua sendo alimentada: o cartão pode ter citado texto que já não valia
    expect(revisao.registrarMudancas.mock.calls[0][1].map((m: { caminho: string }) => m.caminho)).toEqual(['art-2', 'art-3', 'art-9']);
    // nenhum dispositivo ganha a data de "texto alterado"
    for (const c of prisma.dispositivoLegal.update.mock.calls) expect(c[0].data).not.toHaveProperty('alterado_em');
    expect(prisma.dispositivoLegal.createMany.mock.calls[0][0].data[0].alterado_em).toBeNull();
    expect(prisma.dispositivoLegal.updateMany.mock.calls[0][0].data).toEqual({ revogado: true });
    expect(prisma.normaLegal.update.mock.calls.at(-1)![0].data).not.toHaveProperty('atualizada_em');
  });

  it('norma já gravada pelo leitor atual segue o caminho normal (a mudança é da lei)', async () => {
    const { service, prisma } = montar();
    prisma.normaLegal.findUnique.mockResolvedValue({ ...NORMA, leitor_versao: 2 });
    const r = await service.importar('lcp-214-2025');
    expect(r.reprocessada).toBeUndefined();
    expect(novidades(prisma).map((x) => x.tipo).sort()).toEqual(['alteracao', 'inclusao', 'revogacao']);
  });
});

describe('norma só com referência (fonte oficial sem texto legível)', () => {
  it('não tenta baixar e explica', async () => {
    const { service, prisma } = montar();
    prisma.normaLegal.findUnique.mockResolvedValue({ ...NORMA, formato: 'externo' });
    await expect(service.importar('lcp-214-2025')).rejects.toThrow('só tem a referência');
  });
});
