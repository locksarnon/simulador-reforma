import { emailLayout, esc } from '../mail/mail.service';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export type Destaque = { tipo: string; titulo: string; resumo?: string | null; url?: string | null; oficial?: boolean; confirmada?: boolean };

export type ResumoRodada = {
  semana: string;
  disparo: string;
  iniciado_em: Date;
  concluido_em: Date;
  status: string;
  normas_verificadas: number;
  normas_atualizadas: number;
  dispositivos_alterados: number;
  dispositivos_revogados: number;
  normas_novas: number;
  atos_relacionados: number;
  fontes_verificadas: number;
  fontes_alteradas: number;
  erros: string[];
  notas: string[];
  revisoes: { itens: number; cartoes: number; cartoes_despublicados: number; fundamentos: number; marcos: number };
  destaques: Destaque[];
};

const ROTULO_TIPO: Record<string, string> = {
  alteracao: 'Dispositivos alterados', revogacao: 'Dispositivos revogados', inclusao: 'Dispositivos novos', norma_revogada: 'Normas revogadas', nova_norma: 'Normas novas na base',
  regulamentacao: 'Regulamentações', aplicacao: 'Novas aplicações', interpretacao: 'Interpretações', fonte_atualizada: 'Portais atualizados', estrutura_suspeita: 'Atualizações seguradas (conferir a página oficial)', reprocessada: 'Textos reprocessados com a leitura nova (não é mudança da lei)',
};
const ORDEM = ['norma_revogada', 'revogacao', 'alteracao', 'inclusao', 'nova_norma', 'regulamentacao', 'aplicacao', 'interpretacao', 'fonte_atualizada', 'estrutura_suspeita', 'reprocessada'];

/** Resumo da revisão semanal para o administrador: o que mudou nas normas, o que apareceu de novo e o que precisa de conferência. */
export function montarEmailRevisaoSemanal(r: ResumoRodada, urlPublica: string) {
  const link = `${urlPublica.replace(/\/$/, '')}/base-legal?aba=novidades`;
  const partes: string[] = [];
  if (r.dispositivos_alterados) partes.push(plural(r.dispositivos_alterados, 'dispositivo alterado', 'dispositivos alterados'));
  if (r.dispositivos_revogados) partes.push(plural(r.dispositivos_revogados, 'revogado', 'revogados'));
  if (r.normas_novas) partes.push(plural(r.normas_novas, 'norma nova', 'normas novas'));
  if (r.atos_relacionados) partes.push(plural(r.atos_relacionados, 'ato relacionado', 'atos relacionados'));
  if (r.fontes_alteradas) partes.push(plural(r.fontes_alteradas, 'portal com novidade', 'portais com novidade'));
  const assunto = `[InTAX] Base de conhecimento legal, revisão da semana ${r.semana}: ${partes.length ? partes.join(', ') : 'sem mudanças'}`.slice(0, 150);

  const porTipo = new Map<string, Destaque[]>();
  for (const d of r.destaques) porTipo.set(d.tipo, [...(porTipo.get(d.tipo) ?? []), d]);
  const tipos = [...porTipo.keys()].sort((a, b) => (ORDEM.indexOf(a) + 100) % 100 - (ORDEM.indexOf(b) + 100) % 100);

  const abertura = `A revisão semanal conferiu ${plural(r.normas_verificadas, 'norma', 'normas')} e ${plural(r.fontes_verificadas, 'portal oficial', 'portais oficiais')}. ${r.normas_atualizadas ? `${plural(r.normas_atualizadas, 'norma teve o texto atualizado', 'normas tiveram o texto atualizado')} (o texto antigo fica no histórico de cada dispositivo).` : 'Nenhum texto oficial mudou desde a última revisão.'}`;
  const secoes = tipos.map((t) => {
    const itens = porTipo.get(t)!;
    const li = itens.slice(0, 15).map((d) => `<li style="margin:0 0 6px"><b>${esc(d.titulo)}</b>${d.resumo ? `<br><span style="font-size:13px;color:#3b4a43">${esc(d.resumo)}</span>` : ''}${d.url ? ` <a href="${esc(d.url)}" style="font-size:13px">fonte</a>` : ''}${d.confirmada === false ? ' <span style="font-size:12px;color:#8a5a00">(a confirmar)</span>' : ''}</li>`).join('');
    return `<h2 style="font-size:15px;margin:16px 0 6px">${esc(ROTULO_TIPO[t] ?? t)} (${itens.length})</h2><ul style="padding-left:18px;margin:0;font-size:14px;line-height:1.5">${li}${itens.length > 15 ? `<li>e mais ${itens.length - 15}.</li>` : ''}</ul>`;
  }).join('');
  const revisao = r.revisoes.itens
    ? `<p style="font-size:14px;line-height:1.6;margin:12px 0">${esc(`Isto devolveu ${plural(r.revisoes.itens, 'item', 'itens')} para a sua revisão: ${plural(r.revisoes.cartoes, 'pergunta frequente', 'perguntas frequentes')}${r.revisoes.cartoes_despublicados ? ` (${r.revisoes.cartoes_despublicados} voltaram para rascunho)` : ''}, ${plural(r.revisoes.fundamentos, 'nota do cálculo', 'notas do cálculo')} e ${plural(r.revisoes.marcos, 'marco da agenda', 'marcos da agenda')}. Nada foi publicado de novo sozinho.`)}</p>`
    : '';
  const notas = r.notas.length ? `<ul style="padding-left:18px;margin:10px 0 0;font-size:13px;color:#3b4a43">${r.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
  const erros = r.erros.length ? `<h2 style="font-size:15px;margin:16px 0 6px;color:#9b1c1c">Não foi possível conferir (${r.erros.length})</h2><ul style="padding-left:18px;margin:0;font-size:13px;line-height:1.5">${r.erros.slice(0, 12).map((e) => `<li>${esc(e)}</li>`).join('')}${r.erros.length > 12 ? `<li>e mais ${r.erros.length - 12}.</li>` : ''}</ul>` : '';
  const corpo = `<p style="font-size:14px;line-height:1.6;margin:0 0 10px">${esc(abertura)}</p>${revisao}${secoes}${notas}${erros}<p style="font-size:14px;margin:18px 0 0"><a href="${esc(link)}" style="color:#1f3a2e;font-weight:bold">Abrir as novidades da base de conhecimento</a></p>`;
  const html = emailLayout('Revisão semanal da base de conhecimento legal', corpo, 'Aviso automático do InTAX ao administrador.');

  const linhas = [abertura];
  if (r.revisoes.itens) linhas.push(`${plural(r.revisoes.itens, 'item voltou', 'itens voltaram')} para revisão.`);
  for (const t of tipos) {
    linhas.push('', `${ROTULO_TIPO[t] ?? t} (${porTipo.get(t)!.length})`);
    for (const d of porTipo.get(t)!.slice(0, 15)) linhas.push(`- ${d.titulo}${d.resumo ? `: ${d.resumo}` : ''}${d.url ? ` ${d.url}` : ''}`);
  }
  if (r.erros.length) linhas.push('', 'Não foi possível conferir:', ...r.erros.slice(0, 12).map((e) => `- ${e}`));
  linhas.push('', `Abrir: ${link}`);
  return { assunto, html, texto: linhas.join('\n') };
}
