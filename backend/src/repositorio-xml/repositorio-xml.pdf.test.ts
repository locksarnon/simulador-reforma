import { NotFoundException } from '@nestjs/common';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositorioXmlService } from './repositorio-xml.service';
import { ErroLeituraDocumento } from './pdf/erros';
import { geraPdf, tipoDePdf } from './pdf/tipos-de-pdf';

// O desenho de cada documento tem testes próprios; aqui só interessa como o repositório escolhe e usa o gerador de cada tipo.
vi.mock('./pdf/danfe', () => ({ gerarDanfe: vi.fn(async () => Buffer.from('%PDF-1.3 DANFE')) }));
vi.mock('./pdf/danfe-nfce', () => ({ gerarDanfeNfce: vi.fn(async () => Buffer.from('%PDF-1.3 NFCE')) }));
vi.mock('./pdf/dacte', () => ({ gerarDacte: vi.fn(async () => Buffer.from('%PDF-1.3 DACTE')) }));
vi.mock('./pdf/damdfe', () => ({ gerarDamdfe: vi.fn(async () => Buffer.from('%PDF-1.3 DAMDFE')) }));
vi.mock('./pdf/danfse', () => ({ gerarDanfse: vi.fn(async () => Buffer.from('%PDF-1.3 DANFSE')) }));
const { gerarDanfe } = await import('./pdf/danfe');
const { gerarDanfeNfce } = await import('./pdf/danfe-nfce');
const { gerarDacte } = await import('./pdf/dacte');
const { gerarDamdfe } = await import('./pdf/damdfe');
const { gerarDanfse } = await import('./pdf/danfse');
const geradores = [gerarDanfe, gerarDanfeNfce, gerarDacte, gerarDamdfe, gerarDanfse];

type Doc = { id: string; empresa_id: string; tipo: string; modelo: string | null; conteudo: string; situacao: string | null; chave: string; storage_key: string | null };
const chaveDe = (n: number) => String(n).padStart(44, '0');
function doc(n: number, extra: Partial<Doc> = {}): Doc {
  const chave = chaveDe(n);
  return { id: `d${n}`, empresa_id: 'E1', tipo: 'NFE', modelo: '55', conteudo: 'COMPLETO', situacao: 'AUTORIZADA', chave, storage_key: `repositorio/E1/importacao/2026/11/${chave}.xml`, ...extra };
}
const nfce = (n: number, extra: Partial<Doc> = {}) => doc(n, { modelo: '65', ...extra });
const cte = (n: number, extra: Partial<Doc> = {}) => doc(n, { tipo: 'CTE', modelo: '57', ...extra });
const mdfe = (n: number, extra: Partial<Doc> = {}) => doc(n, { tipo: 'MDFE', modelo: '58', ...extra });
const nfse = (n: number, extra: Partial<Doc> = {}) => doc(n, { tipo: 'NFSE', modelo: null, ...extra });

function montar(docs: Doc[], xml = (key: string) => `<doc>${key}</doc>`) {
  const prisma = {
    empresa: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, cnpj_cpf: '12.345.678/0001-95', grupo: '001' }) },
    documentoXml: {
      findFirst: async ({ where }: { where: { id: string; empresa_id: string } }) => docs.find((d) => d.id === where.id && d.empresa_id === where.empresa_id) ?? null,
      findMany: async ({ take }: { take?: number }) => docs.filter((d) => d.storage_key).slice(0, take),
    },
  };
  const storage = { getObjectBuffer: vi.fn(async (key: string) => Buffer.from(xml(key))) };
  return { service: new RepositorioXmlService(prisma as never, storage as never, {} as never), storage };
}

beforeEach(() => { geradores.forEach((g) => vi.mocked(g).mockClear()); });

