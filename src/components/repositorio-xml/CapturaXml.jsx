import React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Play } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import InterruptorCaptura from "@/components/repositorio-xml/InterruptorCaptura";
import TabelaPadrao from "@/components/TabelaPadrao";
import { base, fmtDataHora, UFS, UFS_FOCO } from "./formatos";

const ROTULO = { NFE: "NF-e", CTE: "CT-e", NFSE: "NFS-e" };
const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

function Requisito({ ok, texto }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" /> : <CircleDashed className="w-4 h-4 text-amber-600" aria-hidden="true" />}
      <span className={ok ? "" : "text-amber-800 dark:text-amber-300"}>{texto}</span>
    </li>
  );
}

/**
 * Captura de XML do cliente: ligar ou desligar, a situação de cada tipo e o "Capturar agora". Período, tipos de documento e Ciência
 * da Operação são uma regra só para todos os clientes (Administração > Integrações > Captura de XML).
 */
export default function CapturaXml({ empresaId }) {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const confirmar = useConfirmar();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["repo-xml-captura", empresaId], queryFn: () => api.get(`${base(empresaId)}/captura`), refetchInterval: 30000 });
  const atualizar = () => { qc.invalidateQueries({ queryKey: ["repo-xml-captura", empresaId] }); qc.invalidateQueries({ queryKey: ["repo-xml-docs", empresaId] }); qc.invalidateQueries({ queryKey: ["repo-xml-resumo", empresaId] }); qc.invalidateQueries({ queryKey: ["captura-xml", "empresas"] }); };
  const executar = useMutation({
    mutationFn: (tipo) => api.post(`${base(empresaId)}/captura/tipos/${tipo}/executar`),
    onSuccess: (r) => { atualizar(); toast({ title: "Captura executada", description: r.mensagem }); },
    onError: (e) => { atualizar(); toast({ title: "Não foi possível capturar agora", description: e.message, variant: "destructive" }); },
  });
  const ambiente = useMutation({
    mutationFn: (v) => api.put(`${base(empresaId)}/captura/ambiente`, v),
    onSuccess: () => { atualizar(); toast({ title: "Ambiente atualizado" }); },
    onError: (e) => toast({ title: "Não foi possível alterar", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</p>;
  const ligada = (data?.tipos || []).some((t) => t.ativo);

  return (
    <div className="space-y-4">
      {data && data.agendador_ativo === false && (
        <div role="note" className="rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
          <p>Agendador desligado neste servidor: só o "Capturar agora" funciona.</p>
        </div>
      )}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="flex-1 font-semibold text-sm">Captura de XML</h3>
          <InterruptorCaptura empresaId={empresaId} ligada={ligada} certificadoOk={!!data?.requisitos?.certificado_ativo} aoMudar={atualizar} />
        </div>
        <p className="text-xs text-muted-foreground">Período: {data?.periodo?.texto}. {admin && <Link to="/admin/integracoes" className="text-primary hover:underline">Configuração da captura</Link>}</p>
        <ul className="space-y-1.5">
          <Requisito ok={data?.requisitos?.certificado_ativo} texto="Certificado A1 válido (ficha do cliente)" />
          <Requisito ok={!!data?.uf_autor} texto={data?.uf_autor ? `UF: ${UFS[data.uf_autor] || data.uf_autor}` : "UF do cliente (necessária para NF-e e CT-e)"} />
        </ul>
        {admin && (
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Ambiente da SEFAZ</span>
              <select className={campo} disabled={ambiente.isPending} value={data?.ambiente || "PRODUCAO"} onChange={async (e) => { const novo = e.target.value; if (await confirmar({ titulo: "Trocar o ambiente da SEFAZ?", descricao: "Trocar zera o NSU desta empresa e desliga a captura.", rotulo: "Trocar", perigoso: false })) ambiente.mutate({ ambiente: novo }); }}>
                <option value="PRODUCAO">Produção</option><option value="HOMOLOGACAO">Homologação (teste)</option>
              </select></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">UF</span>
              <select className={campo} disabled={ambiente.isPending} value={data?.uf_autor || ""} onChange={(e) => ambiente.mutate({ ambiente: data?.ambiente || "PRODUCAO", uf_autor: e.target.value })}>
                <option value="">Escolha…</option>
                <optgroup label="Estados atendidos">{UFS_FOCO.map((cod) => <option key={cod} value={cod}>{UFS[cod]} ({cod})</option>)}</optgroup>
                <optgroup label="Outros estados">{Object.entries(UFS).filter(([cod]) => !UFS_FOCO.includes(cod)).map(([cod, sigla]) => <option key={cod} value={cod}>{sigla} ({cod})</option>)}</optgroup>
              </select></label>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="font-semibold text-sm">Documentos</h3>
        <TabelaPadrao simples id="repo-xml-captura-tipos" ariaLabel="Captura por tipo de documento" chaveLinha={(t) => t.tipo} ordemInicial={null}
          linhas={data?.tipos || []}
          colunas={[
            { chave: "tipo", rotulo: "Tipo", valor: (t) => ROTULO[t.tipo] || t.tipo, render: (t) => <span className="font-medium">{ROTULO[t.tipo] || t.tipo}</span> },
            { chave: "ativo", rotulo: "Situação", valor: (t) => (t.ativo ? "Ligada" : "Desligada") },
            { chave: "ultimo_nsu", rotulo: "Último NSU", alinhar: "direita", valor: (t) => Number(t.ultimo_nsu) || 0, render: (t) => `${t.ultimo_nsu ?? ""}${t.max_nsu ? ` de ${t.max_nsu}` : ""}` },
            { chave: "ultima_consulta_em", rotulo: "Última consulta", tipo: "data", render: (t) => fmtDataHora(t.ultima_consulta_em) },
            { chave: "proxima_automatica_em", rotulo: "Próxima busca", tipo: "data", render: (t) => (t.proxima_automatica_em ? (new Date(t.proxima_automatica_em).getTime() <= Date.now() + 60_000 ? "agora" : fmtDataHora(t.proxima_automatica_em)) : "—") },
            { chave: "ultimo_cstat", rotulo: "Código", render: (t) => <span className="text-muted-foreground">{t.ultimo_cstat || "—"}</span> },
            { chave: "ultimo_motivo", rotulo: "Retorno", render: (t) => <span className="text-muted-foreground">{t.ultimo_motivo || "—"}</span> },
          ]}
          documentos={(t) => {
            const aguarda = t.liberado_em && new Date(t.liberado_em).getTime() > Date.now();
            return admin && t.ativo ? (
              <button type="button" onClick={() => executar.mutate(t.tipo)} disabled={executar.isPending || t.em_execucao || aguarda} title={aguarda ? `Nova consulta a partir de ${fmtDataHora(t.liberado_em)}` : undefined} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-xs hover:bg-muted disabled:opacity-50">
                {executar.isPending || t.em_execucao ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Capturar agora
              </button>
            ) : null;
          }}
        />
        <dl className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-xs">
          <div className="flex gap-1.5"><dt className="text-muted-foreground">Ciência automática</dt><dd>{data?.ciencia?.ativa ? "ligada" : "desligada"}</dd></div>
          <div className="flex gap-1.5"><dt className="text-muted-foreground">Resumos aguardando</dt><dd className="tabular-nums">{data?.ciencia?.resumos_sem_ciencia ?? 0}</dd></div>
          <div className="flex gap-1.5"><dt className="text-muted-foreground">Ciência registrada</dt><dd className="tabular-nums">{data?.ciencia?.registradas ?? 0}</dd></div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="font-semibold text-sm">Últimas execuções</h3>
        {!data?.execucoes?.length ? <p className="text-sm text-muted-foreground">Nenhuma execução ainda.</p> : (
          <TabelaPadrao simples id="repo-xml-captura-execucoes" ariaLabel="Últimas execuções da captura" linhas={data.execucoes} ordemInicial={{ chave: "iniciado_em", dir: -1 }}
            colunas={[
              { chave: "iniciado_em", rotulo: "Início", tipo: "data", render: (x) => fmtDataHora(x.iniciado_em) },
              { chave: "origem", rotulo: "Origem", valor: (x) => (x.origem === "MANUAL" ? "Manual" : "Automática") },
              { chave: "usuario", rotulo: "Usuário", valor: (x) => (x.origem === "MANUAL" ? x.usuario || "—" : "") },
              { chave: "consultas", rotulo: "Consultas", tipo: "numero", alinhar: "direita" },
              { chave: "docs_recebidos", rotulo: "Recebidos", tipo: "numero", alinhar: "direita" },
              { chave: "docs_novos", rotulo: "Novos", tipo: "numero", alinhar: "direita" },
              { chave: "ultimo_cstat", rotulo: "Retorno", valor: (x) => x.ultimo_cstat || "—" },
              { chave: "mensagem", rotulo: "Resultado", quebrar: true, valor: (x) => x.mensagem || (x.finalizado_em ? "" : "em andamento"), render: (x) => <span className="text-muted-foreground">{x.mensagem || (x.finalizado_em ? "" : "em andamento")}</span> },
            ]}
          />
        )}
      </section>
    </div>
  );
}
