import { PayloadTooLargeException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { LIMITE_ENVIO, LimiteEnvioGuard, nomeDeDownload } from './repositorio-xml.controller';

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
