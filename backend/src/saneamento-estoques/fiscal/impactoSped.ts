/**
 * Impacto nas obrigações (SPED e NF-e): checklist por tipo de ajuste (plano, seção 6) como DADOS versionados.
 * Escopo: dizer o que conferir. Retificação e transmissão estão FORA.
 *
 * Fontes oficiais: Guia Prático da EFD ICMS/IPI e Guia Prático da EFD-Contribuições (portal do SPED, sped.rfb.gov.br) e o portal
 * da NF-e (nfe.fazenda.gov.br). Nesta entrega NÃO foi possível abrir essas fontes (sem acesso de rede no ambiente do agente):
 * os registros vêm do plano aprovado e os nomes de campo foram escritos de memória do leiaute. Por isso todos os registros e campos
 * levam `conferido: false` e a versão do leiaute vale "não confirmado" até um consultor conferir no Guia vigente.
 */
import { AnalisadorCamada, CasoProposto, ContextoAnalise, Evidencia, ItemTrabalho, ResultadoCamada } from '../tipos';

export const VERSAO_CHECKLIST = '1.0.0';

export const TIPOS_AJUSTE = ['MUDOU_CODIGO_DESCRICAO', 'MUDOU_UNIDADE', 'CONSOLIDOU_INATIVOU', 'MUDOU_NCM', 'MUDOU_TRATAMENTO', 'ITEM_ATIVO_IMOBILIZADO'] as const;
export type TipoAjuste = (typeof TIPOS_AJUSTE)[number];
export const ROTULO_AJUSTE: Record<TipoAjuste, string> = {
  MUDOU_CODIGO_DESCRICAO: 'Mudou código ou descrição do item', MUDOU_UNIDADE: 'Mudou unidade ou conversão', CONSOLIDOU_INATIVOU: 'Consolidou ou inativou código',
  MUDOU_NCM: 'Mudou NCM', MUDOU_TRATAMENTO: 'Mudou tratamento (CST/cClassTrib)', ITEM_ATIVO_IMOBILIZADO: 'Item de bem do ativo imobilizado',
};

export const OBRIGACOES = ['EFD_ICMS_IPI', 'EFD_CONTRIBUICOES', 'NFE'] as const;
export type Obrigacao = (typeof OBRIGACOES)[number];
export const ROTULO_OBRIGACAO: Record<Obrigacao, string> = { EFD_ICMS_IPI: 'EFD ICMS/IPI', EFD_CONTRIBUICOES: 'EFD-Contribuições', NFE: 'NF-e (documento eletrônico)' };

export const FONTES_LEIAUTE: Record<Obrigacao, { fonte: string; url: string; versaoConferida: string | null; status: 'CONFIRMADO' | 'NAO_CONFIRMADO' }> = {
  EFD_ICMS_IPI: { fonte: 'Guia Prático da EFD ICMS/IPI (SPED/RFB)', url: 'http://sped.rfb.gov.br', versaoConferida: null, status: 'NAO_CONFIRMADO' },
  EFD_CONTRIBUICOES: { fonte: 'Guia Prático da EFD-Contribuições (SPED/RFB)', url: 'http://sped.rfb.gov.br', versaoConferida: null, status: 'NAO_CONFIRMADO' },
  NFE: { fonte: 'Portal Nacional da NF-e: manual de orientação do contribuinte e notas técnicas (grupo IBSCBS: NT 2025.002, conforme docs/auditoria-reforma-2026-10-28.md)', url: 'https://www.nfe.fazenda.gov.br', versaoConferida: null, status: 'NAO_CONFIRMADO' },
};

export type TipoImpacto = 'CADASTRAL_FUTURO' | 'REGULARIZACAO_SALDO' | 'ESCRITURACAO_ENTREGUE';
export const ROTULO_TIPO_IMPACTO: Record<TipoImpacto, string> = {
  CADASTRAL_FUTURO: 'Ajuste cadastral futuro', REGULARIZACAO_SALDO: 'Regularização de saldo', ESCRITURACAO_ENTREGUE: 'Impacto em escrituração já entregue',
};

