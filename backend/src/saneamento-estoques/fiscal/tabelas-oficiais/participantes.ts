/**
 * Participantes e regimes da Lista A (LC 214/2025) — premissas da Fase 2. Módulo separado de `fiscal/regimes.ts`
 * (REGIMES_CLIENTE é o regime DO CLIENTE; aqui é a lista de quem está do outro lado da operação, incluindo os regimes).
 * Cada fundamento foi conferido no texto compilado do Planalto (FONTE_LC214) em 27/11/2026.
 */
import { FONTE_LC214, FonteOficial } from './fontes';

export const CODIGOS_PARTICIPANTE = [
  'REGULAR',
  'SIMPLES_NO_SIMPLES',
  'SIMPLES_REGULAR',
  'PRODUTOR_RURAL_NAO_CONTRIBUINTE',
  'PRODUTOR_RURAL_CONTRIBUINTE',
  'TRANSPORTADOR_AUTONOMO_PF',
  'PF_BEM_MOVEL_USADO',
  'COLETOR_RESIDUOS',
  'NAO_CONTRIBUINTE_ART26',
  'EXTERIOR',
  'ADMINISTRACAO_PUBLICA',
] as const;
export type CodigoParticipante = (typeof CODIGOS_PARTICIPANTE)[number];

export type Participante = {
  codigo: CodigoParticipante;
  rotulo: string;
  /** Dispositivos da LC 214/2025. */
  fundamento: string;
  /** Efeito prático para quem compra ou vende a esse participante. */
  efeito: string;
  /** true = conferido no texto compilado; false = "não confirmado". */
  confirmado: boolean;
  observacao?: string;
  fonte: FonteOficial;
};

