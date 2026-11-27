import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CnpjService } from '../../cnpj/cnpj.service';
import { atualizarEmpresaPeloCnpj } from '../../cnpj/dados-publicos';
import { ATIVIDADES, ROTULO_ATIVIDADE, ehAtividade, ehRegimeCliente, regraDoCnae, soDigitosCnae } from '../fiscal';
import type { Camada } from '../tipos';
import { nomeDoErp } from '../../erps/erps.service';
import { CAMADAS_DAS_ATIVIDADES, FASES, LISTA_FASES, MODULOS_PADRAO, camadaTravada, camadasAtivas, conflito, exigirVersao, TX_LONGA, quem, type Fase, type Json, type Usuario } from './constantes';

const texto = (v: unknown, max: number) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

type EmpresaCnae = { cnpj_cpf?: string | null; cnae_principal?: string | null; cnae_descricao?: string | null; cnaes_secundarios?: unknown };

/** PJ (CNPJ, 14 dígitos), PF (CPF, 11) ou sem documento no cadastro. */
export function tipoDeDocumento(cnpjCpf: unknown): 'PJ' | 'PF' | 'SEM_DOCUMENTO' {
  const d = digitos(cnpjCpf);
  return d.length === 14 ? 'PJ' : d.length === 11 ? 'PF' : 'SEM_DOCUMENTO';
}

/** Atividades que o cadastro do cliente traz: o CNAE principal e os secundários (gravados pela consulta pública do CNPJ), sem repetir. */
export function atividadesDoCadastro(empresa: EmpresaCnae): { codigo: string; descricao: string }[] {
  const atividades: { codigo: string; descricao: string }[] = [];
  if (empresa.cnae_principal) atividades.push({ codigo: String(empresa.cnae_principal), descricao: empresa.cnae_descricao ?? '' });
  if (Array.isArray(empresa.cnaes_secundarios)) {
    for (const c of empresa.cnaes_secundarios as { codigo?: string | number; descricao?: string }[]) {
      const codigo = c?.codigo == null ? '' : String(c.codigo);
      if (codigo && !atividades.some((a) => a.codigo === codigo)) atividades.push({ codigo, descricao: c.descricao ?? '' });
    }
  }
  return atividades;
}

const MSG_PF = 'Pessoa física: marque as atividades na lista.';

/**
 * Projeto como a API devolve: o ERP é o do Cadastro de ERPs (erp_id). `erp` e `erp_nome` trazem o nome do cadastro; o texto gravado na
 * coluna `erp` (o que estava digitado antes do Cadastro de ERPs) vai só em `erp_texto_original`, como registro histórico, nunca como ERP
 * atual. Sem vínculo, vale o texto (é o único nome que há).
 */
async function comErpDoCadastro<T extends { erp?: string | null; erp_id?: string | null }>(prisma: unknown, p: T) {
  const nome = await nomeDoErp(prisma, p.erp_id, p.erp);
  return { ...p, erp: nome, erp_nome: nome, erp_texto_original: p.erp ?? null };
}

export type EntradaConfiguracao = {
  versao?: number; erp?: string | null; erp_id?: string | null; erp_versao?: string | null; estabelecimentos?: string[]; responsavel?: string | null;
  modulos?: Partial<typeof MODULOS_PADRAO>;
  /** Regime do cliente (premissa da Fase 2, lista REGIMES_CLIENTE); null ou '' limpa. Também aceito dentro de `parametros`. */
  regimeCliente?: string | null;
  parametros?: { corteMovimentacao?: string | null; competenciaEntregue?: string | null; motor?: Record<string, unknown> | null; regimeCliente?: string | null };
};

/** Projeto do Saneamento de Estoques: configuração, atividades do cliente e a TRAVA POR FASE (a Fase 2 exige Fase 1 liberada, regime e atividades). */
@Injectable()
export class SanProjetoService {
  private readonly log = new Logger('SanProjetoService');
  constructor(private readonly prisma: PrismaService, @Optional() private readonly cnpj?: CnpjService) {}

