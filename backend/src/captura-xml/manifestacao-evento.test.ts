import { DOMParser } from '@xmldom/xmldom';
import { generateKeyPairSync, X509Certificate } from 'crypto';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { describe, expect, it } from 'vitest';
import { ErroDeComunicacao } from './distribuicao-dfe.cliente';
import { dhEvento, idEvento, MAX_EVENTOS_POR_LOTE, montarEnvEvento } from './manifestacao-evento';

const NS_NFE = 'http://www.portalfiscal.inf.br/nfe';
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

/** Chave de 44 posições no formato real (UF, AAMM, CNPJ, modelo, série, número, tpEmis, código, DV). */
const chaveDe = (n: number) => `3526104589901700016055001${String(n).padStart(9, '0')}112345678${n % 10}`;

const cliente = gerarCert('EMPRESA TESTE LTDA:12345678000195');
const outro = gerarCert('OUTRA EMPRESA LTDA:98765432000110');
const AGORA = new Date('2026-11-10T13:15:30.987Z');
const base = { ambiente: 'HOMOLOGACAO' as const, documentoDestinatario: '12345678000195', chaves: [chaveDe(123), chaveDe(124)], idLote: '123456789012345', agora: AGORA };

/** Verifica com o xml-crypto (implementação independente da canonização feita pelo código) cada Signature do documento. */
function verificarAssinaturas(xml: string, certPem: string): boolean[] {
  const assinaturas = new DOMParser().parseFromString(xml, 'text/xml').getElementsByTagNameNS(NS_DSIG, 'Signature');
  const resultados: boolean[] = [];
  for (let i = 0; i < assinaturas.length; i += 1) {
    try {
      const sig = new SignedXml({ publicCert: certPem });
      sig.loadSignature(assinaturas[i] as unknown as Node);
      resultados.push(sig.checkSignature(xml));
    } catch {
      resultados.push(false);
    }
  }
  return resultados;
}

