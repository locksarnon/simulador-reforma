/** "O que foi considerado": catálogo, validação, motor lendo os critérios, embalagens, grupos, histórico, IA (falsa) e a política. */
import { describe, expect, it } from 'vitest';
import { AnalisadorDuplicidade, AnalisadorGrupos, type ContextoMotor } from '../motor';
import { diferemSoPelaApresentacao, separarApresentacao } from '../motor/apresentacao';
import { criarPrismaFalso } from '../dados/prisma-falso';
import { SanProjetoService } from '../dados/projeto.service';
import { desatualizacaoPorCriterio, parametrosDoMotor } from '../dados/orquestracao.service';
import { gerarPdfPolitica } from '../entregaveis/politica';
import { dadosCrestani } from '../entregaveis/politica/__fixtures__/crestani';
import { CAMADAS, type ItemTrabalho } from '../tipos';
import { CATALOGO_CRITERIOS, criterioPorChave, criteriosAjustaveis, criteriosDaCamada, textoDoValor, validarValor, valorCriterio } from './catalogo';
import { NOTA_IA_INDISPONIVEL, SanCriteriosIaService } from './criterios-ia.service';
import { SanCriteriosService } from './criterios.service';
import { lerNormalizacao, montarPromptNormalizacao } from './normalizacao';
import { criteriosParaPolitica } from './politica';
import { similaridadeDoCaso } from './similaridade';

let n = 0;
const item = (codigo: string, descricao: string, extra: Partial<ItemTrabalho> = {}): ItemTrabalho => ({
  id: `i${++n}`, codigo, estabelecimento: null, descricao, unidade: 'UN', ncm: null, grupo: null, ativo: true, saldo: null, ultimaMovimentacao: null,
  fabricante: null, referencia: null, finalidade: null, campos: {}, ...extra,
});
const ctx = (criterios?: Record<string, Record<string, unknown>>): ContextoMotor => ({ dataBase: '2026-11-25', atividades: [], erp: null, corteMovimentacao: null, ...(criterios ? { parametros: { criterios } } : {}) });
const FUNDO = ['Arroz agulhinha tipo 1', 'Feijao carioca', 'Oleo de soja refinado', 'Acucar cristal', 'Sal refinado iodado', 'Cafe torrado moido', 'Macarrao espaguete', 'Farinha de trigo especial',
  'Leite integral UHT', 'Detergente neutro', 'Sabao em po', 'Papel higienico folha dupla', 'Cimento CP II', 'Tinta acrilica fosca', 'Parafuso sextavado', 'Cabo flexivel 2,5mm',
  'Lampada LED 9W', 'Pilha alcalina AA', 'Caderno universitario', 'Caneta esferografica azul'];
const base = () => [
  ...FUNDO.map((d, i) => item(`F${i}`, d.toUpperCase())),
  item('A1', 'GLIFOSATO 480 SL 20L'), item('A2', 'GLIFOSTO 480 SL 20L'), // grafia próxima: indicação alta (~95%)
  item('H1', 'LUVA LATEX AZUL CAIXA'), item('H2', 'LUVA LATEX AZUL'), // só a embalagem difere
  item('D1', 'OLEO MINERAL AGRICOLA', { unidade: 'L' }), item('D2', 'OLEO MINERAL AGRICOLA', { unidade: 'ML' }), // só a unidade difere
  item('S1', 'UREIA PERLADA SC 50KG', { unidade: 'SC' }), item('S2', 'UREIA PERLADA SACO 50 KG', { unidade: 'SC' }), // mesma apresentação escrita de outro jeito
];
const casosDup = (criterios?: Record<string, Record<string, unknown>>) => new AnalisadorDuplicidade().analisar(base(), ctx(criterios)).casos;
const par = (c: { atual: Record<string, unknown> }) => String(c.atual.codigos).split(' | ').sort().join('+');

