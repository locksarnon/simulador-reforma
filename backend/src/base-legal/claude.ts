/** Chamada ao Claude (API Messages da Anthropic) para o assistente: texto e, quando pedido, busca na web com as fontes citadas. */

export const MODELO_CLAUDE_PADRAO = 'claude-fable-5-2';
const URL_API = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2023-06-01';

type Bloco = {
  type?: string;
  text?: string;
  citations?: { url?: string; title?: string }[];
  content?: unknown;
};

export type RespostaClaude = {
  texto: string;
  /** No mesmo formato dos metadados de busca do Gemini, para a leitura de fontes ser uma só. */
  grounding: { groundingChunks: { web: { uri: string; title: string } }[] };
  modelo: string;
};

/** Junta o texto dos blocos e as fontes (resultados da busca e citações), sem repetir endereço. */
export function lerBlocos(blocos: Bloco[]): { texto: string; fontes: { uri: string; title: string }[] } {
  const texto = blocos.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  const vistos = new Set<string>();
  const fontes: { uri: string; title: string }[] = [];
  const add = (uri?: string, title?: string) => {
    const u = String(uri ?? '').trim();
    if (!/^https:\/\//i.test(u) || vistos.has(u)) return;
    vistos.add(u);
    fontes.push({ uri: u, title: String(title ?? '').trim() });
  };
  for (const b of blocos) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content as { url?: string; title?: string }[]) add(r?.url, r?.title);
    }
    if (b.type === 'text') for (const c of b.citations ?? []) add(c?.url, c?.title);
  }
  return { texto, fontes };
}

/**
 * Pergunta ao Claude Code instalado e logado na VPS, por uma ponte local (sem chave de API: usa os créditos da conta logada).
 * A ponte roda no servidor, só aceita este contêiner (token) e só deixa o Claude usar pesquisa na web.
 */
export async function perguntarViaPonte(opcoes: {
  url: string;
  token: string;
  prompt: string;
  busca?: boolean;
  modelo?: string;
  timeoutMs?: number;
}): Promise<RespostaClaude> {
  const { url, token, prompt, busca = false, modelo, timeoutMs = busca ? 175_000 : 90_000 } = opcoes;
  const resp = await fetch(`${url.replace(/\/+$/, '')}/perguntar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-token': token },
    body: JSON.stringify({ prompt, busca, ...(modelo ? { modelo } : {}), timeout_ms: timeoutMs - 5_000 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const corpo = (await resp.json().catch(() => ({}))) as { texto?: string; fontes?: { uri?: string; title?: string }[]; modelo?: string; erro?: string };
  if (!resp.ok) throw new Error(`Claude Code ${resp.status}: ${corpo?.erro || 'erro'}`);
  const texto = String(corpo.texto ?? '').trim();
  if (!texto) throw new Error('Claude Code retornou resposta vazia');
  const fontes = (corpo.fontes ?? []).filter((f) => /^https:\/\//i.test(String(f?.uri ?? ''))).map((f) => ({ uri: String(f.uri), title: String(f.title ?? '') }));
  return { texto, grounding: { groundingChunks: fontes.map((f) => ({ web: f })) }, modelo: corpo.modelo || modelo || 'claude-code' };
}

/**
 * Pergunta ao Claude. Com `busca`, liga a ferramenta de pesquisa na web da Anthropic (até `maximoBuscas` consultas).
 * A pesquisa roda no servidor da Anthropic; se ela pedir para continuar (pause_turn), continuamos até 3 vezes.
 */
export async function perguntarAoClaude(opcoes: {
  apiKey: string;
  modelo: string;
  prompt: string;
  busca?: boolean;
  maximoBuscas?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<RespostaClaude> {
  const { apiKey, modelo, prompt, busca = false, maximoBuscas = 6, maxTokens = busca ? 8000 : 4096, timeoutMs = busca ? 170_000 : 60_000 } = opcoes;
  const limite = Date.now() + timeoutMs;
  const mensagens: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: prompt }];
  const todos: Bloco[] = [];
  for (let volta = 0; volta < 4; volta++) {
    const restante = limite - Date.now();
    if (restante < 1000) throw new Error('Claude: tempo esgotado');
    const resp = await fetch(URL_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': VERSAO_API },
      body: JSON.stringify({
        model: modelo, max_tokens: maxTokens, messages: mensagens,
        ...(busca ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maximoBuscas }] } : {}),
      }),
      signal: AbortSignal.timeout(restante),
    });
    const corpo = (await resp.json().catch(() => ({}))) as { content?: Bloco[]; stop_reason?: string; error?: { message?: string }; model?: string };
    if (!resp.ok) throw new Error(`Claude API ${resp.status}: ${corpo?.error?.message || 'erro'}`);
    const blocos = Array.isArray(corpo.content) ? corpo.content : [];
    todos.push(...blocos);
    if (corpo.stop_reason !== 'pause_turn') {
      const { texto, fontes } = lerBlocos(todos);
      if (!texto) throw new Error('Claude retornou resposta vazia');
      return { texto, grounding: { groundingChunks: fontes.map((f) => ({ web: f })) }, modelo: corpo.model || modelo };
    }
    mensagens.push({ role: 'assistant', content: blocos });
  }
  throw new Error('Claude: a pesquisa não terminou');
}
