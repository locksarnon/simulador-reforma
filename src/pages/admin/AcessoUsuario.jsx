import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/PageHeader";
import { AREAS } from "@/lib/navegacao";
import { FUNCOES, NIVEIS, TELAS, nivelPorId, normalizarExcecoes, permissoesEfetivas } from "@/lib/permissoes";

const marca = "ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300";
const botaoLeve = "botao-acao rounded-md px-2 py-px text-xs hover:bg-muted disabled:opacity-50";
const vazias = () => ({ telas: {}, funcoes: {} });

/** Caixa de marcar com estado parcial (algumas marcadas). */
function CaixaTriestado({ marcadas, total, disabled, aoMudar, rotulo }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = marcadas > 0 && marcadas < total; }, [marcadas, total]);
  return <input ref={ref} type="checkbox" aria-label={rotulo} disabled={disabled} checked={total > 0 && marcadas === total} onChange={(e) => aoMudar(e.target.checked)} className="h-4 w-4" />;
}

/**
 * O acesso de uma pessoa, em tela cheia: o nível (cartões com a descrição), as telas por área do menu e as funções. Marcar ou desmarcar
 * tudo no geral, por área e nas funções; o que difere do sugerido fica marcado; "Voltar ao sugerido" limpa as exceções. Administrador tem
 * tudo e não tem exceções.
 */
