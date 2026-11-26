import { describe, expect, it, vi } from 'vitest';
import { avisosDePendencias } from './avisos-legais';
import { alertasDoCandidato, blocoDoCandidato, promptResposta, situacaoDoCandidato, validarResposta, type Candidato } from './base-legal.assistente';
import { BaseLegalService } from './base-legal.service';
import { promptAprofundado } from './pesquisa-externa';

const base: Candidato = { chave: 'lcp-214-2025', numero: 'LC 214/2025', rotulo: 'Art. 12', caminho: 'art-12', secao: null, texto: 'Art. 12. Texto do artigo.' };
const AGORA = new Date('2026-11-25T12:00:00Z');

describe('o assistente sabe a situação do texto que vai citar', () => {
  it('cabeçalho do bloco: em vigor, revogado (pelo ato ou por veto), parcialmente revogado e norma revogada', () => {
    expect(situacaoDoCandidato(base)).toBe('em vigor');
    expect(situacaoDoCandidato({ ...base, revogado: true, revogado_por: 'LC 227/2026' })).toBe('REVOGADO pelo LC 227/2026: o texto abaixo não é regra vigente');
    expect(situacaoDoCandidato({ ...base, revogado: true, revogado_por: 'veto' })).toBe('REVOGADO por veto: o texto abaixo não é regra vigente');
    expect(situacaoDoCandidato({ ...base, parcialmente_revogado: true })).toContain('PARCIALMENTE REVOGADO');
    expect(situacaoDoCandidato({ ...base, norma_situacao: 'revogada', norma_revogada_por: 'Lei 15.000/2026' })).toBe('NORMA REVOGADA pelo Lei 15.000/2026: não é regra vigente');
  });

  it('o bloco traz as notas oficiais, a data da mudança, a redação anterior e os avisos antes do texto', () => {
    const bloco = blocoDoCandidato({
      ...base, alteracoes: ['(Redação dada pela Lei Complementar nº 227, de 2026)'], alterado_em: '2026-11-22T10:00:00Z',
      redacao_anterior: 'Texto que valia antes.', avisos: ['o LC 239/2026 altera este dispositivo e o texto compilado ainda não traz a mudança'],
    }, 0);
    const linhas = bloco.split('\n');
    expect(linhas[0]).toBe('### [1] LC 214/2025 — Art. 12 (id: lcp-214-2025/art-12) — situação: em vigor');
    expect(bloco).toContain('Alterações oficiais deste dispositivo: (Redação dada pela Lei Complementar nº 227, de 2026) (última mudança de texto registrada em 22/11/2026).');
    expect(bloco).toContain('Redação anterior (NÃO vale mais; serve só para comparar): "Texto que valia antes."');
    expect(bloco).toContain('AVISO: o LC 239/2026 altera este dispositivo e o texto compilado ainda não traz a mudança.');
    expect(linhas.at(-1)).toBe('Art. 12. Texto do artigo.');
  });

  it('os prompts mandam não apresentar revogado como vigente e avisar da alteração ainda não consolidada', () => {
    const revogado: Candidato = { ...base, rotulo: 'Art. 3º', caminho: 'art-3', revogado: true, revogado_por: 'LC 227/2026', texto: 'Art. 3º (Revogado pela Lei Complementar nº 227, de 2026)' };
    for (const prompt of [promptResposta('O art. 3º da LC 214 vale?', [revogado]), promptAprofundado('O art. 3º da LC 214 vale?', [revogado])]) {
      expect(prompt).toContain('situação: REVOGADO pelo LC 227/2026');
      expect(prompt).toContain('nunca o apresente como vigente');
      expect(prompt).toContain('AVISO de alteração ainda não consolidada');
    }
  });
});

