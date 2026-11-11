import { describe, expect, it } from 'vitest';
import { IntegracoesService } from './integracoes.service';

const montar = ({ banco = true, storage = true, smtp = true } = {}) => new IntegracoesService(
  { $queryRaw: async () => { if (!banco) throw new Error('fora'); return [1]; } } as never,
  { configurado: smtp, remetente: 'InTAX <no-reply@fal>' } as never,
  { getPresignedUrl: async () => { if (!storage) throw new Error('fora'); return 'url'; } } as never,
);

describe('Integrações', () => {
  it('mostra o estado de cada conexão sem nunca devolver o valor de uma chave', async () => {
    const r = await montar().estado({ CERT_VAULT_KEY: 'segredo-super', CAPTURA_XML_AGENDADOR: 'on', GEMINI_API_KEY: 'chave-gemini' });
    const e = Object.fromEntries(r.map((x) => [x.id, x.estado]));
    expect(e).toMatchObject({ banco: 'ATIVO', armazenamento: 'ATIVO', email: 'ATIVO', cofre: 'ATIVO', captura: 'ATIVO', processos: 'ATIVO', ia: 'ATIVO', serpro: 'PREVISTO', whatsapp: 'PREVISTO' });
    expect(JSON.stringify(r)).not.toContain('segredo-super');
    expect(JSON.stringify(r)).not.toContain('chave-gemini');
  });
  it('aponta o que falta e o que caiu', async () => {
    const r = await montar({ banco: false, storage: false, smtp: false }).estado({ TAREFAS_AGENDADOR: 'off' });
    const e = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(e.banco.estado).toBe('COM_PROBLEMA');
    expect(e.armazenamento.estado).toBe('COM_PROBLEMA');
    expect(e.email).toMatchObject({ estado: 'NAO_CONFIGURADO', detalhe: expect.stringContaining('SMTP_HOST') });
    expect(e.cofre.estado).toBe('NAO_CONFIGURADO');
    expect(e.captura.estado).toBe('DESLIGADO');
    expect(e.processos.estado).toBe('DESLIGADO');
    expect(e.serpro.fase).toBe('3');
  });
});
