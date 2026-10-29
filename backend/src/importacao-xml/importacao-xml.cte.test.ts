import { describe, it, expect, afterEach, vi } from 'vitest';
import { ImportacaoXmlService } from './importacao-xml.service';
import { parseXml } from './shared/xml-parser';
import {
  CNPJ_TRANSPORTADORA,
  CNPJ_EMBARCADOR,
  CPF_TAC,
  montarChave,
  xmlCte,
  xmlEventoCancelamentoCte,
  xmlEventoApropriacaoCredPres,
  type OpcoesCte,
} from './shared/cte-fixtures';

// ── montagem do serviço com dependências simuladas (nenhum banco é tocado) ──────────────────────────────────────
const servico = (prisma: any = {}) => new ImportacaoXmlService(prisma, {} as any, { ajustesDaEmpresa: async () => ({}) } as any);

const EMP_TRANSP = { id: 'db-transp', id_empresa: 'EMP-T', regime_atual: 'Lucro Presumido', status: 'Ativa' };
const EMP_EMBARC = { id: 'db-embarc', id_empresa: 'EMP-E', regime_atual: 'Lucro Real', status: 'Ativa' };
const mapaEmpresas = (...pares: [string, any][]) => new Map<string, any>(pares);
const SO_TRANSPORTADORA = mapaEmpresas([CNPJ_TRANSPORTADORA, EMP_TRANSP]);
const SO_EMBARCADOR = mapaEmpresas([CNPJ_EMBARCADOR, EMP_EMBARC]);
const AMBAS = mapaEmpresas([CNPJ_TRANSPORTADORA, EMP_TRANSP], [CNPJ_EMBARCADOR, EMP_EMBARC]);

const catalogos = () => ({
  cstGrouped: new Map<string, any[]>([['000', [{ cst: '000' }]]]),
  classTribGrouped: new Map<string, any[]>([['000001', [{ c_class_trib: '000001' }]]]),
  credPresGrouped: new Map<string, any[]>(),
  ncmSet: new Set<string>(),
  cfopSet: new Set<string>(),
});

function prepararCte(opcoes: OpcoesCte | string, empresas: Map<string, any>, extra: { histKeys?: Set<string>; chavesVistas?: Map<string, string> } = {}) {
  const xml = typeof opcoes === 'string' ? opcoes : xmlCte(opcoes);
  const c = catalogos();
  return (servico() as any).prepararCte(
    { id: 'arq-1', lote_id: 'lote-1' }, parseXml(xml), 'CTE', 'hash-1', 'grp-1', empresas,
    c.cstGrouped, c.classTribGrouped, c.credPresGrouped, c.ncmSet, c.cfopSet,
    extra.histKeys ?? new Set<string>(), extra.chavesVistas ?? new Map<string, string>(),
  );
}

const checksDe = (item: any, camada: 'documental' | 'cadastral' | 'tributaria' | 'operacional') =>
  JSON.parse(item[`validacao_${camada}_json`]) as { codigo: string; status: string; bloqueante: boolean; mensagem: string }[];
const codigosDe = (item: any, camada: 'documental' | 'cadastral' | 'tributaria' | 'operacional') => checksDe(item, camada).map((c) => c.codigo);
const bloqueios = (item: any) =>
  (['documental', 'cadastral', 'tributaria', 'operacional'] as const).flatMap((l) => checksDe(item, l).filter((c) => c.bloqueante && c.status === 'NAO_CONFORME'));

