import { describe, expect, it } from 'vitest';
import { criarCatalogos } from '../fiscal';
import { ajustesDosCasos, tiposDeAjusteDoCaso } from './ajustes';
import { SanCasosService } from './casos.service';
import { SanImportacaoService } from './importacao.service';
import { ImportadorPlanilha } from './importador.provider';
import { SanItensService } from './itens.service';
import { MotorSaneamento, criarTabelaNcm, idsDeAtividades } from './motor.provider';
import { SanOrquestracaoService } from './orquestracao.service';
import { criarPrismaFalso, liberarFase2 } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };

describe('mapeamento caso → tipo de ajuste do checklist SPED', () => {
  const t = (camada: string, proposta: Record<string, unknown>) => tiposDeAjusteDoCaso({ camada, proposta });
  it('cobre os seis tipos do checklist', () => {
    expect(t('IDENTIFICACAO', { codigo: 'A1' })).toEqual(['MUDOU_CODIGO_DESCRICAO']);
    expect(t('NOMES_UNIDADES', { descricao: 'X' })).toEqual(['MUDOU_CODIGO_DESCRICAO']);
    expect(t('NOMES_UNIDADES', { unidade: 'KG', fatorConversao: 2 })).toEqual(['MUDOU_UNIDADE']);
    expect(t('DUPLICIDADE', { decisao: 'PROPOR_CONSOLIDACAO', manter: '1', consolidar: '2' })).toEqual(['CONSOLIDOU_INATIVOU']);
    expect(t('DUPLICIDADE', { decisao: 'MANTER_DISTINTOS' })).toEqual([]);
    expect(t('NCM', { ncm: '31051000' })).toEqual(['MUDOU_NCM']);
    expect(t('TRIBUTARIO', { cClassTrib: '200100', cst: '200', origem: 'HERDADO' })).toEqual(['MUDOU_TRATAMENTO']);
    expect(t('GRUPOS_FINALIDADE', { finalidade: 'IMOBILIZADO' })).toEqual(['ITEM_ATIVO_IMOBILIZADO']);
    expect(t('GRUPOS_FINALIDADE', { finalidade: 'REVENDA' })).toEqual([]);
    expect(t('OBRIGACOES', { ncm: 'x' })).toEqual([]);
  });
  it('só rascunho, proposto e aprovado geram ajuste, um por item, com valores de atual e proposta', () => {
    const base = { camada: 'NCM', tipo: 'NCM_FORMATO', itens: ['i1', 'i2'], justificativa: 'j', atual: { ncm: '3101' }, proposta: { ncm: '31010000' } };
    const aj = ajustesDosCasos([{ ...base, situacao: 'APROVADO' }, { ...base, situacao: 'REJEITADO' }, { ...base, situacao: 'AGUARDANDO_INFORMACAO' }]);
    expect(aj).toHaveLength(2);
    expect(aj[0]).toMatchObject({ tipo: 'MUDOU_NCM', itemId: 'i1', valorOriginal: '3101', valorProposto: '31010000', status: 'APROVADO' });
  });
});

describe('atividades e tabela NCM', () => {
  it('converte CNAE e ids da lista fechada em ids da lista fechada', () => {
    const r = idsDeAtividades(['4683400', 'ARMAZENAGEM', '9999999']);
    expect(r).toContain('ARMAZENAGEM');
    expect(r.length).toBeGreaterThanOrEqual(2);
  });
  it('a tabela NCM compara só dígitos e vigente = status Ativo', () => {
    const t = criarTabelaNcm([{ codigo: '3105.10.00', descricao: 'Adubos', status: 'Ativo' }, { codigo: '12345678', descricao: null, status: 'Inativo' }]);
    expect([t.existe('31051000'), t.existe('99999999'), t.vigente('31051000', '2026-12-31'), t.vigente('12345678', '2026-12-31')]).toEqual([true, false, true, false]);
    expect(t.descricao('31051000')).toBe('Adubos');
  });
});

