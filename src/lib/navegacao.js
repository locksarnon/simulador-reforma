import {
  Activity, Archive, BadgeDollarSign, Bell, BookMarked, BookOpen, Boxes, Briefcase, Building2, CalendarClock, CalendarDays, CalendarRange, CircleUser,
  ClipboardCheck, Code2, Contact, ExternalLink, FileSpreadsheet, FolderOpen, HeartPulse, HelpCircle, Home, Inbox, KeyRound, Landmark, Layers,
  LayoutDashboard, ListChecks, Mail, Megaphone, Newspaper, PieChart, Plug, Radar, Receipt, ScanSearch, Scale, ScrollText, Search, Settings,
  ShieldCheck, SlidersHorizontal, Stethoscope, Tags, UserCog, Users,
} from "lucide-react";
import { CAMINHO_REPOSITORIO_XML } from "@/lib/bpoCaminhos";

/**
 * Catálogo único da navegação do InTAX (menu, páginas de área, busca rápida e regras de papel saem daqui).
 * Estrutura e regras: docs/estrutura-de-telas.md. Mapa de funções: docs/mapa-completo-veri-intax.md.
 *
 * Regras que os testes conferem (src/lib/navegacao.test.js): cada módulo está em uma só área, no máximo 7 módulos por área,
 * nenhum item do menu antigo se perde e todo destino é único.
 */

/** Situação de um módulo: `em-breve` só aparece para administrador, com a explicação do que falta. */
export const SITUACAO = { ATIVO: "ativo", BETA: "beta", EM_BREVE: "em-breve" };

export const AREAS = [
  { id: "inicio", titulo: "Início", icone: Home, descricao: "Seu ponto de partida: atalhos, avisos, tarefas e a visão da carteira." },
  { id: "clientes", titulo: "Clientes", icone: Building2, descricao: "A lista de clientes e o que cada um contratou, as pessoas físicas, as etiquetas e quem atende cada cliente." },
  { id: "bpo", titulo: "BPO Fiscal", icone: Briefcase, descricao: "A rotina do escritório sobre a carteira: XML, obrigações, tarefas, monitoramento e arquivos." },
  { id: "diagnostico", titulo: "Diagnósticos", icone: Stethoscope, descricao: "Trabalhos pontuais por cliente ou grupo: escopo, XML e operações, análises e entregáveis." },
  { id: "reforma", titulo: "Planejamento tributário", icone: Landmark, descricao: "Painel executivo, comparação de regimes, cenários, transição e crédito de estoque, por empresa ou grupo." },
  { id: "conhecimento", titulo: "Consultas fiscais", icone: BookOpen, descricao: "Base legal, NCM, catálogos IBS/CBS, guia do art. 11, agenda, radar e notícias, sempre com fonte oficial." },
  { id: "comercial", titulo: "Comercial", icone: Megaphone, descricao: "Leads, pré-análise por CNPJ, propostas, comunicados, newsletter e ferramentas públicas." },
  { id: "admin", titulo: "Administração", icone: Settings, descricao: "Usuários, acessos, integrações e configurações do sistema." },
  { id: "suporte", titulo: "Ajuda", icone: HelpCircle, descricao: "Manual e perguntas frequentes; roteiro de testes e arquitetura para a equipe técnica." },
];

/**
 * Módulos. `to` é a tela principal; `prefixos` são outros caminhos que também pertencem ao módulo (para marcar o menu).
 * `papeis` vazio = todos. `quando` explica o que falta para um módulo "em breve".
 */
