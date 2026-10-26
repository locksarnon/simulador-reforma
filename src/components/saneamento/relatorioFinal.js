// Relatório do programa de trabalho (PDF): o que foi feito em cada passo do saneamento, em blocos que o renderizador (relatorioPdf.js) desenha. Funções puras:
// tudo vem do estado do projeto, dos achados e das listas já calculadas; o que ainda não foi feito aparece como pendente, nunca como concluído. Só SUGERE:
// o relatório registra sugestões e decisões, e nada foi alterado no cadastro nem no ERP.
import { CRITERIOS, REGRAS_PADRAO, ROTULO_REGRAS, abreviacoesAprovadas, agruparPorGrupo, dataBr, dataDoCorte, decisoesDoTrabalho, normalizarParams } from "./logica";
import { criteriosPendentesDoGrupo, grupoSaneado, marcaConclui, naoAplicavelDe, situacaoCriterio } from "./analise";
import { checagens, linhasEvidencia, resumoChecagens, textoCobertura, textoConclusao } from "./checagens";
import { contarDecisoes } from "./politica";
import { ORDEM_SITUACOES, SITUACOES, itensDoGrupoFiscal, leituraFiscal, resumoDeLeituras } from "./fiscal";
import { linhasQueSaem } from "./listasFinais";
import { resumoUnidades } from "./unidades";
import { efeitoObservacao, gruposMarcados, palavrasEmVigor } from "./observacao";
import { indexar } from "./identidade";
import { coerenciaDaChave } from "./aprovacao";
import { candidatosDaInativacao, situacaoDoCandidato } from "./inativacao";

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const plural = (n, um, varios) => `${fmt(n)} ${n === 1 ? um : varios}`;
const CASOS_PILOTO = ["Unificar duplicados", "Separar cadastro que mistura produtos", "Preservar referências após renumeração de catálogo", "Descontinuar código com dependências (cartilhas)"];

export const RESSALVAS = [
  "O saneamento só sugere: nenhum cadastro foi alterado pela ferramenta. Cada correção, unificação ou inativação passou por aprovação registrada e pela execução confirmada com evidência pelas equipes.",
  "A pontuação de similaridade entre descrições não é probabilidade nem prova de identidade técnica: toda indicação de duplicidade exige confirmação. Produto igual com complemento diferente (cor, tamanho, lado, material, sabor) é item diferente, salvo nos grupos em que o analista definiu a variante como observação (campo adicional), listados na checagem de Duplicidade.",
  "A leitura fiscal compara o NCM com os anexos da LC 214/2025 consultados e não é parecer. Onde o anexo cita o capítulo ou a posição, ou o NCM abrange produtos com tratamentos diferentes, o enquadramento fica para revisão com especialista; sem enquadramento nos anexos não significa ausência de benefício por outra base legal.",
  "O CST e o cClassTrib de cada operação podem diferir do classificado para o produto e seguem na validação das operações; serviços são classificados por NBS e LC 116.",
  "Tarefas só contam como concluídas com a confirmação e a evidência de todas as frentes aplicáveis. Procedimentos de execução não comprovados no piloto SAP ficam sem liberação para execução em massa.",
  "A política de uso é uma proposta gerada do projeto: vale depois de revisada e aprovada pelo responsável.",
];

