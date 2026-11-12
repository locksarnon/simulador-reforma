import { describe, expect, it } from 'vitest';
import { lerCndt, lerCrf } from './infosimples.service';

describe('Infosimples: leitura da CNDT e do CRF', () => {
  it('CNDT negativa, positiva com efeito de negativa e positiva', () => {
    expect(lerCndt({ conseguiu_emitir_certidao_negativa: true, certidao: 'Certidão Negativa de Débitos Trabalhistas', validade_data: '11/05/2027', emissao_data: '12/11/2026', certidao_codigo: '123' })).toMatchObject({ status: 'CONCLUIDO', validade: '11/05/2027', numero: '123' });
    expect(lerCndt({ conseguiu_emitir_certidao_negativa: false, consta: true, certidao: 'Certidão Positiva de Débitos Trabalhistas com efeito de Negativa' }).status).toBe('CONCLUIDO');
    expect(lerCndt({ conseguiu_emitir_certidao_negativa: false, consta: true, certidao: 'Certidão Positiva de Débitos Trabalhistas', total_de_processos: '3' })).toMatchObject({ status: 'DEBITOS', resumo: expect.stringMatching(/3 processo/) });
  });

  it('CRF regular com validade; irregular', () => {
    expect(lerCrf({ situacao: 'REGULAR', validade_inicio_data: '01/11/2026', validade_fim_data: '30/11/2026', crf: '2026110100000000000000' })).toMatchObject({ status: 'CONCLUIDO', validade: '30/11/2026' });
    expect(lerCrf({ situacao: 'IRREGULAR' }).status).toBe('IRREGULAR');
  });
});
