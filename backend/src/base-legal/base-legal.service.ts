import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chaveDe, normasCitadas, referenciaDe, urlOficialValida } from './base-legal.deteccao';
import { PrismaService } from '../prisma/prisma.service';
import { AVISO_ASSISTENTE, Candidato, consultasDaPergunta, respostaDeApoio, lerJson, promptResposta, promptTermos, validarResposta } from './base-legal.assistente';
import { avisosDePendencias } from './avisos-legais';
import { decodificar, DispositivoExtraido, extrairDispositivos, htmlParaTexto, LEITOR_VERSAO, semRiscado, sha256 } from './base-legal.parser';
import { atoDaMudanca, atosModificadores, novidadesDaAtualizacao, NovidadeNova, situacaoDaNorma } from './atualizacoes';
import { FONTES_NORMAS, type GrupoNorma } from './fontes';
import { pdfParaTexto } from './pdf-norma';
import { frasePorImpacto, MudancaDispositivo } from './revisao-legal.regras';
import { ResumoRevisao, RevisaoLegalService } from './revisao-legal.service';
import { plural } from '../common/plural';
import { MODELO_CLAUDE_PADRAO, perguntarAoClaude, perguntarViaPonte } from './claude';

/** Maior arquivo que aceitamos baixar de uma fonte oficial (o Regulamento do IBS em PDF tem ~3 MB). */
const MAX_BYTES_FONTE = 40 * 1024 * 1024;
/** Uma atualização automática que perca mais que isto dos dispositivos já gravados é tratada como página oficial que mudou de forma. */
const PERDA_MAXIMA_AUTOMATICA = 0.3;
/** Daqui para cima, a regra acima vale; norma pequena pode mesmo encolher. */
const MINIMO_PARA_GUARDA = 20;

export type OpcoesImportacao = {
  /** Grava mesmo que o texto seja idêntico ao já guardado (reprocessa com o leitor atual). */
  forcar?: boolean;
  /** Chamada da rotina semanal: segura a gravação se a página oficial perdeu boa parte dos dispositivos. */
  automatico?: boolean;
  /** Número da rodada da revisão semanal, para ligar as novidades a ela. */
  execucaoId?: string;
  /** Não manda o e-mail de revisão desta norma (a rotina semanal manda um só, com tudo). */
  semAviso?: boolean;
};

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const AVISOS_TOPO = /^(?:[|\s]+|\([^)]*\)|(?:Mensagem de veto|Produ[çc][ãa]o de efeitos|Vig[êe]ncia|Regulamento|Texto compilado|Promulga[çc][ãa]o|Vide))+/i;

export type ResultadoImportacao = {
  chave: string;
  alterada: boolean;
  dispositivos: number;
  novos: number;
  alterados: number;
  removidos: number;
  /** Dispositivos que passaram a constar como revogados nesta atualização (por nota de revogação ou por terem saído do texto). */
  revogados: number;
  hash: string;
  motivo?: string;
  /** O que a atualização devolveu para revisão (cartões, notas do cálculo e marcos da agenda que citam o texto alterado). */
  revisao?: ResumoRevisao;
  situacao?: string;
  formato?: string;
  /** Quantas novidades entraram na base de conhecimento. */
  novidades?: number;
  /** O texto foi relido com um leitor mais novo: a diferença vem do leitor, não de mudança na lei. */
  reprocessada?: boolean;
};

