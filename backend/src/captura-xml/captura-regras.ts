import { RespostaDistribuicao, TipoCaptura } from './distribuicao-dfe.cliente';

const MINUTO = 60_000;
export const HORA = 60 * MINUTO;
/** Espera depois de "sem documentos" e de consumo indevido: 1 hora do serviço mais 1 minuto de folga para diferença de relógio. */
export const ESPERA_SEFAZ = 61 * MINUTO;

export type Passo = {
  /** Há mais documentos a buscar já (resposta com documentos e ainda abaixo do máximo, ou lote cheio no ADN). */
  continuarAgora: boolean;
  proximaConsultaEm: Date | null;
  bloqueadoAte: Date | null;
  /** O NSU guardado está à frente do Ambiente Nacional (troca de ambiente, base restaurada): recomeçar do zero. */
  reiniciarNsu: boolean;
  /** Problema do certificado ou do CNPJ que só uma pessoa resolve: a captura é desativada até alguém corrigir e ativar de novo. */
  desativar: boolean;
  situacao: 'COM_DOCUMENTOS' | 'SEM_NOVIDADE' | 'CONSUMO_INDEVIDO' | 'REJEITADA' | 'INDISPONIVEL' | 'CONFIGURACAO_INVALIDA' | 'NSU_A_FRENTE';
  mensagem: string;
};

/** Compara NSU como número: a > b. */
export const nsuMaior = (a: string, b: string): boolean => {
  try { return BigInt(a || '0') > BigInt(b || '0'); } catch { return false; }
};
/** O NSU da SEFAZ tem 15 dígitos; o do ADN (NFS-e Nacional) pode passar disso. */
export const nsuValido = (n: unknown): n is string => typeof n === 'string' && /^\d{1,20}$/.test(n);
export const normalizarNsu = (n: string) => n.padStart(15, '0');

/** O ADN não tem código de consumo indevido: o excesso de consultas dele vem como falha de comunicação. */
const CONSUMO_INDEVIDO: Partial<Record<TipoCaptura, string>> = { NFE: '656', CTE: '656', MDFE: '678' };
/** Certificado inválido, vencido, revogado, de outra raiz de CNPJ/CPF ou sem CNPJ/CPF (NT 2014.002 e NT 2015.002; no ADN, o cliente traduz E2210 a E2213, E2243 e E2245). */
const CONFIGURACAO_INVALIDA = new Set(['280', '281', '283', '284', '285', '472', '473', '593', '491', '492']);
const NSU_A_FRENTE = new Set(['589', '493']);

/**
 * Regras de uso do serviço de Distribuição de DF-e (NT 2014.002 para NF-e; NT 2015.002 para CT-e e MDF-e; o ADN da NFS-e é traduzido
 * para os mesmos códigos pelo cliente dele).
 * Depois de "nenhum documento localizado" (137), ou quando o último NSU alcança o máximo, é preciso esperar 1 hora para consultar de
 * novo: consultar antes devolve "consumo indevido" (656; 678 no MDF-e), bloqueia o CNPJ por 1 hora e ainda zera o relógio de quem insiste.
 */
export function decidirPasso(tipo: TipoCaptura, r: RespostaDistribuicao, agora: Date): Passo {
  const em = (ms: number) => new Date(agora.getTime() + ms);
  const base = { continuarAgora: false, bloqueadoAte: null, reiniciarNsu: false, desativar: false } as const;

  if (r.cStat === CONSUMO_INDEVIDO[tipo]) {
    return { ...base, proximaConsultaEm: em(ESPERA_SEFAZ), bloqueadoAte: em(ESPERA_SEFAZ), situacao: 'CONSUMO_INDEVIDO', mensagem: `A SEFAZ bloqueou novas consultas por 1 hora (consumo indevido, ${r.cStat}). Nada se perde: a captura retoma sozinha.` };
  }
  if (r.cStat === '138') {
    const maisParaBuscar = r.maisDocumentos ?? nsuMaior(r.maxNSU, r.ultNSU);
    return { ...base, continuarAgora: maisParaBuscar, proximaConsultaEm: maisParaBuscar ? null : em(ESPERA_SEFAZ), situacao: 'COM_DOCUMENTOS', mensagem: `${r.documentos.length} documento(s) recebido(s).` };
  }
  if (r.cStat === '137') {
    return { ...base, proximaConsultaEm: em(ESPERA_SEFAZ), situacao: 'SEM_NOVIDADE', mensagem: 'Nenhum documento novo.' };
  }
  if (r.cStat === '108') {
    return { ...base, proximaConsultaEm: em(15 * MINUTO), situacao: 'INDISPONIVEL', mensagem: `Serviço da SEFAZ paralisado por pouco tempo (108): ${r.xMotivo}.` };
  }
  // Paralisação sem previsão, erro não catalogado e falha ao consultar a lista de revogação: tenta de novo daqui a pouco mais de 1 hora.
  if (['109', '999', '286'].includes(r.cStat)) {
    return { ...base, proximaConsultaEm: em(ESPERA_SEFAZ), situacao: 'INDISPONIVEL', mensagem: `Serviço da SEFAZ indisponível (${r.cStat}): ${r.xMotivo}.` };
  }
  if (NSU_A_FRENTE.has(r.cStat)) {
    return { ...base, reiniciarNsu: true, proximaConsultaEm: em(ESPERA_SEFAZ), situacao: 'NSU_A_FRENTE', mensagem: `O NSU guardado está à frente do Ambiente Nacional (${r.cStat}). Confira o ambiente; a numeração recomeça do zero na próxima consulta.` };
  }
  if (CONFIGURACAO_INVALIDA.has(r.cStat)) {
    return { ...base, desativar: true, proximaConsultaEm: null, situacao: 'CONFIGURACAO_INVALIDA', mensagem: `A SEFAZ recusou o certificado ou o CNPJ (${r.cStat}): ${r.xMotivo}. A captura foi desativada: corrija o certificado e ative de novo.` };
  }
  // Qualquer outra rejeição (schema, ambiente, dado inválido): exige atenção de uma pessoa; volta a tentar em 6 horas.
  return { ...base, proximaConsultaEm: em(6 * HORA), situacao: 'REJEITADA', mensagem: `A SEFAZ rejeitou a consulta (${r.cStat}): ${r.xMotivo}.` };
}

/** Espera depois de uma falha de comunicação: curta, para não deixar a captura parada por um tropeço de rede. */
export const esperaAposFalha = (agora: Date) => new Date(agora.getTime() + 15 * MINUTO);

/** Quando um clique manual ("Capturar agora") é permitido: nunca antes das janelas impostas pela SEFAZ. */
export function liberadoEm(cfg: { proxima_consulta_em: Date | null; bloqueado_ate: Date | null }, agora: Date): Date | null {
  const datas = [cfg.proxima_consulta_em, cfg.bloqueado_ate].filter((d): d is Date => !!d && d.getTime() > agora.getTime());
  return datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null;
}
