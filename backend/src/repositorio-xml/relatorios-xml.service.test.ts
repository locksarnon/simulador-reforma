import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { nfeExemplo } from './pdf/__fixtures__/nfe-exemplo';
import {
  LinhaProduto, MAX_LINHAS_RELATORIO, MAX_NOTAS_PRODUTOS, RelatoriosXmlService, agruparLinhas, rotuloDoDocumento,
} from './relatorios-xml.service';
import { GRUPOS_DE_DOCUMENTOS, IMPORTAVEL, RESUMOS_E_EVENTOS, construirWhere } from './repositorio-xml.service';

type Where = Record<string, unknown>;
interface Doc {
  id: string; tipo: string; modelo: string | null; numero: string | null; serie: string | null; data_emissao: Date | null; chave: string;
  emitente_nome: string | null; emitente_doc: string | null; destinatario_doc: string | null; valor_total: number | null; situacao: string | null;
  origem: string; conteudo: string; lote_importacao_id: string | null; storage_key: string | null; createdAt: Date;
}
const chaveDe = (n: number) => String(n).padStart(44, '0');
const doc = (n: number, extra: Partial<Doc> = {}): Doc => ({
  id: `d${n}`, tipo: 'NFE', modelo: '55', numero: String(n), serie: '1', data_emissao: new Date(`2026-11-0${(n % 9) + 1}T13:00:00Z`), chave: chaveDe(n),
  emitente_nome: 'FORNECEDOR AGRO LTDA', emitente_doc: '12345678000195', destinatario_doc: '98765432000110', valor_total: 100 * n, situacao: 'AUTORIZADA',
  origem: 'UPLOAD', conteudo: 'COMPLETO', lote_importacao_id: null, storage_key: `repositorio/E1/importacao/2026/11/${chaveDe(n)}.xml`, createdAt: new Date(2026, 10, n), ...extra,
});

/** Prisma e armazenamento de mentira: o banco devolve sempre os documentos dados e guarda o `where` de cada pedido. */
function montar(docs: Doc[], xml: (chave: string) => string = () => nfeExemplo({ itens: 3 })) {
  const wheres: Where[] = [];
  const prisma = {
    empresa: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'E1' ? { id: 'E1' } : null) },
    documentoXml: {
      groupBy: async ({ where }: { where: Where }) => {
        wheres.push(where);
        const mapa = new Map<string, { tipo: string; modelo: string | null; situacao: string | null; _count: { _all: number }; _sum: { valor_total: number } }>();
        for (const d of docs) {
          const k = `${d.tipo}|${d.modelo}|${d.situacao}`;
          const g = mapa.get(k) ?? { tipo: d.tipo, modelo: d.modelo, situacao: d.situacao, _count: { _all: 0 }, _sum: { valor_total: 0 } };
          g._count._all += 1; g._sum.valor_total += d.valor_total ?? 0;
          mapa.set(k, g);
        }
        return [...mapa.values()];
      },
      findMany: async ({ where, take }: { where: Where; take?: number }) => { wheres.push(where); return docs.slice(0, take); },
      count: async ({ where }: { where: Where }) => { wheres.push(where); return docs.length; },
    },
  };
  const storage = { getObjectBuffer: vi.fn(async (key: string) => Buffer.from(xml(key.split('/').pop()!.replace('.xml', '')))) };
  return { service: new RelatoriosXmlService(prisma as never, storage as never), wheres, storage };
}