describe('ImportadorPlanilha (importador real do Agente 2)', () => {
  const csv = (linhas: string[]) => Buffer.from(linhas.join('\n'), 'utf8');
  it('lê CSV, mapeia sozinho, preserva zeros, devolve linha de origem e relatório', async () => {
    const r = await new ImportadorPlanilha().ler({
      arquivo: csv(['Código;Descrição;Unidade;NCM;Grupo', '00123;ADUBO NPK;SC;31051000;Adubos', '00124;;SC;31051000;Adubos', '00125;SEMENTE SOJA;SC;12019000;Sementes']),
      nomeArquivo: 'cadastro.csv', estabelecimentos: [],
    });
    expect(r.itens.map((i) => i.codigo)).toEqual(['00123', '00125']);
    expect(r.itens[0]).toMatchObject({ descricao: 'ADUBO NPK', ncm: '31051000', grupo: 'Adubos', linha: 2 });
    expect(r.relatorio).toMatchObject({ rejeitadas: 1 });
    expect(r.relatorio.linhasRejeitadas[0]).toMatchObject({ linha: 3, codigo: '00124' });
    expect(r.mapeamento.codigo).toBe('Código');
  });
  it('aceita mapeamento por nome de coluna e recusa coluna inexistente', async () => {
    const arquivo = csv(['A;B', 'x1;Produto 1']);
    const ok = await new ImportadorPlanilha().ler({ arquivo, nomeArquivo: 'a.csv', estabelecimentos: [], mapeamento: { codigo: 'A', descricao: 'B' } });
    expect(ok.itens[0]).toMatchObject({ descricao: 'Produto 1' });
    await expect(new ImportadorPlanilha().ler({ arquivo, nomeArquivo: 'a.csv', estabelecimentos: [], mapeamento: { codigo: 'Z' } })).rejects.toThrow(/não existe/);
  });
});

/** Fluxo com Prisma falso: importar → executar camadas → casos → aprovar. */
function montar() {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', erp: 'SAP', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [] }],
    ncm: [{ id: 'n1', codigo: '31051000', descricao: 'Adubos', status: 'Ativo' }, { id: 'n2', codigo: '38089329', descricao: 'Herbicidas', status: 'Ativo' }],
  });
  const catalogos = criarCatalogos({ correlacao: [], classes: [], ncms: null, dispositivos: [] });
  const motor = new MotorSaneamento(prisma as never, { carregar: async () => catalogos } as never);
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const importacao = new SanImportacaoService(prisma as never, projetos, new ImportadorPlanilha());
  return { prisma, db, projetos, casos, importacao, itens: new SanItensService(prisma as never), orq: new SanOrquestracaoService(prisma as never, projetos, casos, motor), motor };
}
const linhas = ['Código;Descrição;Unidade;NCM;Grupo'];
for (let i = 1; i <= 6; i++) linhas.push(`H${i};HERBICIDA GLIFOSATO ${i}00 ML;L;3808932${i % 2};Defensivos`);
linhas.push('M1;ROLAMENTO 6205;UN;84821010;Peças');
async function pronto() {
  const c = montar();
  const p = await c.projetos.criar('D1', USER);
  await c.projetos.confirmarAtividades(p.id, 1, USER);
  await c.importacao.confirmar(p.id, { buffer: Buffer.from(linhas.join('\n')), nome: 'cad.csv' }, undefined, [], USER);
  liberarFase2(c.db, p.id); // os testes daqui também rodam as camadas da Fase 2
  return { ...c, projetoId: p.id };
}
const casoManual = (camada: string, tipo: string, itens: string[], atual: Record<string, unknown>, proposta: Record<string, unknown>) => ({
  camada, tipo, itens, problema: 'p', evidencia: [], atual, proposta, justificativa: 'j', fundamento: null, impactos: [], origem: 'REGRA' as const, afeta: [],
});

