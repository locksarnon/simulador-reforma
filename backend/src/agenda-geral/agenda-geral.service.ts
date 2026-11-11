import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrismaService } from '../prisma/prisma.service';
import { hojeEmBrasilia, STATUS_ABERTOS, utcDe } from '../tarefas/tarefas.regras';
import { FERIADOS_NACIONAIS_FIXOS } from './dias-uteis';
import { seAplica, vencimentosNoPeriodo, vencimentosDoMes } from './obrigacoes';
import { OBRIGACOES_FEDERAIS } from './obrigacoes.tabela';

type Ator = { id: string; role?: string };
export type EntradaEvento = {
  titulo?: string; descricao?: string | null; inicio?: string; fim?: string | null; dia_inteiro?: boolean; tipo_id?: string | null;
  empresa_id?: string | null; responsavel?: string | null; local?: string | null;
};

const COR = /^#[0-9a-fA-F]{6}$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 86_400_000;
const FUSO_BR_MS = 3 * 3_600_000; // Brasília, UTC−3 (sem horário de verão desde 2019)

/** A data (AAAA-MM-DD) do evento em Brasília: o dia inteiro guarda a data em UTC; o com hora, o instante. */
export function diaDoEvento(e: { inicio: Date; dia_inteiro: boolean }): string {
  return e.dia_inteiro ? e.inicio.toISOString().slice(0, 10) : new Date(e.inicio.getTime() - FUSO_BR_MS).toISOString().slice(0, 10);
}

function lerDia(v: unknown, campo: string): string {
  const s = String(v ?? '');
  if (!DIA.test(s) || Number.isNaN(Date.parse(s))) throw new BadRequestException(`${campo} inválida. Use AAAA-MM-DD.`);
  return s;
}

function lerInstante(v: unknown, diaInteiro: boolean, campo: string): Date {
  const s = String(v ?? '');
  if (diaInteiro) return new Date(`${lerDia(s.slice(0, 10), campo)}T00:00:00.000Z`);
  const d = new Date(s);
  if (!s || Number.isNaN(d.getTime())) throw new BadRequestException(`${campo} inválido.`);
  return d;
}

/**
 * Calendário geral do escritório: eventos próprios com tipo e cor, e as camadas que vêm de outros módulos (tarefas com prazo,
 * obrigações federais, certificados A1 vencendo). Os tipos de evento são configuração: só o administrador muda. Qualquer pessoa
 * cria e muda evento; excluir é de quem criou ou do administrador.
 */
