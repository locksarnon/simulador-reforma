import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { parse } from 'csv-parse';
import { PrismaService } from '../prisma/prisma.service';

type Usuario = { email?: string; role?: string } | undefined;
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** Os três arquivos da base aberta (https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/transparencia-fiscal-1/dados-abertos). */
export const ARQUIVOS_PGFN = [
  { origem: 'SIDA', rotulo: 'Dívida ativa geral (SIDA)', arquivo: 'Dados_abertos_Sistema_SIDA.zip' },
  { origem: 'PREVIDENCIARIO', rotulo: 'Dívida previdenciária', arquivo: 'Dados_abertos_Previdenciario.zip' },
  { origem: 'FGTS', rotulo: 'Dívida do FGTS', arquivo: 'Dados_abertos_FGTS.zip' },
] as const;
export const URL_PGFN = 'https://dadosabertos.pgfn.gov.br';
const ROTULO_ORIGEM = Object.fromEntries(ARQUIVOS_PGFN.map((a) => [a.origem, a.rotulo])) as Record<string, string>;

/** Trimestres candidatos, do mais recente para trás (a PGFN publica cerca de um mês depois do fim do trimestre). */
export function trimestresCandidatos(hoje = new Date(), quantos = 6): string[] {
  let ano = hoje.getUTCFullYear();
  let t = Math.floor(hoje.getUTCMonth() / 3) + 1;
  const out: string[] = [];
  for (let i = 0; i < quantos; i++) {
    out.push(`${ano}_trimestre_${String(t).padStart(2, '0')}`);
    t -= 1;
    if (!t) { t = 4; ano -= 1; }
  }
  return out;
}

/** Uma linha do CSV da PGFN → registro (só pessoa jurídica). Colunas pelo nome do cabeçalho oficial. */
export function linhaParaInscricao(l: Record<string, string>, origem: string, cargaId: string) {
  if (!/jur[ií]dica/i.test(l.TIPO_PESSOA ?? '')) return null;
  const cnpj = so(l.CPF_CNPJ);
  if (cnpj.length !== 14) return null;
  const valor = Number(String(l.VALOR_CONSOLIDADO ?? '').replace(',', '.'));
  return {
    carga_id: cargaId, raiz: cnpj.slice(0, 8), cnpj, origem,
    tipo_devedor: l.TIPO_DEVEDOR || null, nome: l.NOME_DEVEDOR || null, uf: l.UF_DEVEDOR || null,
    numero_inscricao: l.NUMERO_INSCRICAO || '', tipo_situacao: l.TIPO_SITUACAO_INSCRICAO || null, situacao: l.SITUACAO_INSCRICAO || null,
    receita: l.RECEITA_PRINCIPAL || null, data_inscricao: l.DATA_INSCRICAO || null, ajuizado: /^SIM$/i.test(l.INDICADOR_AJUIZADO ?? ''),
    valor: Number.isFinite(valor) ? valor.toFixed(2) : null,
  };
}

/**
 * Dívida Ativa da União pela base aberta da PGFN (oficial e gratuita, publicada a cada trimestre): o InTAX baixa os três arquivos,
 * guarda só as inscrições de pessoas jurídicas e consulta por raiz do CNPJ (matriz e filiais). Usada na pré-análise quando a API
 * Consulta Dívida Ativa do Serpro não está contratada. A informação é a do fim do trimestre publicado, não a de hoje.
 */
@Injectable()
export class DividaAtivaService implements OnModuleInit {
  private readonly log = new Logger(DividaAtivaService.name);
  private emAndamento = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Uma carga interrompida (reinício do servidor) fica marcada como erro, para não parecer em andamento para sempre. */
  async onModuleInit() {
    await this.prisma.dividaAtivaCarga.updateMany({ where: { status: 'PROCESSANDO' }, data: { status: 'ERRO', mensagem: 'Interrompida pelo reinício do servidor.' } }).catch(() => undefined);
  }