export type RegistroChecklist = {
  obrigacao: Obrigacao; registro: string; campos: string[]; verificar: string;
  /** Falso até alguém conferir registro e campos no Guia Prático/manual vigente. */
  conferido: boolean;
  /** Observação de risco do próprio checklist (ex.: o registro do plano precisa de confirmação). */
  ressalva?: string;
};
export type LinhaChecklist = {
  rotulo: string; tipoPadrao: TipoImpacto; avaliarAnteriores: boolean; motivoAvaliar: string; registros: RegistroChecklist[];
};

const R = (obrigacao: Obrigacao, registro: string, campos: string[], verificar: string, ressalva?: string): RegistroChecklist => ({ obrigacao, registro, campos, verificar, conferido: false, ressalva });

export const CHECKLIST: Record<TipoAjuste, LinhaChecklist> = {
  MUDOU_CODIGO_DESCRICAO: {
    rotulo: ROTULO_AJUSTE.MUDOU_CODIGO_DESCRICAO, tipoPadrao: 'CADASTRAL_FUTURO', avaliarAnteriores: false,
    motivoAvaliar: 'Os períodos já escriturados usaram o código e a descrição anteriores; o histórico do item (0205) preserva o vínculo',
    registros: [
      R('EFD_ICMS_IPI', '0200', ['COD_ITEM', 'DESCR_ITEM', 'COD_ANT_ITEM'], 'Item com o novo código/descrição e o anterior informado'),
      R('EFD_ICMS_IPI', '0205', ['DESCR_ANT_ITEM', 'DT_INI', 'DT_FIM', 'COD_ANT_ITEM'], 'Histórico da alteração com o período de vigência'),
      R('EFD_CONTRIBUICOES', '0200', ['COD_ITEM', 'DESCR_ITEM', 'COD_ANT_ITEM'], 'Mesmo cadastro na escrituração de PIS/Cofins'),
      R('EFD_CONTRIBUICOES', '0205', ['DESCR_ANT_ITEM', 'DT_INI', 'DT_FIM', 'COD_ANT_ITEM'], 'Histórico da alteração'),
    ],
  },
  MUDOU_UNIDADE: {
    rotulo: ROTULO_AJUSTE.MUDOU_UNIDADE, tipoPadrao: 'CADASTRAL_FUTURO', avaliarAnteriores: true,
    motivoAvaliar: 'Quantidades e inventário de períodos anteriores podem estar na unidade antiga',
    registros: [
      R('EFD_ICMS_IPI', '0190', ['UNID', 'DESCR'], 'Unidade nova cadastrada'),
      R('EFD_ICMS_IPI', '0220', ['UNID_CONV', 'FAT_CONV'], 'Fator de conversão entre a unidade do item e a do documento'),
      R('EFD_ICMS_IPI', '0200', ['UNID_INV'], 'Unidade de inventário do item'),
      R('EFD_ICMS_IPI', 'C170', ['UNID', 'QTD'], 'Unidade e quantidade dos itens dos documentos'),
      R('EFD_ICMS_IPI', 'H010', ['UNID', 'QTD'], 'Unidade e quantidade do inventário'),
      R('EFD_CONTRIBUICOES', '0190', ['UNID', 'DESCR'], 'Unidade nova cadastrada'),
      R('EFD_CONTRIBUICOES', '0220', ['UNID_CONV', 'FAT_CONV'], 'Fator de conversão'),
    ],
  },
  CONSOLIDOU_INATIVOU: {
    rotulo: ROTULO_AJUSTE.CONSOLIDOU_INATIVOU, tipoPadrao: 'REGULARIZACAO_SALDO', avaliarAnteriores: true,
    motivoAvaliar: 'O saldo do código inativado precisa migrar para o código mantido, e os documentos antigos seguem com o código anterior',
    registros: [
      R('EFD_ICMS_IPI', '0200', ['COD_ITEM', 'COD_ANT_ITEM'], 'Código mantido com o anterior informado'),
      R('EFD_ICMS_IPI', '0205', ['COD_ANT_ITEM', 'DT_INI', 'DT_FIM'], 'Vínculo do código antigo ao novo'),
      R('EFD_ICMS_IPI', '0221', ['COD_ITEM_ATOMICO', 'QTD_CONTIDA'], 'Correlação de itens', 'O plano cita o 0221; o registro trata de correlação entre códigos de itens comercializados e pode não ser o caminho da consolidação simples (0205): confirmar no Guia Prático'),
      R('EFD_ICMS_IPI', 'H010', ['COD_ITEM', 'UNID', 'QTD', 'VL_UNIT', 'VL_ITEM'], 'Inventário sem código inativado e com o saldo consolidado'),
      R('EFD_ICMS_IPI', 'C170', ['COD_ITEM'], 'Vínculo com os documentos do período'),
    ],
  },
  MUDOU_NCM: {
    rotulo: ROTULO_AJUSTE.MUDOU_NCM, tipoPadrao: 'CADASTRAL_FUTURO', avaliarAnteriores: true,
    motivoAvaliar: 'Documentos já emitidos e escriturados com o NCM anterior podem ter tratamento tributário diferente',
    registros: [
      R('EFD_ICMS_IPI', '0200', ['COD_NCM'], 'NCM do cadastro do item'),
      R('EFD_ICMS_IPI', 'C170', ['COD_ITEM'], 'Itens dos documentos ligados ao 0200: o NCM do cadastro deve coincidir com o do documento eletrônico'),
      R('EFD_CONTRIBUICOES', '0200', ['COD_NCM'], 'NCM do cadastro do item'),
      R('NFE', 'det/prod', ['NCM'], 'NCM informado no item do documento eletrônico'),
    ],
  },
  MUDOU_TRATAMENTO: {
    rotulo: ROTULO_AJUSTE.MUDOU_TRATAMENTO, tipoPadrao: 'CADASTRAL_FUTURO', avaliarAnteriores: true,
    motivoAvaliar: 'Documentos já emitidos e a apuração dos períodos anteriores podem ter usado o tratamento antigo',
    registros: [
      R('NFE', 'det/imposto/IBSCBS', ['CST', 'cClassTrib'], 'CST e cClassTrib do item no documento eletrônico'),
      R('EFD_ICMS_IPI', 'C170', ['CST_ICMS', 'CFOP'], 'CST do ICMS e CFOP dos itens', 'O campo do CST de IBS/CBS na EFD ICMS/IPI não foi confirmado'),
      R('EFD_CONTRIBUICOES', 'C170', ['CST_PIS', 'CST_COFINS'], 'CST de PIS/Cofins dos itens'),
      R('EFD_CONTRIBUICOES', 'M100/M500', ['VL_CRED'], 'Apuração do crédito de PIS e Cofins'),
    ],
  },
  ITEM_ATIVO_IMOBILIZADO: {
    rotulo: ROTULO_AJUSTE.ITEM_ATIVO_IMOBILIZADO, tipoPadrao: 'REGULARIZACAO_SALDO', avaliarAnteriores: true,
    motivoAvaliar: 'O controle de crédito do bem corre por vários períodos',
    registros: [
      R('EFD_ICMS_IPI', '0300', ['COD_IND_BEM', 'IDENT_MERC', 'DESCR_ITEM', 'COD_PRNC', 'COD_CTA', 'NR_PARC'], 'Cadastro do bem ou componente do ativo'),
      R('EFD_ICMS_IPI', 'G110/G125', ['COD_IND_BEM', 'DT_MOV', 'TIPO_MOV'], 'Controle de crédito do ativo permanente (Bloco G) e movimentação do bem'),
      R('EFD_CONTRIBUICOES', 'F120/F130', ['IDENT_BEM_IMOB', 'NAT_BC_CRED'], 'Crédito sobre bens do ativo imobilizado'),
    ],
  },
};

