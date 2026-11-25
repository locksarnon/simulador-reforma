import { afterEach, describe, expect, it, vi } from 'vitest';
import { lerBlocos, perguntarAoClaude } from './claude';

const resposta = (corpo: object, ok = true, status = 200) => ({ ok, status, json: async () => corpo });

afterEach(() => vi.unstubAllGlobals());

describe('leitura dos blocos do Claude', () => {
  it('junta o texto e as fontes da busca e das citações, sem repetir endereço', () => {
    const r = lerBlocos([
      { type: 'server_tool_use' },
      { type: 'web_search_tool_result', content: [{ url: 'https://www.planalto.gov.br/x', title: 'Planalto' }, { url: 'http://inseguro.test', title: 'x' }] },
      { type: 'text', text: 'Parte 1. ', citations: [{ url: 'https://www.planalto.gov.br/x', title: 'Planalto' }, { url: 'https://cgibs.gov.br/y', title: 'CGIBS' }] },
      { type: 'text', text: 'Parte 2.' },
    ]);
    expect(r.texto).toBe('Parte 1. Parte 2.');
    expect(r.fontes.map((f) => f.uri)).toEqual(['https://www.planalto.gov.br/x', 'https://cgibs.gov.br/y']);
  });
  it('resultado de busca com erro não derruba a leitura', () => {
    expect(lerBlocos([{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error' } }, { type: 'text', text: 'ok' }]).texto).toBe('ok');
  });
});

describe('chamada ao Claude', () => {
  it('manda chave, versão e modelo; liga a busca só quando pedida', async () => {
    const f = vi.fn(async () => resposta({ content: [{ type: 'text', text: '{"a":1}' }], stop_reason: 'end_turn', model: 'claude-fable-5-2' }));
    vi.stubGlobal('fetch', f);
    const r = await perguntarAoClaude({ apiKey: 'k', modelo: 'claude-fable-5-2', prompt: 'oi' });
    expect(r.texto).toBe('{"a":1}');
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('k');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(init.body).tools).toBeUndefined();
    await perguntarAoClaude({ apiKey: 'k', modelo: 'm', prompt: 'oi', busca: true });
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, { body: string }])[1].body).tools[0]).toMatchObject({ type: 'web_search_20250305', name: 'web_search' });
  });
  it('continua quando a pesquisa pede mais uma volta (pause_turn) e junta as fontes', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(resposta({ content: [{ type: 'web_search_tool_result', content: [{ url: 'https://a.gov.br/1', title: 'A' }] }], stop_reason: 'pause_turn' }))
      .mockResolvedValueOnce(resposta({ content: [{ type: 'text', text: 'Final.' }], stop_reason: 'end_turn' }));
    vi.stubGlobal('fetch', f);
    const r = await perguntarAoClaude({ apiKey: 'k', modelo: 'm', prompt: 'p', busca: true });
    expect(r.texto).toBe('Final.');
    expect(r.grounding.groundingChunks.map((c) => c.web.uri)).toEqual(['https://a.gov.br/1']);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('erro da API e resposta vazia viram erro com a mensagem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: { message: 'chave inválida' } }, false, 401)));
    await expect(perguntarAoClaude({ apiKey: 'k', modelo: 'm', prompt: 'p' })).rejects.toThrow('Claude API 401: chave inválida');
    vi.stubGlobal('fetch', vi.fn(async () => resposta({ content: [], stop_reason: 'end_turn' })));
    await expect(perguntarAoClaude({ apiKey: 'k', modelo: 'm', prompt: 'p' })).rejects.toThrow('vazia');
  });
});

describe('ponte para o Claude Code da VPS', () => {
  it('manda o token e devolve texto e fontes no mesmo formato; só aceita https', async () => {
    const f = vi.fn(async () => resposta({ texto: 'Resposta.', fontes: [{ uri: 'https://a.gov.br/x', title: 'A' }, { uri: 'http://x.test', title: 'x' }], modelo: 'claude-fable-5-2' }));
    vi.stubGlobal('fetch', f);
    const { perguntarViaPonte } = await import('./claude');
    const r = await perguntarViaPonte({ url: 'http://host.docker.internal:3910/', token: 'tok', prompt: 'p', busca: true });
    expect(r.texto).toBe('Resposta.');
    expect(r.grounding.groundingChunks.map((c) => c.web.uri)).toEqual(['https://a.gov.br/x']);
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('http://host.docker.internal:3910/perguntar');
    expect(init.headers['x-token']).toBe('tok');
    expect(JSON.parse(init.body)).toMatchObject({ prompt: 'p', busca: true });
  });
  it('ponte fora do ar ou sem login vira erro com o motivo', async () => {
    const { perguntarViaPonte } = await import('./claude');
    vi.stubGlobal('fetch', vi.fn(async () => resposta({ erro: 'Not logged in' }, false, 502)));
    await expect(perguntarViaPonte({ url: 'http://x', token: 't', prompt: 'p' })).rejects.toThrow('Claude Code 502: Not logged in');
    vi.stubGlobal('fetch', vi.fn(async () => resposta({ texto: '' })));
    await expect(perguntarViaPonte({ url: 'http://x', token: 't', prompt: 'p' })).rejects.toThrow('vazia');
  });
});
