import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { zipSync } from 'fflate';
import { ImportacaoXmlService } from '../importacao-xml/importacao-xml.service';
import { MAX_TAMANHO_XML } from '../importacao-xml/shared/xml-parser';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { IndiceXml, ehChaveNfse, indexarXml, tipoDaChave } from './xml-indice';
import { ErroLeituraDocumento } from './pdf/erros';
import { geraPdf, tipoDePdf } from './pdf/tipos-de-pdf';
import { lerXmlsDoZip } from './zip-seguro';

export type Origem = 'UPLOAD' | 'CAPTURA';
export type ResultadoRegistro = { resultado: 'NOVO' | 'ATUALIZADO' | 'DUPLICADO' | 'IGNORADO'; motivo?: string; id?: string };

export type FiltrosDocumentos = {
  tipo?: string; origem?: string; conteudo?: string; situacao?: string; de?: string; ate?: string; q?: string; pendentes?: boolean;
  /** Grupo da aba: NFE, CTE, MDFE ou NFSE (só os documentos daquele tipo) ou RESUMOS_EVENTOS (os resumos e os eventos, de qualquer tipo). */
  grupo?: string;
  /** Modelo do documento (55, 65, 57, 58...): na aba NF-e | NFC-e separa uma da outra. */
  modelo?: string;
  limit?: number; offset?: number;
};

const MAX_ENTRADAS_ZIP = 5000;
const MAX_ZIP_DESCOMPRIMIDO = 200 * 1024 * 1024;
const MAX_ZIP_DOWNLOAD = 5000;
const MAX_IMPORTACAO = 1000;
/** Linhas por pedido na lista de documentos: a tela mostra 10, 50, 100 ou 500 por página e, em "todas", busca em partes de 500. */
const MAX_POR_PAGINA = 500;
const PARALELISMO = 8;
/** Gerar o PDF é trabalho de CPU: o ZIP com PDF aceita menos documentos que o ZIP só com XML. */
const MAX_PDF_NO_ZIP = 300;

/**
 * O importador de XML lê NF-e, NFC-e e CT-e (com os eventos deles). A NFS-e e o MDF-e ele reconhece, mas ignora, e o evento da NFS-e
 * tem a mesma raiz do da NF-e: nada disso vai ao importador nem conta como "falta enviar". Nos eventos, o modelo vem da chave de acesso
 * (55 e 65 da NF-e, 57 e 67 do CT-e); o da NFS-e não tem modelo.
 */
export const IMPORTAVEL: Prisma.DocumentoXmlWhereInput = {
  OR: [{ tipo: { in: ['NFE', 'CTE'] } }, { tipo: 'EVENTO', modelo: { in: ['55', '65', '57', '67'] } }],
};

/**
 * O que a tabela "Resumos e eventos SEFAZ" da tela mostra: os documentos que a SEFAZ entregou só em resumo (sem o XML completo) e os
 * eventos (cancelamento, carta de correção, manifestação etc.), de qualquer tipo de documento.
 */
export const RESUMOS_E_EVENTOS: Prisma.DocumentoXmlWhereInput = { OR: [{ conteudo: 'RESUMO' }, { tipo: 'EVENTO' }] };

/**
 * Os grupos das abas da tela: uma aba por tipo de documento, só com os documentos dele (o evento carrega o modelo do documento a que
 * se refere, mas vai para a aba Resumos e eventos SEFAZ), e a aba dos resumos e eventos.
 */
export const GRUPOS_DE_DOCUMENTOS: Record<string, Prisma.DocumentoXmlWhereInput> = {
  NFE: { tipo: 'NFE' },
  CTE: { tipo: 'CTE' },
  MDFE: { tipo: 'MDFE' },
  NFSE: { tipo: 'NFSE' },
  RESUMOS_EVENTOS: RESUMOS_E_EVENTOS,
};

