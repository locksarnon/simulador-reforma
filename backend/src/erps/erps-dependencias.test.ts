import ExcelJS from 'exceljs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it, vi } from 'vitest';
import { PdfService } from '../pdf/pdf.service';
import { AnalisarIaService } from '../ia-consultoria/analisar-ia.service';
import { montarPromptRascunho, type ContextoProjeto } from '../ia-consultoria/contexto';
import { ROTEIROS } from '../ia-consultoria/roteiros';
import { criarPrismaFalso } from '../saneamento-estoques/dados/prisma-falso';
import { SanCasosService } from '../saneamento-estoques/dados/casos.service';
import { SanProjetoService } from '../saneamento-estoques/dados/projeto.service';
import { SanVersoesService } from '../saneamento-estoques/dados/versoes.service';
import { EntregaveisService } from '../saneamento-estoques/entregaveis/entregaveis.service';
import { dadosBase, itensTabela } from '../saneamento-estoques/entregaveis/__fixtures__/dados';
import { ParecerIaService } from '../saneamento-estoques/ia/parecer-ia.service';
import { montarPrompt } from '../saneamento-estoques/ia/parecer';
import { CARGA_ERPS, idDoItemDaCarga } from './carga';
import { nomeDoErp } from './erps.service';
import { A_CONFIRMAR, acaoNoErp, associarErp, erpParaIa, REGRA_ERP_IA, semSufixos, type ErpBasico, type PerfilErp } from './logica';

/** Dependências do Cadastro de ERPs: cada serviço que mostra o ERP ou depende dele se serve do cadastro. */

const sementesErp = () => ({
  erp: CARGA_ERPS.map((e) => ({ id: e.id, nome: e.nome, fabricante: e.fabricante, produto: e.produto ?? null, versoes: e.versoes, situacao: e.situacao, ativo: true })),
  erpConhecimento: CARGA_ERPS.flatMap((e) => e.itens.map((i, ordem) => ({ id: idDoItemDaCarga(e.id, i.k), erp_id: e.id, tipo: i.tipo, tipo_ajuste: i.tipo_ajuste ?? null, chave: i.chave, texto: i.texto, campo_erp: i.campo_erp ?? null, fonte_url: i.fonte_url, grau: i.grau, ordem, ativo: true }))),
});
const perfil = (id: string): PerfilErp => {
  const s = sementesErp();
  const e = s.erp.find((x) => x.id === id)!;
  return { ...e, itens: s.erpConhecimento.filter((i) => i.erp_id === id) } as PerfilErp;
};
/** A lista como /erps devolve (com os apelidos do item "Apelidos do nome"). */
const LISTA: ErpBasico[] = CARGA_ERPS.map((e) => ({ id: e.id, nome: e.nome, fabricante: e.fabricante, produto: e.produto ?? null, ativo: true, apelidos: e.itens.filter((i) => i.chave === 'Apelidos do nome').flatMap((i) => i.texto.split(';').map((s) => s.trim())) }));
const item = (k: string, erp = 'erp-sap-b1') => CARGA_ERPS.find((e) => e.id === erp)!.itens.find((i) => i.k === k)!;