export const MODULOS = [
  // Início
  { id: "inicio", area: "inicio", titulo: "Início", descricao: "Atalhos, tarefas, avisos e a visão da carteira.", icone: Home, to: "/inicio", palavras: ["home", "painel", "começo"] },
  { id: "painel-carteira", area: "inicio", titulo: "Painel da carteira", descricao: "O retrato da carteira pelo cadastro: carteiras, regime, porte, mapa por município, CNAE e o que falta preencher.", icone: PieChart, to: "/inicio/carteira", palavras: ["bi", "carteira", "mapa", "cnae", "porte", "regime", "município", "indicadores"] },
  // Fora do menu (o sino e o bloco da conta levam até eles), mas no catálogo: a busca acha e a tela sabe a que área pertence.
  { id: "notificacoes", area: "inicio", titulo: "Notificações", descricao: "Central dos avisos do sino: tarefas, agenda, certificados, documentos, captura de XML e acessos.", icone: Bell, to: "/notificacoes", oculto: true, palavras: ["sino", "aviso", "alerta", "notificação"] },
  { id: "perfil", area: "inicio", titulo: "Meu perfil", descricao: "Seu nome no sistema e a troca da sua senha.", icone: CircleUser, to: "/perfil", oculto: true, palavras: ["senha", "conta", "nome", "perfil"] },

  // Clientes
  { id: "grupos-empresas", area: "clientes", titulo: "Clientes", descricao: "A lista de todos os clientes: busca, filtros, os serviços de cada um (BPO, diagnóstico) e a ficha do cliente.", icone: Building2, to: "/", fim: true, prefixos: ["/clientes"], palavras: ["cadastro", "cliente", "clientes", "cadastro de clientes", "grupos e empresas", "empresa", "serviços contratados", "bpo", "datahub", "cnpj"] },
  { id: "grupos-economicos", area: "clientes", titulo: "Grupos econômicos", descricao: "A visão por grupo econômico (a tela de antes, com os grupos e as empresas de cada um).", icone: Layers, to: "/clientes/grupos", oculto: true, palavras: ["grupo", "grupo econômico", "grupo familiar", "holding"] },
  { id: "carteira", area: "clientes", titulo: "Carteira e colaboradores", descricao: "Quais empresas cada colaborador atende, e as empresas sem responsável.", icone: Contact, to: "/clientes/carteira", palavras: ["colaborador", "responsável", "vínculo", "empresa por colaborador"] },
  { id: "tags", area: "clientes", titulo: "Tags e filtros", descricao: "Etiquetas nas empresas e listas salvas para achar clientes rápido.", icone: Tags, to: "/clientes/tags", palavras: ["etiqueta", "filtro", "segmento", "lista"] },
  { id: "importacao-cadastro", area: "clientes", titulo: "Planilha cadastral", descricao: "Importar e exportar o cadastro de clientes e a carteira por colaborador por planilha, com conferência antes de gravar.", icone: FileSpreadsheet, to: "/clientes/importacao", palavras: ["importar", "exportar", "planilha", "excel", "csv", "cadastro em lote"] },
  { id: "pessoas-fisicas", area: "clientes", titulo: "Pessoas físicas", descricao: "CPFs da carteira (sócios, produtores rurais), a empresa ligada e o vencimento do certificado digital.", icone: Users, to: "/clientes/pessoas-fisicas", prefixos: ["/em-breve/pessoas-fisicas"], palavras: ["cpf", "pf", "sócio", "produtor rural", "e-cpf"] },
  { id: "procuracoes", area: "clientes", titulo: "Procurações e certificados", descricao: "Como o InTAX consulta a Receita de cada cliente: pelo A1 do cliente ou pela procuração eletrônica, e o que falta.", icone: KeyRound, to: "/clientes/procuracoes", prefixos: ["/em-breve/procuracoes"], palavras: ["procuração", "e-cac", "a1", "certificado", "termo de autorização"] },

  // BPO Fiscal
  { id: "carteira-bpo", area: "bpo", titulo: "Carteira do BPO", descricao: "As empresas com BPO ativo e o estado da rotina de cada uma.", icone: LayoutDashboard, to: "/bpo/carteira", palavras: ["bpo", "carteira", "clientes bpo", "rotina"] },
  { id: "captura-xml", area: "bpo", titulo: "Captura de XML", descricao: "Repositório de XML, certificado A1 e captura automática da SEFAZ.", icone: Archive, to: CAMINHO_REPOSITORIO_XML, palavras: ["repositório", "xml", "nf-e", "ct-e", "nfs-e", "captura", "sefaz", "danfe"] },
  { id: "tarefas", area: "bpo", titulo: "Processos e tarefas", descricao: "Tarefas do dia a dia, com recorrência, responsável e aviso de atraso.", icone: ListChecks, to: "/bpo/tarefas", palavras: ["tarefa", "processo", "recorrente", "atraso", "to-do"] },
  { id: "agenda-geral", area: "bpo", titulo: "Obrigações e agenda", descricao: "Calendário do escritório: eventos, obrigações, tarefas e datas da Reforma.", icone: CalendarRange, to: "/bpo/agenda", palavras: ["calendário", "agenda", "evento", "obrigação", "vencimento"] },
  { id: "monitoramento", area: "bpo", titulo: "Monitoramento fiscal", descricao: "Situação fiscal, declarações, guias, caixa postal, parcelamentos, MEI e procuração de cada cliente, pelo Integra Contador do Serpro.", icone: ShieldCheck, to: "/bpo/monitoramento", prefixos: ["/em-breve/monitoramento"], palavras: ["e-cac", "das", "pgdas", "dctfweb", "certidão", "parcelamento", "mei", "defis", "mit", "sitfis", "caixa postal", "serpro", "integra contador", "situação fiscal"] },
  { id: "analise-risco", area: "bpo", titulo: "Análise de risco", descricao: "Saúde fiscal da carteira, top 5 em risco, fila de prioridade, radar de certidões, conferência do cadastro e a calculadora de multas.", icone: Activity, to: "/bpo/analise-risco", prefixos: ["/em-breve/analise-risco"], palavras: ["risco", "score", "health", "saúde fiscal", "multa", "radar", "raio-x", "calculadora de multas", "atraso", "juros", "certidão", "cnd", "prioridade"] },
  { id: "arquivos", area: "bpo", titulo: "Arquivos e documentos", descricao: "Arquivos por empresa e documentos com data de validade e alerta de vencimento.", icone: FolderOpen, to: "/bpo/arquivos", palavras: ["arquivo", "documento", "validade", "alvará", "licença", "download"] },

  // Diagnóstico e Serviços
  { id: "carteira-diagnostico", area: "diagnostico", titulo: "Projetos de diagnóstico", descricao: "Cada diagnóstico com o seu escopo (uma empresa, parte de um grupo ou o grupo inteiro), prazo e as ferramentas de cada empresa.", icone: Stethoscope, to: "/diagnostico", prefixos: ["/workroom", "/diagnostico/projetos"], palavras: ["diagnóstico", "projeto", "novo diagnóstico", "escopo", "saneamento", "operações", "workroom"] },
  { id: "clientes-diagnostico", area: "diagnostico", titulo: "Clientes com diagnóstico", descricao: "As empresas com diagnóstico pontual ativo e o caminho até o trabalho de cada uma.", icone: Contact, to: "/diagnostico/carteira", palavras: ["carteira", "diagnóstico pontual", "clientes"] },

  // Reforma Tributária
  { id: "painel-executivo", area: "reforma", titulo: "Painel executivo", descricao: "Carga, margem e caixa da carteira, de um grupo ou de uma empresa, com os cenários da Reforma.", icone: LayoutDashboard, to: "/cockpit", palavras: ["cockpit", "painel", "executivo", "carga", "margem", "simulação", "grupo"] },
  { id: "regimes", area: "reforma", titulo: "Comparação de regimes", descricao: "A mesma empresa no Simples, no Presumido e no Real, ano a ano até 2033: onde cada regime vence.", icone: Scale, to: "/reforma/regimes", palavras: ["simulador", "regime", "simples", "presumido", "lucro real", "comparar", "vence"] },
  { id: "cenarios", area: "reforma", titulo: "Cenários e alíquotas", descricao: "Os cenários de alíquotas da Reforma usados nas simulações.", icone: SlidersHorizontal, to: "/cenarios", palavras: ["alíquota", "cbs", "ibs"] },
  { id: "transicao", area: "reforma", titulo: "Transição 2026–2033", descricao: "Como a carga muda ano a ano durante a transição.", icone: CalendarClock, to: "/transicao", palavras: ["2026", "2033", "transição"] },
  { id: "catalogos", area: "conhecimento", titulo: "Catálogos IBS/CBS", descricao: "Classificações tributárias, CST e créditos presumidos.", icone: BookMarked, to: "/catalogos", palavras: ["cclasstrib", "cst", "crédito presumido", "ibs", "cbs"] },
  { id: "credito-estoque", area: "reforma", titulo: "Crédito presumido de estoque", descricao: "Cálculo do crédito presumido do estoque na virada da Reforma.", icone: Boxes, to: "/ferramentas/credito-estoque", palavras: ["estoque", "crédito", "lc 214"] },
  { id: "consulta-ncm", area: "conhecimento", titulo: "Consulta NCM", descricao: "Consulta de NCM com a classificação tributária da Reforma.", icone: Search, to: "/ferramentas/consulta-ncm", palavras: ["ncm", "classificação", "mercadoria"] },
  { id: "guia-art-11", area: "conhecimento", titulo: "Guia do art. 11", descricao: "Guia da base de cálculo do IBS/CBS pelo art. 12 e art. 11 da LC 214.", icone: Scale, to: "/base-legal/guia-art-11", palavras: ["art. 11", "base de cálculo", "lc 214"] },

  // Conhecimento
  { id: "base-legal", area: "conhecimento", titulo: "Base legal e assistente", descricao: "Leis, decretos e dispositivos com fonte oficial, e o assistente que responde com o artigo.", icone: Scale, to: "/base-legal", prefixos: ["/base-legal/"], palavras: ["lei", "lc 214", "decreto", "norma", "dispositivo"] },
  { id: "agenda-reforma", area: "conhecimento", titulo: "Agenda da Reforma", descricao: "Datas e marcos oficiais da Reforma Tributária.", icone: CalendarDays, to: "/agenda-reforma", palavras: ["prazo", "marco", "data", "lembrete"] },
  { id: "radar", area: "conhecimento", titulo: "Radar de novidades", descricao: "O que mudou na legislação, filtrado por setor.", icone: Radar, to: "/ferramentas/radar-reforma", palavras: ["novidade", "radar", "setor"] },
  { id: "noticias", area: "conhecimento", titulo: "Acervo de notícias", descricao: "Notícias da Reforma guardadas e organizadas.", icone: Newspaper, to: "/ferramentas/noticias", palavras: ["notícia", "acervo"] },

  // Comercial e relacionamento
  { id: "leads", area: "comercial", titulo: "Leads", descricao: "Contatos que chegaram pelas ferramentas públicas.", icone: Users, to: "/comercial/leads", palavras: ["lead", "contato", "prospecção"] },
  { id: "pre-analise", area: "comercial", titulo: "Pré-análise por CNPJ", descricao: "Consulta de um prospect só pelo CNPJ, com dados públicos.", icone: ScanSearch, to: "/comercial/pre-analise", palavras: ["prospect", "cnpj", "consulta", "cnae", "porte"] },
  { id: "propostas", area: "comercial", titulo: "Propostas e honorários", descricao: "Calculadora de honorários e proposta em PDF com a logo do escritório.", icone: BadgeDollarSign, to: "/comercial/propostas", palavras: ["orçamento", "honorário", "proposta", "pdf", "precificação"] },
  { id: "comunicados", area: "comercial", titulo: "Comunicados", descricao: "E-mails para grupos de clientes, com anexos e registro de envio.", icone: Mail, to: "/comercial/comunicados", palavras: ["e-mail", "comunicado", "aviso", "tags"] },
  { id: "newsletter", area: "comercial", titulo: "Newsletter", descricao: "Edições da newsletter e inscritos.", icone: Mail, to: "/comercial/newsletter", palavras: ["newsletter", "inscritos", "edição"] },
  { id: "calculadora-publica", area: "comercial", titulo: "Ferramentas públicas", descricao: "A calculadora aberta, sem login, que traz os leads (e as outras ferramentas públicas a partir dela).", icone: ExternalLink, to: "/calculadora", externo: true, palavras: ["calculadora", "pública", "isca"] },

  // Administração
  { id: "usuarios", area: "admin", titulo: "Usuários e acessos", descricao: "Quem usa o InTAX, com papel e situação de cada conta.", icone: UserCog, to: "/admin/usuarios", papeis: ["admin"], palavras: ["usuário", "papel", "acesso", "senha", "conta"] },
  { id: "acessos", area: "admin", titulo: "Registro de acesso e IPs", descricao: "Quem entrou e quando, e a lista de endereços IP permitidos.", icone: ScrollText, to: "/admin/acessos", papeis: ["admin"], palavras: ["login", "ip", "auditoria", "último acesso"] },
  { id: "comunicacoes", area: "admin", titulo: "Comunicações e envios", descricao: "E-mails enviados (comunicados e avisos), lista de bloqueio e para quem vão os avisos por e-mail.", icone: Inbox, to: "/admin/comunicacoes", papeis: ["admin"], palavras: ["log", "e-mail enviado", "bloqueio", "descadastro", "aviso por e-mail", "destinatário"] },
  { id: "integracoes", area: "admin", titulo: "Integrações", descricao: "Estado das conexões com Serpro, e-mail e WhatsApp.", icone: Plug, to: "/admin/integracoes", papeis: ["admin"], palavras: ["serpro", "integra contador", "whatsapp", "smtp", "agente"] },
  { id: "configuracao", area: "admin", titulo: "Configuração do motor", descricao: "Parâmetros gerais do motor de cálculo e do sistema.", icone: Settings, to: "/configuracao", palavras: ["parâmetro", "ajuste"] },
  { id: "parametros-rotinas", area: "admin", titulo: "Parâmetros e rotinas", descricao: "Dia da consulta automática de cada assunto do monitoramento e o envio das guias no dia escolhido.", icone: SlidersHorizontal, to: "/admin/parametros-rotinas", prefixos: ["/em-breve/parametros-rotinas"], papeis: ["admin"], palavras: ["rotina", "agendamento", "envio de guias", "consulta automática"] },

  // Suporte
  { id: "roteiro-testes", area: "suporte", titulo: "Técnico: roteiro de testes", descricao: "Passo a passo para testar cada funcionalidade.", icone: ClipboardCheck, to: "/roteiro-testes", palavras: ["teste", "roteiro", "qa"] },
  { id: "manual", area: "suporte", titulo: "Manual e perguntas frequentes", descricao: "Perguntas frequentes e manual de uso, com a fonte de cada resposta.", icone: HelpCircle, to: "/manual", palavras: ["ajuda", "faq", "manual", "dúvida"] },
  { id: "arquitetura", area: "suporte", titulo: "Técnico: arquitetura", descricao: "Como o sistema é organizado por dentro.", icone: Code2, to: "/arquitetura", palavras: ["arquitetura", "correlação", "técnico"] },
];

