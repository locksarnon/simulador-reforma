import { describe, expect, it } from 'vitest';
import { FUNDAMENTOS_CALCULO } from './fundamentos-calculo';
import { frasePorImpacto, impactoDe, MudancaDispositivo, normalizarTexto, revisoesDeCartoes, revisoesDeFundamentos, revisoesDeMarcos } from './revisao-legal.regras';

const LC214 = { chave: 'lcp-214-2025', numero: 'LC 214/2025' };

const cartoes = [
  {
    id: 'c1', pergunta: 'Qual o limite do produtor rural?', status: 'revisado',
    fundamentos: [
      { norma: 'lcp-214-2025', caminho: 'art-164', trecho: 'receita inferior a R$ 3.600.000,00' },
      { norma: 'lcp-214-2025', caminho: 'art-167', trecho: 'atualizado anualmente com base na variação do IPCA' },
    ],
  },
  { id: 'c2', pergunta: 'Como é o split payment?', status: 'rascunho', fundamentos: [{ norma: 'lcp-214-2025', caminho: 'art-31', trecho: 'segregar e recolher' }] },
  { id: 'c3', pergunta: 'Outra lei', status: 'revisado', fundamentos: [{ norma: 'lcp-123-2006', caminho: 'art-164', trecho: 'qualquer coisa' }] },
  { id: 'c4', pergunta: 'Sem fundamento válido', status: 'revisado', fundamentos: 'não é lista' },
];

describe('revisão pela lei: cartões', () => {
  it('só entram os cartões que citam um dispositivo alterado da mesma norma', () => {
    const mudancas: MudancaDispositivo[] = [{ caminho: 'art-164', rotulo: 'Art. 164', mudanca: 'alterado', texto: 'O produtor rural com receita inferior a R$ 3.600.000,00 não é contribuinte.' }];
    const r = revisoesDeCartoes(cartoes, LC214, mudancas);
    expect(r.map((x) => x.alvo_id)).toEqual(['c1']);
    expect(r[0]).toMatchObject({ tipo: 'cartao', alvo_titulo: 'Qual o limite do produtor rural?', norma_chave: 'lcp-214-2025', norma_numero: 'LC 214/2025', caminho: 'art-164', rotulo: 'Art. 164', mudanca: 'alterado' });
  });

  it('diz se o trecho citado pelo cartão ainda consta no texto novo (ignorando espaços e caixa)', () => {
    const consta = revisoesDeCartoes(cartoes, LC214, [{ caminho: 'art-164', rotulo: 'Art. 164', mudanca: 'alterado', texto: 'Receita   INFERIOR a R$ 3.600.000,00 no ano.' }]);
    expect(consta[0].detalhe).toBe('O texto do dispositivo mudou; o trecho citado no cartão ainda consta nele.');
    const some = revisoesDeCartoes(cartoes, LC214, [{ caminho: 'art-164', rotulo: 'Art. 164', mudanca: 'alterado', texto: 'Receita inferior a R$ 4.800.000,00.' }]);
    expect(some[0].detalhe).toBe('O trecho citado no cartão não consta mais no texto do dispositivo.');
  });

  it('com mais de um trecho no mesmo dispositivo, avisa quantos sumiram e grava uma linha só', () => {
    const duplo = [{ id: 'd1', pergunta: 'P', status: 'revisado', fundamentos: [
      { norma: 'lcp-214-2025', caminho: 'art-12', trecho: 'base de cálculo é o valor da operação' },
      { norma: 'lcp-214-2025', caminho: 'art-12', trecho: 'não integram a base de cálculo' },
    ] }];
    const r = revisoesDeCartoes(duplo, LC214, [{ caminho: 'art-12', rotulo: 'Art. 12', mudanca: 'alterado', texto: 'A base de cálculo é o valor da operação.' }]);
    expect(r).toHaveLength(1);
    expect(r[0].detalhe).toBe('1 dos 2 trechos citados no cartão não constam mais no texto do dispositivo.');
  });

  it('dispositivo revogado ou que saiu do texto oficial', () => {
    const r = revisoesDeCartoes(cartoes, LC214, [{ caminho: 'art-31', rotulo: 'Art. 31', mudanca: 'revogado' }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ alvo_id: 'c2', mudanca: 'revogado', detalhe: 'O dispositivo foi revogado ou saiu do texto oficial.' });
  });

  it('sem texto novo (aviso antes da aprovação) a frase é genérica', () => {
    const r = revisoesDeCartoes(cartoes, LC214, [{ caminho: 'art-167', rotulo: 'Art. 167', mudanca: 'alterado' }]);
    expect(r[0].detalhe).toBe('O texto do dispositivo mudou.');
  });

  it('cada dispositivo alterado gera uma linha por cartão', () => {
    const r = revisoesDeCartoes(cartoes, LC214, [
      { caminho: 'art-164', rotulo: 'Art. 164', mudanca: 'alterado', texto: 'x' },
      { caminho: 'art-167', rotulo: 'Art. 167', mudanca: 'alterado', texto: 'y' },
    ]);
    expect(r.map((x) => `${x.alvo_id}:${x.caminho}`)).toEqual(['c1:art-164', 'c1:art-167']);
  });
});