  /**
   * Cria o projeto a partir do projeto de consultoria (a data-base vem dele). Um por projeto de consultoria. As atividades vêm do CNAE
   * principal e dos secundários do cadastro; se o cliente é PJ e o cadastro ainda não tem CNAE, consulta o CNPJ agora (atualizando os
   * dados públicos do cliente). Falha ou demora da consulta não impede abrir o projeto: volta em `avisoAtividades`.
   */
  async criar(diagnosticoId: string, usuario?: Usuario) {
    const diag = await this.prisma.projetoDiagnostico.findUnique({ where: { id: diagnosticoId } });
    if (!diag) throw new NotFoundException('Projeto de consultoria não encontrado.');
    if (diag.servico_consultoria !== 'saneamento-estoques') throw new BadRequestException('Este projeto não é de Saneamento de estoques.');
    if (!diag.periodo_inicio) throw new BadRequestException('Informe a data-base do projeto de consultoria.');
    if (diag.empresa_ids.length !== 1) throw new BadRequestException('O Saneamento de estoques é de um cliente por projeto.');
    const ja = await this.prisma.sanProjeto.findUnique({ where: { diagnostico_id: diagnosticoId } });
    if (ja) throw new ConflictException({ statusCode: 409, codigo: 'PROJETO_JA_EXISTE', message: 'Este projeto já foi aberto.', projetoId: ja.id });
    let empresa = await this.prisma.empresa.findUnique({ where: { id: diag.empresa_ids[0] } });
    if (!empresa) throw new NotFoundException('Cliente do projeto não encontrado.');
    let avisoAtividades: string | null = null;
    if (atividadesDoCadastro(empresa).length === 0) {
      const tipo = tipoDeDocumento(empresa.cnpj_cpf);
      if (tipo === 'PJ' && this.cnpj) {
        try {
          empresa = await atualizarEmpresaPeloCnpj<typeof empresa>(this.prisma as never, this.cnpj, empresa);
          if (atividadesDoCadastro(empresa).length === 0) avisoAtividades = 'O cadastro do cliente não tem CNAE e a consulta ao CNPJ não trouxe atividades.';
        } catch (e) {
          avisoAtividades = `O cadastro do cliente não tem CNAE e a consulta ao CNPJ falhou (${(e as Error).message}). Use "Buscar atividades pelo CNPJ" na Configuração.`;
          this.log.warn(`Saneamento (projeto de consultoria ${diagnosticoId}): ${avisoAtividades}`);
        }
      } else if (tipo === 'PF') avisoAtividades = MSG_PF;
      else avisoAtividades = 'O cadastro do cliente não tem CNPJ nem CNAE: acrescente as atividades à mão.';
    }
    const atividades = atividadesDoCadastro(empresa);
    try {
    const criado = await this.prisma.$transaction(async (tx) => {
      const p = await tx.sanProjeto.create({
        data: {
          diagnostico_id: diag.id, empresa_id: empresa.id, data_base: diag.periodo_inicio as Date, erp: empresa.erp ?? null, erp_id: (empresa as { erp_id?: string | null }).erp_id ?? null, erp_versao: empresa.erp_versao ?? null,
          responsavel: diag.responsavel ?? null, modulos: { ...MODULOS_PADRAO }, parametros: {}, criado_por: quem(usuario),
          cnpj_versao: empresa.dados_publicos_em ? empresa.dados_publicos_em.toISOString() : null,
        },
      });
      if (atividades.length) await tx.sanAtividade.createMany({ data: atividades.map((a) => ({ projeto_id: p.id, codigo: a.codigo, descricao: a.descricao, origem: 'CNPJ', mantida: true })) });
      return p;
    });
    return { ...(await comErpDoCadastro(this.prisma, criado)), avisoAtividades };
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException({ statusCode: 409, codigo: 'PROJETO_JA_EXISTE', message: 'Este projeto já foi aberto.' });
      throw e;
    }
  }

  /** Data-base: a fonte única é o projeto de consultoria (a cópia no projeto de saneamento é só o valor de abertura). yyyy-mm-dd. */
  async dataBase(projetoId: string): Promise<string> {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { diagnostico_id: true, data_base: true } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    const d = await this.prisma.projetoDiagnostico.findUnique({ where: { id: p.diagnostico_id }, select: { periodo_inicio: true } });
    return (d?.periodo_inicio ?? p.data_base).toISOString().slice(0, 10);
  }

