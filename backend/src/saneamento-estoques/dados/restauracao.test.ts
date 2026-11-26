/** "Continuar a partir desta versão": prévia, restauração com histórico, conflito, desfazer e base de 30 mil itens (Prisma em memória). */
import { describe, expect, it } from 'vitest';
import type { ResultadoCamada } from '../tipos';
import { SanCasosService } from './casos.service';
import { SanImportacaoService } from './importacao.service';
import { type ImportadorPort, type ItemImportado } from './portas';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';
import { diferencasDoTrabalho, SanRestauracaoService } from './restauracao.service';
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
  return { prisma, db, fila, projetos, casos, importacao, versoes, restauracao: new SanRestauracaoService(prisma as never, versoes) };
}
type Ctx = ReturnType<typeof montar>;
const versaoProjeto = (c: Ctx) => c.db.sanProjeto[0].versao as number;
const trabalho = (c: Ctx, cod: string) => c.db.sanItem.find((i) => i.codigo === cod)!.trabalho;
const celula = (c: Ctx, cod: string, camada: string) => c.db.sanCelula.find((x) => x.item_id === c.db.sanItem.find((i) => i.codigo === cod)!.id && x.camada === camada)!;

/** Versão 1 com NCM 31010000; depois dela, um caso de NCM aprovado muda o item 00123 para 31051000. */
async function cenario(c: Ctx) {
  const p = await c.projetos.criar('D1', USER);
  await c.projetos.confirmarAtividades(p.id, 1, USER);
  c.fila.itens = [item('00123', {}, 1), item('00124', {}, 2)];
  await c.importacao.confirmar(p.id, ARQ, undefined, [], USER);
  const ids = Object.fromEntries(c.db.sanItem.map((i) => [i.codigo, i.id])) as Record<string, string>;
  celula(c, '00123', 'TRIBUTARIO').situacao = 'SEM_PROBLEMA'; // camada já trabalhada: deve voltar a "revisar"
  const v1 = await c.versoes.criar(p.id, { rotulo: 'Entrega 1' }, USER);
  const r: ResultadoCamada = {
    camada: 'NCM', analisados: 2, semDados: null, semProblema: [],
    casos: [{ camada: 'NCM', tipo: 'NCM_INCOERENTE', itens: [ids['00123']], problema: 'NCM não confere', evidencia: [], atual: { ncm: '31010000' }, proposta: { ncm: '31051000' }, justificativa: 'NPK', fundamento: 'TIPI', impactos: [], origem: 'REGRA', afeta: ['TRIBUTARIO'] }],
  };
  await c.casos.registrarResultado(p.id, r);
  const caso = c.db.sanCaso[0];
  await c.casos.aprovar(caso.id, { versao: 1 }, USER);
  celula(c, '00123', 'TRIBUTARIO').revisar = false; // conferido de novo depois da aprovação
  return { projetoId: p.id, v1, ids, casoId: caso.id as string };
}

describe('diferenças entre a base e a foto', () => {
  it('usa o nome do campo das decisões: topo pelo nome, extra pelo nome e "campos.x" quando repete um de topo', () => {
    const d = diferencasDoTrabalho(
      { codigo: 'A', ncm: '1', estabelecimento: 'X', campos: { cClassTrib: '000001', ncm: 'velho', cor: 'azul' } },
      { codigo: 'A', ncm: '2', estabelecimento: 'Y', campos: { cClassTrib: '000001', ncm: 'novo' } },
    );
    expect(d).toEqual([{ campo: 'ncm', antes: '1', depois: '2' }, { campo: 'cor', antes: 'azul', depois: null }, { campo: 'campos.ncm', antes: 'velho', depois: 'novo' }]);
  });
});

