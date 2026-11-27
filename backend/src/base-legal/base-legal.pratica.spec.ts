import { describe, expect, it, vi } from 'vitest';
import { promptResposta, REGRAS_PRATICA, validarResposta, type Candidato } from './base-legal.assistente';
import { emailRelatorio, lerRespostaAprofundada, montarRelatorio, promptAprofundado } from './pesquisa-externa';
import { BaseLegalService, PRAZO_RESPOSTA_PONTE_MS, PRAZO_RESPOSTA_RESERVA_MS } from './base-legal.service';

const MS: Candidato = {
  chave: 'ms-ricms-anexo-i', numero: 'Anexo I do RICMS (MS)', rotulo: 'Art. 59-A', caminho: 'art-59-a', secao: null,
  texto: 'Art. 59-A. Fica reduzida a base de cálculo do ICMS nas operações com adubos e fertilizantes, de forma que a carga tributária seja equivalente a 4% (quatro por cento) do valor da operação.',
};
const PRATICA = {
  passos: ['Confira se o adubo será usado na agricultura ou na pecuária (Anexo I do RICMS/MS, art. 59-A, II).', 'Emita a NF-e aplicando a redução da base de cálculo.'],
  calculo: {
    formula: 'ICMS = valor da operação × carga efetiva',
    premissas: [{ id: 'P1', descricao: 'Valor da venda (exemplo)', valor: 100000, unidade: 'R$' }],
    parametros: [{ id: 'A1', descricao: 'Carga efetiva do ICMS', valor: 4, unidade: '%', fundamento: 'ms-ricms-anexo-i/art-59-a' }],
    linhas: [{ id: 'L1', descricao: 'ICMS da operação', expressao: 'P1 * A1', unidade: 'R$', resultado: 4000 }],
  },
  sem_calculo: null,
};
const RESPOSTA = { resposta: 'Depende: o adubo para uso agropecuário tem carga de ICMS equivalente a 4% no MS (Anexo I do RICMS/MS, art. 59-A).', suficiente: true, ressalvas: null, fundamentos: [{ id: 'ms-ricms-anexo-i/art-59-a', trecho: 'carga tributária seja equivalente a 4%' }], pratica: PRATICA };

describe('resposta consultiva: o que fazer e como calcular', () => {
  it('o prompt manda preencher a parte prática, com o formato que o InTAX confere', () => {
    const p = promptResposta('como calculo o ICMS do adubo no MS?', [MS]);
    expect(p).toContain(REGRAS_PRATICA);
    expect(p).toContain('"pratica": null');
    expect(p).toContain('"expressao": "P1 * A1"');
    expect(p).toContain('nunca "P1 * A1 / 100"');
    expect(p).toContain('O InTAX refaz todas as contas');
  });

  it('a validação devolve os passos e o cálculo conferido (parâmetro ligado ao artigo)', () => {
    const r = validarResposta(RESPOSTA, [MS]);
    expect(r.suficiente).toBe(true);
    expect(r.pratica!.passos).toHaveLength(2);
    expect(r.pratica!.calculo!.linhas[0]).toMatchObject({ conta: 'R$ 100.000,00 × 4%', valor_texto: 'R$ 4.000,00' });
    expect(r.pratica!.calculo!.parametros[0].fundamento.rotulo).toBe('Art. 59-A');
  });

  it('a pesquisa aprofundada lê a linha PRATICA (JSON) e confere do mesmo jeito', () => {
    expect(promptAprofundado('como calculo?', [MS])).toContain('PRATICA: <em pergunta prática, o JSON numa linha só');
    const texto = [
      'RESPOSTA:', RESPOSTA.resposta, 'ATENCAO:', 'nenhuma', 'SUFICIENTE: sim',
      'FUNDAMENTO: ms-ricms-anexo-i/art-59-a | carga tributária seja equivalente a 4%',
      `PRATICA: ${JSON.stringify(PRATICA)}`,
    ].join('\n');
    const r = lerRespostaAprofundada(texto, [MS]);
    expect(r.resposta).toBe(RESPOSTA.resposta);
    expect(r.pratica!.calculo!.linhas[0].resultado).toBe(4000);
    expect(lerRespostaAprofundada(texto.replace(/PRATICA: .*/, 'PRATICA: nenhuma'), [MS]).pratica).toBeNull();
  });

  it('o relatório (PDF) traz o passo a passo e a tabela do cálculo com a origem de cada número; o e-mail avisa', () => {
    const pratica = validarResposta(RESPOSTA, [MS]).pratica;
    const dados = { pergunta: 'como calculo?', resposta: RESPOSTA.resposta, ressalvas: null, fundamentos: [], fontes: [], aprofundada: false, data: new Date('2026-11-27T12:00:00Z'), pratica };
    const doc = montarRelatorio(dados);
    const passos = doc.secoes.find((s) => s.titulo === 'Na prática: o que fazer');
    expect(passos!.itens![0]).toMatch(/^1\. Confira se o adubo/);
    const calc = doc.secoes.find((s) => s.titulo === 'Cálculo modelo');
    expect(calc!.tabela!.linhas).toEqual([
      ['Valor da venda (exemplo)', '', 'R$ 100.000,00', 'Exemplo'],
      ['Carga efetiva do ICMS', '', '4%', 'Anexo I do RICMS (MS), Art. 59-A'],
      ['ICMS da operação', 'R$ 100.000,00 × 4%', 'R$ 4.000,00', 'Conta conferida'],
    ]);
    expect(emailRelatorio(dados).html).toContain('com a base legal, o passo a passo, o cálculo modelo, segue em anexo');
  });
});

