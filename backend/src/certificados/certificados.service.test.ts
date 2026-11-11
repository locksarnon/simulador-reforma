import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'crypto';
import * as forge from 'node-forge';
import { beforeAll, describe, expect, it } from 'vitest';
import { CertificadosService } from './certificados.service';
import { CofreService } from './cofre.service';

let privada: forge.pki.rsa.PrivateKey;
beforeAll(() => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privada = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }) as string) as forge.pki.rsa.PrivateKey;
});

function pfx(cn: string, senha: string, diasAte = 365): Buffer {
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.rsa.setPublicKey(privada.n, privada.e);
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + diasAte * 86_400_000);
  cert.setSubject([{ name: 'commonName', value: cn }]);
  cert.setIssuer([{ name: 'commonName', value: 'AC DE TESTE' }]);
  cert.sign(privada, forge.md.sha256.create());
  return Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(privada, [cert], senha, { algorithm: '3des' })).getBytes(), 'binary');
}

/** Prisma de mentira só com o que o serviço usa, em memória. */
function montar(empresa: { cnpj_cpf: string | null } = { cnpj_cpf: '12.345.678/0001-95' }) {
  const emp = { ...empresa };
  const certs: Record<string, unknown>[] = [];
  const auditoria: Record<string, unknown>[] = [];
  const casa = (l: Record<string, unknown>, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => l[k] === v);
  const prisma = {
    empresa: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, razao_social: 'EMPRESA TESTE', ...emp }) },
    certificadoDigital: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => [...certs].reverse().find((c) => casa(c, where)) ?? null,
      updateMany: ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => { certs.filter((c) => casa(c, where)).forEach((c) => Object.assign(c, data)); return { op: 'u' }; },
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { Object.assign(certs.find((c) => c.id === where.id)!, data); return { op: 'u' }; },
      create: ({ data }: { data: Record<string, unknown> }) => { const r = { status: 'ATIVO', createdAt: new Date(), revogado_em: null, revogado_por: null, ...data }; certs.push(r); return { op: 'c', r }; },
    },
    capturaXmlConfig: { updateMany: () => ({ op: 'x' }) },
    auditoriaCertificado: { create: ({ data }: { data: Record<string, unknown> }) => { auditoria.push(data); return { op: 'a' }; } },
    // as operações acima devolvem descritores: a transação de mentira só as confirma
    $transaction: async (ops: { op: string; r?: Record<string, unknown> }[]) => ops.map((o) => o.r ?? o),
  };
  const cofre = new CofreService({ get: (k: string) => (k === 'CERT_VAULT_KEY' ? randomBytes(32).toString('base64') : undefined) } as never);
  return { service: new CertificadosService(prisma as never, cofre), certs, auditoria, emp };
}

