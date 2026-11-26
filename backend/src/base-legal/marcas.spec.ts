import { describe, expect, it } from 'vitest';
import { atoDoTexto, ehSoNota, marcadorEstrutural, marcasDoTexto, marcasUnicas, numeroDoArtigo, remissoesDoTexto, situacaoDoDispositivo, temasDoTexto } from './marcas';

describe('atos citados nas notas do texto oficial', () => {
  it.each([
    ['Lei Complementar nº 227, de 2026', 'LC 227/2026', 'Lei Complementar'],
    ['Lei nº 11.945, de 4 de junho de 2009', 'Lei 11945/2009', 'Lei'],
    ['Decreto nº 10.668, de 2021', 'Decreto 10668/2021', 'Decreto'],
    ['Medida Provisória nº 656, de 2014', 'MP 656/2014', 'Medida Provisória'],
    ['Emenda Constitucional nº 132, de 20 de dezembro de 2023', 'EC 132/2023', 'Emenda Constitucional'],
    ['Decreto-Lei nº 1.598, de 26 de dezembro de 1977', 'Decreto-Lei 1598/1977', 'Decreto-Lei'],
    ['Instrução Normativa RFB nº 2.121/2022', null, null],
    ['LC 214/2025', 'LC 214/2025', 'Lei Complementar'],
    ['Decreto 12.955/2026', 'Decreto 12955/2026', 'Decreto'],
  ])('%s → %s', (texto, rotulo, tipo) => {
    const a = atoDoTexto(texto);
    if (rotulo === null) { expect(a?.rotulo ?? null).toBe(a ? a.rotulo : null); return; }
    expect(a).toMatchObject({ rotulo, tipo, referencia: rotulo.toLowerCase() });
  });

  it('sem número e ano não há ato', () => {
    expect(atoDoTexto('(Revogado)')).toBeNull();
    expect(atoDoTexto('pela legislação anterior')).toBeNull();
  });
});

describe('notas entre parênteses do dispositivo', () => {
  it('lê redação dada, inclusão, revogação, veto, vide e vigência, cada uma com o ato', () => {
    const t = [
      '§ 4º O IBS incide sobre a operação. (Redação dada pela Lei Complementar nº 227, de 2026)',
      '§ 5º Novo. (Incluído pela Lei Complementar nº 227, de 2026) (Vigência)',
      '§ 6º (Revogado pelo Decreto nº 10.668, de 2021)',
      '§ 7º (VETADO)',
      'Art. 9º ... (Vide Decreto nº 12.955, de 2026)',
      'II - ... (Produção de efeito)',
    ].join('\n');
    const m = marcasDoTexto(t);
    expect(m.map((x) => x.tipo)).toEqual(['redacao', 'inclusao', 'vigencia', 'revogacao', 'veto', 'vide', 'vigencia']);
    expect(m[0]).toMatchObject({ ato: 'LC 227/2026', referencia: 'lc 227/2026' });
    expect(m[3]).toMatchObject({ ato: 'Decreto 10668/2021' });
    expect(m[5]).toMatchObject({ ato: 'Decreto 12955/2026' });
  });

  it('decisão judicial aparece como marca própria', () => {
    const m = marcasDoTexto('Art. 5º Texto. (Vide ADI 4.481) (Declarado inconstitucional pela ADI 1234)');
    expect(m.map((x) => x.tipo)).toEqual(['judicial', 'judicial']);
  });

  it('marcasUnicas tira a repetição do mesmo ato no mesmo tipo', () => {
    const m = marcasUnicas(marcasDoTexto('a (Redação dada pela Lei nº 1.000, de 2020)\nb (Redação dada pela Lei nº 1.000, de 2020)\nc (Incluído pela Lei nº 1.000, de 2020)'));
    expect(m.map((x) => x.tipo)).toEqual(['redacao', 'inclusao']);
  });

  it('reconhece a linha que é só nota e o marcador estrutural', () => {
    expect(ehSoNota('(Revogado pelo Decreto nº 7.990, de 2013)')).toBe(true);
    expect(ehSoNota('Art. 3º (Revogado)')).toBe(false);
    expect(marcadorEstrutural('Art. 165-A. Texto')).toBe('Art. 165-A.');
    expect(marcadorEstrutural('§ 2º Texto')).toBe('§ 2º');
    expect(marcadorEstrutural('ANEXO XIV')).toBe('ANEXO XIV');
    expect(marcadorEstrutural('Capítulo IV')).toBe('Capítulo IV');
    expect(marcadorEstrutural('I - texto')).toBe('I -');
    expect(marcadorEstrutural('texto solto')).toBeNull();
    expect(numeroDoArtigo('Art. 73. Texto')).toBe('73');
    expect(numeroDoArtigo('Art. 165-A. Texto')).toBe('165-A');
    expect(numeroDoArtigo('§ 1º Texto')).toBeNull();
  });
});