describe('catálogo', () => {
  it('toda camada tem o que foi considerado, com id único e texto em português simples', () => {
    for (const c of CAMADAS) expect(criteriosDaCamada(c).length, c).toBeGreaterThan(0);
    expect(new Set(CATALOGO_CRITERIOS.map((c) => c.id)).size).toBe(CATALOGO_CRITERIOS.length);
    for (const c of CATALOGO_CRITERIOS) expect(c.texto).not.toMatch(/score|threshold|token|regex|json/i);
  });
  it('os critérios ajustáveis são só os de Duplicidades e Grupos, com padrão válido e dentro da faixa', () => {
    expect(new Set(criteriosAjustaveis().map((c) => c.camada))).toEqual(new Set(['DUPLICIDADE', 'GRUPOS_FINALIDADE']));
    for (const c of criteriosAjustaveis()) expect(validarValor(c.parametro!, c.parametro!.padrao).ok, c.id).toBe(true);
    expect(valorCriterio({}, 'DUPLICIDADE', 'similaridadeMinima')).toBe(78);
    expect(valorCriterio({}, 'GRUPOS_FINALIDADE', 'participacaoMinima')).toBe(90);
  });
  it('Nomes e unidades remete às Diretrizes; o corte de movimentação, à Configuração', () => {
    expect(criteriosDaCamada('NOMES_UNIDADES').filter((c) => c.origem === 'DIRETRIZES').length).toBeGreaterThanOrEqual(4);
    expect(criteriosDaCamada('QUALIDADE').some((c) => c.origem === 'CONFIGURACAO')).toBe(true);
  });
  it('valida mínimo, máximo, inteiro e Sim/Não; valor gravado inválido cai no padrão', () => {
    const sim = criterioPorChave('DUPLICIDADE', 'similaridadeMinima')!.parametro!;
    expect(validarValor(sim, 85)).toEqual({ ok: true, valor: 85 });
    expect(validarValor(sim, '90%')).toEqual({ ok: true, valor: 90 });
    expect(validarValor(sim, 69)).toEqual({ ok: false, erro: 'O valor deve ficar entre 70% e 100%.' });
    expect(validarValor(sim, 101).ok).toBe(false);
    expect(validarValor(sim, 85.5).ok).toBe(false);
    expect(validarValor(sim, 'abc').ok).toBe(false);
    const emb = criterioPorChave('DUPLICIDADE', 'embalagensDiferentesSaoItensDiferentes')!.parametro!;
    expect(validarValor(emb, 'Não')).toEqual({ ok: true, valor: false });
    expect(validarValor(emb, 'talvez').ok).toBe(false);
    expect(valorCriterio({ DUPLICIDADE: { similaridadeMinima: 5 } }, 'DUPLICIDADE', 'similaridadeMinima')).toBe(78);
    expect(textoDoValor(sim, 85)).toBe('85%');
    expect(textoDoValor(emb, true)).toBe('Sim');
  });
});

