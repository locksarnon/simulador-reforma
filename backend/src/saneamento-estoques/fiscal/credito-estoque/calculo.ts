/**
 * Crédito presumido de CBS sobre o estoque de abertura (transição): avaliação por item e cálculo.
 * Módulo puro (sem banco, sem I/O). Cada regra cita o dispositivo; o que a norma não resolve sai como
 * NAO_CONFIRMADO e NÃO entra no total.
 *
 * Normas: LC 214/2025, arts. 57, 381, 382, 383; Decreto 12.955/2026, arts. 605 a 613 (ver dispositivos.ts).
 */
import {
  ANOS_EXTINCAO, DATA_INVENTARIO, DISP, LEIS_MONOFASICO_ST, NUMERO_PARCELAS, PERCENTUAL_NACIONAL, ULTIMO_MES_APROPRIACAO,
} from './dispositivos';
import type {
  AvaliacaoItem, Destinacao, Hipotese, ItemCalculado, ItemEstoque, Parcela, Premissas, ResultadoCredito,
} from './tipos';

const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;

const naoElegivel = (motivo: string, dispositivo: string): AvaliacaoItem => ({ elegivel: false, situacao: 'NAO_ELEGIVEL', motivo, dispositivo });
const pendente = (faltando: string[], dispositivo: string, motivo?: string): AvaliacaoItem => ({
  elegivel: false, situacao: 'PENDENTE', faltando, dispositivo, motivo: motivo ?? `Dados faltantes: ${faltando.join('; ')}`,
});
const naoConfirmado = (motivo: string, dispositivo: string): AvaliacaoItem => ({
  elegivel: false, situacao: 'NAO_CONFIRMADO', motivo: `Não confirmado: ${motivo}`, dispositivo,
});

/**
 * Destinação deduzida do registro 0200 (TIPO_ITEM), só onde não há dúvida.
 * 05 (subproduto), 06 (produto intermediário) e 10 (outros insumos) ficam de fora de propósito: ver `TIPOS_NAO_CONFIRMADOS`.
 */
export function destinacaoPorTipoItem(tipoItem: string | null | undefined): Destinacao | null {
  switch ((tipoItem ?? '').trim()) {
    case '00': return 'REVENDA';
    case '01': case '02': case '03': case '04': return 'PRODUCAO_PARA_VENDA';
    case '07': return 'USO_CONSUMO';
    case '08': return 'ATIVO_IMOBILIZADO';
    default: return null;
  }
}

/**
 * O Decreto 12.955, art. 606, § 1º, lista o estoque de abertura como "mercadorias, produtos acabados, produtos em processo,
 * matérias-primas e materiais de embalagem". Subproduto (05), produto intermediário (06) e outros insumos (10) não estão
 * na lista, embora a LC 214, art. 381, § 1º, I, fale em bens "para utilização na produção". Inclusão não confirmada.
 */
export const TIPOS_NAO_CONFIRMADOS: Record<string, string> = {
  '05': 'subproduto',
  '06': 'produto intermediário',
  '10': 'outros insumos',
};

const ehAcabadoOuEmProcesso = (it: ItemEstoque) => ['03', '04'].includes((it.tipoItem ?? '').trim());

/** Valida as premissas comuns a todos os itens. Retorna avaliação de bloqueio ou null se ok. */
function avaliarPremissas(p: Premissas): AvaliacaoItem | null {
  const faltando: string[] = [];
  if (p.regimeRegularCbs2027 === false) {
    return naoElegivel('O contribuinte não estará no regime regular da CBS em 2027', DISP.caput);
  }
  if (p.regimeRegularCbs2027 == null) faltando.push('premissa: regime regular da CBS em 2027');
  if (p.regimePisCofins31122026 == null) faltando.push('premissa: regime de PIS/Cofins em 31/12/2026');
  if (!p.dataInventario) faltando.push('premissa: data do inventário');
  if (faltando.length) return pendente(faltando, DISP.caput);
  if (p.dataInventario !== DATA_INVENTARIO) {
    return pendente(['inventário levantado em 31/12/2026'], DISP.dataInventario,
      `Inventário informado em ${p.dataInventario}; o estoque de abertura deve ser inventariado exclusivamente em 31/12/2026`);
  }
  if (p.regimePisCofins31122026 === 'SIMPLES_NACIONAL') {
    return naoConfirmado(
      'optante pelo Simples Nacional em 31/12/2026: a hipótese I cita o regime cumulativo "estabelecido precipuamente pela Lei 9.718/1998"; '
      + 'a norma não diz se o Simples Nacional se enquadra', DISP.hipoteseCumulativo);
  }
  return null;
}

