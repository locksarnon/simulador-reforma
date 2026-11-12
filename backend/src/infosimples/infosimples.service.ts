import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CofreService } from '../certificados/cofre.service';
import { plural } from '../common/plural';

type Usuario = { email?: string; role?: string } | undefined;
const ID = 'infosimples';
const CONTEXTO = 'integracao:infosimples';
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');
export const URL_INFOSIMPLES = 'https://api.infosimples.com/api/v2/consultas';

/** Status da certidão, no mesmo vocabulário da pré-análise. */
export type ResultadoCertidao = {
  status: 'CONCLUIDO' | 'DEBITOS' | 'IRREGULAR' | 'INDISPONIVEL';
  situacao: string;
  resumo: string;
  emissao: string | null;
  validade: string | null;
  numero: string | null;
  detalhes: { rotulo: string; valor: string }[];
  comprovante: { buffer: Buffer; tipo: string; extensao: string } | null;
};

type RespostaInfosimples = { code?: number; code_message?: string; data?: Record<string, unknown>[]; errors?: string[]; site_receipts?: string[] };
const txt = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? '' : String(v).trim());

/** CNDT (TST): emitida negativa (ou positiva com efeito de negativa) = regular; "consta" = débitos. */
export function lerCndt(d: Record<string, unknown>): Omit<ResultadoCertidao, 'comprovante'> {
  const negativa = d.conseguiu_emitir_certidao_negativa === true;
  const consta = d.consta === true || /^sim$/i.test(txt(d.consta));
  const certidao = txt(d.certidao) || (negativa ? 'Certidão Negativa de Débitos Trabalhistas' : 'Certidão Positiva de Débitos Trabalhistas');
  const efeitoNegativa = /efeito de negativa/i.test(certidao);
  const status = negativa || efeitoNegativa ? 'CONCLUIDO' : consta ? 'DEBITOS' : 'CONCLUIDO';
  const validade = txt(d.validade_data) || txt(d.normalizado_validade) || txt(d.validade) || null;
  const emissao = txt(d.emissao_data) || txt(d.normalizado_expedicao) || txt(d.expedicao) || null;
  const processos = txt(d.total_de_processos);
  return {
    status, situacao: certidao, emissao, validade, numero: txt(d.certidao_codigo) || null,
    resumo: status === 'DEBITOS' ? `Constam débitos trabalhistas no Banco Nacional de Devedores Trabalhistas${processos ? ` (${plural(Number(processos), 'processo', 'processos')})` : ''}.` : `${certidao}${validade ? `, válida até ${validade}` : ''}.`,
    detalhes: [
      { rotulo: 'Situação', valor: certidao }, { rotulo: 'Emissão', valor: emissao ?? '' }, { rotulo: 'Validade', valor: validade ?? '' },
      { rotulo: 'Código da certidão', valor: txt(d.certidao_codigo) }, { rotulo: 'Processos', valor: processos },
      { rotulo: 'Mensagem', valor: txt(d.mensagem) },
    ].filter((l) => l.valor),
  };
}

/** CRF do FGTS (Caixa): "regular" = regular; qualquer outra situação = irregular. */
export function lerCrf(d: Record<string, unknown>): Omit<ResultadoCertidao, 'comprovante'> {
  const situacao = txt(d.situacao) || 'não informada';
  const regular = /regular/i.test(situacao) && !/irregular/i.test(situacao);
  const ini = txt(d.validade_inicio_data) || null;
  const fim = txt(d.validade_fim_data) || null;
  return {
    status: regular ? 'CONCLUIDO' : 'IRREGULAR', situacao, emissao: ini, validade: fim, numero: txt(d.crf) || null,
    resumo: regular ? `Empregador regular perante o FGTS${fim ? `; CRF válido até ${fim}` : ''}.` : `Situação no FGTS: ${situacao}.`,
    detalhes: [
      { rotulo: 'Situação', valor: situacao }, { rotulo: 'Razão social', valor: txt(d.razao_social) || txt(d.nome) },
      { rotulo: 'Número do CRF', valor: txt(d.crf) }, { rotulo: 'Válido de', valor: ini ?? '' }, { rotulo: 'Válido até', valor: fim ?? '' },
      { rotulo: 'Endereço', valor: txt(d.endereco) },
    ].filter((l) => l.valor),
  };
}

/**
 * Infosimples: a CNDT (TST) e o CRF do FGTS (Caixa) não têm API oficial; a Infosimples emite a certidão no portal oficial e devolve a
 * situação, a validade e o comprovante. O administrador guarda o token em Administração > Integrações (cifrado no cofre).
 * Cada consulta é cobrada pela Infosimples.
 */
