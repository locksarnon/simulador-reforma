// Regras puras do projeto de saneamento (sem React): escopo pelo parâmetro de saneamento, grupos e achados por critério.

export const SEM_GRUPO = "(sem grupo)";
export const grupoDe = (item) => (item.grupo_atual || "").trim() || SEM_GRUPO;

const DIA = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);

/** Data-base padrão: hoje. Vem em AAAA-MM-DD. */
export const hojeIso = () => iso(new Date());

/** Data limite a partir de "há mais de X dias" contada da data-base. */
export function dataPorDias(dataBase, dias) {
  const t = Date.parse(`${dataBase}T00:00:00Z`);
  if (Number.isNaN(t) || !Number.isFinite(dias) || dias < 0) return null;
  return iso(new Date(t - dias * DIA));
}

/**
 * Parâmetro de saneamento. Dois cortes opcionais e independentes; vale o que estiver marcado, e o item sai do escopo se atender a qualquer um:
 *  - `ateOn`: desconsidera itens movimentados ATÉ a data `ate` (inclusive);
 *  - `diasOn`: desconsidera itens sem movimento há mais de `dias` dias, contados da `dataBase`.
 * Item sem data de movimento legível NÃO sai do escopo (fica sinalizado), para um campo em branco não esconder produto ativo.
 */
export function aplicarEscopo(itens, params = {}) {
  const p = { ateOn: false, ate: "", diasOn: false, dias: 540, dataBase: hojeIso(), ...params };
  const limiteDias = p.diasOn ? dataPorDias(p.dataBase, Number(p.dias)) : null;
  const emEscopo = []; const fora = []; const semData = [];
  for (const it of itens) {
    const d = it.ultima_mov || "";
    if (!d) { semData.push(it.linha); emEscopo.push(it); continue; }
    const motivos = [];
    if (p.ateOn && p.ate && d <= p.ate) motivos.push("ate");
    if (limiteDias && d < limiteDias) motivos.push("dias");
    if (motivos.length) fora.push({ item: it, motivos }); else emEscopo.push(it);
  }
  const porAte = fora.filter((f) => f.motivos.includes("ate")).length;
  const porDias = fora.filter((f) => f.motivos.includes("dias")).length;
  const ambos = fora.filter((f) => f.motivos.length === 2).length;
  return { emEscopo, fora, semData, resumo: { total: itens.length, fora: fora.length, emEscopo: emEscopo.length, porAte, porDias, ambos, semData: semData.length } };
}

/** Grupos de itens (coluna do cliente) com contagem, ordenados do maior para o menor. */
export function agruparPorGrupo(itens) {
  const m = new Map();
  for (const it of itens) { const g = grupoDe(it); const a = m.get(g); if (a) a.push(it); else m.set(g, [it]); }
  return [...m.entries()].map(([nome, lista]) => ({ nome, itens: lista })).sort((a, b) => b.itens.length - a.itens.length || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ── Unidades: variações de grafia da mesma unidade ──
const SINONIMOS_UNIDADE = {
  kg: ["kg", "kgs", "kilo", "kilos", "quilo", "quilos", "quilograma", "quilogramas"], g: ["g", "gr", "grama", "gramas"], t: ["t", "ton", "tonelada", "toneladas"],
  l: ["l", "lt", "lts", "litro", "litros"], ml: ["ml", "mililitro", "mililitros"], m: ["m", "mt", "mts", "metro", "metros"],
  un: ["un", "und", "unid", "unidade", "unidades", "pc", "pca", "peca", "pecas", "pç", "pç.", "p"], cx: ["cx", "caixa", "caixas"], sc: ["sc", "saco", "sacos", "sca"],
  pct: ["pct", "pacote", "pacotes", "pc."], gl: ["gl", "galao", "galoes"], fr: ["fr", "frasco", "frascos"], par: ["par", "pares"],
};
const MAPA_UNIDADE = new Map(Object.entries(SINONIMOS_UNIDADE).flatMap(([canon, lista]) => lista.map((v) => [v, canon])));
const limpa = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.\s]/g, "");
export const unidadeCanonica = (u) => { const k = limpa(u); return k ? (MAPA_UNIDADE.get(k) ?? null) : null; };

