import { describe, expect, it } from 'vitest';
import {
  ATIVIDADES, atividadesPF, sugerirAtividades, atividadesDistintas, mapaDeAtividades, regraDoCnae, ehAtividade,
} from './atividades';
import { sugerirFinalidade, sugerirFinalidadePorGrupo } from './finalidade';
import { criarCatalogos, CatalogosFiscais, ClasseFiscal } from './catalogos';
import { enquadrar, chaveDoConjunto, agruparConjuntos, aplicarExcecao, classeVigente } from './enquadramento';
import { cenariosAplicaveis } from './cenarios';
import { AnalisadorTributario, AFETA } from './tributario';
import { CHECKLIST, TIPOS_AJUSTE, impactosDoAjuste, montarImpactos, AnalisadorObrigacoes, FONTES_LEIAUTE, AjusteSped, VALOR_VARIA } from './impactoSped';
import { compararAtividadeComCfop } from './aderencia';
import type { ItemTrabalho } from '../tipos';

// ── Dados sintéticos (fixtures; códigos de classe fictícios exceto o padrão 000001 resolvido pelo catálogo) ──
const classe = (cClassTrib: string, cst: string, reducao: number, extra: Partial<ClasseFiscal> = {}): ClasseFiscal => ({
  cClassTrib, cst, descricao: `Classe ${cClassTrib}`, pctReducaoIbs: reducao, pctReducaoCbs: reducao, vigenciaInicio: '2026-01-01', vigenciaFim: null, ativa: true, fonte: 'fixture', ...extra,
});
function catalogos(opts: { art47?: boolean; ncms?: string[] | null } = {}): CatalogosFiscais {
  return criarCatalogos({
    correlacao: [
      { ncm: '38089329', c_class_trib: '200100', anexo: 'IX', item_lei: 7, descricao_produto: 'Herbicidas (fixture)' },
      { ncm: '12019000', c_class_trib: '200100', anexo: 'IX', item_lei: 3, descricao_produto: 'Sementes de soja (fixture)' },
      { ncm: '3808', c_class_trib: '200100', anexo: 'IX', item_lei: 7, descricao_produto: 'Posição inteira (fixture)' },
      { ncm: '21069090', c_class_trib: '200200', anexo: 'I', item_lei: 26, descricao_produto: 'Fórmulas (fixture)' },
      { ncm: '21069090', c_class_trib: '200300', anexo: 'VI', item_lei: 4, descricao_produto: 'Outro (fixture)' },
      { ncm: '84', c_class_trib: null, anexo: 'XX', item_lei: 9, descricao_produto: 'Capítulo citado (fixture)' },
    ],
    classes: [classe('000001', '000', 0), classe('200100', '200', 0.6), classe('200200', '200', 1), classe('200300', '200', 0.3), classe('200400', '200', 0.5, { vigenciaInicio: '2030-01-01' })],
    ncms: opts.ncms === undefined ? null : opts.ncms,
    dispositivos: opts.art47 === false ? [] : [{ norma: 'lcp-214-2025', caminho: 'art-47' }],
  });
}
const DB = '2026-11-25';
const item = (id: string, p: Partial<ItemTrabalho> = {}): ItemTrabalho => ({
  id, codigo: id, estabelecimento: null, descricao: 'ITEM', unidade: 'UN', ncm: null, grupo: null, ativo: true, saldo: null, ultimaMovimentacao: null,
  fabricante: null, referencia: null, finalidade: null, campos: {}, ...p,
});
const ctx = { dataBase: DB, atividades: [] as string[], erp: null, corteMovimentacao: null };

describe('atividades por CNAE', () => {
  it('mapeia CNAEs do agro e devolve a origem e o motivo', () => {
    const r = sugerirAtividades('0111-3/01', ['0115-6/00', '4683-4/00', '4623-1/09', '4687-7/03', '4789-0/99']);
    const por = (a: string) => r.sugestoes.filter((s) => s.atividade === a).map((s) => s.cnae);
    expect(por('PRODUCAO_AGRICOLA')).toEqual(['0111301', '0115600']);
    expect(por('REVENDA_INSUMOS')).toEqual(['4683400']);
    expect(por('VENDA_RESIDUOS')).toEqual(['4687703']);
    expect(por('COMERCIO_ATACADISTA')).toEqual(['4683400', '4623109', '4687703']);
    expect(por('COMERCIO_VAREJISTA')).toEqual(['4789099']);
    expect(r.sugestoes[0]).toMatchObject({ atividade: 'PRODUCAO_AGRICOLA', tipo: 'PRINCIPAL' });
    expect(r.sugestoes.at(-1)!.tipo).toBe('SECUNDARIA');
    expect(r.sugestoes.every((s) => s.motivo.length > 0)).toBe(true);
  });
  it('CNAE sem regra fica fora, sem chute', () => {
    const r = sugerirAtividades('6911-7/01', ['4611-7/00', '9999-9/99']);
    expect(r.sugestoes).toEqual([]);
    expect(r.semMapeamento.map((s) => s.cnae)).toEqual(['6911701', '4611700', '9999999']);
  });
  it('manutenção de máquinas (divisão 33) é serviço, não indústria', () => {
    expect(atividadesDistintas(sugerirAtividades('3314-7/01'))).toEqual(['PRESTACAO_SERVICO']);
    expect(atividadesDistintas(sugerirAtividades('1061-9/01'))).toEqual(['INDUSTRIALIZACAO']);
    expect(regraDoCnae('01')).toBeNull();
  });
  it('lista fechada e opções de PF válidas', () => {
    expect(atividadesPF.every(ehAtividade)).toBe(true);
    expect(new Set(ATIVIDADES).size).toBe(ATIVIDADES.length);
  });
});

