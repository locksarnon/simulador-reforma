import { describe, expect, it } from 'vitest';
import { alteracoesDoAto, artigosCitados, pendenciasDeConsolidacao, rotuloDoCaminho, type ArtigoDoAto } from './consolidacao';
import { atoDoTexto } from './marcas';

const artigo = (n: string, texto: string): ArtigoDoAto => ({ tipo: 'artigo', rotulo: `Art. ${n}`, caminho: `art-${n.toLowerCase()}`, texto });
const PONTOS = '.'.repeat(60);

// Trechos no formato do texto oficial da LC 227/2026 (Planalto).
const ART_166 = artigo('166', `Art. 166. A Lei Complementar nº 63, de 11 de janeiro de 1990, passa a vigorar com as seguintes alterações:\n“Art. 3º ${PONTOS}\nI - 65% (sessenta e cinco por cento), no mínimo, na proporção do valor adicionado;\n${PONTOS} ” (NR)`);
const ART_167 = artigo('167', `Art. 167. O § 1º do art. 13 da Lei Complementar nº 87, de 13 de setembro de 1996 (Lei Kandir), passa a vigorar acrescido do seguinte inciso III:\n“Art. 13. ${PONTOS}\n§ 1º ${PONTOS}\nIII - a partir de 1º de janeiro de 2027, o valor correspondente ao Imposto Seletivo.\n${PONTOS} ” (NR)`);
const ART_174 = artigo('174', `Art. 174. A Lei Complementar nº 214, de 16 de janeiro de 2025, passa a vigorar com as seguintes alterações:\n“Art. 12. Texto novo do doze.\n${PONTOS} ” (NR)\n“Art. 30-A. Artigo incluído pela lei.”\n“Art. 36. Texto novo do trinta e seis.” (NR)`);
const ART_175 = artigo('175', `Art. 175. O art. 81 da Lei nº 9.430, de 27 de dezembro de 1996, passa a vigorar acrescido do seguinte inciso VIII:\n“Art. 81. ${PONTOS}\nVIII - praticar reiteradamente as infrações de que trata o art. 471-D, nos termos do art. 471-E, ambos da Lei Complementar nº 214, de 16 de janeiro de 2025.\n${PONTOS} ” (NR)`);
const ART_178 = artigo('178', `Art. 178. O art. 2º da Lei Complementar nº 192, de 11 de março de 2022, passa a vigorar com a seguinte redação:\n“Art. 2º Texto.” (NR)`);
const ART_52 = artigo('52', 'Art. 52. O orçamento do CGIBS para os exercícios de 2025 a 2028 será composto dos montantes previstos no art. 484 da Lei Complementar nº 214, de 16 de janeiro de 2025, acrescidos das demais receitas previstas para o CGIBS.');
const ART_181 = artigo('181', `Art. 181. Revogam-se:
I - os seguintes dispositivos da Lei nº 5.172, de 25 de outubro de 1966 (Código Tributário Nacional):
a) parágrafo único do art. 35; e
b) art. 39;
II - o art. 84 da Medida Provisória nº 2.158-35, de 24 de agosto de 2001;
III - o art. 69 da Lei nº 10.833, de 29 de dezembro de 2003;
IV - os seguintes dispositivos da Lei Complementar nº 123, de 14 de dezembro de 2006:
a) o art. 87-B, na redação dada pelo art. 517 da Lei Complementar nº 214, de 16 de janeiro de 2025;
b) os arts. 90 a 92; e
V - a Lei nº 7.678, de 8 de novembro de 1988.`);

