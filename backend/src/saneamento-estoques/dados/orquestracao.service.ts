import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ContextoAnalise, ItemTrabalho } from '../tipos';
import { camadasAtivas, validarCamada, type Json } from './constantes';
import { SanCasosService } from './casos.service';
import { SAN_MOTOR, type MotorPort } from './portas';
import { idsDeAtividades } from './motor.provider';
import { SanProjetoService } from './projeto.service';
import { nomeDoErp } from '../../erps/erps.service';
import { envolverComDiretrizes } from '../diretrizes/analise';
import { indiceAplicado } from '../diretrizes/dados';
import { fecharEscopo, recortarResultado } from '../diretrizes/escopo';

/** Roda uma camada: lê os itens, chama o analisador (função pura) e grava casos e células. Os analisadores entram por injeção (SAN_MOTOR). */
@Injectable()
export class SanOrquestracaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projetos: SanProjetoService,
    private readonly casos: SanCasosService,
    @Inject(SAN_MOTOR) private readonly motor: MotorPort,
  ) {}

  /** Camadas que têm analisador conectado. */
  camadasDisponiveis() {
    return this.motor.camadas();
  }

  /**
   * `escopo` (Diretrizes: aplicar e reanalisar): a análise roda sobre a base inteira, mas só se grava o que toca estes itens (escopo fechado
   * pelos casos de conjunto, ver diretrizes/escopo.ts). As regras APLICADAS do projeto comandam as camadas (diretrizes/analise.ts); sem
   * regra aplicada, a camada roda exatamente como antes.
   */
  async executarCamada(projetoId: string, camadaTexto: string, opcoes: { escopo?: Set<string> } = {}) {
    const camada = validarCamada(camadaTexto);
    const p = await this.projetos.exigirConfirmadas(projetoId); // A TRAVA
    if (!camadasAtivas(p.modulos as Json).includes(camada)) throw new BadRequestException('Esta camada não está ligada neste projeto (módulo opcional desligado).');
    if (!this.motor.camadas().includes(camada)) throw new BadRequestException('Esta camada ainda não tem análise conectada neste servidor.');
    const itens: ItemTrabalho[] = [];
    let cursor: string | undefined;
    for (;;) {
      const lote = await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId }, orderBy: { id: 'asc' }, take: 5000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, codigo: true, estabelecimento: true, trabalho: true } });
      for (const i of lote) itens.push({ ...(i.trabalho as Json), id: i.id, codigo: String((i.trabalho as Json).codigo ?? i.codigo), estabelecimento: i.estabelecimento || null } as ItemTrabalho);
      if (lote.length < 5000) break;
      cursor = lote[lote.length - 1].id;
    }
    if (!itens.length) throw new BadRequestException('Importe o cadastro de itens antes de analisar.');
    const ativas = await this.prisma.sanAtividade.findMany({ where: { projeto_id: projetoId, mantida: true }, select: { codigo: true } });
    const contexto: ContextoAnalise = {
      dataBase: await this.projetos.dataBase(projetoId), atividades: idsDeAtividades(ativas.map((a) => a.codigo)),
      erp: await nomeDoErp(this.prisma, (p as { erp_id?: string | null }).erp_id, p.erp), erp_id: (p as { erp_id?: string | null }).erp_id ?? null,
      corteMovimentacao: ((p.parametros as Json)?.corteMovimentacao as string | null | undefined) ?? null,
      ...((p.parametros as Json)?.motor ? { parametros: (p.parametros as Json).motor } : {}),
    } as ContextoAnalise;
    const preparado = await this.motor.preparar(camada, { projetoId, itens, contexto });
    const diretrizes = await indiceAplicado(this.prisma, projetoId);
    const analisador = diretrizes ? envolverComDiretrizes(preparado.analisador, diretrizes) : preparado.analisador;
    let resultado = analisador.analisar(itens, preparado.contexto);
    let escopo: Set<string> | undefined;
    if (opcoes.escopo) {
      const abertos = await this.prisma.sanCaso.findMany({ where: { projeto_id: projetoId, camada, situacao: 'PROPOSTO' }, select: { itens: true } });
      escopo = fecharEscopo(opcoes.escopo, resultado.casos, abertos);
      resultado = recortarResultado(resultado, escopo);
    }
    const gravado = await this.casos.registrarResultado(projetoId, resultado, { completo: true, interno: true, escopo });
    // A camada de obrigações também (re)grava as linhas de impacto no SPED de todos os casos que geram ajuste.
    if (camada === 'OBRIGACOES') await this.casos.sincronizarTodosImpactos(projetoId);
    return gravado;
  }
}
