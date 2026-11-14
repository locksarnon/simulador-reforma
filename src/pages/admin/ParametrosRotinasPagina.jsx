import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import AvisoDoModo from "@/components/monitoramento/AvisoDoModo";
import { useEstadoMonitoramento } from "@/lib/monitoramento";
import { useCarteiras } from "@/lib/useCarteiras";
import { naCarteira } from "@/lib/servicos";
import { plural } from "@/lib/plural";

const campo = "h-7 rounded-md border border-border bg-background px-1.5 text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const FREQUENCIAS = [["DESLIGADA", "Desligada"], ["DIARIA", "Todo dia"], ["SEMANAL", "Semanal"], ["MENSAL", "Mensal"]];
const PARA = { SIMPLES: "Simples Nacional", MEI: "MEI", NORMAL: "Presumido e Real" };
const CERTIDAO = { FEDERAL: "CND federal (Receita e PGFN)", ESTADUAL: "Certidão estadual", MUNICIPAL: "Certidão municipal", TRABALHISTA: "CNDT (trabalhista)", FGTS: "CRF (FGTS)" };

/** Texto da agenda (o mesmo do servidor). */
export function textoDaAgenda(a) {
  if (!a) return "";
  if (a.frequencia === "DIARIA") return "Todo dia";
  if (a.frequencia === "SEMANAL") return ["Toda segunda", "Toda terça", "Toda quarta", "Toda quinta", "Toda sexta", "Todo sábado", "Todo domingo"][a.dia - 1];
  if (a.frequencia === "MENSAL") return `Todo dia ${a.dia}`;
  return "Desligada";
}