/** Avalia se um item dá direito ao crédito presumido e por qual hipótese. Não calcula valor. */
export function avaliarItem(item: ItemEstoque, premissas: Premissas): AvaliacaoItem {
  const bloqueio = avaliarPremissas(premissas);
  if (bloqueio) return bloqueio;

  const tipo = (item.tipoItem ?? '').trim();
  const destinacao = item.destinacao ?? destinacaoPorTipoItem(tipo);

  // ── Exclusões definitivas (valem mesmo com outros dados faltando) ──
  if (tipo === '09') return naoElegivel('Serviço não é bem material em estoque', DISP.caput);
  if (item.imovel === true) return naoElegivel('Imóvel', DISP.imovel);
  if (item.ativoContratoConcessionaria === true) {
    return naoElegivel('Ativo de contrato, intangível ou financeiro de concessionária equipara-se ao imobilizado', DISP.ativoConcessionaria);
  }
  if (destinacao === 'ATIVO_IMOBILIZADO') return naoElegivel('Bem incorporado ao ativo imobilizado', DISP.imobilizado);
  if (item.usoConsumoPessoal === true) return naoElegivel('Bem de uso e consumo pessoal (LC 214, art. 57)', DISP.usoConsumoPessoal);
  if (item.indicadorPropriedade === '2') return naoElegivel('Bem de terceiros em poder do contribuinte não compõe o estoque de abertura', DISP.composicaoEstoque);
  if (item.novo === false) return naoElegivel('Bem usado: o crédito alcança somente bens novos', DISP.bensNovosDestinacao);
  if (item.origem === 'NACIONAL' && item.adquiridoDePessoaJuridica === false) {
    return naoElegivel('Bem nacional adquirido de pessoa física: exige-se aquisição de pessoa jurídica domiciliada no País', DISP.bensNovosDestinacao);
  }
  if (destinacao === 'USO_CONSUMO' || destinacao === 'OUTRA') {
    return naoElegivel('Destinação diferente de revenda, produção de bens para venda ou prestação de serviços a terceiros', DISP.bensNovosDestinacao);
  }
  if (item.documentacaoIdonea === false) return naoElegivel('Item sem documentação fiscal idônea', DISP.documentacaoIdonea);
  const trat = item.tratamentoAquisicao;
  if (trat === 'ISENCAO' || trat === 'SUSPENSAO' || trat === 'NAO_INCIDENCIA' || (trat === 'ALIQUOTA_ZERO' && !item.monofasicoSt)) {
    const nome = { ISENCAO: 'isenção', SUSPENSAO: 'suspensão', NAO_INCIDENCIA: 'não incidência', ALIQUOTA_ZERO: 'alíquota zero' }[trat];
    return naoElegivel(`Aquisição contemplada por ${nome} de PIS/Cofins`, DISP.aliquotaZeroIsencao);
  }

  const regime = premissas.regimePisCofins31122026!;
  if (regime === 'CUMULATIVO' && item.houveCreditoPisCofins === true && !item.monofasicoSt) {
    return naoElegivel('Houve apuração de crédito de PIS/Cofins na aquisição: a hipótese I exige bem sem crédito', DISP.hipoteseCumulativo);
  }
  if (regime === 'NAO_CUMULATIVO' && !item.monofasicoSt) {
    return naoElegivel('No regime não cumulativo o item só entra pelas hipóteses II (monofásico/ST listado) ou III (vedação parcial); nenhuma se aplica',
      `${DISP.hipoteseMonofasicoSt}; ${DISP.hipoteseVedacaoParcial}`);
  }

  // ── Dados obrigatórios ──
  const faltando: string[] = [];
  if (!destinacao) faltando.push(tipo in TIPOS_NAO_CONFIRMADOS ? '' : 'destinação (ou tipo do item 0200)');
  if (item.indicadorPropriedade == null) faltando.push('propriedade do item (H010 IND_PROP)');
  if (item.novo == null) faltando.push('bem novo (sim/não)');
  if (item.origem == null) faltando.push('origem (nacional/importado)');
  if (item.origem === 'NACIONAL' && item.adquiridoDePessoaJuridica == null) faltando.push('fornecedor pessoa jurídica no País (sim/não)');
  if (trat == null) faltando.push('tratamento de PIS/Cofins na aquisição');
  if (item.documentacaoIdonea == null) faltando.push('documentação fiscal idônea (sim/não)');

  const hipotese: Hipotese = item.monofasicoSt ? 'MONOFASICO_ST' : regime === 'CUMULATIVO' ? 'CUMULATIVO' : 'VEDACAO_PARCIAL';
  const pctVedacao = item.percentualVedacaoParcial ?? premissas.percentualVedacaoParcial ?? null;
  if (hipotese === 'VEDACAO_PARCIAL' && pctVedacao == null) faltando.push('percentual do valor sem crédito pela vedação parcial');
  if (pctVedacao != null && (pctVedacao < 0 || pctVedacao > 1)) faltando.push('percentual de vedação parcial válido (0 a 1)');

  if (item.origem === 'IMPORTADO') {
    if (item.pisImportacaoPago == null) faltando.push('PIS-Importação efetivamente pago');
    if (item.cofinsImportacaoPaga == null) faltando.push('Cofins-Importação efetivamente paga');
    if (item.adicionalCofinsImportacao == null) faltando.push('adicional da Cofins-Importação (informar 0 se não houve)');
  } else if (item.origem === 'NACIONAL') {
    if (ehAcabadoOuEmProcesso(item)) {
      if (item.custoMateriasPrimasEmbalagens == null) faltando.push('custo de aquisição das matérias-primas e embalagens do produto acabado/em processo');
    } else if (item.valorCustoAquisicao == null) faltando.push('valor pelo custo de aquisição (critérios do IRPJ)');
  }
  const faltas = faltando.filter(Boolean);
  if (faltas.length) {
    const disp = item.origem === 'IMPORTADO' ? DISP.importados : ehAcabadoOuEmProcesso(item) ? DISP.acabadosEmProcesso : DISP.custoAquisicaoIrpj;
    return pendente(faltas, faltas.some((f) => f.startsWith('valor') || f.startsWith('custo') || f.includes('Importação')) ? disp : DISP.bensNovosDestinacao);
  }

  // ── Pontos que a norma não resolve: não entram no total ──
  if (tipo in TIPOS_NAO_CONFIRMADOS) {
    return naoConfirmado(`${TIPOS_NAO_CONFIRMADOS[tipo]} (0200 tipo ${tipo}) não consta da lista do estoque de abertura do Decreto `
      + '(mercadorias, acabados, em processo, matérias-primas e embalagens), embora a LC fale em bens para utilização na produção',
      `${DISP.composicaoEstoque}; ${DISP.bensNovosDestinacao}`);
  }
  if (trat === 'ALIQUOTA_ZERO' && item.monofasicoSt) {
    return naoConfirmado('item de monofásico/ST (hipótese II) adquirido com alíquota zero na cadeia: a hipótese II o inclui, '
      + 'mas o § 1º, II, exclui aquisições com alíquota zero; a norma não resolve o conflito', `${DISP.hipoteseMonofasicoSt}; ${DISP.aliquotaZeroIsencao}`);
  }
  if (item.monofasicoSt && item.houveCreditoPisCofins === true) {
    return naoConfirmado('item de monofásico/ST com crédito de PIS/Cofins já apurado na aquisição: a hipótese II não trata do crédito já tomado',
      DISP.hipoteseMonofasicoSt);
  }
  if (hipotese === 'VEDACAO_PARCIAL' && item.origem === 'IMPORTADO') {
    return naoConfirmado('importado na hipótese III (vedação parcial): a norma não diz como aplicar a parcela vedada ao PIS/Cofins-Importação pago',
      `${DISP.hipoteseVedacaoParcial}; ${DISP.importados}`);
  }

  const dispHip = { CUMULATIVO: DISP.hipoteseCumulativo, MONOFASICO_ST: DISP.hipoteseMonofasicoSt, VEDACAO_PARCIAL: DISP.hipoteseVedacaoParcial }[hipotese];
  const motivo = {
    CUMULATIVO: 'Regime cumulativo em 31/12/2026, bem sem crédito de PIS/Cofins na aquisição',
    MONOFASICO_ST: `Bem sujeito na aquisição a monofásico/ST: ${item.monofasicoSt ? LEIS_MONOFASICO_ST[item.monofasicoSt] : ''}`,
    VEDACAO_PARCIAL: 'Parcela do valor sujeita à vedação parcial de crédito (Leis 10.637 e 10.833, art. 3º, §§ 7º a 9º)',
  }[hipotese];
  return { elegivel: true, situacao: 'ELEGIVEL', hipotese, motivo, dispositivo: `${dispHip}; ${DISP.bensNovosDestinacao}` };
}

