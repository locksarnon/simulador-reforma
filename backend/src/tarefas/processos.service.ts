import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  competenciasDaRodada, ESCOPOS_DO_PROCESSO, geraNaCompetencia, hojeEmBrasilia, lerCompetencia, naJanelaDeGeracao, PRIORIDADES,
  prazoDaCompetencia, RECORRENCIAS, tituloGerado, type DataBR,
} from './tarefas.regras';

export type EntradaProcesso = {
  nome?: string; descricao?: string | null; recorrencia?: string; dia?: number; mes?: number | null; escopo?: string;
  responsavel?: string | null; prioridade?: string; ativo?: boolean;
};
type Modelo = { id: string; nome: string; descricao: string | null; recorrencia: string; dia: number; mes: number | null; escopo: string; responsavel: string | null; prioridade: string };
type Opcoes = { ignorarJanela: boolean; hoje?: DataBR; simular?: boolean };

/**
 * Processos recorrentes: o modelo de uma rotina que se repete (mensal, trimestral ou anual) e gera a tarefa de cada período. No escopo
 * "por empresa do BPO" gera uma tarefa para cada empresa com BPO fiscal ativo; no "geral", uma só. Gerar é seguro de repetir: o que já
 * existe para a mesma competência (e empresa) não é criado de novo.
 */
@Injectable()
export class ProcessosService {
  private readonly logger = new Logger(ProcessosService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listar() {
    return this.prisma.processoModelo.findMany({ orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] });
  }

  private async normalizar(e: EntradaProcesso, parcial: boolean) {
    const dados: Record<string, unknown> = {};
    if (!parcial || e.nome !== undefined) {
      const n = String(e.nome ?? '').trim().replace(/\s+/g, ' ');
      if (!n) throw new BadRequestException('Informe o nome do processo.');
      if (n.length > 120) throw new BadRequestException('O nome do processo aceita até 120 caracteres.');
      dados.nome = n;
    }
    if (e.descricao !== undefined) {
      const d = e.descricao === null ? null : String(e.descricao).trim();
      if (d && d.length > 2000) throw new BadRequestException('A descrição aceita até 2000 caracteres.');
      dados.descricao = d || null;
    }
    if (e.recorrencia !== undefined) {
      if (!RECORRENCIAS.includes(e.recorrencia as never)) throw new BadRequestException(`Recorrência inválida. Use ${RECORRENCIAS.join(', ')}.`);
      dados.recorrencia = e.recorrencia;
    }
    if (e.dia !== undefined) {
      const dia = Number(e.dia);
      if (!Number.isInteger(dia) || dia < 1 || dia > 31) throw new BadRequestException('O dia do prazo vai de 1 a 31 (em mês curto, vale o último dia).');
      dados.dia = dia;
    }
    if (e.mes !== undefined) {
      if (e.mes === null) dados.mes = null;
      else {
        const mes = Number(e.mes);
        if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new BadRequestException('O mês vai de 1 a 12.');
        dados.mes = mes;
      }
    }
    if (e.escopo !== undefined) {
      if (!ESCOPOS_DO_PROCESSO.includes(e.escopo as never)) throw new BadRequestException(`Escopo inválido. Use ${ESCOPOS_DO_PROCESSO.join(', ')}.`);
      dados.escopo = e.escopo;
    }
    if (e.prioridade !== undefined) {
      if (!PRIORIDADES.includes(e.prioridade as never)) throw new BadRequestException(`Prioridade inválida. Use ${PRIORIDADES.join(', ')}.`);
      dados.prioridade = e.prioridade;
    }
    if (e.responsavel !== undefined) {
      const id = e.responsavel ? String(e.responsavel) : null;
      if (id) {
        const u = await this.prisma.user.findUnique({ where: { id }, select: { ativo: true } });
        if (!u || !u.ativo) throw new BadRequestException('O responsável escolhido não existe ou está desativado.');
      }
      dados.responsavel = id;
    }
    if (e.ativo !== undefined) dados.ativo = Boolean(e.ativo);
    return dados;
  }

  /** O processo anual precisa do mês em que ocorre. */
  private conferirAnual(dados: { recorrencia?: unknown; mes?: unknown }, atual?: { recorrencia: string; mes: number | null }) {
    const recorrencia = (dados.recorrencia ?? atual?.recorrencia) as string | undefined;
    const mes = dados.mes !== undefined ? dados.mes : atual?.mes;
    if (recorrencia === 'ANUAL' && !mes) throw new BadRequestException('Processo anual precisa do mês em que acontece.');
  }

  async criar(user: { email?: string }, entrada: EntradaProcesso) {
    const dados = await this.normalizar(entrada, false);
    this.conferirAnual(dados);
    return this.prisma.processoModelo.create({ data: { ...(dados as { nome: string }), criado_por: user.email ?? null } });
  }

  async atualizar(id: string, entrada: EntradaProcesso) {
    const atual = await this.prisma.processoModelo.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Processo não encontrado.');
    const dados = await this.normalizar(entrada, true);
    this.conferirAnual(dados, atual);
    return this.prisma.processoModelo.update({ where: { id }, data: dados });
  }

