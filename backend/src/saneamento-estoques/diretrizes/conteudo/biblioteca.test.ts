import { describe, expect, it } from 'vitest';
import { ASPECTOS, COMPONENTES_NOME, type ConteudoRegra } from '../tipos';
import { BIBLIOTECA_INICIAL, MODELOS, PROCEDIMENTOS } from './biblioteca';

/** Os 52 grupos do mapa da política da Crestani (seção 2.3). */
const GRUPOS_CRESTANI = [
  'INSETICIDAS', 'HERBICIDAS', 'FUNGICIDAS', 'OUTROS DEFENSIVOS', 'TRATAMENTO DE SEMENTES', 'FERTILIZANTES', 'CORRETIVOS DE SOLO',
  'LIMPEZA/COPA/COZINHA/UTENSILIOS', 'ALIMENTOS / HORTA', 'MATERIAIS PARA MANUTENCAO CORPO DE MAQUINA', 'ANEIS/ ROLAMENTOS/RETENTORES E JUNTAS',
  'PARAFUSOS  E FIXADORES', 'MATERIAIS PARA CONSTRUCAO E RELACIONADOS', 'FERRAMENTAS / ITENS OFICINA', 'ELETRICA / ELETRONICA AUTOMOTIVA',
  'MANGUEIRA /CONEXOES HIDRAULICAS E PNEUMATICAS', 'FILTROS', 'CORREIAS E POLIAS', 'INFORMATICA/RADIOCOMUNICACAO', 'MOTORES/TRANSMISSOES/CAMBIOS',
  'EPI - EPC SEGURANCA INDIVIDUAL SSMA', 'PNEUS/CAMARAS/BORRACHARIA', 'FERRO/ACO', 'MATERIAIS DE EXPEDIENTE', 'LUBRIFICANTES/GRAXAS/ADITIVOS', 'SEMENTES MP',
  'MEDICAMENTOS FARMACEUTICOS', 'UNIFORMES', 'PECUARIA - VACINAS/MEDICAMENTOS', 'PECUARIA - ITENS', 'MATERIAIS PARA BENEFECIAMENTO/ INDUSTRIALIZACAO',
  'SEMENTES GERMINARE', 'LONAS E PLASTICOS PARA COBERTURAS GERAIS', 'PECUARIA - NUTRICAO', 'PRODUCAO', 'PECUARIA - PLANTEL', 'COMBUSTIVEIS', 'MUDAS',
  'BENS DE PEQUENO VALOR', 'OUTROS PRODUTOS', 'EQUIPAMENTOS', 'SERVICOS', 'TERCEIROS', 'COMUNICACAO E INFORMATICA', 'MOVEIS E UTENSILIOS',
  'ARMAZENAGEM TERCEIROS', 'PLATAFORMA DE GRAOS', 'PREDIOS EM PROP. DE TERCEIROS', 'TAXAS', 'AERONAVES', 'COLHEITADEIRAS DE GRAOS', 'TRATORES',
];

const textoNaoVazio = (s: unknown) => typeof s === 'string' && s.trim().length > 0;

