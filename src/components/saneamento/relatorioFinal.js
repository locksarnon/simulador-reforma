// Relatório do programa de trabalho (PDF): o que foi feito em cada passo do saneamento, em blocos que o renderizador (relatorioPdf.js) desenha. Funções puras:
// tudo vem do estado do projeto, dos achados e das listas já calculadas; o que ainda não foi feito aparece como pendente, nunca como concluído. Só SUGERE:
// o relatório registra sugestões e decisões, e nada foi alterado no cadastro nem no ERP.
import { CRITERIOS, REGRAS_PADRAO, ROTULO_REGRAS, abreviacoesAprovadas, agruparPorGrupo, dataBr, dataDoCorte, decisoesDoTrabalho, normalizarParams } from "./logica";
import { criteriosAprovados, criteriosPendentesDoGrupo, situacaoCriterio } from "./analise";
import { contarDecisoes } from "./politica";
import { ORDEM_SITUACOES, SITUACOES, itensDoGrupoFiscal, leituraFiscal, resumoDeLeituras } from "./fiscal";
import { linhasQueSaem } from "./listasFinais";
import { resumoUnidades } from "./unidades";

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const plural = (n, um, varios) => `${fmt(n)} ${n === 1 ? um : varios}`;
const CASOS_PILOTO = ["Unificar duplicados", "Separar cadastro que mistura produtos", "Preservar referências após renumeração de catálogo", "Descontinuar código com dependências (cartilhas)"];
const SITUACAO_CRIT = { APROVADO: "Aprovado", AUTO: "Aprovado (sem achados)", PENDENTE: "Pendente" };

export const RESSALVAS = [
  "O saneamento só sugere: nenhum cadastro foi alterado pela ferramenta. Cada correção, unificação ou inativação passou por aprovação registrada e pela execução confirmada com evidência pelas equipes.",
  "A pontuação de similaridade entre descrições não é probabilidade nem prova de identidade técnica: toda indicação de duplicidade exige confirmação. Produto igual com complemento diferente (cor, tamanho, lado, material, sabor) é item diferente.",
  "A leitura fiscal compara o NCM com os anexos da LC 214/2025 consultados e não é parecer. Onde o anexo cita o capítulo ou a posição, ou o NCM abrange produtos com tratamentos diferentes, o enquadramento fica para revisão com especialista; sem enquadramento nos anexos não significa ausência de benefício por outra base legal.",
  "O CST e o cClassTrib de cada operação podem diferir do classificado para o produto e seguem na validação das operações; serviços são classificados por NBS e LC 116.",
  "Tarefas só contam como concluídas com a confirmação e a evidência de todas as frentes aplicáveis. Procedimentos de execução não comprovados no piloto SAP ficam sem liberação para execução em massa.",
  "A política de uso é uma proposta gerada do projeto: vale depois de revisada e aprovada pelo responsável.",
];

/** Andamento de cada passo: situação (Concluído, Em andamento, Não iniciado) e um resumo curto. */
export function andamentoDosPassos({ estado, itens, escopo, grupos, contagem, listas, politica }) {
  const nGrupos = grupos.length; const nSan = grupos.filter((g) => estado.saneados?.[g.nome]).length;
  const nCrit = criteriosAprovados(estado, contagem).length; const nPil = CASOS_PILOTO.filter((c) => estado.piloto?.[c]?.status === "Testado").length;
  const dec = Object.values(decisoesDoTrabalho(estado.decisoes, escopo)); const feitas = dec.filter((d) => d.status !== "PROP").length;
  const c = listas.contagem; const nFisc = grupos.filter((g) => estado.saneados?.[g.nome] && estado.fiscal?.grupos?.[g.nome]).length;
  const sit = (feito, algum) => (feito ? "Concluído" : algum ? "Em andamento" : "Não iniciado");
  return [
    ["1. Triagem", sit(itens.length > 0, false), itens.length ? `${fmt(escopo.emEscopo.length)} itens em escopo de ${fmt(itens.length)}` : "sem base"],
    ["2. Critérios", sit(nCrit === CRITERIOS.length, nCrit > 0), `${nCrit} de ${CRITERIOS.length} critérios aprovados`],
    ["3. Piloto SAP", sit(nPil === CASOS_PILOTO.length, Object.keys(estado.piloto || {}).length > 0), `${nPil} de ${CASOS_PILOTO.length} casos testados`],
    ["4. Análises", sit(nGrupos > 0 && nSan === nGrupos, nSan > 0 || Object.keys(estado.tratados || {}).length > 0), `${nSan} de ${nGrupos} grupos saneados`],
    ["5. De/para", sit(dec.length > 0 && feitas === dec.length, dec.length > 0), dec.length ? `${fmt(feitas)} de ${fmt(dec.length)} casos decididos` : "nenhum caso encaminhado"],
    ["6. Execução", sit(c.tarefas > 0 && c.concluidas === c.tarefas, c.tarefas > 0 && (c.concluidas > 0 || c.emAndamento > 0 || c.divergencias > 0)), c.tarefas ? `${fmt(c.concluidas)} de ${fmt(c.tarefas)} tarefas concluídas` : "nenhuma tarefa gerada"],
    ["7. Conferência", sit(false, c.tarefas > 0 || listas.analises.length > 0), "listas finais emitidas sob demanda no passo Conferência"],
    ["8. Fiscal", sit(nSan > 0 && nFisc === nSan, nFisc > 0 || Object.keys(estado.fiscal?.decisoes || {}).length > 0), nSan ? `${nFisc} de ${nSan} grupos liberados com a revisão fiscal concluída` : "nenhum grupo liberado"],
    ["9. Política", sit(politica.situacao === "Aprovada", Object.keys(estado.politica?.secoes || {}).length > 0), `política ${politica.situacao.toLowerCase()}`],
  ];
}

