// Checagens (passo 2): os achados de cada teste automático, a situação da regra de cada critério (aprovada pelo analista, aprovada automaticamente quando o teste rodou e não
// achou nada, sem a análise executada, não aplicável com justificativa ou pendente) e a conclusão por grupo. A conclusão da checagem inteira (verificada sem achados, com achados,
// não se aplica ou pendente) está em checagens.js. Funções puras (sem React).
import { CRITERIOS, achadosDoCriterio, grupoDe } from "./logica";

/** Achados de todos os critérios com teste automático, nos itens em escopo: { [critId]: [{ item, motivo, sugerida, extra }] }. */
export function calcularAchados(itensEmEscopo, testes) {
  const saida = {};
  for (const c of CRITERIOS) if (c.auto) saida[c.id] = achadosDoCriterio(c, itensEmEscopo, testes);
  return saida;
}

/**
 * Análises da importação de que o teste automático de um critério depende (`opcao` é a chave de `opcoes` da base). Sem elas o teste só vê parte do problema
 * (NCM sem a conferência de cClassTrib, duplicidade sem a investigação por descrição) ou nada (grupo): "nenhum achado" não prova que não há.
 */
export const ANALISE_DO_CRITERIO = {
  ncm: { opcao: "cClassTrib", rotulo: "a conferência de cClassTrib" },
  duplicidade: { opcao: "duplicidades", rotulo: "a investigação de duplicidades" },
  grupo: { opcao: "grupos", rotulo: "a sugestão de grupos de produto" },
};

/**
 * Quais análises rodaram na importação da base: { [critId]: { completa, opcao, falta } } para os critérios que dependem de uma. Vale a opção registrada com o
 * resultado (`base.opcoes`); numa base sem ela, a análise só conta como executada se algum item traz o que ela produz.
 */
export function coberturaDaBase(base) {
  const op = base?.opcoes; const itens = base?.itens || [];
  const tem = (chave, algum) => (op && chave in op ? !!op[chave] : itens.some(algum));
  const rodou = { cClassTrib: tem("cClassTrib", (i) => i.sugestao), duplicidades: tem("duplicidades", (i) => i.duplicidade), grupos: tem("grupos", (i) => i.grupo_flag) };
  return Object.fromEntries(Object.entries(ANALISE_DO_CRITERIO).map(([id, a]) => [id, { completa: !!rodou[a.opcao], opcao: a.opcao, falta: a.rotulo }]));
}

/**
 * Totais por critério e por grupo. null quando não há item em escopo: sem base (ou com tudo fora do escopo) não há como afirmar que "não há achado".
 * `cobertura` (de coberturaDaBase) segue junto da contagem: critério cuja análise não rodou não pode se dar por verificado. `baseId` (a base analisada) também segue: a marca
 * de "tratado" feita sobre outra base não vale para esta. E os `contextos` (de contextos.js: os itens do grupo em escopo e a configuração do teste de cada checagem): a marca feita com
 * outro escopo ou outra configuração também não vale.
 */
export function contarAchados(achados, totalEmEscopo, cobertura = {}, baseId = null, contextos = {}) {
  if (!totalEmEscopo) return null;
  const porCriterio = {}; const porGrupoCriterio = {};
  for (const [id, lista] of Object.entries(achados)) {
    porCriterio[id] = lista.length;
    for (const a of lista) { const k = `${grupoDe(a.item)}|${id}`; porGrupoCriterio[k] = (porGrupoCriterio[k] || 0) + 1; }
  }
  return { porCriterio, porGrupoCriterio, cobertura, baseId, contextos };
}

/** Achados do critério nos itens em escopo; null se o critério é conferido à mão ou ainda não há contagem. */
export const achadosDe = (contagem, crit) => (crit.auto && contagem ? contagem.porCriterio[crit.id] ?? 0 : null);

/** A análise de que o teste do critério depende rodou na base? { completa, falta } (completa também para o critério que não depende de análise opcional). */
export const coberturaDoCriterio = (contagem, crit) => (crit.auto && contagem?.cobertura?.[crit.id]) || { completa: true };

export const JUSTIFICATIVA_MIN = 10;
/** A declaração "não se aplica" do critério, se tiver a justificativa escrita; senão null (sem justificativa não vale). */
export function naoAplicavelDe(estado, crit) {
  const n = estado?.criterios?.[crit.id]?.naoAplicavel;
  return n && String(n.justificativa ?? "").trim().length >= JUSTIFICATIVA_MIN ? n : null;
}

/**
 * Situação de um critério:
 *  - NAO_APLICAVEL: o analista declarou, com justificativa, que o critério não se aplica ao projeto (não gera análise nem regra);
 *  - SEM_ANALISE: o teste automático depende de uma análise que não rodou na base (não há como dizer que não há achados);
 *  - APROVADO: o analista aprovou;
 *  - AUTO: teste automático que rodou por inteiro e não achou nada na base abre aprovado (não há o que aprovar);
 *  - PENDENTE: o resto. Reabrir (aprovado: false) pede revisão manual e vale mesmo sem achados.
 */
export function situacaoCriterio(estado, crit, contagem) {
  if (naoAplicavelDe(estado, crit)) return "NAO_APLICAVEL";
  if (!coberturaDoCriterio(contagem, crit).completa) return "SEM_ANALISE";
  const c = estado?.criterios?.[crit.id];
  if (c?.aprovado === true) return "APROVADO";
  if (c?.aprovado === false) return "PENDENTE";
  return achadosDe(contagem, crit) === 0 ? "AUTO" : "PENDENTE";
}
/** Critério em uso no trabalho (gera análise, lista e regra de política): aprovado pelo analista ou aprovado automaticamente. */
export const criterioAprovado = (estado, crit, contagem) => ["APROVADO", "AUTO"].includes(situacaoCriterio(estado, crit, contagem));
export const criteriosAprovados = (estado, contagem) => CRITERIOS.filter((c) => criterioAprovado(estado, c, contagem));
/** Critério resolvido para encerrar um grupo: em uso, ou declarado não aplicável com justificativa. */
export const criterioResolvido = (estado, crit, contagem) => criterioAprovado(estado, crit, contagem) || situacaoCriterio(estado, crit, contagem) === "NAO_APLICAVEL";

