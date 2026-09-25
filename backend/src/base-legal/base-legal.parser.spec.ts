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
