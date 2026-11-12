import { generateKeyPairSync } from 'crypto';
import { readFileSync } from 'fs';
import * as forge from 'node-forge';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { SignedXml } from 'xml-crypto';
import { assinarDeclaracaoDctfweb } from './dctfweb-assinatura';

function certificado() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
  const priv = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.rsa.setPublicKey(priv.n, priv.e);
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  cert.setSubject([{ name: 'commonName', value: 'EMPRESA TESTE:00000000000000' }]);
  cert.setIssuer([{ name: 'commonName', value: 'AC TESTE' }]);
  cert.sign(priv, forge.md.sha256.create());
  return { keyPem, certPem: forge.pki.certificateToPem(cert) };
}

// XML oficial de exemplo do Serpro (CONSXMLDECLARACAO38 no ambiente de demonstração).
const FIX = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'demonstracao.json'), 'utf8'));
const XML = Buffer.from(JSON.parse(FIX.CONSXMLDECLARACAO38.dados).XMLStringBase64, 'base64').toString('utf8');

describe('assinatura da DCTFWeb para transmissão', () => {
  const { keyPem, certPem } = certificado();
  const assinado = assinarDeclaracaoDctfweb(XML, keyPem, certPem);

  it('não muda nenhum caractere fora do elemento Signature', () => {
    expect(assinado.replace(/<Signature[\s\S]*<\/Signature>/, '')).toBe(XML);
  });

  it('assina o ConteudoDeclaracao (URI #id), C14N, RSA-SHA256 e SHA-256, só com o certificado final, e a assinatura confere', () => {
    expect(assinado).toMatch(/<Reference URI="#id_\d+">/);
    expect(assinado).toContain('Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"');
    expect(assinado).toContain('Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"');
    expect(assinado).toContain('Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"');
    expect(assinado).toContain('http://www.w3.org/2000/09/xmldsig#enveloped-signature');
    expect((assinado.match(/<X509Certificate>/g) || []).length).toBe(1);
    const sig = assinado.match(/<Signature[\s\S]*<\/Signature>/)![0];
    const v = new SignedXml({ publicCert: certPem });
    v.loadSignature(sig);
    expect(v.checkSignature(assinado)).toBe(true);
  });

  it('recusa XML sem ConteudoDeclaracao', () => {
    expect(() => assinarDeclaracaoDctfweb('<ProcDctf/>', keyPem, certPem)).toThrow(/ConteudoDeclaracao/);
  });
});