/**
 * A marca de "tratado" vale para a base analisada e para o que a conclusão examinou? A marca antiga (`true`) ou sem a base (ou o contexto) registrada vale como está; a feita sobre
 * outra base não vale: a análise daquela base não é a de hoje. A feita com outros itens em escopo no grupo ou com outra configuração do teste (`contexto`, de contexto.js) também não:
 * o analista confere o grupo de novo.
 */
export const marcaValida = (marca, baseId, contexto) => !!marca && (marca === true || ((!marca.base || !baseId || marca.base === baseId) && (!marca.contexto || !contexto || marca.contexto === contexto)));
/** Há uma marca de "tratado" que ficou para trás por ter sido feita sobre outra base? */
export const marcaDeOutraBase = (marca, baseId) => !!marca && marca !== true && !!marca.base && !!baseId && marca.base !== baseId;
/** Há uma marca de "tratado" desta base que ficou para trás porque o escopo do grupo ou a configuração do teste mudou depois dela? */
export const marcaDeOutroContexto = (marca, baseId, contexto) => !!marca && !marcaDeOutraBase(marca, baseId) && !marcaValida(marca, baseId, contexto);

export const NOTA_MIN = 5;
export const RESULTADOS_GRUPO = ["SEM_ACHADOS", "COM_ACHADOS"];
/**
 * A marca de uma conferência manual traz o resultado (sem achados ou com achados) e a evidência escrita (o que foi conferido e onde, ou o que foi achado)? Marca antiga
 * (`true` ou só quem e quando) não traz: a conferência manual sem evidência não conclui o grupo.
 */
export const marcaManualCompleta = (marca) => !!marca && marca !== true && RESULTADOS_GRUPO.includes(marca.resultado) && String(marca.nota ?? "").trim().length >= NOTA_MIN;
/** A marca conclui a checagem no grupo: vale para a base analisada e para o contexto de hoje e, na conferência manual, traz o resultado e a evidência escrita. */
export const marcaConclui = (marca, crit, baseId, contexto) => marcaValida(marca, baseId, contexto) && (!!crit.auto || marcaManualCompleta(marca));

/**
 * O grupo está concluído na checagem quando o analista concluiu (nesta base; na conferência manual, com resultado e evidência), ou quando o teste automático rodou por inteiro
 * e não achou nada nele. Sem a análise executada nada está concluído: a marca não substitui a análise que não houve.
 */
export function grupoTratado(estado, grupo, crit, contagem) {
  if (!coberturaDoCriterio(contagem, crit).completa) return false;
  if (marcaConclui(estado?.tratados?.[`${grupo}|${crit.id}`], crit, contagem?.baseId, contagem?.contextos?.[`${grupo}|${crit.id}`])) return true;
  return !!contagem && crit.auto && (contagem.porGrupoCriterio[`${grupo}|${crit.id}`] ?? 0) === 0;
}

/** O resultado da checagem no grupo: SEM_ACHADOS, COM_ACHADOS ou null (grupo ainda não concluído). No teste automático vem dos achados do grupo; na conferência manual, do que o analista declarou. */
export function resultadoDoGrupo(estado, grupo, crit, contagem) {
  if (!grupoTratado(estado, grupo, crit, contagem)) return null;
  if (crit.auto) return (contagem?.porGrupoCriterio?.[`${grupo}|${crit.id}`] ?? 0) > 0 ? "COM_ACHADOS" : "SEM_ACHADOS";
  return estado.tratados[`${grupo}|${crit.id}`].resultado;
}

/**
 * O que ainda impede sanear o grupo: todo critério aplicável precisa estar aprovado (os de conferência manual também) e tratado no grupo. Critério pendente,
 * sem a análise executada ou ainda não tratado no grupo é pendência; só o "não se aplica" justificado dispensa.
 */
export function criteriosPendentesDoGrupo(estado, grupo, contagem) {
  return CRITERIOS.filter((c) => {
    const s = situacaoCriterio(estado, c, contagem);
    if (s === "NAO_APLICAVEL") return false;
    if (s === "PENDENTE" || s === "SEM_ANALISE") return true;
    return !grupoTratado(estado, grupo, c, contagem);
  });
}

/** O grupo só pode ser saneado sem nenhuma pendência. */
export const grupoPodeSanear = (estado, grupo, contagem) => criteriosPendentesDoGrupo(estado, grupo, contagem).length === 0;

/** Grupo saneado de fato: marcado pelo analista e ainda sem pendência (se um critério for reaberto depois, o grupo deixa de valer como saneado). */
export const grupoSaneado = (estado, grupo, contagem) => !!estado?.saneados?.[grupo] && grupoPodeSanear(estado, grupo, contagem);

/** Achados de um critério agrupados por grupo de itens: [{ grupo, achados }], do grupo com mais achados para o com menos. */
export function agruparAchados(lista) {
  const m = new Map();
  for (const a of lista) { const g = grupoDe(a.item); const x = m.get(g); if (x) x.push(a); else m.set(g, [a]); }
  return [...m.entries()].map(([grupo, achados]) => ({ grupo, achados })).sort((a, b) => b.achados.length - a.achados.length || a.grupo.localeCompare(b.grupo, "pt-BR"));
}
