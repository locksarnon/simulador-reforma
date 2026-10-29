import { describe, it, expect } from 'vitest';
import { parseXml } from './xml-parser';
import { validateAccessKey, validateCnpj, validateCpf, anoNoBrasil } from './xml-utils';
import {
  lerCte,
  lerEventoCte,
  ehEventoCte,
  icmsEfetivoCte,
  pisCofinsPadraoRegime,
  resolverPerspectivas,
  situacaoFiscalCte,
  montarDadosCte,
  checksExtrasCte,
  descricaoCte,
  dataEmissaoCte,
  localDaOperacaoCte,
  emitidoPorTacOuMei,
  modeloDaChave,
  documentoDaChave,
  ehChaveCte,
  type CteLido,
} from './cte-parser';
import {
  CNPJ_TRANSPORTADORA,
  CNPJ_EMBARCADOR,
  CNPJ_DESTINATARIO,
  CPF_TAC,
  montarChave,
  xmlCte,
  xmlEventoCancelamentoCte,
  xmlEventoCartaCorrecaoCte,
  xmlEventoApropriacaoCredPres,
  type OpcoesCte,
} from './cte-fixtures';

const ler = (opcoes: OpcoesCte = {}): CteLido => {
  const r = lerCte(parseXml(xmlCte(opcoes)));
  if (!r.ok) throw new Error(r.motivo);
  return r.cte;
};

const PRESUMIDO = { id: 'emp-p', regime_atual: 'Lucro Presumido' };
const REAL = { id: 'emp-r', regime_atual: 'Lucro Real' };
const perspectivaEmitente = (empresa = PRESUMIDO) => ({ empresa, perspectiva: 'EMITENTE', direcao: 'Saida', tipo_rel: 'TERCEIRO' });
const perspectivaTomador = (empresa = REAL) => ({ empresa, perspectiva: 'DESTINATARIO', direcao: 'Entrada', tipo_rel: 'TERCEIRO' });
const CTX = { loteId: 'lote-1', arquivoId: 'arq-1', grupoId: 'grp-1', statusMapeamento: 'OK' };

describe('fixtures de teste', () => {
  it('usam documentos e chaves válidos (CNPJ, CPF e dígito verificador)', () => {
    for (const cnpj of [CNPJ_TRANSPORTADORA, CNPJ_EMBARCADOR, CNPJ_DESTINATARIO]) expect(validateCnpj(cnpj).valido, cnpj).toBe(true);
    expect(validateCpf(CPF_TAC).valido).toBe(true);
    expect(validateAccessKey(montarChave()).valido).toBe(true);
    expect(validateAccessKey(montarChave({ mod: '67' })).valido).toBe(true);
    expect(validateAccessKey(montarChave({ doc: CPF_TAC })).valido).toBe(true);
  });
});

