import { describe, expect, it } from 'vitest';
import { extrairDispositivos, juntarPartes } from './base-legal.parser';
import { marcarRedacaoAnteriorEstadual, textoDaPagina } from './confaz';
import { FONTES_NORMAS, UFS_REGRAS_ESTADUAIS } from './fontes';

const GO = 'https://appasp.economia.go.gov.br/legislacao/arquivos/CTE/CTE.htm';
const MS = 'https://aacpdappls.net.ms.gov.br/appls/legislacao/serc/legato.nsf/x?OpenDocument';

describe('legislação estadual: redação anterior marcada pelo site vira riscado', () => {
  it('Goiás: parágrafos TextoRevo e NotaVigncia são redação anterior; o vigente (ParNormal) fica', () => {
    const html = `<p class=ParNormal>Art. 1º Os impostos estaduais são:</p>
      <p class=ParNormal>I - Imposto sobre Operações Relativas à Circulação de Mercadorias - ICMS;</p>
      <p class=NotaVigncia>NOTA: Redação com vigência de 01.03.92 a 31.12.00.</p>
      <p class=TextoRevo>II - Imposto sobre Heranças e Doações - IHD;</p>
      <p class=ParNormal>II - Imposto sobre a Transmissão Causa mortis e Doação - ITCD.</p>
      <p class=ParNormal>Art. 2º Segundo.</p>`;
    const d = extrairDispositivos(textoDaPagina(html, GO));
    expect(d.map((x) => x.caminho)).toEqual(['art-1', 'art-2']);
    expect(d[0].texto).toContain('II - Imposto sobre a Transmissão Causa mortis e Doação - ITCD.');
    expect(d[0].texto).not.toContain('Heranças e Doações - IHD');
    expect(d[0].redacoes_anteriores.some((r) => r.includes('Heranças e Doações - IHD'))).toBe(true);
  });

  it('Mato Grosso do Sul: o trecho em verde (#008250) é redação anterior', () => {
    const html = `<font face="Verdana">Art. 5º O contribuinte deve:</font><br><font face="Verdana">I - aplicar integralmente os recursos no país;</font><br>
      <font size="2" color="#008250" face="Verdana">Redação vigente até 20.12.2007.</font><br><font size="2" color="#008250" face="Verdana">I - não distribuir parcela do patrimônio;</font><br>
      <font face="Verdana">II - manter escrituração.</font><br><font face="Verdana">Art. 6º Seguinte.</font>`;
    const d = extrairDispositivos(textoDaPagina(html, MS));
    expect(d[0].texto).not.toContain('não distribuir parcela');
    expect(d[0].texto).toContain('II - manter escrituração.');
  });

  it('a marca só vale no site do estado que a usa', () => {
    const html = '<p class=TextoRevo>texto</p><font color="#008250">verde</font>';
    expect(marcarRedacaoAnteriorEstadual(html, 'https://www.planalto.gov.br/x.htm')).toBe(html);
    expect(marcarRedacaoAnteriorEstadual(html, GO)).toContain('line-through');
  });
});

