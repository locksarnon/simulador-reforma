import { describe, expect, it } from 'vitest';
import { avaliarItem, calcularCredito, destinacaoPorTipoItem, DISP, PERCENTUAL_NACIONAL } from './index';
import type { ItemEstoque, Premissas } from './index';

const cumulativo: Premissas = { regimeRegularCbs2027: true, regimePisCofins31122026: 'CUMULATIVO', dataInventario: '2026-12-31' };
const naoCumulativo: Premissas = { ...cumulativo, regimePisCofins31122026: 'NAO_CUMULATIVO' };
const misto: Premissas = { ...cumulativo, regimePisCofins31122026: 'MISTO', percentualVedacaoParcial: 0.4 };

/** Item de revenda nacional completo e elegível no cumulativo. */
const revenda = (extra: Partial<ItemEstoque> = {}): ItemEstoque => ({
  id: 'A', tipoItem: '00', ncm: '38089329', valorCustoAquisicao: 1000, indicadorPropriedade: '0', origem: 'NACIONAL',
  novo: true, adquiridoDePessoaJuridica: true, tratamentoAquisicao: 'TRIBUTADA', documentacaoIdonea: true, ...extra,
});
const importado = (extra: Partial<ItemEstoque> = {}): ItemEstoque => revenda({
  id: 'I', origem: 'IMPORTADO', adquiridoDePessoaJuridica: null, pisImportacaoPago: 21, cofinsImportacaoPaga: 106.5, adicionalCofinsImportacao: 10, ...extra,
});

describe('percentual', () => {
  it('9,25% (LC 214, art. 381, § 3º, I)', () => expect(PERCENTUAL_NACIONAL).toBe(0.0925));
});

describe('premissas (art. 381, caput; Decreto, art. 608)', () => {
  it('fora do regime regular da CBS: nada é elegível', () => {
    const r = calcularCredito([revenda()], { ...cumulativo, regimeRegularCbs2027: false });
    expect(r.total).toBe(0);
    expect(r.naoElegiveis[0].dispositivo).toBe(DISP.caput);
  });
  it('premissas faltando viram pendência global', () => {
    const r = calcularCredito([revenda()], { regimeRegularCbs2027: null, regimePisCofins31122026: null, dataInventario: null });
    expect(r.total).toBe(0);
    expect(r.pendencias[0].id).toBeNull();
    expect(r.pendencias[0].faltando).toHaveLength(3);
  });
  it('inventário em data diferente de 31/12/2026 não serve', () => {
    const av = avaliarItem(revenda(), { ...cumulativo, dataInventario: '2027-01-01' });
    expect(av.situacao).toBe('PENDENTE');
    expect(av.dispositivo).toBe(DISP.dataInventario);
  });
  it('Simples Nacional: não confirmado, sem valor', () => {
    const r = calcularCredito([revenda()], { ...cumulativo, regimePisCofins31122026: 'SIMPLES_NACIONAL' });
    expect(r.total).toBe(0);
    expect(r.premissasNaoConfirmadas.some((p) => p.tema === 'regime')).toBe(true);
  });
});

describe('hipótese I: cumulativo (art. 381, I)', () => {
  it('revenda nacional: 9,25% sobre o custo de aquisição', () => {
    const r = calcularCredito([revenda()], cumulativo);
    expect(r.total).toBe(92.5);
    expect(r.porItem[0].hipotese).toBe('CUMULATIVO');
    expect(r.porItem[0].dispositivo).toContain('art. 381, § 3º, I');
  });
  it('bem com crédito de PIS/Cofins na aquisição fica fora', () => {
    const av = avaliarItem(revenda({ houveCreditoPisCofins: true }), cumulativo);
    expect(av.situacao).toBe('NAO_ELEGIVEL');
    expect(av.dispositivo).toBe(DISP.hipoteseCumulativo);
  });
  it('produto acabado: só o custo de matérias-primas e embalagens (Decreto, art. 609, § 2º)', () => {
    const r = calcularCredito([revenda({ tipoItem: '04', valorCustoAquisicao: 5000, custoMateriasPrimasEmbalagens: 2000 })], cumulativo);
    expect(r.porItem[0].base).toBe(2000);
    expect(r.total).toBe(185);
  });
  it('produto em processo sem custo de MP/embalagem fica pendente', () => {
    const av = avaliarItem(revenda({ tipoItem: '03', custoMateriasPrimasEmbalagens: null }), cumulativo);
    expect(av.situacao).toBe('PENDENTE');
    expect(av.dispositivo).toBe(DISP.acabadosEmProcesso);
  });
  it('matéria-prima e embalagem entram como produção para venda', () => {
    expect(destinacaoPorTipoItem('01')).toBe('PRODUCAO_PARA_VENDA');
    expect(avaliarItem(revenda({ tipoItem: '02' }), cumulativo).elegivel).toBe(true);
  });
  it('material para prestação de serviços a terceiros', () => {
    expect(avaliarItem(revenda({ tipoItem: '99', destinacao: 'PRESTACAO_SERVICOS_TERCEIROS' }), cumulativo).elegivel).toBe(true);
  });
});

