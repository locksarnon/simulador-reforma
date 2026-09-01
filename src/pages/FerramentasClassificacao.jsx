import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Wrench, Download, HelpCircle } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";

// Valores reais de "Local incidência IBS" encontrados no Anexo VIII — não é
// uma categoria inventada, é o próprio agrupamento que a tabela oficial usa.
// Servem de atalho pra quem não sabe o cIndOp de antemão: em vez de simular
// uma árvore de decisão própria (que a fonte oficial não publica como
// regra determinística), a gente filtra pelo que a tabela já diz.
const CATEGORIAS_LOCAL = [
  { label: "Bem entregue ao destinatário", filtro: "entrega ou disponibilização", inciso: "I" },
  { label: "Serviço sobre imóvel", filtro: "local do imóvel", inciso: "II" },
  { label: "Serviço físico sobre pessoa", filtro: "local da prestação", inciso: "III" },
  { label: "Feira ou evento", filtro: "evento", inciso: "IV" },
  { label: "Exploração de via/rodovia", filtro: "via explorada", inciso: "V–IX" },
  { label: "TI, software, consultoria digital", filtro: "domicílio principal do adquirente", inciso: "X" },
];

function buscar(data, termo) {
  const t = termo.trim().toLowerCase();
  if (!t) return [];
  return data.filter((r) =>
    [r.item_lc116, r.descricao_item, r.nbs, r.descricao_nbs, r.ind_op, r.c_class_trib, r.nome_class_trib, r.local_incidencia_ibs]
      .some((v) => v && String(v).toLowerCase().includes(t))
  );
}

function baixarCsv(nome, linhas) {
  const csv = linhas.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
  const [mostrarAjuda, setMostrarAjuda] = useState(false);
  const [lote, setLote] = useState("");
  const [resultadosLote, setResultadosLote] = useState(null);

  const resultados = useMemo(() => buscar(data, q).slice(0, 100), [data, q]);

  const processarLote = () => {
    const termos = lote.split("\n").map((l) => l.trim()).filter(Boolean);
    const linhas = termos.map((termo) => {
      const achados = buscar(data, termo);
      return { termo, achados };
    });
    setResultadosLote(linhas);
  };

  const exportarLote = () => {
    if (!resultadosLote) return;
    const linhas = [["Termo buscado", "Status", "Item LC 116", "NBS", "cIndOp", "cClassTrib", "Descrição"]];
    for (const r of resultadosLote) {
      if (r.achados.length === 0) {
        linhas.push([r.termo, "Não encontrado", "", "", "", "", ""]);
      } else {
        for (const a of r.achados.slice(0, 5)) {
          linhas.push([
            r.termo,
            r.achados.length > 1 ? "Múltiplos candidatos" : "Encontrado",
            a.item_lc116 || "", a.nbs || "", a.ind_op || "", a.c_class_trib || "", a.descricao_nbs || a.descricao_item || "",
          ]);
        }
      }
    }
    baixarCsv("classificacao-em-lote.csv", linhas);
  };

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
            Item da LC 116/2003, NBS, cIndOp e cClassTrib — os quatro numa base só. Base:{" "}
            {data.length ? data.length.toLocaleString("pt-BR") : "…"} linhas do <strong>Anexo VIII</strong> (Receita
            Federal / Comitê Gestor da NFS-e).
          </p>
        </div>

        <Tabs defaultValue="busca">
          <TabsList>
            <TabsTrigger value="busca">Busca</TabsTrigger>
            <TabsTrigger value="lote">Consulta em lote</TabsTrigger>
          </TabsList>

          <TabsContent value="busca" className="space-y-4 pt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative max-w-lg flex-1 min-w-[260px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Ex.: 01.01, análise de sistemas, 1.1502.10.00, 100301, 000001..."
                  className="pl-9"
                  disabled={isLoading}
                />
              </div>
              <button
                onClick={() => setMostrarAjuda((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-2"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Não sabe o código? Filtre por tipo de operação
              </button>
            </div>

            {mostrarAjuda && (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-3">
                  Cada botão filtra pelo "local de incidência" que a própria tabela oficial já usa — mesma lógica do{" "}
                  <a href="/ferramentas/art-11" className="text-primary underline underline-offset-2">Guia do Art. 11</a>.
                  Bem material com NCM (sem serviço) não está nesta base — veja o Catálogo NCM.
                </p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIAS_LOCAL.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => { setQ(c.filtro); setMostrarAjuda(false); }}
                      className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary hover:bg-primary/5"
                    >
                      {c.label} <span className="text-muted-foreground font-mono ml-1">Art.11-{c.inciso}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isLoading && <p className="text-sm text-muted-foreground">Carregando base oficial…</p>}
            {!isLoading && q && resultados.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma correspondência para "{q}".</p>
            )}
            {resultados.length > 0 && <TabelaResultados resultados={resultados} />}
          </TabsContent>

          <TabsContent value="lote" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Cole um termo por linha (código ou descrição) — processa tudo localmente contra a mesma base, sem subir arquivo.
            </p>
            <Textarea
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              placeholder={"01.01\nconsultoria de TI\n1.1502.10.00"}
              rows={6}
              className="font-mono text-sm"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={processarLote}
                disabled={isLoading || !lote.trim()}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50"
              >
                Processar lote
              </button>
              {resultadosLote && (
                <button onClick={exportarLote} className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
                  <Download className="w-4 h-4" /> Exportar CSV
                </button>
              )}
            </div>

            {resultadosLote && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-2.5 px-4 font-medium">Termo</th>
                        <th className="py-2.5 px-4 font-medium">Status</th>
                        <th className="py-2.5 px-4 font-medium">cClassTrib</th>
                        <th className="py-2.5 px-4 font-medium">Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultadosLote.map((r, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="py-2.5 px-4 font-mono text-xs">{r.termo}</td>
                          <td className="py-2.5 px-4">
                            {r.achados.length === 0 ? (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">Não encontrado</span>
                            ) : r.achados.length > 1 ? (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                {r.achados.length} candidatos
                              </span>
                            ) : (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-chart-2/15 text-chart-2">Encontrado</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-xs">{r.achados[0]?.c_class_trib || "—"}</td>
                          <td className="py-2.5 px-4 text-muted-foreground max-w-[360px] truncate">
                            {r.achados[0]?.descricao_nbs || r.achados[0]?.descricao_item || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function TabelaResultados({ resultados }) {
  return (
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
  );
}
