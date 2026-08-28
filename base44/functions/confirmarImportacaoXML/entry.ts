import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

const BULK_BATCH = 500;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { lote_id, perspectivas_ids } = body;

    if (!lote_id || !Array.isArray(perspectivas_ids) || perspectivas_ids.length === 0) {
      return Response.json({ error: "lote_id e perspectivas_ids são obrigatórios." }, { status: 400 });
    }

    const lote = await base44.asServiceRole.entities.ImportacaoXMLLote.get(lote_id);
    if (!lote) return Response.json({ error: "Lote não localizado." }, { status: 404 });

    // 1. Batch load: todos os itens do lote em uma query
    const allItems = await base44.asServiceRole.entities.ImportacaoXMLItem.filter({ lote_id });
    const itemsMap = new Map(allItems.map((i) => [i.id, i]));
    const idsSet = new Set(perspectivas_ids);

    // Filtra itens selecionados e elegíveis
    const itemsToProcess = allItems.filter(
      (i) => idsSet.has(i.id) && (i.resultado_final === "IMPORTAVEL" || i.resultado_final === "IMPORTAVEL_COM_ALERTA")
    );

    if (itemsToProcess.length === 0) {
      return Response.json({ lote_id, confirmados: 0, erros: 0, resultados: [], status: "CONCLUIDO" });
    }

    // 2. Batch load: empresas únicas
    const empresaIds = [...new Set(itemsToProcess.map((i) => i.empresa_id))];
    const empresas = await Promise.all(
      empresaIds.map((id) => base44.asServiceRole.entities.Empresa.get(id).catch(() => null))
    );
    const empresasMap = new Map(empresas.filter(Boolean).map((e) => [e.id, e]));

    // 3. Batch load: histórico do grupo para checagem de duplicidade em memória
    const historico = await base44.asServiceRole.entities.HistoricoXML.filter({ grupo_id: lote.grupo_id });
    const histKeys = new Set(historico.map((h) => `${h.chave_nfe}|${h.numero_item}|${h.perspectiva}`));

    // 4. Processamento em memória: valida, prepara operações
    const operacoesToCreate = [];
    const itemLinks = [];
    const resultados = [];
    let confirmados = 0;
    let erros = 0;

    for (const item of itemsToProcess) {
      const histKey = `${item.chave_nfe}|${item.numero_item}|${item.perspectiva}`;
      if (histKeys.has(histKey)) {
        resultados.push({ id: item.id, sucesso: false, erro: "Perspectiva já importada (duplicidade)." });
        erros++;
        continue;
      }

      const empresa = empresasMap.get(item.empresa_id);
      if (!empresa || empresa.status === "Inativa") {
        resultados.push({ id: item.id, sucesso: false, erro: "Empresa inativa ou não localizada." });
        erros++;
        continue;
      }

      // Marca como visto para evitar duplicidade dentro do mesmo batch
      histKeys.add(histKey);

      const idOp = `IMP-${item.chave_nfe.substring(25, 34)}-${item.numero_item}-${item.perspectiva.substring(0, 3)}`;
      operacoesToCreate.push({
        id_operacao: idOp,
        empresa_id: empresa.id_empresa,
        data: item.data_emissao || new Date().toISOString(),
        ano: new Date(item.data_emissao || Date.now()).getFullYear(),
        direcao: item.direcao,
        tipo: item.nbs ? "Servico" : "Mercadoria",
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
        documento: "NF-e",
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

    // 5. Bulk create operações em batches
    const historicoData = [];
    const itemUpdates = [];

    for (let i = 0; i < operacoesToCreate.length; i += BULK_BATCH) {
      const batchOps = operacoesToCreate.slice(i, i + BULK_BATCH);
      const batchLinks = itemLinks.slice(i, i + BULK_BATCH);
      try {
        const created = await base44.asServiceRole.entities.Operacao.bulkCreate(batchOps);
        for (let j = 0; j < created.length; j++) {
          const { itemId, item } = batchLinks[j];
          const opId = created[j].id;
          historicoData.push({
            grupo_id: item.grupo_id, empresa_id: item.empresa_id,
            chave_nfe: item.chave_nfe, numero_item: item.numero_item,
            perspectiva: item.perspectiva, operacao_id: opId,
            lote_id, importado_em: new Date().toISOString(),
          });
          itemUpdates.push({
            id: itemId, resultado_final: "CONFIRMADO",
            confirmado_em: new Date().toISOString(),
            operacao_id: opId,
          });
          confirmados++;
          resultados.push({ id: itemId, sucesso: true, operacao_id: opId });
        }
      } catch (err) {
        // Fallback: cria individualmente para isolar falhas
        for (let j = 0; j < batchOps.length; j++) {
          const { itemId, item } = batchLinks[j];
          try {
            const created = await base44.asServiceRole.entities.Operacao.create(batchOps[j]);
            historicoData.push({
              grupo_id: item.grupo_id, empresa_id: item.empresa_id,
              chave_nfe: item.chave_nfe, numero_item: item.numero_item,
              perspectiva: item.perspectiva, operacao_id: created.id,
              lote_id, importado_em: new Date().toISOString(),
            });
            itemUpdates.push({
              id: itemId, resultado_final: "CONFIRMADO",
              confirmado_em: new Date().toISOString(),
              operacao_id: created.id,
            });
            confirmados++;
            resultados.push({ id: itemId, sucesso: true, operacao_id: created.id });
          } catch (err2) {
            if (String(err2.message || "").includes("duplicate") || String(err2.message || "").includes("unique")) {
              resultados.push({ id: itemId, sucesso: false, erro: "Item já importado (duplicidade)." });
            } else {
              resultados.push({ id: itemId, sucesso: false, erro: String(err2.message || err2) });
            }
            erros++;
          }
        }
      }
    }

    // 6. Bulk create histórico
    for (let i = 0; i < historicoData.length; i += BULK_BATCH) {
      try {
        await base44.asServiceRole.entities.HistoricoXML.bulkCreate(historicoData.slice(i, i + BULK_BATCH));
      } catch (err) {
        // Fallback individual
        for (const h of historicoData.slice(i, i + BULK_BATCH)) {
          await base44.asServiceRole.entities.HistoricoXML.create(h).catch(() => {});
        }
      }
    }

    // 7. Bulk update itens
    for (let i = 0; i < itemUpdates.length; i += BULK_BATCH) {
      try {
        await base44.asServiceRole.entities.ImportacaoXMLItem.bulkUpdate(itemUpdates.slice(i, i + BULK_BATCH));
      } catch (err) {
        for (const u of itemUpdates.slice(i, i + BULK_BATCH)) {
          await base44.asServiceRole.entities.ImportacaoXMLItem.update(u.id, u).catch(() => {});
        }
      }
    }

    // Atualiza totais do lote
    await base44.asServiceRole.entities.ImportacaoXMLLote.update(lote_id, {
      itens_confirmados: (lote.itens_confirmados || 0) + confirmados,
    });

    return Response.json({
      lote_id, confirmados, erros, resultados,
      status: erros === 0 ? "CONCLUIDO" : "CONCLUIDO_COM_ERROS",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}