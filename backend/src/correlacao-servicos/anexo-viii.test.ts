import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { lerAnexoVIII, ultimaVersaoNaPagina } from './anexo-viii';
import { CorrelacaoServicosService } from './correlacao-servicos.service';

/** Planilha no layout da v1.02.00 (COD_ATIV_SN no lugar de PS onerosa e Adquirente no exterior), com a aba de regra antes. */
async function planilha(linhas = 120, layout: '1.01' | '1.02' = '1.02') {
  const wb = new ExcelJS.Workbook();
  const regra = wb.addWorksheet('REGRA OP NÃO ONE_EXT');
  regra.addRow(['P/S ONEROSA (S/N)', 'ADQ EXTERIOR (S/N)']);
  const ws = wb.addWorksheet('tabela geral');
  const meio = layout === '1.02' ? ['COD_ATIV_SN', 'DESCRIÇÃO ATIV_SN'] : ['PS ONEROSA? (S/N)', 'ADQ EXTERIOR? (S/N)'];
  ws.addRow(['Item LC 116', 'Descrição Item', 'NBS', 'DESCRIÇÃO NBS', ...meio, 'INDOP', 'Local incidência IBS', 'cClassTrib', 'nome cClassTrib']);
  for (let i = 0; i < linhas; i++) ws.addRow(['01.01', 'Análise e desenvolvimento de sistemas', `1.1502.${String(i).padStart(2, '0')}.00`, 'Serviços de projeto', ...(layout === '1.02' ? ['9', 'Prestação de serviços'] : ['S', 'N']), '100301', 'Domicílio principal do adquirente', '000001', 'Tributação integral']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Anexo VIII da NFS-e', () => {
  it('lê a v1.02.00 (atividade do Simples) e a v1.01.00 (PS onerosa e adquirente no exterior)', async () => {
    const n = await lerAnexoVIII(await planilha(), 'Anexo VIII RTC v1.2.00');
    expect(n).toHaveLength(120);
    expect(n[0]).toMatchObject({ item_lc116: '01.01', nbs: '1.1502.00.00', cod_ativ_sn: '9', descricao_ativ_sn: 'Prestação de serviços', ind_op: '100301', c_class_trib: '000001', ps_onerosa: null });
    const v = await lerAnexoVIII(await planilha(120, '1.01'), 'x');
    expect(v[0]).toMatchObject({ ps_onerosa: 'S', adq_exterior: 'N', cod_ativ_sn: null });
  });

  it('recusa planilha curta ou sem o layout: nada é trocado', async () => {
    await expect(lerAnexoVIII(await planilha(10), 'x')).rejects.toThrow('só 10 linhas');
    const wb = new ExcelJS.Workbook(); wb.addWorksheet('a').addRow(['outra coisa']);
    await expect(lerAnexoVIII(Buffer.from(await wb.xlsx.writeBuffer()), 'x')).rejects.toThrow('não reconhecido');
  });

  it('acha a versão mais nova na página oficial, mesmo com o nome do arquivo mudando', () => {
    const html = `<a href="https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-00-00.xlsx">v1</a>
      <a href="https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexo_viii-tabela-correlacao-v01-02-00-20261026.xlsx">v1.02</a>
      <a href="https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-01-00.xlsx">v1.01</a>
      <a href="https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexovii-indop_ibscbs_v1-03-00-nt009.xlsx">anexo VII</a>`;
    expect(ultimaVersaoNaPagina(html)).toEqual({ url: 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexo_viii-tabela-correlacao-v01-02-00-20261026.xlsx', versao: '1.02.00' });
    expect(ultimaVersaoNaPagina('<a href="x.pdf">nada</a>')).toBeNull();
  });

  it('carrega a versão nova, não recarrega a mesma e registra o erro sem apagar a tabela', async () => {
    const tabela: unknown[] = [];
    const params = new Map<string, string>();
    const prisma = {
      parametroSistema: { findUnique: async ({ where }: { where: { chave: string } }) => (params.has(where.chave) ? { valor: params.get(where.chave)! } : null), upsert: async ({ where, create, update }: { where: { chave: string }; create: { valor: string }; update: { valor: string } }) => { params.set(where.chave, params.has(where.chave) ? update.valor : create.valor); } },
      correlacaoServico: { count: async () => tabela.length },
      $transaction: async (fn: (tx: unknown) => Promise<void>) => fn({ correlacaoServico: { deleteMany: async () => { tabela.length = 0; }, createMany: async ({ data }: { data: unknown[] }) => { tabela.push(...data); } } }),
    };
    const s = new CorrelacaoServicosService(prisma as never);
    const xlsx = await planilha();
    const pagina = '<a href="/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexo_viii-tabela-correlacao-v01-02-00-20261026.xlsx">x</a>';
    const baixar = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      expect(init?.headers?.['User-Agent']).toBeTruthy();
      return url.endsWith('.xlsx') ? new Response(xlsx) : new Response(pagina);
    });
    const r = await s.atualizar(false, baixar as never);
    expect(r).toMatchObject({ mudou: true, versao: '1.02.00', linhas: 120 });
    expect((await s.atualizar(false, baixar as never)).mudou).toBe(false);
    expect(baixar).toHaveBeenCalledTimes(3);
    await expect(s.atualizar(false, (async () => new Response('fora', { status: 403 })) as never)).rejects.toThrow('indisponível (403)');
    expect(await s.situacao()).toMatchObject({ linhas: 120, versao: '1.02.00', erro: expect.stringContaining('403') });
  });
});