// ── prepararCte ──────────────────────────────────────────────────────────────────────────────────────────────────
describe('prepararCte — itens a partir do CT-e', () => {
  it('CT-e completo da transportadora do grupo vira 1 item de saída, só com alerta do PIS/Cofins presumido', () => {
    const r = prepararCte({ ibscbs: true, vTotDFe: '1113.00' }, SO_TRANSPORTADORA);
    expect(r.sucesso).toBe(true);
    expect(r.itensCriados).toBe(1);
    expect(r.contadores).toEqual({ importaveis: 0, alerta: 1, bloqueados: 0, duplicados: 0, cancelados: 0 });
    expect(r.arquivoUpdate).toMatchObject({
      id: 'arq-1', hash_sha256: 'hash-1', tipo_xml: 'CTE', situacao_fiscal: 'AUTORIZADO', status_tecnico: 'CONCLUIDO',
      chave_nfe: montarChave(), numero_nf: '123', serie: '1', cstat: '100', ambiente: '1', qtd_itens: 1, erro_processamento: null,
    });
    const item = r.items[0];
    expect(item).toMatchObject({
      resultado_final: 'IMPORTAVEL_COM_ALERTA', empresa_id: 'db-transp', perspectiva: 'EMITENTE', direcao: 'Saida',
      valor_bruto: 1000, c_class_trib_original: '000001', pis_pct_normalizado: 0.0065, cofins_pct_normalizado: 0.03,
    });
    expect(bloqueios(item)).toEqual([]);
    const alertas = (['documental', 'cadastral', 'tributaria', 'operacional'] as const).flatMap((l) => checksDe(item, l).filter((c) => c.status === 'ALERTA').map((c) => c.codigo));
    expect(alertas).toEqual(['TRIB_PIS_COFINS_PADRAO_REGIME']);
    expect(codigosDe(item, 'cadastral')).not.toContain('CAD_NCM_AUSENTE'); // CT-e é serviço: NCM/NBS não se aplicam
    const tipo = checksDe(item, 'documental').find((c) => c.codigo === 'DOC_TIPO_RECONHECIDO');
    expect(tipo?.mensagem).toContain('CT-e');
    expect(tipo?.mensagem).not.toContain('NF-e/NFC-e');
  });

  it('sem o grupo IBSCBS o cClassTrib é inferido, com mensagem própria de transporte', () => {
    const item = prepararCte({}, SO_TRANSPORTADORA).items[0];
    expect(item).toMatchObject({ c_class_trib_original: '', c_class_trib_normalizado: '000001', cst_normalizado: '000' });
    const inferido = checksDe(item, 'tributaria').find((c) => c.codigo === 'TRIB_CLASS_TRIB_INFERIDO');
    expect(inferido?.status).toBe('ALERTA');
    expect(inferido?.mensagem).toContain('transporte');
    expect(inferido?.mensagem).not.toContain('NCM');
    expect(bloqueios(item)).toEqual([]);
  });

  it('só o tomador no grupo: 1 item de ENTRADA; CT-e de TAC acrescenta o aviso do crédito presumido por evento', () => {
    const r = prepararCte({ docEmit: CPF_TAC, tpEmis: '3', crt: '4', icms: 'ICMSSN', toma3: '0' }, SO_EMBARCADOR);
    expect(r.itensCriados).toBe(1);
    const item = r.items[0];
    // Na compra o PIS/Cofins do prestador não consta do CT-e e não se presume pelo regime do comprador: zero, com alerta.
    expect(item).toMatchObject({ empresa_id: 'db-embarc', perspectiva: 'DESTINATARIO', direcao: 'Entrada', pis_pct_normalizado: 0, cofins_pct_normalizado: 0, icms_pct_normalizado: 0 });
    expect(codigosDe(item, 'tributaria')).toContain('TRIB_CTE_TAC_CRED_PRES_VIA_EVENTO');
    expect(codigosDe(item, 'tributaria')).toContain('TRIB_PIS_COFINS_COMPRA_ZERADO');
    expect(codigosDe(item, 'tributaria')).not.toContain('TRIB_PIS_COFINS_PADRAO_REGIME');
    expect(bloqueios(item)).toEqual([]);
    expect(r.arquivoUpdate.chave_nfe).toBe(montarChave({ doc: CPF_TAC }));
  });

  it('as duas empresas no grupo (intercompany): a saída leva o PIS/Cofins do regime da emitente e a entrada fica com PIS/Cofins zerados', () => {
    const r = prepararCte({}, AMBAS);
    expect(r.itensCriados).toBe(2);
    const [saida, entrada] = r.items;
    expect(saida).toMatchObject({ direcao: 'Saida', tipo_relacionamento: 'INTERCOMPANY', pis_pct_normalizado: 0.0065, cofins_pct_normalizado: 0.03 });
    expect(entrada).toMatchObject({ direcao: 'Entrada', tipo_relacionamento: 'INTERCOMPANY', pis_pct_normalizado: 0, cofins_pct_normalizado: 0 });
  });

  it('CT-e OS (modelo 67) é lido como serviço, com rótulo próprio', () => {
    const r = prepararCte({ mod: '67' }, SO_TRANSPORTADORA);
    expect(r.itensCriados).toBe(1);
    expect(r.items[0].descricao).toBe('Serviço de transporte SP→MG (CT-e OS nº 123)');
    expect(bloqueios(r.items[0])).toEqual([]);
    expect(checksDe(r.items[0], 'documental').find((c) => c.codigo === 'DOC_TIPO_RECONHECIDO')?.mensagem).toContain('CT-e OS');
  });

  it('CT-e complementar usa as regras de CT-e (não as de finNFe) e referencia o original', () => {
    const original = montarChave({ numero: '50' });
    const item = prepararCte({ tpCTe: '1', chaveComplementada: original }, SO_TRANSPORTADORA).items[0];
    expect(codigosDe(item, 'operacional')).toEqual(['OPER_CTE_COMPLEMENTO_REVISAR']);
    expect(JSON.parse(item.documentos_referenciados_json)).toEqual([original]);
  });

  it('CT-e cancelado pelo protocolo (cStat 101): sem itens, contado como cancelado', () => {
    const r = prepararCte({ cStat: '101' }, SO_TRANSPORTADORA);
    expect(r.arquivoUpdate.situacao_fiscal).toBe('CANCELADO');
    expect(r.items).toEqual([]);
    expect(r.contadores.cancelados).toBe(1);
  });

  it('sem protocolo ou em homologação não gera itens', () => {
    expect(prepararCte({ cStat: null }, SO_TRANSPORTADORA)).toMatchObject({ items: [], arquivoUpdate: { situacao_fiscal: 'SEM_PROTOCOLO' } });
    expect(prepararCte({ cStat: '110', tpAmb: '2' }, SO_TRANSPORTADORA)).toMatchObject({ items: [], arquivoUpdate: { situacao_fiscal: 'HOMOLOGACAO' } });
  });

  it('chave já vista no mesmo envio: duplicidade de chave', () => {
    const chavesVistas = new Map([[montarChave(), 'outro-arquivo']]);
    const r = prepararCte({}, SO_TRANSPORTADORA, { chavesVistas });
    expect(r.arquivoUpdate).toMatchObject({ situacao_fiscal: 'DUPLICADO_CHAVE', motivo_duplicidade: 'DUPLICADO_CHAVE' });
    expect(r.contadores.duplicados).toBe(1);
    expect(r.items).toEqual([]);
  });

  it('perspectiva já importada antes: item marcado como duplicado', () => {
    const histKeys = new Set([`${montarChave()}|1|EMITENTE`]);
    const item = prepararCte({}, SO_TRANSPORTADORA, { histKeys }).items[0];
    expect(item.resultado_final).toBe('DUPLICADO');
  });

  it('nenhuma das empresas no grupo: item bloqueado (CNPJ não localizado)', () => {
    const r = prepararCte({}, new Map());
    expect(r.contadores.bloqueados).toBe(1);
    expect(r.items[0]).toMatchObject({ resultado_final: 'BLOQUEADO', perspectiva: 'PENDENTE', status_mapeamento: 'CNPJ_NAO_LOCALIZADO' });
  });

  it('dígito verificador da chave errado bloqueia o item', () => {
    const chave = montarChave();
    const errada = chave.slice(0, 43) + String((Number(chave[43]) + 1) % 10);
    const item = prepararCte(xmlCte().replace(`CTe${chave}"`, `CTe${errada}"`), SO_TRANSPORTADORA).items[0];
    expect(item.resultado_final).toBe('BLOQUEADO');
    expect(bloqueios(item).map((c) => c.codigo)).toContain('DOC_CHAVE_DV_INVALIDO');
  });

  it('estrutura sem CTe: arquivo inválido, não suportado como CT-e', () => {
    const r = prepararCte('<cteProc xmlns="http://www.portalfiscal.inf.br/cte"><protCTe/></cteProc>', SO_TRANSPORTADORA);
    expect(r.sucesso).toBe(false);
    expect(r.arquivoUpdate).toMatchObject({ situacao_fiscal: 'INVALIDO', status_tecnico: 'FALHOU', erro_processamento: 'Elemento CTe/CTeOS não localizado.' });
  });
});