describe('construirWhere: grupo e modelo', () => {
  it('cada aba de tipo é só o documento (o evento vai para os resumos e eventos), e os resumos e eventos são um grupo à parte', () => {
    expect(construirWhere('E1', { grupo: 'NFE' })).toMatchObject({ empresa_id: 'E1', AND: [GRUPOS_DE_DOCUMENTOS.NFE] });
    expect(GRUPOS_DE_DOCUMENTOS.NFE).toEqual({ tipo: 'NFE' });
    expect(GRUPOS_DE_DOCUMENTOS.CTE).toEqual({ tipo: 'CTE' });
    expect(GRUPOS_DE_DOCUMENTOS.MDFE).toEqual({ tipo: 'MDFE' });
    expect(GRUPOS_DE_DOCUMENTOS.NFSE).toEqual({ tipo: 'NFSE' });
    expect(GRUPOS_DE_DOCUMENTOS.RESUMOS_EVENTOS).toEqual({ OR: [{ conteudo: 'RESUMO' }, { tipo: 'EVENTO' }] });
    const w = construirWhere('E1', { grupo: 'RESUMOS_EVENTOS', tipo: 'EVENTO' });
    expect(w).toMatchObject({ empresa_id: 'E1', tipo: 'EVENTO', AND: [RESUMOS_E_EVENTOS] });
    expect(w.conteudo).toBeUndefined(); // o evento vem com XML completo ou só em resumo: a aba não filtra o conteúdo
  });

  it('o grupo convive com "só os que faltam enviar" e com a busca (que usa o OR), sem um apagar o outro', () => {
    const w = construirWhere('E1', { grupo: 'CTE', pendentes: true, q: 'agro', modelo: '57', conteudo: 'RESUMO' });
    expect(w.AND).toEqual([IMPORTAVEL, GRUPOS_DE_DOCUMENTOS.CTE]);
    expect(w.conteudo).toBe('COMPLETO'); // "pendentes" só vale para XML completo
    expect(w.modelo).toBe('57');
    expect(Array.isArray(w.OR)).toBe(true);
  });

  it('sem grupo nem modelo não filtra por eles, e grupo que não existe é recusado', () => {
    const w = construirWhere('E1', { tipo: 'NFE' });
    expect(w).toEqual({ empresa_id: 'E1', tipo: 'NFE' });
    expect(() => construirWhere('E1', { grupo: 'XYZ' })).toThrow(BadRequestException);
  });

  it('o período vale do começo do dia ao fim do dia, no horário de Brasília', () => {
    const w = construirWhere('E1', { de: '2026-11-01', ate: '2026-11-30' });
    expect(w.data_emissao).toEqual({ gte: new Date('2026-11-01T00:00:00-03:00'), lte: new Date('2026-11-30T23:59:59.999-03:00') });
  });
});

describe('rotuloDoDocumento', () => {
  it('NFC-e e CT-e OS não se confundem com NF-e e CT-e', () => {
    expect([['NFE', '55'], ['NFE', '65'], ['CTE', '57'], ['CTE', '67'], ['MDFE', '58'], ['NFSE', null]].map(([t, m]) => rotuloDoDocumento(t as string, m as string | null)))
      .toEqual(['NF-e', 'NFC-e', 'CT-e', 'CT-e OS', 'MDF-e', 'NFS-e']);
  });
});

