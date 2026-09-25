import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { chaveDe, normasCitadas, referenciaDe, urlOficialValida } from './base-legal.deteccao';
import { PrismaService } from '../prisma/prisma.service';
import { AVISO_ASSISTENTE, Candidato, lerJson, promptResposta, promptTermos, validarResposta } from './base-legal.assistente';
import { decodificar, extrairDispositivos, htmlParaTexto, sha256 } from './base-legal.parser';
import { FONTES_NORMAS } from './fontes';

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
  hash: string;
  motivo?: string;
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

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  /** Garante o cadastro das normas do manifesto (idempotente). */
  async garantirNormas() {
    for (const f of FONTES_NORMAS) {
      await this.prisma.normaLegal.upsert({
        where: { chave: f.chave },
        create: {
          chave: f.chave, tipo: f.tipo, numero: f.numero, titulo: f.titulo, orgao: f.orgao,
          data_publicacao: new Date(f.data_publicacao), url_oficial: f.url_oficial, prioridade: f.prioridade, observacao: f.observacao ?? null,
        },
        update: { tipo: f.tipo, numero: f.numero, titulo: f.titulo, orgao: f.orgao, url_oficial: f.url_oficial, prioridade: f.prioridade, observacao: f.observacao ?? null },
      });
    }
  }

  /** Baixa o texto oficial, divide por dispositivo e grava versões só do que mudou. */
  async importar(chave: string, opcoes: { forcar?: boolean } = {}): Promise<ResultadoImportacao> {
    await this.garantirNormas();
    const norma = await this.prisma.normaLegal.findUnique({ where: { chave } });
    if (!norma) throw new NotFoundException(`Norma "${chave}" não cadastrada`);

    const texto = await this.baixarTexto(norma.url_oficial);
    const hash = sha256(texto);

    if (!opcoes.forcar && norma.hash_atual === hash) {
      await this.prisma.normaLegal.update({ where: { id: norma.id }, data: { capturada_em: new Date() } });
      return { chave, alterada: false, dispositivos: norma.total_dispositivos, novos: 0, alterados: 0, removidos: 0, hash, motivo: 'Texto oficial idêntico ao já carregado' };
    }

    const extraidos = extrairDispositivos(texto);
    if (extraidos.length < 3) throw new BadRequestException('Não foi possível identificar os dispositivos — nada foi gravado (precisa de revisão)');

    const existentes = await this.prisma.dispositivoLegal.findMany({ where: { norma_id: norma.id }, select: { id: true, caminho: true, hash: true, texto: true } });
    const porCaminho = new Map(existentes.map((e) => [e.caminho, e]));
    const vistos = new Set<string>();
    const novos: typeof extraidos = [];
    let alterados = 0;

    for (const d of extraidos) {
      vistos.add(d.caminho);
      const h = sha256(d.texto);
      const ex = porCaminho.get(d.caminho);
      if (!ex) { novos.push(d); continue; }
      if (ex.hash !== h) {
        alterados += 1;
        await this.prisma.$transaction([
          this.prisma.dispositivoLegalVersao.create({ data: { dispositivo_id: ex.id, texto: ex.texto, hash: ex.hash } }),
          this.prisma.dispositivoLegal.update({ where: { id: ex.id }, data: { texto: d.texto, hash: h, rotulo: d.rotulo, ordem: d.ordem, secao: d.secao, revogado: d.revogado } }),
        ]);
      } else {
        await this.prisma.dispositivoLegal.update({ where: { id: ex.id }, data: { ordem: d.ordem, secao: d.secao } });
      }
    }
    for (let i = 0; i < novos.length; i += 100) {
      await this.prisma.dispositivoLegal.createMany({
        data: novos.slice(i, i + 100).map((d) => ({ norma_id: norma.id, tipo: d.tipo, rotulo: d.rotulo, caminho: d.caminho, ordem: d.ordem, secao: d.secao, texto: d.texto, hash: sha256(d.texto), revogado: d.revogado })),
      });
    }
    const removidos = existentes.filter((e) => !vistos.has(e.caminho));
    if (removidos.length) await this.prisma.dispositivoLegal.updateMany({ where: { id: { in: removidos.map((r) => r.id) } }, data: { revogado: true } });

    const cab = lerCabecalho(texto);
    await this.prisma.normaLegal.update({
      where: { id: norma.id },
      data: {
        hash_atual: hash, capturada_em: new Date(), total_dispositivos: extraidos.length,
        ...(cab.data ? { data_publicacao: cab.data } : {}), ementa: cab.ementa,
      },
    });
    this.log.log(`${chave}: ${extraidos.length} dispositivos (${novos.length} novos, ${alterados} alterados, ${removidos.length} removidos)`);
    return { chave, alterada: true, dispositivos: extraidos.length, novos: novos.length, alterados, removidos: removidos.length, hash };
  }

  /** Baixa e normaliza o texto de uma fonte oficial (só https em sites oficiais; PDF ainda não é suportado). */
  private async baixarTexto(url: string): Promise<string> {
    if (!urlOficialValida(url)) throw new BadRequestException('URL fora dos sites oficiais aceitos (planalto.gov.br, cgibs.gov.br, gov.br)');
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (InTAX base legal)' }, signal: AbortSignal.timeout(90_000) });
    if (!resp.ok) throw new BadRequestException(`Fonte oficial respondeu ${resp.status}`);
    if (/pdf/i.test(resp.headers.get('content-type') || '')) throw new BadRequestException('A fonte é um PDF; informe a página HTML do texto da norma.');
    return htmlParaTexto(decodificar(Buffer.from(await resp.arrayBuffer())));
  }

  async importarTodas(): Promise<(ResultadoImportacao | { chave: string; erro: string })[]> {
    await this.garantirNormas();
    const out: (ResultadoImportacao | { chave: string; erro: string })[] = [];
    const normas = await this.prisma.normaLegal.findMany({ select: { chave: true }, orderBy: { createdAt: 'asc' } });
    for (const { chave } of normas) {
      try { out.push(await this.importar(chave)); } catch (e) { out.push({ chave, erro: (e as Error).message }); }
    }
    return out;
  }

  // ─────────────── Verificação de atualizações e alertas (nada entra sem aprovação) ───────────────

  private async criarAlertaSeNovo(a: { tipo: string; chave?: string; referencia: string; titulo: string; detalhe?: string; url?: string; origem: string }, atualizarPendente = false) {
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
    const normas = await this.prisma.normaLegal.findMany({ where: { total_dispositivos: { gt: 0 } } });
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
        const atuais = new Map((await this.prisma.dispositivoLegal.findMany({ where: { norma_id: n.id }, select: { caminho: true, hash: true, rotulo: true } })).map((d) => [d.caminho, d]));
        const alterados = extraidos.filter((d) => atuais.has(d.caminho) && atuais.get(d.caminho)!.hash !== sha256(d.texto));
        const novos = extraidos.filter((d) => !atuais.has(d.caminho));
        const vistos = new Set(extraidos.map((d) => d.caminho));
        const removidos = [...atuais.keys()].filter((c) => !vistos.has(c));
        const lista = (xs: { rotulo: string }[]) => xs.slice(0, 8).map((x) => x.rotulo).join(', ') + (xs.length > 8 ? '…' : '');
        const detalhe = [
          alterados.length ? `${alterados.length} dispositivo(s) alterado(s): ${lista(alterados)}` : null,
          novos.length ? `${novos.length} novo(s): ${lista(novos)}` : null,
          removidos.length ? `${removidos.length} removido(s)` : null,
        ].filter(Boolean).join(' · ') || 'O texto oficial mudou (sem alteração de artigo identificada — pode ser só formatação).';
        const criado = await this.criarAlertaSeNovo({ tipo: 'texto_alterado', chave: n.chave, referencia: n.chave, titulo: `${n.numero}: texto oficial atualizado`, detalhe, url: n.url_oficial, origem }, true);
        if (criado) alertas += 1;
      } catch (e) {
        erros.push(`${n.chave}: ${(e as Error).message}`);
      }
    }
    return { verificadas: normas.length, alertas, erros };
  }

  /** Depois de gerar o Radar: procura normas citadas que ainda não estão na base e reconfere o texto das já carregadas. */
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
    const v = await this.verificarAtualizacoes('radar');
    return { novasNormas, atualizacoes: v.alertas };
  }

  /** Toda segunda, 06h30 (o Radar roda às 06h): reconfere as fontes oficiais. */
  @Cron('30 6 * * 1', { timeZone: 'America/Sao_Paulo' })
  async verificacaoSemanal() {
    try {
      const r = await this.verificarAtualizacoes('agendada');
      this.log.log(`Verificação semanal: ${r.verificadas} normas, ${r.alertas} alerta(s), ${r.erros.length} erro(s)`);
    } catch (e) {
      this.log.error(`Verificação semanal falhou: ${(e as Error).message}`);
    }
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
      select: { rotulo: true, caminho: true, tipo: true, secao: true, revogado: true },
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
    const [anterior, proximo] = await Promise.all([
      this.prisma.dispositivoLegal.findFirst({ where: { norma_id: norma.id, ordem: { lt: d.ordem } }, orderBy: { ordem: 'desc' }, select: { rotulo: true, caminho: true } }),
      this.prisma.dispositivoLegal.findFirst({ where: { norma_id: norma.id, ordem: { gt: d.ordem } }, orderBy: { ordem: 'asc' }, select: { rotulo: true, caminho: true } }),
    ]);
    return { norma: { chave: norma.chave, numero: norma.numero, titulo: norma.titulo, url_oficial: norma.url_oficial, capturada_em: norma.capturada_em }, dispositivo: d, anterior, proximo };
  }

  /** Busca por artigo ("art 164") e por texto (português, com trecho destacado). */
  async buscar(q: string, chave?: string) {
    const termo = (q || '').trim().slice(0, 200);
    if (termo.length < 2) return { exatos: [], resultados: [], parcial: false };

    const art = /^art(?:igo)?\.?\s*(\d+)\s*[º°o]?\s*(?:-?\s*([a-z]))?\b/i.exec(termo);
    const exatos = art
      ? await this.prisma.dispositivoLegal.findMany({
          where: { caminho: `art-${art[1]}${art[2] ? `-${art[2].toLowerCase()}` : ''}`, ...(chave ? { norma: { chave } } : {}) },
          select: { rotulo: true, caminho: true, secao: true, norma: { select: { chave: true, numero: true } } },
          take: 10,
        })
      : [];

    const filtro = chave ? `AND n."chave" = $2` : '';
    const params: unknown[] = chave ? [termo, chave] : [termo];
    const consulta = (tsquery: string) => `SELECT n."chave", n."numero", d."rotulo", d."caminho", d."secao",
              ts_headline('portuguese', d."texto", ${tsquery}, 'MaxFragments=2,MaxWords=28,MinWords=10,StartSel=[[,StopSel=]]') AS trecho,
              ts_rank_cd(to_tsvector('portuguese', left(d."texto", 200000)), ${tsquery}) AS rank
         FROM "DispositivoLegal" d JOIN "NormaLegal" n ON n."id" = d."norma_id"
        WHERE to_tsvector('portuguese', left(d."texto", 200000)) @@ ${tsquery} ${filtro}
        ORDER BY rank DESC, d."ordem" LIMIT 40`;
    type Linha = { chave: string; numero: string; rotulo: string; caminho: string; secao: string | null; trecho: string; rank: number };

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
  private checarLimite(email: string) {
    const agora = Date.now();
    const recentes = (this.usoPorUsuario.get(email) ?? []).filter((t) => agora - t < 10 * 60_000);
    if (recentes.length >= 15) throw new BadRequestException('Muitas perguntas seguidas. Aguarde alguns minutos e tente de novo.');
    recentes.push(agora);
    this.usoPorUsuario.set(email, recentes);
  }

  private async gemini(prompt: string, timeoutMs = 60_000): Promise<string> {
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

  /** Dispositivos mais prováveis para a pergunta (artigo citado, termos jurídicos e a própria pergunta). */
  private async candidatos(pergunta: string, termos: string[]): Promise<Candidato[]> {
    const [porTermos, porPergunta] = await Promise.all([
      termos.length ? this.buscar(termos.join(' ')) : Promise.resolve(null),
      this.buscar(pergunta),
    ]);
    const ordem: { chave: string; caminho: string }[] = [];
    const add = (chave: string, caminho: string) => {
      if (!ordem.some((o) => o.chave === chave && o.caminho === caminho)) ordem.push({ chave, caminho });
    };
    porPergunta.exatos.forEach((e) => add(e.norma.chave, e.caminho));
    // Alterna as duas listas para não depender de uma única estratégia de busca.
    const a = porTermos?.resultados ?? [];
    const b = porPergunta.resultados;
    for (let i = 0; i < Math.max(a.length, b.length) && ordem.length < 16; i++) {
      if (a[i]) add(a[i].chave, a[i].caminho);
      if (b[i]) add(b[i].chave, b[i].caminho);
    }
    if (!ordem.length) return [];
    const rows = await this.prisma.dispositivoLegal.findMany({
      where: { OR: ordem.map((o) => ({ caminho: o.caminho, norma: { chave: o.chave } })), revogado: false },
      select: { rotulo: true, caminho: true, secao: true, texto: true, norma: { select: { chave: true, numero: true } } },
    });
    const pos = new Map(ordem.map((o, i) => [`${o.chave}/${o.caminho}`, i]));
    return rows
      .filter((r) => r.texto.length <= 20_000) // artigos-alteradores gigantes e anexos enormes não cabem no contexto
      .sort((x, y) => (pos.get(`${x.norma.chave}/${x.caminho}`) ?? 99) - (pos.get(`${y.norma.chave}/${y.caminho}`) ?? 99))
      .slice(0, 8)
      .map((r) => ({ chave: r.norma.chave, numero: r.norma.numero, rotulo: r.rotulo, caminho: r.caminho, secao: r.secao, texto: r.texto.slice(0, 6000) }));
  }

  /** Pergunta livre: recupera dispositivos, pede a resposta ao Gemini só com esse material e valida as citações. */
  async perguntar(email: string, perguntaBruta: string) {
    const pergunta = (perguntaBruta || '').trim().slice(0, 600);
    if (pergunta.length < 8) throw new BadRequestException('Escreva a pergunta com um pouco mais de detalhe.');
    this.checarLimite(email);

    let iaDisponivel = Boolean(this.config.get<string>('GEMINI_API_KEY'));
    let termos: string[] = [];
    if (iaDisponivel) {
      try {
        const t = lerJson<{ termos?: unknown }>(await this.gemini(promptTermos(pergunta), 30_000));
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
        saida = validarResposta(lerJson(await this.gemini(promptResposta(pergunta, cands))), cands);
      } catch (e) {
        iaDisponivel = false;
        motivo = 'erro_ia';
        this.log.warn(`Resposta via IA falhou: ${(e as Error).message}`);
      }
    }

    const modelo = this.config.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash';
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
