// Checagens (passo 2): cada critério vira uma checagem com a COBERTURA (o que foi examinado), a CONCLUSÃO (um de quatro estados) e a EVIDÊNCIA (quem concluiu, quando, sobre qual
// base e o que escreveu). Aqui só se junta o que analise.js já calcula; nada é gravado e nada é alterado no cadastro. Funções puras.
//   - SEM_ACHADOS: a checagem foi feita em todos os grupos e não achou nada (teste automático que rodou por inteiro, ou conferência manual concluída sem achados);
//   - COM_ACHADOS: a checagem foi feita em todos os grupos e há achados (os do teste automático ou os que o analista registrou na conferência manual);
//   - NAO_APLICAVEL: o analista declarou, com justificativa escrita, que a checagem não se aplica ao projeto;
//   - PENDENTE: o resto (sem base, análise da importação não executada, regra sem aprovação ou grupos sem conclusão): nada se conclui sobre o que não foi verificado.
import { CRITERIOS, dataBr } from "./logica";
import { ANALISE_DO_CRITERIO, NOTA_MIN, achadosDe, coberturaDoCriterio, grupoTratado, marcaConclui, naoAplicavelDe, resultadoDoGrupo, situacaoCriterio } from "./analise";

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const plural = (n, um, varios) => `${fmt(n)} ${n === 1 ? um : varios}`;

export const ROTULO_CONCLUSAO = { SEM_ACHADOS: "Verificada sem achados", COM_ACHADOS: "Verificada com achados", NAO_APLICAVEL: "Não se aplica", PENDENTE: "Pendente" };
export const ROTULO_CAUSA = {
  SEM_BASE: "não há base com itens em escopo, nada foi verificado",
  SEM_ANALISE: "a análise de que o teste depende não foi executada nesta base",
  REGRA_NAO_APROVADA: "a regra ainda não foi aprovada",
  REGRA_REABERTA: "a regra foi reaberta para revisão manual",
  GRUPOS_SEM_CONCLUSAO: "há grupos sem conclusão",
};

/**
 * A checagem de um critério: { id, titulo, tipo (AUTOMATICA | MANUAL), conclusao, causa (só no PENDENTE), achados (null na conferência manual), situacaoRegra, cobertura, evidencia }.
 * `grupos` são os grupos em escopo ([{ nome, itens }]). A conclusão só sai quando a regra está em uso e TODOS os grupos em escopo estão concluídos na base de hoje.
 */
export function checagemDe(estado, crit, contagem, grupos = []) {
  const regra = estado?.criterios?.[crit.id] || {}; const sit = situacaoCriterio(estado, crit, contagem);
  const tipo = crit.auto ? "AUTOMATICA" : "MANUAL"; const dep = crit.auto ? ANALISE_DO_CRITERIO[crit.id] : null;
  const concluidos = []; const pendentes = []; const marcas = [];
  if (contagem) {
    for (const g of grupos) {
      if (grupoTratado(estado, g.nome, crit, contagem)) {
        concluidos.push(g.nome); const m = estado?.tratados?.[`${g.nome}|${crit.id}`];
        if (m && typeof m === "object" && marcaConclui(m, crit, contagem.baseId)) marcas.push(m);
      } else pendentes.push(g.nome);
    }
  }
  const semBase = !contagem || !grupos.length;
  let conclusao; let causa = null;
  if (sit === "NAO_APLICAVEL") conclusao = "NAO_APLICAVEL";
  else if (semBase) { conclusao = "PENDENTE"; causa = "SEM_BASE"; }
  else if (sit === "SEM_ANALISE") { conclusao = "PENDENTE"; causa = "SEM_ANALISE"; }
  else if (sit === "PENDENTE") { conclusao = "PENDENTE"; causa = regra.aprovado === false ? "REGRA_REABERTA" : "REGRA_NAO_APROVADA"; }
  else if (pendentes.length) { conclusao = "PENDENTE"; causa = "GRUPOS_SEM_CONCLUSAO"; }
  else conclusao = concluidos.some((n) => resultadoDoGrupo(estado, n, crit, contagem) === "COM_ACHADOS") ? "COM_ACHADOS" : "SEM_ACHADOS";
  const ultima = marcas.filter((m) => m.em).sort((a, b) => String(b.em).localeCompare(String(a.em)))[0] || marcas[0] || null;
  return {
    id: crit.id, titulo: crit.titulo, tipo, conclusao, causa, achados: achadosDe(contagem, crit), situacaoRegra: sit,
    cobertura: { tipo, itens: semBase ? 0 : grupos.reduce((s, g) => s + g.itens.length, 0), grupos: grupos.length, gruposConcluidos: concluidos.length, gruposPendentes: pendentes,
      analise: dep ? { rotulo: dep.rotulo, executada: !!coberturaDoCriterio(contagem, crit).completa } : null },
    evidencia: {
      regra: sit === "APROVADO" ? { por: regra.por || "", em: regra.em || "" } : sit === "AUTO" ? { automatica: true } : null,
      naoAplicavel: sit === "NAO_APLICAVEL" ? naoAplicavelDe(estado, crit) : null,
      grupos: { concluidos: marcas.length, comEvidencia: marcas.filter((m) => String(m.nota ?? "").trim().length >= NOTA_MIN).length, ultima: ultima ? { por: ultima.por || "", em: ultima.em || "", base: ultima.base || "" } : null },
    },
  };
}

