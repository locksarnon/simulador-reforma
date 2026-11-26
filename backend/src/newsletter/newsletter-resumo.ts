import { lerJson } from '../base-legal/base-legal.assistente';
import { esc } from '../mail/mail.service';
import { plural } from '../common/plural';

/**
 * Conteúdo da newsletter semanal: em vez de repassar cada item do Radar, a IA escreve o "resumo do resumo", o efeito prático por
 * setor, o que o contador deve preparar e as mudanças nas leis acompanhadas — só com os itens da semana (Radar da Reforma e
 * novidades oficiais da revisão semanal das bases legais), citando em que item cada frase se apoia. Sem IA, sai uma versão curta.
 */

export type ItemRadar = {
  prioridade: string; categoria: string; resumo: string; impacto_pratico?: string | null; prazo_vigencia?: string | null;
  acao_recomendada?: string | null; fonte_nome?: string | null; fonte_url?: string | null;
};
export type NovidadeDaSemana = { tipo: string; norma_numero?: string | null; titulo: string; resumo?: string | null; url?: string | null };
export type ItemDaSemana = { id: string; origem: 'radar' | 'lei'; texto: string; url: string | null; fonte: string; norma?: string | null };

export type ConteudoNewsletter = {
  assunto: string;
  resumo: string;
  setores: { setor: string; efeito: string; itens: string[] }[];
  preparar: { acao: string; prazo: string; itens: string[] }[];
  leis: { norma: string; mudanca: string; itens: string[] }[];
};

export const SETORES_NEWSLETTER = ['Agro', 'Indústria', 'Comércio', 'Serviços', 'Transporte e logística', 'Construção e imóveis', 'Simples Nacional', 'Todos os setores'];
const MAX = { setores: 5, preparar: 6, leis: 5, itens: 30 };
const TIPO_NOVIDADE: Record<string, string> = {
  alteracao: 'alteração', revogacao: 'revogação', inclusao: 'inclusão', norma_revogada: 'norma revogada', nova_norma: 'norma nova',
  regulamentacao: 'regulamentação', fonte_atualizada: 'documento oficial mudou', nao_consolidada: 'alteração ainda não consolidada',
};
/** Tipos de novidade das bases legais que entram na newsletter. */
export const TIPOS_NOVIDADE_NEWSLETTER = Object.keys(TIPO_NOVIDADE);

const curto = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Itens da semana numerados (R1, R2... do Radar; L1, L2... das bases legais), que a IA cita e o e-mail usa para os links. */
export function itensDaSemana(radar: ItemRadar[], novidades: NovidadeDaSemana[]): ItemDaSemana[] {
  const r = radar.slice(0, 18).map((i, k): ItemDaSemana => ({
    id: `R${k + 1}`, origem: 'radar', url: i.fonte_url || null, fonte: i.fonte_nome || 'Fonte',
    texto: [
      `(Radar · ${i.prioridade} · ${i.categoria})`, curto(i.resumo, 600),
      i.impacto_pratico ? `Impacto: ${curto(i.impacto_pratico, 300)}` : '', i.prazo_vigencia ? `Prazo: ${curto(i.prazo_vigencia, 120)}` : '',
      i.acao_recomendada ? `O que fazer: ${curto(i.acao_recomendada, 300)}` : '',
    ].filter(Boolean).join(' '),
  }));
  const l = novidades.slice(0, MAX.itens - r.length).map((n, k): ItemDaSemana => ({
    id: `L${k + 1}`, origem: 'lei', url: n.url || null, fonte: 'Texto oficial', norma: n.norma_numero ?? null,
    texto: `(Bases legais · ${TIPO_NOVIDADE[n.tipo] ?? n.tipo}) ${curto(n.titulo, 240)}${n.resumo ? ` — ${curto(n.resumo, 400)}` : ''}`,
  }));
  return [...r, ...l];
}