  async obter(id: string) {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id }, include: { atividades: { orderBy: { createdAt: 'asc' } } } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    const empresa = await this.prisma.empresa.findUnique({ where: { id: p.empresa_id }, select: { dados_publicos_em: true, cnpj_cpf: true, cnae_principal: true, cnaes_secundarios: true } });
    const atual = empresa?.dados_publicos_em ? empresa.dados_publicos_em.toISOString() : null;
    const data_base = new Date(`${await this.dataBase(id)}T00:00:00.000Z`);
    // O que a tela precisa para explicar uma lista vazia (PF, cadastro sem CNAE) e para mostrar de onde veio cada atividade.
    const cliente = {
      tipoDocumento: tipoDeDocumento(empresa?.cnpj_cpf), temCnae: !!empresa && atividadesDoCadastro(empresa).length > 0,
      cnaePrincipal: empresa?.cnae_principal ?? null, dadosPublicosEm: atual,
    };
    // Quantos itens a base tem: a tela escolhe a aba de abertura sem esperar a visão geral.
    const totalItens = await this.prisma.sanItem.count({ where: { projeto_id: id } });
    return {
      ...(await comErpDoCadastro(this.prisma, p)), data_base, totalItens, atividadesConfirmadas: !!p.atividades_confirmadas_em, cnpjDesatualizado: !!atual && atual !== p.cnpj_versao,
      mapaAtividades: mapaDeAtividades(p.atividades.filter((a) => a.mantida).map((a) => a.codigo)), cliente,
      listaAtividades: ATIVIDADES.map((codigo) => ({ codigo, rotulo: ROTULO_ATIVIDADE[codigo] })),
    };
  }

  async obterPorDiagnostico(diagnosticoId: string) {
    const p = await this.prisma.sanProjeto.findUnique({ where: { diagnostico_id: diagnosticoId }, select: { id: true } });
    if (!p) throw new NotFoundException('Este projeto de consultoria ainda não foi aberto no Saneamento.');
    return this.obter(p.id);
  }

  async configurar(id: string, e: EntradaConfiguracao) {
    const versao = exigirVersao(e.versao);
    const dados: Json = {};
    // A coluna `erp` guarda o texto original (registro histórico do que estava digitado): uma vez gravado, não muda, nem quando a tela devolve o
    // nome do cadastro. Só é preenchida quando está vazia.
    const atualErp = e.erp !== undefined || e.erp_id !== undefined ? await this.prisma.sanProjeto.findUnique({ where: { id }, select: { erp: true, erp_id: true } }) : null;
    if (e.erp !== undefined && !String(atualErp?.erp ?? '').trim()) dados.erp = texto(e.erp, 120);
    // ERP selecionado no Cadastro de ERPs: grava o vínculo (erp_id), que é o que vale para o nome exibido (comErpDoCadastro). Escolhido um ERP,
    // não se volta a "sem ERP" (a associação automática religaria o texto): troca-se por outro da lista, e o "Outro ERP (sem perfil)" serve
    // quando o do cliente não está cadastrado.
    if (e.erp_id !== undefined) {
      if (e.erp_id === null || e.erp_id === '') {
        if (atualErp?.erp_id) throw new BadRequestException('O ERP do projeto não fica vazio depois de escolhido: selecione outro na lista (ou "Outro ERP (sem perfil)").');
        dados.erp_id = null;
      } else {
        const erp = await this.prisma.erp.findUnique({ where: { id: String(e.erp_id) }, select: { id: true, nome: true } });
        if (!erp) throw new BadRequestException('ERP não encontrado no Cadastro de ERPs: selecione na lista.');
        dados.erp_id = erp.id;
        if (!String(dados.erp ?? atualErp?.erp ?? '').trim()) dados.erp = erp.nome;
      }
    }
    if (e.erp_versao !== undefined) dados.erp_versao = texto(e.erp_versao, 60);
    if (e.responsavel !== undefined) dados.responsavel = texto(e.responsavel, 120);
    if (e.estabelecimentos !== undefined) {
      const lista = [...new Set((e.estabelecimentos ?? []).map((s) => String(s).trim()).filter(Boolean))].slice(0, 200);
      dados.estabelecimentos = lista;
    }
    const atualParam = (await this.prisma.sanProjeto.findUnique({ where: { id }, select: { parametros: true } }))?.parametros as Json | undefined;
    if (e.parametros !== undefined) {
      const corte = e.parametros?.corteMovimentacao !== undefined ? e.parametros.corteMovimentacao : ((atualParam?.corteMovimentacao as string | null | undefined) ?? null);
      if (corte !== null && !ISO.test(corte)) throw new BadRequestException('O corte de movimentação deve ser uma data (aaaa-mm-dd).');
      if (e.parametros?.motor != null && (typeof e.parametros.motor !== 'object' || Array.isArray(e.parametros.motor))) throw new BadRequestException('Os parâmetros do motor devem ser um objeto.');
      // Última competência de escrituração já entregue (aaaa-mm), informada pelo consultor: classifica o impacto no SPED.
      const bruta = e.parametros?.competenciaEntregue !== undefined ? e.parametros.competenciaEntregue : ((atualParam?.competenciaEntregue as string | null | undefined) ?? null);
      const competenciaEntregue = bruta === '' ? null : bruta;
      if (competenciaEntregue !== null && !COMPETENCIA.test(String(competenciaEntregue))) throw new BadRequestException('A última competência de escrituração já entregue deve ser um mês (aaaa-mm).');
      // Mescla: o que não veio fica como estava (o `motor` só muda se vier).
      const motor = e.parametros?.motor !== undefined ? e.parametros.motor : atualParam?.motor;
      dados.parametros = { ...(atualParam ?? {}), corteMovimentacao: corte, competenciaEntregue, ...(motor ? { motor } : {}) };
      if (!motor) delete (dados.parametros as Json).motor;
    }
    const regimeBruto = e.regimeCliente !== undefined ? e.regimeCliente : e.parametros?.regimeCliente;
    if (regimeBruto !== undefined) {
      const regime = regimeBruto === null || String(regimeBruto).trim() === '' ? null : String(regimeBruto).trim();
      if (regime !== null && !ehRegimeCliente(regime)) throw new BadRequestException({ statusCode: 400, codigo: 'REGIME_INVALIDO', message: `Regime do cliente inválido: ${regime}. Selecione na lista.` });
      const base = { ...((dados.parametros as Json | undefined) ?? atualParam ?? {}) };
      if (regime) base.regimeCliente = regime; else delete base.regimeCliente;
      dados.parametros = base;
    }
    const atual = await this.prisma.sanProjeto.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Projeto de saneamento não encontrado.');
    if (e.modulos !== undefined) {
      const m = { ...MODULOS_PADRAO, ...((atual.modulos as Json) ?? {}) } as Json;
      for (const k of Object.keys(MODULOS_PADRAO)) if (typeof (e.modulos as Json)[k] === 'boolean') m[k] = (e.modulos as Json)[k];
      dados.modulos = m;
    }
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.sanProjeto.updateMany({ where: { id, versao }, data: { ...dados, versao: { increment: 1 } } as never });
      if (r.count === 0) throw conflito();
      if (dados.modulos && camadasAtivas(dados.modulos as Json).includes('ESTOQUE')) {
        let cursor: string | undefined;
        for (;;) {
          const lote = await tx.sanItem.findMany({ where: { projeto_id: id }, orderBy: { id: 'asc' }, take: 5000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, grupo: true } });
          if (lote.length) await tx.sanCelula.createMany({ data: lote.map((i) => ({ projeto_id: id, item_id: i.id, camada: 'ESTOQUE', grupo: i.grupo ?? '' })), skipDuplicates: true });
          if (lote.length < 5000) break;
          cursor = lote[lote.length - 1].id;
        }
      }
    }, TX_LONGA);
    return this.obter(id);
  }

  // ── Atividades ─────────────────────────────────────────────────────────────

  private async exigirAberto(id: string) {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    if (p.atividades_confirmadas_em) throw new ConflictException({ statusCode: 409, codigo: 'ATIVIDADES_CONFIRMADAS', message: 'As atividades estão confirmadas. Reabra para alterar.' });
    return p;
  }

  listarAtividades(projetoId: string) {
    return this.prisma.sanAtividade.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'asc' } });
  }

  async adicionarAtividade(projetoId: string, e: { codigo?: string; descricao?: string }) {
    await this.exigirAberto(projetoId);
    const codigo = texto(e.codigo, 40);
    const descricao = texto(e.descricao, 200);
    if (!codigo || !descricao) throw new BadRequestException('Informe o código e a descrição da atividade.');
    const cnae = soDigitosCnae(codigo);
    if (!ehAtividade(codigo) && cnae.length !== 7) {
      throw new BadRequestException(`Atividade inválida: use um CNAE de 7 dígitos ou um item da lista (${ATIVIDADES.join(', ')}).`);
    }
    const ja = await this.prisma.sanAtividade.findFirst({ where: { projeto_id: projetoId, codigo } });
    if (ja) {
      if (ja.mantida) throw new BadRequestException('Esta atividade já está na lista.');
      return this.prisma.sanAtividade.update({ where: { id: ja.id }, data: { mantida: true } });
    }
    try {
      return await this.prisma.sanAtividade.create({ data: { projeto_id: projetoId, codigo: ehAtividade(codigo) ? codigo : cnae, descricao, origem: 'MANUAL', mantida: true } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException({ statusCode: 409, codigo: 'ATIVIDADE_JA_EXISTE', message: 'Esta atividade acabou de ser incluída por outra pessoa.' });
      throw e;
    }
  }

  async alterarAtividade(projetoId: string, atividadeId: string, e: { mantida?: boolean }) {
    await this.exigirAberto(projetoId);
    if (typeof e.mantida !== 'boolean') throw new BadRequestException('Informe se a atividade é mantida ou excluída.');
    const r = await this.prisma.sanAtividade.updateMany({ where: { id: atividadeId, projeto_id: projetoId }, data: { mantida: e.mantida } });
    if (r.count === 0) throw new NotFoundException('Atividade não encontrada.');
    return this.listarAtividades(projetoId);
  }

  /**
   * Busca as atividades pelo CNPJ agora: consulta a Receita, atualiza os dados públicos do cliente e acrescenta (origem CNPJ) os CNAEs que
   * faltam na lista. Nada é apagado: as manuais ficam e as excluídas pelo consultor continuam excluídas. Com as atividades confirmadas a
   * trava não muda: nada é acrescentado, a resposta diz o que falta (`pendentes`) e o projeto passa a mostrar "Revisar atividades"
   * (os dados do CNPJ ficam mais novos que os da confirmação: o mesmo aviso de quando o CNPJ muda).
   */
  async buscarAtividadesPeloCnpj(projetoId: string, versao: unknown) {
    const v = exigirVersao(versao);
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    if (p.versao !== v) throw conflito();
    const antes = await this.prisma.empresa.findUnique({ where: { id: p.empresa_id } });
    if (!antes) throw new NotFoundException('Cliente do projeto não encontrado.');
    const tipo = tipoDeDocumento(antes.cnpj_cpf);
    if (tipo === 'PF') throw new BadRequestException(MSG_PF);
    if (tipo !== 'PJ') throw new BadRequestException('O cadastro do cliente não tem CNPJ: informe o CNPJ no cadastro ou acrescente as atividades à mão.');
    if (!this.cnpj) throw new BadRequestException('A consulta ao CNPJ não está disponível neste servidor.');
    let empresa: typeof antes;
    try {
      empresa = await atualizarEmpresaPeloCnpj<typeof antes>(this.prisma as never, this.cnpj, antes);
    } catch (e) {
      throw new BadRequestException(`Não foi possível consultar o CNPJ agora: ${(e as Error).message}`);
    }
    const doCnpj = atividadesDoCadastro(empresa);
    const existentes = new Set((await this.prisma.sanAtividade.findMany({ where: { projeto_id: projetoId }, select: { codigo: true } })).map((a) => a.codigo));
    const faltam = doCnpj.filter((a) => !existentes.has(a.codigo));
    const confirmadas = !!p.atividades_confirmadas_em;
    if (!confirmadas) {
      await this.prisma.$transaction(async (tx) => {
        // A lista foi revista com os dados novos do CNPJ: a versão do CNPJ do projeto acompanha (sem aviso de "revisar").
        const r = await tx.sanProjeto.updateMany({
          where: { id: projetoId, versao: v, atividades_confirmadas_em: null },
          data: { cnpj_versao: empresa.dados_publicos_em ? empresa.dados_publicos_em.toISOString() : null, versao: { increment: 1 } },
        });
        if (r.count === 0) throw conflito();
        if (faltam.length) await tx.sanAtividade.createMany({ data: faltam.map((a) => ({ projeto_id: projetoId, codigo: a.codigo, descricao: a.descricao, origem: 'CNPJ', mantida: true })), skipDuplicates: true });
      });
    }
    let aviso: string | null = null;
    if (doCnpj.length === 0) aviso = 'O cadastro do cliente não tem CNAE e a consulta ao CNPJ não trouxe atividades: acrescente as atividades à mão.';
    else if (confirmadas) {
      aviso = faltam.length
        ? `As atividades estão confirmadas: o CNPJ traz ${faltam.length} CNAE(s) que não estão na lista. Reabra as atividades e busque de novo para incluí-los.`
        : 'As atividades estão confirmadas e o CNPJ não trouxe CNAE novo. Confira a lista (aviso "Revisar atividades").';
    } else if (!faltam.length) aviso = 'Nenhuma atividade nova: a lista já tem todos os CNAEs do CNPJ.';
    return {
      acrescentadas: confirmadas ? [] : faltam, pendentes: confirmadas ? faltam : [], atividadesConfirmadas: confirmadas,
      revisarAtividades: confirmadas, aviso, projeto: await this.obter(projetoId),
    };
  }

  /** Trava: registra quem e quando. Exige pelo menos uma atividade mantida. */
  async confirmarAtividades(projetoId: string, versao: unknown, usuario?: Usuario) {
    const v = exigirVersao(versao);
    return this.prisma.$transaction(async (tx) => {
      const mantidas = await tx.sanAtividade.count({ where: { projeto_id: projetoId, mantida: true } });
      if (mantidas < 1) throw new BadRequestException('Mantenha ou acrescente pelo menos uma atividade antes de confirmar.');
      const proj = await tx.sanProjeto.findUnique({ where: { id: projetoId }, select: { empresa_id: true } });
      const emp = proj ? await tx.empresa.findUnique({ where: { id: proj.empresa_id }, select: { dados_publicos_em: true } }) : null;
      const r = await tx.sanProjeto.updateMany({
        where: { id: projetoId, versao: v }, data: { atividades_confirmadas_por: quem(usuario), atividades_confirmadas_em: new Date(), cnpj_versao: emp?.dados_publicos_em ? emp.dados_publicos_em.toISOString() : null, versao: { increment: 1 } },
      });
      if (r.count === 0) throw conflito();
      return tx.sanProjeto.findUnique({ where: { id: projetoId } });
    }).then((p) => (p ? comErpDoCadastro(this.prisma, p) : p));
  }

  /** Reabre a trava: as células já trabalhadas das camadas dependentes viram "revisar"; decisões e casos ficam como estão. */
  async reabrirAtividades(projetoId: string, versao: unknown) {
    const v = exigirVersao(versao);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.sanProjeto.updateMany({
        where: { id: projetoId, versao: v, atividades_confirmadas_em: { not: null } },
        data: { atividades_confirmadas_por: null, atividades_confirmadas_em: null, versao: { increment: 1 } },
      });
      if (r.count === 0) {
        const p = await tx.sanProjeto.findUnique({ where: { id: projetoId } });
        if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
        if (p.versao !== v) throw conflito();
        throw new BadRequestException('As atividades já estão abertas.');
      }
      await tx.sanCelula.updateMany({
        where: { projeto_id: projetoId, camada: { in: CAMADAS_DAS_ATIVIDADES }, situacao: { not: 'PENDENTE' } },
        data: { revisar: true, revisar_causa: 'Atividades do cliente reabertas: revise o que depende delas.' },
      });
      return tx.sanProjeto.findUnique({ where: { id: projetoId } });
    }).then((p) => (p ? comErpDoCadastro(this.prisma, p) : p));
  }

  /** O projeto (sem trava): importação e camadas da Fase 1 só exigem que ele exista. */
  async exigirProjeto(projetoId: string) {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    return p;
  }

  /**
   * A trava por fase (docs/saneamento-fases.md, "Travas"): importação e camadas da Fase 1 são livres; FINALIDADE, NCM_CLASSIFICACAO e
   * TRIBUTARIO (análise e gravação de casos) exigem, nesta ordem, a Fase 1 liberada, o regime do cliente e as atividades confirmadas.
   * Recusa com 400 e o `codigo` da primeira condição que falta.
   */
  async exigirLiberadaPara(projetoId: string, camadas: string | string[]) {
    const p = await this.exigirProjeto(projetoId);
    if (([] as string[]).concat(camadas).some(camadaTravada)) {
      const b = await this.bloqueioDaFase2(p);
      if (b) throw new BadRequestException({ statusCode: 400, codigo: b.codigo, message: b.mensagem });
    }
    return p;
  }

  /** A primeira condição da Fase 2 que falta (null = liberada). */
  async bloqueioDaFase2(p: { id: string; parametros: unknown; atividades_confirmadas_em: Date | null }): Promise<{ codigo: CodigoBloqueio; mensagem: string } | null> {
    if (!(await this.versaoLiberada(p.id, 'FASE1'))) return { codigo: 'FASE1_NAO_LIBERADA', mensagem: MSG_BLOQUEIO.FASE1_NAO_LIBERADA };
    if (!ehRegimeCliente((p.parametros as Json | null)?.regimeCliente)) return { codigo: 'REGIME_NAO_INFORMADO', mensagem: MSG_BLOQUEIO.REGIME_NAO_INFORMADO };
    if (!p.atividades_confirmadas_em) return { codigo: 'ATIVIDADES_NAO_CONFIRMADAS', mensagem: MSG_BLOQUEIO.ATIVIDADES_NAO_CONFIRMADAS };
    return null;
  }

  /** A última versão liberada da fase (`resumo.fase`); versões antigas, sem fase, não contam. */
  async versaoLiberada(projetoId: string, fase: Fase): Promise<{ versaoId: string; numero: number; em: string } | null> {
    const versoes = await this.prisma.sanVersao.findMany({ where: { projeto_id: projetoId }, orderBy: { numero: 'desc' }, select: { id: true, numero: true, resumo: true, createdAt: true } });
    const v = versoes.find((x) => (x.resumo as Json | null)?.fase === fase);
    return v ? { versaoId: v.id, numero: v.numero, em: new Date(v.createdAt).toISOString() } : null;
  }

  /** As fases do projeto: camadas ativas de cada uma, a versão liberada e o que impede a fase (só a Fase 2 tem trava). */
  async fases(projetoId: string) {
    const p = await this.exigirProjeto(projetoId);
    const ativas = camadasAtivas(p.modulos as Json);
    const bloqueio2 = await this.bloqueioDaFase2(p);
    return {
      fases: await Promise.all(LISTA_FASES.map(async (fase) => ({
        fase, camadas: (FASES[fase] as readonly Camada[]).filter((c) => ativas.includes(c)), liberada: await this.versaoLiberada(projetoId, fase),
        bloqueio: fase === 'FASE2' ? bloqueio2 : null,
      }))),
    };
  }
}

