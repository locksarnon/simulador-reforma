/**
 * Conteúdo efetivo de uma regra -> tópicos curtos e tabelas da política. Só rótulos em português; nenhum código interno chega ao PDF.
 */
import type {
  Abrangencia, ComponenteNome, ConteudoRegra, LinhaLimite, RegraAtributos, RegraFiscal, RegraLimites, RegraNomes, RegraUnidades,
} from '../../diretrizes/tipos';
import { juntar, maiuscula, numeroBr, ordenarPt } from './texto';

export type TabelaTopico = { titulo: string; cabecalho: string[]; linhas: string[][]; larguras: number[] };
export type Topicos = { topicos: string[]; tabelas: TabelaTopico[] };

export const ROTULO_COMPONENTE: Record<ComponenteNome, string> = {
  NOME: 'nome', REFERENCIA: 'referência', MARCA: 'marca', CARACTERISTICA: 'característica técnica', APRESENTACAO: 'apresentação', COMPLEMENTO: 'complemento',
};
const FEMININO = new Set<ComponenteNome>(['REFERENCIA', 'MARCA', 'CARACTERISTICA', 'APRESENTACAO']);

const ROTULO_ATRIBUTO: Record<string, string> = {
  MARCA: 'Marca', REFERENCIA: 'Referência', COMPOSICAO: 'Composição', PRINCIPIO_ATIVO: 'Princípio ativo', CONCENTRACAO: 'Concentração',
  FORMULACAO: 'Formulação', DIMENSAO: 'Dimensão', MATERIAL: 'Material', APRESENTACAO: 'Apresentação', FABRICANTE: 'Fabricante',
  REGISTRO_MAPA: 'Registro no MAPA', CULTIVAR: 'Cultivar', PENEIRA: 'Peneira', LOTE: 'Lote', VALIDADE: 'Validade',
};
/** Atributo cadastrado fora da lista: "TEOR_DE_UMIDADE" -> "Teor de umidade". */
/** Só a primeira letra em minúscula, preservando siglas ("Registro no MAPA" -> "registro no MAPA"; "NPK" fica). */
const minusculaInicial = (s: string) => (s.length > 1 && s[1] === s[1].toLocaleLowerCase('pt-BR') ? s[0].toLocaleLowerCase('pt-BR') + s.slice(1) : s);
export const rotuloAtributo = (a: string) => ROTULO_ATRIBUTO[a] ?? maiuscula(a.replace(/_/g, ' ').trim().toLocaleLowerCase('pt-BR'));

const ROTULO_CAMPO_ITEM: Record<LinhaLimite['campoItem'], string> = {
  descricao: 'descrição', codigo: 'código', unidade: 'unidade', referencia: 'referência', fabricante: 'fabricante',
};
/** "da descrição", "do código"... */
const DO_CAMPO_ITEM: Record<LinhaLimite['campoItem'], string> = {
  descricao: 'da descrição', codigo: 'do código', unidade: 'da unidade', referencia: 'da referência', fabricante: 'do fabricante',
};
const ROTULO_ORIGEM: Record<LinhaLimite['origem'], string> = { LEIAUTE_OFICIAL: 'Leiaute oficial', ERP: 'ERP', CLIENTE: 'Cliente' };
const ROTULO_CENARIO: Record<RegraFiscal['cenarios'][number], string> = { ENTRADA: 'entrada', SAIDA: 'saída', USO_INTERNO: 'uso interno' };

/** "Todos os grupos" ou "A, B e C" (ordem alfabética, sem repetir). */
export function textoGrupos(a: Abrangencia): string {
  if (a.todos) return 'Todos os grupos';
  const grupos = ordenarPt([...new Set(a.grupos.map((g) => g.trim()).filter(Boolean))]);
  const sub = a.subgrupos?.length ? ordenarPt([...new Set(a.subgrupos.map((g) => g.trim()).filter(Boolean))]) : [];
  return (juntar(grupos) || 'Nenhum grupo') + (sub.length ? ` (${sub.length === 1 ? 'subgrupo' : 'subgrupos'}: ${juntar(sub)})` : '');
}