  async vigente() {
    return this.prisma.dividaAtivaCarga.findFirst({ where: { status: 'CONCLUIDA' }, orderBy: { concluido_em: 'desc' } });
  }

  async estado() {
    const [vigente, ultima] = await Promise.all([this.vigente(), this.prisma.dividaAtivaCarga.findFirst({ orderBy: { iniciado_em: 'desc' } })]);
    return { vigente, ultima, em_andamento: this.emAndamento, fonte: 'https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/transparencia-fiscal-1/dados-abertos' };
  }

  /** Inscrições da raiz do CNPJ na base vigente; null se a base ainda não foi carregada. */
  async consultar(cnpjInformado: string) {
    const cnpj = so(cnpjInformado);
    if (cnpj.length !== 14) throw new BadRequestException('CNPJ inválido.');
    const carga = await this.vigente();
    if (!carga) return null;
    const linhas = await this.prisma.dividaAtivaInscricao.findMany({ where: { raiz: cnpj.slice(0, 8), carga_id: carga.id }, orderBy: [{ valor: 'desc' }], take: 2000 });
    const total = linhas.reduce((s, l) => s + Number(l.valor ?? 0), 0);
    return {
      trimestre: carga.trimestre, carregada_em: carga.concluido_em,
      total, ajuizadas: linhas.filter((l) => l.ajuizado).length,
      inscricoes: linhas.map((l) => ({
        cnpj: l.cnpj, origem: ROTULO_ORIGEM[l.origem] ?? l.origem, numero: l.numero_inscricao, tipo_devedor: l.tipo_devedor ?? '', situacao: [l.tipo_situacao, l.situacao].filter(Boolean).join(': '),
        receita: l.receita ?? '', data: l.data_inscricao ?? '', ajuizado: l.ajuizado, valor: Number(l.valor ?? 0),
      })),
    };
  }

  /** Todo dia 10, às 03:00 (Brasília), carrega o trimestre novo se a PGFN já publicou. */
  @Cron('0 3 10 * *', { timeZone: 'America/Sao_Paulo' })
  async rotina() {
    if (String(process.env.DIVIDA_ATIVA_AGENDADOR ?? process.env.MONITORAMENTO_AGENDADOR ?? '').toLowerCase() === 'off') return { rodou: false };
    if (process.env.NODE_ENV !== 'production') return { rodou: false, motivo: 'só no servidor de produção' };
    const publicado = await this.trimestrePublicado();
    const vigente = await this.vigente();
    if (!publicado || vigente?.trimestre === publicado) return { rodou: false, motivo: 'sem trimestre novo' };
    this.carregar(publicado, 'rotina trimestral').catch((e) => this.log.error(`Base da PGFN: ${(e as Error).message}`));
    return { rodou: true, trimestre: publicado };
  }

  /** Administração: carrega agora o trimestre mais recente publicado (em segundo plano). */
  async atualizarAgora(usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores atualizam a base.');
    if (this.emAndamento) throw new BadRequestException('A base já está sendo carregada.');
    const publicado = await this.trimestrePublicado();
    if (!publicado) throw new BadRequestException('Não encontrei a base publicada no site de dados abertos da PGFN.');
    this.carregar(publicado, usuario?.email ?? 'administrador').catch((e) => this.log.error(`Base da PGFN: ${(e as Error).message}`));
    return { trimestre: publicado, iniciado: true };
  }

  async trimestrePublicado(): Promise<string | null> {
    for (const t of trimestresCandidatos()) {
      try {
        const r = await fetch(`${URL_PGFN}/${t}/${ARQUIVOS_PGFN[0].arquivo}`, { method: 'HEAD', signal: AbortSignal.timeout(20_000) });
        if (r.ok) return t;
      } catch { /* tenta o anterior */ }
    }
    return null;
  }

