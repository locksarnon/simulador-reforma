/**
 * Conteúdo inicial da Biblioteca de diretrizes (docs/saneamento-diretrizes.md, seções 4 e 11).
 * Base: política de estoques da Agropecuária Crestani (versão editada pelo usuário em 16/11/2026), desdobrada em regras-modelo por aspecto
 * e por família de grupos, procedimentos com fluxograma e o modelo de atribuição dos grupos da Crestani.
 * Ids estáveis: o projeto aponta para eles. Alterar conteúdo = nova versão na biblioteca (nunca reaproveitar um id para outra coisa).
 * LIMITES não está aqui (conteudo/limites-oficiais.ts).
 */
import type {
  Aspecto, ComponenteNome, Procedimento, RegraAtributos, RegraBiblioteca, RegraFiscal, RegraNomes, RegraUnidades,
} from '../tipos';

// ── Peças comuns ─────────────────────────────────────────────────────────────

/** Estrutura da descrição: NOME + REFERÊNCIA + COMPLEMENTO, nessa ordem (política, 3.1). */
const ESTRUTURA: ComponenteNome[] = ['NOME', 'REFERENCIA', 'COMPLEMENTO'];

/** Grafia única das unidades no texto (política, 3.3): MM, CM, M, KG, G, L, ML, POL. Só expressões sem outro sentido no cadastro. */
const ABREVIACOES_UNIDADES: RegraNomes['abreviacoes'] = [
  { completa: 'MILIMETRO', abreviacao: 'MM' },
  { completa: 'MILIMETROS', abreviacao: 'MM' },
  { completa: 'CENTIMETRO', abreviacao: 'CM' },
  { completa: 'CENTIMETROS', abreviacao: 'CM' },
  { completa: 'METROS', abreviacao: 'M' },
  { completa: 'QUILOGRAMA', abreviacao: 'KG' },
  { completa: 'QUILOGRAMAS', abreviacao: 'KG' },
  { completa: 'GRAMAS', abreviacao: 'G' },
  { completa: 'LITRO', abreviacao: 'L' },
  { completa: 'LITROS', abreviacao: 'L' },
  { completa: 'MILILITRO', abreviacao: 'ML' },
  { completa: 'MILILITROS', abreviacao: 'ML' },
  { completa: 'POLEGADA', abreviacao: 'POL' },
  { completa: 'POLEGADAS', abreviacao: 'POL' },
];

/**
 * Termos proibidos comuns (política, 3.3 e 3.4): o NOME nunca é abreviado; grafias alternativas de unidade; caracteres que atrapalham a busca.
 */
const PROIBIDOS_COMUNS: RegraNomes['termosProibidos'] = [
  { termo: 'CJ', substituicao: 'CONJUNTO' },
  { termo: 'CONJ', substituicao: 'CONJUNTO' },
  { termo: 'JG', substituicao: 'JOGO' },
  { termo: 'PARAF', substituicao: 'PARAFUSO' },
  { termo: 'PFS', substituicao: 'PARAFUSO' },
  { termo: 'MANG', substituicao: 'MANGUEIRA' },
  { termo: 'KGS', substituicao: 'KG' },
  { termo: 'LTS', substituicao: 'L' },
  { termo: 'MTS', substituicao: 'M' },
  { termo: 'GRS', substituicao: 'G' },
  { termo: '"', substituicao: null },
  { termo: '//', substituicao: null },
  { termo: ';', substituicao: null },
  { termo: '#', substituicao: null },
  { termo: '?', substituicao: null },
];

const OBS_NOMES_COMUM =
  'Só valem as abreviações da lista aprovada pelo cliente, cada uma com uma única forma; abreviação fora da lista não entra no cadastro. ' +
  'Medida colada ao número (16MM, 50CM); referência sem parênteses; espaço simples e nada nas pontas. ' +
  'A quantidade da embalagem (20L, 1000KG) não entra na descrição: fica na unidade e no fator de conversão. ' +
  'Pendente com o cliente: aprovação da lista inicial de abreviações e da regra "sem acentos" (padrão adotado: sem acentos).';

const nomes = (obrigatorios: ComponenteNome[], extras: Partial<Pick<RegraNomes, 'abreviacoes' | 'termosProibidos'>> = {}): RegraNomes => ({
  aspecto: 'NOMES',
  componentes: [...ESTRUTURA],
  obrigatorios,
  separador: ' ',
  capitalizacao: 'MAIUSCULAS',
  removerEspacosDuplicados: true,
  abreviacoes: [...ABREVIACOES_UNIDADES, ...(extras.abreviacoes ?? [])],
  termosProibidos: [...PROIBIDOS_COMUNS, ...(extras.termosProibidos ?? [])],
});

type Atributo = RegraAtributos['atributos'][number];
const naDescricao = (atributo: string, aplicabilidade: Atributo['aplicabilidade'] = 'OBRIGATORIO', condicao: string | null = null): Atributo =>
  ({ atributo, onde: 'DESCRICAO', campo: null, aplicabilidade, condicao });
const emCampo = (atributo: string, aplicabilidade: Atributo['aplicabilidade'] = 'OBRIGATORIO', condicao: string | null = null): Atributo =>
  ({ atributo, onde: 'CAMPO_PROPRIO', campo: null, aplicabilidade, condicao });

/** Referência do fabricante: na descrição, posição 2 (política, 3.5). Fabricante e nº de catálogo em campo próprio: sem viabilidade por ora. */
const REFERENCIA_QUANDO_HOUVER = naDescricao('REFERENCIA', 'QUANDO_APLICAVEL', 'item com referência do fabricante, da norma ou do catálogo');

/** Conversões exatas por definição (motor/unidades.ts). Embalagens (saca, big bag, galão, caixa) dependem do item: fator informado por produto. */
const CONV = {
  T_KG: { origem: 'T', destino: 'KG', fator: 1000, abrangencia: 'GRUPO' as const },
  G_KG: { origem: 'G', destino: 'KG', fator: 0.001, abrangencia: 'GRUPO' as const },
  ML_L: { origem: 'ML', destino: 'L', fator: 0.001, abrangencia: 'GRUPO' as const },
  M3_L: { origem: 'M3', destino: 'L', fator: 1000, abrangencia: 'GRUPO' as const },
  DZ_UN: { origem: 'DZ', destino: 'UN', fator: 12, abrangencia: 'GRUPO' as const },
  CENTO_UN: { origem: 'CENTO', destino: 'UN', fator: 100, abrangencia: 'GRUPO' as const },
  MILHAR_UN: { origem: 'MILHAR', destino: 'UN', fator: 1000, abrangencia: 'GRUPO' as const },
};

const unidades = (u: Omit<RegraUnidades, 'aspecto' | 'conversaoDesconhecida'>): RegraUnidades =>
  ({ aspecto: 'UNIDADES', conversaoDesconhecida: 'PENDENCIA', ...u });

const fiscal = (cenarios: RegraFiscal['cenarios'], excecoesNcm: RegraFiscal['excecoesNcm'] = []): RegraFiscal => ({
  aspecto: 'FISCAL', validarNcm: true, excecoesNcm, validarCClassTrib: true, cenarios, ausente: 'PENDENCIA', ambiguo: 'REVISAO_FISCAL',
});

