import { describe, expect, it } from 'vitest';
import type { Finalidade, ItemTrabalho } from '../tipos';
import { sugerirFinalidade, sugerirFinalidadePorGrupo } from './finalidade';

/** Os 52 grupos do mapa da política da Crestani (seção 2.3), como estão no cadastro (inclusive o espaço duplo e o "BENEFECIAMENTO"). */
const ESPERADO: Record<string, Finalidade | null> = {
  INSETICIDAS: 'INSUMO_PRODUCAO', HERBICIDAS: 'INSUMO_PRODUCAO', FUNGICIDAS: 'INSUMO_PRODUCAO', 'OUTROS DEFENSIVOS': 'INSUMO_PRODUCAO',
  'TRATAMENTO DE SEMENTES': 'INSUMO_PRODUCAO', FERTILIZANTES: 'INSUMO_PRODUCAO', 'CORRETIVOS DE SOLO': 'INSUMO_PRODUCAO',
  'SEMENTES MP': 'INSUMO_PRODUCAO', 'SEMENTES GERMINARE': 'INSUMO_PRODUCAO', MUDAS: 'INSUMO_PRODUCAO',
  'PECUARIA - NUTRICAO': 'INSUMO_PRODUCAO', 'PECUARIA - VACINAS/MEDICAMENTOS': 'INSUMO_PRODUCAO',
  COMBUSTIVEIS: 'INSUMO_PRODUCAO', 'LUBRIFICANTES/GRAXAS/ADITIVOS': 'INSUMO_PRODUCAO',
  'MATERIAIS PARA MANUTENCAO CORPO DE MAQUINA': 'MANUTENCAO', 'ANEIS/ ROLAMENTOS/RETENTORES E JUNTAS': 'MANUTENCAO', 'PARAFUSOS  E FIXADORES': 'MANUTENCAO',
  'FERRAMENTAS / ITENS OFICINA': 'MANUTENCAO', 'ELETRICA / ELETRONICA AUTOMOTIVA': 'MANUTENCAO', 'MANGUEIRA /CONEXOES HIDRAULICAS E PNEUMATICAS': 'MANUTENCAO',
  FILTROS: 'MANUTENCAO', 'CORREIAS E POLIAS': 'MANUTENCAO', 'MOTORES/TRANSMISSOES/CAMBIOS': 'MANUTENCAO', 'PNEUS/CAMARAS/BORRACHARIA': 'MANUTENCAO', 'FERRO/ACO': 'MANUTENCAO',
  'LIMPEZA/COPA/COZINHA/UTENSILIOS': 'USO_CONSUMO', 'ALIMENTOS / HORTA': 'USO_CONSUMO', 'INFORMATICA/RADIOCOMUNICACAO': 'USO_CONSUMO',
  'EPI - EPC SEGURANCA INDIVIDUAL SSMA': 'USO_CONSUMO', 'MATERIAIS DE EXPEDIENTE': 'USO_CONSUMO', 'MEDICAMENTOS FARMACEUTICOS': 'USO_CONSUMO', UNIFORMES: 'USO_CONSUMO',
  'PECUARIA - ITENS': 'USO_CONSUMO', 'BENS DE PEQUENO VALOR': 'USO_CONSUMO', 'COMUNICACAO E INFORMATICA': 'USO_CONSUMO',
  EQUIPAMENTOS: 'IMOBILIZADO', 'MOVEIS E UTENSILIOS': 'IMOBILIZADO', 'PLATAFORMA DE GRAOS': 'IMOBILIZADO', AERONAVES: 'IMOBILIZADO',
  'COLHEITADEIRAS DE GRAOS': 'IMOBILIZADO', TRATORES: 'IMOBILIZADO', 'PREDIOS EM PROP. DE TERCEIROS': 'IMOBILIZADO',
  TERCEIROS: 'MATERIAL_TERCEIROS', 'ARMAZENAGEM TERCEIROS': 'MATERIAL_TERCEIROS',
  // Ambíguos: sugestão de confiança baixa com alternativas...
  'MATERIAIS PARA CONSTRUCAO E RELACIONADOS': 'USO_CONSUMO', 'LONAS E PLASTICOS PARA COBERTURAS GERAIS': 'USO_CONSUMO',
  'MATERIAIS PARA BENEFECIAMENTO/ INDUSTRIALIZACAO': 'INSUMO_PRODUCAO',
  // ...ou nenhuma, com o motivo (nunca se inventa).
  PRODUCAO: null, 'PECUARIA - PLANTEL': null, SERVICOS: null, TAXAS: null, 'OUTROS PRODUTOS': null,
};
const AMBIGUOS = ['MATERIAIS PARA CONSTRUCAO E RELACIONADOS', 'LONAS E PLASTICOS PARA COBERTURAS GERAIS', 'MATERIAIS PARA BENEFECIAMENTO/ INDUSTRIALIZACAO'];
const ATIVIDADES_CRESTANI = ['PRODUCAO_AGRICOLA', 'PECUARIA'];

