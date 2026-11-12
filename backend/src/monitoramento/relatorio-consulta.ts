import ExcelJS from 'exceljs';
import { PdfService, SecaoPdf } from '../pdf/pdf.service';
import { Coluna, Resumo, tabelaGenerica } from './interpretar';

export type ConsultaParaRelatorio = {
  id: string; chave: string; sistema: string; servico: string; createdAt: Date; solicitado_por: string | null; simulado: boolean;
  sucesso: boolean; nivel: string; resumo: unknown; dados: unknown; mensagens: unknown; arquivos: unknown; parametros: unknown;
};
type Cliente = { nome: string; documento: string };

const NIVEL: Record<string, string> = { CRITICO: 'Crítico', ATENCAO: 'Atenção', OK: 'Em dia', INFO: 'Informativo' };
const quando = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const fmtDoc = (d: string) => (d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'));

/** Valor da célula como texto legível (datas e competências do Serpro, moeda). */
export function celula(v: unknown, tipo?: Coluna['tipo']): string {
  if (v === null || v === undefined || v === '') return '';
  if (tipo === 'moeda' && typeof v === 'number') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const s = String(v);
  if (tipo === 'periodo' && /^\d{6}$/.test(s)) return `${s.slice(4)}/${s.slice(0, 4)}`;
  if (/^\d{8}$/.test(s) && (tipo === 'data' || tipo === 'periodo')) return `${s.slice(6)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  if (/^\d{14}$/.test(s) && tipo === 'data') return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) { const [a, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}/${a}${s.length > 10 && s.slice(11, 16) !== '00:00' ? ` ${s.slice(11, 16)}` : ''}`; }
  return s;
}

/** A tabela da consulta: a que o InTAX já interpretou ou, se não houver, a lida direto dos dados do Serpro. */
export function tabelaDaConsulta(c: ConsultaParaRelatorio) {
  const r = (c.resumo ?? {}) as Resumo;
  if (r.tabela?.colunas?.length) return r.tabela;
  return tabelaGenerica(c.dados);
}

export async function pdfDaConsulta(pdf: PdfService, c: ConsultaParaRelatorio, rotulo: string, cliente: Cliente) {
  const r = (c.resumo ?? {}) as Resumo;
  const t = tabelaDaConsulta(c);
  const arquivos = Array.isArray(c.arquivos) ? (c.arquivos as { nome: string }[]) : [];
  const mensagens = Array.isArray(c.mensagens) ? (c.mensagens as { codigo?: string; texto?: string }[]).filter((m) => m?.texto) : [];
  const params = Object.entries((c.parametros ?? {}) as Record<string, string>).filter(([, v]) => v);
  const secoes: SecaoPdf[] = [
    {
      titulo: 'Resultado',
      paragrafos: [r.titulo || (c.sucesso ? 'Consulta feita.' : 'O Serpro não trouxe o resultado.')],
      ...(r.destaques?.length ? { tabela: { cabecalho: ['Informação', 'Valor'], larguras: [0.35, 0.65], linhas: r.destaques.map((d) => [d.rotulo, d.valor]) } } : {}),
    },
  ];
  if (t?.colunas.length) {
    const cols = t.colunas.slice(0, 6);
    secoes.push({ titulo: `Detalhe (${t.linhas.length} registro${t.linhas.length === 1 ? '' : 's'}${t.colunas.length > 6 ? '; todas as colunas no Excel' : ''})`, tabela: { cabecalho: cols.map((x) => x.rotulo), linhas: t.linhas.slice(0, 200).map((l) => cols.map((x) => celula(l[x.chave], x.tipo))) } });
  }
  if (arquivos.length) secoes.push({ titulo: 'Documentos oficiais desta consulta', itens: arquivos.map((a) => `${a.nome} (PDF do Serpro/Receita, baixe na tela do monitoramento)`) });
  if (mensagens.length) secoes.push({ titulo: 'Mensagens do Serpro', itens: mensagens.map((m) => `${m.codigo ? `${m.codigo}: ` : ''}${m.texto}`) });
  secoes.push({
    titulo: 'Origem',
    paragrafos: [
      `Consulta ao Integra Contador (Serpro), sistema ${c.sistema}, serviço ${c.servico}${params.length ? `, com ${params.map(([k, v]) => `${k} = ${v}`).join(', ')}` : ''}.`,
      `Feita em ${quando(c.createdAt)}${c.solicitado_por ? ` por ${c.solicitado_por}` : ''}. Situação: ${NIVEL[c.nivel] ?? c.nivel}.`,
    ],
  });
  return pdf.gerar({
    marca: 'Monitoramento fiscal',
    titulo: rotulo,
    subtitulo: `${cliente.nome} · ${fmtDoc(cliente.documento)} · ${quando(c.createdAt)}`,
    secoes,
    aviso: c.simulado ? 'Consulta do ambiente de demonstração do Serpro: dados fictícios, iguais para todos os clientes.' : 'Relatório gerado pelo InTAX com o retorno oficial do Integra Contador (Serpro) na data da consulta.',
  });
}

export async function excelDaConsulta(c: ConsultaParaRelatorio, rotulo: string, cliente: Cliente): Promise<Buffer> {
  const r = (c.resumo ?? {}) as Resumo;
  const t = tabelaDaConsulta(c);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'InTAX';
  const capa = wb.addWorksheet('Resumo');
  capa.columns = [{ width: 32 }, { width: 70 }];
  const linhas: [string, string][] = [
    ['Consulta', rotulo], ['Cliente', `${cliente.nome} (${fmtDoc(cliente.documento)})`], ['Data', quando(c.createdAt)], ['Feita por', c.solicitado_por ?? ''],
    ['Resultado', r.titulo ?? ''], ['Situação', NIVEL[c.nivel] ?? c.nivel], ['Origem', `Integra Contador (Serpro) · ${c.sistema} · ${c.servico}`],
    ...(c.simulado ? [['Atenção', 'Ambiente de demonstração: dados fictícios'] as [string, string]] : []),
    ...((r.destaques ?? []).map((d) => [d.rotulo, d.valor] as [string, string])),
  ];
  linhas.forEach((l) => capa.addRow(l));
  capa.getColumn(1).font = { bold: true };
  if (t?.colunas.length) {
    const ws = wb.addWorksheet('Detalhe');
    ws.columns = t.colunas.map((x) => ({ header: x.rotulo, key: x.chave, width: Math.min(45, Math.max(12, x.rotulo.length + 4)) }));
    for (const l of t.linhas) ws.addRow(Object.fromEntries(t.colunas.map((x) => [x.chave, x.tipo === 'moeda' && typeof l[x.chave] === 'number' ? l[x.chave] : celula(l[x.chave], x.tipo)])));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.colunas.length } };
    t.colunas.forEach((x, i) => { if (x.tipo === 'moeda') ws.getColumn(i + 1).numFmt = '"R$" #,##0.00'; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
