import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { waitUntil } from "base44:runtime";
import {
  normalizeCnpj, parsePercentage, originalValue, validateAccessKey,
  sha256, VERSAO_REGRAS, check, STATUS, UF_CODIGOS,
} from "../../shared/xmlUtils.js";
import {
  parseXml, getFirst, getAll, getText, getTextDeep, getAttr, identificarTipoXml, MAX_ITENS,
} from "../../shared/xmlParser.js";

const MAX_ARQUIVOS = 5000;
const DOWNLOAD_BATCH = 50;
const ITEM_BULK_BATCH = 500;
const ARQ_BULK_BATCH = 500;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { grupo_id, idempotency_key, arquivos } = body;

    if (!grupo_id || !idempotency_key || !Array.isArray(arquivos) || arquivos.length === 0) {
      return Response.json({ error: "Parâmetros inválidos: grupo_id, idempotency_key e arquivos são obrigatórios." }, { status: 400 });
    }
    if (arquivos.length > MAX_ARQUIVOS) {
      return Response.json({ error: `Limite máximo de ${MAX_ARQUIVOS} arquivos por lote.` }, { status: 400 });
    }

    const grupo = await base44.asServiceRole.entities.Grupo.get(grupo_id).catch(() => null);
    if (!grupo) return Response.json({ error: "Grupo não localizado." }, { status: 404 });

    // Idempotência
    const existentes = await base44.asServiceRole.entities.ImportacaoXMLLote.filter({
      grupo_id, idempotency_key,
    });
    if (existentes && existentes.length > 0) {
      return Response.json({ lote_id: existentes[0].id, status: existentes[0].status });
    }

    // Cria o lote.
    const lote = await base44.asServiceRole.entities.ImportacaoXMLLote.create({
      grupo_id, idempotency_key, status: "RECEBIDO",
      total_arquivos: arquivos.length, versao_regras: VERSAO_REGRAS,
    });

    // Bulk create arquivo records.
    const arquivosData = arquivos.map((a) => ({
      lote_id: lote.id, grupo_id,
      nome_original: a.nome, storage_key: a.file_url,
      tamanho_bytes: a.tamanho || 0, status_tecnico: "PENDENTE",
    }));
    const arquivosCriados = [];
    for (let i = 0; i < arquivosData.length; i += ARQ_BULK_BATCH) {
      const batch = arquivosData.slice(i, i + ARQ_BULK_BATCH);
      const created = await base44.asServiceRole.entities.ImportacaoXMLArquivo.bulkCreate(batch);
      arquivosCriados.push(...created);
    }
    const arquivosReg = arquivosCriados.map((reg, idx) => ({
      id: reg.id, lote_id: lote.id, grupo_id,
      nome: arquivos[idx].nome, file_url: arquivos[idx].file_url,
    }));

    // Processamento assíncrono
    waitUntil(processarLote(base44, lote.id, grupo_id, arquivosReg));

    return Response.json({ lote_id: lote.id, status: "RECEBIDO" });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function processarLote(base44, loteId, grupoId, arquivosReg) {
  try {
    await base44.asServiceRole.entities.ImportacaoXMLLote.update(loteId, { status: "PROCESSANDO" });

    // Empresas do grupo
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ grupo: grupoId });
    const empresasByCnpj = new Map();
    for (const e of empresas) {
      if (e.cnpj_cpf) empresasByCnpj.set(normalizeCnpj(e.cnpj_cpf), e);
    }

    // Catálogos
    const cstCatalogo = await base44.asServiceRole.entities.CstIbsCbs.filter({});
    const classTribCatalogo = await base44.asServiceRole.entities.ClassTrib.filter({});
    const credPresCatalogo = await base44.asServiceRole.entities.CredPres.filter({});
    const cstSet = new Set(cstCatalogo.map((c) => c.cst));
    const classTribMap = new Map(classTribCatalogo.map((c) => [c.c_class_trib, c]));
    const credPresSet = new Set(credPresCatalogo.map((c) => c.c_cred_pres));

    // Histórico de perspectivas
    const historico = await base44.asServiceRole.entities.HistoricoXML.filter({ grupo_id: grupoId });
    const histKeys = new Set(historico.map((h) => `${h.chave_nfe}|${h.numero_item}|${h.perspectiva}`));

    const hashesVistos = new Map();
    const chavesVistas = new Map();

    let arquivosValidos = 0, arquivosInvalidos = 0;
    let totalItens = 0, itensImportaveis = 0, itensAlerta = 0, itensBloqueados = 0, itensDuplicados = 0, itensCancelados = 0;

    let allItems = [];
    let arqUpdates = [];

    for (let i = 0; i < arquivosReg.length; i += DOWNLOAD_BATCH) {
      const batch = arquivosReg.slice(i, i + DOWNLOAD_BATCH);

      // Fase 1: download + hash + parse em paralelo
      const parsed = await Promise.all(batch.map(async (arq) => {
        try {
          const resp = await fetch(arq.file_url);
          if (!resp.ok) throw new Error(`Falha ao baixar arquivo: ${resp.status}`);
          const content = await resp.text();
          const hash = await sha256(new TextEncoder().encode(content));
          const doc = parseXml(content);
          const tipoXml = identificarTipoXml(doc);
          return { arq, content, hash, doc, tipoXml, error: null };
        } catch (err) {
          return { arq, content: null, hash: null, doc: null, tipoXml: null, error: err };
        }
      }));

      // Fase 2: processamento sequencial (dedup + validação) — coleta items e updates
      for (const p of parsed) {
        const { arq, content, hash, doc, tipoXml, error } = p;

        if (error) {
          arqUpdates.push({
            id: arq.id, status_tecnico: "FALHOU", situacao_fiscal: "ERRO_PROCESSAMENTO",
            erro_processamento: String(error.message || error),
            processado_em: new Date().toISOString(),
          });
          arquivosInvalidos++;
          continue;
        }

        // Dedup por hash
        if (hashesVistos.has(hash)) {
          arqUpdates.push({
            id: arq.id, hash_sha256: hash, situacao_fiscal: "DUPLICADO_HASH",
            status_tecnico: "CONCLUIDO", motivo_duplicidade: "DUPLICADO_HASH",
            processado_em: new Date().toISOString(),
          });
          arquivosInvalidos++;
          continue;
        }
        hashesVistos.set(hash, arq.id);

        // Eventos
        if (tipoXml === "EVENTO_CANCELAMENTO" || tipoXml === "EVENTO_CARTA_CORRECAO" || tipoXml === "EVENTO_OUTRO") {
          const evData = prepararEvento(arq, doc, tipoXml, hash);
          arqUpdates.push(evData.update);
          if (tipoXml === "EVENTO_CANCELAMENTO" && evData.chNFe) {
            const itens = await base44.asServiceRole.entities.ImportacaoXMLItem.filter({
              grupo_id: arq.grupo_id, chave_nfe: evData.chNFe,
            });
            // Itens não confirmados → CANCELADO (ainda não geraram operação)
            const cancelUpdates = itens
              .filter((it) => it.resultado_final !== "CONFIRMADO")
              .map((it) => ({ id: it.id, resultado_final: "CANCELADO" }));
            for (let cu = 0; cu < cancelUpdates.length; cu += ARQ_BULK_BATCH) {
              await base44.asServiceRole.entities.ImportacaoXMLItem.bulkUpdate(cancelUpdates.slice(cu, cu + ARQ_BULK_BATCH));
            }
            // Itens confirmados → ESTORNADO + marcar operação como CANCELADA
            const estornoItems = itens.filter((it) => it.resultado_final === "CONFIRMADO");
            for (const it of estornoItems) {
              await base44.asServiceRole.entities.ImportacaoXMLItem.update(it.id, { resultado_final: "ESTORNADO" }).catch(() => {});
              if (it.operacao_id) {
                await base44.asServiceRole.entities.Operacao.update(it.operacao_id, { situacao: "CANCELADA" }).catch(() => {});
              }
            }
          }
          arquivosValidos++;
          continue;
        }

        if (tipoXml === "XML_DESCONHECIDO") {
          arqUpdates.push({
            id: arq.id, hash_sha256: hash, tipo_xml: tipoXml, situacao_fiscal: "INVALIDO",
            status_tecnico: "FALHOU", erro_processamento: "Tipo de XML não reconhecido.",
            processado_em: new Date().toISOString(),
          });
          arquivosInvalidos++;
          continue;
        }

        // NFE_PROC ou NFE
        const result = prepararNfe(arq, doc, tipoXml, hash, grupoId, empresasByCnpj,
          cstSet, classTribMap, credPresSet, histKeys, chavesVistas);

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

      // Flush batch de arquivo updates
      if (arqUpdates.length >= ARQ_BULK_BATCH) {
        await base44.asServiceRole.entities.ImportacaoXMLArquivo.bulkUpdate(arqUpdates);
        arqUpdates = [];
      }

      // Flush batch de items
      while (allItems.length >= ITEM_BULK_BATCH) {
        const toCreate = allItems.splice(0, ITEM_BULK_BATCH);
        await base44.asServiceRole.entities.ImportacaoXMLItem.bulkCreate(toCreate);
      }
    }

    // Flush remainder
    if (arqUpdates.length > 0) {
      await base44.asServiceRole.entities.ImportacaoXMLArquivo.bulkUpdate(arqUpdates);
    }
    if (allItems.length > 0) {
      await base44.asServiceRole.entities.ImportacaoXMLItem.bulkCreate(allItems);
    }

    // Status final
    let statusFinal = "PROCESSADO";
    if (arquivosValidos === 0) statusFinal = "PROCESSADO_COM_FALHAS";
    else if (itensImportaveis + itensAlerta > 0) statusFinal = "AGUARDANDO_CONFIRMACAO";
    else if (itensBloqueados > 0 && itensImportaveis + itensAlerta === 0) statusFinal = "PROCESSADO_COM_FALHAS";

    await base44.asServiceRole.entities.ImportacaoXMLLote.update(loteId, {
      status: statusFinal, arquivos_validos: arquivosValidos, arquivos_invalidos: arquivosInvalidos,
      total_itens: totalItens, itens_importaveis: itensImportaveis,
      itens_importaveis_com_alerta: itensAlerta, itens_bloqueados: itensBloqueados,
      itens_duplicados: itensDuplicados, itens_cancelados: itensCancelados,
      processado_em: new Date().toISOString(),
    });
  } catch (err) {
    await base44.asServiceRole.entities.ImportacaoXMLLote.update(loteId, {
      status: "FALHOU", observacao: String(err.message || err),
    }).catch(() => {});
  }
}

