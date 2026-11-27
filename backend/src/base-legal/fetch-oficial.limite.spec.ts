import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { BaseLegalService } from './base-legal.service';
import { lerCorpoComLimite } from './fetch-oficial';

/** Corpo em fluxo, sem Content-Length: `pedacos` pedaços de `tam` bytes. Conta quantos foram puxados e se a leitura foi cancelada. */
function corpoEmFluxo(pedacos: number, tam: number) {
  const estado = { puxados: 0, cancelado: false };
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (estado.puxados >= pedacos) { c.close(); return; }
      estado.puxados++;
      c.enqueue(new Uint8Array(tam).fill(65));
    },
    cancel() { estado.cancelado = true; },
  }, { highWaterMark: 0 });
  return { resp: new Response(body, { status: 200, headers: { 'content-type': 'text/html' } }), estado };
}

afterEach(() => vi.unstubAllGlobals());

describe('baixarBruto: limite de tamanho conferido em fluxo', () => {
  const servico = () => new BaseLegalService({} as any, { get: () => undefined } as any, {} as any);

  it('corpo sem Content-Length maior que o limite: para no primeiro pedaço além do limite e cancela a leitura', async () => {
    const { resp, estado } = corpoEmFluxo(10_000, 64 * 1024); // 640 MB se lido até o fim
    vi.stubGlobal('fetch', vi.fn(async () => resp));
    await expect(servico().baixarBruto('https://www.planalto.gov.br/a.htm', { maxBytes: 1024 * 1024 })).rejects.toThrow(/grande demais/);
    expect(estado.puxados).toBeLessThanOrEqual(18);
    expect(estado.cancelado).toBe(true);
  });

  it('dentro do limite: devolve o corpo inteiro', async () => {
    const { resp } = corpoEmFluxo(3, 1000);
    vi.stubGlobal('fetch', vi.fn(async () => resp));
    const r = await servico().baixarBruto('https://www.planalto.gov.br/a.htm', { maxBytes: 3000 });
    expect(r.corpo).toHaveLength(3000);
    expect(r.tipo).toBe('text/html');
  });

  it('lerCorpoComLimite: exatamente no limite passa; um byte além é erro; sem corpo é vazio', async () => {
    const erro = () => new BadRequestException('grande');
    expect(await lerCorpoComLimite(new Response(new Uint8Array(10)), 10, erro)).toHaveLength(10);
    await expect(lerCorpoComLimite(new Response(new Uint8Array(11)), 10, erro)).rejects.toThrow('grande');
    expect(await lerCorpoComLimite(new Response(null, { status: 204 }), 10, erro)).toHaveLength(0);
  });
});
