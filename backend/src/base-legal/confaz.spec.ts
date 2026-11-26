import { describe, expect, it } from 'vitest';
import { extrairDispositivos } from './base-legal.parser';
import { atosDoConfaz, ehPaginaConfaz, notaDoConfaz, textoDaPagina } from './confaz';
import { atoDoTexto, clausulaDaLinha } from './marcas';

// Trecho no formato da página do Confaz (Convênio ICMS 100/97 e 52/91, simplificado).
const PAGINA = `<html><body><nav><p>Ir para o conteúdo</p></nav>
<p class="TituloAcordo">CONVÊNIO ICMS 100/97</p>
<p class="DataPublicao">Publicado no DOU de 06.11.97.</p>
<p class="A2DataPublicacao">Prorrogado, até 31.12.27, pelo Conv. ICMS <a href="x">79/25</a>.</p>
<p class="Ementa">Reduz a base de cálculo do ICMS nas saídas dos insumos agropecuários que especifica.</p>
<p class="TextoAcordo"><b>Cláusula primeira</b> Fica reduzida em 60% (sessenta por cento) a base de cálculo do ICMS nas saídas interestaduais dos seguintes produtos:</p>
<p class="A8-1Remissao">Nova redação dada ao inciso I do <i>caput </i>da cláusula primeira, pelo Conv. ICMS 99/04, efeitos a partir de 19.10.04.</p>
<p class="A5-1TextoAcordo">I - inseticidas, fungicidas, formicidas, herbicidas e parasiticidas;</p>
<p class="A8-2RemissaoAnt">Redação original, efeitos até 18.10.04.</p>
<p class="A8-3RedacaoAnt">I - inseticidas, fungicidas, formicidas, herbicidas, parasiticidas, germicidas e acaricidas antigos;</p>
<p class="A8-1Remissao">Revogado inciso II do caput da cláusula primeira pelo Conv. ICMS 26/21, efeitos a partir de 01.01.22.</p>
<p class="A5-1TextoAcordo">II - REVOGADO</p>
<p class="A8-2RemissaoAnt">Redação original, efeitos até 31.12.21.</p>
<p class="A8-3RedacaoAnt">II - ácido nítrico e ácido sulfúrico, ácido fosfórico, fosfato natural bruto e enxofre;</p>
<p class="TextoAcordo"><b>Cláusula segunda</b> Fica reduzida em 30% a base de cálculo do ICMS nas saídas interestaduais dos produtos que especifica.</p>
<p class="Remisso">Revogada a cláusula terceira pelo Conv. ICMS 21/97, efeitos a partir de 01.05.97.</p>
<p class="TextoAcordo">Cláusula terceira REVOGADA</p>
<p class="RemissoAnt">Redação original, efeitos até 30.04.97.</p>
<p class="RedaoAnt">Cláusula terceira Poderão os Estados permitir que o estabelecimento industrial adquira os produtos com suspensão.</p>
<p class="A5-1TextoAcordo">Cláusula terceira-A Fica reduzida em 60% a base de cálculo do ICMS nas operações internas com os produtos da cláusula primeira.</p>
<p class="Subtitulo">ANEXO I</p>
<table><tr><td><p class="TabelaSubtitulo">13.7</p></td><td><p class="Tabelajustificado">Outros fornos industriais.</p></td><td><p class="Tabelajustificado">8417.80.90</p></td></tr>
<tr><td colspan="3"><p class="RemissoAnt">Redação anterior dada ao subitem 13.7 do Anexo I pelo Conv. ICMS 89/09, efeitos de 15.10.09 a 31.05.12.</p></td></tr>
<tr><td><p class="TabelaSubtituloverde">13.7</p></td><td><p class="Tabelajustificadoverde">Fornos industriais para carbonização de madeira</p></td><td><p class="TabelaSubtituloverde">8417.8090</p></td></tr></table>
<div id="viewlet-below-content"><p>Compartilhe</p></div></body></html>`;

