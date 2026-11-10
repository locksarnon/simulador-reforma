import { describe, expect, it } from 'vitest';
import { FONTES_NORMAS } from '../base-legal/fontes';
import { MARCOS_INICIAIS } from './agenda.marcos';
import { CATEGORIAS, lerDataIso, REGIMES, UFS } from './agenda.regras';

describe('datas oficiais da semente da agenda', () => {
  it('cada marco tem chave única, título, descrição e categoria conhecida', () => {
    const chaves = MARCOS_INICIAIS.map((m) => m.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const m of MARCOS_INICIAIS) {
      expect(m.chave, m.chave).toMatch(/^[a-z0-9-]+$/);
      expect(m.titulo.length, m.chave).toBeGreaterThan(10);
      expect(m.descricao.length, m.chave).toBeGreaterThan(30);
      expect(CATEGORIAS as readonly string[], m.chave).toContain(m.categoria);
      expect(['marco', 'prazo'], m.chave).toContain(m.tipo);
    }
  });

  it('as datas existem no calendário e o fim do período não vem antes do início', () => {
    for (const m of MARCOS_INICIAIS) {
      const inicio = lerDataIso(m.data);
      expect(inicio, `${m.chave}: data ${m.data}`).not.toBeNull();
      if (m.data_fim) {
        const fim = lerDataIso(m.data_fim);
        expect(fim, `${m.chave}: data_fim ${m.data_fim}`).not.toBeNull();
        expect((fim as Date).getTime(), m.chave).toBeGreaterThanOrEqual((inicio as Date).getTime());
      }
    }
  });

  it('regimes e UFs são os do cadastro de empresa', () => {
    for (const m of MARCOS_INICIAIS) {
      for (const r of m.regimes ?? []) expect(REGIMES as readonly string[], `${m.chave}: ${r}`).toContain(r);
      for (const u of m.ufs ?? []) expect(UFS as readonly string[], `${m.chave}: ${u}`).toContain(u);
    }
  });

  it('toda data vem com fonte oficial completa: instrumento, dispositivo, data do ato, endereço oficial e o trecho de onde foi lida', () => {
    const OFICIAIS = ['www.planalto.gov.br', 'normasinternet2.receita.fazenda.gov.br', 'www.cgibs.gov.br', 'www8.receita.fazenda.gov.br'];
    for (const m of MARCOS_INICIAIS) {
      expect(m.fontes.length, m.chave).toBeGreaterThan(0);
      for (const f of m.fontes) {
        expect(f.instrumento.length, `${m.chave} instrumento`).toBeGreaterThan(10);
        expect(f.dispositivo.length, `${m.chave} dispositivo`).toBeGreaterThan(2);
        expect(lerDataIso(f.data), `${m.chave}: data do ato`).not.toBeNull();
        expect(f.trecho.trim().length, `${m.chave} trecho`).toBeGreaterThan(15);
        const url = new URL(f.url);
        expect(url.protocol, `${m.chave} ${f.url}`).toBe('https:');
        expect(OFICIAIS, `${m.chave} ${f.url}`).toContain(url.hostname);
      }
    }
  });

  it('fonte ligada à Base legal usa norma do manifesto e traz o caminho; a URL é a oficial da norma', () => {
    const chaves = new Map(FONTES_NORMAS.map((n) => [n.chave, n.url_oficial]));
    for (const m of MARCOS_INICIAIS) {
      for (const f of m.fontes) {
        if (!f.norma_chave) { expect(f.caminho, m.chave).toBeUndefined(); continue; }
        expect(chaves.has(f.norma_chave), `${m.chave}: ${f.norma_chave}`).toBe(true);
        expect(f.caminho, m.chave).toMatch(/^(adct-)?art-\d+(-[a-z])?$/);
        expect(f.url, m.chave).toBe(chaves.get(f.norma_chave));
      }
    }
  });

  it('só é confirmado o que foi lido em texto oficial; o resto diz "não confirmado em fonte oficial"', () => {
    for (const m of MARCOS_INICIAIS) {
      const foraDaBase = m.fontes.some((f) => !f.norma_chave);
      if (m.confirmado) {
        // fonte fora da Base legal: o dia da leitura precisa estar registrado
        if (foraDaBase) expect(lerDataIso(m.lida_em), `${m.chave}: lida_em`).not.toBeNull();
        expect(m.observacao ?? '', m.chave).not.toMatch(/n[ãa]o confirmado/i);
      } else {
        expect(m.observacao ?? '', m.chave).toMatch(/n[ãa]o confirmado em fonte oficial/i);
      }
    }
  });

  it('há marcos que dependem do regime e da UF (os filtros têm o que filtrar)', () => {
    expect(MARCOS_INICIAIS.some((m) => (m.regimes ?? []).includes('Simples Nacional'))).toBe(true);
    expect(MARCOS_INICIAIS.some((m) => (m.regimes ?? []).includes('Produtor rural PF'))).toBe(true);
    expect(MARCOS_INICIAIS.some((m) => (m.ufs ?? []).includes('AM'))).toBe(true);
    expect(MARCOS_INICIAIS.some((m) => !(m.regimes ?? []).length && !(m.ufs ?? []).length)).toBe(true);
  });

  it('as datas conhecidas da transição estão na agenda', () => {
    const por = new Map(MARCOS_INICIAIS.map((m) => [m.chave, m]));
    expect(por.get('estoque-apropriacao-2027')?.data).toBe('2027-06-30');
    expect(por.get('estoque-inventario-2026')?.data).toBe('2026-12-31');
    expect(por.get('simples-cancelamento-opcao-2027')).toMatchObject({ data: '2026-11-03', data_fim: '2026-12-20' });
    expect(por.get('senado-limite-2026')?.data).toBe('2026-12-22');
    expect(por.get('icms-iss-extincao-2033')?.data).toBe('2033-01-01');
  });

  it('o texto não carrega rótulos de versão nem de rascunho', () => {
    const tudo = JSON.stringify(MARCOS_INICIAIS);
    expect(tudo).not.toMatch(/minuta|\bv0\.\d|a confirmar/i);
    expect(tudo).not.toMatch(/\bTODO\b/);
  });
});
