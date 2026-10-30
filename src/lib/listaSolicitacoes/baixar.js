// Baixa a lista de solicitações de um serviço em Excel, no navegador. O exceljs só é carregado quando alguém pede o arquivo.
import { carregarExcelJS, baixarXlsx } from "@/components/saneamento/arquivoXlsx";
import { listaDoServico } from "./catalogo.js";
import { montarPlanilha, nomeArquivo } from "./planilha.js";

/** Logo da FAL Agro (public/fal-agro-logo.png) em base64; se não carregar, a lista sai sem a imagem. */
async function logoBase64() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}fal-agro-logo.png`);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((ok, falha) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.onerror = falha;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Data AAAA-MM-DD (campo de data) para Date em UTC, como a planilha espera; vazio ou inválido vira null. */
export function dataDoCampo(txt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(txt || ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

/** Dados da Capa a partir do cadastro da empresa e do que a pessoa preencheu na janela. */
export function dadosDaCapa(empresa, { dataBase, envio, responsavel, contatoFal } = {}) {
  return {
    cliente: empresa?.razao_social || "",
    cnpj: empresa?.cnpj_cpf || "",
    regime: empresa?.regime_atual || "",
    erp: [empresa?.erp, empresa?.erp_versao].filter(Boolean).join(" "),
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
  const [ExcelJS, logo] = await Promise.all([carregarExcelJS(), logoBase64()]);
  const { wb } = montarPlanilha({ ExcelJS, lista, dados, logo });
  const buf = await wb.xlsx.writeBuffer();
  baixarXlsx(buf, nomeArquivo(lista, dados));
}