describe('correções da revisão', () => {
  it('CNAE 38 e 49: só o que a CNAE 2.0 justifica', () => {
    expect(atividadesDistintas(sugerirAtividades('3811-4/00'))).toEqual([]);
    expect(atividadesDistintas(sugerirAtividades('3832-7/00'))).toEqual(['VENDA_RESIDUOS']);
    expect(atividadesDistintas(sugerirAtividades('4921-3/01'))).toEqual([]);
    expect(atividadesDistintas(sugerirAtividades('4930-2/02'))).toEqual(['TRANSPORTE']);
  });
  it('mapaDeAtividades separa o que vira atividade do que fica sem efeito', () => {
    const m = mapaDeAtividades(['0111-3/01', '4683-4/00', '3811-4/00', '0111301']);
    expect(m.mapeadas.map((x) => [x.codigo, x.atividade])).toEqual([['0111301', 'PRODUCAO_AGRICOLA'], ['4683400', 'REVENDA_INSUMOS'], ['4683400', 'COMERCIO_ATACADISTA']]);
    expect(m.mapeadas[0].rotulo).toMatch(/agrícola/);
    expect(m.semMapeamento).toEqual(['3811400']);
  });
  it('NCM com linha específica E referência de capítulo: define, mas ressalva a referência', () => {
    const cat2 = criarCatalogos({
      correlacao: [{ ncm: '38089329', c_class_trib: '200100', anexo: 'IX', item_lei: 7, descricao_produto: 'x' }, { ncm: '38', c_class_trib: null, anexo: 'XX', item_lei: 2, descricao_produto: 'cap' }],
      classes: [classe('200100', '200', 0.6)], ncms: null, dispositivos: [],
    });
    const e = enquadrar('38089329', 'REVENDA', 'COMPRA_REVENDA', DB, cat2);
    expect(e.status).toBe('DEFINIDO'); expect(e.observacao).toMatch(/Anexo XX, item 2.*conferir os requisitos/);
  });
  it('uso e consumo cita a vedação do art. 57, § 5º (conceito no caput, exceções no § 3º); devolução pela LC 214 (arts. 12, § 7º, 17 e 47, § 12)', () => {
    const c = enquadrar('73182100', 'USO_CONSUMO', 'USO_CONSUMO', DB, catalogos());
    expect(c.credito!.descricao).toMatch(/art\. 47, caput/); expect(c.credito!.descricao).toMatch(/vedado \(art\. 57, § 5º\)/); expect(c.credito!.descricao).toMatch(/art\. 57, § 3º/);
    expect(c.credito!.descricao).not.toMatch(/conferir no texto oficial/);
    expect(enquadrar('84313990', 'IMOBILIZADO', 'USO_CONSUMO', DB, catalogos()).credito?.descricao ?? '').not.toMatch(/conferir no texto oficial/);
    const d = enquadrar('38089329', 'REVENDA', 'DEVOLUCAO', DB, catalogos());
    // Achado 6: há norma (texto compilado do Planalto, 26/11/2026); o que falta é o regulamento, dito como "não confirmado".
    expect(d.credito!.fundamento).toBe('LC 214/2025, art. 12, § 7º, art. 17 e art. 47, § 12, I e II (incluído pela LC 227/2026); regulamento não confirmado nesta base');
    expect(d.credito!.situacao).toBe('VERIFICAR');
    expect(d.credito!.descricao).toContain('base e alíquota da operação original (LC 214/2025, art. 12, § 7º, e art. 17)');
    expect(d.observacao).toContain('art. 12, § 7º, e art. 17');
    expect(`${d.observacao} ${d.credito!.descricao} ${d.credito!.fundamento}`).not.toMatch(/interpretação|não é norma|regra operacional/i);
  });
});

describe('finalidade', () => {
  it('herbicida: revenda para quem revende, insumo para quem produz, dúvida para quem faz as duas coisas', () => {
    const h = item('1', { descricao: 'HERBICIDA GLIFOSATO 480', grupo: 'Defensivos' });
    expect(sugerirFinalidade(h, ['REVENDA_INSUMOS'])).toMatchObject({ finalidade: 'REVENDA', confianca: 'alta' });
    expect(sugerirFinalidade(h, ['PRODUCAO_AGRICOLA'])).toMatchObject({ finalidade: 'INSUMO_PRODUCAO', confianca: 'alta' });
    const dupla = sugerirFinalidade(h, ['PRODUCAO_AGRICOLA', 'REVENDA_INSUMOS']);
    expect(dupla.confianca).toBe('baixa');
    expect(dupla.alternativas).toContain('INSUMO_PRODUCAO');
    expect(sugerirFinalidade(h, []).finalidade).toBeNull();
  });
  it('semente em cliente produtor é insumo; peça no grupo de manutenção é manutenção', () => {
    expect(sugerirFinalidade(item('2', { descricao: 'SEMENTE DE SOJA RR', grupo: 'Sementes' }), ['PRODUCAO_AGRICOLA']).finalidade).toBe('INSUMO_PRODUCAO');
    expect(sugerirFinalidade(item('3', { descricao: 'ROLAMENTO 6205', grupo: 'Manutenção corpo de máquina' }), ['REVENDA_INSUMOS'])).toMatchObject({ finalidade: 'MANUTENCAO', confianca: 'alta' });
    expect(sugerirFinalidade(item('4', { descricao: 'CORREIA DO ALTERNADOR', grupo: null }), []).finalidade).toBe('MANUTENCAO');
  });
  it('outras finalidades pelo nome e grupo; finalidade informada prevalece', () => {
    expect(sugerirFinalidade(item('5', { descricao: 'BIG BAG 1000KG' }), []).finalidade).toBe('EMBALAGEM');
    expect(sugerirFinalidade(item('6', { descricao: 'LUVA NITRILICA', grupo: 'EPI' }), []).finalidade).toBe('USO_CONSUMO');
    expect(sugerirFinalidade(item('7', { descricao: 'TRATOR 150CV', grupo: 'Máquinas e equipamentos' }), []).finalidade).toBe('IMOBILIZADO');
    expect(sugerirFinalidade(item('8', { descricao: 'SOJA EM PODER DE TERCEIROS' }), []).finalidade).toBe('MATERIAL_TERCEIROS');
    expect(sugerirFinalidade(item('9', { descricao: 'ALGO', finalidade: 'REVENDA' }), []).motivo).toMatch(/já presente no item/);
    expect(sugerirFinalidade(item('10', { descricao: 'PRODUTO X' }), [])).toMatchObject({ finalidade: null, confianca: 'baixa' });
  });
  it('diesel só vira insumo quando o cliente tem atividade que o consome', () => {
    const d = item('11', { descricao: 'OLEO DIESEL S10' });
    expect(sugerirFinalidade(d, ['PRODUCAO_AGRICOLA']).finalidade).toBe('INSUMO_PRODUCAO');
    expect(sugerirFinalidade(d, ['COMERCIO_VAREJISTA']).finalidade).toBeNull();
  });
  it('agrega por grupo: dominante, distribuição e exceções', () => {
    const itens = [
      ...['A', 'B', 'C', 'D'].map((i) => item(`g${i}`, { descricao: `HERBICIDA ${i}`, grupo: 'Defensivos' })),
      item('gx', { descricao: 'LUVA', grupo: 'Defensivos' }), item('gy', { descricao: 'PRODUTO Y', grupo: 'Defensivos' }),
    ];
    const [g] = sugerirFinalidadePorGrupo(itens, ['REVENDA_INSUMOS']);
    // O grupo "Defensivos" (plural) já indica insumo: o item sem indício no nome herda do grupo.
    expect(g).toMatchObject({ grupo: 'Defensivos', total: 6, dominante: 'REVENDA', semSugestao: 0 });
    expect(g.distribuicao).toEqual({ REVENDA: 5, USO_CONSUMO: 1 });
    expect(g.excecoes.map((e) => e.itemId)).toEqual(['gx']);
  });
  it('contexto do grupo com dominante ≥70% resolve item sem indício', () => {
    const s = sugerirFinalidade(item('z', { descricao: 'PRODUTO Z', grupo: 'G' }), [], { grupo: 'G', distribuicao: { REVENDA: 8, USO_CONSUMO: 1 } });
    expect(s).toMatchObject({ finalidade: 'REVENDA', confianca: 'media' });
  });
});

