import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { camadasAtivas, quem, validarCamada, type Json, type Usuario } from '../dados/constantes';
import { ROTULO_CAMADA } from '../rotulos';
import { textoTratamentoSemData, tratamentoSemDataDe } from '../sem-data-movimentacao';
import type { Camada } from '../tipos';
import {
  MAX_HISTORICO, criterioPorChave, criteriosDaCamada, textoDoValor, validarValor, valorCriterio,
  type CriterioManual, type CriteriosGravados, type MudancaCriterio, type ValorCriterio,
} from './catalogo';

const MAX_TEXTO_MANUAL = 400;
const MAX_MANUAIS = 100;

/** O que muda numa gravação (sempre com uma linha de histórico). */
type Operacao =
  | { tipo: 'AJUSTE'; camada: Camada; chave: string; valor: ValorCriterio }
  | { tipo: 'INCLUIR_MANUAL'; manual: CriterioManual }
  | { tipo: 'REMOVER_MANUAL'; id: string };

const lerManuais = (par: Json | null | undefined): CriterioManual[] => (Array.isArray(par?.criteriosManuais) ? (par!.criteriosManuais as CriterioManual[]) : []);
const lerHistorico = (par: Json | null | undefined): MudancaCriterio[] => (Array.isArray(par?.criteriosHistorico) ? (par!.criteriosHistorico as MudancaCriterio[]) : []);

/**
 * "O que foi considerado" (GET/PUT/POST projetos/:id/criterios): lista o catálogo de cada camada ativa com o valor efetivo, ajusta um critério,
 * inclui ou remove uma verificação manual. Tudo vai em `SanProjeto.parametros` (criterios, criteriosManuais, criteriosAlteradosEm, criteriosHistorico),
 * gravado de forma atômica (jsonb_set) sem tocar nas outras chaves. Ajustar um critério marca a camada como "desatualizada" (estado-camadas).
 */
@Injectable()
export class SanCriteriosService {
  constructor(private readonly prisma: PrismaService) {}

  private async parametros(projetoId: string) {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { parametros: true, modulos: true } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    return { parametros: (p.parametros ?? {}) as Json, modulos: p.modulos as Json };
  }

  /** Critérios por camada ativa: texto, parâmetro com valor efetivo e padrão, origem (Diretrizes/Configuração) e as verificações manuais. */
  async listar(projetoId: string) {
    const { parametros: par, modulos } = await this.parametros(projetoId);
    const gravados = (par.criterios ?? {}) as CriteriosGravados;
    const manuais = lerManuais(par);
    const alteradoEm = (par.criteriosAlteradosEm ?? {}) as Record<string, string>;
    return {
      camadas: camadasAtivas(modulos).map((camada) => ({
        camada, rotulo: ROTULO_CAMADA[camada], alteradoEm: alteradoEm[camada] ?? null,
        criterios: criteriosDaCamada(camada).map((c) => ({
          id: c.id, texto: c.texto, origem: c.origem ?? null,
          // Corte: a data (a tela formata). Itens sem data: o texto pronto (tratamento, quem e quando), em `textoConfiguracao`.
          ...(c.origem === 'CONFIGURACAO' ? (c.configuracao === 'SEM_DATA'
            ? { valorConfiguracao: tratamentoSemDataDe(par), textoConfiguracao: textoTratamentoSemData(par) }
            : { valorConfiguracao: (par.corteMovimentacao as string | null | undefined) ?? null }) : {}),
          ...(c.parametro ? { parametro: { ...c.parametro, valor: valorCriterio(gravados, camada, c.parametro.chave), alterado: gravados[camada]?.[c.parametro.chave] !== undefined && valorCriterio(gravados, camada, c.parametro.chave) !== c.parametro.padrao } } : {}),
        })),
        manuais: manuais.filter((m) => m.camada === camada),
      })),
      historico: lerHistorico(par).slice(-50).reverse(),
    };
  }

  /** Ajusta o valor de um critério da camada. Valor igual ao atual: nada muda. Valor fora do mínimo/máximo: 400 com a mensagem. */
  async ajustar(projetoId: string, camadaTexto: string, chave: string, bruto: unknown, usuario?: Usuario) {
    const camada = validarCamada(String(camadaTexto));
    const c = criterioPorChave(camada, String(chave ?? ''));
    if (!c?.parametro) throw new BadRequestException('Este critério não pode ser ajustado aqui.');
    const v = validarValor(c.parametro, bruto);
    if (!v.ok) throw new BadRequestException(v.erro);
    const { parametros: par } = await this.parametros(projetoId);
    const antes = valorCriterio((par.criterios ?? {}) as CriteriosGravados, camada, c.parametro.chave)!;
    if (antes === v.valor) return { alterado: false, ...(await this.listar(projetoId)) };
    await this.gravar(projetoId, { tipo: 'AJUSTE', camada, chave: c.parametro.chave, valor: v.valor }, {
      quando: new Date().toISOString(), quem: quem(usuario), camada, acao: 'AJUSTE', criterio: c.texto, de: textoDoValor(c.parametro, antes), para: textoDoValor(c.parametro, v.valor),
    });
    return { alterado: true, ...(await this.listar(projetoId)) };
  }

