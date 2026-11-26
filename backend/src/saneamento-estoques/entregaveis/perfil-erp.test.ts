import { describe, expect, it } from 'vitest';
import { CARGA_ERPS, idDoItemDaCarga } from '../../erps/carga';
import type { PerfilErp } from '../../erps/logica';
import { tiposDeAjusteDoCaso } from '../dados/ajustes';
import { sugerirMapeamento } from '../importacao';
import { dadosBase } from './__fixtures__/dados';
import { montarRelatorio, secaoParticularidadesErp } from './relatorio';
import { montarMapa, type CasoMapa, type ItemMapa } from './unificacoes';

/** O perfil como o banco devolve depois da carga inicial. */
const perfil = (id: string): PerfilErp => {
  const e = CARGA_ERPS.find((x) => x.id === id)!;
  return {
    id: e.id, nome: e.nome, fabricante: e.fabricante, produto: e.produto ?? null, situacao: e.situacao, ativo: true,
    itens: e.itens.map((i, ordem) => ({ id: idDoItemDaCarga(e.id, i.k), tipo: i.tipo, tipo_ajuste: i.tipo_ajuste ?? null, chave: i.chave, texto: i.texto, campo_erp: i.campo_erp ?? null, fonte_url: i.fonte_url, grau: i.grau, ordem, ativo: true })),
  };
};
const SAP = perfil('erp-sap-b1');
const OUTRO = perfil('erp-outro');