describe('Relatório Geral', () => {
  const docs = [
    doc(1, { valor_total: 1000 }), doc(2, { valor_total: 500, situacao: 'CANCELADA' }), doc(3, { modelo: '65', valor_total: 80.5 }),
    doc(4, { tipo: 'CTE', modelo: '57', valor_total: 2500 }), doc(5, { tipo: 'NFSE', modelo: null, valor_total: 300, situacao: null }), doc(6, { valor_total: 200, situacao: 'DENEGADA' }),
  ];

  it('conta e soma por tipo de documento e situação; só as autorizadas entram no valor', async () => {
    const { service } = montar(docs);
    const r = await service.geral('E1', {});
    expect(r.resumo.documentos).toBe(6);
    expect(r.resumo.canceladas).toBe(1);
    expect(r.resumo.valor_autorizadas).toBe(3580.5); // 1000 + 80,50 + 2500
    expect(r.resumo.por_documento).toEqual([
      { documento: 'NF-e', total: 3, autorizadas: 1, canceladas: 1, denegadas: 1, sem_situacao: 0, valor_total: 1700, valor_autorizadas: 1000 },
      { documento: 'NFC-e', total: 1, autorizadas: 1, canceladas: 0, denegadas: 0, sem_situacao: 0, valor_total: 80.5, valor_autorizadas: 80.5 },
      { documento: 'CT-e', total: 1, autorizadas: 1, canceladas: 0, denegadas: 0, sem_situacao: 0, valor_total: 2500, valor_autorizadas: 2500 },
      { documento: 'NFS-e', total: 1, autorizadas: 0, canceladas: 0, denegadas: 0, sem_situacao: 1, valor_total: 300, valor_autorizadas: 0 },
    ]);
    expect(r.truncado).toBe(false);
  });

  it('cada linha traz o nome do documento, a data, o emitente, o valor, a situação e se já foi ao importador', async () => {
    const { service } = montar([doc(3, { modelo: '65', lote_importacao_id: 'L1' }), doc(4, { tipo: 'CTE', modelo: '57' })]);
    const r = await service.geral('E1', {});
    expect(r.linhas[0]).toMatchObject({ id: 'd3', documento: 'NFC-e', numero: '3', serie: '1', chave: chaveDe(3), emitente_nome: 'FORNECEDOR AGRO LTDA', emitente_doc: '12345678000195', valor_total: 300, situacao: 'AUTORIZADA', origem: 'UPLOAD', importado: true });
    expect(r.linhas[0].data_emissao).toBe('2026-11-04T13:00:00.000Z');
    expect(r.linhas[1]).toMatchObject({ documento: 'CT-e', importado: false });
  });

  it('só olha documentos (o evento não entra), só o XML completo (a não ser que peça os resumos) e respeita os filtros', async () => {
    const { service, wheres } = montar([doc(1)]);
    await service.geral('E1', { de: '2026-11-01', ate: '2026-11-30', situacao: 'CANCELADA', origem: 'CAPTURA', grupo: 'NFE' });
    expect(wheres[0]).toMatchObject({ empresa_id: 'E1', conteudo: 'COMPLETO', situacao: 'CANCELADA', origem: 'CAPTURA', tipo: { in: ['NFE', 'CTE', 'MDFE', 'NFSE'] } });
    expect(wheres[0].data_emissao).toBeTruthy();
    expect(wheres[0].AND).toEqual([GRUPOS_DE_DOCUMENTOS.NFE]);
    await service.geral('E1', { incluirResumos: true, tipo: 'CTE' });
    expect(wheres[2]).toMatchObject({ tipo: 'CTE' });
    expect(wheres[2].conteudo).toBeUndefined();
    await service.geral('E1', { tipo: 'EVENTO' }); // tipo que não é documento volta para todos os documentos
    expect(wheres[4].tipo).toEqual({ in: ['NFE', 'CTE', 'MDFE', 'NFSE'] });
  });

  it('corta a lista no teto de linhas e avisa, mas o resumo continua contando todos', async () => {
    const muitos = Array.from({ length: MAX_LINHAS_RELATORIO + 1 }, (_, i) => doc(i + 1, { valor_total: 1 }));
    const r = await montar(muitos).service.geral('E1', {});
    expect(r.linhas).toHaveLength(MAX_LINHAS_RELATORIO);
    expect(r.truncado).toBe(true);
    expect(r.resumo.documentos).toBe(MAX_LINHAS_RELATORIO + 1);
  });

  it('empresa que não existe', async () => {
    await expect(montar([]).service.geral('NAO', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Relatório de Produtos', () => {
  const duas = [doc(1), doc(2)];

  it('lista os itens de cada nota, com os dados da nota, em números', async () => {
    const r = await montar(duas).service.produtos('E1', {});
    expect(r.modo).toBe('itens');
    expect(r.resumo).toEqual({ notas: 2, notas_com_falha: 0, itens: 6, valor_total: 7571.52, desconto: 0 });
    expect(r.linhas).toHaveLength(6);
    expect(r.linhas[0]).toMatchObject({
      numero: '1', serie: '1', chave: chaveDe(1), emitente_nome: 'FORNECEDOR AGRO LTDA', emitente_doc: '12345678000195', item: '1', codigo: 'P0001',
      descricao: 'SOJA EM GRAOS CLASSIFICADA', ncm: '12019000', cfop: '5102', unidade: 'SC', quantidade: 10.5, valor_unitario: 107.25, valor_total: 1126.13,
    });
    expect(r.linhas[0].valor_icms).toBeGreaterThan(0);
    expect(r.grupos).toEqual([]);
    expect(r.falhas).toEqual([]);
  });

  it('agrupa por produto (descrição e unidade), somando quantidade e valor e contando as notas', async () => {
    const r = await montar(duas).service.produtos('E1', { agrupar: 'produto' });
    expect(r.linhas).toEqual([]);
    expect(r.grupos).toHaveLength(3);
    // do maior valor para o menor: o fertilizante (1.400,13 por nota) vem antes do herbicida (1.259,50) e da soja (1.126,13)
    expect(r.grupos.map((g) => g.descricao.split(' ')[0])).toEqual(['FERTILIZANTE', 'HERBICIDA', 'SOJA']);
    expect(r.grupos[2]).toMatchObject({ unidade: 'SC', ncm: '12019000', cfop: '5102', notas: 2, itens: 2, quantidade: 21, valor_total: 2252.26, produtos: 1 });
  });

  it('agrupa por NCM e por CFOP', async () => {
    const t = montar(duas);
    const porNcm = await t.service.produtos('E1', { agrupar: 'ncm' });
    expect(porNcm.grupos).toHaveLength(1);
    expect(porNcm.grupos[0]).toMatchObject({ chave: '12019000', produtos: 3, notas: 2, itens: 6, valor_total: 7571.52 });
    const porCfop = await t.service.produtos('E1', { agrupar: 'cfop' });
    expect(porCfop.grupos[0]).toMatchObject({ chave: '5102', itens: 6 });
  });

  it('a busca filtra os itens (código, descrição, NCM ou CFOP) antes de somar', async () => {
    const r = await montar(duas).service.produtos('E1', { busca: 'herbicida' });
    expect(r.linhas).toHaveLength(2);
    expect(r.resumo.itens).toBe(2);
    expect(r.resumo.valor_total).toBe(2519);
    expect((await montar(duas).service.produtos('E1', { busca: 'p0003' })).linhas).toHaveLength(2);
    expect((await montar(duas).service.produtos('E1', { busca: '99999999' })).linhas).toHaveLength(0);
  });

  it('nota que não dá para ler vai para a lista de falhas e não derruba o relatório', async () => {
    const t = montar(duas, (chave) => (chave === chaveDe(2) ? '<nao-e-nfe/>' : nfeExemplo({ itens: 3 })));
    const r = await t.service.produtos('E1', {});
    expect(r.resumo).toMatchObject({ notas: 1, notas_com_falha: 1, itens: 3 });
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].chave).toBe(chaveDe(2));
    expect(r.falhas[0].motivo).toMatch(/NF-e/);
  });

  it('pega só NF-e e NFC-e autorizadas com XML completo, salvo se o filtro pedir outra coisa', async () => {
    const t = montar(duas);
    await t.service.produtos('E1', { de: '2026-11-01', ate: '2026-11-30', origem: 'CAPTURA', q: 'agro' });
    expect(t.wheres[0]).toMatchObject({ empresa_id: 'E1', tipo: 'NFE', conteudo: 'COMPLETO', situacao: 'AUTORIZADA', origem: 'CAPTURA', modelo: { in: ['55', '65'] }, storage_key: { not: null } });
    expect(t.wheres[0].data_emissao).toBeTruthy();
    expect(Array.isArray(t.wheres[0].OR)).toBe(true); // a busca da nota (chave, emitente, número)
    await t.service.produtos('E1', { situacao: 'TODAS', modelo: '65' });
    const todas = t.wheres.find((w) => w.modelo === '65')!;
    expect(todas.situacao).toBeUndefined();
  });

  it('recusa o período com notas demais, sem abrir nenhum XML', async () => {
    const muitas = Array.from({ length: MAX_NOTAS_PRODUTOS + 1 }, (_, i) => doc(i + 1));
    const t = montar(muitas);
    await expect(t.service.produtos('E1', {})).rejects.toThrow(/aceita até 2\.000.*Reduza o período/);
    expect(t.storage.getObjectBuffer).not.toHaveBeenCalled();
  });

  it('período sem notas devolve o relatório vazio', async () => {
    const r = await montar([]).service.produtos('E1', {});
    expect(r.resumo).toEqual({ notas: 0, notas_com_falha: 0, itens: 0, valor_total: 0, desconto: 0 });
    expect(r.linhas).toEqual([]);
  });

  it('aceita o XML com BOM e o de NFC-e (mesmo leitor de itens)', async () => {
    const r = await montar([doc(1, { modelo: '65' })], () => String.fromCharCode(0xfeff) + nfeExemplo({ itens: 2 })).service.produtos('E1', {});
    expect(r.resumo.itens).toBe(2);
  });
});

describe('agruparLinhas', () => {
  const linha = (extra: Partial<LinhaProduto>): LinhaProduto => ({
    data_emissao: null, numero: '1', serie: '1', chave: 'A', emitente_nome: 'X', emitente_doc: '1', item: '1', codigo: 'C', descricao: 'ADUBO', ncm: '31052000', cfop: '1102', unidade: 'KG',
    quantidade: 10, valor_unitario: 2, valor_total: 20, desconto: 0, valor_icms: 1, valor_ipi: 0, ...extra,
  });

  it('o mesmo produto com unidades diferentes são dois grupos, e a descrição não depende de maiúscula', () => {
    const g = agruparLinhas([linha({}), linha({ descricao: 'adubo', chave: 'B' }), linha({ unidade: 'SC' })], 'produto');
    expect(g).toHaveLength(2);
    expect(g.find((x) => x.unidade === 'KG')).toMatchObject({ notas: 2, itens: 2, quantidade: 20, valor_total: 40 });
  });

  it('NCM ou CFOP diferentes no mesmo produto aparecem juntos, para a pessoa ver a divergência', () => {
    const g = agruparLinhas([linha({ ncm: '31052000', cfop: '1102' }), linha({ ncm: '31059000', cfop: '2102', chave: 'B' })], 'produto');
    expect(g[0].ncm).toBe('31052000 / 31059000');
    expect(g[0].cfop).toBe('1102 / 2102');
  });

  it('item sem NCM ou CFOP forma o grupo "(sem NCM)"; os números saem arredondados', () => {
    const g = agruparLinhas([linha({ ncm: '', quantidade: 0.1, valor_total: 0.1 }), linha({ ncm: '', quantidade: 0.2, valor_total: 0.2 })], 'ncm');
    expect(g).toHaveLength(1);
    expect(g[0].chave).toBe('(sem NCM)');
    expect(g[0].quantidade).toBe(0.3);
    expect(g[0].valor_total).toBe(0.3);
  });
});
