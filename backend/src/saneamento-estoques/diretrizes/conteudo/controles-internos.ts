/**
 * Controles internos da política de estoques (capítulo próprio do PDF, depois das Diretrizes). Ficam fora das Diretrizes porque não
 * comandam análise: são as rotinas de quem cadastra, aprova, movimenta e confere o estoque. Modelo FAL, o mesmo para todos os projetos
 * (base: política de estoques aprovada na Agropecuária, generalizada, sem dado de cliente). `fluxograma` aponta para o id de um
 * PROCEDIMENTO (conteudo/biblioteca.ts) cujo fluxograma o controle segue; o PDF cita a seção em vez de redesenhar.
 */

export type ControleInterno = {
  /** CI01, CI02, ... */
  codigo: string;
  titulo: string;
  /** Risco que o controle evita, em 1 frase. */
  objetivo: string;
  /** Passos curtos, na ordem. */
  procedimento: string[];
  /** Papel (não o nome da pessoa). */
  responsavel: string;
  frequencia: string;
  /** O que fica guardado para provar que o controle rodou. */
  evidencia: string[];
  /** Id do procedimento (PROCEDIMENTOS) cujo fluxograma o controle segue. */
  fluxograma?: string;
};

export const CONTROLES_INTERNOS: ControleInterno[] = [
  {
    codigo: 'CI01',
    titulo: 'Responsáveis nomeados',
    objetivo: 'Garantir que cada etapa do cadastro e do estoque tenha um dono, com substituto, e que ninguém fora dele decida.',
    procedimento: [
      'Nomear por escrito: curador do cadastro, cadastrador central, aprovador técnico de cada grupo, fiscal e almoxarife responsável, cada um com substituto.',
      'Dar ao curador autoridade para recusar cadastro fora do padrão.',
      'Atualizar a nomeação a cada troca de pessoa e comunicar compras, almoxarifado, manutenção, fiscal e contabilidade.',
    ],
    responsavel: 'Diretoria',
    frequencia: 'Na aprovação da política e a cada troca de responsável',
    evidencia: ['Ato de nomeação com titular, substituto e data.', 'Comunicado às áreas.'],
    fluxograma: 'proc-manutencao-saneamento',
  },
  {
    codigo: 'CI02',
    titulo: 'Segregação de funções e perfis de acesso no ERP',
    objetivo: 'Evitar que a mesma pessoa crie o item, compre, movimente o estoque e aprove o próprio ajuste.',
    procedimento: [
      'Restringir criação e alteração de item ao cadastrador central e ao substituto, por perfil de usuário.',
      'Quem compra ou requisita não cria item; quem conta o estoque não lança o ajuste; quem lança o ajuste não o aprova.',
      'Extrair a lista de usuários com permissão de cadastro, movimentação e ajuste de estoque e conferir com a nomeação (CI01).',
      'Retirar no mesmo dia o acesso de quem mudou de função ou saiu da empresa.',
    ],
    responsavel: 'Curador do cadastro e TI do ERP',
    frequencia: 'Trimestral e a cada mudança de função',
    evidencia: ['Relatório de perfis de acesso conferido, com data e assinatura.', 'Registro das permissões retiradas.'],
  },
  {
    codigo: 'CI03',
    titulo: 'Solicitação e aprovação de item novo',
    objetivo: 'Fazer o item novo nascer no padrão do grupo, com os campos obrigatórios e o fiscal validados, por uma porta única.',
    procedimento: [
      'Receber a solicitação só pelo formulário padrão, com o resultado da consulta de duplicidade (CI04) anexado.',
      'Conferir os campos obrigatórios e devolver a solicitação incompleta com o motivo.',
      'Colher a aprovação técnica do grupo e a validação do fiscal (NCM confirmado e finalidade definida).',
      'Criar o item e informar o código ao solicitante dentro do prazo de atendimento (padrão: 2 dias úteis da solicitação completa).',
    ],
    responsavel: 'Cadastrador central',
    frequencia: 'A cada item novo',
    evidencia: ['Solicitação com a consulta de duplicidade.', 'Aprovação técnica e validação fiscal com data e autor.', 'Registro de criação no ERP.'],
    fluxograma: 'proc-cadastro-item-novo',
  },
  {
    codigo: 'CI04',
    titulo: 'Consulta de duplicidade antes de criar',
    objetivo: 'Impedir que o mesmo produto ganhe um segundo código.',
    procedimento: [
      'Pesquisar por referência, descrição normalizada (abreviações, grafia e ordem das palavras), unidade, medidas e NCM.',
      'Tratar variante (cor, tamanho, lado, sabor) como outro item, exceto nos grupos em que a variante é observação; original e paralelos ficam no mesmo código.',
      'Achado o produto, usar o código existente; havendo dois códigos para o mesmo produto, abrir a unificação (CI08).',
      'Registrar o resultado da pesquisa na solicitação.',
    ],
    responsavel: 'Solicitante e cadastrador central',
    frequencia: 'A cada solicitação de item novo',
    evidencia: ['Resultado da pesquisa anexado à solicitação.'],
    fluxograma: 'proc-cadastro-item-novo',
  },
  {
    codigo: 'CI05',
    titulo: 'Alteração de cadastro com trilha',
    objetivo: 'Corrigir o cadastro sem mudar a identidade de item com saldo ou histórico e sem perder o que havia antes.',
    procedimento: [
      'Pedir a alteração com motivo, antes, depois e evidência (ficha técnica, catálogo, nota do fabricante).',
      'Produto diferente não se altera: cadastrar item novo e tratar o antigo por unificação ou inativação (de/para).',
      'Mudança de NCM, tipo do item ou finalidade passa pelo fiscal; as demais, pelo aprovador técnico do grupo.',
      'Gravar no ERP com data, autor e aprovador, preservando a descrição anterior no histórico.',
    ],
    responsavel: 'Cadastrador central',
    frequencia: 'A cada alteração',
    evidencia: ['Pedido com antes, depois, motivo e evidência.', 'Aprovação ligada à alteração específica.', 'Histórico do ERP.'],
    fluxograma: 'proc-alteracao-item',
  },
  {
    codigo: 'CI06',
    titulo: 'Bloqueio de uso por prazo sem movimento',
    objetivo: 'Tirar de circulação o item parado antes que volte a ser comprado ou usado fora do padrão.',
    procedimento: [
      'Listar os itens sem movimentação desde a data de corte do projeto e os sem nenhuma movimentação registrada.',
      'Separar os que têm saldo, documento aberto, vínculo ativo (plano de manutenção, lista de materiais) ou marca de item crítico.',
      'Submeter a lista completa à aprovação; os aprovados recebem bloqueio de compra e de movimento, reversível e sem exclusão.',
      'Item bloqueado só volta ao uso por pedido de reativação com motivo (CI05) e só entra na padronização se for mantido ativo.',
    ],
    responsavel: 'Curador do cadastro; aprovação do aprovador técnico do grupo',
    frequencia: 'Trimestral',
    evidencia: ['Lista aprovada com a data de corte, a base analisada, o aprovador e a data.', 'Registro do bloqueio no ERP.'],
    fluxograma: 'proc-inativacao-sem-movimento',
  },
  {
    codigo: 'CI07',
    titulo: 'Inativação e código não reaproveitado',
    objetivo: 'Encerrar o item sem saldo e sem histórico perdido, sem que o código volte a ser usado para outro produto.',
    procedimento: [
      'Zerar o saldo antes de inativar: consumir, transferir para código ativo ou baixar por ajuste aprovado (CI10).',
      'Inativar no ERP, sem excluir.',
      'Conferir na extração seguinte que o item está inativo, sem saldo e sem movimento novo.',
      'Não reaproveitar o código inativado.',
    ],
    responsavel: 'Cadastrador central',
    frequencia: 'A cada inativação; conferência na extração seguinte',
    evidencia: ['Documento de baixa ou transferência do saldo, quando houver.', 'Registro da inativação no ERP.', 'Conferência da extração seguinte.'],
    fluxograma: 'proc-inativacao-sem-movimento',
  },
  {
    codigo: 'CI08',
    titulo: 'Unificação de códigos duplicados',
    objetivo: 'Deixar um código por produto, com o saldo somado em quantidade e valor e o histórico preservado.',
    procedimento: [
      'Unificar só com confirmação técnica de que é o mesmo produto; semelhança de texto não prova duplicidade.',
      'Escolher o código que fica: maior saldo; depois movimentação mais recente; depois cadastro mais completo; depois menor código.',
      'Aprovar o de/para, transferir o saldo pelo mesmo custo e inativar o código que sai (CI07).',
      'Conferir que o código antigo ficou com saldo zero e o que fica soma os dois em quantidade e valor.',
    ],
    responsavel: 'Curador do cadastro; aprovação do aprovador técnico do grupo',
    frequencia: 'A cada duplicidade encontrada',
    evidencia: ['De/para aprovado.', 'Saldos antes e depois dos dois códigos.', 'Documento de transferência no ERP.'],
    fluxograma: 'proc-unificacao-codigos',
  },
  {
    codigo: 'CI09',
    titulo: 'Retirada de material com destino registrado',
    objetivo: 'Provar para onde foi cada material retirado: sustenta o custo por atividade e o crédito de IBS e CBS do uso na atividade.',
    procedimento: [
      'Nenhuma saída de estoque sem requisição autorizada, com centro de custo e destino (equipamento, ordem de serviço ou atividade).',
      'Dar baixa no ERP no mesmo dia, com o documento de saída ligado à requisição; sobra volta com documento de devolução.',
      'Conciliar no mês requisições, baixas e ordens de serviço encerradas e investigar as divergências.',
    ],
    responsavel: 'Almoxarife; conciliação pela controladoria',
    frequencia: 'A cada retirada; conciliação mensal',
    evidencia: ['Requisição autorizada.', 'Documento de saída com centro de custo e destino.', 'Conciliação mensal assinada.'],
    fluxograma: 'proc-retirada-uso-materiais',
  },
  {
    codigo: 'CI10',
    titulo: 'Inventário e contagens',
    objetivo: 'Manter o saldo do ERP igual ao físico e só ajustar a diferença com motivo e aprovação.',
    procedimento: [
      'Contagem rotativa dos itens críticos e de maior valor; inventário geral na data do balanço.',
      'Contar sem ver o saldo do ERP (contagem cega), por quem não lança o ajuste (CI02).',
      'Recontar toda divergência; persistindo, apurar a causa (baixa não lançada, retirada sem requisição, unidade ou endereço errado).',
      'Lançar o ajuste só com aprovação da controladoria, item a item, com motivo e valor.',
    ],
    responsavel: 'Almoxarife (contagem) e controladoria (ajuste)',
    frequencia: 'Contagem rotativa mensal; inventário geral anual',
    evidencia: ['Fichas de contagem assinadas.', 'Relatório de divergências com a causa.', 'Ajuste aprovado com motivo e valor.'],
  },
  {
    codigo: 'CI11',
    titulo: 'Conferência periódica do cadastro',
    objetivo: 'Pegar cedo o que volta a sair do padrão depois do saneamento.',
    procedimento: [
      'Mensal: reaplicar as verificações na extração da base e tratar cadastros fora do padrão, duplicidades novas e divergências de endereço.',
      'Trimestral: revisar grupos e itens sem movimento (CI06).',
      'Anual: revisão geral e fiscal do cadastro e revisão desta política.',
      'Fora da rotina, revisar os itens afetados quando houver gatilho: troca de fornecedor ou marca, mudança de catálogo, novo modelo de máquina, novo grupo, mudança na tabela NCM, nos anexos da LC 214/2025 ou na tabela cClassTrib.',
    ],
    responsavel: 'Curador do cadastro',
    frequencia: 'Mensal, trimestral e anual; por gatilho',
    evidencia: ['Relatório mensal das verificações.', 'Registro das revisões por gatilho.'],
    fluxograma: 'proc-manutencao-saneamento',
  },
  {
    codigo: 'CI12',
    titulo: 'Indicadores e metas',
    objetivo: 'Medir se o padrão está sendo seguido e agir quando não estiver.',
    procedimento: [
      'Publicar no mês: novos cadastros no padrão, duplicidades novas, tempo de cadastro, itens com NCM confirmado e evidência e compras fora do processo.',
      'Comparar com as metas (padrão: 100% dos itens novos no padrão; zero duplicidade nova; cadastro em até 2 dias úteis; 100% de NCM confirmado nos grupos tratados).',
      'Indicador abaixo da meta: plano de ação com responsável e prazo.',
    ],
    responsavel: 'Curador do cadastro',
    frequencia: 'Mensal',
    evidencia: ['Relatório mensal de indicadores.', 'Planos de ação com responsável e prazo.'],
    fluxograma: 'proc-manutencao-saneamento',
  },
  {
    codigo: 'CI13',
    titulo: 'Treinamento e divulgação',
    objetivo: 'Fazer quem cadastra, compra e movimenta o estoque conhecer as regras antes de aplicá-las.',
    procedimento: [
      'Apresentar a política a compras, almoxarifado, manutenção, fiscal e contabilidade.',
      'Treinar cadastrador e aprovadores antes de liberar o fluxo de cadastro.',
      'Repetir a cada revisão da política e para quem entrar nas funções.',
    ],
    responsavel: 'Curador do cadastro',
    frequencia: 'Na aprovação e a cada revisão da política; na entrada de pessoa nova',
    evidencia: ['Lista de presença com data e conteúdo.'],
  },
];
