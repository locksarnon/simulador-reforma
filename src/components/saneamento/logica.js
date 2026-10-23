// Regras puras do projeto de saneamento (sem React): escopo pelo parâmetro de saneamento, grupos e achados por critério.
import { achadosUnidade } from "./unidades";

export const SEM_GRUPO = "(sem grupo)";
export const grupoDe = (item) => (item.grupo_atual || "").trim() || SEM_GRUPO;

const DIA = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);

/** Hoje em AAAA-MM-DD. */
export const hojeIso = () => iso(new Date());

/** AAAA-MM-DD → DD/MM/AAAA ("" se vazio). */
export const dataBr = (d) => (d ? String(d).split("-").reverse().join("/") : "");

const somaDias = (d, dias) => { const t = Date.parse(`${d}T00:00:00Z`); return Number.isNaN(t) ? null : iso(new Date(t + dias * DIA)); };

/**
 * Parâmetro de saneamento: um único corte, "desconsiderar itens não movimentados desde DD/MM/AAAA". Formato: { desde: "AAAA-MM-DD", semData } (desde vazio = sem corte).
 * `semData` diz o que fazer com o item sem data de movimentação legível: "manter" (fica no escopo, sinalizado; padrão) ou "anterior" (tratado como anterior à data: sai do escopo).
 * Projetos salvos antes tinham dois cortes ({ ateOn, ate, diasOn, dias, dataBase }); eles viram uma data só, a mais recente (o item saía do escopo se
 * atendesse a qualquer um): "movimentado até X" (inclusive) = "não movimentado desde X + 1 dia"; "parado há mais de N dias" = "não movimentado desde data-base − N dias".
 */
export function normalizarParams(params) {
  const p = params || {};
  if ("desde" in p || "semData" in p) return { desde: p.desde || "", semData: p.semData === "anterior" ? "anterior" : "manter" };
  const datas = [];
  if (p.ateOn && p.ate) datas.push(somaDias(p.ate, 1));
  if (p.diasOn && Number.isFinite(Number(p.dias)) && Number(p.dias) >= 0) datas.push(somaDias(p.dataBase, -Number(p.dias)));
  return { desde: datas.filter(Boolean).sort().pop() || "", semData: "manter" };
}

/** Data do corte em DD/MM/AAAA, ou "" se não há corte. */
export const dataDoCorte = (params) => dataBr(normalizarParams(params).desde);

/**
 * Aplica as escolhas da triagem e devolve o que entra no trabalho.
 *  1. Grupos: os de `gruposFora` ({ [nome]: true }) não entram no saneamento; saem do trabalho sem serem inativados (`foraGrupos`).
 *  2. Parâmetro de saneamento: o item cuja última movimentação é ANTERIOR à data `desde` sai do escopo (`fora`); o movimentado nela ou depois continua.
 *     Item sem data de movimentação legível: por padrão NÃO sai do escopo (fica sinalizado), para um campo em branco não esconder produto ativo; com
 *     semData = "anterior" é tratado como anterior à data e sai junto. Se nenhum item dos grupos marcados tem data, a opção é ignorada (senão tudo sairia).
 * `semData` (devolvido) lista os itens sem data legível dos grupos marcados, dentro ou fora do escopo; `resumo.semDataFora` conta os que saíram.
 * Vale a partição: total = foraGrupos + fora + emEscopo.
 */
export function aplicarEscopo(itens, params, gruposFora) {
  const { desde, semData: trato } = normalizarParams(params);
  const foraGrupos = []; const marcados = [];
  for (const it of itens) { if (gruposFora?.[grupoDe(it)]) foraGrupos.push(it); else marcados.push(it); }
  const algumaData = marcados.some((it) => it.ultima_mov);
  const semDataSai = trato === "anterior" && !!desde && algumaData;
  const emEscopo = []; const fora = []; const semData = []; let semDataFora = 0;
  for (const it of marcados) {
    const d = it.ultima_mov || "";
    if (!d) { semData.push(it.linha); if (semDataSai) { fora.push(it); semDataFora += 1; } else emEscopo.push(it); continue; }
    if (desde && d < desde) fora.push(it); else emEscopo.push(it);
  }
  return { emEscopo, fora, foraGrupos, semData, resumo: { total: itens.length, foraGrupos: foraGrupos.length, fora: fora.length, emEscopo: emEscopo.length, semData: semData.length, semDataFora, semDataIgnorada: trato === "anterior" && !!desde && !algumaData } };
}