describe('enquadramento', () => {
  const cat = catalogos();
  it('herbicida revenda: classe do anexo, artigo, CST, vigência e crédito em regra', () => {
    const e = enquadrar('3808.93.29', 'REVENDA', 'COMPRA_REVENDA', DB, cat);
    expect(e).toMatchObject({ status: 'DEFINIDO', cClassTrib: '200100', cst: '200', origem: 'HERDADO', artigo: 'Anexo IX, item 7 (LC 214/2025)' });
    expect(e.enquadramentoLegal).toContain('Herbicidas');
    expect(e.vigencia).toEqual({ inicio: '2026-01-01', fim: null });
    expect(e.reducao).toEqual({ ibs: 0.6, cbs: 0.6 });
    expect(e.credito).toMatchObject({ situacao: 'EM_REGRA', fundamento: 'LC 214/2025, art. 47, caput, § 1º, II, e § 2º; art. 57, caput e §§ 3º e 5º (redação da LC 227/2026)' });
    // Achado 5: o crédito vem com as condições do art. 47 (débito extinto, documento idôneo, valor destacado e extinto ou presumido).
    expect(e.credito!.descricao).toBe('Crédito na aquisição (regime regular) quando extinto o débito da operação e comprovado por documento fiscal eletrônico idôneo; valor = imposto destacado e extinto ou crédito presumido (LC 214/2025, art. 47, caput, § 1º, II, e § 2º); confirmar o regime do cliente');
    expect(e.observacao).toMatch(/Anexo IX/);
  });
  it('peça/manutenção sem anexo: tributação padrão resolvida pela tabela; crédito a verificar', () => {
    const e = enquadrar('73182100', 'MANUTENCAO', 'USO_CONSUMO', DB, cat);
    expect(e).toMatchObject({ status: 'DEFINIDO', cClassTrib: '000001', cst: '000' });
    expect(e.credito!.situacao).toBe('VERIFICAR');
  });
  it('sem base: NCM ausente/inexistente, finalidade nula, ambíguo, posição, referência, fora de vigência, padrão não carregado', () => {
    expect(enquadrar('3808', 'REVENDA', 'VENDA', DB, cat).motivoSeAguardando).toMatch(/8 dígitos/);
    expect(enquadrar(null, 'REVENDA', 'VENDA', DB, cat).status).toBe('AGUARDANDO_INFORMACAO');
    expect(enquadrar('38089329', 'REVENDA', 'VENDA', DB, catalogos({ ncms: ['12019000'] })).motivoSeAguardando).toMatch(/não consta/);
    expect(enquadrar('38089329', null, 'VENDA', DB, cat).motivoSeAguardando).toMatch(/Finalidade/);
    expect(enquadrar('21069090', 'REVENDA', 'VENDA', DB, cat).motivoSeAguardando).toMatch(/200200, 200300|200300, 200200/);
    const refs = enquadrar('84311000', 'IMOBILIZADO', 'USO_CONSUMO', DB, cat);
    expect(refs.status).toBe('AGUARDANDO_INFORMACAO'); expect(refs.motivoSeAguardando).toMatch(/Anexo XX/);
    const semPadrao = criarCatalogos({ correlacao: [], classes: [], ncms: null, dispositivos: [] });
    expect(enquadrar('84313990', 'MANUTENCAO', 'USO_CONSUMO', DB, semPadrao).motivoSeAguardando).toMatch(/SVRS/);
    expect(classeVigente(cat, '200400', DB).motivo).toMatch(/sem versão vigente/);
    expect(classeVigente(cat, '200400', '2031-01-01').classe?.cClassTrib).toBe('200400');
  });
  it('anexo que especifica só a posição fica aguardando (não sugere classe por prefixo curto)', () => {
    const e = enquadrar('38089999', 'REVENDA', 'COMPRA_REVENDA', DB, cat);
    expect(e.status).toBe('AGUARDANDO_INFORMACAO'); expect(e.motivoSeAguardando).toMatch(/só a posição/);
  });
  it('cenário incompatível e material de terceiros aguardam', () => {
    expect(enquadrar('38089329', 'REVENDA', 'USO_CONSUMO', DB, cat).motivoSeAguardando).toMatch(/não se aplica/);
    expect(enquadrar('38089329', 'MATERIAL_TERCEIROS', 'COMPRA_REVENDA', DB, cat).status).toBe('AGUARDANDO_INFORMACAO');
    expect(cenariosAplicaveis('MATERIAL_TERCEIROS')).toEqual([]);
  });
  it('venda não gera crédito; art. 47 não carregado vira "não confirmado"', () => {
    expect(enquadrar('38089329', 'REVENDA', 'VENDA', DB, cat).credito!.situacao).toBe('NAO_SE_APLICA');
    const sem = enquadrar('38089329', 'REVENDA', 'COMPRA_REVENDA', DB, catalogos({ art47: false }));
    expect(sem.credito!.fundamento).toMatch(/não confirmado/);
  });
  it('devolução espelha a operação original', () => {
    const venda = enquadrar('38089329', 'REVENDA', 'VENDA', DB, cat);
    const dev = enquadrar('38089329', 'REVENDA', 'DEVOLUCAO', DB, cat);
    expect(dev).toMatchObject({ cenario: 'DEVOLUCAO', cClassTrib: venda.cClassTrib, cst: venda.cst });
    expect(dev.credito!.descricao).toContain('Devolução de venda (o cliente é o fornecedor: art. 47, § 12, II)');
    const devCompra = enquadrar('38089329', 'REVENDA', 'DEVOLUCAO', DB, cat, { operacaoOriginal: 'COMPRA_REVENDA' });
    expect(devCompra.credito!.descricao).toContain('Devolução de compra (o cliente é o adquirente: art. 47, § 12, I)');
    expect(devCompra.cClassTrib).toBe(venda.cClassTrib);
  });
});

