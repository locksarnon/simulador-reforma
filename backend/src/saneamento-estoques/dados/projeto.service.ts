import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ATIVIDADES, ehAtividade, regraDoCnae, soDigitosCnae } from '../fiscal';
import { nomeDoErp } from '../../erps/erps.service';
import { CAMADAS_DAS_ATIVIDADES, MODULOS_PADRAO, camadasAtivas, conflito, exigirVersao, TX_LONGA, quem, type Json, type Usuario } from './constantes';

const texto = (v: unknown, max: number) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

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
  parametros?: { corteMovimentacao?: string | null; competenciaEntregue?: string | null; motor?: Record<string, unknown> | null };
};

/** Projeto do Saneamento de Estoques: configuração, atividades do cliente e a TRAVA (sem confirmação não há importação nem análise). */
@Injectable()
export class SanProjetoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria o projeto a partir do projeto de consultoria (a data-base vem dele). Um por projeto de consultoria. */
  async criar(diagnosticoId: string, usuario?: Usuario) {
    const diag = await this.prisma.projetoDiagnostico.findUnique({ where: { id: diagnosticoId } });
    if (!diag) throw new NotFoundException('Projeto de consultoria não encontrado.');
    if (diag.servico_consultoria !== 'saneamento-estoques') throw new BadRequestException('Este projeto não é de Saneamento de estoques.');
    if (!diag.periodo_inicio) throw new BadRequestException('Informe a data-base do projeto de consultoria.');
    if (diag.empresa_ids.length !== 1) throw new BadRequestException('O Saneamento de estoques é de um cliente por projeto.');
    const ja = await this.prisma.sanProjeto.findUnique({ where: { diagnostico_id: diagnosticoId } });
    if (ja) throw new ConflictException({ statusCode: 409, codigo: 'PROJETO_JA_EXISTE', message: 'Este projeto já foi aberto.', projetoId: ja.id });
    const empresa = await this.prisma.empresa.findUnique({ where: { id: diag.empresa_ids[0] } });
    if (!empresa) throw new NotFoundException('Cliente do projeto não encontrado.');
    const atividades: { codigo: string; descricao: string }[] = [];
    if (empresa.cnae_principal) atividades.push({ codigo: String(empresa.cnae_principal), descricao: empresa.cnae_descricao ?? '' });
    if (Array.isArray(empresa.cnaes_secundarios)) {
      for (const c of empresa.cnaes_secundarios as { codigo?: string | number; descricao?: string }[]) {
        const codigo = c?.codigo == null ? '' : String(c.codigo);
        if (codigo && !atividades.some((a) => a.codigo === codigo)) atividades.push({ codigo, descricao: c.descricao ?? '' });
      }
    }
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
    return await comErpDoCadastro(this.prisma, criado);
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
    const empresa = await this.prisma.empresa.findUnique({ where: { id: p.empresa_id }, select: { dados_publicos_em: true } });
    const atual = empresa?.dados_publicos_em ? empresa.dados_publicos_em.toISOString() : null;
    const data_base = new Date(`${await this.dataBase(id)}T00:00:00.000Z`);
    return { ...(await comErpDoCadastro(this.prisma, p)), data_base, atividadesConfirmadas: !!p.atividades_confirmadas_em, cnpjDesatualizado: !!atual && atual !== p.cnpj_versao, mapaAtividades: mapaDeAtividades(p.atividades.filter((a) => a.mantida).map((a) => a.codigo)) };
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

  /** A trava. Importação e análises chamam isto antes de qualquer coisa. */
  async exigirConfirmadas(projetoId: string) {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    if (!p.atividades_confirmadas_em) {
      throw new BadRequestException({ statusCode: 400, codigo: 'ATIVIDADES_NAO_CONFIRMADAS', message: 'Confirme as atividades do cliente antes de importar ou analisar.' });
    }
    return p;
  }
}

/** Mapa das atividades mantidas para a lista fechada (CNAE sem regra fica em `semMapeamento`, nunca é chutado). */
export function mapaDeAtividades(codigos: string[]) {
  const mapeadas: { codigo: string; atividade: string }[] = [];
  const semMapeamento: string[] = [];
  for (const c of codigos) {
    if (ehAtividade(c)) { mapeadas.push({ codigo: c, atividade: c }); continue; }
    const r = regraDoCnae(c);
    if (r && r.atividades.length) for (const a of r.atividades) mapeadas.push({ codigo: c, atividade: a }); else semMapeamento.push(c);
  }
  return { mapeadas, semMapeamento };
}