export type CodigoBloqueio = 'FASE1_NAO_LIBERADA' | 'REGIME_NAO_INFORMADO' | 'ATIVIDADES_NAO_CONFIRMADAS';
export const MSG_BLOQUEIO: Record<CodigoBloqueio, string> = {
  FASE1_NAO_LIBERADA: 'Libere a Fase 1 (versão "Cadastro saneado") antes de analisar ou decidir as camadas da Fase 2.',
  REGIME_NAO_INFORMADO: 'Informe o regime do cliente na Configuração antes de analisar ou decidir as camadas da Fase 2.',
  ATIVIDADES_NAO_CONFIRMADAS: 'Confirme as atividades do cliente antes de analisar ou decidir as camadas da Fase 2.',
};

/** Mapa das atividades mantidas para a lista fechada (CNAE sem regra fica em `semMapeamento`, nunca é chutado). */
export function mapaDeAtividades(codigos: string[]) {
  const mapeadas: { codigo: string; atividade: string; rotulo: string; motivo: string }[] = [];
  const semMapeamento: string[] = [];
  for (const c of codigos) {
    if (ehAtividade(c)) { mapeadas.push({ codigo: c, atividade: c, rotulo: ROTULO_ATIVIDADE[c], motivo: 'Marcada na lista de atividades' }); continue; }
    const r = regraDoCnae(c);
    if (r && r.atividades.length) for (const a of r.atividades) mapeadas.push({ codigo: c, atividade: a, rotulo: ROTULO_ATIVIDADE[a], motivo: r.motivo }); else semMapeamento.push(c);
  }
  return { mapeadas, semMapeamento };
}
