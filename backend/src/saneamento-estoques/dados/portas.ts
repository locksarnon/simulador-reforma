import { ServiceUnavailableException } from '@nestjs/common';
import type { AnalisadorCamada, Camada, CasoProposto, ContextoAnalise, ItemTrabalho } from '../tipos';

/**
 * Portas: o que os outros agentes conectam. O módulo registra stubs; cada agente troca o provider pelo seu (injeção por token).
 * Tudo aqui é contrato: mudou, o integrador decide.
 */

// ── Importação (Agente 2) ────────────────────────────────────────────────────

/** Item lido do arquivo: o ItemTrabalho sem o id (quem dá o id é a persistência) e com a linha de origem (1 = primeira linha de dados). */
export type ItemImportado = Omit<ItemTrabalho, 'id'> & { linha: number };
export type LinhaDoRelatorio = { linha: number; codigo: string | null; motivo: string };
export type RelatorioImportacao = {
  aceitas: number;
  rejeitadas: number;
  /** Aceitas com dado faltando que o consultor precisa completar. */
  pendentes: number;
  linhasRejeitadas: LinhaDoRelatorio[];
  linhasPendentes: LinhaDoRelatorio[];
};
export type EntradaImportacao = {
  arquivo: Buffer;
  nomeArquivo: string;
  /** Campo do sistema → nome da coluna no arquivo. Vazio = o importador reconhece sozinho e devolve o que usou. */
  mapeamento?: Record<string, string>;
  /** Estabelecimentos do projeto (vazio = único). */
  estabelecimentos: string[];
};
/** Para a tela de mapeamento: colunas do arquivo, sugestão por coluna e as 10 primeiras linhas normalizadas. */
export type PreviaDoArquivo = {
  colunas: { indice: number; nome: string }[];
  sugestaoColunas: { indice: number; nome: string; exemplo: string; campo: string | null; certeza: 'ALTA' | 'MEDIA' | null; motivo: string }[];
  amostra: unknown[];
};
export type SaidaImportacao = { itens: ItemImportado[]; relatorio: RelatorioImportacao; mapeamento: Record<string, string>; previa?: PreviaDoArquivo };
export interface ImportadorPort {
  ler(entrada: EntradaImportacao): Promise<SaidaImportacao>;
}

// ── Análise (Agentes 3 e 4) ──────────────────────────────────────────────────

export type EntradaPreparo = { projetoId: string; itens: ItemTrabalho[]; contexto: ContextoAnalise };
/**
 * O motor entrega, por camada, o analisador JÁ PREPARADO para esta execução (catálogos fiscais, tabela NCM e ajustes carregados uma
 * única vez) e o contexto a usar (pode acrescentar campos ao ContextoAnalise). `preparar` pode consultar o banco; `analisar` continua puro.
 */
export interface MotorPort {
  camadas(): Camada[];
  preparar(camada: Camada, entrada: EntradaPreparo): Promise<{ analisador: AnalisadorCamada; contexto: ContextoAnalise }>;
}

/** Motor simples a partir de analisadores prontos (testes e usos sem banco). */
export function motorDeAnalisadores(lista: AnalisadorCamada[]): MotorPort {
  return {
    camadas: () => lista.map((a) => a.camada),
    preparar: async (camada, e) => {
      const analisador = lista.find((a) => a.camada === camada);
      if (!analisador) throw new ServiceUnavailableException('Esta camada ainda não tem análise conectada neste servidor.');
      return { analisador, contexto: e.contexto };
    },
  };
}

// ── Parecer da IA (Agente 7) ─────────────────────────────────────────────────

export type ParecerIa = {
  recomendacao: string;
  confianca: 'alta' | 'media' | 'baixa';
  aFavor: string[];
  contra: string[];
  oQueConfirmar: string[];
  fontes: string[];
  /** Rotulado como prática de mercado; nunca como norma. */
  praticaDeMercado: string | null;
  geradoEm: string;
};
export type CasoParaParecer = Pick<CasoProposto, 'camada' | 'tipo' | 'problema' | 'evidencia' | 'atual' | 'proposta' | 'justificativa' | 'fundamento'> & { casoId: string };
export interface ParecerIaPort {
  /** Devolve null quando a IA está fora ou não tem o que dizer: a falha nunca bloqueia o caso. Nunca grava decisão. */
  parecer(caso: CasoParaParecer): Promise<ParecerIa | null>;
}

// ── Entregáveis (Agente 6) ───────────────────────────────────────────────────

/** Dados que o servidor entrega para gerar o Excel e o relatório. `liberada` = só dados aprovados; false = exportação para revisão. */
export type DadosEntrega = {
  projeto: Record<string, unknown>;
  versao: { numero: number; rotulo: string; criadaEm: string } | null;
  /** Na exportação para revisão (versao = null): a última versão liberada do projeto, se houver, para o cabeçalho dizer de onde a base partiu. */
  ultimaLiberada?: { numero: number; rotulo: string; criadaEm: string } | null;
  liberada: boolean;
  itens: Record<string, unknown>[];
  celulas: Record<string, unknown>[];
  casos: Record<string, unknown>[];
  decisoes: Record<string, unknown>[];
  impactosSped: Record<string, unknown>[];
  vinculos: Record<string, unknown>[];
  importacoes: Record<string, unknown>[];
};
export interface EntregaveisPort {
  gerarExcel(dados: DadosEntrega): Promise<Buffer>;
  gerarRelatorioPdf(dados: DadosEntrega): Promise<Buffer>;
}

// ── Tokens e stubs ───────────────────────────────────────────────────────────

export const SAN_IMPORTADOR = 'SAN_IMPORTADOR';
export const SAN_MOTOR = 'SAN_MOTOR';
export const SAN_PARECER_IA = 'SAN_PARECER_IA';
export const SAN_ENTREGAVEIS = 'SAN_ENTREGAVEIS';

const aindaNao = (o: string) => new ServiceUnavailableException(`${o} ainda não está conectado neste servidor.`);

export const importadorStub: ImportadorPort = { ler: async () => { throw aindaNao('O leitor de planilhas'); } };
export const motorStub: MotorPort = motorDeAnalisadores([]);
export const parecerIaStub: ParecerIaPort = { parecer: async () => null };
export const entregaveisStub: EntregaveisPort = {
  gerarExcel: async () => { throw aindaNao('O gerador do Excel'); },
  gerarRelatorioPdf: async () => { throw aindaNao('O gerador do relatório'); },
};

export type { Camada };
