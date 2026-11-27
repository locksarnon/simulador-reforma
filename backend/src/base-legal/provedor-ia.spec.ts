import { describe, expect, it, vi } from 'vitest';
import { BaseLegalService } from './base-legal.service';

const com = (env: Record<string, string>) => new BaseLegalService({} as never, { get: (k: string) => env[k] } as never, {} as never);

describe('motor do assistente (Claude ou Gemini)', () => {
  it('com chave da Anthropic usa o Claude (Fable por padrão); o Gemini fica de reserva', () => {
    const s = com({ ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: 'g' });
    expect(s.provedorIa()).toBe('claude');
    expect(s.modeloAtual()).toBe('claude-fable-5-2');
    expect(s.iaConfigurada()).toBe(true);
  });
  it('o modelo do Claude pode ser trocado só pelo ambiente', () => {
    expect(com({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'claude-opus-5-5' }).modeloAtual()).toBe('claude-opus-5-5');
  });
  it('sem chave da Anthropic, ou com IA_ASSISTENTE=gemini, usa o Gemini', () => {
    expect(com({ GEMINI_API_KEY: 'g' }).provedorIa()).toBe('gemini');
    expect(com({ ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: 'g', IA_ASSISTENTE: 'gemini' }).provedorIa()).toBe('gemini');
    expect(com({ GEMINI_API_KEY: 'g' }).modeloAtual()).toBe('gemini-3.5-flash');
  });
  it('sem nenhuma chave, a IA fica indisponível; forçar o Gemini sem chave dele também', () => {
    expect(com({}).provedorIa()).toBeNull();
    expect(com({}).iaConfigurada()).toBe(false);
    expect(com({ ANTHROPIC_API_KEY: 'k', IA_ASSISTENTE: 'gemini' }).provedorIa()).toBeNull();
  });
});

describe('ponte do Claude Code (créditos da conta, sem chave de API)', () => {
  const ponte = { CLAUDE_BRIDGE_URL: 'http://host.docker.internal:3910', CLAUDE_BRIDGE_TOKEN: 'segredo-bem-comprido-123456' };
  it('com a ponte configurada ela vem primeiro, antes da API e do Gemini', () => {
    const s = com({ ...ponte, ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: 'g' });
    expect(s.provedorIa()).toBe('claude-code');
    expect(s.iaConfigurada()).toBe(true);
  });
  it('sem o token a ponte não vale; IA_ASSISTENTE força outro motor', () => {
    expect(com({ CLAUDE_BRIDGE_URL: 'http://x', GEMINI_API_KEY: 'g' }).provedorIa()).toBe('gemini');
    expect(com({ ...ponte, GEMINI_API_KEY: 'g', IA_ASSISTENTE: 'gemini' }).provedorIa()).toBe('gemini');
    expect(com({ ...ponte, ANTHROPIC_API_KEY: 'k', IA_ASSISTENTE: 'claude' }).provedorIa()).toBe('claude');
  });
  it('a ponte responde com o Claude Fable 5.2 quando o ambiente não escolhe outro modelo', () => {
    expect(com({ ...ponte }).modeloAtual()).toBe('claude-fable-5-2');
    expect(com({ ...ponte, CLAUDE_CODE_MODEL: 'claude-opus-5-5' }).modeloAtual()).toBe('claude-opus-5-5');
  });
});

describe('prazo pedido à ponte', () => {
  const ponte = { CLAUDE_BRIDGE_URL: 'http://ponte', CLAUDE_BRIDGE_TOKEN: 'segredo-bem-comprido-123456' };
  const comFetch = async (chamar: (s: BaseLegalService) => Promise<unknown>) => {
    const corpos: { timeout_ms: number; busca: boolean }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: { body?: string }) => {
      corpos.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ texto: 'ok', modelo: 'claude-x' }), { status: 200 });
    }) as never;
    try { return { r: await chamar(com(ponte)), corpos }; } finally { globalThis.fetch = original; }
  };
  it('o rascunho rápido passa o prazo curto à ponte (que encerra o processo nele) e devolve o modelo', async () => {
    const { r, corpos } = await comFetch((s) => s.iaComModelo('p', 60_000));
    expect(r).toEqual({ texto: 'ok', modelo: 'claude-x' });
    expect(corpos[0]).toMatchObject({ busca: false, timeout_ms: 55_000 });
  });
  it('a pesquisa externa aceita o prazo de quem chama; ia() mantém o mínimo de 90 s de antes', async () => {
    expect((await comFetch((s) => s.iaComBusca('p', 170_000))).corpos[0]).toMatchObject({ busca: true, timeout_ms: 165_000 });
    expect((await comFetch((s) => s.ia('p', 30_000))).corpos[0]).toMatchObject({ timeout_ms: 85_000 });
  });
  it('pede o Claude Fable 5.2 à ponte e dá à resposta consultiva o prazo longo (os termos, o curto)', async () => {
    const { corpos } = await comFetch(async (s) => {
      await s.termosDaPergunta('como calculo o ICMS do adubo no MS?');
      await s.iaComModelo('resposta', 45_000, 150_000);
    });
    expect(corpos[0]).toMatchObject({ modelo: 'claude-fable-5-2', timeout_ms: 40_000 });
    expect(corpos[1]).toMatchObject({ modelo: 'claude-fable-5-2', timeout_ms: 145_000 });
  });
});

describe('reserva pela API da Anthropic', () => {
  it('pede à API um id de modelo da API (Fable 5.2 por padrão), mesmo que a ponte use outro apelido', async () => {
    const env = { CLAUDE_BRIDGE_URL: 'http://ponte', CLAUDE_BRIDGE_TOKEN: 'segredo-bem-comprido-123456', CLAUDE_CODE_MODEL: 'fable', ANTHROPIC_API_KEY: 'k' };
    const modelos: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: unknown, init?: { body?: string }) => {
      if (String(url).includes('ponte')) return new Response(JSON.stringify({ erro: 'Tempo esgotado' }), { status: 502 });
      modelos.push(JSON.parse(String(init?.body)).model);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', model: 'claude-fable-5-2' }), { status: 200 });
    }) as never;
    try {
      const r = await com(env).iaComModelo('p', 10_000, 10_000);
      expect(r.modelo).toBe('claude-fable-5-2');
      expect(modelos).toEqual(['claude-fable-5-2']);
    } finally { globalThis.fetch = original; }
  });
});
