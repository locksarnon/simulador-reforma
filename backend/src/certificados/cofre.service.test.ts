import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import { CofreService } from './cofre.service';

const config = (env: Record<string, string | undefined>) => ({ get: (k: string) => env[k] }) as never;
const chave = () => randomBytes(32).toString('base64');

describe('CofreService', () => {
  it('cifra e decifra, e o texto cifrado não contém o original', () => {
    const cofre = new CofreService(config({ CERT_VAULT_KEY: chave() }));
    const seg = cofre.cifrar('-----BEGIN RSA PRIVATE KEY----- segredo', 'cert-1', 'empresa:E1|certificado:cert-1');
    expect(seg.cifrado.toString('utf8')).not.toContain('segredo');
    expect(seg.iv).toHaveLength(12);
    expect(cofre.decifrar(seg, 'cert-1', 'empresa:E1|certificado:cert-1').toString('utf8')).toBe('-----BEGIN RSA PRIVATE KEY----- segredo');
  });

  it('gera IV novo a cada cifra', () => {
    const cofre = new CofreService(config({ CERT_VAULT_KEY: chave() }));
    const a = cofre.cifrar('x', 'c', 'ctx');
    const b = cofre.cifrar('x', 'c', 'ctx');
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.cifrado.equals(b.cifrado)).toBe(false);
  });

  it('não decifra com outro registro, outro contexto ou dados alterados', () => {
    const cofre = new CofreService(config({ CERT_VAULT_KEY: chave() }));
    const seg = cofre.cifrar('segredo', 'cert-1', 'empresa:E1|certificado:cert-1');
    expect(() => cofre.decifrar(seg, 'cert-2', 'empresa:E1|certificado:cert-1')).toThrow(/Não foi possível abrir/);
    expect(() => cofre.decifrar(seg, 'cert-1', 'empresa:E2|certificado:cert-1')).toThrow(/Não foi possível abrir/);
    const adulterado = { ...seg, cifrado: Buffer.from(seg.cifrado) };
    adulterado.cifrado[0] ^= 1;
    expect(() => cofre.decifrar(adulterado, 'cert-1', 'empresa:E1|certificado:cert-1')).toThrow(/Não foi possível abrir/);
    expect(() => cofre.decifrar({ ...seg, tag: randomBytes(16) }, 'cert-1', 'empresa:E1|certificado:cert-1')).toThrow(/Não foi possível abrir/);
  });

  it('não decifra com outra chave-mestra', () => {
    const a = new CofreService(config({ CERT_VAULT_KEY: chave() }));
    const b = new CofreService(config({ CERT_VAULT_KEY: chave() }));
    const seg = a.cifrar('segredo', 'c', 'ctx');
    expect(() => b.decifrar(seg, 'c', 'ctx')).toThrow(/Não foi possível abrir/);
  });

  it('rotação: a primeira chave cifra e as antigas continuam decifrando', () => {
    const antiga = chave();
    const nova = chave();
    const antes = new CofreService(config({ CERT_VAULT_KEYS: `k1:${antiga}` }));
    const segAntigo = antes.cifrar('antigo', 'c', 'ctx');
    const depois = new CofreService(config({ CERT_VAULT_KEYS: `k2:${nova},k1:${antiga}` }));
    expect(depois.decifrar(segAntigo, 'c', 'ctx').toString()).toBe('antigo');
    const segNovo = depois.cifrar('novo', 'c', 'ctx');
    expect(segNovo.chaveId).toBe('k2');
    expect(depois.decifrar(segNovo, 'c', 'ctx').toString()).toBe('novo');
  });

  it('sem chave configurada: indisponível e recusa cifrar', () => {
    const cofre = new CofreService(config({}));
    expect(cofre.disponivel()).toBe(false);
    expect(() => cofre.cifrar('x', 'c', 'ctx')).toThrow(/não está configurado/);
  });

  it('chave com tamanho errado é recusada', () => {
    const cofre = new CofreService(config({ CERT_VAULT_KEY: randomBytes(16).toString('base64') }));
    expect(cofre.disponivel()).toBe(false);
    expect(() => cofre.cifrar('x', 'c', 'ctx')).toThrow(/inválida/);
  });

  it('etiqueta de autenticação truncada ou estendida é recusada (nunca um prefixo da etiqueta)', () => {
    const cofre = new CofreService(config({ CERT_VAULT_KEY: chave() }));
    const seg = cofre.cifrar('segredo', 'cert-1', 'ctx');
    expect(seg.tag).toHaveLength(16);
    expect(() => cofre.decifrar({ ...seg, tag: seg.tag.subarray(0, 4) }, 'cert-1', 'ctx')).toThrow(/Não foi possível abrir/);
    expect(() => cofre.decifrar({ ...seg, tag: Buffer.concat([seg.tag, Buffer.from([0])]) }, 'cert-1', 'ctx')).toThrow(/Não foi possível abrir/);
    expect(cofre.decifrar(seg, 'cert-1', 'ctx').toString('utf8')).toBe('segredo');
  });

  it('a chave única grava o id v1: trocar para CERT_VAULT_KEYS com a antiga como v1 mantém os certificados abrindo; com outro id, não', () => {
    const antiga = chave();
    const unica = new CofreService(config({ CERT_VAULT_KEY: antiga }));
    const seg = unica.cifrar('segredo', 'c', 'ctx');
    expect(seg.chaveId).toBe('v1');
    const nova = chave();
    const certa = new CofreService(config({ CERT_VAULT_KEYS: `v2:${nova},v1:${antiga}` }));
    expect(certa.decifrar(seg, 'c', 'ctx').toString('utf8')).toBe('segredo');
    expect(certa.cifrar('novo', 'd', 'ctx').chaveId).toBe('v2');
    const errada = new CofreService(config({ CERT_VAULT_KEYS: `nova:${nova},antiga:${antiga}` }));
    expect(() => errada.decifrar(seg, 'c', 'ctx')).toThrow(/não está mais no servidor/);
  });
});