describe('convênios do Confaz (texto por cláusula)', () => {
  const disp = () => extrairDispositivos(textoDaPagina(PAGINA));

  it('reconhece a página do Confaz e lê uma cláusula por dispositivo, com o sufixo de letra', () => {
    expect(ehPaginaConfaz(PAGINA)).toBe(true);
    expect(ehPaginaConfaz('<p>Art. 1º Texto.</p>')).toBe(false);
    expect(disp().map((d) => `${d.tipo}:${d.caminho}:${d.rotulo}`)).toEqual([
      'clausula:clausula-1:Cláusula primeira',
      'clausula:clausula-2:Cláusula segunda',
      'clausula:clausula-3:Cláusula terceira',
      'clausula:clausula-3-a:Cláusula terceira-A',
      'anexo:anexo-i:Anexo I',
    ]);
  });

  it('a redação anterior nunca entra no texto vigente e fica guardada na cláusula certa', () => {
    const c1 = disp()[0];
    expect(c1.texto).toContain('I - inseticidas, fungicidas, formicidas, herbicidas e parasiticidas;');
    expect(c1.texto).not.toContain('germicidas');
    expect(c1.texto).not.toContain('ácido nítrico');
    expect(c1.redacoes_anteriores.some((r) => r.includes('germicidas'))).toBe(true);
    expect(c1.redacoes_anteriores.some((r) => r.includes('ácido nítrico'))).toBe(true);
    expect(disp()[1].redacoes_anteriores).toEqual([]);
  });

  it('as notas viram marcas com o convênio que alterou, revogou ou incluiu', () => {
    const c1 = disp()[0];
    expect(c1.alteracoes).toEqual(expect.arrayContaining([
      expect.objectContaining({ tipo: 'redacao', ato: 'Convênio ICMS 99/2004' }),
      expect.objectContaining({ tipo: 'revogacao', ato: 'Convênio ICMS 26/2021' }),
    ]));
    expect(c1).toMatchObject({ revogado: false, parcialmente_revogado: true, revogado_por: 'Convênio ICMS 26/2021' });
    expect(c1.texto).toContain('II - (Revogado inciso II do caput da cláusula primeira pelo Convênio ICMS nº 26, de 2021, efeitos a partir de 01.01.22)');
  });

  it('cláusula revogada continua na base, revogada, com o ato; a redação original fica como anterior', () => {
    const c3 = disp()[2];
    expect(c3).toMatchObject({ revogado: true, revogado_por: 'Convênio ICMS 21/1997' });
    expect(c3.texto).toBe('Cláusula terceira (Revogada a cláusula terceira pelo Convênio ICMS nº 21, de 1997, efeitos a partir de 01.05.97)');
    expect(c3.redacoes_anteriores.some((r) => r.includes('Poderão os Estados'))).toBe(true);
  });

  it('tabela do anexo sai uma linha por item, sem a linha "verde" (redação anterior)', () => {
    const anexo = disp()[4];
    expect(anexo.texto).toContain('13.7 | Outros fornos industriais. | 8417.80.90');
    expect(anexo.texto).not.toContain('carbonização');
    expect(anexo.redacoes_anteriores.some((r) => r.includes('carbonização'))).toBe(true);
  });

  it('o que fica fora do conteúdo (menu, rodapé) não entra', () => {
    const texto = textoDaPagina(PAGINA);
    expect(texto).not.toContain('Ir para o conteúdo');
    expect(texto).not.toContain('Compartilhe');
  });

  it('atos e notas no padrão do Confaz', () => {
    expect(atosDoConfaz('pelo Conv. ICMS 99/04, efeitos')).toBe('pelo Convênio ICMS nº 99, de 2004, efeitos');
    expect(atosDoConfaz('Ajuste SINIEF 07/05 e Protocolo ICMS 21/11')).toBe('Ajuste SINIEF nº 7, de 2005 e Protocolo ICMS nº 21, de 2011');
    expect(atoDoTexto('Convênio ICMS nº 100, de 1997')).toMatchObject({ rotulo: 'Convênio ICMS 100/1997', tipo: 'Convênio' });
    expect(atoDoTexto('Ajuste SINIEF nº 7, de 2005')).toMatchObject({ rotulo: 'Ajuste SINIEF 7/2005', tipo: 'Ajuste' });
    expect(notaDoConfaz('Nova redação dada ao § 1º pelo Conv. ICMS 51/10, efeitos a partir de 23.04.10.')).toBe('(Redação dada ao § 1º pelo Convênio ICMS nº 51, de 2010, efeitos a partir de 23.04.10)');
    expect(notaDoConfaz('Prorrogado, até 31.12.27, pelo Conv. ICMS 79/25.')).toBe('(Vigência: Prorrogado, até 31.12.27, pelo Convênio ICMS nº 79, de 2025)');
  });

  it('ordinais por extenso, até as dezenas', () => {
    expect(clausulaDaLinha('Cláusula décima segunda Os Estados ...')).toMatchObject({ numero: 12, rotulo: 'Cláusula décima segunda' });
    expect(clausulaDaLinha('Cláusula vigésima-primeira-A Texto')).toMatchObject({ numero: 21, sufixo: 'A' });
    expect(clausulaDaLinha('Cláusula décima Este convênio')).toMatchObject({ numero: 10 });
    expect(clausulaDaLinha('CLÁUSULA PRIMEIRA DO CONVÊNIO ICMS 52/91')).toBeNull();
  });
});
