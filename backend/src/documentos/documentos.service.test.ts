import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DocumentosService, nomeSeguro, pastaSegura, situacaoDoDocumento } from './documentos.service';
import { cpfValido, formatarCpf, PessoasService } from '../pessoas/pessoas.service';

function montar() {
  const arquivos: Record<string, any>[] = [];
  const docs: Record<string, any>[] = [];
  const lotes: Record<string, any>[] = [];
  const pfs: Record<string, any>[] = [];
  const tipos = [{ id: 'T1', nome: 'Alvará de funcionamento', orgao: 'Prefeitura', alerta_dias: 30 }];
  const guardados = new Map<string, Buffer>();
  const avisos: Record<string, unknown>[] = [];
  let seq = 0;
  const lista = <T extends Record<string, any>>(arr: T[]) => ({
    findMany: async ({ where }: { where?: Record<string, any> } = {}) => arr.filter((x) => Object.entries(where ?? {}).every(([k, v]) => (v && typeof v === 'object' && 'in' in v ? v.in.includes(x[k]) : v && typeof v === 'object' && 'gt' in v ? x[k] > v.gt : v && typeof v === 'object' && 'lt' in v ? x[k] < v.lt : v && typeof v === 'object' ? true : x[k] === v))),
    findUnique: async ({ where }: { where: { id?: string; cpf?: string } }) => arr.find((x) => (where.id ? x.id === where.id : x.cpf === where.cpf)) ?? null,
    findFirst: async ({ where }: { where: { nome: { equals: string }; id?: { not: string } } }) => arr.find((x) => x.nome.toLowerCase() === where.nome.equals.toLowerCase() && x.id !== where.id?.not) ?? null,
    count: async ({ where }: { where: { id: string } }) => arr.filter((x) => x.id === where.id).length,
    create: async ({ data }: { data: T }) => { const x = { id: data.id ?? `X${++seq}`, createdAt: new Date(), ...data }; arr.push(x as T); return x; },
    update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(arr.find((x) => x.id === where.id)!, data),
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: object }) => { arr.filter((x) => Object.entries(where).every(([k, v]) => x[k] === v)).forEach((x) => Object.assign(x, data)); },
    delete: async ({ where }: { where: { id: string } }) => { arr.splice(arr.findIndex((x) => x.id === where.id), 1); },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => { for (let i = arr.length - 1; i >= 0; i--) if (Object.entries(where).every(([k, v]) => arr[i][k] === v)) arr.splice(i, 1); },
  });
  const prisma = {
    arquivoEmpresa: lista(arquivos), documentoEmpresa: lista(docs), downloadLote: lista(lotes), tipoDocumento: lista(tipos), pessoaFisica: lista(pfs),
    empresa: { count: async ({ where }: { where: { id: string } }) => (where.id === 'E1' ? 1 : 0), findUnique: async () => ({ razao_social: 'EXTRA AGRO LTDA' }) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  const storage = {
    guardar: async (k: string, b: Buffer) => { guardados.set(k, b); },
    getObjectBuffer: async (k: string) => guardados.get(k)!,
    removeObject: async (k: string) => { guardados.delete(k); },
  };
  const notificacoes = { criarParaAdmins: async (n: Record<string, unknown>) => { avisos.push(n); return 1; } };
  return { service: new DocumentosService(prisma as never, storage as never, notificacoes as never), pessoas: new PessoasService(prisma as never, storage as never), arquivos, docs, lotes, pfs, guardados, avisos };
}

const maria = { id: 'U1', email: 'maria@fal', role: 'user' };
const arquivo = (nome: string, conteudo = 'oi') => ({ buffer: Buffer.from(conteudo), originalname: nome, mimetype: 'text/plain', size: Buffer.byteLength(conteudo) });

describe('nomes, pastas e situação', () => {
  it('limpa nomes e pastas (sem barra, sem "..")', () => {
    expect(nomeSeguro('a/b:c?.pdf')).toBe('a_b_c_.pdf');
    expect(pastaSegura('Contratos/../2026')).toBe('Contratos/2026');
    expect(pastaSegura('')).toBe('');
  });
  it('vencido, a vencer (dentro do aviso) e válido', () => {
    const hoje = new Date('2026-11-11T00:00:00Z');
    expect(situacaoDoDocumento(new Date('2026-11-01T00:00:00Z'), 30, hoje)).toBe('VENCIDO');
    expect(situacaoDoDocumento(new Date('2026-12-01T00:00:00Z'), 30, hoje)).toBe('A_VENCER');
    expect(situacaoDoDocumento(new Date('2027-03-01T00:00:00Z'), 30, hoje)).toBe('VALIDO');
    expect(situacaoDoDocumento(null, 30, hoje)).toBe('SEM_VALIDADE');
  });
  it('CPF: dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
  });
});

