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

describe('exclusão de análise salva', () => {
 const prismaCom = (registro: unknown) => ({ analiseEmpresa: { findFirst: vi.fn().mockResolvedValue(registro), delete: vi.fn() } });
 it('exclui quando é quem salvou ou administrador', async () => {
  const p = prismaCom({ id: 'a1', criado_por: 'ana@x.com' });
  const c = new AnalisesController(p as any);
  await expect(c.excluir('E1', 'a1', { email: 'ana@x.com', role: 'user' } as any)).resolves.toEqual({ ok: true });
  expect(p.analiseEmpresa.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  const p2 = prismaCom({ id: 'a1', criado_por: 'ana@x.com' });
  await new AnalisesController(p2 as any).excluir('E1', 'a1', { email: 'outro@x.com', role: 'admin' } as any);
  expect(p2.analiseEmpresa.delete).toHaveBeenCalled();
 });
 it('recusa outra pessoa, explicando quem pode, e não apaga análise de outra empresa', async () => {
  const p = prismaCom({ id: 'a1', criado_por: 'ana@x.com' });
  await expect(new AnalisesController(p as any).excluir('E1', 'a1', { email: 'bia@x.com', role: 'user' } as any)).rejects.toThrow('ana@x.com');
  expect(p.analiseEmpresa.delete).not.toHaveBeenCalled();
  const vazio = prismaCom(null);
  await expect(new AnalisesController(vazio as any).excluir('E2', 'a1', { email: 'ana@x.com', role: 'user' } as any)).rejects.toThrow('nesta empresa');
  expect(vazio.analiseEmpresa.findFirst).toHaveBeenCalledWith({ where: { id: 'a1', empresa_id: 'E2' }, select: { id: true, criado_por: true } });
 });
});
