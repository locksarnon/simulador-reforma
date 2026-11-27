import { describe, it, expect, vi, afterEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ImportacaoXmlController } from './importacao-xml.controller';
import { ImportacaoXmlService } from './importacao-xml.service';
import { chaveArmazenamentoSegura, chaveDeUploadDoUsuario, pareceUrl } from './shared/chave-armazenamento';

// Correção de SSRF na importação em lote: o servidor nunca baixa a URL enviada
// pelo cliente; só lê do armazenamento a chave que o upload devolveu ao usuário.

const USUARIO = { id: '3f0c2a8e-7b1d-4c5e-9a6f-0123456789ab', email: 'a@b.c', name: null, role: 'USER' } as any;
const OUTRO = '9a9a9a9a-0000-4000-8000-000000000000';
const UUID_ARQ = '1b2c3d4e-5f60-4718-89ab-cdef01234567';
const chaveValida = `${USUARIO.id}/${UUID_ARQ}-nota 123.xml`;

function montarController() {
  const service = { receberLote: vi.fn(async () => ({ lote_id: 'L1', status: 'RECEBIDO' })) };
  return { controller: new ImportacaoXmlController(service as any), service };
}
const corpo = (arquivos: any[]) => ({ grupo_id: 'G1', idempotency_key: 'k1', arquivos });

describe('POST /xml/processar-lote — chave de armazenamento obrigatória e do próprio usuário', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('aceita a chave no formato do upload e repassa ao serviço (o file_url é ignorado)', async () => {
    const { controller, service } = montarController();
    await controller.processarLote(corpo([{ nome: 'nota 123.xml', storage_key: chaveValida, file_url: 'http://10.0.0.1/' }]) as any, USUARIO);
    expect(service.receberLote).toHaveBeenCalledTimes(1);
  });

  it('recusa arquivo sem storage_key (só com file_url)', () => {
    const { controller, service } = montarController();
    expect(() => controller.processarLote(corpo([{ nome: 'a.xml', file_url: 'http://169.254.169.254/latest/meta-data/' }]) as any, USUARIO)).toThrow(BadRequestException);
    expect(() => controller.processarLote(corpo([{ nome: 'a.xml', file_url: 'x' }]) as any, USUARIO)).toThrow(/sem chave de armazenamento válida/);
    expect(service.receberLote).not.toHaveBeenCalled();
  });

  it('recusa a chave de outro usuário', () => {
    const { controller, service } = montarController();
    expect(() => controller.processarLote(corpo([{ nome: 'a.xml', storage_key: `${OUTRO}/${UUID_ARQ}-a.xml` }]) as any, USUARIO)).toThrow(BadRequestException);
    expect(service.receberLote).not.toHaveBeenCalled();
  });

  it('um arquivo inválido recusa o lote inteiro', () => {
    const { controller, service } = montarController();
    const arquivos = [{ nome: 'ok.xml', storage_key: chaveValida }, { nome: 'ruim.xml', storage_key: `repositorio/E1/captura/2026/01/x.xml` }];
    expect(() => controller.processarLote(corpo(arquivos) as any, USUARIO)).toThrow(/ruim\.xml/);
    expect(service.receberLote).not.toHaveBeenCalled();
  });

  it.each([
    ['travessia', `${USUARIO.id}/${UUID_ARQ}-../../segredo.xml`],
    ['travessia sem barra', `${USUARIO.id}/${UUID_ARQ}-..xml`],
    ['subpasta', `${USUARIO.id}/${UUID_ARQ}-a/b.xml`],
    ['barra invertida', `${USUARIO.id}/${UUID_ARQ}-a\\b.xml`],
    ['URL', `http://minio:9000/${USUARIO.id}/${UUID_ARQ}-a.xml`],
    ['URL no nome', `${USUARIO.id}/${UUID_ARQ}-http://x`],
    ['barra inicial', `/${USUARIO.id}/${UUID_ARQ}-a.xml`],
    ['caractere de controle', `${USUARIO.id}/${UUID_ARQ}-a\u0000.xml`],
    ['quebra de linha', `${USUARIO.id}/${UUID_ARQ}-a\n.xml`],
    ['sem uuid', `${USUARIO.id}/a.xml`],
    ['uuid em maiúsculas', `${USUARIO.id}/${UUID_ARQ.toUpperCase()}-a.xml`],
    ['nome vazio', `${USUARIO.id}/${UUID_ARQ}-`],
    ['longa demais', `${USUARIO.id}/${UUID_ARQ}-${'a'.repeat(512)}.xml`],
    ['não texto', 123],
    ['objeto', { toString: () => chaveValida }],
  ])('recusa chave inválida: %s', (_rotulo, chave) => {
    const { controller, service } = montarController();
    expect(() => controller.processarLote(corpo([{ nome: 'a.xml', storage_key: chave }]) as any, USUARIO)).toThrow(BadRequestException);
    expect(service.receberLote).not.toHaveBeenCalled();
  });

  it('sem usuário autenticado, nenhuma chave vale', () => {
    const { controller } = montarController();
    expect(() => controller.processarLote(corpo([{ nome: 'a.xml', storage_key: chaveValida }]) as any, undefined as any)).toThrow(BadRequestException);
  });
});

