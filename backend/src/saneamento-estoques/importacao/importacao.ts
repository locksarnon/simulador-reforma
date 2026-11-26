import { lerPlanilha, lerPrevia, formatoDoArquivo, type Planilha, type Previa } from '../../produtos/leitura-planilha';
import { AcumuladorRelatorio, avisosDoMapeamento } from './relatorio';
import { Conferidor, colunasNecessarias } from './conferencia';
import { detectarSeparadorDecimal } from './normalizacao';
import { sugerirMapeamento, validarMapeamento } from './mapeamento';
import type { ConfigImportacao, ItemImportado, LinhaConferida, PreviaImportacao, RelatorioImportacao, SugestaoMapeamento } from './tipos';
import { BadRequestException } from '@nestjs/common';

export type ArquivoEntrada = { buffer: Buffer; originalname?: string };
/** O que a leitura entrega: o mesmo formato de `Planilha` (só `cabecalho`, `linhas` e `linhasFisicas` são obrigatórios). */
export type BaseLida = Pick<Planilha, 'cabecalho' | 'linhas'> & Partial<Pick<Planilha, 'linhasFisicas' | 'ncmNumerico' | 'formato'>>;

export type ResultadoConferencia = {
  /** Itens aceitos e pendentes, na ordem do arquivo, prontos para o Agente 1 gravar (acrescentando `id`). */
  itens: ItemImportado[];
  /** Linha de origem de cada item de `itens` (mesma posição) e a chave de reconciliação. */
  origem: { linhaOrigem: number; chave: string }[];
  /** As 10 primeiras linhas conferidas (qualquer situação). */
  amostra: LinhaConferida[];
  relatorio: RelatorioImportacao;
};

/**
 * Confere uma base já lida (função pura, sem acesso a arquivo). Valida o mapeamento, normaliza cada linha, rejeita duplicidade
 * código+estabelecimento (vale a primeira) e monta o relatório. `guardarItens: false` só conta (usado na prévia).
 */
export function conferirBase(base: BaseLida, cfg: ConfigImportacao, arquivo: { nome: string; buffer: Buffer; formato: 'xlsx' | 'csv' }, guardarItens = true): ResultadoConferencia {
  const erros = validarMapeamento(cfg.mapeamento, base.cabecalho.length);
  if (erros.length) throw new BadRequestException(erros.join(' '));
  const { decimalPorColuna, avisos: avisosDecimal } = separadoresDaBase(base, cfg);
  const config: ConfigImportacao = { ...cfg, colunaNumerica: cfg.colunaNumerica ?? base.ncmNumerico, decimalPorColuna };
  const conf = new Conferidor(base.cabecalho, config);
  const acc = new AcumuladorRelatorio(cfg.maxLinhasDetalhadas ?? 2000);
  const itens: ItemImportado[] = []; const origem: { linhaOrigem: number; chave: string }[] = []; const amostra: LinhaConferida[] = [];
  base.linhas.forEach((valores, i) => {
    const r = conf.conferir(valores, base.linhasFisicas?.[i] ?? i + 2);
    acc.adicionar(r);
    if (amostra.length < 10) amostra.push(r);
    if (guardarItens && r.item && r.chave) { itens.push(r.item); origem.push({ linhaOrigem: r.linhaOrigem, chave: r.chave }); }
  });
  const relatorio = acc.fechar(arquivo, base.cabecalho, config, conf.colunasExtras, [...avisosDoMapeamento(base.cabecalho, config), ...avisosDecimal]);
  return { itens, origem, amostra, relatorio };
}

/** Colunas numéricas lidas pela importação (hoje, o saldo). */
const CAMPOS_NUMERICOS = ['saldo'] as const;

/**
 * Separador decimal por coluna numérica, detectado na base inteira (detectarSeparadorDecimal): a coluna toda é lida do mesmo jeito. Coluna
 * só com "x.yyy" fica BR (milhar) e gera o aviso para o consultor conferir.
 */
