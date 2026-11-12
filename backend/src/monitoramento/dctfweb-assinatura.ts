import { SignedXml } from 'xml-crypto';

/**
 * Assinatura da DCTFWeb para a transmissão (Integra Contador, TRANSDECLARACAO310), pelos "Padrões exigidos para a assinatura
 * digital" da documentação: XMLDSig enveloped do elemento ConteudoDeclaracao (Reference URI="#id..."), C14N
 * (http://www.w3.org/TR/2001/REC-xml-c14n-20010315), RSA-SHA256, digest SHA-256, só o certificado do usuário final, do autor do
 * pedido de dados. A declaração assinada precisa ser idêntica, caractere a caractere, à recebida em CONSXMLDECLARACAO38: por isso a
 * assinatura é calculada à parte e só o elemento Signature é inserido no texto original, antes do fechamento do elemento raiz.
 */
export function assinarDeclaracaoDctfweb(xmlOriginal: string, keyPem: string, certPem: string): string {
  const id = xmlOriginal.match(/<ConteudoDeclaracao\b[^>]*\bid="([^"]+)"/)?.[1];
  if (!id) throw new Error('O XML da DCTFWeb não tem o elemento ConteudoDeclaracao com id.');
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath: `//*[local-name(.)='ConteudoDeclaracao' and @id='${id}']`,
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });
  sig.computeSignature(xmlOriginal, { location: { reference: '/*', action: 'append' } });
  const assinatura = sig.getSignatureXml();
  const fim = xmlOriginal.lastIndexOf('</');
  if (fim < 0) throw new Error('XML da DCTFWeb sem elemento raiz.');
  return xmlOriginal.slice(0, fim) + assinatura + xmlOriginal.slice(fim);
}
