import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { quem, type Usuario } from './constantes';

export const TIPOS_DE_AJUSTE = ['CADASTRAL_FUTURO', 'REGULARIZACAO_SALDO', 'ESCRITURACAO_ENTREGUE'] as const;

export type EntradaImpacto = {
  caso_id?: string | null; obrigacao: string; competencia?: string | null; versao_leiaute?: string | null; registro: string; campo?: string | null;
  valor_original?: string | null; valor_proposto?: string | null; motivo: string; evidencia?: string | null; inicio?: string | null;
  avaliar_anteriores?: boolean; responsavel?: string | null; tipo_ajuste: string;
};
export type EntradaVinculo = { de: string; para: string; inicio?: string | null; justificativa: string };

const t = (v: unknown, max = 500) => { const x = String(v ?? '').trim(); return x ? x.slice(0, max) : null; };
const dia = (v: unknown) => { if (!v) return null; const d = new Date(String(v)); if (Number.isNaN(d.getTime())) throw new BadRequestException('Data inválida.'); return d; };

/** Impacto no SPED (checklist por tipo de ajuste) e vínculos de código antigo → novo. O Agente 4 gera as linhas; aqui só se guardam. */
@Injectable()
export class SanImpactosService {
  constructor(private readonly prisma: PrismaService) {}

  listarImpactos(projetoId: string, f: { obrigacao?: string; caso_id?: string } = {}) {
    return this.prisma.sanImpactoSped.findMany({ where: { projeto_id: projetoId, ...(f.obrigacao ? { obrigacao: f.obrigacao } : {}), ...(f.caso_id ? { caso_id: f.caso_id } : {}) }, orderBy: { createdAt: 'asc' } });
  }

  /** Substitui as linhas de impacto dos casos citados (idempotente: gerar de novo não duplica). */
  async registrarImpactos(projetoId: string, linhas: EntradaImpacto[]) {
    if (!Array.isArray(linhas) || !linhas.length) throw new BadRequestException('Envie ao menos uma linha de impacto.');
    for (const l of linhas) {
      if (!t(l.obrigacao) || !t(l.registro) || !t(l.motivo)) throw new BadRequestException('Cada impacto precisa de obrigação, registro e motivo.');
      if (!(TIPOS_DE_AJUSTE as readonly string[]).includes(l.tipo_ajuste)) throw new BadRequestException('Tipo de ajuste inválido.');
    }
    const casos = [...new Set(linhas.map((l) => l.caso_id).filter((x): x is string => !!x))];
    return this.prisma.$transaction(async (tx) => {
      if (casos.length) await tx.sanImpactoSped.deleteMany({ where: { projeto_id: projetoId, caso_id: { in: casos } } });
      const r = await tx.sanImpactoSped.createMany({
        data: linhas.map((l) => ({
          projeto_id: projetoId, caso_id: l.caso_id ?? null, obrigacao: t(l.obrigacao)!, competencia: t(l.competencia, 20), versao_leiaute: t(l.versao_leiaute, 40), registro: t(l.registro, 40)!, campo: t(l.campo, 80),
          valor_original: t(l.valor_original), valor_proposto: t(l.valor_proposto), motivo: t(l.motivo, 2000)!, evidencia: t(l.evidencia, 2000), inicio: dia(l.inicio),
          avaliar_anteriores: !!l.avaliar_anteriores, responsavel: t(l.responsavel, 120), tipo_ajuste: l.tipo_ajuste,
        })),
      });
      return { gravadas: r.count };
    });
  }

  listarVinculos(projetoId: string) {
    return this.prisma.sanVinculoCodigo.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'asc' } });
  }

  async criarVinculo(projetoId: string, e: EntradaVinculo, usuario?: Usuario) {
    const de = t(e.de, 60);
    const para = t(e.para, 60);
    const justificativa = t(e.justificativa, 2000);
    if (!de || !para || !justificativa) throw new BadRequestException('Informe o código antigo, o novo e a justificativa.');
    if (de === para) throw new BadRequestException('O código novo deve ser diferente do antigo.');
    const ja = await this.prisma.sanVinculoCodigo.findFirst({ where: { projeto_id: projetoId, de, para } });
    if (ja) return ja;
    return this.prisma.sanVinculoCodigo.create({ data: { projeto_id: projetoId, de, para, inicio: dia(e.inicio), justificativa, criado_por: quem(usuario) } });
  }
}