describe('DocumentosService: arquivos e downloads', () => {
  it('envia, lista por pasta com subpastas, baixa e exclui (também do armazenamento)', async () => {
    const t = montar();
    const a = await t.service.enviar(maria, { empresa_id: 'E1', pasta: 'Contratos' }, arquivo('contrato.txt', 'contrato'));
    await t.service.enviar(maria, { empresa_id: 'E1', pasta: 'Contratos/2026' }, arquivo('aditivo.txt'));
    await t.service.enviar(maria, { empresa_id: 'E1' }, arquivo('raiz.txt'));
    const raiz = await t.service.listarArquivos({ empresa_id: 'E1' });
    expect(raiz.subpastas).toEqual(['Contratos']);
    expect(raiz.arquivos.map((x) => x.nome)).toEqual(['raiz.txt']);
    const contratos = await t.service.listarArquivos({ empresa_id: 'E1', pasta: 'Contratos' });
    expect(contratos.subpastas).toEqual(['2026']);
    expect((await t.service.baixar(a.id)).buffer.toString()).toBe('contrato');
    await t.service.excluirArquivo(a.id);
    expect(t.guardados.has(a.storage_key)).toBe(false);
  });

  it('recusa sem dono, com dois donos, empresa inexistente e arquivo grande', async () => {
    const t = montar();
    await expect(t.service.enviar(maria, {}, arquivo('a.txt'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.enviar(maria, { empresa_id: 'E1', pessoa_fisica_id: 'P1' }, arquivo('a.txt'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.enviar(maria, { empresa_id: 'ZZ' }, arquivo('a.txt'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.enviar(maria, { empresa_id: 'E1' }, { ...arquivo('a.txt'), size: 30 * 1024 * 1024 })).rejects.toThrow(/25 MB/);
  });

  it('meus downloads: ZIP com as pastas e nomes repetidos numerados; só o dono baixa; expirado não baixa', async () => {
    const t = montar();
    const a = await t.service.enviar(maria, { empresa_id: 'E1', pasta: 'Notas' }, arquivo('nota.txt', 'um'));
    const b = await t.service.enviar(maria, { empresa_id: 'E1', pasta: 'Notas' }, arquivo('nota.txt', 'dois'));
    const lote = await t.service.criarLote(maria, { arquivo_ids: [a.id, b.id], nome: 'notas de outubro' });
    expect(lote).toMatchObject({ nome: 'notas de outubro.zip', arquivos: 2, status: 'PRONTO' });
    const zip = unzipSync(new Uint8Array((await t.service.baixarLote(maria, lote.id)).buffer));
    expect(Object.keys(zip).sort()).toEqual(['Notas/nota (2).txt', 'Notas/nota.txt']);
    expect(strFromU8(zip['Notas/nota.txt'])).toBe('um');
    await expect(t.service.baixarLote({ id: 'U2' }, lote.id)).rejects.toBeInstanceOf(NotFoundException);
    t.lotes[0].expira_em = new Date(Date.now() - 1000);
    await expect(t.service.baixarLote(maria, lote.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await t.service.limparDownloads()).toBe(1);
    await expect(t.service.criarLote(maria, { arquivo_ids: [] })).rejects.toThrow(/pelo menos um arquivo/);
  });
});

describe('DocumentosService: documentos com validade e avisos', () => {
  it('cria com tipo e validade; a lista calcula a situação; o aviso sai uma vez por documento e situação', async () => {
    const t = montar();
    await t.service.criarDocumento(maria, { empresa_id: 'E1', tipo_id: 'T1', validade: '2026-11-20', numero: '123' });
    await expect(t.service.criarDocumento(maria, { empresa_id: 'E1' })).rejects.toThrow(/tipo ou a descrição/);
    await expect(t.service.criarDocumento(maria, { empresa_id: 'E1', tipo_id: 'T1', validade: '20/11/2026' })).rejects.toThrow(/Data inválida/);
    const lista = await t.service.listarDocumentos({ empresa_id: 'E1' });
    expect(lista[0]).toMatchObject({ situacao: expect.stringMatching(/A_VENCER|VENCIDO/), tipo: expect.objectContaining({ nome: 'Alvará de funcionamento' }) });
    await t.service.avisarVencimentos(new Date('2026-11-11T12:00:00Z'));
    expect(t.avisos[0]).toMatchObject({ tipo: 'DOCUMENTO', link: '/bpo/arquivos' });
  });

  it('pessoa física: CPF válido e único; o certificado perto de vencer gera aviso; excluir leva os arquivos dela', async () => {
    const t = montar();
    const p = await t.pessoas.criar(maria, { nome: 'Jose Carlos Bianchi', cpf: '52998224725', certificado_tipo: 'A1', certificado_validade: '2026-11-25' });
    expect(p).toMatchObject({ cpf: '529.982.247-25' });
    await expect(t.pessoas.criar(maria, { nome: 'Outro', cpf: '529.982.247-25' })).rejects.toThrow(/Já existe/);
    await expect(t.pessoas.criar(maria, { nome: 'X', cpf: '123' })).rejects.toThrow(/CPF inválido/);
    await expect(t.pessoas.criar(maria, { nome: 'X', cpf: '11144477735', certificado_tipo: 'B9' })).rejects.toThrow(/Tipo de certificado/);
    await t.service.avisarVencimentos(new Date('2026-11-11T12:00:00Z'));
    expect(t.avisos.some((a) => a.tipo === 'CERTIFICADO')).toBe(true);
    const arq = await t.service.enviar(maria, { pessoa_fisica_id: p.id }, arquivo('rg.txt'));
    await expect(t.pessoas.excluir(maria, p.id)).rejects.toBeInstanceOf(ForbiddenException);
    await t.pessoas.excluir({ id: 'A1', role: 'admin' }, p.id);
    expect(t.guardados.has(arq.storage_key)).toBe(false);
    expect(t.pfs).toHaveLength(0);
  });
});