describe('conjunto e exceção', () => {
  const cat = catalogos();
  it('chave = NCM de 8 dígitos + finalidade; incompletos ficam em conjuntos SEM_', () => {
    expect(chaveDoConjunto(item('a', { ncm: '3808.93.29', finalidade: 'REVENDA' }))).toBe('38089329|REVENDA');
    expect(chaveDoConjunto(item('b', { ncm: '3808', finalidade: 'REVENDA' }))).toBe('SEM_NCM|REVENDA');
    expect(chaveDoConjunto(item('c', { ncm: '38089329' }))).toBe('38089329|SEM_FINALIDADE');
    const m = agruparConjuntos([item('a', { ncm: '38089329', finalidade: 'REVENDA' }), item('b', { ncm: '38089329', finalidade: 'INSUMO_PRODUCAO' }), item('c', { ncm: '38089329', finalidade: 'REVENDA' })]);
    expect([...m.keys()]).toEqual(['38089329|INSUMO_PRODUCAO', '38089329|REVENDA']);
    expect(m.get('38089329|REVENDA')!.length).toBe(2);
  });
  it('exceção exige motivo e classe vigente; marca origem EXCECAO', () => {
    const herdado = enquadrar('38089329', 'REVENDA', 'VENDA', DB, cat);
    expect(aplicarExcecao(herdado, null, DB, cat)).toBe(herdado);
    expect(aplicarExcecao(herdado, { motivo: '', cClassTrib: '200200' }, DB, cat)).toMatchObject({ origem: 'EXCECAO', status: 'AGUARDANDO_INFORMACAO' });
    expect(aplicarExcecao(herdado, { motivo: 'Produto de outra posição', cClassTrib: '999999' }, DB, cat).motivoSeAguardando).toMatch(/não consta/);
    const ok = aplicarExcecao(herdado, { motivo: 'Produto enquadrado em outro item', cClassTrib: '200200' }, DB, cat);
    expect(ok).toMatchObject({ origem: 'EXCECAO', status: 'DEFINIDO', cClassTrib: '200200' });
    expect(herdado.cClassTrib).toBe('200100'); // não muda o herdado
  });
});

describe('camada TRIBUTARIO', () => {
  const cat = catalogos();
  const itens = [
    item('h1', { ncm: '38089329', finalidade: 'REVENDA' }), item('h2', { ncm: '38089329', finalidade: 'REVENDA', campos: { cClassTrib: '200100' } }),
    item('h3', { ncm: '38089329', finalidade: 'REVENDA' }),
    item('s1', { ncm: '12019000', finalidade: 'INSUMO_PRODUCAO' }),
    item('n1', { ncm: null, finalidade: 'REVENDA' }), item('f1', { ncm: '12019000', finalidade: null }),
    item('t1', { ncm: '38089329', finalidade: 'MATERIAL_TERCEIROS' }),
    item('a1', { ncm: '21069090', finalidade: 'REVENDA' }),
  ];
  const r = new AnalisadorTributario(cat, { excecoes: { h3: { motivo: 'Produto de outro item do anexo', cClassTrib: '200200' } } }).analisar(itens, ctx);
  it('gera casos por conjunto, não por item, e aponta aguardando informação', () => {
    const conj = r.casos.find((c) => c.tipo === 'ENQUADRAMENTO_CONJUNTO' && c.itens.includes('h1'))!;
    expect(conj.itens).toEqual(['h1']); // h2 já confere (sem problema) e h3 é exceção
    expect(conj.proposta).toMatchObject({ cClassTrib: '200100', origem: 'HERDADO' });
    expect(conj.afeta).toEqual(['OBRIGACOES']);
    expect(r.semProblema).toEqual(['h2']);
    expect(r.casos.find((c) => c.tipo === 'EXCECAO_ITEM')).toMatchObject({ itens: ['h3'], proposta: { cClassTrib: '200200', origem: 'EXCECAO' } });
    expect(r.casos.find((c) => c.tipo === 'AGUARDANDO_NCM')!.itens).toEqual(['n1']);
    expect(r.casos.find((c) => c.tipo === 'AGUARDANDO_FINALIDADE')!.itens).toEqual(['f1']);
    const ag = r.casos.filter((c) => c.tipo === 'AGUARDANDO_INFORMACAO').flatMap((c) => c.itens).sort();
    expect(ag).toEqual(['a1', 't1']);
    expect(r.semDados).toEqual({ motivo: expect.any(String), itens: 4 });
    expect(r.analisados).toBe(8);
  });
  it('é determinística', () => {
    const r2 = new AnalisadorTributario(cat, { excecoes: { h3: { motivo: 'Produto de outro item do anexo', cClassTrib: '200200' } } }).analisar([...itens].reverse(), ctx);
    const norm = (x: typeof r) => JSON.stringify(x.casos.map((c) => [c.tipo, [...c.itens].sort()]).sort());
    expect(norm(r2)).toBe(norm(r));
  });
  it('dependências coerentes com o plano', () => {
    expect(AFETA.GRUPOS_FINALIDADE).toEqual(['TRIBUTARIO', 'OBRIGACOES']);
    expect(AFETA.NCM).toEqual(['TRIBUTARIO', 'OBRIGACOES']);
    expect(AFETA.NOMES_UNIDADES).toContain('OBRIGACOES');
  });
});