/** Andamento de cada passo: situação (Concluído, Em andamento, Não iniciado) e um resumo curto. */
export function andamentoDosPassos({ estado, itens, escopo, grupos, contagem, listas, politica }) {
  const nGrupos = grupos.length; const nSan = grupos.filter((g) => grupoSaneado(estado, g.nome, contagem)).length;
  const ch = resumoChecagens(checagens(estado, contagem, grupos)); const nPil = CASOS_PILOTO.filter((c) => estado.piloto?.[c]?.status === "Testado").length;
  const indiceDec = indexar(itens); const dec = Object.entries(decisoesDoTrabalho(estado.decisoes, escopo)); // decisão que perdeu a validade não conta como decidida
  const feitas = dec.filter(([k, d]) => d.status !== "PROP" && coerenciaDaChave(k, d, indiceDec, estado.decisoes).ok).length;
  const c = listas.contagem; const nFisc = grupos.filter((g) => grupoSaneado(estado, g.nome, contagem) && estado.fiscal?.grupos?.[g.nome]).length;
  const sit = (feito, algum) => (feito ? "Concluído" : algum ? "Em andamento" : "Não iniciado");
  return [
    ["1. Triagem", sit(itens.length > 0, false), itens.length ? `${fmt(escopo.emEscopo.length)} itens em escopo de ${fmt(itens.length)}` : "sem base"],
    ["2. Checagens", sit(ch.concluidas === ch.total && nGrupos > 0 && nSan === nGrupos, ch.concluidas > 0 || nSan > 0 || Object.keys(estado.tratados || {}).length > 0),
      `${ch.concluidas} de ${ch.total} checagens concluídas (${ch.SEM_ACHADOS} sem achados, ${ch.COM_ACHADOS} com achados${ch.NAO_APLICAVEL ? `, ${plural(ch.NAO_APLICAVEL, "não se aplica", "não se aplicam")}, com justificativa` : ""}); ${nSan} de ${nGrupos} grupos saneados`],
    ["3. Piloto SAP", sit(nPil === CASOS_PILOTO.length, Object.keys(estado.piloto || {}).length > 0), `${nPil} de ${CASOS_PILOTO.length} casos testados`],
    ["4. De/para", sit(dec.length > 0 && feitas === dec.length, dec.length > 0), dec.length ? `${fmt(feitas)} de ${fmt(dec.length)} casos decididos` : "nenhum caso encaminhado"],
    ["5. Execução", sit(c.tarefas > 0 && c.concluidas === c.tarefas, c.tarefas > 0 && (c.concluidas > 0 || c.emAndamento > 0 || c.divergencias > 0)), c.tarefas ? `${fmt(c.concluidas)} de ${fmt(c.tarefas)} tarefas concluídas` : "nenhuma tarefa gerada"],
    ["6. Conferência", sit(false, c.tarefas > 0 || listas.analises.length > 0), "listas finais emitidas sob demanda no passo Conferência"],
    ["7. Fiscal", sit(nSan > 0 && nFisc === nSan, nFisc > 0 || Object.keys(estado.fiscal?.decisoes || {}).length > 0), nSan ? `${nFisc} de ${nSan} grupos liberados com a revisão fiscal concluída` : "nenhum grupo liberado"],
    ["8. Política", sit(politica.situacao === "Aprovada", Object.keys(estado.politica?.secoes || {}).length > 0), `política ${politica.situacao.toLowerCase()}`],
  ];
}

