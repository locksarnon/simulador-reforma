import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import PageHeader from "@/components/PageHeader";
import TagChip from "@/components/clientes/TagChip";
import { CORES_DAS_TAGS } from "@/lib/tags";
import { useTags } from "@/lib/useTags";
import { plural } from "@/lib/plural";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Cores({ valor, aoMudar, rotulo }) {
  return (
    <div className="flex gap-1.5" role="group" aria-label={rotulo}>
      {CORES_DAS_TAGS.map((c) => (
        <button key={c} type="button" aria-pressed={valor === c} aria-label={`Cor ${c}`} onClick={() => aoMudar(c)} className={`h-6 w-6 rounded-full border-2 ${valor === c ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

/** Painel de uma etiqueta: nome, cor e as empresas que a têm. */
export function PainelDaEtiqueta({ tag, empresas, porEmpresa, ehAdmin, aoApagada }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [nome, setNome] = useState(tag.nome);
  const [cor, setCor] = useState(tag.cor);
  const salvasIds = useMemo(() => empresas.filter((e) => (porEmpresa?.[e.id] || []).includes(tag.id)).map((e) => e.id), [empresas, porEmpresa, tag.id]);
  const [marcadas, setMarcadas] = useState(null);
  const [busca, setBusca] = useState("");
  const selecionadas = marcadas ?? salvasIds;
  const recarregar = () => qc.invalidateQueries({ queryKey: ["tags"] });
  const falha = (titulo) => (e) => toast({ title: titulo, description: e.message, variant: "destructive" });
  const lista = useMemo(() => {
    const t = semAcento(busca).trim();
    return empresas.filter((e) => !t || semAcento(e.razao_social).includes(t) || semAcento(e.id_empresa).includes(t));
  }, [empresas, busca]);

  const salvarDados = useMutation({
    mutationFn: () => api.put(`/tags/${tag.id}`, { nome, cor }),
    onSuccess: () => { toast({ title: "Etiqueta salva" }); recarregar(); },
    onError: falha("Não foi possível salvar"),
  });
  const salvarEmpresas = useMutation({
    mutationFn: () => api.post("/tags/aplicar", { tag_id: tag.id, empresa_ids: selecionadas, modo: "definir" }),
    onSuccess: (r) => { toast({ title: "Empresas salvas", description: `${plural(r.total, "empresa", "empresas")} com a etiqueta ${tag.nome}.` }); setMarcadas(null); recarregar(); },
    onError: falha("Não foi possível salvar as empresas"),
  });
  const apagar = useMutation({
    mutationFn: () => api.delete(`/tags/${tag.id}`),
    onSuccess: () => { toast({ title: "Etiqueta apagada" }); recarregar(); aoApagada(); },
    onError: falha("Não foi possível apagar"),
  });
  const alternar = (id) => setMarcadas((m) => { const base = new Set(m ?? salvasIds); if (base.has(id)) base.delete(id); else base.add(id); return [...base]; });
  const mudouDados = nome.trim() !== tag.nome || cor !== tag.cor;
  const entram = selecionadas.filter((id) => !salvasIds.includes(id)).length;
  const saem = salvasIds.filter((id) => !selecionadas.includes(id)).length;
  const confirmarApagar = async () => {
    if (await confirmar({ titulo: `Apagar a etiqueta "${tag.nome}"?`, descricao: `Ela sai de ${plural(tag.empresas, "empresa", "empresas")}. As empresas não são apagadas.`, rotulo: "Apagar" })) apagar.mutate();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); if (mudouDados && nome.trim()) salvarDados.mutate(); }} className="flex flex-wrap items-end gap-3 text-sm">
        <label className="space-y-1 flex-1 min-w-[180px]"><span className="block text-xs text-muted-foreground">Nome</span><input className={`${campo} w-full`} value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} /></label>
        <div className="space-y-1"><span className="block text-xs text-muted-foreground">Cor</span><Cores valor={cor} aoMudar={setCor} rotulo="Cor da etiqueta" /></div>
        <button type="submit" disabled={!mudouDados || !nome.trim() || salvarDados.isPending} className="rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">Salvar</button>
        {ehAdmin && <button type="button" onClick={confirmarApagar} className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Apagar</button>}
      </form>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <h2 className="font-heading text-sm font-semibold">Empresas com esta etiqueta</h2>
          <label className="ml-auto space-y-1 min-w-[200px]"><span className="sr-only">Buscar empresa</span><input type="search" placeholder="Buscar empresa" className={`${campo} w-full`} value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
          <button type="button" disabled={(entram === 0 && saem === 0) || salvarEmpresas.isPending} onClick={() => salvarEmpresas.mutate()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">
            {salvarEmpresas.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar empresas
          </button>
        </div>
        {(entram > 0 || saem > 0) && <p role="status" className="text-xs text-muted-foreground">Ainda não salvo: {entram} recebem a etiqueta e {saem} perdem.</p>}
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-[13px] leading-5" aria-label={`Empresas da etiqueta ${tag.nome}`}>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className="border-b border-border/60">
                  <td className="w-8 py-1.5 pr-2"><input type="checkbox" checked={selecionadas.includes(e.id)} onChange={() => alternar(e.id)} aria-label={`${e.razao_social} com a etiqueta ${tag.nome}`} /></td>
                  <td className="py-1.5"><p className="font-medium">{e.razao_social}</p><p className="text-[11px] text-muted-foreground tabular-nums">{e.cnpj_cpf || e.id_empresa}</p></td>
                </tr>
              ))}
              {lista.length === 0 && <tr><td className="py-6 text-center text-muted-foreground">Nenhuma empresa encontrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Clientes > Etiquetas: segmentos e perfis que a equipe usa para filtrar e agrupar as empresas. */
export default function TagsPagina() {
  const { user } = useAuth();
  const ehAdmin = user?.role === "admin";
  const qc = useQueryClient();
  const { tags, porEmpresa, carregando, erro } = useTags();
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const empresas = useMemo(() => [...(emp.data || [])].sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR")), [emp.data]);
  const [escolhida, setEscolhida] = useState("");
  const [nova, setNova] = useState({ nome: "", cor: CORES_DAS_TAGS[0] });
  const atual = tags.find((t) => t.id === escolhida);
  const criar = useMutation({
    mutationFn: () => api.post("/tags", nova),
    onSuccess: (t) => { setNova((n) => ({ ...n, nome: "" })); setEscolhida(t.id); qc.invalidateQueries({ queryKey: ["tags"] }); toast({ title: "Etiqueta criada", description: t.nome }); },
    onError: (e) => toast({ title: "Não foi possível criar", description: e.message, variant: "destructive" }),
  });

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Clientes", to: "/area/clientes" }, { label: "Etiquetas" }]}
        title="Etiquetas"
      />
      <div className="px-6 lg:px-8 py-6 grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <form onSubmit={(e) => { e.preventDefault(); if (nova.nome.trim()) criar.mutate(); }} className="rounded-xl border border-border bg-card p-3 space-y-2 text-sm">
            <p className="text-xs font-medium">Nova etiqueta</p>
            <input className={`${campo} w-full`} value={nova.nome} maxLength={40} onChange={(e) => setNova((n) => ({ ...n, nome: e.target.value }))} placeholder="Nome da etiqueta" aria-label="Nome da nova etiqueta" />
            <Cores valor={nova.cor} aoMudar={(c) => setNova((n) => ({ ...n, cor: c }))} rotulo="Cor da nova etiqueta" />
            <button type="submit" disabled={!nova.nome.trim() || criar.isPending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-60"><Plus className="h-4 w-4" aria-hidden="true" /> Criar etiqueta</button>
          </form>
          {carregando && <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
          {erro && <p role="alert" className="text-sm">Não foi possível carregar as etiquetas.</p>}
          {!carregando && !erro && tags.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nenhuma etiqueta.</p>}
          <ul className="space-y-1" aria-label="Etiquetas">
            {tags.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => setEscolhida(t.id)} aria-pressed={escolhida === t.id} className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${escolhida === t.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50"}`}>
                  <TagChip tag={t} />
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{plural(t.empresas, "empresa", "empresas")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          {atual
            ? <PainelDaEtiqueta key={atual.id} tag={atual} empresas={empresas} porEmpresa={porEmpresa} ehAdmin={ehAdmin} aoApagada={() => setEscolhida("")} />
            : <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Escolha uma etiqueta.</p>}
        </div>
      </div>
    </div>
  );
}