/** Filtros da lista, do ZIP e dos relatórios do repositório (todos pedem os documentos de uma empresa). */
export function construirWhere(empresaId: string, f: FiltrosDocumentos): Prisma.DocumentoXmlWhereInput {
  const w: Prisma.DocumentoXmlWhereInput = { empresa_id: empresaId };
  if (f.tipo) w.tipo = f.tipo;
  if (f.modelo) w.modelo = f.modelo;
  if (f.origem) w.origem = f.origem;
  if (f.conteudo) w.conteudo = f.conteudo;
  if (f.situacao) w.situacao = f.situacao;
  const e: Prisma.DocumentoXmlWhereInput[] = [];
  if (f.pendentes) { w.lote_importacao_id = null; w.conteudo = 'COMPLETO'; e.push(IMPORTAVEL); }
  if (f.grupo) {
    const grupo = GRUPOS_DE_DOCUMENTOS[f.grupo];
    if (!grupo) throw new BadRequestException('Grupo de documentos desconhecido.');
    e.push(grupo);
  }
  if (e.length) w.AND = e;
  const de = f.de ? new Date(`${f.de}T00:00:00-03:00`) : null;
  const ate = f.ate ? new Date(`${f.ate}T23:59:59.999-03:00`) : null;
  if ((de && !Number.isNaN(de.getTime())) || (ate && !Number.isNaN(ate.getTime()))) {
    w.data_emissao = { ...(de && !Number.isNaN(de.getTime()) ? { gte: de } : {}), ...(ate && !Number.isNaN(ate.getTime()) ? { lte: ate } : {}) };
  }
  const q = (f.q ?? '').trim();
  if (q) {
    const digitos = q.replace(/\D/g, '');
    w.OR = [
      { chave: { contains: q.toUpperCase() } },
      { emitente_nome: { contains: q, mode: 'insensitive' } },
      ...(digitos ? [{ numero: digitos }, { emitente_doc: { contains: digitos } }] : []),
    ];
  }
  return w;
}

/** Resumo substitui-se pelo XML completo; qualquer outro repetido é duplicado. */
export function decidirRegistro(existente: { conteudo: string } | null, novo: { conteudo: string }): 'CRIAR' | 'ATUALIZAR' | 'DUPLICADO' {
  if (!existente) return 'CRIAR';
  if (existente.conteudo === 'RESUMO' && novo.conteudo === 'COMPLETO') return 'ATUALIZAR';
  return 'DUPLICADO';
}

/** Ano e mês no horário de Brasília (as datas da NFS-e vêm com fuso). */
function anoMesDe(data: Date): { ano: string; mes: string } {
  const brasilia = new Date(data.getTime() - 3 * 3_600_000);
  return { ano: String(brasilia.getUTCFullYear()), mes: String(brasilia.getUTCMonth() + 1).padStart(2, '0') };
}

/**
 * Caminho do arquivo no armazenamento: por empresa, origem, ano e mês da emissão. Na NF-e, CT-e e MDF-e vêm da própria chave de acesso;
 * a chave da NFS-e (50 posições) é outra, então vale a data de emissão (ou a da recepção, se o XML não trouxer).
 */
export function caminhoObjeto(
  empresaId: string,
  origem: Origem,
  ind: Pick<IndiceXml, 'chave' | 'tipo' | 'eventoTipo' | 'sequencia' | 'conteudo'> & { dataEmissao?: Date | null },
  recebidoEm: Date = new Date(),
): string {
  const aamm = ind.chave.slice(2, 6);
  const { ano, mes } = ehChaveNfse(ind.chave) ? anoMesDe(ind.dataEmissao ?? recebidoEm) : { ano: `20${aamm.slice(0, 2)}`, mes: aamm.slice(2, 4) };
  const prefixo = ind.tipo === 'EVENTO' ? `evento-${ind.eventoTipo}-${ind.sequencia}-` : ind.conteudo === 'RESUMO' ? 'resumo-' : '';
  return `repositorio/${empresaId}/${origem === 'UPLOAD' ? 'importacao' : 'captura'}/${ano}/${mes}/${prefixo}${ind.chave}.xml`;
}

const nomeBase = (caminho: string) => caminho.split(/[\\/]/).pop() || caminho;
const ehZip = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;

/** Devolve o controle ao laço de eventos: o processamento de um envio grande não pode deixar a API (e o healthcheck) parada. */
const ceder = () => new Promise<void>((resolver) => setImmediate(resolver));