function nomes(c: RegraNomes): Topicos {
  const t: string[] = [];
  if (c.componentes.length) t.push(`Estrutura: ${c.componentes.map((x) => ROTULO_COMPONENTE[x]).join(' + ')}`);
  const obr = c.componentes.filter((x) => c.obrigatorios.includes(x)).concat(c.obrigatorios.filter((x) => !c.componentes.includes(x)));
  if (obr.length === 1) t.push(`${maiuscula(ROTULO_COMPONENTE[obr[0]])} ${FEMININO.has(obr[0]) ? 'obrigatória' : 'obrigatório'}`);
  else if (obr.length > 1) t.push(`Componentes obrigatórios: ${juntar(obr.map((x) => ROTULO_COMPONENTE[x]))}`);
  if (c.componentes.length > 1) {
    const sep = c.separador === ' ' ? 'por um espaço' : c.separador === '-' ? 'por hífen ( - )' : `por "${c.separador}"`;
    t.push(`Componentes separados ${sep}`);
  }
  t.push(c.capitalizacao === 'MAIUSCULAS' ? 'Escrita em maiúsculas' : c.capitalizacao === 'MINUSCULAS' ? 'Escrita em minúsculas' : 'Maiúsculas e minúsculas mantidas como cadastradas');
  if (c.removerEspacosDuplicados) t.push('Sem espaços duplicados nem espaços no início ou no fim');
  if (c.abreviacoes.length) t.push('Só as abreviações aprovadas (Anexo); outras abreviações não são usadas');
  if (c.termosProibidos.length) t.push('Termos que não podem ser usados: os do Anexo, com o termo a usar no lugar');
  t.push('A padronização reordena e ajusta o que já consta da descrição; componente ausente é informado pelo responsável pelo cadastro, nunca presumido');
  // Abreviações e termos ficam no Anexo da política (uma tabela só para todas as regras de nomes): ver tabelasDoAnexo.
  return { topicos: t, tabelas: [] };
}

/**
 * Tabelas do Anexo: abreviações aprovadas e termos que não podem ser usados, uma vez só para todas as regras de nomes. Com mais de uma regra,
 * a coluna "Regras" diz em quais vale a linha ("Todas" quando vale em todas).
 */
export function tabelasDoAnexo(regras: { codigo: string; conteudo: ConteudoRegra }[]): TabelaTopico[] {
  const nomesR = regras.filter((r) => r.conteudo.aspecto === 'NOMES').sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })) as { codigo: string; conteudo: RegraNomes }[];
  const varias = nomesR.length > 1;
  const juntarLinhas = (pares: { chave: string; cols: string[]; regra: string }[]) => {
    const m = new Map<string, { cols: string[]; regras: string[] }>();
    for (const p of pares) {
      const x = m.get(p.chave);
      if (x) { if (!x.regras.includes(p.regra)) x.regras.push(p.regra); } else m.set(p.chave, { cols: p.cols, regras: [p.regra] });
    }
    return [...m.values()].sort((a, b) => a.cols[0].localeCompare(b.cols[0], 'pt-BR')).map((x) => (varias ? [...x.cols, x.regras.length === nomesR.length ? 'Todas' : x.regras.join(', ')] : x.cols));
  };
  const abrev = juntarLinhas(nomesR.flatMap((r) => r.conteudo.abreviacoes.map((a) => ({ chave: `${a.completa}\u0001${a.abreviacao}`, cols: [a.completa, a.abreviacao], regra: r.codigo }))));
  const termos = juntarLinhas(nomesR.flatMap((r) => r.conteudo.termosProibidos.map((x) => ({ chave: `${x.termo}\u0001${x.substituicao ?? ''}`, cols: [x.termo, x.substituicao ?? 'Remover o termo'], regra: r.codigo }))));
  const out: TabelaTopico[] = [];
  if (abrev.length) out.push({ titulo: 'Abreviações aprovadas', cabecalho: ['Expressão completa', 'Abreviação aprovada', ...(varias ? ['Regras'] : [])], larguras: varias ? [0.46, 0.3, 0.24] : [0.6, 0.4], linhas: abrev });
  if (termos.length) out.push({ titulo: 'Termos que não podem ser usados', cabecalho: ['Termo', 'Usar no lugar', ...(varias ? ['Regras'] : [])], larguras: varias ? [0.38, 0.38, 0.24] : [0.5, 0.5], linhas: termos });
  return out;
}

/**
 * O que a regra tem de diferente da regra padrão do aspecto: só os tópicos e as tabelas que a padrão não tem (ou tem diferente). Vazio =
 * mesmo conteúdo da padrão (muda só a abrangência).
 */
