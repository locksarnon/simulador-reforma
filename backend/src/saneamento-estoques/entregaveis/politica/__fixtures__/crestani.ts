/** Dados realistas (grupos da Crestani) para os testes e o PDF de exemplo da política. */
import { ASPECTOS, type Aspecto, type Procedimento } from '../../../diretrizes/tipos';
import type { DadosPolitica, RegraPolitica } from '../tipos';

export const GRUPOS_CRESTANI = [
  'INSETICIDAS', 'HERBICIDAS', 'FUNGICIDAS', 'OUTROS DEFENSIVOS', 'TRATAMENTO DE SEMENTES', 'FERTILIZANTES', 'CORRETIVOS DE SOLO', 'SEMENTES',
  'PRODUCAO', 'COMBUSTIVEIS', 'LUBRIFICANTES', 'PECAS DE MANUTENCAO', 'FERRAMENTAS', 'MATERIAL DE CONSTRUCAO', 'LIMPEZA/COPA/COZINHA/UTENSILIOS',
  'ALIMENTOS / HORTA', 'EXPEDIENTE',
];
const DEFENSIVOS = ['INSETICIDAS', 'HERBICIDAS', 'FUNGICIDAS', 'OUTROS DEFENSIVOS', 'TRATAMENTO DE SEMENTES'];

const aprovada = { situacao: 'APROVADA' as const, aprovadaPor: 'Consultor responsável FAL Agro', aprovadaEm: '2026-11-20T14:00:00Z' };
const rascunho = { situacao: 'RASCUNHO' as const, aprovadaPor: null, aprovadaEm: null };

