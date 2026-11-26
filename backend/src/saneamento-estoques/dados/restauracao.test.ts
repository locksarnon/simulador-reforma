/** "Continuar a partir desta versão": prévia, restauração com histórico, casos reabertos e SPED, conflito, desfazer e 30 mil itens (Prisma em memória). */
import { describe, expect, it, vi } from 'vitest';
import type { CasoProposto, ResultadoCamada } from '../tipos';
import { SanCasosService } from './casos.service';
import { SanImportacaoService } from './importacao.service';
import { type ImportadorPort, type ItemImportado } from './portas';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';
import { camadasDosCampos, diferencasDoTrabalho, gravarItensEmBloco, SanRestauracaoService, type LinhaItem } from './restauracao.service';
import { SanVersoesService } from './versoes.service';

const USER = { email: 'consultor@fal.test' };
const OUTRO = { email: 'revisor@fal.test' };
const ARQ = { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' };
const JUST = 'Cliente pediu voltar à entrega 1 para reavaliar o NCM.';
const item = (codigo: string, extra: Partial<ItemImportado> = {}, linha = 1): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo: 'Adubos', ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha, ...extra,
});
const status = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() ?? 500; } };
const codigo = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return ((e as { response?: { codigo?: string } }).response?.codigo) ?? 'SEM_CODIGO'; } };

