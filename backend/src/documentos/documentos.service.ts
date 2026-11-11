import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { zipSync } from 'fflate';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { hojeEmBrasilia, lerData, utcDe } from '../tarefas/tarefas.regras';

type Ator = { id: string; email?: string; role?: string };
export type Dono = { empresa_id?: string | null; pessoa_fisica_id?: string | null };

export const LIMITE_ARQUIVO = 25 * 1024 * 1024;
const LIMITE_LOTE = 200 * 1024 * 1024;
const MAX_ARQUIVOS_LOTE = 500;
const VALIDADE_DOWNLOAD_DIAS = 7;
const DIA_MS = 86_400_000;

/** Nome de arquivo seguro para guardar e para o ZIP (sem barras nem caracteres de controle). */
export const nomeSeguro = (n: string) => String(n || 'arquivo').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'arquivo';
/** Pasta "Contratos/2026" (sem ".." nem barras sobrando). */
export const pastaSegura = (p: unknown) => String(p ?? '').split(/[\\/]+/).map((s) => s.trim()).filter((s) => s && !/^\.+$/.test(s)).map(nomeSeguro).join('/').slice(0, 200);

/** Situação do documento pela validade e pelos dias de alerta do tipo: vencido, a vencer (dentro do alerta) ou válido. */
export function situacaoDoDocumento(validade: Date | null, alertaDias: number, hoje: Date): 'SEM_VALIDADE' | 'VENCIDO' | 'A_VENCER' | 'VALIDO' {
  if (!validade) return 'SEM_VALIDADE';
  const dias = Math.round((validade.getTime() - hoje.getTime()) / DIA_MS);
  if (dias < 0) return 'VENCIDO';
  if (dias <= alertaDias) return 'A_VENCER';
  return 'VALIDO';
}

/**
 * Arquivos e documentos: pastas de arquivos por empresa ou pessoa física, documentos com validade (e aviso de vencimento),
 * tipos de documento e "Meus downloads" (ZIP de vários arquivos, guardado por 7 dias).
 */