const item = (id: string, grupo: string, descricao = `ITEM ${id}`): ItemTrabalho => ({
  id, codigo: id, estabelecimento: null, descricao, unidade: 'UN', ncm: null, grupo, ativo: true, saldo: null, ultimaMovimentacao: null,
  fabricante: null, referencia: null, finalidade: null, campos: {},
} as unknown as ItemTrabalho);

describe('finalidade nos 52 grupos da Crestani (produção agrícola + pecuária)', () => {
  const grupos = Object.keys(ESPERADO);
  const itens = grupos.flatMap((g, n) => [item(`${n}a`, g), item(`${n}b`, g)]);
  const porGrupo = new Map(sugerirFinalidadePorGrupo(itens, ATIVIDADES_CRESTANI).map((s) => [s.grupo, s]));

  it('são os 52 grupos', () => expect(grupos).toHaveLength(52));

  it.each(grupos)('%s', (g) => {
    const s = porGrupo.get(g)!;
    expect(s.dominante).toBe(ESPERADO[g]);
    expect(s.motivoDaRegra).not.toBe('');
    expect(s.motivoDaRegra).not.toBe('nenhum indício no grupo ou no nome');
    if (ESPERADO[g] === null) expect(s.semSugestao).toBe(2);
  });

  it('todo grupo não ambíguo tem sugestão; os ambíguos ficam com confiança baixa e alternativas', () => {
    const semSugestao = grupos.filter((g) => !porGrupo.get(g)!.dominante);
    expect(semSugestao.sort()).toEqual(['OUTROS PRODUTOS', 'PECUARIA - PLANTEL', 'PRODUCAO', 'SERVICOS', 'TAXAS']);
    for (const g of AMBIGUOS) expect(porGrupo.get(g)).toMatchObject({ confianca: 'baixa', alternativas: expect.arrayContaining([expect.any(String)]) });
    expect(porGrupo.get('MATERIAIS PARA CONSTRUCAO E RELACIONADOS')!.alternativas).toContain('IMOBILIZADO');
    expect(porGrupo.get('MATERIAIS PARA BENEFECIAMENTO/ INDUSTRIALIZACAO')!.alternativas).toContain('EMBALAGEM');
    expect(porGrupo.get('PECUARIA - PLANTEL')!.motivoDaRegra).toContain('ativo biológico: confirmar com o cliente');
  });

  it('fertilizantes, defensivos e sementes: insumo de produção com confiança alta', () => {
    for (const g of ['FERTILIZANTES', 'CORRETIVOS DE SOLO', 'HERBICIDAS', 'FUNGICIDAS', 'INSETICIDAS', 'OUTROS DEFENSIVOS', 'TRATAMENTO DE SEMENTES', 'SEMENTES MP', 'SEMENTES GERMINARE', 'MUDAS']) {
      expect(porGrupo.get(g), g).toMatchObject({ dominante: 'INSUMO_PRODUCAO', confianca: 'alta' });
    }
  });

  it('peças e materiais de oficina: manutenção com confiança alta', () => {
    for (const g of ['PARAFUSOS  E FIXADORES', 'FILTROS', 'PNEUS/CAMARAS/BORRACHARIA', 'FERRO/ACO']) expect(porGrupo.get(g), g).toMatchObject({ dominante: 'MANUTENCAO', confianca: 'alta' });
  });

  it('para quem revende insumos, os mesmos grupos de insumo viram revenda (a lógica das atividades vale)', () => {
    const [h] = sugerirFinalidadePorGrupo([item('r1', 'HERBICIDAS')], ['REVENDA_INSUMOS']);
    expect(h).toMatchObject({ dominante: 'REVENDA', confianca: 'alta' });
  });
});

describe('finalidade pelo nome do item (plural e variações)', () => {
  const s = (descricao: string, ats = ATIVIDADES_CRESTANI) => sugerirFinalidade({ descricao, grupo: null, finalidade: null }, ats).finalidade;
  it('combustíveis, insumos e peças pelo nome, no singular e no plural', () => {
    expect(s('OLEO DIESEL S10')).toBe('INSUMO_PRODUCAO');
    expect(s('UREIA 45%')).toBe('INSUMO_PRODUCAO');
    expect(s('UREIA 45% BIG BAG')).toBe('INSUMO_PRODUCAO'); // a embalagem só vale quando o nome começa por ela
    expect(s('FERTILIZANTES NPK 04-14-08')).toBe('INSUMO_PRODUCAO');
    expect(s('SEMENTES DE MILHO')).toBe('INSUMO_PRODUCAO');
    expect(s('GRAXAS DE LITIO')).toBe('INSUMO_PRODUCAO');
    expect(s('OLEO LUBRIFICANTE 15W40')).toBe('INSUMO_PRODUCAO');
    expect(s('ROLAMENTOS 6205')).toBe('MANUTENCAO');
    expect(s('FILTROS DE AR')).toBe('MANUTENCAO');
    expect(s('UNIFORMES BRIM')).toBe('USO_CONSUMO');
    expect(s('BIG BAG 1000KG')).toBe('EMBALAGEM');
  });
});
