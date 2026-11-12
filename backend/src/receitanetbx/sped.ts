import { chamarBx, escaparXml, lerPesquisa } from './receitanetbx.cliente';

/**
 * Escriturações do SPED transmitidas, pelo ReceitanetBX-Serviço (catálogo da Receita lido em 12/11/2026 no próprio serviço):
 * - EFD ICMS/IPI: sistema 2, tipo 1602, pesquisa "porCNPJIEPeriodoContribuinte" (papéis repr, proc, contr), por período da EFD;
 * - EFD-Contribuições: sistema 7, tipo EFD, pesquisa "exercicio" (Período da Escrituração; papéis contr, proc, repr).
 * O escritório pesquisa como procurador (procuração eletrônica no e-CAC) ou como contribuinte, quando é o próprio CNPJ.
 */
export const ESCRITURACOES = [
  { id: 'EFD_ICMS_IPI', rotulo: 'EFD ICMS/IPI', sistema: '2', tipoarquivo: '1602', tipopesquisa: 'porCNPJIEPeriodoContribuinte', extras: [['opcaoTodosEstabelecimentos', 'V'], ['somenteAtivas', 'F']] },
  { id: 'EFD_CONTRIBUICOES', rotulo: 'EFD-Contribuições', sistema: '7', tipoarquivo: 'EFD', tipopesquisa: 'exercicio', extras: [] as string[][] },
] as const;

export type ArquivoSped = { id: string; atributos: Record<string, string> };
export type Escrituracao = (typeof ESCRITURACOES)[number];

/** Entrada da pesquisa (XML do ReceitanetBX). Datas em dd/mm/aaaa. */
export function entradaPesquisa(e: Escrituracao, cnpj: string, ano: number, proprio: boolean): string {
  const ident = proprio
    ? `<identificacao perfil="contr" sistema="${e.sistema}" tipoarquivo="${e.tipoarquivo}" tipopesquisa="${e.tipopesquisa}"/>`
    : `<identificacao perfil="proc" sistema="${e.sistema}" tipoarquivo="${e.tipoarquivo}" tipopesquisa="${e.tipopesquisa}" nirepresentado="${escaparXml(cnpj)}" tiponirepresentado="cnpj"/>`;
  const campos = [['dataInicio', `01/01/${ano}`], ['dataFim', `31/12/${ano}`], ...e.extras].map(([n, v]) => `<campo nome="${n}" valor="${escaparXml(v)}"/>`).join('');
  return `<pesquisa>${ident}${campos}</pesquisa>`;
}

const dataDe = (v: string): Date | null => {
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
  return { id: x.id, inicio, fim, transmissao, recibo, retificadora, tipo, nome: achar(a, /^nome|arquivo/i), atributos: a };
}

/** Pesquisa o ano inteiro de uma escrituração e devolve os arquivos encontrados (vazio = nada transmitido no período). */
export async function pesquisarAno(e: Escrituracao, cnpj: string, ano: number, proprio: boolean, url?: string) {
  const r = await chamarBx('PesquisarArquivos', entradaPesquisa(e, cnpj, ano, proprio), url);
  const lido = lerPesquisa(r.saida);
  const mensagem = lido.mensagem ?? r.saida.match(/<mensagem>([\s\S]*?)<\/mensagem>/)?.[1]?.trim() ?? null;
  const nada = /n[aã]o encontrado nenhum arquivo/i.test(mensagem ?? '');
  if (!lido.arquivos.length && mensagem && !nada) throw new Error(mensagem);
  return lido.arquivos.map(lerArquivo);
}

/** Mês a mês do ano: a última transmissão que cobre o mês (a mais recente vale), e quantas houve. */
export function porMes(ano: number, arquivos: ReturnType<typeof lerArquivo>[], hoje = new Date()) {
  return Array.from({ length: 12 }, (_, i) => {
    const comp = `${ano}-${String(i + 1).padStart(2, '0')}`;
    const ini = new Date(Date.UTC(ano, i, 1, 12));
    const fim = new Date(Date.UTC(ano, i + 1, 0, 12));
    const doMes = arquivos.filter((x) => x.inicio && x.fim && x.inicio <= fim && x.fim >= ini).sort((a, b) => (dataDe(b.transmissao)?.getTime() ?? 0) - (dataDe(a.transmissao)?.getTime() ?? 0));
    const futuro = ini > hoje;
    return { competencia: comp, situacao: doMes.length ? 'TRANSMITIDA' : futuro ? 'FUTURA' : 'NAO_ENCONTRADA', transmissoes: doMes.length, ultima: doMes[0] ?? null };
  });
}