describe('graus da carga do SAP B1 (só o confirmado fica como confirmado)', () => {
  it('fusão: a ausência de documentação não confirma; só a parte do OWTR é confirmada', () => {
    expect(item('r-fusao').grau).toBe('NAO_CONFIRMADO');
    expect(item('r-owtr')).toMatchObject({ grau: 'CONFIRMADO', campo_erp: 'OWTR' });
  });
  it('NCM: o campo da linha é confirmado; "documentos emitidos mantêm o NCM antigo" é consequência provável, não confirmada', () => {
    expect(item('r-ncm').grau).toBe('CONFIRMADO');
    expect(item('r-ncm').texto).not.toMatch(/mantêm o NCM antigo/);
    expect(item('r-ncm-emitidos')).toMatchObject({ grau: 'NAO_CONFIRMADO' });
  });
  it('gravação via DI API/DTW oItems não confirmada; inativar sem a condição de prudência (que fica na restrição não confirmada)', () => {
    expect(item('a-cadastro').grau).toBe('NAO_CONFIRMADO');
    expect(item('a-inativar')).toMatchObject({ grau: 'CONFIRMADO', texto: 'Inativar {sai} no cadastro (frozenFor = Y)' });
    expect(item('r-inativar-antes').grau).toBe('NAO_CONFIRMADO');
  });
  it('unificação sem "pelo custo médio" (pista da Community vira restrição não confirmada); lote só na versão 9.0; UdM com a fonte certa', () => {
    expect(item('a-unificar').texto).not.toMatch(/custo médio/);
    expect(item('r-custo-entrada')).toMatchObject({ grau: 'NAO_CONFIRMADO' });
    expect(item('r-custo-entrada').fonte_url).toMatch(/^https:\/\/answers\.sap\.com\//);
    expect(item('r-lote').texto).toMatch(/versão 9\.0/);
    expect(item('r-udm-grupo-docs')).toMatchObject({ grau: 'CONFIRMADO', fonte_url: 'https://learning.sap.com/courses/managing-logistics-in-sap-business-one/working-with-units-of-measure-uom-in-sap-business-one' });
    expect(item('r-udm-grupo').fonte_url).toMatch(/knowledge\/en\/3642762$/);
  });
  it('Ação no ERP não confirmada sai marcada "(a confirmar no ERP)"; a confirmada, não', () => {
    const sap = perfil('erp-sap-b1');
    expect(acaoNoErp(sap, 'MUDOU_NCM')).toBe(`Atualizar o cadastro do item (DI API Items ou DTW oItems) ${A_CONFIRMAR}`);
    expect(acaoNoErp(sap, 'INATIVOU', { sai: '9' })).toBe('Inativar 9 no cadastro (frozenFor = Y)');
  });
});

describe('conhecimento do PIMS migrado para o Cadastro de ERPs (TOTVS Protheus)', () => {
  it('os 3 itens PIMS Multicultivos ficam no Protheus, com fonte, revisão da fonte, data de conferência e grau', () => {
    for (const k of ['pims-codigo-erp', 'pims-campos-item', 'pims-vinculos']) {
      const i = item(k, 'erp-totvs-protheus');
      expect(i.chave).toMatch(/^PIMS Multicultivos · /);
      expect(i.texto).toMatch(/Revisão da fonte: Documento legado, atualizado em 18\/04\/2018\. Conferido em 16\/10\/2026\.$/);
      expect(i).toMatchObject({ tipo: 'OBSERVACAO', fonte_url: 'https://tdn.totvs.com/pages/viewpage.action?pageId=351372629', grau: 'CONFIRMADO' });
    }
  });
});

describe('associação do texto antigo: siglas, versão e banco', () => {
  const casos: [string, string | null][] = [
    ['SAP B1', 'erp-sap-b1'], ['sap business one 10', 'erp-sap-b1'], ['SBO', 'erp-sap-b1'], ['SAP Business One 10.0 HANA', 'erp-sap-b1'], ['B1', 'erp-sap-b1'],
    ['Protheus 12', 'erp-totvs-protheus'], ['TOTVS Protheus', 'erp-totvs-protheus'], ['Protheus 12.1.2510', 'erp-totvs-protheus'], ['P12', 'erp-totvs-protheus'],
    ['Siagri', 'erp-aliare-siagri'], ['Siagri 9.6.0.0', 'erp-aliare-siagri'],
    ['Sankhya', null], ['TOTVS', null], ['Aliare', null], ['SAP', null],
  ];
  it('servidor', () => {
    for (const [t, id] of casos) expect(associarErp(t, LISTA)?.id ?? null, t).toBe(id);
    expect(semSufixos('sap business one 10 0 sql server')).toBe('sap business one');
  });
  it('a tela (src/lib/erps.js) associa igual ao servidor', async () => {
    const tela = (await import(pathToFileURL(join(__dirname, '../../../src/lib/erps.js')).href)) as { associarErp: (t: string, l: unknown[]) => { id: string } | null };
    for (const [t, id] of casos) expect(tela.associarErp(t, LISTA)?.id ?? null, t).toBe(id);
  });
  it('apelido repetido em dois ERPs não associa (ambíguo)', () => {
    const l = [...LISTA, { id: 'x', nome: 'Outro B1', fabricante: 'X', ativo: true, apelidos: ['B1'] }];
    expect(associarErp('B1', l)).toBeNull();
    expect(associarErp('SAP B1', l)?.id).toBe('erp-sap-b1');
  });
});

describe('nome do ERP nos entregáveis e na foto da versão', () => {
  const montarEntrega = (projeto: Record<string, unknown>) => {
    const base = dadosBase(false);
    const { prisma, db } = criarPrismaFalso({
      ...sementesErp(),
      empresa: [{ id: 'E1', razao_social: 'Agropecuária Teste Ltda', cnpj_cpf: '00000000000100' }],
      projetoDiagnostico: [{ id: 'D1', nome: 'Saneamento 2026' }],
      sanProjeto: [{ id: 'P1', diagnostico_id: 'D1', empresa_id: 'E1', data_base: new Date('2026-12-31T00:00:00Z'), erp: 'SAP B1 digitado', erp_id: 'erp-sap-b1', erp_versao: '10.0', estabelecimentos: [], modulos: { conciliacao: false }, versao: 1, ...projeto }],
      sanItem: itensTabela().map((i) => ({ ...i, createdAt: new Date('2026-11-01T00:00:00Z') })),
      sanCelula: base.celulas.map((c, k) => ({ id: `ce${k}`, projeto_id: 'P1', ...c })),
      sanCaso: base.casos.map((c) => ({ ...c, chave: String(c.id), createdAt: new Date('2026-11-09T12:00:00Z') })),
      sanDecisao: base.decisoes, sanImpactoSped: base.impactosSped, sanVinculoCodigo: base.vinculos, sanImportacao: base.importacoes,
    });
    const versoes = new SanVersoesService(prisma as never);
    return { prisma, db, versoes, s: new EntregaveisService(new PdfService(), versoes, prisma as never) };
  };
  const resumo = async (buf: Buffer) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as never); return wb; };
  const textoDe = (ws: ExcelJS.Worksheet) => { const t: string[] = []; ws.eachRow((r) => r.eachCell((c) => t.push(String(c.value ?? '')))); return t.join('\n'); };

  it('a foto liberada guarda erp_id e o nome do cadastro; o Excel liberado mostra o nome + versão e a Ação no ERP do perfil', async () => {
    const m = montarEntrega({});
    const v = await m.versoes.criar('P1', { rotulo: 'Entrega 1' }, { email: 'ana@fal.test' });
    const d = await m.s.dados('P1', v.id);
    expect(d.projeto).toMatchObject({ erp_id: 'erp-sap-b1', erp_nome: 'SAP Business One', erp: 'SAP B1 digitado' });
    expect(d.perfilErp?.id).toBe('erp-sap-b1');
    const wb = await resumo((await m.s.excel('P1', v.id)).buffer);
    expect(textoDe(wb.getWorksheet('Resumo da entrega')!)).toContain('SAP Business One 10.0');
    expect(textoDe(wb.getWorksheet('De para e equivalências')!)).toMatch(/Saída de mercadoria \(OIGE\) de 000456/);
  });

  it('PDF da versão liberada traz "Particularidades do ERP" com o texto que avisa dos não confirmados', async () => {
    const m = montarEntrega({});
    const v = await m.versoes.criar('P1', { rotulo: 'Entrega 1' }, { email: 'ana@fal.test' });
    const doc = (await import('../saneamento-estoques/entregaveis/relatorio')).montarRelatorio(await m.s.dados('P1', v.id));
    const sec = doc.secoes.find((x) => x.titulo === 'Anexo: particularidades do ERP SAP Business One');
    expect(sec).toBeTruthy();
    expect(sec!.paragrafos![0]).toMatch(/"Não confirmado" = sem fonte oficial/);
    expect((await m.s.relatorio('P1', v.id)).buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('foto antiga (sem erp_id): vale o ERP atual do projeto', async () => {
    const m = montarEntrega({});
    const v = await m.versoes.criar('P1', { rotulo: 'Entrega 1' }, { email: 'ana@fal.test' });
    // Simula a foto gravada antes do Cadastro de ERPs: sem erp_id nem erp_nome.
    const original = m.versoes.exportar.bind(m.versoes);
    m.versoes.exportar = async (...a: Parameters<typeof original>) => { const r = await original(...a); const { erp_id: _i, erp_nome: _n, ...p } = r.projeto as Record<string, unknown>; return { ...r, projeto: p }; };
    const d = await m.s.dados('P1', v.id);
    expect(d.projeto.erp_id).toBeUndefined();
    expect(d.perfilErp?.id).toBe('erp-sap-b1');
    const wb = await resumo((await m.s.excel('P1', v.id)).buffer);
    expect(textoDe(wb.getWorksheet('Resumo da entrega')!)).toContain('SAP Business One 10.0');
  });

  it('exportação para revisão (base atual) também usa o nome do cadastro', async () => {
    const m = montarEntrega({});
    const d = await m.s.dados('P1');
    expect(d.projeto).toMatchObject({ erp_id: 'erp-sap-b1', erp_nome: 'SAP Business One' });
  });

  it('nomeDoErp: cadastro pelo erp_id; sem vínculo, o texto antigo; sem nada, null', async () => {
    const { prisma } = criarPrismaFalso(sementesErp());
    expect(await nomeDoErp(prisma, 'erp-totvs-protheus', 'Protheus')).toBe('TOTVS Protheus');
    expect(await nomeDoErp(prisma, null, ' Sankhya ')).toBe('Sankhya');
    expect(await nomeDoErp({}, 'erp-sap-b1', 'SAP B1')).toBe('SAP B1');
    expect(await nomeDoErp(prisma, null, null)).toBeNull();
  });
});

describe('IA: o ERP do cliente vem do Cadastro de ERPs', () => {
  it('erpParaIa: só restrições e ações; confirmados × a confirmar; filtro por tipo de ajuste; sem perfil, só regras gerais', () => {
    const x = erpParaIa(perfil('erp-sap-b1'), { versao: '10.0', tipos: ['CONSOLIDOU_INATIVOU'] })!;
    expect(x).toMatchObject({ nome: 'SAP Business One', versao: '10.0', origem: 'Cadastro de ERPs do InTAX', perfil: 'completo' });
    expect(x.confirmados.map((i) => i.rotulo)).toContain('Transferência de estoque (OWTR)');
    expect(x.aConfirmar.map((i) => i.rotulo)).toEqual(expect.arrayContaining(['Fusão de itens não documentada', 'Custo da entrada na unificação']));
    expect([...x.confirmados, ...x.aConfirmar].every((i) => !i.tipoDeAjuste || i.tipoDeAjuste === 'CONSOLIDOU_INATIVOU')).toBe(true);
    expect([...x.confirmados, ...x.aConfirmar].every((i) => ['restrição', 'ação no ERP'].includes(i.tipo))).toBe(true);
    expect(erpParaIa(perfil('erp-outro'))).toMatchObject({ perfil: expect.stringMatching(/regras gerais/), confirmados: [], aConfirmar: [] });
    expect(erpParaIa(null, { nome: 'Sankhya' })).toMatchObject({ nome: 'Sankhya', perfil: expect.stringMatching(/sem perfil/) });
    expect(erpParaIa(null)).toBeNull();
  });

  it('Analisar com IA: o prompt leva o ERP e a regra de não contrariar o que é confirmado', () => {
    const ctx: ContextoProjeto = {
      servico: { id: 'pj-homologacao', nome: 'Homologação fiscal do ERP para IBS/CBS', area: 'Reforma', publico: 'PJ' },
      referencia: { tipo: 'período', de: '2026-01-01', ate: '2026-06-30' }, situacaoDoProjeto: 'EM_ANDAMENTO', qtdClientes: 1, clientes: [{ tipo: 'Pessoa jurídica' }],
      documentos: { total: 0, porSituacao: {}, abertos: [] }, achados: [], erps: [erpParaIa(perfil('erp-sap-b1'))!],
    };
    const p = montarPromptRascunho(ctx, ROTEIROS['pj-homologacao']);
    expect(p).toContain(REGRA_ERP_IA);
    expect(p).toContain('"erpDoCliente"');
    expect(p).toContain('Cadastro de ERPs do InTAX');
    expect(p).toContain('"aConfirmar"');
    expect(montarPromptRascunho({ ...ctx, erps: [] }, ROTEIROS['pj-homologacao'])).not.toContain('erpDoCliente');
  });

  it('Analisar com IA (serviço): monta o ERP do cliente pelo erp_id', async () => {
    const { prisma } = criarPrismaFalso(sementesErp());
    const p = prisma as Record<string, unknown>;
    p.projetoDiagnostico = { findUnique: vi.fn(async () => ({ id: 'D1', servico_consultoria: 'pj-homologacao', empresa_ids: ['E1'], pessoa_fisica_id: null, periodo_inicio: new Date('2026-01-01'), periodo_fim: new Date('2026-06-30'), situacao: 'EM_ANDAMENTO' })) };
    p.empresa = { findMany: vi.fn(async () => [{ id: 'E1', erp: 'SAP B1', erp_id: 'erp-sap-b1', erp_versao: '10.0' }, { id: 'E2', erp: 'Sankhya', erp_id: null, erp_versao: null }]) };
    p.controleDocumentoConsultoria = { findMany: vi.fn(async () => []) };
    p.sanProjeto = { findUnique: vi.fn(async () => null) }; p.sanCaso = { groupBy: vi.fn(async () => []) };
    p.auditoriaIbsCbs = { findMany: vi.fn(async () => []) };
    const s = new AnalisarIaService(prisma as never, {} as never);
    const ctx = await s.montarContexto('D1');
    expect(ctx.erps?.map((e) => [e.nome, e.perfil])).toEqual([['SAP Business One', 'completo'], ['Sankhya', expect.stringMatching(/sem perfil/)]]);
  });

  it('parecer do saneamento: o prompt leva as restrições do ERP para os tipos de ajuste do caso', async () => {
    const { prisma } = criarPrismaFalso({ ...sementesErp(), sanProjeto: [{ id: 'P1', erp: 'SAP B1', erp_id: 'erp-sap-b1', erp_versao: '10.0' }] });
    const respostas: string[] = [];
    const base = { iaConfigurada: () => true, ia: vi.fn(async (pr: string) => { respostas.push(pr); return JSON.stringify({ recomendacao: 'Conferir', confianca: 'BAIXA', aFavor: [], contra: [], confirmar: [], fontes: [] }); }), iaComBusca: vi.fn(), modeloAtual: () => 'm', candidatos: vi.fn(async () => []) };
    const servico = new ParecerIaService(prisma as never, new SanCasosService(prisma as never, new SanProjetoService(prisma as never)), base as never);
    await prisma.sanItem.create({ data: { id: 'i1', projeto_id: 'P1', codigo: 'i1', estabelecimento: '', conjunto_chave: '31051000|REVENDA', descricao: 'i1', trabalho: { descricao: 'i1' }, original: {}, linha: 1, importacao_id: 'I' } });
    const c = await prisma.sanCaso.create({ data: { projeto_id: 'P1', camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_INDICACAO_POSSIVEL', chave: 'k1', itens: ['i1'], problema: 'Duplicidade possível', evidencia: [], atual: {}, proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: 'A', consolidar: 'B' }, justificativa: 'x', situacao: 'PROPOSTO', versao: 1 } });
    await servico.gerar(String(c.id));
    const prompt = String(base.ia.mock.calls[0]?.[0] ?? '');
    expect(prompt).toContain(REGRA_ERP_IA);
    expect(prompt).toContain('Transferência de estoque (OWTR)');
  });

  it('montarPrompt do parecer sem ERP não leva a regra', () => {
    const e = { caso: { camada: 'DUPLICIDADE', tipo: 'X', problema: 'p', evidencia: [], atual: {}, proposta: {}, justificativa: '', fundamento: null }, borda: { codigo: 'DUPLICIDADE_MISTA', motivo: 'm' }, atividades: [], precedentes: [], leis: [], comBusca: false } as never;
    expect(montarPrompt(e)).not.toContain('erpDoCliente');
    expect(montarPrompt({ ...(e as object), erp: erpParaIa(perfil('erp-sap-b1')) } as never)).toContain('erpDoCliente');
  });
});
