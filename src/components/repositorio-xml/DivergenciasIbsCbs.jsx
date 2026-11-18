import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import TabelaPadrao from "@/components/TabelaPadrao";
import { plural } from "@/lib/plural";
import { base, fmtDoc } from "./formatos";

export const SITUACOES_IBSCBS = {
  ENQUADRAMENTO: { rotulo: "Enquadramento incorreto", tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  DIVERGENTE: { rotulo: "Valor divergente", tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  FALHA: { rotulo: "Não conferida (falha)", tom: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  NAO_COBERTO: { rotulo: "Fora do alcance da calculadora", tom: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  CONFERE: { rotulo: "Confere", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  SEM_GRUPO: { rotulo: "Sem grupo IBS/CBS", tom: "bg-muted text-muted-foreground" },
  HOMOLOGACAO: { rotulo: "Homologação (sem valor fiscal)", tom: "bg-muted text-muted-foreground" },
};
const ORDEM = ["ENQUADRAMENTO", "DIVERGENTE", "FALHA", "NAO_COBERTO", "CONFERE", "SEM_GRUPO", "HOMOLOGACAO"];
const moeda = (v) => (v == null ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const Selo = ({ s }) => { const x = SITUACOES_IBSCBS[s] ?? { rotulo: s, tom: "bg-muted" }; return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${x.tom}`}>{x.rotulo}</span>; };

/** O que foi achado num item, em uma frase: campos divergentes (nota × oficial), erros oficiais de enquadramento ou o aviso. */
export function achadoDoItem(i) {
  if (i.erros?.length && i.situacao !== "CONFERE") return i.erros.map((e) => `${e.codigo}: ${e.mensagem}`).join(" · ");
  if (i.campos?.length) return i.campos.map((c) => `${c.campo}: nota ${c.nota ?? "—"} × oficial ${c.oficial ?? "—"}`).join(" · ");
  return i.aviso ?? "";
}

/** Repositório de XML > Divergências IBS/CBS: cada NF-e/NFC-e do período conferida com a calculadora oficial da Receita. */
export default function DivergenciasIbsCbs({ empresaId, datas, seletorCompetencia }) {
  const q = useQuery({
    queryKey: ["auditoria-ibscbs", empresaId, datas.de, datas.ate],
    queryFn: () => api.get(`${base(empresaId)}/auditoria-ibscbs?de=${datas.de}&ate=${datas.ate}`),
  });
  const d = q.data;
  const itens = useMemo(() => (d?.linhas ?? []).flatMap((n) => (n.detalhes ?? []).filter((i) => !["CONFERE", "SEM_GRUPO"].includes(i.situacao)).map((i) => ({
    id: `${n.id}-${i.numero}`, data_emissao: n.data_emissao, chave: n.chave, emitente: n.emitente_nome || fmtDoc(n.emitente_doc), papel: n.papel === "EMITIDA" ? "Emitida" : "Recebida",
    item: i.numero, ncm: i.ncm, descricao: i.descricao, classificacao: `${i.cst ?? "—"} / ${i.cClassTrib ?? "—"}`, situacao: i.situacao, achado: achadoDoItem(i),
  }))), [d]);
  const colNotas = [
    { chave: "data_emissao", rotulo: "Emissão", tipo: "data" },
    { chave: "chave", rotulo: "Chave" },
    { chave: "papel", rotulo: "Nota", valor: (l) => (l.papel === "EMITIDA" ? "Emitida" : "Recebida") },
    { chave: "emitente", rotulo: "Emitente", valor: (l) => l.emitente_nome || fmtDoc(l.emitente_doc) },
    { chave: "situacao", rotulo: "Situação", valor: (l) => SITUACOES_IBSCBS[l.situacao]?.rotulo ?? l.situacao, render: (l) => <Selo s={l.situacao} /> },
    { chave: "itens_divergentes", rotulo: "Itens com achado", tipo: "numero", valor: (l) => l.itens_divergentes },
    { chave: "vbc_nota", rotulo: "Base na nota", valor: (l) => moeda(l.vbc_nota) },
    { chave: "vbc_oficial", rotulo: "Base oficial", valor: (l) => moeda(l.vbc_oficial) },
    { chave: "ibs_nota", rotulo: "IBS na nota", valor: (l) => moeda(l.ibs_nota) },
    { chave: "ibs_oficial", rotulo: "IBS oficial", valor: (l) => moeda(l.ibs_oficial) },
    { chave: "cbs_nota", rotulo: "CBS na nota", valor: (l) => moeda(l.cbs_nota) },
    { chave: "cbs_oficial", rotulo: "CBS oficial", valor: (l) => moeda(l.cbs_oficial) },
  ];
  const colItens = [
    { chave: "data_emissao", rotulo: "Emissão", tipo: "data" },
    { chave: "chave", rotulo: "Chave" },
    { chave: "papel", rotulo: "Nota" },
    { chave: "emitente", rotulo: "Emitente" },
    { chave: "item", rotulo: "Item", tipo: "numero" },
    { chave: "ncm", rotulo: "NCM" },
    { chave: "descricao", rotulo: "Produto" },
    { chave: "classificacao", rotulo: "CST / cClassTrib" },
    { chave: "situacao", rotulo: "Situação", valor: (l) => SITUACOES_IBSCBS[l.situacao]?.rotulo ?? l.situacao, render: (l) => <Selo s={l.situacao} /> },
    { chave: "achado", rotulo: "O que a calculadora oficial apontou" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">{seletorCompetencia}</div>
      {q.isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
      {q.error && <p role="alert" className="text-sm">Não foi possível carregar a conferência.</p>}
      {d && (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Resumo da conferência">
            {ORDEM.filter((s) => d.resumo[s]).map((s) => <span key={s} className="inline-flex items-center gap-1.5 text-sm"><Selo s={s} /> {d.resumo[s]}</span>)}
            {d.pendentes > 0 && <span className="text-sm text-muted-foreground">{plural(d.pendentes, "nota aguardando conferência", "notas aguardando conferência")} (a conferência roda sozinha a cada 20 minutos)</span>}
          </div>
          <p className="text-xs text-muted-foreground">Cada NF-e e NFC-e emitida a partir de 2026 é conferida com a calculadora oficial da Receita{d.versao ? ` (versão ${d.versao.versaoApp}, banco ${d.versao.versaoDb})` : ""}: enquadramento do CST e do cClassTrib (NCM no anexo da lei, classificação aceita no documento), base de cálculo pelo art. 12 da LC 214, alíquotas, redução, diferimento e valores, item a item. A partir de 2027 a conta é conferida com as alíquotas da própria nota.</p>
          <TabelaPadrao id="auditoria-ibscbs-notas" titulo="Conferência IBS-CBS por nota" ariaLabel="Notas conferidas" colunas={colNotas} linhas={d.linhas} ordemInicial={{ chave: "itens_divergentes", dir: -1 }} vazio="Nenhuma nota conferida neste período." />
          <h3 className="pt-2 text-sm font-semibold">Itens com achado</h3>
          <TabelaPadrao id="auditoria-ibscbs-itens" titulo="Itens com achado IBS-CBS" ariaLabel="Itens com achado" colunas={colItens} linhas={itens} vazio="Nenhum item com achado neste período." />
        </>
      )}
    </div>
  );
}