describe('regulamentos estaduais grandes', () => {
  it('"Art. 1.000" é o artigo mil (o ponto é separador de milhar), e "Art. 12.5" não vira artigo 1', () => {
    const texto = ['Art. 998. Um.', 'Art. 999. Dois.', 'Art. 1.000. Mil.', 'Art. 1.001. Mil e um.'].join('\n');
    const d = extrairDispositivos(texto);
    expect(d.map((x) => x.caminho)).toEqual(['art-998', 'art-999', 'art-1000', 'art-1001']);
    expect(d[2].rotulo).toBe('Art. 1.000');
  });

  it('"Artigo 1º - ..." (São Paulo escreve por extenso) é o artigo 1', () => {
    const d = extrairDispositivos(['Artigo 1º - O imposto incide sobre:', 'I - a circulação de mercadorias;', 'Artigo 2º - Ocorre o fato gerador.', 'Artigo 3º - Terceiro.'].join('\n'));
    expect(d.map((x) => x.caminho)).toEqual(['art-1', 'art-2', 'art-3']);
    expect(d[0].texto).toContain('I - a circulação de mercadorias;');
  });

  it('anexo enorme vira partes; a primeira fica com o endereço do anexo e o código lá no fim continua achável', () => {
    const linhas = ['Art. 1º Um.', 'ANEXO II', 'DA REDUÇÃO DE BASE DE CÁLCULO', ...Array.from({ length: 2000 }, (_, i) => `${i + 1} | Produto número ${i + 1} com descrição longa | 0000.00.${String(i % 100).padStart(2, '0')}`), '2001 | Soja em grão | 1201.90.00'];
    const d = extrairDispositivos(linhas.join('\n'));
    const anexo = d.filter((x) => x.tipo === 'anexo');
    expect(anexo.length).toBeGreaterThan(4);
    expect(anexo[0]).toMatchObject({ caminho: 'anexo-ii', rotulo: 'Anexo II' });
    expect(anexo[1]).toMatchObject({ caminho: 'anexo-ii-t2', rotulo: 'Anexo II (continuação 2)' });
    expect(anexo.every((x) => x.texto.length <= 15_500)).toBe(true);
    expect(anexo.at(-1)!.texto).toContain('1201.90.00');
    expect(new Set(d.map((x) => x.ordem)).size).toBe(d.length);
  });

  it('capítulo antigo inteiro riscado antes do atual (Goiás): os artigos riscados com o mesmo número dos vigentes são redação anterior, não revogados a mais', () => {
    const html = `<p class=ParNormal>Art. 10. Antes.</p>
      <p class=TextoRevo>Art. 11. O imposto incidia sobre a redação antiga do capítulo.</p><p class=TextoRevo>Art. 12. Redação antiga do doze, também revogada.</p>
      <p class=ParNormal>Art. 11. O imposto incide sobre as operações atuais.</p><p class=ParNormal>Art. 12. Para os efeitos da legislação tributária vigente.</p>`;
    const d = extrairDispositivos(textoDaPagina(html, GO));
    expect(d.map((x) => x.caminho)).toEqual(['art-10', 'art-11', 'art-12']);
    expect(d.filter((x) => x.revogado)).toEqual([]);
    expect(d[1].texto).toBe('Art. 11. O imposto incide sobre as operações atuais.');
  });

  it('norma em várias páginas (RICMS/MT): cada página é lida sozinha e as listas se juntam sem repetir', () => {
    const p1 = extrairDispositivos('Art. 1º Primeiro.\nArt. 2º Segundo.');
    const p2 = extrairDispositivos('Art. 175. Do capítulo seguinte.\nArt. 176. Outro.');
    const p3 = extrairDispositivos('Art. 2º Segundo repetido em outra página.');
    const j = juntarPartes([p1, p2, p3]);
    expect(j.map((x) => x.caminho)).toEqual(['art-1', 'art-2', 'art-175', 'art-176']);
    expect(j.map((x) => x.ordem)).toEqual([1, 2, 3, 4]);
  });

  it('catálogo: as 11 UFs com RICMS; o texto estadual é lido, menos a página da SEFAZ-TO; RICMS/MT em páginas; RO pela lista de arquivos', () => {
    const estaduais = FONTES_NORMAS.filter((f) => f.uf);
    for (const { uf } of UFS_REGRAS_ESTADUAIS) expect(estaduais.some((f) => f.uf === uf && /RICMS/.test(f.botao ?? '')), uf).toBe(true);
    expect(estaduais.filter((f) => f.formato === 'externo').map((f) => f.chave)).toEqual(['to-sefaz-legislacao']);
    expect(FONTES_NORMAS.find((f) => f.chave === 'mt-dec-2212-2014')!.partes!.length).toBe(245);
    expect(FONTES_NORMAS.find((f) => f.chave === 'ro-dec-22721-2018')!.lista_de_arquivos).toBe('https://legislacao.sefin.ro.gov.br/link_arquivo/128');
    expect(FONTES_NORMAS.find((f) => f.chave === 'pa-dec-4676-2001')!.aviso_ia).toContain('texto estadual');
    expect(FONTES_NORMAS.find((f) => f.chave === 'go-dec-4852-1997')!.aviso_ia).toBeUndefined();
    expect(estaduais.filter((f) => f.chave.startsWith('mg-ricms-anexo-'))).toHaveLength(10);
  });
});