const emBreve = (m) => m.situacao === SITUACAO.EM_BREVE;
const podeVer = (m, user) => {
  if (emBreve(m) && user?.role !== "admin") return false;
  if (m.papeis?.length && !m.papeis.includes(user?.role)) return false;
  return true;
};

export const areaPorId = (id) => AREAS.find((a) => a.id === id) || null;
export const moduloPorId = (id) => MODULOS.find((m) => m.id === id) || null;
export const situacaoDoModulo = (m) => m.situacao || SITUACAO.ATIVO;

/** Módulos de uma área que a pessoa pode ver (administrador vê também os "em breve"). Os módulos `oculto` não entram no menu. */
export function modulosDaArea(areaId, user) {
  return MODULOS.filter((m) => m.area === areaId && !m.oculto && podeVer(m, user));
}

/** As áreas do menu, só com módulos visíveis para a pessoa; área vazia some. */
export function areasDoMenu(user) {
  return AREAS.map((a) => ({ ...a, modulos: modulosDaArea(a.id, user) })).filter((a) => a.modulos.length > 0);
}

/** Todos os destinos do catálogo (os testes garantem que são únicos e que o menu antigo está todo aqui). */
export const todosOsDestinos = () => MODULOS.map((m) => m.to);

/** Caminho da página de uma área (a página lista os módulos dela). */
export const caminhoDaArea = (areaId) => (areaId === "inicio" ? "/inicio" : `/area/${areaId}`);