/** Erros de forma do conteúdo, pelo tipo do aspecto. */
function errosConteudo(c: ConteudoRegra): string[] {
  const e: string[] = [];
  switch (c.aspecto) {
    case 'NOMES':
      if (!c.componentes.length) e.push('sem componentes');
      if (new Set(c.componentes).size !== c.componentes.length) e.push('componente repetido');
      for (const x of c.componentes) if (!COMPONENTES_NOME.includes(x)) e.push(`componente inválido ${x}`);
      if (!c.obrigatorios.includes('NOME')) e.push('NOME não obrigatório');
      for (const x of c.obrigatorios) if (!c.componentes.includes(x)) e.push(`obrigatório fora dos componentes ${x}`);
      if (!['MAIUSCULAS', 'MINUSCULAS', 'PRESERVAR'].includes(c.capitalizacao)) e.push('capitalização inválida');
      if (typeof c.separador !== 'string' || !c.separador.length) e.push('separador vazio');
      if (typeof c.removerEspacosDuplicados !== 'boolean') e.push('removerEspacosDuplicados');
      for (const a of c.abreviacoes) if (!textoNaoVazio(a.completa) || !textoNaoVazio(a.abreviacao) || a.abreviacao.length >= a.completa.length) e.push(`abreviação inválida ${a.completa}`);
      if (new Set(c.abreviacoes.map((a) => a.completa)).size !== c.abreviacoes.length) e.push('abreviação repetida');
      for (const t of c.termosProibidos) if (!textoNaoVazio(t.termo) || (t.substituicao !== null && !textoNaoVazio(t.substituicao))) e.push(`termo inválido ${t.termo}`);
      if (new Set(c.termosProibidos.map((t) => t.termo)).size !== c.termosProibidos.length) e.push('termo proibido repetido');
      break;
    case 'ATRIBUTOS':
      if (!c.atributos.length) e.push('sem atributos');
      if (new Set(c.atributos.map((a) => a.atributo)).size !== c.atributos.length) e.push('atributo repetido');
      for (const a of c.atributos) {
        if (!/^[A-Z_]+$/.test(a.atributo)) e.push(`nome de atributo ${a.atributo}`);
        if (!['DESCRICAO', 'CAMPO_PROPRIO', 'AMBOS'].includes(a.onde)) e.push(`onde ${a.atributo}`);
        if (!['OBRIGATORIO', 'QUANDO_APLICAVEL'].includes(a.aplicabilidade)) e.push(`aplicabilidade ${a.atributo}`);
        if (a.aplicabilidade === 'QUANDO_APLICAVEL' && !textoNaoVazio(a.condicao)) e.push(`condição ausente ${a.atributo}`);
        if (a.onde === 'DESCRICAO' && a.campo) e.push(`campo em atributo da descrição ${a.atributo}`);
      }
      break;
    case 'UNIDADES':
      if (!['MENOR_PRATICA', 'DEFINIDA'].includes(c.criterioEstoque)) e.push('critério');
      if (c.criterioEstoque === 'DEFINIDA' && !textoNaoVazio(c.unidadeDefinida)) e.push('unidade definida ausente');
      if (c.criterioEstoque === 'MENOR_PRATICA' && c.unidadeDefinida) e.push('unidade definida com critério MENOR_PRATICA');
      if (c.conversaoDesconhecida !== 'PENDENCIA') e.push('conversão desconhecida');
      for (const u of [...c.unidadesCompra, ...c.unidadesSaida]) if (!/^[A-Z0-9]+$/.test(u)) e.push(`unidade ${u}`);
      for (const k of c.conversoes) {
        if (!(k.fator > 0) || !Number.isFinite(k.fator)) e.push(`fator ${k.origem}`);
        if (k.origem === k.destino) e.push(`conversão para si ${k.origem}`);
        if (k.abrangencia === 'PRODUTO' && !k.codigoProduto) e.push(`conversão de produto sem código ${k.origem}`);
      }
      break;
    case 'FISCAL':
      if (typeof c.validarNcm !== 'boolean' || typeof c.validarCClassTrib !== 'boolean') e.push('flags');
      if (!c.cenarios.length) e.push('sem cenários');
      for (const s of c.cenarios) if (!['ENTRADA', 'SAIDA', 'USO_INTERNO'].includes(s)) e.push(`cenário ${s}`);
      if (c.ausente !== 'PENDENCIA' || c.ambiguo !== 'REVISAO_FISCAL') e.push('tratamento');
      for (const x of c.excecoesNcm) if (!textoNaoVazio(x.alvo) || !textoNaoVazio(x.justificativa)) e.push('exceção sem justificativa');
      break;
    default:
      e.push(`aspecto não esperado ${(c as { aspecto: string }).aspecto}`);
  }
  return e;
}