describe('hipótese II: monofásico/ST (art. 381, II)', () => {
  it('não cumulativo, revenda de monofásico listado: elegível', () => {
    const av = avaliarItem(revenda({ monofasicoSt: 'LEI_10147_ART1_I' }), naoCumulativo);
    expect(av.hipotese).toBe('MONOFASICO_ST');
    expect(av.dispositivo).toContain(DISP.hipoteseMonofasicoSt);
  });
  it('não cumulativo sem monofásico: fora', () => {
    const av = avaliarItem(revenda(), naoCumulativo);
    expect(av.situacao).toBe('NAO_ELEGIVEL');
  });
  it('monofásico adquirido com alíquota zero: não confirmado (conflito § 1º, II)', () => {
    const r = calcularCredito([revenda({ monofasicoSt: 'LEI_10147_ART1_I', tratamentoAquisicao: 'ALIQUOTA_ZERO' })], naoCumulativo);
    expect(r.total).toBe(0);
    expect(r.premissasNaoConfirmadas.some((p) => p.id === 'A')).toBe(true);
  });
  it('monofásico com crédito já tomado: não confirmado', () => {
    expect(avaliarItem(revenda({ monofasicoSt: 'LEI_10485_ART1_ART3_II_ART5', houveCreditoPisCofins: true }), naoCumulativo).situacao).toBe('NAO_CONFIRMADO');
  });
});

describe('hipótese III: vedação parcial (art. 381, III)', () => {
  it('aplica 9,25% só sobre a parcela vedada', () => {
    const r = calcularCredito([revenda()], misto);
    expect(r.porItem[0].hipotese).toBe('VEDACAO_PARCIAL');
    expect(r.porItem[0].base).toBe(400);
    expect(r.total).toBe(37);
  });
  it('percentual próprio do item prevalece', () => {
    expect(calcularCredito([revenda({ percentualVedacaoParcial: 0.1 })], misto).total).toBe(9.25);
  });
  it('sem percentual: pendência', () => {
    expect(avaliarItem(revenda(), { ...misto, percentualVedacaoParcial: null }).situacao).toBe('PENDENTE');
  });
  it('importado na hipótese III: não confirmado', () => {
    expect(avaliarItem(importado(), misto).situacao).toBe('NAO_CONFIRMADO');
  });
});

describe('importados (art. 381, § 3º, II)', () => {
  it('crédito = PIS-Imp + Cofins-Imp pagos, sem o adicional', () => {
    const r = calcularCredito([importado()], cumulativo);
    expect(r.total).toBe(117.5);
    expect(r.totalImportado).toBe(117.5);
    expect(r.totalNacional).toBe(0);
  });
  it('adicional não informado: pendência', () => {
    expect(avaliarItem(importado({ adicionalCofinsImportacao: null }), cumulativo).situacao).toBe('PENDENTE');
  });
});

