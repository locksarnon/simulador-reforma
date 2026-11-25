import { describe, expect, it } from 'vitest';
import { extrairDispositivos, htmlParaTexto, semRiscado } from './base-legal.parser';

const dispositivos = (html: string) => extrairDispositivos(htmlParaTexto(html));
const por = (html: string, caminho: string) => dispositivos(html).find((d) => d.caminho === caminho)!;

describe('texto riscado no site oficial (redação superada ou revogada)', () => {
  it('o riscado por estilo (text-decoration: line-through) não entra no texto vigente e fica como redação anterior', () => {
    const html = `<p>Art. 1º Primeiro.</p>
      <p>Art. 2º <span style="color:black; text-decoration:line-through">alíquota de 10% (dez por cento)</span> alíquota de 20% (vinte por cento). (Redação dada pela Lei Complementar nº 239, de 2026)</p>
      <p>Art. 3º Terceiro.</p>`;
    const d = por(html, 'art-2');
    expect(d.texto).toContain('alíquota de 20%');
    expect(d.texto).not.toContain('10%');
    expect(d.redacoes_anteriores).toEqual(['alíquota de 10% (dez por cento)']);
    expect(d.alteracoes).toEqual([expect.objectContaining({ tipo: 'redacao', ato: 'LC 239/2026', referencia: 'lc 239/2026' })]);
  });

  it('também vale para <strike>, <s> e <del>, com atributos e tags abertas dentro', () => {
    const html = `<p>Art. 1º Um.</p><p>Art. 2º <s class="x">velho <a href="a.htm">com link</a></s> novo.</p><p>Art. 3º Três <del>apagado</del> fim.</p><p>Art. 4º Quatro.</p>`;
    expect(por(html, 'art-2').texto).toBe('Art. 2º novo.');
    expect(por(html, 'art-3').texto).toBe('Art. 3º Três fim.');
  });

  it('artigo revogado com o cabeçalho riscado e o aviso no mesmo parágrafo continua na base, como revogado, com o ato', () => {
    const html = `<p>Art. 212. Doze.</p>
      <p><span style="text-decoration:line-through">Art. 213. As marcas comerciais de cigarros passam a ser distribuídas em quatro classes.</span> <a href="x.htm">(Revogado pelo Decreto nº 7.990, de 2013) (Produção de efeito)</a></p>
      <p>Art. 214. Quatorze.</p>`;
    const d = dispositivos(html).map((x) => x.caminho);
    expect(d).toEqual(['art-212', 'art-213', 'art-214']);
    const rev = por(html, 'art-213');
    expect(rev.revogado).toBe(true);
    expect(rev.revogado_por).toBe('Decreto 7990/2013');
    expect(rev.texto).toBe('Art. 213. (Revogado pelo Decreto nº 7.990, de 2013) (Produção de efeito)');
    expect(rev.texto).not.toContain('marcas comerciais');
    expect(rev.redacoes_anteriores[0]).toContain('marcas comerciais');
    // o aviso não gruda mais no artigo anterior
    expect(por(html, 'art-212').texto).toBe('Art. 212. Doze.');
  });

  it('cabeçalho riscado e aviso de revogação em parágrafos separados', () => {
    const html = `<p>Art. 164. Antes.</p><p><strike>Art. 165. Sem prejuízo do estabelecido nesta Seção, aplicam-se as disposições do regulamento.</strike></p><p>(Revogado pelo Decreto nº 10.668, de 2021)</p><p>Art. 166. Depois.</p>`;
    expect(por(html, 'art-165')).toMatchObject({ revogado: true, revogado_por: 'Decreto 10668/2021' });
    expect(por(html, 'art-164').texto).toBe('Art. 164. Antes.');
  });

  it('artigo riscado cujo aviso de revogação está no título da seção (e não foi reeditado) vira artigo revogado', () => {
    const html = `<p>Art. 72. Antes.</p>
      <p>Seção IV</p><p>(Revogado pelo Decreto nº 10.668, de 2021)</p>
      <p><span style="text-decoration:line-through">Dos Produtos Destinados ao PDTI e ao PDTA</span></p>
      <p><strike>Art. 73. As empresas industriais e agropecuárias nacionais habilitadas em programas de desenvolvimento tecnológico fazem jus à redução.</strike></p>
      <p><strike>Parágrafo único. Os projetos aprovados até 2005 permanecem regidos pela legislação anterior.</strike></p>
      <p>Seção V</p><p>Art. 74. Depois.</p>`;
    expect(dispositivos(html).map((d) => d.caminho)).toEqual(['art-72', 'art-73', 'art-74']);
    const d = por(html, 'art-73');
    expect(d).toMatchObject({ revogado: true, texto: 'Art. 73. (Revogado pelo Decreto nº 10.668, de 2021)', revogado_por: 'Decreto 10668/2021' });
    expect(d.redacoes_anteriores).toHaveLength(2);
  });

  it('artigo riscado e reeditado com o mesmo número não vira dois dispositivos: o riscado é a redação anterior', () => {
    const html = `<p>Art. 164. Antes.</p><p><strike>Art. 165. Texto antigo.</strike></p><p>Art. 165. Texto novo. (Redação dada pela Lei Complementar nº 227, de 2026)</p><p>Art. 166. Depois.</p>`;
    expect(dispositivos(html).map((d) => d.caminho)).toEqual(['art-164', 'art-165', 'art-166']);
    expect(por(html, 'art-165')).toMatchObject({ revogado: false, redacoes_anteriores: ['Art. 165. Texto antigo.'] });
  });

  it('anexo revogado (título riscado + aviso) continua na lista de anexos, como revogado', () => {
    const html = `<p>Art. 1º Um.</p><p>ANEXO XIII</p><table><tr><td>1</td><td>Item</td></tr></table>
      <p><span style="text-decoration:line-through">ANEXO XIV</span> <a>(Revogado pela Lei Complementar nº 227, de 2026)</a></p>
      <p>ANEXO XV</p><table><tr><td>2</td><td>Outro</td></tr></table>`;
    expect(dispositivos(html).map((d) => d.caminho)).toEqual(['art-1', 'anexo-xiii', 'anexo-xiv', 'anexo-xv']);
    expect(por(html, 'anexo-xiv')).toMatchObject({ revogado: true, revogado_por: 'LC 227/2026' });
    expect(por(html, 'anexo-xiii').texto).not.toContain('Revogado');
  });

  it('"Ficam revogados os seguintes dispositivos" é artigo em vigor que revoga outras normas, não artigo revogado', () => {
    const html = `<p>Art. 539. Antes.</p><p>Art. 540. Ficam revogados os seguintes dispositivos do art. 5º da Lei nº 9.718, de 27 de dezembro de 1998:</p><p>I - o inciso II do § 1º.</p><p>Art. 541. Depois.</p>`;
    expect(por(html, 'art-540').revogado).toBe(false);
  });

  it('parágrafo ou inciso revogado dentro de artigo vigente marca o artigo como parcialmente revogado', () => {
    const html = `<p>Art. 1º Um.</p><p>Art. 2º O imposto incide sobre a operação.</p><p>§ 1º Texto vigente.</p><p>§ 2º (Revogado pela Lei Complementar nº 227, de 2026)</p><p>Art. 3º Três.</p>`;
    expect(por(html, 'art-2')).toMatchObject({ revogado: false, parcialmente_revogado: true, revogado_por: 'LC 227/2026' });
  });

  it('artigo vetado não tem texto operativo: sai da lista dos vigentes', () => {
    const html = `<p>Art. 1º Um.</p><p>Art. 2º (VETADO)</p><p>Art. 3º Três.</p>`;
    expect(por(html, 'art-2').revogado).toBe(true);
  });

  it('elemento riscado sem fechamento não engole o resto do documento', () => {
    const html = `<p>Art. 1º Um.</p><p><span style="text-decoration:line-through">riscado e esquecido aberto<p>Art. 2º Dois, vigente.</p><p>Art. 3º Três, vigente.</p>`;
    expect(por(html, 'art-2').texto).toBe('Art. 2º Dois, vigente.');
    expect(por(html, 'art-3').texto).toBe('Art. 3º Três, vigente.');
  });

  it('riscado que envolve parágrafos inteiros (a tag abre fora do <p>) é tratado como redação anterior', () => {
    const html = `<p>Art. 1º Um.</p><strike><p>§ 3º Parágrafo antigo inteiro.</p></strike><p>§ 3º Parágrafo novo. (Redação dada pela Lei X)</p><p>Art. 2º Dois.</p>`;
    const d = por(html, 'art-1');
    expect(d.texto).toContain('Parágrafo novo');
    expect(d.texto).not.toContain('Parágrafo antigo');
    expect(d.redacoes_anteriores.some((r) => r.includes('Parágrafo antigo'))).toBe(true);
  });

  it('semRiscado devolve só o vigente, e o texto sem nada riscado fica idêntico ao que sempre se guardou', () => {
    const t = htmlParaTexto('<p>Art. 1º <s>velho</s> novo.</p>');
    expect(semRiscado(t).replace(/\s+/g, ' ').trim()).toBe('Art. 1º novo.');
    expect(htmlParaTexto('<p>Art. 1º Texto &ordm; com &nbsp;espaço.</p>')).toBe('Art. 1º Texto º com espaço.');
  });
});
