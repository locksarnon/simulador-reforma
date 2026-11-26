import { describe, expect, it } from 'vitest';
import { COMPONENTES_NOME } from '../tipos';
import { LIMITES_OFICIAIS } from './limites-oficiais';

const CAMPOS_ITEM = ['descricao', 'codigo', 'unidade', 'referencia', 'fabricante'];

describe('LIMITES_OFICIAIS (leiaute oficial = teto)', () => {
  it('tem as linhas dos três leiautes pesquisados', () => {
    const destinos = new Set(LIMITES_OFICIAIS.map((l) => l.destino));
    expect([...destinos].sort()).toEqual(['NF-e e NFC-e', 'SPED EFD ICMS/IPI', 'SPED EFD-Contribuições']);
  });

  it('cada linha tem formato válido', () => {
    for (const l of LIMITES_OFICIAIS) {
      expect(l.origem, l.campo).toBe('LEIAUTE_OFICIAL');
      expect(CAMPOS_ITEM, l.campo).toContain(l.campoItem);
      expect(['SUGERIR_ABREVIACAO', 'SOLICITAR_REVISAO'], l.campo).toContain(l.tratamento);
      expect(l.tratamento, l.campo).toBe('SUGERIR_ABREVIACAO');
      expect(l.preservar, l.campo).toEqual(['NOME', 'REFERENCIA']);
      for (const c of l.preservar) expect(COMPONENTES_NOME, l.campo).toContain(c);
      expect(l.campo.trim().length, l.destino).toBeGreaterThan(0);
      if (l.limite !== null) expect(Number.isInteger(l.limite) && l.limite > 0, l.campo).toBe(true);
    }
  });

  it('nenhum limite sem referência e URL oficial', () => {
    for (const l of LIMITES_OFICIAIS) {
      expect(l.referencia, l.campo).toBeTruthy();
      expect(String(l.url), l.campo).toMatch(/^https:\/\/(www\.gov\.br\/sped|dfe-portal\.svrs\.rs\.gov\.br)\//);
    }
  });

  it('confirmado ⇔ limite numérico; não confirmado fica null', () => {
    for (const l of LIMITES_OFICIAIS) expect(l.confirmado, l.campo).toBe(l.limite !== null);
  });

  it('não há linha duplicada por destino e campo', () => {
    const chaves = LIMITES_OFICIAIS.map((l) => `${l.destino}|${l.campo}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('valores conferidos nas fontes', () => {
    const v = (destino: string, campo: string) => LIMITES_OFICIAIS.find((l) => l.destino === destino && l.campo === campo)?.limite;
    expect(v('NF-e e NFC-e', 'xProd (I04)')).toBe(120);
    expect(v('NF-e e NFC-e', 'cProd (I02)')).toBe(60);
    expect(v('SPED EFD ICMS/IPI', '0200 DESCR_ITEM')).toBe(255);
    expect(v('SPED EFD ICMS/IPI', '0200 COD_ITEM')).toBe(60);
    expect(v('SPED EFD ICMS/IPI', '0190 UNID')).toBe(6);
    // Menor teto oficial da descrição é o da NF-e (120).
    const descr = LIMITES_OFICIAIS.filter((l) => l.campoItem === 'descricao' && l.limite !== null).map((l) => l.limite as number);
    expect(Math.min(...descr)).toBe(120);
  });
});
