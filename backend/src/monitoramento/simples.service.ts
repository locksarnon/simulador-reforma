import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MonitoramentoService } from './monitoramento.service';
import { analiseSimples, LeituraPgdasd } from './pgdasd-leitura';

type Usuario = { email?: string; role?: string } | undefined;
const lerJson = (d: unknown) => { if (typeof d !== 'string') return d; try { return JSON.parse(d); } catch { return d; } };

/** A competência mais recente com declaração (original ou retificadora) na lista do ano do PGDAS-D. */
export function ultimaCompetenciaDeclarada(dados: unknown): string | null {
  const d = lerJson(dados) as { periodos?: { periodoApuracao?: number | string; operacoes?: { tipoOperacao?: string; indiceDeclaracao?: unknown }[] }[] } | null;
  const comDeclaracao = (d?.periodos ?? []).filter((p) => (p.operacoes ?? []).some((o) => o.indiceDeclaracao || /original|retifica/i.test(o.tipoOperacao ?? '')));
  const ultimos = comDeclaracao.map((p) => String(p.periodoApuracao ?? '')).filter((p) => /^\d{6}$/.test(p)).sort();
  return ultimos.at(-1) ?? null;
}

/**
 * Simples Nacional do cliente: sublimite, faturamento mês a mês e Fator R, lidos da declaração mais recente do PGDAS-D
 * (ela traz a receita do período, os 12 meses anteriores de receita e de folha, o RBT12, o RBA e o fator r).
 */
@Injectable()
export class SimplesService {
  constructor(private readonly prisma: PrismaService, private readonly m: MonitoramentoService) {}

  async dados(empresaId: string) {
    const c = await this.prisma.consultaFiscal.findMany({ where: { empresa_id: empresaId, chave: { in: ['pgdasd-ultima', 'pgdasd-declaracao'] }, sucesso: true }, orderBy: { createdAt: 'desc' }, take: 20 });
    const comLeitura = c.find((x) => (x.dados as { leitura_pgdasd?: LeituraPgdasd } | null)?.leitura_pgdasd);
    if (!comLeitura) return { consultado_em: null, simulado: false, analise: null };
    const leitura = (comLeitura.dados as { leitura_pgdasd: LeituraPgdasd }).leitura_pgdasd;
    return { consultado_em: comLeitura.createdAt, simulado: comLeitura.simulado, analise: analiseSimples(leitura) };
  }

  /** Acha a última competência declarada (ano corrente; se não houver, o anterior), baixa a declaração e lê. */
  async atualizar(empresaId: string, usuario: Usuario) {
    const ano = new Date().getFullYear();
    let periodo: string | null = null;
    for (const a of [ano, ano - 1]) {
      const lista = await this.m.consultar({ empresaId }, 'pgdasd-declaracoes', { ano: String(a) }, usuario) as { id: string };
      const reg = await this.prisma.consultaFiscal.findUnique({ where: { id: lista.id } });
      periodo = ultimaCompetenciaDeclarada(reg?.dados);
      if (periodo) break;
    }
    if (periodo) await this.m.consultar({ empresaId }, 'pgdasd-ultima', { periodo }, usuario);
    return this.dados(empresaId);
  }
}
