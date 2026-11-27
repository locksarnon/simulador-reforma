/**
 * O que a pergunta diz sem dizer direito: a UF ("no Pará", "em MT", "pra minas") e o NCM ("1201.90.00", "12019000", "ncm 1201"),
 * para a busca ir também ao regulamento do estado e aos anexos com listas de NCM. Funções puras (sem banco): o serviço completa
 * com a descrição do NCM da tabela oficial carregada no InTAX.
 */

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** UF e os nomes (sem acento, em minúsculas) pelos quais o usuário a chama. Os nomes mais longos vêm antes ("mato grosso do sul"). */
const NOMES_UF: [string, string[]][] = [
  ['MS', ['mato grosso do sul']], ['MT', ['mato grosso']], ['RS', ['rio grande do sul']], ['RN', ['rio grande do norte']], ['RJ', ['rio de janeiro']],
  ['ES', ['espirito santo']], ['SC', ['santa catarina']], ['SP', ['sao paulo']], ['MG', ['minas gerais', 'minas']], ['DF', ['distrito federal', 'brasilia']],
  ['AC', ['acre']], ['AL', ['alagoas']], ['AP', ['amapa']], ['AM', ['amazonas']], ['BA', ['bahia']], ['CE', ['ceara']], ['GO', ['goias']],
  ['MA', ['maranhao']], ['PB', ['paraiba']], ['PR', ['parana']], ['PE', ['pernambuco']], ['PI', ['piaui']], ['RO', ['rondonia']],
  ['RR', ['roraima']], ['SE', ['sergipe']], ['TO', ['tocantins']],
];
const SIGLAS = new Set([...NOMES_UF.map(([uf]) => uf), 'PA']);

/** UFs citadas na pergunta, na ordem em que aparecem (sem repetir). "Para" sem acento só conta como Pará quando vem com "no/do/ao/pro". */
export function ufsDaPergunta(pergunta: string): string[] {
  const achadas: { uf: string; pos: number }[] = [];
  let resto = ` ${semAcento(pergunta).toLowerCase()} `;
  for (const [uf, nomes] of NOMES_UF) {
    for (const nome of nomes) {
      const re = new RegExp(`(?<![a-z])${nome}(?![a-z])`, 'g');
      for (const m of resto.matchAll(re)) achadas.push({ uf, pos: m.index ?? 0 });
      resto = resto.replace(re, (t) => ' '.repeat(t.length)); // "mato grosso do sul" não conta também como "mato grosso"
    }
  }
  // Pará: com acento sempre; sem acento só depois de "no", "do", "ao", "pro", "estado do" (senão é a preposição "para").
  for (const m of pergunta.matchAll(/(?<![\p{L}])par[áÁ](?![\p{L}])/giu)) achadas.push({ uf: 'PA', pos: m.index ?? 0 });
  for (const m of semAcento(pergunta).toLowerCase().matchAll(/\b(?:no|do|ao|pro|estado do)\s+para\b(?!\s+(?:o|a|os|as|que|quem|um|uma)\b)/g)) achadas.push({ uf: 'PA', pos: m.index ?? 0 });
  // Siglas em maiúsculas ("ICMS em MT", "no PA"), como palavra solta.
  for (const m of pergunta.matchAll(/(?<![\p{L}\d])([A-Z]{2})(?![\p{L}\d])/gu)) if (SIGLAS.has(m[1])) achadas.push({ uf: m[1], pos: m.index ?? 0 });
  // Siglas em minúsculas depois de preposição ou numa lista ("adubo no ms", "em mt e go"), como quem não é da área escreve. Com acento
  // não conta ("ao pé da letra", "má-fé"); "se" nunca ("em se tratando"); "ma" só depois de no/na/em/pro/pra ("de ma fe" não é o Maranhão).
  for (const m of pergunta.toLowerCase().matchAll(/(?<![\p{L}\d])(no|na|em|do|da|de|pro|pra|ao|e|ou)\s+([a-z]{2})(?![\p{L}\d])/gu)) {
    const uf = m[2].toUpperCase();
    if (!SIGLAS.has(uf) || uf === 'SE' || (uf === 'MA' && !['no', 'na', 'em', 'pro', 'pra'].includes(m[1]))) continue;
    achadas.push({ uf, pos: (m.index ?? 0) + m[0].length - 2 });
  }
  return [...new Set(achadas.sort((a, b) => a.pos - b.pos).map((a) => a.uf))];
}

export type NcmDaPergunta = { codigo: string; nivel: 'item' | 'subposicao' | 'posicao' };

