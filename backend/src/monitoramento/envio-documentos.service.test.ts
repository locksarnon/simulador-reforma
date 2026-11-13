import { describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { EnvioDocumentosService, LIMITE_EMAIL_BYTES } from './envio-documentos.service';

function montar({ configurado = true, enviado = true, tamanho = 10 } = {}) {
  const registros: Record<string, unknown>[] = [];
  const prisma = {
    arquivoEmpresa: { findUnique: async ({ where }: { where: { id: string } }) => ({ A1: { id: 'A1', empresa_id: 'E1', nome: 'EFD 2026-01.txt', tipo_mime: 'text/plain', storage_key: 'k1' }, A2: { id: 'A2', empresa_id: 'OUTRA', nome: 'x', storage_key: 'k2' } } as Record<string, unknown>)[where.id] ?? null },
    consultaFiscal: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'C1' ? { empresa_id: 'E1' } : null) },
    empresa: { findUnique: async () => ({ razao_social: 'EXTRA AGRO LTDA' }) },
    envioEmail: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => { registros.push(...data); return { count: data.length }; },
      findMany: async () => registros.map((r, i) => ({ ...r, createdAt: new Date(2026, 10, 13, 10, i) })).reverse(),
    },
  };
  const storage = { getObjectBuffer: async () => Buffer.alloc(tamanho, 1) };
  const mail = { configurado, enviar: vi.fn(async () => (enviado ? { enviado: true } : { enviado: false, motivo: 'SMTP fora' })) };
  const m = {
    arquivo: async (_id: string, i: number) => ({ nome: `sitfis-${i}.pdf`, buffer: Buffer.from('%PDF') }),
    relatorio: async () => ({ nome: 'Relatório.pdf', tipo: 'application/pdf', buffer: Buffer.from('%PDF-rel') }),
  };
  return { s: new EnvioDocumentosService(prisma as never, storage as never, mail as never, m as never), registros, mail };
}

describe('documentos do cliente: ZIP e e-mail dos marcados', () => {
  it('monta o ZIP com o arquivo guardado, o PDF oficial e o relatório, e registra o download', async () => {
    const { s, registros } = montar();
    const z = await s.zip('E1', [{ tipo: 'arquivo', arquivo_id: 'A1' }, { tipo: 'consulta', consulta_id: 'C1', indice: 0 }, { tipo: 'consulta', consulta_id: 'C1' }], { email: 'qa@fal' });
    expect(z.nome).toBe('EXTRA AGRO LTDA - documentos.zip');
    expect(Object.keys(unzipSync(new Uint8Array(z.buffer))).sort()).toEqual(['EFD 2026-01.txt', 'Relatório.pdf', 'sitfis-0.pdf']);
    expect(registros.map((r) => [r.origem, r.origem_id])).toEqual([['DOCUMENTO_DOWNLOAD', 'A1'], ['DOCUMENTO_DOWNLOAD', 'C1']]);
  });

  it('não entrega documento de outro cliente', async () => {
    const { s } = montar();
    await expect(s.zip('E1', [{ tipo: 'arquivo', arquivo_id: 'A2' }])).rejects.toThrow('não encontrado neste cliente');
    await expect(s.zip('E1', [{ tipo: 'consulta', consulta_id: 'C9' }])).rejects.toThrow('não encontrada neste cliente');
  });

  it('envia por e-mail com os anexos, valida destinatários e registra o envio', async () => {
    const { s, registros, mail } = montar();
    await expect(s.enviar('E1', { para: 'sem-arroba', itens: [{ tipo: 'arquivo', arquivo_id: 'A1' }] })).rejects.toThrow('E-mail inválido');
    const r = await s.enviar('E1', { para: 'a@b.com, c@d.com', itens: [{ tipo: 'arquivo', arquivo_id: 'A1' }] }, { email: 'qa@fal' });
    expect(r).toMatchObject({ enviado: true, para: ['a@b.com', 'c@d.com'], anexos: 1 });
    expect(mail.enviar).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com, c@d.com', subject: 'Documentos - EXTRA AGRO LTDA' }));
    expect(registros[0]).toMatchObject({ origem: 'DOCUMENTO_EMAIL', origem_id: 'A1', destinatario: 'a@b.com, c@d.com', status: 'ENVIADO' });
    const reg = await s.registros(['A1']);
    expect(reg.get('A1')?.[0]).toMatchObject({ tipo: 'E-mail', destinatario: 'a@b.com, c@d.com' });
  });

  it('recusa acima do limite do e-mail e sem servidor de e-mail; falha do envio fica registrada', async () => {
    await expect(montar({ tamanho: LIMITE_EMAIL_BYTES + 1 }).s.enviar('E1', { para: 'a@b.com', itens: [{ tipo: 'arquivo', arquivo_id: 'A1' }] })).rejects.toThrow('o limite por e-mail é 18 MB');
    await expect(montar({ configurado: false }).s.enviar('E1', { para: 'a@b.com', itens: [{ tipo: 'arquivo', arquivo_id: 'A1' }] })).rejects.toThrow('não está configurado');
    const f = montar({ enviado: false });
    await expect(f.s.enviar('E1', { para: 'a@b.com', itens: [{ tipo: 'arquivo', arquivo_id: 'A1' }] })).rejects.toThrow('SMTP fora');
    expect(f.registros[0]).toMatchObject({ status: 'FALHA' });
  });
});