// ── eventos ──────────────────────────────────────────────────────────────────────────────────────────────────────
describe('prepararEvento — CT-e e NF-e', () => {
  const prep = (xml: string, tipo: string) => (servico() as any).prepararEvento({ id: 'arq-9' }, parseXml(xml), tipo, 'h9');
  const chave = montarChave();

  it('cancelamento de CT-e: chave de chCTe, retorno 135 e evento processado', () => {
    const ev = prep(xmlEventoCancelamentoCte(chave), 'EVENTO_CANCELAMENTO');
    expect(ev.chNFe).toBe(chave);
    expect(ev.cte).toMatchObject({ tpEvento: '110111', processado: true });
    expect(ev.update).toMatchObject({ id: 'arq-9', tipo_xml: 'EVENTO_CANCELAMENTO', situacao_fiscal: 'EVENTO_PROCESSADO', chave_nfe: chave, cstat: '135', status_tecnico: 'CONCLUIDO' });
  });

  it('evento de CT-e sem retorno da SEFAZ fica pendente', () => {
    const ev = prep(xmlEventoCancelamentoCte(chave, null), 'EVENTO_CANCELAMENTO');
    expect(ev.update.situacao_fiscal).toBe('EVENTO_PENDENTE');
    expect(ev.cte.processado).toBe(false);
  });

  it('evento de NF-e continua lendo chNFe/cStat como antes', () => {
    const xml = '<evento><infEvento><chNFe>35260111222333000181550010000000011123456781</chNFe><cStat>135</cStat><xMotivo>ok</xMotivo></infEvento></evento>';
    const ev = prep(xml, 'EVENTO_CANCELAMENTO');
    expect(ev.cte).toBeNull();
    expect(ev.chNFe).toBe('35260111222333000181550010000000011123456781');
    expect(ev.update).toMatchObject({ situacao_fiscal: 'EVENTO_PROCESSADO', cstat: '135', xmotivo: 'ok' });
  });
});