describe('Duplicidades: similaridade e embalagens', () => {
  it('similaridade mínima mais alta: menos casos de duplicidade', () => {
    const dup = (cs: ReturnType<typeof casosDup>) => cs.filter((c) => c.tipo.startsWith('DUPLICIDADE_'));
    const padrao = dup(casosDup()); const alta = dup(casosDup({ DUPLICIDADE: { similaridadeMinima: 96 } }));
    expect(padrao.map(par)).toContain('A1+A2');
    expect(alta.map(par)).not.toContain('A1+A2');
    expect(alta.length).toBeLessThan(padrao.length);
    expect(alta.map(par)).toContain('S1+S2'); // idêntico (100%) passa em qualquer mínimo
  });
  it('o caso mostra a similaridade em %, dizendo que não é probabilidade, e a lista a lê de 0 a 100', () => {
    const c = casosDup().find((x) => par(x) === 'A1+A2')!;
    const ev = c.evidencia.find((e) => e.rotulo === 'Similaridade (pontuação, não é probabilidade)')!;
    expect(ev.valor).toMatch(/^\d+%$/);
    expect(similaridadeDoCaso(c.evidencia)).toBe(Number(ev.valor.replace('%', '')));
    expect(similaridadeDoCaso([{ rotulo: 'Pontuação de similaridade (não é probabilidade)', valor: '0.87' }])).toBe(87);
    expect(similaridadeDoCaso([{ rotulo: 'Origem', valor: 'x' }])).toBeNull();
  });
  it('embalagens diferentes = Sim (padrão): não indica duplicidade; vira caso de apresentações a relacionar', () => {
    const cs = casosDup();
    for (const p of ['H1+H2', 'D1+D2']) {
      expect(cs.filter((c) => c.tipo.startsWith('DUPLICIDADE_')).map(par), p).not.toContain(p);
      const ap = cs.find((c) => c.tipo === 'APRESENTACOES_DISTINTAS' && par(c) === p)!;
      expect(ap, p).toBeTruthy();
      expect(ap.proposta.decisao).toBe('RELACIONAR_APRESENTACOES');
      expect(ap.evidencia.some((e) => e.valor.includes('embalagens ou apresentações diferentes são itens diferentes'))).toBe(true);
    }
    // a mesma apresentação escrita de outro jeito (SC 50KG × SACO 50 KG) continua duplicidade
    expect(cs.find((c) => par(c) === 'S1+S2')?.tipo).toBe('DUPLICIDADE_EXATA');
  });
  it('embalagens diferentes = Não: comportamento de antes (os pares podem ser duplicidade)', () => {
    const cs = casosDup({ DUPLICIDADE: { embalagensDiferentesSaoItensDiferentes: false } });
    expect(cs.filter((c) => c.tipo.startsWith('DUPLICIDADE_')).map(par)).toEqual(expect.arrayContaining(['H1+H2', 'D1+D2']));
    expect(cs.some((c) => c.tipo === 'APRESENTACOES_DISTINTAS' && ['H1+H2', 'D1+D2'].includes(par(c)))).toBe(false);
  });
  it('regra das apresentações: converte medidas e compara nome e embalagem', () => {
    const a = (d: string, u = 'UN') => separarApresentacao(d, u);
    expect(diferemSoPelaApresentacao(a('HERBICIDA X 20L'), a('HERBICIDA X 5L'))).toBe(true);
    expect(diferemSoPelaApresentacao(a('UREIA SC 50KG', 'SC'), a('UREIA SC 25KG', 'SC'))).toBe(true);
    expect(diferemSoPelaApresentacao(a('LUVA NITRILICA CX 12UN', 'CX'), a('LUVA NITRILICA', 'UN'))).toBe(true);
    expect(diferemSoPelaApresentacao(a('OLEO 0,5L'), a('OLEO 500 ML'))).toBe(false);
    expect(diferemSoPelaApresentacao(a('HERBICIDA X 20L'), a('FUNGICIDA Y 20L'))).toBe(false);
  });
});

describe('Grupos: participação mínima e similaridade com o grupo', () => {
  const itens = () => {
    const l: ItemTrabalho[] = [];
    for (let i = 0; i < 8; i++) l.push(item(`P${i}`, `PARAFUSO SEXTAVADO ${i}`, { grupo: 'FIXADORES' }));
    l.push(item('P8', 'PARAFUSO ZINCADO', { grupo: 'FERRAGENS' })); // 8 de 9 (89%) dos "parafuso" em FIXADORES
    for (let i = 0; i < 6; i++) l.push(item(`T${i}`, `TINTA ESMALTE ${i}`, { grupo: 'TINTAS' }));
    return l;
  };
  it('com 90% (padrão) 89% não basta; com 85% o item fora do grupo é indicado, com a similaridade em %', () => {
    const tipo = 'ITEM_DESLOCADO';
    expect(new AnalisadorGrupos().analisar(itens(), ctx()).casos.filter((c) => c.tipo === tipo)).toHaveLength(0);
    const r = new AnalisadorGrupos().analisar(itens(), ctx({ GRUPOS_FINALIDADE: { participacaoMinima: 85 } })).casos.filter((c) => c.tipo === tipo);
    expect(r).toHaveLength(1);
    expect(r[0].evidencia.find((e) => e.rotulo === 'Similaridade com o grupo')?.valor).toBe('89%');
    expect(r[0].fundamento).toContain('85%');
    expect(similaridadeDoCaso(r[0].evidencia)).toBe(89);
  });
  it('mínimo de itens como evidência: acima do que há, nada é indicado', () => {
    const r = new AnalisadorGrupos().analisar(itens(), ctx({ GRUPOS_FINALIDADE: { participacaoMinima: 85, minimoItensEvidencia: 20 } }));
    expect(r.casos.filter((c) => c.tipo === 'ITEM_DESLOCADO')).toHaveLength(0);
  });
});

