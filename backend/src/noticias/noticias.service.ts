import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Busca automática de notícias — feeds RSS oficiais, filtrados por palavra-chave
 * da reforma tributária. Sem scheduler (nada de cron aqui): é disparada pelo
 * usuário via botão "Buscar atualizações", cria rascunhos para revisão manual
 * antes de virarem entradas publicadas no Acervo.
 */

const FONTES = [
  { nome: 'Receita Federal', url: 'https://www.gov.br/receitafederal/pt-br/RSS' },
];

const PALAVRAS_CHAVE = [
  'reforma tributária', 'reforma tributaria', 'ibs', 'cbs', 'nfs-e', 'nf-e',
  'lc 214', 'cclasstrib', 'cindop', 'split payment', 'imposto seletivo',
  'comitê gestor', 'cgibs',
];

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .trim();
}

function parseRssItems(xml: string): { titulo: string; url: string; resumo: string }[] {
  const items: { titulo: string; url: string; resumo: string }[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const titleM = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const linkM = block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    const descM = block.match(/<description[^>]*>([\s\S]*?)<\/description>/);
    const titulo = titleM ? decodeEntities(titleM[1]) : '';
    const url = linkM ? decodeEntities(linkM[1]) : '';
    const resumo = descM ? decodeEntities(descM[1]) : '';
    if (titulo && url) items.push({ titulo, url, resumo });
  }
  return items;
}

function relevante(item: { titulo: string; resumo: string }): boolean {
  const texto = `${item.titulo} ${item.resumo}`.toLowerCase();
  return PALAVRAS_CHAVE.some((p) => texto.includes(p));
}

@Injectable()
export class NoticiasService {
  private readonly logger = new Logger(NoticiasService.name);

  constructor(private readonly prisma: PrismaService) {}

  async buscarAtualizacoes() {
    const existentes = await this.prisma.noticiaReforma.findMany({ select: { url: true } });
    const urlsConhecidas = new Set(existentes.map((n) => n.url).filter(Boolean));

    let encontrados = 0;
    let novos = 0;
    const erros: string[] = [];

    for (const fonte of FONTES) {
      try {
        const resp = await fetch(fonte.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (SimuladorFAL/1.0)' },
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) {
          erros.push(`${fonte.nome}: HTTP ${resp.status}`);
          continue;
        }
        const xml = await resp.text();
        const itens = parseRssItems(xml).filter(relevante);
        encontrados += itens.length;

        for (const item of itens) {
          if (urlsConhecidas.has(item.url)) continue;
          urlsConhecidas.add(item.url);
          await this.prisma.noticiaReforma.create({
            data: {
              titulo: item.titulo,
              resumo: item.resumo || null,
              url: item.url,
              fonte: fonte.nome,
              publicado_em: new Date(),
              status: 'Rascunho',
            },
          });
          novos++;
        }
      } catch (err) {
        this.logger.warn(`Falha ao buscar ${fonte.nome}: ${(err as Error).message}`);
        erros.push(`${fonte.nome}: ${(err as Error).message}`);
      }
    }

    return { fontes_consultadas: FONTES.length, itens_relevantes_encontrados: encontrados, novos_rascunhos: novos, erros };
  }
}
