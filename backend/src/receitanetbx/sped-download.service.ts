import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { atributos, chamarBx, servicosBx } from './receitanetbx.cliente';
import { entradaPedido, ESCRITURACAO_POR_ID } from './sped';
import { competenciaDe, lerCabecalho, textoDoSped } from './sped-cabecalho';

type Usuario = { email?: string } | undefined;
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const PENDENTES = ['SOLICITADO', 'PROCESSANDO', 'DISPONIVEL'];
/** O serviço grava em /dados (volume dele); o backend lê o mesmo volume em /bxdados/<serviço>. */
const caminhoNoBackend = (servico: string, local: string) => local.replace(/^\/dados\b/, `${process.env.RECEITANETBX_DADOS_DIR || '/bxdados'}/${servico}`);
/**
 * Número do pedido na resposta do SolicitarArquivos: `<retornopedido id="84679558"><mensagem>O pedido número 84679558 foi
 * registrado com sucesso.</mensagem></retornopedido>` (aceita também `<pedido id=…>` e o número só na mensagem).
 */
export function numeroDoPedido(saida: string, mensagem?: string | null): string | null {
  return saida.match(/<retornopedido\b[^>]*\bid="(\d+)"/)?.[1] ?? saida.match(/<pedido\b[^>]*\bid="(\d+)"/)?.[1] ?? String(mensagem ?? '').match(/pedido n[uú]mero (\d+) foi registrado/i)?.[1] ?? null;
}

const FALHA_GUARDAR = 'Arquivo baixado, mas não foi possível guardar';

/**
 * Caminho real do arquivo no disco. O ReceitanetBX informa o caminho com acento ("Escrituração Fiscal Digital"), mas, sem
 * configuração de idioma, o Java grava "?" no lugar de cada letra acentuada. Tenta o caminho informado, a variante com "?" e,
 * por fim, procura pelo nome do arquivo (que não tem acento) dentro da pasta do serviço.
 */
