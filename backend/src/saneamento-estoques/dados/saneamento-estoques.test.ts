import { describe, expect, it } from 'vitest';
import type { AnalisadorCamada, ResultadoCamada } from '../tipos';
import { SanCasosService } from './casos.service';
import { SanImportacaoService } from './importacao.service';
import { SanItensService } from './itens.service';
import { SanOrquestracaoService } from './orquestracao.service';
import { motorDeAnalisadores, type ImportadorPort, type ItemImportado, type MotorPort } from './portas';
import { criarPrismaFalso, liberarFase2 } from './prisma-falso';
import { SanProjetoService } from './projeto.service';
import { SanVersoesService } from './versoes.service';

const USER = { email: 'consultor@fal.test' };
const item = (codigo: string, extra: Partial<ItemImportado> = {}, linha = 1): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo: 'Adubos', ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha, ...extra,
});

function montar(opcoes: { analisadores?: AnalisadorCamada[] } = {}) {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z'), responsavel: 'Ana' }],
    empresa: [{ id: 'E1', erp: 'SAP B1', erp_versao: '10', cnae_principal: '4683400', cnae_descricao: 'Comércio de defensivos', cnaes_secundarios: [{ codigo: '0161001', descricao: 'Serviços de plantio' }], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const fila: { itens: ItemImportado[] } = { itens: [] };
  const importador: ImportadorPort = {
    ler: async () => ({ itens: fila.itens, mapeamento: { codigo: 'Código' }, relatorio: { aceitas: fila.itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }),
  };
  const motor: MotorPort = motorDeAnalisadores(opcoes.analisadores ?? []);
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const importacao = new SanImportacaoService(prisma as never, projetos, importador);
  const itens = new SanItensService(prisma as never);
  const versoes = new SanVersoesService(prisma as never);
  const orquestracao = new SanOrquestracaoService(prisma as never, projetos, casos, motor);
  return { prisma, db, fila, projetos, casos, importacao, itens, versoes, orquestracao };
}
type Ctx = ReturnType<typeof montar>;
const ARQ = { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' };

/** Projeto criado, atividades confirmadas e itens importados. */
async function pronto(c: Ctx, itens: ItemImportado[] = [item('00123', {}, 1), item('00124', {}, 2), item('00125', { grupo: 'Sementes' }, 3)]) {
  const p = await c.projetos.criar('D1', USER);
  const conf = await c.projetos.confirmarAtividades(p.id, 1, USER);
  c.fila.itens = itens;
  const imp = await c.importacao.confirmar(p.id, ARQ, undefined, [], USER);
  return { projetoId: p.id, versaoProjeto: conf!.versao, imp };
}
const unCaso = (camada: ResultadoCamada['camada'], itens: string[], extra: Record<string, unknown> = {}) => ({
  camada, tipo: 'NCM_INCOERENTE', itens, problema: 'NCM não confere', evidencia: [{ rotulo: 'NCM', valor: '3101' }], atual: { ncm: '31010000' }, proposta: { ncm: '31051000' },
  justificativa: 'Descrição indica NPK', fundamento: 'TIPI', impactos: ['0200'], origem: 'REGRA' as const, afeta: ['TRIBUTARIO' as const], ...extra,
});
const resultado = (camada: ResultadoCamada['camada'], casos: ReturnType<typeof unCaso>[], extra: Partial<ResultadoCamada> = {}): ResultadoCamada => ({ camada, analisados: 3, semDados: null, casos, semProblema: [], ...extra });
const idsPorCodigo = (c: Ctx) => Object.fromEntries(c.db.sanItem.map((i) => [i.codigo, i.id]));
async function status(p: Promise<unknown>) { try { await p; return 200; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() ?? 500; } }
const codigoErro = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return ((e as { response?: { codigo?: string } }).response?.codigo) ?? 'SEM_CODIGO'; } };

describe('projeto e trava de atividades', () => {
  it('abre a partir do projeto de consultoria, com data-base, ERP do cliente e atividades do CNPJ; não abre duas vezes', async () => {
    const c = montar();
    const p = await c.projetos.criar('D1', USER);
    const cheio = await c.projetos.obter(p.id);
    expect(cheio.data_base.toISOString().slice(0, 10)).toBe('2026-12-31');
    expect(cheio.erp).toBe('SAP B1');
    expect(cheio.modulos).toEqual({ conciliacao: false, blocosKG: false, arquivoErp: false });
    expect(cheio.atividades.map((a) => [a.codigo, a.origem])).toEqual([['4683400', 'CNPJ'], ['0161001', 'CNPJ']]);
    expect(cheio.atividadesConfirmadas).toBe(false);
    expect(await status(c.projetos.criar('D1', USER))).toBe(409);
  });

  it('importação e camadas da Fase 1 não têm trava de atividades', async () => {
    const c = montar({ analisadores: [{ camada: 'NCM', analisar: () => resultado('NCM', []) }] });
    const p = await c.projetos.criar('D1', USER);
    c.fila.itens = [item('1')];
    expect(await codigoErro(c.importacao.previa(p.id, ARQ))).toBeNull();
    expect((await c.importacao.confirmar(p.id, ARQ, undefined, [], USER)).novos).toBe(1);
    expect(await codigoErro(c.orquestracao.executarCamada(p.id, 'NCM'))).toBeNull();
    expect(await codigoErro(c.casos.registrarResultado(p.id, resultado('NCM', [])))).toBeNull();
    for (const camada of ['IDENTIFICACAO', 'QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE', 'NOMES_UNIDADES', 'NCM', 'OBRIGACOES'] as const) {
      expect(await codigoErro(c.casos.registrarResultado(p.id, resultado(camada, []))), camada).toBeNull();
    }
    const conf = await c.projetos.confirmarAtividades(p.id, 1, USER);
    expect(conf!.atividades_confirmadas_por).toBe(USER.email);
    expect(conf!.atividades_confirmadas_em).toBeInstanceOf(Date);
  });

  it('Fase 2 (FINALIDADE, NCM_CLASSIFICACAO, TRIBUTARIO): exige, nesta ordem, Fase 1 liberada, regime do cliente e atividades confirmadas', async () => {
    const c = montar({ analisadores: (['FINALIDADE', 'NCM_CLASSIFICACAO', 'TRIBUTARIO', 'OBRIGACOES'] as const).map((camada) => ({ camada, analisar: () => resultado(camada, []) })) });
    const p = await c.projetos.criar('D1', USER);
    c.fila.itens = [item('1')];
    await c.importacao.confirmar(p.id, ARQ, undefined, [], USER);
    const todas = async (codigo: string | null) => {
      for (const camada of ['FINALIDADE', 'NCM_CLASSIFICACAO', 'TRIBUTARIO'] as const) {
        expect(await codigoErro(c.orquestracao.executarCamada(p.id, camada)), camada).toBe(codigo);
        expect(await codigoErro(c.casos.registrarResultado(p.id, resultado(camada, []))), camada).toBe(codigo);
      }
      // A análise em segundo plano recusa antes de começar se alguma camada pedida estiver travada.
      expect(await codigoErro(c.orquestracao.iniciarExecucao(p.id, ['NCM', 'TRIBUTARIO']))).toBe(codigo);
      // Espera a análise em segundo plano (quando liberada) terminar: com ela rodando, outra análise no projeto é recusada (409).
      for (let n = 0; n < 400 && c.orquestracao.execucao(p.id)?.rodando; n++) await new Promise((ok) => setTimeout(ok, 5));
      // OBRIGACOES roda sem trava.
      expect(await codigoErro(c.orquestracao.executarCamada(p.id, 'OBRIGACOES'))).toBeNull();
    };
    await todas('FASE1_NAO_LIBERADA');
    expect(await status(c.orquestracao.executarCamada(p.id, 'TRIBUTARIO'))).toBe(400);
    await c.versoes.criar(p.id, { rotulo: 'Cadastro saneado', fase: 'FASE1' }, USER);
    await todas('REGIME_NAO_INFORMADO');
    const proj = await c.projetos.obter(p.id);
    await c.projetos.configurar(p.id, { versao: proj.versao, regimeCliente: 'REGULAR' });
    await todas('ATIVIDADES_NAO_CONFIRMADAS');
    await c.projetos.confirmarAtividades(p.id, (await c.projetos.obter(p.id)).versao, USER);
    await todas(null);
    // Uma análise em segundo plano com as camadas liberadas começa.
    while (c.orquestracao.execucao(p.id)?.rodando) await new Promise((r) => setTimeout(r, 5));
    expect((await c.orquestracao.iniciarExecucao(p.id, ['FINALIDADE'])).camadas).toEqual(['FINALIDADE']);
  });

  it('regime do cliente: só da lista, gravado em parametros pelo PUT de configuração; vazio limpa', async () => {
    const c = montar();
    const p = await c.projetos.criar('D1', USER);
    const v = (await c.projetos.obter(p.id)).versao;
    const err = async (x: Promise<unknown>) => { try { await x; return null; } catch (e) { return { status: (e as { getStatus: () => number }).getStatus(), codigo: (e as { response?: { codigo?: string } }).response?.codigo }; } };
    expect(await err(c.projetos.configurar(p.id, { versao: v, regimeCliente: 'LUCRO_PRESUMIDO' }))).toEqual({ status: 400, codigo: 'REGIME_INVALIDO' });
    const a = await c.projetos.configurar(p.id, { versao: v, regimeCliente: 'PRODUTOR_RURAL_CONTRIBUINTE', parametros: { corteMovimentacao: '2025-01-01' } });
    expect(a.parametros).toMatchObject({ regimeCliente: 'PRODUTOR_RURAL_CONTRIBUINTE', corteMovimentacao: '2025-01-01' });
    // Dentro de parametros também vale; o que não veio fica como estava.
    const b = await c.projetos.configurar(p.id, { versao: a.versao, parametros: { regimeCliente: 'SIMPLES_NO_SIMPLES' } });
    expect(b.parametros).toMatchObject({ regimeCliente: 'SIMPLES_NO_SIMPLES', corteMovimentacao: '2025-01-01' });
    const d = await c.projetos.configurar(p.id, { versao: b.versao, responsavel: 'Bia' });
    expect(d.parametros).toMatchObject({ regimeCliente: 'SIMPLES_NO_SIMPLES' });
    // A tela manda nos dois lugares: vale o de cima, gravado em parametros.regimeCliente.
    const f = await c.projetos.configurar(p.id, { versao: d.versao, regimeCliente: 'REGULAR', parametros: { regimeCliente: 'REGULAR', competenciaEntregue: '2026-10' } });
    expect(f.parametros).toMatchObject({ regimeCliente: 'REGULAR', competenciaEntregue: '2026-10', corteMovimentacao: '2025-01-01' });
    expect(f).not.toHaveProperty('regimeCliente');
    const e = await c.projetos.configurar(p.id, { versao: f.versao, regimeCliente: '' });
    expect(e.parametros).not.toHaveProperty('regimeCliente');
    const { REGIMES_CLIENTE } = await import('../fiscal');
    expect(REGIMES_CLIENTE.map((r) => r.codigo)).toEqual(['REGULAR', 'SIMPLES_NO_SIMPLES', 'SIMPLES_REGULAR', 'PRODUTOR_RURAL_NAO_CONTRIBUINTE', 'PRODUTOR_RURAL_CONTRIBUINTE']);
    expect(REGIMES_CLIENTE.every((r) => r.rotulo && /LC 214/.test(r.fundamento))).toBe(true);
  });

  it('GET fases: camadas por fase (filtradas pelos módulos), versão liberada e o primeiro bloqueio da Fase 2', async () => {
    const c = montar();
    const p = await c.projetos.criar('D1', USER);
    expect((await c.projetos.obter(p.id)).totalItens).toBe(0);
    const f0 = await c.projetos.fases(p.id);
    expect(f0.fases.map((f) => f.fase)).toEqual(['FASE1', 'FASE2']);
    expect(f0.fases[0]).toEqual({ fase: 'FASE1', camadas: ['IDENTIFICACAO', 'QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE', 'NOMES_UNIDADES', 'NCM', 'OBRIGACOES'], liberada: null, bloqueio: null });
    expect(f0.fases[1]).toMatchObject({ fase: 'FASE2', camadas: ['FINALIDADE', 'NCM_CLASSIFICACAO', 'TRIBUTARIO', 'OBRIGACOES'], liberada: null, bloqueio: { codigo: 'FASE1_NAO_LIBERADA', mensagem: expect.any(String) } });
    const v1 = await c.versoes.criar(p.id, { rotulo: 'Cadastro saneado', fase: 'FASE1' }, USER);
    const f1 = await c.projetos.fases(p.id);
    expect(f1.fases[0].liberada).toEqual({ versaoId: v1.id, numero: 1, em: new Date(v1.createdAt).toISOString() });
    expect(f1.fases[1].bloqueio?.codigo).toBe('REGIME_NAO_INFORMADO');
    await c.projetos.configurar(p.id, { versao: (await c.projetos.obter(p.id)).versao, regimeCliente: 'REGULAR', modulos: { conciliacao: true } });
    const f2 = await c.projetos.fases(p.id);
    expect(f2.fases[0].camadas).toContain('ESTOQUE');
    expect(f2.fases[1].bloqueio?.codigo).toBe('ATIVIDADES_NAO_CONFIRMADAS');
    await c.projetos.confirmarAtividades(p.id, (await c.projetos.obter(p.id)).versao, USER);
    expect((await c.projetos.fases(p.id)).fases[1].bloqueio).toBeNull();
    expect(await status(c.projetos.fases('nao-existe'))).toBe(404);
  });

  it('exige pelo menos uma atividade mantida e a versão atual; confirmada, não se altera sem reabrir', async () => {
    const c = montar();
    const p = await c.projetos.criar('D1', USER);
    for (const a of await c.projetos.listarAtividades(p.id)) await c.projetos.alterarAtividade(p.id, a.id, { mantida: false });
    expect(await status(c.projetos.confirmarAtividades(p.id, 1, USER))).toBe(400);
    await c.projetos.adicionarAtividade(p.id, { codigo: 'ARMAZENAGEM', descricao: 'Armazenagem' });
    expect(await status(c.projetos.confirmarAtividades(p.id, 99, USER))).toBe(409);
    await c.projetos.confirmarAtividades(p.id, 1, USER);
    expect(await codigoErro(c.projetos.adicionarAtividade(p.id, { codigo: 'TRANSPORTE', descricao: 'Y' }))).toBe('ATIVIDADES_CONFIRMADAS');
  });

  it('reabrir marca como "revisar" as células dependentes já trabalhadas, sem apagar decisões nem casos', async () => {
    const c = montar();
    const { projetoId } = await pronto(c);
    const ids = idsPorCodigo(c);
    liberarFase2(c.db, projetoId);
    await c.casos.registrarResultado(projetoId, resultado('TRIBUTARIO', [unCaso('TRIBUTARIO', [ids['00123']], { afeta: [], proposta: { finalidade: 'REVENDA' }, atual: { finalidade: null } })]));
    const caso = c.db.sanCaso[0];
    await c.casos.aprovar(caso.id, { versao: 1 }, USER);
    const antes = c.db.sanDecisao.length;
    const v = c.db.sanProjeto[0].versao;
    await c.projetos.reabrirAtividades(projetoId, v);
    expect(c.db.sanProjeto[0].atividades_confirmadas_em).toBeNull();
    const cel = c.db.sanCelula.filter((x) => x.item_id === ids['00123'] && x.camada === 'TRIBUTARIO')[0];
    expect(cel.revisar).toBe(true);
    expect(cel.situacao).toBe('APROVADO');
    expect(c.db.sanCelula.find((x) => x.item_id === ids['00123'] && x.camada === 'NCM')!.revisar).toBe(false); // pendente e fora das camadas dependentes
    expect(c.db.sanDecisao).toHaveLength(antes);
    expect(c.db.sanCaso[0].situacao).toBe('APROVADO');
    // Atividades reabertas: a Fase 2 volta a travar; a importação (Fase 1) segue livre.
    expect(await codigoErro(c.casos.registrarResultado(projetoId, resultado('TRIBUTARIO', [])))).toBe('ATIVIDADES_NAO_CONFIRMADAS');
    expect(await codigoErro(c.importacao.previa(projetoId, ARQ))).toBeNull();
  });
});

describe('itens: id estável, unicidade e reimportação', () => {
  it('cria itens com id estável, zeros preservados, original imutável e células das camadas ativas (sem ESTOQUE)', async () => {
    const c = montar();
    const { imp } = await pronto(c);
    expect(imp.novos).toBe(3);
    const i = c.db.sanItem.find((x) => x.codigo === '00123')!;
    expect(i.codigo).toBe('00123');
    expect(i.original).toEqual(i.trabalho);
    expect(i.versao).toBe(1);
    const camadas = c.db.sanCelula.filter((x) => x.item_id === i.id).map((x) => x.camada);
    expect(camadas).toEqual(['IDENTIFICACAO', 'QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE', 'NOMES_UNIDADES', 'NCM', 'FINALIDADE', 'NCM_CLASSIFICACAO', 'TRIBUTARIO', 'OBRIGACOES']);
    expect(camadas).not.toContain('ESTOQUE');
  });

  it('o mesmo código vale em estabelecimentos diferentes; repetido no mesmo estabelecimento é rejeitado no relatório', async () => {
    const c = montar();
    const { imp } = await pronto(c, [item('A', { estabelecimento: '01' }, 1), item('A', { estabelecimento: '02' }, 2), item('A', { estabelecimento: '01' }, 3)]);
    expect(imp.novos).toBe(2);
    expect(imp.rejeitadas).toBe(1);
    expect(imp.linhasRejeitadas[0].linha).toBe(3);
  });

  it('reimportar não troca o id nem duplica; mostra diferenças, preserva decisões e só incorpora o que o consultor escolher', async () => {
    const c = montar();
    const { projetoId } = await pronto(c);
    const ids = idsPorCodigo(c);
    // decisão aprovada no NCM do 00123
    await c.casos.registrarResultado(projetoId, resultado('NCM', [unCaso('NCM', [ids['00123']], { afeta: [] })]));
    await c.casos.aprovar(c.db.sanCaso[0].id, { versao: 1 }, USER);
    // o arquivo novo muda o NCM e a descrição do 00123, a unidade do 00124 e traz um item novo
    c.fila.itens = [item('00123', { ncm: '99999999', descricao: 'Nova descrição' }), item('00124', { unidade: 'KG' }), item('00125', { grupo: 'Sementes' }), item('00126')];
    const previa = await c.importacao.previa(projetoId, ARQ);
    expect(previa).toMatchObject({ novos: 1, alterados: 2, inalterados: 1 });
    const d123 = previa.diferencas.find((d) => d.codigo === '00123')!;
    expect(d123.campos.find((x) => x.campo === 'ncm')!.protegido).toBe(true);
    expect(d123.campos.find((x) => x.campo === 'descricao')!.protegido).toBe(false);
    expect(c.db.sanItem).toHaveLength(3); // prévia não grava
    const r = await c.importacao.confirmar(projetoId, ARQ, undefined, [ids['00123']], USER);
    expect(r).toMatchObject({ novos: 1, incorporados: 1 });
    expect(c.db.sanItem).toHaveLength(4);
    expect(idsPorCodigo(c)['00123']).toBe(ids['00123']);
    const t = c.db.sanItem.find((x) => x.id === ids['00123'])!.trabalho;
    expect(t.ncm).toBe('31051000'); // a decisão do consultor foi mantida
    expect(t.descricao).toBe('Nova descrição'); // o escolhido foi incorporado
    expect(c.db.sanItem.find((x) => x.id === ids['00124'])!.trabalho.unidade).toBe('UN'); // não escolhido: base de trabalho intacta
    expect(c.db.sanItem.find((x) => x.id === ids['00123'])!.original.descricao).toBe('Produto 00123'); // original nunca muda
    expect(c.db.sanDecisao.some((d) => d.tipo === 'importar' && d.campo === 'descricao')).toBe(true);
    // lido atualizado: reimportar o mesmo arquivo de novo não mostra mais diferenças
    // o que não foi incorporado (unidade do 00124) continua aparecendo: a última leitura só avança nos itens escolhidos
    const depois = await c.importacao.previa(projetoId, ARQ);
    expect(depois.alterados).toBe(1);
    expect(depois.diferencas[0].codigo).toBe('00124');
  });
});

describe('casos: aplicar, histórico, idempotência e concorrência', () => {
  async function comCaso(c: Ctx, extra: Record<string, unknown> = {}, codigos = ['00123']) {
    const { projetoId } = await pronto(c);
    const ids = idsPorCodigo(c);
    await c.casos.registrarResultado(projetoId, resultado('NCM', [unCaso('NCM', codigos.map((x) => ids[x]), extra)]));
    return { projetoId, ids, caso: c.db.sanCaso[0] };
  }

  it('aprovar aplica ao trabalho, grava decisão por campo e é idempotente', async () => {
    const c = montar();
    const { ids, caso } = await comCaso(c, { proposta: { ncm: '31051000', finalidade: 'REVENDA' }, atual: { ncm: '31010000' } });
    const r1 = await c.casos.aprovar(caso.id, { versao: 1, fundamento: 'TIPI 31.05' }, USER);
    expect(r1.jaAplicado).toBe(false);
    const item = c.db.sanItem.find((x) => x.id === ids['00123'])!;
    expect(item.trabalho).toMatchObject({ ncm: '31051000', finalidade: 'REVENDA' });
    expect(item.finalidade).toBe('REVENDA');
    expect(item.conjunto_chave).toBe('31051000|REVENDA');
    expect(item.versao).toBe(2);
    const decs = c.db.sanDecisao.filter((d) => d.item_id === item.id && d.tipo === 'aprovar');
    expect(decs.map((d) => [d.campo, d.antes, d.depois, d.fundamento, d.usuario])).toEqual([
      ['ncm', '31010000', '31051000', 'TIPI 31.05', USER.email], ['finalidade', null, 'REVENDA', 'TIPI 31.05', USER.email],
    ]);
    const cel = c.db.sanCelula.find((x) => x.item_id === item.id && x.camada === 'NCM')!;
    expect([cel.situacao, cel.caso_id]).toEqual(['APROVADO', caso.id]);
    // segunda chamada (duplo clique, com versão velha): nada muda
    const r2 = await c.casos.aprovar(caso.id, { versao: 1 }, USER);
    expect(r2.jaAplicado).toBe(true);
    expect(c.db.sanDecisao.filter((d) => d.tipo === 'aprovar')).toHaveLength(2);
    expect(c.db.sanItem.find((x) => x.id === item.id)!.versao).toBe(2);
    const hist = await c.casos.historico(item.id, 'ncm');
    expect(hist).toHaveLength(1);
  });

  it('caso sem proposta aplicável não se aprova (falta informação); decisão de duplicidade ou conferência sim, registrando a ciência uma única vez por item', async () => {
    const c = montar();
    const { caso, ids } = await comCaso(c, { proposta: {}, atual: {} });
    expect(await codigoErro(c.casos.aprovar(caso.id, { versao: 1 }, USER))).toBe('SEM_PROPOSTA');
    c.db.sanCaso[0].proposta = { decisao: 'MANTER_DISTINTOS' };
    await c.casos.aprovar(caso.id, { versao: 1 }, USER);
    expect(c.db.sanDecisao.filter((d) => d.item_id === ids['00123'] && d.campo === 'caso:NCM_INCOERENTE')).toHaveLength(1);
    expect(c.db.sanItem.find((x) => x.id === ids['00123'])!.versao).toBe(1);
  });

  it('versão desatualizada do caso, do item ou do projeto devolve 409 e nunca sobrescreve', async () => {
    const c = montar();
    const { caso, ids, projetoId } = await comCaso(c);
    await c.casos.salvarRascunho(caso.id, { versao: 1, proposta: { ncm: '31052000' } }, USER); // versão do caso agora é 2
    expect(await status(c.casos.aprovar(caso.id, { versao: 1 }, USER))).toBe(409);
    expect(await status(c.casos.salvarRascunho(caso.id, { versao: 1, justificativa: 'outra pessoa' }, USER))).toBe(409);
    expect(c.db.sanCaso[0].justificativa).toBe('Descrição indica NPK');
    expect(c.db.sanCaso[0].proposta).toEqual({ ncm: '31052000' });
    // versão de item velha (outra pessoa mexeu no item depois que o caso foi aberto)
    c.db.sanItem.find((x) => x.id === ids['00123'])!.versao = 5;
    expect(await status(c.casos.aprovar(caso.id, { versao: 2, versoesItens: { [ids['00123']]: 1 } }, USER))).toBe(409);
    expect(c.db.sanCaso[0].situacao).toBe('RASCUNHO');
    expect(c.db.sanItem.find((x) => x.id === ids['00123'])!.trabalho.ncm).toBe('31010000');
    expect(await status(c.projetos.configurar(projetoId, { versao: 1, erp: 'Outro' }))).toBe(409);
    expect(await status(c.casos.aprovar(caso.id, {}, USER))).toBe(400); // sem versão informada
  });

  it('é uma transação: se um item do conjunto conflita, nenhum item é alterado', async () => {
    const c = montar();
    const { caso, ids } = await comCaso(c, {}, ['00123', '00124']);
    expect(await status(c.casos.aprovar(caso.id, { versao: 1, versoesItens: { [ids['00123']]: 1, [ids['00124']]: 7 } }, USER))).toBe(409);
    expect(c.db.sanItem.map((i) => i.trabalho.ncm)).toEqual(['31010000', '31010000', '31010000']);
    expect(c.db.sanDecisao).toHaveLength(0);
    expect(c.db.sanCaso[0].situacao).toBe('PROPOSTO');
  });

  it('dependências: aprovar marca "revisar" nas camadas de `afeta` sem apagar a decisão nem a situação delas', async () => {
    const c = montar();
    const { projetoId } = await pronto(c);
    const ids = idsPorCodigo(c);
    // camada TRIBUTARIO já aprovada no item 1
    liberarFase2(c.db, projetoId);
    await c.casos.registrarResultado(projetoId, resultado('TRIBUTARIO', [unCaso('TRIBUTARIO', [ids['00123']], { afeta: [], proposta: { finalidade: 'REVENDA' }, atual: { finalidade: null } })]));
    await c.casos.aprovar(c.db.sanCaso[0].id, { versao: 1 }, USER);
    const decisoesAntes = c.db.sanDecisao.length;
    // agora o NCM muda e afeta TRIBUTARIO
    await c.casos.registrarResultado(projetoId, resultado('NCM', [unCaso('NCM', [ids['00123'], ids['00124']], { afeta: ['TRIBUTARIO', 'OBRIGACOES'] })]));
    await c.casos.aprovar(c.db.sanCaso[1].id, { versao: 1 }, USER);
    const trib = c.db.sanCelula.find((x) => x.item_id === ids['00123'] && x.camada === 'TRIBUTARIO')!;
    expect([trib.situacao, trib.revisar]).toEqual(['APROVADO', true]);
    expect(trib.revisar_causa).toContain('NCM_INCOERENTE');
    expect(c.db.sanDecisao.length).toBeGreaterThan(decisoesAntes); // só acrescentou
    expect(c.db.sanDecisao.find((d) => d.campo === 'finalidade')!.depois).toBe('REVENDA');
    expect(c.db.sanCelula.find((x) => x.item_id === ids['00124'] && x.camada === 'TRIBUTARIO')!.revisar).toBe(false); // estava pendente: nada a revisar
    // a lista filtra pelas células a revisar
    const lista = await c.itens.listar(projetoId, { revisar: true });
    expect(lista.itens.map((i) => i.codigo)).toEqual(['00123']);
  });

  it('rejeitar exige justificativa; reabrir devolve o caso; desfazer restaura o valor e registra "desfazer"', async () => {
    const c = montar();
    const { caso, ids } = await comCaso(c);
    expect(await status(c.casos.rejeitar(caso.id, { versao: 1, justificativa: '  ' }, USER))).toBe(400);
    await c.casos.rejeitar(caso.id, { versao: 1, justificativa: 'Mantém o NCM do fornecedor' }, USER);
    expect(c.db.sanCelula.find((x) => x.item_id === ids['00123'] && x.camada === 'NCM')!.situacao).toBe('SEM_PROBLEMA');
    expect(await status(c.casos.aprovar(caso.id, { versao: 2 }, USER))).toBe(400);
    await c.casos.reabrir(caso.id, { versao: 2 }, USER);
    await c.casos.aprovar(caso.id, { versao: 3 }, USER);
    expect(c.db.sanItem.find((x) => x.id === ids['00123'])!.trabalho.ncm).toBe('31051000');
    await c.casos.reabrir(caso.id, { versao: 4 }, USER);
    const item = c.db.sanItem.find((x) => x.id === ids['00123'])!;
    expect(item.trabalho.ncm).toBe('31010000');
    expect(item.conjunto_chave).toBeNull();
    expect(c.db.sanDecisao.filter((d) => d.tipo === 'desfazer').map((d) => [d.campo, d.antes, d.depois])).toEqual([['ncm', '31051000', '31010000']]);
    expect(c.db.sanCaso[0].situacao).toBe('PROPOSTO');
  });

  it('não desfaz um campo que outra decisão mudou depois', async () => {
    const c = montar();
    const { caso, ids, projetoId } = await comCaso(c);
    await c.casos.aprovar(caso.id, { versao: 1 }, USER);
    await c.casos.registrarResultado(projetoId, resultado('NCM', [unCaso('NCM', [ids['00123']], { tipo: 'OUTRO', proposta: { ncm: '31052000' }, atual: { ncm: '31051000' }, afeta: [] })]));
    await c.casos.aprovar(c.db.sanCaso[1].id, { versao: 1 }, USER);
    expect(await codigoErro(c.casos.reabrir(caso.id, { versao: 2 }, USER))).toBe('CAMPO_ALTERADO_DEPOIS');
    expect(c.db.sanItem.find((x) => x.id === ids['00123'])!.trabalho.ncm).toBe('31052000');
  });

  it('pedir informação marca a célula como "aguardando informação"', async () => {
    const c = montar();
    const { caso, ids } = await comCaso(c);
    expect(await status(c.casos.pedirInformacao(caso.id, { versao: 1, motivo: '' }))).toBe(400);
    await c.casos.pedirInformacao(caso.id, { versao: 1, motivo: 'Falta a ficha técnica' });
    expect(c.db.sanCelula.find((x) => x.item_id === ids['00123'] && x.camada === 'NCM')!.situacao).toBe('AGUARDANDO_INFORMACAO');
  });
});

describe('lote com prévia e exceções', () => {
  async function dois(c: Ctx) {
    const { projetoId } = await pronto(c);
    const ids = idsPorCodigo(c);
    await c.casos.registrarResultado(projetoId, resultado('NCM', [
      unCaso('NCM', [ids['00123']], { tipo: 'A' }),
      unCaso('NCM', [ids['00124']], { tipo: 'B', parecer_ia: undefined }),
      unCaso('NCM', [ids['00125']], { tipo: 'C', atual: { ncm: '00000000' } }), // o atual já não confere com o item
      unCaso('NCM', [ids['00123']], { tipo: 'D', proposta: { ncm: '99999999' } }), // conflita com o A (mesmo item e campo)
    ]));
    return { projetoId, ids };
  }

  it('a prévia lista itens e campos afetados e separa as exceções; não grava nada', async () => {
    const c = montar();
    const { projetoId } = await dois(c);
    c.db.sanCaso[1].parecer_ia = { confianca: 'baixa' };
    const p = await c.casos.lotePrevia(projetoId, { filtro: { camada: 'NCM' } });
    expect(p.casos).toBe(4);
    expect(p.aprovaveis.map((a) => a.tipo)).toEqual(['A']);
    expect(p.excecoes.map((e) => e.casoId).sort()).toEqual([c.db.sanCaso[1].id, c.db.sanCaso[2].id, c.db.sanCaso[3].id].sort());
    expect(p.excecoes.find((e) => e.casoId === c.db.sanCaso[1].id)!.motivo).toContain('IA');
    expect(p.excecoes.find((e) => e.casoId === c.db.sanCaso[2].id)!.motivo).toContain('mudou desde');
    expect(p.excecoes.find((e) => e.casoId === c.db.sanCaso[3].id)!.motivo).toContain('Conflita');
    expect(p).toMatchObject({ itensAfetados: 1, camposAfetados: 1 });
    expect(c.db.sanDecisao).toHaveLength(0);
  });

  it('aprovar o lote exige a prévia (versões), aprova só o aceitável e devolve as exceções', async () => {
    const c = montar();
    const { projetoId } = await dois(c);
    expect(await status(c.casos.loteAprovar(projetoId, { filtro: { camada: 'NCM' } }, USER))).toBe(400);
    const p = await c.casos.lotePrevia(projetoId, { filtro: { camada: 'NCM' } });
    const versoes = Object.fromEntries(p.aprovaveis.map((a) => [a.casoId, a.versao]));
    // alguém mexe no caso A depois da prévia
    c.db.sanCaso[0].versao = 9;
    const r1 = await c.casos.loteAprovar(projetoId, { filtro: { camada: 'NCM' }, versoes }, USER);
    expect(r1.aprovados).toBe(1); // só o B (o A mudou depois da prévia)
    expect(r1.excecoes.some((e) => e.motivo.includes('Refaça a prévia'))).toBe(true);
    const p2 = await c.casos.lotePrevia(projetoId, { filtro: { camada: 'NCM' } });
    const r2 = await c.casos.loteAprovar(projetoId, { filtro: { camada: 'NCM' }, versoes: Object.fromEntries(p2.aprovaveis.map((a) => [a.casoId, a.versao])) }, USER);
    expect(r2.aprovados).toBe(1);
    expect(c.db.sanCaso.filter((x) => x.situacao === 'APROVADO')).toHaveLength(2);
    expect(r2.excecoes).toHaveLength(2);
  });

  it('exceções e aprováveis trazem o tipo e o primeiro item (código e descrição), nunca só o id; o conflito cita o outro caso pelo item', async () => {
    const c = montar();
    const { projetoId } = await dois(c);
    const p = await c.casos.lotePrevia(projetoId, { filtro: { camada: 'NCM' } });
    expect(p.aprovaveis[0]).toMatchObject({ tipo: 'A', codigo: '00123', descricao: 'Produto 00123', qtdItens: 1 });
    const conflito = p.excecoes.find((e) => e.motivo.includes('Conflita'))!;
    expect(conflito).toMatchObject({ tipo: 'D', codigo: '00123', descricao: 'Produto 00123' });
    expect(conflito.motivo).not.toContain(c.db.sanCaso[0].id);
    expect(p.excecoes.find((e) => e.tipo === 'C')!.motivo).toContain('"NCM"');
    expect(p).toMatchObject({ total: 4, proximo: null });
    expect(p.abertos.map((a) => a.casoId).sort()).toEqual(c.db.sanCaso.map((x) => x.id).sort());
  });

  it('pelo filtro, a rodada começa depois de "apos" e aceita grupo e situação (só em aberto)', async () => {
    const c = montar();
    const { projetoId } = await dois(c);
    const ordenados = c.db.sanCaso.map((x) => x.id).sort();
    const p = await c.casos.lotePrevia(projetoId, { filtro: { camada: 'NCM' }, apos: ordenados[1] });
    expect(p.casos).toBe(2);
    expect(p.total).toBe(4);
    const porGrupo = await c.casos.lotePrevia(projetoId, { filtro: { grupo: 'Sementes' } });
    expect(porGrupo.casos).toBe(1); // só o caso do item 00125 (grupo Sementes)
    // Situação fora do aberto não amplia o recorte: continuam só os casos em aberto.
    expect((await c.casos.lotePrevia(projetoId, { filtro: { situacao: 'APROVADO' } })).casos).toBe(4);
  });

  it('pedir informação e rejeitar em lote: texto e versões obrigatórios, caso que mudou vira exceção, cada caso decidido na sua transação', async () => {
    const c = montar();
    const { projetoId } = await dois(c);
    const ids = c.db.sanCaso.map((x) => x.id);
    const p = await c.casos.lotePrevia(projetoId, { ids });
    const versoes = Object.fromEntries(p.abertos.map((a) => [a.casoId, a.versao]));
    expect(await status(c.casos.loteDecidir(projetoId, 'pedir', { ids, versoes, texto: ' ' }, USER))).toBe(400);
    expect(await status(c.casos.loteDecidir(projetoId, 'pedir', { ids, texto: 'Ficha técnica' }, USER))).toBe(400);
    c.db.sanCaso[3].versao = 7; // alguém mexeu no caso D depois da prévia
    const r = await c.casos.loteDecidir(projetoId, 'pedir', { ids: [ids[0], ids[1], ids[3]], versoes, texto: 'Ficha técnica do fabricante' }, USER);
    expect(r).toMatchObject({ decididos: 2, restantes: [] });
    expect(r.excecoes).toEqual([expect.objectContaining({ casoId: ids[3], tipo: 'D', codigo: '00123' })]);
    expect(c.db.sanCaso.filter((x) => x.situacao === 'AGUARDANDO_INFORMACAO').map((x) => x.motivo)).toEqual(['Ficha técnica do fabricante', 'Ficha técnica do fabricante']);
    const r2 = await c.casos.loteDecidir(projetoId, 'rejeitar', { ids, versoes: { ...versoes, [ids[3]]: 7 }, texto: 'Mantém como está' }, USER);
    expect(r2.decididos).toBe(2); // C e D; A e B já não estão em aberto
    expect(r2.excecoes.filter((e) => e.motivo.includes('não em aberto'))).toHaveLength(2);
    expect(c.db.sanCaso.filter((x) => x.situacao === 'REJEITADO')).toHaveLength(2);
    expect(c.db.sanDecisao.filter((d) => d.tipo === 'rejeitar').every((d) => d.fundamento === 'Mantém como está')).toBe(true);
  });

  it('a lista traz o primeiro item de cada caso e a contagem por tipo; o detalhe traz o resumo dos itens', async () => {
    const c = montar();
    const { projetoId } = await dois(c);
    const l = await c.casos.listar(projetoId, { camada: 'NCM', tipo: 'A' });
    expect(l.casos).toHaveLength(1);
    expect(l.casos[0].item).toEqual({ codigo: '00123', descricao: 'Produto 00123', grupo: 'Adubos' });
    expect(l.tipos!.map((t) => [t.tipo, t.n])).toEqual([['A', 1], ['B', 1], ['C', 1], ['D', 1]]);
    const d = await c.casos.obter(c.db.sanCaso[2].id);
    expect(d.resumoItens).toEqual([expect.objectContaining({ codigo: '00125', descricao: 'Produto 00125', grupo: 'Sementes', ncm: '31010000', unidade: 'UN' })]);
  });
});

describe('camadas: executar e registrar resultado', () => {
  it('chama o analisador, grava casos e células; reexecutar não duplica; "semDados" vira aguardando informação', async () => {
    let ultimo: { n: number; ctx?: unknown } = { n: 0 };
    let proximo: (ids: string[]) => ResultadoCamada = () => resultado('NCM', []);
    const c = montar({ analisadores: [{ camada: 'NCM', analisar: (itens, ctx) => { ultimo = { n: itens.length, ctx }; return proximo(itens.map((i) => i.id)); } }, { camada: 'ESTOQUE', analisar: () => resultado('ESTOQUE', []) }] });
    const { projetoId } = await pronto(c);
    proximo = (ids) => resultado('NCM', [unCaso('NCM', [ids[0]]), unCaso('NCM', [ids[1], ids[2]], { tipo: 'GRUPO' })], { semProblema: [] });
    const r1 = await c.orquestracao.executarCamada(projetoId, 'NCM');
    expect(r1).toMatchObject({ casosNovos: 2, casosJaExistentes: 0 });
    expect(ultimo.n).toBe(3);
    expect(ultimo.ctx).toMatchObject({ dataBase: '2026-12-31', atividades: expect.any(Array), erp: 'SAP B1', corteMovimentacao: null });
    expect(c.db.sanCelula.filter((x) => x.camada === 'NCM' && x.situacao === 'PROPOSTO')).toHaveLength(3);
    const r2 = await c.orquestracao.executarCamada(projetoId, 'NCM');
    expect(r2).toMatchObject({ casosNovos: 0, casosJaExistentes: 2 });
    expect(c.db.sanCaso).toHaveLength(2);
    // camada com módulo opcional desligado
    expect(await status(c.orquestracao.executarCamada(projetoId, 'ESTOQUE'))).toBe(400);
    // sem dado para analisar: o que está pendente fica aguardando informação, com o motivo
    const ids = Object.values(idsPorCodigo(c));
    proximo = () => resultado('QUALIDADE', [], { semDados: { motivo: 'Faltam as colunas de saldo', itens: 3 } });
    c.db.sanCelula.filter((x) => x.camada === 'QUALIDADE').forEach((x) => { x.situacao = 'PENDENTE'; });
    await c.casos.registrarResultado(projetoId, resultado('QUALIDADE', [], { semDados: { motivo: 'Faltam as colunas de saldo', itens: 3 } }));
    expect(c.db.sanCelula.filter((x) => x.camada === 'QUALIDADE').every((x) => x.situacao === 'AGUARDANDO_INFORMACAO' && x.revisar_causa === 'Faltam as colunas de saldo')).toBe(true);
    expect(ids).toHaveLength(3);
  });

  it('itens sem problema viram "sem problema"; o que já estava aprovado continua aprovado', async () => {
    const c = montar();
    const { projetoId, } = await pronto(c);
    const ids = idsPorCodigo(c);
    c.db.sanCelula.find((x) => x.item_id === ids['00124'] && x.camada === 'QUALIDADE')!.situacao = 'APROVADO';
    await c.casos.registrarResultado(projetoId, resultado('QUALIDADE', [], { semProblema: [ids['00123'], ids['00124']] }));
    const sit = (cod: string) => c.db.sanCelula.find((x) => x.item_id === ids[cod] && x.camada === 'QUALIDADE')!.situacao;
    expect([sit('00123'), sit('00124'), sit('00125')]).toEqual(['SEM_PROBLEMA', 'APROVADO', 'PENDENTE']);
    expect(await status(c.casos.registrarResultado(projetoId, resultado('QUALIDADE', [unCaso('QUALIDADE', ['inexistente'])])))).toBe(400);
  });

  it('sem analisador conectado, a camada diz que ainda não está disponível', async () => {
    const c = montar();
    const { projetoId } = await pronto(c);
    expect(await status(c.orquestracao.executarCamada(projetoId, 'NCM'))).toBe(400);
    expect(await status(c.orquestracao.executarCamada(projetoId, 'XYZ'))).toBe(400);
  });
});

describe('itens: lista paginada, filtros e visão geral', () => {
  it('pagina por cursor, filtra por camada/situação/grupo/busca e agrega por grupo × camada', async () => {
    const c = montar();
    const { projetoId } = await pronto(c, Array.from({ length: 7 }, (_, i) => item(`P${String(i).padStart(3, '0')}`, { grupo: i < 4 ? 'Adubos' : 'Sementes', descricao: i === 5 ? 'Semente de soja' : `Item ${i}` }, i + 1)));
    const ids = idsPorCodigo(c);
    await c.casos.registrarResultado(projetoId, resultado('NCM', [unCaso('NCM', [ids.P000, ids.P001])]));
    const p1 = await c.itens.listar(projetoId, { limite: 3 });
    expect(p1.itens.map((i) => i.codigo)).toEqual(['P000', 'P001', 'P002']);
    expect(p1.total).toBe(7);
    expect(p1.proximo).toBe(ids.P003);
    const p2 = await c.itens.listar(projetoId, { limite: 3, cursor: p1.proximo! });
    expect(p2.itens.map((i) => i.codigo)).toEqual(['P003', 'P004', 'P005']);
    const p3 = await c.itens.listar(projetoId, { limite: 3, cursor: p2.proximo! });
    expect(p3.itens.map((i) => i.codigo)).toEqual(['P006']);
    expect(p3.proximo).toBeNull();
    expect((await c.itens.listar(projetoId, { camada: 'NCM', situacao: 'PROPOSTO' })).itens.map((i) => i.codigo)).toEqual(['P000', 'P001']);
    expect((await c.itens.listar(projetoId, { grupo: 'Sementes' })).itens).toHaveLength(3);
    expect((await c.itens.listar(projetoId, { busca: 'soja' })).itens.map((i) => i.codigo)).toEqual(['P005']);
    expect((await c.itens.listar(projetoId, { busca: 'p00' })).total).toBe(7);
    const v = await c.itens.visaoGeral(projetoId);
    const adubos = v.grupos.find((g) => g.grupo === 'Adubos')!;
    expect(adubos.itens).toBe(4);
    expect(adubos.camadas.NCM).toMatchObject({ PROPOSTO: 2, PENDENTE: 2 });
    expect(v.camadas).not.toContain('ESTOQUE');
    // As camadas novas da divisão em fases entram na visão geral (antes, camada fora de CAMADAS derrubava a tela).
    expect(v.camadas).toEqual(expect.arrayContaining(['FINALIDADE', 'NCM_CLASSIFICACAO']));
    expect(adubos.camadas.FINALIDADE).toMatchObject({ PENDENTE: 4 });
    expect(adubos.camadas.NCM_CLASSIFICACAO).toMatchObject({ PENDENTE: 4 });
    c.db.sanCelula.push({ id: 'cel-estranha', projeto_id: projetoId, item_id: ids.P000, camada: 'CAMADA_QUE_NAO_EXISTE', grupo: 'Adubos', situacao: 'PENDENTE', revisar: false });
    expect((await c.itens.visaoGeral(projetoId)).grupos.find((g) => g.grupo === 'Adubos')!.camadas).not.toHaveProperty('CAMADA_QUE_NAO_EXISTE');
  });
});

describe('versões', () => {
  it('cria versões numeradas, compara duas e exporta a foto; a versão não muda depois', async () => {
    const c = montar();
    const { projetoId } = await pronto(c);
    const ids = idsPorCodigo(c);
    expect(await status(c.versoes.criar(projetoId, { rotulo: ' ' }, USER))).toBe(400);
    const v1 = await c.versoes.criar(projetoId, { rotulo: 'Entrega 1' }, USER);
    expect(v1.numero).toBe(1);
    expect(v1.resumo).toMatchObject({ itens: 3 });
    await c.casos.registrarResultado(projetoId, resultado('NCM', [unCaso('NCM', [ids['00123']], { proposta: { ncm: '31051000' } })]));
    await c.casos.aprovar(c.db.sanCaso[0].id, { versao: 1 }, USER);
    c.fila.itens = [item('00123'), item('00124'), item('00125', { grupo: 'Sementes' }), item('00126')];
    await c.importacao.confirmar(projetoId, ARQ, undefined, [], USER);
    const v2 = await c.versoes.criar(projetoId, { rotulo: 'Entrega 2' }, USER);
    expect(v2.numero).toBe(2);
    const cmp = await c.versoes.comparar(projetoId, v1.id, v2.id);
    expect(cmp.totais).toMatchObject({ acrescentados: 1, retirados: 0, alterados: 1 });
    expect(cmp.alterados[0]).toMatchObject({ codigo: '00123', campos: [{ campo: 'ncm', antes: '31010000', depois: '31051000' }] });
    expect(cmp.celulas).toEqual([{ item_id: ids['00123'], camada: 'NCM', antes: 'PENDENTE', depois: 'APROVADO' }]);
    expect(await status(c.versoes.comparar(projetoId, v1.id, v1.id))).toBe(400);
    const exp1 = await c.versoes.exportar(projetoId, v1.id);
    expect(exp1.liberada).toBe(true);
    expect(exp1.versao).toMatchObject({ numero: 1, rotulo: 'Entrega 1' });
    expect(exp1.itens).toHaveLength(3);
    expect(exp1.decisoes).toHaveLength(0); // ainda não havia decisões na versão 1
    expect((await c.versoes.exportarAtual(projetoId)).liberada).toBe(false);
    expect((await c.versoes.listar(projetoId)).map((v) => v.numero)).toEqual([2, 1]);
  });

  it('versão por fase: grava resumo.fase; FASE2 exige uma FASE1 liberada antes; fase inválida é recusada', async () => {
    const c = montar();
    const { projetoId } = await pronto(c);
    expect(await codigoErro(c.versoes.criar(projetoId, { rotulo: 'X', fase: 'FASE3' }, USER))).toBe('FASE_INVALIDA');
    expect(await codigoErro(c.versoes.criar(projetoId, { rotulo: 'Tributário aprovado', fase: 'FASE2' }, USER))).toBe('FASE1_NAO_LIBERADA');
    const sem = await c.versoes.criar(projetoId, { rotulo: 'Entrega sem fase' }, USER);
    expect(sem.resumo).not.toHaveProperty('fase');
    // Versão sem fase não libera a Fase 2.
    expect(await codigoErro(c.versoes.criar(projetoId, { rotulo: 'Tributário aprovado', fase: 'FASE2' }, USER))).toBe('FASE1_NAO_LIBERADA');
    const v1 = await c.versoes.criar(projetoId, { rotulo: 'Cadastro saneado', fase: 'FASE1' }, USER);
    expect(v1.resumo).toMatchObject({ fase: 'FASE1', itens: 3 });
    const v2 = await c.versoes.criar(projetoId, { rotulo: 'Tributário aprovado', fase: 'FASE2' }, USER);
    expect(v2.resumo).toMatchObject({ fase: 'FASE2' });
    const f = await c.projetos.fases(projetoId);
    expect(f.fases.map((x) => x.liberada?.numero ?? null)).toEqual([v1.numero, v2.numero]);
  });
});
