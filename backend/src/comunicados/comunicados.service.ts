import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

type Ator = { id: string; email?: string; role?: string };
export type Filtro = { carteira?: string; tags?: string[]; tagModo?: string; empresa_ids?: string[] };
type Anexo = { nome: string; storage_key: string; tamanho: number; tipo?: string | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ANEXOS = 5;
const LIMITE_ANEXOS = 15 * 1024 * 1024;
const ESPERA_ENTRE_ENVIOS_MS = 400;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

/** O texto do comunicado vira HTML simples: um parágrafo por bloco, quebras de linha mantidas, sem HTML do usuário. */
export function corpoEmHtml(texto: string) {
  return texto.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

/** Normaliza o filtro dos destinatários (carteira, etiquetas, empresas escolhidas). */
export function normalizarFiltro(bruto: unknown): Filtro {
  const f = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String).filter(Boolean))].slice(0, 2000) : []);
  return {
    carteira: ['bpo', 'diagnostico', ''].includes(String(f.carteira ?? '')) ? String(f.carteira ?? '') : '',
    tags: lista(f.tags),
    tagModo: f.tagModo === 'todas' ? 'todas' : 'qualquer',
    empresa_ids: lista(f.empresa_ids),
  };
}

/**
 * Comunicados por e-mail para grupos de clientes (por carteira, etiquetas ou empresas escolhidas), com anexos. Cada envio fica
 * registrado (EnvioEmail); quem pede para sair pelo link entra na lista de bloqueio e não recebe mais. O e-mail de cada empresa é
 * o "e-mail de contato" do cadastro.
 */