export function promptNewsletter(itens: ItemDaSemana[]): string {
  return [
    'Você escreve a newsletter semanal do InTAX (consultoria tributária) para contadores e empresários. A leitura deve levar um minuto: nada de texto genérico.',
    'Use SOMENTE os itens abaixo. Não invente norma, número, data, prazo ou alíquota que não esteja neles. Item sem efeito prático claro fica de fora.',
    '',
    'ITENS DA SEMANA:',
    ...itens.map((i) => `[${i.id}] ${i.texto}`),
    '',
    'Responda só com um JSON, sem nenhum texto fora dele:',
    '{"assunto": "até 90 caracteres, direto, sem ponto de exclamação",',
    ' "resumo": "o resumo do resumo: no máximo 3 frases curtas com o que realmente importa nesta semana",',
    ` "setores": [{"setor": "um destes: ${SETORES_NEWSLETTER.join(', ')}", "efeito": "uma frase: o efeito prático para as empresas do setor", "itens": ["R1"]}],`,
    ' "preparar": [{"acao": "o que o contador deve fazer, começando por um verbo, em uma frase", "prazo": "a data ou o período, só se o item disser; senão vazio", "itens": ["R1"]}],',
    ' "leis": [{"norma": "o número da norma", "mudanca": "uma frase: o que mudou", "itens": ["L1"]}]}',
    `Limites: até ${MAX.setores} setores, até ${MAX.preparar} ações e até ${MAX.leis} leis. Cada entrada cita os itens em que se apoia. Em "leis", só itens L.`,
  ].join('\n');
}

/** Lê e confere a resposta da IA: textos curtos, só itens que existem, listas no limite. Nada aproveitável: null. */
export function validarNewsletter(resposta: string, itens: ItemDaSemana[]): ConteudoNewsletter | null {
  const j = lerJson<Record<string, unknown>>(resposta);
  if (!j || typeof j !== 'object') return null;
  const ids = new Set(itens.map((i) => i.id));
  const refs = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim().toUpperCase()).filter((x) => ids.has(x)) : []);
  const lista = <T>(v: unknown, max: number, f: (o: Record<string, unknown>) => T | null): T[] =>
    (Array.isArray(v) ? v : []).map((o) => (o && typeof o === 'object' ? f(o as Record<string, unknown>) : null)).filter((x): x is T => x !== null).slice(0, max);

  const setores = lista(j.setores, MAX.setores, (o) => {
    const setor = SETORES_NEWSLETTER.find((s) => s.toLowerCase() === curto(o.setor, 60).toLowerCase());
    const efeito = curto(o.efeito, 260);
    const it = refs(o.itens);
    return setor && efeito && it.length ? { setor, efeito, itens: it } : null;
  });
  const preparar = lista(j.preparar, MAX.preparar, (o) => {
    const acao = curto(o.acao, 240);
    const it = refs(o.itens);
    return acao && it.length ? { acao, prazo: curto(o.prazo, 80), itens: it } : null;
  });
  const leis = lista(j.leis, MAX.leis, (o) => {
    const mudanca = curto(o.mudanca, 260);
    const it = refs(o.itens).filter((x) => x.startsWith('L'));
    return mudanca && it.length ? { norma: curto(o.norma, 80) || itens.find((i) => i.id === it[0])?.norma || 'Norma', mudanca, itens: it } : null;
  });
  const resumo = curto(j.resumo, 600);
  if (!resumo || setores.length + preparar.length + leis.length === 0) return null;
  return { assunto: curto(j.assunto, 90).replace(/!/g, '') || 'Radar InTAX: o que muda na semana', resumo, setores, preparar, leis };
}

