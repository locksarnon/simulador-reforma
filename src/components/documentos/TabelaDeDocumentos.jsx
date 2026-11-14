import { useState } from "react";
import TabelaPadrao from "@/components/TabelaPadrao";
import EnvioDocumentos, { tamanhoTexto } from "@/components/monitoramento/EnvioDocumentos";
import BotoesDocumento from "@/components/documentos/BotoesDocumento";
import { quandoConsultou } from "@/lib/monitoramento";

/** Formato pelo nome do arquivo (PDF, XML, TXT…). */
export const formatoDoNome = (nome) => { const m = /\.([a-z0-9]{1,5})$/i.exec(String(nome || "")); return m ? m[1].toUpperCase() : ""; };
/** Abrem no navegador (Ver); os demais só baixam. */
export const abreNoNavegador = (nome) => /\.(pdf|png|jpe?g|gif|webp|html?|txt|xml)$/i.test(String(nome || ""));

/**
 * Tabela de documentos do InTAX: a mesma no Monitoramento fiscal e em Arquivos e documentos. Marca linhas, baixa em ZIP e envia por
 * e-mail (com o total e o limite à vista; envio e download ficam registrados), e cada linha tem Ver e Baixar no fim.
 *
 * `linhas`: [{ id, documento, origem?, pasta?, formato, tamanho?, data, url, nome, ver, item: { tipo, ... } }].
 * `envioBase`: "/monitoramento/empresas/ID" ou "/monitoramento/pessoas/ID" (sem ela, a tabela não marca nem envia).
 * `colunasExtras` entram antes da data; `acoesLinha(l)` soma botões ao Ver e Baixar (renomear, excluir…).
 */
export default function TabelaDeDocumentos({ id, ariaLabel, linhas = [], envioBase, invalidar = [], colunasExtras = [], acoesLinha, rotuloData = "Data", vazio = "Nenhum documento.", ordemInicial, tamanhoInicial = 25, mostrarPasta = false, mostrarOrigem = true }) {
  const [marcadas, setMarcadas] = useState(new Set());
  const colunas = [
    { chave: "documento", rotulo: "Documento", render: (l) => <span className="font-medium">{l.documento}</span> },
    ...(mostrarPasta ? [{ chave: "pasta", rotulo: "Pasta", valor: (l) => l.pasta || "Início" }] : []),
    ...(mostrarOrigem ? [{ chave: "origem", rotulo: "Origem", valor: (l) => l.origem || "" }] : []),
    { chave: "formato", rotulo: "Formato" },
    { chave: "tamanho", rotulo: "Tamanho", tipo: "numero", alinhar: "direita", valor: (l) => l.tamanho ?? null, render: (l) => (l.tamanho != null ? tamanhoTexto(l.tamanho) : "—") },
    ...colunasExtras,
    { chave: "data", rotulo: rotuloData, tipo: "data", render: (l) => quandoConsultou(l.data) },
  ];
  return (
    <TabelaPadrao
      id={id} ariaLabel={ariaLabel} colunas={colunas} linhas={linhas} vazio={vazio} ordemInicial={ordemInicial} tamanhoInicial={tamanhoInicial}
      selecao={envioBase ? { marcadas, aoMudar: setMarcadas } : undefined}
      acoes={envioBase ? <EnvioDocumentos base={envioBase} marcados={linhas.filter((l) => marcadas.has(l.id))} aoConcluir={() => setMarcadas(new Set())} invalidar={invalidar} /> : null}
      documentos={(l) => (
        <span className="inline-flex items-center justify-end gap-1">
          <BotoesDocumento url={l.url} nome={l.nome} ver={l.ver} rotulo={l.documento} />
          {acoesLinha?.(l)}
        </span>
      )}
    />
  );
}
