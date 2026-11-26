import { ForbiddenException } from '@nestjs/common';

/**
 * Níveis de acesso, telas e funções do InTAX. Espelho de src/lib/permissoes.js (o teste permissoes.test.ts confere que as listas são
 * iguais). O servidor é quem garante: o guarda global (permissoes.guard.ts) confere tela, alteração, exclusão e funções a cada pedido.
 */

export type Tela = { id: string; area: string; titulo: string };
export type Funcao = { id: FuncaoId; rotulo: string; descricao: string };
export type FuncaoId = 'alterar' | 'consultas_pagas' | 'transmitir' | 'enviar_email' | 'importar' | 'excluir' | 'arquivar_clientes' | 'certificados' | 'autorizar_lotes';
export type NivelId = 'ADMINISTRADOR' | 'GESTOR' | 'CONSULTOR' | 'ASSISTENTE' | 'SOMENTE_LEITURA';
export type Nivel = { id: NivelId; rotulo: string; descricao: string; telas: string[]; funcoes: FuncaoId[] };
export type Excecoes = { telas: Record<string, boolean>; funcoes: Record<string, boolean> };
export type Efetivas = { nivel: NivelId; admin: boolean; telas: string[]; funcoes: FuncaoId[] };
export type ContaComAcesso = { role?: string | null; nivel?: string | null; excecoes?: unknown; permissoes?: Efetivas | null } | null | undefined;

/** Telas que entram no controle (os módulos do menu). Início, Notificações, Meu perfil, Manual e as ferramentas públicas ficam sempre liberados. */
export const TELAS: Tela[] = [
  { id: 'painel-carteira', area: 'inicio', titulo: 'Painel da carteira' },
  { id: 'grupos-empresas', area: 'clientes', titulo: 'Clientes' },
  { id: 'grupos-economicos', area: 'clientes', titulo: 'Grupos econômicos' },
  { id: 'carteira', area: 'clientes', titulo: 'Carteira e colaboradores' },
  { id: 'tags', area: 'clientes', titulo: 'Tags e filtros' },
  { id: 'importacao-cadastro', area: 'clientes', titulo: 'Planilha cadastral' },
  { id: 'pessoas-fisicas', area: 'clientes', titulo: 'Pessoas físicas' },
  { id: 'procuracoes', area: 'clientes', titulo: 'Procurações e certificados' },
  { id: 'carteira-bpo', area: 'bpo', titulo: 'Carteira do BPO' },
  { id: 'captura-xml', area: 'bpo', titulo: 'Captura de XML' },
  { id: 'tarefas', area: 'bpo', titulo: 'Processos e tarefas' },
  { id: 'agenda-geral', area: 'bpo', titulo: 'Obrigações e agenda' },
  { id: 'monitoramento', area: 'bpo', titulo: 'Monitoramento fiscal' },
  { id: 'analise-risco', area: 'bpo', titulo: 'Análise de risco' },
  { id: 'arquivos', area: 'bpo', titulo: 'Arquivos e documentos' },
  { id: 'clientes-diagnostico', area: 'diagnostico', titulo: 'Carteira de Consultoria' },
  { id: 'carteira-diagnostico', area: 'diagnostico', titulo: 'Projetos' },
  { id: 'catalogo-consultoria', area: 'diagnostico', titulo: 'Serviços Tributários' },
  { id: 'painel-executivo', area: 'reforma', titulo: 'Painel executivo' },
  { id: 'regimes', area: 'reforma', titulo: 'Comparação de regimes' },
  { id: 'cenarios', area: 'reforma', titulo: 'Cenários e alíquotas' },
  { id: 'transicao', area: 'reforma', titulo: 'Transição 2026–2033' },
  { id: 'credito-estoque', area: 'reforma', titulo: 'Crédito presumido de estoque' },
  { id: 'catalogos', area: 'conhecimento', titulo: 'Catálogos IBS/CBS' },
  { id: 'consulta-ncm', area: 'conhecimento', titulo: 'Consulta NCM' },
  { id: 'guia-art-11', area: 'conhecimento', titulo: 'Guia do art. 11' },
  { id: 'base-legal', area: 'conhecimento', titulo: 'Bases legais' },
  { id: 'agenda-reforma', area: 'conhecimento', titulo: 'Agenda da Reforma' },
  { id: 'radar', area: 'conhecimento', titulo: 'Radar de novidades' },
  { id: 'noticias', area: 'conhecimento', titulo: 'Acervo de notícias' },
  { id: 'leads', area: 'comercial', titulo: 'Leads' },
  { id: 'pre-analise', area: 'comercial', titulo: 'Pré-análise por CNPJ' },
  { id: 'propostas', area: 'comercial', titulo: 'Propostas e honorários' },
  { id: 'comunicados', area: 'comercial', titulo: 'Comunicados' },
  { id: 'newsletter', area: 'comercial', titulo: 'Newsletter' },
  { id: 'usuarios', area: 'admin', titulo: 'Usuários e acessos' },
  { id: 'acessos', area: 'admin', titulo: 'Registro de acesso e IPs' },
  { id: 'comunicacoes', area: 'admin', titulo: 'Comunicações e envios' },
  { id: 'custos', area: 'admin', titulo: 'Custos das ferramentas' },
  { id: 'integracoes', area: 'admin', titulo: 'Integrações' },
  { id: 'configuracao', area: 'admin', titulo: 'Configuração do motor' },
  { id: 'parametros-rotinas', area: 'admin', titulo: 'Parâmetros e rotinas' },
  { id: 'roteiro-testes', area: 'suporte', titulo: 'Técnico: roteiro de testes' },
  { id: 'arquitetura', area: 'suporte', titulo: 'Técnico: arquitetura' },
];

