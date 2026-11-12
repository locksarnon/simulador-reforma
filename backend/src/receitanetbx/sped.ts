import { Logger } from '@nestjs/common';
import { chamarBx, escaparXml, lerPesquisa } from './receitanetbx.cliente';

const log = new Logger('SpedReceitanetBX');
const brDe = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/**
 * Escriturações do SPED transmitidas, pelo ReceitanetBX-Serviço (catálogo da Receita lido no próprio serviço em 12/11/2026;
 * papéis contr, proc e repr em todas):
 * - EFD ICMS/IPI: sistema 2, tipo 1602, pesquisa "porCNPJIEPeriodoContribuinte" (todos os estabelecimentos);
 * - EFD-Contribuições: sistema 7, tipo EFD, pesquisa "exercicio";
 * - ECD: sistema 1 (SPED Contábil), tipo 1601, pesquisa "porPeriodo";
 * - ECF: sistema 20 (SPED ECF), tipo ECF, pesquisa "exercicio".
 * `prazo`: quando a competência passa a ser cobrada (até lá, "no prazo"). Aproximação para a tela: a data legal de cada
 * obrigação fica no calendário (Agenda), com a norma.
 */
export const ESCRITURACOES = [
  { id: 'ECD', rotulo: 'SPED ECD (Escrituração Contábil Digital)', sistema: '1', tipoarquivo: '1601', tipopesquisa: 'porPeriodo', anual: true, prazo: { meses: 6, dia: 30 }, extras: [] as string[][] },
  { id: 'ECF', rotulo: 'SPED ECF (Escrituração Contábil Fiscal)', sistema: '20', tipoarquivo: 'ECF', tipopesquisa: 'exercicio', anual: true, prazo: { meses: 7, dia: 31 }, extras: [] as string[][] },
  { id: 'EFD_ICMS_IPI', rotulo: 'SPED EFD ICMS/IPI (Escrituração Fiscal Digital e Notas Fiscais Eletrônicas)', sistema: '2', tipoarquivo: '1602', tipopesquisa: 'porCNPJIEPeriodoContribuinte', anual: false, prazo: { meses: 1, dia: 25 }, extras: [['opcaoTodosEstabelecimentos', 'V'], ['somenteAtivas', 'F']] },
  { id: 'EFD_CONTRIBUICOES', rotulo: 'SPED EFD Contribuições (Escrituração Fiscal Digital das Contribuições para PIS/Pasep e Cofins)', sistema: '7', tipoarquivo: 'EFD', tipopesquisa: 'exercicio', anual: false, prazo: { meses: 2, dia: 15 }, extras: [] as string[][] },
] as const;

export type ArquivoSped = { id: string; atributos: Record<string, string> };
export type Escrituracao = (typeof ESCRITURACOES)[number];
export const ESCRITURACAO_POR_ID = new Map<string, Escrituracao>(ESCRITURACOES.map((e) => [e.id, e]));

/** Identificação no ReceitanetBX: o próprio contribuinte (certificado do mesmo CNPJ) ou procurador do cliente. */
export function identificacao(e: Escrituracao, cnpj: string, proprio: boolean) {
  return proprio
    ? `<identificacao perfil="contr" sistema="${e.sistema}" tipoarquivo="${e.tipoarquivo}" tipopesquisa="${e.tipopesquisa}"/>`
    : `<identificacao perfil="proc" sistema="${e.sistema}" tipoarquivo="${e.tipoarquivo}" tipopesquisa="${e.tipopesquisa}" nirepresentado="${escaparXml(cnpj)}" tiponirepresentado="cnpj"/>`;
}

/** Entrada da pesquisa (XML do ReceitanetBX). Datas em dd/mm/aaaa. */
export function entradaPesquisa(e: Escrituracao, cnpj: string, ano: number, proprio: boolean, hoje = new Date()): string {
  // A Receita recusa data final no futuro: no ano corrente, a busca vai até hoje.
  const fim = ano >= hoje.getFullYear() ? brDe(hoje) : `31/12/${ano}`;
  const campos = [['dataInicio', `01/01/${ano}`], ['dataFim', fim], ...e.extras].map(([n, v]) => `<campo nome="${n}" valor="${escaparXml(v)}"/>`).join('');
  return `<pesquisa>${identificacao(e, cnpj, proprio)}${campos}</pesquisa>`;
}

/** Pedido de download de arquivos já listados (SolicitarArquivos), pelos ids devolvidos na pesquisa. */
export function entradaPedido(e: Escrituracao, cnpj: string, proprio: boolean, ids: string[]): string {
  return `<pedido>${identificacao(e, cnpj, proprio)}<arquivos>${ids.map((id) => `<arquivo id="${escaparXml(id)}"/>`).join('')}</arquivos></pedido>`;
}

