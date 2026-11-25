import { describe, expect, it } from 'vitest';
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
  it('o modelo registrado é o pedido à ponte, ou claude-code quando não se escolhe', () => {
    expect(com({ ...ponte }).modeloAtual()).toBe('claude-code');
    expect(com({ ...ponte, CLAUDE_CODE_MODEL: 'claude-fable-5-2' }).modeloAtual()).toBe('claude-fable-5-2');
  });
});