const regra = (id: string, aspecto: Aspecto, nome: string, indicadaPara: string | null, conteudo: RegraBiblioteca['conteudo'], observacao: string | null): RegraBiblioteca =>
  ({ id, aspecto, nome, indicadaPara, observacao, conteudo, versao: 1, ativa: true });

const OBS_FISCAL_COMUM =
  'NCM pela natureza do produto (RGI e Notas da TIPI); a nota de compra confere, não decide. NCM só "confirmado" depois das verificações V1 a V7, com evidência. ' +
  'cClassTrib é do par produto × operação: no cadastro fica a classe de referência, a partir do NCM confirmado. Sem anexo não prova ausência de benefício.';

// ── Regras-modelo ────────────────────────────────────────────────────────────

export const BIBLIOTECA_INICIAL: RegraBiblioteca[] = [
  // NOMES ─────────────────────────────────────────────────────────────────────
  regra('bib-nomes-padrao', 'NOMES', 'Descrição padrão — todos os grupos', 'Todos os grupos; grupos novos', nomes(['NOME']),
    `NOME: o que o item é, com o qualificador mínimo que o distingue (nunca abreviado). REFERÊNCIA: código do fabricante ou da norma; se não existe, não se inventa. COMPLEMENTO: medidas, material ou norma, aplicação, lado ou posição, cor ou tamanho quando fazem outro item. ${OBS_NOMES_COMUM}`),
  regra('bib-nomes-pecas', 'NOMES', 'Peça: nome + referência do fabricante', 'Peças e componentes de máquinas, veículos e implementos; rolamentos, retentores, filtros, correias, componentes elétricos',
    nomes(['NOME', 'REFERENCIA']),
    `Referência principal do fabricante na posição 2; complemento recomendado (aplicação, máquina ou modelo, lado ou posição). Original e paralelos ficam no mesmo código. Renumeração de catálogo: a nova referência entra e as antigas ficam preservadas. ${OBS_NOMES_COMUM}`),
  regra('bib-nomes-medida', 'NOMES', 'Medida: nome + complemento', 'Fixadores, mangueiras e conexões, ferro e aço, materiais de construção, ferramentas, pneus, itens de manejo',
    nomes(['NOME', 'COMPLEMENTO']),
    `Complemento com medidas, material ou norma e aplicação; referência quando houver. Ex.: PARAFUSO SEXTAVADO M10X40 ACO 8.8. ${OBS_NOMES_COMUM}`),
  regra('bib-nomes-defensivos', 'NOMES', 'Insumo regulado: defensivos', 'Inseticidas, herbicidas, fungicidas, adjuvantes e outros defensivos, tratamento de sementes',
    nomes(['NOME', 'COMPLEMENTO']),
    `NOME = tipo + nome comercial (ex.: HERBICIDA GLI-UP); COMPLEMENTO = formulação. Ingrediente ativo, concentração e registro no MAPA vão em campo próprio. Cadastro só pelo nome comercial não atende. ${OBS_NOMES_COMUM}`),
  regra('bib-nomes-fertilizantes', 'NOMES', 'Insumo regulado: fertilizantes e corretivos', 'Fertilizantes, corretivos de solo, calcário, gesso, remineralizadores',
    nomes(['NOME', 'COMPLEMENTO']),
    `NOME = tipo + nome comercial ou produto (ex.: FERTILIZANTE, CALCARIO DOLOMITICO); COMPLEMENTO = formulação ou teor (ex.: 04-14-08, PRNT). Registro no MAPA em campo próprio. ${OBS_NOMES_COMUM}`),
  regra('bib-nomes-sementes', 'NOMES', 'Semente e muda: cultura + cultivar + tecnologia', 'Sementes para semeadura e mudas',
    nomes(['NOME', 'REFERENCIA', 'COMPLEMENTO']),
    `NOME = SEMENTE ou MUDA + cultura ou espécie; REFERÊNCIA = cultivar; COMPLEMENTO = tecnologia, peneira e categoria. Grão para consumo ou ração não é semente: vai para outro grupo. ${OBS_NOMES_COMUM}`),
  regra('bib-nomes-especificacao', 'NOMES', 'Especificação: nome + especificação técnica', 'Lubrificantes, graxas, aditivos, combustíveis, nutrição animal, produção própria, plantel',
    nomes(['NOME', 'COMPLEMENTO']),
    `COMPLEMENTO = a especificação que faz outro produto: norma e viscosidade (lubrificantes), tipo do combustível (ex.: DIESEL S10), composição (nutrição), categoria (plantel). Marca só quando a especificação não basta. ${OBS_NOMES_COMUM}`),
  regra('bib-nomes-epi-uniformes', 'NOMES', 'EPI, EPC e uniformes', 'Equipamentos de proteção individual e coletiva, uniformes e vestuário',
    nomes(['NOME', 'COMPLEMENTO']),
    `REFERÊNCIA = número do Certificado de Aprovação (CA) do EPI, quando houver; COMPLEMENTO = tamanho, modelo e material. Tamanho e modelo fazem outro item. ${OBS_NOMES_COMUM}`),
  regra('bib-nomes-limpeza-copa', 'NOMES', 'Limpeza, copa e cozinha (variante é observação)', 'Material de limpeza, copa, cozinha e utensílios',
    nomes(['NOME']),
    `A variante (cor, fragrância, tipo ou apresentação) é observação, não produto: não gera código próprio e fica no campo adicional do item. Complemento só quando muda o produto (material, medida). ${OBS_NOMES_COMUM}`),
  regra('bib-nomes-alimentos', 'NOMES', 'Alimentos e hortifrutigranjeiros', 'Alimentos, bebidas e hortifrutigranjeiros do refeitório',
    nomes(['NOME']),
    `NOME = produto (ex.: ARROZ BRANCO TIPO 1, CARNE BOVINA COSTELA); COMPLEMENTO = tipo, corte ou variedade quando fazem outro produto. Marca só quando o produto depende dela. ${OBS_NOMES_COMUM}`),
  regra('bib-nomes-saude', 'NOMES', 'Saúde humana e veterinária', 'Medicamentos, material de enfermaria, vacinas e medicamentos veterinários',
    nomes(['NOME', 'COMPLEMENTO']),
    `NOME = nome comercial ou princípio ativo; COMPLEMENTO = concentração e forma farmacêutica. Registro na Anvisa ou no MAPA em campo próprio. ${OBS_NOMES_COMUM}`),
  regra('bib-nomes-expediente-informatica', 'NOMES', 'Expediente e informática', 'Material de expediente e escritório, informática, telefonia e radiocomunicação',
    nomes(['NOME', 'COMPLEMENTO']),
    `Informática e radiocomunicação: modelo na REFERÊNCIA e especificação no COMPLEMENTO. Expediente: medida, cor ou formato quando fazem outro item. ${OBS_NOMES_COMUM}`),
  regra('bib-nomes-embalagens', 'NOMES', 'Embalagens, lonas e materiais de beneficiamento', 'Embalagens, sacarias, lonas, plásticos de cobertura, materiais de beneficiamento e análises',
    nomes(['NOME', 'COMPLEMENTO']),
    `COMPLEMENTO = medidas, material, espessura ou gramatura e capacidade. ${OBS_NOMES_COMUM}`),

  // ATRIBUTOS ─────────────────────────────────────────────────────────────────
  regra('bib-atributos-padrao', 'ATRIBUTOS', 'Atributos mínimos — todos os grupos', 'Todos os grupos; grupos novos',
    { aspecto: 'ATRIBUTOS', atributos: [REFERENCIA_QUANDO_HOUVER, naDescricao('DIMENSAO', 'QUANDO_APLICAVEL', 'item cuja medida faz outro produto')] },
    'Fabricante e nº de catálogo em campo próprio: sem viabilidade por ora (campo não usado no ERP); reavaliar depois do piloto no ERP.'),
  regra('bib-atributos-pecas', 'ATRIBUTOS', 'Peças: referência obrigatória', 'Peças e componentes de máquinas e implementos',
    { aspecto: 'ATRIBUTOS', atributos: [naDescricao('REFERENCIA'), naDescricao('APLICACAO', 'QUANDO_APLICAVEL', 'peça específica de máquina, modelo ou posição'), naDescricao('DIMENSAO', 'QUANDO_APLICAVEL', 'rolamentos, retentores, correias e filtros com medida padronizada')] },
    'Fabricante em campo próprio: sem viabilidade por ora.'),
  regra('bib-atributos-medida', 'ATRIBUTOS', 'Materiais por medida: dimensão e material', 'Fixadores, mangueiras e conexões, ferro e aço, construção, ferramentas, pneus',
    { aspecto: 'ATRIBUTOS', atributos: [naDescricao('DIMENSAO'), naDescricao('MATERIAL', 'QUANDO_APLICAVEL', 'material ou classe de resistência que faz outro produto'), REFERENCIA_QUANDO_HOUVER] },
    null),
  regra('bib-atributos-defensivos', 'ATRIBUTOS', 'Defensivos: formulação, ingrediente ativo e registro', 'Inseticidas, herbicidas, fungicidas, outros defensivos, tratamento de sementes',
    { aspecto: 'ATRIBUTOS', atributos: [
      naDescricao('FORMULACAO'),
      emCampo('PRINCIPIO_ATIVO'),
      emCampo('CONCENTRACAO'),
      emCampo('REGISTRO_MAPA', 'QUANDO_APLICAVEL', 'produto sujeito a registro no MAPA'),
    ] },
    'Registro no MAPA, quando exigido, condiciona a redução do Anexo IX (LC 214/2025, art. 138, § 1º). Pendente: campos próprios no ERP (a confirmar no piloto); até lá, a pendência fica aberta no item.'),
  regra('bib-atributos-fertilizantes', 'ATRIBUTOS', 'Fertilizantes e corretivos: formulação, garantias e registro', 'Fertilizantes e corretivos de solo',
    { aspecto: 'ATRIBUTOS', atributos: [naDescricao('FORMULACAO'), emCampo('COMPOSICAO'), emCampo('REGISTRO_MAPA', 'QUANDO_APLICAVEL', 'produto sujeito a registro no MAPA')] },
    'Registro no MAPA, quando exigido, condiciona a redução do Anexo IX (LC 214/2025, art. 138, § 1º). Pendente: campos próprios no ERP (a confirmar no piloto).'),
  regra('bib-atributos-sementes', 'ATRIBUTOS', 'Sementes e mudas: cultivar, tecnologia, peneira e categoria', 'Sementes para semeadura e mudas',
    { aspecto: 'ATRIBUTOS', atributos: [
      naDescricao('CULTIVAR'),
      naDescricao('TECNOLOGIA', 'QUANDO_APLICAVEL', 'cultivar com tecnologia (biotecnologia, tratamento)'),
      naDescricao('PENEIRA', 'QUANDO_APLICAVEL', 'semente classificada por peneira'),
      emCampo('CATEGORIA_SEMENTE'),
      emCampo('REGISTRO_MAPA', 'QUANDO_APLICAVEL', 'semente ou muda sujeita a registro no MAPA'),
    ] },
    'A categoria da semente decide o enquadramento no item 10 do Anexo IX. Pendente: campos próprios no ERP (a confirmar no piloto).'),
  regra('bib-atributos-especificacao', 'ATRIBUTOS', 'Especificação técnica', 'Lubrificantes, graxas, aditivos, combustíveis, nutrição animal, produção própria, plantel',
    { aspecto: 'ATRIBUTOS', atributos: [
      naDescricao('ESPECIFICACAO'),
      naDescricao('VISCOSIDADE', 'QUANDO_APLICAVEL', 'óleos lubrificantes'),
      naDescricao('NORMA', 'QUANDO_APLICAVEL', 'produto com norma ou classe de desempenho (API, SAE, ISO VG)'),
      emCampo('COMPOSICAO', 'QUANDO_APLICAVEL', 'nutrição animal'),
      emCampo('REGISTRO_MAPA', 'QUANDO_APLICAVEL', 'produto de nutrição animal sujeito a registro no MAPA'),
    ] },
    null),
  regra('bib-atributos-epi-uniformes', 'ATRIBUTOS', 'EPI e uniformes: CA e tamanho', 'EPI, EPC e uniformes',
    { aspecto: 'ATRIBUTOS', atributos: [
      naDescricao('CA', 'QUANDO_APLICAVEL', 'EPI sujeito a Certificado de Aprovação'),
      naDescricao('TAMANHO', 'QUANDO_APLICAVEL', 'vestuário, calçado, luva e demais itens com numeração'),
      naDescricao('MATERIAL', 'QUANDO_APLICAVEL', 'material que faz outro produto'),
    ] },
    'CA vencido não se cadastra nem se compra.'),
  regra('bib-atributos-limpeza-copa', 'ATRIBUTOS', 'Limpeza e copa: variante como observação', 'Limpeza, copa, cozinha e utensílios',
    { aspecto: 'ATRIBUTOS', atributos: [emCampo('VARIANTE', 'QUANDO_APLICAVEL', 'cor, fragrância, tipo ou apresentação que não gera código'), naDescricao('MATERIAL', 'QUANDO_APLICAVEL', 'utensílio cujo material faz outro produto')] },
    'Pendente: campo adicional do item para a variante no ERP (a confirmar no piloto).'),
  regra('bib-atributos-alimentos', 'ATRIBUTOS', 'Alimentos: tipo e condição de bebida alcoólica', 'Alimentos e hortifrutigranjeiros do refeitório',
    { aspecto: 'ATRIBUTOS', atributos: [
      naDescricao('TIPO', 'QUANDO_APLICAVEL', 'tipo, corte ou variedade que faz outro produto'),
      emCampo('FINALIDADE'),
      emCampo('BEBIDA_ALCOOLICA', 'QUANDO_APLICAVEL', 'bebidas das posições 22.03 a 22.06 e 22.08'),
    ] },
    'Finalidade "refeitório e jornada de trabalho" separa a alimentação na jornada (LC 214/2025, art. 57, § 3º, IV) da bebida alcoólica, que é uso ou consumo pessoal (art. 57, I) e não dá crédito (art. 57, § 5º).'),
  regra('bib-atributos-saude', 'ATRIBUTOS', 'Saúde: princípio ativo, concentração e registro', 'Medicamentos, vacinas e medicamentos veterinários',
    { aspecto: 'ATRIBUTOS', atributos: [naDescricao('CONCENTRACAO'), emCampo('PRINCIPIO_ATIVO'), emCampo('REGISTRO_ANVISA', 'QUANDO_APLICAVEL', 'medicamento e material de uso humano'), emCampo('REGISTRO_MAPA', 'QUANDO_APLICAVEL', 'produto veterinário')] },
    'Pendente: campos próprios no ERP (a confirmar no piloto).'),

  // UNIDADES ──────────────────────────────────────────────────────────────────
  regra('bib-unidades-padrao', 'UNIDADES', 'Menor unidade prática — todos os grupos', 'Todos os grupos; grupos novos',
    unidades({ criterioEstoque: 'MENOR_PRATICA', unidadeDefinida: null, unidadesCompra: [], unidadesSaida: [], conversoes: [CONV.T_KG, CONV.G_KG, CONV.ML_L, CONV.M3_L, CONV.DZ_UN, CONV.CENTO_UN, CONV.MILHAR_UN] }),
    'Estoque na menor unidade prática da medida (KG, L, M, M2, UN). Unidade maior e embalagem (saca, big bag, galão, caixa, pacote) viram unidade de compra com fator. Fator de embalagem é do produto: sem fator, pendência. Conversão preserva quantidade × valor unitário = total.'),
  regra('bib-unidades-pecas', 'UNIDADES', 'Peças: unidade, jogo, conjunto, kit ou par', 'Peças e componentes de máquinas e implementos',
    unidades({ criterioEstoque: 'MENOR_PRATICA', unidadeDefinida: null, unidadesCompra: ['UN', 'JG', 'CJ', 'KIT', 'PAR', 'CX'], unidadesSaida: ['UN', 'JG', 'CJ', 'KIT', 'PAR'], conversoes: [] }),
    'Jogo, conjunto, kit e par são o próprio item quando vendidos e aplicados juntos; caixa na compra exige o fator do produto.'),
  regra('bib-unidades-fixadores', 'UNIDADES', 'Fixadores: unidade, compra por caixa ou cento', 'Parafusos, porcas, arruelas, pinos e abraçadeiras',
    unidades({ criterioEstoque: 'DEFINIDA', unidadeDefinida: 'UN', unidadesCompra: ['UN', 'CX', 'PCT', 'CENTO', 'MILHAR', 'KG'], unidadesSaida: ['UN'], conversoes: [CONV.CENTO_UN, CONV.MILHAR_UN] }),
    'Compra em KG, caixa ou pacote exige o fator do produto (peças por quilo ou por embalagem).'),
  regra('bib-unidades-medida', 'UNIDADES', 'Materiais por medida', 'Mangueiras e conexões, ferro e aço, construção, ferramentas, pneus, lonas, itens de manejo',
    unidades({ criterioEstoque: 'MENOR_PRATICA', unidadeDefinida: null, unidadesCompra: ['UN', 'M', 'M2', 'KG', 'CX', 'PCT', 'T'], unidadesSaida: ['UN', 'M', 'M2', 'KG'], conversoes: [CONV.T_KG] }),
    'Barra, rolo, bobina e peça inteira só como unidade de compra, com o fator do produto (metros ou quilos).'),
  regra('bib-unidades-insumos-solidos-liquidos', 'UNIDADES', 'Insumos regulados: KG ou L', 'Defensivos, tratamento de sementes, fertilizantes, corretivos',
    unidades({ criterioEstoque: 'MENOR_PRATICA', unidadeDefinida: null, unidadesCompra: ['KG', 'L', 'T', 'SC', 'BB', 'GL', 'CX'], unidadesSaida: ['KG', 'L'], conversoes: [CONV.T_KG, CONV.G_KG, CONV.ML_L] }),
    'Sólidos em KG, líquidos em L. Galão, saca, big bag e caixa na compra exigem o fator do produto; a quantidade da embalagem não vai na descrição.'),
  regra('bib-unidades-sementes', 'UNIDADES', 'Sementes e mudas', 'Sementes para semeadura e mudas',
    unidades({ criterioEstoque: 'MENOR_PRATICA', unidadeDefinida: null, unidadesCompra: ['KG', 'SC', 'BB', 'T', 'UN'], unidadesSaida: ['KG', 'UN'], conversoes: [CONV.T_KG] }),
    'Semente comercializada por número de sementes (sacas de mil sementes ou similares): fator do produto, informado por item. Mudas em UN.'),
  regra('bib-unidades-combustiveis-lubrificantes', 'UNIDADES', 'Combustíveis e lubrificantes: L ou KG', 'Combustíveis, óleos, graxas e aditivos',
    unidades({ criterioEstoque: 'MENOR_PRATICA', unidadeDefinida: null, unidadesCompra: ['L', 'M3', 'KG', 'GL', 'UN'], unidadesSaida: ['L', 'KG'], conversoes: [CONV.M3_L, CONV.ML_L, CONV.G_KG] }),
    'Combustíveis e óleos em L; graxas em KG. Balde, tambor e bombona na compra exigem o fator do produto.'),
  regra('bib-unidades-epi-uniformes', 'UNIDADES', 'EPI e uniformes: unidade ou par', 'EPI, EPC e uniformes',
    unidades({ criterioEstoque: 'MENOR_PRATICA', unidadeDefinida: null, unidadesCompra: ['UN', 'PAR', 'CX', 'PCT'], unidadesSaida: ['UN', 'PAR'], conversoes: [] }),
    'Luva, bota e calçado em PAR. Caixa e pacote na compra exigem o fator do produto. Entrega ao empregado registrada por pessoa.'),
  regra('bib-unidades-consumo', 'UNIDADES', 'Limpeza, copa, alimentos e expediente', 'Limpeza, copa, cozinha, alimentos, material de expediente',
    unidades({ criterioEstoque: 'MENOR_PRATICA', unidadeDefinida: null, unidadesCompra: ['UN', 'KG', 'L', 'CX', 'PCT', 'FD', 'DZ'], unidadesSaida: ['UN', 'KG', 'L'], conversoes: [CONV.DZ_UN, CONV.G_KG, CONV.ML_L] }),
    'Caixa, pacote e fardo na compra exigem o fator do produto.'),
  regra('bib-unidades-plantel', 'UNIDADES', 'Plantel: cabeça', 'Animais do plantel',
    unidades({ criterioEstoque: 'DEFINIDA', unidadeDefinida: 'CABECA', unidadesCompra: ['CABECA'], unidadesSaida: ['CABECA'], conversoes: [] }),
    null),

  // FISCAL ────────────────────────────────────────────────────────────────────
  regra('bib-fiscal-padrao', 'FISCAL', 'NCM e cClassTrib — todos os grupos', 'Todos os grupos; grupos novos',
    fiscal(['ENTRADA', 'SAIDA', 'USO_INTERNO'], [{ alvo: 'SERVICOS', justificativa: 'Serviço classifica-se por NBS, não por NCM.' }]),
    `${OBS_FISCAL_COMUM} Item novo só é liberado com NCM confirmado e finalidade definida; exceção só por escrito do fiscal.`),
  regra('bib-fiscal-pecas-medida', 'FISCAL', 'Peças e materiais: NCM pela natureza da peça', 'Peças, fixadores, rolamentos, filtros, correias, pneus, materiais de manutenção, construção e oficina',
    fiscal(['ENTRADA', 'USO_INTERNO']),
    `${OBS_FISCAL_COMUM} Parte com posição própria nos Capítulos 84 ou 85 fica nela qualquer que seja a máquina (rolamento 84.82, filtro 84.21); fixadores de uso geral no Capítulo 73; correias de borracha vulcanizada em 40.10; pneus e câmaras em 40.11 e 40.13. NCM do fornecedor pela máquina não se herda. Coincidir com anexo de saúde ou acessibilidade por NCM não basta: o produto precisa ser o descrito no anexo. Se o grupo for vendido ou transferido, incluir SAÍDA.`),
  regra('bib-fiscal-insumos-agro', 'FISCAL', 'Insumos agropecuários do Anexo IX', 'Defensivos, tratamento de sementes, fertilizantes, corretivos, sementes e mudas',
    fiscal(['ENTRADA', 'SAIDA', 'USO_INTERNO']),
    `${OBS_FISCAL_COMUM} Classe de referência 200038 só para o produto do Anexo IX com registro no MAPA, quando exigido (LC 214/2025, art. 138, § 1º); sem o requisito, tributação integral (000001). Diferimento (515001) depende da operação. Defensivos: conferir o NCM com a classe de uso do registro no AGROFIT. Adjuvantes em 3402 não estão no item de defensivos. Sementes: só as categorias do item 10 do Anexo IX. O Anexo IX é revisto a cada 120 dias (art. 138, § 10).`),
  regra('bib-fiscal-uso-consumo', 'FISCAL', 'Uso e consumo: finalidade e crédito', 'Limpeza, copa, alimentos do refeitório, EPI, uniformes, expediente, informática, saúde',
    fiscal(['ENTRADA', 'USO_INTERNO']),
    `${OBS_FISCAL_COMUM} Finalidade em campo próprio. Uniformes, EPI e alimentação fornecida na jornada não são uso ou consumo pessoal (LC 214/2025, art. 57, § 3º, IV); bebida alcoólica é (art. 57, I) e não dá crédito (art. 57, § 5º). Anexo VIII (higiene e limpeza) só alcança os produtos que lista: desinfetante e sabão líquido não entram por coincidência de NCM. Se o grupo for vendido ou transferido, incluir SAÍDA.`),
  regra('bib-fiscal-combustiveis', 'FISCAL', 'Combustíveis: incidência única', 'Combustíveis',
    fiscal(['ENTRADA', 'USO_INTERNO']),
    `${OBS_FISCAL_COMUM} Combustíveis têm incidência única do IBS e da CBS (LC 214/2025, art. 172); classe de referência 620001, conferida na tabela cClassTrib vigente.`),
];