export async function acharArquivo(caminho: string, raiz: string): Promise<string | null> {
  if (existsSync(caminho)) return caminho;
  const comInterrogacao = caminho.replace(/[^\x00-\x7F]/g, '?');
  if (existsSync(comInterrogacao)) return comInterrogacao;
  const alvo = basename(comInterrogacao);
  const fila = [raiz];
  for (let n = 0; fila.length && n < 5000; n++) {
    const dir = fila.shift()!;
    let itens: import('fs').Dirent[] = [];
    try { itens = await readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const i of itens) {
      const p = join(dir, i.name);
      if (i.isDirectory()) fila.push(p);
      else if (i.name === alvo || i.name === basename(caminho)) return p;
    }
  }
  return null;
}

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
    if (!b.arquivoId) throw new BadRequestException('Informe o arquivo.');
    const emp = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { cnpj_cpf: true } });
    const cnpj = so(emp?.cnpj_cpf);
    if (cnpj.length !== 14) throw new NotFoundException('Cliente sem CNPJ válido.');
    const ja = await this.prisma.spedDownload.findFirst({ where: { empresa_id: empresaId, arquivo_receita: b.arquivoId, situacao: { notIn: ['ERRO'] } } });
    if (ja) return ja;
    const base = { empresa_id: empresaId, escrituracao: e.id, competencia: b.competencia || '?', servico: s.id, arquivo_receita: b.arquivoId, recibo: b.recibo ?? null, retificadora: !!b.retificadora, solicitado_por: usuario?.email ?? null };
    let saida = '';
    try {
      saida = (await chamarBx('SolicitarArquivos', entradaPedido(e, cnpj, !!b.proprio && s.id === 'primario', [b.arquivoId]), s.url)).saida;
    } catch (err) {
      return this.prisma.spedDownload.create({ data: { ...base, situacao: 'ERRO', mensagem: (err as Error).message.slice(0, 500) } });
    }
    this.log.log(`Pedido de download ${e.rotulo} ${b.competencia}: ${saida.slice(0, 1500)}`);
    const msg = saida.match(/<mensagem(?:usuario)?\b[^>]*>([\s\S]*?)<\/mensagem(?:usuario)?>/)?.[1]?.trim();
    const pedido = { id: numeroDoPedido(saida, msg) };
    if (!pedido?.id) return this.prisma.spedDownload.create({ data: { ...base, situacao: 'ERRO', mensagem: (msg || 'A Receita não devolveu o número do pedido.').slice(0, 500) } });
    return this.prisma.spedDownload.create({ data: { ...base, id_pedido: pedido.id, situacao: 'SOLICITADO', mensagem: msg ?? null } });
  }

  /**
   * Pede à Receita todos os arquivos achados na pesquisa que ainda não foram pedidos (a pesquisa só devolve o id; período,
   * retificadora e recibo saem do próprio arquivo quando ele chega).
   */
  async pedirTodos(empresaId: string, escrituracao: string, achados: { id: string; servico: string }[], proprio: boolean, usuario: Usuario) {
    // Já pedidos: os em andamento, os guardados e os que chegaram mas ainda não foram guardados (a rotina tenta de novo).
    const ja = new Set((await this.prisma.spedDownload.findMany({ where: { empresa_id: empresaId, escrituracao, OR: [{ situacao: { notIn: ['ERRO'] } }, { mensagem: { startsWith: FALHA_GUARDAR } }, { mensagem: { contains: 'foi registrado' } }] }, select: { arquivo_receita: true } })).map((x) => x.arquivo_receita));
    let pedidos = 0;
    for (const a of achados.filter((x) => x.id && !ja.has(x.id)).slice(0, 60)) {
      await this.solicitar(empresaId, { escrituracao, arquivoId: a.id, servico: a.servico, proprio }, usuario);
      pedidos++;
    }
    return pedidos;
  }

  /**
   * Cópias do mesmo arquivo da Receita (pedidos repetidos antes da correção do número do pedido): mantém a mais antiga, apaga as
   * outras do armazenamento e dos Arquivos do cliente, e aponta os pedidos para a que ficou.
   */
  async removerCopias() {
    const guardados = await this.prisma.spedDownload.findMany({ where: { situacao: 'GUARDADO' }, orderBy: { createdAt: 'asc' } });
    const primeiro = new Map<string, (typeof guardados)[number]>();
    let removidas = 0;
    for (const g of guardados) {
      const k = `${g.empresa_id}|${g.arquivo_receita}`;
      const p = primeiro.get(k);
      if (!p) { primeiro.set(k, g); continue; }
      const meus = (Array.isArray(g.arquivos) ? (g.arquivos as { id: string }[]) : []).map((a) => a.id);
      const deles = new Set((Array.isArray(p.arquivos) ? (p.arquivos as { id: string }[]) : []).map((a) => a.id));
      for (const id of meus.filter((x) => !deles.has(x))) {
        const a = await this.prisma.arquivoEmpresa.findUnique({ where: { id } });
        if (!a) continue;
        await this.storage.removeObject(a.storage_key).catch(() => undefined);
        await this.prisma.arquivoEmpresa.delete({ where: { id } });
        removidas++;
      }
      await this.prisma.spedDownload.update({ where: { id: g.id }, data: { arquivo_id: p.arquivo_id, arquivos: p.arquivos as never, mensagem: 'Mesmo arquivo de outro pedido.' } });
    }
    if (removidas) this.log.log(`SPED: ${removidas} cópia(s) repetida(s) removida(s).`);
    return removidas;
  }

  /** A cada 2 minutos: confere os pedidos em aberto e guarda os arquivos que o serviço já baixou. */
  @Cron('*/2 * * * *')
  async acompanhar() {
    if (this.acompanhando) return { guardados: 0 };
    this.acompanhando = true;
    let guardados = 0;
    try {
      // Pedidos registrados na Receita que ficaram como erro por o número não ter sido lido: recupera pela mensagem, sem pedir de novo.
      const semNumero = await this.prisma.spedDownload.findMany({ where: { situacao: 'ERRO', id_pedido: null, mensagem: { contains: 'foi registrado' } } });
      for (const d of semNumero) {
        const n = numeroDoPedido('', d.mensagem);
        if (n) await this.prisma.spedDownload.update({ where: { id: d.id }, data: { id_pedido: n, situacao: 'SOLICITADO', mensagem: null } });
      }
      if (semNumero.length) this.log.log(`SPED: ${semNumero.length} pedido(s) recuperado(s) pelo número na mensagem.`);
      // Também os que chegaram mas não foram guardados (ex.: nome com acento trocado): tenta de novo, sem pedir outra vez à Receita.
      const abertos = await this.prisma.spedDownload.findMany({ where: { id_pedido: { not: null }, OR: [{ situacao: { in: PENDENTES } }, { situacao: 'ERRO', mensagem: { startsWith: FALHA_GUARDAR } }] } });
      if (abertos.length) this.log.log(`SPED: ${abertos.length} pedido(s) em acompanhamento.`);
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
          if (!p) { this.log.warn(`SPED: o serviço ${s.rotulo} não conhece o pedido ${d.id_pedido}.`); continue; }
          // O pedido pode trazer mais de um arquivo (a escrituração e o recibo): guarda todos quando todos chegarem.
          const localDe = (a: Record<string, string>) => Object.entries(a).find(([k]) => /local|caminho|path/i.test(k))?.[1];
          const baixados = p.arquivos.filter((a) => (a.situacao ?? '').toLowerCase() === 'baixado' && localDe(a));
          const todos = p.arquivos.length > 0 && baixados.length === p.arquivos.length;
          const sit = todos ? 'baixado' : (p.arquivos[0]?.situacao || p.situacao || '').toLowerCase();
          if (sit === 'baixado') {
            try {
              const raiz = `${process.env.RECEITANETBX_DADOS_DIR || '/bxdados'}/${s.id}`;
              const caminhos: string[] = [];
              for (const a of baixados) {
                const real = await acharArquivo(caminhoNoBackend(s.id, localDe(a)!), raiz);
                if (!real) throw new Error(`arquivo não encontrado: ${localDe(a)}`);
                caminhos.push(real);
              }
              await this.guardar(d, caminhos);
              guardados++;
              this.log.log(`SPED: pedido ${d.id_pedido} guardado (${caminhos.length} arquivo(s)).`);
            } catch (e) {
              this.log.warn(`SPED: pedido ${d.id_pedido} baixado, mas não guardado: ${(e as Error).message}`);
              await this.prisma.spedDownload.update({ where: { id: d.id }, data: { situacao: 'ERRO', mensagem: `${FALHA_GUARDAR}: ${(e as Error).message}`.slice(0, 500) } });
            }
          } else if (sit === 'erro' || sit === 'inativo' || sit === 'cancelado') {
            await this.prisma.spedDownload.update({ where: { id: d.id }, data: { situacao: 'ERRO', mensagem: (p.mensagem || `Pedido ${sit} na Receita.`).slice(0, 500) } });
          } else {
            const nova = sit === 'disponivel' ? 'DISPONIVEL' : 'PROCESSANDO';
            if (nova !== d.situacao) await this.prisma.spedDownload.update({ where: { id: d.id }, data: { situacao: nova } });
          }
        }
      }
      await this.removerCopias();
    } finally { this.acompanhando = false; }
    return { guardados };
  }

  /**
   * Guarda os arquivos nos Arquivos do cliente, pasta SPED/<escrituração>/<competência>: a escrituração transmitida (o próprio
   * arquivo da Receita, sem alteração, para levantamentos de crédito) e o recibo, quando vier. O principal é a escrituração.
   */
  private async guardar(entrada: { id: string; empresa_id: string; escrituracao: string; competencia: string; retificadora: boolean; solicitado_por: string | null; arquivo_receita?: string }, caminhos: string[]) {
    let d = entrada;
    const igual = await this.prisma.spedDownload.findFirst({ where: { empresa_id: d.empresa_id, arquivo_receita: (entrada as { arquivo_receita?: string }).arquivo_receita, situacao: 'GUARDADO', id: { not: d.id } } });
    if (igual) {
      await this.prisma.spedDownload.update({ where: { id: d.id }, data: { situacao: 'GUARDADO', arquivo_id: igual.arquivo_id, arquivos: igual.arquivos as never, competencia: igual.competencia, retificadora: igual.retificadora, periodo_inicio: igual.periodo_inicio, periodo_fim: igual.periodo_fim, mensagem: 'Mesmo arquivo de outro pedido.' } });
      return;
    }
    const e = ESCRITURACAO_POR_ID.get(d.escrituracao)!;
    const curto = e.rotulo.split(' (')[0];
    const salvos: { id: string; nome: string; tipo: 'ESCRITURACAO' | 'RECIBO'; tamanho: number }[] = [];
    // Período e original/retificadora vêm do registro 0000 da própria escrituração.
    let cab = null as ReturnType<typeof lerCabecalho>;
    for (const caminho of caminhos) {
      if (/\.rec$/i.test(caminho) || /recibo/i.test(basename(caminho))) continue;
      cab = lerCabecalho(textoDoSped(await readFile(caminho)), d.escrituracao);
      if (cab) break;
    }
    if (cab) {
      d = { ...d, competencia: competenciaDe(cab, e.anual), retificadora: cab.retificadora ?? d.retificadora };
      await this.prisma.spedDownload.update({ where: { id: d.id }, data: { competencia: d.competencia, retificadora: d.retificadora, periodo_inicio: cab.inicio, periodo_fim: cab.fim } });
    }
    for (const caminho of caminhos) {
      const buf = await readFile(caminho);
      const ext = extname(caminho) || '.txt';
      const recibo = /\.rec$/i.test(caminho) || /recibo/i.test(basename(caminho));
      const nome = `${curto.replace(/[\\/:*?"<>|]/g, '-')} ${d.competencia}${d.retificadora ? ' retificadora' : ''}${recibo ? ' - recibo' : ''}${ext}`;
      const chave = `arquivos/empresa/${d.empresa_id}/${randomUUID()}-${basename(nome)}`;
      const mime = MIME[ext.toLowerCase()] ?? 'application/octet-stream';
      await this.storage.guardar(chave, buf, mime);
      const a = await this.prisma.arquivoEmpresa.create({ data: { empresa_id: d.empresa_id, pasta: `SPED/${curto}/${d.competencia}`, nome, tamanho: buf.length, tipo_mime: mime, storage_key: chave, enviado_por: d.solicitado_por ?? 'ReceitanetBX' } });
      salvos.push({ id: a.id, nome, tipo: recibo ? 'RECIBO' : 'ESCRITURACAO', tamanho: buf.length });
    }
    const principal = salvos.find((x) => x.tipo === 'ESCRITURACAO') ?? salvos[0];
    await this.prisma.spedDownload.update({ where: { id: d.id }, data: { situacao: 'GUARDADO', arquivo_id: principal?.id ?? null, arquivos: salvos as never, mensagem: null } });
  }
}
