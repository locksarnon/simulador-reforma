/**
 * Trilha de navegação (breadcrumb) padrão da Consultoria Tributária: a mesma hierarquia do menu e dos endereços, em toda tela.
 *
 *   Início > Consultoria Tributária > Carteira de Consultoria > <Cliente> > <Projeto> > <tela…>
 *
 * Regras: começa sempre por "Início"; o cliente aparece pelo nome (link para a página dele na carteira); o projeto não repete o nome
 * do cliente; o último item é a tela aberta, sem link. Projeto sem cliente único (diagnóstico de grupo) passa por "Projetos" ou
 * "Diagnósticos", as listas onde ele está.
 */
import { areaPorId as faseDoSaneamento, paramDaArea, rotuloNumerado, ABAS_COMUNS } from "@/components/saneamento-estoques/logica";

export const INICIO = { label: "Início", to: "/inicio" };
export const AREA_CONSULTORIA = { label: "Consultoria Tributária", to: "/area/diagnostico" };
export const CARTEIRA_CONSULTORIA = { label: "Carteira de Consultoria", to: "/consultoria/carteira" };
export const PROJETOS_CONSULTORIA = { label: "Projetos", to: "/consultoria/projetos" };
export const DIAGNOSTICOS = { label: "Diagnósticos", to: "/diagnostico" };

export const rotaClienteConsultoria = (cliente) => `/consultoria/carteira/${cliente.publico}/${cliente.id}`;
export const rotaProjeto = (id) => `/diagnostico/projetos/${id}`;
/** Saneamento do projeto; com fase (fase1, fase2, fechamento) e aba, o endereço abre direto nelas (`?fase=1&aba=casos`). */
export function rotaSaneamento(id, { fase, aba } = {}) {
  const q = new URLSearchParams();
  if (fase && paramDaArea(fase)) q.set("fase", paramDaArea(fase));
  if (aba) q.set("aba", aba);
  const s = q.toString();
  return `/diagnostico/projetos/${id}/saneamento${s ? `?${s}` : ""}`;
}
export const rotaRoteiroSaneamento = (id) => `/diagnostico/projetos/${id}/saneamento/roteiro`;

/** O último item é a tela aberta: sem link. */
export function finalizar(crumbs) {
  if (!crumbs.length) return crumbs;
  const { to: _semLink, ...ultimo } = crumbs[crumbs.length - 1];
  return [...crumbs.slice(0, -1), ultimo];
}

const comparavel = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

/**
 * Nome do projeto sem o nome do cliente: o projeto de consultoria nasce "<serviço> · <cliente>", e o cliente já está na trilha.
 * Nome editado à mão, sem o cliente, fica como está.
 */
export function rotuloDoProjeto(nome, nomeCliente) {
  const n = String(nome ?? "").trim();
  if (!n || !nomeCliente) return n;
  const partes = n.split(" · ");
  const resto = partes.filter((p) => comparavel(p) !== comparavel(nomeCliente));
  return resto.length && resto.length < partes.length ? resto.join(" · ") : n;
}

/**
 * Cliente do projeto (para a trilha): pessoa física, ou a única empresa do projeto. Grupo (várias empresas) = null.
 * `empresas` e `pessoas` são as listas já carregadas pela tela.
 */
export function clienteDoProjeto(p, { empresas = [], pessoas = [] } = {}) {
  if (!p) return null;
  if (p.pessoa_fisica_id) {
    const pf = pessoas.find((c) => c.id === p.pessoa_fisica_id);
    return { publico: "PF", id: p.pessoa_fisica_id, nome: pf?.nome || "" };
  }
  if (p.empresa_ids?.length !== 1) return null;
  const e = empresas.find((x) => x.id === p.empresa_ids[0]);
  return { publico: "PJ", id: p.empresa_ids[0], nome: e?.razao_social || "" };
}

/** Telas da área: Início > Consultoria Tributária > <tela>. */
export const trilhaDaConsultoria = (...telas) => finalizar([INICIO, AREA_CONSULTORIA, ...telas]);

/** Página do cliente na carteira: Início > Consultoria Tributária > Carteira de Consultoria > <Cliente>. */
export const trilhaDoCliente = (cliente, ...telas) => finalizar([INICIO, AREA_CONSULTORIA, CARTEIRA_CONSULTORIA,
  { label: cliente?.nome || "Cliente", ...(cliente?.id ? { to: rotaClienteConsultoria(cliente) } : {}) }, ...telas]);

/** Enquanto o projeto ou o cliente carregam: só "Início > Consultoria Tributária", para a trilha não pular de forma. */
export const TRILHA_CARREGANDO = [INICIO, AREA_CONSULTORIA];

/**
 * Projeto (e as telas dentro dele): com cliente único, pela Carteira de Consultoria e o cliente; senão, pela lista de projetos
 * (consultoria) ou de diagnósticos. `carregando` (ou o cliente ainda carregando) = TRILHA_CARREGANDO.
 */
export function trilhaDoProjeto({ projeto: p, cliente, telas = [], carregando = false }) {
  if (carregando || cliente?.carregando) return TRILHA_CARREGANDO;
  const id = p?.id;
  const nomeCliente = cliente?.nome || "";
  const projetoItem = { label: rotuloDoProjeto(p?.nome, nomeCliente) || "Projeto", ...(id ? { to: rotaProjeto(id) } : {}) };
  if (cliente && nomeCliente) return trilhaDoCliente(cliente, projetoItem, ...telas);
  const lista = p && !p.servico_consultoria ? DIAGNOSTICOS : PROJETOS_CONSULTORIA;
  return finalizar([INICIO, AREA_CONSULTORIA, lista, projetoItem, ...telas]);
}

/**
 * Telas do saneamento: "Saneamento de estoques > Fase 1 > 1.3 Casos". Áreas comuns (Tabela, Visão geral…) vêm sem a fase, como na
 * faixa de abas; sem fase/aba definidas ainda, só "Saneamento de estoques".
 */
export function telasDoSaneamento(id, { fase, aba } = {}) {
  const raiz = { label: "Saneamento de estoques", to: rotaSaneamento(id) };
  if (!fase || !aba) return [raiz];
  if (ABAS_COMUNS.some((a) => a.id === aba)) return [raiz, { label: rotuloNumerado(fase, aba), to: rotaSaneamento(id, { fase, aba }) }];
  const area = faseDoSaneamento(fase);
  if (!area) return [raiz];
  return [raiz, { label: area.rotulo.split(" · ")[0], to: rotaSaneamento(id, { fase }) }, { label: rotuloNumerado(fase, aba), to: rotaSaneamento(id, { fase, aba }) }];
}
