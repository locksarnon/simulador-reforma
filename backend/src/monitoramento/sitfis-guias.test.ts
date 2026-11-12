import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { SERVICO_POR_CHAVE, completarParametros } from './catalogo';
import { Resposta } from './integra.cliente';
import { extrairArquivos, interpretar } from './interpretar';
import { relatorioSitfis } from './monitoramento.service';

const FIX: Record<string, { status: number; mensagens: unknown[]; dados: string }> = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'demonstracao.json'), 'utf8'));
const resp = (http: number, dados: unknown = null, etag?: string): Resposta => ({ http, status: http, dados, mensagens: [], bruto: '', ...(etag ? { etag } : {}) });

describe('relatório de situação fiscal (SITFIS 2.0)', () => {
  it('usa a versão 2.0 (a 1.0 foi descontinuada em 01/04/2024)', () => {
    expect(SERVICO_POR_CHAVE.get('sitfis')!.versao).toBe('2.0');
  });

  it('pede o protocolo, espera o tempo indicado, trata 202 e 204 (ETag) e devolve o PDF', async () => {
    const esperas: number[] = [];
    const chamar = vi.fn()
      .mockResolvedValueOnce(resp(200, { protocoloRelatorio: 'P1', tempoEspera: 4000 }))
      .mockResolvedValueOnce(resp(202, { tempoEspera: 3000 }))
      .mockResolvedValueOnce(resp(204, null, '"tempoEspera:5000"'))
      .mockResolvedValueOnce(resp(200, { pdf: 'JVBERi0xLjQK' }));
    const r = await relatorioSitfis(chamar, async (ms) => { esperas.push(ms); });
    expect(chamar.mock.calls[0]).toEqual(['SOLICITARPROTOCOLO91', 'Apoiar', '']);
    expect(chamar.mock.calls[1]).toEqual(['RELATORIOSITFIS92', 'Emitir', JSON.stringify({ protocoloRelatorio: 'P1' })]);
    expect(esperas).toEqual([4000, 3000, 5000]);
    expect(r).toMatchObject({ status: 200, dados: { pdf: 'JVBERi0xLjQK' } });
  });

  it('pedido repetido no mesmo dia (304): o protocolo vem no ETag', async () => {
    const chamar = vi.fn().mockResolvedValueOnce(resp(304, null, '"protocoloRelatorio:ABC=="')).mockResolvedValueOnce(resp(200, { pdf: 'JVBERi0x' }));
    await relatorioSitfis(chamar, async () => undefined);
    expect(chamar.mock.calls[1][2]).toBe(JSON.stringify({ protocoloRelatorio: 'ABC==' }));
  });

  it('erro no protocolo volta como veio; demora demais vira aviso claro', async () => {
    const erro = { ...resp(400), mensagens: [{ codigo: 'EI03', texto: 'Requisição inválida. Versão Descontinuada.' }] };
    expect(await relatorioSitfis(vi.fn().mockResolvedValue(erro), async () => undefined)).toBe(erro);
    const sempre = vi.fn().mockResolvedValueOnce(resp(200, { protocoloRelatorio: 'P' })).mockResolvedValue(resp(202, { tempoEspera: 1000 }));
    const r = await relatorioSitfis(sempre, async () => undefined, 3);
    expect(r.mensagens[0].texto).toMatch(/ainda está sendo gerado/);
  });
});

describe('guias em atraso', () => {
  it('DARF da DCTFWeb com data de pagamento vai como DataAcolhimentoProposta (aaaammdd)', () => {
    const s = SERVICO_POR_CHAVE.get('dctfweb-guia')!;
    expect(JSON.parse(s.dados(completarParametros(s, { periodo: '202609', pagamento: '2026-11-20' })))).toEqual({ categoria: 'GERAL_MENSAL', anoPA: '2026', mesPA: '09', DataAcolhimentoProposta: 20261120 });
    expect(JSON.parse(s.dados(completarParametros(s, { periodo: '202609' })))).not.toHaveProperty('DataAcolhimentoProposta');
  });

  it('DAS com data de pagamento vai como dataConsolidacao; DAS em cobrança tem serviço próprio', () => {
    const das = SERVICO_POR_CHAVE.get('das')!;
    expect(JSON.parse(das.dados(completarParametros(das, { periodo: '202608', pagamento: '2026-11-30' })))).toEqual({ periodoApuracao: '202608', dataConsolidacao: '20261130' });
    expect(SERVICO_POR_CHAVE.get('das-cobranca')).toMatchObject({ sistema: 'PGDASD', servico: 'GERARDASCOBRANCA17', endpoint: 'Emitir' });
  });

  it('Sicalc: monta o pedido oficial, recusa entrada errada e lê multa, juros e total', () => {
    const s = SERVICO_POR_CHAVE.get('darf-sicalc')!;
    expect(s).toMatchObject({ sistema: 'SICALC', servico: 'CONSOLIDARGERARDARF51', versao: '2.9' });
    const p = completarParametros(s, { receita: '2089-01', apuracao: '09/2026', vencimento: '2026-10-31', valor: '1.234,56', pagamento: '2026-11-20' });
    expect(JSON.parse(s.dados(p))).toMatchObject({ codigoReceita: '2089', codigoReceitaExtensao: '01', tipoPA: 'ME', dataPA: '09/2026', vencimento: '2026-10-31T00:00:00', valorImposto: '1234.56', dataConsolidacao: '2026-11-20T00:00:00' });
    expect(() => s.dados({ ...p, receita: '2089' })).toThrow(/extensão/);
    expect(() => s.dados({ ...p, apuracao: '2026-09' })).toThrow(/MM\/AAAA/);
    const ex = extrairArquivos(JSON.parse(FIX.CONSOLIDARGERARDARF51.dados), 'darf-sicalc');
    const r = interpretar('SICALC', 'CONSOLIDARGERARDARF51', ex.dados, ex.arquivos);
    expect(ex.arquivos.length).toBe(1);
    expect(r.nivel).toBe('OK');
    expect(r.destaques.map((d) => d.rotulo)).toEqual(expect.arrayContaining(['Principal', 'Multa', 'Juros', 'Total']));
  });
});