describe('lerCte — CT-e modelo 57', () => {
  it('lê identificação, rota, valores, emitente, tomador, ICMS e protocolo', () => {
    const c = ler({ chavesNfe: ['35261111444777000161550010000000011123456780'] });
    expect(c.modelo).toBe('57');
    expect(c.chave).toBe(montarChave());
    expect(c.versao).toBe('4.00');
    expect(c.numero).toBe('123');
    expect(c.serie).toBe('1');
    expect(c.dhEmi).toBe('2027-01-15T10:00:00-03:00');
    expect(c.ambiente).toBe('1');
    expect(c.tpCTe).toBe('0');
    expect(c.cfop).toBe('6353');
    expect([c.ufIni, c.ufFim, c.cMunFim]).toEqual(['SP', 'MG', '3106200']);
    expect(c.vTPrest).toBe(1000);
    expect(c.vRec).toBe(1000);
    expect(c.componentes).toEqual([{ nome: 'Frete peso', valor: 1000 }]);
    expect(c.emitente).toMatchObject({ doc: CNPJ_TRANSPORTADORA, uf: 'SP', crt: '3', nome: 'TRANSPORTADORA TESTE' });
    expect(c.icms).toMatchObject({ grupo: 'ICMS00', cst: '00', vBC: 1000, pICMS: 12, vICMS: 120, pICMSTexto: '12.00' });
    expect(c.cStat).toBe('100');
    expect(c.nProt).toBe('135270000000001');
    expect(c.chavesNfe).toEqual(['35261111444777000161550010000000011123456780']);
    expect(c.ibscbs).toBeNull();
    expect(c.compraGov).toBeNull();
  });

  it('o tomador sai do toma3: 0 remetente, 1 expedidor, 2 recebedor, 3 destinatário', () => {
    const base = { docRem: '11111111000191', docExped: '22222222000191', docReceb: '33333333000191', docDest: '44444444000191' };
    expect(ler({ ...base, toma3: '0' }).tomador).toMatchObject({ papel: 'remetente', doc: base.docRem, uf: 'SP' });
    expect(ler({ ...base, toma3: '1' }).tomador).toMatchObject({ papel: 'expedidor', doc: base.docExped });
    expect(ler({ ...base, toma3: '2' }).tomador).toMatchObject({ papel: 'recebedor', doc: base.docReceb, uf: 'MG' });
    expect(ler({ ...base, toma3: '3' }).tomador).toMatchObject({ papel: 'destinatario', doc: base.docDest, uf: 'MG' });
  });

  it('o tomador sai do toma4 quando o papel é "outros", com documento e UF próprios', () => {
    const c = ler({ toma3: null, toma4: { doc: CNPJ_DESTINATARIO, uf: 'PR' } });
    expect(c.tomador).toMatchObject({ papel: 'outros', doc: CNPJ_DESTINATARIO, uf: 'PR' });
  });

  it('emitente pessoa física (CPF de TAC) é lido como documento do emitente', () => {
    const c = ler({ docEmit: CPF_TAC, crt: '4', tpEmis: '3' });
    expect(c.emitente.doc).toBe(CPF_TAC);
    expect(c.chave).toBe(montarChave({ doc: CPF_TAC }));
    expect(emitidoPorTacOuMei(c)).toBe(true);
    expect(emitidoPorTacOuMei(ler())).toBe(false);
  });

  it('guarda as chaves de CT-e complementado e substituído', () => {
    const outra = montarChave({ numero: '99' });
    expect(ler({ tpCTe: '1', chaveComplementada: outra }).chavesCteRelacionados).toEqual([outra]);
    expect(ler({ tpCTe: '3', chaveSubstituida: outra }).chavesCteRelacionados).toEqual([outra]);
  });

  it('lê o grupo imp/IBSCBS (CST, cClassTrib, valores) e o total do documento', () => {
    const c = ler({ ibscbs: true, vTotDFe: '1113.00', vTPrestLiq: '880.00' });
    expect(c.ibscbs).toMatchObject({ cst: '000', cClassTrib: '000001', vBC: 1000, vIBS: 1, vCBS: 112, pCBS: '11.20', pIBSUF: '0.05', pIBSMun: '0.05' });
    // gCredPres não existe no leiaute do CT-e: sem o grupo, a leitura tolerante devolve vazio.
    expect(c.ibscbs?.cCredPres).toBe('');
    expect(c.vTotDFe).toBe(1113);
    expect(c.vTPrestLiq).toBe(880);
  });

  it('rejeita XML sem CTe, sem infCte, sem ide ou de outro modelo', () => {
    const r1 = lerCte(parseXml('<cteProc><protCTe/></cteProc>'));
    expect(r1).toEqual({ ok: false, motivo: 'Elemento CTe/CTeOS não localizado.' });
    const r2 = lerCte(parseXml('<cteProc><CTe><x/></CTe></cteProc>'));
    expect(r2).toEqual({ ok: false, motivo: 'Elemento infCte não localizado.' });
    const r3 = lerCte(parseXml('<cteProc><CTe><infCte/></CTe></cteProc>'));
    expect(r3).toEqual({ ok: false, motivo: 'Grupo ide não localizado no CT-e.' });
    const r4 = lerCte(parseXml('<cteProc><CTe><infCte><ide><mod>55</mod></ide></infCte></CTe></cteProc>'));
    expect(r4.ok).toBe(false);
    if (!r4.ok) expect(r4.motivo).toContain('55');
  });
});