describe('quais documentos têm PDF', () => {
  it('NF-e 55, NFC-e 65, CT-e 57, MDF-e 58 e NFS-e, desde que o XML esteja completo', () => {
    expect(geraPdf(doc(1))).toBe(true);
    expect(geraPdf(nfce(1))).toBe(true);
    expect(geraPdf(cte(1))).toBe(true);
    expect(geraPdf(mdfe(1))).toBe(true);
    expect(geraPdf(nfse(1))).toBe(true);
    expect(geraPdf(doc(1, { conteudo: 'RESUMO' }))).toBe(false);
    expect(geraPdf(cte(1, { conteudo: 'RESUMO' }))).toBe(false);
  });

  it('evento e CT-e OS (modelo 67) ficam só em XML', () => {
    expect(geraPdf(doc(1, { tipo: 'EVENTO' }))).toBe(false);
    expect(geraPdf(cte(1, { modelo: '67' }))).toBe(false);
    expect(tipoDePdf({ tipo: 'EVENTO', modelo: '57' })).toBeNull();
  });

  it('cada tipo tem pasta e prefixo próprios no ZIP e no nome do arquivo', () => {
    const nomes = [doc(1), nfce(1), cte(1), mdfe(1), nfse(1)].map((d) => `${tipoDePdf(d)!.pasta}:${tipoDePdf(d)!.prefixo}`);
    expect(nomes).toEqual(['NFE:DANFE', 'NFCE:DANFE-NFCE', 'CTE:DACTE', 'MDFE:DAMDFE', 'NFSE:DANFSE']);
  });
});

describe('RepositorioXmlService.baixarPdf', () => {
  it('usa o gerador do tipo do documento e nomeia o arquivo com o prefixo dele e a chave', async () => {
    const casos: [Doc, typeof gerarDanfe, string][] = [
      [doc(1), gerarDanfe, 'DANFE'], [nfce(2), gerarDanfeNfce, 'DANFE-NFCE'], [cte(3), gerarDacte, 'DACTE'], [mdfe(4), gerarDamdfe, 'DAMDFE'], [nfse(5), gerarDanfse, 'DANFSE'],
    ];
    const { service, storage } = montar(casos.map(([d]) => d));
    for (const [d, gerador, prefixo] of casos) {
      geradores.forEach((g) => vi.mocked(g).mockClear());
      const r = await service.baixarPdf('E1', d.id);
      expect(r.nome).toBe(`${prefixo}-${d.chave}.pdf`);
      expect(r.buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(gerador).toHaveBeenCalledTimes(1);
      expect(geradores.filter((g) => g !== gerador).every((g) => vi.mocked(g).mock.calls.length === 0)).toBe(true);
      expect(storage.getObjectBuffer).toHaveBeenLastCalledWith(d.storage_key);
    }
  });

  it('nota cancelada ou denegada leva a marca d\'água, e o BOM do arquivo não atrapalha', async () => {
    const t = montar([doc(1, { situacao: 'CANCELADA' }), doc(2, { situacao: 'DENEGADA' }), doc(3)], () => String.fromCharCode(0xfeff) + '<nfeProc/>');
    await t.service.baixarPdf('E1', 'd1');
    expect(gerarDanfe).toHaveBeenLastCalledWith('<nfeProc/>', { cancelada: true, denegada: false });
    await t.service.baixarPdf('E1', 'd2');
    expect(gerarDanfe).toHaveBeenLastCalledWith('<nfeProc/>', { cancelada: false, denegada: true });
    await t.service.baixarPdf('E1', 'd3');
    expect(gerarDanfe).toHaveBeenLastCalledWith('<nfeProc/>', { cancelada: false, denegada: false });
  });

  it('explica por que não há PDF: documento inexistente ou de outra empresa, só o resumo, evento, tipo sem PDF e XML que não lê', async () => {
    const t = montar([doc(1, { conteudo: 'RESUMO' }), doc(2, { tipo: 'EVENTO', modelo: null }), cte(3, { modelo: '67' }), doc(4), doc(5, { empresa_id: 'OUTRA' })]);
    await expect(t.service.baixarPdf('E1', 'nao-existe')).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.baixarPdf('E1', 'd5')).rejects.toBeInstanceOf(NotFoundException); // de outra empresa
    await expect(t.service.baixarPdf('E1', 'd1')).rejects.toThrow(/falta o XML completo/);
    await expect(t.service.baixarPdf('E1', 'd2')).rejects.toThrow('Evento não tem PDF: ele fica só em XML.');
    await expect(t.service.baixarPdf('E1', 'd3')).rejects.toThrow(/ainda não está disponível/);
    vi.mocked(gerarDanfe).mockRejectedValueOnce(new ErroLeituraDocumento('XML ruim'));
    await expect(t.service.baixarPdf('E1', 'd4')).rejects.toThrow('Não foi possível gerar o PDF: XML ruim');
    vi.mocked(gerarDanfe).mockRejectedValueOnce(new Error('falha inesperada'));
    await expect(t.service.baixarPdf('E1', 'd4')).rejects.toThrow('falha inesperada'); // erro de verdade sobe como erro, não como "XML ruim"
  });
});