export function ConteudoAcesso({ dados, eu, salvando, aoSalvar, aoCancelar }) {
  const [nivel, setNivel] = useState(dados.nivel);
  const [excecoes, setExcecoes] = useState(() => normalizarExcecoes(dados.excecoes, dados.nivel));
  const admin = nivel === "ADMINISTRADOR";
  const proprioAdmin = eu && dados.nivel === "ADMINISTRADOR";
  const efetivas = permissoesEfetivas({ role: admin ? "admin" : "user", nivel, excecoes });
  const diferentes = Object.keys(excecoes.telas).length + Object.keys(excecoes.funcoes).length;
  const alterado = nivel !== dados.nivel || JSON.stringify(excecoes) !== JSON.stringify(normalizarExcecoes(dados.excecoes, dados.nivel));

  const trocarNivel = (n) => { setNivel(n); setExcecoes((e) => normalizarExcecoes(e, n)); };
  const marcarVarios = (grupo, ids, valor) => setExcecoes((e) => normalizarExcecoes({ ...e, [grupo]: { ...e[grupo], ...Object.fromEntries(ids.map((id) => [id, valor])) } }, nivel));
  const areas = AREAS.map((a) => ({ ...a, telas: TELAS.filter((t) => t.area === a.id) })).filter((a) => a.telas.length);
  const todasTelas = TELAS.map((t) => t.id);
  const todasFuncoes = FUNCOES.map((f) => f.id);
  const telasMarcadas = efetivas.telas.filter((id) => todasTelas.includes(id)).length;

  return (
    <form onSubmit={(e) => { e.preventDefault(); aoSalvar({ nivel, excecoes: admin ? vazias() : excecoes }); }} className="space-y-5 text-sm">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-1 py-2 backdrop-blur">
        <span className="flex-1 text-xs text-muted-foreground">
          {admin ? "Administrador: tudo liberado." : `${telasMarcadas} de ${todasTelas.length} telas · ${efetivas.funcoes.length} de ${todasFuncoes.length} funções`}
          {!admin && diferentes > 0 && <span className={marca}>{diferentes} diferente{diferentes > 1 ? "s" : ""} do sugerido</span>}
        </span>
        <button type="button" disabled={admin || !diferentes} onClick={() => setExcecoes(vazias())} className="botao-acao inline-flex items-center gap-1.5 rounded-md px-3 py-[5px] hover:bg-muted disabled:opacity-50">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Voltar ao sugerido
        </button>
        {aoCancelar && <button type="button" onClick={aoCancelar} className="botao-acao rounded-md px-3 py-[5px] hover:bg-muted">Voltar à lista</button>}
        <button type="submit" disabled={salvando || !alterado} className="botao-acao inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1 font-medium text-primary-foreground disabled:opacity-60">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar
        </button>
      </div>

      <section aria-labelledby="acesso-nivel" className="space-y-2">
        <h2 id="acesso-nivel" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nível</h2>
        <div role="radiogroup" aria-label="Nível" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {NIVEIS.map((n) => {
            const ativo = nivel === n.id;
            return (
              <button key={n.id} type="button" role="radio" aria-checked={ativo} disabled={proprioAdmin && n.id !== "ADMINISTRADOR"} onClick={() => trocarNivel(n.id)}
                className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${ativo ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                <span className="flex items-center justify-between gap-2 font-medium">{n.rotulo}{ativo && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{n.descricao}</span>
              </button>
            );
          })}
        </div>
        {proprioAdmin && <p className="text-xs text-muted-foreground">Você não pode tirar o próprio acesso de administrador.</p>}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="acesso-telas" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="acesso-telas" className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telas</h2>
            <button type="button" disabled={admin} onClick={() => marcarVarios("telas", todasTelas, true)} className={botaoLeve}>Marcar todas</button>
            <button type="button" disabled={admin} onClick={() => marcarVarios("telas", todasTelas, false)} className={botaoLeve}>Desmarcar todas</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {areas.map((a) => {
              const ids = a.telas.map((t) => t.id);
              const marcadas = ids.filter((id) => efetivas.telas.includes(id)).length;
              return (
                <fieldset key={a.id} className="rounded-lg border border-border bg-card px-3 py-2">
                  <legend className="sr-only">{a.titulo}</legend>
                  <div className="mb-1.5 flex items-center gap-2 border-b border-border/60 pb-1.5">
                    <CaixaTriestado marcadas={marcadas} total={ids.length} disabled={admin} rotulo={`Todas as telas de ${a.titulo}`} aoMudar={(v) => marcarVarios("telas", ids, v)} />
                    <span className="flex-1 text-sm font-medium">{a.titulo}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{marcadas}/{ids.length}</span>
                  </div>
                  <div className="space-y-1">
                    {a.telas.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 pl-0.5">
                        <input type="checkbox" className="h-4 w-4" disabled={admin} checked={efetivas.telas.includes(t.id)} onChange={(e) => marcarVarios("telas", [t.id], e.target.checked)} />
                        <span>{t.titulo}{t.id in excecoes.telas && <span className={marca}>diferente do sugerido</span>}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="acesso-funcoes" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="acesso-funcoes" className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funções</h2>
            <button type="button" disabled={admin} onClick={() => marcarVarios("funcoes", todasFuncoes, true)} className={botaoLeve}>Ligar todas</button>
            <button type="button" disabled={admin} onClick={() => marcarVarios("funcoes", todasFuncoes, false)} className={botaoLeve}>Desligar todas</button>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {FUNCOES.map((f) => {
              const ligada = efetivas.funcoes.includes(f.id);
              return (
                <li key={f.id} className="flex items-start gap-3 px-3 py-2">
                  <button type="button" role="switch" aria-checked={ligada} aria-label={f.rotulo} disabled={admin} onClick={() => marcarVarios("funcoes", [f.id], !ligada)}
                    className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${ligada ? "bg-primary" : "bg-muted-foreground/30"}`}>
                    <span className={`h-4 w-4 rounded-full bg-background shadow transition-transform ${ligada ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                  <span><span className="font-medium">{f.rotulo}</span>{f.id in excecoes.funcoes && <span className={marca}>diferente do sugerido</span>}<span className="block text-xs text-muted-foreground">{f.descricao}</span></span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </form>
  );
}

/** Administração > Usuários e acessos > pessoa: o acesso em tela cheia (GET/PUT /usuarios/:id/acesso). */
export default function AcessoUsuarioPagina() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const acesso = useQuery({ queryKey: ["usuarios", id, "acesso"], queryFn: () => api.get(`/usuarios/${id}/acesso`), enabled: !!id });
  const salvar = useMutation({
    mutationFn: (corpo) => api.put(`/usuarios/${id}/acesso`, corpo),
    onSuccess: (r) => {
      qc.setQueryData(["usuarios", id, "acesso"], r);
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast({ title: "Acesso salvo", description: "Vale a partir do próximo clique da pessoa." });
    },
    onError: (e) => toast({ title: "Não foi possível salvar o acesso", description: e.message, variant: "destructive" }),
  });
  const d = acesso.data;
  const nome = d?.name || d?.email || "Usuário";
  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Usuários e acessos", to: "/admin/usuarios" }, { label: nome }]}
        title={`Acesso de ${nome}`} subtitle={d ? `${d.email} · nível ${nivelPorId(d.nivel)?.rotulo ?? d.nivel}. O nível traz as telas e funções sugeridas; ajuste só o que for diferente para esta pessoa.` : undefined} />
      <div className="px-6 lg:px-8 py-4">
        {acesso.isLoading && <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
        {acesso.error && <p role="alert" className="py-8 text-center text-sm">Não foi possível carregar. <button type="button" onClick={() => acesso.refetch()} className="text-primary hover:underline">Tentar de novo</button></p>}
        {d && <ConteudoAcesso key={d.nivel + JSON.stringify(d.excecoes)} dados={d} eu={d.id === user?.id} salvando={salvar.isPending} aoSalvar={(c) => salvar.mutate(c)} aoCancelar={() => navigate("/admin/usuarios")} />}
      </div>
    </div>
  );
}