// ───────────── Aplicação ao caso concreto ─────────────

export type ContextoImpacto = {
  /** yyyy-mm-dd; define a competência quando o ajuste não traz início. */
  dataBase: string;
  /** Obrigações que o cliente entrega. Sem isso a aplicabilidade fica "a confirmar" (não se presume pelo regime). */
  obrigacoes?: Obrigacao[];
  /** Versão do leiaute conferida pelo consultor, por obrigação. Sem ela: "não confirmado". */
  versaoLeiaute?: Partial<Record<Obrigacao, string>>;
};

export type Aplicabilidade = 'APLICAVEL' | 'A_CONFIRMAR' | 'NAO_APLICAVEL';

export type ImpactoSped = {
  tipoAjuste: TipoAjuste;
  obrigacao: Obrigacao;
  aplicabilidade: Aplicabilidade;
  /** yyyy-mm */
  competencia: string;
  versaoLeiaute: string;
  registro: string;
  campo: string;
  valorOriginal: string | number | null;
  valorProposto: string | number | null;
  motivo: string;
  evidencia: Evidencia[];
  /** yyyy-mm-dd */
  inicio: string;
  avaliarAnteriores: boolean;
  tipo: TipoImpacto;
  verificar: string;
  fonte: string;
  registroConferido: boolean;
  ressalva: string | null;
  itemId: string | null;
};