export const REGRAS_CRESTANI: RegraPolitica[] = [
  {
    codigo: 'N01', aspecto: 'NOMES', nome: 'Padrão geral de nomes', abrangencia: { todos: true }, observacao: null, ...aprovada,
    conteudo: {
      aspecto: 'NOMES', componentes: ['NOME', 'REFERENCIA', 'MARCA', 'APRESENTACAO', 'COMPLEMENTO'], obrigatorios: ['NOME', 'REFERENCIA'], separador: ' ',
      capitalizacao: 'MAIUSCULAS', removerEspacosDuplicados: true,
      abreviacoes: [
        { completa: 'EMBALAGEM', abreviacao: 'EMB' }, { completa: 'QUILOGRAMA', abreviacao: 'KG' }, { completa: 'LITRO', abreviacao: 'L' },
        { completa: 'UNIDADE', abreviacao: 'UN' }, { completa: 'DIÂMETRO', abreviacao: 'DIAM' }, { completa: 'COMPRIMENTO', abreviacao: 'COMP' },
        { completa: 'ROLAMENTO', abreviacao: 'ROL' }, { completa: 'GALÃO', abreviacao: 'GL' },
      ],
      termosProibidos: [{ termo: 'DIVERSOS', substituicao: null }, { termo: 'GENERICO', substituicao: null }, { termo: 'P/', substituicao: 'PARA' }],
    },
  },
  {
    codigo: 'N02', aspecto: 'NOMES', nome: 'Nomes de defensivos agrícolas', abrangencia: { todos: false, grupos: DEFENSIVOS }, observacao: 'Nome comercial conforme o registro no MAPA.', ...aprovada,
    conteudo: {
      aspecto: 'NOMES', componentes: ['NOME', 'CARACTERISTICA', 'APRESENTACAO'], obrigatorios: ['NOME', 'APRESENTACAO'], separador: ' ',
      capitalizacao: 'MAIUSCULAS', removerEspacosDuplicados: true, abreviacoes: [{ completa: 'GALÃO', abreviacao: 'GL' }, { completa: 'BOMBONA', abreviacao: 'BB' }], termosProibidos: [],
    },
  },
  {
    codigo: 'N03', aspecto: 'NOMES', nome: 'Nomes de peças de manutenção', abrangencia: { todos: false, grupos: ['PECAS DE MANUTENCAO'] }, observacao: null, ...rascunho,
    conteudo: {
      aspecto: 'NOMES', componentes: ['NOME', 'CARACTERISTICA', 'REFERENCIA', 'MARCA'], obrigatorios: ['REFERENCIA'], separador: ' ',
      capitalizacao: 'MAIUSCULAS', removerEspacosDuplicados: true, abreviacoes: [{ completa: 'ROLAMENTO', abreviacao: 'ROL' }], termosProibidos: [],
    },
  },
  {
    codigo: 'A01', aspecto: 'ATRIBUTOS', nome: 'Atributos de defensivos agrícolas', abrangencia: { todos: false, grupos: DEFENSIVOS }, observacao: null, ...aprovada,
    conteudo: {
      aspecto: 'ATRIBUTOS', atributos: [
        { atributo: 'PRINCIPIO_ATIVO', onde: 'CAMPO_PROPRIO', campo: 'Princípio ativo', aplicabilidade: 'OBRIGATORIO' },
        { atributo: 'CONCENTRACAO', onde: 'DESCRICAO', aplicabilidade: 'OBRIGATORIO' },
        { atributo: 'FORMULACAO', onde: 'CAMPO_PROPRIO', campo: 'Formulação', aplicabilidade: 'QUANDO_APLICAVEL', condicao: 'produtos com mais de uma formulação registrada' },
        { atributo: 'REGISTRO_MAPA', onde: 'CAMPO_PROPRIO', campo: 'Registro MAPA', aplicabilidade: 'OBRIGATORIO' },
        { atributo: 'MARCA', onde: 'AMBOS', campo: 'Fabricante', aplicabilidade: 'OBRIGATORIO' },
      ],
    },
  },
  {
    codigo: 'A02', aspecto: 'ATRIBUTOS', nome: 'Atributos de fertilizantes e corretivos', abrangencia: { todos: false, grupos: ['FERTILIZANTES', 'CORRETIVOS DE SOLO'] }, observacao: null, ...aprovada,
    conteudo: {
      aspecto: 'ATRIBUTOS', atributos: [
        { atributo: 'COMPOSICAO', onde: 'DESCRICAO', aplicabilidade: 'OBRIGATORIO' },
        { atributo: 'APRESENTACAO', onde: 'DESCRICAO', aplicabilidade: 'OBRIGATORIO' },
        { atributo: 'TEOR_DE_UMIDADE', onde: 'CAMPO_PROPRIO', campo: 'Observação técnica', aplicabilidade: 'QUANDO_APLICAVEL', condicao: 'corretivos vendidos a granel' },
      ],
    },
  },
  {
    codigo: 'U01', aspecto: 'UNIDADES', nome: 'Unidades e embalagens', abrangencia: { todos: true }, observacao: null, ...aprovada,
    conteudo: {
      aspecto: 'UNIDADES', criterioEstoque: 'MENOR_PRATICA', unidadeDefinida: null, unidadesCompra: ['UN', 'CX', 'KG', 'L', 'SC', 'TON'], unidadesSaida: ['UN', 'KG', 'L'],
      conversoes: [
        { origem: 'TON', destino: 'KG', fator: 1000, abrangencia: 'GRUPO' },
        { origem: 'CX', destino: 'UN', fator: 12, abrangencia: 'PRODUTO', codigoProduto: '200451' },
        { origem: 'GL', destino: 'L', fator: 5, abrangencia: 'PRODUTO', codigoProduto: '100234' },
        { origem: 'SC', destino: 'KG', fator: 22.5, abrangencia: 'PRODUTO', codigoProduto: '310877' },
      ],
      conversaoDesconhecida: 'PENDENCIA',
    },
  },
  {
    codigo: 'U02', aspecto: 'UNIDADES', nome: 'Unidades de combustíveis e lubrificantes', abrangencia: { todos: false, grupos: ['COMBUSTIVEIS', 'LUBRIFICANTES'] }, observacao: null, ...aprovada,
    conteudo: {
      aspecto: 'UNIDADES', criterioEstoque: 'DEFINIDA', unidadeDefinida: 'L', unidadesCompra: ['L', 'M3'], unidadesSaida: ['L'],
      conversoes: [{ origem: 'M3', destino: 'L', fator: 1000, abrangencia: 'GRUPO' }], conversaoDesconhecida: 'PENDENCIA',
    },
  },
  {
    codigo: 'L01', aspecto: 'LIMITES', nome: 'Limites de caracteres da descrição', abrangencia: { todos: true }, observacao: null, ...aprovada,
    conteudo: {
      aspecto: 'LIMITES', linhas: [
        { destino: 'NF-e', campo: 'xProd', campoItem: 'descricao', limite: 120, origem: 'LEIAUTE_OFICIAL', referencia: 'MOC da NF-e, Anexo I, campo I04', confirmado: true, tratamento: 'SUGERIR_ABREVIACAO', preservar: ['NOME', 'REFERENCIA'] },
        { destino: 'SPED EFD ICMS/IPI', campo: 'Registro 0200, DESCR_ITEM', campoItem: 'descricao', limite: null, origem: 'LEIAUTE_OFICIAL', referencia: null, confirmado: false, tratamento: 'SUGERIR_ABREVIACAO', preservar: ['NOME', 'REFERENCIA'] },
        { destino: 'SAP Business One', campo: 'OITM.ItemName', campoItem: 'descricao', limite: 100, origem: 'ERP', referencia: null, confirmado: false, tratamento: 'SOLICITAR_REVISAO', preservar: ['NOME'] },
      ],
    },
  },
  {
    codigo: 'F01', aspecto: 'FISCAL', nome: 'Classificação fiscal dos itens', abrangencia: { todos: true }, observacao: null, ...aprovada,
    conteudo: { aspecto: 'FISCAL', validarNcm: true, excecoesNcm: [], validarCClassTrib: true, cenarios: ['ENTRADA', 'SAIDA', 'USO_INTERNO'], ausente: 'PENDENCIA', ambiguo: 'REVISAO_FISCAL' },
  },
  {
    codigo: 'F02', aspecto: 'FISCAL', nome: 'Classificação fiscal da produção própria', abrangencia: { todos: false, grupos: ['PRODUCAO'] }, observacao: null, ...rascunho,
    conteudo: {
      aspecto: 'FISCAL', validarNcm: true, validarCClassTrib: true, cenarios: ['SAIDA'], ausente: 'PENDENCIA', ambiguo: 'REVISAO_FISCAL',
      excecoesNcm: [{ alvo: 'Algodão em caroço', justificativa: 'Produto in natura da produção própria; NCM conferido na saída para a algodoeira.' }],
    },
  },
];

