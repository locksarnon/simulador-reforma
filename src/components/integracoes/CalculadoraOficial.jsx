import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import BuscaNaTabela from "@/components/BuscaNaTabela";

const dataBr = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const ETAPAS = {
  CONSTRUINDO: "Montando a versão nova no servidor…",
  CONFERINDO: "Rodando a bateria de conferência (792 casos e a base de 2026 a 2033)…",
  AGUARDANDO_CONFIRMACAO: "A versão nova calcula diferente em alguns casos. Confira a lista e confirme a troca.",
  TROCANDO: "Trocando para a versão nova…",
  CONCLUIDA: "Versão nova em uso.",
  ERRO: "A atualização não foi concluída; a versão anterior continua em uso.",
};

const SO_INFORMA = new Set(["cClassTrib só no InTAX", "cClassTrib só na calculadora", "Vínculo da calculadora ausente no InTAX"]);

/** Resultado da comparação das tabelas do InTAX com as da calculadora: contagem por tipo e a lista de cada tipo. */
export function ComparacaoTabelas({ c }) {
  const grupos = Object.entries(c.resumo ?? {}).sort(([a], [b]) => Number(SO_INFORMA.has(a)) - Number(SO_INFORMA.has(b)));
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-muted-foreground">Comparação das tabelas do InTAX com as da calculadora ({c.versao_db ?? "—"}), feita em {dataBr(c.comparado_em)}. A calculadora não troca as tabelas do InTAX: só aponta o que difere, e a fonte que vale é a tabela oficial do Portal da Conformidade Fácil.</p>
      {grupos.length === 0 ? <p>Nenhuma diferença.</p> : grupos.map(([g, n]) => (
        <details key={g} className="rounded-md border border-border">
          <summary className="cursor-pointer px-3 py-1.5">{g}: <strong>{n}</strong>{SO_INFORMA.has(g) ? " (informativo)" : ""}</summary>
          <div className="max-h-56 overflow-auto border-t border-border">
            <table className="w-full text-xs"><thead className="sticky top-0"><tr className="text-left"><th scope="col" className="p-1.5">Item</th><th scope="col" className="p-1.5">InTAX</th><th scope="col" className="p-1.5">Calculadora</th><th scope="col" className="p-1.5">Observação</th></tr></thead><tbody>{c.lista.filter((d) => d.grupo === g).map((d, i) => (
              <tr key={i} className="border-t border-border/60 first:border-0"><td className="p-1.5 whitespace-nowrap">{d.chave}</td><td className="p-1.5">InTAX: {d.intax}</td><td className="p-1.5">Calculadora: {d.oficial}</td><td className="p-1.5 text-muted-foreground">{d.observacao ?? ""}</td></tr>
            ))}</tbody></table>
          </div>
        </details>
      ))}
    </div>
  );
}

