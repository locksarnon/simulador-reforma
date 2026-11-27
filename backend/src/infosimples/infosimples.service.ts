import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CofreService } from '../certificados/cofre.service';
import { plural } from '../common/plural';

type Usuario = { email?: string; role?: string } | undefined;
const ID = 'infosimples';
const CONTEXTO = 'integracao:infosimples';
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');
/** UF em que a certidão estadual da Infosimples aceita a inscrição estadual (parâmetro ie), pelo catálogo oficial apis.json. */
export const UF_COM_IE = new Set(['ms', 'ma', 'pa']);
export const URL_INFOSIMPLES = 'https://api.infosimples.com/api/v2/consultas';

/** Status da certidão, no mesmo vocabulário da pré-análise. */
export type ResultadoCertidao = {
  status: 'CONCLUIDO' | 'DEBITOS' | 'IRREGULAR' | 'INDISPONIVEL';
  situacao: string;
  resumo: string;
  emissao: string | null;
  validade: string | null;
  numero: string | null;
  detalhes: { rotulo: string; valor: string }[];
  comprovante: { buffer: Buffer; tipo: string; extensao: string } | null;
};

type RespostaInfosimples = { code?: number; code_message?: string; data?: Record<string, unknown>[]; errors?: string[]; site_receipts?: string[] };
const txt = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? '' : String(v).trim());

/**
 * Motivo da falha da Infosimples em uma frase. A mensagem completa da Infosimples vai para os detalhes.
 * O 603 é a conta ou o token sem acesso à consulta; se a mensagem fala em saldo ou pagamento, o crédito gratuito acabou.
 */
export function motivoDaInfosimples(code: number | undefined, mensagem: string): string {
  // Sem consulta para a UF ou o município: a frase fica com o texto original, que a certidão do cliente usa para não insistir por 30 dias.
  if (/n[aã]o est[aá] dispon[ií]vel uma consulta para/i.test(mensagem)) return 'não está disponível uma consulta para o estado ou o município do cliente na Infosimples';
  if (code === 603 && /saldo inicial gratuito|primeiro pagamento/i.test(mensagem)) return 'o crédito gratuito inicial da Infosimples só cobre algumas consultas de cada serviço, e esta já usou a sua cota. Para continuar, a Infosimples exige o primeiro pagamento (uma recarga), mesmo com saldo de cortesia na conta';
  if (code === 603) return 'o token da Infosimples não tem autorização para esta consulta (token inativo, com limite de uso ou restrito a outros serviços). Confira o token no painel da Infosimples';
  if (/emitir pela Inscri[cç][aã]o Estadual/i.test(mensagem)) return 'a SEFAZ só emite a certidão pela inscrição estadual deste cliente. Cadastre a inscrição estadual na ficha do cliente (Editar dados) e emita de novo';
  if (code === 601 || code === 602) return 'a Infosimples recusou o token. Confira-o em Administração > Integrações';
  return `a Infosimples não trouxe o resultado (código ${code ?? '—'})`;
}

/** CNDT (TST): emitida negativa (ou positiva com efeito de negativa) = regular; "consta" = débitos. */
export function lerCndt(d: Record<string, unknown>): Omit<ResultadoCertidao, 'comprovante'> {
  const negativa = d.conseguiu_emitir_certidao_negativa === true;
  const consta = d.consta === true || /^sim$/i.test(txt(d.consta));
  const certidao = txt(d.certidao) || (negativa ? 'Certidão Negativa de Débitos Trabalhistas' : 'Certidão Positiva de Débitos Trabalhistas');
  const efeitoNegativa = /efeito de negativa/i.test(certidao);
  const status = negativa || efeitoNegativa ? 'CONCLUIDO' : consta ? 'DEBITOS' : 'CONCLUIDO';
  const validade = txt(d.validade_data) || txt(d.normalizado_validade) || txt(d.validade) || null;
  const emissao = txt(d.emissao_data) || txt(d.normalizado_expedicao) || txt(d.expedicao) || null;
  const processos = txt(d.total_de_processos);
  return {
    status, situacao: certidao, emissao, validade, numero: txt(d.certidao_codigo) || null,
    resumo: status === 'DEBITOS' ? `Constam débitos trabalhistas no Banco Nacional de Devedores Trabalhistas${processos ? ` (${plural(Number(processos), 'processo', 'processos')})` : ''}.` : `${certidao}${validade ? `, válida até ${validade}` : ''}.`,
    detalhes: [
      { rotulo: 'Situação', valor: certidao }, { rotulo: 'Emissão', valor: emissao ?? '' }, { rotulo: 'Validade', valor: validade ?? '' },
      { rotulo: 'Código da certidão', valor: txt(d.certidao_codigo) }, { rotulo: 'Processos', valor: processos },
      { rotulo: 'Mensagem', valor: txt(d.mensagem) },
    ].filter((l) => l.valor),
  };
}

