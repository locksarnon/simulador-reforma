import { Injectable } from '@nestjs/common';
import { ContratoIntegraService } from '../monitoramento/contrato.service';
import type { Modo } from '../monitoramento/integra.cliente';
import type { StatusProcesso } from './leitor-certidoes';

/**
 * APIs do Serpro para a pré-análise (documentação em apicenter.estaleiro.serpro.gov.br, conferida em 12/11/2026):
 * - Consulta CND: certidão federal conjunta RFB/PGFN (POST /consulta-cnd/v1/certidao);
 * - Consulta Dívida Ativa: inscrições na Dívida Ativa da União (GET /consulta-divida-ativa/api/v1/devedor/{ni}).
 * Token OAuth client_credentials em /token com as chaves do contrato de cada produto (sem certificado). No modo demonstração,
 * o ambiente trial oficial só responde aos documentos de teste da documentação: o resultado é fictício e fica marcado.
 */
export const GATEWAY = 'https://gateway.apiserpro.serpro.gov.br';
export const BEARER_TRIAL = '06aef429-a981-3ec5-a1f8-71d38d86481e';
const CNPJ_TESTE_CND = '00000000000001';
const CNPJ_TESTE_DIVIDA = '01415666000181';

export type ResultadoSerpro = { status: StatusProcesso; resumo: string; detalhes: { rotulo: string; valor: string }[]; demonstracao: boolean; pdf?: Buffer };
type Produto = 'cnd' | 'dividaAtiva';

