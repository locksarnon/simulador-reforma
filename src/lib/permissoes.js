/**
 * Níveis de acesso, telas e funções do InTAX (o que cada usuário pode ver e fazer).
 * Espelho de backend/src/permissoes/permissoes.ts: o teste backend/src/permissoes/permissoes.test.ts confere que as listas são iguais,
 * e src/lib/navegacao.test.js confere que toda tela é um módulo do menu. Sem imports: o servidor lê este arquivo no teste.
 *
 * Cada usuário tem um nível (com as telas e funções sugeridas) e, por cima, só as exceções: { telas: { id: bool }, funcoes: { id: bool } }.
 * O servidor confere tudo a cada pedido; a tela só esconde o que a pessoa não pode usar.
 */

/** Telas que entram no controle (os módulos do menu). Início, Notificações, Meu perfil, Manual e as ferramentas públicas ficam sempre liberados. */
export const TELAS = [
  { id: "painel-carteira", area: "inicio", titulo: "Painel da carteira" },
  { id: "grupos-empresas", area: "clientes", titulo: "Clientes" },
  { id: "grupos-economicos", area: "clientes", titulo: "Grupos econômicos" },
  { id: "carteira", area: "clientes", titulo: "Carteira e colaboradores" },
  { id: "tags", area: "clientes", titulo: "Tags e filtros" },
  { id: "importacao-cadastro", area: "clientes", titulo: "Planilha cadastral" },
  { id: "pessoas-fisicas", area: "clientes", titulo: "Pessoas físicas" },
  { id: "procuracoes", area: "clientes", titulo: "Procurações e certificados" },
  { id: "carteira-bpo", area: "bpo", titulo: "Carteira do BPO" },
  { id: "captura-xml", area: "bpo", titulo: "Captura de XML" },
  { id: "tarefas", area: "bpo", titulo: "Processos e tarefas" },
  { id: "agenda-geral", area: "bpo", titulo: "Obrigações e agenda" },
  { id: "monitoramento", area: "bpo", titulo: "Monitoramento fiscal" },
  { id: "analise-risco", area: "bpo", titulo: "Análise de risco" },
  { id: "arquivos", area: "bpo", titulo: "Arquivos e documentos" },
  { id: "clientes-diagnostico", area: "diagnostico", titulo: "Carteira de Consultoria" },
  { id: "carteira-diagnostico", area: "diagnostico", titulo: "Projetos" },
  { id: "catalogo-consultoria", area: "diagnostico", titulo: "Serviços Tributários" },
  { id: "painel-executivo", area: "reforma", titulo: "Painel executivo" },
  { id: "regimes", area: "reforma", titulo: "Comparação de regimes" },
  { id: "cenarios", area: "reforma", titulo: "Cenários e alíquotas" },
  { id: "transicao", area: "reforma", titulo: "Transição 2026–2033" },
  { id: "credito-estoque", area: "reforma", titulo: "Crédito presumido de estoque" },
  { id: "catalogos", area: "conhecimento", titulo: "Catálogos IBS/CBS" },
  { id: "consulta-ncm", area: "conhecimento", titulo: "Consulta NCM" },
  { id: "guia-art-11", area: "conhecimento", titulo: "Guia do art. 11" },
  { id: "base-legal", area: "conhecimento", titulo: "Bases legais" },
  { id: "agenda-reforma", area: "conhecimento", titulo: "Agenda da Reforma" },
  { id: "radar", area: "conhecimento", titulo: "Radar de novidades" },
  { id: "noticias", area: "conhecimento", titulo: "Acervo de notícias" },
  { id: "leads", area: "comercial", titulo: "Leads" },
  { id: "pre-analise", area: "comercial", titulo: "Pré-análise por CNPJ" },
  { id: "propostas", area: "comercial", titulo: "Propostas e honorários" },
  { id: "comunicados", area: "comercial", titulo: "Comunicados" },
  { id: "newsletter", area: "comercial", titulo: "Newsletter" },
  { id: "usuarios", area: "admin", titulo: "Usuários e acessos" },
  { id: "acessos", area: "admin", titulo: "Registro de acesso e IPs" },
  { id: "comunicacoes", area: "admin", titulo: "Comunicações e envios" },
  { id: "custos", area: "admin", titulo: "Custos das ferramentas" },
  { id: "integracoes", area: "admin", titulo: "Integrações" },
  { id: "configuracao", area: "admin", titulo: "Configuração do motor" },
  { id: "parametros-rotinas", area: "admin", titulo: "Parâmetros e rotinas" },
  { id: "roteiro-testes", area: "suporte", titulo: "Técnico: roteiro de testes" },
  { id: "arquitetura", area: "suporte", titulo: "Técnico: arquitetura" },
];

