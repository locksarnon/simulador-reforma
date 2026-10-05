import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../auth/auth.types';

export type TelaLimpeza = 'importacao-xml' | 'operacoes' | 'empresas' | 'workroom' | 'validacoes';
export type PedidoLimpeza = { tela: TelaLimpeza; grupo_id?: string; empresa_id?: string };
export type Contagens = Record<string, number>;

export const FRASE_CONFIRMACAO = 'APAGAR';

const TELAS: TelaLimpeza[] = ['importacao-xml', 'operacoes', 'empresas', 'workroom', 'validacoes'];
const ehChaveDeObjeto = (k: string | null | undefined): k is string => !!k && !/^https?:\/\//i.test(k);
const unicos = <T>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x != null))];

/**
 * Limpeza de dados de TESTE, sempre por escopo (workroom, e opcionalmente uma
 * empresa) — nunca toca catálogos, normas, parâmetros de transição, cenários,
 * configuração, contas ou leads/newsletter. Como as tabelas de negócio não
 * têm FK nem dono por usuário, o escopo é derivado aqui:
 *   Grupo.id            → ImportacaoXML*.grupo_id, HistoricoXML.grupo_id, Simulacao/Diagnostico.grupo_id
 *   Grupo.numero        → Empresa.grupo
 *   Empresa.id (cuid)   → ImportacaoXMLItem.empresa_id, HistoricoXML.empresa_id, CfopEmpresaRegra.empresa_id, Simulacao.empresa_id
 *   Empresa.id_empresa  → Operacao.empresa_id
 */
@Injectable()
export class LimpezaService {
  private readonly logger = new Logger(LimpezaService.name);

  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  private async escopo(p: PedidoLimpeza) {
    if (!TELAS.includes(p.tela)) throw new BadRequestException('Tela desconhecida.');
    if (p.tela === 'validacoes') return null;
    if (!p.grupo_id) throw new BadRequestException('Informe o workroom (grupo_id).');
    const grupo = await this.prisma.grupo.findUnique({ where: { id: p.grupo_id } });
    if (!grupo) throw new NotFoundException('Workroom não encontrado.');
    const empresas = await this.prisma.empresa.findMany({
      where: { grupo: grupo.numero, ...(p.empresa_id ? { id: p.empresa_id } : {}) },
      select: { id: true, id_empresa: true },
    });
    if (p.empresa_id && empresas.length === 0) throw new NotFoundException('Empresa não pertence a este workroom.');
    return { grupo, empresaIds: empresas.map((e) => e.id), empresaCodigos: empresas.map((e) => e.id_empresa) };
  }

  /** IDs de tudo que será apagado + chaves de arquivos no armazenamento. */
  private async levantar(p: PedidoLimpeza, user: AuthUser) {
    const ids = { itens: [] as string[], historico: [] as string[], arquivos: [] as string[], lotes: [] as string[], operacoes: [] as string[], empresas: [] as string[], regrasCfop: [] as string[], simulacoes: [] as string[], diagnosticos: [] as string[], validacoes: [] as string[] };
    const chaves: string[] = [];
    let desvincularOperacoes: string[] = [];
    let desvincularEmpresas: string[] = [];

    if (p.tela === 'validacoes') {
      const rows = await this.prisma.validacaoCadastro.findMany({ where: { criado_por: user.email }, select: { id: true, storage_key: true } });
      ids.validacoes = rows.map((r) => r.id);
      chaves.push(...rows.map((r) => r.storage_key).filter(ehChaveDeObjeto));
      return { ids, chaves, desvincularOperacoes, desvincularEmpresas };
    }

    const esc = (await this.escopo(p))!;
    const gid = esc.grupo.id;
    const porEmpresa = !!p.empresa_id;

    const levantarXml = async () => {
      if (!porEmpresa) {
        const lotes = await this.prisma.importacaoXMLLote.findMany({ where: { grupo_id: gid }, select: { id: true, status: true, updatedAt: true } });
        // Só bloqueia se o processamento mexeu no lote nos últimos 10 min — um lote travado de vez não pode impedir a limpeza.
        const recente = Date.now() - 10 * 60 * 1000;
        if (lotes.some((l) => (l.status === 'PROCESSANDO' || l.status === 'RECEBIDO') && l.updatedAt.getTime() > recente)) {
          throw new ConflictException('Há um lote de XML sendo processado neste workroom. Aguarde terminar e tente de novo.');
        }
        ids.lotes = lotes.map((l) => l.id);
        const arquivos = await this.prisma.importacaoXMLArquivo.findMany({ where: { grupo_id: gid }, select: { id: true, storage_key: true } });
        ids.arquivos = arquivos.map((a) => a.id);
        chaves.push(...arquivos.map((a) => a.storage_key).filter(ehChaveDeObjeto));
      }
      const filtroEmpresa = porEmpresa ? { empresa_id: { in: esc.empresaIds } } : {};
      const itens = await this.prisma.importacaoXMLItem.findMany({ where: { grupo_id: gid, ...filtroEmpresa }, select: { id: true, operacao_id: true } });
      ids.itens = itens.map((i) => i.id);
      const hist = await this.prisma.historicoXML.findMany({ where: { grupo_id: gid, ...filtroEmpresa }, select: { id: true, operacao_id: true } });
      ids.historico = hist.map((h) => h.id);
      // Operações criadas pela importação vão junto: senão, ao reimportar, o histórico limpo deixaria duplicá-las.
      ids.operacoes.push(...unicos([...itens.map((i) => i.operacao_id), ...hist.map((h) => h.operacao_id)]));
    };

    const levantarOperacoes = async () => {
      const ops = await this.prisma.operacao.findMany({ where: { empresa_id: { in: esc.empresaCodigos } }, select: { id: true } });
      ids.operacoes.push(...ops.map((o) => o.id));
    };

    if (p.tela === 'importacao-xml') await levantarXml();
    if (p.tela === 'operacoes') await levantarOperacoes();
    if (p.tela === 'empresas' || p.tela === 'workroom') {
      if (p.tela === 'workroom') await levantarXml();
      await levantarOperacoes();
      ids.empresas = esc.empresaIds;
      desvincularEmpresas = esc.empresaIds;
      const regras = await this.prisma.cfopEmpresaRegra.findMany({ where: { empresa_id: { in: esc.empresaIds } }, select: { id: true } });
      ids.regrasCfop = regras.map((r) => r.id);
      const sims = await this.prisma.simulacao.findMany({
        where: p.tela === 'workroom' ? { OR: [{ grupo_id: gid }, { empresa_id: { in: esc.empresaIds } }] } : { empresa_id: { in: esc.empresaIds } },
        select: { id: true },
      });
      ids.simulacoes = sims.map((s) => s.id);
      if (p.tela === 'workroom') {
        const diags = await this.prisma.diagnostico.findMany({ where: { grupo_id: gid }, select: { id: true } });
        ids.diagnosticos = diags.map((d) => d.id);
      }
    }
    ids.operacoes = unicos(ids.operacoes);
    desvincularOperacoes = ids.operacoes;
    return { ids, chaves: unicos(chaves), desvincularOperacoes, desvincularEmpresas };
  }