describe('lerCte — CT-e OS modelo 67', () => {
  it('lê a raiz cteOSProc e o tomador do grupo infCte/toma', () => {
    const c = ler({ mod: '67', docTomaOs: CNPJ_DESTINATARIO });
    expect(c.modelo).toBe('67');
    expect(c.chave).toBe(montarChave({ mod: '67' }));
    expect(c.tomador).toMatchObject({ papel: 'outros', doc: CNPJ_DESTINATARIO, uf: 'PR' });
    expect(c.vTPrest).toBe(1000);
    expect(c.cStat).toBe('100');
    expect(descricaoCte(c)).toBe('Serviço de transporte SP→MG (CT-e OS nº 123)');
  });
});

describe('icmsEfetivoCte — percentual sobre o valor da prestação', () => {
  it.each<[string, OpcoesCte, number | null]>([
    ['ICMS00: vICMS / vTPrest', { icms: 'ICMS00' }, 0.12],
    ['ICMS20 com redução: usa o vICMS informado', { icms: 'ICMS20', vICMS: '60.00' }, 0.06],
    ['ICMS20 sem vICMS: pICMS × (1 − pRedBC)', { icms: 'ICMS20', vICMS: null }, 0.06],
    ['ICMS45 (CST 40/41/51): sem ICMS', { icms: 'ICMS45' }, 0],
    ['ICMS60 (ST anterior): sem ICMS próprio', { icms: 'ICMS60' }, 0],
    ['ICMSSN (Simples): sem ICMS destacado', { icms: 'ICMSSN' }, 0],
    ['ICMS90 com vICMS informado igual a zero: zero', { icms: 'ICMS90', vICMS: '0.00' }, 0],
    ['ICMSOutraUF: lê os campos OutraUF', { icms: 'ICMSOutraUF', pICMS: '7.00', vICMS: '70.00' }, 0.07],
    ['sem grupo de ICMS: indefinido', { icms: null }, null],
    ['vICMS maior que a prestação: indefinido', { icms: 'ICMS00', vICMS: '2000.00' }, null],
  ])('%s', (_nome, opcoes, esperado) => {
    const c = ler(opcoes);
    const pct = icmsEfetivoCte(c.icms, c.vTPrest);
    if (esperado === null) expect(pct).toBeNull();
    else expect(pct).toBeCloseTo(esperado, 10);
  });
});

describe('pisCofinsPadraoRegime', () => {
  it.each([
    ['Lucro Presumido', 0.0065, 0.03],
    ['Lucro Real', 0.0165, 0.076],
    ['Simples Nacional', 0, 0],
    ['Produtor rural PF', 0, 0],
    ['MEI', 0, 0],
  ])('%s', (regime, pis, cofins) => {
    const r = pisCofinsPadraoRegime(regime);
    expect(r.pis).toBe(pis);
    expect(r.cofins).toBe(cofins);
    expect(r.reconhecido).toBe(true);
  });
  it('regime ausente ou desconhecido zera e avisa que não foi reconhecido', () => {
    expect(pisCofinsPadraoRegime(null)).toMatchObject({ pis: 0, cofins: 0, reconhecido: false });
    expect(pisCofinsPadraoRegime('Regime Inventado').reconhecido).toBe(false);
  });
  it('ignora acento e caixa', () => {
    expect(pisCofinsPadraoRegime('LUCRO PRESUMIDO').pis).toBe(0.0065);
  });
});