describe('Id e data do evento', () => {
  it('Id = ID + 210210 + chave + 01, com 54 caracteres', () => {
    const id = idEvento(chaveDe(123));
    expect(id).toBe('ID210210' + '35261045899017000160550010000001231123456783' + '01');
    expect(id).toHaveLength(54);
  });

  it('dhEvento sai no horário de Brasília, sem frações de segundo', () => {
    expect(dhEvento(AGORA)).toBe('2026-11-10T10:15:30-03:00');
    expect(dhEvento(new Date('2026-11-10T02:30:00Z'))).toBe('2026-11-09T23:30:00-03:00');
    expect(dhEvento(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01T00:00:00-03:00');
    expect(() => dhEvento(new Date('x'))).toThrow(ErroDeComunicacao);
  });
});

describe('montarEnvEvento: estrutura do lote', () => {
  const xml = montarEnvEvento(base, cliente);

  it('não leva declaração XML, prefixo de namespace, espaços ou quebras entre as tags', () => {
    expect(xml.startsWith('<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>123456789012345</idLote><evento ')).toBe(true);
    expect(xml.endsWith('</evento></envEvento>')).toBe(true);
    expect(xml).not.toContain('<?xml');
    expect(xml).not.toMatch(/[\r\n\t]/);
    expect(xml).not.toMatch(/>\s+</);
    expect(xml).not.toMatch(/<\/?[A-Za-z_][\w.-]*:[\w.-]+/);
    expect(xml).not.toContain('xmlns:');
    expect(Buffer.byteLength(xml, 'utf8')).toBe(xml.length);
  });

  it('é XML bem formado com um evento por chave e a Signature depois do infEvento, como filha de evento', () => {
    const doc = new DOMParser({ onError: (_nivel, msg) => { throw new Error(msg); } }).parseFromString(xml, 'text/xml');
    const eventos = doc.getElementsByTagNameNS(NS_NFE, 'evento');
    expect(eventos).toHaveLength(2);
    for (let i = 0; i < eventos.length; i += 1) {
      const filhos: string[] = [];
      for (let n = eventos[i].firstChild; n; n = n.nextSibling) {
        const el = n as unknown as Element;
        if (el.nodeType === 1) filhos.push(`${el.namespaceURI}|${el.localName}`);
      }
      expect(filhos).toEqual([`${NS_NFE}|infEvento`, `${NS_DSIG}|Signature`]);
    }
  });

  it('infEvento na ordem do leiaute, com Id de 54 caracteres', () => {
    for (const chave of base.chaves) {
      const id = idEvento(chave);
      expect(id).toHaveLength(54);
      expect(xml).toContain(
        `<infEvento Id="${id}"><cOrgao>91</cOrgao><tpAmb>2</tpAmb><CNPJ>12345678000195</CNPJ><chNFe>${chave}</chNFe>` +
          '<dhEvento>2026-11-10T10:15:30-03:00</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>' +
          '<detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento></infEvento><Signature xmlns="http://www.w3.org/2000/09/xmldsig#">',
      );
    }
  });

  it('Signature: C14N 20010315, rsa-sha1, digest sha1, dois Transforms na ordem e KeyInfo só com o certificado do cliente', () => {
    const certB64 = new X509Certificate(cliente.certPem).raw.toString('base64');
    const id = idEvento(base.chaves[0]);
    const digest = /<Reference URI="#[^"]+"><Transforms>.*?<DigestValue>([^<]+)<\/DigestValue>/.exec(xml)![1];
    const valor = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(xml)![1];
    expect(digest).toMatch(/^[A-Za-z0-9+/]{27}=$/);
    expect(valor).toMatch(/^[A-Za-z0-9+/]{342}==$/);
    expect(xml).toContain(
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo>' +
        '<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>' +
        '<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>' +
        `<Reference URI="#${id}"><Transforms>` +
        '<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>' +
        '<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms>' +
        `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>${digest}</DigestValue></Reference></SignedInfo>` +
        `<SignatureValue>${valor}</SignatureValue><KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo></Signature></evento>`,
    );
  });

  it('CPF vai na tag CPF, CNPJ alfanumérico é aceito e produção usa tpAmb 1', () => {
    const cpf = montarEnvEvento({ ...base, documentoDestinatario: '12345678909', ambiente: 'PRODUCAO' }, cliente);
    expect(cpf).toContain('<tpAmb>1</tpAmb><CPF>12345678909</CPF><chNFe>');
    expect(cpf).not.toContain('<CNPJ>');
    expect(montarEnvEvento({ ...base, documentoDestinatario: '12ABC34501DE35' }, cliente)).toContain('<CNPJ>12ABC34501DE35</CNPJ>');
  });

  it('aceita de 1 a 5 eventos por lote', () => {
    expect(MAX_EVENTOS_POR_LOTE).toBe(5);
    const um = montarEnvEvento({ ...base, chaves: [chaveDe(1)] }, cliente);
    expect(um.match(/<evento /g)).toHaveLength(1);
    const cinco = montarEnvEvento({ ...base, chaves: [1, 2, 3, 4, 5].map(chaveDe) }, cliente);
    expect(cinco.match(/<evento /g)).toHaveLength(5);
    expect(verificarAssinaturas(cinco, cliente.certPem)).toEqual([true, true, true, true, true]);
  });
});

describe('montarEnvEvento: a assinatura confere (xml-crypto)', () => {
  const xml = montarEnvEvento({ ...base, chaves: [chaveDe(1), chaveDe(2), chaveDe(3)] }, cliente);

  it('cada Signature do lote verifica com o certificado público do cliente', () => {
    expect(verificarAssinaturas(xml, cliente.certPem)).toEqual([true, true, true]);
  });

  it('mantém a verificação para CPF, produção e outra data', () => {
    const cpf = montarEnvEvento({ ...base, documentoDestinatario: '12345678909', ambiente: 'PRODUCAO', agora: new Date('2026-12-31T23:59:59Z') }, cliente);
    expect(verificarAssinaturas(cpf, cliente.certPem)).toEqual([true, true]);
  });

  it('alterar um byte do infEvento invalida só a assinatura daquele evento', () => {
    const adulterado = xml.replace('<tpAmb>2</tpAmb>', '<tpAmb>1</tpAmb>');
    expect(adulterado).not.toBe(xml);
    expect(verificarAssinaturas(adulterado, cliente.certPem)).toEqual([false, true, true]);
    const outraChave = xml.replace(chaveDe(2).slice(0, 43) + '2', chaveDe(2).slice(0, 43) + '9');
    expect(verificarAssinaturas(outraChave, cliente.certPem)).not.toEqual([true, true, true]);
  });

  it('alterar o SignedInfo ou o valor da assinatura invalida a verificação', () => {
    const digest = /<DigestValue>([^<]+)<\/DigestValue>/.exec(xml)![1];
    const trocaDigest = xml.replace(digest, (digest[0] === 'A' ? 'B' : 'A') + digest.slice(1));
    expect(verificarAssinaturas(trocaDigest, cliente.certPem)[0]).toBe(false);
    const valor = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(xml)![1];
    const trocaValor = xml.replace(valor, (valor[0] === 'A' ? 'B' : 'A') + valor.slice(1));
    expect(verificarAssinaturas(trocaValor, cliente.certPem)[0]).toBe(false);
  });

  it('com o certificado de outra empresa a verificação falha', () => {
    expect(verificarAssinaturas(xml, outro.certPem)).toEqual([false, false, false]);
  });
});

describe('montarEnvEvento: entradas inválidas', () => {
  const recusa = (alteracao: Record<string, unknown>, material = cliente) =>
    expect(() => montarEnvEvento({ ...base, ...alteracao } as typeof base, material)).toThrow(ErroDeComunicacao);

  it('chave de acesso fora do padrão de 44 posições', () => {
    recusa({ chaves: [chaveDe(1).slice(0, 43)] });
    recusa({ chaves: [`${chaveDe(1)}0`] });
    recusa({ chaves: [chaveDe(1).replace('3526', '35<6')] });
    recusa({ chaves: [`${chaveDe(1).slice(0, 43)}"`] });
    recusa({ chaves: [chaveDe(1).toLowerCase().replace('3526104589901700016055001', 'a'.repeat(25))] });
    recusa({ chaves: [`${chaveDe(1)}\n`] });
    recusa({ chaves: [''] });
    recusa({ chaves: [undefined] });
    expect(() => montarEnvEvento({ ...base, chaves: ['<x/>'.padEnd(44, '0')] }, cliente)).toThrow(/Chave de acesso inválida/);
  });

  it('documento do destinatário que não é CNPJ nem CPF', () => {
    for (const doc of ['', '123', '1234567800019', '123456780001955', '12345678000195<', '12345678000195 ', '12345678a00195', '12ABC34501DE3A', 'ab345678000195', '1234567890a']) {
      recusa({ documentoDestinatario: doc });
    }
    recusa({ documentoDestinatario: 12345678000195 });
    recusa({ documentoDestinatario: '</CNPJ><x/><CNPJ>' });
  });

  it('ambiente, lote e quantidade de eventos fora do padrão', () => {
    recusa({ ambiente: 'TESTE' });
    recusa({ idLote: '' });
    recusa({ idLote: '1234567890123456' });
    recusa({ idLote: '12a' });
    recusa({ idLote: '1</idLote>' });
    recusa({ chaves: [] });
    recusa({ chaves: [1, 2, 3, 4, 5, 6].map(chaveDe) });
    recusa({ chaves: [chaveDe(1), chaveDe(1)] });
    recusa({ agora: new Date('inválida') });
  });

  it('certificado ilegível, sem correspondência com a chave ou chave que não é RSA', () => {
    recusa({}, { keyPem: '-----BEGIN RSA PRIVATE KEY-----\nQUJD\n-----END RSA PRIVATE KEY-----', certPem: cliente.certPem });
    recusa({}, { keyPem: cliente.keyPem, certPem: 'não é um certificado' });
    recusa({}, { keyPem: outro.keyPem, certPem: cliente.certPem });
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    recusa({}, { keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, certPem: cliente.certPem });
  });

  it('a mensagem de erro nunca traz a chave privada', () => {
    const material = { keyPem: '-----BEGIN RSA PRIVATE KEY-----\nQUJDU0VHUkVETw==\n-----END RSA PRIVATE KEY-----', certPem: cliente.certPem };
    try {
      montarEnvEvento(base, material);
      throw new Error('deveria recusar');
    } catch (e) {
      expect((e as Error).message).not.toMatch(/PRIVATE|QUJDU0VHUkVETw/);
    }
  });
});