export type AjusteSped = {
  tipo: TipoAjuste;
  itemId: string;
  valorOriginal: string | number | null;
  valorProposto: string | number | null;
  motivo: string;
  evidencia?: Evidencia[];
  /** Início da vigência do ajuste (yyyy-mm-dd). */
  inicio?: string | null;
  status: 'PROPOSTO' | 'APROVADO';
  /** O item já consta de escrituração entregue em período anterior ao início. */
  escrituracaoEntregue?: boolean;
};

function aplicabilidade(o: Obrigacao, ctx: ContextoImpacto): Aplicabilidade {
  if (!ctx.obrigacoes) return 'A_CONFIRMAR';
  return ctx.obrigacoes.includes(o) ? 'APLICAVEL' : 'NAO_APLICAVEL';
}

/** Linhas do checklist de um tipo de ajuste (sem valores): o que conferir, em que obrigação e registro. */
export function impactosDoAjuste(tipoAjuste: TipoAjuste, ctx: ContextoImpacto, ajuste?: Partial<AjusteSped>): ImpactoSped[] {
  const l = CHECKLIST[tipoAjuste];
  const inicio = ajuste?.inicio ?? ctx.dataBase;
  const tipo: TipoImpacto = ajuste?.escrituracaoEntregue ? 'ESCRITURACAO_ENTREGUE' : l.tipoPadrao;
  return l.registros.map((r) => ({
    tipoAjuste, obrigacao: r.obrigacao, aplicabilidade: aplicabilidade(r.obrigacao, ctx), competencia: inicio.slice(0, 7),
    versaoLeiaute: ctx.versaoLeiaute?.[r.obrigacao] ?? 'não confirmado',
    registro: r.registro, campo: r.campos.join(', '),
    valorOriginal: ajuste?.valorOriginal ?? null, valorProposto: ajuste?.valorProposto ?? null,
    motivo: ajuste?.motivo ?? '', evidencia: ajuste?.evidencia ?? [], inicio, avaliarAnteriores: l.avaliarAnteriores || tipo === 'ESCRITURACAO_ENTREGUE', tipo,
    verificar: r.verificar, fonte: FONTES_LEIAUTE[r.obrigacao].fonte, registroConferido: r.conferido, ressalva: r.ressalva ?? null, itemId: ajuste?.itemId ?? null,
  }));
}

