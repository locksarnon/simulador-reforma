import { describe, it, expect, vi } from 'vitest';
import { AnalisesController } from './analises.controller';
describe('histórico por empresa', () => {
 it('restringe a abertura ao vínculo da empresa', async () => {
  const findFirst = vi.fn().mockResolvedValue(null);
  const c = new AnalisesController({ empresa: { findUnique: async () => ({id:'B'}) }, analiseEmpresa: {findFirst} } as any);
  await expect(c.obter('B','analise-de-A')).rejects.toThrow('nesta empresa');
  expect(findFirst).toHaveBeenCalledWith({where:{id:'analise-de-A',empresa_id:'B'}});
 });
 it('não grava análises de empresa inexistente', async () => {
  const c = new AnalisesController({ empresa: { findUnique: async () => null } } as any);
  await expect(c.salvar('ausente',{servico:'validador-nfse',titulo:'Teste',dados:{}},{email:'teste@local'} as any)).rejects.toThrow('Empresa não encontrada');
 });
});
