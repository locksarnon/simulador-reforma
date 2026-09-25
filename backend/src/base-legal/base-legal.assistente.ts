/** Regras do assistente da Base legal: prompts e validação da resposta (funções puras, testáveis). */

export type Candidato = { chave: string; numero: string; rotulo: string; caminho: string; secao: string | null; texto: string };

export type Fundamento = { norma: string; numero: string; rotulo: string; caminho: string; trecho: string | null };

export type RespostaAssistente = {
  resposta: string;
  suficiente: boolean;
  ressalvas: string | null;
  fundamentos: Fundamento[];
};

export const AVISO_ASSISTENTE =
  'Orientação com base no texto das normas carregadas na Base legal. Não substitui parecer tributário: confira o dispositivo citado antes de repassar ao cliente.';

export function promptTermos(pergunta: string): string {
  return `Você ajuda a localizar dispositivos na legislação brasileira da Reforma Tributária do Consumo (EC 132/2023, LC 214/2025, LC 227/2026, LC 235/2026, Decreto 12.955/2026).
Reescreva a pergunta abaixo como palavras-chave em linguagem jurídica, incluindo sinônimos e termos que a lei usa (ex.: "agricultor" -> "produtor rural"; "teto" -> "limite", "receita inferior").
Responda SOMENTE com JSON: {"termos": ["...", "..."]} com de 6 a 12 termos ou expressões curtas. Não responda a pergunta.

Pergunta: ${JSON.stringify(pergunta)}`;
}

export function promptResposta(pergunta: string, candidatos: Candidato[]): string {
  const blocos = candidatos
    .map((c, i) => `### [${i + 1}] ${c.numero} — ${c.rotulo} (id: ${c.chave}/${c.caminho})\n${c.texto}`)
    .join('\n\n');
  return `Você é um assistente para consultores tributários. Responda à pergunta usando EXCLUSIVAMENTE os dispositivos legais abaixo.

Regras obrigatórias:
- Não use conhecimento externo, não invente números, prazos, alíquotas nem artigos.
- Se os dispositivos não bastam para responder, marque "suficiente": false e explique em "resposta" o que falta.
- A resposta deve ser objetiva (até 180 palavras), em português simples, e dizer as condições e exceções que o texto traz (parágrafos e incisos relevantes).
- Cite sempre a norma e o artigo (e parágrafo/inciso quando houver) no corpo da resposta.
- Se dois dispositivos tratarem do mesmo ponto (ex.: lei e regulamento), priorize a lei complementar/emenda e mencione o regulamento como complemento.
- Em "fundamentos", liste os dispositivos que sustentam a resposta usando o id exato entre parênteses e um "trecho" copiado LITERALMENTE do dispositivo (até 300 caracteres).
- Use "ressalvas" para vigência, transição ou dúvida de interpretação; senão null.

Responda SOMENTE com JSON neste formato:
{"resposta": "...", "suficiente": true, "ressalvas": null, "fundamentos": [{"id": "chave/caminho", "trecho": "..."}]}

Pergunta do consultor: ${JSON.stringify(pergunta)}

Dispositivos:
${blocos}`;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Extrai o JSON da saída do modelo (tolera cercas ```json). */
export function lerJson<T>(texto: string): T | null {
  const limpo = texto.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(limpo) as T; } catch { /* tenta o maior trecho {...} */ }
  const a = limpo.indexOf('{');
  const b = limpo.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(limpo.slice(a, b + 1)) as T; } catch { return null; } }
  return null;
}

/**
 * Valida a resposta do modelo: só aceita fundamentos que existem entre os candidatos
 * fornecidos e só mantém o trecho se ele aparecer, palavra por palavra, no dispositivo.
 * Sem fundamento válido, a resposta não é tratada como suficiente.
 */
export function validarResposta(bruta: unknown, candidatos: Candidato[]): RespostaAssistente {
  const r = (bruta ?? {}) as { resposta?: unknown; suficiente?: unknown; ressalvas?: unknown; fundamentos?: unknown };
  const porId = new Map(candidatos.map((c) => [`${c.chave}/${c.caminho}`, c]));
  const fundamentos: Fundamento[] = [];
  const vistos = new Set<string>();
  for (const f of Array.isArray(r.fundamentos) ? r.fundamentos : []) {
    const id = String((f as { id?: unknown })?.id ?? '');
    const c = porId.get(id);
    if (!c || vistos.has(id)) continue;
    vistos.add(id);
    const trecho = String((f as { trecho?: unknown })?.trecho ?? '').trim();
    fundamentos.push({
      norma: c.chave, numero: c.numero, rotulo: c.rotulo, caminho: c.caminho,
      trecho: trecho && norm(c.texto).includes(norm(trecho)) ? trecho.slice(0, 400) : null,
    });
  }
  const resposta = typeof r.resposta === 'string' ? r.resposta.trim() : '';
  return {
    resposta,
    suficiente: r.suficiente === true && fundamentos.length > 0 && resposta.length > 0,
    ressalvas: typeof r.ressalvas === 'string' && r.ressalvas.trim() ? r.ressalvas.trim() : null,
    fundamentos,
  };
}
