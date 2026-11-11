/**
 * Etiquetas das empresas e listas salvas: cores, texto legível sobre a cor e os filtros que as telas de Clientes, BPO e Diagnóstico usam.
 * As regras de validação ficam no servidor (backend/src/tags); aqui só se monta a tela.
 */
export const CORES_DAS_TAGS = ["#1E764D", "#2563EB", "#B45309", "#7C3AED", "#BE123C", "#0F766E", "#4B5563", "#C2410C"];

/** Preto ou branco, o que ler melhor sobre a cor da etiqueta (luminância relativa, como no WCAG). */
export function corDoTexto(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#FFFFFF";
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia > 0.179 ? "#111827" : "#FFFFFF";
}

export const mapaDeTags = (tags) => new Map((tags || []).map((t) => [t.id, t]));

/** As etiquetas de uma empresa, em ordem alfabética. */
export function tagsDaEmpresa(porEmpresa, mapa, empresaId) {
  return (porEmpresa?.[empresaId] || []).map((id) => mapa.get(id)).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Filtra por etiquetas: "qualquer" (tem pelo menos uma das escolhidas) ou "todas" (tem todas). Sem escolha, devolve a lista inteira. */
export function filtrarPorTags(empresas, porEmpresa, ids, modo = "qualquer") {
  if (!ids?.length) return empresas;
  return empresas.filter((e) => {
    const dela = porEmpresa?.[e.id] || [];
    return modo === "todas" ? ids.every((i) => dela.includes(i)) : ids.some((i) => dela.includes(i));
  });
}

/** Filtra pela carteira do colaborador: "" (todas), "sem" (empresas que ninguém atende) ou o id do colaborador. */
export function filtrarPorColaborador(empresas, colaboradores, valor) {
  if (!valor) return empresas;
  if (valor === "sem") {
    const atendidas = new Set((colaboradores || []).flatMap((c) => c.empresa_ids));
    return empresas.filter((e) => !atendidas.has(e.id));
  }
  const dele = new Set((colaboradores || []).find((c) => c.id === valor)?.empresa_ids || []);
  return empresas.filter((e) => dele.has(e.id));
}

/** Aplica os critérios de uma lista salva sobre o estado padrão da página, ficando só com as chaves que a página usa. */
export function aplicarCriterios(padrao, criterios) {
  const resultado = { ...padrao };
  for (const chave of Object.keys(padrao)) if (criterios && criterios[chave] !== undefined) resultado[chave] = criterios[chave];
  return resultado;
}

/** Os critérios estão todos no padrão (nada filtrado)? Não faz sentido salvar uma lista assim. */
export function criteriosVazios(criterios) {
  return Object.entries(criterios || {}).every(([chave, v]) => (chave === "tagModo" ? true : Array.isArray(v) ? v.length === 0 : !v));
}