/** Monta o relatório: { titulo, subtitulo, rodape, blocos }. Cada bloco: titulo | sub | p | nota | kv | tabela | lista. */
export function montarRelatorioFinal({ nomeProjeto, nomeBase, quem, estado, itens, escopo, contagem, listas, politica, geradoEm = new Date() }) {
  const params = normalizarParams(estado.params); const corte = dataDoCorte(estado.params); const grupos = agruparPorGrupo(escopo.emEscopo);
  const universo = agruparPorGrupo(itens); const emEscopoPor = new Map(grupos.map((g) => [g.nome, g.itens.length]));
  const dec = contarDecisoes(decisoesDoTrabalho(estado.decisoes, escopo)); const c = listas.contagem;
  const b = []; const T = (n, texto) => b.push({ t: "titulo", n, texto }); const S = (texto) => b.push({ t: "sub", texto }); const P = (texto, t = "p") => b.push({ t, texto });

  b.push({ t: "kv", linhas: [["Projeto", nomeProjeto || "—"], ["Base importada", nomeBase || "—"], ["Gerado em", geradoEm.toLocaleString("pt-BR")], ["Gerado por", quem || "—"], ["Política de uso", politica.aprovada ? `aprovada por ${politica.aprovada.por} em ${dataBr(politica.aprovada.em)}` : "em rascunho"]] });
  T(null, "Resumo");
  b.push({ t: "tabela", cols: [{ label: "Passo", w: 22 }, { label: "Situação", w: 18 }, { label: "Andamento", w: 60 }], linhas: andamentoDosPassos({ estado, itens, escopo, grupos, contagem, listas, politica }) });
  b.push({ t: "kv", linhas: [
    ["Universo (códigos da base)", fmt(c.universo)], ...(c.itensForaGrupos ? [["Em grupos fora do saneamento", fmt(c.itensForaGrupos)]] : []), ["Fora do escopo (inativados por data de uso)", fmt(c.inativados)], ["Em escopo", fmt(c.emEscopo)],
    ["Lista final corrigida (códigos)", fmt(c.listaFinal)], ["Descrições corrigidas (aprovadas)", fmt(c.descricoesCorrigidas)], ["Unidades de estoque ajustadas (aprovadas)", fmt(c.unidadesAjustadas)],
    ["Unificações aprovadas", fmt(c.unificacoesAprovadas)], ["Unificações ainda em decisão", fmt(c.unificacoesPendentes)],
  ] });

  T(1, "Escopo e parâmetros");
  P(corte ? `Parâmetro de saneamento: desconsiderar itens não movimentados desde ${corte}. ${params.semData === "anterior" ? "Itens sem data de movimentação legível foram tratados como anteriores à data (saem do escopo)." : "Itens sem data de movimentação legível permaneceram no escopo, sinalizados."} ${fmt(c.semData)} itens não têm data legível.` : "Parâmetro de saneamento: sem corte por data; todos os itens dos grupos marcados entraram no escopo.");
  b.push({ t: "tabela", cols: [{ label: "Grupo de itens", w: 46 }, { label: "Itens na base", w: 16, align: "right" }, { label: "Em escopo", w: 16, align: "right" }, { label: "No saneamento", w: 22 }],
    linhas: universo.map((g) => [g.nome, fmt(g.itens.length), fmt(emEscopoPor.get(g.nome) || 0), estado.gruposFora?.[g.nome] ? "Fora (não inativado)" : "Sim"]) });

  T(2, "Critérios");
  P("Cada critério tem a sua regra, registrada com a aprovação. Critério com teste automático e sem achados abre aprovado; os demais só foram tratados depois de aprovados.");
  b.push({ t: "tabela", cols: [{ label: "Critério", w: 40 }, { label: "Teste", w: 18 }, { label: "Situação", w: 36 }, { label: "Achados", w: 14, align: "right" }],
    linhas: CRITERIOS.map((k) => { const s = situacaoCriterio(estado, k, contagem); const e = estado.criterios?.[k.id]; return [k.titulo, k.auto ? "Automático" : "Conferência manual", s === "APROVADO" ? `Aprovado por ${e?.por || "—"} em ${dataBr(e?.em) || "—"}` : SITUACAO_CRIT[s], k.auto ? fmt(contagem?.porCriterio?.[k.id] ?? 0) : "—"]; }) });
  for (const k of CRITERIOS) {
    if (situacaoCriterio(estado, k, contagem) === "PENDENTE") continue;
    S(k.titulo); P(estado.criterios?.[k.id]?.regra ?? k.regra);
    if (k.id === "padrao") { const lig = Object.entries(ROTULO_REGRAS).filter(([r]) => ({ ...REGRAS_PADRAO, ...(estado.padronizacao?.regras || {}) })[r]).map(([, r]) => r.replace(/ \(ex\.:.*\)$/, "")); P(`Regras de formato ligadas: ${lig.join("; ") || "nenhuma"}. Abreviações aprovadas: ${plural(Object.keys(abreviacoesAprovadas(estado)).length, "abreviação", "abreviações")}.`, "nota"); }
    if (k.id === "unidade") { const u = resumoUnidades(escopo.emEscopo, { regras: estado.politicaUnidade?.regras, rotulos: estado.politicaUnidade?.rotulos }); P(`Nome da unidade de estoque por medida: ${Object.entries(u.padroes).map(([g, n]) => `${g} ${n}`).join(", ")}. Unidades classificadas pelo analista: ${fmt(Object.keys(estado.politicaUnidade?.regras || {}).length)}.`, "nota"); }
  }

  T(3, "Piloto SAP");
  P("Registro dos testes no ambiente do cliente. Nenhuma capacidade é tratada como confirmada sem teste registrado.");
  b.push({ t: "tabela", cols: [{ label: "Caso", w: 44 }, { label: "Situação", w: 18 }, { label: "Evidência", w: 40 }, { label: "Limitações", w: 40 }], linhas: CASOS_PILOTO.map((n) => { const p = estado.piloto?.[n] || {}; return [n, p.status || "Não iniciado", p.evidencia || "—", p.limitacao || "—"]; }) });

  T(4, "Análises e decisões");
  b.push({ t: "tabela", cols: [{ label: "Grupo", w: 44 }, { label: "Itens", w: 14, align: "right" }, { label: "Achados", w: 16, align: "right" }, { label: "Critérios pendentes", w: 22, align: "right" }, { label: "Situação", w: 24 }],
    linhas: grupos.map((g) => [g.nome, fmt(g.itens.length), fmt(CRITERIOS.reduce((n, k) => n + (contagem?.porGrupoCriterio?.[`${g.nome}|${k.id}`] ?? 0), 0)), fmt(criteriosPendentesDoGrupo(estado, g.nome, contagem).length), estado.saneados?.[g.nome] ? "Saneado" : "Pendente"]) });
  S("Decisões por critério");
  b.push({ t: "tabela", cols: [{ label: "Critério", w: 52 }, { label: "Encaminhadas", w: 22, align: "right" }, { label: "Aprovadas", w: 20, align: "right" }, { label: "Rejeitadas", w: 20, align: "right" }, { label: "Aguardando", w: 20, align: "right" }],
    linhas: CRITERIOS.filter((k) => dec[k.id]).map((k) => [k.titulo, fmt(dec[k.id].total), fmt(dec[k.id].APR), fmt(dec[k.id].REJ), fmt(dec[k.id].PROP)]) });
  if (!Object.keys(dec).length) P("Nenhum caso foi encaminhado para aprovação até agora.", "nota");

  T(5, "Execução e conferência");
  b.push({ t: "kv", linhas: [["Tarefas geradas", fmt(c.tarefas)], ["Concluídas (todas as frentes, com evidência)", fmt(c.concluidas)], ["Em andamento", fmt(c.emAndamento)], ["Pendentes", fmt(c.pendentes)], ["Com divergência", fmt(c.divergencias)]] });
  P("As listas finais (lista final corrigida, desduplicações, análises, itens inativados por data de uso e execução) são emitidas em Excel no passo Conferência e refletem as decisões registradas.", "nota");

  T(6, "Revisão fiscal");
  const saem = linhasQueSaem(estado, itens); const liberados = grupos.filter((g) => estado.saneados?.[g.nome]);
  if (!liberados.length) P("Nenhum grupo foi liberado para a revisão fiscal até agora (a revisão começa em grupo saneado).");
  else b.push({ t: "tabela", cols: [{ label: "Grupo", w: 40 }, { label: "Itens", w: 12, align: "right" }, { label: "A decidir", w: 16, align: "right" }, { label: "A revisar com especialista", w: 26, align: "right" }, { label: "Decididos", w: 16, align: "right" }, { label: "Situação", w: 24 }],
    linhas: liberados.map((g) => { const r = resumoDeLeituras(itensDoGrupoFiscal(g.itens, g.nome, saem).map((it) => leituraFiscal(it)), estado.fiscal?.decisoes); const k = estado.fiscal?.grupos?.[g.nome]; return [g.nome, fmt(r.total), fmt(r.pendentes), fmt(r.revisar), fmt(r.decididos), k ? `Concluída por ${k.por} em ${dataBr(k.em)}` : "Em revisão"]; }) });
  const tot = liberados.reduce((a, g) => { const r = resumoDeLeituras(itensDoGrupoFiscal(g.itens, g.nome, saem).map((it) => leituraFiscal(it)), estado.fiscal?.decisoes); for (const s of ORDEM_SITUACOES) a[s] = (a[s] || 0) + r.porSit[s]; return a; }, {});
  if (liberados.length) b.push({ t: "tabela", cols: [{ label: "Situação fiscal (grupos liberados)", w: 84 }, { label: "Itens", w: 20, align: "right" }], linhas: ORDEM_SITUACOES.filter((s) => tot[s]).map((s) => [SITUACOES[s].rotulo, fmt(tot[s])]) });
  P("A classe sugerida vem da correlação do NCM com os anexos da LC 214/2025 consultados; é sugestão para revisão, não parecer. A matriz fiscal de cada grupo (proposta, fundamento, validação e pendências) é emitida em Excel no passo Fiscal.", "nota");

  T(7, "Política de uso dos estoques");
  P(`Situação: ${politica.situacao}${politica.aprovada ? ` (aprovada por ${politica.aprovada.por} em ${dataBr(politica.aprovada.em)})` : ""}. As regras nascem dos critérios aprovados e das causas encontradas.`);
  for (const s of politica.secoes) {
    S(s.titulo);
    b.push({ t: "lista", itens: s.regras.map((r) => r.texto) });
    P(`Responsável: ${s.responsavel || "a definir"}. Controle: ${s.controle || "a definir"}.`, "nota");
  }
  const comRegra = politica.porGrupo.filter((g) => g.regra);
  if (comRegra.length) { S("Regras por grupo"); b.push({ t: "tabela", cols: [{ label: "Grupo", w: 40 }, { label: "Regra", w: 100 }], linhas: comRegra.map((g) => [g.grupo, g.regra]) }); }
  if (politica.pendencias.length) { S("Pendências da política"); b.push({ t: "lista", itens: politica.pendencias }); }

  T(8, "Ressalvas");
  b.push({ t: "lista", itens: RESSALVAS });
  return { titulo: "Saneamento de estoques", subtitulo: "Relatório do programa de trabalho", rodape: `${nomeProjeto || "Saneamento de estoques"} · ${geradoEm.toLocaleDateString("pt-BR")}`, blocos: b };
}
