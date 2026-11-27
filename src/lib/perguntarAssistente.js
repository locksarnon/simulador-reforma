import { api } from "@/api/client";

/**
 * Espera máxima da pergunta ao assistente no navegador. O servidor encerra antes (termos até 45 s, resposta consultiva do Claude
 * Fable 5.2 até 150 s, motor reserva até 45 s); este prazo só garante que a tela travada nunca fica presa sem fim.
 */
export const PRAZO_PERGUNTA_MS = 330_000;

export const MENSAGEM_PRAZO = "A resposta passou de 5 minutos e a espera foi encerrada. Tente de novo em instantes.";

/** Pergunta ao assistente (comum ou aprofundada), a mesma chamada na barra de consulta e no painel do assistente. */
export async function perguntarAoAssistente(pergunta, aprofundada = false) {
  try {
    return await api.post(aprofundada ? "/base-legal/perguntar-aprofundado" : "/base-legal/perguntar", { pergunta }, { timeout: PRAZO_PERGUNTA_MS });
  } catch (e) {
    if (e?.code === "ECONNABORTED" || /timeout of \d+ms exceeded/i.test(String(e?.message ?? ""))) throw new Error(MENSAGEM_PRAZO);
    throw e;
  }
}
