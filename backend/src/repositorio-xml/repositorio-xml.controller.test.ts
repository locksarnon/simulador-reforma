import { PayloadTooLargeException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LIMITE_ENVIO, LimiteEnvioGuard, RepositorioXmlController, nomeDeDownload } from './repositorio-xml.controller';

const contexto = (headers: Record<string, string | undefined>) => ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as never;

describe('LimiteEnvioGuard', () => {
  const guarda = new LimiteEnvioGuard();

  it('deixa passar o envio dentro do teto e o que não declara tamanho (a tela sempre declara)', () => {
    expect(guarda.canActivate(contexto({ 'content-length': String(LIMITE_ENVIO) }))).toBe(true);
    expect(guarda.canActivate(contexto({ 'content-length': '1200' }))).toBe(true);
    expect(guarda.canActivate(contexto({}))).toBe(true);
  });

  it('recusa, antes de ler o corpo, o envio que declara mais que o teto', () => {
    expect(() => guarda.canActivate(contexto({ 'content-length': String(LIMITE_ENVIO + 1) }))).toThrow(PayloadTooLargeException);
    expect(() => guarda.canActivate(contexto({ 'content-length': String(6 * 1024 * 1024 * 1024) }))).toThrow(/Envie em partes/);
  });
});

describe('downloads de PDF', () => {
  const chave = '5'.repeat(44);
  const servico = {
    baixarPdf: vi.fn(async () => ({ buffer: Buffer.from('%PDF-1.3'), nome: `DANFE-${chave}.pdf` })),
    baixarZip: vi.fn(async () => Buffer.from('zip')),
  };
  const controlador = new RepositorioXmlController(servico as never);

  it('o PDF de um documento sai como anexo application/pdf, com o nome do DANFE', async () => {
    const r = await controlador.pdf('E1', 'd1');
    expect(servico.baixarPdf).toHaveBeenCalledWith('E1', 'd1');
    expect(r.getHeaders()).toMatchObject({ type: 'application/pdf', disposition: `attachment; filename="DANFE-${chave}.pdf"` });
  });

  it('o ZIP só leva PDF quando a tela pede (incluir_pdf = "true"); sem o pedido continua sendo o xml.zip de sempre', async () => {
    const sem = await controlador.zip('E1', { tipo: 'NFE' });
    expect(servico.baixarZip).toHaveBeenLastCalledWith('E1', expect.objectContaining({ tipo: 'NFE' }), { incluirPdf: false });
    expect(sem.getHeaders().disposition).toBe('attachment; filename="xml.zip"');

    const com = await controlador.zip('E1', { tipo: 'NFE', incluir_pdf: 'true' });
    expect(servico.baixarZip).toHaveBeenLastCalledWith('E1', expect.objectContaining({ tipo: 'NFE' }), { incluirPdf: true });
    expect(com.getHeaders().disposition).toBe('attachment; filename="xml-e-pdf.zip"');

    await controlador.zip('E1', { incluir_pdf: 'false' });
    expect(servico.baixarZip).toHaveBeenLastCalledWith('E1', expect.any(Object), { incluirPdf: false });
    await controlador.zip('E1', undefined as never);
    expect(servico.baixarZip).toHaveBeenLastCalledWith('E1', expect.any(Object), { incluirPdf: false });
  });
});

describe('nomeDeDownload', () => {
  it('só letras, números, ponto, hífen e sublinhado: aspas, barras e acentos não saem no cabeçalho', () => {
    expect(nomeDeDownload('51261112345678000195550010000001231000000010.xml')).toBe('51261112345678000195550010000001231000000010.xml');
    expect(nomeDeDownload('evento-110111-1-CHAVE.xml')).toBe('evento-110111-1-CHAVE.xml');
    expect(nomeDeDownload('a"b\r\nSet-Cookie: x.xml')).toBe('a_b__Set-Cookie__x.xml');
    expect(nomeDeDownload('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(nomeDeDownload('nota ção.xml')).toBe('nota___o.xml');
    expect(nomeDeDownload('')).toBe('documento.xml');
    expect(nomeDeDownload('x'.repeat(400)).length).toBe(150);
  });
});
