import { describe, expect, it } from 'vitest';
import { consultasDaPergunta, respostaDeApoio, lerJson, validarResposta, type Candidato } from './base-legal.assistente';

const cands: Candidato[] = [
  { chave: 'lcp-214-2025', numero: 'LC 214/2025', rotulo: 'Art. 164', caminho: 'art-164', secao: null, texto: 'Art. 164. O produtor rural que auferir receita inferior a R$ 3.600.000,00\nno ano-calendário não será contribuinte.' },
];

describe('assistente da base legal', () => {
  it('lê JSON mesmo com cerca de código', () => {
    expect(lerJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(lerJson('lixo {"a":2} lixo')).toEqual({ a: 2 });
    expect(lerJson('sem json')).toBeNull();
  });

  it('aceita fundamento existente e trecho literal', () => {
    const r = validarResposta({ resposta: 'R$ 3,6 milhões (Art. 164).', suficiente: true, fundamentos: [{ id: 'lcp-214-2025/art-164', trecho: 'receita inferior a R$ 3.600.000,00 no ano-calendário' }] }, cands);
    expect(r.suficiente).toBe(true);
    expect(r.fundamentos[0].trecho).toContain('3.600.000,00');
  });

  it('descarta artigo inventado e trecho que não está no texto', () => {
    const r = validarResposta({ resposta: 'x', suficiente: true, fundamentos: [{ id: 'lcp-214-2025/art-999', trecho: 'a' }, { id: 'lcp-214-2025/art-164', trecho: 'limite de R$ 9 milhões' }] }, cands);
    expect(r.fundamentos).toHaveLength(1);
    expect(r.fundamentos[0].trecho).toBeNull();
  });

  it('sem fundamento válido nunca é "suficiente"', () => {
    const r = validarResposta({ resposta: 'algo', suficiente: true, fundamentos: [{ id: 'outra/coisa', trecho: '' }] }, cands);
    expect(r.suficiente).toBe(false);
  });

  it('entrada malformada não quebra', () => {
    expect(validarResposta(null, cands)).toMatchObject({ suficiente: false, fundamentos: [] });
  });
});


describe('recuperação conceitual e resposta de apoio', () => {
  it('expande a pergunta sobre contribuinte regular mesmo sem IA', () => {
    expect(consultasDaPergunta('Como descubro quem é contribuinte regular?', [])).toContain('"regime regular" "contribuinte"');
  });

  it('mantém conceitos separados, elimina duplicatas e limita as consultas', () => {
    const consultas = consultasDaPergunta('Como funciona a transição?', ['apropriação', ' extinção ', 'apropriação', '', ...Array.from({ length: 20 }, (_, i) => `termo ${i}`)]);
    expect(consultas).toHaveLength(8);
    expect(consultas.slice(0, 2)).toEqual(['apropriação', 'extinção']);
  });

  it('fornece trechos reais e uma explicação quando a geração falha', () => {
    const r = respostaDeApoio(cands, true);
    expect(r.resposta).toContain('Não consegui concluir');
    expect(r.suficiente).toBe(false);
    expect(cands[0].texto).toContain(r.fundamentos[0].trecho);
    expect(respostaDeApoio([], false).resposta).toContain('Não localizei');
  });
});


describe('perguntas curtas e comparações', () => {
  it.each(['ouro paga ibs?', 'ouro tem CBS?'])('recupera imunidade e incidência para %s', (pergunta) => {
    const consultas = consultasDaPergunta(pergunta, []);
    expect(consultas).toContain('"ouro" "ativo financeiro"');
    expect(consultas).toContain('"operações onerosas" "bens"');
  });
  it('busca a regra geral e as limitações do crédito, além de insumos', () => {
    const consultas = consultasDaPergunta('crédito de IBS e CBS é sobre tudo? ou segue regras de uso na operação como PIS e COFINS?', []);
    expect(consultas).toContain('"apropriar créditos" "regime regular"');
    expect(consultas).toContain('"uso ou consumo pessoal"');
    expect(consultas).toContain('"créditos" "extinção"');
    expect(consultas).toContain('"insumos" "crédito"');
  });
  it('não interpreta tesouro como ouro', () => {
    expect(consultasDaPergunta('títulos do tesouro', [])).toEqual([]);
  });
});