function montar() {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', erp: 'SAP', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const fila: { itens: ItemImportado[] } = { itens: [] };
  const importador: ImportadorPort = { ler: async () => ({ itens: fila.itens, mapeamento: {}, relatorio: { aceitas: fila.itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const importacao = new SanImportacaoService(prisma as never, projetos, importador);
  const versoes = new SanVersoesService(prisma as never);
  return { prisma, db, fila, projetos, casos, importacao, versoes, restauracao: new SanRestauracaoService(prisma as never, versoes, projetos) };
}
type Ctx = ReturnType<typeof montar>;
const versaoProjeto = (c: Ctx) => c.db.sanProjeto[0].versao as number;
const trabalho = (c: Ctx, cod: string) => c.db.sanItem.find((i) => i.codigo === cod)!.trabalho;
const celula = (c: Ctx, cod: string, camada: string) => c.db.sanCelula.find((x) => x.item_id === c.db.sanItem.find((i) => i.codigo === cod)!.id && x.camada === camada)!;
const caso = (c: Ctx, id: string) => c.db.sanCaso.find((x) => x.id === id)!;
const umCaso = (camada: CasoProposto['camada'], tipo: string, itens: string[], atual: Record<string, unknown>, proposta: Record<string, unknown>, afeta: CasoProposto['afeta'] = []): CasoProposto => ({
  camada, tipo, itens, problema: 'Problema', evidencia: [], atual, proposta, justificativa: 'Motivo', fundamento: 'Fonte', impactos: [], origem: 'REGRA', afeta,
});
const resultado = (camada: ResultadoCamada['camada'], casos: CasoProposto[]): ResultadoCamada => ({ camada, analisados: 2, semDados: null, semProblema: [], casos });
async function restaurar(c: Ctx, projetoId: string, versaoId: string, usuario = USER) {
  const p = await c.restauracao.previa(projetoId, versaoId);
  return { p, r: await c.restauracao.continuar(projetoId, versaoId, { versao: p.versaoProjeto, previa: p.previa, justificativa: JUST }, usuario) };
}

/** Versão 1 com NCM 31010000; depois dela, um caso de NCM aprovado muda o item 00123 para 31051000. */
async function cenario(c: Ctx) {
  const p = await c.projetos.criar('D1', USER);
  await c.projetos.confirmarAtividades(p.id, 1, USER);
  c.fila.itens = [item('00123', {}, 1), item('00124', {}, 2)];
  await c.importacao.confirmar(p.id, ARQ, undefined, [], USER);
  const ids = Object.fromEntries(c.db.sanItem.map((i) => [i.codigo, i.id])) as Record<string, string>;
  celula(c, '00123', 'TRIBUTARIO').situacao = 'SEM_PROBLEMA'; // camada já trabalhada: deve voltar a "revisar"
  const v1 = await c.versoes.criar(p.id, { rotulo: 'Entrega 1' }, USER);
  await c.casos.registrarResultado(p.id, resultado('NCM', [umCaso('NCM', 'NCM_INCOERENTE', [ids['00123']], { ncm: '31010000' }, { ncm: '31051000' }, ['TRIBUTARIO'])]));
  const casoId = c.db.sanCaso[0].id as string;
  await c.casos.aprovar(casoId, { versao: 1 }, USER);
  celula(c, '00123', 'TRIBUTARIO').revisar = false; // conferido de novo depois da aprovação
  return { projetoId: p.id, v1, ids, casoId };
}

describe('regras puras', () => {
  it('diferenças usam o nome do campo das decisões: topo pelo nome, extra pelo nome e "campos.x" quando repete um de topo', () => {
    const d = diferencasDoTrabalho(
      { codigo: 'A', ncm: '1', estabelecimento: 'X', campos: { cClassTrib: '000001', ncm: 'velho', cor: 'azul' } },
      { codigo: 'A', ncm: '2', estabelecimento: 'Y', campos: { cClassTrib: '000001', ncm: 'novo' } },
    );
    expect(d).toEqual([{ campo: 'ncm', antes: '1', depois: '2' }, { campo: 'cor', antes: 'azul', depois: null }, { campo: 'campos.ncm', antes: 'velho', depois: 'novo' }]);
  });

  it('dependências pela regra da aprovação (camadasAfetadas, com NCM → tributário → obrigações)', () => {
    expect(camadasDosCampos(['ncm'])).toEqual(['TRIBUTARIO', 'OBRIGACOES']);
    expect(camadasDosCampos(['descricao'])).toEqual(['NCM', 'TRIBUTARIO', 'OBRIGACOES']);
    expect(camadasDosCampos(['unidade'])).toEqual(['DUPLICIDADE', 'OBRIGACOES']);
    expect(camadasDosCampos(['saldo'])).toEqual([]);
  });

  it('gravação em bloco no Postgres: um UPDATE por 1000 itens, conferindo a versão de cada um; bloco incompleto = 409 e nada fica', async () => {
    const linhas: LinhaItem[] = Array.from({ length: 30_000 }, (_, n) => ({ id: `i${n}`, versao: 2, codigo: String(n), trabalho: { descricao: `P${n}`, ncm: '31010000', grupo: 'G', campos: {} } }));
    const executeRaw = vi.fn(async (sql: { sql: string; values: unknown[] }) => (JSON.parse(String(sql.values[0])) as unknown[]).length);
    const tx = { $executeRaw: executeRaw, sanItem: { updateMany: vi.fn() } };
    await gravarItensEmBloco(tx as never, 'P1', linhas, (c) => `Item ${c}`);
    expect(executeRaw).toHaveBeenCalledTimes(30);
    expect(tx.sanItem.updateMany).not.toHaveBeenCalled();
    const primeiro = executeRaw.mock.calls[0][0];
    expect(primeiro.sql).toContain('i."versao" = v.versao');
    expect(primeiro.sql).toContain('"versao" = i."versao" + 1');
    expect(JSON.parse(String(primeiro.values[0]))[0]).toMatchObject({ id: 'i0', versao: 2, descricao: 'P0', grupo: 'G' });
    const falha = { $executeRaw: vi.fn(async () => 999), sanItem: { updateMany: vi.fn() } };
    expect(await codigo(gravarItensEmBloco(falha as never, 'P1', linhas.slice(0, 1000), (c) => `Item ${c}`))).toBe('CONFLITO_VERSAO');
  });
});

describe('continuar a partir de uma versão liberada', () => {
  it('prévia mostra itens, campos, casos reabertos e camadas que ficam "revisar", sem gravar nada', async () => {
    const c = montar();
    const { projetoId, v1, casoId } = await cenario(c);
    const decisoes = c.db.sanDecisao.length;
    const p = await c.restauracao.previa(projetoId, v1.id);
    expect(p.totais).toEqual({ itens: 1, campos: 1, itensNaFoto: 2, itensNovosDepois: 0, itensAusentes: 0, casosDecididosDepois: 1 });
    expect(p.porCampo).toEqual([{ campo: 'ncm', itens: 1 }]);
    expect(p.camadasRevisar).toEqual(['OBRIGACOES', 'TRIBUTARIO']);
    expect(p.casosReabertos).toEqual([{ id: casoId, camada: 'NCM' }]);
    expect(p.amostra[0]).toMatchObject({ codigo: '00123', campos: [{ campo: 'ncm', antes: '31051000', depois: '31010000' }] });
    expect(p.versaoProjeto).toBe(versaoProjeto(c));
    expect(c.db.sanDecisao.length).toBe(decisoes);
    expect(trabalho(c, '00123').ncm).toBe('31051000');
  });

  it('restaura com uma decisão por campo; o caso aprovado depois volta a proposto (célula e SPED coerentes) e pode ser rejeitado', async () => {
    const c = montar();
    const { projetoId, v1, ids, casoId } = await cenario(c);
    const p = await c.restauracao.previa(projetoId, v1.id);
    expect(await codigo(c.restauracao.continuar(projetoId, v1.id, { versao: p.versaoProjeto, previa: p.previa, justificativa: 'curta' }, USER))).toBe('JUSTIFICATIVA_CURTA');
    expect(await status(c.restauracao.continuar(projetoId, v1.id, { versao: p.versaoProjeto, justificativa: JUST }, USER))).toBe(400);
    const aprovacoes = c.db.sanDecisao.filter((d) => d.tipo === 'aprovar').length;
    const impactosAntes = c.db.sanImpactoSped.filter((l) => l.caso_id === casoId).length;
    expect(impactosAntes).toBeGreaterThan(0);
    const r = await c.restauracao.continuar(projetoId, v1.id, { versao: p.versaoProjeto, previa: p.previa, justificativa: JUST }, USER);
    expect(r).toMatchObject({ itens: 1, campos: 1, casosDecididosDepois: 1 });
    expect(trabalho(c, '00123').ncm).toBe('31010000');
    // Histórico: a restauração entra por cima, com id estruturado; a aprovação continua lá.
    const hist = await c.casos.historico(ids['00123'], 'ncm');
    expect(hist[0]).toMatchObject({ tipo: 'restaurar', antes: '31051000', depois: '31010000', usuario: USER.email, caso_id: null });
    expect(hist[0].id).toBe(`rst-${r.restauracao.id}-1`);
    expect(hist[0].fundamento).toBe(`Restauração da versão 1 (Entrega 1): ${JUST}`);
    expect(c.db.sanDecisao.filter((d) => d.tipo === 'aprovar').length).toBe(aprovacoes);
    // O caso deixa de dizer que o NCM é 31051000: volta a proposto, a célula também, e o impacto é regravado pela situação nova.
    expect(caso(c, casoId)).toMatchObject({ situacao: 'PROPOSTO', decidido_por: null, decidido_em: null });
    expect(celula(c, '00123', 'NCM').situacao).toBe('PROPOSTO');
    expect(c.db.sanImpactoSped.filter((l) => l.caso_id === casoId)).toHaveLength(impactosAntes);
    const entrega = await c.versoes.exportarAtual(projetoId);
    expect(entrega.casos.find((x) => x.id === casoId)).toMatchObject({ situacao: 'PROPOSTO' });
    expect(celula(c, '00123', 'TRIBUTARIO')).toMatchObject({ situacao: 'SEM_PROBLEMA', revisar: true });
    expect(celula(c, '00123', 'TRIBUTARIO').revisar_causa).toContain('versão 1');
    expect(celula(c, '00124', 'TRIBUTARIO').revisar).toBe(false);
    const [v] = await c.versoes.listar(projetoId);
    expect((v.resumo as { restauracoes: unknown[] }).restauracoes).toEqual([expect.objectContaining({ usuario: USER.email, justificativa: JUST, itens: 1, campos: 1, desfeita: null, casos: [expect.objectContaining({ id: casoId, decidido_por: USER.email })] })]);
    expect(versaoProjeto(c)).toBe(p.versaoProjeto + 1);
    expect((await c.versoes.exportar(projetoId, v1.id)).itens.find((i) => i.codigo === '00123')!.trabalho).toMatchObject({ ncm: '31010000' }); // a foto não muda
    // Coerente: reabrir não dá 409 e rejeitar funciona sem reabrir antes.
    expect(await c.casos.reabrir(casoId, { versao: caso(c, casoId).versao }, USER)).toMatchObject({ situacao: 'PROPOSTO' });
    await c.casos.rejeitar(casoId, { versao: caso(c, casoId).versao, justificativa: 'Mantém o NCM da entrega 1' }, USER);
    expect(caso(c, casoId).situacao).toBe('REJEITADO');
    const p2 = await c.restauracao.previa(projetoId, v1.id);
    expect(p2.totais.itens).toBe(0);
    expect(await codigo(c.restauracao.continuar(projetoId, v1.id, { versao: p2.versaoProjeto, previa: p2.previa, justificativa: JUST }, USER))).toBe('NADA_A_RESTAURAR');
  });

  it('casos decididos depois: só conta decisão de aplicação vigente (rejeitar e desfazer ficam de fora)', async () => {
    const c = montar();
    const { projetoId, v1, ids } = await cenario(c);
    await c.casos.registrarResultado(projetoId, resultado('TRIBUTARIO', [umCaso('TRIBUTARIO', 'NCM_OUTRO', [ids['00123']], { ncm: '31051000' }, { ncm: '31059000' })]));
    const rejeitado = c.db.sanCaso.find((x) => x.tipo === 'NCM_OUTRO')!;
    await c.casos.rejeitar(rejeitado.id, { versao: rejeitado.versao, justificativa: 'Não procede' }, USER);
    await c.casos.registrarResultado(projetoId, resultado('QUALIDADE', [umCaso('QUALIDADE', 'DESCRICAO', [ids['00124']], { descricao: 'Produto 00124' }, { descricao: 'PRODUTO 00124' })]));
    const desfeito = c.db.sanCaso.find((x) => x.tipo === 'DESCRICAO')!;
    await c.casos.aprovar(desfeito.id, { versao: desfeito.versao }, USER);
    await c.casos.reabrir(desfeito.id, { versao: caso(c, desfeito.id).versao }, USER);
    const it = c.db.sanItem.find((i) => i.codigo === '00124')!;
    it.trabalho = { ...it.trabalho, descricao: 'Nome mudado por fora' };
    it.versao += 1;
    const p = await c.restauracao.previa(projetoId, v1.id);
    expect(p.totais).toMatchObject({ itens: 2, casosDecididosDepois: 1 });
  });

  it('caso de código: o vínculo antigo → novo sai na restauração e volta no desfazer', async () => {
    const c = montar();
    const { projetoId, v1, ids } = await cenario(c);
    await c.casos.registrarResultado(projetoId, resultado('IDENTIFICACAO', [umCaso('IDENTIFICACAO', 'CODIGO_NOVO', [ids['00124']], { codigo: '00124' }, { codigo: 'NOVO-124' })]));
    const cc = c.db.sanCaso.find((x) => x.tipo === 'CODIGO_NOVO')!;
    await c.casos.aprovar(cc.id, { versao: cc.versao }, USER);
    expect(c.db.sanVinculoCodigo.map((v) => [v.de, v.para])).toEqual([['00124', 'NOVO-124']]);
    const { r } = await restaurar(c, projetoId, v1.id);
    expect(trabalho(c, '00124').codigo).toBe('00124');
    expect(caso(c, cc.id).situacao).toBe('PROPOSTO');
    expect(c.db.sanVinculoCodigo).toHaveLength(0);
    await c.restauracao.desfazer(projetoId, v1.id, r.restauracao.id, { versao: versaoProjeto(c) }, USER);
    expect(trabalho(c, '00124').codigo).toBe('NOVO-124');
    expect(caso(c, cc.id).situacao).toBe('APROVADO');
    expect(c.db.sanVinculoCodigo.map((v) => [v.de, v.para])).toEqual([['00124', 'NOVO-124']]);
    expect(c.db.sanVinculoCodigo[0].justificativa).toContain(`[caso:${cc.id}]`);
  });

  it('campo restaurado fica protegido na reimportação; item novo depois da versão é mantido', async () => {
    const c = montar();
    const { projetoId, v1 } = await cenario(c);
    c.fila.itens = [item('00123', {}, 1), item('00124', {}, 2), item('00125', {}, 3)];
    await c.importacao.confirmar(projetoId, ARQ, undefined, [], USER);
    const it = c.db.sanItem.find((i) => i.codigo === '00124')!;
    it.trabalho = { ...it.trabalho, descricao: 'Nome ajustado depois' };
    it.versao += 1;
    const { p } = await restaurar(c, projetoId, v1.id);
    expect(p.totais).toMatchObject({ itens: 2, itensNovosDepois: 1 });
    expect(c.db.sanItem.map((i) => i.codigo).sort()).toEqual(['00123', '00124', '00125']);
    c.fila.itens = [item('00123', {}, 1), item('00124', { descricao: 'Nome do arquivo novo' }, 2), item('00125', {}, 3)];
    const pi = await c.importacao.previa(projetoId, ARQ) as unknown as { diferencas: { codigo: string; campos: { campo: string; protegido: boolean }[] }[] };
    expect(pi.diferencas.find((d) => d.codigo === '00124')!.campos.find((x) => x.campo === 'descricao')!.protegido).toBe(true);
  });

  it('conflito: base alterada depois da prévia ou restauração concorrente → 409 CONFLITO_VERSAO, nada gravado', async () => {
    const c = montar();
    const { projetoId, v1 } = await cenario(c);
    const p = await c.restauracao.previa(projetoId, v1.id);
    const it = c.db.sanItem.find((i) => i.codigo === '00124')!;
    it.trabalho = { ...it.trabalho, descricao: 'Outro nome' };
    it.versao += 1;
    const antes = c.db.sanDecisao.length;
    expect(await codigo(c.restauracao.continuar(projetoId, v1.id, { versao: p.versaoProjeto, previa: p.previa, justificativa: JUST }, USER))).toBe('CONFLITO_VERSAO');
    expect(c.db.sanDecisao.length).toBe(antes);
    expect(trabalho(c, '00123').ncm).toBe('31051000');
    expect(c.db.sanCaso[0].situacao).toBe('APROVADO');
    expect(versaoProjeto(c)).toBe(p.versaoProjeto); // rollback total
    const p2 = await c.restauracao.previa(projetoId, v1.id);
    await c.restauracao.continuar(projetoId, v1.id, { versao: p2.versaoProjeto, previa: p2.previa, justificativa: JUST }, USER);
    expect(await codigo(c.restauracao.continuar(projetoId, v1.id, { versao: p2.versaoProjeto, previa: p2.previa, justificativa: JUST }, OUTRO))).toBe('CONFLITO_VERSAO');
    expect(c.db.sanDecisao.filter((d) => d.tipo === 'restaurar')).toHaveLength(2);
  });

  it('desfazer: valores, caso aprovado, célula e SPED voltam; é idempotente; depois o caso desfaz normalmente', async () => {
    const c = montar();
    const { projetoId, v1, ids, casoId } = await cenario(c);
    const impactos = c.db.sanImpactoSped.filter((l) => l.caso_id === casoId).map(({ id: _i, createdAt: _c, updatedAt: _u, ...resto }) => resto);
    const { r } = await restaurar(c, projetoId, v1.id);
    expect(await status(c.restauracao.desfazer(projetoId, v1.id, r.restauracao.id, { versao: 999 }, USER))).toBe(409);
    const d = await c.restauracao.desfazer(projetoId, v1.id, r.restauracao.id, { versao: versaoProjeto(c) }, OUTRO);
    expect(d).toMatchObject({ jaDesfeita: false, itens: 1, campos: 1, casosAprovadosDeNovo: 1, restauracao: { desfeita: { por: OUTRO.email } } });
    expect(trabalho(c, '00123').ncm).toBe('31051000');
    expect(caso(c, casoId)).toMatchObject({ situacao: 'APROVADO', decidido_por: USER.email });
    expect(celula(c, '00123', 'NCM').situacao).toBe('APROVADO');
    expect(c.db.sanImpactoSped.filter((l) => l.caso_id === casoId).map(({ id: _i, createdAt: _c, updatedAt: _u, ...resto }) => resto)).toEqual(impactos);
    const hist = await c.casos.historico(ids['00123'], 'ncm');
    expect(hist.map((h) => h.tipo)).toEqual(['desfazer', 'restaurar', 'aprovar']);
    expect(hist[0]).toMatchObject({ antes: '31010000', depois: '31051000', usuario: OUTRO.email });
    expect(await c.restauracao.desfazer(projetoId, v1.id, r.restauracao.id, { versao: 1 }, USER)).toMatchObject({ jaDesfeita: true });
    await c.casos.reabrir(casoId, { versao: caso(c, casoId).versao }, USER);
    expect(trabalho(c, '00123').ncm).toBe('31010000');
  });

  it('desfazer recusa: campo restaurado mudou de novo (CAMPO_ALTERADO_DEPOIS) ou caso reaberto foi decidido depois (CASO_ALTERADO_DEPOIS)', async () => {
    const c = montar();
    const { projetoId, v1, casoId } = await cenario(c);
    const { r } = await restaurar(c, projetoId, v1.id);
    await c.casos.rejeitar(casoId, { versao: caso(c, casoId).versao, justificativa: 'Fica o NCM antigo' }, USER);
    expect(await codigo(c.restauracao.desfazer(projetoId, v1.id, r.restauracao.id, { versao: versaoProjeto(c) }, USER))).toBe('CASO_ALTERADO_DEPOIS');
    expect(trabalho(c, '00123').ncm).toBe('31010000'); // nada mudou
    const it = c.db.sanItem.find((i) => i.codigo === '00123')!;
    it.trabalho = { ...it.trabalho, ncm: '31059000' };
    expect(await codigo(c.restauracao.desfazer(projetoId, v1.id, r.restauracao.id, { versao: versaoProjeto(c) }, USER))).toBe('CAMPO_ALTERADO_DEPOIS');
    expect(await status(c.restauracao.desfazer(projetoId, v1.id, 'nao-existe', { versao: versaoProjeto(c) }, USER))).toBe(404);
    expect(await status(c.restauracao.previa(projetoId, 'nao-existe'))).toBe(404);
  });

  it('a justificativa não consegue imitar a marca da restauração (o desfazer acha as decisões pelo id)', async () => {
    const c = montar();
    const { projetoId, v1 } = await cenario(c);
    const { r } = await restaurar(c, projetoId, v1.id);
    // Outra decisão de restauração com o id da primeira escrito no texto não entra no desfazer dela.
    c.db.sanDecisao.push({ id: 'qualquer', projeto_id: projetoId, item_id: c.db.sanItem[1].id, caso_id: null, campo: 'descricao', antes: 'x', depois: 'y', fundamento: `[restauracao:${r.restauracao.id}] rst-${r.restauracao.id}-9`, usuario: 'x', tipo: 'restaurar', quando: new Date() });
    const d = await c.restauracao.desfazer(projetoId, v1.id, r.restauracao.id, { versao: versaoProjeto(c) }, USER);
    expect(d).toMatchObject({ itens: 1, campos: 1 });
  });

  it('código que voltaria a repetir o de outro item (coluna ou código de trabalho) fica de fora, com o motivo', async () => {
    const c = montar();
    const { projetoId, v1 } = await cenario(c);
    const a = c.db.sanItem.find((i) => i.codigo === '00124')!;
    a.trabalho = { ...a.trabalho, codigo: 'NOVO-124' };
    a.versao += 1;
    // Item novo cuja chave é C1, mas cujo código de trabalho já é 00124.
    c.db.sanItem.push({ ...a, id: 'c1', codigo: 'C1', estabelecimento: '', trabalho: { ...a.trabalho, codigo: '00124' }, versao: 1 });
    const p = await c.restauracao.previa(projetoId, v1.id);
    expect(p.ignorados).toEqual([expect.objectContaining({ codigo: '00124', campo: 'codigo' })]);
    expect(p.porCampo.map((x) => x.campo)).toEqual(['ncm']);
  });
});

describe('30 mil itens em memória', () => {
  it('prévia e restauração em blocos: 30 mil itens e campos, decisões e células "revisar"', async () => {
    const c = montar();
    const N = 30_000;
    c.db.sanProjeto.push({ id: 'P1', diagnostico_id: 'D1', versao: 1, data_base: new Date('2026-12-31T00:00:00Z'), estabelecimentos: [], parametros: {}, modulos: {}, atividades_confirmadas_em: new Date(), atividades: [] });
    for (let n = 0; n < N; n++) {
      const cod = String(n).padStart(6, '0');
      const t = { codigo: cod, estabelecimento: null, descricao: `Produto ${cod}`, unidade: 'UN', ncm: '31010000', grupo: 'Adubos', ativo: true, saldo: null, ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, tambemUsadoComo: [], campos: {} };
      c.db.sanItem.push({ id: `i${cod}`, projeto_id: 'P1', estabelecimento: '', codigo: cod, linha: n + 1, importacao_id: 'imp', descricao: t.descricao, original: t, lido: t, trabalho: t, grupo: 'Adubos', finalidade: null, tambem_usado_como: [], conjunto_chave: null, ativo: true, versao: 1 });
      c.db.sanCelula.push({ id: `c${cod}`, projeto_id: 'P1', item_id: `i${cod}`, camada: 'TRIBUTARIO', situacao: 'SEM_PROBLEMA', revisar: false, revisar_causa: null, caso_id: null, grupo: 'Adubos' });
    }
    const v1 = await c.versoes.criar('P1', { rotulo: 'Base' }, USER);
    for (const i of c.db.sanItem) { i.trabalho = { ...i.trabalho, ncm: '31051000', grupo: 'Fertilizantes' }; i.grupo = 'Fertilizantes'; i.versao += 1; }
    const inicio = Date.now();
    const p = await c.restauracao.previa('P1', v1.id);
    expect(p.totais).toMatchObject({ itens: N, campos: 2 * N, itensNaFoto: N });
    expect(p.amostra).toHaveLength(100);
    const r = await c.restauracao.continuar('P1', v1.id, { versao: p.versaoProjeto, previa: p.previa, justificativa: JUST }, USER);
    expect(r).toMatchObject({ itens: N, campos: 2 * N, celulasRevisar: N });
    expect(c.db.sanDecisao.filter((d) => d.tipo === 'restaurar')).toHaveLength(2 * N);
    expect(c.db.sanItem.every((i) => i.trabalho.ncm === '31010000' && i.grupo === 'Adubos')).toBe(true);
    expect(c.db.sanCelula.every((x) => x.revisar && x.grupo === 'Adubos')).toBe(true);
    expect(Date.now() - inicio).toBeLessThan(60_000);
  }, 120_000);
});