describe('resolverPerspectivas', () => {
  const emp = (id: string) => ({ id });
  const mapa = new Map<string, any>([
    ['11222333000181', emp('transp')],
    ['11444777000161', emp('embarc')],
  ]);

  it('só o emitente no grupo: EMITENTE/Saída (receita)', () => {
    const r = resolverPerspectivas('11222333000181', '99999999000199', mapa);
    expect(r.statusMapeamento).toBe('OK');
    expect(r.perspectivas).toEqual([{ empresa: emp('transp'), perspectiva: 'EMITENTE', direcao: 'Saida', tipo_rel: 'TERCEIRO' }]);
  });
  it('só o tomador no grupo: DESTINATARIO/Entrada (frete adquirido)', () => {
    const r = resolverPerspectivas('99999999000199', '11444777000161', mapa);
    expect(r.perspectivas).toEqual([{ empresa: emp('embarc'), perspectiva: 'DESTINATARIO', direcao: 'Entrada', tipo_rel: 'TERCEIRO' }]);
  });
  it('as duas empresas do grupo: intercompany, uma saída e uma entrada', () => {
    const r = resolverPerspectivas('11222333000181', '11444777000161', mapa);
    expect(r.perspectivas.map((p) => [p.perspectiva, p.direcao, p.tipo_rel])).toEqual([
      ['EMITENTE', 'Saida', 'INTERCOMPANY'],
      ['DESTINATARIO', 'Entrada', 'INTERCOMPANY'],
    ]);
  });
  it('nenhuma das duas no grupo: CNPJ_NAO_LOCALIZADO com perspectiva pendente', () => {
    const r = resolverPerspectivas('99999999000199', '88888888000199', mapa);
    expect(r.statusMapeamento).toBe('CNPJ_NAO_LOCALIZADO');
    expect(r.perspectivas).toEqual([{ empresa: null, perspectiva: 'PENDENTE', direcao: 'Entrada', tipo_rel: 'TERCEIRO' }]);
  });
  it('emitente e tomador com o mesmo documento: revisão manual e nenhuma perspectiva', () => {
    const r = resolverPerspectivas('11222333000181', '11222333000181', mapa);
    expect(r.statusMapeamento).toBe('REVISAO_MESMO_CNPJ');
    expect(r.perspectivas).toEqual([]);
  });
});

describe('situacaoFiscalCte', () => {
  it('100 autorizado, 101 cancelado, homologação e inválido, nessa ordem de decisão', () => {
    expect(situacaoFiscalCte('100', '1')).toBe('AUTORIZADO');
    expect(situacaoFiscalCte('100', '2')).toBe('AUTORIZADO'); // como no NF-e: o aviso de homologação vem na validação documental
    expect(situacaoFiscalCte('101', '1')).toBe('CANCELADO');
    expect(situacaoFiscalCte('110', '2')).toBe('HOMOLOGACAO');
    expect(situacaoFiscalCte('110', '1')).toBe('INVALIDO');
    expect(situacaoFiscalCte('', '1')).toBe('SEM_PROTOCOLO');
  });
});

