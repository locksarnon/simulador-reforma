/**
 * Base de conhecimento legal: textos e regras de exibição das novidades (alteração, revogação, ato novo, aplicação), da
 * situação das normas e da revisão semanal. O servidor grava os dados; aqui só se decide como contá-los.
 */
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export const ROTULO_TIPO_NOVIDADE = {
  alteracao: "Alteração",
  revogacao: "Revogação",
  inclusao: "Dispositivo novo",
  norma_revogada: "Norma revogada",
  nova_norma: "Norma nova",
  regulamentacao: "Regulamentação",
  aplicacao: "Aplicação",
  interpretacao: "Interpretação",
  fonte_atualizada: "Portal atualizado",
  estrutura_suspeita: "Atualização segurada",
  reprocessada: "Texto reprocessado",
  nao_consolidada: "Ainda não consolidada",
};

/** Tipos que dizem que o texto vigente pode ter mudado: pedem atenção antes de citar a norma. */
export const TIPOS_DE_ATENCAO = ["revogacao", "norma_revogada", "nao_consolidada", "estrutura_suspeita"];

export const CLASSE_TIPO_NOVIDADE = {
  revogacao: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  norma_revogada: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  nao_consolidada: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  estrutura_suspeita: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  alteracao: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
  inclusao: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
  nova_norma: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
};

export const ROTULO_ORIGEM_NOVIDADE = {
  texto_oficial: "Texto oficial",
  api_oficial: "Lista oficial do Senado",
  busca_web: "Pesquisa na web",
  fonte_monitorada: "Portal oficial",
  remissao: "Remissão entre normas",
  radar: "Radar",
};

export const ROTULO_STATUS_NOVIDADE = { nova: "Nova", vista: "Vista", descartada: "Descartada", resolvida: "Resolvida" };

export const ROTULO_GRUPO_NORMA = {
  fundamentos: "Fundamentos",
  reforma: "Reforma do consumo",
  federal: "Tributação federal atual",
  agro: "Agro",
  territorial: "ICMS, ISS e benefícios estaduais",
  operacional: "Obrigações e documentos fiscais",
};

/** Situação da norma para a tabela e para o cabeçalho: lida do próprio texto oficial a cada captura. */
export function situacaoDaNorma(n) {
  if (n.formato === "externo") return { chave: "referencia", rotulo: "Só referência", classe: "bg-muted text-muted-foreground" };
  if (!n.total_dispositivos) return { chave: "nao_carregada", rotulo: "Não carregada", classe: "bg-muted text-muted-foreground" };
  if (n.situacao === "revogada") return { chave: "revogada", rotulo: n.revogada_por ? `Revogada pelo ${n.revogada_por}` : "Revogada", classe: CLASSE_TIPO_NOVIDADE.revogacao };
  if (n.situacao === "parcialmente_revogada") return { chave: "parcial", rotulo: "Em vigor (parte revogada)", classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" };
  return { chave: "vigente", rotulo: "Em vigor", classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" };
}

export const dataHoraBr = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
};

export const dataBr = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

export const ROTULO_STATUS_RODADA = { executando: "Em andamento", concluida: "Concluída", parcial: "Concluída com erros", falhou: "Falhou" };

/** "4 min" / "35 s" / "—" (rodada ainda em andamento ou sem fim registrado). */
export function duracaoDaRodada(r) {
  if (!r?.iniciado_em || !r?.concluido_em) return "—";
  const s = Math.round((new Date(r.concluido_em) - new Date(r.iniciado_em)) / 1000);
  if (!Number.isFinite(s) || s < 0) return "—";
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}

/** Os dispositivos da novidade que dá para abrir (têm norma e caminho), no máximo `max`, e quantos ficaram de fora. */
export function dispositivosDaNovidade(n, max = 6) {
  const todos = (Array.isArray(n?.detalhes) ? n.detalhes : []).filter((d) => d && d.caminho && n.norma_chave);
  return { itens: todos.slice(0, max), restantes: Math.max(todos.length - max, 0) };
}

/** Links (documentos novos de um portal) que vêm nos detalhes: só endereços https. */
export function linksDaNovidade(n, max = 6) {
  const todos = (Array.isArray(n?.detalhes) ? n.detalhes : []).filter((d) => d && typeof d.url === "string" && /^https:\/\//i.test(d.url));
  return { itens: todos.slice(0, max), restantes: Math.max(todos.length - max, 0) };
}

/** A frase do selo "o que a base sabe de novo" na lista de normas. */
export function fraseDoResumo(r) {
  if (!r) return "";
  const partes = [
    r.novas ? plural(r.novas, "novidade nova", "novidades novas") : "",
    r.a_confirmar ? `${r.a_confirmar} a confirmar` : "",
    r.nao_consolidadas ? plural(r.nao_consolidadas, "alteração ainda não consolidada", "alterações ainda não consolidadas") : "",
  ].filter(Boolean);
  return partes.join(" · ");
}

/** O texto de uma nota oficial de alteração ("(Redação dada pela Lei Complementar nº 227, de 2026)") sem os parênteses. */
export const semParenteses = (s) => String(s || "").replace(/^\s*\(\s*/, "").replace(/\s*\)\s*$/, "");

/** Notas de alteração do dispositivo sem repetir a mesma nota; só as que dizem quem mudou o texto. */
export function notasDeAlteracao(d, max = 8) {
  const vistas = new Set();
  const saida = [];
  for (const m of Array.isArray(d?.alteracoes) ? d.alteracoes : []) {
    if (!m || !["redacao", "inclusao", "revogacao", "renumeracao"].includes(m.tipo) || !m.trecho) continue;
    const t = semParenteses(m.trecho);
    if (vistas.has(t)) continue;
    vistas.add(t);
    saida.push({ tipo: m.tipo, texto: t });
  }
  return saida.slice(0, max);
}

/** "art-30-a" → "Art. 30-A"; "anexo-i" fica como veio. */
export const rotuloDoCaminho = (c) => {
  const m = /^art-(\d+)(?:-([a-z]{1,3}))?$/.exec(String(c || ""));
  return m ? "Art. " + m[1] + (m[2] ? "-" + m[2].toUpperCase() : "") : String(c || "");
};

/** Temas que o servidor atribui a cada dispositivo (índice temático dentro da norma). */
export const ROTULO_TEMA = {
  produtor_rural: "Produtor rural", cooperativas: "Cooperativas", insumos_agropecuarios: "Insumos agropecuários", alimentos: "Alimentos", imoveis: "Imóveis",
  construcao_civil: "Construção civil", servicos_profissionais: "Serviços profissionais", combustiveis: "Combustíveis", importacao_exportacao: "Importação e exportação",
  creditos: "Créditos", ressarcimento: "Ressarcimento e restituição", split_payment: "Split payment", transicao: "Transição", imposto_seletivo: "Imposto Seletivo",
  simples_nacional: "Simples Nacional", regimes_diferenciados: "Regimes diferenciados", saude_educacao: "Saúde e educação", transporte: "Transporte",
  servicos_financeiros: "Serviços financeiros", obrigacoes_acessorias: "Obrigações acessórias", processo_administrativo: "Processo administrativo e penalidades",
  imposto_de_renda: "Imposto de renda", pis_cofins: "PIS e Cofins", icms_iss: "ICMS e ISS",
};

/** Como o dispositivo foi revogado, em palavras ("pelo LC 227/2026", "por veto"). */
export const revogadoPor = (d) => (d?.revogado_por === "veto" ? " (vetado)" : d?.revogado_por ? " pelo " + d.revogado_por : "");