describe('orquestração', () => {
  it('o motor recebe os critérios junto dos parâmetros do motor', () => {
    expect(parametrosDoMotor({})).toEqual({});
    expect(parametrosDoMotor({ motor: { minimoItensEvidencia: 3 }, criterios: { DUPLICIDADE: { similaridadeMinima: 90 } } })).toEqual({ parametros: { minimoItensEvidencia: 3, criterios: { DUPLICIDADE: { similaridadeMinima: 90 } } } });
  });
  it('critério alterado depois da última análise deixa a camada desatualizada', () => {
    expect(desatualizacaoPorCriterio('2026-11-27T10:00:00Z', '2026-11-27T11:00:00Z')).toEqual({ por: [], desde: '2026-11-27T11:00:00Z', criterio: true });
    expect(desatualizacaoPorCriterio('2026-11-27T12:00:00Z', '2026-11-27T11:00:00Z')).toBeNull();
    expect(desatualizacaoPorCriterio(null, '2026-11-27T11:00:00Z')).toBeNull();
  });
});

async function montar() {
  const { prisma } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', erp: 'SAP', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const p = await new SanProjetoService(prisma as never).criar('D1', { email: 'consultor@fal.test' });
  return { prisma, servico: new SanCriteriosService(prisma as never), projetoId: p.id };
}
const USER = { email: 'diretor@fal.test' };

describe('ajuste e histórico', () => {
  it('lista por camada com o valor efetivo; ajustar grava, marca a camada e registra quem, quando e de → para', async () => {
    const { prisma, servico, projetoId } = await montar();
    const l0 = await servico.listar(projetoId);
    const dup0 = l0.camadas.find((c) => c.camada === 'DUPLICIDADE')!;
    expect(dup0.criterios.find((c) => c.id === 'dup-similaridade')?.parametro).toMatchObject({ valor: 78, padrao: 78, alterado: false });
    expect(l0.camadas.some((c) => c.camada === 'ESTOQUE')).toBe(false); // módulo opcional desligado
    const r = await servico.ajustar(projetoId, 'DUPLICIDADE', 'similaridadeMinima', 85, USER);
    expect(r.alterado).toBe(true);
    expect(r.camadas.find((c) => c.camada === 'DUPLICIDADE')!.criterios.find((c) => c.id === 'dup-similaridade')?.parametro).toMatchObject({ valor: 85, alterado: true });
    expect(r.historico[0]).toMatchObject({ quem: 'diretor@fal.test', camada: 'DUPLICIDADE', acao: 'AJUSTE', de: '78%', para: '85%' });
    const par = (await prisma.sanProjeto.findUnique({ where: { id: projetoId } }))!.parametros as Record<string, any>;
    expect(par.criterios.DUPLICIDADE.similaridadeMinima).toBe(85);
    expect(par.criteriosAlteradosEm.DUPLICIDADE).toBeTruthy();
    // mesmo valor: nada muda
    expect((await servico.ajustar(projetoId, 'DUPLICIDADE', 'similaridadeMinima', 85, USER)).alterado).toBe(false);
    await expect(servico.ajustar(projetoId, 'DUPLICIDADE', 'similaridadeMinima', 40, USER)).rejects.toThrow('entre 70% e 100%');
    await expect(servico.ajustar(projetoId, 'QUALIDADE', 'qualquer', 1, USER)).rejects.toThrow('não pode ser ajustado');
  });
  it('verificação manual entra e sai, sempre no histórico; o histórico tem tamanho máximo', async () => {
    const { prisma, servico, projetoId } = await montar();
    const r = await servico.incluirManual(projetoId, 'GRUPOS_FINALIDADE', 'Conferir com o almoxarifado os itens de uso misto', USER);
    expect(r.camadas.find((c) => c.camada === 'GRUPOS_FINALIDADE')!.manuais.map((m) => m.texto)).toEqual(['Conferir com o almoxarifado os itens de uso misto']);
    const l = await servico.removerManual(projetoId, r.manual.id, USER);
    expect(l.camadas.find((c) => c.camada === 'GRUPOS_FINALIDADE')!.manuais).toHaveLength(0);
    expect(l.historico.map((h) => h.acao)).toEqual(['MANUAL_REMOVIDO', 'MANUAL_INCLUIDO']);
    const p = (await prisma.sanProjeto.findUnique({ where: { id: projetoId } }))!;
    await prisma.sanProjeto.update({ where: { id: projetoId }, data: { parametros: { ...(p.parametros as object), criteriosHistorico: Array.from({ length: 200 }, (_, i) => ({ quando: String(i) })) } } });
    await servico.ajustar(projetoId, 'GRUPOS_FINALIDADE', 'participacaoMinima', 80, USER);
    const h = ((await prisma.sanProjeto.findUnique({ where: { id: projetoId } }))!.parametros as Record<string, any>).criteriosHistorico;
    expect(h).toHaveLength(200);
    expect(h[199].acao).toBe('AJUSTE');
  });
});