describe('impacto no SPED', () => {
  it('inativação pura (INATIVOU): só 0200 e H010 da EFD ICMS/IPI, sem 0205, 0221, C170 nem F150; consolidação segue completa', () => {
    const regs = CHECKLIST.INATIVOU.registros;
    expect(regs.map((r) => `${r.obrigacao}:${r.registro}`)).toEqual(['EFD_ICMS_IPI:0200', 'EFD_ICMS_IPI:H010']);
    expect(regs.every((r) => r.conferido && r.semValor)).toBe(true);
    expect(regs[0].ressalva).toMatch(/3.2.4, registro 0200: "somente devem ser apresentados itens referenciados nos demais blocos"/);
    expect(regs[0].verificar).toMatch(/não pode ser reutilizado/);
    expect(regs[1].verificar).toMatch(/não pode ter saldo no inventário/);
    expect(CHECKLIST.INATIVOU.rotulo).toBe('Inativou código');
    const linhas = impactosDoAjuste('INATIVOU', { dataBase: DB });
    expect(linhas.map((l) => l.registro)).toEqual(['0200', 'H010']);
    expect(linhas[0]).toMatchObject({ tipo: 'CADASTRAL_FUTURO', avaliarAnteriores: false, valorOriginal: null });
    expect(CHECKLIST.CONSOLIDOU_INATIVOU.registros.map((r) => r.registro)).toEqual(['0200', '0205', '0221', 'H010', 'C170', 'F150']);
  });
  it('checklist cobre os 7 tipos, conferido nas fontes oficiais de 26/11/2026', () => {
    expect(TIPOS_AJUSTE.length).toBe(7);
    const regs = (t: (typeof TIPOS_AJUSTE)[number]) => CHECKLIST[t].registros.map((r) => r.registro);
    expect(regs('MUDOU_CODIGO_DESCRICAO')).toEqual(expect.arrayContaining(['0200', '0205']));
    expect(regs('MUDOU_UNIDADE')).toEqual(expect.arrayContaining(['0190', '0220']));
    expect(regs('CONSOLIDOU_INATIVOU')).toEqual(expect.arrayContaining(['0221', 'H010']));
    expect(regs('MUDOU_NCM')).toEqual(expect.arrayContaining(['0200', 'C170']));
    expect(regs('ITEM_ATIVO_IMOBILIZADO')).toEqual(expect.arrayContaining(['0300']));
    expect(regs('ITEM_ATIVO_IMOBILIZADO')).toEqual(expect.arrayContaining(['G110', 'G125'])); expect(regs('ITEM_ATIVO_IMOBILIZADO')).not.toContain('G110/G125');
    const g125 = CHECKLIST.ITEM_ATIVO_IMOBILIZADO.registros.find((r) => r.registro === 'G125')!;
    expect(g125.campos).toEqual(['COD_IND_BEM', 'DT_MOV', 'TIPO_MOV']);
    // O 0220 não existe na EFD-Contribuições (Guia Prático 1.35).
    expect(CHECKLIST.MUDOU_UNIDADE.registros.some((r) => r.obrigacao === 'EFD_CONTRIBUICOES' && r.registro === '0220')).toBe(false);
    // COD_ANT_ITEM não é preenchido no 0200: o código anterior vai no 0205.
    for (const t of TIPOS_AJUSTE) for (const r of CHECKLIST[t].registros.filter((x) => x.registro === '0200')) expect(r.campos).not.toContain('COD_ANT_ITEM');
    expect(CHECKLIST.MUDOU_CODIGO_DESCRICAO.registros.find((r) => r.obrigacao === 'EFD_ICMS_IPI' && r.registro === '0200')!.verificar).toMatch(/não é preenchido no 0200/);
    // Todos conferidos, exceto o alerta do F150 de 2027 (NT 13/2026, alterações previstas, sem leiaute final).
    for (const t of TIPOS_AJUSTE) expect(CHECKLIST[t].registros.filter((r) => r.registro !== 'F150').every((r) => r.conferido === true)).toBe(true);
    expect(Object.values(FONTES_LEIAUTE).every((f) => f.status === 'CONFIRMADO' && !!f.versaoConferida)).toBe(true);
    expect(FONTES_LEIAUTE.EFD_ICMS_IPI.versaoConferida).toMatch(/3\.2\.4.*Ato COTEPE\/ICMS 86\/2026.*leiaute 020.*021 a partir de 01\/01\/2027.*NT 2026\.001/);
    expect(FONTES_LEIAUTE.EFD_ICMS_IPI.url).toMatch(/^https:\/\/www\.gov\.br\/sped\/.*guia-pratico-efd-versao-3-2-4/);
    expect(FONTES_LEIAUTE.EFD_CONTRIBUICOES.url).toMatch(/^https:\/\/www\.gov\.br\/sped\/.*versao_1_35/);
    expect(FONTES_LEIAUTE.EFD_CONTRIBUICOES.versaoConferida).toMatch(/NT 11\/2026 e NT 13\/2026/);
    expect(FONTES_LEIAUTE.EFD_CONTRIBUICOES.nota).toMatch(/não confirmado: a tabela 3\.1\.1 do Guia 1\.35 vai até o código 006/);
    for (const t of TIPOS_AJUSTE) for (const r of CHECKLIST[t].registros) expect(r.ressalva ?? '').not.toMatch(/3\.2\.2/);
    expect(FONTES_LEIAUTE.NFE.versaoConferida).toMatch(/v1\.53/);
    expect(CHECKLIST.MUDOU_TRATAMENTO.registros.find((r) => r.obrigacao === 'EFD_ICMS_IPI')!.ressalva).toMatch(/não tem campo de CST de IBS\/CBS/);
  });
  it('impactosDoAjuste: versão conferida só onde há fonte para o ano, aplicabilidade pelas obrigações do cliente, tipo por ajuste', () => {
    const aberto = impactosDoAjuste('MUDOU_NCM', { dataBase: DB });
    expect(aberto.every((l) => l.aplicabilidade === 'A_CONFIRMAR')).toBe(true);
    expect(aberto.filter((l) => l.obrigacao === 'EFD_ICMS_IPI').every((l) => l.versaoLeiaute.startsWith('020'))).toBe(true);
    expect(aberto.filter((l) => l.obrigacao !== 'EFD_ICMS_IPI').every((l) => l.versaoLeiaute === 'não confirmado')).toBe(true);
    const em2027 = impactosDoAjuste('MUDOU_NCM', { dataBase: '2027-03-31' });
    expect(em2027.filter((l) => l.obrigacao === 'EFD_ICMS_IPI').every((l) => l.versaoLeiaute === '021 (NT 2026.001, Ato COTEPE/ICMS 69/2026)')).toBe(true);
    expect(em2027.filter((l) => l.obrigacao !== 'EFD_ICMS_IPI').every((l) => l.versaoLeiaute === 'não confirmado')).toBe(true);
    expect(impactosDoAjuste('MUDOU_NCM', { dataBase: '2028-01-31' }).every((l) => l.versaoLeiaute === 'não confirmado')).toBe(true);
    expect(aberto[0]).toMatchObject({ tipo: 'CADASTRAL_FUTURO', competencia: '2026-11', avaliarAnteriores: true });
    const f = impactosDoAjuste('MUDOU_NCM', { dataBase: DB, obrigacoes: ['EFD_ICMS_IPI'], versaoLeiaute: { EFD_ICMS_IPI: 'X.YZ' } });
    expect(f.find((l) => l.obrigacao === 'EFD_ICMS_IPI')).toMatchObject({ aplicabilidade: 'APLICAVEL', versaoLeiaute: 'X.YZ' });
    expect(f.find((l) => l.obrigacao === 'NFE')!.aplicabilidade).toBe('NAO_APLICAVEL');
    expect(impactosDoAjuste('CONSOLIDOU_INATIVOU', { dataBase: DB })[0].tipo).toBe('REGULARIZACAO_SALDO');
    expect(impactosDoAjuste('MUDOU_UNIDADE', { dataBase: DB }, { escrituracaoEntregue: true })[0].tipo).toBe('ESCRITURACAO_ENTREGUE');
    expect(impactosDoAjuste('CONSOLIDOU_INATIVOU', { dataBase: DB }).find((l) => l.registro === '0221')!.ressalva).toMatch(/TIPO_ITEM 00.*UF do declarante/);
  });
  it('estoque de abertura de 2027: alerta F150 sem valores só nos ajustes que mudam o inventário; ressalvas de 2027 da EFD-Contribuições', () => {
    const f150 = (t: (typeof TIPOS_AJUSTE)[number]) => CHECKLIST[t].registros.filter((r) => r.registro === 'F150');
    for (const t of ['CONSOLIDOU_INATIVOU', 'MUDOU_UNIDADE'] as const) {
      const [r] = f150(t);
      expect(f150(t)).toHaveLength(1);
      expect(r).toMatchObject({ obrigacao: 'EFD_CONTRIBUICOES', semValor: true, conferido: false });
      expect(r.verificar).toBe('Estoque de abertura de 01/01/2027 (EFD-Contribuições, F150, crédito presumido de CBS do art. 381 da LC 214/2025): conferir o inventário de 31/12/2026 por item (H010) e a memória de cálculo');
      expect(r.ressalva).toMatch(/NT EFD-Contribuições 13\/2026 \(alterações previstas\)/);
    }
    for (const t of TIPOS_AJUSTE.filter((x) => x !== 'CONSOLIDOU_INATIVOU' && x !== 'MUDOU_UNIDADE')) expect(f150(t)).toHaveLength(0);
    expect(f150('INATIVOU')).toHaveLength(0);
    const linha = impactosDoAjuste('CONSOLIDOU_INATIVOU', { dataBase: DB }, { valorOriginal: 'A1', valorProposto: 'A2' }).find((l) => l.registro === 'F150')!;
    expect(linha).toMatchObject({ valorOriginal: null, valorProposto: null, registroConferido: false });
    expect(CHECKLIST.ITEM_ATIVO_IMOBILIZADO.registros.find((r) => r.registro === 'F120/F130')!.ressalva).toMatch(/art\. 380; NT EFD-Contribuições 13\/2026, alterações previstas/);
    for (const reg of ['C170', 'M100/M500']) expect(CHECKLIST.MUDOU_TRATAMENTO.registros.find((r) => r.obrigacao === 'EFD_CONTRIBUICOES' && r.registro === reg)!.ressalva).toMatch(/NT EFD-Contribuições 11\/2026/);
    expect(CHECKLIST.MUDOU_TRATAMENTO.registros.find((r) => r.obrigacao === 'EFD_ICMS_IPI')!.ressalva).toMatch(/nem no leiaute 021.*Guia Prático 3\.2\.4, Cap\. I, Seção 10/);
  });
  const ajustes: AjusteSped[] = [
    { tipo: 'MUDOU_NCM', itemId: 'i1', valorOriginal: '38089999', valorProposto: '38089329', motivo: 'NCM corrigido', status: 'APROVADO', inicio: '2027-01-01' },
    { tipo: 'MUDOU_NCM', itemId: 'i2', valorOriginal: '12019000', valorProposto: '12019100', motivo: 'NCM corrigido', status: 'PROPOSTO' },
    { tipo: 'MUDOU_UNIDADE', itemId: 'i3', valorOriginal: 'SC', valorProposto: 'KG', motivo: 'Conversão', status: 'PROPOSTO' },
  ];
  it('camada OBRIGACOES: um caso por tipo de ajuste, com os registros e a competência inicial', () => {
    const its = ['i1', 'i2', 'i3', 'i4'].map((id) => item(id));
    const r = new AnalisadorObrigacoes(ajustes).analisar(its, ctx);
    expect(r.casos.map((c) => c.tipo)).toEqual(['IMPACTO_MUDOU_UNIDADE', 'IMPACTO_MUDOU_NCM']);
    const ncm = r.casos.find((c) => c.tipo === 'IMPACTO_MUDOU_NCM')!;
    expect(ncm.itens).toEqual(['i1', 'i2']);
    expect(ncm.evidencia.find((e) => e.rotulo === 'Competência inicial')!.valor).toBe('2026-11');
    expect(ncm.evidencia.some((e) => e.rotulo.includes('C170'))).toBe(true);
    expect(ncm.fundamento).toMatch(/Guia Prático 3\.2\.4/); expect(ncm.fundamento).toMatch(/NT 2025\.002-RTC v1\.53/); expect(ncm.fundamento).toMatch(/COD_VER do 0000\) não confirmado/);
    expect(ncm.fundamento).not.toMatch(/leiaute não confirmado nesta entrega/);
    expect(r.semProblema).toEqual(['i4']);
    expect(r.camada).toBe('OBRIGACOES');
  });
  it('montarImpactos devolve linhas ajuste × registro, estáveis', () => {
    const a = montarImpactos(ajustes, { dataBase: DB });
    const b = montarImpactos([...ajustes].reverse(), { dataBase: DB });
    expect(a.length).toBe(CHECKLIST.MUDOU_NCM.registros.length * 2 + CHECKLIST.MUDOU_UNIDADE.registros.length);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.find((l) => l.itemId === 'i1')).toMatchObject({ valorOriginal: '38089999', valorProposto: '38089329', inicio: '2027-01-01', competencia: '2027-01' });
  });
});

