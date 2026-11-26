import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { conflito, exigirVersao, quem, type Usuario } from '../dados/constantes';
import { canonico, conferirCoerencia, texto, validarAspecto, validarConteudo } from './conteudo-regra';
import { BIBLIOTECA_INICIAL, MODELOS, PROCEDIMENTOS } from './conteudo/biblioteca';
import type { Aspecto, ConteudoRegra, RegraBiblioteca } from './tipos';

type Json = Record<string, unknown>;
type LinhaBib = { id: string; aspecto: string; nome: string; indicada_para: string | null; observacao: string | null; conteudo: unknown; versao: number; ativa: boolean; editada: boolean; createdAt: Date; updatedAt: Date };

/** Regra da biblioteca na forma do contrato (+ `editada`: um administrador alterou; a carga não a sobrescreve). */
export const bibliotecaApi = (b: LinhaBib): RegraBiblioteca & { editada: boolean; atualizadaEm: string } => ({
  id: b.id, aspecto: b.aspecto as Aspecto, nome: b.nome, indicadaPara: b.indicada_para, observacao: b.observacao, conteudo: b.conteudo as ConteudoRegra, versao: b.versao, ativa: b.ativa,
  editada: b.editada, atualizadaEm: new Date(b.updatedAt).toISOString(),
});

/** Conteúdo completo e coerente de uma regra-modelo (400 claro). */
export function validarRegraModelo(aspecto: Aspecto, conteudo: unknown): ConteudoRegra {
  const c = validarConteudo(aspecto, conteudo, false) as ConteudoRegra;
  conferirCoerencia(c);
  return c;
}

const semAspecto = <T extends { aspecto?: unknown }>({ aspecto: _a, ...resto }: T) => resto;
const exigirAdmin = (u: Usuario) => { if (u?.role !== 'admin') throw new ForbiddenException('Somente administradores alteram a Biblioteca de diretrizes.'); };
const ID_LIVRE = /^[a-z0-9][a-z0-9-]{2,59}$/;

/**
 * Biblioteca de diretrizes (Administração): regras-modelo FAL versionadas, com histórico (cada versão fica). Leitura para quem está logado;
 * escrita só do administrador. Carga inicial idempotente no boot (ids fixos de BIBLIOTECA_INICIAL): cria o que falta e só atualiza o que
 * nenhum administrador editou, sempre como VERSÃO NOVA (o projeto vê "regra atualizada na biblioteca" e decide adotar; nada muda sozinho).
 */