describe('montarDadosCte', () => {
  it('CT-e sem IBSCBS, visto pelo emitente em Lucro Presumido', () => {
    const c = ler({ chavesNfe: ['35261111444777000161550010000000011123456780'] });
    const d = montarDadosCte(c, perspectivaEmitente(), CTX);
    expect(d).toMatchObject({
      lote_id: 'lote-1', arquivo_id: 'arq-1', grupo_id: 'grp-1',
      chave_nfe: c.chave, numero_item: 1,
      empresa_id: 'emp-p', perspectiva: 'EMITENTE', direcao: 'Saida', tipo_relacionamento: 'TERCEIRO', status_mapeamento: 'OK',
      ncm: null, nbs: null, cfop_servico: '6353',
      uf_origem: 'SP', uf_destino: 'MG', municipio_destino: '3106200',
      quantidade: 1, preco_unitario: 1000, frete: 0, valor_bruto: 1000,
      cst_original: '', cst_normalizado: '000',
      c_class_trib_original: '', c_class_trib_normalizado: '000001',
      pis_pct_original: null, pis_pct_normalizado: 0.0065,
      cofins_pct_original: null, cofins_pct_normalizado: 0.03,
      icms_pct_original: '12.00',
      iss_pct_normalizado: null, ipi_pct_normalizado: null, fcp_pct_normalizado: null,
      finalidade_dfe: '0', ambiente: '1', crt_emitente: '3',
    });
    expect(d.icms_pct_normalizado as number).toBeCloseTo(0.12, 10);
    expect(d.descricao).toBe('Transporte de carga SP→MG (CT-e nº 123)');
    expect(d.data_emissao).toEqual(new Date('2027-01-15T10:00:00-03:00'));
    expect(JSON.parse(d.documentos_referenciados_json as string)).toEqual(['35261111444777000161550010000000011123456780']);
  });

  it('local da operação (art. 11 da LC 214): fim da prestação na carga; início do transporte nos passageiros do CT-e OS', () => {
    const base = { ufIni: 'SP', ufFim: 'MG', cMunIni: '3550308', cMunFim: '3106200' };
    expect(localDaOperacaoCte({ ...base, modelo: '57', tpServ: '0' })).toEqual({ uf: 'MG', municipio: '3106200' });
    expect(localDaOperacaoCte({ ...base, modelo: '67', tpServ: '7' })).toEqual({ uf: 'MG', municipio: '3106200' }); // valores
    expect(localDaOperacaoCte({ ...base, modelo: '67', tpServ: '6' })).toEqual({ uf: 'SP', municipio: '3550308' }); // pessoas
    expect(localDaOperacaoCte({ ...base, modelo: '67', tpServ: '8' })).toEqual({ uf: 'SP', municipio: '3550308' }); // excesso de bagagem
    const d = montarDadosCte({ ...ler({ mod: '67' }), tpServ: '6' }, perspectivaEmitente(), CTX);
    expect(d).toMatchObject({ uf_origem: 'SP', uf_destino: 'SP', municipio_destino: '3550308' });
  });

  it('o ano da emissão vale no fuso de Brasília: CT-e das 22h30 de 31/12/2026 é de 2026 (em UTC já seria 2027)', () => {
    const d = montarDadosCte(ler({ dhEmi: '2026-12-31T22:30:00-03:00' }), perspectivaEmitente(), CTX);
    expect((d.data_emissao as Date).toISOString()).toBe('2027-01-01T01:30:00.000Z');
    expect(anoNoBrasil(d.data_emissao as Date)).toBe(2026);
  });

  it('na entrada o PIS/Cofins do prestador não consta do CT-e: fica zero, mesmo com o tomador em Lucro Real (o regime do comprador não diz nada sobre o do prestador)', () => {
    const d = montarDadosCte(ler(), perspectivaTomador(REAL), CTX);
    expect(d).toMatchObject({ direcao: 'Entrada', perspectiva: 'DESTINATARIO', pis_pct_normalizado: 0, cofins_pct_normalizado: 0 });
  });

  it('na saída o PIS/Cofins presumido segue o regime da emitente', () => {
    const d = montarDadosCte(ler(), perspectivaEmitente(REAL), CTX);
    expect(d).toMatchObject({ direcao: 'Saida', pis_pct_normalizado: 0.0165, cofins_pct_normalizado: 0.076 });
  });

  it('o alerta da compra explica o PIS/Cofins zerado, e o alerta do regime só aparece na saída', () => {
    const compra = checksExtrasCte(ler(), perspectivaTomador(REAL)).tributarias.map((c) => c.codigo);
    expect(compra).toContain('TRIB_PIS_COFINS_COMPRA_ZERADO');
    expect(compra).not.toContain('TRIB_PIS_COFINS_PADRAO_REGIME');
    const venda = checksExtrasCte(ler(), perspectivaEmitente(REAL)).tributarias.map((c) => c.codigo);
    expect(venda).toContain('TRIB_PIS_COFINS_PADRAO_REGIME');
    expect(venda).not.toContain('TRIB_PIS_COFINS_COMPRA_ZERADO');
  });

  it('com o grupo IBSCBS, CST e cClassTrib do XML ficam como original e normalizado', () => {
    const d = montarDadosCte(ler({ ibscbs: true }), perspectivaEmitente(), CTX);
    expect(d).toMatchObject({ cst_original: '000', cst_normalizado: '000', c_class_trib_original: '000001', c_class_trib_normalizado: '000001' });
  });

  it('CST sem cClassTrib: o cClassTrib é inferido e o original fica vazio', () => {
    const d = montarDadosCte(ler({ ibscbs: 'sem-classe' }), perspectivaEmitente(), CTX);
    expect(d).toMatchObject({ cst_original: '000', c_class_trib_original: '', c_class_trib_normalizado: '000001' });
  });

  it('CT-e sem perspectiva de empresa (pendente) usa PIS/Cofins zerados', () => {
    const d = montarDadosCte(ler(), { empresa: null, perspectiva: 'PENDENTE', direcao: 'Entrada', tipo_rel: 'TERCEIRO' }, { ...CTX, statusMapeamento: 'CNPJ_NAO_LOCALIZADO' });
    expect(d).toMatchObject({ empresa_id: null, pis_pct_normalizado: 0, cofins_pct_normalizado: 0, status_mapeamento: 'CNPJ_NAO_LOCALIZADO' });
  });

  it('descrição do complemento e do substituto ganha o prefixo da finalidade', () => {
    expect(descricaoCte(ler({ tpCTe: '1' }))).toBe('Complemento de valores — Transporte de carga SP→MG (CT-e nº 123)');
    expect(descricaoCte(ler({ tpCTe: '3' }))).toBe('Substituto — Transporte de carga SP→MG (CT-e nº 123)');
  });

  it('data de emissão inválida vira null (a validação documental bloqueia depois)', () => {
    const c = ler();
    expect(dataEmissaoCte({ dhEmi: 'ontem' })).toBeNull();
    expect(dataEmissaoCte({ dhEmi: '' })).toBeNull();
    expect(dataEmissaoCte(c)).toBeInstanceOf(Date);
  });
});

