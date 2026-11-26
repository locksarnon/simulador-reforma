import { describe, expect, it } from 'vitest';
import { montarRelatorio } from './relatorio';
import { dadosBase } from './__fixtures__/dados';

describe('Relatório: projetos grandes', () => {
  it('250 mil decisões não estouram a pilha e o período sai do menor ao maior dia', () => {
    const d = dadosBase(true);
    const base = Date.UTC(2026, 9, 1, 12);
    const decisoes = [];
    for (let i = 0; i < 250_000; i++) {
      decisoes.push({ id: `d${i}`, projeto_id: 'P1', item_id: `i${i % 3}`, caso_id: 'c-desc', campo: 'descricao', antes: 'a', depois: 'b', fundamento: null, usuario: 'ana@fal.test', tipo: 'aprovar', quando: new Date(base + (i % 40) * 86_400_000) });
    }
    decisoes.push({ ...decisoes[0], id: 'sem-data', quando: null });
    d.decisoes = decisoes as never;
    const doc = montarRelatorio(d);
    const texto = JSON.stringify(doc);
    expect(texto).toContain('250.001 registros');
    expect(texto).toContain('entre 01/10/2026 e 09/11/2026');
  });
});