/**
 * Certidões estaduais e municipais: cada portal devolve campos próprios; a leitura procura pelo sentido (negativa, positiva com
 * efeito de negativa, positiva; emissão, validade, código).
 */
export function lerCertidaoGenerica(d: Record<string, unknown>): Omit<ResultadoCertidao, 'comprovante'> {
  const achar = (re: RegExp) => { const k = Object.keys(d).find((x) => re.test(x) && txt(d[x])); return k ? txt(d[k]) : ''; };
  const texto = [achar(/^certidao$|tipo_certidao|situacao|mensagem|resultado/i), achar(/certidao/i)].join(' ');
  const negativaBool = d.conseguiu_emitir_certidao_negativa === true || d.negativa === true;
  const efeito = /efeito de negativa/i.test(texto);
  const positiva = !negativaBool && !efeito && (/positiva|consta|d[eé]bito|pend[eê]ncia/i.test(texto) && !/negativa|nada consta|n[aã]o constam/i.test(texto));
  const validade = achar(/validade_data|normalizado_validade|^validade$|valida_ate|data_validade/i) || null;
  const emissao = achar(/emissao_data|normalizado_emissao|^emissao$|data_emissao|expedicao/i) || null;
  const numero = achar(/codigo|numero|controle/i) || null;
  const situacao = achar(/^certidao$|tipo_certidao|situacao/i) || (negativaBool ? 'Certidão negativa' : texto.trim() || 'não informada');
  const status = positiva ? 'DEBITOS' : 'CONCLUIDO';
  return {
    status, situacao, emissao, validade, numero,
    resumo: positiva ? `${situacao}.` : `${situacao}${validade ? `, válida até ${validade}` : ''}.`,
    detalhes: [{ rotulo: 'Situação', valor: situacao }, { rotulo: 'Emissão', valor: emissao ?? '' }, { rotulo: 'Validade', valor: validade ?? '' }, { rotulo: 'Código', valor: numero ?? '' }].filter((l) => l.valor),
  };
}

/** CRF do FGTS (Caixa): "regular" = regular; qualquer outra situação = irregular. */
export function lerCrf(d: Record<string, unknown>): Omit<ResultadoCertidao, 'comprovante'> {
  const situacao = txt(d.situacao) || 'não informada';
  const regular = /regular/i.test(situacao) && !/irregular/i.test(situacao);
  const ini = txt(d.validade_inicio_data) || null;
  const fim = txt(d.validade_fim_data) || null;
  return {
    status: regular ? 'CONCLUIDO' : 'IRREGULAR', situacao, emissao: ini, validade: fim, numero: txt(d.crf) || null,
    resumo: regular ? `Empregador regular perante o FGTS${fim ? `; CRF válido até ${fim}` : ''}.` : `Situação no FGTS: ${situacao}.`,
    detalhes: [
      { rotulo: 'Situação', valor: situacao }, { rotulo: 'Razão social', valor: txt(d.razao_social) || txt(d.nome) },
      { rotulo: 'Número do CRF', valor: txt(d.crf) }, { rotulo: 'Válido de', valor: ini ?? '' }, { rotulo: 'Válido até', valor: fim ?? '' },
      { rotulo: 'Endereço', valor: txt(d.endereco) },
    ].filter((l) => l.valor),
  };
}

