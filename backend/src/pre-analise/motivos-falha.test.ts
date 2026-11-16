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
    const c = await s.certidaoFederal('12345678000199', 'PRODUCAO');
    expect(c?.resumo).toMatch(/^Sem acesso à API Consulta CND \(HTTP 403\)/);
  });
});
