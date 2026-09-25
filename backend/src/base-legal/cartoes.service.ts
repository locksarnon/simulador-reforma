import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buscarCartoes } from './cartoes.busca';
import { CARTOES_INICIAIS } from './cartoes-iniciais';

export type FundamentoCartao = { norma: string; caminho: string; trecho: string };
export type DadosCartao = { tema?: string; pergunta?: string; sinonimos?: string; resposta?: string; ressalvas?: string; fundamentos?: FundamentoCartao[] };

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

@Injectable()
export class CartoesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cada fundamento precisa existir na Base legal e o trecho precisa estar, literalmente, no dispositivo. */
  async validarFundamentos(fundamentos: FundamentoCartao[]): Promise<string[]> {
    const problemas: string[] = [];
    for (const f of fundamentos) {
      const d = await this.prisma.dispositivoLegal.findFirst({ where: { caminho: f.caminho, norma: { chave: f.norma } }, select: { texto: true } });
      if (!d) problemas.push(`${f.norma}/${f.caminho}: dispositivo não encontrado`);
      else if (f.trecho && !norm(d.texto).includes(norm(f.trecho))) problemas.push(`${f.norma}/${f.caminho}: o trecho não consta no texto — "${f.trecho.slice(0, 50)}…"`);
    }
    return problemas;
  }

  /** Grava o primeiro lote como rascunho (não sobrescreve cartões existentes). */
  async semear() {
    let criados = 0;
    let existentes = 0;
    const erros: string[] = [];
    for (const c of CARTOES_INICIAIS) {
      if (await this.prisma.cartaoLegal.findUnique({ where: { pergunta: c.pergunta } })) { existentes += 1; continue; }
      const problemas = await this.validarFundamentos(c.fundamentos);
      if (problemas.length) { erros.push(`"${c.pergunta.slice(0, 50)}…": ${problemas.join('; ')}`); continue; }
      await this.prisma.cartaoLegal.create({
        data: { tema: c.tema, pergunta: c.pergunta, sinonimos: c.sinonimos, resposta: c.resposta, ressalvas: c.ressalvas ?? null, fundamentos: c.fundamentos, status: 'rascunho' },
      });
      criados += 1;
    }
    return { criados, existentes, erros };
  }

  /** Consultores veem só os revisados; o administrador vê tudo. */
  async listar(admin: boolean) {
    const cartoes = await this.prisma.cartaoLegal.findMany({ where: admin ? {} : { status: 'revisado' }, orderBy: [{ tema: 'asc' }, { createdAt: 'asc' }] });
    return Promise.all(cartoes.map((c) => this.comNumeros(c)));
  }

  async buscar(consulta: string, admin: boolean) {
    const base = await this.prisma.cartaoLegal.findMany({ where: admin ? {} : { status: 'revisado' } });
    const achados = buscarCartoes(consulta, base);
    return Promise.all(achados.map(({ pontos: _p, ...c }) => this.comNumeros(c)));
  }

  /** Acrescenta o nome da norma (LC 214/2025…) aos fundamentos para exibição. */
  private async comNumeros<T extends { fundamentos: unknown }>(c: T) {
    const fund = (c.fundamentos as FundamentoCartao[]) ?? [];
    const normas = await this.prisma.normaLegal.findMany({ where: { chave: { in: [...new Set(fund.map((f) => f.norma))] } }, select: { chave: true, numero: true } });
    const numero = new Map(normas.map((n) => [n.chave, n.numero]));
    const rotulos = await this.prisma.dispositivoLegal.findMany({
      where: { OR: fund.map((f) => ({ caminho: f.caminho, norma: { chave: f.norma } })) },
      select: { caminho: true, rotulo: true, norma: { select: { chave: true } } },
    });
    const rot = new Map(rotulos.map((r) => [`${r.norma.chave}/${r.caminho}`, r.rotulo]));
    return { ...c, fundamentos: fund.map((f) => ({ ...f, numero: numero.get(f.norma) ?? f.norma, rotulo: rot.get(`${f.norma}/${f.caminho}`) ?? f.caminho })) };
  }

  async criar(dados: DadosCartao, email: string) {
    const { tema, pergunta, resposta } = dados;
    if (!tema?.trim() || !pergunta?.trim() || !resposta?.trim()) throw new BadRequestException('Tema, pergunta e resposta são obrigatórios');
    const fundamentos = dados.fundamentos ?? [];
    if (!fundamentos.length) throw new BadRequestException('Informe ao menos um fundamento (norma e artigo)');
    const problemas = await this.validarFundamentos(fundamentos);
    if (problemas.length) throw new BadRequestException(problemas.join(' | '));
    return this.prisma.cartaoLegal.create({
      data: { tema: tema.trim(), pergunta: pergunta.trim(), sinonimos: dados.sinonimos?.trim() || null, resposta: resposta.trim(), ressalvas: dados.ressalvas?.trim() || null, fundamentos, status: 'rascunho', revisado_por: null, revisado_em: null },
    }).catch(() => { throw new BadRequestException(`Já existe um cartão com essa pergunta (${email})`); });
  }

  /** Editar devolve o cartão para rascunho: precisa ser revisado de novo. */
  async atualizar(id: string, dados: DadosCartao) {
    const atual = await this.prisma.cartaoLegal.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Cartão não encontrado');
    if (dados.fundamentos) {
      const problemas = await this.validarFundamentos(dados.fundamentos);
      if (problemas.length) throw new BadRequestException(problemas.join(' | '));
    }
    return this.prisma.cartaoLegal.update({
      where: { id },
      data: {
        ...(dados.tema !== undefined ? { tema: dados.tema.trim() } : {}),
        ...(dados.pergunta !== undefined ? { pergunta: dados.pergunta.trim() } : {}),
        ...(dados.sinonimos !== undefined ? { sinonimos: dados.sinonimos.trim() || null } : {}),
        ...(dados.resposta !== undefined ? { resposta: dados.resposta.trim() } : {}),
        ...(dados.ressalvas !== undefined ? { ressalvas: dados.ressalvas.trim() || null } : {}),
        ...(dados.fundamentos ? { fundamentos: dados.fundamentos } : {}),
        status: 'rascunho', revisado_por: null, revisado_em: null,
      },
    });
  }

  async definirStatus(id: string, status: 'revisado' | 'rascunho', email: string) {
    const c = await this.prisma.cartaoLegal.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Cartão não encontrado');
    return this.prisma.cartaoLegal.update({ where: { id }, data: status === 'revisado' ? { status, revisado_por: email, revisado_em: new Date() } : { status, revisado_por: null, revisado_em: null } });
  }

  async remover(id: string) {
    await this.prisma.cartaoLegal.delete({ where: { id } }).catch(() => { throw new NotFoundException('Cartão não encontrado'); });
    return { ok: true };
  }
}