describe('acrescentar critério em texto livre (IA falsa)', () => {
  const ia = (resposta: string | Error | null) => ({
    iaConfigurada: () => resposta !== null,
    ia: async () => { if (resposta instanceof Error) throw resposta; return resposta as string; },
  });
  it('o prompt lista os critérios ajustáveis e pede JSON; a leitura só aceita o que está no catálogo e na faixa', () => {
    const p = montarPromptNormalizacao('DUPLICIDADE', 'só considerar duplicado acima de 90%');
    expect(p).toContain('similaridadeMinima');
    expect(p).toContain('participacaoMinima');
    expect(lerNormalizacao('{"tipo":"PARAMETRO","camada":"DUPLICIDADE","chave":"similaridadeMinima","valor":90,"explicacao":"ok"}')).toMatchObject({ tipo: 'PARAMETRO', valor: 90, textoValor: '90%' });
    expect(lerNormalizacao('{"tipo":"PARAMETRO","camada":"DUPLICIDADE","chave":"similaridadeMinima","valor":10}').tipo).toBe('MANUAL');
    expect(lerNormalizacao('{"tipo":"PARAMETRO","camada":"DUPLICIDADE","chave":"inventado","valor":1}').tipo).toBe('MANUAL');
    expect(lerNormalizacao('sem json').tipo).toBe('MANUAL');
  });
  it('encaixado: devolve a proposta e não grava nada (o usuário confirma)', async () => {
    const { prisma, servico, projetoId } = await montar();
    const r = await new SanCriteriosIaService(servico, ia('```json\n{"tipo":"PARAMETRO","camada":"DUPLICIDADE","chave":"similaridadeMinima","valor":90,"explicacao":"Pede similaridade de 90%."}\n```') as never)
      .normalizar(projetoId, 'DUPLICIDADE', 'Só indicar duplicidade com similaridade a partir de 90%', USER);
    expect(r).toMatchObject({ resultado: 'PROPOSTA', proposta: { camada: 'DUPLICIDADE', chave: 'similaridadeMinima', valor: 90, textoValor: '90%', textoAtual: '78%' } });
    const par = (await prisma.sanProjeto.findUnique({ where: { id: projetoId } }))!.parametros as Record<string, any>;
    expect(par.criterios).toBeUndefined();
    expect(par.criteriosManuais).toBeUndefined();
  });
  it('não encaixado: grava como verificação manual', async () => {
    const { servico, projetoId } = await montar();
    const r = await new SanCriteriosIaService(servico, ia('{"tipo":"MANUAL","explicacao":"Depende de conferência física."}') as never)
      .normalizar(projetoId, 'QUALIDADE', 'Conferir fisicamente os itens com saldo acima de 1.000 unidades', USER);
    expect(r.resultado).toBe('MANUAL');
    expect(r.iaDisponivel).toBe(true);
    if (r.resultado === 'MANUAL') expect(r.manual).toMatchObject({ camada: 'QUALIDADE', nota: null });
  });
  it('projeto e camada conferidos ANTES da IA paga; proposta para camada desligada vira verificação manual; limite também sem e-mail', async () => {
    let chamadas = 0;
    const contando = (resposta: string) => ({ iaConfigurada: () => true, ia: async () => { chamadas++; return resposta; } });
    const { servico, projetoId } = await montar();
    const manual = '{"tipo":"MANUAL","explicacao":"x"}';
    const s = new SanCriteriosIaService(servico, contando(manual) as never);
    await expect(s.normalizar('nao-existe', 'DUPLICIDADE', 'Critério qualquer de teste', USER)).rejects.toThrow('Projeto de saneamento não encontrado');
    await expect(s.normalizar(projetoId, 'ESTOQUE', 'Critério qualquer de teste', USER)).rejects.toThrow('não está ligada');
    expect(chamadas).toBe(0);
    // A IA propõe ajuste numa camada que não está ligada no projeto: não vira proposta, fica como verificação manual da camada pedida.
    const listar = servico.listar.bind(servico);
    const semDuplicidade = Object.assign(Object.create(servico), { listar: async (id: string) => { const l = await listar(id); return { ...l, camadas: l.camadas.filter((x) => x.camada !== 'DUPLICIDADE') }; } });
    const r = await new SanCriteriosIaService(semDuplicidade, contando('{"tipo":"PARAMETRO","camada":"DUPLICIDADE","chave":"similaridadeMinima","valor":90,"explicacao":"x"}') as never)
      .normalizar(projetoId, 'QUALIDADE', 'Só indicar duplicidade acima de 90%', USER);
    expect(r.resultado).toBe('MANUAL');
    if (r.resultado === 'MANUAL') expect(r.manual.camada).toBe('QUALIDADE');
    // Sem e-mail: o limite (60 por hora) vale pelo id do usuário.
    const sem = new SanCriteriosIaService(servico, contando(manual) as never);
    for (let i = 0; i < 60; i++) await sem.normalizar(projetoId, 'QUALIDADE', `Critério manual número ${i}`, { id: 'u1' } as never);
    await expect(sem.normalizar(projetoId, 'QUALIDADE', 'Mais um critério manual', { id: 'u1' } as never)).rejects.toThrow('Muitos critérios');
  });
  it('IA fora do ar ou com erro: grava como manual, com a nota', async () => {
    for (const cliente of [ia(null), ia(new Error('timeout'))]) {
      const { servico, projetoId } = await montar();
      const r = await new SanCriteriosIaService(servico, cliente as never).normalizar(projetoId, 'DUPLICIDADE', 'Itens de fornecedores diferentes nunca são duplicados', USER);
      expect(r.resultado).toBe('MANUAL');
      expect(r.iaDisponivel).toBe(false);
      if (r.resultado === 'MANUAL') expect(r.manual.nota).toBe(NOTA_IA_INDISPONIVEL);
    }
  });
});