/** Frequência e dia de uma agenda, lado a lado na linha da tabela. */
function EditorAgenda({ agenda, aoMudar, rotulo }) {
  const a = agenda || { frequencia: "DESLIGADA", dia: 1 };
  return (
    <span className="inline-flex items-center gap-1">
      <select className={campo} value={a.frequencia} aria-label={`Frequência: ${rotulo}`} onChange={(e) => { const f = e.target.value; aoMudar({ frequencia: f, dia: f === "SEMANAL" ? Math.min(a.dia, 7) : f === "MENSAL" ? Math.min(a.dia, 28) : 1 }); }}>
        {FREQUENCIAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
      {a.frequencia === "SEMANAL" && (
        <select className={campo} value={a.dia} aria-label={`Dia da semana: ${rotulo}`} onChange={(e) => aoMudar({ ...a, dia: Number(e.target.value) })}>
          {SEMANA.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
        </select>
      )}
      {a.frequencia === "MENSAL" && (
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">dia
          <input type="number" min={1} max={28} className={`${campo} w-14`} value={a.dia} aria-label={`Dia do mês: ${rotulo}`} onChange={(e) => aoMudar({ ...a, dia: Math.max(1, Math.min(28, Number(e.target.value) || 1)) })} />
        </label>
      )}
    </span>
  );
}

/**
 * Administração > Parâmetros e rotinas: quando cada serviço do monitoramento e cada documento (SPED, certidões) é atualizado
 * sozinho, com frequência e dia próprios, e o envio mensal das guias.
 */
export default function ParametrosRotinasPagina() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const estado = useEstadoMonitoramento();
  const rotina = useQuery({ queryKey: ["monitoramento", "rotina"], queryFn: () => api.get("/monitoramento/rotina"), enabled: user?.role === "admin" });
  const { empresas, mapa } = useCarteiras();
  const [edicao, setEdicao] = useState(null);
  const cfg = edicao ?? rotina.data ?? null;
  const setCfg = (f) => setEdicao((e) => (typeof f === "function" ? f(e ?? rotina.data) : f));
  const salvar = useMutation({
    mutationFn: () => api.put("/monitoramento/rotina", { ativa: cfg.ativa, guias: cfg.guias, servicos: cfg.servicos, documentos: cfg.documentos }),
    onSuccess: (c) => { setEdicao(null); qc.setQueryData(["monitoramento", "rotina"], { ...rotina.data, ...c }); toast({ title: "Rotinas salvas" }); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  const bpo = empresas.filter((e) => naCarteira(mapa.get(e.id)?.BPO_FISCAL));
  const guiasAgora = useMutation({
    mutationFn: () => api.post("/monitoramento/guias", { empresa_ids: bpo.map((e) => e.id), enviar_email: !!cfg?.guias?.enviar_email }),
    onSuccess: (r) => toast({ title: `${plural(r.geradas, "guia gerada", "guias geradas")}${r.enviadas ? `, ${plural(r.enviadas, "enviada", "enviadas")} por e-mail` : ""}${r.ja_enviadas ? `; ${plural(r.ja_enviadas, "já tinha sido enviada", "já tinham sido enviadas")} nesta competência` : ""}`, description: r.falhas.length ? `Sem guia: ${r.falhas.slice(0, 5).join("; ")}${r.falhas.length > 5 ? "…" : ""}` : undefined }),
    onError: (e) => toast({ title: "Não foi possível gerar", description: e.message, variant: "destructive" }),
  });
  const crumbs = [{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Parâmetros e rotinas" }];
  if (user?.role !== "admin") return <div><PageHeader crumbs={crumbs} title="Parâmetros e rotinas" /><p role="alert" className="p-8 text-sm">Somente administradores mudam as rotinas.</p></div>;
  const rotuloGrupo = new Map((estado.data?.grupos || []).map((g) => [g.id, g.rotulo]));
  const mudarServico = (k, a) => setCfg((c) => ({ ...c, servicos: { ...c.servicos, [k]: a } }));
  const mudarCertidao = (t, v) => setCfg((c) => ({ ...c, documentos: { ...c.documentos, certidoes: { ...c.documentos.certidoes, [t]: { ...c.documentos.certidoes[t], ...v } } } }));
  const ligados = cfg ? Object.values(cfg.servicos || {}).filter((a) => a.frequencia !== "DESLIGADA").length : 0;

  const colunasServicos = [
    { chave: "assunto", rotulo: "Assunto", valor: (l) => rotuloGrupo.get(l.grupo) || l.grupo },
    { chave: "rotulo", rotulo: "Serviço" },
    { chave: "para", rotulo: "Regime", valor: (l) => (l.para ? PARA[l.para] : "Todos") },
    { chave: "quando", rotulo: "Atualização", valor: (l) => textoDaAgenda(cfg.servicos?.[l.chave]), render: (l) => <EditorAgenda agenda={cfg.servicos?.[l.chave]} rotulo={l.rotulo} aoMudar={(a) => mudarServico(l.chave, a)} /> },
  ];
  const documentos = cfg?.documentos ? [
    { id: "sped", documento: "SPED e EFD (ECD, ECF, EFD ICMS/IPI, EFD Contribuições)", fonte: "Receita Federal (ReceitanetBX)", regra: "Consulta o ano e baixa os arquivos novos" },
    ...(cfg.certidoes || []).map((t) => ({ id: t, documento: CERTIDAO[t] || t, fonte: t === "FEDERAL" ? "Serpro (API Consulta CND)" : "Infosimples", regra: "Renova antes de vencer" })),
  ] : [];
  const certidao = (id) => cfg.documentos.certidoes?.[id];
  const colunasDocumentos = [
    { chave: "documento", rotulo: "Documento" },
    { chave: "fonte", rotulo: "Fonte" },
    { chave: "regra", rotulo: "Regra" },
    {
      chave: "quando", rotulo: "Atualização",
      valor: (l) => (l.id === "sped" ? textoDaAgenda(cfg.documentos.sped) : certidao(l.id)?.ativa ? `${certidao(l.id).dias_antes} dias antes do vencimento` : "Desligada"),
      render: (l) => (l.id === "sped"
        ? <EditorAgenda agenda={cfg.documentos.sped} rotulo={l.documento} aoMudar={(a) => setCfg((c) => ({ ...c, documentos: { ...c.documentos, sped: a } }))} />
        : (
          <span className="inline-flex items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!certidao(l.id)?.ativa} onChange={(e) => mudarCertidao(l.id, { ativa: e.target.checked })} aria-label={`Emitir sozinho: ${l.documento}`} />Emitir sozinho</label>
            <label className="inline-flex items-center gap-1 text-muted-foreground"><input type="number" min={0} max={60} className={`${campo} w-14`} disabled={!certidao(l.id)?.ativa} value={certidao(l.id)?.dias_antes ?? 15} onChange={(e) => mudarCertidao(l.id, { dias_antes: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} aria-label={`Dias antes do vencimento: ${l.documento}`} />dias antes do vencimento</label>
          </span>
        )),
    },
  ];

  return (
    <div>
      <PageHeader crumbs={crumbs} title="Parâmetros e rotinas" />
      <div className="px-6 lg:px-8 py-5 space-y-4">
        <AvisoDoModo modo={estado.data?.modo} ehAdmin />
        {!cfg ? <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p> : (
          <>
            <section className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="flex-1 font-heading text-sm font-semibold">Monitoramento fiscal: atualização por serviço</h2>
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!cfg.ativa} onChange={(e) => setCfg((c) => ({ ...c, ativa: e.target.checked }))} /> Atualização automática ligada</label>
              </div>
              <p className="text-xs text-muted-foreground">Roda às 06:30 (Brasília) nos clientes com BPO fiscal ativo, só nos serviços do regime de cada um. {plural(ligados, "serviço agendado", "serviços agendados")}. Cada consulta tem custo no Serpro.</p>
              <TabelaPadrao id="admin:rotina-servicos" ariaLabel="Atualização por serviço" colunas={colunasServicos} linhas={cfg.agendaveis || []} chaveLinha={(l) => l.chave} tamanhoInicial={100} />
            </section>
            <section className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
              <h2 className="font-heading text-sm font-semibold">Documentos: atualização por documento</h2>
              <p className="text-xs text-muted-foreground">SPED às 05:40 e certidões às 06:45 (Brasília), nos clientes com BPO fiscal ativo.</p>
              <TabelaPadrao id="admin:rotina-documentos" ariaLabel="Atualização por documento" colunas={colunasDocumentos} linhas={documentos} ordemInicial={null} tamanhoInicial={25} />
            </section>
            <section className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
              <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={!!cfg.guias?.ativa} onChange={(e) => setCfg((c) => ({ ...c, guias: { ...c.guias, ativa: e.target.checked } }))} /> Gerar as guias todo mês</label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1">Dia <input type="number" min={1} max={28} className={`${campo} w-14`} value={cfg.guias?.dia ?? 10} onChange={(e) => setCfg((c) => ({ ...c, guias: { ...c.guias, dia: Math.max(1, Math.min(28, Number(e.target.value) || 1)) } }))} /></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!cfg.guias?.enviar_email} onChange={(e) => setCfg((c) => ({ ...c, guias: { ...c.guias, enviar_email: e.target.checked } }))} /> Enviar ao e-mail de contato do cliente</label>
              </div>
              <button type="button" onClick={() => guiasAgora.mutate()} disabled={guiasAgora.isPending || !bpo.length || estado.data?.modo === "DESLIGADO"} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-60">{guiasAgora.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Gerar as guias agora ({plural(bpo.length, "cliente", "clientes")})</button>
            </section>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending || !edicao} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar</button>
              <Link to="/bpo/monitoramento" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Ir para o monitoramento</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