/**
 * O servidor só baixa comprovante de endereço da própria Infosimples: https na porta padrão, sem usuário/senha, no domínio
 * infosimples.com (e subdomínios, como storage.infosimples.com) ou no bucket dela no Google Cloud Storage
 * (storage.googleapis.com/infosimples...). Qualquer outro endereço vindo da resposta é ignorado (proteção contra SSRF).
 */
export function linkComprovantePermitido(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port !== '' && u.port !== '443')) return false;
    const host = u.hostname.toLowerCase();
    if (host === 'infosimples.com' || host.endsWith('.infosimples.com')) return true;
    return host === 'storage.googleapis.com' && /^\/infosimples[a-z0-9-]*\//i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Links (https) dentro dos dados devolvidos: site_receipt, url do PDF da certidão etc. */
export function linksDosDados(d: Record<string, unknown>): string[] {
  const l: string[] = [];
  const andar = (v: unknown) => {
    if (typeof v === 'string') { if (/^https:\/\//.test(v)) l.push(v); return; }
    if (Array.isArray(v)) { v.forEach(andar); return; }
    if (v && typeof v === 'object') Object.values(v).forEach(andar);
  };
  andar(d);
  // PDF primeiro.
  return [...new Set(l)].sort((a, b) => Number(/pdf/i.test(b)) - Number(/pdf/i.test(a)));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * Quando o portal não gera arquivo: comprovante em HTML com o que a Infosimples devolveu do portal oficial (situação, emissão,
 * validade, código), para a certidão não se perder e a validade ser acompanhada.
 */
export function comprovanteDosDados(rota: string, cnpj: string, l: Omit<ResultadoCertidao, 'comprovante'>): NonNullable<ResultadoCertidao['comprovante']> {
  const linhas = l.detalhes.map((d) => `<tr><th>${esc(d.rotulo)}</th><td>${esc(d.valor)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${esc(l.situacao)}</title><body style="font-family:sans-serif;padding:24px"><h1 style="font-size:18px">${esc(l.situacao)}</h1><p>CNPJ ${esc(cnpj)} · consulta ${esc(rota)} pela Infosimples em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</p><table cellpadding="6" style="border-collapse:collapse">${linhas}</table><p style="color:#555;font-size:12px">O portal não devolveu o arquivo da certidão; estes são os dados oficiais lidos no portal. Para o PDF, use o portal oficial.</p></body></html>`;
  return { buffer: Buffer.from(html, 'utf8'), tipo: 'text/html', extensao: 'html' };
}

/**
 * Infosimples: a CNDT (TST) e o CRF do FGTS (Caixa) não têm API oficial; a Infosimples emite a certidão no portal oficial e devolve a
 * situação, a validade e o comprovante. O administrador guarda o token em Administração > Integrações (cifrado no cofre).
 * Cada consulta é cobrada pela Infosimples.
 */
@Injectable()
export class InfosimplesService {
  private readonly log = new Logger(InfosimplesService.name);
  constructor(private readonly prisma: PrismaService, private readonly cofre: CofreService) {}

  async token(): Promise<string | null> {
    const r = await this.prisma.integracaoSegredo.findUnique({ where: { id: ID } }).catch(() => null);
    if (r) {
      try { return this.cofre.decifrar({ cifrado: Buffer.from(r.segredo_cifrado), iv: Buffer.from(r.segredo_iv), tag: Buffer.from(r.segredo_tag), chaveId: r.chave_id }, ID, CONTEXTO).toString('utf8'); } catch { return null; }
    }
    return process.env.INFOSIMPLES_TOKEN?.trim() || null;
  }

  async estado() {
    const r = await this.prisma.integracaoSegredo.findUnique({ where: { id: ID }, select: { atualizado_por: true, updatedAt: true } }).catch(() => null);
    return { configurado: !!(r || process.env.INFOSIMPLES_TOKEN?.trim()), atualizado_por: r?.atualizado_por ?? null, atualizado_em: r?.updatedAt ?? null };
  }

  async salvar(token: string | undefined, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores configuram integrações.');
    const t = String(token ?? '').trim();
    if (t.length < 20 || /\s/.test(t)) throw new BadRequestException('Cole o token da Infosimples (Área do cliente > Tokens).');
    const c = this.cofre.cifrar(t, ID, CONTEXTO);
    const dados = { segredo_cifrado: c.cifrado, segredo_iv: c.iv, segredo_tag: c.tag, chave_id: c.chaveId, atualizado_por: usuario?.email ?? null };
    await this.prisma.integracaoSegredo.upsert({ where: { id: ID }, update: dados as never, create: { id: ID, ...dados } as never });
    return this.estado();
  }

  async remover(usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores configuram integrações.');
    await this.prisma.integracaoSegredo.deleteMany({ where: { id: ID } });
    return this.estado();
  }

  /** null = Infosimples não configurada. */
  async cndt(cnpj: string) { return this.certidao('tribunal/tst/cndt', cnpj, lerCndt); }
  async crf(cnpj: string) { return this.certidao('caixa/regularidade', cnpj, lerCrf); }
  /** Certidão estadual (SEFAZ da UF do cliente). A Infosimples cobre MT, MS, GO, MA e PA, entre outras. */
  /**
   * Certidão estadual pela SEFAZ da UF do cliente. Nas UF em que a consulta aceita a inscrição estadual (catálogo oficial da
   * Infosimples: MS, MA e PA), vai pela IE do cadastro quando houver: com IE ativa, a SEFAZ só emite por ela (retorno 620).
   */
  async estadual(cnpj: string, uf: string, ie?: string | null) {
    const u = String(uf || '').toLowerCase();
    if (!/^[a-z]{2}$/.test(u)) throw new BadRequestException('O cliente não tem UF no cadastro.');
    const inscricao = so(ie);
    if (UF_COM_IE.has(u) && inscricao) return this.certidao(`sefaz/${u}/certidao-debitos`, cnpj, lerCertidaoGenerica, { ie: inscricao }, true);
    return this.certidao(`sefaz/${u}/certidao-debitos`, cnpj, lerCertidaoGenerica);
  }
  /** Certidão municipal pela CND unificada de prefeituras (pref/cnd), com a UF e o município do cliente. */
  // Parâmetros oficiais da pref/cnd: uf, municipio, cnpj, inscricao_municipal e extra_parameters.
  async municipal(cnpj: string, uf: string, municipio: string, _ibge?: string | null) {
    if (!uf || !municipio) throw new BadRequestException('O cliente não tem município ou UF no cadastro.');
    return this.certidao('pref/cnd', cnpj, lerCertidaoGenerica, { uf: uf.toUpperCase(), municipio });
  }

  private async certidao(rota: string, cnpjInformado: string, ler: (d: Record<string, unknown>) => Omit<ResultadoCertidao, 'comprovante'>, extras: Record<string, string> = {}, semCnpj = false): Promise<ResultadoCertidao | null> {
    const token = await this.token();
    if (!token) return null;
    const cnpj = so(cnpjInformado);
    if (cnpj.length !== 14) throw new BadRequestException('CNPJ inválido.');
    const corpo = new URLSearchParams({ token, timeout: '300', ...(semCnpj ? {} : { cnpj }), ...extras });
    const r = await fetch(`${URL_INFOSIMPLES}/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo, signal: AbortSignal.timeout(330_000) });
    let j: RespostaInfosimples;
    try { j = (await r.json()) as RespostaInfosimples; } catch { throw new BadRequestException(`A Infosimples respondeu HTTP ${r.status} sem JSON.`); }
    if (j.code !== 200 || !j.data?.length) {
      const msg = [j.code_message, ...(j.errors ?? [])].filter(Boolean).join(' ');
      return { status: 'INDISPONIVEL', situacao: 'não emitida', resumo: `Certidão não emitida: ${motivoDaInfosimples(j.code ?? r.status, msg)}.`, emissao: null, validade: null, numero: null, detalhes: [{ rotulo: 'Retorno da Infosimples', valor: `${j.code ?? r.status}: ${msg || 'sem mensagem'}` }], comprovante: null };
    }
    const lido = ler(j.data[0]);
    // O link do comprovante vem em site_receipts e, em algumas consultas, também dentro dos dados (site_receipt, url do PDF).
    const links = [...(j.site_receipts ?? []), ...linksDosDados(j.data[0])];
    const comprovante = (await this.comprovante(links)) ?? comprovanteDosDados(rota, cnpj, lido);
    return { ...lido, comprovante };
  }

  /**
   * Consulta genérica (serviços do monitoramento): POST na rota com os parâmetros oficiais. null = Infosimples não configurada.
   * Não lança por resposta sem sucesso: quem chama lê o código e a mensagem.
   */
  async consulta(rota: string, parametros: Record<string, string>): Promise<{ http: number; resposta: RespostaInfosimples } | null> {
    const token = await this.token();
    if (!token) return null;
    if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(rota)) throw new BadRequestException('Rota da Infosimples inválida.');
    const corpo = new URLSearchParams({ token, timeout: '300', ...parametros });
    const r = await fetch(`${URL_INFOSIMPLES}/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo, signal: AbortSignal.timeout(330_000) });
    let resposta: RespostaInfosimples;
    try { resposta = (await r.json()) as RespostaInfosimples; } catch { resposta = { code: r.status, code_message: `A Infosimples respondeu HTTP ${r.status} sem JSON.` }; }
    return { http: r.status, resposta };
  }

  /**
   * Pede um comprovante só se o endereço for da Infosimples (linkComprovantePermitido) e sem seguir redirecionamento
   * (um 3xx não é "ok" e é ignorado). Endereço de fora é pulado com aviso no log.
   */
  private async baixarComprovante(u: string): Promise<Response | null> {
    if (!linkComprovantePermitido(u)) {
      this.log.warn(`Comprovante da Infosimples ignorado: endereço fora da Infosimples (${String(u).slice(0, 200)})`);
      return null;
    }
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(60_000) });
    if (!r.ok) { void r.body?.cancel().catch(() => undefined); return null; }
    return r;
  }

  /** Os comprovantes em PDF (site_receipts) de uma consulta; HTML e falhas de download são ignorados. */
  async comprovantesPdf(urls: string[]): Promise<Buffer[]> {
    const out: Buffer[] = [];
    for (const u of urls.slice(0, 5)) {
      try {
        const r = await this.baixarComprovante(u);
        if (!r) continue;
        const b = Buffer.from(await r.arrayBuffer());
        if (/pdf/i.test(r.headers.get('content-type') ?? '') || b.subarray(0, 4).toString() === '%PDF') out.push(b);
      } catch (e) { this.log.warn(`Comprovante da Infosimples: ${(e as Error).message}`); }
    }
    return out;
  }

  /** Baixa o comprovante (o PDF da certidão, quando o portal o gera; senão a página oficial em HTML). */
  private async comprovante(urls: string[]): Promise<ResultadoCertidao['comprovante']> {
    let html: ResultadoCertidao['comprovante'] = null;
    for (const u of urls) {
      try {
        const r = await this.baixarComprovante(u);
        if (!r) continue;
        const buffer = Buffer.from(await r.arrayBuffer());
        const tipo = r.headers.get('content-type') ?? '';
        if (/pdf/i.test(tipo) || buffer.subarray(0, 4).toString() === '%PDF') return { buffer, tipo: 'application/pdf', extensao: 'pdf' };
        if (!html && /html/i.test(tipo)) html = { buffer, tipo: 'text/html', extensao: 'html' };
      } catch (e) { this.log.warn(`Comprovante da Infosimples: ${(e as Error).message}`); }
    }
    return html;
  }
}