export const PROCEDIMENTOS_CRESTANI: Procedimento[] = [
  {
    id: 'cadastro-novo', titulo: 'Cadastro de item novo',
    objetivo: 'Garantir que todo item entre no cadastro já no padrão da política, sem duplicar um código existente.',
    fluxo: [
      { tipo: 'passo', texto: 'Solicitar o cadastro com descrição, unidade, NCM e grupo', responsavel: 'Solicitante' },
      { tipo: 'decisao', pergunta: 'O item é novo (sem equivalente no cadastro)?', sim: 'seguir com o cadastro', nao: 'Usar o código já existente' },
      { tipo: 'passo', texto: 'Montar a descrição conforme a regra de nomes do grupo e conferir o limite de caracteres', responsavel: 'Cadastro' },
      { tipo: 'passo', texto: 'Conferir NCM e classificação tributária (cClassTrib) nos cenários do grupo', responsavel: 'Fiscal' },
      { tipo: 'decisao', pergunta: 'Todos os campos obrigatórios estão preenchidos?', sim: 'liberar o item', nao: 'Devolver ao solicitante indicando o campo que falta' },
      { tipo: 'passo', texto: 'Liberar o item no ERP', responsavel: 'Cadastro' },
    ],
    regras: ['Não criar item com termo genérico (ex.: DIVERSOS)', 'Unidade de estoque conforme a regra de unidades do grupo'],
    evidencias: ['Solicitação de cadastro com data e solicitante', 'Registro da conferência fiscal'],
    fundamento: null,
  },
  {
    id: 'alteracao', titulo: 'Alteração de cadastro',
    objetivo: 'Alterar descrição, unidade ou classificação sem perder o histórico do item.',
    fluxo: [
      { tipo: 'passo', texto: 'Registrar o pedido de alteração com o motivo', responsavel: 'Solicitante' },
      { tipo: 'decisao', pergunta: 'A alteração mantém a natureza do item?', sim: 'alterar o cadastro existente', nao: 'Tratar como cadastro de item novo' },
      { tipo: 'passo', texto: 'Aplicar a alteração e guardar o valor anterior', responsavel: 'Cadastro' },
    ],
    regras: ['Mudança de unidade exige o fator de conversão e o ajuste do saldo'],
    evidencias: ['Valor anterior, novo valor, responsável e data'],
    fundamento: null,
  },
  {
    id: 'unificacao', titulo: 'Unificação de códigos',
    objetivo: 'Concentrar em um só código os itens duplicados, com o saldo transferido e o vínculo registrado.',
    fluxo: [
      { tipo: 'passo', texto: 'Identificar os códigos duplicados e escolher o código que permanece', responsavel: 'Cadastro' },
      { tipo: 'decisao', pergunta: 'As unidades dos códigos são iguais?', sim: 'transferir o saldo', nao: 'Converter pelo fator aprovado e então transferir o saldo' },
      { tipo: 'passo', texto: 'Transferir o saldo e registrar o vínculo entre o código antigo e o novo', responsavel: 'Estoque' },
      { tipo: 'passo', texto: 'Inativar o código antigo', responsavel: 'Cadastro' },
    ],
    regras: ['O código antigo não volta a ser usado'],
    evidencias: ['Lista de/para com data e justificativa'],
    fundamento: null,
  },
  {
    id: 'inativacao', titulo: 'Inativação de item',
    objetivo: 'Retirar do uso itens sem movimentação e sem saldo, mantendo o histórico.',
    fluxo: [
      { tipo: 'passo', texto: 'Listar itens sem movimentação desde a data de corte', responsavel: 'Estoque' },
      { tipo: 'decisao', pergunta: 'O item está sem saldo?', sim: 'inativar', nao: 'Regularizar o saldo antes de inativar' },
      { tipo: 'passo', texto: 'Bloquear o item para novas compras e saídas', responsavel: 'Cadastro' },
    ],
    regras: ['Item inativado não é excluído'],
    evidencias: ['Relatório de itens inativados com data'],
    fundamento: null,
  },
  {
    id: 'retirada', titulo: 'Retirada e uso de materiais',
    objetivo: 'Comprovar o uso de cada material na atividade da empresa, com pedido, autorização, retirada e registro do destino.',
    fluxo: [
      { tipo: 'passo', texto: 'Pedir o material informando depósito, centro de custo e equipamento ou ordem de serviço', responsavel: 'Requisitante' },
      { tipo: 'decisao', pergunta: 'O pedido está autorizado pelo gestor da área?', sim: 'separar o material', nao: 'Devolver o pedido ao requisitante com o motivo' },
      { tipo: 'passo', texto: 'Separar e entregar o material contra assinatura', responsavel: 'Almoxarifado' },
      { tipo: 'passo', texto: 'Registrar a saída no ERP com o documento, o centro de custo e o equipamento ou a OS', responsavel: 'Almoxarifado' },
      { tipo: 'decisao', pergunta: 'O material foi todo usado?', sim: 'encerrar o pedido', nao: 'Devolver a sobra ao estoque com registro de entrada' },
    ],
    regras: ['Nenhuma saída sem pedido autorizado', 'Destino sempre informado: centro de custo e equipamento ou OS'],
    evidencias: ['Pedido autorizado', 'Registro de saída no ERP', 'Comprovante de entrega assinado'],
    fundamento: 'Comprovar o uso na atividade sustenta o crédito de IBS e CBS (LC 214/2025, art. 57, § 3º).',
  },
];

