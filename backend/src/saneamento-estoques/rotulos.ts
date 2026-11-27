/**
 * Rótulos dos tipos de caso para o material do cliente (Excel, PDF, motivo das linhas de impacto). O código interno do tipo nunca vai
 * ao cliente: o que não estiver na tabela vira texto legível (sublinhado → espaço, só a primeira letra maiúscula).
 */
import type { Camada } from './tipos';

export const ROTULO_CAMADA: Record<Camada, string> = {
  IDENTIFICACAO: 'Identificação', QUALIDADE: 'Qualidade', DUPLICIDADE: 'Duplicidades', GRUPOS_FINALIDADE: 'Grupos',
  NOMES_UNIDADES: 'Nomes e unidades', NCM: 'Validar NCM', ESTOQUE: 'Estoque', FINALIDADE: 'Finalidade', NCM_CLASSIFICACAO: 'Classificação NCM',
  TRIBUTARIO: 'Tratamento tributário', OBRIGACOES: 'Impacto no SPED',
};
const ROTULO_CAMADA_TXT: Record<string, string> = ROTULO_CAMADA;

export const ROTULO_TIPO_CASO: Record<string, string> = {
  // Identificação e qualidade
  CODIGO_AUSENTE: 'Código ausente', CODIGO_REPETIDO: 'Código repetido', CODIGO_FORMATO: 'Formato do código', CODIGO_ZEROS_ESQUERDA: 'Zeros à esquerda no código',
  CODIGO_ANTIGO: 'Código antigo', CODIGO_ANTIGO_EM_USO: 'Código antigo em uso', CODIGO_DESCRICOES_DIVERGENTES: 'Mesmo código com descrições diferentes',
  ESTABELECIMENTO_AUSENTE: 'Estabelecimento ausente', CAMPO_OBRIGATORIO_VAZIO: 'Campo obrigatório vazio', DESCRICAO_INSUFICIENTE: 'Descrição insuficiente',
  SALDO_INVALIDO: 'Saldo inválido', SALDO_NEGATIVO: 'Saldo negativo', SEM_DATA_MOVIMENTACAO: 'Sem data de movimentação', DATA_MOVIMENTACAO_INVALIDA: 'Data de movimentação inválida',
  ITEM_INATIVO_COM_USO: 'Item inativo com uso', SEM_MOVIMENTACAO: 'Sem movimentação desde o corte (inativar)',
  SEM_MOVIMENTACAO_COM_SALDO: 'Sem movimentação desde o corte, com saldo', UNIDADE_AUSENTE: 'Unidade ausente', NCM_AUSENTE: 'NCM ausente',
  // Duplicidade
  DUPLICIDADE_EXATA: 'Duplicidade exata', DUPLICIDADE_INDICACAO_ALTA: 'Indício alto de duplicidade', DUPLICIDADE_INDICACAO_POSSIVEL: 'Possível duplicidade',
  DUPLICIDADE_COM_SALDO: 'Duplicidade com saldo', APRESENTACOES_DISTINTAS: 'Apresentações distintas', ATRIBUTOS_CONFLITANTES: 'Atributos conflitantes',
  REFERENCIA_COINCIDENTE: 'Mesma referência do fabricante', REFERENCIA_COINCIDENTE_CONDICAO_DIFERENTE: 'Mesma referência, condição diferente (original × paralelo)',
  REFERENCIA_FABRICANTES_DIFERENTES: 'Mesma referência, fabricantes diferentes', REFERENCIA_COINCIDENTE_SEM_FABRICANTE: 'Mesma referência, sem fabricante',
  // Grupos e finalidade
  ITEM_SEM_GRUPO: 'Item sem grupo', GRUPO_GENERICO: 'Grupo genérico', GRUPO_NOME_VARIANTE: 'Nome de grupo variante', GRUPOS_SOBREPOSTOS: 'Grupos sobrepostos',
  ITEM_DESLOCADO: 'Item fora do grupo', NECESSIDADE_NOVO_GRUPO: 'Necessidade de grupo novo', FINALIDADE_GRUPO: 'Finalidade do grupo', FINALIDADE_EXCECAO: 'Exceção à finalidade do grupo',
  FINALIDADE_SUGERIDA: 'Finalidade sugerida',
  // Nomes e unidades
  DESCRICAO_FORA_DO_PADRAO: 'Descrição fora do padrão', TERMO_GENERICO: 'Descrição com termo genérico', ABREVIACAO_ESCONDE_ATRIBUTO: 'Abreviação que esconde atributo',
  CARACTERES_INVALIDOS: 'Caracteres inválidos', TAMANHO_EXCEDIDO: 'Tamanho acima do limite do ERP', UNIDADE_CONVERSAO: 'Conversão de unidade',
  UNIDADE_GRAFIA: 'Grafia da unidade', UNIDADE_SEM_REGRA: 'Unidade sem regra', UNIDADE_INCOMPATIVEL: 'Unidade incompatível',
  DESCRICAO_FORA_PADRAO: 'Descrição fora do padrão da regra', TERMO_PROIBIDO: 'Termo proibido na descrição', COMPONENTE_AUSENTE: 'Componente ausente na descrição',
  UNIDADE_NAO_PERMITIDA: 'Unidade não permitida', UNIDADE_FORA_CRITERIO: 'Unidade fora do critério', EXCEDE_LIMITE_DESTINO: 'Acima do limite de caracteres',
  LIMITE_NAO_CONFIRMADO: 'Limite de caracteres não confirmado', ATRIBUTO_AUSENTE: 'Atributo obrigatório ausente',
  // NCM
  NCM_FORMATO: 'Formato do NCM', NCM_INEXISTENTE: 'NCM inexistente', NCM_NAO_VIGENTE: 'NCM não vigente', NCM_CLASSIFICACAO_ANTIGA: 'NCM de classificação antiga', NCM_DIVERGENTE_ENTRE_ITENS_IGUAIS: 'NCM diferente entre itens iguais',
  NCM_INCOMPATIVEL_DESCRICAO: 'NCM incompatível com a descrição', NCM_INCOERENTE: 'NCM incoerente', NCM_INFO_INSUFICIENTE: 'Informação insuficiente para o NCM',
  NCM_PREENCHIMENTO_INVALIDO: 'Preenchimento inválido do NCM',
  // Tratamento tributário
  ENQUADRAMENTO_CONJUNTO: 'Enquadramento do conjunto', ENQUADRAMENTO_CONFERIDO: 'Enquadramento conferido', EXCECAO_ITEM: 'Exceção do item', EXCECAO_MANUAL: 'Exceção do item',
  AGUARDANDO_NCM: 'Aguardando NCM', AGUARDANDO_FINALIDADE: 'Aguardando finalidade', AGUARDANDO_INFORMACAO: 'Aguardando informação',
  // Obrigações
  IMPACTO_MUDOU_CODIGO_DESCRICAO: 'Impacto: código ou descrição', IMPACTO_MUDOU_UNIDADE: 'Impacto: unidade ou conversão', IMPACTO_CONSOLIDOU_INATIVOU: 'Impacto: consolidação de código', IMPACTO_INATIVOU: 'Impacto: inativação de código',
  IMPACTO_MUDOU_NCM: 'Impacto: NCM', IMPACTO_MUDOU_TRATAMENTO: 'Impacto: tratamento (CST/cClassTrib)', IMPACTO_ITEM_ATIVO_IMOBILIZADO: 'Impacto: bem do ativo imobilizado',
};