describe('situação do dispositivo (vigente, revogado, parcialmente revogado)', () => {
  it('revogado por inteiro: só a nota, com ou sem os parágrafos também revogados', () => {
    expect(situacaoDoDispositivo('Art. 3º (Revogado pela Lei X)')).toMatchObject({ revogado: true, revogado_por: null }); // nota sem número do ato
    expect(situacaoDoDispositivo('Art. 3º (Revogado pela Lei nº 9.532, de 1997)')).toEqual({ revogado: true, parcialmente_revogado: false, revogado_por: 'Lei 9532/1997' });
    expect(situacaoDoDispositivo('Art. 46. (Revogado pela Lei nº 11.488, de 2007)\n§ 1º (Revogado pela Lei nº 11.488, de 2007)\nI - (Revogado pela Lei nº 11.488, de 2007)')).toMatchObject({ revogado: true, revogado_por: 'Lei 11488/2007' });
  });

  it('revogado em parte: parágrafo ou inciso revogado, o resto vigente', () => {
    expect(situacaoDoDispositivo('Art. 2º A operação é tributada.\n§ 1º Vigente.\n§ 2º (Revogado pela Lei Complementar nº 227, de 2026)')).toEqual({ revogado: false, parcialmente_revogado: true, revogado_por: 'LC 227/2026' });
    expect(situacaoDoDispositivo('Art. 9º Texto.\nXI - (Revogado pelo Decreto nº 10.668, de 2021)')).toMatchObject({ parcialmente_revogado: true });
  });

  it('artigo em vigor que revoga outras normas, ou com nota de redação, não é revogado', () => {
    expect(situacaoDoDispositivo('Art. 540. Ficam revogados os seguintes dispositivos da Lei nº 9.718, de 1998:\nI - o inciso II.').revogado).toBe(false);
    expect(situacaoDoDispositivo('Art. 4º Texto. (Redação dada pela Lei Complementar nº 227, de 2026)')).toEqual({ revogado: false, parcialmente_revogado: false, revogado_por: null });
  });

  it('veto: artigo inteiro vetado não tem texto vigente; parágrafo vetado não torna o artigo "revogado em parte"', () => {
    expect(situacaoDoDispositivo('Art. 2º (VETADO)')).toEqual({ revogado: true, parcialmente_revogado: false, revogado_por: 'veto' });
    expect(situacaoDoDispositivo('Art. 2º Texto vigente.\n§ 5º (VETADO).')).toEqual({ revogado: false, parcialmente_revogado: false, revogado_por: null });
  });

  it('anexo e alínea: a nota de revogação sem texto próprio também conta', () => {
    expect(situacaoDoDispositivo('ANEXO XIV (Revogado pela Lei Complementar nº 227, de 2026)')).toMatchObject({ revogado: true, revogado_por: 'LC 227/2026' });
    expect(situacaoDoDispositivo('Art. 8º Texto.\nb) (revogada); (Redação dada pela Lei Complementar nº 227, de 2026)')).toMatchObject({ parcialmente_revogado: true });
  });
});

describe('remissões a artigos de outras normas', () => {
  it('"(Art. 38 da LC 214/2025)" e faixas de artigos', () => {
    expect(remissoesDoTexto('Art. 38. Em caso de pagamento indevido... (Art. 38 da LC 214/2025)')).toEqual([
      expect.objectContaining({ ato: 'LC 214/2025', referencia: 'lc 214/2025', caminhos: ['art-38'] }),
    ]);
    const faixa = remissoesDoTexto('Texto. (arts. 38 a 41 da Lei Complementar nº 214, de 2025)');
    expect(faixa[0].caminhos).toEqual(['art-38', 'art-39', 'art-40', 'art-41']);
    expect(remissoesDoTexto('§ 2º ... (§ 2º do art. 12 da LC 214/2025)')[0].caminhos).toEqual(['art-12']);
    expect(remissoesDoTexto('Texto sem remissão. (Redação dada pela Lei X)')).toEqual([]);
  });
});

describe('temas do dispositivo', () => {
  it('reconhece o assunto, sem confundir palavra dentro de outra ("operação" não é "ração")', () => {
    expect(temasDoTexto('Art. 164. O produtor rural que auferir receita inferior a R$ 3.600.000,00 não será contribuinte do IBS e da CBS.')).toContain('produtor_rural');
    expect(temasDoTexto('Art. 5º Considera-se operação a transferência de bens na operação interna e a operação de importação.')).not.toContain('insumos_agropecuarios');
    expect(temasDoTexto('Art. 31. O split payment recolhe o imposto na liquidação financeira, e o pagamento dividido segue as regras do art. 32.')).toContain('split_payment');
    expect(temasDoTexto('Os créditos de IBS e de CBS apropriados e o estorno de crédito seguem este artigo. O crédito presumido também.')).toContain('creditos');
  });

  it('texto sem assunto reconhecível não recebe tema', () => {
    expect(temasDoTexto('Art. 1º Esta Lei entra em vigor na data de sua publicação.')).toEqual([]);
  });
});
