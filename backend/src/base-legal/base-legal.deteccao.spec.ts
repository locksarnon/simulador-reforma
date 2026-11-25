import { describe, expect, it } from 'vitest';
import { chaveDe, normasCitadas, referenciaDe, urlOficialValida, urlProvavelDoAto } from './base-legal.deteccao';

describe('detecção de normas e URLs', () => {
  it('reconhece citações em formatos diferentes e normaliza', () => {
    const t = 'A Lei Complementar nº 235/2026 e o Decreto 12.955/2026 mudam a LC 214/2025; veja a Resolução CGIBS nº 13/2026 e o Ato Conjunto RFB/CGIBS nº 6/2026.';
    expect(normasCitadas(t).map((n) => n.referencia)).toEqual(['lc 235/2026', 'decreto 12955/2026', 'lc 214/2025', 'resolução cgibs 13/2026', 'ato conjunto rfb/cgibs 6/2026']);
  });

  it('não confunde números soltos', () => {
    expect(normasCitadas('o percentual de 20/2026 do total e 3/4 da receita')).toEqual([]);
  });

  it('a referência cadastrada bate com a citada', () => {
    expect(referenciaDe('Decreto 12.955/2026')).toBe('decreto 12955/2026');
    expect(referenciaDe('LC 227/2026')).toBe('lc 227/2026');
  });

  it('gera chave segura', () => {
    expect(chaveDe('resolução cgibs 13/2026')).toBe('resolucao-cgibs-13-2026');
  });

  it('reconhece também medida provisória, decreto-lei, instrução normativa (com o órgão), portaria, resolução do CGSN e convênio', () => {
    const t = 'Veja a MP 656/2014, o Decreto-Lei 1.598/1977, a IN RFB nº 2.121/2022, a Instrução Normativa SRF 83/2001, a IN 2.055/2021, a Portaria MF nº 3.074/2026, a Resolução CGSN nº 140/2018 e o Convênio ICMS 100/1997.';
    expect(normasCitadas(t).map((n) => n.referencia)).toEqual(['mp 656/2014', 'decreto-lei 1598/1977', 'in rfb 2121/2022', 'in srf 83/2001', 'in 2055/2021', 'portaria mf 3074/2026', 'resolução cgsn 140/2018', 'convênio icms 100/1997']);
  });

  it('o decreto-lei não é lido como decreto e o número do órgão não se presume', () => {
    expect(normasCitadas('Decreto-Lei nº 1.598/1977')[0]).toMatchObject({ rotulo: 'Decreto-Lei 1598/1977', tipo: 'Decreto-Lei' });
    expect(normasCitadas('IN 2.055/2021')[0].rotulo).toBe('IN 2055/2021');
  });

  it('palpite de endereço do Planalto para um ato citado', () => {
    expect(urlProvavelDoAto('lc 239/2026')).toBe('https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp239.htm');
    expect(urlProvavelDoAto('ec 132/2023')).toBe('https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm');
    expect(urlProvavelDoAto('lei 15270/2025')).toBe('https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm');
    expect(urlProvavelDoAto('decreto 12808/2025')).toBe('https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12808.htm');
    expect(urlProvavelDoAto('mp 656/2014')).toBe('https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/mpv/mpv656.htm');
    expect(urlProvavelDoAto('lei 9430/1996')).toBeNull(); // antes de 2007 o endereço não segue o padrão
    expect(urlProvavelDoAto('in rfb 2121/2022')).toBeNull();
  });

  it('só aceita https em sites oficiais', () => {
    expect(urlOficialValida('https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp235.htm')).toBe(true);
    expect(urlOficialValida('https://www.cgibs.gov.br/resolucoes')).toBe(true);
    // qualquer subdomínio de órgão oficial: Normas da RFB, Confaz, SPED, NF-e, SEFAZ, tribunais e Legislativo
    expect(urlOficialValida('https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=127905')).toBe(true);
    expect(urlOficialValida('https://www.confaz.fazenda.gov.br/legislacao/convenios/1997/CV100_97')).toBe(true);
    expect(urlOficialValida('https://www.nfe.fazenda.gov.br/portal/principal.aspx')).toBe(true);
    expect(urlOficialValida('https://www.sefaz.mt.gov.br/')).toBe(true);
    expect(urlOficialValida('https://portal.stf.jus.br/')).toBe(true);
    expect(urlOficialValida('https://www12.senado.leg.br/noticias')).toBe(true);
    expect(urlOficialValida('https://gov.br.evil.com/x')).toBe(false);
    expect(urlOficialValida('https://meu-gov.br/x')).toBe(false);
    expect(urlOficialValida('https://evilgov.br/x')).toBe(false);
    expect(urlOficialValida('http://www.planalto.gov.br/x')).toBe(false);
    expect(urlOficialValida('https://evil.com/planalto.gov.br')).toBe(false);
    expect(urlOficialValida('https://planalto.gov.br.evil.com/x')).toBe(false);
    expect(urlOficialValida('https://user:pw@www.planalto.gov.br/x')).toBe(false);
    expect(urlOficialValida('https://169.254.169.254/latest')).toBe(false);
    expect(urlOficialValida('https://localhost:3003/')).toBe(false);
  });
});
