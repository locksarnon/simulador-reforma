import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { fetchOficial } from '../base-legal/fetch-oficial';
import { InfosimplesService, linkComprovantePermitido } from '../infosimples/infosimples.service';
import { BASES_NFE, chaveNfeValida, RecuperacaoXmlHistoricoService } from '../repositorio-xml/recuperacao-xml-historico.service';

// Proteções contra SSRF nas chamadas de saída cujo endereço depende de dado externo.

const resposta = (status: number, extra: { location?: string; tipo?: string; corpo?: string } = {}) =>
  new Response(status >= 300 && status < 400 ? null : (extra.corpo ?? 'ok'), {
    status,
    headers: { ...(extra.location ? { location: extra.location } : {}), ...(extra.tipo ? { 'content-type': extra.tipo } : {}) },
  });

afterEach(() => vi.unstubAllGlobals());

describe('base legal: fetchOficial segue redirecionamento à mão, conferindo cada destino', () => {
  it('site oficial responde direto', async () => {
    const f = vi.fn(async () => resposta(200));
    vi.stubGlobal('fetch', f);
    const r = await fetchOficial('https://www.planalto.gov.br/a.htm');
    expect(r.url).toBe('https://www.planalto.gov.br/a.htm');
    expect(f).toHaveBeenCalledWith('https://www.planalto.gov.br/a.htm', expect.objectContaining({ redirect: 'manual' }));
  });

  it('redirecionamento entre sites oficiais é seguido (Location relativo também)', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(resposta(301, { location: 'https://legislacao.presidencia.gov.br/x' }))
      .mockResolvedValueOnce(resposta(302, { location: '/y' }))
      .mockResolvedValueOnce(resposta(200));
    vi.stubGlobal('fetch', f);
    const r = await fetchOficial('https://www.planalto.gov.br/a.htm');
    expect(r.url).toBe('https://legislacao.presidencia.gov.br/y');
    expect(r.resp.status).toBe(200);
  });

  it.each([
    ['metadados da nuvem', 'http://169.254.169.254/latest/meta-data/'],
    ['rede interna por https', 'https://minio:9000/'],
    ['domínio comercial', 'https://exemplo.com/lei'],
    ['falso gov.br', 'https://gov.br.exemplo.com/'],
  ])('redirecionamento para fora (%s) é recusado sem pedir o destino', async (_r, destino) => {
    const f = vi.fn().mockResolvedValueOnce(resposta(302, { location: destino }));
    vi.stubGlobal('fetch', f);
    await expect(fetchOficial('https://www.planalto.gov.br/a.htm')).rejects.toThrow(/redirecionou para fora/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('endereço inicial fora da lista nem é pedido', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(fetchOficial('http://127.0.0.1/')).rejects.toBeInstanceOf(BadRequestException);
    expect(f).not.toHaveBeenCalled();
  });

  it('mais de 5 redirecionamentos é recusado', async () => {
    const f = vi.fn(async () => resposta(302, { location: 'https://www.planalto.gov.br/de-novo' }));
    vi.stubGlobal('fetch', f);
    await expect(fetchOficial('https://www.planalto.gov.br/a.htm')).rejects.toThrow(/vezes demais/);
    expect(f).toHaveBeenCalledTimes(6);
  });
});

describe('Infosimples: só baixa comprovante de endereço da própria Infosimples', () => {
  it.each([
    ['https://storage.infosimples.com/r/abc.pdf', true],
    ['https://infosimples.com/r/abc.pdf', true],
    // GCS por prefixo era falsificável (qualquer um cria um bucket infosimples-*): fora até o bucket exato ser conhecido.
    ['https://storage.googleapis.com/infosimples-api-tmp/api/x.pdf', false],
    ['https://storage.googleapis.com/infosimples-do-atacante/x.pdf', false],
    ['https://infosimples-api-tmp.storage.googleapis.com/api/x.pdf', false],
    ['http://storage.infosimples.com/r/abc.pdf', false],
    ['https://storage.infosimples.com:8443/r/abc.pdf', false],
    ['https://user:senha@storage.infosimples.com/r', false],
    ['https://infosimples.com.evil.io/r.pdf', false],
    ['https://evilinfosimples.com/r.pdf', false],
    ['https://storage.googleapis.com/outro-bucket/x.pdf', false],
    ['https://169.254.169.254/latest/meta-data/', false],
    ['não é url', false],
  ])('%s → %s', (u, ok) => expect(linkComprovantePermitido(u)).toBe(ok));

  it('pula o endereço de fora com aviso e baixa o da Infosimples sem seguir redirecionamento', async () => {
    const f = vi.fn(async () => resposta(200, { tipo: 'application/pdf', corpo: '%PDF-1.4' }));
    vi.stubGlobal('fetch', f);
    const servico = new InfosimplesService({} as any, {} as any);
    const aviso = vi.spyOn((servico as any).log, 'warn').mockImplementation(() => undefined);
    const pdfs = await servico.comprovantesPdf(['https://10.0.0.5/r.pdf', 'https://storage.infosimples.com/r/abc.pdf']);
    expect(pdfs).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('https://storage.infosimples.com/r/abc.pdf', expect.objectContaining({ redirect: 'manual' }));
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('host fora da lista permitida (10.0.0.5)'));
  });

  it('um redirecionamento (3xx) não é seguido: o comprovante é ignorado', async () => {
    const f = vi.fn(async () => resposta(302, { location: 'http://169.254.169.254/' }));
    vi.stubGlobal('fetch', f);
    const servico = new InfosimplesService({} as any, {} as any);
    expect(await servico.comprovantesPdf(['https://storage.infosimples.com/r/abc.pdf'])).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('Recuperação de XML (Serpro): só chave de 44 dígitos entra no endereço', () => {
  const montar = () => {
    const s = Object.create(RecuperacaoXmlHistoricoService.prototype) as any;
    s.baseNfe = BASES_NFE[0];
    return s;
  };
  const CHAVE = '35260112345678000195550010000000011000000010';

  it.each([
    ['curta', '123'],
    ['com letras', `${CHAVE.slice(0, 43)}a`],
    ['travessia', `../../../${CHAVE.slice(0, 35)}`],
    ['com consulta', `${CHAVE}?x=1`],
    ['45 dígitos', `${CHAVE}0`],
  ])('recusa chave %s sem chamar a rede', async (_r, chave) => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(chaveNfeValida(chave)).toBe(false);
    await expect(montar().consultar(chave, 'tok', {} as any, '')).rejects.toThrow(/44 dígitos/);
    expect(f).not.toHaveBeenCalled();
  });

  it('chave válida vai ao gateway do Serpro', async () => {
    const f = vi.fn(async () => resposta(404));
    vi.stubGlobal('fetch', f);
    expect(await montar().consultar(CHAVE, 'tok', {} as any, '')).toBe('indisponiveis');
    expect(f).toHaveBeenCalledWith(`https://gateway.apiserpro.serpro.gov.br${BASES_NFE[0]}${CHAVE}`, expect.anything());
  });
});
