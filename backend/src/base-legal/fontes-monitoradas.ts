/**
 * Portais oficiais sem estrutura de artigos (documentação técnica da NFS-e, eSocial e NF-e, resoluções do CGIBS, convênios do Confaz,
 * jurisprudência do CARF). A revisão semanal guarda a lista de links de cada página e avisa o que apareceu de novo. Só entram páginas
 * que abrem pelo servidor (conferidas); o que o servidor não alcança (portais com certificado ICP-Brasil) fica de fora.
 */
import { createHash } from 'crypto';
import { dominioOficial } from './base-legal.deteccao';
import type { GrupoNorma } from './fontes';

export type FonteMonitoradaDef = {
  chave: string; titulo: string;
  /** Pode ter {ano}: vira o ano corrente (as listas do Confaz são por ano). */
  url: string;
  grupo: GrupoNorma; observacao?: string;
  /** Página que só lista itens novos (notícias): qualquer link novo de órgão oficial vale, não só os que parecem ato. */
  qualquerLink?: boolean;
};

/** Endereço da fonte hoje: {ano} vira o ano corrente (no horário de Brasília). */
export const urlDaFonte = (f: Pick<FonteMonitoradaDef, 'url'>, agora = new Date()): string =>
  f.url.replace('{ano}', String(new Date(agora.getTime() - 3 * 3_600_000).getUTCFullYear()));