@Injectable()
export class InfosimplesService {
  private readonly log = new Logger(InfosimplesService.name);
  constructor(private readonly prisma: PrismaService, private readonly cofre: CofreService) {}

  async token(): Promise<string | null> {
    const r = await this.prisma.integracaoSegredo.findUnique({ where: { id: ID } }).catch(() => null);
    if (r) {
      try { return this.cofre.decifrar({ cifrado: Buffer.from(r.segredo_cifrado), iv: Buffer.from(r.segredo_iv), tag: Buffer.from(r.segredo_tag), chaveId: r.chave_id }, ID, CONTEXTO).toString('utf8'); } catch { return null; }
    }
    return process.env.INFOSIMPLES_TOKEN?.trim() || null;
  }

  async estado() {
    const r = await this.prisma.integracaoSegredo.findUnique({ where: { id: ID }, select: { atualizado_por: true, updatedAt: true } }).catch(() => null);
    return { configurado: !!(r || process.env.INFOSIMPLES_TOKEN?.trim()), atualizado_por: r?.atualizado_por ?? null, atualizado_em: r?.updatedAt ?? null };
  }

  async salvar(token: string | undefined, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores configuram integrações.');
    const t = String(token ?? '').trim();
    if (t.length < 20 || /\s/.test(t)) throw new BadRequestException('Cole o token da Infosimples (Área do cliente > Tokens).');
    const c = this.cofre.cifrar(t, ID, CONTEXTO);
    const dados = { segredo_cifrado: c.cifrado, segredo_iv: c.iv, segredo_tag: c.tag, chave_id: c.chaveId, atualizado_por: usuario?.email ?? null };
    await this.prisma.integracaoSegredo.upsert({ where: { id: ID }, update: dados as never, create: { id: ID, ...dados } as never });
    return this.estado();
  }

  async remover(usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores configuram integrações.');
    await this.prisma.integracaoSegredo.deleteMany({ where: { id: ID } });
    return this.estado();
  }

  /** null = Infosimples não configurada. */
  async cndt(cnpj: string) { return this.certidao('tribunal/tst/cndt', cnpj, lerCndt); }
  async crf(cnpj: string) { return this.certidao('caixa/regularidade', cnpj, lerCrf); }

  private async certidao(rota: string, cnpjInformado: string, ler: (d: Record<string, unknown>) => Omit<ResultadoCertidao, 'comprovante'>): Promise<ResultadoCertidao | null> {
    const token = await this.token();
    if (!token) return null;
    const cnpj = so(cnpjInformado);
    if (cnpj.length !== 14) throw new BadRequestException('CNPJ inválido.');
    const corpo = new URLSearchParams({ token, timeout: '300', cnpj });
    const r = await fetch(`${URL_INFOSIMPLES}/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo, signal: AbortSignal.timeout(330_000) });
    let j: RespostaInfosimples;
    try { j = (await r.json()) as RespostaInfosimples; } catch { throw new BadRequestException(`A Infosimples respondeu HTTP ${r.status} sem JSON.`); }
    if (j.code !== 200 || !j.data?.length) {
      const msg = [j.code_message, ...(j.errors ?? [])].filter(Boolean).join(' ');
      return { status: 'INDISPONIVEL', situacao: 'não emitida', resumo: `A Infosimples não trouxe a certidão (código ${j.code ?? r.status}): ${msg || 'sem mensagem'}.`, emissao: null, validade: null, numero: null, detalhes: [], comprovante: null };
    }
    const lido = ler(j.data[0]);
    return { ...lido, comprovante: await this.comprovante(j.site_receipts ?? []) };
  }

  /** Baixa o comprovante (o PDF da certidão, quando o portal o gera; senão a página oficial em HTML). */
  private async comprovante(urls: string[]): Promise<ResultadoCertidao['comprovante']> {
    let html: ResultadoCertidao['comprovante'] = null;
    for (const u of urls) {
      if (!/^https:\/\//.test(u)) continue;
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(60_000) });
        if (!r.ok) continue;
        const buffer = Buffer.from(await r.arrayBuffer());
        const tipo = r.headers.get('content-type') ?? '';
        if (/pdf/i.test(tipo) || buffer.subarray(0, 4).toString() === '%PDF') return { buffer, tipo: 'application/pdf', extensao: 'pdf' };
        if (!html && /html/i.test(tipo)) html = { buffer, tipo: 'text/html', extensao: 'html' };
      } catch (e) { this.log.warn(`Comprovante da Infosimples: ${(e as Error).message}`); }
    }
    return html;
  }
}
