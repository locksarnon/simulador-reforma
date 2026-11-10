import { generateKeyPairSync } from 'crypto';
import * as forge from 'node-forge';
import { beforeAll, describe, expect, it } from 'vitest';
import { CertificadoInvalidoError, documentoCompativel, lerOtherNames, lerPfx } from './certificado-pfx';

let privada: forge.pki.rsa.PrivateKey;

beforeAll(() => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privada = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }) as string) as forge.pki.rsa.PrivateKey;
});

function gerarPfx(opts: { cn: string; senha: string; algoritmo?: '3des' | 'aes256'; dias?: number }): Buffer {
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.rsa.setPublicKey(privada.n, privada.e);
  cert.serialNumber = '0a1b2c';
  const agora = Date.now();
  cert.validity.notBefore = new Date(agora - 86_400_000);
  cert.validity.notAfter = new Date(agora + (opts.dias ?? 365) * 86_400_000);
  const attrs = [{ name: 'commonName', value: opts.cn }, { name: 'countryName', value: 'BR' }];
  cert.setSubject(attrs);
  cert.setIssuer([{ name: 'commonName', value: 'AC DE TESTE' }]);
  cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 2, value: 'teste.exemplo.com.br' }] }]);
  cert.sign(privada, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(privada, [cert], opts.senha, { algorithm: opts.algoritmo ?? '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

describe('lerPfx', () => {
  it('lê titular, documento, validade e devolve o material em PEM (3DES)', () => {
    const lido = lerPfx(gerarPfx({ cn: 'EMPRESA TESTE LTDA:12345678000195', senha: 'senha-teste' }), 'senha-teste');
    expect(lido.titular).toBe('EMPRESA TESTE LTDA:12345678000195');
    expect(lido.documento).toBe('12345678000195');
    expect(lido.tipoDocumento).toBe('CNPJ');
    expect(lido.emissor).toBe('AC DE TESTE');
    expect(lido.serieHex).toBe('0a1b2c');
    expect(lido.validoAte.getTime()).toBeGreaterThan(Date.now());
    expect(lido.impressaoSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(lido.keyPem).toContain('BEGIN RSA PRIVATE KEY');
    expect(lido.certPem).toContain('BEGIN CERTIFICATE');
  });

  it('lê certificado AES-256 e e-CPF pelo nome comum', () => {
    const lido = lerPfx(gerarPfx({ cn: 'JOAO DA SILVA:12345678909', senha: 'x', algoritmo: 'aes256' }), 'x');
    expect(lido.tipoDocumento).toBe('CPF');
    expect(lido.documento).toBe('12345678909');
  });

  it('aceita CNPJ alfanumérico no nome comum', () => {
    const lido = lerPfx(gerarPfx({ cn: 'EMPRESA NOVA SA:12ABC34501DE35', senha: 'x' }), 'x');
    expect(lido.documento).toBe('12ABC34501DE35');
    expect(lido.tipoDocumento).toBe('CNPJ');
  });

  it('senha errada e arquivo qualquer dão mensagens claras', () => {
    const pfx = gerarPfx({ cn: 'EMPRESA:12345678000195', senha: 'certa' });
    expect(() => lerPfx(pfx, 'errada')).toThrow(/Senha do certificado incorreta/);
    expect(() => lerPfx(Buffer.from('isto não é um certificado'), 'x')).toThrow(CertificadoInvalidoError);
  });

  it('recusa certificado sem CNPJ nem CPF identificável', () => {
    expect(() => lerPfx(gerarPfx({ cn: 'SEM DOCUMENTO', senha: 'x' }), 'x')).toThrow(/CNPJ ou o CPF/);
  });
});

describe('lerOtherNames', () => {
  it('lê o CNPJ do OID 2.16.76.1.3.3 em um otherName no formato real da ICP-Brasil', () => {
    const { asn1 } = forge;
    const outroNome = (oid: string, valor: string) =>
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes()),
        asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [asn1.create(asn1.Class.UNIVERSAL, asn1.Type.PRINTABLESTRING, false, valor)]),
      ]);
    const san = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      outroNome('2.16.76.1.3.3', '12345678000195'),
      outroNome('2.16.76.1.3.2', 'RESPONSAVEL TESTE'),
    ]);
    const lido = lerOtherNames(asn1.toDer(san).getBytes());
    expect(lido.get('2.16.76.1.3.3')).toBe('12345678000195');
    expect(lido.get('2.16.76.1.3.2')).toBe('RESPONSAVEL TESTE');
  });

  it('extensão inválida não quebra', () => {
    expect(lerOtherNames('lixo').size).toBe(0);
  });
});

describe('documentoCompativel', () => {
  it('e-CNPJ vale para a raiz (matriz e filial)', () => {
    expect(documentoCompativel('12345678000195', '12.345.678/0001-95')).toBe(true);
    expect(documentoCompativel('12345678000195', '12.345.678/0002-76')).toBe(true);
    expect(documentoCompativel('12345678000195', '99.999.999/0001-91')).toBe(false);
  });
  it('e-CPF só vale para o próprio CPF', () => {
    expect(documentoCompativel('12345678909', '123.456.789-09')).toBe(true);
    expect(documentoCompativel('12345678909', '123.456.789-10')).toBe(false);
  });
  it('CPF não vale para CNPJ e vice-versa', () => {
    expect(documentoCompativel('12345678909', '12.345.678/0001-95')).toBe(false);
    expect(documentoCompativel('12345678000195', '123.456.789-09')).toBe(false);
  });
});
