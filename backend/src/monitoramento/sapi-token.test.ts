import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';

const capturado: { opcoes?: Record<string, unknown>; corpo?: string } = {};
vi.mock('https', () => ({
  request: (_url: string, opcoes: Record<string, unknown>, aoResponder: (res: EventEmitter & { statusCode: number }) => void) => {
    capturado.opcoes = opcoes;
    const req = new EventEmitter() as EventEmitter & { end: (c: string) => void; destroy: () => void };
    req.destroy = () => undefined;
    req.end = (c: string) => {
      capturado.corpo = c;
      const res = Object.assign(new EventEmitter(), { statusCode: 200 });
      aoResponder(res);
      res.emit('data', JSON.stringify({ access_token: 'A', jwt_token: 'J', expires_in: 2008 }));
      res.emit('end');
    };
    return req;
  },
}));

const { pedirTokenSapi } = await import('./integra.cliente');

describe('token do SAPI (Serpro)', () => {
  it('informa o tamanho do corpo: o SAPI fica parado ~30 s com corpo em pedaços (chunked)', async () => {
    const t = await pedirTokenSapi({ consumerKey: 'K', consumerSecret: 'S', pfx: Buffer.from('x'), senha: 'p' });
    const h = capturado.opcoes!.headers as Record<string, unknown>;
    expect(capturado.corpo).toBe('grant_type=client_credentials');
    expect(h['Content-Length']).toBe(Buffer.byteLength('grant_type=client_credentials'));
    expect(h['Role-Type']).toBe('TERCEIROS');
    expect(h.Authorization).toBe(`Basic ${Buffer.from('K:S').toString('base64')}`);
    expect(t).toMatchObject({ access: 'A', jwt: 'J' });
  });
});