describe('Biblioteca inicial de diretrizes', () => {
  it('ids únicos, estáveis e versão 1', () => {
    const ids = [...BIBLIOTECA_INICIAL.map((r) => r.id), ...PROCEDIMENTOS.map((p) => p.id), ...MODELOS.map((m) => m.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of BIBLIOTECA_INICIAL) {
      expect(r.id).toMatch(/^bib-[a-z]+(-[a-z]+)*$/);
      expect(r.versao).toBe(1);
      expect(r.ativa).toBe(true);
      expect(textoNaoVazio(r.nome)).toBe(true);
    }
  });

  it('todo conteúdo é válido pelo tipo do aspecto e não há LIMITES', () => {
    for (const r of BIBLIOTECA_INICIAL) {
      expect(ASPECTOS).toContain(r.aspecto);
      expect(r.aspecto).not.toBe('LIMITES');
      expect(r.conteudo.aspecto).toBe(r.aspecto);
      expect({ id: r.id, erros: errosConteudo(r.conteudo) }).toEqual({ id: r.id, erros: [] });
    }
  });

  it('cada aspecto (exceto LIMITES) tem a regra padrão de todos os grupos', () => {
    for (const a of ASPECTOS.filter((x) => x !== 'LIMITES')) {
      expect(BIBLIOTECA_INICIAL.some((r) => r.aspecto === a && r.id.endsWith('-padrao'))).toBe(true);
    }
  });

  it('procedimentos com fluxo não vazio, passos e decisões completos', () => {
    expect(PROCEDIMENTOS.length).toBeGreaterThanOrEqual(6);
    for (const p of PROCEDIMENTOS) {
      expect(textoNaoVazio(p.titulo) && textoNaoVazio(p.objetivo)).toBe(true);
      expect(p.fluxo.length).toBeGreaterThan(0);
      expect(p.fluxo.some((f) => f.tipo === 'decisao')).toBe(true);
      for (const f of p.fluxo) {
        if (f.tipo === 'passo') expect(textoNaoVazio(f.texto)).toBe(true);
        else expect(textoNaoVazio(f.pergunta) && textoNaoVazio(f.sim) && textoNaoVazio(f.nao)).toBe(true);
      }
      expect(p.regras.length).toBeGreaterThan(0);
      expect(p.evidencias.length).toBeGreaterThan(0);
    }
    const ids = PROCEDIMENTOS.map((p) => p.id);
    for (const id of ['proc-cadastro-item-novo', 'proc-alteracao-item', 'proc-unificacao-codigos', 'proc-inativacao-sem-movimento', 'proc-retirada-uso-materiais', 'proc-manutencao-saneamento']) {
      expect(ids).toContain(id);
    }
  });

  it('modelos: atribuições apontam para regras existentes do mesmo aspecto, sem grupo repetido por aspecto', () => {
    const porId = new Map(BIBLIOTECA_INICIAL.map((r) => [r.id, r]));
    expect(MODELOS.length).toBeGreaterThan(0);
    for (const m of MODELOS) {
      for (const at of m.atribuicoes) {
        const r = porId.get(at.bibliotecaId);
        expect(r, at.bibliotecaId).toBeDefined();
        expect(r!.aspecto).toBe(at.aspecto);
        if (at.grupos !== 'TODOS') expect(at.grupos.length).toBeGreaterThan(0);
      }
      for (const a of ASPECTOS.filter((x) => x !== 'LIMITES')) {
        const doAspecto = m.atribuicoes.filter((x) => x.aspecto === a);
        expect(doAspecto.filter((x) => x.grupos === 'TODOS')).toHaveLength(1);
        const grupos = doAspecto.flatMap((x) => (x.grupos === 'TODOS' ? [] : x.grupos));
        expect(new Set(grupos).size).toBe(grupos.length);
      }
    }
  });

  it('modelo Crestani usa só nomes de grupo do mapa da política', () => {
    expect(GRUPOS_CRESTANI).toHaveLength(52);
    const m = MODELOS.find((x) => x.id === 'modelo-fal-insumos-agro-crestani')!;
    expect(m).toBeDefined();
    for (const at of m.atribuicoes) if (at.grupos !== 'TODOS') for (const g of at.grupos) expect(GRUPOS_CRESTANI).toContain(g);
  });

  it('sem palavras proibidas no conteúdo', () => {
    const tudo = JSON.stringify({ BIBLIOTECA_INICIAL, PROCEDIMENTOS, MODELOS });
    for (const p of [/minuta/i, /\bTODO\b/, /lorem/i]) expect(tudo).not.toMatch(p);
  });
});
