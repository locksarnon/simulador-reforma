import { REGRAS_COMUNS, dominioEhOficial, extrairJson, limpar, mascarar } from '../../ia-consultoria/util';
import type { CasoParaParecer, ParecerIa } from '../dados/portas';
import type { Borda } from './borda';

/** Prompt e leitura do parecer da IA sobre um caso de borda. Funções puras: o modelo é chamado em parecer-ia.service.ts. */

export type Precedente = { problema: string; atual: unknown; proposta: unknown; justificativa: string; fundamento: string | null };
export type LeiCarregada = { rotulo: string; texto: string };
export type EntradaParecer = {
  caso: Omit<CasoParaParecer, 'casoId'>;
  borda: Borda;
  /** "CNAE — descrição" das atividades que o consultor confirmou. */
  atividades: string[];
  precedentes: Precedente[];
  leis: LeiCarregada[];
  comBusca: boolean;
};

export type FonteParecer = { titulo: string; url?: string; oficial: boolean };
export type ParecerValidado = {
  recomendacao: string;
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
  aFavor: string[];
  contra: string[];
  confirmar: string[];
  fontes: FonteParecer[];
  praticaMercado: string | null;
};

const ROTULO_PRATICA = 'Prática de mercado (não é norma): ';

const pares = (o: unknown, max = 15): [string, string][] =>
  Object.entries((o && typeof o === 'object' ? o : {}) as Record<string, unknown>).slice(0, max)
    .map(([k, v]): [string, string] => [limpar(k, 40), limpar(v && typeof v === 'object' ? JSON.stringify(v) : v, 200)]);

/** Dados MÍNIMOS: nada de nome, CNPJ ou outro dado do cliente; só o que o caso e as atividades dizem. */
export function montarPrompt(e: EntradaParecer): string {
  const dados = {
    caso: {
      camada: e.caso.camada, tipo: e.caso.tipo, problema: limpar(e.caso.problema, 400),
      evidencias: (Array.isArray(e.caso.evidencia) ? e.caso.evidencia : []).slice(0, 10).map((x) => ({ rotulo: limpar(x?.rotulo, 60), valor: limpar(x?.valor, 300) })),
      atual: Object.fromEntries(pares(e.caso.atual)), propostaDaRegra: Object.fromEntries(pares(e.caso.proposta)),
      justificativaDaRegra: mascarar(limpar(e.caso.justificativa, 600)), fundamentoDaRegra: limpar(e.caso.fundamento, 300) || null,
    },
    porQueEBorda: e.borda.motivo,
    atividadesConfirmadasPeloConsultor: e.atividades.slice(0, 20).map((a) => limpar(a, 160)),
    precedentesAprovadosDaMesmaFamilia: e.precedentes.slice(0, 3).map((p) => ({
      contexto: limpar(p.problema, 250), atual: Object.fromEntries(pares(p.atual, 8)), decisaoAprovada: Object.fromEntries(pares(p.proposta, 8)),
      justificativa: mascarar(limpar(p.justificativa, 300)), fundamento: limpar(p.fundamento, 200) || null,
    })),
    textoDeLeiCarregadoNoInTAX: e.leis.slice(0, 3).map((l) => ({ dispositivo: limpar(l.rotulo, 120), texto: limpar(l.texto, 1200) })),
  };
  const busca = e.comBusca
    ? '- Você pode pesquisar na web, mas só fonte oficial (gov.br, planalto.gov.br, jus.br, leg.br, SPED, portal da NF-e) vale como fundamento; as demais servem só para localizar a oficial.'
    : '- Não há pesquisa na web neste pedido: se faltar fonte, diga que não confirmou.';
  return `Você apoia consultores tributários da FAL no saneamento de estoques e cadastro de produtos (foco em IBS e CBS, com a legislação que segue valendo na transição, como PIS/Cofins e o SPED). Um caso de BORDA, que a regra automática não decide sozinha, chegou para um parecer curto que ajuda o consultor a decidir.

${REGRAS_COMUNS}
- Os precedentes aprovados são decisões anteriores DESTE cliente para a mesma família de caso: use-os como contexto e coerência, jamais como prova de que este produto é igual.
${busca}

Responda SOMENTE com um objeto JSON, sem texto fora dele, neste formato:
{"recomendacao": "o que fazer, em até 3 frases", "confianca": "ALTA" | "MEDIA" | "BAIXA", "aFavor": ["..."], "contra": ["..."], "confirmar": ["o que o consultor deve confirmar com o cliente ou na fonte"], "fontes": [{"titulo": "norma, artigo ou página", "url": "https://... (só se tiver)", "oficial": true ou false}], "praticaMercado": "texto ou null"}
Máximo de 4 itens em cada lista. Confiança ALTA só com fonte oficial citada.

<<<DADOS
${JSON.stringify(dados, null, 1)}
DADOS>>>`;
}

