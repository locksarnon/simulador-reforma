/**
 * Entrada do PDF da POLÍTICA do saneamento (docs/saneamento-diretrizes.md, seção 7). Tipos puros: quem chama (rota
 * `GET projetos/:id/politica/pdf`) resolve as regras do projeto com o conteúdo efetivo e entrega tudo pronto; o gerador só escreve.
 */
import type { Aspecto, ConteudoRegra, Procedimento, RegraProjeto } from '../../diretrizes/tipos';

/** Regra como entra na política: os campos da RegraProjeto que o PDF usa + o conteúdo efetivo (biblioteca + alterações do projeto). */
export type RegraPolitica = Pick<RegraProjeto, 'codigo' | 'aspecto' | 'nome' | 'abrangencia' | 'situacao'>
  & Partial<Pick<RegraProjeto, 'observacao' | 'aprovadaPor' | 'aprovadaEm' | 'revisar'>>
  & { conteudo: ConteudoRegra };

export type DadosPolitica = {
  identificacao: {
    cliente: string;
    projeto: string;
    /** Versão liberada que congela base e política; null = emitida sobre a base atual. */
    versao: { numero: number; rotulo?: string | null; liberadaEm?: string | Date | null } | null;
    /** Data de início de vigência (AAAA-MM-DD ou ISO); null = não definida. */
    vigencia: string | null;
    /** Situação das Diretrizes. O PDF sai como rascunho se for RASCUNHO OU se houver qualquer regra não aprovada. */
    situacao: 'RASCUNHO' | 'APROVADA';
    aprovador: string | null;
    dataEmissao: string | Date;
    /** Nome do ERP do cliente (Cadastro de ERPs); null = não informado. */
    erp: string | null;
  };
  /** Todas as regras do projeto (aprovadas e não aprovadas). Só as aprovadas saem como vigentes. */
  regras: RegraPolitica[];
  procedimentos: Procedimento[];
  /** Nota curta sob o título dos procedimentos (ex.: versão liberada antes de os procedimentos serem congelados na foto). */
  notaProcedimentos?: string | null;
  /** Quadro de consulta: para cada grupo, o código da regra efetiva por aspecto (ausente = grupo sem regra no aspecto). */
  quadro: { grupo: string; codigos: Partial<Record<Aspecto, string>> }[];
  pendencias: {
    /** Grupos sem regra, por aspecto. */
    gruposSemRegra: { aspecto: Aspecto; grupos: string[] }[];
    /** Outras pendências já redigidas por quem chama (opcional). Regras não aprovadas e limites não confirmados saem das próprias regras. */
    outras?: string[];
  };
};
