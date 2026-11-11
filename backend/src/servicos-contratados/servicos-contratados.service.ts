import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** O que uma empresa pode ter contratado. Acrescentar um tipo aqui não exige migração (o banco guarda texto). */
export const TIPOS_DE_SERVICO = ['BPO_FISCAL', 'DIAGNOSTICO_PONTUAL'] as const;
export const SITUACOES_DE_SERVICO = ['PROPOSTA', 'ATIVO', 'PAUSADO', 'ENCERRADO'] as const;
/** Módulos do BPO que podem estar ligados à empresa (só vale para o BPO fiscal). */
export const MODULOS_DO_BPO = ['XML', 'MONITORAMENTO', 'OBRIGACOES', 'TAREFAS', 'ARQUIVOS'] as const;
/** A empresa está na carteira de um tipo quando o serviço está ativo ou pausado (proposta e encerrado ficam de fora). */
export const SITUACOES_NA_CARTEIRA = ['ATIVO', 'PAUSADO'];
/** Situações de um serviço "em aberto": é nelas que um serviço novo do mesmo tipo atualiza o que já existe, em vez de duplicar. */
const SITUACOES_EM_ABERTO = ['PROPOSTA', 'ATIVO', 'PAUSADO'];
const MAX_EM_LOTE = 500;

export type Entrada = {
  tipo?: string; situacao?: string; nome?: string | null; inicio?: string | null; fim?: string | null;
  responsavel?: string | null; modulos?: string[]; observacao?: string | null;
};
type Usuario = { email?: string } | undefined;

const hoje = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

