import { DOMParser } from '@xmldom/xmldom';
import { generateKeyPairSync } from 'crypto';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { describe, expect, it } from 'vitest';
import { dataTermo, escaparAtributo, montarDados, termoAssinado, TEXTO_TERMO, vigenciaPadrao } from './termo-autorizacao';

const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';

function gerarCert(cn: string) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
  const key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.rsa.setPublicKey(key.n, key.e);
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  cert.setSubject([{ name: 'commonName', value: cn }]);
  cert.setIssuer([{ name: 'commonName', value: cn }]);
  cert.sign(key, forge.md.sha256.create());
  return { keyPem, certPem: forge.pki.certificateToPem(cert) };
}

const cliente = gerarCert('EXTRA AGRO LTDA:58509112000152');
const outro = gerarCert('OUTRA LTDA:11222333000181');
const AGORA = new Date('2026-11-11T02:30:00.000Z'); // 23:30 de 10/11 em Brasília
const base = {
  destinatario: { numero: '12.345.678/0001-95', nome: 'FAL AGRO CONSULTORIA LTDA' },
  assinadoPor: { numero: '58.509.112/0001-52', nome: 'EXTRA AGRO "TESTE" & CIA <LTDA>' },
  dataAssinatura: AGORA,
  vigencia: vigenciaPadrao(AGORA),
};

function verificar(xml: string, certPem: string): boolean {
  const assinatura = new DOMParser().parseFromString(xml, 'text/xml').getElementsByTagNameNS(NS_DSIG, 'Signature')[0];
  const sig = new SignedXml({ publicCert: certPem });
  sig.loadSignature(assinatura as unknown as Node);
  try { return sig.checkSignature(xml); } catch { return false; }
}

describe('termo de autorização do Integra Contador', () => {
  it('a assinatura confere numa implementação independente (xml-crypto) e não confere com outro certificado', () => {
    const xml = termoAssinado(base, cliente);
    expect(verificar(xml, cliente.certPem)).toBe(true);
    expect(verificar(xml, outro.certPem)).toBe(false);
  });

  it('qualquer mudança no texto depois de assinado invalida a assinatura', () => {
    const xml = termoAssinado(base, cliente).replace('FAL AGRO CONSULTORIA LTDA', 'OUTRO ESCRITORIO LTDA');
    expect(verificar(xml, cliente.certPem)).toBe(false);
  });

  it('segue o leiaute: declaração UTF-8, sem quebras, datas AAAAMMDD de Brasília, papéis e tipos', () => {
    const xml = termoAssinado(base, cliente);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><termoDeAutorizacao><dados><sistema id="API Integra Contador">')).toBe(true);
    expect(xml).not.toMatch(/[\r\n]/);
    expect(xml).toContain('<dataAssinatura data="20261110">');
    expect(xml).toContain(`<vigencia data="${dataTermo(vigenciaPadrao(AGORA))}">`);
    expect(xml).toContain('numero="12345678000195" papel="contratante" tipo="PJ"');
    expect(xml).toContain('numero="58509112000152" papel="autor pedido de dados" tipo="PJ"');
    expect(xml).toContain(`texto="${TEXTO_TERMO}"`);
    expect(xml).toContain('Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"');
    expect(xml).toContain('<Reference URI="">');
  });

  it('escapa caracteres especiais e tira caracteres invisíveis do nome', () => {
    expect(escaparAtributo('A & B "C" <D>​')).toBe('A &amp; B &quot;C&quot; &lt;D>');
    expect(montarDados(base)).toContain('nome="EXTRA AGRO &quot;TESTE&quot; &amp; CIA &lt;LTDA>"');
  });

  it('pessoa física assina como PF; documento inválido é recusado', () => {
    expect(montarDados({ ...base, assinadoPor: { numero: '123.456.789-01', nome: 'JOAO' } })).toContain('numero="12345678901" papel="autor pedido de dados" tipo="PF"');
    expect(() => montarDados({ ...base, destinatario: { numero: '123', nome: 'X' } })).toThrow(/14 dígitos/);
    expect(() => montarDados({ ...base, assinadoPor: { numero: '123', nome: 'X' } })).toThrow(/CPF \(11\) ou CNPJ \(14\)/);
  });

  it('recusa chave que não corresponde ao certificado', () => {
    expect(() => termoAssinado(base, { keyPem: cliente.keyPem, certPem: outro.certPem })).toThrow(/não corresponde/);
  });
});