describe('aplicarApropriacaoCredPres — evento 211110 sobre os itens do CT-e', () => {
  const chave = montarChave({ doc: CPF_TAC });
  const evento = () => {
    const ev = (servico() as any).prepararEvento({ id: 'e1' }, parseXml(xmlEventoApropriacaoCredPres(chave)), 'EVENTO_OUTRO', 'h').cte;
    expect(ev.apropriacao).not.toBeNull();
    return ev;
  };
  const prismaCom = (gravados: any[], atualizados: any[]) => ({
    importacaoXMLItem: {
      findMany: async () => gravados,
      update: async ({ where, data }: any) => { atualizados.push({ id: where.id, data }); },
    },
  });

  it('atualiza o item de entrada na memória e o gravado ainda não confirmado; ignora o confirmado', async () => {
    const atualizados: any[] = [];
    const gravados = [
      { id: 'g1', chave_nfe: chave, direcao: 'Entrada', resultado_final: 'IMPORTAVEL' },
      { id: 'g2', chave_nfe: chave, direcao: 'Entrada', resultado_final: 'CONFIRMADO' },
    ];
    const memoria: Record<string, unknown>[] = [
      { chave_nfe: chave, direcao: 'Entrada' },
      { chave_nfe: chave, direcao: 'Saida' }, // a saída do mesmo CT-e (emitente) não recebe o crédito
      { chave_nfe: montarChave({ numero: '7' }), direcao: 'Entrada' },
    ];
    const r = await (servico(prismaCom(gravados, atualizados)) as any).aplicarApropriacaoCredPres('grp-1', evento(), memoria);
    expect(r.itens).toBe(2);
    expect(r.mensagem).toContain('aplicado a 2 item(ns)');
    expect(atualizados.map((a) => a.id)).toEqual(['g1']);
    expect(atualizados[0].data).toMatchObject({
      c_cred_pres_original: '02', c_cred_pres_normalizado: '02',
      credito_presumido_ibs_pct_original: '1.0000', credito_presumido_cbs_pct_original: '3.5000',
    });
    expect(atualizados[0].data.credito_presumido_ibs_pct_normalizado).toBeCloseTo(0.01, 10);
    expect(atualizados[0].data.credito_presumido_cbs_pct_normalizado).toBeCloseTo(0.035, 10);
    expect(memoria[0]).toMatchObject({ c_cred_pres_normalizado: '02' });
    expect(memoria[1]).not.toHaveProperty('c_cred_pres_normalizado');
    expect(memoria[2]).not.toHaveProperty('c_cred_pres_normalizado');
  });

  it('CT-e ainda não importado: nada é aplicado e a mensagem manda reenviar o evento', async () => {
    const r = await (servico(prismaCom([], [])) as any).aplicarApropriacaoCredPres('grp-1', evento(), []);
    expect(r.itens).toBe(0);
    expect(r.mensagem).toContain('ainda não foi importado');
  });

  it('só há item já confirmado: a mensagem manda informar o crédito direto na operação', async () => {
    const gravados = [{ id: 'g2', chave_nfe: chave, direcao: 'Entrada', resultado_final: 'CONFIRMADO' }];
    const r = await (servico(prismaCom(gravados, [])) as any).aplicarApropriacaoCredPres('grp-1', evento(), []);
    expect(r.itens).toBe(0);
    expect(r.mensagem).toContain('já foi confirmado');
  });
});