/** Monta o relatório: { titulo, subtitulo, rodape, blocos }. Cada bloco: titulo | sub | p | nota | kv | tabela | lista. */
export function montarRelatorioFinal({ nomeProjeto, nomeBase, quem, estado, itens, escopo, contagem, listas, politica, geradoEm = new Date() }) {
  const params = normalizarParams(estado.params); const corte = dataDoCorte(estado.params); const grupos = agruparPorGrupo(escopo.emEscopo);
  const universo = agruparPorGrupo(itens); const emEscopoPor = new Map(grupos.map((g) => [g.nome, g.itens.length]));
  const indiceDec = indexar(itens); const dec = contarDecisoes(decisoesDoTrabalho(estado.decisoes, escopo), (k, d) => coerenciaDaChave(k, d, indiceDec, estado.decisoes).ok); const c = listas.contagem;
  const b = []; const T = (n, texto) => b.push({ t: "titulo", n, texto }); const S = (texto) => b.push({ t: "sub", texto }); const P = (texto, t = "p") => b.push({ t, texto });

  b.push({ t: "kv", linhas: [["Projeto", nomeProjeto || "—"], ["Base importada", nomeBase || "—"], ["Gerado em", geradoEm.toLocaleString("pt-BR")], ["Gerado por", quem || "—"], ["Política de uso", politica.aprovada ? `aprovada por ${politica.aprovada.por} em ${dataBr(politica.aprovada.em)}` : "em rascunho"]] });
  T(null, "Resumo");
  b.push({ t: "tabela", cols: [{ label: "Passo", w: 22 }, { label: "Situação", w: 18 }, { label: "Andamento", w: 60 }], linhas: andamentoDosPassos({ estado, itens, escopo, grupos, contagem, listas, politica }) });
  b.push({ t: "kv", linhas: [
    ["Universo (códigos da base)", fmt(c.universo)], ...(c.itensForaGrupos ? [["Em grupos fora do saneamento", fmt(c.itensForaGrupos)]] : []), ["Fora do escopo (candidatos à inativação por data de uso)", fmt(c.candidatosInativacao)], ["Inativação aprovada (lote com lista fechada ou individual)", fmt(c.inativacaoAprovada)], ["Em escopo", fmt(c.emEscopo)],
    ["Lista final corrigida (códigos)", fmt(c.listaFinal)], ["Descrições corrigidas (aprovadas)", fmt(c.descricoesCorrigidas)], ["Unidades de estoque ajustadas (aprovadas)", fmt(c.unidadesAjustadas)],
    ["Unificações aprovadas", fmt(c.unificacoesAprovadas)], ["Unificações ainda em decisão", fmt(c.unificacoesPendentes)],
  ] });

  T(1, "Escopo e parâmetros");
  P(corte ? `Parâmetro de saneamento: desconsiderar itens não movimentados desde ${corte}. ${params.semData === "anterior" ? "Itens sem data de movimentação legível foram tratados como anteriores à data (saem do escopo)." : "Itens sem data de movimentação legível permaneceram no escopo, sinalizados."} ${fmt(c.semData)} itens não têm data legível.` : "Parâmetro de saneamento: sem corte por data; todos os itens dos grupos marcados entraram no escopo.");
  b.push({ t: "tabela", cols: [{ label: "Grupo de itens", w: 46 }, { label: "Itens na base", w: 16, align: "right" }, { label: "Em escopo", w: 16, align: "right" }, { label: "No saneamento", w: 22 }],
    linhas: universo.map((g) => [g.nome, fmt(g.itens.length), fmt(emEscopoPor.get(g.nome) || 0), estado.gruposFora?.[g.nome] ? "Fora (não inativado)" : "Sim"]) });

  T(2, "Checagens");
  P("Cada problema de cadastro é uma checagem: a regra é registrada com a aprovação e cada grupo é concluído pelo analista. A checagem termina em um de quatro estados: verificada sem achados, verificada com achados, não se aplica (com justificativa escrita) ou pendente. O teste automático que rodou por inteiro e não achou nada abre com a regra aprovada; a análise que não rodou na importação deixa a checagem pendente; a conferência manual só conclui o grupo com o resultado e a evidência escrita. Verificada sem achados não prova que o cadastro está certo: diz que a checagem rodou nos itens em escopo e não achou nada.");
  b.push({ t: "tabela", cols: [{ label: "Checagem", w: 34 }, { label: "Teste", w: 16 }, { label: "Cobertura", w: 40 }, { label: "Conclusão", w: 30 }, { label: "Evidência", w: 46 }],
    linhas: checagens(estado, contagem, grupos).map((ch) => [ch.titulo, ch.tipo === "AUTOMATICA" ? "Automático" : "Conferência manual", textoCobertura(ch), textoConclusao(ch), linhasEvidencia(ch, nomeBase).join("; ") || "—"]) });
  for (const k of CRITERIOS) {
    const sk = situacaoCriterio(estado, k, contagem);
    if (sk === "NAO_APLICAVEL") { S(k.titulo); P(`Checagem declarada não aplicável a este projeto. Justificativa: ${naoAplicavelDe(estado, k).justificativa}`); continue; }
    if (sk !== "APROVADO" && sk !== "AUTO") continue;
    S(k.titulo); P(estado.criterios?.[k.id]?.regra ?? k.regra);
    if (!k.auto) { // conferência manual: o resultado e a evidência escrita de cada grupo concluído
      const conclusoes = grupos.map((g) => { const m = estado.tratados?.[`${g.nome}|${k.id}`]; return m && typeof m === "object" && marcaConclui(m, k, contagem?.baseId, contagem?.contextos?.[`${g.nome}|${k.id}`]) ? `Grupo ${g.nome}: ${m.resultado === "COM_ACHADOS" ? "com achados" : "sem achados"}, por ${m.por || "—"} em ${dataBr(m.em) || "—"}. Evidência: ${m.nota}` : null; }).filter(Boolean);
      if (conclusoes.length) b.push({ t: "lista", itens: conclusoes });
    }
    if (k.id === "padrao") { const lig = Object.entries(ROTULO_REGRAS).filter(([r]) => ({ ...REGRAS_PADRAO, ...(estado.padronizacao?.regras || {}) })[r]).map(([, r]) => r.replace(/ \(ex\.:.*\)$/, "")); P(`Regras de formato ligadas: ${lig.join("; ") || "nenhuma"}. Abreviações aprovadas: ${plural(Object.keys(abreviacoesAprovadas(estado)).length, "abreviação", "abreviações")}.`, "nota"); }
    if (k.id === "duplicidade") {
      const marcados = gruposMarcados(estado.observacao, grupos.map((g) => g.nome)); const ef = efeitoObservacao(escopo.emEscopo);
      P(marcados.length
        ? `Regra de observação (a variante não é produto): ${plural(marcados.length, "grupo usa", "grupos usam")} a regra (${marcados.join(", ")}). Palavras de observação: ${palavrasEmVigor(estado.observacao).map((p) => p.palavra).join(", ")}. Na base, a regra ligou ${plural(ef.itens, "item", "itens")} em ${plural(ef.conjuntos, "conjunto", "conjuntos")} de duplicados; a variante de cada item que sai é registrada no campo adicional do código mantido.`
        : "Regra de observação: nenhum grupo usa a regra; cor, tipo e apresentação separam os itens em todos os grupos.", "nota");
    }
    if (k.id === "unidade") { const u = resumoUnidades(escopo.emEscopo, { regras: estado.politicaUnidade?.regras, rotulos: estado.politicaUnidade?.rotulos }); P(`Nome da unidade de estoque por medida: ${Object.entries(u.padroes).map(([g, n]) => `${g} ${n}`).join(", ")}. Unidades classificadas pelo analista: ${fmt(Object.keys(estado.politicaUnidade?.regras || {}).length)}.`, "nota"); }
  }

  S("Grupos de itens");
  b.push({ t: "tabela", cols: [{ label: "Grupo", w: 44 }, { label: "Itens", w: 14, align: "right" }, { label: "Achados", w: 16, align: "right" }, { label: "Checagens pendentes", w: 22, align: "right" }, { label: "Situação", w: 24 }],
    linhas: grupos.map((g) => [g.nome, fmt(g.itens.length), fmt(CRITERIOS.reduce((n, k) => n + (contagem?.porGrupoCriterio?.[`${g.nome}|${k.id}`] ?? 0), 0)), fmt(criteriosPendentesDoGrupo(estado, g.nome, contagem).length), grupoSaneado(estado, g.nome, contagem) ? "Saneado" : "Pendente"]) });

  T(3, "Piloto SAP");
  P("Registro dos testes no ambiente do cliente. Nenhuma capacidade é tratada como confirmada sem teste registrado.");
  b.push({ t: "tabela", cols: [{ label: "Caso", w: 44 }, { label: "Situação", w: 18 }, { label: "Evidência", w: 40 }, { label: "Limitações", w: 40 }], linhas: CASOS_PILOTO.map((n) => { const p = estado.piloto?.[n] || {}; return [n, p.status || "Não iniciado", p.evidencia || "—", p.limitacao || "—"]; }) });

  T(4, "Decisões (De/para)");
  S("Decisões por critério");
  b.push({ t: "tabela", cols: [{ label: "Critério", w: 46 }, { label: "Encaminhadas", w: 22, align: "right" }, { label: "Aprovadas", w: 20, align: "right" }, { label: "Rejeitadas", w: 20, align: "right" }, { label: "Aguardando", w: 20, align: "right" }, { label: "Sem validade", w: 20, align: "right" }],
    linhas: CRITERIOS.filter((k) => dec[k.id]).map((k) => [k.titulo, fmt(dec[k.id].total), fmt(dec[k.id].APR), fmt(dec[k.id].REJ), fmt(dec[k.id].PROP), fmt(dec[k.id].SEM_VALIDADE)]) });
  if (CRITERIOS.some((k) => dec[k.id]?.SEM_VALIDADE)) P("Sem validade: decisão cujo cadastro mudou para outra coisa depois da proposta (ou cujo código se repete na base). Não conta como encaminhada em dia nem como aprovada: precisa de nova avaliação.", "nota");
  if (!Object.keys(dec).length) P("Nenhum caso foi encaminhado para aprovação até agora.", "nota");

  T(5, "Execução e conferência");
  b.push({ t: "kv", linhas: [["Tarefas geradas", fmt(c.tarefas)], ["Concluídas (todas as frentes, com evidência)", fmt(c.concluidas)], ["Em andamento", fmt(c.emAndamento)], ["Pendentes", fmt(c.pendentes)], ["Com divergência", fmt(c.divergencias)]] });
  P("As listas finais (lista final corrigida, desduplicações, análises, candidatos à inativação por data de uso e execução) são emitidas em Excel no passo Conferência e refletem as decisões registradas.", "nota");
  // Inativação: o corte por data só seleciona candidatos; só a aprovação (lote com lista fechada ou individual) gera tarefa
  const ina = estado.inativacao; const cand = candidatosDaInativacao(escopo, indexar(itens), ina);
  if (cand.total) {
    S("Inativação por data de uso");
    P("O corte por data seleciona candidatos para avaliação e não autoriza a inativação. Ela só foi executada para o que consta aprovado abaixo, em lote por grupo (lista fechada de códigos, base e data analisadas, verificações, aprovador e justificativa) ou item a item; itens com saldo, documento aberto ou dependência não esclarecida ficam para decisão individual.");
    b.push({ t: "tabela", cols: [{ label: "Grupo", w: 40 }, { label: "Candidatos", w: 16, align: "right" }, { label: "Aprovados em lote", w: 20, align: "right" }, { label: "Individual: inativar", w: 22, align: "right" }, { label: "Aguardando", w: 18, align: "right" }],
      linhas: cand.grupos.map((g) => { const st = g.candidatos.map((x) => situacaoDoCandidato(x, g.grupo, ina)); const n = (s) => st.filter((x) => x === s).length; return [g.grupo, fmt(g.candidatos.length), fmt(n("LOTE")), fmt(n("INATIVAR")), fmt(g.candidatos.length - n("LOTE") - n("INATIVAR") - n("MANTER"))]; }) });
    const lotes = Object.values(ina?.lotes || {});
    if (lotes.length) b.push({ t: "lista", itens: lotes.map((l) => `Grupo ${l.grupo}: lista fechada de ${plural(l.itens.length, "item", "itens")} aprovada por ${l.por} em ${dataBr(l.em)}, na base ${l.base?.arquivo || "—"} (extração de ${dataBr(l.extraidaEm)}; corte ${dataBr(l.corte)}). Justificativa: ${l.justificativa}`) });
  }

  T(6, "Revisão fiscal");
  const saem = linhasQueSaem(estado, itens); const indice = indexar(itens); const liberados = grupos.filter((g) => grupoSaneado(estado, g.nome, contagem));
  if (!liberados.length) P("Nenhum grupo foi liberado para a revisão fiscal até agora (a revisão começa em grupo saneado).");
  else b.push({ t: "tabela", cols: [{ label: "Grupo", w: 40 }, { label: "Itens", w: 12, align: "right" }, { label: "A decidir", w: 16, align: "right" }, { label: "A revisar com especialista", w: 26, align: "right" }, { label: "Decididos", w: 16, align: "right" }, { label: "Situação", w: 24 }],
    linhas: liberados.map((g) => { const r = resumoDeLeituras(itensDoGrupoFiscal(g.itens, g.nome, saem).map((it) => leituraFiscal(it, undefined, indice)), estado.fiscal?.decisoes); const k = estado.fiscal?.grupos?.[g.nome]; return [g.nome, fmt(r.total), fmt(r.pendentes), fmt(r.revisar), fmt(r.decididos), k ? `Concluída por ${k.por} em ${dataBr(k.em)}` : "Em revisão"]; }) });
  const tot = liberados.reduce((a, g) => { const r = resumoDeLeituras(itensDoGrupoFiscal(g.itens, g.nome, saem).map((it) => leituraFiscal(it, undefined, indice)), estado.fiscal?.decisoes); for (const s of ORDEM_SITUACOES) a[s] = (a[s] || 0) + r.porSit[s]; return a; }, {});
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
