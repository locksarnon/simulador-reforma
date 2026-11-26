import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CAMPO_AFETA, TX_LONGA, aplicarCampo, camadasAtivas, conflito, derivadosDoTrabalho, fatiar, igual, quem, type Json, type Usuario } from './constantes';
import { SAN_IMPORTADOR, type ImportadorPort, type ItemImportado, type SaidaImportacao } from './portas';
import { SanProjetoService } from './projeto.service';

export type ArquivoImportacao = { buffer: Buffer; nome: string };
type Diferenca = { itemId: string; codigo: string; estabelecimento: string; campos: { campo: string; antes: unknown; depois: unknown; protegido: boolean }[] };

/**
 * O que incorporar na reimportação: a lista de ids escolhidos um a um, ou um filtro sobre TODAS as diferenças do arquivo
 * (sem listar ids): ALTERADOS = todos os itens alterados (campo protegido por decisão nunca é sobrescrito);
 * ALTERADOS_SEM_PROTEGIDO = só os itens sem nenhum campo protegido. `exceto` tira itens do filtro.
 */
export type EscolhaIncorporar = string[] | { filtro: 'ALTERADOS' | 'ALTERADOS_SEM_PROTEGIDO'; exceto?: string[] };
export type OpcoesPrevia = { pagina?: unknown; limite?: unknown; filtro?: unknown };
const FILTROS_DIFERENCA = ['TODAS', 'COM_PROTEGIDO', 'SEM_PROTEGIDO'] as const;
const LIMITE_DIFERENCAS = 200;
const MAX_LIMITE_DIFERENCAS = 1000;

const inteiro = (v: unknown, nome: string): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new BadRequestException(`"${nome}" deve ser um número inteiro.`);
  return n;
};

/** Valida a escolha do que incorporar (lista de ids ou filtro). */
function validarEscolha(v: unknown): EscolhaIncorporar {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) {
    if (v.some((x) => typeof x !== 'string')) throw new BadRequestException('"incorporar" deve ser uma lista de ids ou um filtro.');
    return v as string[];
  }
  if (typeof v === 'object') {
    const o = v as { filtro?: unknown; exceto?: unknown };
    if (o.filtro !== 'ALTERADOS' && o.filtro !== 'ALTERADOS_SEM_PROTEGIDO') throw new BadRequestException('Filtro de incorporação inválido (ALTERADOS ou ALTERADOS_SEM_PROTEGIDO).');
    if (o.exceto !== undefined && (!Array.isArray(o.exceto) || o.exceto.some((x) => typeof x !== 'string'))) throw new BadRequestException('"exceto" deve ser uma lista de ids.');
    return { filtro: o.filtro, exceto: (o.exceto as string[] | undefined) ?? [] };
  }
  throw new BadRequestException('"incorporar" deve ser uma lista de ids ou um filtro.');
}

/** Quais itens alterados entram: os ids escolhidos ou os do filtro (menos os de `exceto`). */
function quaisIncorporar(e: EscolhaIncorporar, difs: Map<string, Diferenca>): (itemId: string) => boolean {
  if (Array.isArray(e)) { const s = new Set(e); return (id) => s.has(id); }
  const fora = new Set(e.exceto ?? []);
  return (id) => {
    if (fora.has(id)) return false;
    const d = difs.get(id);
    if (!d) return false;
    return e.filtro === 'ALTERADOS' || !d.campos.some((x) => x.protegido);
  };
}

/** Estado do item como a base o guarda (sem a linha de origem). */
const comoGuardado = (i: ItemImportado): Json => { const { linha: _l, ...resto } = i; return resto as Json; };
const achatar = (t: Json): Json => { const { campos, ...topo } = t; return { ...topo, ...((campos as Json) ?? {}) }; };
const chave = (estabelecimento: string | null | undefined, codigo: string) => `${estabelecimento ?? ''}\u0000${codigo}`;