/** Cabeçalho da norma → data e ementa (a data do texto oficial prevalece sobre o cadastro). */
function lerCabecalho(texto: string): { data: Date | null; ementa: string | null } {
  const linhas = texto.split('\n', 40);
  let data: Date | null = null;
  let i = linhas.findIndex((l) => /^(EMENDA CONSTITUCIONAL|LEI COMPLEMENTAR|DECRETO|LEI)\b.*\bDE\s+\d{4}/i.test(l));
  if (i >= 0) {
    const m = /DE\s+(\d{1,2})\S*\s+DE\s+([A-ZÇÃa-zçã]+)\s+DE\s+(\d{4})/i.exec(linhas[i]);
    const mes = m ? MESES[m[2].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()] : undefined;
    if (m && mes) data = new Date(Date.UTC(Number(m[3]), mes - 1, Number(m[1])));
  }
  let ementa: string | null = null;
  if (i >= 0) {
    for (i += 1; i < linhas.length; i++) {
      // Tira os avisos do topo da página ("Mensagem de veto | ", "Produção de efeitos (Vide…)") até sobrar a ementa.
      const l = linhas[i].trim().replace(AVISOS_TOPO, '').trim();
      if (/^(O PRESIDENTE|As Mesas|O CONGRESSO)/i.test(l)) break;
      if (/^(\(Republica|Denominado)/i.test(l)) continue;
      if (l.length >= 40) { ementa = l.slice(0, 700); break; }
    }
  }
  return { data, ementa };
}

@Injectable()
export class BaseLegalService {
  private readonly log = new Logger(BaseLegalService.name);

  private readonly usoPorUsuario = new Map<string, number[]>();

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly revisao: RevisaoLegalService) {}

  /** Garante o cadastro das normas do manifesto (idempotente). */
  async garantirNormas() {
    for (const f of FONTES_NORMAS) {
      const comum = {
        tipo: f.tipo, numero: f.numero, titulo: f.titulo, orgao: f.orgao, url_oficial: f.url_oficial, prioridade: f.prioridade, observacao: f.observacao ?? null,
        grupo: f.grupo ?? null, formato: f.formato ?? 'html', monitorar: f.formato !== 'externo',
      };
      await this.prisma.normaLegal.upsert({
        where: { chave: f.chave },
        create: { chave: f.chave, data_publicacao: f.data_publicacao ? new Date(f.data_publicacao) : null, origem: 'manifesto', ...comum },
        update: comum,
      });
    }
  }

  /**
   * Baixa o texto oficial (página HTML ou PDF), divide por dispositivo e grava versões só do que mudou. Guarda também o que o texto
   * oficial diz sobre cada dispositivo: notas de alteração, ato que revogou, redação anterior (o que estava riscado) e temas.
   */
  async importar(chave: string, opcoes: OpcoesImportacao = {}): Promise<ResultadoImportacao> {
    await this.garantirNormas();
    const norma = await this.prisma.normaLegal.findUnique({ where: { chave } });
    if (!norma) throw new NotFoundException(`Norma "${chave}" não cadastrada`);
    if (norma.formato === 'externo') throw new BadRequestException('Esta norma só tem a referência: a fonte oficial não publica o texto em uma página que o sistema consiga ler.');

    const { texto, formato } = await this.baixarDocumento(norma.url_oficial);
    const hash = sha256(texto);

    // Norma gravada por um leitor anterior é relida mesmo com o texto idêntico: os campos derivados (notas, redação anterior, revogação) não existiam.
    const leitorAntigo = (norma.leitor_versao ?? LEITOR_VERSAO) < LEITOR_VERSAO;
    if (!opcoes.forcar && !leitorAntigo && norma.hash_atual === hash) {
      await this.prisma.normaLegal.update({ where: { id: norma.id }, data: { capturada_em: new Date() } });
      return { chave, alterada: false, dispositivos: norma.total_dispositivos, novos: 0, alterados: 0, removidos: 0, revogados: 0, hash, motivo: 'Texto oficial idêntico ao já carregado' };
    }

    const extraidos = extrairDispositivos(texto);
    if (extraidos.length === 0) throw new BadRequestException('Não foi possível identificar os dispositivos — nada foi gravado (precisa de revisão)');

    const existentes = await this.prisma.dispositivoLegal.findMany({
      where: { norma_id: norma.id },
      select: { id: true, caminho: true, rotulo: true, hash: true, texto: true, revogado: true, parcialmente_revogado: true, revogado_por: true, alteracoes: true, redacoes_anteriores: true, temas: true, ordem: true, secao: true },
    });
    if (existentes.length >= 3 && extraidos.length < 3) throw new BadRequestException('Não foi possível identificar os dispositivos — nada foi gravado (precisa de revisão)');

    // Atualização automática não grava uma página que perdeu boa parte dos dispositivos: é sinal de que o site oficial mudou de forma.
    if (opcoes.automatico && existentes.length >= MINIMO_PARA_GUARDA && extraidos.length < existentes.length * (1 - PERDA_MAXIMA_AUTOMATICA)) {
      const motivo = `A página oficial trouxe ${extraidos.length} dispositivos e a base tem ${existentes.length}. Nada foi gravado: confira a página e, se estiver certo, atualize à mão.`;
      await this.registrarNovidades([{ tipo: 'estrutura_suspeita', origem: 'texto_oficial', norma_chave: chave, norma_numero: norma.numero, titulo: `${norma.numero}: atualização segurada (página oficial mudou de forma)`, resumo: motivo, url: norma.url_oficial, oficial: true, confirmada: true, execucao_id: opcoes.execucaoId ?? null }]);
      await this.criarAlertaSeNovo({ tipo: 'texto_alterado', chave, referencia: chave, titulo: `${norma.numero}: atualização segurada`, detalhe: motivo, url: norma.url_oficial, origem: 'agendada' }, true);
      return { chave, alterada: false, dispositivos: existentes.length, novos: 0, alterados: 0, removidos: 0, revogados: 0, hash, motivo };
    }

    const porCaminho = new Map(existentes.map((e) => [e.caminho, e]));
    const vistos = new Set(extraidos.map((d) => d.caminho));
    const removidos = existentes.filter((e) => !vistos.has(e.caminho));
    const primeiraCarga = existentes.length === 0;
    // A diferença entre o que estava gravado e o texto de agora vem do leitor (texto riscado separado do vigente), não da lei.
    const reprocessamento = leitorAntigo && !primeiraCarga;
    const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

    // 1) O que mudou (texto alterado, revogado ou fora do texto oficial), sem gravar nada ainda.
    const mudancas: MudancaDispositivo[] = [];
    const alteradosLista: DispositivoExtraido[] = [];
    const revogadosAgora: { rotulo: string; caminho: string; ato: string | null }[] = [];
    for (const d of extraidos) {
      const ex = porCaminho.get(d.caminho);
      if (!ex) continue;
      if (ex.hash !== sha256(d.texto)) {
        const passouARevogado = d.revogado && !ex.revogado;
        mudancas.push({ caminho: d.caminho, rotulo: d.rotulo, mudanca: passouARevogado ? 'revogado' : 'alterado', texto: d.texto });
        if (passouARevogado) revogadosAgora.push({ rotulo: d.rotulo, caminho: d.caminho, ato: d.revogado_por });
        else alteradosLista.push(d);
      } else if (d.revogado && !ex.revogado) {
        // O texto é o mesmo, mas o leitor agora reconhece que o dispositivo está revogado (antes ele constava como em vigor).
        mudancas.push({ caminho: d.caminho, rotulo: d.rotulo, mudanca: 'revogado' });
        revogadosAgora.push({ rotulo: d.rotulo, caminho: d.caminho, ato: d.revogado_por });
      }
    }
    for (const r of removidos) {
      if (r.revogado) continue;
      mudancas.push({ caminho: r.caminho, rotulo: r.rotulo, mudanca: 'revogado' });
      revogadosAgora.push({ rotulo: r.rotulo, caminho: r.caminho, ato: null });
    }

    // 2) Cartões, notas do cálculo e marcos que citam o que mudou entram na fila de revisão ANTES de o texto novo ser gravado: se a
    //    fila não puder ser gravada, nada do texto muda e a atualização pode ser repetida (depois de gravado, a mudança não seria
    //    detectada de novo e o item ficaria publicado sobre uma lei alterada).
    const revisao = await this.revisao.registrarMudancas({ chave, numero: norma.numero }, mudancas, { avisar: !opcoes.semAviso });

    // 3) Grava o texto novo, guardando a versão anterior de cada dispositivo alterado.
    const agora = new Date();
    const mudouEm = reprocessamento ? undefined : agora;
    const derivados = (d: DispositivoExtraido) => ({ parcialmente_revogado: d.parcialmente_revogado, revogado_por: d.revogado_por, alteracoes: d.alteracoes as object[], redacoes_anteriores: d.redacoes_anteriores, temas: d.temas });
    const novos: DispositivoExtraido[] = [];
    let alterados = 0;
    for (const d of extraidos) {
      const h = sha256(d.texto);
      const ex = porCaminho.get(d.caminho);
      if (!ex) { novos.push(d); continue; }
      if (ex.hash !== h) {
        alterados += 1;
        await this.prisma.$transaction([
          this.prisma.dispositivoLegalVersao.create({ data: { dispositivo_id: ex.id, texto: ex.texto, hash: ex.hash } }),
          this.prisma.dispositivoLegal.update({ where: { id: ex.id }, data: { texto: d.texto, hash: h, rotulo: d.rotulo, ordem: d.ordem, secao: d.secao, revogado: d.revogado, ...derivados(d), ...(mudouEm ? { alterado_em: mudouEm } : {}) } }),
        ]);
      } else {
        // Mesmo texto: só atualiza o que o leitor deriva dele (notas, revogação, redações anteriores, temas, posição). Dispositivo que tinha
        // saído do texto e voltou igual deixa de constar como revogado.
        const dados: Record<string, unknown> = { ordem: d.ordem, secao: d.secao };
        if (ex.revogado !== d.revogado) dados.revogado = d.revogado;
        if ((ex.parcialmente_revogado ?? false) !== d.parcialmente_revogado) dados.parcialmente_revogado = d.parcialmente_revogado;
        if ((ex.revogado_por ?? null) !== d.revogado_por) dados.revogado_por = d.revogado_por;
        if (!igual(ex.alteracoes ?? [], d.alteracoes)) dados.alteracoes = d.alteracoes;
        if (!igual(ex.redacoes_anteriores ?? [], d.redacoes_anteriores)) dados.redacoes_anteriores = d.redacoes_anteriores;
        if (!igual(ex.temas ?? [], d.temas)) dados.temas = d.temas;
        if (ex.ordem !== d.ordem || ex.secao !== d.secao || Object.keys(dados).length > 2) await this.prisma.dispositivoLegal.update({ where: { id: ex.id }, data: dados });
      }
    }
    for (let i = 0; i < novos.length; i += 100) {
      await this.prisma.dispositivoLegal.createMany({
        data: novos.slice(i, i + 100).map((d) => ({ norma_id: norma.id, tipo: d.tipo, rotulo: d.rotulo, caminho: d.caminho, ordem: d.ordem, secao: d.secao, texto: d.texto, hash: sha256(d.texto), revogado: d.revogado, ...derivados(d), alterado_em: primeiraCarga || reprocessamento ? null : agora })),
      });
    }
    if (removidos.length) await this.prisma.dispositivoLegal.updateMany({ where: { id: { in: removidos.map((r) => r.id) } }, data: { revogado: true, ...(mudouEm ? { alterado_em: mudouEm } : {}) } });
    await this.gravarRemissoes(norma.id, extraidos);

    const cab = lerCabecalho(semRiscado(texto));
    const sit = situacaoDaNorma(extraidos, texto);
    const houveMudanca = !primeiraCarga && !reprocessamento && (alterados > 0 || novos.length > 0 || removidos.length > 0 || revogadosAgora.length > 0);
    await this.prisma.normaLegal.update({
      where: { id: norma.id },
      data: {
        hash_atual: hash, capturada_em: agora, total_dispositivos: extraidos.length, formato, leitor_versao: LEITOR_VERSAO,
        ...(cab.data ? { data_publicacao: cab.data } : {}), ementa: cab.ementa,
        situacao: sit.situacao, revogada_por: sit.revogada_por, revogada_em: sit.situacao === 'revogada' ? (norma.revogada_em ?? agora) : null,
        atos_modificadores: atosModificadores(extraidos) as object[],
        ...(houveMudanca ? { atualizada_em: agora } : {}),
      },
    });

    // 4) O que a equipe lê: o que mudou, quem mudou (o ato) e se a norma inteira saiu.
    const novidades = novidadesDaAtualizacao({
      norma: { chave, numero: norma.numero, url_oficial: norma.url_oficial },
      primeiraCarga, totalDispositivos: extraidos.length,
      alterados: alteradosLista.map((d) => ({ rotulo: d.rotulo, caminho: d.caminho, ato: atoDaMudanca(d, ['redacao']) })),
      revogados: revogadosAgora,
      incluidos: novos.filter(() => !primeiraCarga).map((d) => ({ rotulo: d.rotulo, caminho: d.caminho, ato: atoDaMudanca(d, ['inclusao', 'redacao']) })),
      situacaoAnterior: norma.situacao, situacao: sit, execucaoId: opcoes.execucaoId, reprocessamento,
    });
    await this.registrarNovidades(novidades);

    this.log.log(`${chave}: ${extraidos.length} dispositivos (${novos.length} novos, ${alterados} alterados, ${revogadosAgora.length} revogados, ${removidos.length} removidos)`);
    return { chave, alterada: true, dispositivos: extraidos.length, novos: novos.length, alterados, removidos: removidos.length, revogados: revogadosAgora.length, hash, revisao, situacao: sit.situacao, novidades: novidades.length, formato, ...(reprocessamento ? { reprocessada: true } : {}) };
  }

  /** Grava as remissões ("(Art. 38 da LC 214/2025)") da norma: mostram, em cada artigo, o que o regulamenta ou reproduz. */
  private async gravarRemissoes(normaId: string, extraidos: DispositivoExtraido[]) {
    const linhas = extraidos.flatMap((d) => d.remissoes.flatMap((r) => r.caminhos.map((c) => ({ norma_id: normaId, caminho: d.caminho, rotulo: d.rotulo, destino_ref: r.referencia, destino_caminho: c, trecho: r.trecho }))));
    await this.prisma.referenciaLegal.deleteMany({ where: { norma_id: normaId } });
    for (let i = 0; i < linhas.length; i += 500) await this.prisma.referenciaLegal.createMany({ data: linhas.slice(i, i + 500) });
  }

  /** Registra novidades na base de conhecimento. Falha aqui nunca desfaz a atualização do texto. */
  async registrarNovidades(lista: NovidadeNova[]) {
    if (!lista.length) return 0;
    try {
      await this.prisma.novidadeLegal.createMany({
        data: lista.map((n) => ({
          tipo: n.tipo, origem: n.origem, norma_chave: n.norma_chave ?? null, norma_numero: n.norma_numero ?? null, caminho: n.caminho ?? null, rotulo: n.rotulo ?? null,
          titulo: n.titulo.slice(0, 300), resumo: n.resumo?.slice(0, 1500) ?? null, detalhes: (n.detalhes ?? []) as object[], ato: n.ato ?? null, ato_ref: n.ato_ref ?? null,
          url: n.url ?? null, oficial: n.oficial ?? true, confirmada: n.confirmada ?? false, execucao_id: n.execucao_id ?? null, data_ato: n.data_ato ?? null,
        })),
      });
      return lista.length;
    } catch (e) {
      this.log.warn(`Novidades não gravadas: ${(e as Error).message}`);
      return 0;
    }
  }

  /**
   * Baixa e normaliza o texto de uma fonte oficial: página HTML ou PDF (regulamentos e resoluções do CGIBS), só https em sites oficiais.
   * Em HTML, o que o site mostra riscado vem marcado à parte (ver htmlParaTexto); em PDF, o texto sai em linhas.
   */
  async baixarDocumento(url: string): Promise<{ texto: string; formato: 'html' | 'pdf' }> {
    const { corpo, tipo } = await this.baixarBruto(url);
    if (/pdf/i.test(tipo) || corpo.subarray(0, 5).toString('latin1') === '%PDF-') {
      return { texto: await pdfParaTexto(corpo), formato: 'pdf' };
    }
    return { texto: htmlParaTexto(decodificar(corpo)), formato: 'html' };
  }

  /**
   * Baixa o arquivo de uma fonte oficial sem interpretá-lo (página, PDF ou JSON). Só https em sites oficiais, sem redirecionar
   * para fora deles e com limite de tamanho: o servidor não serve para acessar endereços arbitrários.
   */
  async baixarBruto(url: string, opcoes: { maxBytes?: number; timeoutMs?: number; aceitar?: string } = {}): Promise<{ corpo: Buffer; tipo: string; url: string }> {
    if (!urlOficialValida(url)) throw new BadRequestException('URL fora dos sites oficiais aceitos (gov.br, jus.br e leg.br, por https)');
    const limite = opcoes.maxBytes ?? MAX_BYTES_FONTE;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (InTAX base legal)', ...(opcoes.aceitar ? { Accept: opcoes.aceitar } : {}) },
      signal: AbortSignal.timeout(opcoes.timeoutMs ?? 180_000),
    });
    if (!resp.ok) throw new BadRequestException(`Fonte oficial respondeu ${resp.status}`);
    if (resp.url && !urlOficialValida(resp.url)) throw new BadRequestException('A fonte oficial redirecionou para fora dos sites oficiais.');
    if (Number(resp.headers.get('content-length') || 0) > limite) throw new BadRequestException('A fonte oficial é grande demais para carregar.');
    const corpo = Buffer.from(await resp.arrayBuffer());
    if (corpo.length > limite) throw new BadRequestException('A fonte oficial é grande demais para carregar.');
    return { corpo, tipo: resp.headers.get('content-type') || '', url: resp.url || url };
  }

  /** O endereço oficial abre? Confere só a resposta, sem baixar o corpo (serve para descartar links que a pesquisa na web inventou). */
  async urlResponde(url: string): Promise<boolean> {
    if (!urlOficialValida(url)) return false;
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (InTAX base legal)' }, signal: AbortSignal.timeout(25_000) });
      void resp.body?.cancel().catch(() => undefined);
      return resp.ok && (!resp.url || urlOficialValida(resp.url));
    } catch {
      return false;
    }
  }

  /**
   * Cadastra um ato novo (lei, decreto, MP...) e carrega o texto oficial. Nada fica cadastrado se o texto não abrir ou não trouxer
   * dispositivos. Não duplica norma que a base já tem, seja qual for a chave dela.
   */
  async registrarNorma(def: { referencia: string; numero: string; tipo: string; titulo: string; orgao: string; url: string; grupo: GrupoNorma; data?: Date | null; observacao?: string }, opcoes: OpcoesImportacao = {}): Promise<{ chave: string; jaExistia: boolean; resultado: ResultadoImportacao | null }> {
    const existentes = await this.prisma.normaLegal.findMany({ select: { chave: true, numero: true } });
    const igual = existentes.find((n) => referenciaDe(n.numero) === def.referencia);
    if (igual) return { chave: igual.chave, jaExistia: true, resultado: null };
    if (!urlOficialValida(def.url)) throw new BadRequestException('URL fora dos sites oficiais aceitos');
    const chave = chaveDe(def.referencia.replace(/^lc /, 'lcp '));
    await this.prisma.normaLegal.create({
      data: {
        chave, tipo: def.tipo, numero: def.numero, titulo: def.titulo.slice(0, 400), orgao: def.orgao, url_oficial: def.url, prioridade: 1, grupo: def.grupo,
        data_publicacao: def.data ?? null, observacao: def.observacao ?? null, origem: 'revisao_semanal', monitorar: true,
      },
    });
    try {
      return { chave, jaExistia: false, resultado: await this.importar(chave, opcoes) };
    } catch (e) {
      // Sem texto não há norma: tira o cadastro para não deixar uma linha vazia na lista.
      await this.prisma.normaLegal.deleteMany({ where: { chave, total_dispositivos: 0 } }).catch(() => undefined);
      throw e;
    }
  }

  /** Só o texto (para quem não precisa do formato). */
  private async baixarTexto(url: string): Promise<string> {
    return (await this.baixarDocumento(url)).texto;
  }

  async importarTodas(): Promise<(ResultadoImportacao | { chave: string; erro: string })[]> {
    await this.garantirNormas();
    const out: (ResultadoImportacao | { chave: string; erro: string })[] = [];
    const normas = await this.prisma.normaLegal.findMany({ where: { formato: { not: 'externo' } }, select: { chave: true }, orderBy: { createdAt: 'asc' } });
    for (const { chave } of normas) {
      try { out.push(await this.importar(chave)); } catch (e) { out.push({ chave, erro: (e as Error).message }); }
    }
    return out;
  }

  // ─────────────── Verificação de atualizações e alertas (nada entra sem aprovação) ───────────────

  async criarAlertaSeNovo(a: { tipo: string; chave?: string; referencia: string; titulo: string; detalhe?: string; url?: string; origem: string }, atualizarPendente = false) {
    const existente = await this.prisma.alertaBaseLegal.findFirst({
      where: { tipo: a.tipo, referencia: a.referencia, ...(a.tipo === 'texto_alterado' ? { status: 'pendente' } : {}) },
    });
    if (existente) {
      if (atualizarPendente && existente.status === 'pendente') await this.prisma.alertaBaseLegal.update({ where: { id: existente.id }, data: { detalhe: a.detalhe ?? null, titulo: a.titulo } });
      return null;
    }
    return this.prisma.alertaBaseLegal.create({ data: { tipo: a.tipo, chave: a.chave ?? null, referencia: a.referencia, titulo: a.titulo, detalhe: a.detalhe ?? null, url: a.url ?? null, origem: a.origem } });
  }

  /** Compara o texto oficial de hoje com o carregado e abre alerta quando muda (não altera a base). */
  async verificarAtualizacoes(origem = 'verificacao'): Promise<{ verificadas: number; alertas: number; erros: string[] }> {
    const normas = await this.prisma.normaLegal.findMany({ where: { total_dispositivos: { gt: 0 }, formato: { not: 'externo' } } });
    let alertas = 0;
    const erros: string[] = [];
    for (const n of normas) {
      try {
        const texto = await this.baixarTexto(n.url_oficial);
        if (sha256(texto) === n.hash_atual) {
          await this.prisma.normaLegal.update({ where: { id: n.id }, data: { capturada_em: new Date() } });
          continue;
        }
        const extraidos = extrairDispositivos(texto);
        const atuais = new Map((await this.prisma.dispositivoLegal.findMany({ where: { norma_id: n.id }, select: { caminho: true, hash: true, rotulo: true, revogado: true } })).map((d) => [d.caminho, d]));
        const alterados = extraidos.filter((d) => atuais.has(d.caminho) && atuais.get(d.caminho)!.hash !== sha256(d.texto));
        const novos = extraidos.filter((d) => !atuais.has(d.caminho));
        const vistos = new Set(extraidos.map((d) => d.caminho));
        const removidos = [...atuais.keys()].filter((c) => !vistos.has(c));
        const lista = (xs: { rotulo: string }[]) => xs.slice(0, 8).map((x) => x.rotulo).join(', ') + (xs.length > 8 ? '…' : '');
        const citados: MudancaDispositivo[] = [
          ...alterados.map((d) => ({ caminho: d.caminho, rotulo: d.rotulo, mudanca: 'alterado' as const })),
          ...removidos.filter((c) => !atuais.get(c)!.revogado).map((c) => ({ caminho: c, rotulo: atuais.get(c)!.rotulo, mudanca: 'revogado' as const })),
        ];
        const impacto = await this.revisao.impacto({ chave: n.chave, numero: n.numero }, citados).then(frasePorImpacto).catch(() => '');
        const detalhe = [
          alterados.length ? `${plural(alterados.length, 'dispositivo alterado', 'dispositivos alterados')}: ${lista(alterados)}` : null,
          novos.length ? `${plural(novos.length, 'novo', 'novos')}: ${lista(novos)}` : null,
          removidos.length ? plural(removidos.length, 'removido', 'removidos') : null,
        ].filter(Boolean).join(' · ') || 'O texto oficial mudou (sem alteração de artigo identificada — pode ser só formatação).';
        const detalheComImpacto = impacto ? `${detalhe} · ${impacto}` : detalhe;
        const criado = await this.criarAlertaSeNovo({ tipo: 'texto_alterado', chave: n.chave, referencia: n.chave, titulo: `${n.numero}: texto oficial atualizado`, detalhe: detalheComImpacto, url: n.url_oficial, origem }, true);
        if (criado) alertas += 1;
      } catch (e) {
        erros.push(`${n.chave}: ${(e as Error).message}`);
      }
    }
    return { verificadas: normas.length, alertas, erros };
  }

  /**
   * Depois de gerar o Radar: procura normas citadas que ainda não estão na base. O texto das já carregadas é conferido pela revisão
   * semanal (RevisaoSemanalService), que roda antes do Radar; aqui não se baixa tudo de novo.
   */
  async aposRadar(semana: string): Promise<{ novasNormas: number; atualizacoes: number }> {
    const itens = await this.prisma.radarReformaItem.findMany({ where: { semana_referencia: semana } });
    const normas = await this.prisma.normaLegal.findMany({ select: { numero: true } });
    const conhecidas = new Set(normas.map((n) => referenciaDe(n.numero)));
    let novasNormas = 0;
    for (const it of itens) {
      const texto = [it.resumo, it.fonte_nome, it.status_normativo, it.acao_recomendada].filter(Boolean).join(' ');
      for (const c of normasCitadas(texto)) {
        if (conhecidas.has(c.referencia)) continue;
        const criado = await this.criarAlertaSeNovo({
          tipo: 'nova_norma', referencia: c.referencia, titulo: `${c.rotulo} citada no Radar e ainda não está na Base legal`,
          detalhe: it.resumo.slice(0, 400), url: it.fonte_url ?? undefined, origem: 'radar',
        });
        if (criado) novasNormas += 1;
      }
    }
    return { novasNormas, atualizacoes: 0 };
  }

  listarAlertas(status = 'pendente') {
    return this.prisma.alertaBaseLegal.findMany({ where: status === 'todos' ? {} : { status }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /** Aprovar: atualiza o texto (texto_alterado) ou cadastra a nova norma pela URL oficial e carrega. */
  async resolverAlerta(id: string, acao: 'aprovar' | 'descartar', por: string, url?: string) {
    const a = await this.prisma.alertaBaseLegal.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Alerta não encontrado');
    if (a.status !== 'pendente') throw new BadRequestException('Este alerta já foi resolvido');
    let resultado: ResultadoImportacao | null = null;

    if (acao === 'aprovar') {
      if (a.tipo === 'texto_alterado' && a.chave) {
        resultado = await this.importar(a.chave);
      } else if (a.tipo === 'nova_norma') {
        const alvo = (url || a.url || '').trim();
        if (!urlOficialValida(alvo)) throw new BadRequestException('Informe a URL oficial (https) da página com o texto da norma — planalto.gov.br ou cgibs.gov.br');
        const chave = chaveDe(a.referencia);
        const tipo = /^lc\b/.test(a.referencia) ? 'Lei Complementar' : /^ec\b/.test(a.referencia) ? 'Emenda Constitucional' : /^decreto\b/.test(a.referencia) ? 'Decreto' : 'Norma';
        await this.prisma.normaLegal.upsert({
          where: { chave },
          create: { chave, tipo, numero: a.titulo.split(' citada')[0], titulo: a.titulo.split(' citada')[0], url_oficial: alvo, prioridade: 1, observacao: 'Incluída a partir de alerta do Radar.' },
          update: { url_oficial: alvo },
        });
        resultado = await this.importar(chave);
      }
    }
    await this.prisma.alertaBaseLegal.update({ where: { id }, data: { status: acao === 'aprovar' ? 'aprovado' : 'descartado', resolvido_por: por, resolvido_em: new Date() } });
    return { ok: true, resultado };
  }

  listar() {
    return this.prisma.normaLegal.findMany({ orderBy: [{ prioridade: 'asc' }, { data_publicacao: 'asc' }] });
  }

  /** Norma + índice (sem o texto) para navegação. */
  async estrutura(chave: string) {
    const norma = await this.prisma.normaLegal.findUnique({ where: { chave } });
    if (!norma) throw new NotFoundException('Norma não encontrada');
    const itens = await this.prisma.dispositivoLegal.findMany({
      where: { norma_id: norma.id }, orderBy: { ordem: 'asc' },
      select: { rotulo: true, caminho: true, tipo: true, secao: true, revogado: true, parcialmente_revogado: true, alterado_em: true },
    });
    return { norma, itens };
  }

  async dispositivo(chave: string, caminho: string) {
    const norma = await this.prisma.normaLegal.findUnique({ where: { chave } });
    if (!norma) throw new NotFoundException('Norma não encontrada');
    const d = await this.prisma.dispositivoLegal.findUnique({
      where: { norma_id_caminho: { norma_id: norma.id, caminho } },
      include: { versoes: { orderBy: { capturada_em: 'desc' }, select: { id: true, capturada_em: true, texto: true } } },
    });
    if (!d) throw new NotFoundException('Dispositivo não encontrado');
    const [anterior, proximo, citadoPor, cita, pendencias] = await Promise.all([
      this.prisma.dispositivoLegal.findFirst({ where: { norma_id: norma.id, ordem: { lt: d.ordem } }, orderBy: { ordem: 'desc' }, select: { rotulo: true, caminho: true } }),
      this.prisma.dispositivoLegal.findFirst({ where: { norma_id: norma.id, ordem: { gt: d.ordem } }, orderBy: { ordem: 'asc' }, select: { rotulo: true, caminho: true } }),
      // Quem regulamenta ou reproduz este dispositivo ("(Art. 38 da LC 214/2025)" nos textos de outras normas).
      this.prisma.referenciaLegal.findMany({
        where: { destino_ref: referenciaDe(norma.numero), destino_caminho: caminho }, orderBy: { createdAt: 'asc' }, take: 60,
        select: { rotulo: true, caminho: true, norma: { select: { chave: true, numero: true } } },
      }),
      // O que este dispositivo diz regulamentar ou reproduzir.
      this.prisma.referenciaLegal.findMany({ where: { norma_id: norma.id, caminho }, take: 60, select: { destino_ref: true, destino_caminho: true, trecho: true } }),
      // Alteração de ato novo que o texto compilado ainda não traz.
      this.prisma.novidadeLegal.findMany({
        where: { norma_chave: chave, tipo: 'nao_consolidada', status: { in: ['nova', 'vista'] } },
        select: { id: true, titulo: true, resumo: true, ato: true, url: true, detalhes: true },
      }),
    ]);
    const avisos = pendencias.filter((p) => {
      const caminhos = (Array.isArray(p.detalhes) ? p.detalhes : []).map((x) => (x as { caminho?: string }).caminho);
      return !caminhos.length || caminhos.includes(caminho);
    }).map(({ detalhes: _detalhes, ...resto }) => resto);
    // Resolve a norma citada pela referência normalizada, para o leitor poder abrir o dispositivo de destino.
    const destinos = cita.length ? await this.prisma.normaLegal.findMany({ select: { chave: true, numero: true } }) : [];
    const porReferencia = new Map(destinos.map((n) => [referenciaDe(n.numero), n]));
    return {
      norma: { chave: norma.chave, numero: norma.numero, titulo: norma.titulo, url_oficial: norma.url_oficial, capturada_em: norma.capturada_em, situacao: norma.situacao, revogada_por: norma.revogada_por },
      dispositivo: d, anterior, proximo,
      citado_por: citadoPor.map((c) => ({ rotulo: c.rotulo, caminho: c.caminho, norma: c.norma })),
      cita: cita.map((c) => ({ referencia: c.destino_ref, caminho: c.destino_caminho, trecho: c.trecho, norma: porReferencia.get(c.destino_ref) ?? null })),
      avisos,
    };
  }

  /** Busca por artigo ("art 164") e por texto (português, com trecho destacado). */
  async buscar(q: string, chave?: string) {
    const termo = (q || '').trim().slice(0, 200);
    if (termo.length < 2) return { exatos: [], resultados: [], parcial: false };

    const art = /^art(?:igo)?\.?\s*(\d+)\s*[º°o]?\s*(?:-?\s*([a-z]))?\b/i.exec(termo);
    const exatos = art
      ? await this.prisma.dispositivoLegal.findMany({
          where: { caminho: `art-${art[1]}${art[2] ? `-${art[2].toLowerCase()}` : ''}`, ...(chave ? { norma: { chave } } : {}) },
          select: { rotulo: true, caminho: true, secao: true, revogado: true, norma: { select: { chave: true, numero: true, situacao: true } } },
          take: 10,
        })
      : [];

    const filtro = chave ? `AND n."chave" = $2` : '';
    const params: unknown[] = chave ? [termo, chave] : [termo];
    // O que está revogado aparece por último e marcado: a consulta nunca deve tratar texto revogado como o primeiro achado.
    const consulta = (tsquery: string) => `SELECT n."chave", n."numero", n."situacao" AS "norma_situacao", d."rotulo", d."caminho", d."secao", d."revogado", d."parcialmente_revogado",
              ts_headline('portuguese', d."texto", ${tsquery}, 'MaxFragments=2,MaxWords=28,MinWords=10,StartSel=[[,StopSel=]]') AS trecho,
              ts_rank_cd(to_tsvector('portuguese', left(d."texto", 200000)), ${tsquery}) AS rank
         FROM "DispositivoLegal" d JOIN "NormaLegal" n ON n."id" = d."norma_id"
        WHERE to_tsvector('portuguese', left(d."texto", 200000)) @@ ${tsquery} ${filtro}
        ORDER BY d."revogado" ASC, rank DESC, d."ordem" LIMIT 40`;
    type Linha = { chave: string; numero: string; norma_situacao: string; rotulo: string; caminho: string; secao: string | null; revogado: boolean; parcialmente_revogado: boolean; trecho: string; rank: number };

    // 1) todas as palavras (mais preciso); 2) se vier pouco, qualquer palavra — frases naturais
    // ("até quanto o produtor fica fora do IBS") raramente repetem todas as palavras do artigo.
    let resultados = await this.prisma.$queryRawUnsafe<Linha[]>(consulta(`websearch_to_tsquery('portuguese', $1)`), ...params);
    let parcial = false;
    if (resultados.length < 5) {
      const palavras = [...new Set(termo.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4))].slice(0, 12);
      if (palavras.length > 1) {
        const ou = await this.prisma.$queryRawUnsafe<Linha[]>(consulta(`to_tsquery('portuguese', $${chave ? 3 : 2})`), ...params, palavras.join(' | '));
        const jaVistos = new Set(resultados.map((r) => r.chave + r.caminho));
        resultados = [...resultados, ...ou.filter((r) => !jaVistos.has(r.chave + r.caminho))].slice(0, 40);
        parcial = ou.length > 0;
      }
    }
    return { exatos, resultados, parcial };
  }

  // ───────────────────────── Assistente ─────────────────────────

  /** Limite simples por usuário (proteção de custo): 15 perguntas a cada 10 minutos. */
  checarLimite(email: string) {
    const agora = Date.now();
    const recentes = (this.usoPorUsuario.get(email) ?? []).filter((t) => agora - t < 10 * 60_000);
    if (recentes.length >= 15) throw new BadRequestException('Muitas perguntas seguidas. Aguarde alguns minutos e tente de novo.');
    recentes.push(agora);
    this.usoPorUsuario.set(email, recentes);
  }

  /** Qual motor responde o assistente: Claude (Anthropic) se houver chave e não estiver forçado o Gemini; senão Gemini. */
  provedorIa(): 'claude-code' | 'claude' | 'gemini' | null {
    const forcado = (this.config.get<string>('IA_ASSISTENTE') || '').trim().toLowerCase();
    const ponte = Boolean((this.config.get<string>('CLAUDE_BRIDGE_URL') || '').trim() && (this.config.get<string>('CLAUDE_BRIDGE_TOKEN') || '').trim());
    const claude = Boolean((this.config.get<string>('ANTHROPIC_API_KEY') || '').trim());
    const gemini = Boolean((this.config.get<string>('GEMINI_API_KEY') || '').trim());
    if (forcado === 'gemini') return gemini ? 'gemini' : null;
    // Ordem: Claude Code da VPS (créditos da conta, sem chave de API) > API da Anthropic > Gemini.
    if (ponte && forcado !== 'claude') return 'claude-code';
    if (claude) return 'claude';
    return gemini ? 'gemini' : null;
  }

  private ponte() {
    return { url: this.config.get<string>('CLAUDE_BRIDGE_URL')!.trim(), token: this.config.get<string>('CLAUDE_BRIDGE_TOKEN')!.trim(), modelo: (this.config.get<string>('CLAUDE_CODE_MODEL') || '').trim() || undefined };
  }

  iaConfigurada(): boolean {
    return this.provedorIa() !== null;
  }

  /** Nome do modelo que está respondendo (para registrar na pergunta). */
  modeloAtual(): string {
    const p = this.provedorIa();
    if (p === 'claude-code') return (this.config.get<string>('CLAUDE_CODE_MODEL') || '').trim() || 'claude-code';
    return p === 'claude'
      ? this.config.get<string>('ANTHROPIC_MODEL') || MODELO_CLAUDE_PADRAO
      : this.config.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash';
  }

  /** Resposta em texto (JSON no prompt). Claude quando configurado; se ele falhar e houver chave do Gemini, o Gemini responde. */
  async ia(prompt: string, timeoutMs = 60_000): Promise<string> {
    return (await this.iaComModelo(prompt, timeoutMs, Math.max(timeoutMs, 90_000))).texto;
  }

  /**
   * Como `ia`, mas devolve também o modelo que respondeu. `prazoPonteMs` é o tempo que a ponte do Claude Code deixa o processo rodar
   * (ela o encerra ao fim desse prazo); por padrão, o mesmo `timeoutMs`.
   */
  async iaComModelo(prompt: string, timeoutMs = 60_000, prazoPonteMs = timeoutMs): Promise<{ texto: string; modelo: string }> {
    if (this.provedorIa() === 'claude-code') {
      try {
        const r = await perguntarViaPonte({ ...this.ponte(), prompt, timeoutMs: prazoPonteMs });
        return { texto: r.texto, modelo: r.modelo };
      } catch (e) {
        if (!this.config.get<string>('GEMINI_API_KEY') && !this.config.get<string>('ANTHROPIC_API_KEY')) throw e;
        this.log.warn(`Claude Code falhou (${(e as Error).message}); usando o próximo motor`);
      }
    }
    if (this.provedorIa() === 'claude' || (this.provedorIa() === 'claude-code' && this.config.get<string>('ANTHROPIC_API_KEY'))) {
      try {
        const r = await perguntarAoClaude({ apiKey: this.config.get<string>('ANTHROPIC_API_KEY')!.trim(), modelo: this.modeloAtual(), prompt, timeoutMs });
        return { texto: r.texto, modelo: r.modelo };
      } catch (e) {
        if (!this.config.get<string>('GEMINI_API_KEY')) throw e;
        this.log.warn(`Claude falhou (${(e as Error).message}); usando o Gemini`);
      }
    }
    return { texto: await this.gemini(prompt, timeoutMs), modelo: this.config.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash' };
  }

  /** Com pesquisa na web. Mesmo desenho: Claude primeiro, Gemini de reserva. */
  async iaComBusca(prompt: string, timeoutMs?: number): Promise<{ texto: string; grounding: unknown; modelo: string }> {
    if (this.provedorIa() === 'claude-code') {
      try {
        const r = await perguntarViaPonte({ ...this.ponte(), prompt, busca: true, ...(timeoutMs ? { timeoutMs } : {}) });
        return { texto: r.texto, grounding: r.grounding, modelo: r.modelo };
      } catch (e) {
        if (!this.config.get<string>('GEMINI_API_KEY') && !this.config.get<string>('ANTHROPIC_API_KEY')) throw e;
        this.log.warn(`Claude Code falhou na pesquisa (${(e as Error).message}); usando o próximo motor`);
      }
    }
    if (this.provedorIa() === 'claude' || (this.provedorIa() === 'claude-code' && this.config.get<string>('ANTHROPIC_API_KEY'))) {
      try {
        const r = await perguntarAoClaude({ apiKey: this.config.get<string>('ANTHROPIC_API_KEY')!.trim(), modelo: this.modeloAtual(), prompt, busca: true, ...(timeoutMs ? { timeoutMs } : {}) });
        return { texto: r.texto, grounding: r.grounding, modelo: r.modelo };
      } catch (e) {
        if (!this.config.get<string>('GEMINI_API_KEY')) throw e;
        this.log.warn(`Claude falhou na pesquisa (${(e as Error).message}); usando o Gemini`);
      }
    }
    const modeloForte = this.config.get<string>('GEMINI_MODEL_APROFUNDADO') || 'gemini-pro-latest';
    const modeloBase = this.config.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash';
    try {
      return { ...(await this.geminiComBusca(prompt, modeloForte, timeoutMs)), modelo: modeloForte };
    } catch (e) {
      this.log.warn(`Modelo ${modeloForte} falhou (${(e as Error).message}); usando ${modeloBase}`);
      return { ...(await this.geminiComBusca(prompt, modeloBase, timeoutMs)), modelo: modeloBase };
    }
  }

  async gemini(prompt: string, timeoutMs = 60_000): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');
    const modelo = this.config.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash';
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await resp.json();
    if (!resp.ok) throw new Error(`Gemini API ${resp.status}: ${body?.error?.message || 'erro'}`);
    const texto = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    if (!texto) throw new Error('Gemini retornou resposta vazia');
    return texto;
  }

  /** Gemini com a busca do Google ligada (fontes da web). Sem JSON forçado: o formato vem no prompt. Devolve o texto e os metadados das fontes. */
  async geminiComBusca(prompt: string, modeloEscolhido?: string, timeoutMs = 150_000): Promise<{ texto: string; grounding: unknown }> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');
    const modelo = modeloEscolhido || this.config.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash';
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.1 } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await resp.json();
    if (!resp.ok) throw new Error(`Gemini API ${resp.status}: ${body?.error?.message || 'erro'}`);
    const cand = body?.candidates?.[0];
    const texto = cand?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    if (!texto) throw new Error('Gemini retornou resposta vazia');
    return { texto, grounding: cand?.groundingMetadata ?? null };
  }

  /** Dispositivos mais prováveis para a pergunta (artigo citado, termos jurídicos e a própria pergunta). */
  async candidatos(pergunta: string, termos: string[]): Promise<Candidato[]> {
    const consultas = consultasDaPergunta(pergunta, termos);
    const [porPergunta, ...porConceito] = await Promise.all([
      this.buscar(pergunta),
      ...consultas.map((consulta) => this.buscar(consulta)),
    ]);
    const ordem: { chave: string; caminho: string }[] = [];
    const add = (chave: string, caminho: string) => {
      if (!ordem.some((o) => o.chave === chave && o.caminho === caminho)) ordem.push({ chave, caminho });
    };
    porPergunta.exatos.forEach((e) => add(e.norma.chave, e.caminho));
    // Distribui o contexto entre conceitos, sem deixar uma busca genérica ocupar tudo.
    const listas = [...porConceito.map((r) => r.resultados), porPergunta.resultados];
    for (let i = 0; i < 4 && ordem.length < 32; i++) {
      for (const lista of listas) if (lista[i]) add(lista[i].chave, lista[i].caminho);
    }
    if (!ordem.length) return [];
    const rows = await this.prisma.dispositivoLegal.findMany({
      where: { OR: ordem.map((o) => ({ caminho: o.caminho, norma: { chave: o.chave } })) },
      select: {
        rotulo: true, caminho: true, secao: true, texto: true, revogado: true, revogado_por: true, parcialmente_revogado: true,
        alteracoes: true, redacoes_anteriores: true, alterado_em: true,
        norma: { select: { chave: true, numero: true, situacao: true, revogada_por: true } },
      },
    });
    const pos = new Map(ordem.map((o, i) => [`${o.chave}/${o.caminho}`, i]));
    // Dispositivo revogado só entra quando a pergunta o pediu pelo número ("art. 3º foi revogado?"): aí o assistente explica que foi revogado
    // em vez de responder por outro artigo. Nas buscas por assunto, o revogado fica de fora, como sempre.
    const pedidos = new Set(porPergunta.exatos.map((e) => `${e.norma.chave}/${e.caminho}`));
    let caracteres = 0;
    const escolhidos = rows
      .filter((r) => !r.revogado || pedidos.has(`${r.norma.chave}/${r.caminho}`))
      .filter((r) => r.texto.length <= 20_000) // artigos-alteradores gigantes e anexos enormes não cabem no contexto
      .sort((x, y) => (pos.get(`${x.norma.chave}/${x.caminho}`) ?? 99) - (pos.get(`${y.norma.chave}/${y.caminho}`) ?? 99))
      .filter((r) => {
        if (caracteres + r.texto.length > 60_000) return false;
        caracteres += r.texto.length;
        return true;
      })
      .slice(0, 12);

    // Ato novo que altera o dispositivo e o texto compilado ainda não mostra: o assistente avisa. Falha aqui nunca derruba a resposta.
    let avisos = new Map<string, string[]>();
    try {
      const pendencias = await this.prisma.novidadeLegal.findMany({
        where: { tipo: 'nao_consolidada', status: { in: ['nova', 'vista'] }, norma_chave: { in: [...new Set(escolhidos.map((r) => r.norma.chave))] } },
        select: { norma_chave: true, ato: true, detalhes: true },
      });
      avisos = avisosDePendencias(pendencias, escolhidos.map((r) => ({ chave: r.norma.chave, caminho: r.caminho })));
    } catch (e) {
      this.log.warn(`Avisos de alteração não consolidada indisponíveis: ${(e as Error).message}`);
    }

    return escolhidos.map((r) => {
      const notas = (Array.isArray(r.alteracoes) ? (r.alteracoes as { tipo?: string; trecho?: string }[]) : [])
        .filter((m) => ['redacao', 'inclusao', 'revogacao'].includes(m?.tipo ?? '') && m?.trecho)
        .map((m) => m.trecho as string);
      const anteriores = Array.isArray(r.redacoes_anteriores) ? (r.redacoes_anteriores as unknown[]).map(String).filter(Boolean) : [];
      return {
        chave: r.norma.chave, numero: r.norma.numero, rotulo: r.rotulo, caminho: r.caminho, secao: r.secao, texto: r.texto,
        revogado: r.revogado, revogado_por: r.revogado_por, parcialmente_revogado: r.parcialmente_revogado,
        norma_situacao: r.norma.situacao, norma_revogada_por: r.norma.revogada_por,
        alteracoes: [...new Set(notas)], alterado_em: r.alterado_em ? r.alterado_em.toISOString() : null,
        redacao_anterior: anteriores.length ? anteriores[anteriores.length - 1] : null,
        avisos: avisos.get(`${r.norma.chave}/${r.caminho}`) ?? [],
      };
    });
  }

  /** Pergunta livre: recupera dispositivos, pede a resposta ao Gemini só com esse material e valida as citações. */
  async perguntar(email: string, perguntaBruta: string) {
    const pergunta = (perguntaBruta || '').trim().slice(0, 600);
    if (pergunta.length < 8) throw new BadRequestException('Escreva a pergunta com um pouco mais de detalhe.');
    this.checarLimite(email);

    let iaDisponivel = this.iaConfigurada();
    let termos: string[] = [];
    if (iaDisponivel) {
      try {
        const t = lerJson<{ termos?: unknown }>(await this.ia(promptTermos(pergunta), 30_000));
        termos = (Array.isArray(t?.termos) ? t.termos : []).map(String).map((x) => x.slice(0, 60)).slice(0, 12);
      } catch (e) {
        this.log.warn(`Termos via IA falharam: ${(e as Error).message}`);
      }
    }

    const cands = await this.candidatos(pergunta, termos);
    let saida: ReturnType<typeof validarResposta> = { resposta: '', suficiente: false, ressalvas: null, fundamentos: [] };
    let motivo: 'ok' | 'sem_ia' | 'sem_base' | 'erro_ia' = 'ok';

    if (!cands.length) motivo = 'sem_base';
    else if (!iaDisponivel) motivo = 'sem_ia';
    else {
      try {
        saida = validarResposta(lerJson(await this.ia(promptResposta(pergunta, cands))), cands);
      } catch (e) {
        iaDisponivel = false;
        motivo = 'erro_ia';
        this.log.warn(`Resposta via IA falhou: ${(e as Error).message}`);
      }
    }

    if (!saida.resposta) saida = respostaDeApoio(cands, motivo === 'sem_ia' || motivo === 'erro_ia');

    const modelo = this.modeloAtual();
    const reg = await this.prisma.perguntaLegal.create({
      data: {
        user_email: email, pergunta, resposta: saida.resposta || null, fundamentos: saida.fundamentos as object,
        suficiente: saida.suficiente, modelo: iaDisponivel ? modelo : null,
      },
    });
    return {
      id: reg.id,
      motivo,
      ...saida,
      // Quando a IA não respondeu, ainda entregamos os dispositivos achados.
      relacionados: saida.suficiente ? [] : cands.slice(0, 6).map((c) => ({ norma: c.chave, numero: c.numero, rotulo: c.rotulo, caminho: c.caminho, secao: c.secao })),
      aviso: AVISO_ASSISTENTE,
    };
  }

  /** Palavras-chave jurídicas da pergunta (a IA reescreve na linguagem da lei). */
  async termosDaPergunta(pergunta: string): Promise<string[]> {
    const t = lerJson<{ termos?: unknown }>(await this.ia(promptTermos(pergunta), 30_000));
    return (Array.isArray(t?.termos) ? t.termos : []).map(String).map((x) => x.slice(0, 60)).slice(0, 12);
  }

  async feedback(id: string, util: boolean) {
    await this.prisma.perguntaLegal.update({ where: { id }, data: { util } }).catch(() => {
      throw new NotFoundException('Pergunta não encontrada');
    });
    return { ok: true };
  }

  listarPerguntas() {
    return this.prisma.perguntaLegal.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
