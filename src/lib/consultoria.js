/**
 * Serviços de Consultoria Tributária por cliente: cada vínculo (VinculoConsultoria) liga um cliente a um serviço do catálogo
 * (backend/src/servicos-contratados/consultoria.service.ts). Os projetos de cada serviço são abertos na Carteira de Consultoria.
 */

/** A consultoria de pessoa jurídica exige CNPJ completo (14 caracteres, como o servidor confere). */
export const temCnpj = (doc) => String(doc ?? "").replace(/[^a-z0-9]/gi, "").length === 14;

/** Endereço do cliente na Carteira de Consultoria. */
export const caminhoDaConsultoria = (clienteId, publico = "PJ") => `/consultoria/carteira/${publico}/${clienteId}`;

/** Projetos que contam como "em andamento" na Carteira de Consultoria. */
export const PROJETO_EM_ANDAMENTO = ["EM_ANDAMENTO", "PAUSADO"];

/** As áreas do catálogo, na ordem em que aparecem. */
export const areasDoCatalogo = (servicos = []) => [...new Set(servicos.map((s) => s.area))];

/**
 * Serviços de consultoria de cada cliente de um público (PJ ou PF): Map(cliente_id -> itens do catálogo, na ordem do vínculo).
 * Um vínculo com serviço que saiu do catálogo aparece pelo próprio código, sem área.
 */
export function indexarConsultoria(vinculos = [], catalogo = [], publico = "PJ") {
  const mapa = new Map();
  for (const v of vinculos || []) {
    if (v.publico !== publico) continue;
    const item = (catalogo || []).find((s) => s.id === v.servico) || { id: v.servico, nome: v.servico, area: "" };
    const lista = mapa.get(v.cliente_id) || [];
    if (!lista.some((s) => s.id === item.id)) lista.push(item);
    mapa.set(v.cliente_id, lista);
  }
  return mapa;
}

/** Projetos de um serviço de consultoria do cliente (PJ pelo empresa_ids, PF pela pessoa física). */
export function projetosDoServico(projetos = [], clienteId, servicoId, publico = "PJ") {
  return (projetos || []).filter((p) => p.servico_consultoria === servicoId
    && (publico === "PF" ? p.pessoa_fisica_id === clienteId : (p.empresa_ids || []).includes(clienteId)));
}

/** Situação do serviço na linha do cliente: projetos em andamento ou "ainda não iniciado". */
export function situacaoDoServico(projetos = [], clienteId, servicoId, publico = "PJ") {
  const todos = projetosDoServico(projetos, clienteId, servicoId, publico);
  const andamento = todos.filter((p) => PROJETO_EM_ANDAMENTO.includes(p.situacao)).length;
  if (andamento) return andamento === 1 ? "1 projeto em andamento" : `${andamento} projetos em andamento`;
  return todos.length ? "Sem projeto em andamento" : "Contratado · ainda não iniciado";
}