export function diferencaDaPadrao(regra: Topicos, padrao: Topicos): Topicos {
  const temTopico = new Set(padrao.topicos);
  const temTabela = new Set(padrao.tabelas.map((x) => JSON.stringify(x)));
  return { topicos: regra.topicos.filter((x) => !temTopico.has(x)), tabelas: regra.tabelas.filter((x) => !temTabela.has(JSON.stringify(x))) };
}

function atributos(c: RegraAtributos): Topicos {
  if (!c.atributos.length) return { topicos: ['Nenhum atributo técnico exigido'], tabelas: [] };
  const obr = c.atributos.filter((a) => a.aplicabilidade === 'OBRIGATORIO').map((a) => minusculaInicial(rotuloAtributo(a.atributo)));
  const t: string[] = [];
  if (obr.length) t.push(`Obrigatórios em todos os itens: ${juntar(obr)}`);
  if (c.atributos.some((a) => a.aplicabilidade === 'QUANDO_APLICAVEL')) t.push('Os demais atributos são exigidos quando a condição indicada se aplica ao item');
  t.push('Atributo ausente fica pendente até ser informado; não se preenche por suposição');
  const onde = (a: RegraAtributos['atributos'][number]) =>
    a.onde === 'DESCRICAO' ? 'Na descrição' : a.onde === 'CAMPO_PROPRIO' ? `Em campo próprio${a.campo ? ` (${a.campo})` : ''}` : `Na descrição e em campo próprio${a.campo ? ` (${a.campo})` : ''}`;
  return {
    topicos: t,
    tabelas: [{
      titulo: 'Atributos exigidos', cabecalho: ['Atributo', 'Onde informar', 'Exigência'], larguras: [0.26, 0.34, 0.4],
      linhas: c.atributos.map((a) => [rotuloAtributo(a.atributo), onde(a), a.aplicabilidade === 'OBRIGATORIO' ? 'Obrigatório' : `Quando aplicável${a.condicao ? `: ${a.condicao}` : ''}`]),
    }],
  };
}

function unidades(c: RegraUnidades): Topicos {
  const t: string[] = [];
  t.push(c.criterioEstoque === 'DEFINIDA' && c.unidadeDefinida
    ? `Unidade de estoque: ${c.unidadeDefinida}, definida para o grupo`
    : c.criterioEstoque === 'DEFINIDA' ? 'Unidade de estoque: definida para o grupo (unidade não informada)' : 'Unidade de estoque: a menor unidade prática de medida do item');
  t.push(`Unidades de compra permitidas: ${c.unidadesCompra.length ? juntar(c.unidadesCompra) : 'não definidas'}`);
  t.push(`Unidades de saída permitidas: ${c.unidadesSaida.length ? juntar(c.unidadesSaida) : 'não definidas'}`);
  t.push('Conversão sem fator conhecido fica pendente até o fator ser informado');
  t.push('Na conversão, quantidade, valor unitário e valor total do item são preservados');
  const tabelas: TabelaTopico[] = [];
  if (c.conversoes.length) {
    tabelas.push({
      titulo: 'Conversões', cabecalho: ['Conversão', 'Vale para'], larguras: [0.5, 0.5],
      linhas: c.conversoes.map((x) => [`1 ${x.origem} = ${numeroBr(x.fator)} ${x.destino}`, x.abrangencia === 'PRODUTO' ? `Produto ${x.codigoProduto ?? '(código não informado)'}` : 'Todo o grupo']),
    });
  }
  return { topicos: t, tabelas };
}

/** Linhas sem limite numérico confirmado (pendências da política). */
export const limiteNaoConfirmado = (l: LinhaLimite) => l.limite == null || !l.confirmado;

/** Menor limite confirmado por campo do item (vale o menor confirmado). */
export function limitesEfetivos(c: RegraLimites): { campoItem: LinhaLimite['campoItem']; linha: LinhaLimite | null; total: number }[] {
  const campos = [...new Set(c.linhas.map((l) => l.campoItem))];
  return campos.map((campoItem) => {
    const linhas = c.linhas.filter((l) => l.campoItem === campoItem);
    const conf = linhas.filter((l) => !limiteNaoConfirmado(l)).sort((a, b) => (a.limite as number) - (b.limite as number));
    return { campoItem, linha: conf[0] ?? null, total: linhas.length };
  });
}

