/** Diretrizes: lógica pura (conteúdo, resolução por grupo, parâmetros do motor, casos por aspecto, escopo). */
import { describe, expect, it } from 'vitest';
import { limitesDoErp, type PerfilErp } from '../../erps/logica';
import { AnalisadorNcm } from '../motor/ncm';
import { AnalisadorNomesUnidades } from '../motor/nomes-unidades';
import { AnalisadorQualidade } from '../motor/qualidade';
import type { ContextoMotor } from '../motor/contexto';
import type { ItemTrabalho } from '../tipos';
import { abreviarAte, envolverComDiretrizes, localizar } from './analise';
import { abreviacoesNoSentidoCerto, canonico, conteudoEfetivo, conteudoPadrao, validarAbrangencia, validarConteudo } from './conteudo-regra';
import { fecharEscopo, recortarResultado } from './escopo';
import { alertasDeLimites, converterParametros, limitesEfetivos, linhasDoErp, parametrosDaParticao } from './parametros';
import { criarIndice, gruposSemRegra, retirarSobreposicao, sobreposicoes, subgrupoDosCampos, type RegraResolvivel } from './resolucao';
import type { Aspecto, ConteudoRegra, LinhaLimite } from './tipos';

const it_ = (id: string, x: Partial<ItemTrabalho> = {}): ItemTrabalho => ({
  id, codigo: id, estabelecimento: null, descricao: `Produto ${id}`, unidade: 'UN', ncm: null, grupo: 'G1', ativo: true, saldo: null, ultimaMovimentacao: null,
  fabricante: null, referencia: null, finalidade: null, campos: {}, ...x,
});
const ctx: ContextoMotor = { dataBase: '2026-12-31', atividades: [], erp: null, corteMovimentacao: null };
const regra = (id: string, aspecto: Aspecto, abrangencia: RegraResolvivel['abrangencia'], alteracoes: Record<string, unknown> = {}, extra: Partial<RegraResolvivel> = {}): RegraResolvivel => ({
  id, codigo: id, nome: `Regra ${id}`, aspecto, abrangencia, conteudo: conteudoEfetivo(aspecto, null, alteracoes as Partial<ConteudoRegra>), aprovada: false, ...extra,
});
const status = (f: () => unknown) => { try { f(); return 200; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() ?? 500; } };
const perfilErp = (itens: Record<string, unknown>[], extra: Partial<PerfilErp> = {}): PerfilErp => ({
  id: 'erp-x', nome: 'SAP Business One', situacao: 'COMPLETO', ativo: true, ...extra,
  itens: itens.map((i, n) => ({ id: `i${n}`, tipo_ajuste: null, ordem: n, ativo: true, ...i }) as PerfilErp['itens'][number]),
});
const linha = (x: Partial<LinhaLimite>): LinhaLimite => ({ destino: 'NF-e', campo: 'xProd', campoItem: 'descricao', limite: 20, origem: 'LEIAUTE_OFICIAL', referencia: 'MOC', url: null, confirmado: true, tratamento: 'SUGERIR_ABREVIACAO', preservar: [], ...x });

