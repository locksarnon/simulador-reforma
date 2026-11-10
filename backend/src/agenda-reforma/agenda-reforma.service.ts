import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizarTexto } from '../base-legal/revisao-legal.regras';
import { RevisaoLegalService } from '../base-legal/revisao-legal.service';
import { gerarIcs, EventoIcs } from './agenda.ics';
import { DIAS_PADRAO, DIAS_PERMITIDOS, ItemLembrete, lembretesDoDia, MarcoParaEmail, montarEmailLembrete, normalizarDias } from './agenda.lembretes';
import { MARCOS_INICIAIS, MarcoInicial } from './agenda.marcos';
import {
  aplicaAoPerfil, CATEGORIAS, categoriaConhecida, dataAlvo, dataBr, diasEntre, filtrarMarcos, hojeBrasilia, lerDataIso, paraIso, regimeConhecido, REGIMES,
  situacaoDoMarco, UFS, ufConhecida,
} from './agenda.regras';

export type ConsultaAgenda = { regime?: string; uf?: string; empresa_id?: string; categoria?: string; passados?: string };

type FonteApi = { instrumento: string; dispositivo: string; data: string | null; url: string; trecho: string | null; norma_chave: string | null; caminho: string | null };

type RevisaoDoMarco = { id: string; norma_chave: string; norma_numero: string; caminho: string; rotulo: string; mudanca: string; detalhe: string | null; mudou_em: Date };

type EmpresaResumo = { id: string; razao_social: string; regime_atual: string | null; uf: string | null };

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

/** As fontes ficam em JSON no banco; aqui viram uma lista tipada, ignorando o que vier malformado. */
function fontesDoMarco(valor: unknown): FonteApi[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
    .map((f) => ({
      instrumento: texto(f.instrumento), dispositivo: texto(f.dispositivo), data: texto(f.data) || null, url: texto(f.url),
      trecho: texto(f.trecho) || null, norma_chave: texto(f.norma_chave) || null, caminho: texto(f.caminho) || null,
    }));
}

const linhaDaFonte = (f: FonteApi) => `${f.instrumento}, ${f.dispositivo}${f.data ? ` (ato de ${dataBr(lerDataIso(f.data))})` : ''}`;

/** "Art. 381 (LC 214/2025) alterado em 12/11/2026" para cada dispositivo da fonte que mudou. */
function avisoDeRevisao(revisoes: RevisaoDoMarco[]): string | null {
  if (!revisoes.length) return null;
  const itens = revisoes.map((r) => `${r.rotulo} (${r.norma_numero}) ${r.mudanca === 'revogado' ? 'revogado' : 'alterado'} em ${dataBr(hojeBrasilia(r.mudou_em))}`);
  return `Fonte em revisão: ${itens.join('; ')}. Confirme a data no texto oficial antes de agir.`;
}

type MarcoDoBanco = Awaited<ReturnType<PrismaService['agendaMarco']['findMany']>>[number];

