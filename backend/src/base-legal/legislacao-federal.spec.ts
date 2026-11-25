import { describe, expect, it } from 'vitest';
import { anosDaConsulta, atosNovos, deveCarregarTexto, efeitoDaEmenta, lerListaFederal, porPrioridade, relevanciaDoAto, urlListaFederal } from './legislacao-federal';
import { atosDoTexto } from './marcas';

const doc = (norma: string, numero: string, ano: string, data: string, ementa: string, id = '1') => ({ id, tipo: norma.split('-')[0], numero, norma, normaNome: `${norma} ${data}`, ementa, dataassinatura: data, anoassinatura: ano });
const resposta = (docs: unknown) => ({ ListaDocumento: { documentos: { documento: docs } } });

const EMENTA_239 = 'Altera a Lei Complementar nº 200, de 30 de agosto de 2023, a Lei Complementar nº 176, de 29 de dezembro de 2020, a Lei Complementar nº 235, de 27 de agosto de 2026, a Lei Complementar nº 224, de 26 de dezembro de 2025, a Lei nº 11.540, de 12 de novembro de 2007, e a Lei nº 9.796, de 5 de maio de 1999, para conferir ao Poder Executivo federal novos instrumentos de gestão; e dá outras providências.';

const HOJE = new Date(Date.UTC(2026, 10, 25));

