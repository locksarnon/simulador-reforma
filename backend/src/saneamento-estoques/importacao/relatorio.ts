import { createHash } from 'crypto';
import { TEXTO_OCORRENCIA } from './conferencia';
import { CAMPOS_BASE, type CampoBase, type ConfigImportacao, type GrupoOcorrencia, type LinhaConferida, type RelatorioImportacao, type TotaisImportacao } from './tipos';

export const sha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

const MAX_EXEMPLOS = 5;

/** Acumula o relatório linha a linha, sem guardar as linhas (só contagens, exemplos e as linhas com problema até o limite). */
export class AcumuladorRelatorio {
  private totais = { linhas: 0, aceitas: 0, pendentes: 0, rejeitadas: 0 };
  private readonly rej = new Map<string, GrupoOcorrencia>();
  private readonly pend = new Map<string, GrupoOcorrencia>();
  private readonly linhasRej: RelatorioImportacao['linhasRejeitadas'] = [];
  private readonly linhasPend: RelatorioImportacao['linhasPendentes'] = [];
  private truncado = false;
  constructor(private readonly maxLinhas = 2000) {}

  adicionar(l: LinhaConferida): void {
    this.totais.linhas++;
    if (l.situacao === 'ACEITA') { this.totais.aceitas++; return; }
    const rejeitada = l.situacao === 'REJEITADA';
    if (rejeitada) this.totais.rejeitadas++; else this.totais.pendentes++;
    const grupos = rejeitada ? this.rej : this.pend;
    for (const o of l.ocorrencias) {
      let g = grupos.get(o.codigo);
      if (!g) { g = { codigo: o.codigo, texto: o.texto ?? TEXTO_OCORRENCIA[o.codigo] ?? o.codigo, quantidade: 0, exemplos: [] }; grupos.set(o.codigo, g); }
      g.quantidade++;
      if (g.exemplos.length < MAX_EXEMPLOS) g.exemplos.push({ linha: l.linhaOrigem, codigo: l.referencia.codigo, descricao: l.referencia.descricao });
    }
    const destino = rejeitada ? this.linhasRej : this.linhasPend;
    if (destino.length >= this.maxLinhas) { this.truncado = true; return; }
    destino.push({ linha: l.linhaOrigem, chave: l.chave, ocorrencias: l.ocorrencias.map((o) => (o.detalhe ? `${o.texto}: ${o.detalhe}` : o.texto)) });
  }

  totaisAtuais(): TotaisImportacao { return { ...this.totais, importaveis: this.totais.aceitas + this.totais.pendentes }; }

  fechar(arquivo: { nome: string; buffer: Buffer; formato: 'xlsx' | 'csv' }, cabecalho: string[], cfg: ConfigImportacao, colunasExtras: string[], avisos: string[], decimal: Pick<RelatorioImportacao, 'separadores' | 'separadorMudou'> & Partial<Pick<RelatorioImportacao, 'escalaSaldo'>> = { separadores: {}, separadorMudou: [] }): RelatorioImportacao {
    const mapeamentoUsado: RelatorioImportacao['mapeamentoUsado'] = {};
    for (const c of CAMPOS_BASE as readonly CampoBase[]) { const i = cfg.mapeamento[c]; if (i != null) mapeamentoUsado[c] = { indice: i, nome: cabecalho[i] ?? `Coluna ${i + 1}` }; }
    const ordenar = (m: Map<string, GrupoOcorrencia>) => [...m.values()].sort((a, b) => b.quantidade - a.quantidade || a.codigo.localeCompare(b.codigo));
    return {
      arquivo: { nome: arquivo.nome, sha256: sha256(arquivo.buffer), formato: arquivo.formato, tamanhoBytes: arquivo.buffer.length },
      mapeamentoUsado, semanticaAtivo: cfg.semanticaAtivo ?? 'ATIVO', colunasExtras,
      totais: this.totaisAtuais(), motivosRejeicao: ordenar(this.rej), pendencias: ordenar(this.pend), avisos,
      linhasRejeitadas: this.linhasRej, linhasPendentes: this.linhasPend, truncado: this.truncado, escalaSaldo: null, ...decimal,
    };
  }
}

/** Avisos sobre o mapeamento (não impedem a importação). */
export function avisosDoMapeamento(cabecalho: string[], cfg: ConfigImportacao): string[] {
  const m = cfg.mapeamento; const a: string[] = [];
  if (m.ncm == null) a.push('Sem coluna de NCM: a camada de classificação ficará "aguardando informação".');
  if (m.unidade == null) a.push('Sem coluna de unidade: a camada de nomes e unidades ficará "aguardando informação".');
  if (m.ultimaMovimentacao == null) a.push('Sem coluna de última movimentação: o corte da Triagem por data não poderá ser aplicado.');
  if (m.codigo != null && cfg.colunaNumerica?.[m.codigo]) a.push(`A coluna "${cabecalho[m.codigo]}" veio como número no Excel: zeros à esquerda dos códigos podem ter sido perdidos antes da importação. Se os códigos têm zeros, exporte a coluna como texto.`);
  if (m.ncm != null && cfg.colunaNumerica?.[m.ncm]) a.push(`A coluna "${cabecalho[m.ncm]}" veio como número no Excel: NCMs com 7 dígitos podem ter sido completados com o zero à esquerda.`);
  return a;
}
