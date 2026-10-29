/**
 * Importação de operações por planilha (XLSX ou CSV): campos aceitos, nomes alternativos de coluna e a explicação de
 * cada um. O modelo de planilha, a tela de mapeamento e a conversão das linhas partem daqui.
 */
export type TipoCampo = 'texto' | 'data' | 'numero' | 'pct' | 'direcao' | 'tipo' | 'simnao';

export type Campo = {
  id: string;
  rotulo: string;
  /** Título da coluna no modelo de planilha (sempre reconhecido pela sugestão automática). */
  coluna: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  /** Exemplo da linha de modelo da planilha (um frete de soja de Sorriso-MT a Paranaguá-PR). */
  exemplo: string;
  ajuda: string;
  /** Nomes de coluna reconhecidos (comparados sem acento, maiúsculas nem pontuação). */
  aliases: string[];
};

export const CAMPOS: Campo[] = [
  { id: 'empresa', rotulo: 'Empresa (ID ou CNPJ)', coluna: 'Empresa', tipo: 'texto', exemplo: 'TRANSP-01', ajuda: 'ID da empresa cadastrada no InTAX ou o CNPJ dela. Pode ficar de fora se você escolher uma empresa para todas as linhas.', aliases: ['empresa', 'id empresa', 'id_empresa', 'cnpj empresa', 'cnpj da empresa', 'filial', 'estabelecimento'] },
  { id: 'data', rotulo: 'Data da operação', coluna: 'Data', tipo: 'data', obrigatorio: true, exemplo: '15/01/2027', ajuda: 'Dia/mês/ano (15/01/2027) ou ano-mês-dia (2027-01-15). O ano da operação sai daqui.', aliases: ['data', 'data emissao', 'data de emissao', 'emissao', 'dt emissao', 'data operacao', 'data da operacao', 'dhemi', 'dh emissao', 'data documento'] },
  { id: 'direcao', rotulo: 'Entrada ou Saída', coluna: 'Entrada/Saída', tipo: 'direcao', obrigatorio: true, exemplo: 'Saída', ajuda: 'Saída = venda, receita ou prestação de serviço; Entrada = compra, custo ou despesa. Pode ficar de fora se você escolher uma direção para todas as linhas.', aliases: ['direcao', 'entrada saida', 'e s', 'es', 'movimento', 'tipo movimento', 'tipo de movimento', 'operacao'] },
  { id: 'valor_bruto', rotulo: 'Valor da operação (R$)', coluna: 'Valor', tipo: 'numero', obrigatorio: true, exemplo: '12500,00', ajuda: 'Valor total da operação, com os tributos embutidos (ICMS, ISS, PIS, Cofins). Valor negativo é devolução.', aliases: ['valor', 'valor total', 'vl total', 'valor bruto', 'valor da operacao', 'valor operacao', 'vprod', 'vtprest', 'total', 'valor documento', 'valor nf', 'valor da nota'] },
  { id: 'descricao', rotulo: 'Descrição', coluna: 'Descrição', tipo: 'texto', exemplo: 'Frete de soja Sorriso-MT para Paranaguá-PR', ajuda: 'Texto livre: produto, serviço ou histórico.', aliases: ['descricao', 'produto', 'historico', 'item', 'servico', 'descricao do produto', 'discriminacao'] },
  { id: 'tipo', rotulo: 'Mercadoria ou Serviço', coluna: 'Tipo', tipo: 'tipo', exemplo: 'Serviço', ajuda: 'Se ficar em branco: Serviço quando há NBS; senão, a escolha da tela (Mercadoria por padrão).', aliases: ['tipo', 'tipo item', 'tipo do item', 'mercadoria servico', 'mercadoria ou servico', 'natureza'] },
  { id: 'quantidade', rotulo: 'Quantidade', coluna: 'Quantidade', tipo: 'numero', exemplo: '1', ajuda: 'Para combustível, em litros (ou quilos no GLP e no óleo combustível).', aliases: ['quantidade', 'qtd', 'qtde', 'litros', 'volume'] },
  { id: 'ncm', rotulo: 'NCM', coluna: 'NCM', tipo: 'texto', exemplo: '', ajuda: 'Oito dígitos, para mercadoria.', aliases: ['ncm'] },
  { id: 'nbs', rotulo: 'NBS', coluna: 'NBS', tipo: 'texto', exemplo: '', ajuda: 'Código da Nomenclatura Brasileira de Serviços, para serviço.', aliases: ['nbs'] },
  { id: 'cfop_servico', rotulo: 'CFOP', coluna: 'CFOP', tipo: 'texto', exemplo: '6353', ajuda: 'CFOP da operação (ou o item da lista de serviços).', aliases: ['cfop', 'cfop servico'] },
  { id: 'uf_origem', rotulo: 'UF de origem', coluna: 'UF origem', tipo: 'texto', exemplo: 'MT', ajuda: 'Sigla do estado onde a operação começa.', aliases: ['uf origem', 'uf orig', 'origem', 'uf de origem', 'uf inicio', 'uf ini'] },
  { id: 'uf_destino', rotulo: 'UF de destino', coluna: 'UF destino', tipo: 'texto', exemplo: 'PR', ajuda: 'Sigla do estado do destino. No frete de carga, o local da entrega (LC 214, art. 11, VII).', aliases: ['uf destino', 'uf dest', 'destino', 'uf de destino', 'uf fim', 'uf entrega'] },
  { id: 'municipio_destino', rotulo: 'Município de destino (código IBGE)', coluna: 'Município destino', tipo: 'texto', exemplo: '4118204', ajuda: 'Código IBGE de 7 dígitos do município onde a operação termina.', aliases: ['municipio destino', 'municipio', 'ibge', 'cod municipio', 'codigo municipio', 'codigo ibge', 'cmun fim', 'municipio de destino'] },
  { id: 'documento', rotulo: 'Documento (NF-e, CT-e, NFS-e...)', coluna: 'Documento', tipo: 'texto', exemplo: 'CT-e', ajuda: 'Só informativo. Se ficar em branco, grava “Planilha”.', aliases: ['documento', 'modelo', 'tipo documento', 'tipo de documento', 'especie'] },
  { id: 'documento_chave', rotulo: 'Chave ou número do documento', coluna: 'Chave', tipo: 'texto', exemplo: '', ajuda: 'Fica na observação da operação, para rastrear.', aliases: ['chave', 'chave de acesso', 'chave nfe', 'chave cte', 'numero documento', 'numero do documento', 'numero nf', 'nf', 'nct'] },
  { id: 'regime_atual', rotulo: 'Regime da empresa', coluna: 'Regime', tipo: 'texto', exemplo: '', ajuda: 'Lucro Real, Lucro Presumido, Simples Nacional ou Produtor rural PF. Em branco: o regime cadastrado na empresa.', aliases: ['regime', 'regime atual', 'regime tributario'] },
  { id: 'pis_pct', rotulo: 'PIS (%)', coluna: 'PIS %', tipo: 'pct', exemplo: '0,65', ajuda: 'Em pontos percentuais (1,65 = 1,65%). Em branco, nas vendas: a tabela da legislação, pelo regime da empresa, se a opção estiver ligada (compra fica sem PIS).', aliases: ['pis', 'pis pct', 'aliquota pis', 'p pis', 'ppis'] },
  { id: 'cofins_pct', rotulo: 'Cofins (%)', coluna: 'Cofins %', tipo: 'pct', exemplo: '3,00', ajuda: 'Em pontos percentuais (7,6 = 7,6%). Em branco, nas vendas: a tabela da legislação, pelo regime da empresa, se a opção estiver ligada (compra fica sem Cofins).', aliases: ['cofins', 'cofins pct', 'aliquota cofins', 'p cofins', 'pcofins'] },
  { id: 'icms_pct', rotulo: 'ICMS (%)', coluna: 'ICMS %', tipo: 'pct', exemplo: '12', ajuda: 'Em pontos percentuais (12 = 12%), sobre o valor da operação. Em branco: o ICMS interestadual (12% ou 7%) quando as UFs são diferentes, se a opção estiver ligada.', aliases: ['icms', 'icms pct', 'aliquota icms', 'p icms', 'picms'] },
  { id: 'iss_pct', rotulo: 'ISS (%)', coluna: 'ISS %', tipo: 'pct', exemplo: '', ajuda: 'Em pontos percentuais (5 = 5%), para serviço municipal.', aliases: ['iss', 'iss pct', 'aliquota iss', 'issqn'] },
  { id: 'ipi_pct', rotulo: 'IPI (%)', coluna: 'IPI %', tipo: 'pct', exemplo: '', ajuda: 'Em pontos percentuais.', aliases: ['ipi', 'ipi pct', 'aliquota ipi', 'p ipi'] },
  { id: 'credito_elegivel_pct', rotulo: 'Crédito elegível (%)', coluna: 'Crédito elegível %', tipo: 'pct', exemplo: '', ajuda: 'Só para Entrada: quanto da compra gera crédito (100 = tudo). Em branco: a escolha da tela para compras.', aliases: ['credito elegivel', 'credito elegivel pct', 'credito', 'credito pct', 'aproveitamento de credito'] },
  { id: 'c_class_trib', rotulo: 'cClassTrib', coluna: 'cClassTrib', tipo: 'texto', exemplo: '000001', ajuda: 'Classificação tributária do IBS/CBS (seis dígitos). Em branco: 000001 (tributação integral).', aliases: ['cclasstrib', 'c class trib', 'classificacao tributaria', 'class trib'] },
  { id: 'cst_ibs_cbs', rotulo: 'CST IBS/CBS', coluna: 'CST IBS/CBS', tipo: 'texto', exemplo: '000', ajuda: 'Código de situação tributária do IBS/CBS. Em branco: 000.', aliases: ['cst ibs cbs', 'cst ibscbs', 'cst'] },
  { id: 'c_cred_pres', rotulo: 'Crédito presumido (cCredPres: 1, 2, 3 ou 4)', coluna: 'cCredPres', tipo: 'texto', exemplo: '', ajuda: '1 produtor rural, 2 frete de transportador autônomo, 3 resíduos, 4 bem usado de pessoa física. Só em Entrada.', aliases: ['ccredpres', 'c cred pres', 'credito presumido', 'cred pres'] },
  { id: 'credito_presumido_ibs_pct', rotulo: 'Crédito presumido IBS (%)', coluna: 'Crédito presumido IBS %', tipo: 'pct', exemplo: '', ajuda: 'Percentual do ato conjunto (códigos 1 e 2). Em branco, os códigos 3 e 4 usam o percentual da lei.', aliases: ['credito presumido ibs', 'cred pres ibs', 'pcredpresibs'] },
  { id: 'credito_presumido_cbs_pct', rotulo: 'Crédito presumido CBS (%)', coluna: 'Crédito presumido CBS %', tipo: 'pct', exemplo: '', ajuda: 'Percentual do ato conjunto (códigos 1 e 2). Em branco, os códigos 3 e 4 usam o percentual da lei.', aliases: ['credito presumido cbs', 'cred pres cbs', 'pcredprescbs'] },
  { id: 'combustivel_produto', rotulo: 'Combustível (regime específico)', coluna: 'Combustível', tipo: 'texto', exemplo: '', ajuda: 'gasolina, eac, diesel, b100, glp, ehc, qav ou oleo_combustivel. A quantidade deve estar em litros (ou quilos no glp e no oleo_combustivel).', aliases: ['combustivel', 'combustivel produto', 'produto combustivel'] },
  { id: 'is_pct', rotulo: 'Imposto Seletivo (%)', coluna: 'Imposto Seletivo %', tipo: 'pct', exemplo: '', ajuda: 'Só para quem é contribuinte do IS.', aliases: ['is', 'imposto seletivo', 'is pct', 'aliquota is'] },
  { id: 'compra_governamental_informado', rotulo: 'Venda a órgão público? (Sim/Não)', coluna: 'Venda órgão público', tipo: 'simnao', exemplo: 'Não', ajuda: 'Sim aplica o redutor das compras governamentais (arts. 349, III, e 472).', aliases: ['venda orgao publico', 'compra governamental', 'orgao publico', 'venda governo'] },
  { id: 'id_operacao', rotulo: 'ID da operação', coluna: 'ID operação', tipo: 'texto', exemplo: '', ajuda: 'Em branco: o InTAX cria o ID a partir do conteúdo da linha (empresa, data, direção, valor, descrição, documento, CFOP, NCM/NBS, UFs e quantidade), e uma linha igual à já importada é ignorada; duas operações legítimas idênticas em envios diferentes só entram se cada uma tiver o seu ID. Com o ID, a operação com esse ID nunca é duplicada na mesma empresa: use um código que não se repita (a chave de acesso de 44 dígitos, ou emitente + série + número + item); o número da nota sozinho se repete entre fornecedores.', aliases: ['id operacao', 'id_operacao', 'id da operacao', 'codigo operacao', 'identificador'] },
  { id: 'observacao', rotulo: 'Observação', coluna: 'Observação', tipo: 'texto', exemplo: '', ajuda: 'Texto livre, guardado na operação.', aliases: ['observacao', 'obs', 'comentario'] },
];

export const IDS_CAMPOS: string[] = CAMPOS.map((c) => c.id);
export const CAMPOS_PCT: string[] = CAMPOS.filter((c) => c.tipo === 'pct').map((c) => c.id);

/** índice da coluna da planilha (a partir de 0) para cada campo; null/ausente = não usar. */
export type Mapeamento = Record<string, number | null>;

/** Minúsculas, sem acento, só letras e números separados por um espaço. */
export function normalizarTexto(t: unknown): string {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Sugere a coluna de cada campo pelo nome do cabeçalho. Uma coluna não é usada por dois campos. */
export function sugerirMapeamento(cabecalho: string[]): Mapeamento {
  const norm = cabecalho.map(normalizarTexto);
  const usadas = new Set<number>();
  const mapa: Mapeamento = {};
  for (const campo of CAMPOS) {
    const nomes = new Set([normalizarTexto(campo.id), normalizarTexto(campo.coluna), ...campo.aliases.map(normalizarTexto)]);
    const i = norm.findIndex((n, idx) => !usadas.has(idx) && nomes.has(n));
    mapa[campo.id] = i >= 0 ? i : null;
    if (i >= 0) usadas.add(i);
  }
  return mapa;
}