describe('exclusões (art. 381, § 1º e § 5º; Decreto, arts. 606 e 607)', () => {
  const casos: [string, Partial<ItemEstoque>, string][] = [
    ['alíquota zero', { tratamentoAquisicao: 'ALIQUOTA_ZERO' }, DISP.aliquotaZeroIsencao],
    ['isenção', { tratamentoAquisicao: 'ISENCAO' }, DISP.aliquotaZeroIsencao],
    ['suspensão', { tratamentoAquisicao: 'SUSPENSAO' }, DISP.aliquotaZeroIsencao],
    ['não incidência', { tratamentoAquisicao: 'NAO_INCIDENCIA' }, DISP.aliquotaZeroIsencao],
    ['uso e consumo pessoal', { usoConsumoPessoal: true }, DISP.usoConsumoPessoal],
    ['ativo imobilizado (0200 tipo 08)', { tipoItem: '08' }, DISP.imobilizado],
    ['imóvel', { imovel: true }, DISP.imovel],
    ['ativo de contrato de concessionária', { ativoContratoConcessionaria: true }, DISP.ativoConcessionaria],
    ['bem usado', { novo: false }, DISP.bensNovosDestinacao],
    ['compra de pessoa física', { adquiridoDePessoaJuridica: false }, DISP.bensNovosDestinacao],
    ['material de uso e consumo (07)', { tipoItem: '07' }, DISP.bensNovosDestinacao],
    ['bem de terceiros em poder do contribuinte', { indicadorPropriedade: '2' }, DISP.composicaoEstoque],
    ['sem documentação idônea', { documentacaoIdonea: false }, DISP.documentacaoIdonea],
    ['serviço (09)', { tipoItem: '09' }, DISP.caput],
  ];
  it.each(casos)('%s', (_n, extra, disp) => {
    const av = avaliarItem(revenda(extra), cumulativo);
    expect(av.situacao).toBe('NAO_ELEGIVEL');
    expect(av.dispositivo).toBe(disp);
  });
  it('exclusão definitiva vale mesmo com dados faltando', () => {
    expect(avaliarItem({ id: 'X', tipoItem: '08' }, cumulativo).situacao).toBe('NAO_ELEGIVEL');
  });
  it('próprio em poder de terceiros (IND_PROP 1) continua no estoque', () => {
    expect(avaliarItem(revenda({ indicadorPropriedade: '1' }), cumulativo).elegivel).toBe(true);
  });
});

describe('pendências e pontos não confirmados', () => {
  it('lista os dados que faltam', () => {
    const av = avaliarItem({ id: 'P', tipoItem: '00' }, cumulativo);
    expect(av.situacao).toBe('PENDENTE');
    expect(av.faltando).toEqual(expect.arrayContaining(['bem novo (sim/não)', 'origem (nacional/importado)', 'tratamento de PIS/Cofins na aquisição']));
  });
  it.each(['05', '06', '10'])('0200 tipo %s: não confirmado (fora da lista do Decreto, art. 606, § 1º)', (tipo) => {
    const av = avaliarItem(revenda({ tipoItem: tipo }), cumulativo);
    expect(av.situacao).toBe('NAO_CONFIRMADO');
    expect(av.dispositivo).toContain(DISP.composicaoEstoque);
  });
  it('não confirmado não entra no total', () => {
    const r = calcularCredito([revenda(), revenda({ id: 'B', tipoItem: '06' })], cumulativo);
    expect(r.total).toBe(92.5);
    expect(r.porItem).toHaveLength(1);
  });
  it('sempre avisa que a escrituração depende de ato da RFB', () => {
    expect(calcularCredito([], cumulativo).premissasNaoConfirmadas.some((p) => p.tema === 'escrituração')).toBe(true);
  });
});

describe('utilização (art. 381, § 4º; art. 383)', () => {
  it('12 parcelas a partir do mês seguinte à apropriação e prazo de 5 anos', () => {
    const r = calcularCredito([revenda({ valorCustoAquisicao: 12000 })], { ...cumulativo, mesApropriacao: '2027-03' });
    expect(r.total).toBe(1110);
    expect(r.utilizacao!.parcelas).toHaveLength(12);
    expect(r.utilizacao!.parcelas[0]).toEqual({ numero: 1, mes: '2027-04', valor: 92.5 });
    expect(r.utilizacao!.parcelas[11].mes).toBe('2028-03');
    expect(r.utilizacao!.extincaoDoDireito).toBe('2032-03-31');
  });
  it('resíduo de centavos vai na 12ª parcela e é sinalizado', () => {
    const r = calcularCredito([revenda({ valorCustoAquisicao: 1000 })], { ...cumulativo, mesApropriacao: '2027-01' });
    const soma = r.utilizacao!.parcelas.reduce((s, p) => s + Math.round(p.valor * 100), 0);
    expect(soma).toBe(9250);
    expect(r.premissasNaoConfirmadas.some((p) => p.tema === 'arredondamento')).toBe(true);
  });
  it('apropriação depois de junho/2027: fora do prazo', () => {
    const r = calcularCredito([revenda()], { ...cumulativo, mesApropriacao: '2027-07' });
    expect(r.utilizacao).toBeNull();
    expect(r.pendencias.some((p) => p.dispositivo === DISP.prazoApropriacao)).toBe(true);
  });
  it('observações de uso citam só-CBS, preferência e estorno', () => {
    const disp = calcularCredito([], cumulativo).observacoes.map((o) => o.dispositivo);
    expect(disp).toEqual(expect.arrayContaining([DISP.somenteCbs, DISP.preferenciaCompensacao, DISP.estornoDevolucoes]));
  });
});