describe('revisão pela lei: notas do cálculo', () => {
  it('uma mudança no art. 349 atinge as duas notas que o citam', () => {
    const r = revisoesDeFundamentos(LC214, [{ caminho: 'art-349', rotulo: 'Art. 349', mudanca: 'alterado' }]);
    expect(r.map((x) => x.alvo_id).sort()).toEqual(['aliquotas_transicao', 'compras_governamentais']);
    expect(r.every((x) => x.tipo === 'fundamento' && x.detalhe === 'O texto do dispositivo mudou.')).toBe(true);
  });

  it('a Constituição (ADCT) é uma norma à parte', () => {
    const r = revisoesDeFundamentos({ chave: 'cf-1988', numero: 'CF/1988' }, [{ caminho: 'adct-art-128', rotulo: 'ADCT, Art. 128', mudanca: 'alterado' }]);
    expect(r.map((x) => x.alvo_id)).toEqual(['icms_iss_transicao']);
    expect(revisoesDeFundamentos(LC214, [{ caminho: 'adct-art-128', rotulo: 'x', mudanca: 'alterado' }])).toEqual([]);
  });

  it('dispositivo que nenhuma nota cita não gera nada', () => {
    expect(revisoesDeFundamentos(LC214, [{ caminho: 'art-1', rotulo: 'Art. 1º', mudanca: 'alterado' }])).toEqual([]);
  });

  it('o cadastro de fundamentos é consistente', () => {
    const chaves = FUNDAMENTOS_CALCULO.map((f) => f.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const f of FUNDAMENTOS_CALCULO) {
      expect(f.titulo.length, f.chave).toBeGreaterThan(3);
      expect(f.refs.length, f.chave).toBeGreaterThan(0);
      for (const r of f.refs) expect(r.caminho, `${f.chave} ${r.norma}`).toMatch(/^(adct-)?art-\d+(-[a-z])?$/);
    }
  });
});

describe('revisão pela lei: marcos da agenda', () => {
  const marcos = [
    { id: 'm1', titulo: 'Inventário do estoque', norma_chave: 'dec-12955-2026', caminho: 'art-608', fonte_trecho: 'inventário em 31 de dezembro de 2026' },
    { id: 'm2', titulo: 'Prazo do Simples', norma_chave: null, caminho: null, fonte_trecho: null },
    { id: 'm3', titulo: 'Estoque até junho', norma_chave: 'lcp-214-2025', caminho: 'art-381', fonte_trecho: 'último dia de junho de 2027' },
  ];

  it('só marcos que têm a fonte na Base legal e na mesma norma', () => {
    const r = revisoesDeMarcos(marcos, LC214, [{ caminho: 'art-381', rotulo: 'Art. 381', mudanca: 'alterado', texto: 'apropriado até o último dia de junho de 2027' }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'marco', alvo_id: 'm3', detalhe: 'O texto do dispositivo mudou; o trecho de onde a data foi lida ainda consta nele.' });
    expect(revisoesDeMarcos(marcos, { chave: 'dec-12955-2026', numero: 'Decreto 12.955/2026' }, [{ caminho: 'art-381', rotulo: 'Art. 381', mudanca: 'alterado' }])).toEqual([]);
  });

  it('se o trecho de onde a data foi lida some, o aviso diz isso', () => {
    const r = revisoesDeMarcos(marcos, LC214, [{ caminho: 'art-381', rotulo: 'Art. 381', mudanca: 'alterado', texto: 'apropriado até o último dia de dezembro de 2027' }]);
    expect(r[0].detalhe).toBe('O trecho de onde a data foi lida não consta mais no texto do dispositivo.');
  });
});

describe('impacto antes da atualização', () => {
  const marcos = [{ id: 'm3', titulo: 'Estoque até junho', norma_chave: 'lcp-214-2025', caminho: 'art-381', fonte_trecho: null }];

  it('conta cartões (e quantos estão publicados), notas e marcos sem contar duas vezes o mesmo item', () => {
    const i = impactoDe(cartoes, marcos, LC214, [
      { caminho: 'art-164', rotulo: 'Art. 164', mudanca: 'alterado' },
      { caminho: 'art-167', rotulo: 'Art. 167', mudanca: 'alterado' },
      { caminho: 'art-31', rotulo: 'Art. 31', mudanca: 'alterado' },
      { caminho: 'art-381', rotulo: 'Art. 381', mudanca: 'alterado' },
    ]);
    expect(i).toEqual({ cartoes: 2, publicados: 1, fundamentos: 3, marcos: 1 });
  });

  it('a frase para o aviso só aparece quando algo é citado', () => {
    expect(frasePorImpacto({ cartoes: 0, publicados: 0, fundamentos: 0, marcos: 0 })).toBe('');
    expect(frasePorImpacto({ cartoes: 2, publicados: 1, fundamentos: 1, marcos: 3 })).toBe(
      'Citam estes dispositivos: 2 cartões de pergunta frequente (1 publicado), 1 nota do cálculo, 3 marcos da agenda. Depois da atualização, voltam para revisão.',
    );
  });
});

describe('normalizarTexto', () => {
  it('junta espaços e ignora caixa', () => {
    expect(normalizarTexto('  Receita \n  INFERIOR ')).toBe('receita inferior');
  });
});
