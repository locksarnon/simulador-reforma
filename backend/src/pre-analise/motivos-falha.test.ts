import { describe, expect, it } from 'vitest';
import { motivoDaInfosimples } from '../infosimples/infosimples.service';
import { SerproCertidoes } from './serpro-certidoes';

describe('motivo das falhas na pré-análise', () => {
  it('Infosimples 603 por saldo vira uma frase curta com o que fazer', () => {
    expect(motivoDaInfosimples(603, 'O saldo inicial gratuito da sua conta permite uma quantidade limitada... faça seu primeiro pagamento adicionando saldo')).toMatch(/exige o primeiro pagamento/);
    expect(motivoDaInfosimples(603, 'sem autorização')).toMatch(/não tem autorização para esta consulta/);
    expect(motivoDaInfosimples(612, 'x')).toBe('a Infosimples não trouxe o resultado (código 612)');
    // o texto de "sem cobertura" continua reconhecível pela certidão do cliente (pausa de 30 dias e aviso para emitir no portal)
    expect(motivoDaInfosimples(607, 'Não está disponível uma consulta para o município de Sinop/MT.')).toMatch(/n[aã]o est[aá] dispon[ií]vel uma consulta para/i);
  });

  it('Serpro 403 na API é falta de acesso das chaves, não "tente em alguns minutos"', async () => {
    const contrato = { chavesDoProduto: async () => ({ key: 'k', secret: 's' }) };
    const s = new SerproCertidoes(contrato as never);
    s.fetchImpl = (async (url: string) => (String(url).endsWith('/token') ? new Response(JSON.stringify({ access_token: 't', expires_in: 3600 })) : new Response('', { status: 403 }))) as typeof fetch;
    const d = await s.dividaAtiva('12345678000199', 'PRODUCAO');
    expect(d?.resumo).toMatch(/^Sem acesso à API Consulta Dívida Ativa \(HTTP 403\)/);
    // com acesso pelo endereço -df: o 403 do primeiro endereço não vira erro
    s.fetchImpl = (async (url: string) => (String(url).endsWith('/token') ? new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }))
      : String(url).includes('consulta-divida-ativa-df/') ? new Response('', { status: 404 }) : new Response('', { status: 403 }))) as typeof fetch;
    expect((await s.dividaAtiva('12345678000199', 'PRODUCAO'))?.resumo).toBe('Nenhuma inscrição em Dívida Ativa da União.');
    s.fetchImpl = (async (url: string) => (String(url).endsWith('/token') ? new Response(JSON.stringify({ access_token: 't', expires_in: 3600 })) : new Response('', { status: 403 }))) as typeof fetch;
    const c = await s.certidaoFederal('12345678000199', 'PRODUCAO');
    expect(c?.resumo).toMatch(/^Sem acesso à API Consulta CND \(HTTP 403\)/);
  });
});

import { emPausa, resultadoDaFalha } from './certidoes.service';
describe('pausa das certidões automáticas (não pagar a mesma consulta todo dia)', () => {
  const agora = Date.parse('2026-11-16T12:00:00Z');
  const ha = (dias: number) => new Date(agora - dias * 86_400_000).toISOString();
  it('sem cobertura: 30 dias; pendência (débitos): 7 dias; fora do ar: tenta no dia seguinte', () => {
    expect(resultadoDaFalha({ resumo: 'não está disponível uma consulta para o município' })).toBe('SEM_COBERTURA');
    expect(resultadoDaFalha({ resumo: 'A certidão não foi emitida', status: 'DEBITOS' })).toBe('PENDENCIA');
    expect(resultadoDaFalha({ resumo: 'HTTP 500', status: 'INDISPONIVEL' })).toBe('INDISPONIVEL');
    expect(emPausa({ quando: ha(29), resultado: 'SEM_COBERTURA' }, agora)).toBe(true);
    expect(emPausa({ quando: ha(31), resultado: 'SEM_COBERTURA' }, agora)).toBe(false);
    expect(emPausa({ quando: ha(6), resultado: 'PENDENCIA' }, agora)).toBe(true);
    expect(emPausa({ quando: ha(8), resultado: 'PENDENCIA' }, agora)).toBe(false);
    expect(emPausa({ quando: ha(0.5), resultado: 'INDISPONIVEL' }, agora)).toBe(false);
    expect(emPausa(undefined, agora)).toBe(false);
  });
});