describe('checksExtrasCte', () => {
  const codigos = (checks: { codigo: string }[]) => checks.map((c) => c.codigo);

  it('sempre avisa que o PIS/Cofins foi presumido pelo regime (não bloqueante)', () => {
    const { tributarias } = checksExtrasCte(ler(), perspectivaEmitente());
    const aviso = tributarias.find((c) => c.codigo === 'TRIB_PIS_COFINS_PADRAO_REGIME');
    expect(aviso).toMatchObject({ status: 'ALERTA', bloqueante: false, campo_relacionado: 'pis_pct' });
    expect(aviso?.mensagem).toContain('Lucro Presumido');
  });

  it('CT-e de TAC/MEI visto pelo tomador explica que o crédito presumido vem por evento', () => {
    const c = ler({ docEmit: CPF_TAC, tpEmis: '3' });
    expect(codigos(checksExtrasCte(c, perspectivaTomador()).tributarias)).toContain('TRIB_CTE_TAC_CRED_PRES_VIA_EVENTO');
    // pela perspectiva do emitente não se aplica
    expect(codigos(checksExtrasCte(c, perspectivaEmitente()).tributarias)).not.toContain('TRIB_CTE_TAC_CRED_PRES_VIA_EVENTO');
    // CT-e comum, mesmo na perspectiva do tomador, não
    expect(codigos(checksExtrasCte(ler(), perspectivaTomador()).tributarias)).not.toContain('TRIB_CTE_TAC_CRED_PRES_VIA_EVENTO');
  });

  it.each([
    ['1', 'OPER_CTE_COMPLEMENTO_REVISAR'],
    ['2', 'OPER_CTE_ANULACAO_REVISAR'],
    ['3', 'OPER_CTE_SUBSTITUTO_REVISAR'],
  ])('tpCTe %s gera o alerta de revisão %s', (tpCTe, codigo) => {
    expect(codigos(checksExtrasCte(ler({ tpCTe }), perspectivaEmitente()).operacionais)).toEqual([codigo]);
  });

  it('CT-e normal não gera alerta operacional', () => {
    expect(checksExtrasCte(ler(), perspectivaEmitente()).operacionais).toEqual([]);
  });

  it('a partir de 2027, total do documento igual ao vTPrest apesar de haver IBS/CBS pede revisão do valor', () => {
    const suspeito = ler({ ibscbs: true, vTotDFe: '1000.00' });
    expect(codigos(checksExtrasCte(suspeito, perspectivaEmitente()).operacionais)).toContain('OPER_CTE_VALOR_PRESTACAO_COM_IBS_CBS_REVISAR');
    // conforme a regra 365 (vTotDFe = vTPrest + IBS + CBS) não há o que revisar
    const regular = ler({ ibscbs: true, vTotDFe: '1113.00' });
    expect(checksExtrasCte(regular, perspectivaEmitente()).operacionais).toEqual([]);
    // em 2026 o total não soma IBS/CBS, então a igualdade é normal
    const de2026 = ler({ ibscbs: true, vTotDFe: '1000.00', dhEmi: '2026-11-10T10:00:00-03:00' });
    expect(checksExtrasCte(de2026, perspectivaEmitente()).operacionais).toEqual([]);
  });
});