describe('aderência atividade × CFOP', () => {
  it('exportação e importação sem a atividade confirmada divergem', () => {
    const d = compararAtividadeComCfop(['PRODUCAO_AGRICOLA'], [{ cfop: '7.101', valor: 500 }, '3102', { cfop: '5101' }]);
    expect(d.map((x) => [x.cfop, x.familia])).toEqual([['7101', 'EXPORTACAO'], ['3102', 'IMPORTACAO']]);
    expect(d[0].atividadesEsperadas).toEqual(['EXPORTACAO']);
    expect(d[0].descricaoCfop).toBeTruthy();
  });
  it('venda de mercadoria de terceiros em cliente só produtor diverge; produção própria em revenda pura diverge', () => {
    expect(compararAtividadeComCfop(['PRODUCAO_AGRICOLA'], ['5102']).map((x) => x.familia)).toEqual(['VENDA_MERCADORIA_TERCEIROS']);
    expect(compararAtividadeComCfop(['REVENDA_INSUMOS'], ['6101']).map((x) => x.familia)).toEqual(['VENDA_PRODUCAO_PROPRIA']);
    expect(compararAtividadeComCfop(['REVENDA_INSUMOS', 'EXPORTACAO'], ['5102', '7102'])).toEqual([]);
  });
  it('transporte sem a atividade diverge; CFOP fora das famílias e duplicados são ignorados', () => {
    expect(compararAtividadeComCfop(['PRODUCAO_AGRICOLA'], ['5351', '5351']).map((x) => x.cfop)).toEqual(['5351']);
    expect(compararAtividadeComCfop([], ['5949', 'abc'])).toEqual([]);
  });
});