  /** Apagar o processo mantém as tarefas que ele já gerou (ficam avulsas no histórico). */
  async excluir(id: string) {
    const m = await this.prisma.processoModelo.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Processo não encontrado.');
    await this.prisma.processoModelo.delete({ where: { id } });
    return { excluido: true };
  }

  /** Gerar agora, para uma competência escolhida (todos os processos ativos, ou um só). Com `simular`, só conta o que seria criado. */
  async gerar(entrada: { competencia?: string; modelo_id?: string; simular?: boolean }) {
    if (!lerCompetencia(entrada.competencia)) throw new BadRequestException('Informe a competência no formato AAAA-MM.');
    const modelos = await this.prisma.processoModelo.findMany({ where: { ativo: true, ...(entrada.modelo_id ? { id: entrada.modelo_id } : {}) } });
    if (entrada.modelo_id && modelos.length === 0) throw new NotFoundException('Processo não encontrado ou desativado.');
    return this.gerarModelos(modelos, [entrada.competencia as string], { ignorarJanela: true, simular: Boolean(entrada.simular) });
  }

  /** Rodada diária (05:30 de Brasília): cria as tarefas cujo prazo está a até 10 dias. Desliga com TAREFAS_AGENDADOR=off. */
  @Cron('30 5 * * *', { timeZone: 'America/Sao_Paulo' })
  async rodadaAutomatica(agora = new Date()) {
    if (String(process.env.TAREFAS_AGENDADOR ?? '').trim().toLowerCase() === 'off') return { criadas: 0, existentes: 0 };
    try {
      const hoje = hojeEmBrasilia(agora);
      const modelos = await this.prisma.processoModelo.findMany({ where: { ativo: true } });
      const r = await this.gerarModelos(modelos, competenciasDaRodada(hoje), { ignorarJanela: false, hoje });
      if (r.criadas) this.logger.log(`Processos recorrentes: ${r.criadas} tarefa(s) criada(s).`);
      return r;
    } catch (e) {
      this.logger.error(`A rodada de processos recorrentes falhou: ${(e as Error).message}`);
      return { criadas: 0, existentes: 0 };
    }
  }

  /** Quem fica com a tarefa de uma empresa: o responsável do processo; senão, o colaborador da empresa, se for um só; senão, ninguém. */
  private async responsaveisPorEmpresa(empresaIds: string[]) {
    const porEmpresa = new Map<string, string>();
    if (!empresaIds.length) return porEmpresa;
    const [vinculos, ativos] = await Promise.all([
      this.prisma.vinculoColaborador.findMany({ where: { empresa_id: { in: empresaIds } }, select: { user_id: true, empresa_id: true } }),
      this.prisma.user.findMany({ where: { ativo: true }, select: { id: true } }),
    ]);
    const ativa = new Set(ativos.map((u) => u.id));
    const doGrupo = new Map<string, string[]>();
    for (const v of vinculos) if (ativa.has(v.user_id)) doGrupo.set(v.empresa_id, [...(doGrupo.get(v.empresa_id) ?? []), v.user_id]);
    for (const [empresa, pessoas] of doGrupo) if (pessoas.length === 1) porEmpresa.set(empresa, pessoas[0]);
    return porEmpresa;
  }

  private async gerarModelos(modelos: Modelo[], competencias: string[], opcoes: Opcoes) {
    let criadas = 0;
    let existentes = 0;
    let empresasDoBpo: string[] | null = null;
    for (const modelo of modelos) {
      for (const competencia of competencias) {
        if (!geraNaCompetencia(modelo, competencia)) continue;
        const prazo = prazoDaCompetencia(competencia, modelo.dia);
        if (!opcoes.ignorarJanela && opcoes.hoje && !naJanelaDeGeracao(prazo, opcoes.hoje)) continue;
        let alvos: (string | null)[] = [null];
        if (modelo.escopo === 'POR_EMPRESA_BPO') {
          empresasDoBpo ??= (await this.prisma.servicoContratado.findMany({ where: { tipo: 'BPO_FISCAL', situacao: 'ATIVO' }, select: { empresa_id: true } })).map((s) => s.empresa_id);
          alvos = [...new Set(empresasDoBpo)];
        }
        const ja = await this.prisma.tarefa.findMany({ where: { modelo_id: modelo.id, competencia }, select: { empresa_id: true } });
        const jaTem = new Set(ja.map((t) => t.empresa_id ?? ''));
        const novos = alvos.filter((a) => !jaTem.has(a ?? ''));
        existentes += alvos.length - novos.length;
        if (!novos.length) continue;
        criadas += novos.length;
        if (opcoes.simular) continue;
        const doColaborador = modelo.responsavel ? new Map<string, string>() : await this.responsaveisPorEmpresa(novos.filter((n): n is string => !!n));
        await this.prisma.tarefa.createMany({
          data: novos.map((empresa_id) => ({
            titulo: tituloGerado(modelo.nome, competencia), descricao: modelo.descricao, empresa_id, prazo, prioridade: modelo.prioridade,
            responsavel: modelo.responsavel ?? (empresa_id ? doColaborador.get(empresa_id) ?? null : null),
            modelo_id: modelo.id, competencia, criado_por: 'processo',
          })),
        });
      }
    }
    return { criadas, existentes };
  }
}
