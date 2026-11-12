import { readFileSync } from 'fs';
import * as forge from 'node-forge';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { SignedXml } from 'xml-crypto';
import { MonitoramentoService } from './monitoramento.service';

const FIX = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'demonstracao.json'), 'utf8'));
const XML38 = JSON.parse(FIX.CONSXMLDECLARACAO38.dados).XMLStringBase64 as string;

function pfxDoEscritorio() {
  const chaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = '02';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const nome = [{ name: 'commonName', value: 'ESCRITORIO TESTE:00000000000191' }];
  cert.setSubject(nome);
  cert.setIssuer(nome);
  cert.sign(chaves.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], 'senha', { algorithm: '3des' });
  return { pfx: Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'), certPem: forge.pki.certificateToPem(cert) };
}

describe('transmissão da DCTFWeb em produção', () => {
  it('baixa o XML em andamento, assina com o certificado do escritório e transmite o XML assinado', async () => {
    const { pfx, certPem } = pfxDoEscritorio();
    const cred = { consumerKey: 'K', consumerSecret: 'S', pfx, senha: 'senha', contratante: '00000000000191', nome: 'ESCRITORIO' };
    const prisma = {
      parametroSistema: { findUnique: async () => ({ chave: 'integra_contador_modo', valor: 'PRODUCAO' }) },
      empresa: { findUnique: async () => ({ id: 'E1', razao_social: 'EMPRESA TESTE LTDA', cnpj_cpf: '11.222.333/0001-81', regime_atual: 'Lucro Presumido' }) },
      tokenIntegraContador: { findUnique: async () => null },
      consultaFiscal: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'C1', createdAt: new Date(), ...data }), update: async () => ({}) },
    };
    const certificados = { material: async () => { throw new Error('sem certificado do cliente'); } };
    const s = new MonitoramentoService(prisma as never, {} as never, certificados as never, {} as never, {} as never, { credenciais: async () => cred } as never, {} as never);
    const pedidos: { idServico: string; dados: string; autorPedidoDados: unknown }[] = [];
    (s as unknown as { cliente: unknown }).cliente = {
      chamar: vi.fn(async (p: { idServico: string; dados: string; autorPedidoDados: unknown }) => {
        pedidos.push(p);
        if (p.idServico === 'CONSXMLDECLARACAO38') return { http: 200, status: 200, dados: { XMLStringBase64: XML38 }, mensagens: [], bruto: '' };
        return { http: 200, status: 200, dados: { numeroRecibo: '123' }, mensagens: [{ codigo: 'Sucesso', texto: 'Transmitida' }], bruto: '' };
      }),
    };
    await expect(s.consultar({ empresaId: 'E1' }, 'dctfweb-transmitir', { periodo: '202610' }, { email: 'qa@fal' })).rejects.toThrow(/Confirme/);
    const r = await s.consultar({ empresaId: 'E1' }, 'dctfweb-transmitir', { periodo: '202610', confirmar: 'sim' }, { email: 'qa@fal' });
    expect(r).toMatchObject({ sucesso: true });
    expect(pedidos.map((p) => p.idServico)).toEqual(['CONSXMLDECLARACAO38', 'TRANSDECLARACAO310']);
    expect(pedidos[1].autorPedidoDados).toEqual({ numero: '00000000000191', tipo: 2 });
    const enviado = JSON.parse(pedidos[1].dados);
    expect(enviado).toMatchObject({ categoria: 'GERAL_MENSAL', anoPA: '2026', mesPA: '10' });
    const xml = Buffer.from(enviado.xmlAssinadoBase64, 'base64').toString('utf8');
    const original = Buffer.from(XML38, 'base64').toString('utf8');
    expect(xml.replace(/<Signature[\s\S]*<\/Signature>/, '')).toBe(original);
    const v = new SignedXml({ publicCert: certPem });
    v.loadSignature(xml.match(/<Signature[\s\S]*<\/Signature>/)![0]);
    expect(v.checkSignature(xml)).toBe(true);
  });
});