describe('o que vai nas ressalvas mesmo que o modelo não diga', () => {
  it('revogado, norma revogada, parcialmente revogado, aviso e alteração recente', () => {
    expect(alertasDoCandidato({ ...base, revogado: true, revogado_por: 'LC 227/2026' }, AGORA)).toEqual(['consta como revogado pelo LC 227/2026']);
    expect(alertasDoCandidato({ ...base, norma_situacao: 'revogada' }, AGORA)).toEqual(['a norma consta como revogada']);
    expect(alertasDoCandidato({ ...base, parcialmente_revogado: true }, AGORA)).toEqual(['tem partes revogadas (confira as notas "Revogado" no texto oficial)']);
    expect(alertasDoCandidato({ ...base, avisos: ['o LC 239/2026 altera este dispositivo e o texto compilado ainda não traz a mudança'] }, AGORA)).toHaveLength(1);
    expect(alertasDoCandidato({ ...base, alterado_em: '2026-11-22T10:00:00Z' }, AGORA)).toEqual(['teve o texto alterado em 22/11/2026; confira se o caso concreto é anterior à mudança']);
    // mudança de 300 dias atrás já não é novidade; dispositivo em vigor sem nada de especial não gera alerta
    expect(alertasDoCandidato({ ...base, alterado_em: '2026-01-10T10:00:00Z' }, AGORA)).toEqual([]);
    expect(alertasDoCandidato(base, AGORA)).toEqual([]);
  });

  it('a resposta validada leva os alertas dos dispositivos que ela cita, junto das ressalvas do modelo', () => {
    const revogado: Candidato = { ...base, caminho: 'art-3', rotulo: 'Art. 3º', revogado: true, revogado_por: 'LC 227/2026', texto: 'Art. 3º (Revogado pela Lei Complementar nº 227, de 2026)' };
    const comAviso: Candidato = { ...base, avisos: ['o LC 239/2026 altera este dispositivo e o texto compilado ainda não traz a mudança'] };
    const r = validarResposta({
      resposta: 'O art. 3º foi revogado.', suficiente: true, ressalvas: 'Confira a vigência.',
      fundamentos: [{ id: 'lcp-214-2025/art-3', trecho: '(Revogado pela Lei Complementar nº 227, de 2026)' }, { id: 'lcp-214-2025/art-12', trecho: 'Texto do artigo' }],
    }, [revogado, comAviso]);
    expect(r.ressalvas).toBe('Confira a vigência. LC 214/2025, Art. 3º: consta como revogado pelo LC 227/2026. LC 214/2025, Art. 12: o LC 239/2026 altera este dispositivo e o texto compilado ainda não traz a mudança.');
    expect(r.suficiente).toBe(true);
  });

  it('sem alerta, as ressalvas continuam exatamente como o modelo mandou (ou nulas)', () => {
    expect(validarResposta({ resposta: 'ok', suficiente: true, ressalvas: null, fundamentos: [{ id: 'lcp-214-2025/art-12', trecho: 'Texto do artigo' }] }, [base]).ressalvas).toBeNull();
    expect(validarResposta({ resposta: 'ok', suficiente: true, ressalvas: ' Transição. ', fundamentos: [{ id: 'lcp-214-2025/art-12', trecho: 'Texto do artigo' }] }, [base]).ressalvas).toBe('Transição.');
  });
});

describe('avisos de alteração ainda não consolidada', () => {
  it('valem para os artigos da pendência (ou a norma toda, se o ato revoga tudo) e só para a norma certa', () => {
    const m = avisosDePendencias([
      { norma_chave: 'lcp-214-2025', ato: 'LC 239/2026', detalhes: [{ rotulo: 'Art. 12', caminho: 'art-12' }] },
      { norma_chave: 'lei-7678-1988', ato: 'LC 240/2026', detalhes: [] },
    ], [{ chave: 'lcp-214-2025', caminho: 'art-12' }, { chave: 'lcp-214-2025', caminho: 'art-13' }, { chave: 'lei-7678-1988', caminho: 'art-1' }, { chave: 'lcp-227-2026', caminho: 'art-12' }]);
    expect([...m.keys()]).toEqual(['lcp-214-2025/art-12', 'lei-7678-1988/art-1']);
    expect(m.get('lcp-214-2025/art-12')).toEqual(['o LC 239/2026 altera este dispositivo e o texto compilado ainda não traz a mudança']);
  });
});