@Injectable()
export class AgendaGeralService {
  private readonly logger = new Logger(AgendaGeralService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  // ── Tipos de evento ──────────────────────────────────────────────
  listarTipos() {
    return this.prisma.tipoEvento.findMany({ orderBy: { nome: 'asc' } });
  }

  private async conferirTipo(nome: unknown, cor: unknown, exceto?: string) {
    const n = String(nome ?? '').trim().replace(/\s+/g, ' ');
    if (!n) throw new BadRequestException('Informe o nome do tipo de evento.');
    if (n.length > 40) throw new BadRequestException('O nome do tipo aceita até 40 caracteres.');
    if (cor !== undefined && !COR.test(String(cor))) throw new BadRequestException('A cor precisa estar no formato #RRGGBB.');
    const igual = await this.prisma.tipoEvento.findFirst({ where: { nome: { equals: n, mode: 'insensitive' }, ...(exceto ? { id: { not: exceto } } : {}) } });
    if (igual) throw new ConflictException('Já existe um tipo de evento com esse nome.');
    return n;
  }

  async criarTipo(e: { nome?: string; cor?: string }) {
    const nome = await this.conferirTipo(e.nome, e.cor ?? '#2563EB');
    return this.prisma.tipoEvento.create({ data: { nome, cor: (e.cor ?? '#2563EB').toUpperCase() } });
  }

  async atualizarTipo(id: string, e: { nome?: string; cor?: string }) {
    if (!(await this.prisma.tipoEvento.findUnique({ where: { id } }))) throw new NotFoundException('Tipo de evento não encontrado.');
    const data: { nome?: string; cor?: string } = {};
    if (e.nome !== undefined) data.nome = await this.conferirTipo(e.nome, e.cor, id);
    if (e.cor !== undefined) {
      if (!COR.test(String(e.cor))) throw new BadRequestException('A cor precisa estar no formato #RRGGBB.');
      data.cor = String(e.cor).toUpperCase();
    }
    return this.prisma.tipoEvento.update({ where: { id }, data });
  }

  /** Apagar um tipo não apaga os eventos: eles ficam sem tipo. */
  async excluirTipo(id: string) {
    if (!(await this.prisma.tipoEvento.findUnique({ where: { id } }))) throw new NotFoundException('Tipo de evento não encontrado.');
    await this.prisma.eventoAgenda.updateMany({ where: { tipo_id: id }, data: { tipo_id: null } });
    await this.prisma.tipoEvento.delete({ where: { id } });
    return { excluido: true };
  }

  // ── Eventos ──────────────────────────────────────────────────────
  private async normalizar(e: EntradaEvento, parcial: boolean, atual?: { inicio: Date; fim: Date | null; dia_inteiro: boolean }) {
    const d: Record<string, unknown> = {};
    if (!parcial || e.titulo !== undefined) {
      const t = String(e.titulo ?? '').trim();
      if (!t) throw new BadRequestException('Informe o título do evento.');
      if (t.length > 200) throw new BadRequestException('O título aceita até 200 caracteres.');
      d.titulo = t;
    }
    if (e.descricao !== undefined) {
      const s = e.descricao === null ? '' : String(e.descricao).trim();
      if (s.length > 2000) throw new BadRequestException('A descrição aceita até 2000 caracteres.');
      d.descricao = s || null;
    }
    if (e.local !== undefined) {
      const s = e.local === null ? '' : String(e.local).trim();
      if (s.length > 200) throw new BadRequestException('O local aceita até 200 caracteres.');
      d.local = s || null;
    }
    const diaInteiro = e.dia_inteiro !== undefined ? Boolean(e.dia_inteiro) : atual?.dia_inteiro ?? false;
    if (e.dia_inteiro !== undefined) d.dia_inteiro = diaInteiro;
    if (!parcial || e.inicio !== undefined) d.inicio = lerInstante(e.inicio, diaInteiro, 'O início');
    if (e.fim !== undefined) d.fim = e.fim ? lerInstante(e.fim, diaInteiro, 'O fim') : null;
    const inicio = (d.inicio as Date | undefined) ?? atual?.inicio;
    const fim = d.fim !== undefined ? (d.fim as Date | null) : atual?.fim ?? null;
    if (inicio && fim && fim.getTime() < inicio.getTime()) throw new BadRequestException('O fim não pode ser antes do início.');
    if (e.tipo_id !== undefined) {
      if (e.tipo_id && !(await this.prisma.tipoEvento.findUnique({ where: { id: String(e.tipo_id) } }))) throw new NotFoundException('Tipo de evento não encontrado.');
      d.tipo_id = e.tipo_id || null;
    }
    if (e.empresa_id !== undefined) {
      if (e.empresa_id && !(await this.prisma.empresa.count({ where: { id: String(e.empresa_id) } }))) throw new NotFoundException('Empresa não encontrada.');
      d.empresa_id = e.empresa_id || null;
    }
    if (e.responsavel !== undefined) {
      if (e.responsavel) {
        const u = await this.prisma.user.findUnique({ where: { id: String(e.responsavel) }, select: { ativo: true } });
        if (!u || !u.ativo) throw new BadRequestException('O responsável escolhido não existe ou está desativado.');
      }
      d.responsavel = e.responsavel || null;
    }
    return d;
  }

  /** Eventos que tocam o período (datas de Brasília, inclusive). */
  async listarEventos(f: { de?: string; ate?: string; empresa_id?: string }) {
    const de = lerDia(f.de, 'A data inicial');
    const ate = lerDia(f.ate, 'A data final');
    if (ate < de) throw new BadRequestException('A data final é antes da inicial.');
    // Busca com folga de um dia de cada lado e filtra pela data de Brasília de cada evento.
    const eventos = await this.prisma.eventoAgenda.findMany({
      where: {
        inicio: { lte: new Date(Date.parse(ate) + 2 * DIA_MS) },
        OR: [{ fim: null, inicio: { gte: new Date(Date.parse(de) - DIA_MS) } }, { fim: { gte: new Date(Date.parse(de) - DIA_MS) } }],
        ...(f.empresa_id ? { empresa_id: f.empresa_id } : {}),
      },
      orderBy: { inicio: 'asc' },
    });
    return eventos.filter((e) => {
      const ini = diaDoEvento(e);
      const fim = e.fim ? diaDoEvento({ inicio: e.fim, dia_inteiro: e.dia_inteiro }) : ini;
      return ini <= ate && fim >= de;
    });
  }

  private async avisar(e: { id: string; titulo: string; responsavel: string | null; inicio: Date; dia_inteiro: boolean }, atorId?: string) {
    if (!this.notificacoes || !e.responsavel || e.responsavel === atorId) return;
    try {
      const quando = e.dia_inteiro ? e.inicio.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : e.inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
      await this.notificacoes.criar({ destinatario: e.responsavel, tipo: 'AGENDA', titulo: `Evento para você: ${e.titulo}`, mensagem: `Quando: ${quando}.`, link: '/bpo/agenda', chave: `evento-atribuido:${e.id}:${e.responsavel}` });
    } catch (err) {
      this.logger.warn(`Aviso de evento não criado: ${(err as Error).message}`);
    }
  }

  async criarEvento(user: Ator, entrada: EntradaEvento) {
    const d = await this.normalizar(entrada, false);
    const e = await this.prisma.eventoAgenda.create({ data: { ...(d as { titulo: string; inicio: Date }), criado_por: user.id } });
    await this.avisar(e, user.id);
    return e;
  }

  async atualizarEvento(user: Ator, id: string, entrada: EntradaEvento) {
    const atual = await this.prisma.eventoAgenda.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Evento não encontrado.');
    const d = await this.normalizar(entrada, true, atual);
    const e = await this.prisma.eventoAgenda.update({ where: { id }, data: d });
    if (d.responsavel !== undefined && d.responsavel !== atual.responsavel) await this.avisar(e, user.id);
    return e;
  }

  async excluirEvento(user: Ator, id: string) {
    const e = await this.prisma.eventoAgenda.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Evento não encontrado.');
    if (e.criado_por !== user.id && user.role !== 'admin') throw new ForbiddenException('Só quem criou o evento, ou um administrador, pode excluir.');
    await this.prisma.eventoAgenda.delete({ where: { id } });
    return { excluido: true };
  }

  // ── Camadas do calendário ────────────────────────────────────────
  /** Tudo o que aparece no calendário do período: eventos, tarefas com prazo, obrigações federais e certificados vencendo. */
  async camadas(f: { de?: string; ate?: string; empresa_id?: string }) {
    const de = lerDia(f.de, 'A data inicial');
    const ate = lerDia(f.ate, 'A data final');
    if (Date.parse(ate) - Date.parse(de) > 120 * DIA_MS) throw new BadRequestException('Escolha um período de até 4 meses.');
    const empresa = f.empresa_id ? await this.prisma.empresa.findUnique({ where: { id: f.empresa_id }, select: { id: true, regime_atual: true } }) : null;
    if (f.empresa_id && !empresa) throw new NotFoundException('Empresa não encontrada.');
    const [eventos, tarefas, certificados] = await Promise.all([
      this.listarEventos({ de, ate, empresa_id: f.empresa_id }),
      this.prisma.tarefa.findMany({
        where: { status: { in: STATUS_ABERTOS }, prazo: { gte: new Date(`${de}T00:00:00Z`), lte: new Date(`${ate}T00:00:00Z`) }, ...(f.empresa_id ? { empresa_id: f.empresa_id } : {}) },
        select: { id: true, titulo: true, prazo: true, empresa_id: true, responsavel: true, prioridade: true, status: true },
      }),
      this.prisma.certificadoDigital.findMany({
        where: { status: 'ATIVO', valido_ate: { gte: new Date(`${de}T00:00:00Z`), lte: new Date(Date.parse(ate) + DIA_MS) }, ...(f.empresa_id ? { empresa_id: f.empresa_id } : {}) },
        select: { id: true, empresa_id: true, titular: true, valido_ate: true },
      }),
    ]);
    return {
      eventos,
      tarefas,
      obrigacoes: vencimentosNoPeriodo(de, ate, empresa?.regime_atual ?? null),
      certificados: certificados.map((c) => ({ ...c, dia: new Date(c.valido_ate.getTime() - FUSO_BR_MS).toISOString().slice(0, 10) })),
      regime: empresa ? empresa.regime_atual ?? null : undefined,
    };
  }

  // ── Agenda de obrigações ─────────────────────────────────────────
  /**
   * Obrigações federais que vencem no mês (AAAA-MM). Com empresa, filtra pelo regime dela. Sem empresa, devolve também as empresas
   * do BPO fiscal ativo e quais obrigações valem para cada uma (pelo regime do cadastro).
   */
  async obrigacoes(f: { mes?: string; empresa_id?: string }) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(f.mes ?? ''));
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new BadRequestException('Informe o mês no formato AAAA-MM.');
    const ano = Number(m[1]);
    const mes = Number(m[2]);
    if (f.empresa_id) {
      const e = await this.prisma.empresa.findUnique({ where: { id: f.empresa_id }, select: { id: true, razao_social: true, regime_atual: true } });
      if (!e) throw new NotFoundException('Empresa não encontrada.');
      return { mes: f.mes, empresa: e, vencimentos: vencimentosDoMes(ano, mes, e.regime_atual), feriados: FERIADOS_NACIONAIS_FIXOS };
    }
    const vencimentos = vencimentosDoMes(ano, mes);
    const bpo = await this.prisma.servicoContratado.findMany({ where: { tipo: 'BPO_FISCAL', situacao: { in: ['ATIVO', 'PAUSADO'] } }, select: { empresa_id: true } });
    const empresas = bpo.length
      ? await this.prisma.empresa.findMany({ where: { id: { in: [...new Set(bpo.map((s) => s.empresa_id))] } }, select: { id: true, razao_social: true, regime_atual: true }, orderBy: { razao_social: 'asc' } })
      : [];
    return {
      mes: f.mes,
      vencimentos,
      feriados: FERIADOS_NACIONAIS_FIXOS,
      empresas: empresas.map((e) => ({ ...e, obrigacoes: OBRIGACOES_FEDERAIS.filter((o) => seAplica(o, e.regime_atual) && vencimentos.some((v) => v.obrigacao === o.id)).map((o) => o.id) })),
    };
  }

  // ── Avisos diários (07:05 de Brasília) ───────────────────────────
  @Cron('5 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async avisarAgenda(agora = new Date()) {
    if (!this.notificacoes) return { eventos: 0, obrigacoes: 0 };
    let eventos = 0;
    let obrigacoes = 0;
    try {
      const hoje = utcDe(hojeEmBrasilia(agora)).toISOString().slice(0, 10);
      const amanha = new Date(Date.parse(hoje) + DIA_MS).toISOString().slice(0, 10);
      for (const e of await this.listarEventos({ de: hoje, ate: amanha })) {
        const pessoa = e.responsavel ?? e.criado_por;
        if (!pessoa || pessoa === 'processo') continue;
        const dia = diaDoEvento(e);
        const hora = e.dia_inteiro ? '' : ` às ${e.inicio.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
        if (await this.notificacoes.criar({ destinatario: pessoa, tipo: 'AGENDA', titulo: `${dia === hoje ? 'Hoje' : 'Amanhã'}: ${e.titulo}${hora}`, mensagem: e.local ? `Local: ${e.local}.` : null, link: '/bpo/agenda', chave: `evento:${e.id}:${dia}` })) eventos++;
      }
      const ate = new Date(Date.parse(hoje) + 3 * DIA_MS).toISOString().slice(0, 10);
      const proximas = vencimentosNoPeriodo(hoje, ate);
      if (proximas.length) {
        const lista = proximas.map((v) => `${v.nome} (${v.data.slice(8, 10)}/${v.data.slice(5, 7)})`).join(', ');
        obrigacoes = await this.notificacoes.criarParaAdmins({ tipo: 'AGENDA', titulo: `Obrigações federais nos próximos 3 dias: ${proximas.length}`, mensagem: lista, link: '/bpo/agenda', chave: `obrigacoes:${hoje}` });
      }
    } catch (err) {
      this.logger.error(`Avisos da agenda falharam: ${(err as Error).message}`);
    }
    return { eventos, obrigacoes };
  }
}
