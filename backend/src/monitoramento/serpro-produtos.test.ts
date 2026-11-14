import { describe, expect, it } from 'vitest';
import { testarProdutoSerpro } from './serpro-produtos';

const resp = (token: number, api: number) => (async (url: string) => (String(url).endsWith('/token')
  ? new Response(token === 200 ? JSON.stringify({ access_token: 't' }) : '', { status: token })
  : new Response('', { status: api }))) as unknown as typeof fetch;
const ch = { key: 'k', secret: 's' };

describe('teste das chaves dos produtos do Serpro (sem custo)', () => {
  it('distingue chaves recusadas, chaves sem acesso ao produto e chaves certas', async () => {
    expect(await testarProdutoSerpro('cnd', ch, resp(401, 400))).toMatchObject({ ok: false, mensagem: expect.stringMatching(/recusou as chaves \(HTTP 401\)/) });
    expect(await testarProdutoSerpro('dividaAtiva', ch, resp(200, 403))).toMatchObject({ ok: false, mensagem: expect.stringMatching(/não têm acesso a este produto \(HTTP 403\)/) });
    expect(await testarProdutoSerpro('dividaAtiva', ch, resp(200, 400))).toMatchObject({ ok: true });
    expect(await testarProdutoSerpro('cnd', null)).toMatchObject({ ok: false, mensagem: 'Consulta CND: sem chaves cadastradas.' });
  });
});