// ── Procedimentos (política: cadastro, uso e manutenção) ─────────────────────

const FUNDAMENTO_CREDITO =
  'LC 214/2025, art. 47, caput e § 1º, II: o contribuinte do regime regular apropria crédito de IBS e CBS nas aquisições, exceto as de uso ou consumo pessoal do art. 57, ' +
  'com a operação comprovada por documento fiscal eletrônico idôneo. Art. 57, § 3º: não são de uso ou consumo pessoal os bens utilizados preponderantemente na atividade econômica ' +
  '(o inciso IV cita uniformes, EPI e alimentação fornecida durante a jornada); § 5º: vedado o crédito dos bens de uso ou consumo pessoal.';

export const PROCEDIMENTOS: Procedimento[] = [
  {
    id: 'proc-cadastro-item-novo',
    titulo: 'Cadastro de item novo',
    objetivo: 'Criar no ERP só o item que ainda não existe, já no padrão do grupo e com os campos fiscais validados.',
    fluxo: [
      { tipo: 'passo', texto: 'Pesquisar o cadastro por referência, descrição normalizada (abreviações, grafia e ordem das palavras), unidade, medidas e NCM.', responsavel: 'Solicitante' },
      { tipo: 'decisao', pergunta: 'Existe item com o mesmo produto e o mesmo complemento?', sim: 'Usar o código existente e encerrar.', nao: 'Abrir a solicitação de item novo.', segue: 'NAO' },
      { tipo: 'passo', texto: 'Preencher a solicitação: grupo, descrição no modelo do grupo, unidade de estoque, unidade de compra e fator, tipo do item e finalidade, referência, ficha técnica ou registro; anexar o resultado da pesquisa.', responsavel: 'Solicitante' },
      { tipo: 'passo', texto: 'Conferir campos obrigatórios e refazer a pesquisa de duplicidade.', responsavel: 'Cadastrador central' },
      { tipo: 'decisao', pergunta: 'Campos completos e sem duplicidade?', sim: 'Enviar ao aprovador técnico do grupo.', nao: 'Devolver ao solicitante com o motivo.' },
      { tipo: 'passo', texto: 'Validar descrição, referência e atributos técnicos do grupo.', responsavel: 'Aprovador técnico do grupo' },
      { tipo: 'passo', texto: 'Confirmar o NCM (verificações V1 a V7) e definir o cClassTrib de referência (passos C1 a C7), com fundamento e evidência.', responsavel: 'Fiscal' },
      { tipo: 'decisao', pergunta: 'NCM confirmado e finalidade definida?', sim: 'Liberar para criação.', nao: 'Manter a solicitação em revisão; exceção só por escrito do fiscal.' },
      { tipo: 'passo', texto: 'Criar o item no ERP, liberar e informar o código ao solicitante.', responsavel: 'Cadastrador central' },
    ],
    regras: [
      'Só o cadastrador central (ou o substituto) cria item; quem compra não cria.',
      'Variante (cor, tamanho, lado, sabor) é outro item, exceto nos grupos em que a variante é observação.',
      'Original e paralelos ficam no mesmo código.',
      'Código sequencial gerado pelo ERP, sem significado; código inativado não é reaproveitado.',
      'Prazo de atendimento: 2 dias úteis da solicitação completa à liberação.',
    ],
    evidencias: [
      'Solicitação com o resultado da pesquisa de duplicidade.',
      'Aprovação técnica com data e autor.',
      'Registro fiscal: NCM, fundamento, evidência (ficha técnica, solução de consulta ou NF-e do fabricante), cClassTrib de referência, responsável e data.',
      'Registro de criação no ERP (usuário e data).',
    ],
    fundamento: null,
  },
  {
    id: 'proc-alteracao-item',
    titulo: 'Alteração de item',
    objetivo: 'Corrigir ou completar o cadastro sem mudar a identidade de item que já tem saldo ou histórico.',
    fluxo: [
      { tipo: 'passo', texto: 'Pedir a alteração com o motivo, o antes e o depois e a evidência (ficha técnica, catálogo, nota do fabricante).', responsavel: 'Solicitante' },
      { tipo: 'decisao', pergunta: 'A alteração muda o produto (referência, medida, material ou especificação)?', sim: 'Não alterar: cadastrar item novo e tratar o antigo por unificação ou inativação (de/para).', nao: 'Seguir com a alteração.', segue: 'NAO' },
      { tipo: 'decisao', pergunta: 'Muda a unidade de estoque de item com saldo?', sim: 'Converter quantidade e custo unitário pelo fator aprovado, preservando o valor total, no mesmo ato.', nao: 'Seguir.', segue: 'NAO' },
      { tipo: 'decisao', pergunta: 'Muda NCM, tipo do item ou finalidade?', sim: 'Enviar ao fiscal para validar (V1 a V7 e C1 a C7).', nao: 'Enviar ao aprovador técnico do grupo.' },
      { tipo: 'passo', texto: 'Aprovar a alteração.', responsavel: 'Aprovador técnico do grupo ou fiscal' },
      { tipo: 'passo', texto: 'Gravar no ERP com data, autor e aprovador; preservar a descrição anterior no histórico.', responsavel: 'Cadastrador central' },
    ],
    regras: [
      'Padronizar a grafia não funde itens; a descrição original fica no histórico.',
      'Item com documentos não muda de identidade: produto diferente é código novo com de/para.',
      'Toda alteração segue o modelo do grupo e a lista de abreviações aprovada.',
      'Alteração de NCM nunca por presunção: só com evidência registrada.',
    ],
    evidencias: ['Pedido com antes, depois, motivo e evidência.', 'Aprovação ligada à alteração específica.', 'Histórico do ERP com data, autor e valores anteriores.'],
    fundamento: null,
  },
  {
    id: 'proc-unificacao-codigos',
    titulo: 'Unificação de códigos',
    objetivo: 'Deixar um único código por produto, com o saldo transferido e o código antigo inativado, sem perder histórico.',
    fluxo: [
      { tipo: 'passo', texto: 'Levantar os pares candidatos (pesquisa de duplicidade ou ferramenta de saneamento).', responsavel: 'Curador do cadastro' },
      { tipo: 'decisao', pergunta: 'A área técnica confirma que é o mesmo produto?', sim: 'Seguir com a unificação.', nao: 'Manter os dois códigos e registrar a decisão (variante ou produto distinto).' },
      { tipo: 'passo', texto: 'Escolher o código que fica: maior saldo; depois movimentação mais recente; depois cadastro mais completo; depois menor código.', responsavel: 'Curador do cadastro' },
      { tipo: 'decisao', pergunta: 'Unidade de estoque e NCM são iguais nos dois códigos?', sim: 'Seguir.', nao: 'Harmonizar antes: fator de conversão aprovado e NCM confirmado pelo fiscal.' },
      { tipo: 'decisao', pergunta: 'O código que sai tem pedido, requisição, ordem de serviço ou outro documento aberto?', sim: 'Concluir ou transferir os documentos antes.', nao: 'Seguir.', segue: 'NAO' },
      { tipo: 'passo', texto: 'Aprovar o de/para (código que sai, código que fica, motivo).', responsavel: 'Aprovador técnico do grupo' },
      { tipo: 'passo', texto: 'Transferir o saldo para o código que fica, pelo mesmo custo, com documento de estoque no ERP.', responsavel: 'Almoxarifado e controladoria' },
      { tipo: 'passo', texto: 'Atualizar vínculos: planos de manutenção, cartilhas, listas de materiais e catálogo.', responsavel: 'Curador do cadastro' },
      { tipo: 'passo', texto: 'Inativar o código que sai (bloqueio de compra e de movimento), sem excluir.', responsavel: 'Cadastrador central' },
      { tipo: 'decisao', pergunta: 'Saldo do código antigo é zero e o do código que fica soma os dois em quantidade e valor?', sim: 'Encerrar com a evidência arquivada.', nao: 'Corrigir a transferência antes de encerrar.' },
    ],
    regras: [
      'Semelhança de texto não prova duplicidade: unificação só com confirmação técnica.',
      'Item com saldo ou histórico não se funde por texto: sempre de/para.',
      'Código inativado não é reaproveitado.',
      'O de/para guarda os códigos e os NCM antigos e novos.',
    ],
    evidencias: ['De/para aprovado.', 'Saldos antes e depois, em quantidade e valor, dos dois códigos.', 'Documento de transferência de saldo no ERP.', 'Registro da inativação.'],
    fundamento: null,
  },
  {
    id: 'proc-inativacao-sem-movimento',
    titulo: 'Inativação por falta de movimento',
    objetivo: 'Retirar de uso o item parado, com saldo zerado antes e sem excluir o histórico.',
    fluxo: [
      { tipo: 'passo', texto: 'Gerar a lista de candidatos: itens sem movimentação desde a data de corte aprovada.', responsavel: 'Curador do cadastro' },
      { tipo: 'passo', texto: 'Verificar saldo, documentos abertos, vínculos (planos de manutenção, cartilhas, listas de materiais) e marca de item crítico.', responsavel: 'Curador do cadastro' },
      { tipo: 'decisao', pergunta: 'O item é crítico ou tem documento aberto ou vínculo ativo?', sim: 'Manter ativo com justificativa, ou resolver o vínculo antes.', nao: 'Seguir.', segue: 'NAO' },
      { tipo: 'decisao', pergunta: 'O item tem saldo?', sim: 'Zerar antes: consumir, transferir para código ativo (unificação) ou baixar por ajuste de inventário aprovado, com o tratamento fiscal definido pelo fiscal.', nao: 'Seguir.', segue: 'NAO' },
      { tipo: 'passo', texto: 'Aprovar a inativação: em lote por grupo, com lista fechada de códigos, ou item a item.', responsavel: 'Aprovador técnico do grupo' },
      { tipo: 'passo', texto: 'Inativar no ERP (bloqueio de uso), sem excluir.', responsavel: 'Cadastrador central' },
      { tipo: 'passo', texto: 'Conferir na extração seguinte: itens inativos, sem saldo e sem movimento novo.', responsavel: 'Curador do cadastro' },
    ],
    regras: [
      'A data de corte seleciona candidatos; não autoriza a inativação.',
      'A aprovação em lote vale só para a lista fechada; item que entrar depois volta ao fluxo.',
      'Inativação é reversível: reativar pelo fluxo de alteração, com motivo.',
      'Item inativo não recebe compra nem movimento.',
    ],
    evidencias: ['Lista aprovada (base e data analisadas, verificações, aprovador e justificativa).', 'Documento de baixa ou transferência do saldo, quando houver.', 'Registro da inativação no ERP.'],
    fundamento: null,
  },
  {
    id: 'proc-retirada-uso-materiais',
    titulo: 'Retirada e uso de materiais',
    objetivo: 'Registrar quem retirou, para onde foi e em que foi usado cada material, para comprovar o uso na atividade e sustentar o crédito de IBS e CBS.',
    fluxo: [
      { tipo: 'passo', texto: 'Emitir a requisição no ERP: item, quantidade, depósito de origem, centro de custo e destino (equipamento ou ordem de serviço, ou a atividade).', responsavel: 'Requisitante' },
      { tipo: 'decisao', pergunta: 'A requisição tem centro de custo e destino?', sim: 'Enviar para autorização.', nao: 'Devolver ao requisitante para completar.' },
      { tipo: 'passo', texto: 'Autorizar a retirada.', responsavel: 'Gestor do centro de custo (peças: manutenção/PCM)' },
      { tipo: 'decisao', pergunta: 'Retirada autorizada?', sim: 'Separar o material.', nao: 'Encerrar a requisição com o motivo.' },
      { tipo: 'passo', texto: 'Separar, entregar e colher a identificação de quem recebe.', responsavel: 'Almoxarife' },
      { tipo: 'passo', texto: 'Dar baixa no ERP no mesmo dia, com o documento de saída ligado à requisição, ao centro de custo e ao equipamento ou ordem de serviço.', responsavel: 'Almoxarife' },
      { tipo: 'decisao', pergunta: 'Sobrou material ou o item não foi usado?', sim: 'Devolver ao depósito com documento de devolução ligado à requisição.', nao: 'Encerrar a requisição.' },
      { tipo: 'passo', texto: 'Conciliar no mês requisições, baixas e ordens de serviço encerradas; investigar divergências.', responsavel: 'Controladoria' },
    ],
    regras: [
      'Nenhuma saída de estoque sem requisição autorizada.',
      'Peça aplicada em máquina sai sempre ligada a ordem de serviço aberta.',
      'EPI e uniforme: entrega registrada por empregado.',
      'Alimentação do refeitório: saída para o centro de custo do refeitório.',
      'Bem entregue sem ônus a sócio, administrador, empregado ou parente, fora dos casos de uso na atividade, é registrado como tal: não dá crédito.',
      'Transferência entre depósitos não é consumo: usa documento próprio.',
    ],
    evidencias: ['Requisição autorizada.', 'Documento de saída do estoque com centro de custo e equipamento ou ordem de serviço.', 'Identificação de quem recebeu.', 'Documento de devolução, quando houver.', 'Conciliação mensal assinada.'],
    fundamento: `${FUNDAMENTO_CREDITO} O registro do destino de cada retirada demonstra o uso na atividade.`,
  },
  {
    id: 'proc-classificacao-fiscal-item',
    titulo: 'Classificação fiscal do item (NCM e cClassTrib)',
    objetivo: 'Chegar ao NCM pela natureza do produto e ao cClassTrib de referência pela operação, com fundamento e evidência guardados.',
    fluxo: [
      { tipo: 'passo', texto: 'V1: conferir 8 dígitos e existência do NCM na tabela vigente (Siscomex).', responsavel: 'Automático' },
      { tipo: 'passo', texto: 'V2 a V4: identificar o produto (nome, material, função, composição, registro), aplicar as RGI e as Notas e conferir a coerência com itens de mesmo nome.', responsavel: 'Fiscal' },
      { tipo: 'passo', texto: 'V5 e V6: juntar a evidência (solução de consulta, ficha técnica ou registro, NF-e do fabricante) e justificar posição residual "Outros".', responsavel: 'Fiscal' },
      { tipo: 'decisao', pergunta: 'NCM confirmado com evidência?', sim: 'Registrar (V7) e seguir para o cClassTrib.', nao: 'Item em revisão, sem cClassTrib de referência.' },
      { tipo: 'passo', texto: 'C1 a C3: definir operação e partes e procurar o NCM nos anexos da LC 214/2025, pelo prefixo mais específico.', responsavel: 'Fiscal' },
      { tipo: 'decisao', pergunta: 'O produto cumpre o requisito do anexo (descrição do item, registro no MAPA ou na Anvisa, destinação)?', sim: 'Adotar a classe do anexo.', nao: 'Tributação integral (000001) com o fundamento, ou revisão até o registro chegar.' },
      { tipo: 'passo', texto: 'C5 a C7: validar a classe na tabela cClassTrib vigente, confrontar com a NF-e e registrar classe, CST, fundamento, fonte, vigência, responsável e data.', responsavel: 'Fiscal' },
    ],
    regras: [
      'NCM pela natureza do produto; a compra confere, o uso não define.',
      'Divergência com a NF-e de compra abre revisão; se o erro é da nota, pedir correção ao fornecedor.',
      'Nunca copiar a classe de item parecido nem a do fornecedor sem os passos C2 a C5.',
      'Dossiê por família: um documento sustenta todos os itens da mesma família.',
      'Revalidar quando mudar a tabela NCM, a tabela cClassTrib, o Anexo IX, o produto ou o fornecedor, e na revisão anual.',
    ],
    evidencias: ['Dossiê da família (ficha técnica, solução de consulta ou NF-e do fabricante).', 'Registro do NCM e da classe com fundamento, fonte e versão, responsável e data.'],
    fundamento: 'LC 214/2025, art. 138, § 1º: a redução dos insumos do Anexo IX alcança os produtos registrados no MAPA, quando exigido; § 10: revisão do Anexo IX a cada 120 dias.',
  },
  {
    id: 'proc-manutencao-saneamento',
    titulo: 'Manutenção periódica do saneamento',
    objetivo: 'Manter o cadastro no padrão depois do saneamento, com responsável, rotina, gatilhos e indicadores.',
    fluxo: [
      { tipo: 'passo', texto: 'Nomear o curador do cadastro e o substituto, com autoridade para recusar cadastro fora do padrão.', responsavel: 'Diretoria' },
      { tipo: 'passo', texto: 'Mensal: extrair a base e reaplicar as verificações; tratar novos cadastros fora do padrão, duplicidades novas e divergências de endereço.', responsavel: 'Curador do cadastro' },
      { tipo: 'passo', texto: 'Trimestral: revisar grupos e itens sem movimento (procedimento de inativação).', responsavel: 'Curador do cadastro' },
      { tipo: 'passo', texto: 'Anual: revisão geral e fiscal (NCM, NBS, cClassTrib) e revisão da política.', responsavel: 'Curador do cadastro e fiscal' },
      { tipo: 'decisao', pergunta: 'Houve gatilho (troca de fornecedor ou marca, mudança de catálogo, novo modelo de máquina, novo grupo, mudança na tabela NCM, nos anexos da LC 214/2025 ou na tabela cClassTrib)?', sim: 'Revisar os itens afetados fora da rotina.', nao: 'Seguir a rotina.', segue: 'NAO' },
      { tipo: 'passo', texto: 'Publicar os indicadores do mês e comparar com as metas.', responsavel: 'Curador do cadastro' },
      { tipo: 'decisao', pergunta: 'Algum indicador abaixo da meta?', sim: 'Plano de ação com responsável e prazo.', nao: 'Arquivar o relatório do mês.', segue: 'NAO' },
    ],
    regras: [
      'Indicadores: novos cadastros no padrão; duplicidades novas por mês; tempo de cadastro; itens com NCM confirmado e evidência; itens com referência na descrição; compras fora do processo.',
      'Metas de referência: 100% dos itens novos no padrão; zero duplicidade nova; cadastro em até 2 dias úteis; 100% de NCM confirmado nos grupos tratados.',
      'Toda alteração com data, autor e aprovador; de/para e base saneada mantidos como referência.',
      'Política apresentada a compras, almoxarifado, manutenção, fiscal e contabilidade; cadastrador e aprovadores treinados antes de liberar o fluxo.',
    ],
    evidencias: ['Ato de nomeação do curador e do substituto.', 'Relatório mensal de verificações e indicadores.', 'Registro das revisões por gatilho.', 'Lista de presença dos treinamentos.'],
    fundamento: 'LC 214/2025, art. 138, § 10: o Anexo IX é revisto a cada 120 dias, um dos gatilhos de revisão fiscal.',
  },
];