/** As checagens de todos os critérios, na ordem do catálogo. */
export const checagens = (estado, contagem, grupos) => CRITERIOS.map((c) => checagemDe(estado, c, contagem, grupos));

/** Quantas checagens há em cada estado, quais estão pendentes e, entre elas, as de conferência manual (as pendências que ninguém vê sozinhas). */
export function resumoChecagens(lista) {
  const r = { total: lista.length, SEM_ACHADOS: 0, COM_ACHADOS: 0, NAO_APLICAVEL: 0, PENDENTE: 0, concluidas: 0, pendentes: [], manuaisPendentes: [] };
  for (const c of lista) {
    r[c.conclusao] += 1;
    if (c.conclusao === "PENDENTE") { r.pendentes.push(c); if (c.tipo === "MANUAL") r.manuaisPendentes.push(c); } else r.concluidas += 1;
  }
  return r;
}

/** Por que a checagem está pendente, em uma frase ("há grupos sem conclusão" vem com a conta). */
export function textoCausa(ch) {
  if (!ch.causa) return "";
  if (ch.causa === "GRUPOS_SEM_CONCLUSAO") { const c = ch.cobertura; return `${ROTULO_CAUSA.GRUPOS_SEM_CONCLUSAO}: ${fmt(c.gruposConcluidos)} de ${fmt(c.grupos)} ${c.grupos === 1 ? "grupo concluído" : "grupos concluídos"}`; }
  return ROTULO_CAUSA[ch.causa];
}

/** A conclusão em palavras: o estado e, conforme o caso, o número de achados ou a causa da pendência. */
export function textoConclusao(ch) {
  const base = ROTULO_CONCLUSAO[ch.conclusao];
  if (ch.conclusao === "PENDENTE") return `${base}: ${textoCausa(ch)}`;
  if (ch.conclusao === "COM_ACHADOS" && ch.achados) return `${base} (${plural(ch.achados, "achado", "achados")})`;
  return base;
}

/** O que foi examinado, em uma frase. */
export function textoCobertura(ch) {
  const c = ch.cobertura;
  if (ch.conclusao === "NAO_APLICAVEL") return "Não se aplica a este projeto: nada foi examinado";
  if (ch.causa === "SEM_BASE") return "Sem base com itens em escopo: nada foi examinado";
  if (c.tipo === "MANUAL") return `Conferência manual: ${fmt(c.gruposConcluidos)} de ${fmt(c.grupos)} ${c.grupos === 1 ? "grupo concluído" : "grupos concluídos"}`;
  const teste = `Teste automático em ${plural(c.itens, "item", "itens")} de ${plural(c.grupos, "grupo", "grupos")}`;
  if (!c.analise) return teste;
  return c.analise.executada ? `${teste}; análise da importação executada (${c.analise.rotulo})` : `${teste}; análise da importação NÃO executada (${c.analise.rotulo}): o teste não vê o problema por inteiro`;
}

/** A evidência da checagem, em linhas: a regra (quem aprovou), a justificativa do "não se aplica" e as conclusões por grupo (quem, quando e se há evidência escrita). */
export function linhasEvidencia(ch) {
  const e = ch.evidencia; const l = [];
  if (e.naoAplicavel) l.push(`Declarada não aplicável por ${e.naoAplicavel.por || "—"} em ${dataBr(e.naoAplicavel.em) || "—"}: ${e.naoAplicavel.justificativa}`);
  if (e.regra?.automatica) l.push("Teste automático sem achados: a regra abriu aprovada");
  else if (e.regra) l.push(`Regra aprovada por ${e.regra.por || "—"} em ${dataBr(e.regra.em) || "—"}`);
  const g = e.grupos;
  if (g.concluidos > 0) {
    const quem = g.ultima ? `; última por ${g.ultima.por || "—"} em ${dataBr(g.ultima.em) || "—"}` : "";
    l.push(ch.tipo === "MANUAL" ? `${plural(g.concluidos, "grupo concluído", "grupos concluídos")} com ${g.comEvidencia === g.concluidos ? "evidência escrita" : `evidência escrita em ${g.comEvidencia}`}${quem}` : `${plural(g.concluidos, "grupo com achados concluído", "grupos com achados concluídos")} pelo analista${quem}`);
  }
  return l;
}