/** Importação: prévia (nada gravado), confirmação e reimportação com diferenças. Decisão do consultor nunca é sobrescrita. */
@Injectable()
export class SanImportacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projetos: SanProjetoService,
    @Inject(SAN_IMPORTADOR) private readonly importador: ImportadorPort,
  ) {}

  private async ler(projetoId: string, arquivo: ArquivoImportacao, mapeamento?: Record<string, string>) {
    const p = await this.projetos.exigirConfirmadas(projetoId); // A TRAVA
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie o arquivo do cadastro de itens.');
    const saida: SaidaImportacao = await this.importador.ler({
      arquivo: arquivo.buffer, nomeArquivo: arquivo.nome, mapeamento, estabelecimentos: ((p.estabelecimentos as string[]) ?? []),
    });
    // Defesa: a mesma chave duas vezes no arquivo fica só a primeira.
    const vistos = new Set<string>();
    const itens: ItemImportado[] = [];
    const repetidas: { linha: number; codigo: string | null; motivo: string }[] = [];
    for (const it of saida.itens) {
      const k = chave(it.estabelecimento, it.codigo);
      if (vistos.has(k)) { repetidas.push({ linha: it.linha, codigo: it.codigo, motivo: 'Código repetido no arquivo (para o mesmo estabelecimento); valeu a primeira linha.' }); continue; }
      vistos.add(k);
      itens.push({ ...it, estabelecimento: it.estabelecimento ?? null });
    }
    const relatorio = { ...saida.relatorio, aceitas: itens.length, rejeitadas: saida.relatorio.rejeitadas + repetidas.length, linhasRejeitadas: [...saida.relatorio.linhasRejeitadas, ...repetidas] };
    return { p, itens, relatorio, mapeamento: saida.mapeamento, previaDoArquivo: saida.previa };
  }

  private async comparar(projetoId: string, itens: ItemImportado[]) {
    const existentes = await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId }, select: { id: true, estabelecimento: true, codigo: true, lido: true, versao: true } });
    const porChave = new Map(existentes.map((e) => [chave(e.estabelecimento, e.codigo), e]));
    const novos: ItemImportado[] = [];
    const alterados: { existente: (typeof existentes)[number]; item: ItemImportado; campos: { campo: string; antes: unknown; depois: unknown }[] }[] = [];
    let inalterados = 0;
    const naArquivo = new Set<string>();
    for (const it of itens) {
      const k = chave(it.estabelecimento, it.codigo);
      naArquivo.add(k);
      const e = porChave.get(k);
      if (!e) { novos.push(it); continue; }
      const antes = achatar((e.lido as Json) ?? {});
      const depois = achatar(comoGuardado(it));
      const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter((c) => c !== 'estabelecimento' && c !== 'codigo' && !igual(antes[c], depois[c])).map((campo) => ({ campo, antes: antes[campo] ?? null, depois: depois[campo] ?? null }));
      if (campos.length) alterados.push({ existente: e, item: it, campos }); else inalterados++;
    }
    const ausentes = existentes.filter((e) => !naArquivo.has(chave(e.estabelecimento, e.codigo)));
    // Campo já decidido (aprovado ou incorporado) é protegido: a reimportação não o sobrescreve.
    const protegidos = new Set<string>();
    for (const lote of fatiar(alterados.map((a) => a.existente.id), 2000)) {
      const decs = await this.prisma.sanDecisao.findMany({ where: { projeto_id: projetoId, item_id: { in: lote }, tipo: { in: ['aprovar', 'importar'] } }, select: { item_id: true, campo: true } });
      for (const d of decs) protegidos.add(`${d.item_id}\u0000${d.campo}`);
    }
    const diferencas: Diferenca[] = alterados.map((a) => ({
      itemId: a.existente.id, codigo: a.item.codigo, estabelecimento: a.item.estabelecimento ?? '',
      campos: a.campos.map((c) => ({ ...c, protegido: protegidos.has(`${a.existente.id}\u0000${c.campo}`) })),
    }));
    return { novos, alterados, diferencas, inalterados, ausentes };
  }

  /**
   * Nada é gravado. Mostra o que seria aceito, o que é novo, o que mudou (e o que está protegido por decisão) e o que sumiu.
   * Os totais são sempre do arquivo inteiro; as diferenças vêm paginadas (`pagina`, `limite`) e podem ser filtradas por proteção.
   */
  async previa(projetoId: string, arquivo: ArquivoImportacao, mapeamento?: Record<string, string>, opcoes: OpcoesPrevia = {}) {
    const limite = Math.min(Math.max(inteiro(opcoes.limite, 'limite') ?? LIMITE_DIFERENCAS, 1), MAX_LIMITE_DIFERENCAS);
    const pagina = Math.max(inteiro(opcoes.pagina, 'pagina') ?? 1, 1);
    const filtro = opcoes.filtro == null || opcoes.filtro === '' ? 'TODAS' : String(opcoes.filtro);
    if (!(FILTROS_DIFERENCA as readonly string[]).includes(filtro)) throw new BadRequestException('Filtro de diferenças inválido (TODAS, COM_PROTEGIDO ou SEM_PROTEGIDO).');
    const { itens, relatorio, mapeamento: usado, previaDoArquivo } = await this.ler(projetoId, arquivo, mapeamento);
    const c = await this.comparar(projetoId, itens);
    const comProtegido = (d: Diferenca) => d.campos.some((x) => x.protegido);
    const filtradas = filtro === 'TODAS' ? c.diferencas : c.diferencas.filter((d) => comProtegido(d) === (filtro === 'COM_PROTEGIDO'));
    const totais = {
      novos: c.novos.length, alterados: c.diferencas.length, inalterados: c.inalterados, ausentes: c.ausentes.length,
      alteradosComProtegido: c.diferencas.filter(comProtegido).length,
      alteradosIncorporaveis: c.diferencas.filter((d) => d.campos.some((x) => !x.protegido)).length,
      camposProtegidos: c.diferencas.reduce((s, d) => s + d.campos.filter((x) => x.protegido).length, 0),
    };
    return {
      mapeamento: usado, relatorio,
      colunas: previaDoArquivo?.colunas ?? [], sugestao: { colunas: previaDoArquivo?.sugestaoColunas ?? [] }, amostra: previaDoArquivo?.amostra ?? [],
      novos: totais.novos, inalterados: totais.inalterados, alterados: totais.alterados, ausentesDoArquivo: totais.ausentes, totais,
      diferencas: filtradas.slice((pagina - 1) * limite, pagina * limite),
      paginaDiferencas: { pagina, limite, filtro, total: filtradas.length, paginas: Math.max(1, Math.ceil(filtradas.length / limite)) },
      amostraNovos: c.novos.slice(0, 20).map((i) => ({ codigo: i.codigo, estabelecimento: i.estabelecimento, descricao: i.descricao })),
    };
  }

  /**
   * Grava. Itens novos entram; os já existentes mantêm a base de trabalho (decisões e rascunhos preservados). `incorporar` lista os ids de
   * itens cujas diferenças do arquivo o consultor quer trazer para a base de trabalho (campos com decisão ficam como estão).
   */
  async confirmar(projetoId: string, arquivo: ArquivoImportacao, mapeamento: Record<string, string> | undefined, incorporar: EscolhaIncorporar | null | undefined, usuario?: Usuario) {
    const escolha = validarEscolha(incorporar);
    const { p, itens, relatorio, mapeamento: usado } = await this.ler(projetoId, arquivo, mapeamento);
    const camadas = camadasAtivas(p.modulos as Json);
    const quemFez = quem(usuario);
    // A comparação (leitura pesada) fica fora da transação; dentro dela só se reconfere versão e proteção dos itens que vão ser alterados.
    const c = await this.comparar(projetoId, itens);
    const difPorItem = new Map(c.diferencas.map((d) => [d.itemId, d]));
    const escolhido = quaisIncorporar(escolha, difPorItem);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const imp = await tx.sanImportacao.create({
          data: { projeto_id: projetoId, arquivo: arquivo.nome.slice(0, 255), usuario: quemFez, mapeamento: usado, aceitas: relatorio.aceitas, rejeitadas: relatorio.rejeitadas, pendentes: relatorio.pendentes, relatorio: {} },
        });
        // Itens novos (id estável gerado aqui, nunca mais muda) e suas células.
        let criados = 0;
        for (const lote of fatiar(c.novos, 1000)) {
          const novos = await tx.sanItem.createManyAndReturn({
            data: lote.map((it) => {
              const t = comoGuardado(it);
              return { projeto_id: projetoId, estabelecimento: it.estabelecimento ?? '', codigo: it.codigo, linha: it.linha, importacao_id: imp.id, original: t as never, lido: t as never, trabalho: t as never, ...derivadosDoTrabalho(t) };
            }),
            select: { id: true, grupo: true },
          });
          criados += novos.length;
          await tx.sanCelula.createMany({ data: novos.flatMap((n) => camadas.map((camada) => ({ projeto_id: projetoId, item_id: n.id, camada, grupo: n.grupo ?? '' }))), skipDuplicates: true });
        }
        // Existentes: a última leitura é atualizada; a base de trabalho só muda no que o consultor escolheu e não tem decisão.
        let incorporados = 0;
        const ignorados: { itemId: string; campo: string; motivo: string }[] = [];
        // Em blocos: proteção (decisões) e itens lidos de uma vez; decisões e células gravadas por bloco.
        // Item não escolhido fica de fora: a última leitura NÃO avança, para a diferença continuar aparecendo na próxima reimportação.
        for (const lote of fatiar(c.alterados.filter((a) => escolhido(a.existente.id)), 500)) {
          const ids = lote.map((a) => a.existente.id);
          const decididos = await tx.sanDecisao.findMany({ where: { item_id: { in: ids }, tipo: { in: ['aprovar', 'importar'] } }, select: { item_id: true, campo: true } });
          const protegidosAgora = new Set(decididos.map((d) => `${d.item_id}\u0000${d.campo}`));
          const atuais = new Map((await tx.sanItem.findMany({ where: { id: { in: ids } }, select: { id: true, trabalho: true, versao: true } })).map((i) => [i.id, i]));
          const decs: Json[] = [];
          const revisarPor = new Map<string, string[]>();
          const porGrupo = new Map<string, string[]>();
          for (const a of lote) {
            const id = a.existente.id;
            const t = comoGuardado(a.item);
            const protegido = (campo: string) => protegidosAgora.has(`${id}\u0000${campo}`);
            const todas = difPorItem.get(id)!.campos;
            for (const x of todas.filter((y) => protegido(y.campo))) ignorados.push({ itemId: id, campo: x.campo, motivo: 'Campo já decidido: a decisão foi mantida.' });
            const aplicar = todas.filter((y) => !protegido(y.campo));
            if (!aplicar.length) {
              // Todas as diferenças escolhidas estavam protegidas por decisão: a leitura avança (a decisão manda).
              await tx.sanItem.updateMany({ where: { id }, data: { lido: t as never } });
              continue;
            }
            const atual = atuais.get(id)!;
            const trabalho = JSON.parse(JSON.stringify(atual.trabalho)) as Json;
            for (const x of aplicar) {
              const antes = aplicarCampo(trabalho, x.campo, x.depois, false);
              decs.push({ projeto_id: projetoId, item_id: id, caso_id: null, campo: x.campo, antes: antes as never, depois: (x.depois ?? null) as never, fundamento: `Reimportação de ${arquivo.nome}`, usuario: quemFez, tipo: 'importar' });
            }
            const d = derivadosDoTrabalho(trabalho);
            const r = await tx.sanItem.updateMany({ where: { id, versao: atual.versao }, data: { trabalho: trabalho as never, lido: t as never, ...d, versao: { increment: 1 } } });
            if (r.count === 0) throw conflito('O item foi alterado por outra pessoa durante a importação. Tente de novo.');
            const afetadas = [...new Set(aplicar.flatMap((x) => CAMPO_AFETA[x.campo] ?? ['QUALIDADE']))].sort().join(',');
            revisarPor.set(afetadas, [...(revisarPor.get(afetadas) ?? []), id]);
            const g = d.grupo ?? '';
            porGrupo.set(g, [...(porGrupo.get(g) ?? []), id]);
            incorporados++;
          }
          if (decs.length) await tx.sanDecisao.createMany({ data: decs as never });
          for (const [afetadas, itensIds] of revisarPor) {
            await tx.sanCelula.updateMany({ where: { item_id: { in: itensIds }, camada: { in: afetadas.split(',') }, situacao: { not: 'PENDENTE' } }, data: { revisar: true, revisar_causa: 'Reimportação alterou campos que esta camada usa.' } });
          }
          for (const [grupo, itensIds] of porGrupo) await tx.sanCelula.updateMany({ where: { item_id: { in: itensIds } }, data: { grupo } });
        }
        const fim = { ...relatorio, novos: criados, inalterados: c.inalterados, alterados: c.diferencas.length, incorporados, ausentesDoArquivo: c.ausentes.length, ignorados };
        await tx.sanImportacao.update({ where: { id: imp.id }, data: { relatorio: fim as never } });
        return { importacaoId: imp.id, ...fim };
      }, TX_LONGA);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw conflito('Outra importação gravou os mesmos itens ao mesmo tempo. Refaça a importação.');
      throw e;
    }
  }

  listar(projetoId: string) {
    return this.prisma.sanImportacao.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'desc' } });
  }
}
