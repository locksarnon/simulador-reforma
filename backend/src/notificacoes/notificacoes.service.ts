import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { hojeEmBrasilia, STATUS_ABERTOS, utcDe } from '../tarefas/tarefas.regras';

/** As categorias do sino (o filtro da central usa as mesmas). */
export const CATEGORIAS = ['TAREFA', 'AGENDA', 'CERTIFICADO', 'DOCUMENTO', 'CAPTURA', 'ACESSO', 'FISCAL', 'SISTEMA'] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export type NovaNotificacao = { destinatario: string; tipo: Categoria; titulo: string; mensagem?: string | null; link?: string | null; chave?: string | null };

/** Dias que faltam para vencer em que o aviso de certificado sai (uma vez em cada faixa). */
export const FAIXAS_DE_VENCIMENTO = [30, 15, 7, 1, 0];
const DIA_MS = 86_400_000;
const LIMITE_RECUSAS_ACESSO = 5;

/** A faixa de aviso alcançada (a menor), ou null se ainda falta mais de 30 dias. */
export function faixaDeVencimento(diasRestantes: number): number | null {
  const alcancadas = FAIXAS_DE_VENCIMENTO.filter((f) => diasRestantes <= f);
  return alcancadas.length ? Math.min(...alcancadas) : null;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const CHAVE_AVISOS_EMAIL = 'avisos.email';
export type ConfigAvisosEmail = { ativo: boolean; destinatarios: string[]; categorias: Categoria[] };
const PADRAO_AVISOS_EMAIL: ConfigAvisosEmail = { ativo: false, destinatarios: [], categorias: ['CERTIFICADO', 'DOCUMENTO', 'CAPTURA', 'ACESSO'] };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const fmtData = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/**
 * Notificações do sino. Cada aviso tem uma chave: o mesmo aviso (mesma chave) não se repete para a mesma pessoa. A rotina diária
 * (07:00 de Brasília) junta tudo num aviso por assunto, para o sino não virar ruído: tarefas atrasadas e do dia, certificados A1
 * perto de vencer, capturas de XML com falha e tentativas de entrada recusadas.
 */
@Injectable()
export class NotificacoesService {
  private readonly logger = new Logger(NotificacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mail?: MailService,
  ) {}

  // ── Cópia por e-mail dos avisos (destinatários escolhidos pelo administrador) ──
  async configAvisosEmail(): Promise<ConfigAvisosEmail> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { chave: CHAVE_AVISOS_EMAIL } });
    if (!p) return PADRAO_AVISOS_EMAIL;
    try { return { ...PADRAO_AVISOS_EMAIL, ...JSON.parse(p.valor) }; } catch { return PADRAO_AVISOS_EMAIL; }
  }

  async salvarAvisosEmail(e: { ativo?: boolean; destinatarios?: string[]; categorias?: string[] }) {
    const destinatarios = [...new Set((e.destinatarios ?? []).map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
    for (const d of destinatarios) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d)) throw new BadRequestException(`E-mail inválido: ${d}`);
    if (destinatarios.length > 20) throw new BadRequestException('Até 20 destinatários.');
    const c: ConfigAvisosEmail = { ativo: Boolean(e.ativo), destinatarios, categorias: (e.categorias ?? []).filter((x): x is Categoria => CATEGORIAS.includes(x as Categoria)) };
    if (c.ativo && !c.destinatarios.length) throw new BadRequestException('Informe pelo menos um destinatário para ligar a cópia por e-mail.');
    await this.prisma.parametroSistema.upsert({ where: { chave: CHAVE_AVISOS_EMAIL }, create: { chave: CHAVE_AVISOS_EMAIL, valor: JSON.stringify(c), descricao: 'Cópia por e-mail dos avisos do sistema' }, update: { valor: JSON.stringify(c) } });
    return c;
  }

  /** Manda a cópia do aviso por e-mail, se ligada para a categoria; cada envio fica no registro de e-mails. */
  private async copiaPorEmail(n: Omit<NovaNotificacao, 'destinatario'>) {
    if (!this.mail?.configurado) return 0;
    const c = await this.configAvisosEmail();
    if (!c.ativo || !c.categorias.includes(n.tipo)) return 0;
    const bloqueados = new Set((await this.prisma.bloqueioEnvio.findMany({ select: { email: true } })).map((b) => b.email.toLowerCase()));
    let enviados = 0;
    for (const para of c.destinatarios.filter((d) => !bloqueados.has(d))) {
      const link = n.link ? `${this.mail.urlPublica}${n.link}` : this.mail.urlPublica;
      const r = await this.mail.enviar({ to: para, subject: `[InTAX] ${n.titulo}`, html: `<p>${esc(n.titulo)}</p>${n.mensagem ? `<p>${esc(n.mensagem)}</p>` : ''}<p><a href="${esc(link)}">Abrir no InTAX</a></p>`, text: `${n.titulo}\n${n.mensagem ?? ''}\n${link}` });
      await this.prisma.envioEmail.create({ data: { origem: 'AVISO', destinatario: para, assunto: `[InTAX] ${n.titulo}`.slice(0, 250), status: r.enviado ? 'ENVIADO' : 'FALHA', erro: r.enviado ? null : (r.motivo ?? '').slice(0, 300) } });
      if (r.enviado) enviados++;
    }
    return enviados;
  }

  /** Cria o aviso; devolve false se a pessoa já recebeu um com a mesma chave. */
  async criar(n: NovaNotificacao): Promise<boolean> {
    try {
      await this.prisma.notificacao.create({
        data: { destinatario: n.destinatario, tipo: n.tipo, titulo: n.titulo.slice(0, 200), mensagem: n.mensagem?.slice(0, 1000) ?? null, link: n.link ?? null, chave: n.chave ?? null },
      });
      return true;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return false; // já avisado
      throw e;
    }
  }

  async criarParaAdmins(n: Omit<NovaNotificacao, 'destinatario'>) {
    const admins = await this.prisma.user.findMany({ where: { role: 'admin', ativo: true }, select: { id: true } });
    let criadas = 0;
    for (const a of admins) if (await this.criar({ ...n, destinatario: a.id })) criadas++;
    // Aviso novo (não repetido): vai também por e-mail para os destinatários configurados.
    if (criadas) await this.copiaPorEmail(n).catch((e) => this.logger.warn(`Cópia do aviso por e-mail não enviada: ${(e as Error).message}`));
    return criadas;
  }

  async listar(userId: string, f: { categoria?: string; nao_lidas?: string; limite?: number } = {}) {
    return this.prisma.notificacao.findMany({
      where: {
        destinatario: userId,
        ...(f.categoria && CATEGORIAS.includes(f.categoria as Categoria) ? { tipo: f.categoria } : {}),
        ...(f.nao_lidas === '1' || f.nao_lidas === 'true' ? { lida_em: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Number(f.limite) || 50, 1), 300),
    });
  }

  async contagem(userId: string) {
    return { nao_lidas: await this.prisma.notificacao.count({ where: { destinatario: userId, lida_em: null } }) };
  }

  async marcarLida(userId: string, id: string) {
    const n = await this.prisma.notificacao.findUnique({ where: { id } });
    if (!n || n.destinatario !== userId) throw new NotFoundException('Notificação não encontrada.');
    if (!n.lida_em) await this.prisma.notificacao.update({ where: { id }, data: { lida_em: new Date() } });
    return { lida: true };
  }

  async marcarTodasLidas(userId: string, categoria?: string) {
    const r = await this.prisma.notificacao.updateMany({
      where: { destinatario: userId, lida_em: null, ...(categoria && CATEGORIAS.includes(categoria as Categoria) ? { tipo: categoria } : {}) },
      data: { lida_em: new Date() },
    });
    return { marcadas: r.count };
  }

  // ── Avisos na hora ────────────────────────────────────────────────
  /** Avisa quem recebeu uma tarefa de outra pessoa (quem atribui a si mesmo não é avisado). */
  async tarefaAtribuida(t: { id: string; titulo: string; responsavel: string | null; prazo: Date | null }, atorId?: string) {
    if (!t.responsavel || t.responsavel === atorId) return false;
    return this.criar({
      destinatario: t.responsavel, tipo: 'TAREFA', titulo: `Nova tarefa para você: ${t.titulo}`,
      mensagem: t.prazo ? `Prazo: ${fmtData(t.prazo)}.` : 'Sem prazo definido.', link: '/bpo/tarefas', chave: `atribuida:${t.id}:${t.responsavel}`,
    });
  }

  // ── Rotina diária ─────────────────────────────────────────────────
  @Cron('0 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async rotinaDiaria(agora = new Date()) {
    const r = { tarefas: 0, certificados: 0, capturas: 0, acessos: 0, removidas: 0 };
    for (const [chave, passo] of [
      ['tarefas', () => this.avisarTarefas(agora)], ['certificados', () => this.avisarCertificados(agora)],
      ['capturas', () => this.avisarCapturas(agora)], ['acessos', () => this.avisarAcessos(agora)], ['removidas', () => this.limparAntigas(agora)],
    ] as const) {
      try { r[chave] = await passo(); } catch (e) { this.logger.error(`Rotina de notificações (${chave}) falhou: ${(e as Error).message}`); }
    }
    return r;
  }

  /** Um aviso por pessoa por dia: quantas tarefas dela estão atrasadas, vencem hoje ou chegaram nas últimas 24 horas. */
  async avisarTarefas(agora = new Date()) {
    const hojeBR = hojeEmBrasilia(agora);
    const hoje = utcDe(hojeBR);
    const dia = hoje.toISOString().slice(0, 10);
    const abertas = await this.prisma.tarefa.findMany({ where: { status: { in: STATUS_ABERTOS } }, select: { responsavel: true, prazo: true, createdAt: true } });
    const porPessoa = new Map<string, { atrasadas: number; hoje: number; novas: number }>();
    let semResponsavelAtrasadas = 0;
    for (const t of abertas) {
      const atrasada = !!t.prazo && t.prazo.getTime() < hoje.getTime();
      const venceHoje = !!t.prazo && t.prazo.getTime() === hoje.getTime();
      const nova = agora.getTime() - t.createdAt.getTime() <= DIA_MS;
      if (!t.responsavel) { if (atrasada) semResponsavelAtrasadas++; continue; }
      const c = porPessoa.get(t.responsavel) ?? { atrasadas: 0, hoje: 0, novas: 0 };
      if (atrasada) c.atrasadas++;
      if (venceHoje) c.hoje++;
      if (nova) c.novas++;
      porPessoa.set(t.responsavel, c);
    }
    let criadas = 0;
    for (const [pessoa, c] of porPessoa) {
      const partes = [c.atrasadas && plural(c.atrasadas, 'atrasada', 'atrasadas'), c.hoje && plural(c.hoje, 'vence hoje', 'vencem hoje'), c.novas && plural(c.novas, 'nova', 'novas')].filter(Boolean);
      if (!partes.length) continue;
      if (await this.criar({ destinatario: pessoa, tipo: 'TAREFA', titulo: `Suas tarefas: ${partes.join(', ')}`, mensagem: 'Veja em BPO Fiscal > Processos e tarefas.', link: '/bpo/tarefas', chave: `tarefas:${dia}` })) criadas++;
    }
    if (semResponsavelAtrasadas) {
      criadas += await this.criarParaAdmins({ tipo: 'TAREFA', titulo: `${plural(semResponsavelAtrasadas, 'tarefa atrasada', 'tarefas atrasadas')} sem responsável`, mensagem: 'Distribua na tela de tarefas (cartão Sem responsável).', link: '/bpo/tarefas', chave: `tarefas-sem-responsavel:${dia}` });
    }
    return criadas;
  }

  /** Certificado A1 de cliente perto de vencer: avisa os administradores uma vez em cada faixa (30, 15, 7, 1 dia e no vencimento). */
  async avisarCertificados(agora = new Date()) {
    const certs = await this.prisma.certificadoDigital.findMany({
      where: { status: 'ATIVO', valido_ate: { lte: new Date(agora.getTime() + 30 * DIA_MS) } },
      select: { id: true, empresa_id: true, titular: true, valido_ate: true },
    });
    let criadas = 0;
    for (const c of certs) {
      const dias = Math.floor((c.valido_ate.getTime() - agora.getTime()) / DIA_MS);
      const faixa = faixaDeVencimento(dias);
      if (faixa === null) continue;
      const empresa = await this.prisma.empresa.findUnique({ where: { id: c.empresa_id }, select: { razao_social: true } });
      const quando = dias < 0 ? `venceu há ${-dias} dia(s)` : dias === 0 ? 'vence hoje' : `vence em ${dias} dia(s)`;
      criadas += await this.criarParaAdmins({
        tipo: 'CERTIFICADO', titulo: `Certificado A1 de ${empresa?.razao_social ?? c.titular} ${quando}`,
        mensagem: 'Quando vence, a captura de XML do cliente para. Envie o certificado renovado.', link: `/bpo/repositorio-xml/${c.empresa_id}`, chave: `certificado:${c.id}:${faixa}`,
      });
    }
    return criadas;
  }

  /** Capturas de XML que terminaram com mensagem de erro nas últimas 24 horas: um aviso por dia para os administradores. */
  async avisarCapturas(agora = new Date()) {
    const desde = new Date(agora.getTime() - DIA_MS);
    const execucoes = await this.prisma.capturaXmlExecucao.findMany({
      where: { iniciado_em: { gte: desde } },
      select: { empresa_id: true, mensagem: true, ultimo_cstat: true },
    });
    // O serviço de captura grava "Falha de comunicação..." ou "Captura interrompida..." quando dá erro; 656 é o bloqueio da SEFAZ por consumo indevido.
    const comErro = execucoes.filter((f) => /^(Falha de comunicação|Captura interrompida)/.test(f.mensagem ?? '') || f.ultimo_cstat === '656');
    if (!comErro.length) return 0;
    const empresas = new Set(comErro.map((f) => f.empresa_id)).size;
    const dia = utcDe(hojeEmBrasilia(agora)).toISOString().slice(0, 10);
    return this.criarParaAdmins({
      tipo: 'CAPTURA', titulo: `Captura de XML: ${plural(comErro.length, 'consulta com problema', 'consultas com problema')} em ${plural(empresas, 'empresa', 'empresas')}`,
      mensagem: 'Confira o histórico de captura de cada empresa no Repositório de XML.', link: '/bpo/repositorio-xml', chave: `captura:${dia}`,
    });
  }

  /** Muitas entradas recusadas (senha errada ou IP fora da lista) nas últimas 24 horas: avisa os administradores, uma vez por dia. */
  async avisarAcessos(agora = new Date()) {
    const desde = new Date(agora.getTime() - DIA_MS);
    const recusas = await this.prisma.acessoLog.count({ where: { createdAt: { gte: desde }, resultado: { in: ['FALHA', 'BLOQUEADO_IP', 'INATIVO'] } } });
    if (recusas < LIMITE_RECUSAS_ACESSO) return 0;
    const dia = utcDe(hojeEmBrasilia(agora)).toISOString().slice(0, 10);
    return this.criarParaAdmins({
      tipo: 'ACESSO', titulo: `${recusas} tentativas de entrada recusadas nas últimas 24 horas`,
      mensagem: 'Confira quem tentou entrar em Administração > Registro de acesso e IPs.', link: '/admin/acessos', chave: `acessos:${dia}`,
    });
  }

  /** Avisos lidos há mais de 90 dias saem, para a central não crescer sem fim. */
  async limparAntigas(agora = new Date()) {
    const r = await this.prisma.notificacao.deleteMany({ where: { lida_em: { lt: new Date(agora.getTime() - 90 * DIA_MS) } } });
    return r.count;
  }
}
