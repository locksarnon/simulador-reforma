/**
 * Assistente tributário (botão no rodapé do menu): lógica sem tela. Sugestões por tela, histórico da conversa neste navegador,
 * mensagens de espera e texto para copiar. A resposta vem do mesmo serviço da Base legal: só o texto das normas, citando o artigo.
 */
export const EVENTO_ASSISTENTE = "intax:assistente";
export const CHAVE_HISTORICO = "intax-assistente-historico";
export const LIMITE_HISTORICO = 8;
export const MINIMO_PERGUNTA = 8;
export const MAXIMO_PERGUNTA = 600;

/** Abre o assistente de qualquer lugar. `pergunta` já envia; `sugestoes` troca as sugestões iniciais (ex.: as de um setor). */
export function abrirAssistente(detalhe = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_ASSISTENTE, { detail: detalhe }));
}

const GERAIS = [
  "Quando o crédito de IBS e CBS pode ser apropriado?",
  "Como funciona o split payment?",
  "O que compõe a base de cálculo do IBS e da CBS?",
  "Como descubro quem é contribuinte regular?",
];

const PRODUTOR_RURAL = [
  "Qual o limite de receita para o produtor rural não ser contribuinte do IBS e da CBS?",
  "O que acontece se o produtor rural ultrapassar o limite de receita durante o ano?",
  "Como funciona o crédito presumido para quem compra do produtor rural?",
];

/** Sugestões por tela (id do módulo) e, na falta, por área do menu. Só perguntas que o texto das normas responde. */
const POR_MODULO = {
  transicao: ["Como funciona a transição do IBS e da CBS entre 2026 e 2033?", "Qual a alíquota do IBS em 2026?", "O que muda na base de cálculo durante a transição?"],
  cenarios: ["Como funciona a transição do IBS e da CBS entre 2026 e 2033?", "Qual a alíquota do IBS em 2026?", "Como funciona o redutor de compras governamentais?"],
  "credito-estoque": ["Quem pode apropriar o crédito presumido do estoque de 31/12/2026?", "Em quantas parcelas o crédito do estoque é apropriado?", "Quando o crédito de IBS e CBS pode ser apropriado?"],
  regimes: ["O que muda para o Simples Nacional com o IBS e a CBS?", "Quando a empresa do Simples pode optar pelo regime regular do IBS e da CBS?", "Como funciona o split payment?"],
  "consulta-ncm": ["Qual o tratamento dos insumos agropecuários do Anexo IX?", "Quais produtos têm alíquota zero na cesta básica?", "Ouro paga IBS e CBS?"],
  catalogos: ["Qual o tratamento dos insumos agropecuários do Anexo IX?", "O que significa o cClassTrib?", "Quando o crédito de IBS e CBS pode ser apropriado?"],
  "captura-xml": ["O que compõe a base de cálculo do IBS e da CBS?", "Quando o crédito de IBS e CBS pode ser apropriado?", "Como funciona o split payment?"],
  "carteira-diagnostico": ["Quando o crédito de IBS e CBS pode ser apropriado?", "Quem é contribuinte regular do IBS e da CBS?", "Quem pode apropriar o crédito presumido do estoque de 31/12/2026?"],
};
const POR_AREA = {
  reforma: ["Como funciona a transição do IBS e da CBS entre 2026 e 2033?", "O que compõe a base de cálculo do IBS e da CBS?", "Como funciona o split payment?"],
  conhecimento: GERAIS,
  bpo: ["O que compõe a base de cálculo do IBS e da CBS?", "Quando o crédito de IBS e CBS pode ser apropriado?", "Como funciona o split payment?"],
  diagnostico: ["Quem é contribuinte regular do IBS e da CBS?", "Quando o crédito de IBS e CBS pode ser apropriado?", ...PRODUTOR_RURAL.slice(0, 1)],
  clientes: ["Como descubro quem é contribuinte regular?", "Quem é contribuinte regular do IBS e da CBS?", ...PRODUTOR_RURAL.slice(0, 1)],
  comercial: GERAIS,
};

