import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Wand2 } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import { plural } from "@/lib/plural";

const MapaDaCarteira = lazy(() => import("@/components/inicio/MapaDaCarteira"));

function Cartao({ rotulo, valor, destaque, detalhe }) {
  return (
    <div className={`rounded-xl border bg-card px-4 py-3 ${destaque ? "border-amber-400/60" : "border-border"}`}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor ?? "—"}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

/** Barras horizontais de uma contagem (regime, porte, situação…), com o número em cada barra. */
export function Distribuicao({ titulo, dados, vazio }) {
  const linhas = (dados || []).slice(0, 10);
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label={titulo}>
      <h2 className="mb-2 font-heading text-sm font-semibold">{titulo}</h2>
      {linhas.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{vazio}</p> : (
        <>
          <div className="h-[200px]" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={linhas} layout="vertical" margin={{ left: 8, right: 24 }}>
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [v, "empresas"]} />
                <Bar dataKey="total" fill="#1E764D" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only"><caption>{titulo}</caption><tbody>{linhas.map((l) => <tr key={l.nome}><td>{l.nome}</td><td>{l.total}</td></tr>)}</tbody></table>
        </>
      )}
    </section>
  );
}

/** Início > Painel da carteira: o retrato da carteira feito com o cadastro, sem depender da Receita. */
export default function PainelCarteiraPagina() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: r, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ["painel-carteira"], queryFn: () => api.get("/painel-carteira") });
  const [completando, setCompletando] = useState(null); // { feitas, falhas[] }

  const completar = async () => {
    setCompletando({ feitas: 0, falhas: [], restantes: r?.saude.pendentes_de_cnpj ?? 0 });
    try {
      let restantes = 1;
      let feitas = 0;
      let falhas = [];
      while (restantes > 0) {
        const x = await api.post("/painel-carteira/completar", {});
        feitas += x.atualizadas;
        falhas = [...falhas, ...x.falhas];
        restantes = x.restantes;
        setCompletando({ feitas, falhas, restantes });
        if (x.atualizadas === 0 && x.falhas.length === 0) break;
      }
      toast({ title: "Cadastro completado pelo CNPJ", description: `${plural(feitas, "empresa atualizada", "empresas atualizadas")}${falhas.length ? `; ${falhas.length} sem resposta` : ""}.` });
    } catch (e) {
      toast({ title: "A consulta parou no meio", description: e.message, variant: "destructive" });
    } finally {
      qc.invalidateQueries({ queryKey: ["painel-carteira"] });
    }
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Painel da carteira" }]}
        title="Painel da carteira"
        actions={<button type="button" onClick={() => refetch()} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" /> Atualizar</button>}
      />
      <div className="px-6 lg:px-8 py-6 space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
        {error && <p role="alert" className="text-sm">Não foi possível carregar o painel. <button type="button" onClick={() => refetch()} className="text-primary hover:underline">Tentar de novo</button></p>}
        {r && r.total === 0 && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma empresa cadastrada ainda. <Link to="/" className="text-primary hover:underline">Cadastre o cliente em Clientes</Link>.</p>}
        {r && r.total > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Cartao rotulo="Empresas" valor={r.total} detalhe={plural(r.ativas, "ativa", "ativas")} />
              <Cartao rotulo="No BPO fiscal" valor={r.carteiras.bpo} />
              <Cartao rotulo="Com diagnóstico pontual" valor={r.carteiras.diagnostico} detalhe={r.carteiras.ambas ? `${r.carteiras.ambas} nas duas` : null} />
              <Cartao rotulo="Sem carteira" valor={r.carteiras.sem} destaque={r.carteiras.sem > 0} />
              <Cartao rotulo="Cadastro completo" valor={`${r.saude.completas} de ${r.total}`} destaque={r.saude.com_faltas > 0} />
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <Distribuicao titulo="Por regime tributário" dados={r.por_regime} vazio="Sem regime no cadastro." />
              <Distribuicao titulo="Por porte (Receita Federal)" dados={r.por_porte} vazio="Sem CNPJ consultado ainda." />
              <Distribuicao titulo="Por UF" dados={r.por_uf} vazio="Sem UF no cadastro." />
            </div>

            <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-labelledby="titulo-mapa">
              <h2 id="titulo-mapa" className="font-heading text-sm font-semibold">Onde ficam as empresas</h2>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,24%)]">
                <Suspense fallback={<div className="flex h-[380px] items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">Carregando o mapa…</div>}>
                  <MapaDaCarteira municipios={r.por_municipio} />
                </Suspense>
                <div className="max-h-[380px] overflow-y-auto">
                  <TabelaPadrao simples id="carteira-municipios" ariaLabel="Empresas por município" linhas={r.por_municipio} chaveLinha={(m) => `${m.uf}-${m.municipio}`} ordemInicial={{ chave: "total", dir: -1 }}
                    colunas={[
                      { chave: "municipio", rotulo: "Município", valor: (m) => `${m.municipio}/${m.uf}`, render: (m) => <>{m.municipio}/{m.uf}{m.latitude === null && <span className="ml-1 text-[10px] text-muted-foreground">(sem ponto)</span>}</> },
                      { chave: "total", rotulo: "Empresas", tipo: "numero", alinhar: "direita" },
                    ]}
                  />
                </div>
              </div>
              {r.saude.sem_ponto_no_mapa > 0 && <p className="text-xs text-muted-foreground">{plural(r.saude.sem_ponto_no_mapa, "empresa", "empresas")} sem ponto no mapa.</p>}
            </section>

            <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="titulo-cnae">
                <h2 id="titulo-cnae" className="mb-2 font-heading text-sm font-semibold">Atividade principal (CNAE)</h2>
                {r.por_cnae.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum CNAE ainda.</p> : (
                  <TabelaPadrao simples id="carteira-cnae" ariaLabel="Empresas por CNAE" linhas={r.por_cnae.slice(0, 15)} chaveLinha={(c) => c.codigo} ordemInicial={{ chave: "total", dir: -1 }}
                    colunas={[
                      { chave: "codigo", rotulo: "CNAE", valor: (c) => c.codigo.replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3"), render: (c) => <span className="tabular-nums">{c.codigo.replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3")}</span> },
                      { chave: "descricao", rotulo: "Descrição", quebrar: true },
                      { chave: "total", rotulo: "Empresas", tipo: "numero", alinhar: "direita" },
                    ]}
                  />
                )}
              </section>
              <section className="rounded-xl border border-border bg-card p-4 space-y-2" aria-labelledby="titulo-saude">
                <h2 id="titulo-saude" className="font-heading text-sm font-semibold">Saúde do cadastro</h2>
                {r.saude.com_faltas === 0 ? <p className="text-sm text-muted-foreground">Todas as empresas estão com o cadastro completo.</p> : (
                  <>
                    <p className="text-sm">{plural(r.saude.com_faltas, "empresa", "empresas")} com algo a preencher: {r.saude.faltas.map((f) => `${f.nome} (${f.total})`).join(", ")}.</p>
                    <ul className="max-h-[180px] overflow-y-auto text-xs divide-y divide-border/50">
                      {r.saude.empresas_com_faltas.map((e) => <li key={e.id} className="py-1"><span className="font-medium">{e.razao_social}</span> <span className="text-muted-foreground">· falta {e.faltas.join(", ")}</span></li>)}
                    </ul>
                    <Link to="/" className="text-xs text-primary hover:underline">Preencher na ficha do cliente</Link>
                  </>
                )}
                {user?.role === "admin" && r.saude.pendentes_de_cnpj > 0 && (
                  <div className="rounded-md bg-muted/40 p-3 text-sm space-y-2">
                    <p>{plural(r.saude.pendentes_de_cnpj, "empresa", "empresas")} com CNPJ não consultado.</p>
                    <button type="button" onClick={completar} disabled={!!completando && completando.restantes > 0} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-60"><Wand2 className="h-4 w-4" aria-hidden="true" /> Completar pelo CNPJ</button>
                    {completando && <p role="status" className="text-xs text-muted-foreground">{plural(completando.feitas, "atualizada", "atualizadas")}{completando.restantes > 0 ? `, faltam ${completando.restantes}…` : "."}{completando.falhas.length ? ` ${completando.falhas.length} sem resposta: ${completando.falhas.slice(0, 3).map((f) => f.razao_social).join(", ")}${completando.falhas.length > 3 ? "…" : ""}` : ""}</p>}
                  </div>
                )}
              </section>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <Distribuicao titulo="Por setor (cadastro)" dados={r.por_setor} vazio="Sem setor no cadastro." />
              <Distribuicao titulo="Por situação" dados={r.por_situacao} vazio="Sem situação." />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
