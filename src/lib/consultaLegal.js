/**
 * Barra de consulta das Bases legais: o que a barra faz com o que a pessoa digita. Uma só caixa busca o texto em todas as normas
 * carregadas e, se a IA estiver ligada, também pergunta ao assistente. Regras sem tela, para testar.
 */
import { MAXIMO_PERGUNTA, perguntaValida } from "@/lib/assistente";

/** Texto da consulta pronto para enviar: sem espaços sobrando e dentro do limite da pergunta. */
export const limparConsulta = (texto) => String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, MAXIMO_PERGUNTA);

/** "art 164", "artigo 12-A da LC 214": é a busca de um artigo pelo número, que o texto das normas responde sozinho. */
export const ehBuscaDeArtigo = (texto) => {
  const t = limparConsulta(texto);
  return /^art(?:igo)?s?\.?\s*\d+/i.test(t) && t.split(" ").length <= 6;
};

/**
 * A IA responde? Só com a chave ligada, com pergunta de verdade (o serviço exige alguns caracteres) e fora da busca de artigo.
 * O motivo vai para a tela quando a IA não roda ("Para a IA responder, escreva a pergunta com mais detalhe").
 */
export function decidirIa(texto, ligada) {
  const t = limparConsulta(texto);
  if (!ligada) return { roda: false, motivo: "desligada" };
  if (ehBuscaDeArtigo(t)) return { roda: false, motivo: "artigo" };
  if (!perguntaValida(t)) return { roda: false, motivo: "curta" };
  return { roda: true, motivo: null };
}

export const MOTIVO_SEM_IA = {
  desligada: "",
  artigo: "Busca por artigo: o texto da norma já responde, sem precisar da IA.",
  curta: "Para a IA responder, escreva a pergunta com pelo menos 8 caracteres.",
};

/** Etiquetas de um achado da busca: o que está revogado nunca aparece como texto em vigor. */
export function etiquetasDoAchado(r) {
  const e = [];
  if (r?.norma_situacao === "revogada") e.push({ chave: "norma", rotulo: "Norma revogada", classe: "vermelho" });
  if (r?.revogado) e.push({ chave: "revogado", rotulo: "Revogado", classe: "vermelho" });
  else if (r?.parcialmente_revogado) e.push({ chave: "parcial", rotulo: "Parte revogada", classe: "ambar" });
  return e;
}

/** Normas que dá para escolher na consulta: as que têm texto por artigo (as só de referência não entram na busca). */
export const normasConsultaveis = (normas) => (Array.isArray(normas) ? normas : []).filter((n) => n && n.total_dispositivos > 0 && n.formato !== "externo");