describe('leitura da lista de legislação federal do Senado', () => {
  it('monta rótulo, referência e endereços de cada ato', () => {
    const [lc, mp, lei, dec] = lerListaFederal(resposta([
      doc('LCP-239-2026-11-24', '239', '2026', '24/11/2026', EMENTA_239, '44462499'),
      doc('MPV-1399-2026-11-04', '1399', '2026', '04/11/2026', 'Estabelece alíquotas e normas complementares aplicáveis ao Imposto Seletivo para o ano-calendário de 2027.'),
      doc('LEI-15547-2026-11-19', '15547', '2026', '19/11/2026', 'Abre ao Orçamento de Investimento da União crédito suplementar.'),
      doc('DEC-13174-2026-11-23', '13174', '2026', '23/11/2026', 'Dispõe sobre a Medalha Marechal Sampaio.'),
    ]), HOJE);
    expect(lc).toMatchObject({ rotulo: 'LC 239/2026', referencia: 'lc 239/2026', url_senado: 'https://legis.senado.leg.br/norma/44462499', url_planalto: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp239.htm' });
    expect(lc.data?.toISOString().slice(0, 10)).toBe('2026-11-24');
    expect(mp).toMatchObject({ rotulo: 'MP 1399/2026', url_planalto: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/mpv/mpv1399.htm' });
    expect(lei).toMatchObject({ rotulo: 'Lei 15547/2026', url_planalto: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15547.htm' });
    expect(dec).toMatchObject({ rotulo: 'Decreto 13174/2026', url_planalto: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d13174.htm' });
  });

  it('a API devolve um objeto (e não uma lista) quando há um só ato; vazio e lixo não quebram', () => {
    expect(lerListaFederal(resposta(doc('LCP-239-2026-11-24', '239', '2026', '24/11/2026', 'Altera a Lei.')))).toHaveLength(1);
    expect(lerListaFederal(resposta([]))).toEqual([]);
    expect(lerListaFederal({ ListaDocumento: { documentos: '' } })).toEqual([]);
    expect(lerListaFederal(null)).toEqual([]);
    expect(lerListaFederal(resposta([{ norma: 'XYZ-1-2026', numero: '1', anoassinatura: '2026' }, { norma: 'LCP--2026', numero: '', anoassinatura: '2026' }, doc('LCP-1-2026-01-01', '1', '2026', '01/01/2026', 'Altera.')]))).toHaveLength(1);
  });

  it('repetição do mesmo ato na lista conta uma vez; data no futuro é ignorada', () => {
    const lista = lerListaFederal(resposta([
      doc('DEC-13162-2026-12-13', '13162', '2026', '13/12/2026', 'Autoriza o aumento de capital.'),
      doc('DEC-13162-2026-12-13', '13162', '2026', '13/12/2026', 'Autoriza o aumento de capital.'),
    ]), HOJE);
    expect(lista).toHaveLength(1);
    expect(lista[0].data).toBeNull();
  });

  it('endereços da consulta e anos: em janeiro o ano anterior também entra', () => {
    expect(urlListaFederal('LCP', 2026)).toBe('https://legis.senado.leg.br/dadosabertos/legislacao/lista?tipo=LCP&ano=2026');
    expect(anosDaConsulta(new Date(Date.UTC(2027, 0, 10)))).toEqual([2027, 2026]);
    expect(anosDaConsulta(HOJE)).toEqual([2026]);
  });
});

describe('o que a ementa diz sobre as normas da base', () => {
  const carregadas = new Set(['lc 214/2025', 'lc 235/2026', 'lc 224/2025', 'lc 123/2006']);

  it('lê todos os atos citados na ementa, na forma longa ("nº 200, de 30 de agosto de 2023")', () => {
    expect(atosDoTexto(EMENTA_239).map((a) => a.referencia)).toEqual(['lc 200/2023', 'lc 176/2020', 'lc 235/2026', 'lc 224/2025', 'lei 11540/2007', 'lei 9796/1999']);
    expect(atosDoTexto('na forma da Emenda à Constituição nº 141, de 16 de outubro de 2026').map((a) => a.referencia)).toEqual(['ec 141/2026']);
  });

  it('ato que altera norma carregada é relevante, com as normas citadas e o efeito', () => {
    const r = relevanciaDoAto({ ementa: EMENTA_239, referencia: 'lc 239/2026' }, carregadas);
    expect(r).toMatchObject({ relevante: true, motivo: 'cita_norma', efeito: 'alteracao' });
    expect(r.normas.map((n) => n.referencia)).toEqual(['lc 235/2026', 'lc 224/2025']);
  });

  it('tributo sem citar norma carregada é nova norma de interesse; formalidade orçamentária e homenagem não', () => {
    expect(relevanciaDoAto({ ementa: 'Estabelece alíquotas e normas complementares aplicáveis ao Imposto Seletivo para o ano-calendário de 2027, em Regime de Implementação Gradual.', referencia: 'mp 1399/2026' }, carregadas))
      .toMatchObject({ relevante: true, motivo: 'tema_tributario', efeito: 'nova_norma', grupo: 'reforma' });
    expect(relevanciaDoAto({ ementa: 'Abre ao Orçamento Fiscal da União, em favor do Superior Tribunal de Justiça, crédito suplementar no valor de R$ 11.785.853,00.', referencia: 'lei 15551/2026' }, carregadas).relevante).toBe(false);
    expect(relevanciaDoAto({ ementa: 'Confere o título de Capital Nacional do Melhor Arroz ao Município de Mirim Doce, no Estado de Santa Catarina.', referencia: 'lei 15323/2026' }, carregadas).relevante).toBe(false);
    expect(relevanciaDoAto({ ementa: 'Dispõe sobre a Medalha Marechal Sampaio e altera o Decreto nº 40.556, de 17 de dezembro de 1956.', referencia: 'decreto 13174/2026' }, new Set(['decreto 40556/1956'])).relevante).toBe(false);
  });

  it('ato sem tributo e sem norma carregada fica de fora; o próprio ato citado na ementa não conta', () => {
    expect(relevanciaDoAto({ ementa: 'Dispõe sobre a duração normal do trabalho e o repouso semanal remunerado.', referencia: 'decreto 13173/2026' }, carregadas).relevante).toBe(false);
    expect(relevanciaDoAto({ ementa: 'Altera a Lei Complementar nº 239, de 24 de novembro de 2026, para prorrogar prazo.', referencia: 'lc 239/2026' }, new Set(['lc 239/2026'])).relevante).toBe(false);
  });

  it('palavras soltas (imóvel rural, cooperativismo, conselho fiscal) não tornam o ato tributário', () => {
    for (const ementa of [
      'Declara de interesse social, para fins de desapropriação, o imóvel rural denominado Fazenda Itahyê, localizado no Município de Cuiabá.',
      'Reconhece o cooperativismo como manifestação da cultura nacional.',
      'Altera o Decreto nº 10.172, de 11 de dezembro de 2019, para alterar a composição do Conselho Fiscal do Serviço Autônomo.',
    ]) expect(relevanciaDoAto({ ementa, referencia: 'decreto 1/2026' }, carregadas).relevante).toBe(false);
  });

  it('o texto é carregado sozinho quando cita norma da base, ou quando é LC, emenda, MP ou lei/decreto de tributo de peso', () => {
    const rel = (ementa: string) => relevanciaDoAto({ ementa, referencia: 'x 1/2026' }, carregadas);
    const carrega = (tipo: string, ementa: string) => deveCarregarTexto({ tipo, ementa }, rel(ementa));
    expect(carrega('LCP', EMENTA_239)).toBe(true);
    expect(carrega('DEC', 'Altera o Decreto nº 13.119 e regulamenta a Lei Complementar nº 235, de 27 de agosto de 2026.')).toBe(true);
    expect(carrega('MPV', 'Estabelece alíquotas aplicáveis ao Imposto Seletivo para 2027.')).toBe(true);
    expect(carrega('LCP', 'Estabelece condições à concessão de isenção do Imposto sobre Serviços de Qualquer Natureza (ISS).')).toBe(true);
    expect(carrega('DEC', 'Prorroga os prazos de redução das alíquotas da Contribuição para o PIS/Pasep e da Cofins.')).toBe(true);
    // tributo, mas sem peso para o trabalho: só aparece como novidade
    expect(carrega('DEC', 'Dispõe sobre a dispensa de inscrição no Cadastro Nacional da Pessoa Jurídica de entidades sem tributação.')).toBe(false);
    expect(carrega('LEI', 'Altera a Lei nº 13.240, para ampliar as hipóteses de destinação de imóveis com isenção de taxa.')).toBe(false);
  });

  it('o efeito vem do primeiro verbo da ementa', () => {
    expect(efeitoDaEmenta('Revoga a Lei nº 9.718, de 27 de novembro de 1998.')).toBe('revogacao');
    expect(efeitoDaEmenta('Altera a Lei Complementar nº 123, de 14 de dezembro de 2006 (Lei do Simples Nacional), para atualizar o limite.')).toBe('alteracao');
    expect(efeitoDaEmenta('Prorroga o prazo de vigência do benefício.')).toBe('alteracao');
    expect(efeitoDaEmenta('Dispõe sobre o Imposto Seletivo e regulamenta a Lei Complementar nº 214, de 16 de janeiro de 2025.')).toBe('regulamentacao');
    expect(efeitoDaEmenta('Dispõe sobre a aplicação da Lei Complementar nº 214, de 2025.')).toBe('aplicacao');
  });
});

describe('quais atos são novos', () => {
  const atuais = lerListaFederal(resposta([
    doc('LCP-239-2026-11-24', '239', '2026', '24/11/2026', 'Altera.', '3'),
    doc('LCP-238-2026-10-21', '238', '2026', '21/10/2026', 'Altera.', '2'),
    doc('LCP-225-2026-01-08', '225', '2026', '08/01/2026', 'Institui o Código de Defesa do Contribuinte.', '1'),
  ]), HOJE);

  it('com lista anterior, é novo o que não estava nela', () => {
    expect(atosNovos(atuais, new Set(['https://legis.senado.leg.br/norma/1', 'https://legis.senado.leg.br/norma/2']), HOJE).map((a) => a.rotulo)).toEqual(['LC 239/2026']);
  });

  it('na primeira leitura só vale o que é recente (45 dias); o resto é ponto de partida', () => {
    expect(atosNovos(atuais, null, HOJE).map((a) => a.rotulo)).toEqual(['LC 239/2026', 'LC 238/2026']);
    expect(atosNovos(atuais, null, HOJE, 400)).toHaveLength(3);
  });

  it('prioridade para cadastrar: emenda e lei complementar antes de MP, lei e decreto; mais novo primeiro', () => {
    const l = lerListaFederal(resposta([
      doc('DEC-13174-2026-11-23', '13174', '2026', '23/11/2026', 'x'),
      doc('LEI-15547-2026-11-19', '15547', '2026', '19/11/2026', 'x'),
      doc('LCP-238-2026-10-21', '238', '2026', '21/10/2026', 'x'),
      doc('LCP-239-2026-11-24', '239', '2026', '24/11/2026', 'x'),
      doc('MPV-1399-2026-11-04', '1399', '2026', '04/11/2026', 'x'),
    ]), HOJE);
    expect([...l].sort(porPrioridade).map((a) => a.rotulo)).toEqual(['LC 239/2026', 'LC 238/2026', 'MP 1399/2026', 'Lei 15547/2026', 'Decreto 13174/2026']);
  });
});
