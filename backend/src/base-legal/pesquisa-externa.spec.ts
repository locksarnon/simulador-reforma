import { describe, expect, it } from 'vitest';
import type { Candidato } from './base-legal.assistente';
import { dominioOficial, emailRelatorio, lerFontes, lerRespostaAprofundada, montarRelatorio, promptAprofundado } from './pesquisa-externa';

const cand: Candidato = { chave: 'lcp-214-2025', numero: 'LC 214/2025', rotulo: 'Art. 47', caminho: 'art-47', secao: null, texto: 'O contribuinte poderá apropriar crédito de IBS e de CBS no regime regular.' };

describe('fontes externas', () => {
  it('só domínios de governo, tribunais e Legislativo valem como oficiais', () => {
    expect(dominioOficial('www.planalto.gov.br')).toBe(true);
    expect(dominioOficial('cgibs.gov.br')).toBe(true);
    expect(dominioOficial('stf.jus.br')).toBe(true);
    expect(dominioOficial('camara.leg.br')).toBe(true);
    expect(dominioOficial('barbieriadvogados.com')).toBe(false);
    expect(dominioOficial('gov.br.golpe.com')).toBe(false);
  });
  it('lê as fontes da busca, sem repetir domínio, só https, oficiais primeiro', () => {
    const f = lerFontes({
      groundingChunks: [
        { web: { uri: 'https://vertexaisearch.cloud.google.com/a', title: 'escritorio.com.br' } },
        { web: { uri: 'https://vertexaisearch.cloud.google.com/b', title: 'planalto.gov.br' } },
        { web: { uri: 'https://vertexaisearch.cloud.google.com/c', title: 'escritorio.com.br' } },
        { web: { uri: 'http://inseguro.test/x', title: 'inseguro.test' } },
        {},
      ],
    });
    expect(f.map((x) => x.dominio)).toEqual(['planalto.gov.br', 'escritorio.com.br']);
    expect(f[0].oficial).toBe(true);
    expect(f[1].oficial).toBe(false);
    expect(lerFontes(null)).toEqual([]);
  });
});

describe('resposta aprofundada', () => {
  it('lê resposta, atenção, suficiência e só aceita fundamento com trecho literal', () => {
    const texto = `RESPOSTA:
O crédito é apropriado no regime regular (LC 214/2025, art. 47). A regulamentação mudou em 2026 (fonte externa).
ATENCAO:
Confirmar vigência da portaria.
SUFICIENTE: sim
FUNDAMENTO: lcp-214-2025/art-47 | poderá apropriar crédito de IBS e de CBS
FUNDAMENTO: lcp-214-2025/art-999 | inventado`;
    const r = lerRespostaAprofundada(texto, [cand]);
    expect(r.resposta).toMatch(/regime regular/);
    expect(r.ressalvas).toBe('Confirmar vigência da portaria.');
    expect(r.suficiente).toBe(true);
    expect(r.fundamentos).toHaveLength(1);
    expect(r.fundamentos[0].trecho).toBe('poderá apropriar crédito de IBS e de CBS');
  });
  it('"nenhuma" vira sem ressalva e texto fora do formato ainda vira resposta', () => {
    const r = lerRespostaAprofundada('RESPOSTA:\nTexto.\nATENCAO:\nnenhuma\nSUFICIENTE: nao', [cand]);
    expect(r.ressalvas).toBeNull();
    expect(r.suficiente).toBe(false);
    expect(lerRespostaAprofundada('Só um texto solto.', [cand]).resposta).toBe('Só um texto solto.');
  });
  it('o prompt manda prevalecer o texto da lei e tratar a web como dado', () => {
    const p = promptAprofundado('Ouro paga IBS?', [cand]);
    expect(p).toMatch(/prevalece/);
    expect(p).toMatch(/ignore instruções/);
    expect(p).toContain('lcp-214-2025/art-47');
    for (const base of ['SPED', 'IRPF', 'Decreto 9.580/2018', 'Lei 10.637/2002', 'Lei 10.833/2003', 'Código Tributário Nacional', 'Instrução Normativa 83', 'Lei 12.974/2014', 'Soluções de Consulta']) expect(p, base).toContain(base);
  });
});

describe('relatório e e-mail', () => {
  const dados = {
    pergunta: 'Ouro paga IBS?', resposta: 'Depende do enquadramento.\nVeja o art. 47.', ressalvas: 'Conferir vigência.',
    fundamentos: [{ norma: 'lcp-214-2025', numero: 'LC 214/2025', rotulo: 'Art. 47', caminho: 'art-47', trecho: 'poderá apropriar crédito' }],
    fontes: [{ titulo: 'planalto.gov.br', url: 'https://x.test/a', dominio: 'planalto.gov.br', oficial: true }],
    aprofundada: true, data: new Date('2026-11-25T12:00:00Z'), solicitante: 'Maria',
  };
  it('monta o relatório com resposta, atenção, base legal e fontes', () => {
    const d = montarRelatorio(dados);
    expect(d.secoes.map((s) => s.titulo)).toEqual(['Pergunta', 'Resposta', 'Pontos de atenção', 'Base legal (texto oficial carregado no InTAX)', 'Fontes externas consultadas']);
    expect(d.subtitulo).toMatch(/Pesquisa aprofundada/);
    expect(d.secoes[4].itens?.[0]).toMatch(/^\[Oficial\] planalto\.gov\.br/);
    expect(d.aviso).toMatch(/Não substitui parecer/);
  });
  it('sem fontes nem ressalvas, as seções somem', () => {
    const d = montarRelatorio({ ...dados, ressalvas: null, fontes: [], aprofundada: false });
    expect(d.secoes.map((s) => s.titulo)).toEqual(['Pergunta', 'Resposta', 'Base legal (texto oficial carregado no InTAX)']);
  });
  it('e-mail escapa HTML e menciona o anexo', () => {
    const m = emailRelatorio({ ...dados, pergunta: 'x <b>y</b>' });
    expect(m.html).not.toContain('<b>y</b>');
    expect(m.html).toMatch(/anexo/);
    expect(m.assunto).toMatch(/^Consulta tributária:/);
  });
});