describe('RepositorioXmlService.baixarZip com PDF', () => {
  const nomes = (zip: Buffer) => Object.keys(unzipSync(new Uint8Array(zip))).sort();

  it('sem pedir PDF, o ZIP leva só os XML (como sempre)', async () => {
    const t = montar([doc(1), cte(2)]);
    expect(nomes(await t.service.baixarZip('E1', {}))).toEqual([`CTE/2026-11/${chaveDe(2)}.xml`, `NFE/2026-11/${chaveDe(1)}.xml`]);
  });

  it('pedindo PDF, cada documento com XML completo leva o seu, na pasta do tipo; resumo, evento e CT-e OS ficam só em XML', async () => {
    const t = montar([
      doc(1), nfce(2), cte(3), mdfe(4), nfse(5),
      doc(6, { conteudo: 'RESUMO' }), doc(7, { tipo: 'EVENTO', modelo: null }), cte(8, { modelo: '67' }), doc(9, { situacao: 'CANCELADA' }),
    ]);
    const zip = await t.service.baixarZip('E1', {}, { incluirPdf: true });
    expect(nomes(zip).filter((n) => n.startsWith('PDF/'))).toEqual([
      `PDF/CTE/2026-11/DACTE-${chaveDe(3)}.pdf`,
      `PDF/MDFE/2026-11/DAMDFE-${chaveDe(4)}.pdf`,
      `PDF/NFCE/2026-11/DANFE-NFCE-${chaveDe(2)}.pdf`,
      `PDF/NFE/2026-11/DANFE-${chaveDe(1)}.pdf`,
      `PDF/NFE/2026-11/DANFE-${chaveDe(9)}.pdf`,
      `PDF/NFSE/2026-11/DANFSE-${chaveDe(5)}.pdf`,
    ]);
    expect(nomes(zip).filter((n) => !n.startsWith('PDF/'))).toHaveLength(9); // os 9 XML continuam no ZIP
    expect(new TextDecoder().decode(unzipSync(new Uint8Array(zip))[`PDF/CTE/2026-11/DACTE-${chaveDe(3)}.pdf`])).toBe('%PDF-1.3 DACTE');
    expect(gerarDanfe).toHaveBeenCalledWith(expect.any(String), { cancelada: true, denegada: false });
  });

  it('um documento que não dá para desenhar não derruba o ZIP: o XML fica, e a falha vai num arquivo de aviso', async () => {
    const t = montar([doc(1), cte(2)]);
    vi.mocked(gerarDacte).mockRejectedValueOnce(new Error('xml quebrado'));
    const arquivos = unzipSync(new Uint8Array(await t.service.baixarZip('E1', {}, { incluirPdf: true })));
    expect(Object.keys(arquivos).filter((n) => n.endsWith('.pdf'))).toEqual([`PDF/NFE/2026-11/DANFE-${chaveDe(1)}.pdf`]);
    expect(Object.keys(arquivos)).toContain(`CTE/2026-11/${chaveDe(2)}.xml`);
    const aviso = new TextDecoder().decode(arquivos['PDF/LEIAME-falhas.txt']);
    expect(aviso).toContain(chaveDe(2));
    expect(aviso).toContain('DACTE');
    expect(aviso).toContain('xml quebrado');
  });

  it('o ZIP com PDF aceita até 300 documentos com PDF; acima disso pede para reduzir o período, e o ZIP só com XML não tem esse limite', async () => {
    const muitos = Array.from({ length: 301 }, (_, i) => doc(i + 1));
    const t = montar(muitos);
    await expect(t.service.baixarZip('E1', {}, { incluirPdf: true })).rejects.toThrow(/aceita até 300/);
    expect(gerarDanfe).not.toHaveBeenCalled();
    expect(nomes(await t.service.baixarZip('E1', {}))).toHaveLength(301);
  });
});
