import { REGRAS_COMUNS, dominioEhOficial, extrairJson, limpar } from './util';
import type { Roteiro } from './roteiros';
import { blocoDoCandidato, REGRAS_SITUACAO_DO_TEXTO, type Candidato } from '../base-legal/base-legal.assistente';
import { REGRA_ERP_IA, type ErpParaIa } from '../erps/logica';

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
  /** ERP(s) dos clientes, do Cadastro de ERPs: restrições e ações do perfil (confirmadas e "a confirmar"), para a IA não recomendar o que o ERP não permite. */
  erps?: ErpParaIa[];
};

export const AVISO_RASCUNHO = 'Rascunho de apoio gerado por IA: não é parecer. O consultor precisa revisar, conferir as fontes e assumir o texto antes de usar.';

const semNulos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''));

/** "rapido": só o contexto do projeto e os trechos de norma da base legal local, sem web. "pesquisa": com pesquisa externa (mais lento). */
export type ModoRascunho = 'rapido' | 'pesquisa';

/** Trechos da base legal local que entram no rascunho rápido: poucos e curtos, para a resposta sair em segundos. */
export const MAX_NORMAS_RASCUNHO = 6;
const MAX_CARACTERES_NORMAS = 18_000;

export function blocoDeNormas(normas: Candidato[]): string {
  let total = 0;
  const blocos: string[] = [];
  for (const c of normas.slice(0, MAX_NORMAS_RASCUNHO)) {
    const b = limpar(blocoDoCandidato({ ...c, texto: c.texto.slice(0, 4_000) }, blocos.length), 5_000);
    if (total + b.length > MAX_CARACTERES_NORMAS) break;
    total += b.length;
    blocos.push(b);
  }
  return blocos.join('\n\n');
}

const REGRA_PESQUISA = '- Pesquise na web quando precisar confirmar vigência, regulamentação ou prazo; fonte não oficial só para localizar a oficial.';
const REGRA_RAPIDO = `- NÃO pesquise na web: use só o contexto e os trechos da base legal do InTAX que vêm no bloco de dados (normasDaBaseLocal). Cite artigo só se ele estiver nesses trechos; o que depender de outra norma fica "não confirmado" e vai em "oQueConferir".
${REGRAS_SITUACAO_DO_TEXTO}
- Em "fontes", liste só as normas da base local que você usou (título como "LC 214/2025, art. X"), sem endereço.`;

export function montarPromptRascunho(ctx: ContextoProjeto, roteiro: Roteiro, modo: ModoRascunho = 'pesquisa', normas: Candidato[] = []): string {
  const dados = {
    servico: ctx.servico, referencia: ctx.referencia, situacaoDoProjeto: ctx.situacaoDoProjeto, clientes: { total: ctx.qtdClientes, amostra: ctx.clientes.slice(0, 5).map((c) => semNulos({ ...c, cnae: limpar(c.cnae, 160) })) },
    documentosDoServico: {
      total: ctx.documentos.total, porSituacao: ctx.documentos.porSituacao,
      pendentesOuDivergentes: ctx.documentos.abertos.slice(0, 15).map((d) => ({ item: limpar(d.item, 120), periodo: d.periodo, situacao: d.situacao })),
    },
    achadosDoSistema: ctx.achados.slice(0, 12).map((a) => limpar(a, 400)),
    ...(ctx.erps?.length ? { erpDoCliente: ctx.erps.slice(0, 3) } : {}),
  };
  return `Você prepara o RASCUNHO de um parecer de consultoria tributária e fiscal brasileira para o consultor da FAL (FAL Agro / InTAX) revisar. Serviço: "${ctx.servico.nome}".

Roteiro deste serviço:
- Foco do parecer: ${roteiro.foco}
- O que o consultor costuma conferir: ${roteiro.conferir.join('; ')}.
- O que a regra automática não decide (onde você mais ajuda): ${roteiro.borda}.

${REGRAS_COMUNS}
- Se o contexto não trouxer o dado, diga que falta; não presuma. Os clientes aparecem sem nome nem CNPJ: não tente identificá-los.
- Fundamentos: cite norma e artigo só quando tiver fonte oficial (Planalto, Receita Federal, SPED, portal da NF-e, CGIBS, TCU); sem fonte, escreva "não confirmado".
${ctx.erps?.length ? `${REGRA_ERP_IA}\n` : ''}${modo === 'pesquisa' ? REGRA_PESQUISA : REGRA_RAPIDO}

Responda SOMENTE com um objeto JSON, sem texto fora dele:
{"resumo": "até 5 frases, no padrão FAL: conclusão primeiro", "pontosDeAtencao": ["..."], "oQueConferir": ["..."], "fundamentos": ["norma, artigo e o que ela sustenta, ou 'não confirmado'"], "fontes": [{"titulo": "...", "url": "https://... (só se tiver)"}]}
Máximo de 6 itens em cada lista.

<<<DADOS
${JSON.stringify(dados, null, 1)}${modo === 'rapido' ? `\n\nnormasDaBaseLocal:\n${blocoDeNormas(normas) || '(nenhum trecho da base local encontrado para este serviço)'}` : ''}
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