const it_ = (id: string, codigo: string, o: Partial<ItemMapa> = {}): ItemMapa => ({ id, codigo, estab: '', descricao: `ITEM ${codigo}`, unidade: 'KG', saldo: 0, ...o });
const caso = (o: Partial<CasoMapa>): CasoMapa => ({ id: 'c1', camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', itens: [], proposta: {}, justificativa: 'Mesmo produto.', motivo: '', situacao: 'APROVADO', decididoPor: 'ana@fal.test', decididoEm: new Date('2026-11-20T12:00:00Z'), ...o });
const mapa = (itens: ItemMapa[], casos: CasoMapa[], perfilErp: PerfilErp | null, vinculos: Parameters<typeof montarMapa>[0]['vinculos'] = []) => {
  const porId = new Map(itens.map((i) => [i.id, i]));
  return montarMapa({ liberada: false, dataBase: new Date('2026-12-31T00:00:00Z'), casos, item: (id) => porId.get(id), vinculos, perfilErp });
};

describe('perfil do ERP na importação', () => {
  it('com o perfil SAP B1, as colunas do export são pré-mapeadas pelo Cadastro de ERPs (NCM de ONCM.NcmCode, não a chave interna)', () => {
    const cab = ['ItemCode', 'ItemName', 'InvntryUom', 'NcmEntry', 'NcmCode', 'ItmsGrpNam', 'OnHand', 'frozenFor', 'UltimaMov', 'FirmName', 'SuppCatNum'];
    const colunas: Record<string, string[]> = {};
    for (const i of SAP.itens) if (i.tipo === 'COLUNA_EXPORT' && i.campo_erp) (colunas[i.chave] ??= []).push(i.campo_erp);
    const s = sugerirMapeamento(cab, [], { erp: SAP.nome, colunas });
    expect(s.mapeamento).toMatchObject({ codigo: 0, descricao: 1, unidade: 2, ncm: 4, grupo: 5, saldo: 6, ativo: 7, ultimaMovimentacao: 8, fabricante: 9, referencia: 10 });
    expect(s.colunas[4].motivo).toContain('export do SAP Business One');
    expect(s.semanticaAtivo).toBe('BLOQUEADO');
  });

  it('sem perfil, vale o reconhecimento pelo nome (como antes)', () => {
    const s = sugerirMapeamento(['Código', 'Descrição', 'UM'], []);
    expect(s.mapeamento).toMatchObject({ codigo: 0, descricao: 1, unidade: 2 });
  });
});

describe('perfil do ERP no mapa de unificações (Ação no ERP)', () => {
  const itens = [it_('a', '100', { saldo: 10 }), it_('b', '200', { saldo: 4 }), it_('c', '300', { saldo: null })];
  const unif = caso({ itens: ['a', 'b', 'c'], proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200 | 300' } });

  it('SAP B1: unificação = saída OIGE do que sai + entrada OIGN no que fica + inativar; com pendência, o texto geral vem antes', () => {
    const l = mapa(itens, [unif], SAP);
    expect(l[0].acao).toBe('Saída de mercadoria (OIGE) de 200 por depósito, lote e série; entrada de mercadoria (OIGN) em 100 na mesma quantidade convertida, na mesma data; depois inativar 200');
    expect(l[1].acao).toMatch(/^Conferir o saldo de 300 no ERP; havendo saldo, transferir para 100; inativar 300\. No SAP Business One: Saída de mercadoria \(OIGE\) de 300/);
  });

  it('inativação e troca de código usam o texto do ERP', () => {
    const q = caso({ id: 'q', camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', itens: ['x'], proposta: { decisao: 'PROPOR_INATIVACAO' } });
    const l = mapa([it_('x', '900', { saldo: 0 })], [q], SAP, [{ de: '1', para: '2', inicio: null, justificativa: '', criadoPor: 'sistema' }]);
    expect(l.find((x) => x.tipo === 'INATIVACAO')!.acao).toBe('Inativar 900 no cadastro (frozenFor = Y)');
    // Ação NAO_CONFIRMADO no cadastro sai marcada "(a confirmar no ERP)" (a mesma linha vai para o Excel e o PDF).
    expect(l.find((x) => x.tipo === 'TROCA_CODIGO')!.acao).toBe('Criar 2, saída OIGE de 1, entrada OIGN em 2 e inativar 1 (o ItemCode não se altera) (a confirmar no ERP)');
  });

  it('Outro ERP (a desenvolver) e sem ERP: o texto geral de sempre', () => {
    for (const p of [OUTRO, null]) {
      const l = mapa(itens, [unif], p);
      expect(l[0].acao).toBe('Transferir o saldo de 200 para 100 e inativar 200');
    }
  });

  it('nunca chama a unificação de "fusão"', () => {
    for (const l of mapa(itens, [unif], SAP)) expect(l.acao.toLowerCase()).not.toContain('fusão');
  });
});

describe('perfil do ERP nos casos e no relatório', () => {
  it('tipos de ajuste do caso escolhem as restrições', () => {
    expect(tiposDeAjusteDoCaso({ camada: 'NOMES_UNIDADES', tipo: 'UNIDADE', proposta: { unidade: 'KG' } })).toEqual(['MUDOU_UNIDADE']);
  });

  it('PDF: "Particularidades do ERP <nome>" com as restrições dos ajustes aprovados, grau e fonte; sem perfil específico, nada', () => {
    const casos = [{ situacao: 'APROVADO', camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '1', consolidar: '2' } }] as never;
    const s = secaoParticularidadesErp({ casos }, SAP)!;
    expect(s.titulo).toBe('Particularidades do ERP SAP Business One');
    expect(s.tabela!.linhas.map((l) => l[0])).toEqual(Array(4).fill('Consolidou código (unificação)'));
    // Parte confirmada e parte não confirmada em itens separados (fusão não documentada × OWTR; custo médio é pista da Community).
    expect(s.tabela!.linhas.map((l) => l[2])).toEqual(['Não confirmado', 'Confirmado', 'Não confirmado', 'Confirmado']);
    expect(s.tabela!.linhas[3][1]).toMatch(/versão 9\.0/);
    expect(s.paragrafos![0]).toMatch(/"Não confirmado" não têm fonte oficial/);
    expect(s.tabela!.linhas[0][3]).toMatch(/^https:\/\//);
    expect(secaoParticularidadesErp({ casos }, OUTRO)).toBeNull();
    expect(secaoParticularidadesErp({ casos }, null)).toBeNull();
    // Caso não aprovado não entra.
    expect(secaoParticularidadesErp({ casos: [{ ...(casos as unknown as object[])[0], situacao: 'PROPOSTO' }] as never }, SAP)).toBeNull();
  });

  it('o relatório completo traz a seção só quando há perfil', () => {
    const base = dadosBase(true);
    const com = JSON.stringify(montarRelatorio({ ...base, perfilErp: SAP }));
    const sem = JSON.stringify(montarRelatorio(base));
    expect(sem).not.toContain('Particularidades do ERP');
    const tipos = new Set<string>();
    for (const c of base.casos as { situacao: string; camada: string; tipo: string; proposta: unknown }[]) if (c.situacao === 'APROVADO') for (const t of tiposDeAjusteDoCaso(c)) tipos.add(t);
    const temRestricao = SAP.itens.some((i) => i.tipo === 'RESTRICAO' && i.tipo_ajuste && tipos.has(i.tipo_ajuste));
    expect(com.includes('Particularidades do ERP SAP Business One')).toBe(temRestricao);
  });
});
