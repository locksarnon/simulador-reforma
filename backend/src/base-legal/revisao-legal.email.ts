import { emailLayout, esc } from '../mail/mail.service';
import { NormaMudada, NovaRevisao, TipoRevisao } from './revisao-legal.regras';

const POR_SECAO = 15;

const TITULO_SECAO: Record<TipoRevisao, string> = {
  cartao: 'Perguntas frequentes',
  fundamento: 'Notas do cálculo (ícone da balança)',
  marco: 'Marcos da Agenda da Reforma',
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

type Alvo = { titulo: string; dispositivos: { rotulo: string; detalhe: string | null }[] };

function alvosDo(revisoes: NovaRevisao[], tipo: TipoRevisao): Alvo[] {
  const mapa = new Map<string, Alvo>();
  for (const r of revisoes.filter((x) => x.tipo === tipo)) {
    const alvo = mapa.get(r.alvo_id) ?? { titulo: r.alvo_titulo, dispositivos: [] };
    alvo.dispositivos.push({ rotulo: r.rotulo, detalhe: r.detalhe });
    mapa.set(r.alvo_id, alvo);
  }
  return [...mapa.values()];
}

const linhaDoDispositivo = (d: { rotulo: string; detalhe: string | null }) => `${d.rotulo}${d.detalhe ? `: ${d.detalhe}` : ''}`;

/** Aviso ao administrador: o texto de uma norma mudou na Base legal e estes itens citam dispositivos alterados. */
export function montarEmailRevisao(norma: NormaMudada, revisoes: NovaRevisao[], despublicados: number, urlPublica: string) {
  const secoes = (['cartao', 'fundamento', 'marco'] as TipoRevisao[]).map((tipo) => ({ tipo, alvos: alvosDo(revisoes, tipo) })).filter((s) => s.alvos.length);
  const total = secoes.reduce((soma, s) => soma + s.alvos.length, 0);
  const link = `${urlPublica.replace(/\/$/, '')}/base-legal`;
  const assunto = `[InTAX] ${plural(total, 'item', 'itens')} para revisar: ${norma.numero} mudou na Base legal`.slice(0, 150);
  const abertura = `O texto oficial de ${norma.numero} foi atualizado na Base legal e mudou dispositivos que o InTAX cita. Nada foi publicado nem alterado sozinho: os itens abaixo aguardam a sua revisão.`;
  const publicados = despublicados
    ? `${plural(despublicados, 'cartão que estava publicado voltou', 'cartões que estavam publicados voltaram')} para rascunho e ${despublicados === 1 ? 'deixou' : 'deixaram'} de aparecer para os consultores até a revisão.`
    : '';

  const blocosHtml = secoes.map((s) => {
    const itens = s.alvos.slice(0, POR_SECAO).map((a) => `<li style="margin:0 0 8px"><b>${esc(a.titulo)}</b>${a.dispositivos.map((d) => `<br><span style="font-size:13px;color:#3b4a43">${esc(linhaDoDispositivo(d))}</span>`).join('')}</li>`).join('');
    const resto = s.alvos.length > POR_SECAO ? `<li style="margin:0 0 8px">e mais ${s.alvos.length - POR_SECAO}.</li>` : '';
    return `<h2 style="font-size:15px;margin:18px 0 6px">${esc(TITULO_SECAO[s.tipo])} (${s.alvos.length})</h2><ul style="padding-left:18px;margin:0;font-size:14px;line-height:1.5">${itens}${resto}</ul>`;
  }).join('');

  const corpo = `<p style="font-size:14px;line-height:1.6;margin:0 0 10px">${esc(abertura)}</p>${publicados ? `<p style="font-size:14px;line-height:1.6;margin:0 0 10px">${esc(publicados)}</p>` : ''}${blocosHtml}<p style="font-size:14px;margin:18px 0 0"><a href="${esc(link)}" style="color:#1f3a2e;font-weight:bold">Abrir a Base legal e revisar</a></p>`;
  const html = emailLayout('Itens para revisar na Base legal', corpo, 'Aviso automático do InTAX ao administrador.');

  const linhas = publicados ? [abertura, publicados] : [abertura];
  for (const s of secoes) {
    linhas.push('', `${TITULO_SECAO[s.tipo]} (${s.alvos.length})`);
    for (const a of s.alvos.slice(0, POR_SECAO)) linhas.push(`- ${a.titulo}`, ...a.dispositivos.map((d) => `    ${linhaDoDispositivo(d)}`));
    if (s.alvos.length > POR_SECAO) linhas.push(`- e mais ${s.alvos.length - POR_SECAO}.`);
  }
  linhas.push('', `Abrir a Base legal: ${link}`);
  const texto = linhas.join('\n');

  return { assunto, html, texto, total };
}