  private contar(ids: Awaited<ReturnType<LimpezaService['levantar']>>['ids'], arquivosNoStorage: number): Contagens {
    const c: Contagens = {
      'Lotes de XML': ids.lotes.length,
      'Arquivos XML': ids.arquivos.length,
      'Itens importados': ids.itens.length,
      'Histórico de importação': ids.historico.length,
      'Operações': ids.operacoes.length,
      'Empresas': ids.empresas.length,
      'Regras de CFOP por empresa': ids.regrasCfop.length,
      'Simulações salvas': ids.simulacoes.length,
      'Diagnósticos': ids.diagnosticos.length,
      'Validações de cadastro': ids.validacoes.length,
      'Arquivos no armazenamento': arquivosNoStorage,
    };
    return Object.fromEntries(Object.entries(c).filter(([, v]) => v > 0));
  }

  async previa(p: PedidoLimpeza, user: AuthUser) {
    const { ids, chaves } = await this.levantar(p, user);
    return { contagens: this.contar(ids, chaves.length), frase: FRASE_CONFIRMACAO };
  }

  async executar(p: PedidoLimpeza & { confirmacao?: string }, user: AuthUser) {
    if (String(p.confirmacao ?? '').trim().toUpperCase() !== FRASE_CONFIRMACAO) {
      throw new BadRequestException(`Para confirmar, digite ${FRASE_CONFIRMACAO}.`);
    }
    const { ids, chaves, desvincularOperacoes, desvincularEmpresas } = await this.levantar(p, user);
    const contagens = this.contar(ids, chaves.length);

    await this.prisma.$transaction(async (tx) => {
      if (desvincularOperacoes.length) {
        // Itens que sobrarem (ex.: limpar só Operações) voltam a "não confirmados".
        await tx.importacaoXMLItem.updateMany({ where: { operacao_id: { in: desvincularOperacoes } }, data: { operacao_id: null, confirmado_em: null } });
        await tx.historicoXML.deleteMany({ where: { operacao_id: { in: desvincularOperacoes } } });
      }
      if (desvincularEmpresas.length) {
        await tx.importacaoXMLItem.updateMany({ where: { empresa_id: { in: desvincularEmpresas } }, data: { empresa_id: null } });
        await tx.historicoXML.deleteMany({ where: { empresa_id: { in: desvincularEmpresas } } });
      }
      await tx.importacaoXMLItem.deleteMany({ where: { id: { in: ids.itens } } });
      await tx.historicoXML.deleteMany({ where: { id: { in: ids.historico } } });
      await tx.importacaoXMLArquivo.deleteMany({ where: { id: { in: ids.arquivos } } });
      await tx.importacaoXMLLote.deleteMany({ where: { id: { in: ids.lotes } } });
      await tx.operacao.deleteMany({ where: { id: { in: ids.operacoes } } });
      await tx.cfopEmpresaRegra.deleteMany({ where: { id: { in: ids.regrasCfop } } });
      await tx.simulacao.deleteMany({ where: { id: { in: ids.simulacoes } } });
      await tx.diagnostico.deleteMany({ where: { id: { in: ids.diagnosticos } } });
      await tx.empresa.deleteMany({ where: { id: { in: ids.empresas } } });
      await tx.validacaoCadastro.deleteMany({ where: { id: { in: ids.validacoes } } });
    });

    // Armazenamento só depois do commit: se a transação falhar, nada some do MinIO.
    let removidos = 0;
    for (const k of chaves) {
      try { await this.storage.removeObject(k); removidos++; } catch (e) { this.logger.warn(`Objeto ${k} não removido: ${(e as Error).message}`); }
    }
    this.logger.warn(`Limpeza "${p.tela}" por ${user.email} (grupo ${p.grupo_id ?? '-'}, empresa ${p.empresa_id ?? '-'}): ${JSON.stringify(contagens)}`);
    return { apagados: contagens, arquivos_removidos: removidos, arquivos_com_falha: chaves.length - removidos };
  }
}