describe('continuar a partir de uma versão liberada', () => {
  it('prévia mostra itens, campos, casos decididos depois e camadas que ficam "revisar", sem gravar nada', async () => {
    const c = montar();
    const { projetoId, v1 } = await cenario(c);
    const decisoes = c.db.sanDecisao.length;
    const p = await c.restauracao.previa(projetoId, v1.id);
    expect(p.totais).toEqual({ itens: 1, campos: 1, itensNaFoto: 2, itensNovosDepois: 0, itensAusentes: 0, casosDecididosDepois: 1 });
    expect(p.porCampo).toEqual([{ campo: 'ncm', itens: 1 }]);
    expect(p.camadasRevisar).toEqual(['NCM', 'OBRIGACOES', 'TRIBUTARIO']);
    expect(p.amostra[0]).toMatchObject({ codigo: '00123', campos: [{ campo: 'ncm', antes: '31051000', depois: '31010000' }] });
    expect(p.versaoProjeto).toBe(versaoProjeto(c));
    expect(typeof p.previa).toBe('string');
    expect(c.db.sanDecisao.length).toBe(decisoes);
    expect(trabalho(c, '00123').ncm).toBe('31051000');
  });

  it('restaura os valores com uma decisão por campo (antes, depois, quem, justificativa); não apaga histórico nem decisões; casos decididos ficam "revisar"', async () => {
    const c = montar();
    const { projetoId, v1, ids, casoId } = await cenario(c);
    const p = await c.restauracao.previa(projetoId, v1.id);
    expect(await codigo(c.restauracao.continuar(projetoId, v1.id, { versao: p.versaoProjeto, previa: p.previa, justificativa: 'curta' }, USER))).toBe('JUSTIFICATIVA_CURTA');
    expect(await status(c.restauracao.continuar(projetoId, v1.id, { versao: p.versaoProjeto, justificativa: JUST }, USER))).toBe(400);
    const aprovacoes = c.db.sanDecisao.filter((d) => d.tipo === 'aprovar').length;
    const r = await c.restauracao.continuar(projetoId, v1.id, { versao: p.versaoProjeto, previa: p.previa, justificativa: JUST }, USER);
    expect(r).toMatchObject({ itens: 1, campos: 1, casosDecididosDepois: 1 });
    expect(trabalho(c, '00123').ncm).toBe('31010000');
    expect(c.db.sanItem.find((i) => i.codigo === '00123')!.conjunto_chave).toBeNull(); // derivados recalculados (sem finalidade)
    // Histórico: a decisão de restauração entra por cima; a aprovação continua lá.
    const hist = await c.casos.historico(ids['00123'], 'ncm');
    expect(hist[0]).toMatchObject({ tipo: 'restaurar', antes: '31051000', depois: '31010000', usuario: USER.email, caso_id: null });
    expect(hist[0].fundamento).toContain('Restauração da versão 1 (Entrega 1)');
    expect(hist[0].fundamento).toContain(JUST);
    expect(c.db.sanDecisao.filter((d) => d.tipo === 'aprovar').length).toBe(aprovacoes);
    // O caso continua aprovado (decisão intacta); as células passam a "revisar".
    expect(c.db.sanCaso.find((x) => x.id === casoId)!.situacao).toBe('APROVADO');
    expect(celula(c, '00123', 'NCM')).toMatchObject({ situacao: 'APROVADO', revisar: true });
    expect(celula(c, '00123', 'TRIBUTARIO')).toMatchObject({ situacao: 'SEM_PROBLEMA', revisar: true });
    expect(celula(c, '00123', 'TRIBUTARIO').revisar_causa).toContain('versão 1');
    expect(celula(c, '00124', 'NCM').revisar).toBe(false);
    // O registro fica na versão (quem, quando, justificativa) e o projeto sobe de versão.
    const [v] = await c.versoes.listar(projetoId);
    expect((v.resumo as { restauracoes: unknown[] }).restauracoes).toEqual([expect.objectContaining({ usuario: USER.email, justificativa: JUST, itens: 1, campos: 1, desfeita: null })]);
    expect(versaoProjeto(c)).toBe(p.versaoProjeto + 1);
    // A foto da versão não muda.
    expect((await c.versoes.exportar(projetoId, v1.id)).itens.find((i) => i.codigo === '00123')!.trabalho).toMatchObject({ ncm: '31010000' });
    // Nada mais a restaurar.
    const p2 = await c.restauracao.previa(projetoId, v1.id);
    expect(p2.totais.itens).toBe(0);
    expect(await codigo(c.restauracao.continuar(projetoId, v1.id, { versao: p2.versaoProjeto, previa: p2.previa, justificativa: JUST }, USER))).toBe('NADA_A_RESTAURAR');
  });

  it('campo restaurado fica protegido na reimportação; item novo depois da versão é mantido', async () => {
    const c = montar();
    const { projetoId, v1 } = await cenario(c);
    c.fila.itens = [item('00123', {}, 1), item('00124', {}, 2), item('00125', {}, 3)];
    await c.importacao.confirmar(projetoId, ARQ, undefined, [], USER);
    const it = c.db.sanItem.find((i) => i.codigo === '00124')!;
    it.trabalho = { ...it.trabalho, descricao: 'Nome ajustado depois' };
    it.versao += 1;
    const p = await c.restauracao.previa(projetoId, v1.id);
    expect(p.totais).toMatchObject({ itens: 2, itensNovosDepois: 1 });
    await c.restauracao.continuar(projetoId, v1.id, { versao: p.versaoProjeto, previa: p.previa, justificativa: JUST }, USER);
    expect(c.db.sanItem.map((i) => i.codigo).sort()).toEqual(['00123', '00124', '00125']);
    c.fila.itens = [item('00123', {}, 1), item('00124', { descricao: 'Nome do arquivo novo' }, 2), item('00125', {}, 3)];
    const pi = await c.importacao.previa(projetoId, ARQ) as unknown as { diferencas: { codigo: string; campos: { campo: string; protegido: boolean }[] }[] };
    expect(pi.diferencas.find((d) => d.codigo === '00124')!.campos.find((x) => x.campo === 'descricao')!.protegido).toBe(true);
  });

  it('conflito: base alterada depois da prévia ou restauração concorrente → 409 CONFLITO_VERSAO, nada gravado', async () => {
    const c = montar();
    const { projetoId, v1 } = await cenario(c);
    const p = await c.restauracao.previa(projetoId, v1.id);
    // Outra pessoa muda o item depois da prévia.
    const it = c.db.sanItem.find((i) => i.codigo === '00124')!;
    it.trabalho = { ...it.trabalho, descricao: 'Outro nome' };
    it.versao += 1;
    const antes = c.db.sanDecisao.length;
    expect(await codigo(c.restauracao.continuar(projetoId, v1.id, { versao: p.versaoProjeto, previa: p.previa, justificativa: JUST }, USER))).toBe('CONFLITO_VERSAO');
    expect(c.db.sanDecisao.length).toBe(antes);
    expect(trabalho(c, '00123').ncm).toBe('31051000');
    expect(versaoProjeto(c)).toBe(p.versaoProjeto); // rollback total
    // Prévia nova: duas pessoas confirmam a mesma; a segunda recebe 409.
    const p2 = await c.restauracao.previa(projetoId, v1.id);
    await c.restauracao.continuar(projetoId, v1.id, { versao: p2.versaoProjeto, previa: p2.previa, justificativa: JUST }, USER);
    expect(await codigo(c.restauracao.continuar(projetoId, v1.id, { versao: p2.versaoProjeto, previa: p2.previa, justificativa: JUST }, OUTRO))).toBe('CONFLITO_VERSAO');
    expect(c.db.sanDecisao.filter((d) => d.tipo === 'restaurar')).toHaveLength(2); // ncm de 00123 e descrição de 00124
  });

  it('desfazer: volta ao valor de antes da restauração (decisão "desfazer"), é idempotente e recusa se o campo mudou depois', async () => {
    const c = montar();
    const { projetoId, v1, ids, casoId } = await cenario(c);
    const p = await c.restauracao.previa(projetoId, v1.id);
    const r = await c.restauracao.continuar(projetoId, v1.id, { versao: p.versaoProjeto, previa: p.previa, justificativa: JUST }, USER);
    // Enquanto a restauração vale, o desfazer do caso é recusado (o campo foi alterado depois por outra decisão).
    expect(await codigo(c.casos.reabrir(casoId, { versao: c.db.sanCaso.find((x) => x.id === casoId)!.versao }, USER))).toBe('CAMPO_ALTERADO_DEPOIS');
    expect(await status(c.restauracao.desfazer(projetoId, v1.id, r.restauracao.id, { versao: 999 }, USER))).toBe(409);
    const d = await c.restauracao.desfazer(projetoId, v1.id, r.restauracao.id, { versao: versaoProjeto(c) }, OUTRO);
    expect(d).toMatchObject({ jaDesfeita: false, itens: 1, campos: 1, restauracao: { desfeita: { por: OUTRO.email } } });
    expect(trabalho(c, '00123').ncm).toBe('31051000');
    const hist = await c.casos.historico(ids['00123'], 'ncm');
    expect(hist.map((h) => h.tipo)).toEqual(['desfazer', 'restaurar', 'aprovar']);
    expect(hist[0]).toMatchObject({ antes: '31010000', depois: '31051000', usuario: OUTRO.email });
    expect(await c.restauracao.desfazer(projetoId, v1.id, r.restauracao.id, { versao: 1 }, USER)).toMatchObject({ jaDesfeita: true });
    const [v] = await c.versoes.listar(projetoId);
    expect((v.resumo as { restauracoes: { desfeita: unknown }[] }).restauracoes[0].desfeita).toMatchObject({ por: OUTRO.email });
    // Depois de desfeita, o caso volta a poder ser desfeito normalmente.
    await c.casos.reabrir(casoId, { versao: c.db.sanCaso.find((x) => x.id === casoId)!.versao }, USER);
    expect(trabalho(c, '00123').ncm).toBe('31010000');
  });

  it('desfazer recusa com 409 CAMPO_ALTERADO_DEPOIS quando o campo restaurado mudou de novo', async () => {
    const c = montar();
    const { projetoId, v1 } = await cenario(c);
    const p = await c.restauracao.previa(projetoId, v1.id);
    const r = await c.restauracao.continuar(projetoId, v1.id, { versao: p.versaoProjeto, previa: p.previa, justificativa: JUST }, USER);
    const it = c.db.sanItem.find((i) => i.codigo === '00123')!;
    it.trabalho = { ...it.trabalho, ncm: '31059000' };
    expect(await codigo(c.restauracao.desfazer(projetoId, v1.id, r.restauracao.id, { versao: versaoProjeto(c) }, USER))).toBe('CAMPO_ALTERADO_DEPOIS');
    expect(trabalho(c, '00123').ncm).toBe('31059000');
    expect(await status(c.restauracao.desfazer(projetoId, v1.id, 'nao-existe', { versao: versaoProjeto(c) }, USER))).toBe(404);
    expect(await status(c.restauracao.previa(projetoId, 'nao-existe'))).toBe(404);
  });

  it('código que voltaria a repetir o de outro item fica de fora, com o motivo', async () => {
    const c = montar();
    const { projetoId, v1 } = await cenario(c);
    const a = c.db.sanItem.find((i) => i.codigo === '00124')!;
    a.trabalho = { ...a.trabalho, codigo: 'NOVO-124' }; // decidido depois da versão
    a.versao += 1;
    c.db.sanItem.push({ ...a, id: 'outro', codigo: '00124', estabelecimento: '', trabalho: { ...a.trabalho, codigo: '00124' } }); // e outro item passou a ter a chave 00124
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
      c.db.sanCelula.push({ id: `c${cod}`, projeto_id: 'P1', item_id: `i${cod}`, camada: 'NCM', situacao: 'SEM_PROBLEMA', revisar: false, revisar_causa: null, caso_id: null, grupo: 'Adubos' });
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