/** Processa `itens` de `tamanho` em `tamanho` ao mesmo tempo, mantendo a ordem dos resultados. */
export async function emLotes<T, R>(itens: T[], tamanho: number, fn: (i: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  return out;
}

/**
 * Repositório de XML por cliente (empresa): guarda no MinIO e indexa no banco os XML enviados (importação) e capturados.
 * Deduplica por chave de acesso (e por evento), troca o resumo da Distribuição pelo XML completo quando ele chega e
 * entrega os arquivos ao importador de XML que já existe.
 */
@Injectable()
export class RepositorioXmlService {
  private readonly logger = new Logger(RepositorioXmlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly importacao: ImportacaoXmlService,
  ) {}

  private async empresa(empresaId: string) {
    const e = await this.prisma.empresa.findUnique({ where: { id: empresaId } }).catch(() => null);
    if (!e) throw new NotFoundException('Empresa não localizada.');
    return e;
  }

  // ── Entrada ─────────────────────────────────────────────────────────

  /** Recebe arquivos .xml e .zip enviados por uma pessoa e registra cada XML no repositório da empresa. */
  async receberArquivos(empresaId: string, arquivos: { nome: string; buffer: Buffer }[], usuario: string) {
    const empresa = await this.empresa(empresaId);
    const raiz = this.raizDocumento(empresa.cnpj_cpf);
    const entradas: { nome: string; buffer: Buffer }[] = [];
    const ignorados: { nome: string; motivo: string }[] = [];

    for (const a of arquivos) {
      if (ehZip(a.buffer)) {
        try {
          // Os tamanhos declarados no ZIP não valem (bomba de descompressão): o leitor mede o que realmente sai de cada arquivo.
          const lido = lerXmlsDoZip(a.buffer, { maxEntradas: MAX_ENTRADAS_ZIP, maxTotal: MAX_ZIP_DESCOMPRIMIDO, maxPorArquivo: MAX_TAMANHO_XML });
          entradas.push(...lido.entradas);
          ignorados.push(...lido.ignorados);
        } catch {
          ignorados.push({ nome: a.nome, motivo: 'ZIP inválido ou grande demais (limite de 5.000 arquivos e 200 MB descompactados)' });
        }
      } else if (a.nome.toLowerCase().endsWith('.xml')) {
        entradas.push(a);
      } else {
        ignorados.push({ nome: a.nome, motivo: 'só são aceitos arquivos .xml e .zip' });
      }
    }

    // Arquivos com a mesma chave são processados em sequência (um resumo e o XML completo do mesmo documento no mesmo envio não
    // podem disputar a gravação); chaves diferentes seguem em paralelo.
    const grupos = new Map<string, { nome: string; buffer: Buffer; ind: IndiceXml | null }[]>();
    let lidos = 0;
    for (const e of entradas) {
      const ind = indexarXml(e.buffer.toString('utf8').replace(/^﻿/, ''));
      const k = ind ? `${ind.tipo}|${ind.chave}|${ind.eventoTipo}|${ind.sequencia}` : `#${grupos.size}`;
      const lista = grupos.get(k) ?? [];
      lista.push({ ...e, ind });
      grupos.set(k, lista);
      lidos += 1;
      if (lidos % 20 === 0) await ceder(); // ler 5.000 notas leva um minuto de CPU: sem isto a API ficaria parada
    }
    const contagem = { novos: 0, atualizados: 0, duplicados: 0 };
    await emLotes([...grupos.values()], PARALELISMO, async (grupo) => {
      for (const e of grupo.sort((a, b) => Number(b.ind?.conteudo === 'RESUMO') - Number(a.ind?.conteudo === 'RESUMO'))) {
        const r = await this.registrar(empresaId, e.buffer, { origem: 'UPLOAD', nomeOriginal: e.nome, usuario, raizEmpresa: raiz, indice: e.ind });
        if (r.resultado === 'NOVO') contagem.novos += 1;
        else if (r.resultado === 'ATUALIZADO') contagem.atualizados += 1;
        else if (r.resultado === 'DUPLICADO') contagem.duplicados += 1;
        else ignorados.push({ nome: e.nome, motivo: r.motivo || 'ignorado' });
      }
    });
    return { arquivos: arquivos.length, xml_lidos: entradas.length, ...contagem, ignorados };
  }

  private raizDocumento(doc: string | null): string | null {
    const d = String(doc ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (d.length === 14) return d.slice(0, 8);
    if (d.length === 11) return d;
    return null;
  }

  /**
   * Registra um XML no repositório (usado pelo envio de arquivos e pelo coletor). Guarda o arquivo, indexa e trata a duplicidade.
   * Com raizEmpresa, recusa o documento que não cita o CNPJ da empresa (evita misturar arquivos de clientes diferentes).
   */
  async registrar(
    empresaId: string,
    buffer: Buffer,
    ctx: { origem: Origem; nsu?: string; nomeOriginal?: string; usuario?: string; raizEmpresa?: string | null; indice?: IndiceXml | null },
  ): Promise<ResultadoRegistro> {
    const texto = buffer.toString('utf8').replace(/^﻿/, '');
    if (buffer.length > MAX_TAMANHO_XML) return { resultado: 'IGNORADO', motivo: 'maior que 2 MB' };
    const ind = ctx.indice !== undefined ? ctx.indice : indexarXml(texto);
    if (!ind) return { resultado: 'IGNORADO', motivo: 'não reconhecido como NF-e, CT-e, MDF-e, NFS-e ou evento' };
    if (ctx.raizEmpresa && !texto.toUpperCase().includes(ctx.raizEmpresa)) {
      return { resultado: 'IGNORADO', motivo: 'o documento não cita o CNPJ desta empresa' };
    }

    const unica = { empresa_id_tipo_chave_evento_tipo_sequencia: { empresa_id: empresaId, tipo: ind.tipo === 'EVENTO' ? 'EVENTO' : ind.tipo, chave: ind.chave, evento_tipo: ind.eventoTipo, sequencia: ind.sequencia } };
    const existente = await this.prisma.documentoXml.findUnique({ where: unica });
    let acao = decidirRegistro(existente, ind);
    // Resumo enviado por arquivo não veio da SEFAZ e por isso não vale para a Ciência da Operação: o resumo da captura o substitui,
    // para a nota poder receber a Ciência quando o cliente a ativar.
    if (acao === 'DUPLICADO' && existente?.conteudo === 'RESUMO' && ind.conteudo === 'RESUMO' && ctx.origem === 'CAPTURA' && existente.origem === 'UPLOAD') acao = 'ATUALIZAR';
    if (acao === 'DUPLICADO') return { resultado: 'DUPLICADO', id: existente?.id };

    // O arquivo é guardado exatamente como chegou (mesmos bytes, mesmo hash), mesmo que não seja UTF-8; o texto lido serve só ao índice.
    const hash = createHash('sha256').update(buffer).digest('hex');
    const recebidoEm = new Date();
    const storageKey = caminhoObjeto(empresaId, ctx.origem, ind, recebidoEm);
    await this.storage.guardar(storageKey, buffer, 'application/xml');

    const dados = {
      modelo: ind.modelo, numero: ind.numero, serie: ind.serie, data_emissao: ind.dataEmissao,
      emitente_doc: ind.emitenteDoc, emitente_nome: ind.emitenteNome, destinatario_doc: ind.destinatarioDoc, valor_total: ind.valorTotal,
      conteudo: ind.conteudo, situacao: ind.situacao, origem: ctx.origem, nsu: ctx.nsu ?? null, autorizada_em: ind.autorizadaEm,
      storage_key: storageKey, sha256: hash, tamanho_bytes: buffer.length,
      nome_original: ctx.nomeOriginal ?? null, enviado_por: ctx.usuario ?? null, recebido_em: recebidoEm,
    };

    let id: string;
    try {
      if (acao === 'ATUALIZAR' && existente) {
        const caminhoAntigo = existente.storage_key;
        await this.prisma.documentoXml.update({ where: { id: existente.id }, data: dados });
        if (caminhoAntigo && caminhoAntigo !== storageKey) await this.storage.removeObject(caminhoAntigo).catch(() => undefined);
        id = existente.id;
      } else {
        const criado = await this.prisma.documentoXml.create({
          data: { empresa_id: empresaId, tipo: ind.tipo, chave: ind.chave, evento_tipo: ind.eventoTipo, sequencia: ind.sequencia, ...dados },
        });
        id = criado.id;
      }
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') return { resultado: 'DUPLICADO' };
      throw e;
    }
    await this.conciliarCancelamento(empresaId, ind);
    return { resultado: acao === 'ATUALIZAR' ? 'ATUALIZADO' : 'NOVO', id };
  }

  /**
   * O evento de cancelamento marca o documento como cancelado, qualquer que seja a ordem de chegada. O índice só põe CANCELADA no evento
   * que cancela (110111 na NF-e, CT-e e MDF-e; quatro códigos na NFS-e), então a situação do evento basta para reconhecê-lo.
   */
  private async conciliarCancelamento(empresaId: string, ind: IndiceXml) {
    if (ind.tipo === 'EVENTO') {
      if (ind.situacao !== 'CANCELADA') return;
      await this.prisma.documentoXml.updateMany({
        where: { empresa_id: empresaId, tipo: tipoDaChave(ind.chave), chave: ind.chave, evento_tipo: '', sequencia: 0 },
        data: { situacao: 'CANCELADA' },
      });
      return;
    }
    if (ind.situacao === 'CANCELADA') return;
    const cancelamento = await this.prisma.documentoXml.findFirst({
      where: { empresa_id: empresaId, tipo: 'EVENTO', chave: ind.chave, situacao: 'CANCELADA' },
      select: { id: true },
    });
    if (cancelamento) {
      await this.prisma.documentoXml.updateMany({ where: { empresa_id: empresaId, tipo: ind.tipo, chave: ind.chave, evento_tipo: '', sequencia: 0 }, data: { situacao: 'CANCELADA' } });
    }
  }

  // ── Consulta ────────────────────────────────────────────────────────

  private where(empresaId: string, f: FiltrosDocumentos): Prisma.DocumentoXmlWhereInput {
    return construirWhere(empresaId, f);
  }

  async listar(empresaId: string, f: FiltrosDocumentos) {
    await this.empresa(empresaId);
    const where = this.where(empresaId, f);
    const take = Math.min(Math.max(Number(f.limit) || 50, 1), MAX_POR_PAGINA);
    const skip = Math.max(Number(f.offset) || 0, 0);
    const [total, itens] = await Promise.all([
      this.prisma.documentoXml.count({ where }),
      this.prisma.documentoXml.findMany({
        where, take, skip, orderBy: [{ data_emissao: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true, tipo: true, chave: true, evento_tipo: true, sequencia: true, modelo: true, numero: true, serie: true, data_emissao: true,
          emitente_doc: true, emitente_nome: true, destinatario_doc: true, valor_total: true, conteudo: true, situacao: true, origem: true,
          tamanho_bytes: true, nome_original: true, enviado_por: true, lote_importacao_id: true, importado_em: true, recebido_em: true,
          ciencia_status: true, ciencia_em: true,
        },
      }),
    ]);
    return { total, itens };
  }

  async resumo(empresaId: string) {
    await this.empresa(empresaId);
    const base = { empresa_id: empresaId };
    const [total, porOrigem, porTipo, resumos, resumosEEventos, naoImportados, ultimo] = await Promise.all([
      this.prisma.documentoXml.count({ where: base }),
      this.prisma.documentoXml.groupBy({ by: ['origem'], where: base, _count: { _all: true } }),
      this.prisma.documentoXml.groupBy({ by: ['tipo'], where: base, _count: { _all: true } }),
      this.prisma.documentoXml.count({ where: { ...base, conteudo: 'RESUMO' } }),
      this.prisma.documentoXml.count({ where: { ...base, AND: [RESUMOS_E_EVENTOS] } }),
      this.prisma.documentoXml.count({ where: { ...base, conteudo: 'COMPLETO', lote_importacao_id: null, AND: [IMPORTAVEL] } }),
      this.prisma.documentoXml.findFirst({ where: base, orderBy: { recebido_em: 'desc' }, select: { recebido_em: true } }),
    ]);
    const conta = <K extends string>(linhas: ({ _count: { _all: number } } & Record<K, string>)[], k: K) => Object.fromEntries(linhas.map((l) => [l[k], l._count._all]));
    return {
      total,
      por_origem: conta(porOrigem as never, 'origem'),
      por_tipo: conta(porTipo as never, 'tipo'),
      so_resumo: resumos,
      resumos_e_eventos: resumosEEventos,
      nao_enviados_ao_importador: naoImportados,
      ultimo_recebimento: ultimo?.recebido_em ?? null,
    };
  }

  // ── Saída ───────────────────────────────────────────────────────────

  async baixar(empresaId: string, id: string) {
    const d = await this.prisma.documentoXml.findFirst({ where: { id, empresa_id: empresaId } });
    if (!d?.storage_key) throw new NotFoundException('Documento não localizado.');
    const buffer = await this.storage.getObjectBuffer(d.storage_key);
    return { buffer, nome: nomeBase(d.storage_key) };
  }

  /**
   * PDF do documento guardado (DANFE, DANFE NFC-e, DACTE, DAMDFE ou DANFSe), gerado na hora a partir do XML completo;
   * cancelado ou denegado ganha a marca d'água. Evento e documento que é só resumo não têm PDF.
   */
  async baixarPdf(empresaId: string, id: string) {
    const d = await this.prisma.documentoXml.findFirst({ where: { id, empresa_id: empresaId } });
    if (!d?.storage_key) throw new NotFoundException('Documento não localizado.');
    if (d.conteudo !== 'COMPLETO') throw new BadRequestException('Só o resumo está guardado: falta o XML completo para gerar o PDF.');
    const tipo = tipoDePdf(d);
    if (!tipo) {
      throw new BadRequestException(d.tipo === 'EVENTO' ? 'Evento não tem PDF: ele fica só em XML.' : 'O PDF deste tipo de documento ainda não está disponível. Ele fica só em XML.');
    }
    const buffer = await this.storage.getObjectBuffer(d.storage_key);
    try {
      const pdf = await tipo.gerar(buffer.toString('utf8').replace(/^\uFEFF/, ''), { cancelada: d.situacao === 'CANCELADA', denegada: d.situacao === 'DENEGADA' });
      return { buffer: pdf, nome: `${tipo.prefixo}-${d.chave}.pdf` };
    } catch (e) {
      if (e instanceof ErroLeituraDocumento) throw new BadRequestException(`Não foi possível gerar o PDF: ${e.message}`);
      throw e;
    }
  }

  /**
   * ZIP dos documentos que os filtros mostram. Com `incluirPdf`, cada documento que tem PDF leva também o seu, na pasta
   * PDF/<tipo>/<ano>-<mês>/ (a mesma organização do XML); o que não pôde ser desenhado vai listado em PDF/LEIAME-falhas.txt.
   */
  async baixarZip(empresaId: string, f: FiltrosDocumentos, opcoes: { incluirPdf?: boolean } = {}) {
    await this.empresa(empresaId);
    const docs = await this.prisma.documentoXml.findMany({
      where: { ...this.where(empresaId, f), storage_key: { not: null } },
      orderBy: [{ data_emissao: 'asc' }],
      take: MAX_ZIP_DOWNLOAD + 1,
      select: { storage_key: true, tipo: true, chave: true, modelo: true, conteudo: true, situacao: true },
    });
    if (!docs.length) throw new BadRequestException('Nenhum documento nos filtros escolhidos.');
    if (docs.length > MAX_ZIP_DOWNLOAD) throw new BadRequestException(`Há mais de ${MAX_ZIP_DOWNLOAD} documentos nos filtros. Reduza o período e baixe em partes.`);
    const comPdf = opcoes.incluirPdf ? docs.filter(geraPdf) : [];
    if (comPdf.length > MAX_PDF_NO_ZIP) {
      throw new BadRequestException(`Há ${comPdf.length} documentos com PDF nos filtros, e o ZIP com PDF aceita até ${MAX_PDF_NO_ZIP}. Reduza o período ou baixe o ZIP só com os XML.`);
    }
    const arquivos: Record<string, Uint8Array> = {};
    const xmlsParaPdf = new Map<string, Buffer>();
    await emLotes(docs, PARALELISMO, async (d) => {
      const b = await this.storage.getObjectBuffer(d.storage_key!);
      const partes = d.storage_key!.split('/');
      arquivos[`${d.tipo}/${partes[partes.length - 3]}-${partes[partes.length - 2]}/${nomeBase(d.storage_key!)}`] = new Uint8Array(b);
      if (opcoes.incluirPdf && geraPdf(d)) xmlsParaPdf.set(d.storage_key!, b);
    });
    if (opcoes.incluirPdf) {
      const falhas: string[] = [];
      for (const d of comPdf) {
        const tipo = tipoDePdf(d)!;
        const partes = d.storage_key!.split('/');
        try {
          const pdf = await tipo.gerar(xmlsParaPdf.get(d.storage_key!)!.toString('utf8').replace(/^\uFEFF/, ''), { cancelada: d.situacao === 'CANCELADA', denegada: d.situacao === 'DENEGADA' });
          arquivos[`PDF/${tipo.pasta}/${partes[partes.length - 3]}-${partes[partes.length - 2]}/${tipo.prefixo}-${d.chave}.pdf`] = new Uint8Array(pdf);
        } catch (e) {
          falhas.push(`${d.chave} (${tipo.nome}): ${(e as Error).message}`);
        }
      }
      if (falhas.length) arquivos['PDF/LEIAME-falhas.txt'] = new TextEncoder().encode(`Não foi possível gerar o PDF destes documentos (o XML deles está na pasta do tipo, fora de PDF):\n${falhas.join('\n')}\n`);
    }
    // Nível 1: o ZIP de milhares de notas é montado de uma vez só, em CPU síncrona; o nível alto custaria segundos de API parada.
    return Buffer.from(zipSync(arquivos, { level: 1 }));
  }

  // ── Importação ──────────────────────────────────────────────────────

  /** Entrega os XML completos ao importador de XML (que gera as operações). Sem ids, entrega todos os que ainda não foram enviados. */
  async enviarParaImportacao(empresaId: string, ids?: string[]) {
    const empresa = await this.empresa(empresaId);
    const grupo = empresa.grupo ? await this.prisma.grupo.findFirst({ where: { numero: empresa.grupo } }) : null;
    if (!grupo) throw new BadRequestException('A empresa não está ligada a um grupo; não é possível importar.');
    const where: Prisma.DocumentoXmlWhereInput = {
      empresa_id: empresaId, conteudo: 'COMPLETO', storage_key: { not: null }, AND: [IMPORTAVEL],
      ...(ids?.length ? { id: { in: ids } } : { lote_importacao_id: null }),
    };
    const docs = await this.prisma.documentoXml.findMany({ where, orderBy: [{ data_emissao: 'asc' }, { createdAt: 'asc' }], take: MAX_IMPORTACAO });
    if (!docs.length) {
      throw new BadRequestException(ids?.length
        ? 'Nenhum dos documentos escolhidos pode ir ao importador: ele lê só o XML completo de NF-e, NFC-e e CT-e (com os eventos). NFS-e e MDF-e ainda não são lidos por ele.'
        : 'Não há XML completo pendente de importação.');
    }

    const arquivos = await emLotes(docs, PARALELISMO, async (d) => ({
      nome: d.nome_original || nomeBase(d.storage_key!),
      file_url: await this.storage.getPresignedUrl(d.storage_key!),
      storage_key: d.storage_key!,
      tamanho: d.tamanho_bytes,
    }));
    const assinatura = createHash('sha1').update(docs.map((d) => `${d.id}:${d.sha256}`).join(',')).digest('hex').slice(0, 16);
    const resp = await this.importacao.receberLote({ grupo_id: grupo.id, idempotency_key: `repositorio:${empresaId}:${assinatura}`, arquivos });
    await this.prisma.documentoXml.updateMany({ where: { id: { in: docs.map((d) => d.id) } }, data: { lote_importacao_id: resp.lote_id, importado_em: new Date() } });
    return { lote_id: resp.lote_id, status: resp.status, arquivos: docs.length, grupo_id: grupo.id };
  }

  // ── Exclusão ────────────────────────────────────────────────────────

  async excluir(empresaId: string, ids: string[]) {
    await this.empresa(empresaId);
    if (!ids?.length) throw new BadRequestException('Nenhum documento selecionado.');
    const docs = await this.prisma.documentoXml.findMany({ where: { empresa_id: empresaId, id: { in: ids } }, select: { id: true, storage_key: true } });
    await emLotes(docs, PARALELISMO, async (d) => { if (d.storage_key) await this.storage.removeObject(d.storage_key).catch((e) => this.logger.warn(`Falha ao remover ${d.storage_key}: ${(e as Error).message}`)); });
    const r = await this.prisma.documentoXml.deleteMany({ where: { empresa_id: empresaId, id: { in: docs.map((d) => d.id) } } });
    return { excluidos: r.count };
  }
}