describe('pergunta ao assistente (serviço)', () => {
  function montar(ia: () => Promise<{ texto: string; modelo: string }>) {
    const criado: { data?: Record<string, unknown> } = {};
    const prisma = { perguntaLegal: { create: vi.fn(async (a: { data: Record<string, unknown> }) => { criado.data = a.data; return { id: 'p1' }; }) } };
    const s = new BaseLegalService(prisma as never, { get: (k: string) => ({ CLAUDE_BRIDGE_URL: 'http://ponte', CLAUDE_BRIDGE_TOKEN: 'segredo-bem-comprido-123456' } as Record<string, string>)[k] } as never, {} as never);
    vi.spyOn(s, 'termosDaPergunta').mockResolvedValue(['adubo', 'carga tributária']);
    vi.spyOn(s, 'contextoDaPergunta').mockResolvedValue({ ufs: ['MS'], ncms: [], ufsDaBase: ['MS'], texto: '' } as never);
    vi.spyOn(s, 'candidatos').mockResolvedValue([MS]);
    const chamada = vi.spyOn(s, 'iaComModelo').mockImplementation(ia as never);
    return { s, criado, chamada };
  }

  it('responde pelo Fable 5.2 com o prazo longo, devolve o modelo e grava ressalvas e parte prática para o relatório', async () => {
    const { s, criado, chamada } = montar(async () => ({ texto: JSON.stringify(RESPOSTA), modelo: 'claude-fable-5-2' }));
    const r = await s.perguntar('eu@x.com', 'como calculo o ICMS do adubo no MS?');
    expect(chamada).toHaveBeenCalledWith(expect.stringContaining('como calculo o ICMS do adubo no MS?'), PRAZO_RESPOSTA_RESERVA_MS, PRAZO_RESPOSTA_PONTE_MS);
    expect(r).toMatchObject({ motivo: 'ok', modelo: 'claude-fable-5-2', suficiente: true });
    expect(r.pratica!.calculo!.linhas[0].valor_texto).toBe('R$ 4.000,00');
    expect(criado.data).toMatchObject({ modelo: 'claude-fable-5-2', pratica: r.pratica });
    expect(criado.data).toHaveProperty('ressalvas');
  });

  it('quando o Fable não responde e a reserva responde, o modelo devolvido é o da reserva', async () => {
    const { s } = montar(async () => ({ texto: JSON.stringify(RESPOSTA), modelo: 'gemini-3.5-flash' }));
    expect((await s.perguntar('eu@x.com', 'como calculo o ICMS do adubo no MS?')).modelo).toBe('gemini-3.5-flash');
  });

  it('se nenhum motor responde, não há modelo e a resposta é a de apoio', async () => {
    const { s } = montar(async () => { throw new Error('Tempo esgotado'); });
    const r = await s.perguntar('eu@x.com', 'como calculo o ICMS do adubo no MS?');
    expect(r).toMatchObject({ motivo: 'erro_ia', modelo: null, suficiente: false });
  });
});