function data(valor: unknown, campo: string): Date | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const d = new Date(String(valor));
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Data inválida em ${campo}.`);
  return d;
}

function texto(valor: unknown, campo: string, max: number): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  const t = String(valor).trim();
  if (t.length > max) throw new BadRequestException(`${campo} aceita até ${max} caracteres.`);
  return t || null;
}

/** Confere e normaliza o que veio da tela. `parcial` deixa de fora o que não foi enviado (atualização). */
export function normalizarEntrada(e: Entrada, parcial: boolean) {
  const out: Record<string, unknown> = {};
  if (e.tipo !== undefined || !parcial) {
    if (!TIPOS_DE_SERVICO.includes(e.tipo as never)) throw new BadRequestException(`Tipo de serviço inválido. Use ${TIPOS_DE_SERVICO.join(' ou ')}.`);
    out.tipo = e.tipo;
  }
  if (e.situacao !== undefined) {
    if (!SITUACOES_DE_SERVICO.includes(e.situacao as never)) throw new BadRequestException(`Situação inválida. Use ${SITUACOES_DE_SERVICO.join(', ')}.`);
    out.situacao = e.situacao;
  }
  const nome = texto(e.nome, 'O nome', 120); if (nome !== undefined) out.nome = nome;
  const responsavel = texto(e.responsavel, 'O responsável', 120); if (responsavel !== undefined) out.responsavel = responsavel;
  const observacao = texto(e.observacao, 'A observação', 2000); if (observacao !== undefined) out.observacao = observacao;
  const inicio = data(e.inicio, 'início'); if (inicio !== undefined) out.inicio = inicio;
  const fim = data(e.fim, 'fim'); if (fim !== undefined) out.fim = fim;
  if (out.inicio instanceof Date && out.fim instanceof Date && out.fim < out.inicio) throw new BadRequestException('A data de fim não pode ser anterior à de início.');
  if (e.modulos !== undefined) {
    if (!Array.isArray(e.modulos) || e.modulos.some((m) => !MODULOS_DO_BPO.includes(m as never))) throw new BadRequestException(`Módulo inválido. Use ${MODULOS_DO_BPO.join(', ')}.`);
    out.modulos = [...new Set(e.modulos)];
  }
  return out;
}

@Injectable()
export class ServicosContratadosService {
  constructor(private readonly prisma: PrismaService) {}

  private async empresa(id: string) {
    const e = await this.prisma.empresa.findUnique({ where: { id }, select: { id: true } });
    if (!e) throw new NotFoundException('Empresa não encontrada.');
    return e;
  }

  async listar(f: { tipo?: string; situacao?: string; empresa_id?: string } = {}) {
    if (f.tipo && !TIPOS_DE_SERVICO.includes(f.tipo as never)) throw new BadRequestException('Tipo de serviço inválido.');
    if (f.situacao && !SITUACOES_DE_SERVICO.includes(f.situacao as never)) throw new BadRequestException('Situação inválida.');
    return this.prisma.servicoContratado.findMany({
      where: { ...(f.tipo ? { tipo: f.tipo } : {}), ...(f.situacao ? { situacao: f.situacao } : {}), ...(f.empresa_id ? { empresa_id: f.empresa_id } : {}) },
      orderBy: [{ empresa_id: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async daEmpresa(empresaId: string) {
    await this.empresa(empresaId);
    return this.prisma.servicoContratado.findMany({ where: { empresa_id: empresaId }, orderBy: { createdAt: 'desc' } });
  }

  /** Ao ativar sem data de início, vale hoje; ao encerrar sem data de fim, vale hoje. */
  private completarDatas(d: Record<string, unknown>, atual?: { inicio: Date | null; fim: Date | null }) {
    if (d.situacao === 'ATIVO' && !(d.inicio ?? atual?.inicio)) d.inicio = hoje();
    if (d.situacao === 'ENCERRADO' && !(d.fim ?? atual?.fim)) d.fim = hoje();
    return d;
  }

  async criar(empresaId: string, entrada: Entrada, usuario?: Usuario) {
    await this.empresa(empresaId);
    const dados = normalizarEntrada({ situacao: 'ATIVO', ...entrada }, false);
    if (dados.tipo !== 'BPO_FISCAL') dados.modulos = [];
    const aberto = await this.prisma.servicoContratado.findFirst({ where: { empresa_id: empresaId, tipo: dados.tipo as string, situacao: { in: SITUACOES_EM_ABERTO } } });
    if (aberto) throw new BadRequestException('A empresa já tem um serviço desse tipo em aberto. Edite o existente.');
    this.completarDatas(dados);
    return this.prisma.servicoContratado.create({ data: { empresa_id: empresaId, ...(dados as object), atualizado_por: usuario?.email ?? null } as never });
  }

  async atualizar(id: string, entrada: Entrada, usuario?: Usuario) {
    const atual = await this.prisma.servicoContratado.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Serviço contratado não encontrado.');
    if (entrada.tipo !== undefined && entrada.tipo !== atual.tipo) throw new BadRequestException('O tipo do serviço não muda: crie outro serviço.');
    const dados = normalizarEntrada({ ...entrada, tipo: undefined }, true);
    if (atual.tipo !== 'BPO_FISCAL') delete dados.modulos;
    this.completarDatas(dados, atual);
    return this.prisma.servicoContratado.update({ where: { id }, data: { ...(dados as object), atualizado_por: usuario?.email ?? null } as never });
  }

  /**
   * Define o mesmo serviço para várias empresas: quem já tem um serviço em aberto desse tipo é atualizado; as outras ganham um novo.
   * Serve para marcar de uma vez quem é do BPO.
   */
  async definirEmLote(corpo: Entrada & { empresa_ids?: string[] }, usuario?: Usuario) {
    const ids = [...new Set(corpo.empresa_ids ?? [])];
    if (!ids.length) throw new BadRequestException('Escolha pelo menos uma empresa.');
    if (ids.length > MAX_EM_LOTE) throw new BadRequestException(`Escolha até ${MAX_EM_LOTE} empresas por vez.`);
    const { empresa_ids: _ignorado, ...entrada } = corpo;
    const dados = normalizarEntrada({ situacao: 'ATIVO', ...entrada }, false);
    if (dados.tipo !== 'BPO_FISCAL') dados.modulos = [];
    const existentes = await this.prisma.empresa.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (existentes.length !== ids.length) throw new NotFoundException('Alguma das empresas escolhidas não existe mais.');
    let criados = 0;
    let atualizados = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const empresaId of ids) {
        const aberto = await tx.servicoContratado.findFirst({ where: { empresa_id: empresaId, tipo: dados.tipo as string, situacao: { in: SITUACOES_EM_ABERTO } } });
        const completo = this.completarDatas({ ...dados }, aberto ?? undefined);
        if (aberto) { await tx.servicoContratado.update({ where: { id: aberto.id }, data: { ...(completo as object), atualizado_por: usuario?.email ?? null } as never }); atualizados += 1; }
        else { await tx.servicoContratado.create({ data: { empresa_id: empresaId, ...(completo as object), atualizado_por: usuario?.email ?? null } as never }); criados += 1; }
      }
    });
    return { criados, atualizados };
  }

  /** Números para os cartões da tela: quantas empresas há em cada carteira, em ambas e em nenhuma. */
  async resumo() {
    const [empresas, linhas] = await Promise.all([
      this.prisma.empresa.findMany({ select: { id: true } }),
      this.prisma.servicoContratado.findMany({ select: { empresa_id: true, tipo: true, situacao: true } }),
    ]);
    const porTipo: Record<string, Record<string, number>> = {};
    const naCarteira: Record<string, Set<string>> = {};
    for (const l of linhas) {
      porTipo[l.tipo] = porTipo[l.tipo] ?? {};
      porTipo[l.tipo][l.situacao] = (porTipo[l.tipo][l.situacao] ?? 0) + 1;
      if (SITUACOES_NA_CARTEIRA.includes(l.situacao)) (naCarteira[l.tipo] = naCarteira[l.tipo] ?? new Set()).add(l.empresa_id);
    }
    const bpo = naCarteira.BPO_FISCAL ?? new Set<string>();
    const diag = naCarteira.DIAGNOSTICO_PONTUAL ?? new Set<string>();
    const emAlguma = new Set([...bpo, ...diag]);
    return {
      empresas: empresas.length,
      por_tipo: porTipo,
      em_carteira: { BPO_FISCAL: bpo.size, DIAGNOSTICO_PONTUAL: diag.size, ambas: [...bpo].filter((id) => diag.has(id)).length },
      sem_carteira: empresas.filter((e) => !emAlguma.has(e.id)).length,
    };
  }
}
