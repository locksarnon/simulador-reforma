import { BadRequestException } from '@nestjs/common';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';
import { CARGA_ERPS, idDoItemDaCarga } from './carga';
import { validarItem } from './erps.service';
import { CAMPOS_LIMITE, limitesDoErp, tamanhoDoTexto, TIPOS_CONHECIMENTO, type PerfilErp } from './logica';

/** Limite de campo (LIMITE_CAMPO) no Cadastro de ERPs: restrição adicional ao leiaute oficial (docs/limites-caracteres.md). */

const perfil = (id: string): PerfilErp => {
  const e = CARGA_ERPS.find((x) => x.id === id)!;
  return {
    id: e.id, nome: e.nome, fabricante: e.fabricante, produto: e.produto ?? null, situacao: e.situacao, ativo: true,
    itens: e.itens.map((i, ordem) => ({ id: idDoItemDaCarga(e.id, i.k), tipo: i.tipo, tipo_ajuste: i.tipo_ajuste ?? null, chave: i.chave, texto: i.texto, campo_erp: i.campo_erp ?? null, fonte_url: i.fonte_url, grau: i.grau, ordem, ativo: true })),
  };
};
const limite = (erp: string, campo: string) => limitesDoErp(perfil(erp)).find((l) => l.campoItem === campo);

describe('tipo LIMITE_CAMPO', () => {
  it('é um tipo de conhecimento, com rótulo "Limite de campo" na tela', async () => {
    expect(TIPOS_CONHECIMENTO).toContain('LIMITE_CAMPO');
    const tela = (await import(pathToFileURL(join(__dirname, '../../../src/lib/erps.js')).href)) as { TIPOS_CONHECIMENTO: Record<string, string>; CAMPOS_LIMITE: string[] };
    expect(tela.TIPOS_CONHECIMENTO.LIMITE_CAMPO).toBe('Limite de campo');
    expect(tela.CAMPOS_LIMITE).toEqual([...CAMPOS_LIMITE]);
  });

  it('tamanho só quando o texto começa por "<n> caracteres"', () => {
    expect(tamanhoDoTexto('200 caracteres (nVarChar 200).')).toBe(200);
    expect(tamanhoDoTexto(' 120 Caracteres')).toBe(120);
    expect(tamanhoDoTexto('Tamanho configurável no dicionário (SX3)')).toBeNull();
    expect(tamanhoDoTexto('até 120 caracteres')).toBeNull();
    expect(tamanhoDoTexto('0 caracteres')).toBeNull();
    expect(tamanhoDoTexto(null)).toBeNull();
  });

  it('validação: o rótulo do limite é um campo do item', () => {
    expect(validarItem({ tipo: 'LIMITE_CAMPO', chave: 'descricao', texto: '100 caracteres.', grau: 'CONFIRMADO' })).toMatchObject({ tipo: 'LIMITE_CAMPO', chave: 'descricao' });
    expect(() => validarItem({ tipo: 'LIMITE_CAMPO', chave: 'Descrição longa', texto: '100 caracteres.' })).toThrow(BadRequestException);
    expect(() => validarItem({ tipo: 'LIMITE_CAMPO', chave: 'ncm', texto: '8 caracteres.' })).toThrow(BadRequestException);
  });
});

describe('limites de campo da carga (só fonte oficial)', () => {
  it('todo item LIMITE_CAMPO tem campo do item válido, campo do ERP e fonte; confirmado começa pelo tamanho', () => {
    const itens = CARGA_ERPS.flatMap((e) => e.itens.filter((i) => i.tipo === 'LIMITE_CAMPO').map((i) => ({ erp: e.id, ...i })));
    expect(itens.length).toBeGreaterThan(0);
    for (const i of itens) {
      expect(CAMPOS_LIMITE as readonly string[], `${i.erp}:${i.k}`).toContain(i.chave);
      expect(i.campo_erp, `${i.erp}:${i.k}`).toBeTruthy();
      expect(i.fonte_url, `${i.erp}:${i.k}`).toMatch(/^https:\/\//);
      if (i.grau === 'CONFIRMADO') expect(tamanhoDoTexto(i.texto), `${i.erp}:${i.k}`).not.toBeNull();
      else expect(tamanhoDoTexto(i.texto), `${i.erp}:${i.k}`).toBeNull();
    }
  });

  it('SAP Business One: tamanhos da DB Tables Reference (OITM, OMRC)', () => {
    expect(limite('erp-sap-b1', 'codigo')).toMatchObject({ campoErp: 'OITM.ItemCode', limite: 50, confirmado: true });
    expect(limite('erp-sap-b1', 'descricao')).toMatchObject({ campoErp: 'OITM.ItemName', limite: 200, confirmado: true });
    expect(limite('erp-sap-b1', 'unidade')).toMatchObject({ limite: 100, confirmado: true });
    expect(limite('erp-sap-b1', 'referencia')).toMatchObject({ campoErp: 'OITM.SuppCatNum', limite: 50 });
    expect(limite('erp-sap-b1', 'fabricante')).toMatchObject({ campoErp: 'OMRC.FirmName', limite: 30 });
  });

  it('Aliare Siagri: descrição 120 confirmada; código não publicado fica pendente', () => {
    expect(limite('erp-aliare-siagri', 'descricao')).toMatchObject({ limite: 120, confirmado: true });
    expect(limite('erp-aliare-siagri', 'codigo')).toMatchObject({ limite: null, confirmado: false });
  });

  it('TOTVS Protheus: tamanho configurável no SX3 fica registrado sem número (nunca um padrão genérico)', () => {
    for (const c of ['codigo', 'descricao', 'unidade']) {
      const l = limite('erp-totvs-protheus', c)!;
      expect(l, c).toMatchObject({ limite: null, confirmado: false });
      expect(l.observacao, c).toMatch(/dicionário \(SX3/);
    }
  });

  it('item não confirmado com número no texto não vira limite; perfil sem conteúdo não tem limites', () => {
    const p = perfil('erp-sap-b1');
    p.itens = p.itens.map((i) => (i.tipo === 'LIMITE_CAMPO' && i.chave === 'descricao' ? { ...i, grau: 'NAO_CONFIRMADO' } : i));
    expect(limitesDoErp(p).find((l) => l.campoItem === 'descricao')).toMatchObject({ limite: null, confirmado: false });
    expect(limitesDoErp(perfil('erp-outro'))).toEqual([]);
    expect(limitesDoErp(null)).toEqual([]);
  });
});