describe('motor ligado: camadas, finalidade por grupo, aprovação e dependências', () => {
  it('as 10 camadas têm analisador; ESTOQUE não', async () => {
    const c = montar();
    expect(c.orq.camadasDisponiveis()).toEqual(['IDENTIFICACAO', 'QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE', 'NOMES_UNIDADES', 'NCM', 'FINALIDADE', 'NCM_CLASSIFICACAO', 'TRIBUTARIO', 'OBRIGACOES']);
  });

  it('Grupos (GRUPOS_FINALIDADE, Fase 1) não propõe finalidade; a camada FINALIDADE (Fase 2) sim', async () => {
    const c = await pronto();
    await c.orq.executarCamada(c.projetoId, 'GRUPOS_FINALIDADE');
    expect(c.db.sanCaso.filter((x) => x.tipo.startsWith('FINALIDADE_'))).toHaveLength(0);
    await c.orq.executarCamada(c.projetoId, 'FINALIDADE');
    const fin = c.db.sanCaso.filter((x) => x.tipo.startsWith('FINALIDADE_'));
    expect(fin.length).toBeGreaterThan(0);
    expect(fin.every((x) => x.camada === 'FINALIDADE')).toBe(true);
    expect(c.db.sanCaso.filter((x) => x.camada === 'GRUPOS_FINALIDADE').every((x) => !x.tipo.startsWith('FINALIDADE_'))).toBe(true);
  });

  it('NCM_CLASSIFICACAO usa a tabela do banco e só traz a reclassificação; a validação fica no NCM', async () => {
    const c = await pronto();
    await c.orq.executarCamada(c.projetoId, 'NCM');
    await c.orq.executarCamada(c.projetoId, 'NCM_CLASSIFICACAO');
    const tiposDe = (camada: string) => new Set(c.db.sanCaso.filter((x) => x.camada === camada).map((x) => x.tipo));
    for (const t of tiposDe('NCM')) expect(['NCM_INFO_INSUFICIENTE', 'NCM_INCOMPATIVEL_DESCRICAO', 'NCM_DIVERGENTE_ENTRE_ITENS_IGUAIS']).not.toContain(t);
    for (const t of tiposDe('NCM_CLASSIFICACAO')) expect(['NCM_INFO_INSUFICIENTE', 'NCM_INCOMPATIVEL_DESCRICAO', 'NCM_DIVERGENTE_ENTRE_ITENS_IGUAIS']).toContain(t);
    expect(c.db.sanCelula.filter((x) => x.camada === 'NCM_CLASSIFICACAO').every((x) => x.situacao !== 'PENDENTE')).toBe(true);
  });

  it('FINALIDADE gera um caso por grupo; aprovar aplica a finalidade a todos e marca TRIBUTARIO e OBRIGACOES como revisar', async () => {
    const c = await pronto();
    const r = await c.orq.executarCamada(c.projetoId, 'FINALIDADE');
    expect(r.casosNovos).toBeGreaterThan(0);
    const caso = c.db.sanCaso.find((x) => x.tipo === 'FINALIDADE_GRUPO' && x.problema.includes('Defensivos'))!;
    expect(caso.itens).toHaveLength(6);
    expect(caso.proposta.finalidade).toBeTruthy();
    expect(caso.afeta).toEqual(['TRIBUTARIO', 'OBRIGACOES']);
    expect(caso.evidencia.some((e: { rotulo: string }) => e.rotulo === 'Confiança')).toBe(true);
    c.db.sanCelula.filter((x) => ['TRIBUTARIO', 'OBRIGACOES'].includes(x.camada)).forEach((x) => { x.situacao = 'SEM_PROBLEMA'; });
    await c.casos.aprovar(caso.id, { versao: 1 }, USER);
    const itens = c.db.sanItem.filter((i) => i.grupo === 'Defensivos');
    expect(itens.every((i) => i.finalidade === caso.proposta.finalidade && i.trabalho.finalidade === caso.proposta.finalidade)).toBe(true);
    expect(c.db.sanDecisao.filter((d) => d.caso_id === caso.id && d.campo === 'finalidade')).toHaveLength(6);
    for (const camada of ['TRIBUTARIO', 'OBRIGACOES']) {
      expect(c.db.sanCelula.filter((x) => x.camada === camada && itens.some((i) => i.id === x.item_id)).every((x) => x.revisar)).toBe(true);
    }
    // exceção: ajuste de um item, com decisão própria
    const um = itens[0];
    await c.casos.registrarResultado(c.projetoId, { camada: 'FINALIDADE', analisados: 1, semDados: null, semProblema: [], casos: [casoManual('FINALIDADE', 'FINALIDADE_ITEM', [um.id], { finalidade: caso.proposta.finalidade }, { finalidade: 'USO_CONSUMO' })] });
    await c.casos.aprovar(c.db.sanCaso[c.db.sanCaso.length - 1].id, { versao: 1 }, USER);
    expect(c.db.sanItem.find((i) => i.id === um.id)!.finalidade).toBe('USO_CONSUMO');
    expect(c.db.sanItem.find((i) => i.id === itens[1].id)!.finalidade).toBe(caso.proposta.finalidade);
  });

  it('NCM usa a tabela do banco; OBRIGACOES deriva ajustes dos casos aprovados e nunca altera o cadastro', async () => {
    const c = await pronto();
    await c.orq.executarCamada(c.projetoId, 'NCM');
    expect(c.db.sanCaso.find((x) => x.camada === 'NCM' && x.tipo === 'NCM_INEXISTENTE')).toBeTruthy();
    const alvo = c.db.sanItem.find((i) => i.codigo === 'H1')!;
    await c.casos.registrarResultado(c.projetoId, { camada: 'NCM', analisados: 1, semDados: null, semProblema: [], casos: [casoManual('NCM', 'NCM_FORMATO', [alvo.id], { ncm: alvo.trabalho.ncm }, { ncm: '38089329' })] });
    const nc = c.db.sanCaso[c.db.sanCaso.length - 1];
    await c.casos.aprovar(nc.id, { versao: 1 }, USER);
    expect(c.db.sanItem.find((i) => i.id === alvo.id)!.trabalho.ncm).toBe('38089329');
    await c.orq.executarCamada(c.projetoId, 'OBRIGACOES');
    const ob = c.db.sanCaso.find((x) => x.camada === 'OBRIGACOES')!;
    expect(ob.tipo).toBe('IMPACTO_MUDOU_NCM');
    expect(ob.itens).toEqual([alvo.id]);
    const antes = JSON.stringify(c.db.sanItem.find((i) => i.id === alvo.id)!.trabalho);
    await c.casos.aprovar(ob.id, { versao: 1 }, USER);
    expect(JSON.stringify(c.db.sanItem.find((i) => i.id === alvo.id)!.trabalho)).toBe(antes);
    expect(c.db.sanDecisao.filter((d) => d.caso_id === ob.id).every((d) => d.campo.startsWith('caso:'))).toBe(true);
  });

  it('TRIBUTARIO roda com os catálogos carregados e os casos "aguardando" viram células aguardando informação', async () => {
    const c = await pronto();
    const r = await c.orq.executarCamada(c.projetoId, 'TRIBUTARIO');
    expect(r.semDados).toBeTruthy();
    expect(c.db.sanCaso.some((x) => x.camada === 'TRIBUTARIO' && x.situacao === 'AGUARDANDO_INFORMACAO')).toBe(true);
    expect(c.db.sanCelula.some((x) => x.camada === 'TRIBUTARIO' && x.situacao === 'AGUARDANDO_INFORMACAO')).toBe(true);
  });

  it('mudar o código por decisão guarda o vínculo antigo → novo e desfazer o remove; a chave do item não muda', async () => {
    const c = await pronto();
    const alvo = c.db.sanItem.find((i) => i.codigo === 'M1')!;
    await c.casos.registrarResultado(c.projetoId, { camada: 'IDENTIFICACAO', analisados: 1, semDados: null, semProblema: [], casos: [casoManual('IDENTIFICACAO', 'CODIGO_COM_ESPACOS', [alvo.id], { codigo: 'M1' }, { codigo: 'M-1' })] });
    const caso = c.db.sanCaso[c.db.sanCaso.length - 1];
    await c.casos.aprovar(caso.id, { versao: 1 }, USER);
    expect(c.db.sanItem.find((i) => i.id === alvo.id)).toMatchObject({ codigo: 'M1', trabalho: expect.objectContaining({ codigo: 'M-1' }) });
    expect(c.db.sanVinculoCodigo.map((v) => [v.de, v.para])).toEqual([['M1', 'M-1']]);
    await c.casos.reabrir(caso.id, { versao: 2 }, USER);
    expect(c.db.sanVinculoCodigo).toHaveLength(0);
    expect(c.db.sanItem.find((i) => i.id === alvo.id)!.trabalho.codigo).toBe('M1');
  });

  it('consolidação de duplicidade aprovada guarda o vínculo; as chaves informativas da proposta não vão para o item', async () => {
    const c = await pronto();
    const [a, b] = ['H1', 'H2'].map((k) => c.db.sanItem.find((i) => i.codigo === k)!);
    await c.casos.registrarResultado(c.projetoId, { camada: 'DUPLICIDADE', analisados: 2, semDados: null, semProblema: [], casos: [casoManual('DUPLICIDADE', 'DUPLICIDADE_EXATA', [a.id, b.id], {}, { decisao: 'PROPOR_CONSOLIDACAO', decisoesPossiveis: 'x | y', manter: 'H1', consolidar: 'H2', tratamentoDoSaldo: 't' })] });
    await c.casos.aprovar(c.db.sanCaso[c.db.sanCaso.length - 1].id, { versao: 1 }, USER);
    expect(c.db.sanVinculoCodigo.map((v) => [v.de, v.para])).toEqual([['H2', 'H1']]);
    expect(c.db.sanItem.find((i) => i.id === a.id)!.trabalho.campos).toEqual({});
  });
});
