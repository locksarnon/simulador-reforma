import { generateKeyPairSync, randomBytes } from 'crypto';
import * as forge from 'node-forge';
import { describe, expect, it, vi } from 'vitest';
import { CofreService } from '../certificados/cofre.service';
import { ContratoIntegraService, credenciaisDoAmbiente } from './contrato.service';
import { ErroIntegra } from './integra.cliente';

function gerarPfx(cn: string, senha: string, dias = 365): Buffer {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const priv = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }) as string) as forge.pki.rsa.PrivateKey;
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.rsa.setPublicKey(priv.n, priv.e);
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 2 * 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + dias * 86_400_000);
  cert.setSubject([{ name: 'commonName', value: cn }]);
  cert.setIssuer([{ name: 'commonName', value: 'AC DE TESTE' }]);
  cert.sign(priv, forge.md.sha256.create());
  return Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(priv, [cert], senha, { algorithm: '3des' })).getBytes(), 'binary');
}

function montar() {
  let linha: Record<string, unknown> | null = null;
  const prisma = {
    contratoIntegraContador: {
      findUnique: async () => linha,
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => (linha = linha ? { ...linha, ...update, updatedAt: new Date() } : { ...create, updatedAt: new Date() }),
      deleteMany: async () => { linha = null; return { count: 1 }; },
    },
  };
  const cofre = new CofreService({ get: (k: string) => (k === 'CERT_VAULT_KEY' ? randomBytes(32).toString('base64') : undefined) } as never);
  return { s: new ContratoIntegraService(prisma as never, cofre), linha: () => linha };
}
const admin = { role: 'admin', email: 'adm@fal' };
const pfx = gerarPfx('FAL AUDITORES TESTE LTDA:53043875000137', 'senha-certa');

describe('contrato do Integra Contador pela tela', () => {
  it('guarda cifrado, mostra só titular/CNPJ/validade e devolve as credenciais para as consultas', async () => {
    const { s, linha } = montar();
    const e = await s.salvar({ pfx, senha: 'senha-certa', consumerKey: 'KEY-1', consumerSecret: 'SECRET-1' }, admin);
    expect(e).toMatchObject({ configurado: true, origem: 'TELA', titular: 'FAL AUDITORES TESTE LTDA', cnpj: '53043875000137', atualizado_por: 'adm@fal' });
    expect(JSON.stringify(e)).not.toMatch(/KEY-1|SECRET-1|senha-certa/);
    const gravado = Buffer.from(linha()!.segredo_cifrado as Buffer).toString('latin1');
    expect(gravado).not.toMatch(/KEY-1|SECRET-1|senha-certa/);
    const c = await s.credenciais();
    expect(c).toMatchObject({ consumerKey: 'KEY-1', consumerSecret: 'SECRET-1', senha: 'senha-certa', contratante: '53043875000137' });
    expect(c!.pfx.equals(pfx)).toBe(true);
  });

  it('troca só as chaves mantendo o certificado já guardado', async () => {
    const { s } = montar();
    await s.salvar({ pfx, senha: 'senha-certa', consumerKey: 'K1', consumerSecret: 'S1' }, admin);
    await s.salvar({ consumerKey: 'K2', consumerSecret: 'S2' }, admin);
    expect(await s.credenciais()).toMatchObject({ consumerKey: 'K2', consumerSecret: 'S2', senha: 'senha-certa' });
  });

  it('recusa senha errada, certificado de pessoa física, quem não é admin e falta de chaves', async () => {
    const { s } = montar();
    await expect(s.salvar({ pfx, senha: 'errada', consumerKey: 'K', consumerSecret: 'S' }, admin)).rejects.toThrow(/senha/i);
    await expect(s.salvar({ pfx: gerarPfx('FULANO:12345678909', 'x'), senha: 'x', consumerKey: 'K', consumerSecret: 'S' }, admin)).rejects.toThrow(/e-CNPJ/);
    await expect(s.salvar({ pfx, senha: 'senha-certa', consumerKey: 'K', consumerSecret: 'S' }, { role: 'user' })).rejects.toThrow(/administradores/);
    await expect(s.salvar({ pfx, senha: 'senha-certa' }, admin)).rejects.toThrow(/Consumer Key/);
  });

  it('testa a conexão pedindo token ao Serpro e traduz a recusa', async () => {
    const { s } = montar();
    expect((await s.testar(admin)).ok).toBe(false);
    await s.salvar({ pfx, senha: 'senha-certa', consumerKey: 'K', consumerSecret: 'S' }, admin);
    const ok = vi.fn(async () => ({ access: 'a', jwt: 'j', expira: Date.now() + 1000 }));
    expect(await s.testar(admin, ok)).toMatchObject({ ok: true });
    expect(ok).toHaveBeenCalledWith(expect.objectContaining({ consumerKey: 'K' }));
    const recusa = async () => { throw new ErroIntegra('O Serpro recusou as chaves.', 'AUTENTICACAO'); };
    expect(await s.testar(admin, recusa)).toEqual({ ok: false, mensagem: 'O Serpro recusou as chaves.' });
  });

  it('remover volta para o .env (ou nada)', async () => {
    const { s } = montar();
    await s.salvar({ pfx, senha: 'senha-certa', consumerKey: 'K', consumerSecret: 'S' }, admin);
    const e = await s.remover(admin);
    expect(e.origem).toBe(credenciaisDoAmbiente() ? 'SERVIDOR' : null);
  });
});