/** Decisões dos itens que estão no trabalho: as de itens de grupos fora do saneamento ficam guardadas, mas não geram tarefa, lista nem pendência. */
export function decisoesDoTrabalho(decisoes, escopo) {
  const lista = escopo?.foraGrupos;
  if (!lista?.length) return decisoes || {};
  const fora = new Set(lista.map((it) => it.linha));
  return Object.fromEntries(Object.entries(decisoes || {}).filter(([k]) => !fora.has(Number(k.split("|")[0]))));
}

/** Grupos de itens (coluna do cliente) com contagem, ordenados do maior para o menor. */
export function agruparPorGrupo(itens) {
  const m = new Map();
  for (const it of itens) { const g = grupoDe(it); const a = m.get(g); if (a) a.push(it); else m.set(g, [it]); }
  return [...m.entries()].map(([nome, lista]) => ({ nome, itens: lista })).sort((a, b) => b.itens.length - a.itens.length || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ── Unidades de medida: a política da menor unidade de estoque e a tabela de unidades ficam em ./unidades ──
export { GRANDEZAS, achadosUnidade, classificarUnidade, fatorPelaDescricao, resumoUnidades, rotulosPadrao, unidadeCanonica } from "./unidades";

const temProblema = (it, ...codigos) => it.problemas?.some((p) => codigos.includes(p.codigo) || codigos.some((c) => c.endsWith("*") && p.codigo.startsWith(c.slice(0, -1))));
const mensagens = (it, ...codigos) => it.problemas.filter((p) => codigos.includes(p.codigo) || codigos.some((c) => c.endsWith("*") && p.codigo.startsWith(c.slice(0, -1)))).map((p) => p.mensagem).join(" | ");

/**
 * Catálogo de critérios (um por problema). `auto: true` = o sistema já tem teste para o critério; os demais são conferidos manualmente
 * (o grupo marca como tratado depois de revisar). Cada critério nasce como proposta e só vale depois de aprovado.
 */
export const CRITERIOS = [
  { id: "ncm", titulo: "NCM e classificação cadastral", auto: true,
    regra: "NCM com 8 dígitos, vigente na tabela oficial; cClassTrib informado confere com o NCM nos anexos consultados. Onde o enquadramento depende dos requisitos do item, nada é sugerido: o caso vai para revisão.",
    exemplo: "NCM com 7 dígitos por perda do zero à esquerda na planilha", params: "" },
  { id: "identidade", titulo: "Identidade do produto", auto: false,
    regra: "Mesmo produto = mesma referência do fabricante e mesma medida. Original e paralelo ficam em códigos distintos. Cadastro que mistura produtos é separado. A descrição se lê como produto + complemento: o nome é o produto; cor, tamanho, lado, material e sabor são complementos que fazem outro item.",
    exemplo: "Bomba 5CV do fabricante e bomba 5CV paralela no mesmo código", params: "" },
  { id: "duplicidade", titulo: "Duplicidade", auto: true,
    regra: "Indicação por descrição normalizada (abreviações, grafia, ordem), unidade equivalente, medidas iguais e NCM compatível. A indicação não é prova: similaridade não equivale a identidade técnica, e todo caso exige confirmação. A descrição se lê como produto + complemento: mesmo produto com complemento diferente (cor, tamanho, lado ou posição, material, sabor, original x paralelo) é outro item e não entra como indicação, e complemento só em uma das descrições aponta descrição incompleta (outro achado), não duplicidade.",
    exemplo: "\"Fert. Superfosfato Simples 50kg\" e \"Fertilizante Superfosfato Simples Saco 50 Kg\" (já \"Corante Alimentício Líq. Confeitaria Rosa\" e \"... Verde\" são itens diferentes: a cor é complemento)", params: "" },
  { id: "descricao", titulo: "Descrição e características", auto: true,
    regra: "Padrão de descrição por família (a definir com o cliente): ordem das palavras, abreviações permitidas, atributos obrigatórios. O teste automático hoje aponta descrição ausente.",
    exemplo: "Item sem descrição", params: "" },
  { id: "padrao", titulo: "Padronização da descrição", auto: true,
    regra: "Descrição no padrão aprovado (NOME + REFERÊNCIA + COMPLEMENTO): sem espaços duplicados, com espaço depois do ponto da abreviação, em caixa alta, unidade colada ao número e só abreviações da lista aprovada. O sistema apenas SUGERE: cada correção passa por aprovação e a descrição original é sempre preservada. Padronizar o nome não funde itens.",
    exemplo: '"ANEL TRAVA  1440478X1" → "ANEL TRAVA 1440478X1"', params: "Limite de 100 caracteres no SAP B1 (a confirmar)" },
  { id: "grupo", titulo: "Grupo de itens", auto: true,
    regra: "O grupo segue o uso que o próprio cliente já faz na planilha; só se sugere com certeza alta (mínimo de itens e participação).",
    exemplo: "Item sem grupo com 94% dos similares no grupo Peças", params: "Participação mínima: 90%" },
  { id: "unidade", titulo: "Unidade de medida", auto: true,
    regra: "A unidade de estoque de cada item é a MENOR unidade prática da medida em que ele é controlado: massa em quilograma, volume em litro, comprimento em metro, área em metro quadrado e contagem em unidade. Unidade maior (tonelada, hectolitro, dúzia, metro cúbico...) e embalagem (saca, big bag, galão, caixa, pacote...) passam a ser unidade de COMPRA, com o fator de conversão cadastrado. A regra vale para qualquer unidade da base, não só para os exemplos: o sistema reconhece as unidades de medida usuais e o analista classifica as demais na tabela de unidades. O fator só é dado como certo quando é exato por definição (1 tonelada = 1.000 kg) ou está escrito na própria unidade (BALDE 20KG); se vem da descrição, fica para confirmar; nos demais casos fica a informar. Unidade já menor que a padrão (g, ml, cm) é aceita. Uma grafia por unidade (KG, não KGS, Kg ou QUILOGRAM): o nome padrão das medidas é o símbolo (KG, L, M, M2), na contagem vale a grafia que a base já usa, e o analista pode trocar o nome de qualquer uma na tabela do critério; unidade vazia ou sem regra é pendência. Para item com histórico de movimentação, o SAP pode não permitir a troca da unidade de estoque: validar no piloto (passo 3) e tratar como de/para ou novo cadastro.",
    exemplo: "Item estocado em TONELADA ou SACA (passa para KG, com a unidade maior como unidade de compra); em GALÃO (passa para LITRO); em CAIXA (passa para UNIDADE); KG, KGS e kg no mesmo cadastro", params: "política da menor unidade de estoque, com exceções por unidade na tabela do critério" },
  { id: "utilizacao", titulo: "Utilização", auto: true,
    regra: "Item dentro do escopo sem data de movimentação legível é sinalizado (se o parâmetro de saneamento os trata como anteriores à data, eles saem do escopo e não chegam aqui). A ausência de movimento por si só não determina bloqueio.",
    exemplo: "Item sem data de última movimentação", params: "Corte e tratamento dos itens sem data vêm do parâmetro de saneamento" },
  { id: "saldos", titulo: "Saldos e sinais de excesso", auto: false,
    regra: "Saldos negativos e concentração de valor viram indício, não conclusão. Criticidade, prazo de reposição e sazonalidade são considerados antes de propor redução.",
    exemplo: "Saldo negativo em item movimentado", params: "" },
  { id: "cartilhas", titulo: "Cartilhas e dependências", auto: false,
    regra: "Código usado em plano de manutenção ou documento aberto só muda depois de atualizar o vínculo. Cartilhas são conferidas antes do de/para e de qualquer bloqueio.",
    exemplo: "Código presente em cartilha de manutenção", params: "" },
];

// ── Padronização de descrição: só SUGERE; nada é gravado no cadastro ──
export const REGRAS_PADRAO = { espacos: true, pontoColado: true, parenteses: true, unidadeColada: true, caixaAlta: true };
export const ROTULO_REGRAS = {
  espacos: "Remover espaços duplicados e nas pontas",
  pontoColado: "Espaço depois do ponto da abreviação (ex.: LÍQ.CONFEITARIA → LÍQ. CONFEITARIA)",
  parenteses: "Tirar parênteses em volta de referência (ex.: (11186) → 11186)",
  unidadeColada: "Unidade colada ao número (ex.: 16 MM → 16MM)",
  caixaAlta: "Caixa alta",
};
export const LIMITE_DESCRICAO = 100;
const UNIDADES_COLAVEIS = "MM|CM|MT|KG|ML|KV|HP|CV|POL|M|G|L|V|W";

/** Abreviações aprovadas -> { sext: "SEXTAVADO" } (só as marcadas como aprovadas). */
export const abreviacoesAprovadas = (estado) => Object.fromEntries(Object.entries(estado?.padronizacao?.abreviacoes || {}).filter(([, v]) => v.aprovada).map(([de, v]) => [de, v.para]));

/** Descrição sugerida no padrão aprovado. Devolve também o motivo de cada mudança. Não inventa nada: só reorganiza o que já está escrito. */
export function padronizarDescricao(desc, regras = REGRAS_PADRAO, abrev = {}) {
  const original = String(desc ?? ""); let s = original; const motivos = [];
  const aplica = (motivo, novo) => { if (novo !== s) { motivos.push(motivo); s = novo; } };
  if (regras.espacos) aplica("espaços duplicados ou nas pontas", s.replace(/\s+/g, " ").trim());
  if (regras.pontoColado) aplica("espaço depois do ponto da abreviação", s.replace(/([A-Za-zÀ-ÿ]{2,})\.(?=[A-Za-zÀ-ÿ]{3,})/g, "$1. "));
  if (regras.parenteses) aplica("parênteses em volta de referência", s.replace(/\(\s*([A-Za-z0-9][A-Za-z0-9\-/.]*)\s*\)/g, (m, t) => (/\d/.test(t) && t.length >= 3 ? t : m)));
  if (regras.unidadeColada) aplica("unidade colada ao número", s.replace(new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s+(${UNIDADES_COLAVEIS})(?![A-Za-z0-9.])`, "gi"), (_m, n, u) => n + u.toUpperCase()));
  for (const [de, para] of Object.entries(abrev)) {
    const re = new RegExp(String.raw`(?<![A-Za-z0-9])${de.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`, "gi");
    const trocado = s.replace(re, para.toUpperCase());
    if (trocado !== s) { motivos.push("abreviação aprovada: " + de.toUpperCase() + " → " + para.toUpperCase()); s = trocado; }
  }
  if (regras.caixaAlta) aplica("caixa alta", s.toUpperCase());
  return { sugerida: s, motivos, mudou: s !== original, longa: s.length > LIMITE_DESCRICAO };
}

/** Candidatas a abreviação na própria base: palavra curta e frequente que é o começo de uma palavra mais longa também frequente (SEXT → SEXTAVADO). Só listam para aprovação. */
export function descobrirAbreviacoes(itens, { minimo = 8 } = {}) {
  const sem = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const cont = new Map();
  for (const it of itens) for (const t of new Set(sem(it.descricao).split(/[^A-Z]+/).filter((w) => w.length >= 3))) cont.set(t, (cont.get(t) || 0) + 1);
  const palavras = [...cont.entries()].filter(([, n]) => n >= minimo);
  const longas = palavras.filter(([w]) => w.length >= 5).sort((a, b) => b[1] - a[1]);
  const saida = [];
  for (const [curta, nCurta] of palavras) {
    if (curta.length > 6) continue;
    const alvo = longas.find(([l, n]) => l.length >= curta.length + 2 && l.length <= curta.length + 8 && l.startsWith(curta) && n >= nCurta * 0.25);
    if (alvo) saida.push({ de: curta, para: alvo[0], nDe: nCurta, nPara: alvo[1] });
  }
  return saida.sort((a, b) => b.nDe - a.nDe);
}

/** Teste de cada critério automático: devolve { achado, motivo } por item. `itens` é o universo em escopo (alguns testes dependem do conjunto). */
export function criarTestes(itens, estado = {}) {
  const unidade = achadosUnidade(itens, { politica: estado?.politicaUnidade?.ativa !== false, regras: estado?.politicaUnidade?.regras || {}, rotulos: estado?.politicaUnidade?.rotulos || {} });
  const regras = { ...REGRAS_PADRAO, ...(estado?.padronizacao?.regras || {}) }; const abrev = abreviacoesAprovadas(estado);
  return {
    padrao: (it) => { const r = padronizarDescricao(it.descricao, regras, abrev); return r.mudou ? { achado: true, motivo: r.motivos.join("; ") + (r.longa ? ` · acima de ${LIMITE_DESCRICAO} caracteres` : ""), sugerida: r.sugerida } : { achado: false }; },
    ncm: (it) => (temProblema(it, "NCM_*", "SEM_AMPARO_NO_ANEXO", "CLASSE_DIVERGENTE", "BENEFICIO_POSSIVELMENTE_PERDIDO", "REDUCAO_MAIOR_QUE_ESPERADO") ? { achado: true, motivo: mensagens(it, "NCM_*", "SEM_AMPARO_NO_ANEXO", "CLASSE_DIVERGENTE", "BENEFICIO_POSSIVELMENTE_PERDIDO", "REDUCAO_MAIOR_QUE_ESPERADO") } : { achado: false }),
    duplicidade: (it) => (it.duplicidade || temProblema(it, "DUPLICIDADE_*", "POSSIVEL_DUPLICIDADE", "CODIGO_DUPLICADO", "PRODUTO_DUPLICADO") ? { achado: true, motivo: mensagens(it, "DUPLICIDADE_*", "POSSIVEL_DUPLICIDADE", "CODIGO_DUPLICADO", "PRODUTO_DUPLICADO") || "Indicação de duplicidade" } : { achado: false }),
    descricao: (it) => (temProblema(it, "DESCRICAO_AUSENTE", "CODIGO_AUSENTE") ? { achado: true, motivo: mensagens(it, "DESCRICAO_AUSENTE", "CODIGO_AUSENTE") } : { achado: false }),
    grupo: (it) => (it.grupo_flag === "DIFERENTE" || (it.grupo_flag === "SEM_ATUAL" && it.grupo_sugerido) ? { achado: true, motivo: `Atual: ${it.grupo_atual || "sem grupo"}; sugerido: ${it.grupo_sugerido || "—"}${it.grupo_evidencia ? ` (${it.grupo_evidencia})` : ""}` } : { achado: false }),
    unidade,
    utilizacao: (it) => (!it.ultima_mov ? { achado: true, motivo: "Sem data de movimentação legível" } : { achado: false }),
  };
}

/** Achados de um critério automático nos itens dados. Critério manual não tem achados calculados. */
export function achadosDoCriterio(crit, itens, testes) {
  const t = testes[crit.id];
  if (!crit.auto || !t) return [];
  const saida = [];
  for (const it of itens) { const r = t(it); if (r.achado) saida.push({ item: it, motivo: r.motivo, sugerida: r.sugerida, extra: r.extra }); }
  return saida;
}