/** O que a pessoa pode fazer dentro das telas liberadas. */
export const FUNCOES: Funcao[] = [
  { id: 'alterar', rotulo: 'Alterar dados', descricao: 'Criar, editar e salvar registros nas telas liberadas. Sem ela, o acesso é só para ver.' },
  { id: 'consultas_pagas', rotulo: 'Fazer consultas pagas', descricao: 'Consultas ao Serpro (Integra Contador, certidões, dívida ativa, NF-e) e à Infosimples, que entram no custo do mês.' },
  { id: 'transmitir', rotulo: 'Transmitir declarações à Receita', descricao: 'Entregas oficiais pelo Integra Contador, como a DCTFWeb, a opção de regime e o benefício do MEI.' },
  { id: 'enviar_email', rotulo: 'Enviar e-mails', descricao: 'Enviar documentos, comunicados, newsletter e guias por e-mail.' },
  { id: 'importar', rotulo: 'Importar planilhas e XML', descricao: 'Importar XML, planilhas de operações, de cadastro e de produtos.' },
  { id: 'excluir', rotulo: 'Excluir registros', descricao: 'Apagar registros (tarefas, documentos, eventos, propostas e afins).' },
  { id: 'arquivar_clientes', rotulo: 'Arquivar e desarquivar clientes', descricao: 'Tirar um cliente das listas e das rotinas, ou trazê-lo de volta.' },
  { id: 'certificados', rotulo: 'Enviar e remover certificados A1 e PIN do cofre', descricao: 'Guardar ou tirar o certificado A1 de um cliente e definir o PIN do cofre.' },
  { id: 'autorizar_lotes', rotulo: 'Preparar e autorizar atualização em lote', descricao: 'Atualizar vários clientes de uma vez no monitoramento, gerar guias da carteira e autorizar a recuperação do histórico de XML.' },
];

const AREAS_ADMIN = ['admin'];
const SO_ADMINISTRADOR = ['usuarios', 'acessos', 'integracoes', 'custos'];
const todasAsTelas = () => TELAS.map((t) => t.id);
const telasForaDoAdmin = () => TELAS.filter((t) => !AREAS_ADMIN.includes(t.area)).map((t) => t.id);
const todasAsFuncoes = () => FUNCOES.map((f) => f.id);

