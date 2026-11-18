import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import TabelaPadrao from "@/components/TabelaPadrao";
import { plural } from "@/lib/plural";

export const VEREDITOS = {
  REPROVADO: { rotulo: "Reprovado", tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  SEM_DESTAQUE: { rotulo: "Sem destaque de IBS/CBS", tom: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  NAO_COBERTO: { rotulo: "Conferir à parte", tom: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  APROVADO: { rotulo: "Aprovado", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
};
const Selo = ({ s }) => { const v = VEREDITOS[s] ?? { rotulo: s, tom: "bg-muted" }; return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${v.tom}`}>{v.rotulo}</span>; };
const fmtChave = (c) => (c ? `${c.slice(0, 6)}…${c.slice(-6)}` : "");

/** Texto do que o ERP errou no cenário, com a regra oficial e uma nota de exemplo. */
export function achadosEmTexto(c) {
  return (c.achados ?? []).map((a) => `${a.tipo === "ENQUADRAMENTO" ? `${a.regra}: ${a.texto}` : a.texto} (${plural(a.ocorrencias, "item", "itens")}; ex.: nota ${fmtChave(a.exemplo?.chave)}, item ${a.exemplo?.item})`).join(" · ");
}

/** Homologação fiscal do ERP para IBS/CBS: o laudo por cenário das notas que a empresa emitiu no período do projeto. */
export default function HomologacaoErp({ projetoId }) {
  const q = useQuery({ queryKey: ["homologacao-erp", projetoId], queryFn: () => api.get(`/projetos-diagnostico/${projetoId}/homologacao`) });
  const d = q.data;
  const nomeEmpresa = useMemo(() => new Map((d?.empresas ?? []).map((e) => [e.id, e.razao_social])), [d]);
  const linhas = useMemo(() => (d?.cenarios ?? []).map((c, i) => ({ ...c, id: `${i}`, empresa: nomeEmpresa.get(c.empresa_id) ?? "", classificacao: `${c.cst} / ${c.cClassTrib}`, achado: achadosEmTexto(c) })), [d, nomeEmpresa]);
  const colunas = [
    { chave: "situacao", rotulo: "Resultado", valor: (l) => VEREDITOS[l.situacao]?.rotulo ?? l.situacao, render: (l) => <Selo s={l.situacao} /> },
    ...((d?.empresas?.length ?? 0) > 1 ? [{ chave: "empresa", rotulo: "Empresa" }] : []),
    { chave: "classificacao", rotulo: "CST / cClassTrib" },
    { chave: "cfop", rotulo: "CFOP" },
    { chave: "notas", rotulo: "Notas", tipo: "numero" },
    { chave: "itens", rotulo: "Itens", tipo: "numero" },
    { chave: "aprovados", rotulo: "Conferem", tipo: "numero" },
    { chave: "reprovados", rotulo: "Divergem", tipo: "numero" },
    { chave: "nao_cobertos", rotulo: "Conferir à parte", tipo: "numero" },
    { chave: "sem_destaque", rotulo: "Sem destaque", tipo: "numero" },
    { chave: "achado", rotulo: "O que a calculadora oficial apontou" },
  ];
  if (q.isLoading) return <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Montando o laudo…</p>;
  if (q.error) return <p role="alert" className="text-sm">{q.error.message || "Não foi possível montar o laudo da homologação."}</p>;
  const r = d.resumo;
  const aguardando = d.aguardando ?? 0;
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Homologação fiscal do ERP">
      <h2 className="font-semibold">Homologação do ERP: notas emitidas × calculadora oficial da Receita</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Cenários", r.cenarios], ["Aprovados", r.aprovados], ["Reprovados", r.reprovados], ["Conferir à parte / sem destaque", r.nao_cobertos + r.sem_destaque]].map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-md bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{rotulo}</p><p className="text-xl font-semibold">{valor}</p></div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{plural(r.notas, "nota emitida conferida", "notas emitidas conferidas")} ({plural(r.itens, "item", "itens")}) no período do projeto{d.versao ? `, pela calculadora oficial ${d.versao.versaoApp} (banco ${d.versao.versaoDb})` : ""}.{aguardando > 0 ? ` ${plural(aguardando, "nota aguardando conferência", "notas aguardando conferência")}: o laudo se completa sozinho (a conferência roda a cada 20 minutos).` : ""}{r.notas_homologacao > 0 ? ` ${plural(r.notas_homologacao, "nota em ambiente de homologação incluída", "notas em ambiente de homologação incluídas")}.` : ""}</p>
      <p className="text-xs text-muted-foreground">Cenário = combinação de CST, cClassTrib e CFOP das notas que o ERP emitiu. Reprovado: algum item diverge do enquadramento ou do valor oficial. Sem destaque: o ERP não gravou o grupo IBS/CBS. Conferir à parte: a calculadora oficial ainda não calcula (Imposto Seletivo, crédito presumido, monofásicos) e o item precisa de conferência manual.</p>
      <TabelaPadrao id="homologacao-erp" titulo="Homologação do ERP: cenários" ariaLabel="Cenários da homologação" colunas={colunas} linhas={linhas} tamanhoInicial={25} vazio="Nenhuma nota emitida conferida neste período. Confira se o repositório de XML tem as notas de saída da empresa e se o período do projeto está certo." />
    </section>
  );
}
