import { describe, expect, it } from 'vitest';
import { montarEmailRevisao } from './revisao-legal.email';
import { NovaRevisao } from './revisao-legal.regras';

const norma = { chave: 'lcp-214-2025', numero: 'LC 214/2025' };
const rev = (tipo: NovaRevisao['tipo'], id: string, titulo: string, rotulo: string, detalhe: string | null = 'O texto do dispositivo mudou.'): NovaRevisao => ({
  tipo, alvo_id: id, alvo_titulo: titulo, norma_chave: norma.chave, norma_numero: norma.numero, caminho: rotulo.toLowerCase().replace('. ', '-'), rotulo, mudanca: 'alterado', detalhe,
});

describe('aviso de revisão ao administrador', () => {
  const revisoes = [
    rev('cartao', 'c1', 'Qual o limite do produtor rural?', 'Art. 164', 'O trecho citado no cartão não consta mais no texto do dispositivo.'),
    rev('cartao', 'c1', 'Qual o limite do produtor rural?', 'Art. 167'),
    rev('fundamento', 'split_payment', 'Split payment', 'Art. 31'),
    rev('marco', 'm1', 'Inventário do estoque', 'Art. 608'),
  ];

  it('assunto com a contagem de itens (não de linhas) e a norma', () => {
    const e = montarEmailRevisao(norma, revisoes, 1, 'https://simulador.clarityib.com.br/');
    expect(e.total).toBe(3);
    expect(e.assunto).toBe('[InTAX] 3 itens para revisar: LC 214/2025 mudou na Base legal');
    expect(montarEmailRevisao(norma, revisoes.slice(2, 3), 0, 'https://x').assunto).toBe('[InTAX] 1 item para revisar: LC 214/2025 mudou na Base legal');
  });

  it('lista cada item sob a sua seção, com os dispositivos e o motivo, e o link da Base legal', () => {
    const e = montarEmailRevisao(norma, revisoes, 1, 'https://simulador.clarityib.com.br/');
    for (const t of ['Perguntas frequentes (1)', 'Notas do cálculo (ícone da balança) (1)', 'Marcos da Agenda da Reforma (1)', 'Qual o limite do produtor rural?', 'Art. 164: O trecho citado no cartão não consta mais', 'Art. 167: O texto do dispositivo mudou.']) {
      expect(e.html, t).toContain(t);
      expect(e.texto, t).toContain(t);
    }
    expect(e.html).toContain('href="https://simulador.clarityib.com.br/base-legal"');
    expect(e.texto).toContain('Abrir a Base legal: https://simulador.clarityib.com.br/base-legal');
  });

  it('diz que cartões publicados voltaram para rascunho, no singular e no plural', () => {
    expect(montarEmailRevisao(norma, revisoes, 1, 'https://x').texto).toContain('1 cartão que estava publicado voltou para rascunho e deixou de aparecer para os consultores');
    expect(montarEmailRevisao(norma, revisoes, 2, 'https://x').texto).toContain('2 cartões que estavam publicados voltaram para rascunho e deixaram de aparecer');
    expect(montarEmailRevisao(norma, revisoes, 0, 'https://x').texto).not.toContain('rascunho');
  });

  it('escapa HTML do título para não injetar marcação no e-mail', () => {
    const e = montarEmailRevisao(norma, [rev('cartao', 'c9', '<script>alert(1)</script> & cia', 'Art. 1º')], 0, 'https://x');
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; cia');
  });

  it('limita a lista de cada seção e diz quantos ficaram de fora', () => {
    const muitos = Array.from({ length: 20 }, (_, i) => rev('cartao', `c${i}`, `Pergunta ${i}`, 'Art. 12'));
    const e = montarEmailRevisao(norma, muitos, 0, 'https://x');
    expect(e.html).toContain('Perguntas frequentes (20)');
    expect(e.html).toContain('e mais 5.');
    expect(e.html).toContain('Pergunta 14');
    expect(e.html).not.toContain('Pergunta 15');
  });
});
