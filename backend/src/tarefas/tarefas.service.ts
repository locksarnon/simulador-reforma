import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrismaService } from '../prisma/prisma.service';
import { hojeEmBrasilia, lerData, PRIORIDADES, STATUS_ABERTOS, STATUS_TAREFA, utcDe } from './tarefas.regras';

type Ator = { id: string; role?: string };
export type EntradaTarefa = {
  titulo?: string; descricao?: string | null; empresa_id?: string | null; responsavel?: string | null;
  prazo?: string | null; prioridade?: string; status?: string;
};
export type FiltroTarefas = {
  status?: string; responsavel?: string; empresa_id?: string; de?: string; ate?: string; busca?: string;
  competencia?: string; modelo_id?: string; atrasadas?: string; limite?: number;
};

const LIMITE_PADRAO = 500;
const DIA_MS = 86_400_000;

function texto(valor: unknown, campo: string, max: number): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  const t = String(valor).trim();
  if (t.length > max) throw new BadRequestException(`${campo} aceita até ${max} caracteres.`);
  return t || null;
}

/**
 * Tarefas do escritório: avulsas ou geradas por um processo recorrente. Qualquer pessoa cria e muda tarefas; excluir é de quem criou
 * ou do administrador. Tarefa gerada por processo não se exclui, se cancela: se fosse excluída, a rodada seguinte a criaria de novo.
 */