describe('conteúdo e abrangência', () => {
  it('padrão de cada aspecto é válido e completo; alterações parciais validam só o que veio', () => {
    for (const a of ['NOMES', 'ATRIBUTOS', 'UNIDADES', 'LIMITES', 'FISCAL'] as const) expect(status(() => validarConteudo(a, conteudoPadrao(a), false))).toBe(200);
    expect(validarConteudo('NOMES', { capitalizacao: 'MAIUSCULAS' }, true)).toEqual({ capitalizacao: 'MAIUSCULAS' });
    expect(status(() => validarConteudo('NOMES', { capitalizacao: 'X' }, true))).toBe(400);
    expect(status(() => validarConteudo('NOMES', { campoInventado: 1 }, true))).toBe(400);
    expect(status(() => validarConteudo('LIMITES', { linhas: [linha({ limite: null, confirmado: true })] }, true))).toBe(400); // confirmado sem número não existe
    expect(status(() => validarConteudo('LIMITES', { linhas: [linha({ limite: 0 })] }, true))).toBe(400);
    expect(status(() => validarConteudo('UNIDADES', { conversoes: [{ origem: 'CX', destino: 'UN', fator: 0 }] }, true))).toBe(400);
    expect(status(() => validarConteudo('FISCAL', { excecoesNcm: [{ alvo: 'X', justificativa: 'abc' }] }, true))).toBe(400);
    expect(status(() => validarConteudo('ATRIBUTOS', { atributos: [{ atributo: 'principio ativo', onde: 'CAMPO_PROPRIO', aplicabilidade: 'QUANDO_APLICAVEL' }] }, true))).toBe(400); // falta a condição
  });
  it('conteúdo efetivo = base + alterações (listas substituem); abrangência normaliza espaços e exige grupo', () => {
    const base = conteudoPadrao('NOMES');
    const ef = conteudoEfetivo('NOMES', base, { capitalizacao: 'MAIUSCULAS', abreviacoes: [{ completa: 'PARAFUSO', abreviacao: 'PARAF' }] });
    expect(ef).toMatchObject({ aspecto: 'NOMES', capitalizacao: 'MAIUSCULAS', removerEspacosDuplicados: true, abreviacoes: [{ completa: 'PARAFUSO', abreviacao: 'PARAF' }] });
    expect(validarAbrangencia({ todos: false, grupos: ['PARAFUSOS  E FIXADORES'] })).toEqual({ todos: false, grupos: ['PARAFUSOS E FIXADORES'] });
    expect(status(() => validarAbrangencia({ todos: false, grupos: [] }))).toBe(400);
    expect(canonico({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonico({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });
});

describe('resolução por grupo', () => {
  const todos = regra('N01', 'NOMES', { todos: true });
  const g1 = regra('N02', 'NOMES', { todos: false, grupos: ['G1'] });
  const g1s = regra('N03', 'NOMES', { todos: false, grupos: ['G1'], subgrupos: ['S1'] });
  it('subgrupo > grupo > Todos os grupos; grupo novo e item sem grupo ficam com o padrão', () => {
    const idx = criarIndice([todos, g1, g1s]);
    expect(idx.resolver('G1', 'S1').NOMES?.id).toBe('N03');
    expect(idx.resolver('G1', 'S2').NOMES?.id).toBe('N02');
    expect(idx.resolver('G1 ', null).NOMES?.id).toBe('N02');
    expect(idx.resolver('GRUPO NOVO').NOMES?.id).toBe('N01');
    expect(idx.resolver(null).NOMES?.id).toBe('N01');
    expect(idx.resolver('G1').UNIDADES).toBeUndefined();
  });
  it('sobreposição só no mesmo nível e aspecto; transferência retira o que passa para a nova', () => {
    const outra = regra('N04', 'NOMES', { todos: false, grupos: ['G1', 'G2'] });
    expect(sobreposicoes(g1, [todos, g1s, outra]).map((s) => [s.grupo, s.regraAtual])).toEqual([['G1', 'N04']]);
    expect(sobreposicoes(regra('N09', 'NOMES', { todos: true }), [todos]).map((s) => s.grupo)).toEqual(['Todos os grupos']);
    expect(sobreposicoes(regra('U01', 'UNIDADES', { todos: false, grupos: ['G1'] }), [g1])).toEqual([]);
    expect(retirarSobreposicao(outra.abrangencia, g1.abrangencia)).toEqual({ todos: false, grupos: ['G2'] });
    expect(retirarSobreposicao(todos.abrangencia, { todos: true })).toEqual({ todos: false, grupos: [] });
    expect(retirarSobreposicao({ todos: false, grupos: ['A', 'B'], subgrupos: ['S1', 'S2'] }, { todos: false, grupos: ['A'], subgrupos: ['S1'] })).toBeNull();
    expect(retirarSobreposicao({ todos: false, grupos: ['A', 'B'], subgrupos: ['S1'] }, { todos: false, grupos: ['A'], subgrupos: ['S1'] })).toEqual({ todos: false, grupos: ['B'], subgrupos: ['S1'] });
  });
  it('grupos sem regra por aspecto (regra só de subgrupo não cobre o grupo)', () => {
    const r = gruposSemRegra(['G1', 'G2', '(sem grupo)'], [g1s, regra('U01', 'UNIDADES', { todos: true })]);
    expect(r.find((x) => x.aspecto === 'NOMES')!.grupos).toEqual(['G1', 'G2', '(sem grupo)']);
    expect(r.find((x) => x.aspecto === 'UNIDADES')!.grupos).toEqual([]);
  });
});

describe('parâmetros do motor por grupo e conversão dos parâmetros antigos', () => {
  const antigos = { limites: { descricao: 30, grupo: 10 }, abreviacoesAprovadas: { ESQ: 'ESQUERDO' }, padronizarCaixaAlta: true, politicaUnidade: { ativa: false, regras: { rolo: { grandeza: 'comprimento', fator: 50 } } }, exigeEstabelecimento: true };
  it('converte cada aspecto em regra "Todos os grupos" com os parâmetros legados exatos', () => {
    const conv = converterParametros(antigos, [linha({})]);
    expect(conv.map((c) => c.aspecto)).toEqual(['NOMES', 'UNIDADES', 'LIMITES']);
    expect(conv[0].parametrosLegados).toEqual({ abreviacoesAprovadas: { ESQ: 'ESQUERDO' }, padronizarCaixaAlta: true });
    expect(conv[1].parametrosLegados).toEqual({ politicaUnidade: antigos.politicaUnidade });
    expect(conv[2].parametrosLegados).toEqual({ limites: { descricao: 30, grupo: 10 } });
    expect((conv[2].alteracoes.linhas as LinhaLimite[]).map((l) => [l.campoItem, l.limite, l.origem])).toEqual([['descricao', 30, 'CLIENTE'], ['descricao', 20, 'LEIAUTE_OFICIAL']]);
    for (const c of conv) expect(status(() => validarConteudo(c.aspecto, conteudoEfetivo(c.aspecto, null, c.alteracoes as never), false))).toBe(200);
    expect(converterParametros({})).toEqual([]);
    expect(converterParametros(null)).toEqual([]);
  });
  it('regra legado devolve exatamente os parâmetros antigos; regra nova desliga o limite solto', () => {
    const conv = converterParametros(antigos);
    const r = Object.fromEntries(conv.map((c) => [c.aspecto, regra(c.aspecto, c.aspecto, { todos: true }, c.alteracoes, { legado: true, parametrosLegados: c.parametrosLegados })]));
    expect(parametrosDaParticao(antigos, r)).toEqual(antigos);
    const nova = parametrosDaParticao(antigos, { LIMITES: regra('L1', 'LIMITES', { todos: true }, { linhas: [linha({})] }) });
    expect(nova.limites).toBeUndefined();
    expect(nova.exigeEstabelecimento).toBe(true);
  });
  it('limite efetivo = o MENOR confirmado; não confirmado fica de fora e vira alerta; ERP acima do leiaute avisa', () => {
    const ls = [linha({ limite: 120 }), linha({ destino: 'SAP B1', origem: 'ERP', limite: 200 }), linha({ destino: 'Cliente', origem: 'CLIENTE', limite: 40 }), linha({ destino: 'Outro', limite: null, confirmado: false })];
    expect(limitesEfetivos(ls).get('descricao')!.limite).toBe(40);
    const al = alertasDeLimites(ls);
    expect(al.some((a) => a.includes('SAP B1') && a.includes('acima do leiaute'))).toBe(true);
    expect(al.some((a) => a.includes('Outro') && a.includes('não confirmado'))).toBe(true);
  });
  it('linhas do ERP: só CONFIRMADO com "<n> caracteres" vira limite; o resto entra sem número', () => {
    const l = linhasDoErp(perfilErp([
      { tipo: 'LIMITE_CAMPO', chave: 'descricao', texto: '200 caracteres (OITM.ItemName)', campo_erp: 'OITM.ItemName', fonte_url: 'https://help.sap.com', grau: 'CONFIRMADO' },
      { tipo: 'LIMITE_CAMPO', chave: 'codigo', texto: 'Configurável no ERP', campo_erp: 'B1_COD', fonte_url: null, grau: 'CONFIRMADO' },
      { tipo: 'LIMITE_CAMPO', chave: 'unidade', texto: '8 caracteres', campo_erp: null, fonte_url: null, grau: 'NAO_CONFIRMADO' },
      { tipo: 'RESTRICAO', chave: 'descricao', texto: '10 caracteres', campo_erp: null, fonte_url: null, grau: 'CONFIRMADO' },
    ]));
    expect(l.map((x) => [x.campoItem, x.limite, x.confirmado, x.origem])).toEqual([['descricao', 200, true, 'ERP'], ['codigo', null, false, 'ERP'], ['unidade', null, false, 'ERP']]);
    expect(linhasDoErp(null)).toEqual([]);
  });
  it('linhas do ERP seguem limitesDoErp: ERP inativo ou A_DESENVOLVER fica de fora; ordem do cadastro', () => {
    const itens = [
      { tipo: 'LIMITE_CAMPO', chave: 'codigo', texto: '20 caracteres', campo_erp: 'ItemCode', fonte_url: null, grau: 'CONFIRMADO', ordem: 2 },
      { tipo: 'LIMITE_CAMPO', chave: 'descricao', texto: '200 caracteres', campo_erp: 'ItemName', fonte_url: null, grau: 'CONFIRMADO', ordem: 1 },
    ];
    const l = linhasDoErp(perfilErp(itens));
    expect(l.map((x) => x.campoItem)).toEqual(['descricao', 'codigo']);
    expect(l.map((x) => [x.campoItem, x.limite])).toEqual(limitesDoErp(perfilErp(itens)).map((x) => [x.campoItem, x.limite]));
    expect(linhasDoErp(perfilErp(itens, { situacao: 'A_DESENVOLVER' }))).toEqual([]);
    expect(linhasDoErp(perfilErp(itens, { ativo: false }))).toEqual([]);
  });
});

describe('casos por aspecto (regra nova)', () => {
  const nomes = new AnalisadorNomesUnidades();
  it('sem regra o envoltório devolve o próprio analisador (nada muda)', () => {
    expect(envolverComDiretrizes(nomes, criarIndice([]))).toBe(nomes);
    const soAtrib = envolverComDiretrizes(nomes, criarIndice([regra('A01', 'ATRIBUTOS', { todos: true })]));
    const itens = [it_('1', { descricao: 'parafuso  sextavado', unidade: 'kgs' }), it_('2', { unidade: 'KG' })];
    expect(soAtrib.analisar(itens, ctx)).toEqual(nomes.analisar(itens, ctx));
  });
  it('NOMES: forma pela regra, termo proibido com e sem substituição, componente ausente; nunca inventa', () => {
    const n = regra('N01', 'NOMES', { todos: false, grupos: ['G1'] }, {
      capitalizacao: 'MAIUSCULAS', obrigatorios: ['NOME', 'REFERENCIA', 'MARCA'], termosProibidos: [{ termo: 'pç', substituicao: 'PECA' }, { termo: 'diversos', substituicao: null }],
    });
    const a = envolverComDiretrizes(nomes, criarIndice([n]));
    const itens = [
      it_('1', { descricao: 'Rolamento  6205 pç', fabricante: 'SKF' }),
      it_('2', { descricao: 'ROLAMENTO DIVERSOS 6206', fabricante: 'NSK' }),
      it_('3', { descricao: 'Rolamento sem nada', grupo: 'G2' }),
    ];
    const r = a.analisar(itens, ctx);
    const por = (t: string) => r.casos.filter((c) => c.tipo === t);
    const forma = por('DESCRICAO_FORA_PADRAO').find((c) => c.itens[0] === '1')!;
    expect(forma.proposta).toEqual({ descricao: 'ROLAMENTO 6205 PECA' });
    expect(forma.evidencia.at(-1)).toEqual({ rotulo: 'Regra', valor: 'N01 — Regra N01' });
    expect(por('DESCRICAO_FORA_DO_PADRAO').filter((c) => c.itens.includes('1') || c.itens.includes('2'))).toEqual([]); // a regra nova dá a forma
    expect(por('TERMO_PROIBIDO').map((c) => [c.itens, c.proposta])).toEqual([[['2'], {}]]);
    const comp = por('COMPONENTE_AUSENTE');
    expect(comp.map((c) => c.itens.sort())).toEqual([['1', '2']]); // marca no campo e fora da descrição
    expect(comp[0].proposta).toEqual({});
    // Item de grupo sem regra: análise de antes (forma antiga), sem casos novos.
    expect(r.casos.filter((c) => c.itens.includes('3')).map((c) => c.tipo)).toEqual(nomes.analisar([itens[2]], ctx).casos.map((c) => c.tipo));
  });
  it('LIMITES: menor confirmado; abreviação aprovada com variante por destino; nunca corta; sem abreviação suficiente = revisão; não confirmado = pendência', () => {
    const n = regra('N01', 'NOMES', { todos: true }, { abreviacoes: [{ completa: 'ROLAMENTO', abreviacao: 'ROL' }, { completa: 'BLINDADO', abreviacao: 'BLIND' }] });
    const l = regra('L01', 'LIMITES', { todos: true }, { linhas: [linha({ limite: 25 }), linha({ destino: 'Cliente', origem: 'CLIENTE', limite: 19 }), linha({ destino: 'ERP X', origem: 'ERP', limite: null, confirmado: false })] });
    const a = envolverComDiretrizes(nomes, criarIndice([n, l]));
    const itens = [it_('1', { descricao: 'ROLAMENTO BLINDADO 6205 2RS' }), it_('2', { descricao: 'CORRENTE TRANSMISSAO 40 PASSO 1/2 POLEGADA' }), it_('3', { descricao: 'CURTO' })];
    const r = a.analisar(itens, ctx);
    const ex = r.casos.filter((c) => c.tipo === 'EXCEDE_LIMITE_DESTINO');
    const c1 = ex.find((c) => c.itens[0] === '1')!;
    expect(c1.proposta).toEqual({ descricao: 'ROL BLIND 6205 2RS' });
    expect(c1.evidencia.some((e) => e.rotulo === 'Variante para NF-e' && e.valor.startsWith('ROL BLINDADO 6205 2RS'))).toBe(true);
    expect(c1.afeta).toEqual([]);
    const c2 = ex.find((c) => c.itens[0] === '2')!;
    expect(c2.proposta).toEqual({}); // não coube: revisão, nada cortado
    expect(c2.justificativa).toContain('nunca corta');
    expect(ex.some((c) => c.itens.includes('3'))).toBe(false);
    const pend = r.casos.find((c) => c.tipo === 'LIMITE_NAO_CONFIRMADO')!;
    expect(pend.itens.sort()).toEqual(['1', '2', '3']);
    expect(r.casos.some((c) => c.tipo === 'TAMANHO_EXCEDIDO')).toBe(false);
    expect(abreviarAte('ROLAMENTO SKF', 5, [{ completa: 'SKF', abreviacao: 'S' }], ['SKF']).cabe).toBe(false); // marca preservada não se abrevia
    expect(localizar('Parafuso  inox, PARAFUSO', 'parafuso')).toEqual([[0, 8], [16, 24]]);
    expect(localizar('TUBO 1/2" PVC; AZUL', ';')).toEqual([[13, 14]]);
  });
  it('UNIDADES: unidade de compra/saída não permitida; unidade definida com fator da regra, da tabela ou a informar', () => {
    const u = regra('U01', 'UNIDADES', { todos: true }, {
      criterioEstoque: 'DEFINIDA', unidadeDefinida: 'L', unidadesCompra: ['L', 'GL'], unidadesSaida: ['L'],
      conversoes: [{ origem: 'GL', destino: 'L', fator: 5, abrangencia: 'GRUPO', codigoProduto: null }, { origem: 'BD', destino: 'L', fator: 18, abrangencia: 'PRODUTO', codigoProduto: '9' }],
    });
    const a = envolverComDiretrizes(nomes, criarIndice([u]));
    const itens = [it_('1', { unidade: 'GL', campos: { unidadeCompra: 'CX' } }), it_('2', { unidade: 'ML' }), it_('9', { unidade: 'BD' }), it_('4', { unidade: 'TAMBOR' }), it_('5', { unidade: 'L', campos: { unidadeSaida: 'L' } })];
    const r = a.analisar(itens, ctx);
    const fora = r.casos.filter((c) => c.tipo === 'UNIDADE_FORA_CRITERIO');
    const p = (id: string) => fora.find((c) => c.itens.includes(id))!.proposta;
    expect(p('1')).toMatchObject({ unidade: 'L', unidadeCompra: 'GL', fatorConversao: 5, fatorSituacao: 'DEFINIDO' });
    expect(p('2')).toMatchObject({ unidade: 'L', unidadeCompra: 'ML', fatorConversao: 0.001, fatorSituacao: 'DEFINIDO' });
    expect(p('9')).toMatchObject({ fatorConversao: 18, fatorSituacao: 'DEFINIDO' });
    expect(p('4')).toMatchObject({ fatorConversao: null, fatorSituacao: 'INFORMAR', exigeFator: 'SIM' });
    expect(fora.some((c) => c.itens.includes('5'))).toBe(false);
    expect(r.casos.filter((c) => c.tipo === 'UNIDADE_NAO_PERMITIDA').map((c) => [c.itens, c.atual])).toEqual([[['1'], { unidadeCompra: 'CX' }]]);
  });
  it('ATRIBUTOS (Qualidade): atributo obrigatório ausente vira pendência; não verificável não vira caso; não preenche', () => {
    const q = new AnalisadorQualidade();
    const a = regra('A01', 'ATRIBUTOS', { todos: false, grupos: ['DEF'] }, { atributos: [
      { atributo: 'PRINCIPIO_ATIVO', onde: 'CAMPO_PROPRIO', campo: 'principioAtivo', aplicabilidade: 'OBRIGATORIO' },
      { atributo: 'CONCENTRACAO', onde: 'DESCRICAO', aplicabilidade: 'OBRIGATORIO' },
      { atributo: 'FORMULACAO', onde: 'DESCRICAO', aplicabilidade: 'OBRIGATORIO' },
      { atributo: 'MARCA', onde: 'AMBOS', aplicabilidade: 'QUANDO_APLICAVEL', condicao: 'produtos com marca' },
    ] });
    const w = envolverComDiretrizes(q, criarIndice([a]));
    const itens = [it_('1', { grupo: 'DEF', descricao: 'GLIFOSATO 480 G/L 20L', campos: { principioAtivo: 'Glifosato' } }), it_('2', { grupo: 'DEF', descricao: 'HERBICIDA X 20L' }), it_('3', { descricao: 'OUTRO' })];
    const r = w.analisar(itens, ctx);
    const at = r.casos.filter((c) => c.tipo === 'ATRIBUTO_AUSENTE');
    expect(at.map((c) => c.itens)).toEqual([['2']]);
    expect(at[0].problema).toContain('PRINCIPIO_ATIVO');
    expect(at[0].problema).toContain('CONCENTRACAO');
    expect(at[0].problema).not.toContain('FORMULACAO');
    expect(at[0].proposta).toEqual({});
    const base = q.analisar(itens, ctx);
    expect(r.casos.filter((c) => c.tipo !== 'ATRIBUTO_AUSENTE')).toEqual(base.casos);
  });
  it('FISCAL: exceção justificada e validação desligada tiram o item da camada; casos levam a regra', () => {
    const f = regra('F01', 'FISCAL', { todos: true }, { excecoesNcm: [{ alvo: '2', justificativa: 'Item de uso interno sem NCM' }] });
    const f2 = regra('F02', 'FISCAL', { todos: false, grupos: ['SERV'] }, { validarNcm: false });
    const w = envolverComDiretrizes(new AnalisadorNcm(), criarIndice([f, f2]));
    const r = w.analisar([it_('1'), it_('2'), it_('3', { grupo: 'SERV' })], ctx);
    const ids = r.casos.flatMap((c) => c.itens);
    expect(ids).toContain('1');
    expect(ids).not.toContain('2');
    expect(ids).not.toContain('3');
    expect(r.semProblema).toEqual(expect.arrayContaining(['2', '3']));
    expect(r.casos.every((c) => c.evidencia.some((e) => e.rotulo === 'Regra' && e.valor.startsWith('F01')))).toBe(true);
  });
});

describe('revisão independente (lógica)', () => {
  const nomes = new AnalisadorNomesUnidades();
  it('abreviações: a conversão guarda completa = por extenso e abreviação = a forma curta (chave do parâmetro antigo); o caminho inverso devolve o formato antigo', () => {
    const conv = converterParametros({ abreviacoesAprovadas: { ESQ: 'ESQUERDO', sext: 'SEXTAVADO' } });
    expect(conv[0].alteracoes.abreviacoes).toEqual([{ completa: 'ESQUERDO', abreviacao: 'ESQ' }, { completa: 'SEXTAVADO', abreviacao: 'sext' }]);
    expect(status(() => validarConteudo('NOMES', conteudoEfetivo('NOMES', null, conv[0].alteracoes as never), false))).toBe(200);
    // Regra (já editada, sem legado) com o par certo: a camada reconhece ESQ como aprovada (não aponta "abreviação que esconde atributo").
    const n = regra('N01', 'NOMES', { todos: true }, conv[0].alteracoes);
    expect(parametrosDaParticao({}, { NOMES: n }).abreviacoesAprovadas).toEqual({ esq: 'ESQUERDO', sext: 'SEXTAVADO' });
    const r = envolverComDiretrizes(nomes, criarIndice([n])).analisar([it_('1', { descricao: 'ROLAMENTO 6205 ESQ' })], ctx);
    expect(r.casos.some((c) => c.tipo === 'ABREVIACAO_ESCONDE_ATRIBUTO')).toBe(false);
    // A abreviação serve para encurtar a descrição no limite (completa → abreviação).
    expect(abreviarAte('ROLAMENTO ESQUERDO', 13, n.conteudo.aspecto === 'NOMES' ? n.conteudo.abreviacoes : []).texto).toBe('ROLAMENTO ESQ');
  });
  it('conversão gravada invertida (antes da correção) é lida no sentido certo; par certo não muda', () => {
    const invertida = conteudoEfetivo('NOMES', null, { abreviacoes: [{ completa: 'ESQ', abreviacao: 'ESQUERDO' }, { completa: 'PARAFUSO', abreviacao: 'PARAF' }] });
    expect((abreviacoesNoSentidoCerto(invertida) as { abreviacoes: unknown }).abreviacoes).toEqual([{ completa: 'ESQUERDO', abreviacao: 'ESQ' }, { completa: 'PARAFUSO', abreviacao: 'PARAF' }]);
    const certa = conteudoEfetivo('NOMES', null, { abreviacoes: [{ completa: 'PARAFUSO', abreviacao: 'PARAF' }] });
    expect(abreviacoesNoSentidoCerto(certa)).toBe(certa);
  });
  it('regra de NOMES num grupo não mexe nos casos de unidade nem nos de outro grupo (4 itens ROLO, 2 em G1 e 2 em G2)', () => {
    const itens = [
      it_('1', { descricao: 'Lona preta', unidade: 'ROLO', grupo: 'G1' }), it_('2', { descricao: 'Lona azul', unidade: 'ROLO', grupo: 'G1' }),
      it_('3', { descricao: 'Fita crepe', unidade: 'ROLO', grupo: 'G2' }), it_('4', { descricao: 'Fita dupla  face', unidade: 'ROLO', grupo: 'G2' }),
    ];
    const sem = nomes.analisar(itens, ctx);
    const rolo = sem.casos.filter((c) => c.tipo === 'UNIDADE_SEM_REGRA');
    expect(rolo.map((c) => c.itens)).toEqual([['1', '2', '3', '4']]);
    const n = regra('N01', 'NOMES', { todos: false, grupos: ['G1'] }, { capitalizacao: 'MAIUSCULAS' });
    const com = envolverComDiretrizes(nomes, criarIndice([n])).analisar(itens, ctx);
    expect(com.casos.filter((c) => c.tipo === 'UNIDADE_SEM_REGRA')).toEqual(rolo); // o mesmo caso de 4 itens, idêntico
    const deG2 = (r: typeof sem) => r.casos.filter((c) => c.itens.every((i) => i === '3' || i === '4'));
    expect(deG2(com)).toEqual(deG2(sem)); // G2 sem nenhuma mudança
    expect(com.casos.filter((c) => c.tipo === 'DESCRICAO_FORA_PADRAO').map((c) => c.itens[0]).sort()).toEqual(['1', '2']);
  });
  it('regra de UNIDADES num grupo: grafia dominante e nome padrão continuam calculados sobre a base inteira', () => {
    const itens = [
      ...['1', '2', '3'].map((id) => it_(id, { unidade: 'UNID', grupo: 'G1' })), it_('4', { unidade: 'UN', grupo: 'G2' }), it_('5', { unidade: 'UN', grupo: 'G2' }),
    ];
    const sem = nomes.analisar(itens, ctx);
    const u = regra('U01', 'UNIDADES', { todos: false, grupos: ['G1'] }, { unidadesCompra: ['UN'] });
    const com = envolverComDiretrizes(nomes, criarIndice([u])).analisar(itens, ctx);
    const deG2 = (r: typeof sem) => r.casos.filter((c) => c.itens.some((i) => i === '4' || i === '5')).map((c) => ({ ...c, evidencia: c.evidencia.filter((e) => e.rotulo !== 'Regra') }));
    expect(deG2(com)).toEqual(deG2(sem));
  });
  it('pendência de limite é um conjunto por regra de LIMITES, mesmo com regras de NOMES diferentes por grupo', () => {
    const l = regra('L01', 'LIMITES', { todos: true }, { linhas: [linha({ destino: 'ERP X', origem: 'ERP', limite: null, confirmado: false })] });
    const n = regra('N01', 'NOMES', { todos: false, grupos: ['G1'] }, { capitalizacao: 'MAIUSCULAS' });
    const r = envolverComDiretrizes(nomes, criarIndice([l, n])).analisar([it_('1'), it_('2', { grupo: 'G2' })], ctx);
    expect(r.casos.filter((c) => c.tipo === 'LIMITE_NAO_CONFIRMADO').map((c) => c.itens.sort())).toEqual([['1', '2']]);
  });
  it('subgrupo de base antiga (coluna extra "Subgrupo") vale na resolução, sem reimportar', () => {
    expect(subgrupoDosCampos({ Subgrupo: 'S1' })).toBe('S1');
    expect(subgrupoDosCampos({ 'Sub Grupo': 'S2', Cor: 'Azul' })).toBe('S2');
    expect(subgrupoDosCampos({ subgrupo: 'NOVO', Subgrupo: 'VELHO' })).toBe('NOVO');
    expect(subgrupoDosCampos({ Cor: 'Azul' })).toBeNull();
    const n = regra('N01', 'NOMES', { todos: false, grupos: ['G1'], subgrupos: ['S1'] }, { capitalizacao: 'MAIUSCULAS' });
    const r = envolverComDiretrizes(nomes, criarIndice([n])).analisar([it_('1', { descricao: 'abc', campos: { Subgrupo: 'S1' } }), it_('2', { descricao: 'abc', campos: { Subgrupo: 'S2' } })], ctx);
    expect(r.casos.filter((c) => c.tipo === 'DESCRICAO_FORA_PADRAO').map((c) => c.itens)).toEqual([['1']]);
  });
});

describe('escopo de "aplicar e reanalisar"', () => {
  it('fecha pelos casos de conjunto (produzidos e abertos) e recorta o resultado', () => {
    const e = fecharEscopo(['a'], [{ itens: ['a', 'b'] }, { itens: ['x'] }], [{ itens: ['b', 'c'] }]);
    expect([...e].sort()).toEqual(['a', 'b', 'c']);
    const r = recortarResultado({ camada: 'NOMES_UNIDADES', analisados: 5, semDados: null, casos: [{ itens: ['a', 'b'] }, { itens: ['x'] }] as never, semProblema: ['c', 'y'] }, e);
    expect(r.casos).toHaveLength(1);
    expect(r.semProblema).toEqual(['c']);
  });
});