  /** Inclui uma verificação manual (texto livre): vai para a política; o motor não a aplica. `nota`: ex.: "a IA não estava disponível". */
  async incluirManual(projetoId: string, camadaTexto: string, texto: unknown, usuario?: Usuario, nota?: string | null) {
    const camada = validarCamada(String(camadaTexto));
    const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
    if (t.length < 5) throw new BadRequestException('Escreva o critério em uma frase.');
    if (t.length > MAX_TEXTO_MANUAL) throw new BadRequestException(`O critério deve ter no máximo ${MAX_TEXTO_MANUAL} caracteres.`);
    const { parametros: par } = await this.parametros(projetoId);
    if (lerManuais(par).length >= MAX_MANUAIS) throw new BadRequestException(`Limite de ${MAX_MANUAIS} verificações manuais no projeto.`);
    const manual: CriterioManual = { id: randomUUID(), camada, texto: t, criadoPor: quem(usuario), criadoEm: new Date().toISOString(), nota: nota ?? null };
    await this.gravar(projetoId, { tipo: 'INCLUIR_MANUAL', manual }, { quando: manual.criadoEm, quem: manual.criadoPor, camada, acao: 'MANUAL_INCLUIDO', criterio: t, de: null, para: 'verificação manual' });
    return { manual, ...(await this.listar(projetoId)) };
  }

  async removerManual(projetoId: string, id: string, usuario?: Usuario) {
    const { parametros: par } = await this.parametros(projetoId);
    const m = lerManuais(par).find((x) => x.id === id);
    if (!m) throw new NotFoundException('Verificação manual não encontrada.');
    await this.gravar(projetoId, { tipo: 'REMOVER_MANUAL', id }, { quando: new Date().toISOString(), quem: quem(usuario), camada: m.camada, acao: 'MANUAL_REMOVIDO', criterio: m.texto, de: 'verificação manual', para: null });
    return this.listar(projetoId);
  }

  /** Grava a operação e a linha de histórico numa só instrução (jsonb_set): as demais chaves de `parametros` ficam como estão. */
  private async gravar(projetoId: string, op: Operacao, mudanca: MudancaCriterio) {
    if (typeof (this.prisma as unknown as { $executeRaw?: unknown }).$executeRaw === 'function') {
      const P = Prisma.sql`COALESCE("parametros", '{}'::jsonb)`;
      let expr: Prisma.Sql;
      if (op.tipo === 'AJUSTE') {
        expr = Prisma.sql`jsonb_set(jsonb_set(${P}, '{criterios}', COALESCE("parametros"->'criterios', '{}'::jsonb) || jsonb_build_object(${op.camada}::text, COALESCE("parametros"->'criterios'->(${op.camada}::text), '{}'::jsonb) || jsonb_build_object(${op.chave}::text, ${JSON.stringify(op.valor)}::jsonb))),
          '{criteriosAlteradosEm}', COALESCE("parametros"->'criteriosAlteradosEm', '{}'::jsonb) || jsonb_build_object(${op.camada}::text, ${mudanca.quando}::text))`;
      } else if (op.tipo === 'INCLUIR_MANUAL') {
        expr = Prisma.sql`jsonb_set(${P}, '{criteriosManuais}', COALESCE("parametros"->'criteriosManuais', '[]'::jsonb) || jsonb_build_array(${JSON.stringify(op.manual)}::jsonb))`;
      } else {
        expr = Prisma.sql`jsonb_set(${P}, '{criteriosManuais}', (SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(COALESCE("parametros"->'criteriosManuais', '[]'::jsonb)) AS e WHERE e->>'id' <> ${op.id}::text))`;
      }
      // Histórico: acrescenta a linha e guarda só as últimas MAX_HISTORICO.
      const hist = Prisma.sql`COALESCE("parametros"->'criteriosHistorico', '[]'::jsonb) || jsonb_build_array(${JSON.stringify(mudanca)}::jsonb)`;
      await this.prisma.$executeRaw`UPDATE "SanProjeto" SET "parametros" = jsonb_set(${expr}, '{criteriosHistorico}',
        (SELECT COALESCE(jsonb_agg(h.e ORDER BY h.o), '[]'::jsonb) FROM jsonb_array_elements(${hist}) WITH ORDINALITY AS h(e, o) WHERE h.o > jsonb_array_length(${hist}) - ${MAX_HISTORICO}))
        WHERE "id" = ${projetoId}`;
      return;
    }
    // Sem SQL (banco falso dos testes): mesma regra, lendo e gravando o objeto.
    const { parametros: par } = await this.parametros(projetoId);
    const novo: Json = { ...par };
    if (op.tipo === 'AJUSTE') {
      const crit = { ...((par.criterios as Json) ?? {}) };
      crit[op.camada] = { ...((crit[op.camada] as Json) ?? {}), [op.chave]: op.valor };
      novo.criterios = crit;
      novo.criteriosAlteradosEm = { ...((par.criteriosAlteradosEm as Json) ?? {}), [op.camada]: mudanca.quando };
    } else if (op.tipo === 'INCLUIR_MANUAL') novo.criteriosManuais = [...lerManuais(par), op.manual];
    else novo.criteriosManuais = lerManuais(par).filter((m) => m.id !== op.id);
    novo.criteriosHistorico = [...lerHistorico(par), mudanca].slice(-MAX_HISTORICO);
    await this.prisma.sanProjeto.update({ where: { id: projetoId }, data: { parametros: novo as never } });
  }
}