/** Níveis sugeridos. O nível define as telas e funções de partida; as exceções de cada pessoa ficam por cima. */
export const NIVEIS: Nivel[] = [
  { id: 'ADMINISTRADOR', rotulo: 'Administrador', descricao: 'Tudo, inclusive usuários, acessos, integrações e custos. Não tem exceções.', telas: todasAsTelas(), funcoes: todasAsFuncoes() },
  { id: 'GESTOR', rotulo: 'Gestor', descricao: 'Todas as telas, menos usuários, acessos, integrações e custos; todas as funções.', telas: todasAsTelas().filter((id) => !SO_ADMINISTRADOR.includes(id)), funcoes: todasAsFuncoes() },
  { id: 'CONSULTOR', rotulo: 'Consultor', descricao: 'As telas do dia a dia, sem a Administração; altera, faz consultas pagas, envia e-mails, importa e exclui.', telas: telasForaDoAdmin(), funcoes: ['alterar', 'consultas_pagas', 'enviar_email', 'importar', 'excluir'] },
  { id: 'ASSISTENTE', rotulo: 'Assistente', descricao: 'As mesmas telas do Consultor; altera, envia e-mails e importa, sem consultas pagas nem exclusões.', telas: telasForaDoAdmin(), funcoes: ['alterar', 'enviar_email', 'importar'] },
  { id: 'SOMENTE_LEITURA', rotulo: 'Somente leitura', descricao: 'As mesmas telas do Consultor, só para ver: não altera, não consulta e não envia nada.', telas: telasForaDoAdmin(), funcoes: [] },
];

export const NIVEL_PADRAO: NivelId = 'CONSULTOR';
export const nivelPorId = (id: unknown) => NIVEIS.find((n) => n.id === id) ?? null;
export const telaPorId = (id: string) => TELAS.find((t) => t.id === id) ?? null;
export const funcaoPorId = (id: string) => FUNCOES.find((f) => f.id === id) ?? null;
export const ehNivel = (id: unknown): id is NivelId => !!nivelPorId(id);

/** Nível de uma conta: administrador (role admin) é sempre ADMINISTRADOR; nível desconhecido vira o padrão. */
export function nivelDaConta(user: ContaComAcesso): NivelId {
  if (user?.role === 'admin') return 'ADMINISTRADOR';
  const n = user?.nivel;
  return n && n !== 'ADMINISTRADOR' && ehNivel(n) ? n : NIVEL_PADRAO;
}

/** Só as exceções conhecidas e que diferem do nível (o resto é o sugerido). */
export function normalizarExcecoes(excecoes: unknown, nivel: NivelId): Excecoes {
  const base = nivelPorId(nivel) ?? nivelPorId(NIVEL_PADRAO)!;
  const saida: Excecoes = { telas: {}, funcoes: {} };
  if (nivel === 'ADMINISTRADOR') return saida;
  const grupos: ['telas' | 'funcoes', { id: string }[], string[]][] = [['telas', TELAS, base.telas], ['funcoes', FUNCOES, base.funcoes]];
  for (const [grupo, lista, sugeridos] of grupos) {
    const vindas = excecoes && typeof excecoes === 'object' ? (excecoes as Record<string, unknown>)[grupo] : null;
    if (!vindas || typeof vindas !== 'object') continue;
    for (const item of lista) {
      const v = (vindas as Record<string, unknown>)[item.id];
      if (typeof v !== 'boolean') continue;
      if (v !== sugeridos.includes(item.id)) saida[grupo][item.id] = v;
    }
  }
  return saida;
}

/** Telas e funções que valem para a conta ({ role, nivel, excecoes }): as do nível com as exceções por cima (o Administrador não tem exceções). */
export function permissoesEfetivas(user: ContaComAcesso): Efetivas {
  const nivel = nivelDaConta(user);
  const base = nivelPorId(nivel)!;
  if (nivel === 'ADMINISTRADOR') return { nivel, admin: true, telas: [...base.telas], funcoes: [...base.funcoes] };
  const exc = normalizarExcecoes(user?.excecoes ?? null, nivel);
  const telas = TELAS.map((t) => t.id).filter((id) => (id in exc.telas ? exc.telas[id] : base.telas.includes(id)));
  const funcoes = FUNCOES.map((f) => f.id).filter((id) => (id in exc.funcoes ? exc.funcoes[id] : base.funcoes.includes(id)));
  return { nivel, admin: false, telas, funcoes };
}

/** As permissões de quem fez o pedido: as calculadas pelo JwtStrategy, ou pelo nível quando o objeto não as traz. */
export function efetivasDe(user: ContaComAcesso): Efetivas {
  if (user?.role === 'admin') return permissoesEfetivas(user);
  const p = user?.permissoes;
  if (p && Array.isArray(p.telas) && Array.isArray(p.funcoes)) return p;
  return permissoesEfetivas(user);
}

export const temFuncao = (user: ContaComAcesso, funcao: FuncaoId) => user?.role === 'admin' || efetivasDe(user).funcoes.includes(funcao);
export const temTela = (user: ContaComAcesso, tela: string) => user?.role === 'admin' || !telaPorId(tela) || efetivasDe(user).telas.includes(tela);