/** Rótulo legível do tipo de caso (nunca o código interno). */
export function rotuloTipoCaso(tipo: string): string {
  if (ROTULO_TIPO_CASO[tipo]) return ROTULO_TIPO_CASO[tipo];
  const t = String(tipo ?? '').toLowerCase().replace(/_+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/** "Camada · tipo" para o material do cliente. */
export const rotuloDoCaso = (camada: string, tipo: string) => [ROTULO_CAMADA_TXT[camada] ?? camada, rotuloTipoCaso(tipo)].filter(Boolean).join(' · ');

/** Rótulos dos campos de "como é hoje" e da proposta no material do cliente. */
export const ROTULO_CAMPO: Record<string, string> = {
  codigo: 'Código', descricao: 'Descrição', unidade: 'Unidade', unidadeCompra: 'Unidade de compra', fatorConversao: 'Fator de conversão', fatorDe: 'Fator: 1 unidade de', fatorPara: 'Fator: equivale a (unidade)', fatorSituacao: 'Situação do fator',
  exigeFator: 'Exige fator', ncm: 'NCM', grupo: 'Grupo', finalidade: 'Finalidade', tambemUsadoComo: 'Também usado como', ativo: 'Ativo', saldo: 'Saldo',
  cClassTrib: 'cClassTrib', cst: 'CST', enquadramentoLegal: 'Enquadramento legal', artigo: 'Artigo', origem: 'Origem', decisao: 'Decisão', manter: 'Código mantido',
  consolidar: 'Código consolidado', ajustes: 'Ajustes', valorOriginal: 'Valor original', valorProposto: 'Valor proposto', tipoImpacto: 'Tipo de impacto',
  codigoAntigo: 'Código antigo', fabricante: 'Fabricante', referencia: 'Referência', estabelecimento: 'Estabelecimento', ultimaMovimentacao: 'Última movimentação',
  decisoesPossiveis: 'Decisões possíveis', codigos: 'Códigos', descricoes: 'Descrições', tratamentoDoSaldo: 'Tratamento do saldo', arvore: 'Árvore de grupos', subgrupos: 'Subgrupos',
};
const VALORES: Record<string, string> = {
  REVENDA: 'Revenda', MATERIA_PRIMA: 'Matéria-prima', INSUMO_PRODUCAO: 'Insumo de produção', EMBALAGEM: 'Embalagem', USO_CONSUMO: 'Uso e consumo', MANUTENCAO: 'Manutenção',
  IMOBILIZADO: 'Imobilizado', MATERIAL_TERCEIROS: 'Material de terceiros', HERDADO: 'Herdado do conjunto', EXCECAO: 'Exceção do item', INFORMAR: 'a informar', CONFIRMAR: 'a confirmar',
  INFORMADO: 'informado', DEFINIDO: 'definido', CADASTRAL_FUTURO: 'Ajuste cadastral futuro', REGULARIZACAO_SALDO: 'Regularização de saldo',
  ESCRITURACAO_ENTREGUE: 'Impacto em escrituração já entregue', PROPOR_CONSOLIDACAO: 'Propor consolidação', SOLICITAR_INFORMACAO: 'Solicitar informação',
  RELACIONAR_APRESENTACOES: 'Relacionar apresentações', PROPOR_INATIVACAO: 'Propor inativação', REGULARIZAR_SALDO: 'Regularizar o saldo antes de inativar',
  MANTER_DISTINTOS: 'Manter distintos', CORRIGIR_IDENTIFICACAO: 'Corrigir a identificação', RELACIONAR_EQUIVALENTES: 'Relacionar equivalentes', SIM: 'Sim', NAO: 'Não',
  true: 'Sim', false: 'Não',
};
export const rotuloDoCampo = (k: string) => ROTULO_CAMPO[k.replace(/^campos\./, '')] ?? k.replace(/^campos\./, '');
export const rotuloDoValor = (v: string) => VALORES[v] ?? v;
/** Os valores rotulados (decisões, finalidades, situação do fator): a tela usa o mesmo dicionário (src/components/saneamento-estoques/logica.js). */
export const ROTULO_VALOR: Readonly<Record<string, string>> = VALORES;