describe('eventos de CT-e', () => {
  const chave = montarChave();

  it('reconhece a raiz procEventoCTe e não confunde com evento de NF-e', () => {
    expect(ehEventoCte(parseXml(xmlEventoCancelamentoCte(chave)))).toBe(true);
    expect(ehEventoCte(parseXml('<procEventoNFe><evento/></procEventoNFe>'))).toBe(false);
    expect(ehEventoCte(parseXml(xmlCte()))).toBe(false);
  });

  it('cancelamento: chave, tipo e retorno da SEFAZ', () => {
    const ev = lerEventoCte(parseXml(xmlEventoCancelamentoCte(chave)));
    expect(ev).toMatchObject({ chave, tpEvento: '110111', descEvento: 'Cancelamento', cStat: '135', processado: true, apropriacao: null });
    expect(ev.xMotivo).toContain('Evento registrado');
    expect(ev.nProt).toBe('135270000000099');
  });

  it('sem o retEventoCTe o evento não conta como processado', () => {
    const ev = lerEventoCte(parseXml(xmlEventoCancelamentoCte(chave, null)));
    expect(ev).toMatchObject({ chave, tpEvento: '110111', cStat: '', processado: false });
  });

  it('retorno com outro cStat (rejeição) não é processado', () => {
    expect(lerEventoCte(parseXml(xmlEventoCancelamentoCte(chave, '218'))).processado).toBe(false);
  });

  it('carta de correção não traz apropriação', () => {
    expect(lerEventoCte(parseXml(xmlEventoCartaCorrecaoCte(chave)))).toMatchObject({ tpEvento: '110110', apropriacao: null, processado: true });
  });

  it('apropriação do crédito presumido (211110): código de 2 dígitos, percentuais e valores de IBS e CBS', () => {
    const ev = lerEventoCte(parseXml(xmlEventoApropriacaoCredPres(chave)));
    expect(ev.tpEvento).toBe('211110');
    expect(ev.processado).toBe(true);
    expect(ev.apropriacao).toEqual({
      vBC: 1000,
      cCredPres: '02',
      ibs: { pct: '1.0000', valor: 10 },
      cbs: { pct: '3.5000', valor: 35 },
    });
  });

  it('apropriação só de CBS: o grupo do IBS vem nulo', () => {
    const ev = lerEventoCte(parseXml(xmlEventoApropriacaoCredPres(chave, { pIbs: '' })));
    expect(ev.apropriacao?.ibs).toBeNull();
    expect(ev.apropriacao?.cbs).toEqual({ pct: '3.5000', valor: 35 });
  });
});

describe('chave de acesso e tipo do documento', () => {
  it('o modelo vem das posições 21–22 da chave', () => {
    expect(modeloDaChave(montarChave({ mod: '57' }))).toBe('57');
    expect(modeloDaChave(montarChave({ mod: '67' }))).toBe('67');
    expect(modeloDaChave('123')).toBe('');
    expect(modeloDaChave('')).toBe('');
  });
  it('rótulo do documento da operação: 55 NF-e, 65 NFC-e, 57 e 67 CT-e', () => {
    expect(documentoDaChave(montarChave({ mod: '55' }))).toBe('NF-e');
    expect(documentoDaChave(montarChave({ mod: '65' }))).toBe('NFC-e');
    expect(documentoDaChave(montarChave({ mod: '57' }))).toBe('CT-e');
    expect(documentoDaChave(montarChave({ mod: '67' }))).toBe('CT-e');
    expect(documentoDaChave('xyz')).toBe('NF-e');
    expect(ehChaveCte(montarChave({ mod: '67' }))).toBe(true);
    expect(ehChaveCte(montarChave({ mod: '55' }))).toBe(false);
  });
  it('validateAccessKey aceita o modelo 57 e 67 e acusa divergência com o modelo do XML', () => {
    const c57 = montarChave({ mod: '57' });
    expect(validateAccessKey(c57, { cnpjEmitente: CNPJ_TRANSPORTADORA, modelo: '57', serie: '1', numero: '123' }).valido).toBe(true);
    const c67 = montarChave({ mod: '67' });
    expect(validateAccessKey(c67, { modelo: '67' }).valido).toBe(true);
    const errado = validateAccessKey(c57, { modelo: '55' });
    expect(errado.valido).toBe(false);
    expect(errado.codigo).toBe('DOC_CHAVE_DIVERGENTE_XML');
  });
});
