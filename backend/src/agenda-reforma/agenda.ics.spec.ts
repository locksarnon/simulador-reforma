import { describe, expect, it } from 'vitest';
import { dobrarLinha, escaparTexto, EventoIcs, gerarIcs } from './agenda.ics';

const agora = new Date('2026-11-10T15:00:00Z');
const evento = (extra: Partial<EventoIcs> = {}): EventoIcs => ({
  chave: 'estoque-apropriacao-2027', titulo: 'Prazo para apurar e apropriar o crédito presumido do estoque (30/06/2027)',
  descricao: 'O crédito presumido deve ser apurado e apropriado até o último dia de junho de 2027.', data: '2027-06-30', data_fim: null,
  categoria: 'Crédito presumido do estoque', confirmado: true, fontes: ['Lei Complementar nº 214, de 16 de janeiro de 2025, art. 381, § 4º, I — https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm'],
  url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm', atualizadoEm: new Date('2026-11-01T10:00:00Z'), ...extra,
});

/** Desfaz a continuação de linhas (CRLF + espaço) para ler o conteúdo de verdade. */
const desdobrar = (ics: string) => ics.replace(/\r\n /g, '');
const linhas = (ics: string) => desdobrar(ics).split('\r\n').filter(Boolean);

describe('exportação em .ics', () => {
  it('monta um calendário válido: cabeçalho, eventos de dia inteiro e fim de linha CRLF', () => {
    const ics = gerarIcs([evento()], { nome: 'Agenda da Reforma Tributária (InTAX)', agora, dominio: 'simulador.clarityib.com.br' });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false); // nenhuma quebra de linha solta
    const l = linhas(ics);
    expect(l).toContain('PRODID:-//FAL Agro//InTAX Agenda da Reforma//PT-BR');
    expect(l).toContain('X-WR-CALNAME:Agenda da Reforma Tributária (InTAX)');
    expect(l).toContain('UID:estoque-apropriacao-2027@simulador.clarityib.com.br');
    expect(l).toContain('DTSTAMP:20261110T150000Z');
    expect(l).toContain('LAST-MODIFIED:20261101T100000Z');
    expect(l).toContain('DTSTART;VALUE=DATE:20270630');
    expect(l).toContain('DTEND;VALUE=DATE:20270701'); // o fim de um evento de dia inteiro é exclusivo
    expect(l).toContain('STATUS:CONFIRMED');
    expect(l).toContain('TRANSP:TRANSPARENT');
    expect(l).toContain('CATEGORIES:Reforma Tributária,Crédito presumido do estoque');
    expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(1);
  });

  it('período: o evento cobre do primeiro ao último dia, e o DTEND é o dia seguinte (inclusive na virada de mês e de ano)', () => {
    const l = linhas(gerarIcs([evento({ data: '2026-11-03', data_fim: '2026-12-20' }), evento({ chave: 'b', data: '2026-01-01', data_fim: '2026-12-31' })], { nome: 'x', agora }));
    expect(l).toContain('DTEND;VALUE=DATE:20261221');
    expect(l).toContain('DTEND;VALUE=DATE:20270101');
  });

  it('cita a fonte oficial na descrição e escapa vírgula, ponto e vírgula e quebra de linha', () => {
    const ics = gerarIcs([evento({ descricao: 'Primeira linha, com vírgula; e ponto e vírgula\nSegunda linha com \\ barra.' })], { nome: 'x', agora });
    const descricao = linhas(ics).find((x) => x.startsWith('DESCRIPTION:')) as string;
    expect(descricao).toContain('Primeira linha\\, com vírgula\\; e ponto e vírgula\\nSegunda linha com \\\\ barra.');
    expect(descricao).toContain('Fonte oficial:\\nLei Complementar nº 214\\, de 16 de janeiro de 2025\\, art. 381\\, § 4º\\, I');
    expect(descricao).not.toContain('Não confirmado');
  });

  it('data não confirmada vai como provisória e avisa, na descrição e no título', () => {
    const l = linhas(gerarIcs([evento({ confirmado: false })], { nome: 'x', agora }));
    expect(l).toContain('STATUS:TENTATIVE');
    expect(l.find((x) => x.startsWith('SUMMARY:'))).toMatch(/^SUMMARY:\[Não confirmado\] Prazo para apurar/);
    expect(l.find((x) => x.startsWith('DESCRIPTION:'))).toContain('Não confirmado em fonte oficial');
  });

  it('fonte em revisão: provisório, com o aviso', () => {
    const l = linhas(gerarIcs([evento({ aviso: 'Fonte em revisão: Art. 381 (LC 214/2025) alterado em 12/11/2026.' })], { nome: 'x', agora }));
    expect(l).toContain('STATUS:TENTATIVE');
    expect(l.find((x) => x.startsWith('SUMMARY:'))).toMatch(/^SUMMARY:\[Em revisão\] /);
    expect(l.find((x) => x.startsWith('DESCRIPTION:'))).toContain('Fonte em revisão: Art. 381');
  });

  it('nenhuma linha passa de 75 octetos, mesmo com acentos, e o conteúdo se reconstrói inteiro', () => {
    const longo = 'Ação ' + 'obrigatória de emissão do documento fiscal eletrônico com IBS e CBS — ação à vista, às 17h; é preciso conferir. '.repeat(8);
    const ics = gerarIcs([evento({ descricao: longo })], { nome: 'x', agora });
    for (const fisica of ics.split('\r\n')) expect(Buffer.byteLength(fisica, 'utf8')).toBeLessThanOrEqual(75);
    const descricao = linhas(ics).find((x) => x.startsWith('DESCRIPTION:')) as string;
    expect(descricao).toContain(escaparTexto(longo));
  });

  it('dobrar uma linha curta não mexe nela; a continuação não parte caractere de dois octetos', () => {
    expect(dobrarLinha('SUMMARY:curto')).toBe('SUMMARY:curto');
    const dobrada = dobrarLinha(`SUMMARY:${'ã'.repeat(60)}`);
    expect(dobrada).toContain('\r\n ');
    expect(dobrada.replace(/\r\n /g, '')).toBe(`SUMMARY:${'ã'.repeat(60)}`);
  });

  it('ignora evento com data inválida, sem quebrar o arquivo', () => {
    const l = linhas(gerarIcs([evento({ data: '2027-13-40' }), evento({ chave: 'ok' })], { nome: 'x', agora }));
    expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(l).toContain('UID:ok@intax.local');
  });

  it('sem eventos ainda é um calendário válido', () => {
    expect(gerarIcs([], { nome: 'Vazio', agora })).toBe('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//FAL Agro//InTAX Agenda da Reforma//PT-BR\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Vazio\r\nEND:VCALENDAR\r\n');
  });
});