describe('QA 30 mil: valores honestos no impacto no SPED', () => {
  const ctxA = { dataBase: '2026-12-31', atividades: [], erp: null, corteMovimentacao: null };
  const itens = ['a', 'b', 'c'].map((id) => ({ id, codigo: id, estabelecimento: null, descricao: id, unidade: 'UN', ncm: null, grupo: null, ativo: true, saldo: null, ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {} }));
  it('caso de obrigação com valores diferentes por item não mostra o valor do primeiro item como se fosse do conjunto', () => {
    const ajustes: AjusteSped[] = [
      { tipo: 'CONSOLIDOU_INATIVOU', itemId: 'a', valorOriginal: '00032', valorProposto: '00032', motivo: 'm', status: 'APROVADO' },
      { tipo: 'CONSOLIDOU_INATIVOU', itemId: 'b', valorOriginal: '00077', valorProposto: '00077', motivo: 'm', status: 'APROVADO' },
    ];
    const r = new AnalisadorObrigacoes(ajustes).analisar(itens, ctxA);
    const caso = r.casos.find((c) => c.tipo === 'IMPACTO_CONSOLIDOU_INATIVOU')!;
    expect(caso.itens).toEqual(['a', 'b']);
    expect(caso.proposta.valorProposto).toBe(VALOR_VARIA);
    expect(caso.atual.valorOriginal).toBe(VALOR_VARIA);
    expect(r.semProblema).toEqual(['c']);
  });
  it('com o mesmo valor em todos os ajustes, o valor aparece', () => {
    const ajustes: AjusteSped[] = ['a', 'b'].map((itemId) => ({ tipo: 'MUDOU_UNIDADE', itemId, valorOriginal: 'KGS', valorProposto: 'KG', motivo: 'm', status: 'PROPOSTO' }));
    const caso = new AnalisadorObrigacoes(ajustes).analisar(itens, ctxA).casos[0];
    expect(caso.proposta.valorProposto).toBe('KG');
    expect(caso.atual.valorOriginal).toBe('KGS');
  });
  it('C170 de MUDOU_NCM não leva NCM no campo COD_ITEM (o C170 não tem NCM): só o 0200 e a NF-e levam os valores', () => {
    const linhas = impactosDoAjuste('MUDOU_NCM', { dataBase: '2026-12-31' }, { valorOriginal: '31010000', valorProposto: '31051000' });
    const c170 = linhas.find((l) => l.registro === 'C170')!;
    expect(c170.campo).toBe('COD_ITEM');
    expect(c170.valorOriginal).toBeNull();
    expect(c170.valorProposto).toBeNull();
    expect(linhas.find((l) => l.registro === '0200' && l.obrigacao === 'EFD_ICMS_IPI')).toMatchObject({ campo: 'COD_NCM', valorOriginal: '31010000', valorProposto: '31051000' });
    expect(linhas.find((l) => l.obrigacao === 'NFE')).toMatchObject({ valorProposto: '31051000' });
    // o mesmo conceito: CST/cClassTrib nunca aparece em campo de CST do ICMS/PIS nem na apuração
    for (const l of impactosDoAjuste('MUDOU_TRATAMENTO', { dataBase: '2026-12-31' }, { valorOriginal: '000001', valorProposto: '200003' })) {
      if (l.obrigacao === 'NFE') expect(l.valorProposto).toBe('200003'); else expect(l.valorProposto).toBeNull();
    }
  });
});