@Injectable()
export class AgendaReformaService {
  private readonly log = new Logger(AgendaReformaService.name);

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService, private readonly revisao: RevisaoLegalService) {}

  // ───────────────────────── Consulta ─────────────────────────

  /** Regime e UF a aplicar: os da empresa, se vier `empresa_id`, e os pedidos explicitamente por cima. */
  private async resolverPerfil(consulta: ConsultaAgenda) {
    let regime: string | null | undefined;
    let uf: string | null | undefined;
    let empresa: EmpresaResumo | null = null;
    if (consulta.empresa_id) {
      empresa = await this.prisma.empresa.findUnique({ where: { id: consulta.empresa_id }, select: { id: true, razao_social: true, regime_atual: true, uf: true } });
      if (!empresa) throw new NotFoundException('Empresa não encontrada');
      regime = empresa.regime_atual?.trim() || null;
      uf = empresa.uf?.trim() || null;
    }
    if (consulta.regime) {
      const r = regimeConhecido(consulta.regime);
      if (!r) throw new BadRequestException(`Regime inválido. Use: ${REGIMES.join(', ')}.`);
      regime = r;
    }
    if (consulta.uf) {
      const u = ufConhecida(consulta.uf);
      if (!u) throw new BadRequestException('UF inválida.');
      uf = u;
    }
    let categoria: string | null = null;
    if (consulta.categoria) {
      categoria = categoriaConhecida(consulta.categoria);
      if (!categoria) throw new BadRequestException(`Categoria inválida. Use: ${CATEGORIAS.join(', ')}.`);
    }
    return { regime, uf, categoria, empresa };
  }

  private paraApi(m: MarcoDoBanco, hoje: Date, revisoes: RevisaoDoMarco[]) {
    return {
      id: m.id, chave: m.chave, titulo: m.titulo, descricao: m.descricao, categoria: m.categoria, tipo: m.tipo,
      data: paraIso(m.data), data_fim: paraIso(m.data_fim), regimes: m.regimes, ufs: m.ufs,
      fontes: fontesDoMarco(m.fontes), confirmado: m.confirmado, lida_em: paraIso(m.lida_em), observacao: m.observacao,
      situacao: situacaoDoMarco(m, hoje), dias_para: diasEntre(hoje, dataAlvo(m)),
      em_revisao: revisoes.map((r) => ({ id: r.id, norma: r.norma_chave, numero: r.norma_numero, caminho: r.caminho, rotulo: r.rotulo, mudanca: r.mudanca, detalhe: r.detalhe, mudou_em: r.mudou_em })),
    };
  }

  /** Marcos que valem para o regime e a UF pedidos (ou da empresa), na ordem da data, com as revisões pendentes de cada um. */
  private async consultar(consulta: ConsultaAgenda, agora: Date) {
    const hoje = hojeBrasilia(agora);
    const { regime, uf, categoria, empresa } = await this.resolverPerfil(consulta);
    const incluirPassados = consulta.passados === '1' || consulta.passados === 'true';
    const todos = await this.prisma.agendaMarco.findMany({ where: { ativo: true }, orderBy: [{ data: 'asc' }, { titulo: 'asc' }] });
    const marcos = filtrarMarcos(todos, { regime, uf, categoria, incluirPassados, hoje });
    const pendentes = await this.revisao.pendentesPorAlvo('marco', marcos.map((m) => m.id));
    return { hoje, regime, uf, categoria, empresa, incluirPassados, marcos, pendentes: pendentes as Map<string, RevisaoDoMarco[]> };
  }

  /** Por padrão só os marcos que ainda não passaram; `passados=1` inclui os anteriores. */
  async listar(consulta: ConsultaAgenda, agora: Date = new Date()) {
    const c = await this.consultar(consulta, agora);
    return {
      hoje: paraIso(c.hoje),
      filtros: { regime: c.regime === undefined ? null : c.regime, uf: c.uf === undefined ? null : c.uf, categoria: c.categoria, passados: c.incluirPassados },
      empresa: c.empresa ? { ...c.empresa, sem_regime: !regimeConhecido(c.empresa.regime_atual), sem_uf: !ufConhecida(c.empresa.uf) } : null,
      opcoes: { regimes: [...REGIMES], ufs: [...UFS], categorias: [...CATEGORIAS] },
      total: c.marcos.length,
      marcos: c.marcos.map((m) => this.paraApi(m, c.hoje, c.pendentes.get(m.id) ?? [])),
    };
  }

  // ───────────────────────── Exportação .ics ─────────────────────────

  async calendario(consulta: ConsultaAgenda, agora: Date = new Date()): Promise<string> {
    const c = await this.consultar(consulta, agora);
    let dominio = 'intax.local';
    try { dominio = new URL(this.mail.urlPublica).hostname; } catch { /* mantém o padrão */ }
    const eventos: EventoIcs[] = c.marcos.map((m) => {
      const fontes = fontesDoMarco(m.fontes);
      return {
        chave: m.chave, titulo: m.titulo, descricao: m.descricao, data: paraIso(m.data) as string, data_fim: paraIso(m.data_fim), categoria: m.categoria,
        confirmado: m.confirmado, fontes: fontes.map((f) => `${linhaDaFonte(f)} — ${f.url}`), url: fontes[0]?.url || null,
        atualizadoEm: m.updatedAt, aviso: avisoDeRevisao(c.pendentes.get(m.id) ?? []),
      };
    });
    const filtroTexto = [c.empresa?.razao_social, c.regime, c.uf].filter(Boolean).join(' · ');
    return gerarIcs(eventos, {
      nome: `Agenda da Reforma Tributária${filtroTexto ? ` (${filtroTexto})` : ''}`,
      descricao: 'Marcos e prazos da Reforma Tributária do consumo, cada um com a fonte oficial. Gerado pelo InTAX (FAL Agro).',
      agora, dominio,
    });
  }

  // ───────────────────────── Semente ─────────────────────────

  /** Confere o trecho de cada fonte ligada à Base legal contra o texto carregado. Devolve o que não bateu. */
  private async conferirFontes(m: MarcoInicial): Promise<string[]> {
    const problemas: string[] = [];
    for (const f of m.fontes) {
      if (!f.norma_chave || !f.caminho) continue;
      const d = await this.prisma.dispositivoLegal.findFirst({ where: { caminho: f.caminho, norma: { chave: f.norma_chave } }, select: { texto: true } });
      if (!d) problemas.push(`${f.norma_chave}/${f.caminho}: dispositivo não encontrado na Base legal`);
      else if (!normalizarTexto(d.texto).includes(normalizarTexto(f.trecho))) problemas.push(`${f.norma_chave}/${f.caminho}: o trecho não consta no texto — "${f.trecho.slice(0, 50)}…"`);
    }
    return problemas;
  }

  /**
   * Grava (ou atualiza) as datas da semente. Cada trecho ligado à Base legal é conferido contra o texto carregado:
   * se não bater, o marco é gravado como "não confirmado em fonte oficial" e aparece em `divergentes`.
   */
  async semear(agora: Date = new Date()) {
    const hoje = hojeBrasilia(agora);
    const resultado = { criados: 0, atualizados: 0, confirmados: 0, divergentes: [] as string[] };
    for (const m of MARCOS_INICIAIS) {
      const problemas = await this.conferirFontes(m);
      const confirmado = m.confirmado && problemas.length === 0;
      const observacao = [m.observacao, problemas.length ? `Conferência com a Base legal: ${problemas.join('; ')}. Não confirmado em fonte oficial.` : ''].filter(Boolean).join(' ') || null;
      const dados = {
        titulo: m.titulo, descricao: m.descricao, categoria: m.categoria, tipo: m.tipo,
        data: lerDataIso(m.data) as Date, data_fim: m.data_fim ? (lerDataIso(m.data_fim) as Date) : null,
        regimes: m.regimes ?? [], ufs: m.ufs ?? [],
        fontes: m.fontes.map(({ instrumento, dispositivo, data, url, trecho, norma_chave, caminho }) => ({ instrumento, dispositivo, data, url, trecho, ...(norma_chave ? { norma_chave, caminho } : {}) })),
        confirmado, lida_em: confirmado ? (m.lida_em ? lerDataIso(m.lida_em) : hoje) : null, observacao, ativo: true,
      };
      const existente = await this.prisma.agendaMarco.findUnique({ where: { chave: m.chave }, select: { id: true } });
      if (existente) { await this.prisma.agendaMarco.update({ where: { id: existente.id }, data: dados }); resultado.atualizados += 1; }
      else { await this.prisma.agendaMarco.create({ data: { chave: m.chave, ...dados } }); resultado.criados += 1; }
      if (confirmado) resultado.confirmados += 1;
      if (problemas.length) resultado.divergentes.push(`${m.chave}: ${problemas.join('; ')}`);
    }
    return resultado;
  }

  // ───────────────────────── Lembretes por e-mail ─────────────────────────

  async meusLembretes(email: string) {
    const lembretes = await this.prisma.agendaLembrete.findMany({ where: { user_email: email.toLowerCase() }, orderBy: { createdAt: 'asc' } });
    const ids = lembretes.filter((l) => l.escopo !== 'todas').map((l) => l.escopo);
    const empresas = ids.length ? await this.prisma.empresa.findMany({ where: { id: { in: ids } }, select: { id: true, razao_social: true } }) : [];
    const nome = new Map(empresas.map((e) => [e.id, e.razao_social]));
    return {
      email_configurado: this.mail.configurado,
      dias_padrao: DIAS_PADRAO,
      dias_permitidos: DIAS_PERMITIDOS,
      lembretes: lembretes.map((l) => ({ id: l.id, escopo: l.escopo, empresa: l.escopo === 'todas' ? null : nome.get(l.escopo) ?? null, dias_antes: l.dias_antes, ativo: l.ativo })),
    };
  }

  async salvarLembrete(email: string, dados: { escopo?: string; dias_antes?: unknown; ativo?: boolean }) {
    const user_email = email.toLowerCase();
    const escopo = (dados.escopo ?? 'todas').trim() || 'todas';
    if (escopo !== 'todas') {
      const e = await this.prisma.empresa.findUnique({ where: { id: escopo }, select: { id: true } });
      if (!e) throw new NotFoundException('Empresa não encontrada');
    }
    const dias_antes = normalizarDias(dados.dias_antes);
    const ativo = dados.ativo !== false;
    const l = await this.prisma.agendaLembrete.upsert({
      where: { user_email_escopo: { user_email, escopo } },
      create: { user_email, escopo, dias_antes, ativo },
      update: { dias_antes, ativo },
    });
    return { id: l.id, escopo: l.escopo, dias_antes: l.dias_antes, ativo: l.ativo };
  }

  async removerLembrete(email: string, id: string) {
    const r = await this.prisma.agendaLembrete.deleteMany({ where: { id, user_email: email.toLowerCase() } });
    if (!r.count) throw new NotFoundException('Lembrete não encontrado');
    return { ok: true };
  }

  /** Marcos confirmados que valem para o escopo do lembrete (todas as empresas ou uma só). Null se a empresa deixou de existir. */
  private marcosDoEscopo(escopo: string, confirmados: MarcoDoBanco[], empresas: EmpresaResumo[]): MarcoDoBanco[] | null {
    if (escopo === 'todas') return confirmados;
    const e = empresas.find((x) => x.id === escopo);
    if (!e) return null;
    return confirmados.filter((m) => aplicaAoPerfil(m, { regime: e.regime_atual?.trim() || null, uf: e.uf?.trim() || null }));
  }

  /** Empresas cadastradas a que cada marco com restrição de regime ou UF se aplica (para mostrar no e-mail). */
  private empresasPorMarco(marcos: MarcoDoBanco[], empresas: EmpresaResumo[]) {
    const mapa = new Map<string, string[]>();
    for (const m of marcos) {
      if (!m.regimes.length && !m.ufs.length) continue;
      const nomes = empresas.filter((e) => aplicaAoPerfil(m, { regime: e.regime_atual?.trim() || null, uf: e.uf?.trim() || null })).map((e) => e.razao_social);
      if (nomes.length) mapa.set(m.id, nomes);
    }
    return mapa;
  }

  private async paraEmail(itens: ItemLembrete<MarcoDoBanco>[]): Promise<ItemLembrete<MarcoParaEmail>[]> {
    const pendentes = await this.revisao.pendentesPorAlvo('marco', itens.map((i) => i.marco.id));
    return itens.map((i) => ({
      diasAntes: i.diasAntes,
      marco: {
        ...i.marco,
        fontes: fontesDoMarco(i.marco.fontes).map(linhaDaFonte),
        aviso: avisoDeRevisao((pendentes.get(i.marco.id) ?? []) as RevisaoDoMarco[]),
      },
    }));
  }

  /** Envia a mensagem de teste ao próprio usuário, com as datas confirmadas dos próximos 60 dias. */
  async enviarTeste(email: string, escopo = 'todas', agora: Date = new Date()) {
    if (!this.mail.configurado) throw new BadRequestException('O envio de e-mail ainda não está configurado no servidor (SMTP).');
    const hoje = hojeBrasilia(agora);
    const [marcos, empresas] = await Promise.all([
      this.prisma.agendaMarco.findMany({ where: { ativo: true, confirmado: true } }),
      this.prisma.empresa.findMany({ where: { status: { not: 'Inativa' } }, select: { id: true, razao_social: true, regime_atual: true, uf: true } }),
    ]);
    const doEscopo = this.marcosDoEscopo(escopo, marcos, empresas);
    if (!doEscopo) throw new NotFoundException('Empresa não encontrada');
    const itens = doEscopo
      .map((m) => ({ marco: m, diasAntes: diasEntre(hoje, dataAlvo(m)) }))
      .filter((i) => i.diasAntes >= 0 && i.diasAntes <= 60)
      .sort((a, b) => a.diasAntes - b.diasAntes);
    if (!itens.length) throw new BadRequestException('Não há datas confirmadas nos próximos 60 dias para este escopo.');
    const nomeEscopo = escopo === 'todas' ? 'todas as empresas' : empresas.find((e) => e.id === escopo)?.razao_social;
    const e = montarEmailLembrete(await this.paraEmail(itens), hoje, { urlPublica: this.mail.urlPublica, teste: true, escopo: nomeEscopo, empresas: this.empresasPorMarco(doEscopo, empresas) });
    const r = await this.mail.enviar({ to: email, subject: e.assunto, html: e.html, text: e.texto });
    if (!r.enviado) throw new BadRequestException(`Não foi possível enviar: ${r.motivo}`);
    return { enviado: true, datas: itens.length };
  }

  /** Todo dia às 7h (Brasília): avisa quem ativou o lembrete dos marcos que estão a 30, 7 ou 1 dia (ou como cada pessoa escolheu). */
  @Cron('0 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async lembretesDiarios() {
    try {
      const r = await this.enviarLembretes();
      this.log.log(`Lembretes da agenda: ${r.avisos} aviso(s) enviado(s), ${r.falhas} falha(s), ${r.desativados} desativado(s)`);
    } catch (e) {
      this.log.error(`Lembretes da agenda falharam: ${(e as Error).message}`);
    }
  }

  /** Cada combinação (pessoa, marco, antecedência) sai uma vez só: o registro de envios impede repetição se o serviço rodar duas vezes no dia. */
  async enviarLembretes(agora: Date = new Date()) {
    const resultado = { avisos: 0, falhas: 0, desativados: 0 };
    if (!this.mail.configurado) return resultado;
    const hoje = hojeBrasilia(agora);
    const assinaturas = await this.prisma.agendaLembrete.findMany({ where: { ativo: true } });
    if (!assinaturas.length) return resultado;
    const [marcos, empresas] = await Promise.all([
      this.prisma.agendaMarco.findMany({ where: { ativo: true, confirmado: true } }),
      this.prisma.empresa.findMany({ where: { status: { not: 'Inativa' } }, select: { id: true, razao_social: true, regime_atual: true, uf: true } }),
    ]);

    for (const a of assinaturas) {
      const doEscopo = this.marcosDoEscopo(a.escopo, marcos, empresas);
      if (!doEscopo) { // a empresa foi excluída ou inativada: o lembrete deixa de fazer sentido
        await this.prisma.agendaLembrete.update({ where: { id: a.id }, data: { ativo: false } });
        resultado.desativados += 1;
        continue;
      }
      const candidatos = lembretesDoDia(doEscopo, hoje, a.dias_antes);
      if (!candidatos.length) continue;
      const jaEnviados = await this.prisma.agendaLembreteEnvio.findMany({
        where: { lembrete_id: a.id, marco_id: { in: candidatos.map((c) => c.marco.id) } },
        select: { marco_id: true, dias_antes: true },
      });
      const novos = candidatos.filter((c) => !jaEnviados.some((e) => e.marco_id === c.marco.id && e.dias_antes === c.diasAntes));
      if (!novos.length) continue;

      const nomeEscopo = a.escopo === 'todas' ? 'todas as empresas' : empresas.find((e) => e.id === a.escopo)?.razao_social;
      const e = montarEmailLembrete(await this.paraEmail(novos), hoje, { urlPublica: this.mail.urlPublica, escopo: nomeEscopo, empresas: this.empresasPorMarco(novos.map((n) => n.marco), empresas) });
      const r = await this.mail.enviar({ to: a.user_email, subject: e.assunto, html: e.html, text: e.texto });
      if (!r.enviado) { resultado.falhas += 1; continue; }
      await this.prisma.agendaLembreteEnvio.createMany({ data: novos.map((n) => ({ lembrete_id: a.id, marco_id: n.marco.id, dias_antes: n.diasAntes })), skipDuplicates: true });
      resultado.avisos += 1;
    }
    return resultado;
  }
}

