/**
 * Conversão de uma linha de planilha em operação do InTAX: leitura de número, data e percentual no formato brasileiro,
 * resolução da empresa, tributos padrão pela tabela da legislação e a lista de erros e avisos de cada linha.
 * Funções puras (sem banco nem arquivo): o serviço só orquestra.
 */
import { CAMPOS, Mapeamento, normalizarTexto } from './campos';
import { TABELA_PIS_COFINS, icmsInterestadual } from './tributos-padrao';

export type Formato = 'xlsx' | 'csv';

export const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO', 'EX',
]);
export const COMBUSTIVEIS = ['gasolina', 'eac', 'diesel', 'b100', 'glp', 'ehc', 'qav', 'oleo_combustivel'];
/** cCredPres com dois dígitos, como no XML do DF-e (a tabela da Conformidade Fácil mostra 1 a 4); "CP-RURAL" é o código antigo do InTAX. */
export const CODIGOS_CRED_PRES = ['01', '02', '03', '04', 'CP-RURAL'];

const rotuloDe = (id: string) => CAMPOS.find((c) => c.id === id)?.rotulo ?? id;

/**
 * Número em texto: "1.234,56", "1234,56", "1,234.56", "1234.56", "R$ 1.234,56", "-R$ 1.234,56", "R$ (100,00)", "(100,00)",
 * "100,00-" e "100,00 D" (débito; "C" é crédito). Nulo se não for número.
 */