describe('política: seção "Critérios das análises"', () => {
  it('traz cada camada com os valores do projeto e as verificações manuais', async () => {
    const parametros = {
      corteMovimentacao: '2025-12-31', criterios: { DUPLICIDADE: { similaridadeMinima: 85, embalagensDiferentesSaoItensDiferentes: false } },
      criteriosManuais: [{ id: 'm1', camada: 'DUPLICIDADE', texto: 'Itens de fornecedores diferentes nunca são duplicados', criadoPor: 'x', criadoEm: '2026-11-27' }],
    };
    const crit = criteriosParaPolitica(parametros, ['QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE']);
    expect(crit.map((c) => c.camada)).toEqual(['Qualidade', 'Duplicidades', 'Grupos']);
    const dup = crit[1].itens.map((i) => i.texto);
    expect(dup).toContain('Similaridade mínima para indicar duplicidade: 85%');
    expect(dup.some((t) => t.endsWith(': Não'))).toBe(true);
    expect(crit[1].itens.find((i) => i.manual)?.texto).toBe('Itens de fornecedores diferentes nunca são duplicados');
    expect(crit[0].itens.some((i) => i.texto.includes('corte em 31/12/2025'))).toBe(true);

    const { paginas, corrido } = await leitorPdf();
    const t = corrido(await paginas(await gerarPdfPolitica(dadosCrestani({ criterios: crit }))));
    const sec = t.slice(t.indexOf('7. Critérios das análises'), t.indexOf('8. Versão e pendências'));
    expect(sec).toContain('7.2 Duplicidades');
    expect(sec).toContain('Similaridade mínima para indicar duplicidade: 85%');
    expect(sec).toContain('Verificação manual: Itens de fornecedores diferentes nunca são duplicados');
  }, 60000);
});

async function leitorPdf() {
  type Item = { str?: string };
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs' as string)) as unknown as { getDocument: (o: unknown) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Item[] }> }> }> } };
  const paginas = async (pdf: Buffer) => {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
    const r: string[][] = [];
    for (let i = 1; i <= doc.numPages; i++) r.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => (x.str ?? '').trim()).filter(Boolean));
    return r;
  };
  return { paginas, corrido: (ps: string[][]) => ps.flat().join(' ').replace(/\s+/g, ' ') };
}
