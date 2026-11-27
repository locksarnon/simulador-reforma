import { describe, expect, it } from 'vitest';
import { htmlNewsletter, htmlNewsletterSemIa, itensDaSemana, promptNewsletter, validarNewsletter } from './newsletter-resumo';

const RADAR = [
  { prioridade: 'Alta', categoria: 'CBS', resumo: 'A Receita publicou o cronograma de emissão dos documentos fiscais com IBS e CBS.', prazo_vigencia: '01/01/2027', acao_recomendada: 'Atualizar o cadastro de produtos com o cClassTrib.', fonte_nome: 'Receita Federal', fonte_url: 'https://www.gov.br/receitafederal/x' },
  { prioridade: 'Média', categoria: 'Agro', resumo: 'Produtor rural: limite de receita para não ser contribuinte.', fonte_url: null },
];
const NOVIDADES = [{ tipo: 'fonte_atualizada', norma_numero: 'Decreto 2.212/2014 (MT)', titulo: 'Decreto 2.212/2014 (MT): o documento oficial mudou', resumo: 'Abra a fonte oficial.', url: 'https://www.sefaz.mt.gov.br/legislacao/SubIndice.aspx?ID=6' }];

describe('newsletter: resumo do resumo feito pela IA', () => {
  const itens = itensDaSemana(RADAR, NOVIDADES);

  it('numera os itens da semana (R do Radar, L das bases legais) e o prompt só traz eles', () => {
    expect(itens.map((i) => i.id)).toEqual(['R1', 'R2', 'L1']);
    const p = promptNewsletter(itens);
    expect(p).toContain('[R1] (Radar · Alta · CBS)');
    expect(p).toContain('[L1] (Bases legais · documento oficial mudou)');
    expect(p).toContain('Use SOMENTE os itens abaixo');
  });

  it('aproveita só o que a IA apoia em itens que existem, corta os textos e respeita os limites', () => {
    const resposta = JSON.stringify({
      assunto: 'Cronograma dos documentos fiscais da Reforma saiu!',
      resumo: 'A Receita fixou o cronograma de emissão com IBS e CBS. O RICMS de MT mudou.',
      setores: [
        { setor: 'Todos os setores', efeito: 'Os documentos fiscais passam a ter os campos do IBS e da CBS.', itens: ['R1'] },
        { setor: 'Agro', efeito: 'Item inventado.', itens: ['R9'] },
        { setor: 'Pesca', efeito: 'Setor fora da lista.', itens: ['R2'] },
      ],
      preparar: [{ acao: 'Atualize o cadastro de produtos com o cClassTrib.', prazo: '01/01/2027', itens: ['R1'] }],
      leis: [{ norma: 'RICMS/MT', mudanca: 'O documento oficial mudou: confira.', itens: ['L1', 'R1'] }],
    });
    const c = validarNewsletter(`texto antes ${resposta} texto depois`, itens)!;
    expect(c.assunto).toBe('Cronograma dos documentos fiscais da Reforma saiu');
    expect(c.setores).toEqual([{ setor: 'Todos os setores', efeito: 'Os documentos fiscais passam a ter os campos do IBS e da CBS.', itens: ['R1'] }]);
    expect(c.preparar[0]).toMatchObject({ prazo: '01/01/2027', itens: ['R1'] });
    expect(c.leis[0].itens).toEqual(['L1']);
    const html = htmlNewsletter(c, itens);
    expect(html).toContain('Resumo da semana:');
    expect(html).toContain('Efeito prático por setor');
    expect(html).toContain('O que o contador deve preparar');
    expect(html).toContain('href="https://www.sefaz.mt.gov.br/legislacao/SubIndice.aspx?ID=6"');
    expect(html).toContain('Confira a fonte oficial antes de agir');
  });

  it('resposta sem nada apoiado nos itens (ou que não é JSON) não vale: vai para a versão curta', () => {
    expect(validarNewsletter('não sei', itens)).toBeNull();
    expect(validarNewsletter(JSON.stringify({ resumo: 'Algo.', setores: [{ setor: 'Agro', efeito: 'x', itens: ['R7'] }] }), itens)).toBeNull();
  });

  it('versão curta sem IA: até 2 frases de resumo, uma linha por item e o texto oficial das leis', () => {
    const v = htmlNewsletterSemIa(RADAR, NOVIDADES, 'Primeira frase. Segunda frase. Terceira frase que não entra.');
    expect(v.assunto).toBe('Radar InTAX: 3 novidades da semana');
    expect(v.corpo).toContain('Primeira frase. Segunda frase.');
    expect(v.corpo).not.toContain('Terceira frase');
    expect(v.corpo).toContain('Atualizar o cadastro de produtos com o cClassTrib.');
    expect(v.corpo).toContain('(prazo: 01/01/2027)');
    expect(v.corpo).toContain('texto oficial');
  });
});