@Injectable()
export class SanBibliotecaDiretrizesService implements OnApplicationBootstrap {
  private readonly log = new Logger(SanBibliotecaDiretrizesService.name);
  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
    void this.aplicarCarga().then(
      (c) => this.log.log(`Biblioteca de diretrizes: ${c.criadas} criada(s), ${c.atualizadas} atualizada(s) pela carga, ${c.ignoradas.length} ignorada(s).`),
      (e) => this.log.warn(`Biblioteca de diretrizes: carga inicial não aplicada (${(e as Error).message}).`),
    );
  }

  /** Carga inicial: id fixo, sem duplicar; regra editada por administrador fica como está; mudança da carga = versão nova. Entrada inválida é ignorada (com o motivo). */
  async aplicarCarga(carga: RegraBiblioteca[] = BIBLIOTECA_INICIAL) {
    let criadas = 0; let atualizadas = 0; const ignoradas: { id: string; motivo: string }[] = [];
    for (const r of carga) {
      let conteudo: ConteudoRegra;
      try {
        if (!ID_LIVRE.test(String(r.id))) throw new BadRequestException('id inválido');
        conteudo = validarRegraModelo(validarAspecto(r.aspecto), r.conteudo);
      } catch (e) { ignoradas.push({ id: String(r.id), motivo: (e as Error).message }); continue; }
      const dados = { aspecto: r.aspecto, nome: r.nome, indicada_para: r.indicadaPara ?? null, observacao: r.observacao ?? null, conteudo, ativa: r.ativa !== false };
      await this.prisma.$transaction(async (tx) => {
        const atual = await tx.sanDiretrizBiblioteca.findUnique({ where: { id: r.id } });
        if (!atual) {
          await tx.sanDiretrizBiblioteca.create({ data: { id: r.id, ...dados, conteudo: conteudo as never, versao: 1 } });
          await tx.sanDiretrizBibliotecaVersao.create({ data: { regra_id: r.id, versao: 1, ...semAspecto(dados), conteudo: conteudo as never, acao: 'CARGA', usuario: 'sistema' } });
          criadas++;
          return;
        }
        if (atual.editada) return;
        const igual = canonico({ aspecto: atual.aspecto, nome: atual.nome, indicada_para: atual.indicada_para, observacao: atual.observacao, conteudo: atual.conteudo, ativa: atual.ativa }) === canonico(dados);
        if (igual) return;
        const versao = atual.versao + 1;
        const x = await tx.sanDiretrizBiblioteca.updateMany({ where: { id: r.id, versao: atual.versao, editada: false }, data: { ...dados, conteudo: conteudo as never, versao } });
        if (x.count === 0) return; // alguém editou no meio: o administrador vence
        await tx.sanDiretrizBibliotecaVersao.create({ data: { regra_id: r.id, versao, ...semAspecto(dados), conteudo: conteudo as never, acao: 'CARGA', usuario: 'sistema' } });
        atualizadas++;
      });
    }
    return { criadas, atualizadas, ignoradas };
  }

  async listar(f: { aspecto?: string; ativas?: string } = {}) {
    const where: Json = {};
    if (f.aspecto) where.aspecto = validarAspecto(f.aspecto);
    if (f.ativas === 'true' || f.ativas === '1') where.ativa = true;
    const linhas: LinhaBib[] = await this.prisma.sanDiretrizBiblioteca.findMany({ where, orderBy: [{ aspecto: 'asc' }, { nome: 'asc' }] });
    return linhas.map(bibliotecaApi);
  }

  async obter(id: string) {
    const b = await this.prisma.sanDiretrizBiblioteca.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Regra da biblioteca não encontrada.');
    return bibliotecaApi(b);
  }

  /** Versões da regra-modelo (a mais nova primeiro): cada uma com o conteúdo inteiro, quem e quando. */
  async historico(id: string) {
    await this.obter(id);
    const v = await this.prisma.sanDiretrizBibliotecaVersao.findMany({ where: { regra_id: id }, orderBy: { versao: 'desc' } });
    return v.map((x) => ({ versao: x.versao, nome: x.nome, indicadaPara: x.indicada_para, observacao: x.observacao, conteudo: x.conteudo, ativa: x.ativa, acao: x.acao, usuario: x.usuario, quando: x.createdAt }));
  }

  async criar(e: Json, usuario: Usuario) {
    exigirAdmin(usuario);
    const aspecto = validarAspecto(e?.aspecto);
    const conteudo = validarRegraModelo(aspecto, e?.conteudo);
    const id = e?.id == null || e.id === '' ? `bib-${randomUUID().slice(0, 8)}` : String(e.id);
    if (!ID_LIVRE.test(id)) throw new BadRequestException('Id da regra: letras minúsculas, números e hífen (3 a 60).');
    const dados = {
      aspecto, nome: texto(e?.nome, 'o nome da regra', 160) as string, indicada_para: texto(e?.indicadaPara, 'Indicada para', 300, true), observacao: texto(e?.observacao, 'Observação', 2000, true),
      ativa: e?.ativa === undefined ? true : e.ativa === true,
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const b = await tx.sanDiretrizBiblioteca.create({ data: { id, ...dados, conteudo: conteudo as never, versao: 1, editada: true } });
        await tx.sanDiretrizBibliotecaVersao.create({ data: { regra_id: id, versao: 1, ...semAspecto(dados), conteudo: conteudo as never, acao: 'CRIOU', usuario: quem(usuario) } });
        return bibliotecaApi(b);
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw new ConflictException({ statusCode: 409, codigo: 'ID_JA_EXISTE', message: 'Já existe uma regra da biblioteca com este id.' });
      throw err;
    }
  }

  /** Alteração (só administrador): versão nova a cada alteração; `versao` = a que a pessoa viu (409 se mudou). */
  async atualizar(id: string, e: Json, usuario: Usuario) {
    exigirAdmin(usuario);
    const versao = exigirVersao(e?.versao);
    const atual = await this.prisma.sanDiretrizBiblioteca.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Regra da biblioteca não encontrada.');
    if (e?.aspecto !== undefined && e.aspecto !== atual.aspecto) throw new BadRequestException('O aspecto de uma regra da biblioteca não muda: crie outra regra.');
    const aspecto = atual.aspecto as Aspecto;
    const dados = {
      nome: e?.nome !== undefined ? (texto(e.nome, 'o nome da regra', 160) as string) : atual.nome,
      indicada_para: e?.indicadaPara !== undefined ? texto(e.indicadaPara, 'Indicada para', 300, true) : atual.indicada_para,
      observacao: e?.observacao !== undefined ? texto(e.observacao, 'Observação', 2000, true) : atual.observacao,
      conteudo: e?.conteudo !== undefined ? validarRegraModelo(aspecto, e.conteudo) : (atual.conteudo as ConteudoRegra),
      ativa: e?.ativa !== undefined ? e.ativa === true : atual.ativa,
    };
    if (canonico({ ...dados }) === canonico({ nome: atual.nome, indicada_para: atual.indicada_para, observacao: atual.observacao, conteudo: atual.conteudo, ativa: atual.ativa })) {
      if (versao !== atual.versao) throw conflito();
      return bibliotecaApi(atual);
    }
    return this.prisma.$transaction(async (tx) => {
      const nova = versao + 1;
      const x = await tx.sanDiretrizBiblioteca.updateMany({ where: { id, versao }, data: { ...dados, conteudo: dados.conteudo as never, versao: nova, editada: true } });
      if (x.count === 0) throw conflito();
      await tx.sanDiretrizBibliotecaVersao.create({ data: { regra_id: id, versao: nova, ...dados, conteudo: dados.conteudo as never, acao: 'ALTEROU', usuario: quem(usuario) } });
      return bibliotecaApi((await tx.sanDiretrizBiblioteca.findUnique({ where: { id } }))!);
    });
  }

  procedimentos() { return PROCEDIMENTOS; }
  modelos() { return MODELOS; }
}