/** Valor do crédito de um item já avaliado como elegível (centavos). */
function creditoDoItem(item: ItemEstoque, hipotese: Hipotese, premissas: Premissas): ItemCalculado {
  if (item.origem === 'IMPORTADO') {
    const pago = centavos(item.pisImportacaoPago!) + centavos(item.cofinsImportacaoPaga!);
    const credito = Math.max(0, pago - centavos(item.adicionalCofinsImportacao!));
    return {
      id: item.id, hipotese, origem: 'IMPORTADO', base: reais(pago), credito: reais(credito), dispositivo: DISP.importados,
      memoria: `PIS-Imp ${item.pisImportacaoPago} + Cofins-Imp ${item.cofinsImportacaoPaga} − adicional ${item.adicionalCofinsImportacao}`,
    };
  }
  const valor = ehAcabadoOuEmProcesso(item) ? item.custoMateriasPrimasEmbalagens! : item.valorCustoAquisicao!;
  const pct = hipotese === 'VEDACAO_PARCIAL' ? (item.percentualVedacaoParcial ?? premissas.percentualVedacaoParcial!) : 1;
  const base = Math.round(centavos(valor) * pct);
  const credito = Math.round(base * PERCENTUAL_NACIONAL);
  const dispBase = ehAcabadoOuEmProcesso(item) ? DISP.acabadosEmProcesso : DISP.custoAquisicaoIrpj;
  return {
    id: item.id, hipotese, origem: 'NACIONAL', base: reais(base), credito: reais(credito),
    dispositivo: `${DISP.percentualNacional}; ${dispBase}`,
    memoria: `${pct !== 1 ? `${valor} × ${pct} (parcela vedada) = ${reais(base)}; ` : ''}${reais(base)} × 9,25% = ${reais(credito)}`,
  };
}

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
function ultimoDia(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** Calcula o crédito do estoque de abertura. Só itens ELEGIVEL entram no total. */
export function calcularCredito(itens: ItemEstoque[], premissas: Premissas): ResultadoCredito {
  const porItem: ItemCalculado[] = [];
  const naoElegiveis: ResultadoCredito['naoElegiveis'] = [];
  const pendencias: ResultadoCredito['pendencias'] = [];
  const premissasNaoConfirmadas: ResultadoCredito['premissasNaoConfirmadas'] = [];

  const bloqueio = avaliarPremissas(premissas);
  if (bloqueio) {
    if (bloqueio.situacao === 'PENDENTE') pendencias.push({ id: null, faltando: bloqueio.faltando ?? [], motivo: bloqueio.motivo, dispositivo: bloqueio.dispositivo });
    else if (bloqueio.situacao === 'NAO_CONFIRMADO') premissasNaoConfirmadas.push({ id: null, tema: 'regime', motivo: bloqueio.motivo, dispositivo: bloqueio.dispositivo });
    else naoElegiveis.push(...itens.map((i) => ({ id: i.id, motivo: bloqueio.motivo, dispositivo: bloqueio.dispositivo })));
  } else {
    for (const item of itens) {
      const av = avaliarItem(item, premissas);
      if (av.situacao === 'ELEGIVEL') porItem.push(creditoDoItem(item, av.hipotese!, premissas));
      else if (av.situacao === 'NAO_ELEGIVEL') naoElegiveis.push({ id: item.id, motivo: av.motivo, dispositivo: av.dispositivo });
      else if (av.situacao === 'PENDENTE') pendencias.push({ id: item.id, faltando: av.faltando ?? [], motivo: av.motivo, dispositivo: av.dispositivo });
      else premissasNaoConfirmadas.push({ id: item.id, tema: 'item', motivo: av.motivo, dispositivo: av.dispositivo });
    }
  }

  const soma = (f: (i: ItemCalculado) => boolean) => porItem.filter(f).reduce((s, i) => s + centavos(i.credito), 0);
  const totalC = soma(() => true);

  // ── Cronograma de utilização ──
  let utilizacao: ResultadoCredito['utilizacao'] = null;
  const mes = premissas.mesApropriacao;
  if (mes) {
    if (!MES.test(mes) || mes < '2027-01') {
      pendencias.push({ id: null, faltando: ['mês de apropriação válido (2027-01 a 2027-06)'], motivo: `Mês de apropriação inválido: ${mes}`, dispositivo: DISP.prazoApropriacao });
    } else if (mes > ULTIMO_MES_APROPRIACAO) {
      pendencias.push({ id: null, faltando: ['apropriação até junho de 2027'], motivo: `Apropriação em ${mes} fica fora do prazo (último dia de junho de 2027)`, dispositivo: DISP.prazoApropriacao });
    } else if (totalC > 0) {
      const base = Math.floor(totalC / NUMERO_PARCELAS);
      const resto = totalC - base * NUMERO_PARCELAS;
      const parcelas: Parcela[] = Array.from({ length: NUMERO_PARCELAS }, (_, k) => ({
        numero: k + 1, mes: somarMeses(mes, k + 1), valor: reais(base + (k === NUMERO_PARCELAS - 1 ? resto : 0)),
      }));
      if (resto > 0) {
        premissasNaoConfirmadas.push({
          id: null, tema: 'arredondamento',
          motivo: `Não confirmado: a norma exige parcelas iguais e não trata do resíduo de centavos; ${reais(resto).toFixed(2)} lançado na 12ª parcela`,
          dispositivo: DISP.parcelas,
        });
      }
      const [a] = mes.split('-').map(Number);
      utilizacao = {
        mesApropriacao: mes, parcelas,
        extincaoDoDireito: `${a + ANOS_EXTINCAO}${ultimoDia(mes).slice(4)}`,
        dispositivo: `${DISP.parcelas}; ${DISP.prazoExtincao}`,
      };
    }
  }

  premissasNaoConfirmadas.push({
    id: null, tema: 'escrituração',
    motivo: 'Não confirmado: a forma de apropriação e de declaração do crédito (registro/campo da apuração da CBS) depende de ato da RFB não localizado nas fontes lidas',
    dispositivo: DISP.prazoApropriacao,
  });

  return {
    total: reais(totalC),
    totalNacional: reais(soma((i) => i.origem === 'NACIONAL')),
    totalImportado: reais(soma((i) => i.origem === 'IMPORTADO')),
    porItem, naoElegiveis, pendencias, premissasNaoConfirmadas, utilizacao,
    observacoes: [
      { texto: 'Usar só para compensar a CBS; vedada a compensação com outros tributos e o ressarcimento', dispositivo: DISP.somenteCbs },
      { texto: 'Na compensação, tem preferência sobre os créditos de CBS do art. 53 da LC 214', dispositivo: DISP.preferenciaCompensacao },
      { texto: 'Devoluções, a partir de 1º/01/2027, de bens do estoque de abertura exigem estorno do crédito (não calculado aqui)', dispositivo: DISP.estornoDevolucoes },
      { texto: 'Registrar o estoque de abertura no Livro de Inventário com quantidade, valor unitário, classificação fiscal e descrição', dispositivo: DISP.livroInventario },
      { texto: 'Inventário segregando bens do mercado interno e importados', dispositivo: DISP.segregacaoOrigem },
      { texto: 'Guardar a documentação por no mínimo 5 anos da data do inventário', dispositivo: DISP.guardaDocumentos },
    ],
  };
}
