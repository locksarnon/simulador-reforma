import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CAMPO_AFETA, TX_LONGA, aplicarCampo, camadasAtivas, conflito, derivadosDoTrabalho, fatiar, igual, quem, type Json, type Usuario } from './constantes';
import { SAN_IMPORTADOR, type ImportadorPort, type ItemImportado, type SaidaImportacao } from './portas';
import { SanProjetoService } from './projeto.service';

export type ArquivoImportacao = { buffer: Buffer; nome: string };
type Diferenca = { itemId: string; codigo: string; estabelecimento: string; campos: { campo: string; antes: unknown; depois: unknown; protegido: boolean }[] };

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

  /** Nada é gravado. Mostra o que seria aceito, o que é novo, o que mudou (e o que está protegido por decisão) e o que sumiu. */
  async previa(projetoId: string, arquivo: ArquivoImportacao, mapeamento?: Record<string, string>) {
    const { itens, relatorio, mapeamento: usado, previaDoArquivo } = await this.ler(projetoId, arquivo, mapeamento);
    const c = await this.comparar(projetoId, itens);
    return {
      mapeamento: usado, relatorio,
      colunas: previaDoArquivo?.colunas ?? [], sugestao: { colunas: previaDoArquivo?.sugestaoColunas ?? [] }, amostra: previaDoArquivo?.amostra ?? [],
      novos: c.novos.length, inalterados: c.inalterados, alterados: c.diferencas.length, ausentesDoArquivo: c.ausentes.length,
      diferencas: c.diferencas.slice(0, 200), diferencasTruncadas: c.diferencas.length > 200,
      amostraNovos: c.novos.slice(0, 20).map((i) => ({ codigo: i.codigo, estabelecimento: i.estabelecimento, descricao: i.descricao })),
    };
  }

  /**
   * Grava. Itens novos entram; os já existentes mantêm a base de trabalho (decisões e rascunhos preservados). `incorporar` lista os ids de
   * itens cujas diferenças do arquivo o consultor quer trazer para a base de trabalho (campos com decisão ficam como estão).
   */
  async confirmar(projetoId: string, arquivo: ArquivoImportacao, mapeamento: Record<string, string> | undefined, incorporar: string[], usuario?: Usuario) {
    const { p, itens, relatorio, mapeamento: usado } = await this.ler(projetoId, arquivo, mapeamento);
    const camadas = camadasAtivas(p.modulos as Json);
    const quemFez = quem(usuario);
    const escolhidos = new Set(incorporar ?? []);
    // A comparação (leitura pesada) fica fora da transação; dentro dela só se reconfere versão e proteção dos itens que vão ser alterados.
    const c = await this.comparar(projetoId, itens);
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
        for (const a of c.alterados) {
          const dif = c.diferencas.find((d) => d.itemId === a.existente.id)!;
          const t = comoGuardado(a.item);
          const escolhido = escolhidos.has(a.existente.id);
          let aplicar = dif.campos.filter(() => escolhido);
          if (aplicar.length) {
            const agora = await tx.sanDecisao.findMany({ where: { item_id: a.existente.id, tipo: { in: ['aprovar', 'importar'] } }, select: { campo: true } });
            const protegidosAgora = new Set(agora.map((d) => d.campo));
            aplicar = aplicar.map((x) => ({ ...x, protegido: protegidosAgora.has(x.campo) }));
          }
          for (const x of aplicar.filter((y) => y.protegido)) ignorados.push({ itemId: a.existente.id, campo: x.campo, motivo: 'Campo já decidido: a decisão foi mantida.' });
          aplicar = aplicar.filter((y) => !y.protegido);
          if (aplicar.length) {
            const atual = await tx.sanItem.findUnique({ where: { id: a.existente.id } });
            const trabalho = JSON.parse(JSON.stringify(atual!.trabalho)) as Json;
            const decs: Json[] = [];
            for (const x of aplicar) {
              const antes = aplicarCampo(trabalho, x.campo, x.depois, false);
              decs.push({ projeto_id: projetoId, item_id: a.existente.id, caso_id: null, campo: x.campo, antes: antes as never, depois: (x.depois ?? null) as never, fundamento: `Reimportação de ${arquivo.nome}`, usuario: quemFez, tipo: 'importar' });
            }
            const d = derivadosDoTrabalho(trabalho);
            const r = await tx.sanItem.updateMany({ where: { id: a.existente.id, versao: atual!.versao }, data: { trabalho: trabalho as never, lido: t as never, ...d, versao: { increment: 1 } } });
            if (r.count === 0) throw conflito('O item foi alterado por outra pessoa durante a importação. Tente de novo.');
            await tx.sanDecisao.createMany({ data: decs as never });
            const afetadas = [...new Set(aplicar.flatMap((x) => CAMPO_AFETA[x.campo] ?? ['QUALIDADE']))];
            await tx.sanCelula.updateMany({ where: { item_id: a.existente.id, camada: { in: afetadas }, situacao: { not: 'PENDENTE' } }, data: { revisar: true, revisar_causa: 'Reimportação alterou campos que esta camada usa.' } });
            await tx.sanCelula.updateMany({ where: { item_id: a.existente.id }, data: { grupo: d.grupo ?? '' } });
            incorporados++;
          } else if (escolhido) {
            // Todas as diferenças escolhidas estavam protegidas por decisão: a leitura avança (a decisão manda).
            await tx.sanItem.updateMany({ where: { id: a.existente.id }, data: { lido: t as never } });
          }
          // Item não escolhido: a última leitura NÃO avança, para a diferença continuar aparecendo na próxima reimportação.
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