@Injectable()
export class DocumentosService {
  private readonly logger = new Logger(DocumentosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  private async conferirDono(d: Dono) {
    const empresa = d.empresa_id ? String(d.empresa_id) : null;
    const pf = d.pessoa_fisica_id ? String(d.pessoa_fisica_id) : null;
    if (!empresa === !pf) throw new BadRequestException('Escolha uma empresa ou uma pessoa física.');
    if (empresa && !(await this.prisma.empresa.count({ where: { id: empresa } }))) throw new NotFoundException('Empresa não encontrada.');
    if (pf && !(await this.prisma.pessoaFisica.count({ where: { id: pf } }))) throw new NotFoundException('Pessoa física não encontrada.');
    return { empresa_id: empresa, pessoa_fisica_id: pf };
  }

  // ── Tipos de documento ───────────────────────────────────────────
  listarTipos() {
    return this.prisma.tipoDocumento.findMany({ orderBy: { nome: 'asc' } });
  }

  async salvarTipo(id: string | null, e: { nome?: string; orgao?: string | null; alerta_dias?: number }) {
    const nome = String(e.nome ?? '').trim();
    if (!nome) throw new BadRequestException('Informe o nome do tipo de documento.');
    const alerta = Number(e.alerta_dias ?? 30);
    if (!Number.isInteger(alerta) || alerta < 0 || alerta > 365) throw new BadRequestException('O aviso vai de 0 a 365 dias antes do vencimento.');
    const igual = await this.prisma.tipoDocumento.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) } });
    if (igual) throw new ConflictException('Já existe um tipo com esse nome.');
    const data = { nome: nome.slice(0, 80), orgao: e.orgao ? String(e.orgao).trim().slice(0, 120) : null, alerta_dias: alerta };
    if (!id) return this.prisma.tipoDocumento.create({ data });
    if (!(await this.prisma.tipoDocumento.findUnique({ where: { id } }))) throw new NotFoundException('Tipo não encontrado.');
    return this.prisma.tipoDocumento.update({ where: { id }, data });
  }

  async excluirTipo(id: string) {
    if (!(await this.prisma.tipoDocumento.findUnique({ where: { id } }))) throw new NotFoundException('Tipo não encontrado.');
    await this.prisma.documentoEmpresa.updateMany({ where: { tipo_id: id }, data: { tipo_id: null } });
    await this.prisma.tipoDocumento.delete({ where: { id } });
    return { excluido: true };
  }

  // ── Arquivos ─────────────────────────────────────────────────────
  /** Arquivos de uma pasta e as subpastas que existem logo abaixo dela. */
  async listarArquivos(d: Dono & { pasta?: string }) {
    const dono = await this.conferirDono(d);
    const pasta = pastaSegura(d.pasta);
    const todos = await this.prisma.arquivoEmpresa.findMany({ where: dono, orderBy: [{ pasta: 'asc' }, { nome: 'asc' }] });
    const prefixo = pasta ? `${pasta}/` : '';
    const subpastas = [...new Set(todos.filter((a) => a.pasta.startsWith(prefixo) && a.pasta !== pasta).map((a) => a.pasta.slice(prefixo.length).split('/')[0]))].sort();
    return { pasta, subpastas, arquivos: todos.filter((a) => a.pasta === pasta), total: todos.length };
  }

  async enviar(user: Ator, d: Dono & { pasta?: string }, arquivo: { buffer: Buffer; originalname: string; mimetype?: string; size: number }) {
    if (!arquivo?.buffer?.length) throw new BadRequestException('Escolha um arquivo.');
    if (arquivo.size > LIMITE_ARQUIVO) throw new BadRequestException('O arquivo passa de 25 MB.');
    const dono = await this.conferirDono(d);
    const nome = nomeSeguro(Buffer.from(arquivo.originalname, 'latin1').toString('utf8'));
    const chave = `arquivos/${dono.empresa_id ? `empresa/${dono.empresa_id}` : `pf/${dono.pessoa_fisica_id}`}/${randomUUID()}-${nome}`;
    await this.storage.guardar(chave, arquivo.buffer, arquivo.mimetype);
    return this.prisma.arquivoEmpresa.create({ data: { ...dono, pasta: pastaSegura(d.pasta), nome, tamanho: arquivo.size, tipo_mime: arquivo.mimetype ?? null, storage_key: chave, enviado_por: user.email ?? user.id } });
  }

  async baixar(id: string) {
    const a = await this.prisma.arquivoEmpresa.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Arquivo não encontrado.');
    return { nome: a.nome, tipo: a.tipo_mime || 'application/octet-stream', buffer: await this.storage.getObjectBuffer(a.storage_key) };
  }

  async mover(id: string, e: { nome?: string; pasta?: string }) {
    const a = await this.prisma.arquivoEmpresa.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Arquivo não encontrado.');
    return this.prisma.arquivoEmpresa.update({ where: { id }, data: { ...(e.nome !== undefined ? { nome: nomeSeguro(e.nome) } : {}), ...(e.pasta !== undefined ? { pasta: pastaSegura(e.pasta) } : {}) } });
  }

  async excluirArquivo(id: string) {
    const a = await this.prisma.arquivoEmpresa.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Arquivo não encontrado.');
    await this.prisma.documentoEmpresa.updateMany({ where: { arquivo_id: id }, data: { arquivo_id: null } });
    await this.prisma.arquivoEmpresa.delete({ where: { id } });
    await this.storage.removeObject(a.storage_key).catch((e) => this.logger.warn(`Arquivo ${a.storage_key} não removido: ${(e as Error).message}`));
    return { excluido: true };
  }

  // ── Documentos com validade ──────────────────────────────────────
  async listarDocumentos(f: Dono & { situacao?: string } = {}) {
    const hoje = utcDe(hojeEmBrasilia());
    const [docs, tipos] = await Promise.all([
      this.prisma.documentoEmpresa.findMany({
        where: { ...(f.empresa_id ? { empresa_id: f.empresa_id } : {}), ...(f.pessoa_fisica_id ? { pessoa_fisica_id: f.pessoa_fisica_id } : {}) },
        orderBy: [{ validade: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], take: 2000,
      }),
      this.prisma.tipoDocumento.findMany(),
    ]);
    const tipo = new Map(tipos.map((t) => [t.id, t]));
    return docs
      .map((d) => ({ ...d, tipo: d.tipo_id ? tipo.get(d.tipo_id) ?? null : null, situacao: situacaoDoDocumento(d.validade, (d.tipo_id ? tipo.get(d.tipo_id)?.alerta_dias : undefined) ?? 30, hoje) }))
      .filter((d) => !f.situacao || d.situacao === f.situacao);
  }

  private async dadosDoDocumento(e: Record<string, unknown>, parcial: boolean) {
    const d: Record<string, unknown> = {};
    if (!parcial) Object.assign(d, await this.conferirDono(e as Dono));
    if (e.tipo_id !== undefined) {
      if (e.tipo_id && !(await this.prisma.tipoDocumento.findUnique({ where: { id: String(e.tipo_id) } }))) throw new NotFoundException('Tipo de documento não encontrado.');
      d.tipo_id = e.tipo_id || null;
    }
    for (const [k, max] of [['descricao', 300], ['numero', 80]] as const) if (e[k] !== undefined) d[k] = e[k] ? String(e[k]).trim().slice(0, max) : null;
    for (const k of ['emissao', 'validade'] as const) if (e[k] !== undefined) {
      const v = lerData(e[k]);
      if (v === undefined) throw new BadRequestException(`Data inválida em ${k === 'emissao' ? 'emissão' : 'validade'}. Use AAAA-MM-DD.`);
      d[k] = v;
    }
    if (e.arquivo_id !== undefined) {
      if (e.arquivo_id && !(await this.prisma.arquivoEmpresa.findUnique({ where: { id: String(e.arquivo_id) } }))) throw new NotFoundException('Arquivo não encontrado.');
      d.arquivo_id = e.arquivo_id || null;
    }
    if (!parcial && !d.tipo_id && !d.descricao) throw new BadRequestException('Informe o tipo ou a descrição do documento.');
    return d;
  }

  async criarDocumento(user: Ator, e: Record<string, unknown>) {
    return this.prisma.documentoEmpresa.create({ data: { ...(await this.dadosDoDocumento(e, false)), criado_por: user.email ?? user.id } });
  }

  async atualizarDocumento(id: string, e: Record<string, unknown>) {
    if (!(await this.prisma.documentoEmpresa.findUnique({ where: { id } }))) throw new NotFoundException('Documento não encontrado.');
    return this.prisma.documentoEmpresa.update({ where: { id }, data: await this.dadosDoDocumento(e, true) });
  }

  async excluirDocumento(id: string) {
    if (!(await this.prisma.documentoEmpresa.findUnique({ where: { id } }))) throw new NotFoundException('Documento não encontrado.');
    await this.prisma.documentoEmpresa.delete({ where: { id } });
    return { excluido: true };
  }

  // ── Meus downloads ───────────────────────────────────────────────
  /** Junta os arquivos escolhidos num ZIP (até 500 arquivos e 200 MB), guardado por 7 dias em "Meus downloads". */
  async criarLote(user: Ator, e: { arquivo_ids?: string[]; nome?: string }) {
    const ids = [...new Set((e.arquivo_ids ?? []).map(String))];
    if (!ids.length) throw new BadRequestException('Escolha pelo menos um arquivo.');
    if (ids.length > MAX_ARQUIVOS_LOTE) throw new BadRequestException(`Até ${MAX_ARQUIVOS_LOTE} arquivos por download.`);
    const arquivos = await this.prisma.arquivoEmpresa.findMany({ where: { id: { in: ids } } });
    if (arquivos.length !== ids.length) throw new NotFoundException('Algum arquivo escolhido não existe mais.');
    const total = arquivos.reduce((s, a) => s + a.tamanho, 0);
    if (total > LIMITE_LOTE) throw new BadRequestException('Os arquivos passam de 200 MB juntos. Escolha menos arquivos.');
    const conteudo: Record<string, Uint8Array> = {};
    const usados = new Set<string>();
    for (const a of arquivos) {
      let caminho = [a.pasta, a.nome].filter(Boolean).join('/');
      for (let i = 2; usados.has(caminho); i++) caminho = [a.pasta, a.nome.replace(/(\.[^.]*)?$/, ` (${i})$1`)].filter(Boolean).join('/');
      usados.add(caminho);
      conteudo[caminho] = new Uint8Array(await this.storage.getObjectBuffer(a.storage_key));
    }
    const zip = Buffer.from(zipSync(conteudo, { level: 6 }));
    const id = randomUUID();
    const chave = `downloads/${user.id}/${id}.zip`;
    await this.storage.guardar(chave, zip, 'application/zip');
    return this.prisma.downloadLote.create({
      data: { id, dono: user.id, nome: `${nomeSeguro(e.nome || 'arquivos').replace(/\.zip$/i, '')}.zip`, status: 'PRONTO', storage_key: chave, tamanho: zip.length, arquivos: arquivos.length, expira_em: new Date(Date.now() + VALIDADE_DOWNLOAD_DIAS * DIA_MS) },
    });
  }

  listarLotes(user: Ator) {
    return this.prisma.downloadLote.findMany({ where: { dono: user.id, expira_em: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  }

  async baixarLote(user: Ator, id: string) {
    const l = await this.prisma.downloadLote.findUnique({ where: { id } });
    if (!l || l.dono !== user.id) throw new NotFoundException('Download não encontrado.');
    if (l.expira_em.getTime() < Date.now() || !l.storage_key) throw new ForbiddenException('Este download já expirou. Monte de novo.');
    return { nome: l.nome, buffer: await this.storage.getObjectBuffer(l.storage_key) };
  }

  // ── Rotina diária (07:10 de Brasília) ────────────────────────────
  @Cron('10 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async rotinaDiaria(agora = new Date()) {
    const r = { avisos: 0, expirados: 0 };
    try { r.avisos = await this.avisarVencimentos(agora); } catch (e) { this.logger.error(`Aviso de documentos falhou: ${(e as Error).message}`); }
    try { r.expirados = await this.limparDownloads(agora); } catch (e) { this.logger.error(`Limpeza de downloads falhou: ${(e as Error).message}`); }
    return r;
  }

  /** Documento perto de vencer (dentro do aviso do tipo) ou vencido: um aviso por documento e faixa; certificado da PF também. */
  async avisarVencimentos(agora = new Date()) {
    if (!this.notificacoes) return 0;
    const hoje = utcDe(hojeEmBrasilia(agora));
    let criadas = 0;
    for (const d of await this.listarDocumentos({})) {
      if (d.situacao !== 'A_VENCER' && d.situacao !== 'VENCIDO') continue;
      const dono = d.empresa_id ? (await this.prisma.empresa.findUnique({ where: { id: d.empresa_id }, select: { razao_social: true } }))?.razao_social : (await this.prisma.pessoaFisica.findUnique({ where: { id: d.pessoa_fisica_id! }, select: { nome: true } }))?.nome;
      const nome = d.tipo?.nome || d.descricao || 'Documento';
      criadas += await this.notificacoes.criarParaAdmins({
        tipo: 'DOCUMENTO', titulo: `${nome} de ${dono ?? '—'} ${d.situacao === 'VENCIDO' ? 'venceu' : 'vence em breve'} (${d.validade!.toLocaleDateString('pt-BR', { timeZone: 'UTC' })})`,
        mensagem: 'Veja em BPO Fiscal > Arquivos e documentos.', link: '/bpo/arquivos', chave: `documento:${d.id}:${d.situacao}`,
      });
    }
    const pfs = await this.prisma.pessoaFisica.findMany({ where: { certificado_validade: { not: null, lte: new Date(hoje.getTime() + 30 * DIA_MS) } }, select: { id: true, nome: true, certificado_validade: true } });
    for (const p of pfs) {
      const vencido = p.certificado_validade!.getTime() < hoje.getTime();
      criadas += await this.notificacoes.criarParaAdmins({
        tipo: 'CERTIFICADO', titulo: `Certificado digital de ${p.nome} ${vencido ? 'venceu' : 'vence em breve'} (${p.certificado_validade!.toLocaleDateString('pt-BR', { timeZone: 'UTC' })})`,
        mensagem: 'Veja em Clientes > Pessoas físicas.', link: '/clientes/pessoas-fisicas', chave: `certificado-pf:${p.id}:${vencido ? 'vencido' : 'a-vencer'}`,
      });
    }
    return criadas;
  }

  async limparDownloads(agora = new Date()) {
    const vencidos = await this.prisma.downloadLote.findMany({ where: { expira_em: { lt: agora } } });
    for (const l of vencidos) {
      if (l.storage_key) await this.storage.removeObject(l.storage_key).catch(() => undefined);
      await this.prisma.downloadLote.delete({ where: { id: l.id } });
    }
    return vencidos.length;
  }
}
