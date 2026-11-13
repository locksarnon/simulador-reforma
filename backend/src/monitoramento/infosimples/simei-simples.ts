import type { Servico } from '../catalogo';
import type { Nivel, Resumo } from '../interpretar';
import { servicoInfosimples, txt, type ContextoInfosimples } from './base';

/** CNPJ do cadastro com 14 dígitos; sem ele a consulta não sai (e não é cobrada). */
function cnpjDoCadastro(c: ContextoInfosimples): Record<string, string> {
  const cnpj = String(c.cnpj ?? '').replace(/\D/g, '');
  if (cnpj.length !== 14) throw new Error('Cadastre o CNPJ do cliente (14 dígitos) para fazer esta consulta.');
  return { cnpj };
}

/** "31/12/2024", "2024-12-31" ou "20241231" → "20241231" (formato de data das tabelas do monitoramento). */
export function dataAaaammdd(v: unknown): string {
  const s = txt(v);
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  return s;
}
const dataBr = (aaaammdd: string) => (/^\d{8}$/.test(aaaammdd) ? `${aaaammdd.slice(6, 8)}/${aaaammdd.slice(4, 6)}/${aaaammdd.slice(0, 4)}` : aaaammdd);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : []);
const dataDe = (o: Record<string, unknown>, campo: string) => dataAaaammdd(txt(o[`normalizado_${campo}`]) || o[campo]);

// ---------------------------------------------------------------------------------------------------------------------------------
// DASN-SIMEI: situação da declaração anual do MEI, ano a ano (https://infosimples.com/consultas/receita-federal-simples-dasn/).
// ---------------------------------------------------------------------------------------------------------------------------------

type SituacaoAno = 'ENTREGUE' | 'ATRASO' | 'NO_PRAZO' | 'OUTRA';

/** Lê o texto (ou booleano) de um ano da DASN-SIMEI. "hoje" decide se a falta de entrega já passou do prazo (31/05 do ano seguinte). */
export function situacaoDoAno(ano: number, valor: unknown, hoje = new Date()): { situacao: SituacaoAno; texto: string } {
  const texto = typeof valor === 'boolean' ? '' : txt(valor);
  const prazo = Date.UTC(ano + 1, 4, 31, 23, 59, 59);
  const naoEntregue = valor === false || /n[aã]o\s*(foi\s*)?(entregue|apresentad|transmitid|enviad|consta)|pendente|omiss|em\s*atraso|atrasad|falta/i.test(texto);
  const entregue = valor === true || (!naoEntregue && /entregue|apresentad|transmitid|enviad|recebid|^sim$/i.test(texto));
  if (entregue) return { situacao: 'ENTREGUE', texto: texto || 'Entregue' };
  if (naoEntregue) {
    if (/atras|omiss/i.test(texto) || hoje.getTime() > prazo) return { situacao: 'ATRASO', texto: `Em atraso${texto ? ` (${texto})` : ''}` };
    return { situacao: 'NO_PRAZO', texto: `Não entregue, no prazo até ${dataBr(`${ano + 1}0531`)}` };
  }
  return { situacao: 'OUTRA', texto: texto || '—' };
}

/** Anos (chaves de quatro dígitos) de um objeto "original" ou "retificadora". */
const anosDe = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => /^\d{4}$/.test(k))) : {};