export function numeroBR(bruto: unknown, formato: Formato = 'csv'): number | null {
  let t = String(bruto ?? '').trim();
  if (!t) return null;
  let negativo = false;
  t = t.replace(/R\$\s*/gi, '').trim(); // a moeda pode vir em qualquer posição: "-R$ 10", "R$ -10", "R$ (10)"
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1).trim(); }
  const contabil = t.match(/^(.*\d)\s+([DdCc])$/);
  if (contabil) { negativo = negativo || /d/i.test(contabil[2]); t = contabil[1]; }
  t = t.replace(/\s+/g, '').replace(/%$/, '');
  if (/^[-−–]/.test(t)) { negativo = true; t = t.slice(1); }
  if (/[-−–]$/.test(t)) { negativo = true; t = t.slice(0, -1); }
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const temVirgula = t.includes(',');
  const temPonto = t.includes('.');
  let normal: string;
  if (temVirgula && temPonto) {
    // O último separador é o decimal.
    normal = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (temVirgula) {
    normal = t.split(',').length > 2 ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (temPonto) {
    const varios = t.split('.').length > 2;
    // No CSV brasileiro "1.234" é mil duzentos e trinta e quatro; no XLSX um número nunca tem ponto de milhar.
    const milhar = /^[1-9]\d{0,2}(\.\d{3})+$/.test(t); // "0.500" é meio, não quinhentos
    normal = varios || (formato === 'csv' && milhar) ? t.replace(/\./g, '') : t;
  } else normal = t;
  const n = Number(normal);
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}

/** Data em ano-mês-dia ou dia/mês/ano (barra, ponto ou traço). Nulo se inválida. */
export function dataBR(bruto: unknown): Date | null {
  const t = String(bruto ?? '').trim();
  if (!t) return null;
  let a: number; let m: number; let d: number;
  let mt = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (mt) { a = +mt[1]; m = +mt[2]; d = +mt[3]; } else {
    mt = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/);
    if (!mt) return null;
    d = +mt[1]; m = +mt[2]; a = mt[3].length === 2 ? 2000 + +mt[3] : +mt[3];
  }
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

/** Percentual para fração (0,18). Com o sinal % o valor é sempre em pontos. Nulo se não for número. */
export function pctParaFracao(bruto: unknown, unidade: 'pontos' | 'fracao', formato: Formato = 'csv'): number | null {
  const texto = String(bruto ?? '');
  const n = numeroBR(texto, formato);
  if (n === null) return null;
  return unidade === 'pontos' || texto.includes('%') ? n / 100 : n;
}

export function direcaoDe(bruto: unknown): 'Entrada' | 'Saida' | null {
  const t = normalizarTexto(bruto);
  if (['saida', 'saidas', 's', 'venda', 'vendas', 'receita', 'receitas', 'faturamento', 'prestacao'].includes(t)) return 'Saida';
  if (['entrada', 'entradas', 'e', 'compra', 'compras', 'despesa', 'despesas', 'custo', 'custos', 'aquisicao'].includes(t)) return 'Entrada';
  return null;
}

export function tipoDe(bruto: unknown): 'Mercadoria' | 'Servico' | 'Outro' | null {
  const t = normalizarTexto(bruto);
  if (['servico', 'servicos', 'prestacao de servico', 'prestacao de servicos'].includes(t)) return 'Servico';
  if (['mercadoria', 'mercadorias', 'produto', 'produtos', 'bem', 'bens'].includes(t)) return 'Mercadoria';
  if (['outro', 'outros'].includes(t)) return 'Outro';
  return null;
}

export function simNaoDe(bruto: unknown): 'Sim' | 'Não' | null {
  const t = normalizarTexto(bruto);
  if (['sim', 's', 'yes', 'y', '1', 'true', 'verdadeiro'].includes(t)) return 'Sim';
  if (['nao', 'n', 'no', '0', 'false', 'falso', ''].includes(t)) return 'Não';
  return null;
}

export type EmpresaRef = { id?: string; id_empresa: string; cnpj_cpf: string | null; regime_atual: string | null; status: string };

const soDigitos = (t: string) => t.replace(/\D+/g, '');

/** As empresas indexadas por ID (minúsculas) e por CNPJ/CPF (só dígitos): uma planilha de 50 mil linhas não pode varrer a lista inteira a cada linha. */
export type IndiceEmpresas = { porId: Map<string, EmpresaRef>; porDigitos: Map<string, EmpresaRef> };

/** Com o mesmo ID ou CNPJ em mais de uma empresa, vale a primeira da lista (como a busca direta sempre fez). */
export function indexarEmpresas(empresas: EmpresaRef[]): IndiceEmpresas {
  const porId = new Map<string, EmpresaRef>();
  const porDigitos = new Map<string, EmpresaRef>();
  for (const e of empresas) {
    const id = e.id_empresa.toLowerCase();
    if (!porId.has(id)) porId.set(id, e);
    const dig = e.cnpj_cpf ? soDigitos(e.cnpj_cpf) : '';
    if (dig && !porDigitos.has(dig)) porDigitos.set(dig, e);
  }
  return { porId, porDigitos };
}

/** Empresa pelo ID cadastrado (sem diferenciar maiúsculas) ou pelo CNPJ/CPF (só os dígitos). */
export function acharEmpresa(bruto: string, empresas: EmpresaRef[], indice?: IndiceEmpresas): EmpresaRef | undefined {
  const t = bruto.trim();
  const idx = indice ?? indexarEmpresas(empresas);
  const porId = idx.porId.get(t.toLowerCase());
  if (porId) return porId;
  const dig = soDigitos(t);
  if (dig.length === 14 || dig.length === 11) return idx.porDigitos.get(dig);
  return undefined;
}

/** Regime no nome de TABELA_PIS_COFINS (aceita variações de maiúscula e acento). */
export function regimeNormalizado(bruto: string | null | undefined): string {
  const t = normalizarTexto(bruto);
  if (t.includes('real')) return 'Lucro Real';
  if (t.includes('presumido')) return 'Lucro Presumido';
  if (t.includes('simples')) return 'Simples Nacional';
  if (t.includes('produtor')) return 'Produtor rural PF';
  return '';
}

export type OpcoesImportacao = {
  /** id_empresa usado quando a linha não traz a empresa. */
  empresaPadrao: string | null;
  /** Direção das linhas que não trazem a coluna. */
  direcaoPadrao: 'Entrada' | 'Saida' | null;
  tipoPadrao: 'Mercadoria' | 'Servico';
  /** Como os percentuais da planilha estão escritos: 18 (pontos) ou 0,18 (fração). */
  unidadePct: 'pontos' | 'fracao';
  /** Preenche PIS, Cofins e ICMS interestadual pela tabela da legislação quando a planilha não os traz. */
  preencherTributos: boolean;
  /** Crédito elegível das compras (fração) quando a planilha não traz; nulo = 0. */
  creditoElegivelCompras: number | null;
  /** Grupo (id) em que a importação acontece: só as empresas dele valem. Sem ele, valem as de todos os grupos. */
  grupoId: string | null;
};

export const OPCOES_PADRAO: OpcoesImportacao = {
  empresaPadrao: null, direcaoPadrao: null, tipoPadrao: 'Mercadoria', unidadePct: 'pontos', preencherTributos: true, creditoElegivelCompras: null, grupoId: null,
};

export type Contexto = {
  mapeamento: Mapeamento;
  opcoes: OpcoesImportacao;
  empresas: EmpresaRef[];
  /** Índice das empresas, montado uma vez por planilha; sem ele a linha monta o seu (testes e uso avulso). */
  indiceEmpresas?: IndiceEmpresas;
  formato: Formato;
  nomeArquivo: string;
  /** Início do hash do arquivo, só para rastrear na observação da operação de que envio ela veio. */
  arquivoHash: string;
  /** Códigos de cClassTrib do catálogo (para avisar de código inexistente); nulo ou vazio = não conferir. */
  classesCatalogo?: Set<string> | null;
};

export type LinhaConvertida = {
  /** Número da linha na planilha (o cabeçalho é a linha 1). */
  linha: number;
  ok: boolean;
  erros: string[];
  avisos: string[];
  /** O que foi preenchido pela tabela da legislação. */
  padroes: string[];
  dados: Record<string, unknown> | null;
  /** A planilha trouxe o ID da operação (então ele vale como está). Senão o serviço gera o ID a partir de `chaveConteudo`. */
  idInformado: boolean;
  /**
   * O que identifica a linha: empresa, data, direção, valor, descrição, documento, CFOP, NCM, NBS, UFs e quantidade (sem
   * os percentuais). Linha igual à já importada tem o mesmo ID e é ignorada; linha corrigida em algum desses campos entra como nova.
   */
  chaveConteudo: string | null;
  /** Chave de acesso de 44 dígitos da coluna de documento, quando é uma (para não contar de novo a nota que já entrou por XML). */
  chaveDocumento: string | null;
  previa: { empresa: string; data: string; direcao: string; tipo: string; descricao: string; valor: number | null; icms: number | null; pis: number | null; cofins: number | null; credito: number | null };
};

const semIndefinidos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export function converterLinha(valores: string[], numeroLinha: number, ctx: Contexto): LinhaConvertida {
  const { mapeamento: map, opcoes, formato } = ctx;
  const erros: string[] = []; const avisos: string[] = []; const padroes: string[] = [];
  const cel = (id: string): string => { const i = map[id]; return i === null || i === undefined ? '' : String(valores[i] ?? '').trim(); };

  // ── Empresa ──
  let empresa: EmpresaRef | undefined;
  const bEmpresa = cel('empresa');
  if (opcoes.empresaPadrao) {
    // A empresa escolhida na tela vale para TODAS as linhas; a coluna Empresa, se existir, não é lida (numa planilha de
    // vendas o CNPJ costuma ser o do cliente, e mandaria a linha para outra empresa do grupo sem erro).
    empresa = (ctx.indiceEmpresas ?? indexarEmpresas(ctx.empresas)).porId.get(opcoes.empresaPadrao.toLowerCase());
    if (!empresa) erros.push('A empresa escolhida para todas as linhas não foi encontrada.');
  } else if (bEmpresa) {
    empresa = acharEmpresa(bEmpresa, ctx.empresas, ctx.indiceEmpresas);
    if (!empresa) erros.push(`Empresa “${bEmpresa}” não encontrada: use o ID ou o CNPJ cadastrado no InTAX.`);
  } else erros.push('Empresa não informada.');
  if (empresa && empresa.status === 'Inativa') erros.push(`A empresa ${empresa.id_empresa} está inativa.`);

  // ── Data, direção e valor ──
  const bData = cel('data');
  const data = dataBR(bData);
  if (!bData) erros.push('Data não informada.'); else if (!data) erros.push(`Data “${bData}” inválida: use dia/mês/ano (15/01/2027) ou ano-mês-dia (2027-01-15).`);

  const bDirecao = cel('direcao');
  let direcao = direcaoDe(bDirecao);
  if (!direcao) {
    if (!bDirecao && opcoes.direcaoPadrao) direcao = opcoes.direcaoPadrao;
    else erros.push(bDirecao ? `Direção “${bDirecao}” não reconhecida: use Entrada ou Saída.` : 'Direção (Entrada ou Saída) não informada.');
  }

  const bValor = cel('valor_bruto');
  const valor = numeroBR(bValor, formato);
  if (!bValor) erros.push('Valor da operação não informado.');
  else if (valor === null) erros.push(`Valor “${bValor}” inválido.`);
  else if (valor === 0) erros.push('Valor da operação zerado.');
  else if (valor < 0) avisos.push('Valor negativo: tratado como devolução (estorno) da operação.');

  // ── Classificação ──
  const nbs = soDigitos(cel('nbs')) || undefined;
  let ncm = soDigitos(cel('ncm')) || undefined;
  // O Excel tira o zero à esquerda de um NCM digitado como número (01012100 vira 1012100): com 7 dígitos, devolve o zero.
  if (ncm && ncm.length === 7) ncm = ncm.padStart(8, '0');
  if (ncm && ncm.length !== 8) avisos.push(`NCM ${ncm} não tem 8 dígitos.`);
  const bTipo = cel('tipo');
  let tipo: string | null = tipoDe(bTipo);
  if (bTipo && !tipo) avisos.push(`Tipo “${bTipo}” não reconhecido: usei ${nbs ? 'Serviço (há NBS)' : opcoes.tipoPadrao === 'Servico' ? 'Serviço' : 'Mercadoria'}.`);
  if (!tipo) tipo = nbs ? 'Servico' : opcoes.tipoPadrao;

  const ufOrigem = cel('uf_origem').toUpperCase() || undefined;
  const ufDestino = cel('uf_destino').toUpperCase() || undefined;
  for (const [rot, uf] of [['UF de origem', ufOrigem], ['UF de destino', ufDestino]] as const) {
    if (uf && !UFS.has(uf)) avisos.push(`${rot} “${uf}” não é uma sigla de estado válida.`);
  }
  const municipio = soDigitos(cel('municipio_destino')) || undefined;
  if (municipio && municipio.length !== 7) avisos.push(`Município “${municipio}” não tem 7 dígitos (código IBGE).`);

  // ── Quantidade e preço ──
  const bQuantidade = cel('quantidade');
  let quantidade = bQuantidade ? numeroBR(bQuantidade, formato) : null;
  if (bQuantidade && quantidade === null) { avisos.push(`Quantidade “${bQuantidade}” inválida: ignorada.`); }
  const combBruto = normalizarTexto(cel('combustivel_produto')).replace(/ /g, '_');
  let combustivel: string | undefined;
  if (combBruto) {
    if (COMBUSTIVEIS.includes(combBruto)) combustivel = combBruto;
    else avisos.push(`Combustível “${cel('combustivel_produto')}” não reconhecido (use gasolina, eac, diesel, b100, glp, ehc, qav ou oleo_combustivel): ignorado.`);
  }
  if (combustivel && !(quantidade && quantidade > 0)) avisos.push('Combustível sem quantidade: o tributo (quantidade × alíquota por unidade) só é calculado com a quantidade em litros (ou quilos).');
  let precoUnitario = valor ?? 0;
  if (quantidade && quantidade > 0 && valor !== null) precoUnitario = valor / quantidade; else quantidade = 1;

  // ── Percentuais ──
  const pct = (id: string): number | undefined => {
    const bruto = cel(id);
    if (bruto === '') return undefined;
    const n = pctParaFracao(bruto, opcoes.unidadePct, formato);
    if (n === null) { erros.push(`${rotuloDe(id)} “${bruto}” inválido.`); return undefined; }
    if (n < 0 || n > 1) { erros.push(`${rotuloDe(id)} “${bruto}” fora do intervalo: informe em pontos percentuais (18 = 18%).`); return undefined; }
    return n;
  };
  let pis = pct('pis_pct'); let cofins = pct('cofins_pct'); let icms = pct('icms_pct');
  const iss = pct('iss_pct'); const ipi = pct('ipi_pct'); const isPct = pct('is_pct');
  const credIbs = pct('credito_presumido_ibs_pct'); const credCbs = pct('credito_presumido_cbs_pct');
  let credito = pct('credito_elegivel_pct');

  const regimeTexto = cel('regime_atual') || empresa?.regime_atual || '';
  const regime = regimeNormalizado(regimeTexto);
  if (opcoes.preencherTributos) {
    // PIS e Cofins pela tabela só nas VENDAS: são os da própria empresa, pelo regime dela. Na compra o PIS/Cofins embutido
    // é o do fornecedor, que o regime do comprador não revela; presumir o do comprador criaria um crédito de PIS/Cofins que
    // o Lucro Presumido, por exemplo, não tem. O ICMS interestadual vale nos dois sentidos (o comprador credita o da nota).
    const tab = direcao === 'Saida' ? TABELA_PIS_COFINS[regime] : undefined;
    if (pis === undefined && tab) { pis = tab.pis; padroes.push('PIS'); }
    if (cofins === undefined && tab) { cofins = tab.cofins; padroes.push('Cofins'); }
    // ICMS interestadual só entre duas UFs do país: exportação ("EX"), sigla inválida e serviço de ISS (NBS ou ISS informado) ficam de fora.
    const ufsDoPais = Boolean(ufOrigem && ufDestino && UFS.has(ufOrigem) && UFS.has(ufDestino) && ufOrigem !== 'EX' && ufDestino !== 'EX');
    const servicoDeIss = tipo === 'Servico' && (Boolean(nbs) || iss !== undefined);
    if (icms === undefined && ufsDoPais && !servicoDeIss) {
      const ic = icmsInterestadual(ufOrigem, ufDestino);
      if (ic !== null) { icms = ic; padroes.push('ICMS interestadual'); }
    }
    if (direcao === 'Saida' && regimeTexto && !tab && pis === undefined && cofins === undefined) {
      avisos.push(`Regime “${regimeTexto}” não reconhecido (use Lucro Real, Lucro Presumido, Simples Nacional ou Produtor rural PF): PIS e Cofins não foram preenchidos pela tabela.`);
    }
  }
  if (credito === undefined && direcao === 'Entrada') credito = opcoes.creditoElegivelCompras ?? 0;

  // ── Crédito presumido e regimes específicos ──
  const credPresBruto = cel('c_cred_pres').toUpperCase();
  let credPres: string | undefined;
  if (credPresBruto) {
    credPres = /^\d+$/.test(credPresBruto) ? credPresBruto.padStart(2, '0') : credPresBruto; // "2" vira "02", como no XML
    if (!CODIGOS_CRED_PRES.includes(credPres)) avisos.push(`cCredPres “${credPresBruto}” fora da tabela oficial (1 a 4).`);
    if (direcao === 'Saida') avisos.push('O crédito presumido vale só em compra (Entrada): nesta saída ele não será calculado.');
  }
  const bGov = cel('compra_governamental_informado');
  const gov = bGov ? simNaoDe(bGov) : null;
  if (bGov && !gov) avisos.push(`“${bGov}” em venda a órgão público não é Sim nem Não: ignorado.`);

  // ── Códigos que o Excel desfigura quando a célula é número: o zero à esquerda some (1 em vez de 000001). ──
  let classTrib = cel('c_class_trib');
  if (/^\d{1,5}$/.test(classTrib)) classTrib = classTrib.padStart(6, '0');
  if (classTrib && ctx.classesCatalogo && ctx.classesCatalogo.size > 0 && !ctx.classesCatalogo.has(classTrib)) {
    avisos.push(`cClassTrib ${classTrib} não existe no catálogo do InTAX: a operação ficará com a classificação pendente.`);
  }
  let cst = cel('cst_ibs_cbs');
  if (/^\d{1,2}$/.test(cst)) cst = cst.padStart(3, '0');

  // ── Identificação ──
  // Sem ID na planilha, o serviço gera um a partir do conteúdo da linha (chaveConteudo): a mesma linha reenviada tem o mesmo ID
  // e é ignorada; só a linha que mudou entra como nova. Isso vale para planilha corrigida e reenviada, que não repete o resto.
  const idInformado = cel('id_operacao') !== '';
  const idOperacao = idInformado ? cel('id_operacao').slice(0, 80) : undefined;
  const chave = cel('documento_chave');
  const obs = cel('observacao');

  const ok = erros.length === 0;
  const descricao = cel('descricao');
  const chaveConteudo = ok && empresa && data && direcao && valor !== null
    ? [
      empresa.id_empresa, data.toISOString().slice(0, 10), direcao, valor.toFixed(2), normalizarTexto(descricao), normalizarTexto(chave),
      normalizarTexto(cel('cfop_servico')), ncm ?? '', nbs ?? '', ufOrigem ?? '', ufDestino ?? '', String(quantidade ?? ''),
    ].join('|')
    : null;
  const dados: Record<string, unknown> | null = ok && empresa && data && direcao && valor !== null
    ? semIndefinidos({
      id_operacao: idOperacao,
      empresa_id: empresa.id_empresa,
      data,
      ano: data.getUTCFullYear(),
      direcao,
      tipo,
      descricao: descricao || undefined,
      quantidade,
      preco_unitario: precoUnitario,
      valor_bruto: valor,
      ncm,
      nbs,
      cfop_servico: cel('cfop_servico') || undefined,
      uf_origem: ufOrigem,
      uf_destino: ufDestino,
      municipio_destino: municipio,
      documento: cel('documento') || 'Planilha',
      regime_atual: regimeTexto || undefined,
      c_class_trib: classTrib || '000001',
      cst_ibs_cbs: cst || '000',
      pis_pct: pis ?? 0,
      cofins_pct: cofins ?? 0,
      icms_pct: icms ?? 0,
      iss_pct: iss ?? 0,
      ipi_pct: ipi ?? 0,
      is_pct: isPct ?? 0,
      combustivel_produto: combustivel,
      credito_elegivel_pct: direcao === 'Entrada' ? (credito ?? 0) : 0,
      c_cred_pres: credPres,
      credito_presumido_ibs_pct: credIbs ?? 0,
      credito_presumido_cbs_pct: credCbs ?? 0,
      compra_governamental_informado: gov ?? undefined,
      observacao_dfe: [`Importado da planilha ${ctx.nomeArquivo} (arquivo ${ctx.arquivoHash}), linha ${numeroLinha}.`, chave ? `Documento: ${chave}.` : '', obs].filter(Boolean).join(' '),
    })
    : null;

  return {
    linha: numeroLinha, ok, erros, avisos, padroes, dados, idInformado, chaveConteudo,
    chaveDocumento: soDigitos(chave).length === 44 ? soDigitos(chave) : null,
    previa: {
      empresa: empresa?.id_empresa ?? bEmpresa, data: data ? data.toISOString().slice(0, 10) : bData, direcao: direcao ?? bDirecao,
      tipo: tipo ?? '', descricao, valor, icms: icms ?? null, pis: pis ?? null, cofins: cofins ?? null, credito: credito ?? null,
    },
  };
}
