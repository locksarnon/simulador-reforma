/** Nomes dos arquivos entregues: sem acento nem espaço, com o cliente e a versão; sem versão (base atual), a data de hoje em São Paulo. */
import { dataDoArquivo } from './formato';

/** Nome de arquivo seguro (ASCII, sem espaços): o cliente vira "agropecuaria-crestani-ltda". */
export function fatiaDoNome(texto: string): string {
  const s = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'cliente';
}

/** Nomes dos arquivos: cliente e versão; sem versão (base atual), a data de hoje em São Paulo (dd-mm-aaaa). */
export function nomeDoExcel(cliente: string, versao: { numero: number } | null, hoje: Date = new Date()): string {
  const base = `saneamento-estoques_${fatiaDoNome(cliente)}`;
  return versao ? `${base}_entrega-v${versao.numero}.xlsx` : `${base}_revisao_${dataDoArquivo(hoje)}.xlsx`;
}
export const nomeDoRelatorio = (cliente: string, versao: { numero: number }) => `relatorio-fechamento_${fatiaDoNome(cliente)}_v${versao.numero}.pdf`;
export function nomeDaPolitica(cliente: string, versao: { numero: number } | null, hoje: Date = new Date()): string {
  return `politica-estoques_${fatiaDoNome(cliente)}_${versao ? `v${versao.numero}` : `revisao_${dataDoArquivo(hoje)}`}.pdf`;
}
export const nomeDoMapa = (cliente: string, hoje: Date = new Date()) => `unificacoes-e-inativacoes_${fatiaDoNome(cliente)}_${dataDoArquivo(hoje)}.xlsx`;