describe('CertificadosService', () => {
  it('guarda cifrado, devolve só metadados e abre o material para uso, sem pedir termo nenhum', async () => {
    const { service, certs, auditoria } = montar();
    const meta = await service.enviar('E1', pfx('EMPRESA TESTE:12345678000195', 'segredo-123'), 'segredo-123', 'admin@fal');
    expect(meta).toMatchObject({ titular: 'EMPRESA TESTE:12345678000195', documento: '12345678000195', documento_formatado: '12.345.678/0001-95', situacao: 'ATIVO' });
    expect(JSON.stringify(meta)).not.toMatch(/PRIVATE KEY|segredo/);

    const guardado = certs[0] as { segredo_cifrado: Buffer };
    expect(Buffer.from(guardado.segredo_cifrado).toString('utf8')).not.toContain('PRIVATE KEY');
    expect(JSON.stringify(certs)).not.toContain('segredo-123');

    // o estado do cofre traz só o certificado: não existe mais termo de autorização
    const visto = await service.obter('E1');
    expect(visto).not.toHaveProperty('consentimento');
    expect(visto.certificado).toMatchObject({ situacao: 'ATIVO' });

    const m = await service.material('E1', 'USO_CAPTURA', 'sistema', 'teste');
    // o PEM devolvido é utilizável: a chave assina e o certificado verifica
    const chave = createPrivateKey(m.keyPem);
    const assinatura = sign('sha256', Buffer.from('mensagem'), chave);
    const certPem = forge.pki.certificateFromPem(m.certPem);
    expect(certPem.subject.getField('CN').value).toBe('EMPRESA TESTE:12345678000195');
    expect(verify('sha256', Buffer.from('mensagem'), createPublicKey(chave), assinatura)).toBe(true);

    expect(auditoria.map((a) => a.acao)).toEqual(['ENVIO', 'USO_CAPTURA']);
    expect(JSON.stringify(auditoria)).not.toMatch(/PRIVATE KEY|segredo-123/);
  });

  it('recusa senha errada, certificado de outro titular e vencido', async () => {
    const { service } = montar();
    await expect(service.enviar('E1', pfx('EMPRESA:12345678000195', 'certa'), 'errada', 'a')).rejects.toThrow(/Senha do certificado incorreta/);
    await expect(service.enviar('E1', pfx('OUTRA:99999999000191', 'x'), 'x', 'a')).rejects.toThrow(/outro titular/);
    await expect(service.enviar('E1', pfx('EMPRESA:12345678000195', 'x', -2), 'x', 'a')).rejects.toThrow(/vencido/);
  });

  it('empresa sem CNPJ cadastrado não recebe certificado', async () => {
    const { service } = montar({ cnpj_cpf: null });
    await expect(service.enviar('E1', pfx('EMPRESA:12345678000195', 'x'), 'x', 'a')).rejects.toThrow(/Cadastre o CNPJ/);
  });

  it('novo envio substitui o anterior e apaga o segredo antigo; remover apaga o segredo', async () => {
    const { service, certs } = montar();
    await service.enviar('E1', pfx('EMPRESA:12345678000195', 'a'), 'a', 'admin@fal');
    await service.enviar('E1', pfx('EMPRESA:12345678000195', 'b'), 'b', 'admin@fal');
    expect(certs).toHaveLength(2);
    expect(certs[0]).toMatchObject({ status: 'REVOGADO', segredo_cifrado: null, segredo_iv: null, segredo_tag: null });
    expect(certs[1]).toMatchObject({ status: 'ATIVO' });
    await service.revogar('E1', 'admin@fal');
    expect(certs[1]).toMatchObject({ status: 'REVOGADO', segredo_cifrado: null });
    await expect(service.material('E1', 'USO_CAPTURA')).rejects.toThrow(/não tem certificado ativo/);
  });

  it('se o CNPJ da empresa mudar depois do envio, o certificado deixa de abrir (nada é consultado com o titular errado)', async () => {
    const { service, auditoria, emp } = montar();
    await service.enviar('E1', pfx('EMPRESA:12345678000195', 'a'), 'a', 'admin@fal');
    await service.material('E1', 'USO_CAPTURA'); // a filial da mesma raiz continua valendo
    emp.cnpj_cpf = '12.345.678/0002-76';
    await service.material('E1', 'USO_CAPTURA');
    const usos = auditoria.filter((a) => a.acao === 'USO_CAPTURA').length;
    emp.cnpj_cpf = '99.999.999/0001-91';
    await expect(service.material('E1', 'USO_CAPTURA')).rejects.toThrow(/não confere com o titular do certificado/);
    emp.cnpj_cpf = null;
    await expect(service.material('E1', 'USO_CAPTURA')).rejects.toThrow(/não confere com o titular do certificado/);
    // recusar não abre o cofre nem grava uso
    expect(auditoria.filter((a) => a.acao === 'USO_CAPTURA').length).toBe(usos);
  });

  it('remover do cofre apaga a chave de todos os certificados ativos da empresa, mesmo que um envio simultâneo tenha deixado mais de um', async () => {
    const { service, certs } = montar();
    await service.enviar('E1', pfx('EMPRESA:12345678000195', 'a'), 'a', 'admin@fal');
    certs.push({ ...(certs[0] as object), id: 'duplicado', status: 'ATIVO', segredo_cifrado: Buffer.from('x') });
    await service.revogar('E1', 'admin@fal');
    expect(certs.every((c) => (c as { status: string }).status === 'REVOGADO' && (c as { segredo_cifrado: unknown }).segredo_cifrado === null)).toBe(true);
  });
});