export const PARTICIPANTES: readonly Participante[] = [
  {
    codigo: 'REGULAR', rotulo: 'Contribuinte no regime regular', fundamento: 'LC 214/2025, arts. 21 e 41',
    efeito: 'Contribuinte do IBS e da CBS (art. 21) sujeito a todas as regras de incidência e apuração (art. 41); quem não optou pelo Simples '
      + 'Nacional ou MEI fica no regime regular (art. 41, § 1º). Na compra dele, o crédito é o débito destacado e extinto (art. 47).',
    confirmado: true, fonte: FONTE_LC214,
  },
  {
    codigo: 'SIMPLES_NO_SIMPLES', rotulo: 'Optante pelo Simples Nacional recolhendo IBS/CBS no Simples', fundamento: 'LC 214/2025, art. 47, § 9º',
    efeito: 'O optante não apropria créditos de IBS/CBS; o adquirente do regime regular apropria crédito no montante equivalente ao devido pelo '
      + 'Simples Nacional na operação.',
    confirmado: true, fonte: FONTE_LC214,
  },
  {
    codigo: 'SIMPLES_REGULAR', rotulo: 'Optante pelo Simples Nacional que apura IBS/CBS no regime regular', fundamento: 'LC 214/2025, art. 41, § 3º',
    efeito: 'O IBS e a CBS são apurados e recolhidos pelo regime regular (opção nos termos da LC 123/2006, art. 41, § 4º); crédito pleno para o '
      + 'adquirente e para o próprio optante.',
    confirmado: true, fonte: FONTE_LC214,
  },
  {
    codigo: 'PRODUTOR_RURAL_NAO_CONTRIBUINTE', rotulo: 'Produtor rural não contribuinte',
    fundamento: 'LC 214/2025, art. 164 (crédito presumido do adquirente: art. 168)',
    efeito: 'Produtor rural PF ou PJ com receita inferior a R$ 3.600.000,00 no ano-calendário, e o produtor rural integrado, não são contribuintes '
      + '(art. 164). O adquirente do regime regular apropria crédito presumido com percentuais definidos anualmente por ato conjunto do Ministro '
      + 'da Fazenda e do Comitê Gestor do IBS (art. 168, § 4º).',
    confirmado: true, fonte: FONTE_LC214,
    observacao: 'O texto compilado traz a marca "Produção de efeitos" no art. 168: a data de início dos efeitos não foi conferida (não confirmado).',
  },
  {
    codigo: 'PRODUTOR_RURAL_CONTRIBUINTE', rotulo: 'Produtor rural contribuinte (por opção ou por receita)', fundamento: 'LC 214/2025, art. 165',
    efeito: 'O produtor rural ou integrado pode optar, a qualquer tempo, pela inscrição no regime regular (irretratável no ano-calendário); quem '
      + 'teve receita igual ou superior a R$ 3.600.000,00 é contribuinte independentemente de opção (art. 165, § 3º; art. 164, § 2º).',
    confirmado: true, fonte: FONTE_LC214,
  },
  {
    codigo: 'TRANSPORTADOR_AUTONOMO_PF', rotulo: 'Transportador autônomo de carga pessoa física não contribuinte ou MEI',
    fundamento: 'LC 214/2025, art. 169 (não contribuinte: art. 26, VII)',
    efeito: 'O contribuinte do regime regular que suporta o valor do frete apropria crédito presumido (percentuais anuais, art. 169, § 4º); não se '
      + 'aplica quando o transporte vem embutido no valor da operação (art. 169, § 1º, II).',
    confirmado: true, fonte: FONTE_LC214,
    observacao: 'O texto compilado traz a marca "Produção de efeitos" no art. 169: a data de início dos efeitos não foi conferida (não confirmado).',
  },
  {
    codigo: 'PF_BEM_MOVEL_USADO', rotulo: 'Pessoa física não contribuinte (ou MEI) vendedora de bem móvel usado', fundamento: 'LC 214/2025, art. 171',
    efeito: 'Na compra para revenda de bem móvel usado, o contribuinte do regime regular apropria crédito presumido (alíquotas de IBS/CBS do bem), '
      + 'usado só para deduzir o IBS/CBS da revenda desse bem (art. 171, § 2º).',
    confirmado: true, fonte: FONTE_LC214,
    observacao: 'O texto compilado traz a marca "Produção de efeitos" no art. 171: a data de início dos efeitos não foi conferida (não confirmado).',
  },
  {
    codigo: 'COLETOR_RESIDUOS', rotulo: 'Coletor incentivado de resíduos sólidos', fundamento: 'LC 214/2025, art. 170',
    efeito: 'Na aquisição de resíduos sólidos de coletor incentivado (PF, associação ou cooperativa) para destinação final ambientalmente adequada, '
      + 'crédito presumido de IBS (1,3% em 2029 a 13% a partir de 2033) e de CBS (7%), salvo os itens excluídos no § 3º.',
    confirmado: true, fonte: FONTE_LC214,
    observacao: 'O texto compilado traz a marca "Produção de efeitos" no art. 170: a data de início dos efeitos não foi conferida (não confirmado).',
  },
  {
    codigo: 'NAO_CONTRIBUINTE_ART26', rotulo: 'Não contribuinte do art. 26', fundamento: 'LC 214/2025, art. 26',
    efeito: 'Não são contribuintes: condomínio edilício, consórcio, SCP, nanoempreendedor, fundos de investimento (§§ 5º-A a 8º-A), produtor rural '
      + 'do art. 164, transportador autônomo do art. 169, autogestão de saúde, previdência complementar fechada e fundos patrimoniais; alguns podem '
      + 'optar pelo regime regular (art. 26, § 1º).',
    confirmado: true, fonte: FONTE_LC214,
  },
  {
    codigo: 'EXTERIOR', rotulo: 'Residente ou domiciliado no exterior', fundamento: 'LC 214/2025, arts. 79 a 82 (exportações)',
    efeito: 'Exportações de bens e serviços são imunes ao IBS e à CBS, assegurados os créditos ao exportador (art. 79); exportação de serviço/bem '
      + 'imaterial exige fornecimento a residente no exterior e consumo no exterior (art. 80).',
    confirmado: true, fonte: FONTE_LC214,
    observacao: 'O capítulo das exportações vai do art. 79 ao art. 83; as importações (quando o exterior é o fornecedor) estão nos arts. 63 a 78, '
      + 'fora desta lista.',
  },
  {
    codigo: 'ADMINISTRACAO_PUBLICA', rotulo: 'Administração pública direta, autarquias e fundações públicas', fundamento: 'LC 214/2025, arts. 370 e 473',
    efeito: 'Nas compras governamentais a arrecadação vai integralmente ao ente contratante (art. 473); de 2027 a 2033 aplica-se redutor às '
      + 'alíquotas nas operações contratadas pela administração pública (art. 370).',
    confirmado: true, fonte: FONTE_LC214,
    observacao: 'O art. 473 remete à redução do art. 472, não incluída nesta lista.',
  },
];

/** Não é participante: é local da operação (fica fora da Lista A). */
export const OBSERVACAO_ZONA_FRANCA =
  'Zona Franca de Manaus (LC 214/2025, arts. 439 a 457) e Áreas de Livre Comércio (arts. 458 a 470) são local da operação, não participante.';

const POR_CODIGO = new Map(PARTICIPANTES.map((p) => [p.codigo, p]));

export function participante(codigo: string): Participante | null {
  return POR_CODIGO.get(codigo as CodigoParticipante) ?? null;
}

export function ehParticipante(codigo: string): codigo is CodigoParticipante {
  return POR_CODIGO.has(codigo as CodigoParticipante);
}
