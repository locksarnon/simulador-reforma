import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lerTabelasOficiais } from './tabelas-oficiais';

const ARQ = process.env.CALCULADORA_RFB_DB_TESTE ?? '';

describe.skipIf(!ARQ || !existsSync(ARQ))('tabelas oficiais da calculadora (banco real, quando informado)', () => {
  it('lê classes, reduções, documentos, fundamentos e vínculos com exceções', () => {
    const t = lerTabelasOficiais(ARQ);
    expect(t.versao_db).toMatch(/^V\d{4}$/);
    const c = t.classes.find((x) => x.c_class_trib === '200038')!;
    expect(c.cst).toBe('200');
    expect(c.pct_reducao_cbs).toBe(60);
    expect(c.documentos).toContain('NF-e');
    const i19 = t.vinculos.filter((v) => v.tipo === 'NCM' && v.codigo === '0207' && v.c_class_trib === '200003').flatMap((v) => v.excecoes);
    expect(i19).toEqual(expect.arrayContaining(['02074300', '02075300']));
  });
});