describe('o que um ato diz alterar em outras normas', () => {
  const lista = alteracoesDoAto([ART_166, ART_167, ART_174, ART_175, ART_178, ART_52]);
  const de = (ref: string, tipo: 'alteracao' | 'revogacao' = 'alteracao') => lista.find((a) => a.alvo.referencia === ref && a.tipo === tipo);

  it('lê a norma alvo do caput e ignora as que aparecem dentro do texto citado entre aspas', () => {
    expect(lista.filter((a) => a.tipo === 'alteracao').map((a) => a.alvo.referencia).sort()).toEqual(['lc 192/2022', 'lc 214/2025', 'lc 63/1990', 'lc 87/1996', 'lei 9430/1996']);
    // o art. 81 da Lei 9.430 cita a LC 214 só no texto novo (artigos 471-D e 471-E): não é alvo
    expect(de('lei 9430/1996')!.artigos).toEqual(['art-81']);
  });

  it('os artigos alterados vêm dos artigos reproduzidos entre aspas e do que o caput nomeia', () => {
    expect(de('lc 214/2025')).toMatchObject({ artigos: ['art-12', 'art-30-a', 'art-36'], do_ato: ['Art. 174'], integral: false });
    expect(de('lc 87/1996')!.artigos).toEqual(['art-13']);
    expect(de('lc 192/2022')!.artigos).toEqual(['art-2']);
  });

  it('"acrescidos das demais receitas" não é alteração de norma', () => {
    expect(lista.some((a) => a.do_ato.includes('Art. 52'))).toBe(false);
  });

  it('o mesmo ato alterando a mesma norma em dois artigos soma os artigos', () => {
    const duas = alteracoesDoAto([
      artigo('168', 'Art. 168. A Lei Complementar nº 123, de 14 de dezembro de 2006, passa a vigorar com as seguintes alterações:\n“Art. 3º Texto.” (NR)'),
      artigo('169', 'Art. 169. A Lei Complementar nº 123, de 14 de dezembro de 2006, passa a vigorar com as seguintes alterações:\n“Art. 18. Texto.” (NR)'),
    ]);
    expect(duas).toHaveLength(1);
    expect(duas[0]).toMatchObject({ artigos: ['art-3', 'art-18'], do_ato: ['Art. 168', 'Art. 169'] });
  });

  it('cláusula de revogação: cada inciso diz de qual norma, as alíneas herdam, redação dada por outro ato não vira alvo', () => {
    const r = alteracoesDoAto([ART_181]).filter((a) => a.tipo === 'revogacao');
    const ref = (x: string) => r.find((a) => a.alvo.referencia === x);
    expect(ref('lei 5172/1966')).toMatchObject({ artigos: ['art-35', 'art-39'], integral: false });
    expect(ref('lei 10833/2003')!.artigos).toEqual(['art-69']);
    expect(ref('mp 2158/2001')!.artigos).toEqual(['art-84']);
    expect(ref('lc 123/2006')!.artigos).toEqual(['art-87-b', 'art-90', 'art-91', 'art-92']);
    expect(ref('lc 214/2025')).toBeUndefined();
  });

  it('revogar a norma inteira é reconhecido; revogação com artigo não é integral', () => {
    const r = alteracoesDoAto([ART_181]).find((a) => a.alvo.referencia === 'lei 7678/1988')!;
    expect(r).toMatchObject({ tipo: 'revogacao', integral: true, artigos: [] });
    expect(alteracoesDoAto([artigo('9', 'Art. 9º Fica revogado o art. 3º da Lei nº 10.833, de 29 de dezembro de 2003.')])).toEqual([
      expect.objectContaining({ tipo: 'revogacao', integral: false, artigos: ['art-3'] }),
    ]);
    expect(alteracoesDoAto([artigo('9', 'Art. 9º Fica revogada a Lei nº 7.678, de 8 de novembro de 1988.')])).toEqual([
      expect.objectContaining({ tipo: 'revogacao', integral: true }),
    ]);
  });

  it('artigo comum, anexo e texto riscado não geram alteração', () => {
    expect(alteracoesDoAto([artigo('1', 'Art. 1º Esta Lei Complementar institui o imposto.'), { tipo: 'anexo', rotulo: 'ANEXO I', caminho: 'anexo-i', texto: 'ANEXO I\nA Lei nº 1, de 2000, passa a vigorar assim' }])).toEqual([]);
    // o que o texto oficial mostra riscado não vale como alteração vigente
    expect(alteracoesDoAto([artigo('7', 'Art. 7º \uE000A Lei nº 9.430, de 27 de dezembro de 1996, passa a vigorar com as seguintes alterações:\uE001 Texto sem alteração.')])).toEqual([]);
  });
});

