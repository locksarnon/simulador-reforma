import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { soDigitos } from '../../classificacao/ncm-classe';
import { indiceAplicado } from '../diretrizes/dados';
import { limitesEfetivos, parametrosDaParticao } from '../diretrizes/parametros';
import { subgrupoDosCampos, type IndiceDiretrizes } from '../diretrizes/resolucao';
import type { RegraLimites, RegraUnidades } from '../diretrizes/tipos';
import type { ParametrosMotor } from '../motor';
import { chaveUnidade, classificarUnidade } from '../motor/unidades';
import { orcamentoDoLote, SanCasosService } from './casos.service';
import { camadasAtivas, fatiar, validarCamada, type Json, type Usuario } from './constantes';
import {
  conferirLinha, contarConferidas, ErroPlanilha, lerDecisao, lerPlanilhaDecisao, montarPlanilha, nomeDaPlanilha, rotuloCamada, sha256Curto, SITUACOES_DA_PLANILHA, sufixoDaPlanilha,
  type CasoAtual, type ItemDaPlanilha, type LinhaConferida, type RegrasDoValor,
} from './planilha-decisao';
import { SanProjetoService } from './projeto.service';

export type ArquivoPlanilha = { buffer?: Buffer; nome: string };
/** Linhas de casos por arquivo: o maior volume de casos abertos de uma camada cabe com folga. */
const MAX_LINHAS = 50_000;
const SITUACAO_DA_ACAO = { aprovar: 'APROVADO', rejeitar: 'REJEITADO', pedir: 'AGUARDANDO_INFORMACAO' } as const;
type Recusada = { linha: number; casoId: string; tipo?: string; codigo?: string; motivo: string };

/**
 * Planilha de decisão por camada: baixar (casos em aberto e aguardando informação, um por linha), prévia da reimportação (só lê) e aplicação.
 * Cada decisão passa pelo mesmo caminho da tela (aprovar, rejeitar, pedir informação: versão do caso, validações, células e impactos) e leva
 * na justificativa ou no motivo a marca "(planilha <arquivo>, <sha256 curto>)"; quem e quando ficam gravados como em toda decisão.
 */
@Injectable()
export class SanPlanilhaDecisaoService {
  constructor(private readonly prisma: PrismaService, private readonly projetos: SanProjetoService, private readonly casos: SanCasosService) {}

  private async camadaDoProjeto(projetoId: string, camada: string) {
    const c = validarCamada(camada);
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { id: true, modulos: true, parametros: true, empresa_id: true, diagnostico_id: true } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    if (!camadasAtivas(p.modulos as Json).includes(c)) throw new BadRequestException('Esta camada não está ligada neste projeto.');
    return { camada: c, projeto: p };
  }

