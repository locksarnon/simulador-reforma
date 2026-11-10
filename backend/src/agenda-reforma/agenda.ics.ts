/**
 * Exportação da Agenda da Reforma em iCalendar (.ics, RFC 5545): um evento de dia inteiro por marco, com a fonte oficial
 * na descrição. O UID é estável (chave do marco), então importar de novo atualiza os eventos em vez de duplicá-los.
 */
import { lerDataIso, somarDias } from './agenda.regras';

export type EventoIcs = {
  chave: string;
  titulo: string;
  descricao: string;
  /** "YYYY-MM-DD" */
  data: string;
  /** "YYYY-MM-DD"; quando há, o evento cobre o período inteiro. */
  data_fim?: string | null;
  categoria: string;
  confirmado: boolean;
  /** Fontes em uma linha cada: "Instrumento, dispositivo (data) — url". */
  fontes: string[];
  url?: string | null;
  atualizadoEm: Date;
  /** Texto do aviso quando a fonte do marco mudou e a revisão está pendente. */
  aviso?: string | null;
};

const CRLF = '\r\n';
const compacta = (iso: string) => iso.replace(/-/g, '');
const carimbo = (d: Date) => `${d.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;

/** Escape de TEXT (RFC 5545, 3.3.11): barra invertida, ponto e vírgula, vírgula e quebra de linha. */
export const escaparTexto = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Linhas de no máximo 75 octetos (UTF-8), continuadas por CRLF + espaço, sem partir um caractere no meio. */
export function dobrarLinha(linha: string): string {
  if (Buffer.byteLength(linha, 'utf8') <= 75) return linha;
  const partes: string[] = [];
  let atual = '';
  let octetos = 0;
  let limite = 75;
  for (const ch of linha) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (octetos + n > limite) {
      partes.push(atual);
      atual = '';
      octetos = 0;
      limite = 74; // o espaço da continuação conta como 1 octeto
    }
    atual += ch;
    octetos += n;
  }
  if (atual) partes.push(atual);
  return partes.join(`${CRLF} `);
}

function eventoParaLinhas(e: EventoIcs, agora: Date, dominio: string): string[] {
  const inicio = lerDataIso(e.data);
  if (!inicio) return [];
  const fimIso = e.data_fim && lerDataIso(e.data_fim) ? e.data_fim : e.data;
  const fim = somarDias(lerDataIso(fimIso) as Date, 1); // DTEND de dia inteiro é exclusivo
  const descricao = [
    e.descricao,
    ...(e.fontes.length ? ['', e.fontes.length === 1 ? 'Fonte oficial:' : 'Fontes oficiais:', ...e.fontes] : []),
    ...(e.confirmado ? [] : ['', 'Não confirmado em fonte oficial: confira a data antes de agir.']),
    ...(e.aviso ? ['', e.aviso] : []),
  ].join('\n');
  const linhas = [
    'BEGIN:VEVENT',
    `UID:${e.chave}@${dominio}`,
    `DTSTAMP:${carimbo(agora)}`,
    `LAST-MODIFIED:${carimbo(e.atualizadoEm)}`,
    `DTSTART;VALUE=DATE:${compacta(e.data)}`,
    `DTEND;VALUE=DATE:${compacta(fim.toISOString().slice(0, 10))}`,
    `SUMMARY:${escaparTexto(`${e.confirmado && !e.aviso ? '' : e.confirmado ? '[Em revisão] ' : '[Não confirmado] '}${e.titulo}`)}`,
    `DESCRIPTION:${escaparTexto(descricao)}`,
    `CATEGORIES:${escaparTexto('Reforma Tributária')},${escaparTexto(e.categoria)}`,
    ...(e.url ? [`URL:${e.url}`] : []),
    `STATUS:${e.confirmado && !e.aviso ? 'CONFIRMED' : 'TENTATIVE'}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
  return linhas;
}

/** Monta o arquivo .ics com todos os eventos. `agora` e `dominio` existem para o teste ser determinístico. */
export function gerarIcs(eventos: EventoIcs[], opcoes: { nome: string; descricao?: string; agora?: Date; dominio?: string }): string {
  const agora = opcoes.agora ?? new Date();
  const dominio = opcoes.dominio ?? 'intax.local';
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FAL Agro//InTAX Agenda da Reforma//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparTexto(opcoes.nome)}`,
    ...(opcoes.descricao ? [`X-WR-CALDESC:${escaparTexto(opcoes.descricao)}`] : []),
    ...eventos.flatMap((e) => eventoParaLinhas(e, agora, dominio)),
    'END:VCALENDAR',
  ];
  return `${linhas.map(dobrarLinha).join(CRLF)}${CRLF}`;
}