const dataBr = (s: unknown) => { const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s ?? ''); };
const valor = (s: unknown) => Number(String(s ?? '').replace(/\./g, '').replace(',', '.')) || 0;
const moeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class SerproCertidoes {
  private tokens = new Map<string, { token: string; expira: number }>();
  fetchImpl: typeof fetch = (...a) => fetch(...a);
  pausaMs = 600;

  constructor(private readonly contrato: ContratoIntegraService) {}

  /** Bearer do produto: trial na demonstração; na produção, token pelas chaves do produto. null = sem como consultar. */
  private async bearer(produto: Produto, modo: Modo): Promise<{ token: string; demo: boolean } | null> {
    if (modo === 'DEMONSTRACAO') return { token: BEARER_TRIAL, demo: true };
    if (modo !== 'PRODUCAO') return null;
    const ch = await this.contrato.chavesDoProduto(produto);
    if (!ch) return null;
    const k = `${produto}:${ch.key}`;
    const t = this.tokens.get(k);
    if (t && t.expira > Date.now() + 60_000) return { token: t.token, demo: false };
    const r = await this.fetchImpl(`${GATEWAY}/token`, {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${ch.key}:${ch.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials', signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(r.status === 401 ? 'o Serpro recusou as chaves deste produto (confira em Administração > Integrações)' : `o Serpro não deu o acesso (HTTP ${r.status})`);
    const j = (await r.json()) as { access_token: string; expires_in?: number };
    this.tokens.set(k, { token: j.access_token, expira: Date.now() + (j.expires_in ?? 3000) * 1000 });
    return { token: j.access_token, demo: false };
  }

  /** Certidão federal conjunta (RFB/PGFN) pela API Consulta CND; null quando o produto não está disponível no modo atual. */
  async certidaoFederal(cnpj: string, modo: Modo): Promise<ResultadoSerpro | null> {
    const b = await this.bearer('cnd', modo);
    if (!b) return null;
    const url = `${GATEWAY}/${b.demo ? 'consulta-cnd-trial' : 'consulta-cnd'}/v1/certidao`;
    const doc = b.demo ? CNPJ_TESTE_CND : cnpj;
    let chave: string | undefined;
    let j: { Status?: number; Mensagem?: string; Chave?: string; Certidao?: Record<string, unknown> } = {};
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const r = await this.fetchImpl(url, {
        method: 'POST', headers: { Authorization: `Bearer ${b.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ TipoContribuinte: 1, ContribuinteConsulta: doc, CodigoIdentificacao: '9001', GerarCertidaoPdf: true, ...(chave ? { Chave: chave } : {}) }),
        signal: AbortSignal.timeout(60_000),
      });
      j = (await r.json().catch(() => ({}))) as typeof j;
      if (j.Status === 7 && j.Chave) { chave = j.Chave; await esperar(this.pausaMs); continue; }
      if (j.Status === 5 && tentativa < 2) { await esperar(this.pausaMs); continue; }
      break;
    }
    const c = j.Certidao ?? {};
    const demonstracao = b.demo;
    const det = (extra: { rotulo: string; valor: string }[] = []) => [{ rotulo: 'Retorno do Serpro', valor: `${j.Status ?? '—'}: ${j.Mensagem ?? 'sem mensagem'}` }, ...extra, ...(demonstracao ? [{ rotulo: 'Documento consultado', valor: `${doc} (teste do ambiente de demonstração)` }] : [])];
    if (j.Status === 1 || j.Status === 2) {
      const tipo = Number(c.TipoCertidao) === 2 ? 'Positiva com efeitos de negativa' : 'Negativa';
      const pdf = typeof c.DocumentoPdf === 'string' && c.DocumentoPdf.length > 40 ? Buffer.from(c.DocumentoPdf, 'base64') : undefined;
      return {
        status: 'CONCLUIDO', resumo: `Certidão ${tipo.toLowerCase()} de débitos federais e Dívida Ativa da União, válida até ${dataBr(c.DataValidade)}.`, demonstracao, pdf,
        detalhes: det([{ rotulo: 'Situação', valor: tipo }, { rotulo: 'Emissão', valor: dataBr(c.DataEmissao) }, { rotulo: 'Validade', valor: dataBr(c.DataValidade) }, { rotulo: 'Código de controle', valor: String(c.CodigoControle ?? '') }]),
      };
    }
    if (j.Status === 3) return { status: 'DEBITOS', resumo: 'A certidão não foi emitida: há pendências na Receita Federal ou na PGFN. Veja o relatório de situação fiscal (Monitoramento fiscal) ou o e-CAC.', detalhes: det(), demonstracao };
    if (j.Status === 4) return { status: 'IRREGULAR', resumo: 'A certidão não foi emitida por situação cadastral impeditiva do CNPJ.', detalhes: det(), demonstracao };
    if (j.Status === 8) return { status: 'IRREGULAR', resumo: 'CNPJ não cadastrado na Receita Federal.', detalhes: det(), demonstracao };
    return { status: 'INDISPONIVEL', resumo: `O Serpro não concluiu a consulta agora (${j.Mensagem ?? `status ${j.Status ?? 'desconhecido'}`}). Use "Consultar de novo" em alguns minutos.`, detalhes: det(), demonstracao };
  }

  /** Inscrições em Dívida Ativa da União pela API Consulta Dívida Ativa; null quando não está disponível no modo atual. */
  async dividaAtiva(cnpj: string, modo: Modo): Promise<ResultadoSerpro | null> {
    const b = await this.bearer('dividaAtiva', modo);
    if (!b) return null;
    const doc = b.demo ? CNPJ_TESTE_DIVIDA : cnpj;
    const r = await this.fetchImpl(`${GATEWAY}/${b.demo ? 'consulta-divida-ativa-trial' : 'consulta-divida-ativa'}/api/v1/devedor/${doc}`, {
      headers: { Authorization: `Bearer ${b.token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(60_000),
    });
    const demonstracao = b.demo;
    const marca = demonstracao ? [{ rotulo: 'Documento consultado', valor: `${doc} (teste do ambiente de demonstração)` }] : [];
    if (r.status === 404) return { status: 'CONCLUIDO', resumo: 'Nenhuma inscrição em Dívida Ativa da União.', detalhes: marca, demonstracao };
    if (!r.ok) return { status: 'INDISPONIVEL', resumo: `O Serpro não concluiu a consulta (HTTP ${r.status}). Use "Consultar de novo" em alguns minutos.`, detalhes: marca, demonstracao };
    const lista = ((await r.json().catch(() => [])) as Record<string, unknown>[]) ?? [];
    const ativas = lista.filter((x) => /^ATIVA/i.test(String(x.situacaoDescricao ?? '')));
    const total = ativas.reduce((s, x) => s + valor(x.valorTotalConsolidadoMoeda), 0);
    const detalhes = [
      ...lista.map((x) => ({ rotulo: `Inscrição ${x.numeroInscricao}`, valor: `${x.situacaoDescricao ?? ''}${x.valorTotalConsolidadoMoeda ? `; ${moeda(valor(x.valorTotalConsolidadoMoeda))}` : ''}${x.tipoDevedor ? `; devedor ${String(x.tipoDevedor).toLowerCase()}` : ''}${x.nomeUnidade ? `; ${x.nomeUnidade}` : ''}` })),
      ...marca,
    ];
    if (ativas.length) return { status: 'DEBITOS', resumo: `${ativas.length} inscrição(ões) ativa(s) em Dívida Ativa da União, total consolidado ${moeda(total)}.`, detalhes, demonstracao };
    return { status: 'CONCLUIDO', resumo: lista.length ? `Nenhuma inscrição ativa; ${lista.length} inscrição(ões) extinta(s) ou encerrada(s).` : 'Nenhuma inscrição em Dívida Ativa da União.', detalhes, demonstracao };
  }
}
