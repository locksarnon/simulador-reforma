import { describe, expect, it, vi, afterEach } from 'vitest';
import { InfosimplesService, hostDoLink, linkComprovantePermitido } from './infosimples.service';

describe('comprovante da Infosimples: lista de hosts permitidos', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('só infosimples.com e subdomínios; GCS (caminho ou virtual-hosted) fica fora até o bucket exato ser conhecido', () => {
    expect(linkComprovantePermitido('https://storage.infosimples.com/r/abc.pdf')).toBe(true);
    expect(linkComprovantePermitido('https://storage.googleapis.com/infosimples/x.pdf')).toBe(false);
    expect(linkComprovantePermitido('https://storage.googleapis.com/infosimplesfalso/x.pdf')).toBe(false);
    expect(linkComprovantePermitido('https://infosimples.storage.googleapis.com/x.pdf')).toBe(false);
  });

  it('o aviso do recusado mostra só o host (sem caminho nem assinatura), para descobrir o host real', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const servico = new InfosimplesService({} as any, {} as any);
    const aviso = vi.spyOn((servico as any).log, 'warn').mockImplementation(() => undefined);
    await servico.comprovantesPdf(['https://storage.googleapis.com/bucket-x/a.pdf?X-Goog-Signature=segredo']);
    expect(f).not.toHaveBeenCalled();
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('(storage.googleapis.com)'));
    expect(aviso.mock.calls[0][0]).not.toContain('segredo');
    expect(hostDoLink('lixo')).toBe('(endereço inválido)');
  });
});