// ── Modelos de atribuição ────────────────────────────────────────────────────

export type ModeloDiretrizes = {
  id: string;
  nome: string;
  descricao: string;
  atribuicoes: { aspecto: Aspecto; bibliotecaId: string; grupos: 'TODOS' | string[] }[];
};

/** Nomes dos grupos como estão no mapa dos 52 grupos da política da Crestani (seção 2.3). */
const G = {
  defensivos: ['INSETICIDAS', 'HERBICIDAS', 'FUNGICIDAS', 'OUTROS DEFENSIVOS', 'TRATAMENTO DE SEMENTES'],
  fertilizantes: ['FERTILIZANTES', 'CORRETIVOS DE SOLO'],
  sementes: ['SEMENTES MP', 'SEMENTES GERMINARE', 'MUDAS'],
  pecas: ['MATERIAIS PARA MANUTENCAO CORPO DE MAQUINA', 'ANEIS/ ROLAMENTOS/RETENTORES E JUNTAS', 'ELETRICA / ELETRONICA AUTOMOTIVA', 'FILTROS', 'CORREIAS E POLIAS', 'MOTORES/TRANSMISSOES/CAMBIOS'],
  fixadores: ['PARAFUSOS  E FIXADORES'],
  medida: ['MATERIAIS PARA CONSTRUCAO E RELACIONADOS', 'FERRAMENTAS / ITENS OFICINA', 'MANGUEIRA /CONEXOES HIDRAULICAS E PNEUMATICAS', 'PNEUS/CAMARAS/BORRACHARIA', 'FERRO/ACO', 'PECUARIA - ITENS'],
  lubrificantes: ['LUBRIFICANTES/GRAXAS/ADITIVOS'],
  combustiveis: ['COMBUSTIVEIS'],
  especificacaoOutros: ['PECUARIA - NUTRICAO', 'PRODUCAO', 'PECUARIA - PLANTEL'],
  epi: ['EPI - EPC SEGURANCA INDIVIDUAL SSMA', 'UNIFORMES'],
  limpeza: ['LIMPEZA/COPA/COZINHA/UTENSILIOS'],
  alimentos: ['ALIMENTOS / HORTA'],
  saude: ['MEDICAMENTOS FARMACEUTICOS', 'PECUARIA - VACINAS/MEDICAMENTOS'],
  expediente: ['MATERIAIS DE EXPEDIENTE', 'INFORMATICA/RADIOCOMUNICACAO'],
  embalagens: ['MATERIAIS PARA BENEFECIAMENTO/ INDUSTRIALIZACAO', 'LONAS E PLASTICOS PARA COBERTURAS GERAIS'],
};

