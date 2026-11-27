/**
 * Documentos que a importação do Saneamento de estoques comprova sozinha.
 *
 * A regra é dado: cada documento da lista de solicitações (o texto antes de " — ", igual ao `item` gravado no controle) diz quais
 * campos do mapeamento da importação o cobrem. Todos mapeados = coberto (Recebido); só parte = parcial (segue pendente, com o que falta);
 * nenhum = o documento fica no controle manual. Vale a soma de todas as importações do projeto: o que um arquivo não trouxe, outro traz.
 */

export type CoberturaRegra = { item: string; campos: { campo: string; rotulo: string }[] };

export const COBERTURA_SANEAMENTO: CoberturaRegra[] = [
  { item: 'Cadastro de itens do ERP', campos: [
    { campo: 'codigo', rotulo: 'Código' }, { campo: 'descricao', rotulo: 'Descrição' }, { campo: 'unidade', rotulo: 'Unidade' },
    { campo: 'ncm', rotulo: 'NCM' }, { campo: 'grupo', rotulo: 'Grupo' }, { campo: 'ativo', rotulo: 'Situação (ativo/bloqueado)' },
  ] },
  { item: 'Saldo de estoque na data-base', campos: [{ campo: 'saldo', rotulo: 'Saldo' }] },
  { item: 'Movimentação dos itens', campos: [{ campo: 'ultimaMovimentacao', rotulo: 'Última movimentação' }] },
  { item: 'Tabela de equivalência de códigos', campos: [{ campo: 'referencia', rotulo: 'Referência' }, { campo: 'fabricante', rotulo: 'Fabricante' }] },
];

export const REGRAS_AUTOMATICAS: Record<string, CoberturaRegra[]> = { 'saneamento-estoques': COBERTURA_SANEAMENTO };

export type ImportacaoResumo = { arquivo: string; usuario: string; createdAt: Date; mapeamento: unknown };
export type ControleResumo = { item: string; periodo: string; situacao: string; updatedAt: Date };

export type DocumentoAutomatico = {
  item: string;
  periodo: string;
  cobertura: 'TOTAL' | 'PARCIAL';
  /** RECEBIDO quando coberto; PENDENTE quando parcial. */
  situacao: 'RECEBIDO' | 'PENDENTE';
  faltam: string[];
  /** Campo do documento → coluna do arquivo que o trouxe. */
  colunas: { rotulo: string; coluna: string; arquivo: string }[];
  /** Importações que cobrem o documento (mais recente primeiro). */
  evidencias: { arquivo: string; usuario: string; data: string }[];
  atualizado_em: string;
  /** false quando o consultor mudou a situação à mão depois da última importação que cobre o documento. */
  prevalece: boolean;
};

const mapeado = (m: unknown): Record<string, string> => {
  if (!m || typeof m !== 'object') return {};
  return Object.fromEntries(Object.entries(m as Record<string, unknown>).filter(([, v]) => typeof v === 'string' && v.trim()) as [string, string][]);
};

/**
 * Cobertura de cada documento pelas importações (de qualquer ordem). Para cada campo vale a importação mais recente que o mapeou.
 * O controle manual (mesmo item e período) só prevalece se foi gravado depois da última importação que cobre o documento.
 */
export function documentosAutomaticos(servico: string, periodo: string, importacoes: ImportacaoResumo[], controles: ControleResumo[] = []): DocumentoAutomatico[] {
  const regras = REGRAS_AUTOMATICAS[servico];
  if (!regras || !importacoes.length) return [];
  const recentes = [...importacoes].sort((a, b) => +b.createdAt - +a.createdAt);
  const saida: DocumentoAutomatico[] = [];
  for (const regra of regras) {
    const colunas: DocumentoAutomatico['colunas'] = [];
    const usadas: ImportacaoResumo[] = [];
    const faltam: string[] = [];
    for (const { campo, rotulo } of regra.campos) {
      const imp = recentes.find((i) => mapeado(i.mapeamento)[campo]);
      if (!imp) { faltam.push(rotulo); continue; }
      colunas.push({ rotulo, coluna: mapeado(imp.mapeamento)[campo], arquivo: imp.arquivo });
      if (!usadas.includes(imp)) usadas.push(imp);
    }
    if (!colunas.length) continue;
    const atualizado = new Date(Math.max(...usadas.map((i) => +i.createdAt)));
    const manual = controles.find((c) => c.item === regra.item && c.periodo === periodo);
    saida.push({
      item: regra.item, periodo,
      cobertura: faltam.length ? 'PARCIAL' : 'TOTAL',
      situacao: faltam.length ? 'PENDENTE' : 'RECEBIDO',
      faltam, colunas,
      evidencias: usadas.sort((a, b) => +b.createdAt - +a.createdAt).map((i) => ({ arquivo: i.arquivo, usuario: i.usuario, data: i.createdAt.toISOString() })),
      atualizado_em: atualizado.toISOString(),
      prevalece: !manual || +manual.updatedAt < +atualizado,
    });
  }
  return saida;
}
