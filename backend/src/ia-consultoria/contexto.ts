import { REGRAS_COMUNS, dominioEhOficial, extrairJson, limpar } from './util';
import type { Roteiro } from './roteiros';

/** Contexto padrão do projeto, o prompt do rascunho e a leitura da resposta. Funções puras. */

export type ClienteResumo = {
  /** "Pessoa jurídica" ou "Produtor rural pessoa física". Sem nome, CNPJ nem CPF: o consultor sabe de quem é o projeto. */
  tipo: string;
  regime?: string | null; setor?: string | null; uf?: string | null; porte?: string | null; cnae?: string | null;
  simples?: boolean | null; produtorRural?: string | null; contribuinteIbsCbs?: string | null; cooperativa?: string | null;
};
export type DocumentosResumo = { total: number; porSituacao: Record<string, number>; abertos: { item: string; periodo: string; situacao: string }[] };
export type ContextoProjeto = {
  servico: { id: string; nome: string; area: string; publico: string };
  /** "data-base" (um dia) ou "período". */
  referencia: { tipo: 'data-base' | 'período'; de: string | null; ate: string | null };
  situacaoDoProjeto: string;
  qtdClientes: number;
  clientes: ClienteResumo[];
  documentos: DocumentosResumo;
  /** Achados que o sistema já tem do serviço (ex.: laudo da homologação, casos do saneamento). Texto curto, já resumido. */
  achados: string[];
};

export const AVISO_RASCUNHO = 'Rascunho de apoio gerado por IA: não é parecer. O consultor precisa revisar, conferir as fontes e assumir o texto antes de usar.';

const semNulos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''));

export function montarPromptRascunho(ctx: ContextoProjeto, roteiro: Roteiro): string {
  const dados = {
    servico: ctx.servico, referencia: ctx.referencia, situacaoDoProjeto: ctx.situacaoDoProjeto, clientes: { total: ctx.qtdClientes, amostra: ctx.clientes.slice(0, 5).map((c) => semNulos({ ...c, cnae: limpar(c.cnae, 160) })) },
    documentosDoServico: {
      total: ctx.documentos.total, porSituacao: ctx.documentos.porSituacao,
      pendentesOuDivergentes: ctx.documentos.abertos.slice(0, 15).map((d) => ({ item: limpar(d.item, 120), periodo: d.periodo, situacao: d.situacao })),
    },
    achadosDoSistema: ctx.achados.slice(0, 12).map((a) => limpar(a, 400)),
  };
  return `Você prepara o RASCUNHO de um parecer de consultoria tributária e fiscal brasileira para o consultor da FAL (FAL Agro / InTAX) revisar. Serviço: "${ctx.servico.nome}".

Roteiro deste serviço:
- Foco do parecer: ${roteiro.foco}
- O que o consultor costuma conferir: ${roteiro.conferir.join('; ')}.
- O que a regra automática não decide (onde você mais ajuda): ${roteiro.borda}.

${REGRAS_COMUNS}
- Se o contexto não trouxer o dado, diga que falta; não presuma. Os clientes aparecem sem nome nem CNPJ: não tente identificá-los.
- Fundamentos: cite norma e artigo só quando tiver fonte oficial (Planalto, Receita Federal, SPED, portal da NF-e, CGIBS, TCU); sem fonte, escreva "não confirmado".
- Pesquise na web quando precisar confirmar vigência, regulamentação ou prazo; fonte não oficial só para localizar a oficial.

Responda SOMENTE com um objeto JSON, sem texto fora dele:
{"resumo": "até 5 frases, no padrão FAL: conclusão primeiro", "pontosDeAtencao": ["..."], "oQueConferir": ["..."], "fundamentos": ["norma, artigo e o que ela sustenta, ou 'não confirmado'"], "fontes": [{"titulo": "...", "url": "https://... (só se tiver)"}]}
Máximo de 6 itens em cada lista.

<<<DADOS
${JSON.stringify(dados, null, 1)}
DADOS>>>`;
}

export type SecoesRascunho = { resumo: string; pontosDeAtencao: string[]; oQueConferir: string[]; fundamentos: string[]; fontes: { titulo: string; url?: string; oficial: boolean }[] };

const lista = (v: unknown, max = 6, tam = 400): string[] | null => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  return v.filter((x) => typeof x === 'string').map((x) => limpar(x, tam)).filter(Boolean).slice(0, max);
};

/** Valida a resposta do modelo; null = descartar (malformada ou sem resumo). Fonte com endereço que não seja https é descartada. */
export function lerRascunho(texto: string): SecoesRascunho | null {
  const j = extrairJson(texto);
  if (!j) return null;
  const resumo = typeof j.resumo === 'string' ? limpar(j.resumo, 1200) : '';
  const pontosDeAtencao = lista(j.pontosDeAtencao), oQueConferir = lista(j.oQueConferir), fundamentos = lista(j.fundamentos);
  if (!resumo || !pontosDeAtencao || !oQueConferir || !fundamentos || (j.fontes !== undefined && j.fontes !== null && !Array.isArray(j.fontes))) return null;
  const fontes: SecoesRascunho['fontes'] = [];
  for (const f of ((j.fontes as unknown[] | null | undefined) ?? []).slice(0, 12)) {
    const titulo = limpar((f as { titulo?: unknown })?.titulo, 200);
    const bruto = (f as { url?: unknown })?.url;
    if (!titulo) continue;
    if (bruto === undefined || bruto === null || bruto === '') { fontes.push({ titulo, oficial: false }); continue; }
    try {
      const u = new URL(String(bruto));
      if (u.protocol === 'https:' && String(bruto).length <= 500) fontes.push({ titulo, url: u.toString(), oficial: dominioEhOficial(u.hostname) });
    } catch { /* endereço inválido: a fonte é descartada */ }
  }
  return { resumo, pontosDeAtencao, oQueConferir, fundamentos, fontes: fontes.sort((a, b) => Number(b.oficial) - Number(a.oficial)).slice(0, 8) };
}

/** O rascunho em texto corrido, pronto para copiar para o Word. */
export function rascunhoEmTexto(nomeServico: string, s: SecoesRascunho): string {
  const bloco = (titulo: string, itens: string[]) => (itens.length ? `\n${titulo}\n${itens.map((i) => `- ${i}`).join('\n')}\n` : '');
  return [
    `RASCUNHO DE PARECER (apoio, para revisão do consultor) — ${nomeServico}`, '', 'Resumo', s.resumo,
    bloco('Pontos de atenção', s.pontosDeAtencao), bloco('O que conferir', s.oQueConferir), bloco('Fundamentos citados', s.fundamentos),
    bloco('Fontes', s.fontes.map((f) => `${f.titulo}${f.url ? ` — ${f.url}` : ''}${f.oficial ? ' (oficial)' : ' (não oficial ou sem endereço)'}`)),
    `\n${AVISO_RASCUNHO}`,
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