const lista = (v: unknown, max: number, tam: number): string[] | null => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  return v.filter((x) => typeof x === 'string').map((x) => limpar(x, tam)).filter(Boolean).slice(0, max);
};

/** Fonte só vale com https; a marca "oficial" é nossa (pelo domínio), nunca a declarada pelo modelo. */
export function lerFonte(x: unknown): FonteParecer | null {
  if (!x || typeof x !== 'object') return null;
  const titulo = limpar((x as { titulo?: unknown }).titulo, 200);
  const bruto = (x as { url?: unknown }).url;
  if (!titulo) return null;
  if (bruto === undefined || bruto === null || bruto === '') return { titulo, oficial: false };
  let url: URL;
  try { url = new URL(String(bruto)); } catch { return null; }
  if (url.protocol !== 'https:' || String(bruto).length > 500) return null;
  return { titulo, url: url.toString(), oficial: dominioEhOficial(url.hostname) };
}

/** Lê e valida a resposta do modelo. null = descartar (JSON malformado, campo obrigatório faltando ou confiança inválida). */
export function lerParecer(texto: string): ParecerValidado | null {
  const j = extrairJson(texto);
  if (!j) return null;
  const recomendacao = typeof j.recomendacao === 'string' ? limpar(j.recomendacao, 700) : '';
  const confianca = typeof j.confianca === 'string' ? j.confianca.trim().toUpperCase().replace('É', 'E') : '';
  if (!recomendacao || !['ALTA', 'MEDIA', 'BAIXA'].includes(confianca)) return null;
  const aFavor = lista(j.aFavor, 4, 300), contra = lista(j.contra, 4, 300), confirmar = lista(j.confirmar, 4, 300);
  if (!aFavor || !contra || !confirmar || (j.fontes !== undefined && j.fontes !== null && !Array.isArray(j.fontes))) return null;
  const fontes = ((j.fontes as unknown[] | null | undefined) ?? []).map(lerFonte).filter((f): f is FonteParecer => f !== null).slice(0, 8);
  const pratica = typeof j.praticaMercado === 'string' ? limpar(j.praticaMercado, 500) : '';
  let conf = confianca as ParecerValidado['confianca'];
  // Confiança ALTA exige ao menos uma fonte OFICIAL (domínio decidido aqui, não pelo modelo).
  if (conf === 'ALTA' && !fontes.some((f) => f.oficial)) conf = 'MEDIA';
  return {
    recomendacao, confianca: conf, aFavor, contra, confirmar, fontes,
    praticaMercado: pratica && !/^null$/i.test(pratica) ? (pratica.toLowerCase().startsWith('prática de mercado') ? pratica : ROTULO_PRATICA + pratica) : null,
  };
}

/** O que o contrato da porta guarda (`ParecerIa`) + o detalhe que a tela usa; sempre marcado como origem IA. */
export type ParecerGravado = ParecerIa & { origem: 'IA'; modelo: string | null; comBusca: boolean; motivoBorda: string; fontesDetalhe: FonteParecer[] };

export function paraGravar(p: ParecerValidado, extra: { modelo: string | null; comBusca: boolean; borda: Borda; fontesDaBusca?: FonteParecer[]; agora?: Date }): ParecerGravado {
  const vistos = new Set<string>();
  const detalhe = [...p.fontes, ...(extra.fontesDaBusca ?? [])].filter((f) => {
    const k = f.url ?? f.titulo;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).sort((a, b) => Number(b.oficial) - Number(a.oficial)).slice(0, 8);
  return {
    recomendacao: p.recomendacao, confianca: p.confianca.toLowerCase() as ParecerIa['confianca'], aFavor: p.aFavor, contra: p.contra, oQueConfirmar: p.confirmar,
    fontes: detalhe.map((f) => `${f.titulo}${f.url ? ` — ${f.url}` : ''}${f.oficial ? ' (oficial)' : ''}`), praticaDeMercado: p.praticaMercado,
    geradoEm: (extra.agora ?? new Date()).toISOString(),
    origem: 'IA', modelo: extra.modelo, comBusca: extra.comBusca, motivoBorda: extra.borda.codigo, fontesDetalhe: detalhe,
  };
}
