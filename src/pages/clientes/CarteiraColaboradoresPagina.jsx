import { useMemo, useState } from "react";
import BotaoExportar from "@/components/BotaoExportar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Diferença entre a carteira que está salva e a marcada na tela: quantas empresas entram e quantas saem. */
export function diferenca(salvas, marcadas) {
  const a = new Set(salvas);
  const b = new Set(marcadas);
  return { entram: [...b].filter((id) => !a.has(id)).length, saem: [...a].filter((id) => !b.has(id)).length };
}

export function PorColaborador({ colaboradores, empresas, ehAdmin }) {
  const qc = useQueryClient();
  const [escolhido, setEscolhido] = useState("");
  const [marcadas, setMarcadas] = useState(null);
  const [busca, setBusca] = useState("");
  const atual = colaboradores.find((c) => c.id === escolhido);
  const salvas = atual?.empresa_ids || [];
  const selecionadas = marcadas ?? salvas;
  const lista = useMemo(() => {
    const t = semAcento(busca).trim();
    return empresas.filter((e) => !t || semAcento(e.razao_social).includes(t) || semAcento(e.id_empresa).includes(t));
  }, [empresas, busca]);
  const dif = diferenca(salvas, selecionadas);
  const alternar = (id) => setMarcadas((m) => { const base = new Set(m ?? salvas); if (base.has(id)) base.delete(id); else base.add(id); return [...base]; });
  const salvar = useMutation({
    mutationFn: () => api.post("/carteira/vinculos", { user_id: escolhido, empresa_ids: selecionadas, modo: "definir" }),
    onSuccess: (r) => { toast({ title: "Carteira salva", description: `${r.total} empresa(s) para ${atual?.name || atual?.email}.` }); setMarcadas(null); qc.invalidateQueries({ queryKey: ["carteira"] }); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <ul className="space-y-1" aria-label="Colaboradores">
        {colaboradores.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => { setEscolhido(c.id); setMarcadas(null); }} aria-pressed={escolhido === c.id}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm ${escolhido === c.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50"}`}>
              <p className="font-medium">{c.name || c.email}</p>
              <p className="text-xs text-muted-foreground">{c.empresa_ids.length} empresa(s)</p>
            </button>
          </li>
        ))}
      </ul>
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        {!atual ? <p className="py-8 text-center text-sm text-muted-foreground">Escolha um colaborador para ver e mudar as empresas dele.</p> : (
          <>
            <div className="flex flex-wrap items-end gap-2 text-sm">
              <label className="space-y-1 flex-1 min-w-[200px]"><span className="block text-xs text-muted-foreground">Buscar empresa</span><input type="search" className={`${campo} w-full`} value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
              {ehAdmin && (
                <button type="button" disabled={salvar.isPending || (dif.entram === 0 && dif.saem === 0)} onClick={() => salvar.mutate()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">
                  {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar carteira
                </button>
              )}
            </div>
            {(dif.entram > 0 || dif.saem > 0) && <p role="status" className="text-xs text-muted-foreground">Ainda não salvo: {dif.entram} entram e {dif.saem} saem da carteira.</p>}
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-[13px] leading-5" aria-label={`Empresas de ${atual.name || atual.email}`}>
                <tbody>
                  {lista.map((e) => (
                    <tr key={e.id} className="border-b border-border/60">
                      <td className="w-8 py-1.5 pr-2"><input type="checkbox" disabled={!ehAdmin} checked={selecionadas.includes(e.id)} onChange={() => alternar(e.id)} aria-label={`${e.razao_social} na carteira de ${atual.name || atual.email}`} /></td>
                      <td className="py-1.5"><p className="font-medium">{e.razao_social}</p><p className="text-[11px] text-muted-foreground tabular-nums">{e.cnpj_cpf || e.id_empresa}</p></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function SemColaborador({ colaboradores, ehAdmin }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["carteira", "sem-colaborador"], queryFn: () => api.get("/carteira/sem-colaborador") });
  const [marcadas, setMarcadas] = useState(new Set());
  const [destino, setDestino] = useState("");
  const alternar = (id) => setMarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const atribuir = useMutation({
    mutationFn: () => api.post("/carteira/vinculos", { user_id: destino, empresa_ids: [...marcadas], modo: "adicionar" }),
    onSuccess: (r) => { toast({ title: "Empresas atribuídas", description: `${r.adicionadas} empresa(s) entraram na carteira.` }); setMarcadas(new Set()); qc.invalidateQueries({ queryKey: ["carteira"] }); },
    onError: (e) => toast({ title: "Não foi possível atribuir", description: e.message, variant: "destructive" }),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>;
  if (error) return <p role="alert" className="text-sm">Não foi possível carregar.</p>;
  return (
    <div className="space-y-3">
      {data.length === 0 ? <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Todas as empresas têm pelo menos um colaborador.</p> : (
        <>
          {ehAdmin && (
            <div className="flex flex-wrap items-end gap-2 text-sm">
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">Atribuir as marcadas a</span>
                <select className={campo} value={destino} onChange={(e) => setDestino(e.target.value)}><option value="">Escolha…</option>{colaboradores.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}</select></label>
              <button type="button" disabled={!destino || marcadas.size === 0 || atribuir.isPending} onClick={() => atribuir.mutate()} className="rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">Atribuir {marcadas.size || ""}</button>
            </div>
          )}
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                {ehAdmin && <input type="checkbox" checked={marcadas.has(e.id)} onChange={() => alternar(e.id)} aria-label={`Marcar ${e.razao_social}`} />}
                <span className="font-medium">{e.razao_social}</span><span className="text-xs text-muted-foreground tabular-nums">{e.cnpj_cpf || e.id_empresa}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-xs text-muted-foreground">{data.length} empresa(s) sem colaborador.</p>
    </div>
  );
}

/** Relatório "empresa por colaborador": uma linha por empresa, com quem atende (ou "Sem colaborador"). */
export function linhasDaCarteira(colaboradores, empresas) {
  return (empresas || []).map((e) => {
    const quem = (colaboradores || []).filter((c) => c.empresa_ids.includes(e.id)).map((c) => c.name || c.email);
    return { razao_social: e.razao_social, cnpj_cpf: e.cnpj_cpf || e.id_empresa, colaboradores: quem.length ? quem.join(", ") : "Sem colaborador", total: quem.length };
  });
}

/** Clientes > Carteira e colaboradores: quais empresas cada colaborador atende, e as que ninguém atende. */
export default function CarteiraColaboradoresPagina() {
  const { user } = useAuth();
  const ehAdmin = user?.role === "admin";
  const colab = useQuery({ queryKey: ["carteira", "colaboradores"], queryFn: () => api.get("/carteira/colaboradores") });
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const ordenadas = useMemo(() => [...(emp.data || [])].sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR")), [emp.data]);
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Clientes", to: "/area/clientes" }, { label: "Carteira e colaboradores" }]}
        title="Carteira e colaboradores"
        actions={<BotaoExportar titulo="Empresas por colaborador" linhas={linhasDaCarteira(colab.data, ordenadas)} colunas={[{ chave: "razao_social", rotulo: "Empresa" }, { chave: "cnpj_cpf", rotulo: "CNPJ/CPF" }, { chave: "colaboradores", rotulo: "Colaboradores" }, { chave: "total", rotulo: "Quantos atendem" }]} />}
        subtitle={ehAdmin ? "Escolha um colaborador e marque as empresas que ele atende. As empresas sem ninguém aparecem na outra aba." : "Quais empresas cada colaborador atende. Só administradores alteram."}
      />
      <div className="px-6 lg:px-8 py-6">
        {(colab.isLoading || emp.isLoading) && <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
        {(colab.error || emp.error) && <p role="alert" className="text-sm">Não foi possível carregar.</p>}
        {colab.data && emp.data && (
          <Tabs defaultValue="colaborador" className="space-y-4">
            <TabsList><TabsTrigger value="colaborador">Por colaborador</TabsTrigger><TabsTrigger value="sem">Empresas sem colaborador</TabsTrigger></TabsList>
            <TabsContent value="colaborador"><PorColaborador colaboradores={colab.data} empresas={ordenadas} ehAdmin={ehAdmin} /></TabsContent>
            <TabsContent value="sem"><SemColaborador colaboradores={colab.data} ehAdmin={ehAdmin} /></TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
