/**
 * Tratamento padrão dos CFOPs para o cálculo: quais operações GERAM RECEITA.
 * Lista-padrão (Ajuste SINIEF 07/2001) — qualquer exceção o usuário ajusta na tela, por empresa.
 * Só saídas (5xxx/6xxx/7xxx) entram nesta regra; entradas (compras) seguem pelo crédito.
 */

export type Tratamento = 'RECEITA' | 'NAO_RECEITA' | 'DEVOLUCAO_VENDA' | 'COMPRA' | 'NAO_CLASSIFICADO';

export const TRATAMENTOS_VALIDOS: Tratamento[] = ['RECEITA', 'NAO_RECEITA', 'DEVOLUCAO_VENDA', 'COMPRA'];

export type RegraCfop = { cfop: string; tratamento: Tratamento; categoria: string; descricao: string };

type Base = { sufixo: string; tratamento: Tratamento; categoria: string; descricao: string };

// Sufixos iguais para operações dentro do estado (5xxx) e fora dele (6xxx).
const SAIDAS: Base[] = [
  // ── Vendas (geram receita)
  { sufixo: '101', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de produção do estabelecimento' },
  { sufixo: '102', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria adquirida ou recebida de terceiros' },
  { sufixo: '103', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de produção do estabelecimento, efetuada fora do estabelecimento' },
  { sufixo: '104', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria adquirida de terceiros, efetuada fora do estabelecimento' },
  { sufixo: '105', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de produção com substituição tributária' },
  { sufixo: '106', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria de terceiros com substituição tributária' },
  { sufixo: '107', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de produção, contribuinte substituído' },
  { sufixo: '108', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria de terceiros, contribuinte substituído' },
  { sufixo: '109', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de produção destinada à Zona Franca de Manaus / Áreas de Livre Comércio' },
  { sufixo: '110', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria de terceiros destinada à Zona Franca de Manaus / Áreas de Livre Comércio' },
  { sufixo: '111', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de produção remetida anteriormente em consignação industrial' },
  { sufixo: '112', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria de terceiros remetida anteriormente em consignação industrial' },
  { sufixo: '113', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de produção remetida anteriormente em consignação mercantil' },
  { sufixo: '114', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria de terceiros remetida anteriormente em consignação mercantil' },
  { sufixo: '115', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria de terceiros remetida anteriormente em depósito fechado ou armazém geral' },
  { sufixo: '118', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de produção entregue ao destinatário por conta e ordem do adquirente originário' },
  { sufixo: '119', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria de terceiros entregue ao destinatário por conta e ordem do adquirente originário' },
  { sufixo: '120', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria de terceiros entregue ao destinatário pelo vendedor remetente, em venda à ordem' },
  { sufixo: '122', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de produção com industrialização por encomenda' },
  { sufixo: '123', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria de terceiros remetida para industrialização por encomenda' },
  { sufixo: '124', tratamento: 'RECEITA', categoria: 'Prestação de serviço', descricao: 'Industrialização efetuada para outra empresa' },
  { sufixo: '125', tratamento: 'RECEITA', categoria: 'Prestação de serviço', descricao: 'Industrialização efetuada para outra empresa (matéria-prima remetida)' },
  { sufixo: '401', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de produção com substituição tributária (contribuinte substituto)' },
  { sufixo: '402', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de produção com substituição tributária, destinada a outra UF' },
  { sufixo: '403', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria de terceiros com substituição tributária (contribuinte substituto)' },
  { sufixo: '405', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de mercadoria de terceiros com substituição tributária (contribuinte substituído)' },
  { sufixo: '501', tratamento: 'RECEITA', categoria: 'Exportação', descricao: 'Remessa de produção com fim específico de exportação' },
  { sufixo: '502', tratamento: 'RECEITA', categoria: 'Exportação', descricao: 'Remessa de mercadoria de terceiros com fim específico de exportação' },
  { sufixo: '551', tratamento: 'RECEITA', categoria: 'Ativo imobilizado', descricao: 'Venda de bem do ativo imobilizado' },
  { sufixo: '651', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de combustível ou lubrificante de produção' },
  { sufixo: '652', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de combustível ou lubrificante de terceiros' },
  { sufixo: '653', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de combustível ou lubrificante a consumidor final' },
  { sufixo: '655', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de combustível ou lubrificante de produção com ST' },
  { sufixo: '656', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de combustível ou lubrificante de terceiros com ST' },
  { sufixo: '667', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Venda de combustível a consumidor final com ST' },
  { sufixo: '922', tratamento: 'RECEITA', categoria: 'Venda', descricao: 'Simples faturamento de venda para entrega futura' },
  { sufixo: '301', tratamento: 'RECEITA', categoria: 'Prestação de serviço', descricao: 'Prestação de serviço de comunicação' },
  { sufixo: '351', tratamento: 'RECEITA', categoria: 'Prestação de serviço', descricao: 'Prestação de serviço de transporte de carga' },
  { sufixo: '352', tratamento: 'RECEITA', categoria: 'Prestação de serviço', descricao: 'Prestação de serviço de transporte a estabelecimento industrial' },
  { sufixo: '353', tratamento: 'RECEITA', categoria: 'Prestação de serviço', descricao: 'Prestação de serviço de transporte a estabelecimento comercial' },
  { sufixo: '354', tratamento: 'RECEITA', categoria: 'Prestação de serviço', descricao: 'Prestação de serviço de transporte a estabelecimento de prestador de serviço de comunicação' },
  { sufixo: '355', tratamento: 'RECEITA', categoria: 'Prestação de serviço', descricao: 'Prestação de serviço de transporte a estabelecimento de geradora de energia' },
  { sufixo: '356', tratamento: 'RECEITA', categoria: 'Prestação de serviço', descricao: 'Prestação de serviço de transporte a estabelecimento de produtor rural' },
  { sufixo: '357', tratamento: 'RECEITA', categoria: 'Prestação de serviço', descricao: 'Prestação de serviço de transporte a não contribuinte' },
  { sufixo: '932', tratamento: 'RECEITA', categoria: 'Prestação de serviço', descricao: 'Prestação de serviço de transporte iniciada em outra UF' },
  { sufixo: '933', tratamento: 'RECEITA', categoria: 'Prestação de serviço', descricao: 'Prestação de serviço tributado pelo ISSQN' },

  // ── Não geram receita
  { sufixo: '116', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa de venda para entrega futura (a receita é do simples faturamento 5.922)' },
  { sufixo: '117', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa de mercadoria de terceiros para entrega futura' },
  { sufixo: '151', tratamento: 'NAO_RECEITA', categoria: 'Transferência', descricao: 'Transferência de produção do estabelecimento' },
  { sufixo: '152', tratamento: 'NAO_RECEITA', categoria: 'Transferência', descricao: 'Transferência de mercadoria adquirida ou recebida de terceiros' },
  { sufixo: '153', tratamento: 'NAO_RECEITA', categoria: 'Transferência', descricao: 'Transferência de energia elétrica' },
  { sufixo: '155', tratamento: 'NAO_RECEITA', categoria: 'Transferência', descricao: 'Transferência de produção do estabelecimento, forma de ativo imobilizado' },
  { sufixo: '156', tratamento: 'NAO_RECEITA', categoria: 'Transferência', descricao: 'Transferência de mercadoria de terceiros, forma de ativo imobilizado' },
  { sufixo: '201', tratamento: 'NAO_RECEITA', categoria: 'Devolução de compra', descricao: 'Devolução de compra para industrialização ou produção rural' },
  { sufixo: '202', tratamento: 'NAO_RECEITA', categoria: 'Devolução de compra', descricao: 'Devolução de compra para comercialização' },
  { sufixo: '205', tratamento: 'NAO_RECEITA', categoria: 'Devolução de compra', descricao: 'Anulação de valor relativo a aquisição de serviço de comunicação' },
  { sufixo: '206', tratamento: 'NAO_RECEITA', categoria: 'Devolução de compra', descricao: 'Anulação de valor relativo a aquisição de serviço de transporte' },
  { sufixo: '207', tratamento: 'NAO_RECEITA', categoria: 'Devolução de compra', descricao: 'Anulação de valor relativo à compra de energia elétrica' },
  { sufixo: '208', tratamento: 'NAO_RECEITA', categoria: 'Devolução de compra', descricao: 'Devolução de produção do estabelecimento' },
  { sufixo: '209', tratamento: 'NAO_RECEITA', categoria: 'Devolução de compra', descricao: 'Devolução de mercadoria adquirida com substituição tributária' },
  { sufixo: '210', tratamento: 'NAO_RECEITA', categoria: 'Devolução de compra', descricao: 'Devolução de compra para utilização na prestação de serviço' },
  { sufixo: '552', tratamento: 'NAO_RECEITA', categoria: 'Ativo imobilizado', descricao: 'Transferência de bem do ativo imobilizado' },
  { sufixo: '553', tratamento: 'NAO_RECEITA', categoria: 'Ativo imobilizado', descricao: 'Devolução de compra de bem do ativo imobilizado' },
  { sufixo: '554', tratamento: 'NAO_RECEITA', categoria: 'Ativo imobilizado', descricao: 'Remessa de bem do ativo imobilizado para uso fora do estabelecimento' },
  { sufixo: '555', tratamento: 'NAO_RECEITA', categoria: 'Ativo imobilizado', descricao: 'Devolução de bem do ativo imobilizado recebido de terceiros' },
  { sufixo: '556', tratamento: 'NAO_RECEITA', categoria: 'Devolução de compra', descricao: 'Devolução de compra de material de uso ou consumo' },
  { sufixo: '557', tratamento: 'NAO_RECEITA', categoria: 'Transferência', descricao: 'Transferência de material de uso ou consumo' },
  { sufixo: '901', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa para industrialização por encomenda' },
  { sufixo: '902', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Retorno de mercadoria utilizada na industrialização por encomenda' },
  { sufixo: '903', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Devolução de mercadoria recebida para industrialização por encomenda' },
  { sufixo: '904', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa para venda fora do estabelecimento' },
  { sufixo: '905', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa para depósito fechado ou armazém geral' },
  { sufixo: '906', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Retorno de mercadoria depositada em depósito fechado ou armazém geral' },
  { sufixo: '907', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Retorno simbólico de mercadoria depositada em armazém geral' },
  { sufixo: '908', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa de bem por conta de contrato de comodato' },
  { sufixo: '909', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Retorno de bem recebido por contrato de comodato' },
  { sufixo: '910', tratamento: 'NAO_RECEITA', categoria: 'Bonificação/amostra/brinde', descricao: 'Remessa em bonificação, doação ou brinde' },
  { sufixo: '911', tratamento: 'NAO_RECEITA', categoria: 'Bonificação/amostra/brinde', descricao: 'Remessa de amostra grátis' },
  { sufixo: '912', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa de mercadoria ou bem para demonstração' },
  { sufixo: '913', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Retorno de mercadoria ou bem recebido para demonstração' },
  { sufixo: '914', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa de mercadoria ou bem para exposição ou feira' },
  { sufixo: '915', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa de mercadoria ou bem para conserto ou reparo' },
  { sufixo: '916', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Retorno de mercadoria ou bem recebido para conserto ou reparo' },
  { sufixo: '917', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa de mercadoria em consignação mercantil ou industrial' },
  { sufixo: '918', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Devolução de mercadoria recebida em consignação mercantil ou industrial' },
  { sufixo: '919', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Devolução simbólica de mercadoria vendida em consignação' },
  { sufixo: '920', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa de vasilhame ou sacaria' },
  { sufixo: '921', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Devolução de vasilhame ou sacaria' },
  { sufixo: '923', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa de mercadoria por conta e ordem de terceiros' },
  { sufixo: '924', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Remessa para industrialização por conta e ordem do adquirente' },
  { sufixo: '925', tratamento: 'NAO_RECEITA', categoria: 'Remessa/retorno (não é venda)', descricao: 'Retorno de mercadoria industrializada por conta e ordem do adquirente' },
  { sufixo: '927', tratamento: 'NAO_RECEITA', categoria: 'Outras saídas', descricao: 'Lançamento a título de baixa de estoque decorrente de perda, roubo ou deterioração' },
  { sufixo: '949', tratamento: 'NAO_RECEITA', categoria: 'Outras saídas', descricao: 'Outra saída de mercadoria ou prestação de serviço não especificada' },
];

const EXPORTACAO: Base[] = [
  { sufixo: '101', tratamento: 'RECEITA', categoria: 'Exportação', descricao: 'Venda de produção do estabelecimento ao exterior' },
  { sufixo: '102', tratamento: 'RECEITA', categoria: 'Exportação', descricao: 'Venda de mercadoria adquirida ou recebida de terceiros ao exterior' },
  { sufixo: '105', tratamento: 'RECEITA', categoria: 'Exportação', descricao: 'Venda de produção ao exterior, sem produção de efeitos de saída' },
  { sufixo: '106', tratamento: 'RECEITA', categoria: 'Exportação', descricao: 'Venda de mercadoria de terceiros ao exterior, sem produção de efeitos de saída' },
  { sufixo: '127', tratamento: 'RECEITA', categoria: 'Exportação', descricao: 'Venda de produção do estabelecimento sob regime de drawback' },
  { sufixo: '501', tratamento: 'RECEITA', categoria: 'Exportação', descricao: 'Exportação de mercadoria recebida com fim específico de exportação' },
  { sufixo: '949', tratamento: 'NAO_RECEITA', categoria: 'Outras saídas', descricao: 'Outra saída de mercadoria ou prestação de serviço não especificada (exterior)' },
];

// Entradas que revertem receita: devolução de venda.
const DEVOLUCAO_VENDA: Base[] = ['201', '202', '203', '204', '205', '206', '207', '410', '411'].map((s) => ({
  sufixo: s, tratamento: 'DEVOLUCAO_VENDA' as Tratamento, categoria: 'Devolução de venda (entrada)', descricao: 'Devolução de venda — reduz a receita',
}));

function gerar(): RegraCfop[] {
  const out: RegraCfop[] = [];
  for (const prefixo of ['5', '6']) for (const b of SAIDAS) out.push({ cfop: prefixo + b.sufixo, tratamento: b.tratamento, categoria: b.categoria, descricao: b.descricao });
  for (const b of EXPORTACAO) out.push({ cfop: '7' + b.sufixo, tratamento: b.tratamento, categoria: b.categoria, descricao: b.descricao });
  for (const prefixo of ['1', '2']) for (const b of DEVOLUCAO_VENDA) out.push({ cfop: prefixo + b.sufixo, tratamento: b.tratamento, categoria: b.categoria, descricao: b.descricao });
  return out;
}

export const CFOP_PADRAO: RegraCfop[] = gerar();
const PADRAO_MAP = new Map(CFOP_PADRAO.map((r) => [r.cfop, r]));

export const somenteDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(0, 4);

/** Tratamento padrão: lista-padrão; senão entradas = compra; saída não listada = não classificado. */
export function tratamentoPadrao(cfopRaw: unknown, direcao?: string | null): Tratamento {
  const cfop = somenteDigitos(cfopRaw);
  const r = PADRAO_MAP.get(cfop);
  if (r) return r.tratamento;
  if (direcao === 'Entrada' || /^[123]/.test(cfop)) return 'COMPRA';
  return 'NAO_CLASSIFICADO';
}

/** Tratamento efetivo: ajuste da empresa (se houver) → padrão. */
export function tratamentoEfetivo(cfopRaw: unknown, direcao: string | null | undefined, ajustesEmpresa?: Record<string, string> | null): Tratamento {
  const cfop = somenteDigitos(cfopRaw);
  const ajuste = ajustesEmpresa?.[cfop];
  if (ajuste && (TRATAMENTOS_VALIDOS as string[]).includes(ajuste)) return ajuste as Tratamento;
  return tratamentoPadrao(cfop, direcao);
}

export const descricaoCfop = (cfop: string) => PADRAO_MAP.get(somenteDigitos(cfop))?.descricao ?? null;
