import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Search, Wrench } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";

/**
 * Classificador cClassTrib + Conversor de códigos de serviço (4 em 1) —
 * item da LC 116/2003, NBS, cIndOp e cClassTrib são 4 recortes da mesma
 * tabela oficial (Anexo VIII, RTC/Receita Federal), então uma busca só
 * cobre os 4 sentidos de conversão em vez de 4 telas separadas.
 */
export default function FerramentasClassificacao() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["correlacaoServico"],
    queryFn: () => base44.entities.CorrelacaoServico.list(),
  });
  const [q, setQ] = useState("");

  const resultados = useMemo(() => {
    const termo = q.trim().toLowerCase();
    if (!termo) return [];
    return data
      .filter((r) =>
        [r.item_lc116, r.descricao_item, r.nbs, r.descricao_nbs, r.ind_op, r.c_class_trib, r.nome_class_trib]
          .some((v) => v && String(v).toLowerCase().includes(termo))
      )
      .slice(0, 100);
  }, [data, q]);

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Classificador & Conversor" }]} />
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-heading font-semibold">Classificador & Conversor de Códigos de Serviço</h1>
            <InfoTooltip pagina="ferramentas" chave="classificacao_header" />
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Busque por item da LC 116/2003, código NBS, cIndOp ou cClassTrib — qualquer um dos quatro — e veja a
            correspondência completa. Base: {data.length ? data.length.toLocaleString("pt-BR") : "…"} linhas do{" "}
            <strong>Anexo VIII</strong> (Receita Federal / Comitê Gestor da NFS-e), a tabela oficial de correlação
            entre esses códigos.
          </p>
        </div>

        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ex.: 01.01, análise de sistemas, 1.1502.10.00, 100301, 000001..."
            className="pl-9"
            disabled={isLoading}
          />
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando base oficial…</p>}

        {!isLoading && q && resultados.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma correspondência para "{q}".</p>
        )}

        {resultados.length > 0 && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2.5 px-4 font-medium">Item LC 116</th>
                    <th className="py-2.5 px-4 font-medium">NBS</th>
                    <th className="py-2.5 px-4 font-medium">Descrição</th>
                    <th className="py-2.5 px-4 font-medium">cIndOp</th>
                    <th className="py-2.5 px-4 font-medium">Local incidência IBS</th>
                    <th className="py-2.5 px-4 font-medium">cClassTrib</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r) => (
                    <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                      <td className="py-2.5 px-4 font-mono text-xs">{r.item_lc116 || "—"}</td>
                      <td className="py-2.5 px-4 font-mono text-xs">{r.nbs || "—"}</td>
                      <td className="py-2.5 px-4 text-muted-foreground max-w-[320px] truncate" title={r.descricao_nbs || r.descricao_item}>
                        {r.descricao_nbs || r.descricao_item || "—"}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs">{r.ind_op || "—"}</td>
                      <td className="py-2.5 px-4 text-xs text-muted-foreground">{r.local_incidencia_ibs || "—"}</td>
                      <td className="py-2.5 px-4">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent/15" title={r.nome_class_trib}>
                          {r.c_class_trib || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Cobre a consulta simples de cClassTrib, o conversor LC 116 ↔ NBS, o identificador de cIndOp e o
            "4 em 1" numa tela só, já que os quatro vêm da mesma fonte oficial. <strong>Ainda não incluído:</strong>{" "}
            consulta em lote (upload de planilha) e um assistente guiado por perguntas para achar o cIndOp sem
            saber o código de antemão — ficaram de fora desta primeira versão.
          </p>
        </div>
      </div>
    </div>
  );
}