  /** Baixa os três arquivos, grava a carga nova e, só no fim, apaga a anterior (a consulta nunca fica sem base). */
  async carregar(trimestre: string, por: string) {
    if (this.emAndamento) return;
    this.emAndamento = true;
    const carga = await this.prisma.dividaAtivaCarga.create({ data: { trimestre, iniciado_por: por } });
    const pasta = await mkdtemp(join(tmpdir(), 'pgfn-'));
    let linhas = 0;
    try {
      for (const a of ARQUIVOS_PGFN) {
        const zip = join(pasta, a.arquivo);
        const r = await fetch(`${URL_PGFN}/${trimestre}/${a.arquivo}`);
        if (!r.ok || !r.body) throw new Error(`${a.arquivo}: HTTP ${r.status}`);
        await pipeline(Readable.fromWeb(r.body as never), createWriteStream(zip));
        linhas += await this.importarZip(zip, a.origem, carga.id);
        await rm(zip, { force: true });
        await this.prisma.dividaAtivaCarga.update({ where: { id: carga.id }, data: { linhas, mensagem: `${a.rotulo} carregada.` } });
      }
      await this.prisma.dividaAtivaCarga.update({ where: { id: carga.id }, data: { status: 'CONCLUIDA', linhas, concluido_em: new Date(), mensagem: null } });
      await this.prisma.$executeRawUnsafe('DELETE FROM "DividaAtivaInscricao" WHERE carga_id <> $1', carga.id);
      await this.prisma.dividaAtivaCarga.updateMany({ where: { id: { not: carga.id }, status: 'CONCLUIDA' }, data: { status: 'SUBSTITUIDA' } });
      this.log.log(`Base da PGFN ${trimestre} carregada: ${linhas} inscrições de pessoas jurídicas.`);
    } catch (e) {
      await this.prisma.dividaAtivaCarga.update({ where: { id: carga.id }, data: { status: 'ERRO', linhas, mensagem: (e as Error).message.slice(0, 500) } });
      await this.prisma.$executeRawUnsafe('DELETE FROM "DividaAtivaInscricao" WHERE carga_id = $1', carga.id).catch(() => undefined);
      throw e;
    } finally {
      this.emAndamento = false;
      await rm(pasta, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Lê todos os CSV do ZIP (unzip -p, que entende ZIP64) em latin1 e grava em lotes. */
  async importarZip(zip: string, origem: string, cargaId: string): Promise<number> {
    const unzip = spawn('unzip', ['-p', zip, '*.csv']);
    let erro = '';
    unzip.stderr.on('data', (d) => { erro += String(d); });
    const fim = new Promise<number>((ok) => unzip.on('close', (c) => ok(c ?? 0)));
    const leitor = unzip.stdout.pipe(parse({ delimiter: ';', encoding: 'latin1', relax_quotes: true, relax_column_count: true, skip_empty_lines: true, trim: true }));
    let cabecalho: string[] | null = null;
    let lote: NonNullable<ReturnType<typeof linhaParaInscricao>>[] = [];
    let total = 0;
    const gravar = async () => {
      if (!lote.length) return;
      await this.prisma.dividaAtivaInscricao.createMany({ data: lote as never });
      total += lote.length;
      lote = [];
    };
    for await (const campos of leitor as AsyncIterable<string[]>) {
      // Cada CSV do ZIP repete o cabeçalho.
      if (campos[0] === 'CPF_CNPJ') { cabecalho = campos; continue; }
      if (!cabecalho) continue;
      const l = Object.fromEntries(cabecalho.map((c, i) => [c, campos[i] ?? '']));
      const r = linhaParaInscricao(l, origem, cargaId);
      if (r) lote.push(r);
      if (lote.length >= 5000) await gravar();
    }
    await gravar();
    const codigo = await fim;
    if (codigo !== 0 && codigo !== 11) throw new Error(`unzip terminou com código ${codigo}: ${erro.slice(0, 200)}`);
    return total;
  }
}