/** Códigos NCM citados: 8 dígitos (com ou sem pontos), subposição (1201.90) ou posição com a palavra NCM/posição perto ("ncm 1201"). */
export function ncmsDaPergunta(pergunta: string): NcmDaPergunta[] {
  const achados = new Map<string, NcmDaPergunta>();
  for (const m of pergunta.matchAll(/(?<![\d.])(\d{4})\.?(\d{2})\.?(\d{2})(?![\d.]*\d)/g)) achados.set(`${m[1]}${m[2]}${m[3]}`, { codigo: `${m[1]}${m[2]}${m[3]}`, nivel: 'item' });
  for (const m of pergunta.matchAll(/(?<![\d.])(\d{4})\.(\d{2})(?![\d.]*\d)/g)) {
    const c = `${m[1]}${m[2]}`;
    if (![...achados.keys()].some((k) => k.startsWith(c))) achados.set(c, { codigo: c, nivel: 'subposicao' });
  }
  for (const m of pergunta.matchAll(/\b(?:ncm|posi[çc][ãa]o|c[óo]digo)\s*(?:n[º°o.]?\s*)?(\d{4})(?![\d.]*\d)/gi)) {
    if (![...achados.keys()].some((k) => k.startsWith(m[1]))) achados.set(m[1], { codigo: m[1], nivel: 'posicao' });
  }
  return [...achados.values()].slice(0, 4);
}

/** Como o código aparece nos textos ("1201.90.00", "1201.90", "12.01", "1201"), do mais específico ao mais geral. */
export function variantesNcm(n: NcmDaPergunta): string[] {
  const c = n.codigo;
  const v: string[] = [];
  if (c.length === 8) v.push(`${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6)}`, c, `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6, 7)}`);
  if (c.length >= 6) v.push(`${c.slice(0, 4)}.${c.slice(4, 6)}`, `${c.slice(0, 4)}.${c.slice(4, 5)}`);
  v.push(`${c.slice(0, 2)}.${c.slice(2, 4)}`, c.slice(0, 4));
  return [...new Set(v)];
}

/** Formato de exibição: "12019000" → "1201.90.00"; "120190" → "1201.90"; "1201" → "1201". */
export const ncmFormatado = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6)}` : c.length === 6 ? `${c.slice(0, 4)}.${c.slice(4)}` : c);

/** Palavras de busca de uma descrição de NCM ("Soja, mesmo triturada" → ["soja", "triturada"]), sem palavras vazias. */
export function palavrasDaDescricao(descricao: string): string[] {
  const vazias = new Set(['mesmo', 'mesma', 'outros', 'outras', 'exceto', 'para', 'com', 'sem', 'dos', 'das', 'que', 'nao', 'ou', 'de', 'da', 'do', 'e', 'em', 'os', 'as', 'seus', 'suas']);
  return [...new Set(semAcento(descricao).toLowerCase().split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !vazias.has(p)))].slice(0, 4);
}

/**
 * Trecho de um dispositivo longo demais para ir inteiro à IA (anexos com listas de NCM): o começo (cabeçalho do anexo) e as linhas
 * que citam alguma das chaves, com a linha de antes e a de depois, até o limite. Sem linha que cite as chaves: null.
 */
export function trechoRelevante(texto: string, chaves: string[], limite = 6000): string | null {
  const alvos = [...new Set(chaves.map((c) => semAcento(c).toLowerCase().trim()).filter((c) => c.length >= 3))];
  if (!alvos.length) return null;
  const linhas = texto.split('\n');
  const marcadas = new Set<number>();
  linhas.forEach((l, i) => {
    const t = semAcento(l).toLowerCase();
    if (alvos.some((a) => t.includes(a))) for (let k = Math.max(0, i - 1); k <= Math.min(linhas.length - 1, i + 1); k++) marcadas.add(k);
  });
  if (!marcadas.size) return null;
  const partes: string[] = [linhas.slice(0, 3).join('\n')];
  let tamanho = partes[0].length;
  let anterior = 2;
  for (const i of [...marcadas].sort((a, b) => a - b)) {
    if (i <= 2) continue;
    const linha = (i > anterior + 1 ? '…\n' : '') + linhas[i];
    if (tamanho + linha.length > limite) break;
    partes.push(linha);
    tamanho += linha.length;
    anterior = i;
  }
  return partes.join('\n');
}

const NOME_UF: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco',
  PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

/** O que a IA recebe sobre o contexto achado na pergunta (UF, NCM com a descrição da tabela e as UFs que a base cobre). */
export function textoDoContexto(ufs: string[], ncms: { codigo: string; descricao: string | null }[], ufsDaBase: string[]): string {
  const linhas: string[] = [];
  for (const uf of ufs) {
    linhas.push(`- Estado citado: ${uf} (${NOME_UF[uf] ?? uf}).${ufsDaBase.includes(uf) ? ' A base tem a legislação do ICMS deste estado: os dispositivos dele estão entre os fornecidos, se a busca os achou.' : ' A base NÃO tem a legislação do ICMS deste estado: diga isso e não conclua sobre benefício estadual.'}`);
  }
  for (const n of ncms) linhas.push(`- NCM citado: ${ncmFormatado(n.codigo)}${n.descricao ? ` — ${n.descricao} (descrição da tabela NCM do InTAX)` : ' — o código não está na tabela NCM do InTAX: avise que pode estar errado e peça o código completo'}.`);
  return linhas.length ? `Contexto identificado na pergunta:\n${linhas.join('\n')}` : '';
}
