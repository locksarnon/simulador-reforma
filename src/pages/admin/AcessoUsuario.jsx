import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AREAS } from "@/lib/navegacao";
import { FUNCOES, NIVEIS, TELAS, nivelPorId, normalizarExcecoes, permissoesEfetivas } from "@/lib/permissoes";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const marca = "ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300";
const vazias = () => ({ telas: {}, funcoes: {} });

/**
 * O conteúdo do painel "Acesso de <nome>": nível (com a descrição), telas por área do menu e funções. O que difere do sugerido pelo nível
 * fica marcado; "Voltar ao sugerido" limpa as exceções. Administrador tem tudo e não tem exceções.
 */
export function ConteudoAcesso({ dados, eu, salvando, aoSalvar, aoCancelar }) {
  const [nivel, setNivel] = useState(dados.nivel);
  const [excecoes, setExcecoes] = useState(() => normalizarExcecoes(dados.excecoes, dados.nivel));
  const admin = nivel === "ADMINISTRADOR";
  const proprioAdmin = eu && dados.nivel === "ADMINISTRADOR";
  const sugerido = nivelPorId(nivel);
  const efetivas = permissoesEfetivas({ role: admin ? "admin" : "user", nivel, excecoes });
  const diferentes = Object.keys(excecoes.telas).length + Object.keys(excecoes.funcoes).length;

  const trocarNivel = (n) => { setNivel(n); setExcecoes((e) => normalizarExcecoes(e, n)); };
  const marcar = (grupo, id, valor) => setExcecoes((e) => normalizarExcecoes({ ...e, [grupo]: { ...e[grupo], [id]: valor } }, nivel));
  const areas = AREAS.map((a) => ({ ...a, telas: TELAS.filter((t) => t.area === a.id) })).filter((a) => a.telas.length);

  return (
    <form onSubmit={(e) => { e.preventDefault(); aoSalvar({ nivel, excecoes: admin ? vazias() : excecoes }); }} className="space-y-5 text-sm">
      <section aria-labelledby="acesso-nivel" className="space-y-1.5">
        <h3 id="acesso-nivel" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nível</h3>
        <select aria-label="Nível" className={campo} value={nivel} disabled={proprioAdmin} onChange={(e) => trocarNivel(e.target.value)}>
          {NIVEIS.map((n) => <option key={n.id} value={n.id}>{n.rotulo}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">{sugerido?.descricao}</p>
        {proprioAdmin && <p className="text-xs text-muted-foreground">Você não pode tirar o próprio acesso de administrador.</p>}
      </section>

      <section aria-labelledby="acesso-telas" className="space-y-2">
        <h3 id="acesso-telas" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telas</h3>
        {areas.map((a) => (
          <fieldset key={a.id} className="rounded-md border border-border/70 px-3 py-2">
            <legend className="px-1 text-xs font-medium">{a.titulo}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {a.telas.map((t) => {
                const difere = t.id in excecoes.telas;
                return (
                  <label key={t.id} className="flex items-center gap-2">
                    <input type="checkbox" disabled={admin} checked={efetivas.telas.includes(t.id)} onChange={(e) => marcar("telas", t.id, e.target.checked)} />
                    <span>{t.titulo}{difere && <span className={marca}>diferente do sugerido</span>}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </section>

      <section aria-labelledby="acesso-funcoes" className="space-y-2">
        <h3 id="acesso-funcoes" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funções</h3>
        <ul className="space-y-1.5">
          {FUNCOES.map((f) => {
            const ligada = efetivas.funcoes.includes(f.id);
            const difere = f.id in excecoes.funcoes;
            return (
              <li key={f.id} className="flex items-start gap-3">
                <button type="button" role="switch" aria-checked={ligada} aria-label={f.rotulo} disabled={admin} onClick={() => marcar("funcoes", f.id, !ligada)}
                  className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${ligada ? "bg-primary" : "bg-muted-foreground/30"}`}>
                  <span className={`h-4 w-4 rounded-full bg-background shadow transition-transform ${ligada ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <span><span className="font-medium">{f.rotulo}</span>{difere && <span className={marca}>diferente do sugerido</span>}<span className="block text-xs text-muted-foreground">{f.descricao}</span></span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <button type="button" disabled={admin || !diferentes} onClick={() => setExcecoes(vazias())} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Voltar ao sugerido
        </button>
        <div className="flex gap-2">
          {aoCancelar && <button type="button" onClick={aoCancelar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>}
          <button type="submit" disabled={salvando} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar
          </button>
        </div>
      </div>
    </form>
  );
}

/** Painel lateral com o acesso de uma pessoa (GET/PUT /usuarios/:id/acesso). */
export default function AcessoUsuario({ usuario, eu, aoFechar }) {
  const qc = useQueryClient();
  const acesso = useQuery({ queryKey: ["usuarios", usuario?.id, "acesso"], queryFn: () => api.get(`/usuarios/${usuario.id}/acesso`), enabled: !!usuario });
  const salvar = useMutation({
    mutationFn: (corpo) => api.put(`/usuarios/${usuario.id}/acesso`, corpo),
    onSuccess: (r) => {
      qc.setQueryData(["usuarios", usuario.id, "acesso"], r);
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast({ title: "Acesso salvo", description: "Vale a partir do próximo clique da pessoa." });
      aoFechar();
    },
    onError: (e) => toast({ title: "Não foi possível salvar o acesso", description: e.message, variant: "destructive" }),
  });
  const nome = usuario?.name || usuario?.email;
  return (
    <Sheet open={!!usuario} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Acesso de {nome}</SheetTitle>
          <SheetDescription>O nível traz as telas e funções sugeridas; marque só o que for diferente para esta pessoa.</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {acesso.isLoading && <p className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
          {acesso.error && <p role="alert" className="py-6 text-center text-sm">Não foi possível carregar. <button type="button" onClick={() => acesso.refetch()} className="text-primary hover:underline">Tentar de novo</button></p>}
          {acesso.data && <ConteudoAcesso key={acesso.data.nivel + JSON.stringify(acesso.data.excecoes)} dados={acesso.data} eu={eu} salvando={salvar.isPending} aoSalvar={(c) => salvar.mutate(c)} aoCancelar={aoFechar} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