/** Para cada unidade canônica, a grafia dominante; itens com outra grafia da mesma unidade, ou com unidade desconhecida/vazia, são achados. */
export function achadosUnidade(itens) {
  const cont = new Map();
  for (const it of itens) { const c = unidadeCanonica(it.unidade); if (!c) continue; const mm = cont.get(c) ?? new Map(); const k = String(it.unidade).trim(); mm.set(k, (mm.get(k) || 0) + 1); cont.set(c, mm); }
  const dominante = new Map([...cont].map(([c, mm]) => [c, [...mm.entries()].sort((a, b) => b[1] - a[1])[0][0]]));
  return (it) => {
    const raw = String(it.unidade || "").trim();
    if (!raw) return { achado: true, motivo: "Sem unidade de medida" };
    const c = unidadeCanonica(raw);
    if (!c) return { achado: true, motivo: `Unidade "${raw}" fora da lista conhecida` };
    return raw !== dominante.get(c) ? { achado: true, motivo: `Grafia "${raw}" difere da dominante "${dominante.get(c)}"` } : { achado: false };
  };
}

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
    regra: "Mesmo produto = mesma referência do fabricante e mesma medida. Original e paralelo ficam em códigos distintos. Cadastro que mistura produtos é separado.",
    exemplo: "Bomba 5CV do fabricante e bomba 5CV paralela no mesmo código", params: "" },
  { id: "duplicidade", titulo: "Duplicidade", auto: true,
    regra: "Indicação por descrição normalizada (abreviações, grafia, ordem), unidade equivalente, medidas iguais e NCM compatível. A indicação não é prova: similaridade não equivale a identidade técnica, e todo caso exige confirmação.",
    exemplo: "\"Fert. Superfosfato Simples 50kg\" e \"Fertilizante Superfosfato Simples Saco 50 Kg\"", params: "" },
  { id: "descricao", titulo: "Descrição e características", auto: true,
    regra: "Padrão de descrição por família (a definir com o cliente): ordem das palavras, abreviações permitidas, atributos obrigatórios. O teste automático hoje aponta descrição ausente.",
    exemplo: "Item sem descrição", params: "" },
  { id: "grupo", titulo: "Grupo de itens", auto: true,
    regra: "O grupo segue o uso que o próprio cliente já faz na planilha; só se sugere com certeza alta (mínimo de itens e participação).",
    exemplo: "Item sem grupo com 94% dos similares no grupo Peças", params: "Participação mínima: 90%" },
  { id: "unidade", titulo: "Unidade de medida", auto: true,
    regra: "Uma grafia por unidade (KG, não KGS ou Kg); unidade vazia ou desconhecida é pendência; conversões só com fator comprovado.",
    exemplo: "KG, KGS e kg no mesmo cadastro", params: "" },
  { id: "utilizacao", titulo: "Utilização", auto: true,
    regra: "Item dentro do escopo sem data de movimentação legível é sinalizado. A ausência de movimento por si só não determina bloqueio.",
    exemplo: "Item sem data de última movimentação", params: "Corte vem do parâmetro de saneamento" },
  { id: "saldos", titulo: "Saldos e sinais de excesso", auto: false,
    regra: "Saldos negativos e concentração de valor viram indício, não conclusão. Criticidade, prazo de reposição e sazonalidade são considerados antes de propor redução.",
    exemplo: "Saldo negativo em item movimentado", params: "" },
  { id: "cartilhas", titulo: "Cartilhas e dependências", auto: false,
    regra: "Código usado em plano de manutenção ou documento aberto só muda depois de atualizar o vínculo. Cartilhas são conferidas antes do de/para e de qualquer bloqueio.",
    exemplo: "Código presente em cartilha de manutenção", params: "" },
];

/** Teste de cada critério automático: devolve { achado, motivo } por item. `itens` é o universo em escopo (alguns testes dependem do conjunto). */
export function criarTestes(itens) {
  const unidade = achadosUnidade(itens);
  return {
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
  for (const it of itens) { const r = t(it); if (r.achado) saida.push({ item: it, motivo: r.motivo }); }
  return saida;
}

/** Um critério só pode ser tratado se estiver aprovado. */
export const criterioAprovado = (estado, id) => Boolean(estado?.criterios?.[id]?.aprovado);

/** Grupo está saneado quando todos os critérios aprovados foram marcados como tratados nele. */
export function grupoPodeSanear(estado, grupo) {
  const aprovados = CRITERIOS.filter((c) => criterioAprovado(estado, c.id));
  return aprovados.length > 0 && aprovados.every((c) => estado?.tratados?.[`${grupo}|${c.id}`]);
}
