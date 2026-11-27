import { describe, expect, it } from 'vitest';
import { FINALIDADES } from '../../tipos';
import {
  CODIGOS_TIPO_ITEM_0200, TIPOS_ITEM_0200, IND_PROP_H010, IND_PROP_DE_TERCEIROS, MARCADORES, MARCADORES_ITEM,
  DE_PARA_FINALIDADE_TIPO_ITEM, deParaDaFinalidade, tipoItem0200, ehTipoItem0200, indProp,
  CFOP_OFICIAL, CFOPS, TITULOS_CFOP, NATUREZAS_CFOP, cfop, ehCfopValido, naturezaDoCfop, tituloDoCfop, cfopsDaNatureza,
  PARTICIPANTES, CODIGOS_PARTICIPANTE, participante,
  FONTE_GUIA_EFD, FONTE_CFOP, FONTE_LC214,
} from './index';

describe('fontes', () => {
  it('toda fonte é oficial e tem data de leitura', () => {
    for (const f of [FONTE_GUIA_EFD, FONTE_CFOP, FONTE_LC214]) {
      expect(f.url).toMatch(/^https:\/\/www\.(gov\.br|confaz\.fazenda\.gov\.br|planalto\.gov\.br)\//);
      expect(f.lidaEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.documento.length).toBeGreaterThan(10);
    }
  });
});

describe('tipo do item (0200)', () => {
  it('tem os 12 códigos oficiais, únicos, na ordem do Guia', () => {
    expect(TIPOS_ITEM_0200.map((t) => t.codigo)).toEqual(['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '99']);
    expect(CODIGOS_TIPO_ITEM_0200).toHaveLength(12);
    expect(TIPOS_ITEM_0200.every((t) => t.descricao.trim().length > 0)).toBe(true);
  });
  it('lookup', () => {
    expect(tipoItem0200('7')?.descricao).toBe('Material de Uso e Consumo');
    expect(tipoItem0200('11')).toBeNull();
    expect(ehTipoItem0200('99')).toBe(true);
    expect(ehTipoItem0200('11')).toBe(false);
  });
  it('IND_PROP do H010 tem 0, 1 e 2; "de terceiros" é o 2', () => {
    expect(IND_PROP_H010.map((i) => i.codigo)).toEqual(['0', '1', '2']);
    expect(indProp(IND_PROP_DE_TERCEIROS)?.descricao).toBe('Item de propriedade de terceiros em posse do informante');
  });
  it('de-para cobre toda finalidade interna, com tipo válido e marcadores conhecidos', () => {
    expect(DE_PARA_FINALIDADE_TIPO_ITEM.map((d) => d.finalidade).sort()).toEqual([...FINALIDADES].sort());
    for (const d of DE_PARA_FINALIDADE_TIPO_ITEM) {
      if (d.tipoItem !== null) expect(ehTipoItem0200(d.tipoItem)).toBe(true);
      for (const m of d.marcadores) expect(MARCADORES_ITEM).toContain(m);
    }
    expect(deParaDaFinalidade('IMOBILIZADO')).toMatchObject({ tipoItem: '08', marcadores: ['IMOBILIZADO'] });
    expect(deParaDaFinalidade('MATERIAL_TERCEIROS')).toMatchObject({ tipoItem: null, marcadores: ['DE_TERCEIROS'] });
  });
  it('todo marcador da lei tem fundamento e fonte; só o interno não tem', () => {
    expect(MARCADORES.map((m) => m.codigo).sort()).toEqual([...MARCADORES_ITEM].sort());
    for (const m of MARCADORES) {
      if (m.codigo === 'MANUTENCAO') expect(m.fundamento).toBeNull();
      else { expect(m.fundamento).toBeTruthy(); expect(m.fonte).toBeTruthy(); }
    }
  });
});

describe('CFOP', () => {
  it('códigos com 4 dígitos, únicos, grupo 1/2/3/5/6/7', () => {
    const codigos = CFOP_OFICIAL.map((c) => c.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const c of codigos) expect(c).toMatch(/^[123567]\d{3}$/);
    expect(CFOPS.length + TITULOS_CFOP.length).toBe(CFOP_OFICIAL.length);
    expect(CFOPS.length).toBeGreaterThan(600);
    for (const c of CFOPS) {
      expect(c.descricao.length).toBeGreaterThan(5);
      expect(NATUREZAS_CFOP).toContain(c.natureza);
      expect(c.sentido).toBe(Number(c.grupo) <= 3 ? 'ENTRADA' : 'SAIDA');
    }
  });
  it('títulos de grupo terminam em 00 ou 50 e não entram na lista de códigos', () => {
    for (const t of TITULOS_CFOP) expect(t.codigo).toMatch(/(00|50)$/);
    expect(cfop('5100')).toBeNull();
  });
  it('lookup e natureza de códigos conhecidos', () => {
    expect(cfop('5.102')).toMatchObject({ grupo: '5', natureza: 'VENDA', sentido: 'SAIDA' });
    expect(cfop('1102')?.natureza).toBe('COMPRA');
    expect(cfop('1202')?.natureza).toBe('DEVOLUCAO');
    expect(cfop('5152')?.natureza).toBe('TRANSFERENCIA');
    expect(cfop('5915')?.natureza).toBe('REMESSA');
    expect(cfop('1916')?.natureza).toBe('RETORNO');
    expect(cfop('5949')?.natureza).toBe('OUTRAS');
    expect(cfop('1504')?.natureza).toBe('DEVOLUCAO');
    expect(cfop('7667')?.descricao).toBe('Saída de combustíveis ou lubrificantes a consumidor ou usuário final');
    expect(ehCfopValido('9999')).toBe(false);
  });
  it('regra de natureza é a documentada', () => {
    expect(naturezaDoCfop('Lançamento efetuado a título de devolução de bem')).toBe('DEVOLUCAO');
    expect(naturezaDoCfop('Aquisição de serviço de transporte')).toBe('COMPRA');
    expect(naturezaDoCfop('Prestação de serviço de transporte')).toBe('VENDA');
    expect(naturezaDoCfop('Entrada de amostra grátis')).toBe('OUTRAS');
  });
  it('toda natureza existe em entradas e em saídas onde faz sentido', () => {
    expect(cfopsDaNatureza('VENDA', '5').length).toBeGreaterThan(0);
    expect(cfopsDaNatureza('COMPRA', '1').length).toBeGreaterThan(0);
    expect(tituloDoCfop('5102')?.codigo).toBe('5100');
    expect(tituloDoCfop('5152')?.codigo).toBe('5150');
  });
});

describe('participantes (Lista A)', () => {
  it('todos com rótulo, fundamento na LC 214 e efeito; códigos únicos', () => {
    expect(PARTICIPANTES.map((p) => p.codigo)).toEqual([...CODIGOS_PARTICIPANTE]);
    for (const p of PARTICIPANTES) {
      expect(p.rotulo).toBeTruthy();
      expect(p.fundamento).toMatch(/^LC 214\/2025, arts?\. \d+/);
      expect(p.efeito.length).toBeGreaterThan(30);
      expect(p.fonte).toBe(FONTE_LC214);
    }
  });
  it('lookup', () => {
    expect(participante('PRODUTOR_RURAL_NAO_CONTRIBUINTE')?.fundamento).toContain('art. 164');
    expect(participante('ZONA_FRANCA')).toBeNull();
  });
});
