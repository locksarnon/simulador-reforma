import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { MailService } from '../mail/mail.service';
import { plural } from '../common/plural';
import { PrismaService } from '../prisma/prisma.service';
import type { NovidadeNova } from './atualizacoes';
import { referenciaDe } from './base-legal.deteccao';
import { decodificar } from './base-legal.parser';
import { BaseLegalService } from './base-legal.service';
import { alteracoesDoAto, pendenciasDeConsolidacao, rotuloDoCaminho, type AtoAlterador, type PendenciaConsolidacao } from './consolidacao';
import { GRUPOS_NORMAS } from './fontes';
import { atoDoCgibsRelevante, FONTES_MONITORADAS, hashDosLinks, hostOficial, linksDaPagina, novosLinks, pareceDocumento, urlDaFonte, type LinkPagina } from './fontes-monitoradas';
import {
  anosDaConsulta, atosNovos, deveCarregarTexto, lerListaFederal, porPrioridade, relevanciaDoAto, TIPOS_FEDERAIS, urlListaFederal,
  type AtoFederal, type RelevanciaDoAto,
} from './legislacao-federal';
import { lerPesquisaSemanal, promptPesquisaSemanal, type NormaDoGrupo } from './pesquisa-semanal';
import { montarEmailRevisaoSemanal, type Destaque, type ResumoRodada } from './revisao-semanal.email';
import type { ResumoRevisao } from './revisao-legal.service';

/** A rodada não passa deste tempo (sites oficiais que travam não seguram a rotina indefinidamente). */
const LIMITE_RODADA_MS = 2 * 3_600_000;
/** Uma rodada marcada "executando" há mais que isto é tratada como interrompida. */
const RODADA_TRAVADA_MS = 3 * 3_600_000;
const MAX_CARGAS_DE_ATOS = 12;
const MAX_CARGAS_CGIBS = 4;
/** Atos federais ainda sem texto na base são tentados de novo durante este período. */
const JANELA_ATOS_DIAS = 60;

/** Trechos que denunciam artigo alterador ou cláusula de revogação (a busca no banco é só um pré-filtro; quem decide é o leitor). */
const PADROES_ALTERADORES = ['passa a vigorar', 'passam a vigorar', 'passa a ter a seguinte redação', 'revogam-se', 'revoga-se', 'fica revogad', 'ficam revogad', 'são revogad', 'fica acrescid', 'ficam acrescid', 'são acrescentad'];

export type ContadoresRodada = {
  normas_verificadas: number; normas_atualizadas: number; dispositivos_alterados: number; dispositivos_revogados: number;
  normas_novas: number; atos_relacionados: number; fontes_verificadas: number; fontes_alteradas: number;
};

type Rodada = ContadoresRodada & {
  id: string; semana: string; disparo: string; iniciado_em: Date; inicio_ms: number;
  erros: string[]; notas: string[]; revisoes: { itens: number; cartoes: number; cartoes_despublicados: number; fundamentos: number; marcos: number };
};

/** "2026-S48": semana ISO da data no horário de Brasília. */
export function semanaIso(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3_600_000);
  const alvo = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  alvo.setUTCDate(alvo.getUTCDate() - ((alvo.getUTCDay() + 6) % 7) + 3); // quinta-feira da semana: ela decide o ano
  const primeiraQuinta = new Date(Date.UTC(alvo.getUTCFullYear(), 0, 4));
  primeiraQuinta.setUTCDate(primeiraQuinta.getUTCDate() - ((primeiraQuinta.getUTCDay() + 6) % 7) + 3);
  const semana = 1 + Math.round((alvo.getTime() - primeiraQuinta.getTime()) / (7 * 86_400_000));
  return `${alvo.getUTCFullYear()}-S${String(semana).padStart(2, '0')}`;
}

const NOME_TIPO_ATO: Record<string, { tipo: string; orgao: string }> = {
  LCP: { tipo: 'Lei Complementar', orgao: 'Presidência da República' },
  EMC: { tipo: 'Emenda Constitucional', orgao: 'Congresso Nacional' },
  MPV: { tipo: 'Medida Provisória', orgao: 'Presidência da República' },
  LEI: { tipo: 'Lei', orgao: 'Presidência da República' },
  DEC: { tipo: 'Decreto', orgao: 'Presidência da República' },
  DEL: { tipo: 'Decreto-Lei', orgao: 'Presidência da República' },
};

/** "LEI 15547/2026" → "Lei 15.547/2026" (o mesmo desenho do cadastro das normas). */
const numeroDoAto = (a: AtoFederal): string => {
  const abrev = a.rotulo.split(' ')[0];
  const n = Number(a.numero);
  return `${abrev} ${n >= 1000 ? n.toLocaleString('pt-BR') : n}/${a.ano}`;
};

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 220);

