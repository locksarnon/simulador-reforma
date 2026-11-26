import { describe, expect, it } from 'vitest';
import { extrairDispositivos, htmlParaTexto } from './base-legal.parser';

const HTML = `
<p>LIVRO I</p><p>DO IBS</p>
<p>TÍTULO IV</p><p>DOS REGIMES DIFERENCIADOS</p>
<p>Art. 164. O produtor rural que auferir receita inferior a R$ 3.600.000,00
no ano-calendário não será contribuinte.</p>
<p>§ 2º Caso exceda o limite, passará a ser contribuinte.</p>
<p><strike>Art. 165. Texto antigo.</strike></p>
<p>Art. 165. Texto novo. (Redação dada pela Lei Complementar nº 227, de 2026)</p>
<p>Art. 165-A. Incluído depois.</p>
<p>“Art. 82-A. Artigo citado de outra lei.”</p>
<p>Art. 166. Último.</p>
<p>ANEXO I</p><table><tr><td>1006</td><td>Arroz</td></tr></table>
`;

describe('base legal — parser', () => {
  const texto = htmlParaTexto(HTML);
  const d = extrairDispositivos(texto);

  it('junta linhas quebradas no meio da frase', () => {
    expect(d.find((x) => x.caminho === 'art-164')!.texto).toContain('receita inferior a R$ 3.600.000,00 no ano-calendário');
  });

  it('descarta o texto riscado e mantém o vigente', () => {
    const a = d.find((x) => x.caminho === 'art-165')!;
    expect(a.texto).toContain('Texto novo');
    expect(a.texto).not.toContain('Texto antigo');
  });

  it('separa Art. 165-A e não trata artigo citado de outra lei como dispositivo', () => {
    expect(d.map((x) => x.caminho)).toEqual(['art-164', 'art-165', 'art-165-a', 'art-166', 'anexo-i']);
    expect(d.find((x) => x.caminho === 'art-165-a')!.texto).toContain('Art. 82-A');
  });

  it('guarda capítulo/título e o anexo como tabela', () => {
    expect(d[0].secao).toBe('Livro I — DO IBS › Título IV — DOS REGIMES DIFERENCIADOS');
    expect(d[4].texto).toContain('1006 | Arroz');
  });

  it('em lei alteradora, artigos citados de outra lei não viram dispositivos', () => {
    const t = htmlParaTexto(`<p>Art. 1º Esta Lei altera o CTN.</p><p>Art. 2º O CTN passa a vigorar com as seguintes alterações:</p>
      <p>Art. 208-A. Novo artigo citado.</p><p>Art. 208-B. Outro citado.</p><p>Art. 208-C. Mais um.</p><p>Art. 3º Esta Lei entra em vigor.</p>`);
    expect(extrairDispositivos(t).map((x) => x.caminho)).toEqual(['art-1', 'art-2', 'art-3']);
  });

  it('artigos de outra lei entre aspas não tomam o lugar dos artigos seguintes da própria lei (Lei 14.973/2024, arts. 19 a 22)', () => {
    const inicio = Array.from({ length: 18 }, (_, i) => `<p>Art. ${i + 1}${i < 9 ? 'º' : '.'} Texto ${i + 1}.</p>`).join('');
    const t = htmlParaTexto(`${inicio}<p>Art. 19. A Lei nº 13.988 passa a vigorar acrescida dos seguintes arts. 22-A a 22-E:</p>
      <p>“Art. 22-A. Primeiro artigo citado.</p><p>Art. 22-B. Segundo.</p><p>Art. 22-C. Terceiro.</p><p>Art. 22-D. Quarto.</p>
      <p>Art. 22-E. Ato do Advogado-Geral da União disciplinará a transação de que trata este Capítulo.”</p>
      <p>Art. 20. A Lei nº 10.522 passa a vigorar com as seguintes alterações:</p><p>“Art. 2º ......................” (NR)</p>
      <p>Art. 21. No caso das agências reguladoras, a manifestação será proferida em até 180 dias.</p>
      <p>Art. 22. Enquanto não for proferida a manifestação, consideram-se irrecuperáveis os créditos.</p><p>Art. 23. Esta Lei entra em vigor.</p>`);
    const d = extrairDispositivos(t);
    expect(d.map((x) => x.caminho).slice(18)).toEqual(['art-19', 'art-20', 'art-21', 'art-22', 'art-23']);
    expect(d.find((x) => x.caminho === 'art-19')!.texto).toContain('Art. 22-E. Ato do Advogado-Geral');
    expect(d.find((x) => x.caminho === 'art-20')!.texto).not.toContain('agências reguladoras');
  });

  it('"Art. 33, inciso II do caput" no começo da linha (tabela de anexo) é remissão, não artigo novo (Lei 12.599/2012)', () => {
    const t = htmlParaTexto('<p>Art. 1º Um.</p><p>Art. 2º Dois.</p><p>Art. 3º Ficam revogados os incisos.</p><p>Art. 9, inciso II do caput: a) ......... | obra publicitária</p>');
    const d = extrairDispositivos(t);
    expect(d.map((x) => x.caminho)).toEqual(['art-1', 'art-2', 'art-3']);
    expect(d[2].texto).toContain('Art. 9, inciso II do caput');
  });

  it('erro de digitação da página oficial ("rt. 758.", RIR/2018) ainda abre o artigo', () => {
    const t = htmlParaTexto('<p>Art. 1º Um.</p><p>Art. 2º Dois.</p><p>rt. 3. A incorporação ao capital de lucros não fica sujeita ao imposto.</p><p>Art. 4º Quatro.</p>');
    const d = extrairDispositivos(t);
    expect(d.map((x) => x.caminho)).toEqual(['art-1', 'art-2', 'art-3', 'art-4']);
    expect(d[2].texto).toBe('Art. 3. A incorporação ao capital de lucros não fica sujeita ao imposto.');
  });

  it('numeração com lacuna grande (bloco de artigos revogados) continua sendo uma só sequência', () => {
    const nums = [...Array.from({ length: 51 }, (_, i) => i + 1), ...Array.from({ length: 80 }, (_, i) => i + 70)];
    const t = htmlParaTexto(nums.map((n) => `<p>Art. ${n}. Texto ${n}.</p>`).join(''));
    expect(extrairDispositivos(t)).toHaveLength(131);
  });

  it('separa o ADCT da Constituição', () => {
    const t = htmlParaTexto('<p>Art. 1º Principal.</p><p>Art. 2º Segundo.</p><p>ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS</p><p>Art. 1º Transitório.</p><p>Art. 2º Outro transitório.</p>');
    expect(extrairDispositivos(t).map((x) => x.caminho)).toEqual(['art-1', 'art-2', 'adct-art-1', 'adct-art-2']);
  });
});
