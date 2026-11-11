import { Injectable, Logger } from '@nestjs/common';
import { CnpjService } from '../cnpj/cnpj.service';
import { PrismaService } from '../prisma/prisma.service';

type EmpresaPainel = {
  id: string; razao_social: string; cnpj_cpf: string | null; regime_atual: string | null; setor: string | null; uf: string | null; municipio: string | null;
  status: string; produtor_rural: string | null; cnae_principal: string | null; cnae_descricao: string | null; porte: string | null;
  latitude: number | null; longitude: number | null; email_contato: string | null; whatsapp_contato: string | null; dados_publicos_em: Date | null;
};

const MAX_POR_RODADA = 20;
const ESPERA_MS = 350;
const digitos = (s: string | null) => String(s ?? '').replace(/\D/g, '');

/** Conta por chave, do maior para o menor; vazio vira "Não informado". */
export function contar<T>(itens: T[], chave: (x: T) => string | null | undefined) {
  const m = new Map<string, number>();
  for (const i of itens) {
    const k = (chave(i) || '').trim() || 'Não informado';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

/** A divisão do CNAE (2 primeiros dígitos), que agrupa atividades parecidas. */
export const divisaoDoCnae = (c: string | null) => (c && /^\d{2}/.test(c) ? c.slice(0, 2) : null);

/** O que falta no cadastro de uma empresa para o painel ficar completo. */
export function faltasDoCadastro(e: EmpresaPainel): string[] {
  const f: string[] = [];
  if (!e.cnpj_cpf) f.push('CNPJ/CPF');
  if (!e.regime_atual) f.push('regime');
  if (!e.uf || !e.municipio) f.push('UF e município');
  if (digitos(e.cnpj_cpf).length === 14 && !e.cnae_principal) f.push('CNAE');
  if (!e.email_contato && !e.whatsapp_contato) f.push('contato');
  return f;
}

/**
 * Painel da carteira: o retrato da carteira feito só com o cadastro (não depende da Receita), por regime, porte, município,
 * CNAE e situação, e a "saúde do cadastro" (o que falta preencher). O botão "completar pelo CNPJ" busca na consulta pública
 * (BrasilAPI, dados da Receita) o CNAE, o porte e o município de quem tem CNPJ, e no IBGE o ponto do município para o mapa.
 */
@Injectable()
export class PainelCarteiraService {
  private readonly logger = new Logger(PainelCarteiraService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cnpj: CnpjService,
  ) {}

  private empresas(): Promise<EmpresaPainel[]> {
    return this.prisma.empresa.findMany({
      select: {
        id: true, razao_social: true, cnpj_cpf: true, regime_atual: true, setor: true, uf: true, municipio: true, status: true, produtor_rural: true,
        cnae_principal: true, cnae_descricao: true, porte: true, latitude: true, longitude: true, email_contato: true, whatsapp_contato: true, dados_publicos_em: true,
      },
      orderBy: { razao_social: 'asc' },
    });
  }

  async resumo() {
    const [empresas, servicos] = await Promise.all([
      this.empresas(),
      this.prisma.servicoContratado.findMany({ where: { situacao: { in: ['ATIVO', 'PAUSADO'] } }, select: { empresa_id: true, tipo: true } }),
    ]);
    const bpo = new Set(servicos.filter((s) => s.tipo === 'BPO_FISCAL').map((s) => s.empresa_id));
    const diag = new Set(servicos.filter((s) => s.tipo === 'DIAGNOSTICO_PONTUAL').map((s) => s.empresa_id));
    const municipios = new Map<string, { uf: string; municipio: string; total: number; latitude: number | null; longitude: number | null }>();
    for (const e of empresas) {
      if (!e.uf || !e.municipio) continue;
      const k = `${e.uf}|${e.municipio.toUpperCase()}`;
      const m = municipios.get(k) ?? { uf: e.uf, municipio: e.municipio, total: 0, latitude: null, longitude: null };
      m.total++;
      if (m.latitude === null && e.latitude !== null && e.longitude !== null) { m.latitude = e.latitude; m.longitude = e.longitude; }
      municipios.set(k, m);
    }
    const cnaes = new Map<string, { codigo: string; descricao: string; total: number }>();
    for (const e of empresas) {
      if (!e.cnae_principal) continue;
      const c = cnaes.get(e.cnae_principal) ?? { codigo: e.cnae_principal, descricao: e.cnae_descricao || '', total: 0 };
      c.total++;
      cnaes.set(e.cnae_principal, c);
    }
    const comFaltas = empresas.map((e) => ({ id: e.id, razao_social: e.razao_social, faltas: faltasDoCadastro(e) })).filter((e) => e.faltas.length);
    const pendentesDeCnpj = empresas.filter((e) => digitos(e.cnpj_cpf).length === 14 && !e.dados_publicos_em).length;
    return {
      total: empresas.length,
      ativas: empresas.filter((e) => (e.status || '').toLowerCase() === 'ativa').length,
      carteiras: { bpo: bpo.size, diagnostico: diag.size, ambas: [...bpo].filter((id) => diag.has(id)).length, sem: empresas.filter((e) => !bpo.has(e.id) && !diag.has(e.id)).length },
      por_regime: contar(empresas, (e) => e.regime_atual),
      por_porte: contar(empresas.filter((e) => digitos(e.cnpj_cpf).length === 14), (e) => e.porte),
      por_uf: contar(empresas, (e) => e.uf),
      por_setor: contar(empresas, (e) => e.setor),
      por_situacao: contar(empresas, (e) => e.status),
      por_municipio: [...municipios.values()].sort((a, b) => b.total - a.total || a.municipio.localeCompare(b.municipio)),
      por_cnae: [...cnaes.values()].sort((a, b) => b.total - a.total || a.codigo.localeCompare(b.codigo)),
      por_divisao_cnae: contar(empresas.filter((e) => e.cnae_principal), (e) => divisaoDoCnae(e.cnae_principal)),
      saude: {
        completas: empresas.length - comFaltas.length,
        com_faltas: comFaltas.length,
        faltas: contar(comFaltas.flatMap((e) => e.faltas.map((f) => ({ f }))), (x) => x.f),
        empresas_com_faltas: comFaltas.slice(0, 200),
        pendentes_de_cnpj: pendentesDeCnpj,
        sem_ponto_no_mapa: empresas.filter((e) => e.uf && e.municipio && e.latitude === null).length,
      },
    };
  }

  /**
   * Completa, aos poucos (até 20 por chamada), o CNAE, o porte, a natureza jurídica e o município de quem tem CNPJ e ainda não foi
   * consultado; UF e município só são preenchidos se estiverem vazios (o que o escritório digitou vale mais). Devolve quantas
   * faltam, para a tela chamar de novo até acabar.
   */
  async completarPeloCnpj(espera = ESPERA_MS) {
    const todas = await this.empresas();
    const fila = todas.filter((e) => digitos(e.cnpj_cpf).length === 14 && !e.dados_publicos_em);
    let atualizadas = 0;
    const falhas: { razao_social: string; motivo: string }[] = [];
    for (const e of fila.slice(0, MAX_POR_RODADA)) {
      try {
        const d = await this.cnpj.consultar(digitos(e.cnpj_cpf));
        const ponto = d.codigo_municipio_ibge ? await this.cnpj.centroideDoMunicipio(d.codigo_municipio_ibge) : null;
        await this.prisma.empresa.update({
          where: { id: e.id },
          data: {
            cnae_principal: d.cnae_codigo || null, cnae_descricao: d.cnae_descricao || null, porte: d.porte || null, natureza_juridica: d.natureza_juridica || null,
            codigo_municipio_ibge: d.codigo_municipio_ibge || null, latitude: ponto?.latitude ?? null, longitude: ponto?.longitude ?? null,
            ...(e.uf ? {} : { uf: d.uf || null }), ...(e.municipio ? {} : { municipio: d.municipio || null }),
            dados_publicos_em: new Date(),
          },
        });
        atualizadas++;
      } catch (err) {
        // Marca como consultada para não repetir o erro a cada rodada; o motivo vai para a tela.
        await this.prisma.empresa.update({ where: { id: e.id }, data: { dados_publicos_em: new Date() } });
        falhas.push({ razao_social: e.razao_social, motivo: (err as Error).message });
      }
      if (espera) await new Promise((r) => setTimeout(r, espera));
    }
    return { atualizadas, falhas, restantes: Math.max(fila.length - MAX_POR_RODADA, 0) };
  }
}
