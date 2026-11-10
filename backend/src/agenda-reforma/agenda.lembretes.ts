/**
 * Lembretes por e-mail da Agenda da Reforma: quais marcos entram no aviso de hoje e como o e-mail é montado.
 * Só marcos com a data confirmada em fonte oficial geram lembrete.
 */
import { emailLayout, esc } from '../mail/mail.service';
import { dataAlvo, dataBr, diasEntre, MarcoBase, quandoEmPalavras } from './agenda.regras';

/** Avisos padrão: 30 dias, 7 dias e 1 dia antes. */
export const DIAS_PADRAO = [30, 7, 1];
/** Antecedências que o usuário pode escolher (0 = no próprio dia). */
export const DIAS_PERMITIDOS = [60, 30, 15, 7, 3, 1, 0];

/** Mantém só as antecedências permitidas, sem repetir, da maior para a menor; vazio volta ao padrão. */
export function normalizarDias(v: unknown): number[] {
  const lista = Array.isArray(v) ? v.map(Number).filter((n) => DIAS_PERMITIDOS.includes(n)) : [];
  const unicos = [...new Set(lista)].sort((a, b) => b - a);
  return unicos.length ? unicos : [...DIAS_PADRAO];
}

export type ItemLembrete<T> = { marco: T; diasAntes: number };

/** Marcos confirmados cuja data (último dia do prazo ou início da vigência) está exatamente a N dias, para cada N escolhido. */
export function lembretesDoDia<T extends MarcoBase & { confirmado: boolean }>(marcos: T[], hoje: Date, dias: number[]): ItemLembrete<T>[] {
  const saida: ItemLembrete<T>[] = [];
  for (const marco of marcos) {
    if (!marco.confirmado) continue;
    const falta = diasEntre(hoje, dataAlvo(marco));
    if (dias.includes(falta)) saida.push({ marco, diasAntes: falta });
  }
  return saida.sort((a, b) => a.diasAntes - b.diasAntes || a.marco.titulo.localeCompare(b.marco.titulo, 'pt-BR'));
}

export type MarcoParaEmail = MarcoBase & {
  descricao: string;
  /** "Instrumento, dispositivo" de cada fonte. */
  fontes: string[];
  /** Quando a fonte mudou e a revisão está pendente. */
  aviso?: string | null;
};

const LIMITE_EMPRESAS = 8;

function empresasEmTexto(nomes: string[] | undefined): string {
  if (!nomes?.length) return '';
  const mostradas = nomes.slice(0, LIMITE_EMPRESAS).join(', ');
  return nomes.length > LIMITE_EMPRESAS ? `${mostradas} e mais ${nomes.length - LIMITE_EMPRESAS}` : mostradas;
}

/** E-mail único com todos os marcos do dia para uma pessoa; `empresas` lista, por marco, as empresas cadastradas a que ele se aplica. */
export function montarEmailLembrete(
  itens: ItemLembrete<MarcoParaEmail>[],
  hoje: Date,
  opcoes: { urlPublica: string; teste?: boolean; escopo?: string; empresas?: Map<string, string[]> },
) {
  const link = `${opcoes.urlPublica.replace(/\/$/, '')}/agenda-reforma`;
  const prefixo = opcoes.teste ? '[TESTE] ' : '';
  const assunto = `${prefixo}[InTAX] Agenda da Reforma: ${itens.length === 1 ? '1 data' : `${itens.length} datas`} para acompanhar`.slice(0, 150);
  const dataDe = (i: ItemLembrete<MarcoParaEmail>) => dataAlvo(i.marco);
  const rotuloData = (i: ItemLembrete<MarcoParaEmail>) => {
    const m = i.marco;
    return m.tipo === 'prazo' && m.data_fim ? `até ${dataBr(m.data_fim)}` : dataBr(m.data);
  };

  const blocos = itens.map((i) => {
    const m = i.marco;
    const empresas = empresasEmTexto(opcoes.empresas?.get(m.id));
    return `<div style="border:1px solid #dfe5e0;border-radius:6px;padding:14px;margin:0 0 12px">
<div style="font-size:11px;font-weight:bold;color:#1f3a2e;text-transform:uppercase">${esc(m.categoria)} · ${esc(m.tipo === 'prazo' ? 'prazo' : 'marco')}</div>
<div style="font-size:15px;font-weight:bold;margin:4px 0">${esc(m.titulo)}</div>
<div style="font-size:13px;margin:0 0 6px"><b>${esc(rotuloData(i))}</b> (${esc(quandoEmPalavras(diasEntre(hoje, dataDe(i))))})</div>
<div style="font-size:13px;line-height:1.5">${esc(m.descricao)}</div>
<div style="font-size:12px;color:#5b6b63;margin-top:6px"><b>Fonte oficial:</b> ${esc(m.fontes.join('; '))}</div>
${empresas ? `<div style="font-size:12px;margin-top:6px"><b>Empresas cadastradas a que se aplica:</b> ${esc(empresas)}</div>` : ''}
${m.aviso ? `<div style="font-size:12px;margin-top:6px;background:#fff4d6;padding:6px;border-radius:4px">${esc(m.aviso)}</div>` : ''}
</div>`;
  }).join('');

  const rodape = `Você recebe este lembrete porque ativou os lembretes da Agenda da Reforma${opcoes.escopo ? ` (${esc(opcoes.escopo)})` : ''}. Para parar, desative em <a href="${esc(link)}" style="color:#1f3a2e">Agenda da Reforma</a>.`;
  const html = emailLayout('Agenda da Reforma Tributária', `${opcoes.teste ? '<p style="font-size:13px;color:#a86a00"><b>Mensagem de teste:</b> mostra as próximas datas da sua agenda.</p>' : ''}${blocos}<p style="font-size:14px;margin:14px 0 0"><a href="${esc(link)}" style="color:#1f3a2e;font-weight:bold">Abrir a agenda completa</a></p>`, rodape);

  const blocosTexto = itens.map((i) => {
    const m = i.marco;
    const empresas = empresasEmTexto(opcoes.empresas?.get(m.id));
    return [
      `${m.titulo} [${m.categoria}]`,
      `${rotuloData(i)} (${quandoEmPalavras(diasEntre(hoje, dataDe(i)))})`,
      m.descricao,
      `Fonte oficial: ${m.fontes.join('; ')}`,
      ...(empresas ? [`Empresas cadastradas a que se aplica: ${empresas}`] : []),
      ...(m.aviso ? [m.aviso] : []),
    ].join('\n');
  });
  const texto = [
    ...(opcoes.teste ? ['Mensagem de teste: mostra as próximas datas da sua agenda.', ''] : []),
    blocosTexto.join('\n\n'),
    '',
    `Agenda completa: ${link}`,
  ].join('\n');

  return { assunto, html, texto };
}