export const mensagemSemFuncao = (funcao: string) => `Seu acesso não permite: ${(funcaoPorId(funcao)?.rotulo ?? funcao).toLowerCase()}. Peça ao administrador.`;
export const mensagemSemTela = (tela: string) => `Sem acesso à tela ${telaPorId(tela)?.titulo ?? tela}. Peça ao administrador.`;

/** Para usar dentro dos serviços: falta a função, 403 com a explicação. */
export function exigirFuncao(user: ContaComAcesso, ...funcoes: FuncaoId[]) {
  for (const f of funcoes) if (!temFuncao(user, f)) throw new ForbiddenException(mensagemSemFuncao(f));
}

export function exigirTela(user: ContaComAcesso, tela: string) {
  if (!temTela(user, tela)) throw new ForbiddenException(mensagemSemTela(tela));
}

// ── Rotas do servidor ───────────────────────────────────────────────────────

/**
 * Rotas que pertencem a telas (padrão da rota, sem o prefixo global /api/v1; parâmetros como no controller). Vale o prefixo mais longo;
 * lista vazia = rota livre. Quem tem qualquer uma das telas da lista passa. Rotas que várias telas usam (cadastro de clientes, entidades,
 * base legal, tarefas e agenda do Início) não entram: nelas valem só as regras de alteração, exclusão e funções.
 */
export const ROTAS_DAS_TELAS: { rota: string; telas: string[] }[] = [
  { rota: 'pre-analises', telas: ['pre-analise'] },
  { rota: 'propostas', telas: ['propostas'] },
  { rota: 'comunicados', telas: ['comunicados'] },
  { rota: 'comunicacoes', telas: ['comunicacoes'] },
  { rota: 'newsletter', telas: ['newsletter'] },
  { rota: 'usuarios', telas: ['usuarios'] },
  { rota: 'acessos', telas: ['acessos'] },
  { rota: 'custos', telas: ['custos'] },
  { rota: 'custos/meu', telas: [] },
  { rota: 'integracoes', telas: ['integracoes'] },
  { rota: 'monitoramento', telas: ['monitoramento', 'procuracoes', 'analise-risco', 'arquivos', 'parametros-rotinas', 'integracoes'] },
  { rota: 'monitoramento/contrato', telas: ['integracoes'] },
  { rota: 'certidoes', telas: ['monitoramento', 'analise-risco'] },
  { rota: 'repositorio-xml', telas: ['captura-xml'] },
  { rota: 'projetos-diagnostico/:id/homologacao', telas: ['captura-xml', 'carteira-diagnostico', 'clientes-diagnostico'] },
  { rota: 'repositorio-xml/empresas/:empresaId/certificado', telas: ['captura-xml', 'grupos-empresas', 'procuracoes'] },
  { rota: 'repositorio-xml/empresas/:empresaId/auditoria-certificado', telas: ['captura-xml', 'grupos-empresas', 'procuracoes'] },
  { rota: 'certificados/pin', telas: ['captura-xml', 'grupos-empresas', 'procuracoes'] },
  { rota: 'captura-xml', telas: ['captura-xml'] },
  { rota: 'captura-xml/empresas', telas: ['captura-xml', 'grupos-empresas'] },
  { rota: 'radar-reforma', telas: ['radar'] },
  { rota: 'noticias', telas: ['noticias'] },
  { rota: 'downloads', telas: ['arquivos'] },
  { rota: 'processos', telas: ['tarefas'] },
  { rota: 'produtos', telas: ['carteira-diagnostico'] },
  { rota: 'operacoes-planilha', telas: ['carteira-diagnostico'] },
  { rota: 'xml', telas: ['carteira-diagnostico'] },
  { rota: 'cfop', telas: ['carteira-diagnostico'] },
  { rota: 'limpeza', telas: ['carteira-diagnostico'] },
  { rota: 'correlacao-servicos', telas: ['carteira-diagnostico'] },
  { rota: 'validador-nfse', telas: ['carteira-diagnostico'] },
  { rota: 'ncm', telas: ['consulta-ncm', 'carteira-diagnostico'] },
];

