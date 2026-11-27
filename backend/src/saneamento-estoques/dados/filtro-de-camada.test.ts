/** Aba Casos de cada fase: o filtro de camada aceita a lista das camadas da fase (separadas por vírgula). */
import { describe, expect, it } from 'vitest';
import { filtroDeCamada } from './casos.service';

describe('filtro de camada da lista e do lote', () => {
  it('uma camada vira o valor; várias viram { in } sem repetição; camada inválida é recusada', () => {
    expect(filtroDeCamada('NCM')).toBe('NCM');
    expect(filtroDeCamada('FINALIDADE, NCM_CLASSIFICACAO,TRIBUTARIO,FINALIDADE')).toEqual({ in: ['FINALIDADE', 'NCM_CLASSIFICACAO', 'TRIBUTARIO'] });
    expect(() => filtroDeCamada('NCM,XYZ')).toThrow();
  });
});