const H3 = 'font-size:14px;margin:18px 0 6px;color:#1f3a2e';
const LI = 'font-size:14px;line-height:1.55;margin:0 0 6px';
const link = (itens: ItemDaSemana[], refs: string[], rotulo?: string) => {
  const i = itens.find((x) => refs.includes(x.id) && x.url);
  return i?.url ? ` <a href="${esc(i.url)}" style="color:#1f3a2e;font-size:12px">${esc(rotulo ?? i.fonte)}</a>` : '';
};
const NOTA_IA = '<p style="font-size:12px;color:#5b6b63;margin:18px 0 0">Resumo feito com IA a partir do Radar da Reforma e da revisão semanal das bases legais do InTAX. Confira a fonte oficial antes de agir.</p>';

/** Corpo do e-mail a partir do conteúdo validado. */
export function htmlNewsletter(c: ConteudoNewsletter, itens: ItemDaSemana[]): string {
  const partes = [`<p style="font-size:15px;line-height:1.6;margin:0 0 14px"><b>Resumo da semana:</b> ${esc(c.resumo)}</p>`];
  if (c.setores.length) partes.push(`<h3 style="${H3}">Efeito prático por setor</h3><ul style="padding-left:18px;margin:0">${c.setores.map((s) => `<li style="${LI}"><b>${esc(s.setor)}:</b> ${esc(s.efeito)}${link(itens, s.itens)}</li>`).join('')}</ul>`);
  if (c.preparar.length) partes.push(`<h3 style="${H3}">O que o contador deve preparar</h3><ol style="padding-left:18px;margin:0">${c.preparar.map((p) => `<li style="${LI}">${esc(p.acao)}${p.prazo ? ` <span style="color:#a86a00">(prazo: ${esc(p.prazo)})</span>` : ''}${link(itens, p.itens)}</li>`).join('')}</ol>`);
  if (c.leis.length) partes.push(`<h3 style="${H3}">Mudanças nas leis que acompanhamos</h3><ul style="padding-left:18px;margin:0">${c.leis.map((l) => `<li style="${LI}"><b>${esc(l.norma)}:</b> ${esc(l.mudanca)}${link(itens, l.itens, 'texto oficial')}</li>`).join('')}</ul>`);
  return partes.join('') + NOTA_IA;
}

/** Sem IA (ou resposta inaproveitável): versão curta, sem repassar o texto inteiro de cada item. */
export function htmlNewsletterSemIa(radar: ItemRadar[], novidades: NovidadeDaSemana[], resumoExecutivo?: string | null): { assunto: string; corpo: string } {
  const frases = (resumoExecutivo ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2).join(' ');
  const acoes = radar.slice(0, 6).map((i) => {
    const texto = curto(i.acao_recomendada || i.resumo, 220);
    const prazo = i.prazo_vigencia ? ` <span style="color:#a86a00">(prazo: ${esc(curto(i.prazo_vigencia, 80))})</span>` : '';
    const fonte = i.fonte_url ? ` <a href="${esc(i.fonte_url)}" style="color:#1f3a2e;font-size:12px">${esc(i.fonte_nome || 'Fonte')}</a>` : '';
    return `<li style="${LI}">${esc(texto)}${prazo}${fonte}</li>`;
  });
  const leis = novidades.slice(0, 5).map((n) => `<li style="${LI}">${esc(curto(n.titulo, 200))}${n.url ? ` <a href="${esc(n.url)}" style="color:#1f3a2e;font-size:12px">texto oficial</a>` : ''}</li>`);
  const partes = [];
  if (frases) partes.push(`<p style="font-size:15px;line-height:1.6;margin:0 0 14px"><b>Resumo da semana:</b> ${esc(frases)}</p>`);
  if (acoes.length) partes.push(`<h3 style="${H3}">O que fazer nesta semana</h3><ol style="padding-left:18px;margin:0">${acoes.join('')}</ol>`);
  if (leis.length) partes.push(`<h3 style="${H3}">Mudanças nas leis que acompanhamos</h3><ul style="padding-left:18px;margin:0">${leis.join('')}</ul>`);
  const total = radar.length + novidades.length;
  return { assunto: `Radar InTAX: ${plural(total, 'novidade', 'novidades')} da semana`, corpo: partes.join('') };
}