// ── confirmação: documento e tipo da Operação ───────────────────────────────────────────────────────────────────
describe('confirmarImportacao — documento, tipo e rótulo da operação', () => {
  const item = (over: Record<string, unknown>) => ({
    id: 'i1', lote_id: 'lote-1', grupo_id: 'grp-1', empresa_id: 'db-transp', numero_item: 1,
    perspectiva: 'EMITENTE', direcao: 'Saida', tipo_relacionamento: 'TERCEIRO', resultado_final: 'IMPORTAVEL',
    data_emissao: new Date('2027-01-15T13:00:00Z'), descricao: null, ncm: null, nbs: null, cfop_servico: '6353',
    uf_origem: 'SP', uf_destino: 'MG', municipio_destino: '3106200', quantidade: 1, preco_unitario: 1000,
    desconto_incondicional: 0, frete: 0, seguro: 0, outras_despesas: 0, valor_bruto: 1000,
    cst_normalizado: '000', c_class_trib_normalizado: '000001', c_cred_pres_normalizado: null,
    pis_pct_normalizado: 0.0065, cofins_pct_normalizado: 0.03, icms_pct_normalizado: 0.12, fcp_pct_normalizado: null,
    ipi_pct_normalizado: null, iss_pct_normalizado: null, credito_presumido_ibs_pct_normalizado: null,
    credito_presumido_cbs_pct_normalizado: null, grupo_rtc: null, finalidade_dfe: '0', crt_emitente: '3', ambiente: '1',
    ...over,
  });

  async function confirmar(itens: any[]) {
    const criadas: any[] = [];
    const prisma = {
      importacaoXMLLote: { findUnique: async () => ({ id: 'lote-1', grupo_id: 'grp-1', itens_confirmados: 0 }), update: async () => ({}) },
      importacaoXMLItem: { findMany: async () => itens, update: async () => ({}) },
      empresa: { findUnique: async ({ where }: any) => (where.id === 'db-transp' ? EMP_TRANSP : null) },
      historicoXML: { findMany: async () => [], create: async () => ({}) },
      operacao: { create: async ({ data }: any) => { criadas.push(data); return { id: `op-${criadas.length}` }; } },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    const r = await (servico(prisma) as any).confirmarImportacao({ lote_id: 'lote-1', perspectivas_ids: itens.map((i) => i.id) });
    return { r, criadas };
  }

  it('CT-e: documento CT-e, tipo Serviço e rótulo com "CT-" para não colidir com NF-e', async () => {
    const { r, criadas } = await confirmar([item({ chave_nfe: montarChave() })]);
    expect(r).toMatchObject({ confirmados: 1, erros: 0, status: 'CONCLUIDO' });
    expect(criadas[0]).toMatchObject({
      id_operacao: 'IMP-CT-000000123-1-EMI', empresa_id: 'EMP-T', documento: 'CT-e', tipo: 'Servico',
      direcao: 'Saida', valor_bruto: 1000, cfop_servico: '6353', regime_atual: 'Lucro Presumido',
      pis_pct: 0.0065, cofins_pct: 0.03, icms_pct: 0.12, iss_pct: 0, c_class_trib: '000001', cst_ibs_cbs: '000',
      descricao: 'Importado de CT-e 000000123',
    });
  });

  it('NF-e continua como antes: documento NF-e, tipo pelo NBS e rótulo sem "CT-"', async () => {
    const nfe = montarChave({ mod: '55', numero: '1' });
    const { criadas } = await confirmar([
      item({ id: 'a', chave_nfe: nfe, ncm: '10059010', cfop_servico: '6101' }),
      item({ id: 'b', chave_nfe: nfe, numero_item: 2, nbs: '1.1506.20.00', cfop_servico: '6101' }),
    ]);
    expect(criadas[0]).toMatchObject({ id_operacao: 'IMP-000000001-1-EMI', documento: 'NF-e', tipo: 'Mercadoria', descricao: 'Importado de NF-e 000000001' });
    expect(criadas[1]).toMatchObject({ id_operacao: 'IMP-000000001-2-EMI', documento: 'NF-e', tipo: 'Servico' });
  });

  it('NFC-e (modelo 65) passa a ser rotulada NFC-e; CT-e OS (67) é CT-e', async () => {
    const { criadas } = await confirmar([
      item({ id: 'a', chave_nfe: montarChave({ mod: '65', numero: '2' }), cfop_servico: '5102' }),
      item({ id: 'b', chave_nfe: montarChave({ mod: '67', numero: '3' }) }),
    ]);
    expect(criadas[0].documento).toBe('NFC-e');
    expect(criadas[1]).toMatchObject({ documento: 'CT-e', tipo: 'Servico', id_operacao: 'IMP-CT-000000003-1-EMI' });
  });
});

// ── laço completo de processamento (arquivos baixados, eventos, gravação) ───────────────────────────────────────
describe('processarArquivos — CT-e no laço de processamento do lote', () => {
  afterEach(() => vi.unstubAllGlobals());

  function montarAmbiente(
    arquivos: Record<string, string>,
    itensGravados: any[] = [],
    empresasDoGrupo: any[] = [{ ...EMP_TRANSP, cnpj_cpf: CNPJ_TRANSPORTADORA }],
    extras: { eventosAnteriores?: { chave_nfe: string }[]; consultaDeItensFalha?: (where: any) => boolean } = {},
  ) {
    const itensCriados: any[] = [];
    const itensAtualizados: { id: string; data: any }[] = [];
    const arquivosAtualizados: any[] = [];
    const lotesAtualizados: { id: string; data: any }[] = [];
    const operacoesAtualizadas: { id: string; data: any }[] = [];
    const prisma: any = {
      grupo: { findUnique: async () => ({ id: 'grp-1', numero: 'G1' }) },
      empresa: { findMany: async () => empresasDoGrupo },
      cstIbsCbs: { findMany: async () => [{ cst: '000' }] },
      classTrib: { findMany: async () => [{ c_class_trib: '000001' }] },
      credPres: { findMany: async () => [] },
      ncm: { findMany: async () => [] },
      cfop: { findMany: async () => [] },
      correlacaoNcm: { findMany: async () => [] },
      correlacaoServico: { findMany: async () => [] },
      historicoXML: { findMany: async () => [] },
      // Banco em memória: os itens criados neste envio passam a existir para as consultas e atualizações seguintes.
      importacaoXMLItem: {
        create: async ({ data }: any) => { const linha = { id: `novo-${itensCriados.length + 1}`, ...data }; itensCriados.push(linha); return linha; },
        // Como o banco: devolve cópias (o que muda depois não altera o que a consulta já entregou).
        findMany: async ({ where }: any) => {
          if (extras.consultaDeItensFalha?.(where)) throw new Error('conexão com o banco perdida');
          const chaves: string[] | null = where.chave_nfe && typeof where.chave_nfe === 'object' ? where.chave_nfe.in : null;
          const arquivosDoFiltro: string[] | null = where.arquivo_id?.in ?? null;
          return [...itensGravados, ...itensCriados]
            .filter((i) => (chaves ? chaves.includes(i.chave_nfe) : i.chave_nfe === where.chave_nfe))
            .filter((i) => !where.direcao || i.direcao === where.direcao)
            .filter((i) => !arquivosDoFiltro || arquivosDoFiltro.includes(i.arquivo_id))
            .map((i) => ({ ...i }));
        },
        update: async ({ where, data }: any) => {
          itensAtualizados.push({ id: where.id, data });
          const alvo = [...itensGravados, ...itensCriados].find((i) => i.id === where.id);
          if (alvo) Object.assign(alvo, data);
        },
      },
      importacaoXMLArquivo: {
        update: async ({ where, data }: any) => { arquivosAtualizados.push({ id: where.id, ...data }); },
        // Eventos de cancelamento de envios anteriores, já processados pela SEFAZ.
        findMany: async ({ where }: any) =>
          (extras.eventosAnteriores ?? [])
            .filter((e) => where.tipo_xml === 'EVENTO_CANCELAMENTO' && where.situacao_fiscal === 'EVENTO_PROCESSADO' && where.chave_nfe.in.includes(e.chave_nfe))
            .map((e) => ({ chave_nfe: e.chave_nfe })),
      },
      importacaoXMLLote: { update: async ({ where, data }: any) => { lotesAtualizados.push({ id: where.id, data }); return {}; } },
      operacao: { update: async ({ where, data }: any) => { operacoesAtualizadas.push({ id: where.id, data }); return {}; } },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    vi.stubGlobal('fetch', async (url: string) => ({ ok: true, status: 200, text: async () => arquivos[url] }));
    const arquivosReg = Object.keys(arquivos).map((url, i) => ({ id: `a${i + 1}`, lote_id: 'lote-1', grupo_id: 'grp-1', nome: `f${i + 1}.xml`, file_url: url }));
    return { servico: servico(prisma), arquivosReg, itensCriados, itensAtualizados, arquivosAtualizados, lotesAtualizados, operacoesAtualizadas };
  }

  it('importa o CT-e (antes ignorado), mantém MDF-e ignorado e conta tudo no lote', async () => {
    const mdfe = '<mdfeProc xmlns="http://www.portalfiscal.inf.br/mdfe"><MDFe><infMDFe/></MDFe></mdfeProc>';
    const amb = montarAmbiente({ 'u/cte.xml': xmlCte({ ibscbs: true }), 'u/mdfe.xml': mdfe });
    const r = await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(r).toMatchObject({ arquivosValidos: 2, arquivosInvalidos: 0, totalItens: 1, itensAlerta: 1, itensBloqueados: 0 });
    expect(amb.itensCriados).toHaveLength(1);
    expect(amb.itensCriados[0]).toMatchObject({ chave_nfe: montarChave(), direcao: 'Saida', valor_bruto: 1000 });
    const mdfeArq = amb.arquivosAtualizados.find((a) => a.id === 'a2');
    expect(mdfeArq).toMatchObject({ tipo_xml: 'MDFE', situacao_fiscal: 'IGNORADO' });
    expect(mdfeArq.erro_processamento).toContain('MDFE reconhecido');
    const cteArq = amb.arquivosAtualizados.find((a) => a.id === 'a1');
    expect(cteArq).toMatchObject({ tipo_xml: 'CTE', situacao_fiscal: 'AUTORIZADO', qtd_itens: 1 });
  });

  it('evento de cancelamento de CT-e marca o item já gravado como CANCELADO (e não toca no confirmado)', async () => {
    const chave = montarChave();
    const gravados = [
      { id: 'g1', chave_nfe: chave, resultado_final: 'IMPORTAVEL', operacao_id: null },
      { id: 'g2', chave_nfe: chave, resultado_final: 'CONFIRMADO', operacao_id: 'op-1' },
    ];
    const amb = montarAmbiente({ 'u/canc.xml': xmlEventoCancelamentoCte(chave) }, gravados);
    await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    const cancelados = amb.itensAtualizados.filter((u) => u.data.resultado_final === 'CANCELADO').map((u) => u.id);
    const estornados = amb.itensAtualizados.filter((u) => u.data.resultado_final === 'ESTORNADO').map((u) => u.id);
    expect(cancelados).toEqual(['g1']);
    expect(estornados).toEqual(['g2']);
    expect(amb.arquivosAtualizados[0]).toMatchObject({ tipo_xml: 'EVENTO_CANCELAMENTO', situacao_fiscal: 'EVENTO_PROCESSADO', chave_nfe: chave });
  });

  it.each([
    ['CT-e antes do cancelamento', ['cte', 'canc']],
    ['cancelamento antes do CT-e', ['canc', 'cte']],
  ])('documento e cancelamento no mesmo envio (%s): o item criado vira CANCELADO e o resumo do lote não o conta como importável', async (_ordem, ordem) => {
    const chave = montarChave();
    const arquivos: Record<string, string> = {};
    for (const nome of ordem as string[]) arquivos[`u/${nome}.xml`] = nome === 'cte' ? xmlCte({ ibscbs: true }) : xmlEventoCancelamentoCte(chave);
    const amb = montarAmbiente(arquivos);
    const r = await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(amb.itensCriados).toHaveLength(1);
    expect(amb.itensCriados[0].resultado_final).toBe('CANCELADO');
    expect(r).toMatchObject({ arquivosValidos: 2, totalItens: 1, itensImportaveis: 0, itensAlerta: 0, itensCancelados: 1 });
    expect(amb.arquivosAtualizados.find((a) => a.tipo_xml === 'EVENTO_CANCELAMENTO')).toMatchObject({ situacao_fiscal: 'EVENTO_PROCESSADO' });
  });

  it('cancelamento de um envio ANTERIOR: o CT-e que chega depois (lote reprocessado ou outro lote) já entra CANCELADO e o resumo conta como cancelado', async () => {
    const chave = montarChave();
    const amb = montarAmbiente({ 'u/cte.xml': xmlCte({ ibscbs: true }) }, [], undefined, { eventosAnteriores: [{ chave_nfe: chave }] });
    const r = await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(amb.itensCriados).toHaveLength(1);
    expect(amb.itensCriados[0].resultado_final).toBe('CANCELADO');
    expect(r).toMatchObject({ totalItens: 1, itensAlerta: 0, itensImportaveis: 0, itensCancelados: 1 });
    // outra chave não é afetada
    const outra = montarAmbiente({ 'u/cte.xml': xmlCte({ ibscbs: true, numero: '999' }) }, [], undefined, { eventosAnteriores: [{ chave_nfe: chave }] });
    await (outra.servico as any).processarArquivos('grp-1', outra.arquivosReg);
    expect(outra.itensCriados[0].resultado_final).toBe('IMPORTAVEL_COM_ALERTA');
  });

  it('cancelamento de um documento que ainda não existe no grupo: o evento fica processado, com o aviso de que vale quando o documento entrar', async () => {
    const chave = montarChave();
    const amb = montarAmbiente({ 'u/canc.xml': xmlEventoCancelamentoCte(chave) });
    await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(amb.arquivosAtualizados[0]).toMatchObject({ situacao_fiscal: 'EVENTO_PROCESSADO' });
    expect(amb.arquivosAtualizados[0].erro_processamento).toContain('Nenhum item da chave');
  });

  it('cancelamento repetido não rebaixa o item estornado para cancelado nem refaz o que já estava cancelado; o erro de uma tentativa anterior é limpo', async () => {
    const chave = montarChave();
    const gravados = [
      { id: 'e1', chave_nfe: chave, resultado_final: 'ESTORNADO', operacao_id: 'op-1', lote_id: 'lote-0' },
      { id: 'c1', chave_nfe: chave, resultado_final: 'CANCELADO', operacao_id: null, lote_id: 'lote-0' },
    ];
    const amb = montarAmbiente({ 'u/canc.xml': xmlEventoCancelamentoCte(chave) }, gravados);
    await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(amb.itensAtualizados).toEqual([]);
    expect(amb.lotesAtualizados).toEqual([]);
    expect(amb.arquivosAtualizados[0]).toMatchObject({ situacao_fiscal: 'EVENTO_PROCESSADO', erro_processamento: null });
  });

  it('item de OUTRO lote do grupo: o contador do lote dele é corrigido; o estorno de um confirmado baixa os itens confirmados', async () => {
    const chave = montarChave();
    const gravados = [
      { id: 'a1', chave_nfe: chave, resultado_final: 'IMPORTAVEL_COM_ALERTA', operacao_id: null, lote_id: 'lote-0' },
      { id: 'a2', chave_nfe: chave, resultado_final: 'BLOQUEADO', operacao_id: null, lote_id: 'lote-0' },
      { id: 'a3', chave_nfe: chave, resultado_final: 'CONFIRMADO', operacao_id: 'op-9', lote_id: 'lote-0' },
    ];
    const amb = montarAmbiente({ 'u/canc.xml': xmlEventoCancelamentoCte(chave) }, gravados);
    const r = await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    // os itens são do lote-0; o processamento atual é do lote-1: o resumo devolvido não muda
    expect(r).toMatchObject({ itensCancelados: 0, itensAlerta: 0, itensBloqueados: 0 });
    const doLote = amb.lotesAtualizados.filter((l) => l.id === 'lote-0');
    expect(doLote).toContainEqual({
      id: 'lote-0',
      data: {
        itens_importaveis: { decrement: 0 }, itens_importaveis_com_alerta: { decrement: 1 }, itens_bloqueados: { decrement: 1 },
        itens_duplicados: { decrement: 0 }, itens_cancelados: { increment: 2 },
      },
    });
    expect(doLote).toContainEqual({ id: 'lote-0', data: { itens_confirmados: { decrement: 1 } } });
    expect(amb.operacoesAtualizadas).toEqual([{ id: 'op-9', data: { situacao: 'CANCELADA' } }]);
  });

  it('item de uma passada anterior do MESMO lote (reprocessamento): sai do contador de origem no resumo, com delta negativo', async () => {
    const chave = montarChave();
    const gravados = [{ id: 'a1', chave_nfe: chave, resultado_final: 'IMPORTAVEL_COM_ALERTA', operacao_id: null, lote_id: 'lote-1', arquivo_id: 'anterior' }];
    const amb = montarAmbiente({ 'u/canc.xml': xmlEventoCancelamentoCte(chave) }, gravados);
    const r = await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(r).toMatchObject({ itensAlerta: -1, itensCancelados: 1 });
    expect(amb.lotesAtualizados).toEqual([]); // o lote em processamento é atualizado pelo chamador, com esses deltas
  });

  it('erro de banco ao aplicar um evento: o evento fica FALHOU para o reprocessamento, o documento do envio fica gravado e o resumo conta o arquivo como inválido', async () => {
    const chave = montarChave();
    const amb = montarAmbiente(
      { 'u/cte.xml': xmlCte({ ibscbs: true }), 'u/canc.xml': xmlEventoCancelamentoCte(chave) },
      [],
      undefined,
      { consultaDeItensFalha: (where) => where.chave_nfe === chave && !where.arquivo_id },
    );
    const r = await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(amb.itensCriados).toHaveLength(1);
    expect(amb.itensCriados[0].resultado_final).toBe('IMPORTAVEL_COM_ALERTA');
    expect(r).toMatchObject({ arquivosValidos: 1, arquivosInvalidos: 1, totalItens: 1, itensAlerta: 1 });
    const ev = amb.arquivosAtualizados.find((a) => a.tipo_xml === 'EVENTO_CANCELAMENTO');
    expect(ev).toMatchObject({ status_tecnico: 'FALHOU', situacao_fiscal: 'ERRO_PROCESSAMENTO' });
    expect(ev.erro_processamento).toContain('conexão com o banco perdida');
  });

  it('cancelamento sem o retorno da SEFAZ no mesmo envio do CT-e: o item continua importável', async () => {
    const chave = montarChave();
    const amb = montarAmbiente({ 'u/cte.xml': xmlCte({ ibscbs: true }), 'u/canc.xml': xmlEventoCancelamentoCte(chave, null) });
    const r = await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(amb.itensCriados[0].resultado_final).toBe('IMPORTAVEL_COM_ALERTA');
    expect(r).toMatchObject({ itensAlerta: 1, itensCancelados: 0 });
    expect(amb.arquivosAtualizados.find((a) => a.tipo_xml === 'EVENTO_CANCELAMENTO')).toMatchObject({ situacao_fiscal: 'EVENTO_PENDENTE' });
  });

  it('evento 211110 enviado ANTES do CT-e do TAC no mesmo envio: o crédito presumido é aplicado ao item criado', async () => {
    const chave = montarChave({ doc: CPF_TAC });
    const amb = montarAmbiente(
      {
        'u/apro.xml': xmlEventoApropriacaoCredPres(chave),
        'u/cte.xml': xmlCte({ docEmit: CPF_TAC, tpEmis: '3', crt: '4', icms: 'ICMSSN', toma3: '0' }),
      },
      [],
      [{ ...EMP_EMBARC, cnpj_cpf: CNPJ_EMBARCADOR }],
    );
    await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(amb.itensCriados).toHaveLength(1);
    expect(amb.itensCriados[0]).toMatchObject({ direcao: 'Entrada', c_cred_pres_normalizado: '02' });
    expect(amb.arquivosAtualizados.find((a) => a.tipo_xml === 'EVENTO_OUTRO')).toMatchObject({ situacao_fiscal: 'EVENTO_PROCESSADO' });
  });

  // NF-e: o cancelamento só vale com o retorno da SEFAZ (135, 136 ou 155); rejeitado ou sem retorno não mexe em item nem em operação.
  const CHAVE_NFE = '35260112345678000195550010000001231000001230';
  const procEventoNfe = (cStat: string | null) => `<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <evento versao="1.00"><infEvento Id="ID1101113513"><cOrgao>35</cOrgao><tpAmb>1</tpAmb><CNPJ>12345678000195</CNPJ><chNFe>${CHAVE_NFE}</chNFe><tpEvento>110111</tpEvento></infEvento></evento>
  ${cStat ? `<retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><cStat>${cStat}</cStat><xMotivo>Retorno</xMotivo><chNFe>${CHAVE_NFE}</chNFe></infEvento></retEvento>` : ''}
</procEventoNFe>`;

  it.each(['135', '136', '155'])('NF-e: evento com retorno %s cancela o item gravado e estorna o confirmado', async (cStat) => {
    const gravados = [
      { id: 'g1', chave_nfe: CHAVE_NFE, resultado_final: 'IMPORTAVEL', operacao_id: null },
      { id: 'g2', chave_nfe: CHAVE_NFE, resultado_final: 'CONFIRMADO', operacao_id: 'op-1' },
    ];
    const amb = montarAmbiente({ 'u/canc.xml': procEventoNfe(cStat) }, gravados);
    await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(amb.itensAtualizados.map((u) => `${u.id}:${u.data.resultado_final}`)).toEqual(['g1:CANCELADO', 'g2:ESTORNADO']);
    expect(amb.arquivosAtualizados[0]).toMatchObject({ situacao_fiscal: 'EVENTO_PROCESSADO', cstat: cStat });
  });

  it.each([['rejeitado (573)', '573'], ['só o pedido, sem retorno', null]])('NF-e: evento %s NÃO cancela item nem estorna operação', async (_nome, cStat) => {
    const gravados = [
      { id: 'g1', chave_nfe: CHAVE_NFE, resultado_final: 'IMPORTAVEL', operacao_id: null },
      { id: 'g2', chave_nfe: CHAVE_NFE, resultado_final: 'CONFIRMADO', operacao_id: 'op-1' },
    ];
    const amb = montarAmbiente({ 'u/canc.xml': procEventoNfe(cStat) }, gravados);
    await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(amb.itensAtualizados).toEqual([]);
    expect(amb.arquivosAtualizados[0]).toMatchObject({ situacao_fiscal: 'EVENTO_PENDENTE' });
  });

  it('evento de cancelamento sem o retorno da SEFAZ fica pendente e NÃO cancela o item', async () => {
    const chave = montarChave();
    const gravados = [{ id: 'g1', chave_nfe: chave, resultado_final: 'IMPORTAVEL', operacao_id: null }];
    const amb = montarAmbiente({ 'u/canc.xml': xmlEventoCancelamentoCte(chave, null) }, gravados);
    await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(amb.itensAtualizados).toEqual([]);
    expect(amb.arquivosAtualizados[0]).toMatchObject({ situacao_fiscal: 'EVENTO_PENDENTE' });
  });

  it('evento 211110 aplica o crédito presumido ao item de entrada gravado e registra o resultado no arquivo', async () => {
    const chave = montarChave({ doc: CPF_TAC });
    const gravados = [{ id: 'g1', chave_nfe: chave, direcao: 'Entrada', resultado_final: 'IMPORTAVEL_COM_ALERTA' }];
    const amb = montarAmbiente({ 'u/apro.xml': xmlEventoApropriacaoCredPres(chave) }, gravados);
    await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(amb.itensAtualizados).toHaveLength(1);
    expect(amb.itensAtualizados[0].data).toMatchObject({ c_cred_pres_normalizado: '02' });
    expect(amb.arquivosAtualizados[0]).toMatchObject({ tipo_xml: 'EVENTO_OUTRO', situacao_fiscal: 'EVENTO_PROCESSADO' });
    expect(amb.arquivosAtualizados[0].erro_processamento).toContain('aplicado a 1 item(ns)');
  });

  it('evento 211110 de CT-e que ainda não foi importado fica pendente com a orientação', async () => {
    const amb = montarAmbiente({ 'u/apro.xml': xmlEventoApropriacaoCredPres(montarChave({ doc: CPF_TAC })) });
    await (amb.servico as any).processarArquivos('grp-1', amb.arquivosReg);
    expect(amb.arquivosAtualizados[0]).toMatchObject({ situacao_fiscal: 'EVENTO_PENDENTE' });
    expect(amb.arquivosAtualizados[0].erro_processamento).toContain('ainda não foi importado');
  });
});
