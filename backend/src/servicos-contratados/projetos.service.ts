import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CATALOGO_CONSULTORIA } from './consultoria.service';

export const SITUACOES_DO_PROJETO = ['EM_ANDAMENTO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO'] as const;
export type EntradaProjeto = {
  nome?: string; grupo_numero?: string | null; empresa_ids?: string[]; escopo?: string | null; situacao?: string;
  inicio?: string | null; prazo?: string | null; responsavel?: string | null; observacao?: string | null;
  servico_consultoria?: string; periodo_inicio?: string; periodo_fim?: string;
};
type Usuario = { email?: string; role?: string } | undefined;

const texto = (v: unknown, max: number) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
function data(v: unknown, campo: string): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Data inválida em ${campo}.`);
  return d;
}
const hoje = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

/**
 * Diagnósticos > Projetos: o trabalho pontual com escopo. Criar o projeto liga o diagnóstico pontual das empresas escolhidas (a carteira
 * de diagnósticos continua certa); apagar o projeto não apaga nada do trabalho das empresas.
 */
@Injectable()
export class ProjetosDiagnosticoService {
  constructor(private readonly prisma: PrismaService) {}

  private async validarEmpresas(ids: string[]) {
    const unicos = [...new Set(ids.filter(Boolean))];
    if (!unicos.length) throw new BadRequestException('Escolha pelo menos uma empresa para o diagnóstico.');
    if (unicos.length > 200) throw new BadRequestException('Escolha até 200 empresas por projeto.');
    const achadas = await this.prisma.empresa.findMany({ where: { id: { in: unicos } }, select: { id: true } });
    if (achadas.length !== unicos.length) throw new NotFoundException('Alguma das empresas escolhidas não existe mais.');
    return unicos;
  }

  /** Liga o diagnóstico pontual (ativo) de quem ainda não tem um em aberto. */
  private async ligarDiagnostico(ids: string[], responsavel: string | null, usuario?: Usuario) {
    for (const empresa_id of ids) {
      const aberto = await this.prisma.servicoContratado.findFirst({ where: { empresa_id, tipo: 'DIAGNOSTICO_PONTUAL', situacao: { in: ['PROPOSTA', 'ATIVO', 'PAUSADO'] } } });
      if (aberto) {
        if (aberto.situacao !== 'ATIVO') await this.prisma.servicoContratado.update({ where: { id: aberto.id }, data: { situacao: 'ATIVO', atualizado_por: usuario?.email ?? null } });
        continue;
      }
      await this.prisma.servicoContratado.create({ data: { empresa_id, tipo: 'DIAGNOSTICO_PONTUAL', situacao: 'ATIVO', inicio: hoje(), responsavel, atualizado_por: usuario?.email ?? null } });
    }
  }

  async listar() {
    const projetos = await this.prisma.projetoDiagnostico.findMany({ orderBy: [{ situacao: 'asc' }, { updatedAt: 'desc' }] });
    return projetos;
  }

  private async validarVinculos(servico: string, ids: string[]) {
    if (!CATALOGO_CONSULTORIA.some((s) => s.id === servico && s.publico === 'PJ' && s.projeto)) {
      throw new BadRequestException('O serviço ainda não está disponível para abrir projetos.');
    }
    const ativos = await this.prisma.empresa.count({ where: { id: { in: ids }, arquivado_em: null } });
    const vinculos = await this.prisma.vinculoConsultoria.count({ where: { publico: 'PJ', servico, cliente_id: { in: ids } } });
    if (ativos !== ids.length || vinculos !== ids.length) throw new BadRequestException('Vincule cada cliente ativo do escopo ao serviço antes de abrir o projeto.');
  }

  async obter(id: string) {
    const p = await this.prisma.projetoDiagnostico.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Projeto não encontrado.');
    return p;
  }

  async criar(e: EntradaProjeto, usuario?: Usuario) {
    const nome = texto(e.nome, 160);
    if (!nome) throw new BadRequestException('Dê um nome ao diagnóstico.');
    const empresa_ids = await this.validarEmpresas(e.empresa_ids ?? []);
    const responsavel = texto(e.responsavel, 120);
    const servico = e.servico_consultoria;
    const periodo_inicio = servico ? data(e.periodo_inicio, 'início do período') : undefined;
    const periodo_fim = servico ? data(e.periodo_fim, 'fim do período') : undefined;
    if (servico) {
      if (!periodo_inicio || !periodo_fim || periodo_inicio > periodo_fim) throw new BadRequestException('Informe um período válido.');
      await this.validarVinculos(servico, empresa_ids);
    }
    const projeto = await this.prisma.projetoDiagnostico.create({
      data: {
        nome, empresa_ids, grupo_numero: texto(e.grupo_numero, 40), escopo: texto(e.escopo, 4000), responsavel, observacao: texto(e.observacao, 4000),
        ...(servico ? { servico_consultoria: servico, periodo_inicio, periodo_fim } : {}),
        inicio: data(e.inicio, 'início') ?? hoje(), prazo: data(e.prazo, 'prazo') ?? null, situacao: 'EM_ANDAMENTO', criado_por: usuario?.email ?? null,
      },
    });
    if (!servico) await this.ligarDiagnostico(empresa_ids, responsavel, usuario);
    return projeto;
  }

  async atualizar(id: string, e: EntradaProjeto, usuario?: Usuario) {
    const atual = await this.obter(id);
    const dados: Record<string, unknown> = {};
    if (e.nome !== undefined) { const n = texto(e.nome, 160); if (!n) throw new BadRequestException('Dê um nome ao diagnóstico.'); dados.nome = n; }
    if (e.escopo !== undefined) dados.escopo = texto(e.escopo, 4000);
    if (e.observacao !== undefined) dados.observacao = texto(e.observacao, 4000);
    if (e.responsavel !== undefined) dados.responsavel = texto(e.responsavel, 120);
    const inicio = data(e.inicio, 'início'); if (inicio !== undefined) dados.inicio = inicio;
    const prazo = data(e.prazo, 'prazo'); if (prazo !== undefined) dados.prazo = prazo;
    if (atual.servico_consultoria && (e.periodo_inicio !== undefined || e.periodo_fim !== undefined)) {
      const de = data(e.periodo_inicio, 'início do período') ?? atual.periodo_inicio;
      const ate = data(e.periodo_fim, 'fim do período') ?? atual.periodo_fim;
      if (!de || !ate || de > ate) throw new BadRequestException('Informe um período válido.');
      dados.periodo_inicio = de;
      dados.periodo_fim = ate;
    }
    if (e.situacao !== undefined) {
      if (!SITUACOES_DO_PROJETO.includes(e.situacao as never)) throw new BadRequestException('Situação inválida.');
      dados.situacao = e.situacao;
    }
    if (e.empresa_ids !== undefined) {
      dados.empresa_ids = await this.validarEmpresas(e.empresa_ids);
      const novas = (dados.empresa_ids as string[]).filter((x) => !atual.empresa_ids.includes(x));
      if (novas.length && atual.servico_consultoria) await this.validarVinculos(atual.servico_consultoria, novas);
      else if (novas.length) await this.ligarDiagnostico(novas, (dados.responsavel as string | null) ?? atual.responsavel, usuario);
    }
    return this.prisma.projetoDiagnostico.update({ where: { id }, data: dados as never });
  }

  async excluir(id: string, usuario?: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores excluem projetos.');
    await this.obter(id);
    await this.prisma.projetoDiagnostico.delete({ where: { id } });
    return { ok: true };
  }
}
