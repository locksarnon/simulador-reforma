import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  normalizeCnpj,
  parsePercentage,
  originalValue,
  validateAccessKey,
  validateCnpj,
  sha256,
  VERSAO_REGRAS,
  check,
  STATUS,
  Check,
} from './shared/xml-utils';
import { parseXml, getFirst, getAll, getText, getTextDeep, getAttr, identificarTipoXml, MAX_ITENS } from './shared/xml-parser';
import { agruparPorCodigo, escolherVigente } from './shared/vigencia';

const MAX_ARQUIVOS = 5000;
const DOWNLOAD_BATCH = 50;
const ITEM_BULK_BATCH = 500;
const ARQ_BULK_BATCH = 500;
const CONFIRMAR_BULK_BATCH = 500;

type ArquivoInput = { nome: string; file_url: string; storage_key?: string; tamanho?: number };
type ProcessarLoteBody = { grupo_id: string; idempotency_key: string; arquivos: ArquivoInput[] };
type ConfirmarBody = { lote_id: string; perspectivas_ids: string[] };

/**
 * Porte de base44/functions/processarLoteXML/entry.ts e
 * base44/functions/confirmarImportacaoXML/entry.ts. `base44.asServiceRole
 * .entities.X.method()` → `this.prisma.x.method()` mecanicamente; a lógica
 * de parsing/validação/dedup é mantida como estava.
 */