/** Até 3 sugestões para a tela aberta (ou as passadas por quem abriu o assistente); sem contexto, as gerais. */
export function sugestoesDoContexto(modulo, extras) {
  if (Array.isArray(extras) && extras.length) return extras.slice(0, 4);
  const lista = (modulo && POR_MODULO[modulo.id]) || (modulo && POR_AREA[modulo.area]) || GERAIS;
  return lista.slice(0, 3);
}

/** A tela tem sugestões próprias (por tela ou por área)? Só então o painel diz "para quem está em…". */
export const temContextoProprio = (modulo) => !!modulo && !!(POR_MODULO[modulo.id] || POR_AREA[modulo.area]);

/** E-mail com forma válida (a conferência final é do servidor). */
export const emailValido = (texto) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(texto ?? "").trim());

/** A pergunta serve para enviar? (o serviço exige alguns caracteres e corta nos 600) */
export const perguntaValida = (texto) => String(texto ?? "").trim().length >= MINIMO_PERGUNTA;

const ESPERAS = [
  [0, "Procurando nos dispositivos da lei…"],
  [3, "Lendo os artigos mais próximos da sua pergunta…"],
  [7, "Montando a resposta com o texto da lei…"],
  [13, "Conferindo se cada trecho citado existe mesmo…"],
  [22, "Quase lá: a análise está demorando mais que o normal."],
];
const ESPERAS_APROFUNDADA = [
  [0, "Procurando nos dispositivos da lei…"],
  [4, "Pesquisando em fontes oficiais na internet…"],
  [14, "Comparando as fontes com o texto da lei…"],
  [28, "Montando a resposta com as fontes citadas…"],
  [50, "A pesquisa aprofundada demora mais. Só mais um instante."],
];
/** Mensagem de espera conforme os segundos desde o envio. */
export function mensagemDeEspera(segundos, aprofundada = false) {
  const lista = aprofundada ? ESPERAS_APROFUNDADA : ESPERAS;
  let texto = lista[0][1];
  for (const [desde, t] of lista) if (segundos >= desde) texto = t;
  return texto;
}

/** Acrescenta uma troca ao histórico (mais nova no fim), sem passar do limite, só com o que terminou. */
export function anexarAoHistorico(historico, item, limite = LIMITE_HISTORICO) {
  const base = (Array.isArray(historico) ? historico : []).filter((x) => x && x.id !== item.id);
  return [...base, item].slice(-limite);
}

/** Só o que terminou entra no histórico guardado (pergunta ainda carregando não volta depois de recarregar a página). */
export const paraGuardar = (itens) => (Array.isArray(itens) ? itens : []).filter((i) => i.estado === "ok" || i.estado === "erro").slice(-LIMITE_HISTORICO);

export function lerHistorico() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_HISTORICO) || "[]");
    return Array.isArray(lista) ? lista.filter((i) => i && typeof i.id === "string" && typeof i.pergunta === "string").slice(-LIMITE_HISTORICO) : [];
  } catch { return []; }
}
export function gravarHistorico(itens) {
  try {
    const guardar = paraGuardar(itens);
    if (guardar.length) localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(guardar));
    else localStorage.removeItem(CHAVE_HISTORICO);
  } catch { /* sem armazenamento: a conversa só vale nesta aba */ }
}

/** Texto para copiar: a resposta, as ressalvas e a base legal citada. */
export function textoParaCopiar(r) {
  if (!r) return "";
  const partes = [String(r.resposta ?? "").trim()];
  if (r.ressalvas) partes.push(`Atenção: ${r.ressalvas}`);
  if (r.fundamentos?.length) partes.push(`Base legal:\n${r.fundamentos.map((f) => `- ${f.numero} — ${f.rotulo}`).join("\n")}`);
  return partes.filter(Boolean).join("\n\n");
}