/** Quadro e grupos sem regra como o integrador monta: regra de grupos específicos prevalece sobre a de todos os grupos. */
export function quadroDe(regras: RegraPolitica[], grupos: string[]): Pick<DadosPolitica, 'quadro' | 'pendencias'> {
  const quadro = grupos.map((g) => {
    const codigos: Partial<Record<Aspecto, string>> = {};
    for (const a of ASPECTOS) {
      const r = regras.find((x) => x.aspecto === a && !x.abrangencia.todos && x.abrangencia.grupos.includes(g)) ?? regras.find((x) => x.aspecto === a && x.abrangencia.todos);
      if (r) codigos[a] = r.codigo;
    }
    return { grupo: g, codigos };
  });
  const gruposSemRegra = ASPECTOS.map((a) => ({ aspecto: a, grupos: quadro.filter((q) => !q.codigos[a]).map((q) => q.grupo) })).filter((x) => x.grupos.length);
  return { quadro, pendencias: { gruposSemRegra } };
}

export function dadosCrestani(sobrepor: Partial<DadosPolitica> = {}): DadosPolitica {
  const regras = sobrepor.regras ?? REGRAS_CRESTANI;
  return {
    identificacao: {
      cliente: 'Agropecuária Crestani Ltda', projeto: 'Saneamento de estoques 2026', versao: { numero: 2, rotulo: 'Onda 1', liberadaEm: '2026-11-24T18:00:00Z' },
      vigencia: '2026-12-01', situacao: 'RASCUNHO', aprovador: null, dataEmissao: '2026-11-26T12:00:00Z', erp: 'SAP Business One',
    },
    regras,
    procedimentos: PROCEDIMENTOS_CRESTANI,
    ...quadroDe(regras, GRUPOS_CRESTANI),
    ...sobrepor,
  };
}
