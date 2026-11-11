import { naCarteira } from "@/lib/servicos";

/** Filtros rápidos da lista de clientes (os "chips" de cima), na ordem em que aparecem. */
export const FILTROS_RAPIDOS = [
  { id: "todos", rotulo: "Todos" },
  { id: "bpo", rotulo: "BPO fiscal" },
  { id: "diagnostico", rotulo: "Diagnóstico pontual" },
  { id: "sem-servico", rotulo: "Sem serviço" },
  { id: "sem-responsavel", rotulo: "Sem responsável" },
];

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (s) => String(s ?? "").replace(/\D/g, "");

/** O cliente passa no filtro rápido? `atendidas` = ids das empresas que têm colaborador. */
export function passaNoRapido(empresa, porTipo = {}, rapido, atendidas) {
  const bpo = naCarteira(porTipo.BPO_FISCAL);
  const diag = naCarteira(porTipo.DIAGNOSTICO_PONTUAL);
  switch (rapido) {
    case "bpo": return bpo;
    case "diagnostico": return diag;
    case "sem-servico": return !bpo && !diag;
    case "sem-responsavel": return !atendidas.has(empresa.id);
    default: return true;
  }
}

/** Busca por nome, código, CNPJ/CPF (com ou sem pontuação), município ou grupo. */
export function casaBusca(empresa, busca, grupo) {
  const q = semAcento(busca).trim();
  if (!q) return true;
  const d = digitos(busca);
  if (d.length >= 3 && digitos(empresa.cnpj_cpf).includes(d)) return true;
  return [empresa.razao_social, empresa.id_empresa, empresa.municipio, empresa.uf, grupo?.nome, grupo?.numero].some((v) => semAcento(v).includes(q));
}

/**
 * A lista de clientes já filtrada e em ordem alfabética.
 * filtros: { busca, rapido, regime, uf }; mapa: serviços por empresa; grupos: lista de grupos; atendidas: Set de ids com colaborador.
 */
export function filtrarClientes(empresas, { busca = "", rapido = "todos", regime = "", uf = "" } = {}, mapa = new Map(), grupos = [], atendidas = new Set()) {
  const grupoPorNumero = new Map(grupos.map((g) => [g.numero, g]));
  return empresas
    .filter((e) => passaNoRapido(e, mapa.get(e.id), rapido, atendidas))
    .filter((e) => !regime || (regime === "—" ? !e.regime_atual : e.regime_atual === regime))
    .filter((e) => !uf || e.uf === uf)
    .filter((e) => casaBusca(e, busca, grupoPorNumero.get(e.grupo)))
    .sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR"));
}

/** Quantos clientes há em cada filtro rápido (os números dos chips). */
export function contarRapidos(empresas, mapa = new Map(), atendidas = new Set()) {
  return Object.fromEntries(FILTROS_RAPIDOS.map((f) => [f.id, empresas.filter((e) => passaNoRapido(e, mapa.get(e.id), f.id, atendidas)).length]));
}

/** Endereço do trabalho de diagnóstico da empresa (as telas de diagnóstico continuam por grupo); null se o grupo não existe. */
export function caminhoDoDiagnostico(empresa, grupos = []) {
  const g = grupos.find((x) => x.numero === empresa?.grupo);
  return g ? `/workroom/${g.id}/empresas/${empresa.id}` : null;
}

/** O grupo só é mostrado quando é um grupo de verdade (com mais de uma empresa ou criado como grupo, não o "Cliente individual"). */
export function grupoVisivel(grupo, empresas = []) {
  if (!grupo) return null;
  if (grupo.tipo !== "Cliente individual") return grupo;
  return empresas.filter((e) => e.grupo === grupo.numero).length > 1 ? grupo : null;
}

/** Rótulo do grupo para a linha do cliente, sem repetir a palavra quando o nome já começa com "Grupo". */
export const rotuloDoGrupo = (grupo) => (grupo ? (/^grupo\s/i.test(grupo.nome.trim()) ? grupo.nome.trim() : `Grupo ${grupo.nome.trim()}`) : null);

/** CNPJ (14) ou CPF (11) com a máscara; o que não for nenhum dos dois volta como veio. */
export function mascararDocumento(v) {
  const d = digitos(v);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v || "";
}

/** Os grupos de verdade (não os "Cliente individual") e todas as empresas, para o seletor único do painel. */
export function opcoesDoSeletor(grupos, empresas) {
  const reais = grupos.filter((g) => g.tipo !== "Cliente individual" || empresas.filter((e) => e.grupo === g.numero).length > 1);
  return {
    grupos: [...reais].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    empresas: [...empresas].filter((e) => e.grupo).sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR")),
  };
}