/** Todas as linhas de impacto (ajuste × registro), ordenadas de forma estável: alimenta a aba "Impactos no SPED". */
export function montarImpactos(ajustes: AjusteSped[], ctx: ContextoImpacto): ImpactoSped[] {
  const out: ImpactoSped[] = [];
  for (const a of ajustes) out.push(...impactosDoAjuste(a.tipo, ctx, a));
  return out.sort((x, y) => TIPOS_AJUSTE.indexOf(x.tipoAjuste) - TIPOS_AJUSTE.indexOf(y.tipoAjuste) || x.obrigacao.localeCompare(y.obrigacao) || x.registro.localeCompare(y.registro) || (x.itemId ?? '').localeCompare(y.itemId ?? ''));
}

/** Camada OBRIGACOES: um caso por tipo de ajuste proposto ou aprovado, com os registros a conferir. */
export class AnalisadorObrigacoes implements AnalisadorCamada {
  readonly camada = 'OBRIGACOES' as const;
  constructor(private readonly ajustes: AjusteSped[], private readonly ctx: Omit<ContextoImpacto, 'dataBase'> = {}) {}

  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada {
    const ctx: ContextoImpacto = { ...this.ctx, dataBase: contexto.dataBase };
    const ids = new Set(itens.map((i) => i.id));
    const dosItens = this.ajustes.filter((a) => ids.has(a.itemId));
    const casos: CasoProposto[] = [];
    for (const tipo of TIPOS_AJUSTE) {
      const lista = dosItens.filter((a) => a.tipo === tipo);
      if (lista.length === 0) continue;
      const linhas = impactosDoAjuste(tipo, ctx, { ...lista[0], escrituracaoEntregue: lista.some((a) => a.escrituracaoEntregue) });
      const principal = linhas[0];
      const evidencia: Evidencia[] = linhas.map((l) => ({ rotulo: `${ROTULO_OBRIGACAO[l.obrigacao]} · ${l.registro}`, valor: `${l.campo}: ${l.verificar} [${l.aplicabilidade}]` }));
      evidencia.push({ rotulo: 'Versão do leiaute', valor: [...new Set(linhas.map((l) => `${ROTULO_OBRIGACAO[l.obrigacao]}: ${l.versaoLeiaute}`))].join('; ') });
      evidencia.push({ rotulo: 'Avaliar períodos anteriores', valor: principal.avaliarAnteriores ? `Sim: ${CHECKLIST[tipo].motivoAvaliar}` : `Não: ${CHECKLIST[tipo].motivoAvaliar}` });
      evidencia.push({ rotulo: 'Competência inicial', valor: [...new Set(lista.map((a) => (a.inicio ?? contexto.dataBase).slice(0, 7)))].sort()[0] });
      const ressalvas = [...new Set(linhas.map((l) => l.ressalva).filter(Boolean) as string[])];
      casos.push({
        camada: 'OBRIGACOES', tipo: `IMPACTO_${tipo}`, itens: lista.map((a) => a.itemId),
        problema: `${ROTULO_AJUSTE[tipo]}: conferir o impacto nas obrigações (${lista.length} ajuste(s), ${ROTULO_TIPO_IMPACTO[principal.tipo].toLowerCase()})`,
        evidencia,
        atual: { ajustes: lista.length, valorOriginal: lista[0].valorOriginal },
        proposta: { valorProposto: lista[0].valorProposto, tipoImpacto: principal.tipo },
        justificativa: `${lista[0].motivo || ROTULO_AJUSTE[tipo]}. Só conferência: retificação e transmissão ficam fora desta etapa.`,
        fundamento: `${[...new Set(linhas.map((l) => FONTES_LEIAUTE[l.obrigacao].fonte))].join(' · ')} (leiaute não confirmado nesta entrega)`,
        impactos: ressalvas, origem: 'REGRA', afeta: [],
      });
    }
    return { camada: 'OBRIGACOES', analisados: itens.length, semDados: null, casos, semProblema: itens.filter((i) => !dosItens.some((a) => a.itemId === i.id)).map((i) => i.id) };
  }
}