function prepararEvento(arq, doc, tipoXml, hash) {
  const infEvento = getFirst(doc.documentElement, "infEvento");
  const chNFe = getText(infEvento, "chNFe");
  const tpEvento = getText(infEvento, "tpEvento");
  const xMotivo = getText(infEvento, "xMotivo");
  const cStat = getText(infEvento, "cStat");
  let situacao = "EVENTO_PROCESSADO";
  if (cStat !== "135" && cStat !== "136") situacao = "EVENTO_PENDENTE";

  const update = {
    id: arq.id, hash_sha256: hash, tipo_xml: tipoXml, situacao_fiscal: situacao,
    status_tecnico: "CONCLUIDO", chave_nfe: chNFe, cstat: cStat, xmotivo: xMotivo,
    processado_em: new Date().toISOString(),
  };
  return { update, chNFe };
}

function prepararNfe(arq, doc, tipoXml, hash, grupoId, empresasByCnpj,
  cstSet, classTribMap, credPresSet, histKeys, chavesVistas) {
  const resultado = { sucesso: true, arquivoUpdate: null, items: [], itensCriados: 0, contadores: { importaveis: 0, alerta: 0, bloqueados: 0, duplicados: 0, cancelados: 0 } };

  const nfe = getFirst(doc.documentElement, "NFe") || (tipoXml === "NFE" ? doc.documentElement : null);
  if (!nfe) {
    resultado.arquivoUpdate = {
      id: arq.id, hash_sha256: hash, tipo_xml: tipoXml, situacao_fiscal: "INVALIDO",
      status_tecnico: "FALHOU", erro_processamento: "Elemento NFe não localizado.",
      processado_em: new Date().toISOString(),
    };
    resultado.sucesso = false;
    return resultado;
  }

  const infNFe = getFirst(nfe, "infNFe");
  const ide = getFirst(infNFe, "ide");
  const emit = getFirst(infNFe, "emit");
  const dest = getFirst(infNFe, "dest");

  const chave = getAttr(infNFe, "Id") || "";
  const chaveNfe = chave.replace(/^NFe/i, "");
  const cnpjEmit = getText(emit, "CNPJ") || getText(emit, "CPF");
  const cnpjDest = getText(dest, "CNPJ") || getText(dest, "CPF");
  const modelo = getText(ide, "mod");
  const serie = getText(ide, "serie");
  const numero = getText(ide, "nNF");
  const dataEmi = getText(ide, "dhEmi") || getText(ide, "dEmi");
  const ambiente = getText(ide, "tpAmb");
  const finalidade = getText(ide, "finNFe");

  const protNFe = getFirst(doc.documentElement, "protNFe") || getFirst(nfe, "protNFe");
  const infProt = getFirst(protNFe, "infProt");
  const cStat = getText(infProt, "cStat");
  const xMotivo = getText(infProt, "xMotivo");

  // Dedup por chave
  if (chavesVistas.has(chaveNfe)) {
    resultado.arquivoUpdate = {
      id: arq.id, hash_sha256: hash, tipo_xml: tipoXml, situacao_fiscal: "DUPLICADO_CHAVE",
      status_tecnico: "CONCLUIDO", chave_nfe: chaveNfe, numero_nf: numero, serie,
      data_emissao: dataEmi ? new Date(dataEmi).toISOString() : null,
      cstat: cStat, xmotivo: xMotivo, ambiente, motivo_duplicidade: "DUPLICADO_CHAVE",
      processado_em: new Date().toISOString(),
    };
    resultado.contadores.duplicados++;
    return resultado;
  }
  chavesVistas.set(chaveNfe, arq.id);

  let situacaoFiscal = "SEM_PROTOCOLO";
  if (cStat === "100") situacaoFiscal = "AUTORIZADO";
  else if (cStat === "150") situacaoFiscal = "AUTORIZADO_FORA_PRAZO";
  else if (cStat === "101" || cStat === "151" || cStat === "155") situacaoFiscal = "CANCELADO";
  else if (ambiente === "2") situacaoFiscal = "HOMOLOGACAO";
  else if (cStat) situacaoFiscal = "INVALIDO";

  const dets = getAll(infNFe, "det");

  resultado.arquivoUpdate = {
    id: arq.id, hash_sha256: hash, tipo_xml: tipoXml, situacao_fiscal: situacaoFiscal,
    status_tecnico: "CONCLUIDO", chave_nfe: chaveNfe, numero_nf: numero, serie,
    data_emissao: dataEmi ? new Date(dataEmi).toISOString() : null,
    cstat: cStat, xmotivo: xMotivo, ambiente, qtd_itens: dets.length,
    processado_em: new Date().toISOString(),
  };

  if (situacaoFiscal === "CANCELADO") {
    resultado.contadores.cancelados = dets.length;
    return resultado;
  }
  if (situacaoFiscal !== "AUTORIZADO" && situacaoFiscal !== "AUTORIZADO_FORA_PRAZO") {
    return resultado;
  }
  if (dets.length > MAX_ITENS) {
    return resultado;
  }

  // Cruzamento de empresas
  const cnpjEmitNorm = normalizeCnpj(cnpjEmit);
  const cnpjDestNorm = normalizeCnpj(cnpjDest);
  const empEmit = empresasByCnpj.get(cnpjEmitNorm);
  const empDest = empresasByCnpj.get(cnpjDestNorm);

  let perspectivas = [];
  let statusMapeamento = "OK";
  if (cnpjEmitNorm && cnpjDestNorm && cnpjEmitNorm === cnpjDestNorm) {
    statusMapeamento = "REVISAO_MESMO_CNPJ";
  } else if (!empEmit && !empDest) {
    statusMapeamento = "CNPJ_NAO_LOCALIZADO";
    // Mesmo sem empresa localizada, cria item BLOQUEADO para auditoria
    perspectivas = [{ empresa: null, perspectiva: "PENDENTE", direcao: "Entrada", tipo_rel: "TERCEIRO" }];
  } else if (empEmit && empDest && empEmit.id !== empDest.id) {
    perspectivas = [
      { empresa: empEmit, perspectiva: "EMITENTE", direcao: "Saida", tipo_rel: "INTERCOMPANY" },
      { empresa: empDest, perspectiva: "DESTINATARIO", direcao: "Entrada", tipo_rel: "INTERCOMPANY" },
    ];
  } else if (empEmit && empDest && empEmit.id === empDest.id) {
    perspectivas = [
      { empresa: empEmit, perspectiva: "EMITENTE", direcao: "Saida", tipo_rel: "TRANSFERENCIA_INTERNA" },
      { empresa: empDest, perspectiva: "DESTINATARIO", direcao: "Entrada", tipo_rel: "TRANSFERENCIA_INTERNA" },
    ];
  } else if (empEmit) {
    perspectivas = [{ empresa: empEmit, perspectiva: "EMITENTE", direcao: "Saida", tipo_rel: "TERCEIRO" }];
  } else if (empDest) {
    perspectivas = [{ empresa: empDest, perspectiva: "DESTINATARIO", direcao: "Entrada", tipo_rel: "TERCEIRO" }];
  }

  const chaveValida = validateAccessKey(chaveNfe, { cnpjEmitente: cnpjEmit, modelo, serie, numero });

  for (let idx = 0; idx < dets.length; idx++) {
    const det = dets[idx];
    const nItem = parseInt(getAttr(det, "nItem") || String(idx + 1), 10);
    const prod = getFirst(det, "prod");
    const imposto = getFirst(det, "imposto");

    const descricao = getText(prod, "xProd");
    const ncm = getText(prod, "NCM");
    const nbs = getText(prod, "NBS");
    const cfop = getText(prod, "CFOP");
    const ufEmit = getText(getFirst(emit, "enderEmit"), "UF");
    const ufDest = getText(getFirst(dest, "enderDest"), "UF");
    const munDest = getText(getFirst(dest, "enderDest"), "cMun");
    const qtd = Number(getText(prod, "qCom") || "0");
    const vUnCom = Number(getText(prod, "vUnCom") || "0");
    const vDesc = Number(getText(prod, "vDesc") || "0");
    const vFrete = Number(getText(prod, "vFrete") || "0");
    const vSeg = Number(getText(prod, "vSeg") || "0");
    const vOutro = Number(getText(prod, "vOutro") || "0");
    const valorBruto = Number(getText(prod, "vProd") || "0");

    // Busca recursiva — alíquotas podem estar em subgrupos (PISAliq, ICMS00, etc.)
    const pisPct = getTextDeep(getFirst(imposto, "PIS"), "pPIS");
    const cofinsPct = getTextDeep(getFirst(imposto, "COFINS"), "pCOFINS");
    const icmsGrupo = getFirst(imposto, "ICMS");
    const icmsPct = icmsGrupo ? getTextDeep(icmsGrupo, "pICMS") : "";
    const fcpPct = icmsGrupo ? getTextDeep(icmsGrupo, "pFCP") : "";
    const ipiPct = getTextDeep(getFirst(imposto, "IPI"), "pIPI");
    const issPct = getTextDeep(getFirst(imposto, "ISSQN"), "vAliq");

    const ibscbs = getFirst(imposto, "IBSCBS");
    const cstIbs = getTextDeep(ibscbs, "CST");
    const cClassTrib = getTextDeep(ibscbs, "cClassTrib");
    const cCredPres = getTextDeep(ibscbs, "cCredPres");
    const grupoRtc = getTextDeep(ibscbs, "gRTC");
    const cpIbsPct = getTextDeep(ibscbs, "pCredPresIBS");
    const cpCbsPct = getTextDeep(ibscbs, "pCredPresCBS");

    for (const p of perspectivas) {
      const dados = {
        lote_id: arq.lote_id, arquivo_id: arq.id, grupo_id: grupoId,
        chave_nfe: chaveNfe, numero_item: nItem,
        empresa_id: p.empresa ? p.empresa.id : null, perspectiva: p.perspectiva, direcao: p.direcao,
        tipo_relacionamento: p.tipo_rel, status_mapeamento: statusMapeamento,
        descricao, ncm, nbs, cfop_servico: cfop, uf_origem: ufEmit, uf_destino: ufDest,
        municipio_destino: munDest, quantidade: qtd, preco_unitario: vUnCom,
        desconto_incondicional: vDesc, frete: vFrete, seguro: vSeg, outras_despesas: vOutro,
        valor_bruto: valorBruto,
        cst_original: originalValue(cstIbs), cst_normalizado: cstIbs,
        c_class_trib_original: originalValue(cClassTrib), c_class_trib_normalizado: cClassTrib,
        c_cred_pres_original: originalValue(cCredPres), c_cred_pres_normalizado: cCredPres,
        pis_pct_original: originalValue(pisPct), pis_pct_normalizado: parsePercentage(pisPct),
        cofins_pct_original: originalValue(cofinsPct), cofins_pct_normalizado: parsePercentage(cofinsPct),
        icms_pct_original: originalValue(icmsPct), icms_pct_normalizado: parsePercentage(icmsPct),
        fcp_pct_original: originalValue(fcpPct), fcp_pct_normalizado: parsePercentage(fcpPct),
        ipi_pct_original: originalValue(ipiPct), ipi_pct_normalizado: parsePercentage(ipiPct),
        iss_pct_original: originalValue(issPct), iss_pct_normalizado: parsePercentage(issPct),
        credito_presumido_ibs_pct_original: originalValue(cpIbsPct), credito_presumido_ibs_pct_normalizado: parsePercentage(cpIbsPct),
        credito_presumido_cbs_pct_original: originalValue(cpCbsPct), credito_presumido_cbs_pct_normalizado: parsePercentage(cpCbsPct),
        grupo_rtc: grupoRtc, finalidade_dfe: finalidade, ambiente, data_emissao: dataEmi ? new Date(dataEmi).toISOString() : null,
      };

      const ctx = {
        cstSet, classTribMap, credPresSet, histKeys, cStat, ambiente, situacaoFiscal,
        chaveValida,
      };

      const itemPreparado = prepararItem(dados, ctx);
      resultado.items.push(itemPreparado.data);
      resultado.itensCriados++;

      const rf = itemPreparado.resultado;
      if (rf === "IMPORTAVEL") resultado.contadores.importaveis++;
      else if (rf === "IMPORTAVEL_COM_ALERTA") resultado.contadores.alerta++;
      else if (rf === "BLOQUEADO") resultado.contadores.bloqueados++;
      else if (rf === "DUPLICADO") resultado.contadores.duplicados++;
      else if (rf === "CANCELADO") resultado.contadores.cancelados++;
    }
  }

  return resultado;
}

