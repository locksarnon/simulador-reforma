import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calcularHonorarioMensal, EntradaHonorarios, TABELA_EXEMPLO, TabelaHonorarios, validarTabela } from './honorarios';

type Ator = { id: string; email?: string; role?: string };
export const SERVICOS_DA_PROPOSTA = ['BPO_FISCAL', 'DIAGNOSTICO_PONTUAL', 'OUTRO'] as const;
export const STATUS_DA_PROPOSTA = ['RASCUNHO', 'ENVIADA', 'ACEITA', 'RECUSADA'] as const;
const CHAVE_TABELA = 'honorarios.tabela';

export type Item = { descricao: string; quantidade: number; valor_unitario: number; recorrente?: boolean };
export type EntradaProposta = {
  empresa_id?: string | null; lead_id?: string | null; cliente_nome?: string; cliente_documento?: string | null; cliente_email?: string | null;
  servico?: string; modelo_id?: string | null; escopo?: string | null; itens?: unknown; validade?: string | null; condicoes?: string | null;
  observacoes?: string | null; calculo?: unknown;
};

const texto = (v: unknown, max: number, campo: string) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  if (s.length > max) throw new BadRequestException(`${campo} aceita até ${max} caracteres.`);
  return s || null;
};

/** Itens da proposta: descrição, quantidade e valor; "recorrente" marca o que é mensal (honorário) e o resto é valor único. */
export function normalizarItens(bruto: unknown): Item[] {
  if (!Array.isArray(bruto)) throw new BadRequestException('Informe os itens da proposta.');
  if (bruto.length > 50) throw new BadRequestException('A proposta aceita até 50 itens.');
  return bruto.map((i, k) => {
    const x = (i ?? {}) as Record<string, unknown>;
    const descricao = String(x.descricao ?? '').trim();
    if (!descricao) throw new BadRequestException(`O item ${k + 1} está sem descrição.`);
    const quantidade = Number(x.quantidade ?? 1);
    const valor = Number(x.valor_unitario ?? 0);
    if (!Number.isFinite(quantidade) || quantidade <= 0) throw new BadRequestException(`Quantidade inválida no item ${k + 1}.`);
    if (!Number.isFinite(valor) || valor < 0) throw new BadRequestException(`Valor inválido no item ${k + 1}.`);
    return { descricao: descricao.slice(0, 300), quantidade, valor_unitario: Math.round(valor * 100) / 100, recorrente: Boolean(x.recorrente) };
  });
}

/** Totais: o mensal (itens recorrentes) e o único (o resto). */
export function totais(itens: Item[]) {
  const soma = (f: (i: Item) => boolean) => Math.round(itens.filter(f).reduce((s, i) => s + i.quantidade * i.valor_unitario, 0) * 100) / 100;
  return { mensal: soma((i) => !!i.recorrente), unico: soma((i) => !i.recorrente) };
}

/**
 * Propostas comerciais e honorários. Qualquer pessoa cria e muda propostas; a tabela de honorários e os modelos são configuração
 * (só o administrador muda). Proposta aceita de empresa do cadastro marca o serviço contratado dela como ativo.
 */