function limites(c: RegraLimites): Topicos {
  if (!c.linhas.length) return { topicos: ['Nenhum limite de caracteres definido'], tabelas: [] };
  const t: string[] = [];
  for (const e of limitesEfetivos(c)) {
    t.push(e.linha
      ? `Limite efetivo ${DO_CAMPO_ITEM[e.campoItem]}: ${e.linha.limite} caracteres (${e.linha.destino}, ${e.linha.campo})`
      : `Limite efetivo ${DO_CAMPO_ITEM[e.campoItem]}: não confirmado`);
  }
  t.push('Vale o menor limite confirmado; limite não confirmado não é aplicado até a confirmação');
  // ERP configurado acima do leiaute oficial: o leiaute é o teto.
  for (const campoItem of new Set(c.linhas.map((l) => l.campoItem))) {
    const conf = c.linhas.filter((l) => l.campoItem === campoItem && !limiteNaoConfirmado(l));
    const teto = conf.filter((l) => l.origem === 'LEIAUTE_OFICIAL').map((l) => l.limite as number);
    if (!teto.length) continue;
    const menorTeto = Math.min(...teto);
    for (const erp of conf.filter((l) => l.origem === 'ERP' && (l.limite as number) > menorTeto)) {
      t.push(`O ${erp.destino} aceita ${erp.limite} caracteres em ${erp.campo}, acima do leiaute oficial (${menorTeto}); vale o leiaute`);
    }
  }
  const porTratamento = new Map<LinhaLimite['tratamento'], string[]>();
  for (const l of c.linhas) porTratamento.set(l.tratamento, [...new Set([...(porTratamento.get(l.tratamento) ?? []), l.destino])]);
  const unico = porTratamento.size === 1;
  for (const [tr, destinos] of porTratamento) {
    const acao = tr === 'SUGERIR_ABREVIACAO' ? 'usar as abreviações aprovadas na regra de nomes' : 'o responsável pelo cadastro revisa a descrição';
    t.push(`Texto acima do limite${unico ? '' : ` (${juntar(destinos)})`}: ${acao}; o texto nunca é cortado`);
  }
  const preservar = [...new Set(c.linhas.flatMap((l) => l.preservar))];
  if (preservar.length) t.push(`Não abreviar: ${juntar(preservar.map((p) => ROTULO_COMPONENTE[p]))}`);
  const limite = (l: LinhaLimite) => (l.limite == null ? 'não confirmado' : l.confirmado ? String(l.limite) : `${l.limite} (não confirmado)`);
  return {
    topicos: t,
    tabelas: [{
      titulo: 'Limites por destino', cabecalho: ['Destino', 'Campo', 'Limite', 'Origem', 'Fonte'], larguras: [0.2, 0.22, 0.14, 0.14, 0.3],
      linhas: c.linhas.map((l) => [l.destino, `${l.campo} (${ROTULO_CAMPO_ITEM[l.campoItem]})`, limite(l), ROTULO_ORIGEM[l.origem], l.referencia ?? 'não confirmado']),
    }],
  };
}

function fiscal(c: RegraFiscal): Topicos {
  const t: string[] = [];
  t.push(c.validarNcm ? 'NCM conferido na tabela oficial vigente, com 8 dígitos' : 'NCM sem conferência nesta regra');
  if (c.validarCClassTrib) {
    t.push(c.cenarios.length
      ? `Classificação tributária do IBS e da CBS (cClassTrib) conferida nos cenários de ${juntar(c.cenarios.map((x) => ROTULO_CENARIO[x]))}`
      : 'Classificação tributária do IBS e da CBS (cClassTrib) conferida');
  } else t.push('Classificação tributária do IBS e da CBS (cClassTrib) sem conferência nesta regra');
  if (c.validarNcm || c.validarCClassTrib) {
    t.push('Classificação ausente fica pendente até ser informada');
    t.push('Classificação com mais de um enquadramento possível vai para revisão fiscal');
  }
  const tabelas: TabelaTopico[] = c.excecoesNcm.length
    ? [{ titulo: 'Exceções à conferência do NCM', cabecalho: ['Item ou grupo', 'Justificativa'], larguras: [0.35, 0.65], linhas: c.excecoesNcm.map((e) => [e.alvo, e.justificativa]) }]
    : [];
  return { topicos: t, tabelas };
}

export function topicosDaRegra(c: ConteudoRegra): Topicos {
  switch (c.aspecto) {
    case 'NOMES': return nomes(c);
    case 'ATRIBUTOS': return atributos(c);
    case 'UNIDADES': return unidades(c);
    case 'LIMITES': return limites(c);
    case 'FISCAL': return fiscal(c);
  }
}