describe('revisão fiscal (achados 4, 5, 6 e 11)', () => {
  const cat = catalogos();
  it('achado 4: a exceção do item traz o enquadramento e o artigo da própria classe ("não confirmado"), nunca os herdados do conjunto', () => {
    const itens = [item('h1', { ncm: '38089329', finalidade: 'REVENDA' }), item('h3', { ncm: '38089329', finalidade: 'REVENDA' })];
    const r = new AnalisadorTributario(cat, { excecoes: { h3: { motivo: 'Produto de outro item do anexo', cClassTrib: '200200' } } }).analisar(itens, ctx);
    const ex = r.casos.find((c) => c.tipo === 'EXCECAO_ITEM')!;
    expect(ex.proposta).toMatchObject({ cClassTrib: '200200', artigo: 'não confirmado', enquadramentoLegal: 'cClassTrib 200200: Classe 200200 (tabela cClassTrib da SVRS)', origem: 'EXCECAO' });
    expect(String(ex.proposta.enquadramentoLegal)).not.toContain('Anexo IX');
    const herdado = enquadrar('38089329', 'REVENDA', 'COMPRA_REVENDA', DB, cat);
    const e = aplicarExcecao(herdado, { motivo: 'Produto de outro item do anexo', cClassTrib: '200200' }, DB, cat);
    expect(e.artigo).toBe('não confirmado');
    expect(herdado.artigo).toBe('Anexo IX, item 7 (LC 214/2025)');
  });
  it('achado 5: venda debita pelo CST e cClassTrib da linha; classe de alíquota zero não afirma crédito', () => {
    expect(enquadrar('38089329', 'REVENDA', 'VENDA', DB, cat).credito!.descricao).toBe('Operação de saída: débito conforme o CST e o cClassTrib da linha; o crédito é o da aquisição do item');
    // 200200 = redução de 100% do IBS e da CBS na tabela (alíquota zero)
    const zero = aplicarExcecao(enquadrar('38089329', 'REVENDA', 'COMPRA_REVENDA', DB, cat), { motivo: 'Produto de alíquota zero', cClassTrib: '200200' }, DB, cat);
    expect(zero.credito).toMatchObject({ situacao: 'VERIFICAR' });
    expect(zero.credito!.descricao).toContain('art. 47, § 2º, I');
    // redução parcial (60%) continua "em regra", com as condições do art. 47
    expect(enquadrar('38089329', 'REVENDA', 'COMPRA_REVENDA', DB, cat).credito!.situacao).toBe('EM_REGRA');
  });
  it('achado 6: devolução de compra e de venda citam o art. 47, § 12, e dizem que o regulamento não foi confirmado', () => {
    const dv = enquadrar('38089329', 'INSUMO_PRODUCAO', 'DEVOLUCAO', DB, cat);
    expect(dv.credito!.descricao).toContain('art. 47, § 12, I e II (incluído pela LC 227/2026)');
    expect(dv.credito!.descricao).toContain('regulamento não confirmado nesta base');
  });
  it('achado 9: a nota diz em que cenário fixo a aquisição de insumo e de imobilizado é avaliada', () => {
    expect(enquadrar('38089329', 'INSUMO_PRODUCAO', 'COMPRA_REVENDA', DB, cat).observacao).toContain('Aquisição de insumo de produção avaliada no cenário de compra');
    expect(enquadrar('73182100', 'IMOBILIZADO', 'USO_CONSUMO', DB, cat).observacao).toContain('Aquisição de imobilizado avaliada no cenário de uso e consumo');
  });
  it('achado 11: o "atual" do conjunto diz "varia por item" quando a classe informada diverge', () => {
    const itens = [item('x1', { ncm: '38089329', finalidade: 'REVENDA', campos: { cClassTrib: '000001' } }), item('x2', { ncm: '38089329', finalidade: 'REVENDA' })];
    const conj = new AnalisadorTributario(cat).analisar(itens, ctx).casos.find((c) => c.tipo === 'ENQUADRAMENTO_CONJUNTO')!;
    expect(conj.atual).toEqual({ cClassTrib: 'varia por item' });
    const iguais = [item('y1', { ncm: '38089329', finalidade: 'REVENDA', campos: { cClassTrib: '000001' } }), item('y2', { ncm: '38089329', finalidade: 'REVENDA', campos: { cClassTrib: '000001' } })];
    expect(new AnalisadorTributario(cat).analisar(iguais, ctx).casos.find((c) => c.tipo === 'ENQUADRAMENTO_CONJUNTO')!.atual).toEqual({ cClassTrib: '000001' });
  });
  it('achado 8: o 0205 da EFD ICMS/IPI leva a ressalva do Guia Prático (não descaracterizar o item)', () => {
    for (const t of ['MUDOU_CODIGO_DESCRICAO', 'CONSOLIDOU_INATIVOU'] as const) {
      const r = CHECKLIST[t].registros.find((x) => x.obrigacao === 'EFD_ICMS_IPI' && x.registro === '0205')!;
      expect(r.ressalva).toContain('não descaracterizar o item; se descaracterizar, é item novo, com código novo (Guia Prático da EFD ICMS/IPI 3.2.4');
    }
  });
});
