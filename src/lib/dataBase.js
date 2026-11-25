/**
 * Serviços de consultoria que olham a situação numa data (data-base) e não um intervalo de datas: homologação do ERP e crédito
 * presumido de estoque. O projeto guarda a data-base nas duas pontas do período; o resto do sistema só muda o rótulo.
 * (A mesma lista existe no servidor: SERVICOS_POR_DATA_BASE em consultoria.service.ts.)
 */
export const SERVICOS_POR_DATA_BASE = ["pf-homologacao", "pj-homologacao", "credito-estoque", "credito-estoque-pf"];

export const porDataBase = (servicoId) => SERVICOS_POR_DATA_BASE.includes(servicoId);

const dia = (v) => String(v ?? "").slice(0, 10);

/** O projeto é de data-base? (serviço por data-base e início = fim; projeto antigo, com intervalo, segue como período) */
export const projetoPorDataBase = (p) => !!p && porDataBase(p.servico_consultoria) && !!p.periodo_inicio && dia(p.periodo_inicio) === dia(p.periodo_fim);

/** "dd/mm/aaaa" na data-base ou "dd/mm/aaaa a dd/mm/aaaa" no período, com a função de formatar da tela. */
export const valorPeriodo = (p, fmt) => (projetoPorDataBase(p) ? fmt(p.periodo_inicio) : `${fmt(p.periodo_inicio)} a ${fmt(p.periodo_fim)}`);

/** Igual ao valor, mas dizendo que é data-base quando for. */
export const rotuloPeriodo = (p, fmt) => (projetoPorDataBase(p) ? `Data-base ${fmt(p.periodo_inicio)}` : valorPeriodo(p, fmt));

export const tituloPeriodo = (p) => (projetoPorDataBase(p) ? "Data-base do projeto" : "Período do projeto");