@Injectable()
export class TarefasService {
  private readonly logger = new Logger(TarefasService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  /** Avisa o novo responsável no sino; falha no aviso nunca impede salvar a tarefa. */
  private async avisarResponsavel(t: { id: string; titulo: string; responsavel: string | null; prazo: Date | null }, atorId?: string) {
    if (!this.notificacoes) return;
    try { await this.notificacoes.tarefaAtribuida(t, atorId); } catch (e) { this.logger.warn(`Aviso de tarefa não criado: ${(e as Error).message}`); }
  }

  private async conferirResponsavel(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: { id: true, ativo: true } });
    if (!u || !u.ativo) throw new BadRequestException('O responsável escolhido não existe ou está desativado.');
  }

  private async conferirEmpresa(id: string) {
    if (!(await this.prisma.empresa.count({ where: { id } }))) throw new NotFoundException('Empresa não encontrada.');
  }

  /** Confere e normaliza o que veio da tela. `parcial` deixa de fora o que não foi enviado. */
  private async normalizar(e: EntradaTarefa, parcial: boolean) {
    const dados: Prisma.TarefaUncheckedUpdateInput = {};
    if (!parcial || e.titulo !== undefined) {
      const t = texto(e.titulo, 'O título', 200);
      if (!t) throw new BadRequestException('Informe o título da tarefa.');
      dados.titulo = t;
    }
    const descricao = texto(e.descricao, 'A descrição', 2000);
    if (descricao !== undefined) dados.descricao = descricao;
    if (e.empresa_id !== undefined) {
      const id = e.empresa_id ? String(e.empresa_id) : null;
      if (id) await this.conferirEmpresa(id);
      dados.empresa_id = id;
    }
    if (e.responsavel !== undefined) {
      const id = e.responsavel ? String(e.responsavel) : null;
      if (id) await this.conferirResponsavel(id);
      dados.responsavel = id;
    }
    if (e.prazo !== undefined) {
      const p = lerData(e.prazo);
      if (p === undefined) throw new BadRequestException('Prazo inválido. Use a data no formato AAAA-MM-DD.');
      dados.prazo = p;
    }
    if (e.prioridade !== undefined) {
      if (!PRIORIDADES.includes(e.prioridade as never)) throw new BadRequestException(`Prioridade inválida. Use ${PRIORIDADES.join(', ')}.`);
      dados.prioridade = e.prioridade;
    }
    if (e.status !== undefined) {
      if (!STATUS_TAREFA.includes(e.status as never)) throw new BadRequestException(`Situação inválida. Use ${STATUS_TAREFA.join(', ')}.`);
      dados.status = e.status;
    }
    return dados;
  }

  async listar(user: Ator, f: FiltroTarefas = {}) {
    const hoje = utcDe(hojeEmBrasilia());
    const where: Prisma.TarefaWhereInput = {};
    const status = f.status ?? 'abertas';
    if (status === 'abertas') where.status = { in: STATUS_ABERTOS };
    else if (status !== 'todas') {
      if (!STATUS_TAREFA.includes(status as never)) throw new BadRequestException('Situação inválida.');
      where.status = status;
    }
    if (f.responsavel === 'eu') where.responsavel = user.id;
    else if (f.responsavel === 'sem') where.responsavel = null;
    else if (f.responsavel) where.responsavel = f.responsavel;
    if (f.empresa_id) where.empresa_id = f.empresa_id;
    if (f.competencia) where.competencia = f.competencia;
    if (f.modelo_id) where.modelo_id = f.modelo_id;
    if (f.busca?.trim()) where.titulo = { contains: f.busca.trim(), mode: 'insensitive' };
    const prazo: Prisma.DateTimeNullableFilter = {};
    if (f.de) { const d = lerData(f.de); if (!d) throw new BadRequestException('Data inicial inválida.'); prazo.gte = d; }
    if (f.ate) { const d = lerData(f.ate); if (!d) throw new BadRequestException('Data final inválida.'); prazo.lte = d; }
    if (f.atrasadas === '1' || f.atrasadas === 'true') { where.status = { in: STATUS_ABERTOS }; prazo.lt = hoje; }
    if (Object.keys(prazo).length) where.prazo = prazo;
    // Em aberto: a que vence primeiro, no alto. Concluídas e canceladas: as mexidas mais recentemente, no alto.
    const encerradas = status === 'CONCLUIDA' || status === 'CANCELADA';
    return this.prisma.tarefa.findMany({
      where,
      orderBy: encerradas ? [{ updatedAt: 'desc' }] : [{ prazo: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: Math.min(Math.max(Number(f.limite) || LIMITE_PADRAO, 1), 2000),
    });
  }

  /** Os números dos cartões da tela de tarefas (e do Início). */
  async resumo(user: Ator) {
    const hoje = utcDe(hojeEmBrasilia());
    const semana = new Date(hoje.getTime() + 6 * DIA_MS);
    const abertas = { status: { in: STATUS_ABERTOS } };
    const inicioDoMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
    const [total, atrasadas, hojeN, naSemana, semResponsavel, minhas, minhasAtrasadas, concluidasNoMes] = await Promise.all([
      this.prisma.tarefa.count({ where: abertas }),
      this.prisma.tarefa.count({ where: { ...abertas, prazo: { lt: hoje } } }),
      this.prisma.tarefa.count({ where: { ...abertas, prazo: hoje } }),
      this.prisma.tarefa.count({ where: { ...abertas, prazo: { gte: hoje, lte: semana } } }),
      this.prisma.tarefa.count({ where: { ...abertas, responsavel: null } }),
      this.prisma.tarefa.count({ where: { ...abertas, responsavel: user.id } }),
      this.prisma.tarefa.count({ where: { ...abertas, responsavel: user.id, prazo: { lt: hoje } } }),
      this.prisma.tarefa.count({ where: { status: 'CONCLUIDA', concluida_em: { gte: inicioDoMes } } }),
    ]);
    return { abertas: total, atrasadas, hoje: hojeN, semana: naSemana, sem_responsavel: semResponsavel, minhas, minhas_atrasadas: minhasAtrasadas, concluidas_no_mes: concluidasNoMes };
  }

  async criar(user: Ator & { email?: string }, entrada: EntradaTarefa) {
    const dados = await this.normalizar(entrada, false);
    const t = await this.prisma.tarefa.create({ data: { ...(dados as Prisma.TarefaUncheckedCreateInput), criado_por: user.id } });
    await this.avisarResponsavel(t, user.id);
    return t;
  }

  async atualizar(id: string, entrada: EntradaTarefa, ator?: Ator) {
    const atual = await this.prisma.tarefa.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Tarefa não encontrada.');
    const dados = await this.normalizar(entrada, true);
    // Concluir carimba a data; reabrir (ou cancelar) tira o carimbo.
    if (dados.status !== undefined) dados.concluida_em = dados.status === 'CONCLUIDA' ? (atual.concluida_em ?? new Date()) : null;
    const t = await this.prisma.tarefa.update({ where: { id }, data: dados });
    if (dados.responsavel !== undefined && dados.responsavel !== atual.responsavel) await this.avisarResponsavel(t, ator?.id);
    return t;
  }

  async excluir(user: Ator, id: string) {
    const t = await this.prisma.tarefa.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tarefa não encontrada.');
    if (t.modelo_id) throw new ConflictException('Esta tarefa foi gerada por um processo recorrente: cancele em vez de excluir, para ela não ser criada de novo.');
    if (t.criado_por !== user.id && user.role !== 'admin') throw new ForbiddenException('Só quem criou a tarefa, ou um administrador, pode excluir.');
    await this.prisma.tarefa.delete({ where: { id } });
    return { excluida: true };
  }
}