function prepararItem(dados, ctx) {
  const docChecks = validarDocumental(dados, ctx);
  const cadChecks = validarCadastral(dados, ctx);
  const tribChecks = validarTributaria(dados, ctx);
  const operChecks = validarOperacional(dados, ctx);

  const snapshot = {
    versao_regras: VERSAO_REGRAS,
    versao_catalogo_cst: "v1",
    versao_catalogo_class_trib: "v1",
    versao_catalogo_cred_pres: "v1",
    validado_em: new Date().toISOString(),
  };

  let resultadoFinal = "IMPORTAVEL";
  const isCancelado = ctx.situacaoFiscal === "CANCELADO";
  const histKey = `${dados.chave_nfe}|${dados.numero_item}|${dados.perspectiva}`;
  const isDuplicado = ctx.histKeys.has(histKey);

  if (isCancelado) resultadoFinal = "CANCELADO";
  else if (isDuplicado) resultadoFinal = "DUPLICADO";
  else {
    const allChecks = [...docChecks, ...cadChecks, ...tribChecks, ...operChecks];
    const hasBloqueante = allChecks.some((c) => c.bloqueante && c.status === STATUS.NAO_CONFORME);
    const hasAlerta = allChecks.some((c) => c.status === STATUS.ALERTA || c.status === STATUS.PENDENTE);
    if (hasBloqueante) resultadoFinal = "BLOQUEADO";
    else if (hasAlerta) resultadoFinal = "IMPORTAVEL_COM_ALERTA";
  }

  if (dados.status_mapeamento === "CNPJ_NAO_LOCALIZADO" || dados.status_mapeamento === "REVISAO_MESMO_CNPJ") {
    resultadoFinal = "BLOQUEADO";
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

function validarDocumental(dados, ctx) {
  const checks = [];
  checks.push(check("DOC_XML_BEM_FORMADO", STATUS.CONFORME, "XML bem-formado e parseado com sucesso."));
  checks.push(check("DOC_TIPO_RECONHECIDO", STATUS.CONFORME, "Tipo de documento reconhecido (NF-e/NFC-e)."));
  if (!ctx.chaveValida.valido) {
    checks.push(check(ctx.chaveValida.codigo, STATUS.NAO_CONFORME, ctx.chaveValida.mensagem, true, "chave_nfe"));
  } else {
    checks.push(check("DOC_CHAVE_FORMATO_INVALIDO", STATUS.CONFORME, "Chave de acesso válida (formato e DV)."));
  }
  if (!ctx.cStat) {
    checks.push(check("DOC_PROTOCOLO_AUSENTE", STATUS.NAO_CONFORME, "Protocolo de autorização ausente.", true, "protNFe"));
  } else if (ctx.cStat !== "100" && ctx.cStat !== "150") {
    checks.push(check("DOC_CSTAT_INVALIDO", STATUS.NAO_CONFORME, `cStat ${ctx.cStat} não indica autorização.`, true, "cStat"));
  }
  if (ctx.ambiente === "2") {
    checks.push(check("DOC_AMBIENTE_HOMOLOGACAO", STATUS.ALERTA, "Documento emitido em ambiente de homologação.", false, "tpAmb"));
  }
  if (ctx.situacaoFiscal === "CANCELADO") {
    checks.push(check("DOC_DOCUMENTO_CANCELADO", STATUS.NAO_CONFORME, "Documento cancelado.", true, "situacao_fiscal"));
  }
  if (!dados.data_emissao) {
    checks.push(check("DOC_DATA_EMISSAO_INVALIDA", STATUS.NAO_CONFORME, "Data de emissão ausente ou inválida.", true, "dhEmi"));
  }
  return checks;
}

function validarCadastral(dados, ctx) {
  const checks = [];
  if (!dados.empresa_id) {
    checks.push(check("CAD_EMPRESA_NAO_LOCALIZADA", STATUS.NAO_CONFORME, "Nenhum CNPJ (emitente/destinatário) localizado no grupo.", true, "empresa_id"));
  }
  if (dados.status_mapeamento === "CNPJ_NAO_LOCALIZADO") {
    checks.push(check("CAD_EMPRESA_NAO_LOCALIZADA", STATUS.NAO_CONFORME, "CNPJ não localizado no cadastro de empresas do grupo.", true, "empresa_id"));
  }
  if (dados.status_mapeamento === "REVISAO_MESMO_CNPJ") {
    checks.push(check("CAD_PERSPECTIVA_INDEFINIDA", STATUS.NAO_CONFORME, "Emitente e destinatário com mesmo CNPJ — revisão manual necessária.", true, "perspectiva"));
  }
  if (!dados.ncm && !dados.nbs) {
    checks.push(check("CAD_NCM_AUSENTE", STATUS.ALERTA, "NCM e NBS ausentes — verifique se aplicável.", false, "ncm"));
  }
  if (!dados.cfop_servico) {
    checks.push(check("CAD_CFOP_AUSENTE", STATUS.ALERTA, "CFOP ausente.", false, "cfop_servico"));
  }
  if (!dados.uf_origem) {
    checks.push(check("CAD_UF_ORIGEM_AUSENTE", STATUS.ALERTA, "UF de origem ausente.", false, "uf_origem"));
  }
  if (!dados.uf_destino) {
    checks.push(check("CAD_UF_DESTINO_AUSENTE", STATUS.ALERTA, "UF de destino ausente.", false, "uf_destino"));
  }
  if (!dados.descricao) {
    checks.push(check("CAD_DESCRICAO_AUSENTE", STATUS.ALERTA, "Descrição do item ausente.", false, "descricao"));
  }
  if (!dados.valor_bruto || dados.valor_bruto <= 0) {
    checks.push(check("CAD_VALOR_BRUTO_INVALIDO", STATUS.NAO_CONFORME, "Valor bruto inválido ou zero.", true, "valor_bruto"));
  }
  return checks;
}

function validarTributaria(dados, ctx) {
  const checks = [];
  if (dados.cst_normalizado && !ctx.cstSet.has(dados.cst_normalizado)) {
    checks.push(check("TRIB_CST_NAO_LOCALIZADO", STATUS.NAO_CONFORME, `CST ${dados.cst_normalizado} não localizado no catálogo.`, true, "cst_ibs_cbs"));
  }
  if (dados.c_class_trib_normalizado && !ctx.classTribMap.has(dados.c_class_trib_normalizado)) {
    checks.push(check("TRIB_CLASS_TRIB_NAO_LOCALIZADO", STATUS.NAO_CONFORME, `cClassTrib ${dados.c_class_trib_normalizado} não localizado no catálogo.`, true, "c_class_trib"));
  }
  if (dados.c_cred_pres_normalizado && !ctx.credPresSet.has(dados.c_cred_pres_normalizado)) {
    checks.push(check("TRIB_CRED_PRES_AUSENTE", STATUS.ALERTA, `cCredPres ${dados.c_cred_pres_normalizado} não localizado no catálogo.`, false, "c_cred_pres"));
  }
  if (!dados.grupo_rtc && dados.c_class_trib_normalizado) {
    checks.push(check("TRIB_GRUPO_RTC_DIVERGENTE", STATUS.NAO_APLICAVEL, "Grupo RTC não informado — verifique exigência do cClassTrib.", false, "grupo_rtc"));
  }
  return checks;
}

function validarOperacional(dados, ctx) {
  const checks = [];
  const histKey = `${dados.chave_nfe}|${dados.numero_item}|${dados.perspectiva}`;
  if (ctx.histKeys.has(histKey)) {
    checks.push(check("OPER_PERSPECTIVA_DUPLICADA", STATUS.NAO_CONFORME, "Perspectiva já importada anteriormente.", true, "perspectiva"));
  }
  if (dados.quantidade < 0) {
    checks.push(check("OPER_VALOR_NEGATIVO_BLOQUEANTE", STATUS.NAO_CONFORME, "Quantidade negativa não permitida.", true, "quantidade"));
  }
  return checks;
}