/** O que a pessoa pode fazer dentro das telas liberadas. */
export const FUNCOES = [
  { id: "alterar", rotulo: "Alterar dados", descricao: "Criar, editar e salvar registros nas telas liberadas. Sem ela, o acesso é só para ver." },
  { id: "consultas_pagas", rotulo: "Fazer consultas pagas", descricao: "Consultas ao Serpro (Integra Contador, certidões, dívida ativa, NF-e) e à Infosimples, que entram no custo do mês." },
  { id: "transmitir", rotulo: "Transmitir declarações à Receita", descricao: "Entregas oficiais pelo Integra Contador, como a DCTFWeb, a opção de regime e o benefício do MEI." },
  { id: "enviar_email", rotulo: "Enviar e-mails", descricao: "Enviar documentos, comunicados, newsletter e guias por e-mail." },
  { id: "importar", rotulo: "Importar planilhas e XML", descricao: "Importar XML, planilhas de operações, de cadastro e de produtos." },
  { id: "excluir", rotulo: "Excluir registros", descricao: "Apagar registros (tarefas, documentos, eventos, propostas e afins)." },
  { id: "arquivar_clientes", rotulo: "Arquivar e desarquivar clientes", descricao: "Tirar um cliente das listas e das rotinas, ou trazê-lo de volta." },
  { id: "certificados", rotulo: "Enviar e remover certificados A1 e PIN do cofre", descricao: "Guardar ou tirar o certificado A1 de um cliente e definir o PIN do cofre." },
  { id: "autorizar_lotes", rotulo: "Preparar e autorizar atualização em lote", descricao: "Atualizar vários clientes de uma vez no monitoramento, gerar guias da carteira e autorizar a recuperação do histórico de XML." },
];

const AREAS_ADMIN = ["admin"];
const SO_ADMINISTRADOR = ["usuarios", "acessos", "integracoes", "custos"];
const todasAsTelas = () => TELAS.map((t) => t.id);
const telasForaDoAdmin = () => TELAS.filter((t) => !AREAS_ADMIN.includes(t.area)).map((t) => t.id);

/** Níveis sugeridos. O nível define as telas e funções de partida; as exceções de cada pessoa ficam por cima. */
export const NIVEIS = [
  { id: "ADMINISTRADOR", rotulo: "Administrador", descricao: "Tudo, inclusive usuários, acessos, integrações e custos. Não tem exceções.", telas: todasAsTelas(), funcoes: FUNCOES.map((f) => f.id) },
  { id: "GESTOR", rotulo: "Gestor", descricao: "Todas as telas, menos usuários, acessos, integrações e custos; todas as funções.", telas: todasAsTelas().filter((id) => !SO_ADMINISTRADOR.includes(id)), funcoes: FUNCOES.map((f) => f.id) },
  { id: "CONSULTOR", rotulo: "Consultor", descricao: "As telas do dia a dia, sem a Administração; altera, faz consultas pagas, envia e-mails, importa e exclui.", telas: telasForaDoAdmin(), funcoes: ["alterar", "consultas_pagas", "enviar_email", "importar", "excluir"] },
  { id: "ASSISTENTE", rotulo: "Assistente", descricao: "As mesmas telas do Consultor; altera, envia e-mails e importa, sem consultas pagas nem exclusões.", telas: telasForaDoAdmin(), funcoes: ["alterar", "enviar_email", "importar"] },
  { id: "SOMENTE_LEITURA", rotulo: "Somente leitura", descricao: "As mesmas telas do Consultor, só para ver: não altera, não consulta e não envia nada.", telas: telasForaDoAdmin(), funcoes: [] },
];