describe('candidatos da pergunta', () => {
  type Linha = Record<string, unknown>;
  const linha = (o: Linha): Linha => ({
    rotulo: 'Art. 12', caminho: 'art-12', secao: null, texto: 'Art. 12. Texto.', revogado: false, revogado_por: null, parcialmente_revogado: false,
    alteracoes: [], redacoes_anteriores: [], alterado_em: null, norma: { chave: 'lcp-214-2025', numero: 'LC 214/2025', situacao: 'vigente', revogada_por: null }, ...o,
  });
  function montar(linhas: Linha[], exatos: { caminho: string }[] = [], pendencias: Linha[] = []) {
    const prisma = {
      dispositivoLegal: { findMany: vi.fn(async () => linhas) },
      novidadeLegal: { findMany: vi.fn(async () => pendencias) },
    };
    const service = new BaseLegalService(prisma as any, { get: () => undefined } as any, {} as any);
    vi.spyOn(service, 'buscar').mockResolvedValue({
      exatos: exatos.map((e) => ({ rotulo: 'x', caminho: e.caminho, secao: null, norma: { chave: 'lcp-214-2025', numero: 'LC 214/2025' } })),
      resultados: linhas.map((l) => ({ chave: 'lcp-214-2025', numero: 'LC 214/2025', rotulo: l.rotulo as string, caminho: l.caminho as string, secao: null, trecho: '', rank: 1 })),
      parcial: false,
    });
    return { service, prisma };
  }

  it('dispositivo revogado só entra quando a pergunta o pediu pelo número; nas buscas por assunto fica de fora', async () => {
    const linhas = [linha({ caminho: 'art-3', rotulo: 'Art. 3º', revogado: true, revogado_por: 'LC 227/2026', texto: 'Art. 3º (Revogado pela Lei Complementar nº 227, de 2026)' }), linha({})];
    const porAssunto = await montar(linhas).service.candidatos('Qual a regra do crédito presumido na LC 214?', []);
    expect(porAssunto.map((c) => c.caminho)).toEqual(['art-12']);
    const porNumero = await montar(linhas, [{ caminho: 'art-3' }]).service.candidatos('O art. 3 da LC 214 foi revogado?', []);
    expect(porNumero.find((c) => c.caminho === 'art-3')).toMatchObject({ revogado: true, revogado_por: 'LC 227/2026' });
  });

  it('leva a situação da norma, as notas de alteração, a data, a redação anterior e os avisos para o prompt', async () => {
    const l = linha({
      alteracoes: [{ tipo: 'redacao', trecho: '(Redação dada pela Lei Complementar nº 227, de 2026)' }, { tipo: 'vide', trecho: '(Vide ...)' }, { tipo: 'redacao', trecho: '(Redação dada pela Lei Complementar nº 227, de 2026)' }],
      redacoes_anteriores: ['Primeira redação.', 'Redação de antes.'], alterado_em: new Date('2026-11-22T10:00:00Z'),
      norma: { chave: 'lcp-214-2025', numero: 'LC 214/2025', situacao: 'parcialmente_revogada', revogada_por: null },
    });
    const { service } = montar([l], [], [{ norma_chave: 'lcp-214-2025', ato: 'LC 239/2026', detalhes: [{ caminho: 'art-12' }] }]);
    const [c] = await service.candidatos('crédito presumido', []);
    expect(c).toMatchObject({
      norma_situacao: 'parcialmente_revogada', alteracoes: ['(Redação dada pela Lei Complementar nº 227, de 2026)'], alterado_em: '2026-11-22T10:00:00.000Z',
      redacao_anterior: 'Redação de antes.', avisos: ['o LC 239/2026 altera este dispositivo e o texto compilado ainda não traz a mudança'],
    });
  });

  it('se os avisos não puderem ser lidos, a resposta continua (sem avisos)', async () => {
    const { service, prisma } = montar([linha({})]);
    prisma.novidadeLegal.findMany.mockRejectedValue(new Error('banco'));
    const [c] = await service.candidatos('crédito', []);
    expect(c.avisos).toEqual([]);
  });
});