/**
 * Módulo a que um caminho pertence: o `to` ou um prefixo mais específico vence. "/" só vale exato (Clientes; a ficha do cliente fica em /clientes/:id);
 * as telas do diagnóstico (/workroom/...) pertencem à Carteira de diagnósticos.
 */
export function moduloDoCaminho(pathname) {
  const caminho = (pathname || "/").replace(/\/+$/, "") || "/";
  let melhor = null;
  let tamanho = -1;
  for (const m of MODULOS) {
    if (m.externo) continue;
    const alvos = [m.to, ...(m.prefixos || [])];
    for (const alvo of alvos) {
      const casa = alvo === "/" ? caminho === "/" : caminho === alvo || caminho.startsWith(`${alvo.replace(/\/$/, "")}/`);
      if (casa && alvo.length > tamanho) { melhor = m; tamanho = alvo.length; }
    }
  }
  return melhor;
}

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca módulos por título, palavras-chave e descrição (sem ligar para acento ou maiúscula); o título vence. */
export function buscarModulos(termo, user, limite = 8) {
  const t = semAcento(termo).trim();
  if (!t) return [];
  const pontos = [];
  for (const m of MODULOS) {
    if (!podeVer(m, user)) continue;
    const titulo = semAcento(m.titulo);
    const area = semAcento(areaPorId(m.area)?.titulo);
    const palavras = (m.palavras || []).map(semAcento);
    let p = 0;
    if (titulo.startsWith(t)) p = 100;
    else if (titulo.includes(t)) p = 80;
    else if (palavras.some((w) => w.startsWith(t))) p = 60;
    else if (palavras.some((w) => w.includes(t))) p = 45;
    else if (area.includes(t)) p = 30;
    else if (semAcento(m.descricao).includes(t)) p = 20;
    if (p) pontos.push([p, m]);
  }
  return pontos.sort((a, b) => b[0] - a[0] || a[1].titulo.localeCompare(b[1].titulo)).slice(0, limite).map(([, m]) => m);
}