export const FONTES_MONITORADAS: FonteMonitoradaDef[] = [
  { chave: 'cgibs-regulamentos', titulo: 'CGIBS: regulamentos', url: 'https://www.cgibs.gov.br/regulamentos', grupo: 'reforma', observacao: 'Regulamento do IBS e alterações; ato novo costuma sair em PDF.' },
  { chave: 'cgibs-resolucoes', titulo: 'CGIBS: resoluções', url: 'https://www.cgibs.gov.br/resolucoes', grupo: 'reforma' },
  // A página "Documentos" do portal monta a lista por script (o servidor só enxerga o menu); a legislação e as notícias vêm no HTML.
  { chave: 'svrs-nfe-legislacao', titulo: 'Portal da NF-e (SVRS): legislação', url: 'https://dfe-portal.svrs.rs.gov.br/NFE/Legislacao', grupo: 'operacional', observacao: 'Leis, Ajustes SINIEF, Atos Cotepe, convênios e atos conjuntos que valem para a NF-e e o IBS/CBS.' },
  { chave: 'svrs-nfe-noticias', titulo: 'Portal da NF-e (SVRS): notícias', url: 'https://dfe-portal.svrs.rs.gov.br/NFE/Noticias', grupo: 'operacional', qualquerLink: true, observacao: 'Notas técnicas, leiautes e a tabela de classificação tributária (cClassTrib) divulgados pelo portal.' },
  { chave: 'nfse-documentacao-tecnica', titulo: 'NFS-e nacional: documentação técnica', url: 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica', grupo: 'operacional' },
  { chave: 'nfse-rtc', titulo: 'NFS-e nacional: reforma tributária do consumo (Anexo VIII e leiautes)', url: 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc', grupo: 'operacional' },
  { chave: 'esocial-documentacao-tecnica', titulo: 'eSocial: documentação técnica', url: 'https://www.gov.br/esocial/pt-br/documentacao-tecnica', grupo: 'operacional' },
  { chave: 'confaz-convenios', titulo: 'Confaz: convênios ICMS do ano', url: 'https://www.confaz.fazenda.gov.br/legislacao/convenios/{ano}', grupo: 'territorial', observacao: 'Convênios de ICMS (benefícios, substituição tributária, insumos agropecuários).' },
  { chave: 'confaz-atos-cotepe', titulo: 'Confaz: atos Cotepe/ICMS do ano', url: 'https://www.confaz.fazenda.gov.br/legislacao/atos/{ano}', grupo: 'territorial', observacao: 'Atos Cotepe (tabelas e leiautes que valem para a NF-e e o ICMS).' },
  { chave: 'carf-jurisprudencia', titulo: 'CARF: jurisprudência', url: 'https://www.gov.br/carf/pt-br/assuntos/jurisprudencia', grupo: 'operacional', observacao: 'Acórdãos, súmulas e resoluções.' },
];

export type LinkPagina = { titulo: string; url: string };

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', Atilde: 'Ã', otilde: 'õ', Otilde: 'Õ', aacute: 'á', Aacute: 'Á',
  eacute: 'é', Eacute: 'É', iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú', acirc: 'â', Acirc: 'Â', ecirc: 'ê', Ecirc: 'Ê', ocirc: 'ô', Ocirc: 'Ô', agrave: 'à', Agrave: 'À',
};
const decodificarEntidades = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
  .replace(/&([a-z]+);/gi, (m, nome) => ENTIDADES[nome] ?? ' ');
/** Texto de um trecho de HTML: sem estilo, script e tags, com as entidades ("CONV&#202;NIO") decodificadas. */
const semTags = (s: string) => decodificarEntidades(s.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Links (http/https) de uma página, com o texto de cada um, sem repetir endereço. Relativos são completados pelo endereço da página. */
export function linksDaPagina(html: string, base: string): LinkPagina[] {
  const vistos = new Set<string>();
  const saida: LinkPagina[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const bruto = m[1].trim();
    if (!bruto || bruto.startsWith('#') || /^(mailto|tel|javascript):/i.test(bruto)) continue;
    let url: string;
    try { url = new URL(bruto.replace(/&amp;/g, '&'), base).href; } catch { continue; }
    if (!/^https?:/i.test(url)) continue;
    const semFragmento = url.split('#')[0];
    if (vistos.has(semFragmento)) continue;
    vistos.add(semFragmento);
    const arquivo = decodeURIComponent(semFragmento.split('/').pop() || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[-_]+/g, ' ');
    const titulo = semTags(m[2]).slice(0, 220) || arquivo.slice(0, 220);
    saida.push({ titulo, url: semFragmento });
  }
  return saida.slice(0, 600);
}

/** Impressão digital da lista de endereços (a ordem e o texto dos links não contam). */
export const hashDosLinks = (links: LinkPagina[]): string => createHash('sha256').update([...new Set(links.map((l) => l.url))].sort().join('\n')).digest('hex');

export const novosLinks = (antes: LinkPagina[], agora: LinkPagina[]): LinkPagina[] => {
  const conhecidos = new Set(antes.map((l) => l.url));
  return agora.filter((l) => !conhecidos.has(l.url));
};

const EXTENSAO_DOCUMENTO = /\.(pdf|xlsx?|xml|xsd|zip|docx?|odt|csv|json|txt)(\?|$)/i;
const TERMOS_NORMATIVOS = /resolu|portaria|ato conjunto|ato t[ée]cnico|instru[çc][ãa]o|decreto|lei complementar|conv[êe]nio|ajuste|regulament|nota t[ée]cnica|informe t[ée]cnico|manual|leiaute|layout|anexo|s[úu]mula|ac[óo]rd[ãa]o|jurisprud|consulta|schema|tabela/i;

export const hostOficial = (url: string): boolean => {
  try { return dominioOficial(new URL(url).hostname); } catch { return false; }
};

/**
 * O link novo parece documento ou ato de órgão oficial (e não menu, rede social ou rodapé do site)? Arquivo (PDF, planilha, esquema) vale;
 * link de página vale se o texto nomeia um tipo de ato e traz número ("Resolução CGIBS nº 9", "Nota Técnica 2025.002", "Convênio ICMS 32/12").
 */
export const pareceDocumento = (l: LinkPagina): boolean => hostOficial(l.url) && (EXTENSAO_DOCUMENTO.test(l.url) || (TERMOS_NORMATIVOS.test(l.titulo) && /\d/.test(l.titulo)));

/** O link é de um ato do CGIBS ou da Fazenda que muda a regra do IBS/CBS (e não de despesa, orçamento ou rotina interna)? Esses entram na base por conta própria. */
export function atoDoCgibsRelevante(l: LinkPagina): boolean {
  if (!/cgibs\.gov\.br/i.test(l.url) || !/\.pdf(\?|$)/i.test(l.url)) return false;
  const t = `${l.titulo} ${decodeURIComponent(l.url)}`;
  if (/or[çc]amen|licita|eleit|regimento|for[çc]a de trabalho|despesa|comiss[õo]es de trabalho|SEI como|diretoria executiva|tipologia|diretrizes/i.test(t)) return false;
  return /regulament|ibs|cbs|al[íi]quota|percentual|documentos? fiscai|leiaute|split|cr[ée]dito|ato conjunto|portaria conjunta|resolu[çc][ãa]o cgibs/i.test(t);
}