describe('artigos citados', () => {
  it('lista, faixa, sufixo de letra e artigo único', () => {
    expect(artigosCitados('os arts. 3º, 4º e 5º da Lei')).toEqual(['art-3', 'art-4', 'art-5']);
    expect(artigosCitados('os arts. 90 a 92 da Lei')).toEqual(['art-90', 'art-91', 'art-92']);
    expect(artigosCitados('o art. 87-B e o art. 471-D')).toEqual(['art-87-b', 'art-471-d']);
    expect(artigosCitados('o § 1º do art. 13 da Lei')).toEqual(['art-13']);
    expect(artigosCitados('Esta Lei não cita artigo')).toEqual([]);
    expect(rotuloDoCaminho('art-30-a')).toBe('Art. 30-A');
    expect(rotuloDoCaminho('anexo-i')).toBe('anexo-i');
  });

  it('medida provisória reeditada ("nº 2.158-35") é reconhecida', () => {
    expect(atoDoTexto('a Medida Provisória nº 2.158-35, de 24 de agosto de 2001')).toMatchObject({ rotulo: 'MP 2158/2001', referencia: 'mp 2158/2001' });
  });
});

describe('alterações que o texto compilado da norma alvo ainda não mostra', () => {
  const alteradora = {
    chave: 'lcp-227-2026', numero: 'LC 227/2026', referencia: 'lc 227/2026', url_oficial: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp227.htm',
    alteracoes: alteracoesDoAto([ART_174, ART_181]),
  };
  const alvo = (o: Partial<{ chave: string; numero: string; referencia: string; situacao: string; atos_modificadores: { referencia?: string | null }[] }> = {}) => ({
    chave: 'lcp-214-2025', numero: 'LC 214/2025', referencia: 'lc 214/2025', situacao: 'vigente', atos_modificadores: [], ...o,
  });

  it('a norma alvo não cita o ato em nenhuma nota: alteração pendente de consolidação', () => {
    const p = pendenciasDeConsolidacao([alteradora], [alvo()]);
    expect(p).toEqual([expect.objectContaining({
      ato: expect.objectContaining({ numero: 'LC 227/2026', referencia: 'lc 227/2026' }),
      alvo: { chave: 'lcp-214-2025', numero: 'LC 214/2025', referencia: 'lc 214/2025' },
      tipos: ['alteracao'], artigos: ['art-12', 'art-30-a', 'art-36'], do_ato: ['Art. 174'],
    })]);
  });

  it('o texto compilado já traz notas do ato: consolidado, sem pendência', () => {
    expect(pendenciasDeConsolidacao([alteradora], [alvo({ atos_modificadores: [{ referencia: 'lc 227/2026' }] })])).toEqual([]);
  });

  it('norma alvo que não está na base não gera pendência; o próprio ato não é alvo de si mesmo', () => {
    expect(pendenciasDeConsolidacao([alteradora], [])).toEqual([]);
    expect(pendenciasDeConsolidacao([alteradora], [{ chave: 'lcp-227-2026', numero: 'LC 227/2026', referencia: 'lc 227/2026', situacao: 'vigente', atos_modificadores: [] }])).toEqual([]);
  });

  it('revogação da norma inteira: pendente enquanto o texto da alvo não a der como revogada', () => {
    const rev = { ...alteradora, alteracoes: alteracoesDoAto([ART_181]) };
    const velha = { chave: 'lei-7678-1988', numero: 'Lei 7.678/1988', referencia: 'lei 7678/1988', situacao: 'vigente', atos_modificadores: [] };
    expect(pendenciasDeConsolidacao([rev], [velha])).toEqual([expect.objectContaining({ integral: true, tipos: ['revogacao'] })]);
    expect(pendenciasDeConsolidacao([rev], [{ ...velha, situacao: 'revogada' }])).toEqual([]);
  });
});