/** Entidades genéricas (/entities/:model) que pertencem a uma tela. */
export const ENTIDADES_DAS_TELAS: Record<string, string[]> = {
  Lead: ['leads'],
  NewsletterInscrito: ['newsletter'],
  NewsletterEdicao: ['newsletter'],
};

/** Pedidos que não são "alterar dados": a própria conta, a sessão e os avisos lidos. */
export const ROTAS_SEMPRE_LIVRES = ['auth', 'perfil', 'notificacoes'];

/** POST que só lê ou monta um arquivo (não grava nada): não exigem "Alterar dados". */
export const POST_DE_LEITURA = [
  'entities/:model/query',
  'comunicados/destinatarios',
  'monitoramento/empresas/:id/documentos/zip',
  'monitoramento/pessoas/:id/documentos/zip',
  'repositorio-xml/empresas/:empresaId/documentos/zip',
  'produtos/exportar',
  'propostas/calcular',
  'ncm/sugestoes',
  'validador-nfse/validar',
  'base-legal/perguntar',
  'base-legal/perguntar-aprofundado',
  'base-legal/perguntas/:id/enviar-relatorio',
  'limpeza/previa',
  'calculadora-rfb/conferir-operacao',
];

const segmentos = (rota: string) => rota.split('/').filter(Boolean);
const casaSegmento = (padrao: string, real: string) => padrao === real || (padrao.startsWith(':') && real.startsWith(':'));

/** A rota (padrão do controller) começa com o prefixo, segmento a segmento? */
export function rotaComeca(rota: string, prefixo: string) {
  const r = segmentos(rota);
  const p = segmentos(prefixo);
  return p.length <= r.length && p.every((s, i) => casaSegmento(s, r[i]));
}
const rotaIgual = (rota: string, outra: string) => segmentos(rota).length === segmentos(outra).length && rotaComeca(rota, outra);

/** Telas exigidas por uma rota (null = nenhuma). */
export function telasDaRota(rota: string, parametros: Record<string, unknown> = {}): string[] | null {
  if (rotaComeca(rota, 'entities/:model')) {
    const model = String(parametros.model ?? '');
    return ENTIDADES_DAS_TELAS[model] ?? null;
  }
  let melhor: { rota: string; telas: string[] } | null = null;
  for (const r of ROTAS_DAS_TELAS) {
    if (rotaComeca(rota, r.rota) && (!melhor || segmentos(r.rota).length > segmentos(melhor.rota).length)) melhor = r;
  }
  return melhor && melhor.telas.length ? melhor.telas : null;
}

export type Pedido = { metodo: string; rota: string; parametros?: Record<string, unknown>; funcoes?: FuncaoId[] };
export type Decisao = { ok: true } | { ok: false; motivo: string };

/**
 * A regra do guarda, sem Nest (para testar): administrador passa sempre; depois a tela da rota; depois as funções marcadas no endpoint
 * (@Permissao) ou, sem marca, "Alterar dados" para qualquer escrita e "Excluir registros" para DELETE.
 */
export function decidirAcesso(user: ContaComAcesso, pedido: Pedido): Decisao {
  if (!user) return { ok: true };
  if (user.role === 'admin') return { ok: true };
  const p = efetivasDe(user);
  const rota = segmentos(pedido.rota).join('/');
  const telas = telasDaRota(rota, pedido.parametros);
  if (telas && !telas.some((t) => p.telas.includes(t))) return { ok: false, motivo: mensagemSemTela(telas[0]) };
  const metodo = pedido.metodo.toUpperCase();
  const escrita = !['GET', 'HEAD', 'OPTIONS'].includes(metodo);
  const exigidas = pedido.funcoes ?? [];
  if (exigidas.length) {
    const falta = exigidas.find((f) => !p.funcoes.includes(f));
    return falta ? { ok: false, motivo: mensagemSemFuncao(falta) } : { ok: true };
  }
  if (!escrita || ROTAS_SEMPRE_LIVRES.some((r) => rotaComeca(rota, r))) return { ok: true };
  if (metodo === 'POST' && POST_DE_LEITURA.some((r) => rotaIgual(rota, r))) return { ok: true };
  if (!p.funcoes.includes('alterar')) return { ok: false, motivo: 'Seu acesso é somente para ver: não permite alterar dados. Peça ao administrador.' };
  if (metodo === 'DELETE' && !p.funcoes.includes('excluir')) return { ok: false, motivo: mensagemSemFuncao('excluir') };
  return { ok: true };
}