export function separadoresDaBase(base: Pick<BaseLida, 'cabecalho' | 'linhas'>, cfg: ConfigImportacao): { decimalPorColuna: ('BR' | 'PONTO' | undefined)[]; avisos: string[] } {
  const decimalPorColuna: ('BR' | 'PONTO' | undefined)[] = [];
  const avisos: string[] = [];
  for (const campo of CAMPOS_NUMERICOS) {
    const i = cfg.mapeamento[campo];
    if (i == null) continue;
    const d = detectarSeparadorDecimal((function* () { for (const l of base.linhas) yield l[i]; })());
    const nome = base.cabecalho[i] || `Coluna ${i + 1}`;
    if (d === 'AMBIGUO') { decimalPorColuna[i] = 'BR'; avisos.push(`Separador decimal ambíguo na coluna "${nome}": lido como milhar; confira (ex.: "1.250" foi lido como mil duzentos e cinquenta).`); }
    else if (d === 'PONTO') { decimalPorColuna[i] = 'PONTO'; avisos.push(`A coluna "${nome}" usa ponto como separador decimal (ex.: "12.5"): toda a coluna foi lida assim ("1.250" = 1,25).`); }
    else if (d === 'BR') decimalPorColuna[i] = 'BR';
  }
  return { decimalPorColuna, avisos };
}

/**
 * PASSO 1 (antes de mapear): lê só o cabeçalho, o total de linhas, o primeiro valor de cada coluna e as 10 primeiras linhas brutas, em fluxo,
 * e sugere o mapeamento. O consultor corrige com `corrigirMapeamento`.
 */
export async function analisarArquivo(arquivo: ArquivoEntrada): Promise<{ previa: Previa; sugestao: SugestaoMapeamento }> {
  const previa = await lerPrevia(arquivo, { numerosBR: true });
  return { previa, sugestao: sugerirMapeamento(previa.cabecalho, previa.exemplos) };
}

async function lerBase(arquivo: ArquivoEntrada, cfg: ConfigImportacao, cabecalho?: string[]): Promise<Planilha> {
  const cab = cabecalho ?? (await lerPrevia(arquivo, { numerosBR: true })).cabecalho;
  return lerPlanilha(arquivo, colunasNecessarias(cab, cfg), { numerosBR: true });
}
const nomeDe = (a: ArquivoEntrada) => a.originalname || 'arquivo';

/**
 * PASSO 2 (antes de confirmar): prévia com total de linhas, primeiro valor de cada coluna, as 10 primeiras linhas já normalizadas e as
 * contagens aceitas/rejeitadas/pendentes (a base inteira é conferida, mas nada é guardado). `cabecalho` (do passo 1) evita reler o arquivo.
 */
export async function gerarPrevia(arquivo: ArquivoEntrada, cfg: ConfigImportacao, cabecalho?: string[]): Promise<PreviaImportacao> {
  const exemplos = await lerPrevia(arquivo, { numerosBR: true });
  const base = await lerBase(arquivo, cfg, cabecalho ?? exemplos.cabecalho);
  const { amostra, relatorio } = conferirBase(base, cfg, { nome: nomeDe(arquivo), buffer: arquivo.buffer, formato: base.formato }, false);
  return {
    formato: base.formato, totalLinhas: base.linhas.length,
    colunas: base.cabecalho.map((nome, indice) => ({ indice, nome, primeiroValor: exemplos.exemplos[indice] ?? '' })),
    amostra, contagens: relatorio.totais, relatorio,
  };
}

/** PASSO 3 (confirmar): devolve os itens aceitos e pendentes + o relatório (arquivo, hash sha256, mapeamento usado, contagens e motivos). */
export async function importarArquivo(arquivo: ArquivoEntrada, cfg: ConfigImportacao, cabecalho?: string[]): Promise<ResultadoConferencia> {
  const base = await lerBase(arquivo, cfg, cabecalho);
  return conferirBase(base, cfg, { nome: nomeDe(arquivo), buffer: arquivo.buffer, formato: base.formato });
}

export { formatoDoArquivo };