/** Administração > Integrações: a calculadora oficial da Receita (régua de conferência do InTAX), a versão e a atualização. */
export default function CalculadoraOficial() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["calculadora-rfb"],
    queryFn: () => api.get("/integracoes/calculadora-rfb"),
    refetchInterval: (query) => (["CONSTRUINDO", "CONFERINDO", "TROCANDO"].includes(query.state.data?.atualizacao?.situacao?.etapa) || query.state.data?.atualizacao?.pedido ? 15000 : false),
  });
  const aoErro = (e) => toast({ title: "Não foi possível concluir", description: e.message, variant: "destructive" });
  const github = useMutation({ mutationFn: () => api.post("/integracoes/calculadora-rfb/conferir-github", {}), onSuccess: (d) => qc.setQueryData(["calculadora-rfb"], d), onError: aoErro });
  const atualizar = useMutation({
    mutationFn: (confirmar) => api.post("/integracoes/calculadora-rfb/atualizar", { confirmar }),
    onSuccess: (d) => { qc.setQueryData(["calculadora-rfb"], d); toast({ title: "Pedido registrado", description: "O servidor monta a versão nova e roda a conferência; acompanhe aqui." }); },
    onError: aoErro,
  });
  const e = q.data;
  const etapa = e?.atualizacao?.situacao?.etapa;
  const bateria = e?.atualizacao?.bateria;
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3 md:col-span-2 xl:col-span-3" aria-label="Calculadora oficial da Receita">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-heading text-sm font-semibold">Calculadora oficial da Receita (CBS, IBS e Imposto Seletivo)</h2>
        {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : (
          <span className={`text-xs font-medium ${e?.no_ar ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{e?.no_ar ? "Ligada" : "Fora do ar"}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Régua de conferência: as notas, a classificação dos produtos e o motor do simulador são conferidos com o código oficial da Receita, que roda no servidor do InTAX sem acesso externo.</p>
      {q.error && <p role="alert" className="text-sm">Não foi possível ler o estado da calculadora.</p>}
      {e && (
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Versão em uso</dt><dd>{e.versao ? `${e.versao.versaoApp} · banco ${e.versao.versaoDb} (${dia(e.versao.dataVersaoDb)})` : "—"}{e.commit ? ` · ${e.commit}` : ""}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Tabelas oficiais no InTAX</dt><dd>{e.tabelas ? `${e.tabelas.classes} classificações e ${e.tabelas.vinculos} vínculos NCM/NBS, copiados em ${dataBr(e.tabelas.importado_em)}` : "Ainda não copiadas"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Última versão no GitHub da Receita</dt><dd>{e.github?.commit ? `${e.github.commit} de ${dia(e.github.data)}` : "Não conferida"}{e.github?.verificado_em ? ` · conferido em ${dataBr(e.github.verificado_em)}` : ""}{e.github?.erro ? ` · última conferência falhou: ${e.github.erro}` : ""}</dd></div>
        </dl>
      )}
      {e?.comparacao && <ComparacaoTabelas c={e.comparacao} />}
      {etapa && <p className="text-sm" aria-live="polite">{ETAPAS[etapa] ?? etapa}{e.atualizacao.situacao.mensagem ? ` ${e.atualizacao.situacao.mensagem}` : ""}</p>}
      {etapa === "AGUARDANDO_CONFIRMACAO" && bateria && (
        <div className="space-y-2">
          <p className="text-sm">{bateria.diferencas} de {bateria.casos} casos mudam ({bateria.versao_antes?.versaoDb ?? "—"} → {bateria.versao_depois?.versaoDb ?? "—"}).</p>
          <BuscaNaTabela />
          <div className="max-h-64 overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 text-left"><tr><th className="p-2">Caso</th><th className="p-2">Antes</th><th className="p-2">Depois</th></tr></thead>
              <tbody>{bateria.lista.map((d) => (
                <tr key={d.caso} className="border-t border-border/60 align-top"><td className="p-2 whitespace-nowrap">{d.caso}</td><td className="p-2 font-mono break-all">{JSON.stringify(d.antes)}</td><td className="p-2 font-mono break-all">{JSON.stringify(d.depois)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <button type="button" disabled={atualizar.isPending} onClick={() => atualizar.mutate(true)} className="botao-acao rounded-md px-3 py-[5px] text-sm hover:bg-muted">Confirmar troca</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={github.isPending} onClick={() => github.mutate()} className="botao-acao rounded-md px-3 py-[5px] text-sm hover:bg-muted">{github.isPending ? "Conferindo…" : "Conferir no GitHub"}</button>
        {e?.versao_nova && !e?.atualizacao?.pedido && (
          <button type="button" disabled={atualizar.isPending} onClick={() => atualizar.mutate(false)} className="botao-acao rounded-md px-3 py-[5px] text-sm text-primary hover:bg-primary/10">Aplicar versão nova</button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Toda segunda às 06:40 o InTAX confere no <a className="underline" href={e?.fonte ?? "https://github.com/ReceitaFederal/calculadora-rtc-regime-regular"} target="_blank" rel="noreferrer">GitHub da Receita</a> se saiu versão nova. Ao aplicar, o servidor monta a versão nova, roda a mesma bateria nas duas e só troca sozinho se nada mudar; se mudar, mostra a lista e espera a sua confirmação. Código da Receita Federal sob licença MIT.</p>
    </section>
  );
}
