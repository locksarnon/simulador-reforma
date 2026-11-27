// Baixa a lista de solicitações de um serviço em Excel, no navegador. O exceljs só é carregado quando alguém pede o arquivo.
import { carregarExcelJS, baixarXlsx } from "@/components/saneamento/arquivoXlsx";
import { listaDoServico } from "./catalogo.js";
import { montarPlanilha, nomeArquivo } from "./planilha.js";
import { erpDoRegistro } from "../erps.js";
import { carregarLogoFal } from "../marcaFal.js";

/** Data AAAA-MM-DD (campo de data) para Date em UTC, como a planilha espera; vazio ou inválido vira null. */
export function dataDoCampo(txt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(txt || ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

/**
 * Dados da Capa a partir do cadastro da empresa e do que a pessoa preencheu na janela. O ERP é o nome do Cadastro de ERPs (pelo erp_id ou
 * pelo texto antigo que casa sem ambiguidade) + a versão; sem a lista ou sem casamento, vale o texto antigo do cadastro do cliente.
 */
export function nomeDoErpDaEmpresa(empresa, erps = []) {
  const { erp, texto } = erpDoRegistro(empresa, erps);
  return [erp?.nome || texto, empresa?.erp_versao].filter(Boolean).join(" ");
}

export function dadosDaCapa(empresa, { dataBase, envio, responsavel, contatoFal } = {}, erps = []) {
  return {
    cliente: empresa?.razao_social || "",
    cnpj: empresa?.cnpj_cpf || "",
    regime: empresa?.regime_atual || "",
    erp: nomeDoErpDaEmpresa(empresa, erps),
    database: dataDoCampo(dataBase),
    envio: dataDoCampo(envio),
    responsavel: (responsavel || "").trim(),
    contatoFal: (contatoFal || "").trim(),
  };
}

/** @param {string} servico rota do serviço (src/lib/servicosEmpresa.js) */
export async function baixarLista(servico, dados) {
  const lista = listaDoServico(servico);
  if (!lista) throw new Error("Este serviço ainda não tem lista de solicitações.");
  const [ExcelJS, logo] = await Promise.all([carregarExcelJS(), carregarLogoFal()]);
  const { wb } = montarPlanilha({ ExcelJS, lista, dados, logo });
  const buf = await wb.xlsx.writeBuffer();
  baixarXlsx(buf, nomeArquivo(lista, dados));
}