  private async itensPorId(projetoId: string, ids: string[]): Promise<Map<string, ItemDaPlanilha & { campos: Json | null }>> {
    const out = new Map<string, ItemDaPlanilha & { campos: Json | null }>();
    for (const lote of fatiar([...new Set(ids)], 5000)) {
      for (const i of await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId, id: { in: lote } }, select: { id: true, codigo: true, trabalho: true } })) {
        const t = (i.trabalho as Json) ?? {};
        const txt = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
        out.set(i.id, {
          id: i.id, codigo: String(t.codigo ?? i.codigo), descricao: txt(t.descricao), grupo: txt(t.grupo), ncm: txt(t.ncm), unidade: txt(t.unidade),
          saldo: typeof t.saldo === 'number' ? t.saldo : null, campos: (t.campos as Json) ?? null,
        });
      }
    }
    return out;
  }

  /** Excel da camada: os casos em aberto (proposto, em rascunho) e os aguardando informação. */
  async baixar(projetoId: string, camadaBruta: string): Promise<{ buffer: Buffer; nome: string }> {
    const { camada, projeto } = await this.camadaDoProjeto(projetoId, camadaBruta);
    // Baixar é o primeiro passo da decisão: camada da Fase 2 travada recusa com o mesmo 400 da decisão na tela.
    await this.projetos.exigirLiberadaPara(projetoId, camada);
    const casos = await this.prisma.sanCaso.findMany({ where: { projeto_id: projetoId, camada, situacao: { in: SITUACOES_DA_PLANILHA } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    if (casos.length > MAX_LINHAS) throw new BadRequestException(`A camada tem ${casos.length.toLocaleString('pt-BR')} casos em aberto; a planilha aceita até ${MAX_LINHAS.toLocaleString('pt-BR')}.`);
    const itens = await this.itensPorId(projetoId, casos.flatMap((c) => c.itens));
    const empresa = projeto.empresa_id ? await this.prisma.empresa.findUnique({ where: { id: projeto.empresa_id }, select: { razao_social: true } }).catch(() => null) : null;
    const diag = projeto.diagnostico_id ? await this.prisma.projetoDiagnostico.findUnique({ where: { id: projeto.diagnostico_id }, select: { nome: true } }).catch(() => null) : null;
    const projetoNome = [empresa?.razao_social, diag?.nome].filter(Boolean).join(' · ');
    const geradaEm = new Date();
    const wb = await montarPlanilha({
      projetoId, projetoNome, camada, geradaEm, itens,
      casos: casos.map((c) => ({ id: c.id, versao: c.versao, camada: c.camada, situacao: c.situacao, tipo: c.tipo, problema: c.problema, itens: c.itens, atual: c.atual, proposta: c.proposta, fundamento: c.fundamento, justificativa: c.justificativa })),
    });
    return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), nome: nomeDaPlanilha(camada, geradaEm) };
  }

  /** Regras do valor corrigido: tabela de NCM, limites e unidades efetivos do item (Diretrizes aplicadas e parâmetros do projeto). */
  private async regrasDoValor(projetoId: string, parametros: Json | null, itens: Map<string, { grupo: string | null; campos: Json | null }>, precisaNcm: boolean): Promise<RegrasDoValor> {
    let tabela: Map<string, string> | null = null;
    if (precisaNcm) {
      const linhas = await this.prisma.ncm.findMany({ select: { codigo: true, status: true } });
      tabela = linhas.length ? new Map(linhas.map((l) => [soDigitos(l.codigo), String(l.status)])) : null;
    }
    const indice: IndiceDiretrizes | null = await indiceAplicado(this.prisma as never, projetoId);
    const base = ((parametros?.motor as ParametrosMotor | undefined) ?? {}) as ParametrosMotor;
    const regrasDo = (itemId: string) => { const it = itens.get(itemId); return indice ? indice.resolver(it?.grupo, subgrupoDosCampos(it?.campos ?? null)) : {}; };
    return {
      ncm: (n) => (tabela ? { existe: tabela.has(n), vigente: tabela.get(n) === 'Ativo' } : null),
      limite: (itemId, campo) => {
        const rs = regrasDo(itemId);
        if (rs.LIMITES && !rs.LIMITES.legado) return limitesEfetivos((rs.LIMITES.conteudo as RegraLimites).linhas).get(campo)?.limite ?? null;
        const lim = parametrosDaParticao(base, rs).limites?.[campo];
        return typeof lim === 'number' && lim > 0 ? lim : null;
      },
      unidade: (itemId, valor) => {
        const rs = regrasDo(itemId);
        const u = rs.UNIDADES;
        if (u && !u.legado) {
          const c = u.conteudo as RegraUnidades;
          if (c.criterioEstoque === 'DEFINIDA' && c.unidadeDefinida && chaveUnidade(valor) !== chaveUnidade(c.unidadeDefinida)) return `A unidade definida para o grupo do item é ${c.unidadeDefinida} (Diretrizes).`;
        }
        const regras = parametrosDaParticao(base, rs).politicaUnidade?.regras ?? {};
        return classificarUnidade(valor, regras) ? null : `Unidade "${valor}" não reconhecida: use uma unidade conhecida (UN, KG, L, M, CX...) ou cadastre a regra da unidade nas Diretrizes.`;
      },
    };
  }

  /** Lê o arquivo e confere cada linha contra o banco agora. Não grava nada. */
  private async conferir(projetoId: string, camadaBruta: string, arq: ArquivoPlanilha) {
    const { camada, projeto } = await this.camadaDoProjeto(projetoId, camadaBruta);
    if (!arq.buffer?.length) throw new BadRequestException('Envie a planilha de decisão (arquivo .xlsx).');
    if (!arq.nome.toLowerCase().endsWith('.xlsx')) throw new BadRequestException('Envie a planilha de decisão em .xlsx (a baixada do InTAX).');
    let lida;
    try { lida = await lerPlanilhaDecisao(arq.buffer); } catch (e) { if (e instanceof ErroPlanilha) throw new BadRequestException(e.message); throw e; }
    if (lida.projetoId && lida.projetoId !== projetoId) throw new BadRequestException('Esta planilha é de outro projeto de saneamento.');
    if (lida.camada && lida.camada !== camada) throw new BadRequestException(`Esta planilha é da camada ${rotuloCamada(lida.camada)}: reimporte-a nessa camada.`);
    if (lida.linhas.length > MAX_LINHAS) throw new BadRequestException(`A planilha tem linhas demais (máximo ${MAX_LINHAS.toLocaleString('pt-BR')}).`);
    const ids = [...new Set(lida.linhas.map((l) => l.id).filter(Boolean))];
    const casos = new Map<string, CasoAtual & { motivo: string | null }>();
    for (const lote of fatiar(ids, 2000)) {
      for (const c of await this.prisma.sanCaso.findMany({ where: { id: { in: lote } } })) casos.set(c.id, c as never);
    }
    const doProjeto = [...casos.values()].filter((c) => c.projeto_id === projetoId);
    const itens = await this.itensPorId(projetoId, doProjeto.map((c) => c.itens[0]).filter(Boolean));
    const regras = await this.regrasDoValor(projetoId, projeto.parametros as Json, itens, lida.linhas.some((l) => l.valorCorrigido.trim()));
    const vistos = new Set<string>();
    const codigo = (c: CasoAtual) => { const i = itens.get(c.itens[0]); return i ? (c.itens.length > 1 ? `${i.codigo} e mais ${c.itens.length - 1}` : i.codigo) : undefined; };
    const linhas = lida.linhas.map((l) => conferirLinha(l, casos.get(l.id), { projetoId, camada, regras, vistos, codigo }));
    const sha = sha256Curto(arq.buffer);
    // Linha já aplicada por ESTE arquivo (mesmo resumo): não é recusa, é a mesma decisão (a aplicação pode ser repetida sem efeito).
    const ja = new Set<string>();
    const candidatas = linhas.filter((l) => l.recusa && casos.get(l.casoId)?.projeto_id === projetoId);
    const comMarcaNaDecisao = new Set<string>();
    for (const lote of fatiar(candidatas.map((l) => l.casoId), 1000)) {
      for (const d of await this.prisma.sanDecisao.findMany({ where: { caso_id: { in: lote }, fundamento: { contains: sha } }, select: { caso_id: true } })) if (d.caso_id) comMarcaNaDecisao.add(d.caso_id);
    }
    const decisaoDaLinha = new Map(lida.linhas.map((x) => [x.linha, x.decisao] as const));
    for (const l of candidatas) {
      const c = casos.get(l.casoId)!;
      const acao = lerDecisao(decisaoDaLinha.get(l.linha) ?? '');
      if (!acao) continue;
      const marcado = comMarcaNaDecisao.has(c.id) || String(c.motivo ?? '').includes(sha) || String(c.justificativa ?? '').includes(sha);
      if (marcado && c.situacao === SITUACAO_DA_ACAO[acao]) ja.add(`${l.linha}`);
    }
    const finais = linhas.map((l) => (ja.has(`${l.linha}`) ? { ...l, recusa: null, acao: 'nenhuma' as const, jaAplicada: true } : l)) as (LinhaConferida & { jaAplicada?: boolean })[];
    return { camada, linhas: finais, casos, sha };
  }

  private resumo(linhas: (LinhaConferida & { jaAplicada?: boolean })[]) {
    const c = contarConferidas(linhas.filter((l) => !l.jaAplicada));
    const recusadas: Recusada[] = linhas.filter((l) => l.recusa).map((l) => ({ linha: l.linha, casoId: l.casoId, ...(l.tipo ? { tipo: l.tipo } : {}), ...(l.codigo ? { codigo: l.codigo } : {}), motivo: l.recusa! }));
    return { contagem: { ...c, jaAplicadas: linhas.filter((l) => l.jaAplicada).length }, recusadas };
  }

  /** Prévia (só lê): quantas linhas vão aprovar, rejeitar, pedir informação, quantas ficam sem decisão e as recusadas com o motivo. */
  async previa(projetoId: string, camada: string, arq: ArquivoPlanilha) {
    const { linhas, sha, camada: c } = await this.conferir(projetoId, camada, arq);
    return { arquivo: { nome: arq.nome, sha }, camada: c, linhas: linhas.length, ...this.resumo(linhas) };
  }

  /**
   * Aplica as linhas válidas, uma decisão por caso, cada uma na sua transação (falha de uma vira recusa e não derruba as outras). A conferência
   * é refeita agora (versões do banco) e cada decisão confere de novo a versão do caso. Orçamento de tempo como o do lote: o que não coube
   * volta em `restantes`; chamar de novo com o mesmo arquivo continua (as linhas já aplicadas por ele contam como "já aplicadas").
   */
  async aplicar(projetoId: string, camada: string, arq: ArquivoPlanilha, usuario?: Usuario, opcoes: { confirmar?: unknown; orcamentoMs?: unknown } = {}) {
    if (!(opcoes.confirmar === true || opcoes.confirmar === 'true' || opcoes.confirmar === '1')) throw new BadRequestException('Veja a prévia e confirme ("confirmar") antes de aplicar a planilha.');
    const orcamento = orcamentoDoLote(opcoes.orcamentoMs);
    const inicio = Date.now();
    // A trava por fase vale para a planilha inteira (camada da Fase 2 travada: nada é aplicado).
    await this.projetos.exigirLiberadaPara(projetoId, validarCamada(camada));
    const { linhas, casos, sha } = await this.conferir(projetoId, camada, arq);
    const sufixo = sufixoDaPlanilha(arq.nome, sha);
    const dataBase = await this.projetos.dataBase(projetoId);
    const aplicadas = { aprovar: 0, rejeitar: 0, pedirInformacao: 0 };
    const falhas: Recusada[] = [];
    let restantes = 0; let feitas = 0;
    const comSufixo = (t: string) => `${t.slice(0, 3700)} ${sufixo}`;
    for (const l of linhas) {
      if (l.recusa || l.acao === 'nenhuma') continue;
      if (feitas > 0 && Date.now() - inicio > orcamento) { restantes++; continue; }
      const c = casos.get(l.casoId)!;
      try {
        if (l.acao === 'rejeitar') { await this.casos.rejeitar(c.id, { versao: c.versao, justificativa: comSufixo(l.motivo) }, usuario, { dataBase, liberada: true }); aplicadas.rejeitar++; }
        else if (l.acao === 'pedir') { await this.casos.pedirInformacao(c.id, { versao: c.versao, motivo: comSufixo(l.motivo) }, { dataBase, liberada: true }); aplicadas.pedirInformacao++; }
        else {
          let versao = c.versao;
          if (c.situacao === 'AGUARDANDO_INFORMACAO') { await this.casos.reabrir(c.id, { versao }, usuario); versao++; }
          const proposta = l.campo && l.valor != null ? { ...((c.proposta as Json) ?? {}), [l.campo]: l.valor } : undefined;
          const texto = l.motivo ? { justificativa: comSufixo(l.motivo) } : { fundamento: comSufixo(c.fundamento || c.justificativa || 'Aprovado pela planilha de decisão') };
          try {
            await this.casos.aprovar(c.id, { versao, ...(proposta ? { proposta } : {}), ...texto }, usuario, { dataBase, liberada: true });
          } catch (e) {
            if (versao !== c.versao) throw new Error(`O caso voltou a proposto, mas não foi aprovado: ${mensagem(e)}`);
            throw e;
          }
          aplicadas.aprovar++;
        }
        feitas++;
      } catch (e) {
        falhas.push({ linha: l.linha, casoId: l.casoId, ...(l.tipo ? { tipo: l.tipo } : {}), ...(l.codigo ? { codigo: l.codigo } : {}), motivo: mensagem(e) });
      }
    }
    const r = this.resumo(linhas);
    return { arquivo: { nome: arq.nome, sha }, aplicadas, jaAplicadas: r.contagem.jaAplicadas, recusadas: [...r.recusadas, ...falhas], restantes };
  }
}

const mensagem = (e: unknown) => {
  const r = (e as { response?: { message?: unknown } }).response?.message;
  return typeof r === 'string' ? r : Array.isArray(r) ? r.join(' ') : (e as Error).message;
};
