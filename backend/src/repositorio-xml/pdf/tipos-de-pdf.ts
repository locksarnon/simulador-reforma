/**
 * Quais documentos do repositório têm PDF e qual gerador cada um usa. O tipo e o modelo (que vêm da chave de acesso) dizem o
 * documento auxiliar: DANFE (NF-e 55), DANFE NFC-e (65), DACTE (CT-e 57), DAMDFE (MDF-e 58) e DANFSe (NFS-e Nacional).
 * Evento, CT-e OS (67) e documentos que são só resumo não têm PDF: ficam só em XML.
 */
import { gerarDacte } from './dacte';
import { gerarDamdfe } from './damdfe';
import { gerarDanfe } from './danfe';
import { gerarDanfeNfce } from './danfe-nfce';
import { gerarDanfse } from './danfse';
import { OpcoesPdf } from './pintor';

export interface TipoDePdf {
  /** Nome do documento auxiliar (para mensagens e para o arquivo de falhas do ZIP). */
  nome: string;
  /** Pasta do ZIP (dentro de PDF/), no mesmo espírito da pasta do XML. */
  pasta: string;
  /** Início do nome do arquivo: `<prefixo>-<chave>.pdf`. */
  prefixo: string;
  gerar: (xml: string, opcoes: OpcoesPdf) => Promise<Buffer>;
}

const DANFE: TipoDePdf = { nome: 'DANFE', pasta: 'NFE', prefixo: 'DANFE', gerar: gerarDanfe };
const DANFE_NFCE: TipoDePdf = { nome: 'DANFE NFC-e', pasta: 'NFCE', prefixo: 'DANFE-NFCE', gerar: gerarDanfeNfce };
const DACTE: TipoDePdf = { nome: 'DACTE', pasta: 'CTE', prefixo: 'DACTE', gerar: gerarDacte };
const DAMDFE: TipoDePdf = { nome: 'DAMDFE', pasta: 'MDFE', prefixo: 'DAMDFE', gerar: gerarDamdfe };
const DANFSE: TipoDePdf = { nome: 'DANFSe', pasta: 'NFSE', prefixo: 'DANFSE', gerar: gerarDanfse };

/** O gerador de PDF do documento, ou `null` quando o tipo não tem PDF. */
export function tipoDePdf(d: { tipo: string; modelo: string | null }): TipoDePdf | null {
  if (d.tipo === 'NFE' && d.modelo === '55') return DANFE;
  if (d.tipo === 'NFE' && d.modelo === '65') return DANFE_NFCE;
  if (d.tipo === 'CTE' && d.modelo === '57') return DACTE;
  if (d.tipo === 'MDFE' && d.modelo === '58') return DAMDFE;
  if (d.tipo === 'NFSE') return DANFSE;
  return null;
}

/** O PDF só sai quando o XML completo está guardado e o tipo tem gerador. */
export function geraPdf(d: { tipo: string; modelo: string | null; conteudo: string }): boolean {
  return d.conteudo === 'COMPLETO' && tipoDePdf(d) !== null;
}