describe('receberLote — defesa em profundidade e caminho feliz sem fetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  function montarServico() {
    const criados: any[] = [];
    const prisma: any = {
      grupo: { findUnique: async () => ({ id: 'G1' }) },
      importacaoXMLLote: {
        findMany: async () => [],
        create: async () => ({ id: 'L1' }),
        update: async () => ({}),
      },
      importacaoXMLArquivo: { create: ({ data }: any) => { const r = { id: `a${criados.length + 1}`, ...data }; criados.push(r); return r; } },
      $transaction: async (ops: any[]) => Promise.all(ops),
    };
    const storage = { getObjectBuffer: vi.fn(async () => Buffer.from('<x/>')) };
    const service = new ImportacaoXmlService(prisma, storage as any, {} as any);
    return { service, criados, storage };
  }

  it('recusa chave insegura mesmo vinda de dentro do servidor', async () => {
    const { service, criados } = montarServico();
    await expect(service.receberLote(corpo([{ nome: 'a.xml', storage_key: 'http://10.0.0.1/a.xml' }]) as any)).rejects.toThrow(BadRequestException);
    await expect(service.receberLote(corpo([{ nome: 'a.xml', file_url: 'http://10.0.0.1/a.xml' }]) as any)).rejects.toThrow(/sem chave de armazenamento/);
    expect(criados).toHaveLength(0);
  });

  it('grava a storage_key (nunca o file_url) e processa lendo do armazenamento, sem fetch', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const { service, criados } = montarServico();
    const processar = vi.spyOn(service as any, 'processarLote').mockResolvedValue(undefined);
    const r = await service.receberLote(corpo([{ nome: 'a.xml', storage_key: chaveValida, file_url: 'http://10.0.0.1/a.xml', tamanho: 4 }]) as any);
    expect(r).toEqual({ lote_id: 'L1', status: 'RECEBIDO' });
    expect(criados[0].storage_key).toBe(chaveValida);
    const arquivosReg = processar.mock.calls[0][2] as any[];
    expect(arquivosReg[0]).toEqual({ id: 'a1', lote_id: 'L1', grupo_id: 'G1', nome: 'a.xml', storage_key: chaveValida });
    expect(JSON.stringify(arquivosReg)).not.toContain('10.0.0.1');
    expect(fetchEspiao).not.toHaveBeenCalled();
  });
});

describe('chave-armazenamento', () => {
  it('chaves do repositório de XML passam na regra geral, mas não como upload do usuário', () => {
    const k = 'repositorio/E1/captura/2026/01/35260112345678000195550010000000011000000010.xml';
    expect(chaveArmazenamentoSegura(k)).toBe(true);
    expect(chaveDeUploadDoUsuario(k, USUARIO.id)).toBe(false);
  });
  it('id do usuário com caracteres de regex não abre brecha', () => {
    expect(chaveDeUploadDoUsuario(`aXb/${UUID_ARQ}-a.xml`, 'a.b')).toBe(false);
    expect(chaveDeUploadDoUsuario(`a.b/${UUID_ARQ}-a.xml`, 'a.b')).toBe(true);
  });
  it('reconhece URL gravada no lugar da chave', () => {
    expect(pareceUrl('https://minio:9000/b/k?X-Amz-Signature=1')).toBe(true);
    expect(pareceUrl(chaveValida)).toBe(false);
  });
});