export const MODELOS: ModeloDiretrizes[] = [
  {
    id: 'modelo-fal-insumos-agro-crestani',
    nome: 'Modelo FAL — Agropecuária: insumos, peças e uso e consumo (base Crestani)',
    descricao:
      'Regras por família para os grupos da Agropecuária Crestani: insumos regulados (defensivos, fertilizantes, sementes), peças e materiais de manutenção, ' +
      'combustíveis e lubrificantes, EPI, consumo e refeitório. Grupos genéricos (a reclassificar), serviços, imobilizado e terceiros ficam no padrão de todos os grupos.',
    atribuicoes: [
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-padrao', grupos: 'TODOS' },
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-defensivos', grupos: G.defensivos },
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-fertilizantes', grupos: G.fertilizantes },
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-sementes', grupos: G.sementes },
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-pecas', grupos: G.pecas },
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-medida', grupos: [...G.fixadores, ...G.medida] },
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-especificacao', grupos: [...G.lubrificantes, ...G.combustiveis, ...G.especificacaoOutros] },
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-epi-uniformes', grupos: G.epi },
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-limpeza-copa', grupos: G.limpeza },
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-alimentos', grupos: G.alimentos },
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-saude', grupos: G.saude },
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-expediente-informatica', grupos: G.expediente },
      { aspecto: 'NOMES', bibliotecaId: 'bib-nomes-embalagens', grupos: G.embalagens },

      { aspecto: 'ATRIBUTOS', bibliotecaId: 'bib-atributos-padrao', grupos: 'TODOS' },
      { aspecto: 'ATRIBUTOS', bibliotecaId: 'bib-atributos-defensivos', grupos: G.defensivos },
      { aspecto: 'ATRIBUTOS', bibliotecaId: 'bib-atributos-fertilizantes', grupos: G.fertilizantes },
      { aspecto: 'ATRIBUTOS', bibliotecaId: 'bib-atributos-sementes', grupos: G.sementes },
      { aspecto: 'ATRIBUTOS', bibliotecaId: 'bib-atributos-pecas', grupos: G.pecas },
      { aspecto: 'ATRIBUTOS', bibliotecaId: 'bib-atributos-medida', grupos: [...G.fixadores, ...G.medida] },
      { aspecto: 'ATRIBUTOS', bibliotecaId: 'bib-atributos-especificacao', grupos: [...G.lubrificantes, ...G.combustiveis, ...G.especificacaoOutros] },
      { aspecto: 'ATRIBUTOS', bibliotecaId: 'bib-atributos-epi-uniformes', grupos: G.epi },
      { aspecto: 'ATRIBUTOS', bibliotecaId: 'bib-atributos-limpeza-copa', grupos: G.limpeza },
      { aspecto: 'ATRIBUTOS', bibliotecaId: 'bib-atributos-alimentos', grupos: G.alimentos },
      { aspecto: 'ATRIBUTOS', bibliotecaId: 'bib-atributos-saude', grupos: G.saude },

      { aspecto: 'UNIDADES', bibliotecaId: 'bib-unidades-padrao', grupos: 'TODOS' },
      { aspecto: 'UNIDADES', bibliotecaId: 'bib-unidades-insumos-solidos-liquidos', grupos: [...G.defensivos, ...G.fertilizantes] },
      { aspecto: 'UNIDADES', bibliotecaId: 'bib-unidades-sementes', grupos: G.sementes },
      { aspecto: 'UNIDADES', bibliotecaId: 'bib-unidades-pecas', grupos: G.pecas },
      { aspecto: 'UNIDADES', bibliotecaId: 'bib-unidades-fixadores', grupos: G.fixadores },
      { aspecto: 'UNIDADES', bibliotecaId: 'bib-unidades-medida', grupos: [...G.medida, ...G.embalagens] },
      { aspecto: 'UNIDADES', bibliotecaId: 'bib-unidades-combustiveis-lubrificantes', grupos: [...G.lubrificantes, ...G.combustiveis] },
      { aspecto: 'UNIDADES', bibliotecaId: 'bib-unidades-epi-uniformes', grupos: G.epi },
      { aspecto: 'UNIDADES', bibliotecaId: 'bib-unidades-consumo', grupos: [...G.limpeza, ...G.alimentos, ...G.expediente] },
      { aspecto: 'UNIDADES', bibliotecaId: 'bib-unidades-plantel', grupos: ['PECUARIA - PLANTEL'] },

      { aspecto: 'FISCAL', bibliotecaId: 'bib-fiscal-padrao', grupos: 'TODOS' },
      { aspecto: 'FISCAL', bibliotecaId: 'bib-fiscal-insumos-agro', grupos: [...G.defensivos, ...G.fertilizantes, ...G.sementes] },
      { aspecto: 'FISCAL', bibliotecaId: 'bib-fiscal-pecas-medida', grupos: [...G.pecas, ...G.fixadores, ...G.medida] },
      { aspecto: 'FISCAL', bibliotecaId: 'bib-fiscal-uso-consumo', grupos: [...G.epi, ...G.limpeza, ...G.alimentos, ...G.expediente, ...G.saude] },
      { aspecto: 'FISCAL', bibliotecaId: 'bib-fiscal-combustiveis', grupos: G.combustiveis },
    ],
  },
];
