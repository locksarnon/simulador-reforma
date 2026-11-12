import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { basename, extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { atributos, chamarBx, servicosBx } from './receitanetbx.cliente';
import { entradaPedido, ESCRITURACAO_POR_ID } from './sped';

type Usuario = { email?: string } | undefined;
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const PENDENTES = ['SOLICITADO', 'PROCESSANDO', 'DISPONIVEL'];
/** O serviço grava em /dados (volume dele); o backend lê o mesmo volume em /bxdados/<serviço>. */
const caminhoNoBackend = (servico: string, local: string) => local.replace(/^\/dados\b/, `${process.env.RECEITANETBX_DADOS_DIR || '/bxdados'}/${servico}`);
const MIME: Record<string, string> = { '.rec': 'text/plain', '.txt': 'text/plain', '.zip': 'application/zip', '.pdf': 'application/pdf', '.xml': 'application/xml' };

/** Lê a resposta do SolicitarArquivos ou do VerificarSituacaoPedidos: pedidos, com a situação e os arquivos de cada um. */
export function lerPedidos(saida: string) {
  return [...saida.matchAll(/<pedido\b([^>]*?)(?:\/>|>([\s\S]*?)<\/pedido>)/g)].map((m) => {
    const p = atributos(m[1]);
    const arquivos = [...(m[2] ?? '').matchAll(/<arquivo\b([^>]*?)\/?>/g)].map((a) => atributos(a[1]));
    return { id: p.id ?? '', situacao: (p.situacao ?? '').toLowerCase(), mensagem: p.mensagem ?? '', arquivos };
  });
}

/**
 * Download das escriturações (EFD ICMS/IPI, EFD-Contribuições, ECD, ECF) pelo ReceitanetBX: o InTAX pede o arquivo
 * (SolicitarArquivos, com o id da pesquisa) ao serviço do certificado que o encontrou; o próprio serviço baixa da Receita;
 * a cada 2 minutos o InTAX confere os pedidos e, quando o arquivo chega, guarda nos Arquivos do cliente (pasta SPED).
 */
@Injectable()
export class SpedDownloadService {
  private readonly log = new Logger(SpedDownloadService.name);
  private acompanhando = false;

  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  listar(empresaId: string) {
    return this.prisma.spedDownload.findMany({ where: { empresa_id: empresaId }, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  async solicitar(empresaId: string, b: { escrituracao?: string; competencia?: string; arquivoId?: string; servico?: string; recibo?: string; retificadora?: boolean; proprio?: boolean }, usuario: Usuario) {
    const e = ESCRITURACAO_POR_ID.get(String(b.escrituracao));
    if (!e) throw new BadRequestException('Escrituração desconhecida.');
    const s = servicosBx().find((x) => x.id === b.servico);
    if (!s) throw new BadRequestException('Certificado (primário ou secundário) desconhecido.');
    if (!b.arquivoId || !b.competencia) throw new BadRequestException('Informe o arquivo e a competência.');
    const emp = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { cnpj_cpf: true } });
    const cnpj = so(emp?.cnpj_cpf);
    if (cnpj.length !== 14) throw new NotFoundException('Cliente sem CNPJ válido.');
    const ja = await this.prisma.spedDownload.findFirst({ where: { empresa_id: empresaId, arquivo_receita: b.arquivoId, situacao: { notIn: ['ERRO'] } } });
    if (ja) return ja;
    const base = { empresa_id: empresaId, escrituracao: e.id, competencia: b.competencia, servico: s.id, arquivo_receita: b.arquivoId, recibo: b.recibo ?? null, retificadora: !!b.retificadora, solicitado_por: usuario?.email ?? null };
    let saida = '';
    try {
      saida = (await chamarBx('SolicitarArquivos', entradaPedido(e, cnpj, !!b.proprio && s.id === 'primario', [b.arquivoId]), s.url)).saida;
    } catch (err) {
      return this.prisma.spedDownload.create({ data: { ...base, situacao: 'ERRO', mensagem: (err as Error).message.slice(0, 500) } });
    }
    this.log.log(`Pedido de download ${e.rotulo} ${b.competencia}: ${saida.slice(0, 1500)}`);
    const pedido = lerPedidos(saida)[0];
    const msg = saida.match(/<mensagem(?:usuario)?\b[^>]*>([\s\S]*?)<\/mensagem(?:usuario)?>/)?.[1]?.trim();
    if (!pedido?.id) return this.prisma.spedDownload.create({ data: { ...base, situacao: 'ERRO', mensagem: (msg || 'A Receita não devolveu o número do pedido.').slice(0, 500) } });
    return this.prisma.spedDownload.create({ data: { ...base, id_pedido: pedido.id, situacao: 'SOLICITADO', mensagem: msg ?? null } });
  }

  /** A cada 2 minutos: confere os pedidos em aberto e guarda os arquivos que o serviço já baixou. */
  @Cron('*/2 * * * *')
  async acompanhar() {
    if (this.acompanhando) return { guardados: 0 };
    this.acompanhando = true;
    let guardados = 0;
    try {
      const abertos = await this.prisma.spedDownload.findMany({ where: { situacao: { in: PENDENTES }, id_pedido: { not: null } } });
      for (const s of servicosBx()) {
        const meus = abertos.filter((d) => d.servico === s.id);
        if (!meus.length) continue;
        let saida = '';
        try {
          saida = (await chamarBx('VerificarSituacaoPedidos', `<pedidos atributos="true">${[...new Set(meus.map((d) => d.id_pedido))].map((id) => `<pedido id="${id}"/>`).join('')}</pedidos>`, s.url)).saida;
        } catch (e) { this.log.warn(`ReceitanetBX ${s.rotulo}: ${(e as Error).message}`); continue; }
        const pedidos = lerPedidos(saida);
        for (const d of meus) {
          const p = pedidos.find((x) => x.id === d.id_pedido);
          if (!p) continue;
          // O pedido pode trazer mais de um arquivo (a escrituração e o recibo): guarda todos quando todos chegarem.
          const localDe = (a: Record<string, string>) => Object.entries(a).find(([k]) => /local|caminho|path/i.test(k))?.[1];
          const baixados = p.arquivos.filter((a) => (a.situacao ?? '').toLowerCase() === 'baixado' && localDe(a));
          const todos = p.arquivos.length > 0 && baixados.length === p.arquivos.length;
          const sit = todos ? 'baixado' : (p.arquivos[0]?.situacao || p.situacao || '').toLowerCase();
          if (sit === 'baixado') {
            try { await this.guardar(d, baixados.map((a) => caminhoNoBackend(s.id, localDe(a)!))); guardados++; } catch (e) {
              await this.prisma.spedDownload.update({ where: { id: d.id }, data: { situacao: 'ERRO', mensagem: `Arquivo baixado, mas não foi possível guardar: ${(e as Error).message}`.slice(0, 500) } });
            }
          } else if (sit === 'erro' || sit === 'inativo' || sit === 'cancelado') {
            await this.prisma.spedDownload.update({ where: { id: d.id }, data: { situacao: 'ERRO', mensagem: (p.mensagem || `Pedido ${sit} na Receita.`).slice(0, 500) } });
          } else {
            const nova = sit === 'disponivel' ? 'DISPONIVEL' : 'PROCESSANDO';
            if (nova !== d.situacao) await this.prisma.spedDownload.update({ where: { id: d.id }, data: { situacao: nova } });
          }
        }
      }
    } finally { this.acompanhando = false; }
    return { guardados };
  }

  /**
   * Guarda os arquivos nos Arquivos do cliente, pasta SPED/<escrituração>/<competência>: a escrituração transmitida (o próprio
   * arquivo da Receita, sem alteração, para levantamentos de crédito) e o recibo, quando vier. O principal é a escrituração.
   */
  private async guardar(d: { id: string; empresa_id: string; escrituracao: string; competencia: string; retificadora: boolean; solicitado_por: string | null }, caminhos: string[]) {
    const e = ESCRITURACAO_POR_ID.get(d.escrituracao)!;
    const curto = e.rotulo.split(' (')[0];
    const salvos: { id: string; nome: string; tipo: 'ESCRITURACAO' | 'RECIBO' }[] = [];
    for (const caminho of caminhos) {
      const buf = await readFile(caminho);
      const ext = extname(caminho) || '.txt';
      const recibo = /\.rec$/i.test(caminho) || /recibo/i.test(basename(caminho));
      const nome = `${curto.replace(/[\\/:*?"<>|]/g, '-')} ${d.competencia}${d.retificadora ? ' retificadora' : ''}${recibo ? ' - recibo' : ''}${ext}`;
      const chave = `arquivos/empresa/${d.empresa_id}/${randomUUID()}-${basename(nome)}`;
      const mime = MIME[ext.toLowerCase()] ?? 'application/octet-stream';
      await this.storage.guardar(chave, buf, mime);
      const a = await this.prisma.arquivoEmpresa.create({ data: { empresa_id: d.empresa_id, pasta: `SPED/${curto}/${d.competencia}`, nome, tamanho: buf.length, tipo_mime: mime, storage_key: chave, enviado_por: d.solicitado_por ?? 'ReceitanetBX' } });
      salvos.push({ id: a.id, nome, tipo: recibo ? 'RECIBO' : 'ESCRITURACAO' });
    }
    const principal = salvos.find((x) => x.tipo === 'ESCRITURACAO') ?? salvos[0];
    await this.prisma.spedDownload.update({ where: { id: d.id }, data: { situacao: 'GUARDADO', arquivo_id: principal?.id ?? null, arquivos: salvos as never, mensagem: null } });
  }
}
