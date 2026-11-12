import { mkdtempSync, readFileSync, statSync } from 'fs';
import * as forge from 'node-forge';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { ReceitanetbxConfigService } from './receitanetbx-config.service';

function pfx(senha: string) {
  const k = forge.pki.rsa.generateKeyPair(2048);
  const c = forge.pki.createCertificate();
  c.publicKey = k.publicKey;
  c.serialNumber = '03';
  c.validity.notBefore = new Date(Date.now() - 86_400_000);
  c.validity.notAfter = new Date(Date.now() + 30 * 86_400_000);
  const nome = [{ name: 'commonName', value: 'EMPRESA TESTE LTDA:11222333000181' }];
  c.setSubject(nome);
  c.setIssuer(nome);
  c.sign(k.privateKey, forge.md.sha256.create());
  return Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(k.privateKey, [c], senha, { algorithm: '3des' })).getBytes(), 'binary');
}

describe('certificados do ReceitanetBX (primário e secundário)', () => {
  it('confere a senha, entrega certificado e titular e grava a senha por último; só administrador', async () => {
    process.env.RECEITANETBX_ENTREGA_DIR = mkdtempSync(join(tmpdir(), 'bx-'));
    process.env.RECEITANETBX_URL = 'http://127.0.0.1:9/x';
    process.env.RECEITANETBX_URL_SECUNDARIO = 'http://127.0.0.1:9/y';
    const s = new ReceitanetbxConfigService();
    const arq = pfx('certa');
    await expect(s.salvar('primario', arq, 'certa', { role: 'user' })).rejects.toThrow(/administradores/);
    await expect(s.salvar('outro', arq, 'certa', { role: 'admin' })).rejects.toThrow(/primário ou o secundário/);
    await expect(s.salvar('primario', arq, 'errada', { role: 'admin' })).rejects.toThrow();
    const r = await s.salvar('secundario', arq, 'certa', { role: 'admin', email: 'adm@fal' });
    const pasta = join(process.env.RECEITANETBX_ENTREGA_DIR, 'secundario');
    expect(readFileSync(join(pasta, 'senha'), 'utf8')).toBe('certa');
    expect(statSync(join(pasta, 'certificado.pfx')).size).toBe(arq.length);
    const sec = r.find((x) => x.id === 'secundario')!;
    expect(sec).toMatchObject({ configurando: true, disponivel: false, titular: { documento: '11222333000181', enviado_por: 'adm@fal' } });
  });
  it('serviço voltou sem configuração (novo deploy): reentrega do cofre, uma vez a cada 30 minutos', async () => {
    process.env.RECEITANETBX_ENTREGA_DIR = mkdtempSync(join(tmpdir(), 'bx-'));
    const guardado: Record<string, unknown> = {};
    const prisma = { integracaoSegredo: { upsert: async ({ create }: { create: Record<string, unknown> }) => { guardado[create.id as string] = create; }, findUnique: async ({ where }: { where: { id: string } }) => guardado[where.id] ?? null } };
    const cofre = { cifrar: (t: string) => ({ cifrado: Buffer.from(t), iv: Buffer.alloc(12), tag: Buffer.alloc(16), chaveId: 'v1' }), decifrar: (x: { cifrado: Buffer }) => x.cifrado };
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<r><retorno>0</retorno><saida>&lt;retornoconsulta&gt;&lt;mensagem&gt;java.lang.NullPointerException&lt;/mensagem&gt;&lt;/retornoconsulta&gt;</saida></r>')));
    const s = new ReceitanetbxConfigService(prisma as never, cofre as never);
    await s.salvar('primario', pfx('certa'), 'certa', { role: 'admin' });
    const pasta = join(process.env.RECEITANETBX_ENTREGA_DIR, 'primario');
    require('fs').rmSync(join(pasta, 'senha'));
    expect((await s.reentregar()).reentregues).toBe(1);
    expect(readFileSync(join(pasta, 'senha'), 'utf8')).toBe('certa');
    require('fs').rmSync(join(pasta, 'senha'));
    expect((await s.reentregar()).reentregues).toBe(0);
    vi.unstubAllGlobals();
  });
});