export function lerDasnSimei(data: Record<string, unknown>[], hoje = new Date()): Resumo {
  const d = data[0] ?? {};
  const original = anosDe(d.original);
  const retificadora = anosDe(d.retificadora);
  const anos = [...new Set([...Object.keys(original), ...Object.keys(retificadora)])].sort((a, b) => Number(b) - Number(a));
  const destaquesBase = txt(d.razao_social) ? [{ rotulo: 'Razão social', valor: txt(d.razao_social) }] : [];
  if (!anos.length) return { nivel: 'INFO', titulo: 'A Receita não listou declarações anuais do MEI para este CNPJ.', destaques: destaquesBase };

  const linhas = anos.map((ano) => {
    const o = situacaoDoAno(Number(ano), original[ano], hoje);
    const r = retificadora[ano];
    return { ano, situacao: o.texto, retificadora: typeof r === 'boolean' ? (r ? 'Entregue' : '—') : txt(r) || '—', _s: o.situacao };
  });
  const atraso = linhas.filter((l) => l._s === 'ATRASO').map((l) => l.ano);
  const noPrazo = linhas.filter((l) => l._s === 'NO_PRAZO').map((l) => l.ano);
  const entregues = linhas.filter((l) => l._s === 'ENTREGUE').length;
  const nivel: Nivel = atraso.length ? 'CRITICO' : noPrazo.length ? 'ATENCAO' : entregues ? 'OK' : 'INFO';
  const titulo = atraso.length
    ? `DASN-SIMEI em atraso: ${atraso.length === 1 ? `ano-calendário ${atraso[0]}` : `anos-calendário ${atraso.join(', ')}`}.`
    : noPrazo.length
      ? `DASN-SIMEI do ano-calendário ${noPrazo.join(', ')} ainda não entregue, dentro do prazo.`
      : entregues
        ? 'Todas as declarações anuais do MEI listadas foram entregues.'
        : 'Situação das declarações anuais do MEI consultada.';
  return {
    nivel,
    titulo,
    destaques: [
      ...destaquesBase,
      { rotulo: 'Anos em atraso', valor: atraso.length ? atraso.join(', ') : 'Nenhum' },
      { rotulo: 'Último ano listado', valor: `${linhas[0].ano}: ${linhas[0].situacao}` },
    ],
    tabela: {
      colunas: [
        { chave: 'ano', rotulo: 'Ano-calendário' },
        { chave: 'situacao', rotulo: 'Declaração original' },
        { chave: 'retificadora', rotulo: 'Retificadora' },
      ],
      linhas: linhas.map(({ _s, ...l }) => l),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Simples Nacional e SIMEI: situação, períodos anteriores, eventos futuros e Regime Regular do IBS e da CBS
// (https://infosimples.com/consultas/receita-federal-simples/).
// ---------------------------------------------------------------------------------------------------------------------------------

/** Regime Regular do IBS e da CBS: a página oficial cita o dado, mas não lista o nome dos campos; lê os campos com "regime_regular", "ibs" ou "cbs". */
function regimeRegular(d: Record<string, unknown>): { situacao: string; eventos: Record<string, unknown>[] } {
  const chaves = Object.keys(d).filter((k) => /regime_regular|(^|_)ibs(_|$)|(^|_)cbs(_|$)/i.test(k) && !/^normalizado_/.test(k));
  const situacao = chaves.filter((k) => /situacao/i.test(k)).map((k) => txt(d[k])).find(Boolean) ?? '';
  const eventos = chaves.filter((k) => /eventos|agendamentos/i.test(k)).flatMap((k) => lista(d[k]));
  return { situacao, eventos };
}

const NAO_OPTANTE = /n[aã]o\s*(optante|enquadrad)|exclu[ií]d|desenquadrad/i;
const OPTANTE = /optante|enquadrad/i;

export function lerSimples(data: Record<string, unknown>[], hoje = new Date()): Resumo {
  const d = data[0] ?? {};
  const sn = txt(d.simples_nacional_situacao);
  const simei = txt(d.simei_situacao);
  const rr = regimeRegular(d);
  const hojeN = `${hoje.getUTCFullYear()}${String(hoje.getUTCMonth() + 1).padStart(2, '0')}${String(hoje.getUTCDate()).padStart(2, '0')}`;

  type Linha = { regime: string; tipo: string; inicio: string; fim: string; descricao: string };
  const periodos = (campo: string, regime: string): Linha[] =>
    lista(d[campo]).map((p) => ({ regime, tipo: 'Período anterior', inicio: dataDe(p, 'inicio_data'), fim: dataDe(p, 'fim_data'), descricao: txt(p.detalhamento) || '—' }));
  const eventos = (itens: Record<string, unknown>[], regime: string, tipo = 'Evento futuro'): Linha[] =>
    itens.map((e) => ({ regime, tipo, inicio: dataDe(e, 'data_efeito'), fim: '', descricao: txt(e.descricao_evento) || txt(e.descricao) || txt(e.evento) || '—' }));
  const agendamentos = Array.isArray(d.simples_nacional_agendamentos)
    ? lista(d.simples_nacional_agendamentos)
    : txt(d.simples_nacional_agendamentos) ? [{ descricao_evento: txt(d.simples_nacional_agendamentos) }] : [];
  const futuros = [
    ...eventos(lista(d.simples_nacional_eventos_futuros), 'Simples Nacional'),
    ...eventos(agendamentos, 'Simples Nacional', 'Agendamento'),
    ...eventos(lista(d.simei_eventos_futuros), 'SIMEI'),
    ...eventos(rr.eventos, 'Regime Regular IBS/CBS'),
  ];
  const linhas = [...futuros, ...periodos('simples_nacional_periodos_anteriores', 'Simples Nacional'), ...periodos('simei_periodos_anteriores', 'SIMEI')]
    .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));

  const proximo = futuros
    .filter((e) => !/^\d{8}$/.test(e.inicio) || e.inicio >= hojeN)
    .sort((a, b) => (a.inicio || '99999999').localeCompare(b.inicio || '99999999'))[0];

  const optSn = !!sn && !NAO_OPTANTE.test(sn) && OPTANTE.test(sn);
  const optSimei = !!simei && !NAO_OPTANTE.test(simei) && OPTANTE.test(simei);
  const saida = futuros.find((e) => /exclus|desenquadr|impedi/i.test(e.descricao));
  const nivel: Nivel = saida ? 'ATENCAO' : 'INFO';
  const titulo = saida
    ? `Exclusão ou desenquadramento agendado${saida.inicio ? ` com efeito em ${dataBr(saida.inicio)}` : ''} (${saida.regime}).`
    : optSimei ? 'Optante pelo Simples Nacional e enquadrada no SIMEI (MEI).'
      : optSn ? 'Optante pelo Simples Nacional.'
        : sn ? 'Não optante pelo Simples Nacional.'
          : 'Situação no Simples Nacional consultada.';

  return {
    nivel,
    titulo,
    destaques: [
      { rotulo: 'Simples Nacional', valor: sn || '—' },
      { rotulo: 'SIMEI', valor: simei || '—' },
      { rotulo: 'Regime Regular IBS/CBS', valor: rr.situacao || 'Não informado na consulta' },
      { rotulo: 'Próximo evento', valor: proximo ? `${proximo.inicio ? `${dataBr(proximo.inicio)}: ` : ''}${proximo.descricao} (${proximo.regime})` : 'Nenhum' },
    ],
    ...(linhas.length
      ? {
          tabela: {
            colunas: [
              { chave: 'regime', rotulo: 'Regime' },
              { chave: 'tipo', rotulo: 'Tipo' },
              { chave: 'inicio', rotulo: 'Início ou efeito', tipo: 'data' as const },
              { chave: 'fim', rotulo: 'Fim', tipo: 'data' as const },
              { chave: 'descricao', rotulo: 'Detalhamento' },
            ],
            linhas,
          },
        }
      : {}),
  };
}

export const servicos: Servico[] = [
  servicoInfosimples({
    chave: 'is-dasn-simei',
    rotulo: 'DASN-SIMEI: declarações anuais do MEI',
    grupo: 'mei',
    para: 'MEI',
    descricao: 'Situação da Declaração Anual do MEI (DASN-SIMEI) em cada ano-calendário: entregue, no prazo ou em atraso.',
    consulta: { rota: () => 'receita-federal/simples-dasn', parametros: cnpjDoCadastro, ler: (data) => lerDasnSimei(data), adicional: 0.1 },
  }),
  servicoInfosimples({
    chave: 'is-simples-situacao',
    rotulo: 'Simples Nacional, SIMEI e Regime Regular IBS/CBS',
    grupo: 'situacao',
    descricao: 'Se a empresa é optante pelo Simples Nacional e pelo SIMEI, os períodos anteriores de opção, os eventos futuros e a situação no Regime Regular do IBS e da CBS.',
    consulta: { rota: () => 'receita-federal/simples', parametros: cnpjDoCadastro, ler: (data) => lerSimples(data), adicional: 0.08 },
  }),
];
