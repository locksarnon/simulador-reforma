/** Dados sintéticos dos testes dos entregáveis (nunca dados reais de cliente). */
import type { DadosEntrega } from '../../dados/portas';

export type Linha = Record<string, unknown>;
export const VERSAO = { numero: 2, rotulo: 'Entrega 1', criadaEm: '2026-11-20T15:00:00.000Z' };
export const CAMADAS_TESTE = ['IDENTIFICACAO', 'QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE', 'NOMES_UNIDADES', 'NCM', 'TRIBUTARIO', 'OBRIGACOES'];

export const trab = (o: Linha = {}) => ({ descricao: 'ADUBO NPK 04-14-08', unidade: 'KG', ncm: '31052000', grupo: 'Adubos', ativo: true, finalidade: 'INSUMO_PRODUCAO', campos: {}, ...o });

/** Itens no formato da foto da versão (liberada). */
export function itensFoto(): Linha[] {
  return [
    { id: 'i1', codigo: '00123', estabelecimento: '', trabalho: trab({ descricao: 'ADUBO NPK 04-14-08 SC 50KG', campos: { cClassTrib: '200003', cst: '200', enquadramentoLegal: 'Insumos agropecuários: redução de 60% das alíquotas', artigo: 'LC 214/2025, Anexo IX, item 12', origem: 'HERDADO' } }), grupo: 'Adubos', finalidade: 'INSUMO_PRODUCAO', tambemUsadoComo: [], conjunto: '31052000|INSUMO_PRODUCAO', ativo: true },
    { id: 'i2', codigo: '000456', estabelecimento: '', trabalho: trab({ descricao: 'SEMENTE SOJA', ncm: '12019000', campos: {} }), grupo: 'Sementes', finalidade: 'REVENDA', tambemUsadoComo: ['MATERIA_PRIMA'], conjunto: '12019000|REVENDA', ativo: true },
    { id: 'i3', codigo: '0789', estabelecimento: '', trabalho: trab({ descricao: 'PEÇA TRATOR', ncm: '84099100', finalidade: null }), grupo: null, finalidade: null, tambemUsadoComo: [], conjunto: null, ativo: false },
  ];
}
/** Os mesmos itens no formato da tabela atual (revisão). */
export function itensTabela(): Linha[] {
  return itensFoto().map((f, k) => ({
    id: f.id, projeto_id: 'P1', codigo: f.codigo, estabelecimento: '', linha: k + 1, importacao_id: 'imp1', descricao: (f.trabalho as Linha).descricao, original: { descricao: k === 0 ? 'ADUBO NPK 04148 SC50' : (f.trabalho as Linha).descricao },
    trabalho: f.trabalho, grupo: f.grupo, finalidade: f.finalidade, tambem_usado_como: f.tambemUsadoComo, conjunto_chave: f.conjunto, ativo: f.ativo, versao: 1,
  }));
}
export const cel = (item_id: string, camada: string, situacao: string, extra: Linha = {}) => ({ item_id, camada, situacao, revisar: false, caso_id: null, ...extra });