export const NIVEL_PADRAO = "CONSULTOR";
export const nivelPorId = (id) => NIVEIS.find((n) => n.id === id) || null;
export const rotuloDoNivel = (id) => nivelPorId(id)?.rotulo || nivelPorId(NIVEL_PADRAO).rotulo;
export const telaPorId = (id) => TELAS.find((t) => t.id === id) || null;
export const funcaoPorId = (id) => FUNCOES.find((f) => f.id === id) || null;

/** Nível de uma conta: administrador (role admin) é sempre ADMINISTRADOR; nível desconhecido vira o padrão. */
export function nivelDaConta(user) {
  if (user?.role === "admin") return "ADMINISTRADOR";
  const n = user?.nivel;
  return n && n !== "ADMINISTRADOR" && nivelPorId(n) ? n : NIVEL_PADRAO;
}

/** Só as exceções conhecidas e que diferem do nível (o resto é o sugerido). */
export function normalizarExcecoes(excecoes, nivel) {
  const base = nivelPorId(nivel) || nivelPorId(NIVEL_PADRAO);
  const saida = { telas: {}, funcoes: {} };
  if (nivel === "ADMINISTRADOR") return saida;
  for (const [grupo, lista, sugeridos] of [["telas", TELAS, base.telas], ["funcoes", FUNCOES, base.funcoes]]) {
    const vindas = excecoes && typeof excecoes === "object" ? excecoes[grupo] : null;
    if (!vindas || typeof vindas !== "object") continue;
    for (const item of lista) {
      const v = vindas[item.id];
      if (typeof v !== "boolean") continue;
      if (v !== sugeridos.includes(item.id)) saida[grupo][item.id] = v;
    }
  }
  return saida;
}

/** Telas e funções que valem para a conta ({ role, nivel, excecoes }): as do nível com as exceções por cima (o Administrador não tem exceções). */
export function permissoesEfetivas(user) {
  const nivel = nivelDaConta(user);
  const base = nivelPorId(nivel);
  if (nivel === "ADMINISTRADOR") return { nivel, admin: true, telas: [...base.telas], funcoes: [...base.funcoes] };
  const exc = normalizarExcecoes(user?.excecoes ?? null, nivel);
  const aplicar = (lista, sugeridos, grupo) => lista.map((x) => x.id).filter((id) => (id in exc[grupo] ? exc[grupo][id] : sugeridos.includes(id)));
  return { nivel, admin: false, telas: aplicar(TELAS, base.telas, "telas"), funcoes: aplicar(FUNCOES, base.funcoes, "funcoes") };
}

/** As permissões da conta logada: as que o servidor mandou em /auth/me; sem elas, as calculadas pelo nível. */
function efetivasDoUsuario(user) {
  if (!user) return null;
  if (user.role === "admin") return permissoesEfetivas(user);
  const p = user.permissoes;
  if (p && Array.isArray(p.telas) && Array.isArray(p.funcoes)) return p;
  return permissoesEfetivas(user);
}

/** A tela está liberada? Telas fora do controle (Início, Manual...) sempre estão. */
export function temTela(user, telaId) {
  if (!telaPorId(telaId)) return true;
  const p = efetivasDoUsuario(user);
  return !!p && p.telas.includes(telaId);
}

/** A função está liberada? */
export function temFuncao(user, funcaoId) {
  const p = efetivasDoUsuario(user);
  return !!p && p.funcoes.includes(funcaoId);
}

/** Mensagem padrão quando falta uma função (a mesma ideia da que o servidor devolve). */
export const semFuncao = (funcaoId) => `Seu acesso não permite: ${funcaoPorId(funcaoId)?.rotulo?.toLowerCase() || funcaoId}. Peça ao administrador.`;