@Injectable()
export class PropostasService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Tabela de honorários ─────────────────────────────────────────
  async tabela(): Promise<TabelaHonorarios> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { chave: CHAVE_TABELA } });
    if (!p) return TABELA_EXEMPLO;
    try { return { ...validarTabela(JSON.parse(p.valor)), exemplo: false }; } catch { return TABELA_EXEMPLO; }
  }

  async salvarTabela(bruta: unknown) {
    const t = validarTabela(bruta);
    await this.prisma.parametroSistema.upsert({
      where: { chave: CHAVE_TABELA }, create: { chave: CHAVE_TABELA, valor: JSON.stringify(t), descricao: 'Tabela de honorários do BPO fiscal' }, update: { valor: JSON.stringify(t) },
    });
    return { ...t, exemplo: false };
  }

  async calcular(e: EntradaHonorarios) {
    return calcularHonorarioMensal(await this.tabela(), e);
  }

  // ── Modelos ──────────────────────────────────────────────────────
  listarModelos() {
    return this.prisma.modeloProposta.findMany({ orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] });
  }

  private dadosDoModelo(e: { nome?: string; servico?: string; escopo?: string | null; itens?: unknown; condicoes?: string | null; ativo?: boolean }, parcial: boolean) {
    const d: Record<string, unknown> = {};
    if (!parcial || e.nome !== undefined) {
      const nome = String(e.nome ?? '').trim();
      if (!nome) throw new BadRequestException('Informe o nome do modelo.');
      d.nome = nome.slice(0, 120);
    }
    if (!parcial || e.servico !== undefined) {
      if (!SERVICOS_DA_PROPOSTA.includes(e.servico as never)) throw new BadRequestException('Serviço inválido.');
      d.servico = e.servico;
    }
    if (e.escopo !== undefined) d.escopo = texto(e.escopo, 5000, 'O escopo');
    if (e.condicoes !== undefined) d.condicoes = texto(e.condicoes, 3000, 'As condições');
    if (!parcial || e.itens !== undefined) d.itens = normalizarItens(e.itens ?? []);
    if (e.ativo !== undefined) d.ativo = Boolean(e.ativo);
    return d;
  }

  async criarModelo(e: Parameters<PropostasService['dadosDoModelo']>[0]) {
    const d = this.dadosDoModelo(e, false);
    if (await this.prisma.modeloProposta.findFirst({ where: { nome: { equals: d.nome as string, mode: 'insensitive' } } })) throw new ConflictException('Já existe um modelo com esse nome.');
    return this.prisma.modeloProposta.create({ data: d as Prisma.ModeloPropostaCreateInput });
  }

  async atualizarModelo(id: string, e: Parameters<PropostasService['dadosDoModelo']>[0]) {
    if (!(await this.prisma.modeloProposta.findUnique({ where: { id } }))) throw new NotFoundException('Modelo não encontrado.');
    return this.prisma.modeloProposta.update({ where: { id }, data: this.dadosDoModelo(e, true) });
  }

  async excluirModelo(id: string) {
    if (!(await this.prisma.modeloProposta.findUnique({ where: { id } }))) throw new NotFoundException('Modelo não encontrado.');
    await this.prisma.modeloProposta.delete({ where: { id } });
    return { excluido: true };
  }

  // ── Propostas ────────────────────────────────────────────────────
  listar(f: { status?: string } = {}) {
    return this.prisma.proposta.findMany({ where: f.status && STATUS_DA_PROPOSTA.includes(f.status as never) ? { status: f.status } : {}, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  async obter(id: string) {
    const p = await this.prisma.proposta.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Proposta não encontrada.');
    return p;
  }

  private async dados(e: EntradaProposta, parcial: boolean) {
    const d: Record<string, unknown> = {};
    if (e.empresa_id !== undefined) {
      if (e.empresa_id && !(await this.prisma.empresa.count({ where: { id: e.empresa_id } }))) throw new NotFoundException('Empresa não encontrada.');
      d.empresa_id = e.empresa_id || null;
    }
    if (e.lead_id !== undefined) d.lead_id = e.lead_id || null;
    if (!parcial || e.cliente_nome !== undefined) {
      const nome = String(e.cliente_nome ?? '').trim();
      if (!nome) throw new BadRequestException('Informe o nome do cliente.');
      d.cliente_nome = nome.slice(0, 200);
    }
    if (e.cliente_documento !== undefined) d.cliente_documento = texto(e.cliente_documento, 20, 'O CNPJ/CPF');
    if (e.cliente_email !== undefined) {
      const em = texto(e.cliente_email, 200, 'O e-mail');
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new BadRequestException('E-mail do cliente inválido.');
      d.cliente_email = em;
    }
    if (!parcial || e.servico !== undefined) {
      if (!SERVICOS_DA_PROPOSTA.includes(e.servico as never)) throw new BadRequestException('Serviço inválido. Use BPO_FISCAL, DIAGNOSTICO_PONTUAL ou OUTRO.');
      d.servico = e.servico;
    }
    if (e.modelo_id !== undefined) d.modelo_id = e.modelo_id || null;
    if (e.escopo !== undefined) d.escopo = texto(e.escopo, 5000, 'O escopo');
    if (e.condicoes !== undefined) d.condicoes = texto(e.condicoes, 3000, 'As condições');
    if (e.observacoes !== undefined) d.observacoes = texto(e.observacoes, 3000, 'As observações');
    if (e.validade !== undefined) {
      if (e.validade && !/^\d{4}-\d{2}-\d{2}$/.test(e.validade)) throw new BadRequestException('Validade inválida. Use AAAA-MM-DD.');
      d.validade = e.validade ? new Date(`${e.validade}T00:00:00Z`) : null;
    }
    if (e.calculo !== undefined) d.calculo = e.calculo === null ? Prisma.JsonNull : (e.calculo as Prisma.InputJsonValue);
    if (!parcial || e.itens !== undefined) {
      const itens = normalizarItens(e.itens ?? []);
      if (!itens.length) throw new BadRequestException('A proposta precisa de pelo menos um item.');
      const t = totais(itens);
      d.itens = itens;
      d.honorario_mensal = t.mensal || null;
      d.valor_total = t.unico;
    }
    return d;
  }

  async criar(user: Ator, e: EntradaProposta) {
    const d = await this.dados(e, false);
    return this.prisma.proposta.create({ data: { ...(d as Prisma.PropostaUncheckedCreateInput), criado_por: user.id } });
  }

  async atualizar(id: string, e: EntradaProposta) {
    const p = await this.obter(id);
    if (p.status === 'ACEITA') throw new ConflictException('Proposta aceita não muda. Duplique para fazer outra.');
    return this.prisma.proposta.update({ where: { id }, data: await this.dados(e, true) });
  }

  async excluir(user: Ator, id: string) {
    const p = await this.obter(id);
    if (p.criado_por !== user.id && user.role !== 'admin') throw new ForbiddenException('Só quem criou a proposta, ou um administrador, pode excluir.');
    if (p.status === 'ACEITA') throw new ConflictException('Proposta aceita não se exclui: ela é o registro do que foi contratado.');
    await this.prisma.proposta.delete({ where: { id } });
    return { excluida: true };
  }

  async duplicar(user: Ator, id: string) {
    const p = await this.obter(id);
    const { id: _id, numero: _n, createdAt: _c, updatedAt: _u, status: _s, ...resto } = p;
    return this.prisma.proposta.create({ data: { ...(resto as Prisma.PropostaUncheckedCreateInput), itens: p.itens as Prisma.InputJsonValue, calculo: (p.calculo ?? Prisma.JsonNull) as Prisma.InputJsonValue, status: 'RASCUNHO', criado_por: user.id } });
  }

  /** Muda a situação. Aceita, de empresa do cadastro, liga o serviço contratado correspondente (BPO ou diagnóstico). */
  async mudarStatus(user: Ator, id: string, status: string) {
    if (!STATUS_DA_PROPOSTA.includes(status as never)) throw new BadRequestException('Situação inválida.');
    const p = await this.obter(id);
    const atualizada = await this.prisma.proposta.update({ where: { id }, data: { status } });
    let servico: string | null = null;
    if (status === 'ACEITA' && p.empresa_id && (p.servico === 'BPO_FISCAL' || p.servico === 'DIAGNOSTICO_PONTUAL')) {
      const aberto = await this.prisma.servicoContratado.findFirst({ where: { empresa_id: p.empresa_id, tipo: p.servico, situacao: { in: ['PROPOSTA', 'ATIVO', 'PAUSADO'] } }, orderBy: { createdAt: 'desc' } });
      if (aberto) await this.prisma.servicoContratado.update({ where: { id: aberto.id }, data: { situacao: 'ATIVO', atualizado_por: user.email ?? null, inicio: aberto.inicio ?? new Date() } });
      else await this.prisma.servicoContratado.create({ data: { empresa_id: p.empresa_id, tipo: p.servico, situacao: 'ATIVO', inicio: new Date(), observacao: `Proposta nº ${p.numero} aceita`, atualizado_por: user.email ?? null } });
      servico = p.servico;
    }
    return { ...atualizada, servico_ativado: servico };
  }
}