export function dadosBase(liberada: boolean, formato: 'foto' | 'tabela' = liberada ? 'foto' : 'tabela'): DadosEntrega {
  const celulas: Linha[] = [];
  for (const c of CAMADAS_TESTE) {
    celulas.push(cel('i1', c, c === 'QUALIDADE' ? 'SEM_PROBLEMA' : 'APROVADO', c === 'TRIBUTARIO' ? { caso_id: 'c-trib' } : {}));
    celulas.push(cel('i2', c, c === 'TRIBUTARIO' ? 'PROPOSTO' : c === 'NCM' ? 'AGUARDANDO_INFORMACAO' : 'SEM_PROBLEMA', c === 'TRIBUTARIO' ? { caso_id: 'c-trib2', revisar: true } : {}));
    celulas.push(cel('i3', c, 'PENDENTE'));
  }
  const d = (s: string) => new Date(s);
  const casos: Linha[] = [
    { id: 'c-desc', projeto_id: 'P1', camada: 'NOMES_UNIDADES', tipo: 'DESCRICAO_FORA_DO_PADRAO', itens: ['i1'], problema: 'Descrição fora do padrão', evidencia: [], atual: { descricao: 'ADUBO NPK 04148 SC50' }, proposta: { descricao: 'ADUBO NPK 04-14-08 SC 50KG' }, justificativa: 'Padrão de nomes', fundamento: 'Política de nomes', situacao: 'APROVADO', responsavel: 'ana', decidido_por: 'ana@fal.test', decidido_em: d('2026-11-10T12:00:00Z'), createdAt: d('2026-11-09T12:00:00Z') },
    { id: 'c-trib', projeto_id: 'P1', camada: 'TRIBUTARIO', tipo: 'ENQUADRAMENTO_CONJUNTO', itens: ['i1'], problema: 'Enquadrar conjunto', evidencia: [{ rotulo: 'Compra para revenda', valor: 'EM_REGRA: Crédito amplo na aquisição' }, { rotulo: 'Devolução', valor: 'EM_REGRA: Devolução de compra: estorna o crédito' }], atual: {}, proposta: { cClassTrib: '200003', cst: '200', origem: 'HERDADO' }, justificativa: 'Enquadramento pela SVRS', fundamento: 'LC 214/2025, Anexo IX', situacao: 'APROVADO', responsavel: 'ana', decidido_por: 'ana@fal.test', decidido_em: d('2026-11-12T12:00:00Z'), createdAt: d('2026-11-09T12:00:00Z') },
    { id: 'c-trib2', projeto_id: 'P1', camada: 'TRIBUTARIO', tipo: 'ENQUADRAMENTO_CONJUNTO', itens: ['i2'], problema: 'Enquadrar sementes', evidencia: [{ rotulo: 'Venda', valor: 'NAO_SE_APLICA: Operação de saída' }], atual: {}, proposta: { cClassTrib: '200030', cst: '200', enquadramentoLegal: 'Sementes e mudas', artigo: 'LC 214/2025, Anexo IX', origem: 'HERDADO' }, justificativa: 'Sementes', fundamento: null, situacao: 'PROPOSTO', responsavel: null, decidido_por: null, decidido_em: null, createdAt: d('2026-11-09T13:00:00Z') },
    { id: 'c-ncm', projeto_id: 'P1', camada: 'NCM', tipo: 'NCM_INFO_INSUFICIENTE', itens: ['i2', 'i3'], problema: 'Informação técnica insuficiente', evidencia: [], atual: { ncm: '12019000' }, proposta: {}, justificativa: 'Falta ficha técnica', fundamento: null, situacao: 'AGUARDANDO_INFORMACAO', motivo: 'Pedir ficha técnica ao fabricante', responsavel: 'ana', decidido_por: null, decidido_em: null, createdAt: d('2026-11-09T14:00:00Z') },
    { id: 'c-dup', projeto_id: 'P1', camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', itens: ['i1', 'i2'], problema: 'Códigos duplicados', evidencia: [], atual: {}, proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '00123', consolidar: '000456' }, justificativa: 'Mesmo produto', fundamento: 'Critério de similaridade', situacao: 'APROVADO', responsavel: 'ana', decidido_por: 'ana@fal.test', decidido_em: d('2026-11-11T12:00:00Z'), createdAt: d('2026-11-09T12:30:00Z') },
    { id: 'c-dup2', projeto_id: 'P1', camada: 'DUPLICIDADE', tipo: 'APRESENTACOES_DISTINTAS', itens: ['i2', 'i3'], problema: 'Apresentações', evidencia: [], atual: {}, proposta: { decisao: 'RELACIONAR_APRESENTACOES', fatorConversao: 50 }, justificativa: 'Embalagens', fundamento: null, situacao: 'PROPOSTO', responsavel: null, decidido_por: null, decidido_em: null, createdAt: d('2026-11-09T12:40:00Z') },
  ];
  const decisoes: Linha[] = [
    { id: 'd1', projeto_id: 'P1', item_id: 'i1', caso_id: 'c-desc', campo: 'descricao', antes: 'ADUBO NPK 04148 SC50', depois: 'ADUBO NPK 04-14-08 SC 50KG', fundamento: 'Padrão de nomes', usuario: 'ana@fal.test', tipo: 'aprovar', quando: d('2026-11-10T12:00:00Z') },
    { id: 'd2', projeto_id: 'P1', item_id: 'i1', caso_id: 'c-trib', campo: 'cClassTrib', antes: null, depois: '200003', fundamento: 'LC 214/2025, Anexo IX', usuario: 'ana@fal.test', tipo: 'aprovar', quando: d('2026-11-12T12:00:00Z') },
  ];
  const impactosSped: Linha[] = [
    { id: 's1', projeto_id: 'P1', caso_id: 'c-desc', obrigacao: 'EFD_ICMS_IPI', competencia: '012027', versao_leiaute: null, registro: '0200', campo: 'DESCR_ITEM', valor_original: 'ADUBO NPK 04148 SC50', valor_proposto: 'ADUBO NPK 04-14-08 SC 50KG', motivo: 'Mudou descrição', evidencia: 'Caso c-desc', inicio: d('2027-01-01T00:00:00Z'), avaliar_anteriores: false, responsavel: 'ana', tipo_ajuste: 'CADASTRAL_FUTURO', createdAt: d('2026-11-13T12:00:00Z') },
    { id: 's2', projeto_id: 'P1', caso_id: 'c-trib2', obrigacao: 'NFE', competencia: null, versao_leiaute: 'NT 2025.002', registro: 'IBSCBS', campo: 'cClassTrib', valor_original: null, valor_proposto: '200030', motivo: 'Mudou tratamento', evidencia: null, inicio: null, avaliar_anteriores: true, responsavel: null, tipo_ajuste: 'ESCRITURACAO_ENTREGUE', createdAt: d('2026-11-13T12:10:00Z') },
  ];
  return {
    projeto: { id: 'P1', diagnostico_id: 'D1', empresa_id: 'E1', data_base: d('2026-12-31T00:00:00Z'), erp: 'SAP B1', erp_versao: '10', estabelecimentos: [], responsavel: 'Ana', modulos: { conciliacao: false, blocosKG: false, arquivoErp: false }, atividades_confirmadas_por: 'ana@fal.test', atividades_confirmadas_em: d('2026-11-01T12:00:00Z'), clienteNome: 'Agropecuária Teste Ltda', clienteDocumento: '00.000.000/0001-00', diagnosticoNome: 'Saneamento 2026' },
    versao: liberada ? VERSAO : null, liberada, itens: formato === 'foto' ? itensFoto() : itensTabela(), celulas, casos, decisoes, impactosSped,
    vinculos: [{ id: 'v1', projeto_id: 'P1', de: '000456', para: '00123', inicio: d('2027-01-01T00:00:00Z'), justificativa: 'Consolidação aprovada', criado_por: 'ana@fal.test', createdAt: d('2026-11-11T13:00:00Z') }],
    importacoes: [{ id: 'imp1', arquivo: 'cadastro.xlsx', usuario: 'ana@fal.test', aceitas: 3, rejeitadas: 1, pendentes: 0, createdAt: d('2026-11-05T12:00:00Z') }],
  } as DadosEntrega;
}
