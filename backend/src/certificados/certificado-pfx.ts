import { createHash } from 'crypto';
import * as forge from 'node-forge';

export class CertificadoInvalidoError extends Error {}

export type CertificadoLido = {
  titular: string;
  emissor: string | null;
  serieHex: string | null;
  /** CNPJ (14 posições, já com letras quando alfanumérico) ou CPF (11 dígitos) do titular, sem pontuação. */
  documento: string;
  tipoDocumento: 'CNPJ' | 'CPF';
  validoDe: Date;
  validoAte: Date;
  impressaoSha256: string;
  /** Material sensível: só pode ir para o cofre. */
  keyPem: string;
  certPem: string;
  cadeiaPem: string[];
};

const OID_CNPJ = '2.16.76.1.3.3';
const OID_CPF_PF = '2.16.76.1.3.1';
const OID_SAN = '2.5.29.17';

export const limparDocumento = (v: unknown) => String(v ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

/**
 * O e-CNPJ vale para toda a raiz do CNPJ (matriz e filiais): compara os 8 primeiros caracteres.
 * O e-CPF vale só para o próprio CPF.
 */
export function documentoCompativel(doc: string, docEmpresa: string): boolean {
  const a = limparDocumento(doc);
  const b = limparDocumento(docEmpresa);
  if (a.length === 14 && b.length === 14) return a.slice(0, 8) === b.slice(0, 8);
  if (a.length === 11 && b.length === 11) return a === b;
  return false;
}

/** Lê os campos "otherName" da extensão subjectAltName (OIDs da ICP-Brasil 2.16.76.1.3.x). */
export function lerOtherNames(extensaoDer: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const seq = forge.asn1.fromDer(extensaoDer);
    for (const nome of seq.value as forge.asn1.Asn1[]) {
      if (nome.tagClass !== forge.asn1.Class.CONTEXT_SPECIFIC || nome.type !== 0 || !Array.isArray(nome.value)) continue;
      const [oidNo, envoltorio] = nome.value as forge.asn1.Asn1[];
      if (!oidNo || typeof oidNo.value !== 'string') continue;
      const oid = forge.asn1.derToOid(oidNo.value);
      const interno = Array.isArray(envoltorio?.value) ? (envoltorio.value as forge.asn1.Asn1[])[0] : undefined;
      if (typeof interno?.value === 'string') out.set(oid, interno.value);
    }
  } catch {
    // extensão fora do padrão: o documento será procurado no nome comum (CN)
  }
  return out;
}

function documentoDoCertificado(cert: forge.pki.Certificate, titular: string): { documento: string; tipoDocumento: 'CNPJ' | 'CPF' } | null {
  const ext = cert.extensions.find((e: { id?: string }) => e.id === OID_SAN) as { value?: string } | undefined;
  const outros = ext?.value ? lerOtherNames(ext.value) : new Map<string, string>();

  const cnpj = limparDocumento(outros.get(OID_CNPJ));
  if (cnpj.length === 14) return { documento: cnpj, tipoDocumento: 'CNPJ' };
  const pf = String(outros.get(OID_CPF_PF) ?? '');
  if (/^\d{19,}/.test(pf)) return { documento: pf.slice(8, 19), tipoDocumento: 'CPF' };

  const porNome = /:\s*([0-9A-Za-z]{14}|\d{11})\s*$/.exec(titular);
  if (porNome) {
    const d = limparDocumento(porNome[1]);
    return { documento: d, tipoDocumento: d.length === 14 ? 'CNPJ' : 'CPF' };
  }
  return null;
}

/**
 * Abre um certificado A1 (.pfx/.p12) com a senha, valida o que dá para validar sem rede e devolve metadados e o material em PEM.
 * Usa node-forge porque o OpenSSL 3 do Node recusa os algoritmos antigos (RC2-40) de muitos certificados emitidos no Brasil.
 */
export function lerPfx(pfx: Buffer, senha: string): CertificadoLido {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch (e) {
    if (/MAC|password/i.test(String((e as Error)?.message))) throw new CertificadoInvalidoError('Senha do certificado incorreta.');
    throw new CertificadoInvalidoError('O arquivo não é um certificado digital A1 válido (.pfx ou .p12).');
  }

  const oids = forge.pki.oids;
  const chaves = [
    ...(p12.getBags({ bagType: oids.pkcs8ShroudedKeyBag })[oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: oids.keyBag })[oids.keyBag] ?? []),
  ];
  const chave = chaves.find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!chave || !chave.n) throw new CertificadoInvalidoError('O arquivo não traz uma chave privada RSA.');
  if (chave.n.bitLength() < 2048) throw new CertificadoInvalidoError('A chave do certificado tem menos de 2048 bits.');

  const certs = (p12.getBags({ bagType: oids.certBag })[oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);
  const folha = certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n.compareTo(chave.n) === 0);
  if (!folha) throw new CertificadoInvalidoError('O arquivo não traz o certificado correspondente à chave privada.');

  const titular = String(folha.subject.getField('CN')?.value ?? '').trim();
  const doc = documentoDoCertificado(folha, titular);
  if (!doc) throw new CertificadoInvalidoError('Não foi possível identificar o CNPJ ou o CPF do titular no certificado.');

  const der = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(folha)).getBytes(), 'binary');
  return {
    titular: titular || doc.documento,
    emissor: String(folha.issuer.getField('CN')?.value ?? '').trim() || null,
    serieHex: folha.serialNumber || null,
    ...doc,
    validoDe: folha.validity.notBefore,
    validoAte: folha.validity.notAfter,
    impressaoSha256: createHash('sha256').update(der).digest('hex'),
    keyPem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(folha),
    cadeiaPem: certs.filter((c) => c !== folha).map((c) => forge.pki.certificateToPem(c)),
  };
}