export const dataDe = (v: string): Date | null => {
  const br = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00Z`);
  const iso = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z`) : null;
};
const achar = (a: Record<string, string>, re: RegExp) => Object.entries(a).find(([k]) => re.test(k))?.[1] ?? '';

/**
 * Lê um arquivo da pesquisa: período (início e fim), data de transmissão, recibo e se é retificadora. Os nomes dos atributos
 * vêm do servidor da Receita; a leitura procura pelo sentido (início/fim do período, transmissão/recepção, recibo, retificadora).
 */
export function lerArquivo(x: ArquivoSped) {
  const a = x.atributos;
  const inicio = dataDe(achar(a, /^(dt|data)?_?ini|inicio|in[ií]cio/i) || achar(a, /periodo|per[ií]odo/i));
  const fimBruto = achar(a, /^(dt|data)?_?fim|final/i) || (achar(a, /periodo|per[ií]odo/i).match(/a\s+(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? '');
  const fim = dataDe(fimBruto) ?? inicio;
  const transmissao = achar(a, /transmiss|recep|entrega|envio/i);
  const recibo = achar(a, /recibo|hash/i);
  const tipo = achar(a, /finalidade|retific|tipo.*escrit|original/i);
  const retificadora = /retific|^1$/i.test(tipo);
  return { id: x.id, inicio, fim, transmissao, recibo, retificadora, tipo, nome: achar(a, /^nome|arquivo/i), atributos: a, servico: '' };
}

/** Pesquisa o ano inteiro de uma escrituração e devolve os arquivos encontrados (vazio = nada transmitido no período). */
export async function pesquisarAno(e: Escrituracao, cnpj: string, ano: number, proprio: boolean, url?: string) {
  const r = await chamarBx('PesquisarArquivos', entradaPesquisa(e, cnpj, ano, proprio), url);
  const lido = lerPesquisa(r.saida);
  const mensagem = lido.mensagem ?? r.saida.match(/<mensagem>([\s\S]*?)<\/mensagem>/)?.[1]?.trim() ?? null;
  const nada = /n[aã]o encontrado nenhum arquivo|processada com sucesso/i.test(mensagem ?? '');
  if (!lido.arquivos.length && mensagem && !nada) throw new Error(mensagem);
  // Enquanto os nomes dos campos da Receita não estão confirmados, registra a resposta (sem dados de acesso) para conferência.
  if (lido.arquivos.length || /processada com sucesso/i.test(mensagem ?? '')) log.log(`${e.rotulo} ${cnpj.slice(0, 8)} ${ano}: ${lido.arquivos.length} arquivo(s); resposta: ${r.saida.slice(0, 3000)}`);
  return lido.arquivos.map(lerArquivo);
}

const vencido = (e: Escrituracao, anoComp: number, mesComp: number, hoje: Date) => {
  const venc = new Date(Date.UTC(anoComp, mesComp - 1 + e.prazo.meses, e.prazo.dia, 23));
  return hoje > venc;
};

/**
 * Situação por competência: mensal (EFD) mês a mês; anual (ECD, ECF) o ano. A última transmissão que cobre o período vale.
 * TRANSMITIDA; NO_PRAZO (ainda não venceu); NAO_ENCONTRADA (venceu e a Receita não tem a escrituração).
 */
export function porCompetencia(e: Escrituracao, ano: number, arquivos: ReturnType<typeof lerArquivo>[], hoje = new Date()) {
  const periodos = e.anual
    ? [{ comp: String(ano), ini: new Date(Date.UTC(ano, 0, 1, 12)), fim: new Date(Date.UTC(ano, 11, 31, 12)), mes: 12 }]
    : Array.from({ length: 12 }, (_, i) => ({ comp: `${ano}-${String(i + 1).padStart(2, '0')}`, ini: new Date(Date.UTC(ano, i, 1, 12)), fim: new Date(Date.UTC(ano, i + 1, 0, 12)), mes: i + 1 }));
  return periodos.map((p) => {
    const doPeriodo = arquivos.filter((x) => x.inicio && x.fim && x.inicio <= p.fim && x.fim >= p.ini).sort((a, b) => (dataDe(b.transmissao)?.getTime() ?? 0) - (dataDe(a.transmissao)?.getTime() ?? 0));
    const situacao = doPeriodo.length ? 'TRANSMITIDA' : vencido(e, ano, p.mes, hoje) ? 'NAO_ENCONTRADA' : 'NO_PRAZO';
    return { competencia: p.comp, situacao, transmissoes: doPeriodo.length, ultima: doPeriodo[0] ?? null, todas: doPeriodo };
  });
}

/** Compatibilidade: mês a mês de uma escrituração mensal. */
export function porMes(ano: number, arquivos: ReturnType<typeof lerArquivo>[], hoje = new Date()) {
  return porCompetencia(ESCRITURACAO_POR_ID.get('EFD_ICMS_IPI')!, ano, arquivos, hoje);
}