@Injectable()
export class ComunicadosService {
  private readonly logger = new Logger(ComunicadosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  // ── Link de saída ────────────────────────────────────────────────
  private segredo() {
    return this.config.get<string>('JWT_ACCESS_SECRET') || 'intax-local';
  }

  tokenDeSaida(email: string) {
    return createHmac('sha256', this.segredo()).update(`sair:${email.trim().toLowerCase()}`).digest('base64url');
  }

  linkDeSaida(email: string) {
    return `${this.mail.urlPublica}/api/v1/public/comunicados/sair?e=${b64url(email.trim().toLowerCase())}&t=${this.tokenDeSaida(email)}`;
  }

  /** Quem clica no link de saída entra na lista de bloqueio. Devolve false se o link não confere. */
  async sair(e: string, t: string) {
    let email = '';
    try { email = Buffer.from(String(e || ''), 'base64url').toString('utf8'); } catch { return false; }
    if (!EMAIL.test(email)) return false;
    const certo = Buffer.from(this.tokenDeSaida(email));
    const recebido = Buffer.from(String(t || ''));
    if (certo.length !== recebido.length || !timingSafeEqual(certo, recebido)) return false;
    await this.prisma.bloqueioEnvio.upsert({ where: { email }, create: { email, motivo: 'Pediu para sair pelo link do e-mail' }, update: {} });
    return true;
  }

  // ── Destinatários ────────────────────────────────────────────────
  async destinatarios(filtroBruto: unknown) {
    const f = normalizarFiltro(filtroBruto);
    let ids: string[] | null = null;
    if (f.empresa_ids?.length) ids = f.empresa_ids;
    if (f.carteira) {
      const tipo = f.carteira === 'bpo' ? 'BPO_FISCAL' : 'DIAGNOSTICO_PONTUAL';
      const s = await this.prisma.servicoContratado.findMany({ where: { tipo, situacao: { in: ['ATIVO', 'PAUSADO'] } }, select: { empresa_id: true } });
      const daCarteira = new Set(s.map((x) => x.empresa_id));
      ids = ids ? ids.filter((i) => daCarteira.has(i)) : [...daCarteira];
    }
    if (f.tags?.length) {
      const rel = await this.prisma.empresaTag.findMany({ where: { tag_id: { in: f.tags } }, select: { empresa_id: true, tag_id: true } });
      const porEmpresa = new Map<string, Set<string>>();
      for (const r of rel) porEmpresa.set(r.empresa_id, (porEmpresa.get(r.empresa_id) ?? new Set()).add(r.tag_id));
      const comTags = [...porEmpresa.entries()].filter(([, ts]) => (f.tagModo === 'todas' ? f.tags!.every((t) => ts.has(t)) : true)).map(([id]) => id);
      ids = ids ? ids.filter((i) => comTags.includes(i)) : comTags;
    }
    if (ids === null) return { incluidos: [], fora: [], aviso: 'Escolha a carteira, as etiquetas ou as empresas.' };
    const empresas = await this.prisma.empresa.findMany({ where: { id: { in: ids } }, select: { id: true, razao_social: true, email_contato: true }, orderBy: { razao_social: 'asc' } });
    const bloqueados = new Set((await this.prisma.bloqueioEnvio.findMany({ select: { email: true } })).map((b) => b.email.toLowerCase()));
    const incluidos: { empresa_id: string; razao_social: string; email: string }[] = [];
    const fora: { empresa_id: string; razao_social: string; motivo: string }[] = [];
    for (const e of empresas) {
      const email = (e.email_contato || '').trim().toLowerCase();
      if (!email || !EMAIL.test(email)) fora.push({ empresa_id: e.id, razao_social: e.razao_social, motivo: 'sem e-mail de contato no cadastro' });
      else if (bloqueados.has(email)) fora.push({ empresa_id: e.id, razao_social: e.razao_social, motivo: 'e-mail na lista de bloqueio' });
      else incluidos.push({ empresa_id: e.id, razao_social: e.razao_social, email });
    }
    return { incluidos, fora };
  }

  // ── Comunicados ──────────────────────────────────────────────────
  listar() {
    return this.prisma.comunicado.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  private dados(e: { assunto?: string; corpo?: string; filtro?: unknown }, parcial: boolean) {
    const d: Record<string, unknown> = {};
    if (!parcial || e.assunto !== undefined) {
      const a = String(e.assunto ?? '').trim();
      if (!a) throw new BadRequestException('Informe o assunto.');
      d.assunto = a.slice(0, 200);
    }
    if (!parcial || e.corpo !== undefined) {
      const c = String(e.corpo ?? '').trim();
      if (!c) throw new BadRequestException('Escreva o texto do comunicado.');
      if (c.length > 20000) throw new BadRequestException('O texto aceita até 20 mil caracteres.');
      d.corpo = c;
    }
    if (!parcial || e.filtro !== undefined) d.filtro = normalizarFiltro(e.filtro) as Prisma.InputJsonValue;
    return d;
  }

  async criar(user: Ator, e: { assunto?: string; corpo?: string; filtro?: unknown }) {
    return this.prisma.comunicado.create({ data: { ...(this.dados(e, false) as { assunto: string; corpo: string; filtro: Prisma.InputJsonValue }), anexos: [], criado_por: user.email ?? user.id } });
  }

  private async rascunho(id: string) {
    const c = await this.prisma.comunicado.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Comunicado não encontrado.');
    if (c.status !== 'RASCUNHO') throw new ConflictException('Comunicado já enviado não muda. Duplique para mandar outro.');
    return c;
  }

  async atualizar(id: string, e: { assunto?: string; corpo?: string; filtro?: unknown }) {
    await this.rascunho(id);
    return this.prisma.comunicado.update({ where: { id }, data: this.dados(e, true) });
  }

  async excluir(id: string) {
    const c = await this.rascunho(id);
    for (const a of (c.anexos as Anexo[] | null) ?? []) await this.storage.removeObject(a.storage_key).catch(() => undefined);
    await this.prisma.comunicado.delete({ where: { id } });
    return { excluido: true };
  }

  async anexar(id: string, arquivo: { buffer: Buffer; originalname: string; mimetype?: string; size: number }) {
    const c = await this.rascunho(id);
    const anexos = ((c.anexos as Anexo[] | null) ?? []).slice();
    if (anexos.length >= MAX_ANEXOS) throw new BadRequestException(`Até ${MAX_ANEXOS} anexos por comunicado.`);
    if (anexos.reduce((s, a) => s + a.tamanho, 0) + arquivo.size > LIMITE_ANEXOS) throw new BadRequestException('Os anexos passam de 15 MB juntos.');
    const nome = Buffer.from(arquivo.originalname, 'latin1').toString('utf8').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150);
    const chave = `comunicados/${id}/${randomUUID()}-${nome}`;
    await this.storage.guardar(chave, arquivo.buffer, arquivo.mimetype);
    anexos.push({ nome, storage_key: chave, tamanho: arquivo.size, tipo: arquivo.mimetype ?? null });
    return this.prisma.comunicado.update({ where: { id }, data: { anexos: anexos as unknown as Prisma.InputJsonValue } });
  }

  async tirarAnexo(id: string, indice: number) {
    const c = await this.rascunho(id);
    const anexos = ((c.anexos as Anexo[] | null) ?? []).slice();
    const [fora] = anexos.splice(indice, 1);
    if (!fora) throw new NotFoundException('Anexo não encontrado.');
    await this.storage.removeObject(fora.storage_key).catch(() => undefined);
    return this.prisma.comunicado.update({ where: { id }, data: { anexos: anexos as unknown as Prisma.InputJsonValue } });
  }

  async duplicar(user: Ator, id: string) {
    const c = await this.prisma.comunicado.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Comunicado não encontrado.');
    return this.prisma.comunicado.create({ data: { assunto: c.assunto, corpo: c.corpo, filtro: c.filtro as Prisma.InputJsonValue, anexos: [], criado_por: user.email ?? user.id } });
  }

  /** Começa o envio (em segundo plano) e devolve na hora quantos vão receber; a tela acompanha pelos contadores. */
  async enviar(user: Ator, id: string, espera = ESPERA_ENTRE_ENVIOS_MS) {
    const c = await this.rascunho(id);
    if (!this.mail.configurado) throw new BadRequestException('E-mail (SMTP) não configurado (Administração > Integrações).');
    const { incluidos } = await this.destinatarios(c.filtro);
    if (!incluidos.length) throw new BadRequestException('Nenhum destinatário com e-mail de contato para esse filtro.');
    await this.prisma.comunicado.update({ where: { id }, data: { status: 'ENVIANDO', total: incluidos.length, enviados: 0, falhas: 0, enviado_em: new Date() } });
    const tarefa = this.disparar(id, c.assunto, c.corpo, (c.anexos as Anexo[] | null) ?? [], incluidos, espera);
    tarefa.catch((e) => this.logger.error(`Envio do comunicado ${id} parou: ${(e as Error).message}`));
    return { iniciado: true, total: incluidos.length };
  }

  /** O envio em si (exportado para o teste esperar). */
  async disparar(id: string, assunto: string, corpo: string, anexos: Anexo[], para: { empresa_id: string; email: string }[], espera: number) {
    const arquivos = [];
    for (const a of anexos) arquivos.push({ filename: a.nome, content: await this.storage.getObjectBuffer(a.storage_key), contentType: a.tipo ?? undefined });
    let enviados = 0;
    let falhas = 0;
    for (const p of para) {
      const sair = this.linkDeSaida(p.email);
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:640px">${corpoEmHtml(corpo)}<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"><p style="font-size:12px;color:#6b7280">Enviado pela FAL Agro pelo InTAX. Para não receber mais comunicados, <a href="${esc(sair)}">clique aqui</a>.</p></div>`;
      const r = await this.mail.enviar({ to: p.email, subject: assunto, html, text: `${corpo}\n\n--\nPara não receber mais comunicados: ${sair}`, attachments: arquivos, headers: { 'List-Unsubscribe': `<${sair}>` } });
      await this.prisma.envioEmail.create({ data: { origem: 'COMUNICADO', origem_id: id, empresa_id: p.empresa_id, destinatario: p.email, assunto, status: r.enviado ? 'ENVIADO' : 'FALHA', erro: r.enviado ? null : (r.motivo ?? 'falha').slice(0, 300) } });
      if (r.enviado) enviados++; else falhas++;
      await this.prisma.comunicado.update({ where: { id }, data: { enviados, falhas } });
      if (espera) await new Promise((ok) => setTimeout(ok, espera));
    }
    await this.prisma.comunicado.update({ where: { id }, data: { status: falhas && !enviados ? 'ERRO' : 'ENVIADO' } });
    return { enviados, falhas };
  }

  // ── Registro de envios e lista de bloqueio ───────────────────────
  listarEnvios(f: { empresa_id?: string; status?: string; origem?: string; de?: string; ate?: string }) {
    const criado: Prisma.DateTimeFilter = {};
    if (f.de && /^\d{4}-\d{2}-\d{2}$/.test(f.de)) criado.gte = new Date(`${f.de}T03:00:00Z`);
    if (f.ate && /^\d{4}-\d{2}-\d{2}$/.test(f.ate)) criado.lt = new Date(Date.parse(`${f.ate}T03:00:00Z`) + 86_400_000);
    return this.prisma.envioEmail.findMany({
      where: { ...(f.empresa_id ? { empresa_id: f.empresa_id } : {}), ...(f.status ? { status: f.status } : {}), ...(f.origem ? { origem: f.origem } : {}), ...(Object.keys(criado).length ? { createdAt: criado } : {}) },
      orderBy: { createdAt: 'desc' }, take: 1000,
    });
  }

  listarBloqueios() {
    return this.prisma.bloqueioEnvio.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async bloquear(user: Ator, e: { email?: string; motivo?: string }) {
    const email = String(e.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw new BadRequestException('E-mail inválido.');
    return this.prisma.bloqueioEnvio.upsert({ where: { email }, create: { email, motivo: e.motivo?.trim().slice(0, 200) || null, criado_por: user.email ?? user.id }, update: { motivo: e.motivo?.trim().slice(0, 200) || undefined } });
  }

  async desbloquear(id: string) {
    if (!(await this.prisma.bloqueioEnvio.findUnique({ where: { id } }))) throw new NotFoundException('E-mail não está na lista.');
    await this.prisma.bloqueioEnvio.delete({ where: { id } });
    return { removido: true };
  }
}
