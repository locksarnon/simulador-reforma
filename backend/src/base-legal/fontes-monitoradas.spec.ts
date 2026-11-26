import { describe, expect, it } from 'vitest';
import { urlOficialValida } from './base-legal.deteccao';
import { atoDoCgibsRelevante, FONTES_MONITORADAS, hashDosLinks, linksDaPagina, novosLinks, pareceDocumento, urlDaFonte } from './fontes-monitoradas';

const HTML = `<html><body>
  <a href="/upload/arquivos/res6.pdf"><span>Resolução CGIBS nº 6</span> <b>(Regulamento do IBS)</b></a>
  <a href="https://www.cgibs.gov.br/upload/arquivos/res6.pdf#page=2">de novo</a>
  <a href='mailto:contato@cgibs.gov.br'>E-mail</a>
  <a href="#topo">Voltar</a>
  <a href="javascript:void(0)">Menu</a>
  <a href="https://www.cgibs.gov.br/upload/arquivos/Ato%20Conjunto%20RFB-CGIBS%2001.pdf"></a>
  <a href="https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica?a=1&amp;b=2">Documentação</a>
</body></html>`;

describe('links de uma página oficial', () => {
  const links = linksDaPagina(HTML, 'https://www.cgibs.gov.br/resolucoes');

  it('completa links relativos, tira o texto de dentro das tags e não repete endereço', () => {
    expect(links).toEqual([
      { titulo: 'Resolução CGIBS nº 6 (Regulamento do IBS)', url: 'https://www.cgibs.gov.br/upload/arquivos/res6.pdf' },
      { titulo: 'Ato Conjunto RFB CGIBS 01', url: 'https://www.cgibs.gov.br/upload/arquivos/Ato%20Conjunto%20RFB-CGIBS%2001.pdf' },
      { titulo: 'Documentação', url: 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica?a=1&b=2' },
    ]);
  });

  it('a impressão digital não depende da ordem nem do texto dos links', () => {
    const outra = [...links].reverse().map((l) => ({ ...l, titulo: 'outro texto' }));
    expect(hashDosLinks(outra)).toBe(hashDosLinks(links));
    expect(hashDosLinks(links.slice(1))).not.toBe(hashDosLinks(links));
  });

  it('novos links são os endereços que a leitura anterior não tinha', () => {
    expect(novosLinks(links.slice(0, 2), links)).toEqual([links[2]]);
    expect(novosLinks(links, links)).toEqual([]);
  });
});

describe('o link novo é documento ou ato?', () => {
  const l = (titulo: string, url = 'https://www.gov.br/x/y') => ({ titulo, url });

  it('arquivo e ato com número valem; menu, notícia e rede social não', () => {
    expect(pareceDocumento(l('Baixar', 'https://www.gov.br/x/leiaute-v2.xsd'))).toBe(true);
    expect(pareceDocumento(l('Nota Técnica 2025.002 v1.40'))).toBe(true);
    expect(pareceDocumento(l('Portaria Conjunta nº 4'))).toBe(true);
    expect(pareceDocumento(l('Acórdão 9101-007.123'))).toBe(true);
    expect(pareceDocumento(l('CONVÊNIO ICMS 32/12', 'https://www.confaz.fazenda.gov.br/legislacao/convenios/2012/CV032_12'))).toBe(true);
    expect(pareceDocumento(l('ATO CONJUNTO RFB/CGIBS Nº 1, DE 22 DE DEZEMBRO DE 2025', 'http://www.in.gov.br/web/dou/-/ato-conjunto-rfb-cgibs-n-1'))).toBe(true);
    // menu do site, mesmo com palavra de ato no nome, não tem número
    for (const menu of ['Resoluções', 'Regulamentos', 'Consultar Nota Fiscal', 'Manual do Doméstico', 'Convênios ICMS', '2025', 'Fale conosco', 'Ministro participa de evento']) expect(pareceDocumento(l(menu)), menu).toBe(false);
    // fora de órgão oficial não vale, mesmo sendo PDF
    expect(pareceDocumento(l('Resolução 12', 'https://api.whatsapp.com/send?text=https://www.gov.br/carf'))).toBe(false);
    expect(pareceDocumento(l('Parecer 9', 'https://escritorio.com.br/parecer.pdf'))).toBe(false);
    expect(pareceDocumento(l('Parecer 9', 'not a url'))).toBe(false);
  });

  it('entidades do HTML antigo ("CONV&#202;NIO") e estilo dentro do link não viram texto do título', () => {
    const l2 = linksDaPagina('<a href="https://www.confaz.fazenda.gov.br/legislacao/convenios/2012/CV032_12">CONV&#202;NIO ICMS 32/12</a><a href="/x"><style>.rounded-button { color: #1351b4; }</style> Entrar &amp; sair</a>', 'https://www.confaz.fazenda.gov.br/');
    expect(l2.map((x) => x.titulo)).toEqual(['CONVÊNIO ICMS 32/12', 'Entrar & sair']);
  });

  it('só ato do CGIBS em PDF que mexe na regra do IBS/CBS entra na base por conta própria', () => {
    const cgibs = (titulo: string, arquivo = 'a.pdf') => ({ titulo, url: `https://www.cgibs.gov.br/upload/arquivos/${arquivo}` });
    expect(atoDoCgibsRelevante(cgibs('Resolução CGIBS nº 9: regulamento do split payment'))).toBe(true);
    expect(atoDoCgibsRelevante(cgibs('Ato Conjunto RFB/CGIBS nº 2 sobre documentos fiscais'))).toBe(true);
    expect(atoDoCgibsRelevante(cgibs('Orçamento do CGIBS para 2027'))).toBe(false);
    expect(atoDoCgibsRelevante(cgibs('Regimento interno do Conselho Curador'))).toBe(false);
    expect(atoDoCgibsRelevante(cgibs('Resolução CGIBS nº 9', 'a.docx'))).toBe(false);
    expect(atoDoCgibsRelevante({ titulo: 'Resolução CGIBS nº 9: regulamento do IBS', url: 'https://www.gov.br/x/res9.pdf' })).toBe(false);
  });
});

describe('portais monitorados', () => {
  it('todos têm endereço oficial por https, chave única e grupo', () => {
    expect(FONTES_MONITORADAS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(FONTES_MONITORADAS.map((f) => f.chave)).size).toBe(FONTES_MONITORADAS.length);
    for (const f of FONTES_MONITORADAS) {
      expect(urlOficialValida(f.url), f.url).toBe(true);
      expect(['fundamentos', 'reforma', 'federal', 'agro', 'territorial', 'operacional']).toContain(f.grupo);
    }
  });
});

describe('endereço da fonte no ano', () => {
  it('{ano} vira o ano corrente em Brasília (na virada, 23h do dia 31 ainda é o ano velho)', () => {
    const confaz = { url: 'https://www.confaz.fazenda.gov.br/legislacao/convenios/{ano}' };
    expect(urlDaFonte(confaz, new Date(Date.UTC(2026, 10, 25, 12)))).toBe('https://www.confaz.fazenda.gov.br/legislacao/convenios/2026');
    expect(urlDaFonte(confaz, new Date(Date.UTC(2027, 0, 1, 1, 30)))).toBe('https://www.confaz.fazenda.gov.br/legislacao/convenios/2026'); // 22h30 de 31/12 em Brasília
    expect(urlDaFonte(confaz, new Date(Date.UTC(2027, 0, 1, 3, 30)))).toBe('https://www.confaz.fazenda.gov.br/legislacao/convenios/2027');
    expect(urlDaFonte({ url: 'https://www.cgibs.gov.br/regulamentos' })).toBe('https://www.cgibs.gov.br/regulamentos');
  });

  it('o endereço de cada fonte, com o ano posto, é de órgão oficial por https', () => {
    for (const f of FONTES_MONITORADAS) expect(urlOficialValida(urlDaFonte(f)), f.url).toBe(true);
    expect(FONTES_MONITORADAS.filter((f) => f.qualquerLink).map((f) => f.chave)).toEqual(['svrs-nfe-noticias']);
  });
});