@Injectable()
export class ImportacaoXmlService {
  private readonly logger = new Logger(ImportacaoXmlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ── processarLoteXML ────────────────────────────────────────────────

  async receberLote(body: ProcessarLoteBody) {
    const { grupo_id, idempotency_key, arquivos } = body || ({} as ProcessarLoteBody);

    if (!grupo_id || !idempotency_key || !Array.isArray(arquivos) || arquivos.length === 0) {
      throw new BadRequestException('Parâmetros inválidos: grupo_id, idempotency_key e arquivos são obrigatórios.');
    }
    if (arquivos.length > MAX_ARQUIVOS) {
      throw new BadRequestException(`Limite máximo de ${MAX_ARQUIVOS} arquivos por lote.`);
    }

    const grupo = await this.prisma.grupo.findUnique({ where: { id: grupo_id } }).catch(() => null);
    if (!grupo) throw new NotFoundException('Grupo não localizado.');

    // Idempotência
    const existentes = await this.prisma.importacaoXMLLote.findMany({ where: { grupo_id, idempotency_key } });
    if (existentes.length > 0) {
      return { lote_id: existentes[0].id, status: existentes[0].status };
    }

    const lote = await this.prisma.importacaoXMLLote.create({
      data: { grupo_id, idempotency_key, status: 'RECEBIDO', total_arquivos: arquivos.length, versao_regras: VERSAO_REGRAS },
    });

    const arquivosData = arquivos.map((a) => ({
      lote_id: lote.id,
      grupo_id,
      nome_original: a.nome,
      // storage_key é a chave do objeto no MinIO (pra re-assinar a URL depois,
      // no reprocessamento) — file_url é só a URL pré-assinada, que expira em
      // 24h. Se o cliente não mandar storage_key (uploads antigos), cai no
      // file_url mesmo — reprocessar um lote desses não vai funcionar depois
      // que a URL expirar, mas o processamento imediato funciona igual.
      storage_key: a.storage_key || a.file_url,
      tamanho_bytes: a.tamanho || 0,
      status_tecnico: 'PENDENTE' as const,
    }));
    const arquivosCriados: { id: string }[] = [];
    for (let i = 0; i < arquivosData.length; i += ARQ_BULK_BATCH) {
      const batch = arquivosData.slice(i, i + ARQ_BULK_BATCH);
      const created = await this.prisma.$transaction(batch.map((b) => this.prisma.importacaoXMLArquivo.create({ data: b })));
      arquivosCriados.push(...created);
    }
    const arquivosReg = arquivosCriados.map((reg, idx) => ({
      id: reg.id,
      lote_id: lote.id,
      grupo_id,
      nome: arquivos[idx].nome,
      file_url: arquivos[idx].file_url,
    }));

    // Processamento assíncrono (fire-and-forget — equivalente ao waitUntil do Base44).
    void this.processarLote(lote.id, grupo_id, arquivosReg).catch((err) => {
      this.logger.error(`Falha ao processar lote ${lote.id}: ${(err as Error)?.stack || err}`);
    });

    return { lote_id: lote.id, status: 'RECEBIDO' };
  }

  private async processarLote(
    loteId: string,
    grupoId: string,
    arquivosReg: { id: string; lote_id: string; grupo_id: string; nome: string; file_url: string }[],
  ) {
    try {
      await this.prisma.importacaoXMLLote.update({ where: { id: loteId }, data: { status: 'PROCESSANDO' } });

      const contadores = await this.processarArquivos(grupoId, arquivosReg);

      const statusFinal = this.calcularStatusLote(contadores);
      await this.prisma.importacaoXMLLote.update({
        where: { id: loteId },
        data: {
          status: statusFinal,
          arquivos_validos: contadores.arquivosValidos,
          arquivos_invalidos: contadores.arquivosInvalidos,
          total_itens: contadores.totalItens,
          itens_importaveis: contadores.itensImportaveis,
          itens_importaveis_com_alerta: contadores.itensAlerta,
          itens_bloqueados: contadores.itensBloqueados,
          itens_duplicados: contadores.itensDuplicados,
          itens_cancelados: contadores.itensCancelados,
          processado_em: new Date(),
        },
      });
    } catch (err) {
      await this.prisma.importacaoXMLLote
        .update({ where: { id: loteId }, data: { status: 'FALHOU', observacao: String((err as Error)?.message || err) } })
        .catch(() => {});
    }
  }

  // ── reprocessarLoteXML ──────────────────────────────────────────────
  // Retoma um lote FALHOU/PROCESSADO_COM_FALHAS sem reenviar arquivos: só
  // reprocessa o que ficou PENDENTE ou FALHOU tecnicamente (arquivos já
  // CONCLUIDOs não são tocados de novo, pra não duplicar itens/operações).
  // A URL de download original expira em 24h — aqui é sempre re-assinada a
  // partir da storage_key salva no MinIO antes de tentar de novo.

  async reprocessarLote(body: { lote_id: string }) {
    const loteId = body?.lote_id;
    if (!loteId) throw new BadRequestException('lote_id é obrigatório.');

    const lote = await this.prisma.importacaoXMLLote.findUnique({ where: { id: loteId } });
    if (!lote) throw new NotFoundException('Lote não localizado.');

    const pendentes = await this.prisma.importacaoXMLArquivo.findMany({
      where: { lote_id: loteId, status_tecnico: { in: ['PENDENTE', 'FALHOU'] } },
    });
    if (pendentes.length === 0) {
      return { lote_id: loteId, reprocessados: 0, status: lote.status, observacao: 'Nada pendente para reprocessar.' };
    }

    const arquivosReg = await Promise.all(
      pendentes.map(async (arq) => ({
        id: arq.id,
        lote_id: loteId,
        grupo_id: lote.grupo_id,
        nome: arq.nome_original,
        file_url: await this.storage.getPresignedUrl(arq.storage_key || ''),
      })),
    );

    await this.prisma.importacaoXMLLote.update({ where: { id: loteId }, data: { status: 'PROCESSANDO' } });
    const contadores = await this.processarArquivos(lote.grupo_id, arquivosReg);

    // Incrementa em cima do que já estava consolidado (arquivos que já
    // tinham CONCLUIDO em uma tentativa anterior não entram nesses deltas).
    const atualizado = await this.prisma.importacaoXMLLote.update({
      where: { id: loteId },
      data: {
        arquivos_validos: { increment: contadores.arquivosValidos },
        arquivos_invalidos: { increment: contadores.arquivosInvalidos },
        total_itens: { increment: contadores.totalItens },
        itens_importaveis: { increment: contadores.itensImportaveis },
        itens_importaveis_com_alerta: { increment: contadores.itensAlerta },
        itens_bloqueados: { increment: contadores.itensBloqueados },
        itens_duplicados: { increment: contadores.itensDuplicados },
        itens_cancelados: { increment: contadores.itensCancelados },
        processado_em: new Date(),
      },
    });

    const statusFinal = this.calcularStatusLote({
      arquivosValidos: atualizado.arquivos_validos,
      itensImportaveis: atualizado.itens_importaveis,
      itensAlerta: atualizado.itens_importaveis_com_alerta,
      itensBloqueados: atualizado.itens_bloqueados,
    });
    await this.prisma.importacaoXMLLote.update({ where: { id: loteId }, data: { status: statusFinal } });

    return { lote_id: loteId, reprocessados: pendentes.length, status: statusFinal };
  }

  private calcularStatusLote(c: {
    arquivosValidos: number;
    itensImportaveis: number;
    itensAlerta: number;
    itensBloqueados: number;
  }): 'PROCESSADO' | 'PROCESSADO_COM_FALHAS' | 'AGUARDANDO_CONFIRMACAO' {
    if (c.arquivosValidos === 0) return 'PROCESSADO_COM_FALHAS';
    if (c.itensImportaveis + c.itensAlerta > 0) return 'AGUARDANDO_CONFIRMACAO';
    if (c.itensBloqueados > 0 && c.itensImportaveis + c.itensAlerta === 0) return 'PROCESSADO_COM_FALHAS';
    return 'PROCESSADO';
  }

  /** Núcleo do processamento — baixa, valida e grava itens para uma lista de arquivos. Não toca no status do lote. */
  private async processarArquivos(
    grupoId: string,
    arquivosReg: { id: string; lote_id: string; grupo_id: string; nome: string; file_url: string }[],
  ) {
    {
      // Empresa.grupo guarda o código de negócio (Grupo.numero), não o id do
      // banco — enquanto grupoId aqui é sempre o Grupo.id (mesma convenção de
      // ImportacaoXMLLote.grupo_id/HistoricoXML.grupo_id). Sem essa tradução,
      // a busca de empresa por grupo nunca batia com nada e todo item de XML
      // caía em CAD_EMPRESA_NAO_LOCALIZADA mesmo com a empresa cadastrada.
      const grupoRecord = await this.prisma.grupo.findUnique({ where: { id: grupoId } });
      const empresas = grupoRecord
        ? await this.prisma.empresa.findMany({ where: { grupo: grupoRecord.numero } })
        : [];
      const empresasByCnpj = new Map<string, (typeof empresas)[number]>();
      for (const e of empresas) {
        if (e.cnpj_cpf) empresasByCnpj.set(normalizeCnpj(e.cnpj_cpf), e);
      }

      // Só regras com status "Ativo" contam como localizadas — uma classificação
      // revogada/desativada não deve validar uma operação como se ainda valesse.
      // Agrupadas por código (não Map 1:1) porque pode haver mais de uma versão
      // histórica do mesmo código — escolherVigente() decide qual vale na data
      // de emissão de cada documento, mais abaixo.
      const cstCatalogo = await this.prisma.cstIbsCbs.findMany({ where: { status: 'Ativo' } });
      const classTribCatalogo = await this.prisma.classTrib.findMany({ where: { status: 'Ativo' } });
      const credPresCatalogo = await this.prisma.credPres.findMany({ where: { status: 'Ativo' } });
      const cstGrouped = agruparPorCodigo(cstCatalogo, (c) => c.cst);
      const classTribGrouped = agruparPorCodigo(classTribCatalogo, (c) => c.c_class_trib);
      const credPresGrouped = agruparPorCodigo(credPresCatalogo, (c) => c.c_cred_pres);

      // NCM/CFOP: validação leniente — só bloqueia quando o catálogo já tem
      // pelo menos uma linha (senão quem ainda não cadastrou nada trava tudo).
      const ncmSet = new Set((await this.prisma.ncm.findMany({ where: { status: 'Ativo' } })).map((n) => n.codigo));
      const cfopSet = new Set((await this.prisma.cfop.findMany({ where: { status: 'Ativo' } })).map((c) => c.codigo));

      const historico = await this.prisma.historicoXML.findMany({ where: { grupo_id: grupoId } });
      const histKeys = new Set(historico.map((h) => `${h.chave_nfe}|${h.numero_item}|${h.perspectiva}`));

      const hashesVistos = new Map<string, string>();
      const chavesVistas = new Map<string, string>();

      let arquivosValidos = 0;
      let arquivosInvalidos = 0;
      let totalItens = 0;
      let itensImportaveis = 0;
      let itensAlerta = 0;
      let itensBloqueados = 0;
      let itensDuplicados = 0;
      let itensCancelados = 0;

      let allItems: Record<string, unknown>[] = [];
      let arqUpdates: Record<string, unknown>[] = [];

      for (let i = 0; i < arquivosReg.length; i += DOWNLOAD_BATCH) {
        const batch = arquivosReg.slice(i, i + DOWNLOAD_BATCH);

        const parsed = await Promise.all(
          batch.map(async (arq) => {
            try {
              const resp = await fetch(arq.file_url);
              if (!resp.ok) throw new Error(`Falha ao baixar arquivo: ${resp.status}`);
              const content = await resp.text();
              const hash = sha256(content);
              const doc = parseXml(content);
              const tipoXml = identificarTipoXml(doc);
              return { arq, content, hash, doc, tipoXml, error: null as Error | null };
            } catch (err) {
              return { arq, content: null, hash: null, doc: null, tipoXml: null, error: err as Error };
            }
          }),
        );

        for (const p of parsed) {
          const { arq, hash, doc, tipoXml, error } = p;

          if (error || !hash || !doc) {
            arqUpdates.push({
              id: arq.id,
              status_tecnico: 'FALHOU',
              situacao_fiscal: 'ERRO_PROCESSAMENTO',
              erro_processamento: String(error?.message || error),
              processado_em: new Date(),
            });
            arquivosInvalidos++;
            continue;
          }

          if (hashesVistos.has(hash)) {
            arqUpdates.push({
              id: arq.id,
              hash_sha256: hash,
              situacao_fiscal: 'DUPLICADO_HASH',
              status_tecnico: 'CONCLUIDO',
              motivo_duplicidade: 'DUPLICADO_HASH',
              processado_em: new Date(),
            });
            arquivosInvalidos++;
            continue;
          }
          hashesVistos.set(hash, arq.id);

          if (tipoXml === 'EVENTO_CANCELAMENTO' || tipoXml === 'EVENTO_CARTA_CORRECAO' || tipoXml === 'EVENTO_OUTRO') {
            const evData = this.prepararEvento(arq, doc, tipoXml, hash);
            arqUpdates.push(evData.update);
            if (tipoXml === 'EVENTO_CANCELAMENTO' && evData.chNFe) {
              const itens = await this.prisma.importacaoXMLItem.findMany({
                where: { grupo_id: arq.grupo_id, chave_nfe: evData.chNFe },
              });
              const cancelUpdates = itens.filter((it) => it.resultado_final !== 'CONFIRMADO').map((it) => ({ id: it.id }));
              for (let cu = 0; cu < cancelUpdates.length; cu += ARQ_BULK_BATCH) {
                const slice = cancelUpdates.slice(cu, cu + ARQ_BULK_BATCH);
                await this.prisma.$transaction(
                  slice.map((u) =>
                    this.prisma.importacaoXMLItem.update({ where: { id: u.id }, data: { resultado_final: 'CANCELADO' } }),
                  ),
                );
              }
              const estornoItems = itens.filter((it) => it.resultado_final === 'CONFIRMADO');
              for (const it of estornoItems) {
                await this.prisma.importacaoXMLItem
                  .update({ where: { id: it.id }, data: { resultado_final: 'ESTORNADO' } })
                  .catch(() => {});
                if (it.operacao_id) {
                  await this.prisma.operacao
                    .update({ where: { id: it.operacao_id }, data: { situacao: 'CANCELADA' } })
                    .catch(() => {});
                }
              }
            }
            arquivosValidos++;
            continue;
          }

          if (tipoXml === 'CTE' || tipoXml === 'MDFE' || tipoXml === 'NFSE') {
            // Reconhecido corretamente pela raiz, mas sem extração de
            // item/tributo — schema totalmente diferente da NF-e (ver
            // comentário do enum TipoXml). Marcado como IGNORADO, não
            // FALHOU/INVALIDO: o arquivo está correto, só não é suportado.
            arqUpdates.push({
              id: arq.id,
              hash_sha256: hash,
              tipo_xml: tipoXml,
              situacao_fiscal: 'IGNORADO',
              status_tecnico: 'CONCLUIDO',
              erro_processamento: `${tipoXml} reconhecido, mas extração de itens/tributos não é suportada nesta versão — nenhuma Operação foi gerada a partir deste arquivo.`,
              processado_em: new Date(),
            });
            arquivosValidos++;
            continue;
          }

          if (tipoXml === 'XML_DESCONHECIDO') {
            arqUpdates.push({
              id: arq.id,
              hash_sha256: hash,
              tipo_xml: tipoXml,
              situacao_fiscal: 'INVALIDO',
              status_tecnico: 'FALHOU',
              erro_processamento: 'Tipo de XML não reconhecido.',
              processado_em: new Date(),
            });
            arquivosInvalidos++;
            continue;
          }

          const result = this.prepararNfe(
            arq,
            doc,
            tipoXml,
            hash,
            grupoId,
            empresasByCnpj,
            cstGrouped,
            classTribGrouped,
            credPresGrouped,
            ncmSet,
            cfopSet,
            histKeys,
            chavesVistas,
          );

          arqUpdates.push(result.arquivoUpdate);
          if (result.items.length > 0) allItems.push(...result.items);

          if (result.sucesso) {
            arquivosValidos++;
            totalItens += result.itensCriados;
            itensImportaveis += result.contadores.importaveis;
            itensAlerta += result.contadores.alerta;
            itensBloqueados += result.contadores.bloqueados;
            itensDuplicados += result.contadores.duplicados;
            itensCancelados += result.contadores.cancelados;
          } else {
            arquivosInvalidos++;
          }
        }

        if (arqUpdates.length >= ARQ_BULK_BATCH) {
          await this.flushArquivoUpdates(arqUpdates);
          arqUpdates = [];
        }

        while (allItems.length >= ITEM_BULK_BATCH) {
          const toCreate = allItems.splice(0, ITEM_BULK_BATCH);
          await this.prisma.$transaction(toCreate.map((row) => this.prisma.importacaoXMLItem.create({ data: row as any })));
        }
      }

      if (arqUpdates.length > 0) await this.flushArquivoUpdates(arqUpdates);
      if (allItems.length > 0) {
        await this.prisma.$transaction(allItems.map((row) => this.prisma.importacaoXMLItem.create({ data: row as any })));
      }

      return {
        arquivosValidos, arquivosInvalidos, totalItens,
        itensImportaveis, itensAlerta, itensBloqueados, itensDuplicados, itensCancelados,
      };
    }
  }

  private async flushArquivoUpdates(updates: Record<string, unknown>[]) {
    await this.prisma.$transaction(
      updates.map((u) => {
        const { id, ...rest } = u;
        return this.prisma.importacaoXMLArquivo.update({ where: { id: id as string }, data: rest as any });
      }),
    );
  }

  private prepararEvento(arq: { id: string }, doc: any, tipoXml: string, hash: string) {
    const infEvento = getFirst(doc.documentElement, 'infEvento');
    const chNFe = getText(infEvento, 'chNFe');
    const xMotivo = getText(infEvento, 'xMotivo');
    const cStat = getText(infEvento, 'cStat');
    let situacao = 'EVENTO_PROCESSADO';
    if (cStat !== '135' && cStat !== '136') situacao = 'EVENTO_PENDENTE';

    const update = {
      id: arq.id,
      hash_sha256: hash,
      tipo_xml: tipoXml,
      situacao_fiscal: situacao,
      status_tecnico: 'CONCLUIDO',
      chave_nfe: chNFe,
      cstat: cStat,
      xmotivo: xMotivo,
      processado_em: new Date(),
    };
    return { update, chNFe };
  }

  private prepararNfe(
    arq: { id: string; lote_id: string },
    doc: any,
    tipoXml: string,
    hash: string,
    grupoId: string,
    empresasByCnpj: Map<string, any>,
    cstGrouped: Map<string, any[]>,
    classTribGrouped: Map<string, any[]>,
    credPresGrouped: Map<string, any[]>,
    ncmSet: Set<string>,
    cfopSet: Set<string>,
    histKeys: Set<string>,
    chavesVistas: Map<string, string>,
  ) {
    const resultado: {
      sucesso: boolean;
      arquivoUpdate: Record<string, unknown>;
      items: Record<string, unknown>[];
      itensCriados: number;
      contadores: { importaveis: number; alerta: number; bloqueados: number; duplicados: number; cancelados: number };
    } = {
      sucesso: true,
      arquivoUpdate: {},
      items: [],
      itensCriados: 0,
      contadores: { importaveis: 0, alerta: 0, bloqueados: 0, duplicados: 0, cancelados: 0 },
    };

    const nfe = getFirst(doc.documentElement, 'NFe') || (tipoXml === 'NFE' ? doc.documentElement : null);
    if (!nfe) {
      resultado.arquivoUpdate = {
        id: arq.id,
        hash_sha256: hash,
        tipo_xml: tipoXml,
        situacao_fiscal: 'INVALIDO',
        status_tecnico: 'FALHOU',
        erro_processamento: 'Elemento NFe não localizado.',
        processado_em: new Date(),
      };
      resultado.sucesso = false;
      return resultado;
    }

    const infNFe = getFirst(nfe, 'infNFe');
    const ide = getFirst(infNFe, 'ide');
    const emit = getFirst(infNFe, 'emit');
    const dest = getFirst(infNFe, 'dest');

    const chave = getAttr(infNFe, 'Id') || '';
    const chaveNfe = chave.replace(/^NFe/i, '');
    const cnpjEmit = getText(emit, 'CNPJ') || getText(emit, 'CPF');
    const cnpjDest = getText(dest, 'CNPJ') || getText(dest, 'CPF');
    const modelo = getText(ide, 'mod');
    const serie = getText(ide, 'serie');
    const numero = getText(ide, 'nNF');
    const dataEmi = getText(ide, 'dhEmi') || getText(ide, 'dEmi');
    const ambiente = getText(ide, 'tpAmb');
    const finalidade = getText(ide, 'finNFe');
    // Documentos referenciados (ide > NFref > refNFe) — presentes em
    // devolução (finNFe=4), nota complementar (finNFe=2) e ajuste (finNFe=3).
    // Só guarda a lista para rastreabilidade; não altera o cálculo da
    // operação (a direção Entrada/Saída já é resolvida por perspectiva
    // EMITENTE/DESTINATARIO, então o sinal do crédito/débito já sai certo).
    const nfRefs = getAll(ide, 'NFref').map((nf) => getText(nf, 'refNFe')).filter(Boolean);

    const protNFe = getFirst(doc.documentElement, 'protNFe') || getFirst(nfe, 'protNFe');
    const infProt = getFirst(protNFe, 'infProt');
    const cStat = getText(infProt, 'cStat');
    const xMotivo = getText(infProt, 'xMotivo');

    if (chavesVistas.has(chaveNfe)) {
      resultado.arquivoUpdate = {
        id: arq.id,
        hash_sha256: hash,
        tipo_xml: tipoXml,
        situacao_fiscal: 'DUPLICADO_CHAVE',
        status_tecnico: 'CONCLUIDO',
        chave_nfe: chaveNfe,
        numero_nf: numero,
        serie,
        data_emissao: dataEmi ? new Date(dataEmi) : null,
        cstat: cStat,
        xmotivo: xMotivo,
        ambiente,
        motivo_duplicidade: 'DUPLICADO_CHAVE',
        processado_em: new Date(),
      };
      resultado.contadores.duplicados++;
      return resultado;
    }
    chavesVistas.set(chaveNfe, arq.id);

    let situacaoFiscal = 'SEM_PROTOCOLO';
    if (cStat === '100') situacaoFiscal = 'AUTORIZADO';
    else if (cStat === '150') situacaoFiscal = 'AUTORIZADO_FORA_PRAZO';
    else if (cStat === '101' || cStat === '151' || cStat === '155') situacaoFiscal = 'CANCELADO';
    else if (ambiente === '2') situacaoFiscal = 'HOMOLOGACAO';
    else if (cStat) situacaoFiscal = 'INVALIDO';

    const dets = getAll(infNFe, 'det');

    resultado.arquivoUpdate = {
      id: arq.id,
      hash_sha256: hash,
      tipo_xml: tipoXml,
      situacao_fiscal: situacaoFiscal,
      status_tecnico: 'CONCLUIDO',
      // Limpa erro de uma tentativa anterior (reprocessamento) — sem isso a
      // mensagem de falha antiga ficava visível mesmo depois do sucesso.
      erro_processamento: null,
      chave_nfe: chaveNfe,
      numero_nf: numero,
      serie,
      data_emissao: dataEmi ? new Date(dataEmi) : null,
      cstat: cStat,
      xmotivo: xMotivo,
      ambiente,
      qtd_itens: dets.length,
      processado_em: new Date(),
    };

    if (situacaoFiscal === 'CANCELADO') {
      resultado.contadores.cancelados = dets.length;
      return resultado;
    }
    if (situacaoFiscal !== 'AUTORIZADO' && situacaoFiscal !== 'AUTORIZADO_FORA_PRAZO') {
      return resultado;
    }
    if (dets.length > MAX_ITENS) {
      return resultado;
    }

    const cnpjEmitNorm = normalizeCnpj(cnpjEmit);
    const cnpjDestNorm = normalizeCnpj(cnpjDest);
    const empEmit = empresasByCnpj.get(cnpjEmitNorm);
    const empDest = empresasByCnpj.get(cnpjDestNorm);

    let perspectivas: { empresa: any; perspectiva: string; direcao: string; tipo_rel: string }[] = [];
    let statusMapeamento = 'OK';
    if (cnpjEmitNorm && cnpjDestNorm && cnpjEmitNorm === cnpjDestNorm) {
      statusMapeamento = 'REVISAO_MESMO_CNPJ';
    } else if (!empEmit && !empDest) {
      statusMapeamento = 'CNPJ_NAO_LOCALIZADO';
      perspectivas = [{ empresa: null, perspectiva: 'PENDENTE', direcao: 'Entrada', tipo_rel: 'TERCEIRO' }];
    } else if (empEmit && empDest && empEmit.id !== empDest.id) {
      perspectivas = [
        { empresa: empEmit, perspectiva: 'EMITENTE', direcao: 'Saida', tipo_rel: 'INTERCOMPANY' },
        { empresa: empDest, perspectiva: 'DESTINATARIO', direcao: 'Entrada', tipo_rel: 'INTERCOMPANY' },
      ];
    } else if (empEmit && empDest && empEmit.id === empDest.id) {
      perspectivas = [
        { empresa: empEmit, perspectiva: 'EMITENTE', direcao: 'Saida', tipo_rel: 'TRANSFERENCIA_INTERNA' },
        { empresa: empDest, perspectiva: 'DESTINATARIO', direcao: 'Entrada', tipo_rel: 'TRANSFERENCIA_INTERNA' },
      ];
    } else if (empEmit) {
      perspectivas = [{ empresa: empEmit, perspectiva: 'EMITENTE', direcao: 'Saida', tipo_rel: 'TERCEIRO' }];
    } else if (empDest) {
      perspectivas = [{ empresa: empDest, perspectiva: 'DESTINATARIO', direcao: 'Entrada', tipo_rel: 'TERCEIRO' }];
    }

    const chaveValida = validateAccessKey(chaveNfe, { cnpjEmitente: cnpjEmit, modelo, serie, numero });

    for (let idx = 0; idx < dets.length; idx++) {
      const det = dets[idx];
      const nItem = parseInt(getAttr(det, 'nItem') || String(idx + 1), 10);
      const prod = getFirst(det, 'prod');
      const imposto = getFirst(det, 'imposto');

      const descricao = getText(prod, 'xProd');
      const ncm = getText(prod, 'NCM');
      const nbs = getText(prod, 'NBS');
      const cfop = getText(prod, 'CFOP');
      const ufEmit = getText(getFirst(emit, 'enderEmit'), 'UF');
      const ufDest = getText(getFirst(dest, 'enderDest'), 'UF');
      const munDest = getText(getFirst(dest, 'enderDest'), 'cMun');
      const qtd = Number(getText(prod, 'qCom') || '0');
      const vUnCom = Number(getText(prod, 'vUnCom') || '0');
      const vDesc = Number(getText(prod, 'vDesc') || '0');
      const vFrete = Number(getText(prod, 'vFrete') || '0');
      const vSeg = Number(getText(prod, 'vSeg') || '0');
      const vOutro = Number(getText(prod, 'vOutro') || '0');
      const valorBruto = Number(getText(prod, 'vProd') || '0');

      const pisPct = getTextDeep(getFirst(imposto, 'PIS'), 'pPIS');
      const cofinsPct = getTextDeep(getFirst(imposto, 'COFINS'), 'pCOFINS');
      const icmsGrupo = getFirst(imposto, 'ICMS');
      const icmsPct = icmsGrupo ? getTextDeep(icmsGrupo, 'pICMS') : '';
      const fcpPct = icmsGrupo ? getTextDeep(icmsGrupo, 'pFCP') : '';
      const ipiPct = getTextDeep(getFirst(imposto, 'IPI'), 'pIPI');
      const issPct = getTextDeep(getFirst(imposto, 'ISSQN'), 'vAliq');

      const ibscbs = getFirst(imposto, 'IBSCBS');
      const cstIbs = getTextDeep(ibscbs, 'CST');
      const cClassTrib = getTextDeep(ibscbs, 'cClassTrib');
      const cCredPres = getTextDeep(ibscbs, 'cCredPres');
      const grupoRtc = getTextDeep(ibscbs, 'gRTC');
      const cpIbsPct = getTextDeep(ibscbs, 'pCredPresIBS');
      const cpCbsPct = getTextDeep(ibscbs, 'pCredPresCBS');

      for (const p of perspectivas) {
        const dados: Record<string, unknown> = {
          lote_id: arq.lote_id,
          arquivo_id: arq.id,
          grupo_id: grupoId,
          chave_nfe: chaveNfe,
          numero_item: nItem,
          empresa_id: p.empresa ? p.empresa.id : null,
          perspectiva: p.perspectiva,
          direcao: p.direcao,
          tipo_relacionamento: p.tipo_rel,
          status_mapeamento: statusMapeamento,
          descricao,
          ncm,
          nbs,
          cfop_servico: cfop,
          uf_origem: ufEmit,
          uf_destino: ufDest,
          municipio_destino: munDest,
          quantidade: qtd,
          preco_unitario: vUnCom,
          desconto_incondicional: vDesc,
          frete: vFrete,
          seguro: vSeg,
          outras_despesas: vOutro,
          valor_bruto: valorBruto,
          cst_original: originalValue(cstIbs),
          cst_normalizado: cstIbs || null,
          c_class_trib_original: originalValue(cClassTrib),
          c_class_trib_normalizado: cClassTrib || null,
          c_cred_pres_original: originalValue(cCredPres),
          c_cred_pres_normalizado: cCredPres || null,
          pis_pct_original: originalValue(pisPct),
          pis_pct_normalizado: parsePercentage(pisPct),
          cofins_pct_original: originalValue(cofinsPct),
          cofins_pct_normalizado: parsePercentage(cofinsPct),
          icms_pct_original: originalValue(icmsPct),
          icms_pct_normalizado: parsePercentage(icmsPct),
          fcp_pct_original: originalValue(fcpPct),
          fcp_pct_normalizado: parsePercentage(fcpPct),
          ipi_pct_original: originalValue(ipiPct),
          ipi_pct_normalizado: parsePercentage(ipiPct),
          iss_pct_original: originalValue(issPct),
          iss_pct_normalizado: parsePercentage(issPct),
          credito_presumido_ibs_pct_original: originalValue(cpIbsPct),
          credito_presumido_ibs_pct_normalizado: parsePercentage(cpIbsPct),
          credito_presumido_cbs_pct_original: originalValue(cpCbsPct),
          credito_presumido_cbs_pct_normalizado: parsePercentage(cpCbsPct),
          grupo_rtc: grupoRtc || null,
          finalidade_dfe: finalidade || null,
          documentos_referenciados_json: nfRefs.length > 0 ? JSON.stringify(nfRefs) : null,
          crt_emitente: null,
          ambiente,
          data_emissao: dataEmi ? new Date(dataEmi) : null,
        };

        const ctx = {
          cstGrouped, classTribGrouped, credPresGrouped, ncmSet, cfopSet,
          dataEmiDate: dataEmi ? new Date(dataEmi) : new Date(),
          histKeys, cStat, ambiente, situacaoFiscal, chaveValida,
          cnpjEmit, cnpjDest,
        };

        const itemPreparado = this.prepararItem(dados, ctx);
        resultado.items.push(itemPreparado.data);
        resultado.itensCriados++;

        const rf = itemPreparado.resultado;
        if (rf === 'IMPORTAVEL') resultado.contadores.importaveis++;
        else if (rf === 'IMPORTAVEL_COM_ALERTA') resultado.contadores.alerta++;
        else if (rf === 'BLOQUEADO') resultado.contadores.bloqueados++;
        else if (rf === 'DUPLICADO') resultado.contadores.duplicados++;
        else if (rf === 'CANCELADO') resultado.contadores.cancelados++;
      }
    }

    return resultado;
  }

  private prepararItem(
    dados: Record<string, unknown>,
    ctx: {
      cstGrouped: Map<string, any[]>;
      classTribGrouped: Map<string, any[]>;
      credPresGrouped: Map<string, any[]>;
      ncmSet: Set<string>;
      cfopSet: Set<string>;
      dataEmiDate: Date;
      histKeys: Set<string>;
      cStat: string;
      ambiente: string;
      situacaoFiscal: string;
      chaveValida: ReturnType<typeof validateAccessKey>;
      cnpjEmit: string;
      cnpjDest: string;
    },
  ) {
    const docChecks = this.validarDocumental(dados, ctx);
    const cadChecks = this.validarCadastral(dados, ctx);
    const tribChecks = this.validarTributaria(dados, ctx);
    const operChecks = this.validarOperacional(dados, ctx);

    const snapshot = {
      versao_regras: VERSAO_REGRAS,
      versao_catalogo_cst: 'v1',
      versao_catalogo_class_trib: 'v1',
      versao_catalogo_cred_pres: 'v1',
      validado_em: new Date().toISOString(),
    };

    let resultadoFinal = 'IMPORTAVEL';
    const isCancelado = ctx.situacaoFiscal === 'CANCELADO';
    const histKey = `${dados.chave_nfe}|${dados.numero_item}|${dados.perspectiva}`;
    const isDuplicado = ctx.histKeys.has(histKey);

    if (isCancelado) resultadoFinal = 'CANCELADO';
    else if (isDuplicado) resultadoFinal = 'DUPLICADO';
    else {
      const allChecks = [...docChecks, ...cadChecks, ...tribChecks, ...operChecks];
      const hasBloqueante = allChecks.some((c) => c.bloqueante && c.status === STATUS.NAO_CONFORME);
      const hasAlerta = allChecks.some((c) => c.status === STATUS.ALERTA || c.status === STATUS.PENDENTE);
      if (hasBloqueante) resultadoFinal = 'BLOQUEADO';
      else if (hasAlerta) resultadoFinal = 'IMPORTAVEL_COM_ALERTA';
    }

    if (dados.status_mapeamento === 'CNPJ_NAO_LOCALIZADO' || dados.status_mapeamento === 'REVISAO_MESMO_CNPJ') {
      resultadoFinal = 'BLOQUEADO';
    }

    const data = {
      ...dados,
      resultado_final: resultadoFinal,
      validacao_documental_json: JSON.stringify(docChecks),
      validacao_cadastral_json: JSON.stringify(cadChecks),
      validacao_tributaria_json: JSON.stringify(tribChecks),
      validacao_operacional_json: JSON.stringify(operChecks),
      snapshot_versoes_json: JSON.stringify(snapshot),
    };

    return { data, resultado: resultadoFinal };
  }

  private validarDocumental(
    dados: Record<string, unknown>,
    ctx: { cStat: string; ambiente: string; situacaoFiscal: string; chaveValida: ReturnType<typeof validateAccessKey>; cnpjEmit: string; cnpjDest: string },
  ): Check[] {
    const checks: Check[] = [];
    checks.push(check('DOC_XML_BEM_FORMADO', STATUS.CONFORME, 'XML bem-formado e parseado com sucesso.'));
    checks.push(check('DOC_TIPO_RECONHECIDO', STATUS.CONFORME, 'Tipo de documento reconhecido (NF-e/NFC-e).'));
    if (!ctx.chaveValida.valido) {
      checks.push(check(ctx.chaveValida.codigo || 'DOC_CHAVE_INVALIDA', STATUS.NAO_CONFORME, ctx.chaveValida.mensagem, true, 'chave_nfe'));
    } else {
      checks.push(check('DOC_CHAVE_FORMATO_INVALIDO', STATUS.CONFORME, 'Chave de acesso válida (formato e DV).'));
    }
    // Dígito verificador do CNPJ — não confirma que a empresa existe, só que
    // o número é matematicamente válido. Pego cedo: um CNPJ com DV errado
    // indica XML corrompido, digitado à mão ou adulterado, e bloqueia antes
    // de tentar casar com o cadastro de empresas (evita "TERCEIRO" fantasma).
    const emitCheck = validateCnpj(ctx.cnpjEmit);
    if (!emitCheck.valido) {
      checks.push(check(emitCheck.codigo || 'DOC_CNPJ_EMITENTE_INVALIDO', STATUS.NAO_CONFORME, `Emitente: ${emitCheck.mensagem}`, true, 'cnpj_emitente'));
    } else {
      checks.push(check('DOC_CNPJ_EMITENTE_VALIDO', STATUS.CONFORME, 'CNPJ do emitente válido (dígito verificador confere).'));
    }
    if (ctx.cnpjDest) {
      const destCheck = validateCnpj(ctx.cnpjDest);
      if (!destCheck.valido) {
        checks.push(check(destCheck.codigo || 'DOC_CNPJ_DESTINATARIO_INVALIDO', STATUS.NAO_CONFORME, `Destinatário: ${destCheck.mensagem}`, true, 'cnpj_destinatario'));
      } else {
        checks.push(check('DOC_CNPJ_DESTINATARIO_VALIDO', STATUS.CONFORME, 'CNPJ do destinatário válido (dígito verificador confere).'));
      }
    }
    if (!ctx.cStat) {
      checks.push(check('DOC_PROTOCOLO_AUSENTE', STATUS.NAO_CONFORME, 'Protocolo de autorização ausente.', true, 'protNFe'));
    } else if (ctx.cStat !== '100' && ctx.cStat !== '150') {
      checks.push(check('DOC_CSTAT_INVALIDO', STATUS.NAO_CONFORME, `cStat ${ctx.cStat} não indica autorização.`, true, 'cStat'));
    }
    if (ctx.ambiente === '2') {
      checks.push(check('DOC_AMBIENTE_HOMOLOGACAO', STATUS.ALERTA, 'Documento emitido em ambiente de homologação.', false, 'tpAmb'));
    }
    if (ctx.situacaoFiscal === 'CANCELADO') {
      checks.push(check('DOC_DOCUMENTO_CANCELADO', STATUS.NAO_CONFORME, 'Documento cancelado.', true, 'situacao_fiscal'));
    }
    if (!dados.data_emissao) {
      checks.push(check('DOC_DATA_EMISSAO_INVALIDA', STATUS.NAO_CONFORME, 'Data de emissão ausente ou inválida.', true, 'dhEmi'));
    }
    return checks;
  }

  private validarCadastral(dados: Record<string, unknown>, ctx: { ncmSet: Set<string>; cfopSet: Set<string> }): Check[] {
    const checks: Check[] = [];
    if (!dados.empresa_id) {
      checks.push(check('CAD_EMPRESA_NAO_LOCALIZADA', STATUS.NAO_CONFORME, 'Nenhum CNPJ (emitente/destinatário) localizado no grupo.', true, 'empresa_id'));
    }
    if (dados.status_mapeamento === 'CNPJ_NAO_LOCALIZADO') {
      checks.push(check('CAD_EMPRESA_NAO_LOCALIZADA', STATUS.NAO_CONFORME, 'CNPJ não localizado no cadastro de empresas do grupo.', true, 'empresa_id'));
    }
    if (dados.status_mapeamento === 'REVISAO_MESMO_CNPJ') {
      checks.push(check('CAD_PERSPECTIVA_INDEFINIDA', STATUS.NAO_CONFORME, 'Emitente e destinatário com mesmo CNPJ — revisão manual necessária.', true, 'perspectiva'));
    }
    if (!dados.ncm && !dados.nbs) {
      checks.push(check('CAD_NCM_AUSENTE', STATUS.ALERTA, 'NCM e NBS ausentes — verifique se aplicável.', false, 'ncm'));
    } else if (dados.ncm && ctx.ncmSet.size > 0 && !ctx.ncmSet.has(dados.ncm as string)) {
      // Só valida contra o catálogo se ele já tiver alguma linha cadastrada
      // — senão bloquearia todo mundo que ainda não populou a base de NCM.
      checks.push(check('CAD_NCM_NAO_LOCALIZADO', STATUS.ALERTA, `NCM ${dados.ncm} não localizado no catálogo cadastrado.`, false, 'ncm'));
    }
    if (!dados.cfop_servico) {
      checks.push(check('CAD_CFOP_AUSENTE', STATUS.ALERTA, 'CFOP ausente.', false, 'cfop_servico'));
    } else if (ctx.cfopSet.size > 0 && !ctx.cfopSet.has(dados.cfop_servico as string)) {
      checks.push(check('CAD_CFOP_NAO_LOCALIZADO', STATUS.ALERTA, `CFOP ${dados.cfop_servico} não localizado no catálogo cadastrado.`, false, 'cfop_servico'));
    }
    if (!dados.uf_origem) {
      checks.push(check('CAD_UF_ORIGEM_AUSENTE', STATUS.ALERTA, 'UF de origem ausente.', false, 'uf_origem'));
    }
    if (!dados.uf_destino) {
      checks.push(check('CAD_UF_DESTINO_AUSENTE', STATUS.ALERTA, 'UF de destino ausente.', false, 'uf_destino'));
    }
    if (!dados.descricao) {
      checks.push(check('CAD_DESCRICAO_AUSENTE', STATUS.ALERTA, 'Descrição do item ausente.', false, 'descricao'));
    }
    if (!dados.valor_bruto || (dados.valor_bruto as number) <= 0) {
      checks.push(check('CAD_VALOR_BRUTO_INVALIDO', STATUS.NAO_CONFORME, 'Valor bruto inválido ou zero.', true, 'valor_bruto'));
    }
    return checks;
  }

  private validarTributaria(
    dados: Record<string, unknown>,
    ctx: {
      cstGrouped: Map<string, any[]>;
      classTribGrouped: Map<string, any[]>;
      credPresGrouped: Map<string, any[]>;
      dataEmiDate: Date;
    },
  ): Check[] {
    const checks: Check[] = [];
    const dataFmt = ctx.dataEmiDate.toLocaleDateString('pt-BR');

    if (dados.cst_normalizado) {
      const candidatos = ctx.cstGrouped.get(dados.cst_normalizado as string) || [];
      if (candidatos.length === 0) {
        checks.push(check('TRIB_CST_NAO_LOCALIZADO', STATUS.NAO_CONFORME, `CST ${dados.cst_normalizado} não localizado no catálogo.`, true, 'cst_ibs_cbs'));
      } else if (!escolherVigente(candidatos, ctx.dataEmiDate)) {
        checks.push(check('TRIB_CST_FORA_DE_VIGENCIA', STATUS.NAO_CONFORME, `CST ${dados.cst_normalizado} existe no catálogo, mas nenhuma versão estava vigente em ${dataFmt}.`, true, 'cst_ibs_cbs'));
      }
    }

    if (dados.c_class_trib_normalizado) {
      const candidatos = ctx.classTribGrouped.get(dados.c_class_trib_normalizado as string) || [];
      if (candidatos.length === 0) {
        checks.push(check('TRIB_CLASS_TRIB_NAO_LOCALIZADO', STATUS.NAO_CONFORME, `cClassTrib ${dados.c_class_trib_normalizado} não localizado no catálogo.`, true, 'c_class_trib'));
      } else if (!escolherVigente(candidatos, ctx.dataEmiDate)) {
        checks.push(check('TRIB_CLASS_TRIB_FORA_DE_VIGENCIA', STATUS.NAO_CONFORME, `cClassTrib ${dados.c_class_trib_normalizado} existe no catálogo, mas nenhuma versão estava vigente em ${dataFmt}.`, true, 'c_class_trib'));
      }
    }

    if (dados.c_cred_pres_normalizado) {
      const candidatos = ctx.credPresGrouped.get(dados.c_cred_pres_normalizado as string) || [];
      if (candidatos.length === 0) {
        checks.push(check('TRIB_CRED_PRES_AUSENTE', STATUS.ALERTA, `cCredPres ${dados.c_cred_pres_normalizado} não localizado no catálogo.`, false, 'c_cred_pres'));
      } else if (!escolherVigente(candidatos, ctx.dataEmiDate)) {
        checks.push(check('TRIB_CRED_PRES_FORA_DE_VIGENCIA', STATUS.ALERTA, `cCredPres ${dados.c_cred_pres_normalizado} existe no catálogo, mas nenhuma versão estava vigente em ${dataFmt}.`, false, 'c_cred_pres'));
      }
    }

    if (!dados.grupo_rtc && dados.c_class_trib_normalizado) {
      checks.push(check('TRIB_GRUPO_RTC_DIVERGENTE', STATUS.NAO_APLICAVEL, 'Grupo RTC não informado — verifique exigência do cClassTrib.', false, 'grupo_rtc'));
    }
    return checks;
  }

  private validarOperacional(dados: Record<string, unknown>, ctx: { histKeys: Set<string> }): Check[] {
    const checks: Check[] = [];
    const histKey = `${dados.chave_nfe}|${dados.numero_item}|${dados.perspectiva}`;
    if (ctx.histKeys.has(histKey)) {
      checks.push(check('OPER_PERSPECTIVA_DUPLICADA', STATUS.NAO_CONFORME, 'Perspectiva já importada anteriormente.', true, 'perspectiva'));
    }
    if ((dados.quantidade as number) < 0) {
      checks.push(check('OPER_VALOR_NEGATIVO_BLOQUEANTE', STATUS.NAO_CONFORME, 'Quantidade negativa não permitida.', true, 'quantidade'));
    }

    // finNFe: 2=Complementar, 3=Ajuste, 4=Devolução/Retorno. A direção
    // (Entrada/Saída) já sai certa pela perspectiva EMITENTE/DESTINATARIO —
    // isso não recalcula nada, só avisa pra revisão humana antes de
    // confirmar, e mostra a que documento original o XML se refere quando
    // a nota trouxer NFref.
    const finalidade = dados.finalidade_dfe as string | null;
    if (finalidade === '4') {
      const refs = dados.documentos_referenciados_json ? JSON.parse(dados.documentos_referenciados_json as string) : [];
      checks.push(check(
        'OPER_DEVOLUCAO_REVISAR',
        STATUS.ALERTA,
        refs.length > 0
          ? `Documento de devolução/retorno (finNFe=4), referencia ${refs.length} NF-e original(is) — confira o vínculo antes de confirmar.`
          : 'Documento de devolução/retorno (finNFe=4) sem NF-e de referência informada — confira manualmente.',
        false,
        'finalidade_dfe',
        refs,
      ));
    } else if (finalidade === '2' || finalidade === '3') {
      checks.push(check(
        'OPER_COMPLEMENTAR_AJUSTE_REVISAR',
        STATUS.ALERTA,
        `Documento ${finalidade === '2' ? 'complementar' : 'de ajuste'} (finNFe=${finalidade}) — verifique se os valores já não estão contemplados na NF-e original antes de confirmar, para não contar em dobro.`,
        false,
        'finalidade_dfe',
      ));
    }

    return checks;
  }

  // ── confirmarImportacaoXML ──────────────────────────────────────────

  async confirmarImportacao(body: ConfirmarBody) {
    const { lote_id, perspectivas_ids } = body || ({} as ConfirmarBody);
    if (!lote_id || !Array.isArray(perspectivas_ids) || perspectivas_ids.length === 0) {
      throw new BadRequestException('lote_id e perspectivas_ids são obrigatórios.');
    }

    const lote = await this.prisma.importacaoXMLLote.findUnique({ where: { id: lote_id } });
    if (!lote) throw new NotFoundException('Lote não localizado.');

    const allItems = await this.prisma.importacaoXMLItem.findMany({ where: { lote_id } });
    const idsSet = new Set(perspectivas_ids);

    const itemsToProcess = allItems.filter(
      (i) => idsSet.has(i.id) && (i.resultado_final === 'IMPORTAVEL' || i.resultado_final === 'IMPORTAVEL_COM_ALERTA'),
    );

    if (itemsToProcess.length === 0) {
      return { lote_id, confirmados: 0, erros: 0, resultados: [], status: 'CONCLUIDO' };
    }

    const empresaIds = [...new Set(itemsToProcess.map((i) => i.empresa_id).filter(Boolean) as string[])];
    const empresas = await Promise.all(
      empresaIds.map((id) => this.prisma.empresa.findUnique({ where: { id } }).catch(() => null)),
    );
    const empresasMap = new Map(empresas.filter(Boolean).map((e) => [e!.id, e!]));

    const historico = await this.prisma.historicoXML.findMany({ where: { grupo_id: lote.grupo_id } });
    const histKeys = new Set(historico.map((h) => `${h.chave_nfe}|${h.numero_item}|${h.perspectiva}`));

    const operacoesToCreate: Record<string, unknown>[] = [];
    const itemLinks: { itemId: string; item: (typeof itemsToProcess)[number] }[] = [];
    const resultados: { id: string; sucesso: boolean; erro?: string; operacao_id?: string }[] = [];
    let confirmados = 0;
    let erros = 0;

    for (const item of itemsToProcess) {
      const histKey = `${item.chave_nfe}|${item.numero_item}|${item.perspectiva}`;
      if (histKeys.has(histKey)) {
        resultados.push({ id: item.id, sucesso: false, erro: 'Perspectiva já importada (duplicidade).' });
        erros++;
        continue;
      }

      const empresa = item.empresa_id ? empresasMap.get(item.empresa_id) : null;
      if (!empresa || empresa.status === 'Inativa') {
        resultados.push({ id: item.id, sucesso: false, erro: 'Empresa inativa ou não localizada.' });
        erros++;
        continue;
      }

      histKeys.add(histKey);

      const idOp = `IMP-${item.chave_nfe.substring(25, 34)}-${item.numero_item}-${(item.perspectiva || '').substring(0, 3)}`;
      operacoesToCreate.push({
        id_operacao: idOp,
        empresa_id: empresa.id_empresa,
        data: item.data_emissao || new Date(),
        ano: (item.data_emissao ? new Date(item.data_emissao) : new Date()).getFullYear(),
        direcao: item.direcao,
        tipo: item.nbs ? 'Servico' : 'Mercadoria',
        descricao: item.descricao || `Importado de NF-e ${item.chave_nfe.substring(25, 34)}`,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        desconto_incondicional: item.desconto_incondicional,
        frete: item.frete,
        seguro: item.seguro,
        outras_despesas: item.outras_despesas,
        valor_bruto: item.valor_bruto,
        ncm: item.ncm,
        nbs: item.nbs,
        cfop_servico: item.cfop_servico,
        uf_origem: item.uf_origem,
        uf_destino: item.uf_destino,
        municipio_destino: item.municipio_destino,
        documento: 'NF-e',
        regime_atual: empresa.regime_atual,
        c_class_trib: item.c_class_trib_normalizado,
        cst_ibs_cbs: item.cst_normalizado,
        pis_pct: item.pis_pct_normalizado || 0,
        cofins_pct: item.cofins_pct_normalizado || 0,
        icms_pct: item.icms_pct_normalizado || 0,
        fcp_pct: item.fcp_pct_normalizado || 0,
        ipi_pct: item.ipi_pct_normalizado || 0,
        iss_pct: item.iss_pct_normalizado || 0,
        c_cred_pres: item.c_cred_pres_normalizado,
        credito_presumido_ibs_pct: item.credito_presumido_ibs_pct_normalizado || 0,
        credito_presumido_cbs_pct: item.credito_presumido_cbs_pct_normalizado || 0,
        grupo_rtc: item.grupo_rtc,
        finalidade_dfe: item.finalidade_dfe,
        crt_emitente: item.crt_emitente,
        ambiente: item.ambiente,
        observacao_dfe: `Importado via lote ${lote_id} (perspectiva ${item.perspectiva}, ${item.tipo_relacionamento}).`,
      });
      itemLinks.push({ itemId: item.id, item });
    }

    const historicoData: Record<string, unknown>[] = [];
    const itemUpdates: { id: string; resultado_final: string; confirmado_em: Date; operacao_id: string }[] = [];

    for (let i = 0; i < operacoesToCreate.length; i += CONFIRMAR_BULK_BATCH) {
      const batchOps = operacoesToCreate.slice(i, i + CONFIRMAR_BULK_BATCH);
      const batchLinks = itemLinks.slice(i, i + CONFIRMAR_BULK_BATCH);
      try {
        const created = await this.prisma.$transaction(batchOps.map((op) => this.prisma.operacao.create({ data: op as any })));
        for (let j = 0; j < created.length; j++) {
          const { itemId, item } = batchLinks[j];
          const opId = created[j].id;
          historicoData.push({
            grupo_id: item.grupo_id,
            empresa_id: item.empresa_id,
            chave_nfe: item.chave_nfe,
            numero_item: item.numero_item,
            perspectiva: item.perspectiva,
            operacao_id: opId,
            lote_id,
            importado_em: new Date(),
          });
          itemUpdates.push({ id: itemId, resultado_final: 'CONFIRMADO', confirmado_em: new Date(), operacao_id: opId });
          confirmados++;
          resultados.push({ id: itemId, sucesso: true, operacao_id: opId });
        }
      } catch {
        for (let j = 0; j < batchOps.length; j++) {
          const { itemId, item } = batchLinks[j];
          try {
            const created = await this.prisma.operacao.create({ data: batchOps[j] as any });
            historicoData.push({
              grupo_id: item.grupo_id,
              empresa_id: item.empresa_id,
              chave_nfe: item.chave_nfe,
              numero_item: item.numero_item,
              perspectiva: item.perspectiva,
              operacao_id: created.id,
              lote_id,
              importado_em: new Date(),
            });
            itemUpdates.push({ id: itemId, resultado_final: 'CONFIRMADO', confirmado_em: new Date(), operacao_id: created.id });
            confirmados++;
            resultados.push({ id: itemId, sucesso: true, operacao_id: created.id });
          } catch (err2) {
            const msg = String((err2 as Error)?.message || err2);
            if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
              resultados.push({ id: itemId, sucesso: false, erro: 'Item já importado (duplicidade).' });
            } else {
              resultados.push({ id: itemId, sucesso: false, erro: msg });
            }
            erros++;
          }
        }
      }
    }

    for (let i = 0; i < historicoData.length; i += CONFIRMAR_BULK_BATCH) {
      const slice = historicoData.slice(i, i + CONFIRMAR_BULK_BATCH);
      try {
        await this.prisma.$transaction(slice.map((h) => this.prisma.historicoXML.create({ data: h as any })));
      } catch {
        for (const h of slice) {
          await this.prisma.historicoXML.create({ data: h as any }).catch(() => {});
        }
      }
    }

    for (let i = 0; i < itemUpdates.length; i += CONFIRMAR_BULK_BATCH) {
      const slice = itemUpdates.slice(i, i + CONFIRMAR_BULK_BATCH);
      try {
        await this.prisma.$transaction(
          slice.map((u) =>
            this.prisma.importacaoXMLItem.update({
              where: { id: u.id },
              data: { resultado_final: u.resultado_final as any, confirmado_em: u.confirmado_em, operacao_id: u.operacao_id },
            }),
          ),
        );
      } catch {
        for (const u of slice) {
          await this.prisma.importacaoXMLItem
            .update({
              where: { id: u.id },
              data: { resultado_final: u.resultado_final as any, confirmado_em: u.confirmado_em, operacao_id: u.operacao_id },
            })
            .catch(() => {});
        }
      }
    }

    await this.prisma.importacaoXMLLote.update({
      where: { id: lote_id },
      data: { itens_confirmados: (lote.itens_confirmados || 0) + confirmados },
    });

    return { lote_id, confirmados, erros, resultados, status: erros === 0 ? 'CONCLUIDO' : 'CONCLUIDO_COM_ERROS' };
  }
}