@Injectable()
export class RevisaoSemanalService {
  private readonly log = new Logger(RevisaoSemanalService.name);
  private emAndamento = false;
  /** Pausa entre dois downloads do mesmo site oficial (zero nos testes). */
  pausaMs = 300;
  /** Relógio injetável para os testes. */
  agora: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly baseLegal: BaseLegalService,
    private readonly mail: MailService,
  ) {}

  private ligado(chave: string, padrao = true): boolean {
    const v = (this.config.get<string>(chave) ?? '').trim().toLowerCase();
    return v ? !['false', '0', 'nao', 'não', 'off'].includes(v) : padrao;
  }

  /** Toda segunda-feira às 05h (Brasília), antes do Radar das 06h. */
  @Cron('0 5 * * 1', { timeZone: 'America/Sao_Paulo' })
  async agendada() {
    if (!this.ligado('BASE_LEGAL_REVISAO_SEMANAL')) {
      this.log.log('Revisão semanal das bases legais desligada (BASE_LEGAL_REVISAO_SEMANAL=false).');
      return;
    }
    try {
      await this.executar('agendada');
    } catch (e) {
      this.log.error(`Revisão semanal falhou: ${mensagem(e)}`);
    }
  }

  /** Dispara a revisão agora, em segundo plano (leva minutos): devolve o número da rodada para acompanhar. */
  async iniciar(por: string): Promise<{ id: string; status: string; ja_em_andamento: boolean }> {
    await this.encerrarTravadas();
    const emCurso = await this.rodadaEmCurso();
    if (emCurso) return { id: emCurso.id, status: 'executando', ja_em_andamento: true };
    const rodada = await this.abrirRodada('manual', `Disparada por ${por}.`);
    void this.rodar(rodada).catch((e) => this.log.error(`Revisão semanal (manual) falhou: ${mensagem(e)}`));
    return { id: rodada.id, status: 'executando', ja_em_andamento: false };
  }

  /** Roda a revisão e espera o fim. */
  async executar(disparo: 'agendada' | 'manual'): Promise<{ id: string; status: string } | null> {
    await this.encerrarTravadas();
    if (await this.rodadaEmCurso()) {
      this.log.warn('Já existe uma revisão em andamento; esta foi ignorada.');
      return null;
    }
    const rodada = await this.abrirRodada(disparo, null);
    return this.rodar(rodada);
  }

  private async rodadaEmCurso() {
    if (this.emAndamento) return { id: 'em-memoria' };
    return this.prisma.revisaoSemanal.findFirst({ where: { status: 'executando' }, select: { id: true } });
  }

  /** Rodada que ficou "executando" por tempo demais (servidor reiniciado no meio) deixa de bloquear as seguintes. */
  private async encerrarTravadas() {
    if (this.emAndamento) return;
    await this.prisma.revisaoSemanal.updateMany({
      where: { status: 'executando', iniciado_em: { lt: new Date(this.agora().getTime() - RODADA_TRAVADA_MS) } },
      data: { status: 'falhou', concluido_em: this.agora(), resumo: 'Interrompida: o servidor reiniciou ou a rodada passou do tempo limite.' },
    });
  }

  private async abrirRodada(disparo: string, resumo: string | null): Promise<Rodada> {
    const inicio = this.agora();
    const criada = await this.prisma.revisaoSemanal.create({ data: { semana: semanaIso(inicio), disparo, status: 'executando', iniciado_em: inicio, resumo } });
    return {
      id: criada.id, semana: criada.semana, disparo, iniciado_em: inicio, inicio_ms: inicio.getTime(),
      normas_verificadas: 0, normas_atualizadas: 0, dispositivos_alterados: 0, dispositivos_revogados: 0, normas_novas: 0, atos_relacionados: 0, fontes_verificadas: 0, fontes_alteradas: 0,
      erros: [], notas: [], revisoes: { itens: 0, cartoes: 0, cartoes_despublicados: 0, fundamentos: 0, marcos: 0 },
    };
  }

  private estourou(r: Rodada) {
    return this.agora().getTime() - r.inicio_ms > LIMITE_RODADA_MS;
  }

  private async pausa() {
    if (this.pausaMs > 0) await new Promise((ok) => setTimeout(ok, this.pausaMs));
  }

  /** Cada etapa roda isolada: uma que falha entra nos erros da rodada e não impede as outras. */
  private async etapa(r: Rodada, nome: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      this.log.warn(`Revisão semanal, etapa "${nome}": ${mensagem(e)}`);
      r.erros.push(`${nome}: ${mensagem(e)}`);
    }
  }

  private async rodar(r: Rodada): Promise<{ id: string; status: string }> {
    this.emAndamento = true;
    try {
      await this.etapa(r, 'Normas', () => this.verificarNormas(r));
      await this.etapa(r, 'Legislação federal nova', () => this.descobrirAtosFederais(r));
      await this.etapa(r, 'Alterações ainda não consolidadas', () => this.cruzarAlteracoes(r));
      await this.etapa(r, 'Portais oficiais', () => this.verificarPortais(r));
      await this.etapa(r, 'Pesquisa na web', () => this.pesquisarNaWeb(r));
      await this.etapa(r, 'Aplicações', () => this.aplicacoes(r));
      return await this.concluir(r);
    } catch (e) {
      r.erros.push(`Revisão: ${mensagem(e)}`);
      await this.prisma.revisaoSemanal.update({ where: { id: r.id }, data: { status: 'falhou', concluido_em: this.agora(), erros: r.erros, resumo: 'A revisão parou por erro inesperado.' } }).catch(() => undefined);
      throw e;
    } finally {
      this.emAndamento = false;
    }
  }

  // ───────────────────────── 1. Texto oficial das normas ─────────────────────────

  private async verificarNormas(r: Rodada) {
    await this.baseLegal.garantirNormas();
    const normas = await this.prisma.normaLegal.findMany({
      where: { formato: { not: 'externo' }, monitorar: true },
      select: { chave: true, numero: true, total_dispositivos: true },
      orderBy: [{ prioridade: 'asc' }, { createdAt: 'asc' }],
    });
    const aplicar = this.ligado('BASE_LEGAL_APLICAR_AUTOMATICO');
    for (const n of normas) {
      if (this.estourou(r)) { r.notas.push('A rodada atingiu o tempo limite: as normas restantes ficam para a próxima.'); break; }
      const nova = n.total_dispositivos === 0;
      if (!aplicar && !nova) continue; // com aprovação, as já carregadas só geram aviso (abaixo)
      try {
        const res = await this.baseLegal.importar(n.chave, { automatico: true, execucaoId: r.id, semAviso: true });
        r.normas_verificadas += 1;
        if (res.reprocessada) {
          // Releitura com um leitor mais novo: a diferença vem do leitor, não da lei. Não conta como mudança da semana.
          r.notas.push(`${n.numero}: reprocessada com a leitura nova do texto oficial (${plural(res.alterados + res.revogados, 'dispositivo ajustado', 'dispositivos ajustados')}); não é mudança da lei.`);
        } else {
          r.dispositivos_alterados += res.alterados;
          r.dispositivos_revogados += res.revogados;
          if (nova && res.alterada) r.normas_novas += 1;
          else if (res.alterada && (res.alterados || res.revogados || res.removidos || res.novos)) r.normas_atualizadas += 1;
        }
        if (res.revisao) this.somarRevisao(r, res.revisao);
        if (!res.alterada && res.motivo?.startsWith('A página oficial trouxe')) r.notas.push(`${n.numero}: atualização segurada porque a página oficial mudou de forma. Confira o texto e atualize à mão.`);
      } catch (e) {
        r.erros.push(`${n.numero}: ${mensagem(e)}`);
      }
      await this.pausa();
    }
    if (!aplicar) {
      const v = await this.baseLegal.verificarAtualizacoes('agendada');
      r.normas_verificadas += v.verificadas;
      v.erros.forEach((e) => r.erros.push(e));
      r.notas.push(`Modo com aprovação: ${plural(v.alertas, 'atualização aguarda', 'atualizações aguardam')} aprovação no painel de avisos das bases legais.`);
    }
  }

  private somarRevisao(r: Rodada, x: ResumoRevisao) {
    r.revisoes.itens += x.itens;
    r.revisoes.cartoes += x.cartoes;
    r.revisoes.cartoes_despublicados += x.cartoes_despublicados;
    r.revisoes.fundamentos += x.fundamentos;
    r.revisoes.marcos += x.marcos;
  }

  // ───────────────────────── 2. Atos federais novos (Senado, dados abertos) ─────────────────────────

  private async descobrirAtosFederais(r: Rodada) {
    const agora = this.agora();
    const normas = await this.prisma.normaLegal.findMany({ select: { chave: true, numero: true, grupo: true } });
    const carregadas = new Map(normas.map((n) => [referenciaDe(n.numero), n]));
    const referencias = new Set(carregadas.keys());
    const recentes: AtoFederal[] = [];
    const novidades: NovidadeNova[] = [];
    const vistosNovidade = new Set<string>();

    for (const ano of anosDaConsulta(agora)) {
      for (const tipo of TIPOS_FEDERAIS) {
        const chave = `senado-${tipo.toLowerCase()}-${ano}`;
        const url = urlListaFederal(tipo, ano);
        const rotulo = `Legislação federal: ${NOME_TIPO_ATO[tipo].tipo} de ${ano} (Senado Federal, dados abertos)`;
        try {
          const { corpo } = await this.baseLegal.baixarBruto(url, { aceitar: 'application/json', maxBytes: 12 * 1024 * 1024, timeoutMs: 60_000 });
          const atos = lerListaFederal(JSON.parse(corpo.toString('utf8')), agora);
          const fonte = await this.prisma.fonteMonitorada.upsert({ where: { chave }, create: { chave, titulo: rotulo, url, grupo: 'federal' }, update: { titulo: rotulo, url } });
          const anteriores = fonte.hash_atual && Array.isArray(fonte.itens) ? new Set((fonte.itens as unknown as LinkPagina[]).map((i) => i.url)) : null;
          const links: LinkPagina[] = atos.map((a) => ({ titulo: a.nome, url: a.url_senado }));
          const novos = atosNovos(atos, anteriores, agora);
          await this.prisma.fonteMonitorada.update({
            where: { chave },
            data: { hash_atual: hashDosLinks(links) || 'vazio', itens: links as object[], verificada_em: agora, erro: null, ...(novos.length ? { alterada_em: agora } : {}) },
          });
          r.fontes_verificadas += 1;
          if (novos.length) r.fontes_alteradas += 1;
          recentes.push(...atos.filter((a) => (a.data?.getTime() ?? agora.getTime()) >= agora.getTime() - JANELA_ATOS_DIAS * 86_400_000));
          for (const a of novos) {
            const rel = relevanciaDoAto(a, referencias);
            if (!rel.relevante) continue;
            for (const n of this.novidadesDoAto(a, rel, carregadas, r.id)) {
              const k = `${n.ato_ref}|${n.norma_chave}|${n.tipo}`;
              if (!vistosNovidade.has(k)) { vistosNovidade.add(k); novidades.push(n); }
            }
          }
        } catch (e) {
          r.erros.push(`${rotulo}: ${mensagem(e)}`);
          await this.prisma.fonteMonitorada.updateMany({ where: { chave }, data: { erro: mensagem(e), verificada_em: agora } }).catch(() => undefined);
        }
        await this.pausa();
      }
    }

    const gravadas = await this.baseLegal.registrarNovidades(novidades);
    r.atos_relacionados += novidades.filter((n) => n.tipo !== 'nova_norma').length;
    if (gravadas < novidades.length) r.notas.push('Alguns avisos de atos novos não puderam ser gravados.');

    // Carrega o texto dos atos que importam (os recém-publicados e os dos últimos dias que ainda não tinham texto no Planalto).
    const candidatos = recentes
      .filter((a) => !referencias.has(a.referencia) && a.url_planalto)
      .map((a) => ({ a, rel: relevanciaDoAto(a, referencias) }))
      .filter((x) => deveCarregarTexto(x.a, x.rel))
      .sort((x, y) => porPrioridade(x.a, y.a))
      .slice(0, MAX_CARGAS_DE_ATOS);
    const semTexto: string[] = [];
    for (const { a, rel } of candidatos) {
      if (this.estourou(r)) break;
      try {
        const reg = await this.baseLegal.registrarNorma(
          { referencia: a.referencia, numero: numeroDoAto(a), tipo: NOME_TIPO_ATO[a.tipo].tipo, titulo: a.ementa || a.nome, orgao: NOME_TIPO_ATO[a.tipo].orgao, url: a.url_planalto!, grupo: rel.grupo, data: a.data, observacao: 'Incluída pela revisão semanal a partir da lista oficial de legislação federal do Senado.' },
          { automatico: true, execucaoId: r.id, semAviso: true },
        );
        if (!reg.jaExistia) { r.normas_novas += 1; referencias.add(a.referencia); }
      } catch {
        semTexto.push(a.rotulo);
      }
      await this.pausa();
    }
    if (semTexto.length) r.notas.push(`${plural(semTexto.length, 'ato relevante ainda sem texto no Planalto', 'atos relevantes ainda sem texto no Planalto')} (nova tentativa na próxima rodada): ${semTexto.slice(0, 6).join(', ')}${semTexto.length > 6 ? '…' : ''}.`);
  }

  /** Uma novidade por norma da base que o ato cita (alteração, revogação, regulamentação ou aplicação); ato só tributário vira "norma nova". */
  private novidadesDoAto(a: AtoFederal, rel: RelevanciaDoAto, carregadas: Map<string, { chave: string; numero: string }>, execucaoId: string): NovidadeNova[] {
    const base = { origem: 'api_oficial', ato: a.rotulo, ato_ref: a.referencia, url: a.url_senado, oficial: true, confirmada: true, execucao_id: execucaoId, data_ato: a.data, resumo: a.ementa.slice(0, 600) };
    if (rel.motivo !== 'cita_norma') {
      return [{ ...base, tipo: 'nova_norma', titulo: `${a.rotulo}: ${a.ementa.slice(0, 160)}${a.ementa.length > 160 ? '…' : ''}` }];
    }
    const verbo = { alteracao: 'altera', revogacao: 'revoga', regulamentacao: 'regulamenta', aplicacao: 'trata da', nova_norma: 'trata da' }[rel.efeito];
    return rel.normas.slice(0, 8).map((n) => {
      const norma = carregadas.get(n.referencia);
      return { ...base, tipo: rel.efeito === 'nova_norma' ? 'aplicacao' : rel.efeito, norma_chave: norma?.chave ?? null, norma_numero: norma?.numero ?? n.rotulo, titulo: `${a.rotulo} ${verbo} ${norma?.numero ?? n.rotulo}` };
    });
  }

  // ───────────────────────── 3. Alterações que o texto compilado ainda não mostra ─────────────────────────

  private async cruzarAlteracoes(r: Rodada) {
    const normas = await this.prisma.normaLegal.findMany({ where: { total_dispositivos: { gt: 0 } }, select: { id: true, chave: true, numero: true, url_oficial: true, situacao: true, atos_modificadores: true } });
    const alteradores: AtoAlterador[] = [];
    for (const n of normas) {
      const artigos = await this.prisma.dispositivoLegal.findMany({
        where: { norma_id: n.id, tipo: 'artigo', OR: PADROES_ALTERADORES.map((t) => ({ texto: { contains: t, mode: 'insensitive' as const } })) },
        select: { tipo: true, rotulo: true, caminho: true, texto: true },
      });
      const alteracoes = alteracoesDoAto(artigos);
      if (alteracoes.length) alteradores.push({ chave: n.chave, numero: n.numero, referencia: referenciaDe(n.numero), url_oficial: n.url_oficial, alteracoes });
    }
    const pendencias = pendenciasDeConsolidacao(
      alteradores,
      normas.map((n) => ({ chave: n.chave, numero: n.numero, referencia: referenciaDe(n.numero), situacao: n.situacao, atos_modificadores: (Array.isArray(n.atos_modificadores) ? n.atos_modificadores : []) as { referencia?: string | null }[] })),
    );
    await this.registrarPendencias(r, pendencias);
  }

  private resumoDaPendencia(p: PendenciaConsolidacao): { titulo: string; resumo: string; detalhes: { rotulo: string; caminho: string }[] } {
    const artigos = p.artigos.map((c) => ({ rotulo: rotuloDoCaminho(c), caminho: c }));
    const lista = artigos.slice(0, 20).map((a) => a.rotulo).join(', ') + (artigos.length > 20 ? ` e mais ${artigos.length - 20}` : '');
    const verbo = p.tipos.includes('revogacao') && !p.tipos.includes('alteracao') ? 'revoga' : 'altera';
    return {
      titulo: `${p.ato.numero} ${verbo} a ${p.alvo.numero}, mas o texto compilado da ${p.alvo.numero} ainda não traz a mudança`,
      resumo: `${p.integral ? 'Revoga a norma inteira. ' : ''}${artigos.length ? `Dispositivos da ${p.alvo.numero} atingidos: ${lista}. ` : ''}Pelos ${p.do_ato.join(', ')} da ${p.ato.numero}. Até o Planalto atualizar o texto compilado, confira o ato antes de citar esses dispositivos.`,
      detalhes: artigos.slice(0, 60),
    };
  }

  private async registrarPendencias(r: Rodada, pendencias: PendenciaConsolidacao[]) {
    const existentes = await this.prisma.novidadeLegal.findMany({ where: { tipo: 'nao_consolidada' }, select: { id: true, norma_chave: true, ato_ref: true, status: true } });
    const chave = (alvo: string | null, ato: string | null) => `${alvo}|${ato}`;
    const porChave = new Map(existentes.map((e) => [chave(e.norma_chave, e.ato_ref), e]));
    const atuais = new Set<string>();
    const novas: NovidadeNova[] = [];
    for (const p of pendencias) {
      const k = chave(p.alvo.chave, p.ato.referencia);
      atuais.add(k);
      const x = this.resumoDaPendencia(p);
      const ja = porChave.get(k);
      if (ja) {
        // Atualiza o texto da pendência que continua aberta (a lista de artigos pode ter mudado); a descartada pela equipe fica como está.
        if (ja.status === 'nova' || ja.status === 'vista') await this.prisma.novidadeLegal.update({ where: { id: ja.id }, data: { titulo: x.titulo, resumo: x.resumo, detalhes: x.detalhes } });
        else if (ja.status === 'resolvida') await this.prisma.novidadeLegal.update({ where: { id: ja.id }, data: { status: 'nova', resolvida_por: null, resolvida_em: null, titulo: x.titulo, resumo: x.resumo, detalhes: x.detalhes } });
        continue;
      }
      novas.push({ tipo: 'nao_consolidada', origem: 'texto_oficial', norma_chave: p.alvo.chave, norma_numero: p.alvo.numero, titulo: x.titulo, resumo: x.resumo, detalhes: x.detalhes, ato: p.ato.numero, ato_ref: p.ato.referencia, url: p.ato.url_oficial, oficial: true, confirmada: true, execucao_id: r.id });
    }
    await this.baseLegal.registrarNovidades(novas);
    r.atos_relacionados += novas.length;
    // O compilado alcançou o ato: a pendência está resolvida.
    const resolvidas = existentes.filter((e) => (e.status === 'nova' || e.status === 'vista') && !atuais.has(chave(e.norma_chave, e.ato_ref)));
    if (resolvidas.length) {
      await this.prisma.novidadeLegal.updateMany({ where: { id: { in: resolvidas.map((e) => e.id) } }, data: { status: 'resolvida', resolvida_por: 'sistema', resolvida_em: this.agora() } });
      r.notas.push(`${plural(resolvidas.length, 'alteração já consta', 'alterações já constam')} no texto compilado e saiu da lista de pendências.`);
    }
  }

  // ───────────────────────── 4. Portais oficiais sem estrutura de artigos ─────────────────────────

  private async garantirFontes() {
    const agora = this.agora();
    for (const f of FONTES_MONITORADAS) {
      const url = urlDaFonte(f, agora);
      const atual = await this.prisma.fonteMonitorada.findUnique({ where: { chave: f.chave } });
      if (!atual) await this.prisma.fonteMonitorada.create({ data: { chave: f.chave, titulo: f.titulo, url, grupo: f.grupo } });
      // Endereço novo (a lista do ano seguinte): a primeira leitura volta a ser só o ponto de partida, sem avisar tudo como novidade.
      else await this.prisma.fonteMonitorada.update({ where: { chave: f.chave }, data: { titulo: f.titulo, url, grupo: f.grupo, ...(atual.url !== url ? { hash_atual: null, itens: [] } : {}) } });
    }
  }

  private async verificarPortais(r: Rodada) {
    await this.garantirFontes();
    const fontes = await this.prisma.fonteMonitorada.findMany({ where: { ativo: true, NOT: { chave: { startsWith: 'senado-' } } }, orderBy: { chave: 'asc' } });
    const agora = this.agora();
    let primeiras = 0;
    let cargasCgibs = 0;
    for (const f of fontes) {
      if (this.estourou(r)) break;
      try {
        const { corpo, url } = await this.baseLegal.baixarBruto(f.url, { maxBytes: 8 * 1024 * 1024, timeoutMs: 60_000 });
        const links = linksDaPagina(decodificar(corpo), url);
        const antes = (Array.isArray(f.itens) ? f.itens : []) as unknown as LinkPagina[];
        if (links.length < 3) throw new Error('a página não trouxe lista de links reconhecível (o site pode ter mudado)');
        if (antes.length >= 10 && links.length < antes.length * 0.5) throw new Error(`a página trouxe ${links.length} links e a leitura anterior tinha ${antes.length}: o site pode ter mudado, a lista guardada foi mantida`);
        const primeira = !f.hash_atual;
        const def = FONTES_MONITORADAS.find((d) => d.chave === f.chave);
        const novos = primeira ? [] : novosLinks(antes, links).filter(def?.qualquerLink ? (l) => hostOficial(l.url) : pareceDocumento);
        await this.prisma.fonteMonitorada.update({
          where: { id: f.id },
          data: { hash_atual: hashDosLinks(links), itens: links as object[], verificada_em: agora, erro: null, ...(novos.length ? { alterada_em: agora } : {}) },
        });
        r.fontes_verificadas += 1;
        if (primeira) primeiras += 1;
        if (!novos.length) continue;
        r.fontes_alteradas += 1;
        await this.baseLegal.registrarNovidades([{
          tipo: 'fonte_atualizada', origem: 'fonte_monitorada', titulo: `${f.titulo}: ${plural(novos.length, 'documento novo', 'documentos novos')}`,
          resumo: novos.slice(0, 8).map((l) => l.titulo).join('; ').slice(0, 600), detalhes: novos.slice(0, 40).map((l) => ({ rotulo: l.titulo, url: l.url })),
          url: f.url, oficial: true, confirmada: true, execucao_id: r.id,
        }]);
        // Atos do CGIBS que mudam a regra do IBS/CBS entram na base com o texto, sem esperar ninguém cadastrar.
        if (f.chave.startsWith('cgibs-')) {
          for (const l of novos.filter(atoDoCgibsRelevante)) {
            if (cargasCgibs >= MAX_CARGAS_CGIBS) break;
            cargasCgibs += 1;
            try {
              const numero = l.titulo.replace(/\s+/g, ' ').trim().slice(0, 90) || decodeURIComponent(l.url.split('/').pop() ?? 'ato do CGIBS');
              const reg = await this.baseLegal.registrarNorma(
                { referencia: referenciaDe(numero), numero, tipo: 'Ato do CGIBS', titulo: numero, orgao: 'Comitê Gestor do IBS', url: l.url, grupo: 'reforma', observacao: 'Incluída pela revisão semanal a partir do portal do CGIBS.' },
                { automatico: true, execucaoId: r.id, semAviso: true },
              );
              if (!reg.jaExistia) r.normas_novas += 1;
            } catch (e) {
              r.notas.push(`CGIBS: o texto de "${l.titulo.slice(0, 70)}" não pôde ser carregado (${mensagem(e)}).`);
            }
          }
        }
      } catch (e) {
        // A lista do ano só existe depois da primeira publicação dele: em janeiro e fevereiro, 404 nela não é erro.
        const aindaSemLista = /responded 404|respondeu 404/.test(mensagem(e)) && FONTES_MONITORADAS.some((d) => d.chave === f.chave && d.url.includes('{ano}')) && new Date(agora.getTime() - 3 * 3_600_000).getUTCMonth() < 2;
        if (aindaSemLista) { r.notas.push(`${f.titulo}: a lista do ano ainda não foi publicada.`); continue; }
        r.erros.push(`${f.titulo}: ${mensagem(e)}`);
        await this.prisma.fonteMonitorada.update({ where: { id: f.id }, data: { erro: mensagem(e), verificada_em: agora } }).catch(() => undefined);
      }
      await this.pausa();
    }
    if (primeiras) r.notas.push(`Primeira leitura de ${plural(primeiras, 'portal', 'portais')}: a lista atual de documentos ficou guardada como ponto de partida; os avisos começam na próxima semana.`);
  }

  // ───────────────────────── 5. Pesquisa na web (IA com busca; só fonte oficial, sempre "a confirmar") ─────────────────────────

  private async pesquisarNaWeb(r: Rodada) {
    if (!this.ligado('BASE_LEGAL_BUSCA_WEB')) { r.notas.push('Pesquisa na web desligada (BASE_LEGAL_BUSCA_WEB=false).'); return; }
    if (!this.baseLegal.iaConfigurada()) { r.notas.push('Pesquisa na web não feita: nenhum motor de IA está configurado no servidor.'); return; }
    const hoje = this.agora();
    const ultima = await this.prisma.revisaoSemanal.findFirst({ where: { status: { in: ['concluida', 'parcial'] }, id: { not: r.id } }, orderBy: { concluido_em: 'desc' }, select: { concluido_em: true } });
    const desde = new Date(Math.min(hoje.getTime() - 7 * 86_400_000, Math.max(ultima?.concluido_em?.getTime() ?? 0, hoje.getTime() - 21 * 86_400_000)));
    const todas = await this.prisma.normaLegal.findMany({ select: { chave: true, numero: true, titulo: true, grupo: true }, orderBy: [{ prioridade: 'asc' }, { numero: 'asc' }] });
    let descartados = 0;
    for (const grupo of GRUPOS_NORMAS) {
      if (this.estourou(r)) break;
      const normas: NormaDoGrupo[] = todas.filter((n) => n.grupo === grupo.chave).map((n) => ({ chave: n.chave, numero: n.numero, titulo: n.titulo, referencia: referenciaDe(n.numero) }));
      if (!normas.length) continue;
      try {
        const resposta = await this.baseLegal.iaComBusca(promptPesquisaSemanal(grupo, normas, desde, hoje));
        const leitura = lerPesquisaSemanal(resposta.texto, normas, desde, hoje, r.id);
        descartados += leitura.descartados.length;
        // Endereço que a IA inventou não abre: só entra o que responde.
        const abertas: NovidadeNova[] = [];
        for (const n of leitura.novidades) {
          if (await this.baseLegal.urlResponde(n.url!)) abertas.push(n); else descartados += 1;
        }
        const novas = await this.semDuplicidade(abertas);
        descartados += abertas.length - novas.length;
        await this.baseLegal.registrarNovidades(novas);
        r.atos_relacionados += novas.length;
      } catch (e) {
        r.erros.push(`Pesquisa na web (${grupo.rotulo}): ${mensagem(e)}`);
      }
    }
    if (descartados) r.notas.push(`${plural(descartados, 'item da pesquisa na web foi descartado', 'itens da pesquisa na web foram descartados')} (sem fonte oficial, endereço que não abre ou já registrado).`);
  }

  /** Tira o que já está na base de conhecimento: mesmo endereço, ou mesmo ato sobre a mesma norma. */
  private async semDuplicidade(lista: NovidadeNova[]): Promise<NovidadeNova[]> {
    if (!lista.length) return lista;
    const corte = new Date(this.agora().getTime() - 120 * 86_400_000);
    const existentes = await this.prisma.novidadeLegal.findMany({
      where: { detectada_em: { gte: corte }, OR: [{ url: { in: lista.map((n) => n.url!) } }, { ato_ref: { in: lista.map((n) => n.ato_ref).filter((x): x is string => Boolean(x)) } }] },
      select: { url: true, ato_ref: true, norma_chave: true },
    });
    const urls = new Set(existentes.map((e) => e.url));
    const pares = new Set(existentes.map((e) => `${e.ato_ref}|${e.norma_chave}`));
    return lista.filter((n) => !urls.has(n.url!) && !(n.ato_ref && pares.has(`${n.ato_ref}|${n.norma_chave ?? null}`)));
  }

  // ───────────────────────── 6. Aplicações: o que cita o que mudou ─────────────────────────

  /** Regulamentos e resoluções que citam os artigos que mudaram nesta rodada: precisam ser relidos. */
  private async aplicacoes(r: Rodada) {
    const mudancas = await this.prisma.novidadeLegal.findMany({ where: { execucao_id: r.id, origem: 'texto_oficial', tipo: { in: ['alteracao', 'revogacao', 'inclusao'] } }, select: { norma_chave: true, detalhes: true } });
    const porNorma = new Map<string, Set<string>>();
    for (const m of mudancas) {
      if (!m.norma_chave) continue;
      const caminhos = porNorma.get(m.norma_chave) ?? new Set<string>();
      for (const d of (Array.isArray(m.detalhes) ? m.detalhes : []) as { caminho?: string }[]) if (d.caminho) caminhos.add(d.caminho);
      porNorma.set(m.norma_chave, caminhos);
    }
    if (!porNorma.size) return;
    const normas = await this.prisma.normaLegal.findMany({ where: { chave: { in: [...porNorma.keys()] } }, select: { chave: true, numero: true } });
    const novidades: NovidadeNova[] = [];
    for (const alvo of normas) {
      const caminhos = [...(porNorma.get(alvo.chave) ?? [])];
      if (!caminhos.length) continue;
      const citacoes = await this.prisma.referenciaLegal.findMany({
        where: { destino_ref: referenciaDe(alvo.numero), destino_caminho: { in: caminhos } },
        select: { rotulo: true, caminho: true, norma: { select: { chave: true, numero: true } } },
      });
      const porOrigem = new Map<string, { numero: string; itens: { rotulo: string; caminho: string }[] }>();
      for (const c of citacoes) {
        const o = porOrigem.get(c.norma.chave) ?? { numero: c.norma.numero, itens: [] };
        o.itens.push({ rotulo: c.rotulo, caminho: c.caminho });
        porOrigem.set(c.norma.chave, o);
      }
      for (const [chave, o] of porOrigem) {
        novidades.push({
          tipo: 'aplicacao', origem: 'remissao', norma_chave: chave, norma_numero: o.numero,
          titulo: `${o.numero}: ${plural(o.itens.length, 'dispositivo cita', 'dispositivos citam')} artigos da ${alvo.numero} que mudaram`,
          resumo: `Releia: ${o.itens.slice(0, 14).map((i) => i.rotulo).join(', ')}${o.itens.length > 14 ? ` e mais ${o.itens.length - 14}` : ''}. Eles regulamentam ou reproduzem dispositivos da ${alvo.numero} alterados nesta rodada.`,
          detalhes: o.itens.slice(0, 60), oficial: true, confirmada: true, execucao_id: r.id,
        });
      }
    }
    await this.baseLegal.registrarNovidades(novidades);
  }

  // ───────────────────────── Fechamento ─────────────────────────

  private async concluir(r: Rodada): Promise<{ id: string; status: string }> {
    const fim = this.agora();
    const registros = await this.prisma.novidadeLegal.findMany({ where: { execucao_id: r.id }, orderBy: [{ tipo: 'asc' }, { detectada_em: 'asc' }], take: 500 });
    const destaques: Destaque[] = registros.map((n) => ({ tipo: n.tipo, titulo: n.titulo, resumo: n.resumo, url: n.url, oficial: n.oficial, confirmada: n.confirmada }));
    const status = !r.erros.length ? 'concluida' : r.normas_verificadas > 0 || r.fontes_verificadas > 0 ? 'parcial' : 'falhou';
    const partes = [
      r.normas_atualizadas ? plural(r.normas_atualizadas, 'norma atualizada', 'normas atualizadas') : null,
      r.dispositivos_alterados ? plural(r.dispositivos_alterados, 'dispositivo alterado', 'dispositivos alterados') : null,
      r.dispositivos_revogados ? plural(r.dispositivos_revogados, 'revogado', 'revogados') : null,
      r.normas_novas ? plural(r.normas_novas, 'norma nova', 'normas novas') : null,
      r.atos_relacionados ? plural(r.atos_relacionados, 'ato relacionado', 'atos relacionados') : null,
      r.fontes_alteradas ? plural(r.fontes_alteradas, 'portal com novidade', 'portais com novidade') : null,
      r.erros.length ? plural(r.erros.length, 'erro', 'erros') : null,
    ].filter(Boolean);
    const resumo = `${plural(r.normas_verificadas, 'norma conferida', 'normas conferidas')}, ${plural(r.fontes_verificadas, 'fonte oficial', 'fontes oficiais')}${partes.length ? `: ${partes.join(', ')}` : ': sem mudanças'}.`;
    await this.prisma.revisaoSemanal.update({
      where: { id: r.id },
      data: {
        status, concluido_em: fim, normas_verificadas: r.normas_verificadas, normas_atualizadas: r.normas_atualizadas, dispositivos_alterados: r.dispositivos_alterados,
        dispositivos_revogados: r.dispositivos_revogados, normas_novas: r.normas_novas, atos_relacionados: r.atos_relacionados, fontes_verificadas: r.fontes_verificadas,
        fontes_alteradas: r.fontes_alteradas, erros: r.erros, resumo,
      },
    });
    const semNovidade = !destaques.length && !r.erros.length && !r.revisoes.itens;
    if (!semNovidade) await this.enviarResumo({ ...r, status, concluido_em: fim, destaques });
    this.log.log(`Revisão semanal ${r.semana} (${r.disparo}): ${resumo}`);
    return { id: r.id, status };
  }

  /** Um e-mail por rodada, só quando há o que dizer. Falha de envio nunca desfaz a revisão. */
  private async enviarResumo(x: Rodada & { status: string; concluido_em: Date; destaques: Destaque[] }) {
    try {
      const para = this.mail?.emailInterno;
      if (!para || !this.mail.configurado) return;
      const resumo: ResumoRodada = {
        semana: x.semana, disparo: x.disparo, iniciado_em: x.iniciado_em, concluido_em: x.concluido_em, status: x.status,
        normas_verificadas: x.normas_verificadas, normas_atualizadas: x.normas_atualizadas, dispositivos_alterados: x.dispositivos_alterados, dispositivos_revogados: x.dispositivos_revogados,
        normas_novas: x.normas_novas, atos_relacionados: x.atos_relacionados, fontes_verificadas: x.fontes_verificadas, fontes_alteradas: x.fontes_alteradas,
        erros: x.erros, notas: x.notas, revisoes: x.revisoes, destaques: x.destaques,
      };
      const e = montarEmailRevisaoSemanal(resumo, this.mail.urlPublica);
      const envio = await this.mail.enviar({ to: para, subject: e.assunto, html: e.html, text: e.texto });
      if (!envio.enviado) this.log.warn(`Resumo semanal não enviado: ${envio.motivo}`);
    } catch (e) {
      this.log.warn(`Resumo semanal falhou: ${mensagem(e)}`);
    }
  }

  // ───────────────────────── Consulta (tela) ─────────────────────────

  listar(limite = 20) {
    return this.prisma.revisaoSemanal.findMany({ orderBy: { iniciado_em: 'desc' }, take: Math.min(Math.max(limite, 1), 100) });
  }

  async obter(id: string) {
    const rodada = await this.prisma.revisaoSemanal.findUnique({ where: { id } });
    if (!rodada) return null;
    const novidades = await this.prisma.novidadeLegal.findMany({ where: { execucao_id: id }, orderBy: [{ tipo: 'asc' }, { detectada_em: 'asc' }], take: 500 });
    return { ...rodada, novidades };
  }

  fontes() {
    return this.prisma.fonteMonitorada.findMany({ orderBy: [{ grupo: 'asc' }, { titulo: 'asc' }], select: { id: true, chave: true, titulo: true, url: true, grupo: true, ativo: true, verificada_em: true, alterada_em: true, erro: true } });
  }

  /** A rotina está ligada? Quando roda de novo? (para a tela) */
  estado() {
    return {
      ligada: this.ligado('BASE_LEGAL_REVISAO_SEMANAL'),
      aplica_automaticamente: this.ligado('BASE_LEGAL_APLICAR_AUTOMATICO'),
      pesquisa_na_web: this.ligado('BASE_LEGAL_BUSCA_WEB') && this.baseLegal.iaConfigurada(),
      em_andamento: this.emAndamento,
      agenda: 'Toda segunda-feira, às 5h (horário de Brasília)',
    };
  }
}

