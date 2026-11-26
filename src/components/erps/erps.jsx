import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { api } from "@/api/client";
import { avisoNaoIdentificado, avisoTextoOriginal, consultasDeExtracao, erpDoRegistro, GRAUS, restricoesDoTipo, SITUACOES_ERP, textoOriginalDivergente, TIPOS_AJUSTE_ERP } from "@/lib/erps";

/**
 * Peças do Cadastro de ERPs que as telas usam: a lista (o ERP é SELECIONADO, nunca digitado), o perfil (o conhecimento daquele ERP),
 * o alerta das restrições e as consultas de extração. O cadastro mora em Administração > Configuração e ERPs.
 */

export const chavesErps = { lista: ["erps"], ficha: (id) => ["erps", id], perfil: (id) => ["erps", id, "perfil"] };

/** Lista de ERPs do cadastro. `ativo = false` (e o publico) não busca. */
export function useErps(ativo = true) {
  return useQuery({ queryKey: chavesErps.lista, queryFn: () => api.get("/erps"), enabled: ativo, staleTime: 5 * 60_000 });
}

/** Perfil do ERP (só o conhecimento ativo). Sem id, nada. */
export function usePerfilErp(id) {
  return useQuery({ queryKey: chavesErps.perfil(id), queryFn: () => api.get(`/erps/${id}/perfil`), enabled: !!id, staleTime: 5 * 60_000 });
}

const selCls = "mt-1 w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background text-foreground";

/**
 * Seleção do ERP na lista do cadastro. `registro` traz { erp_id, erp } (o texto antigo). Sem vínculo, o texto antigo que casa sem
 * ambiguidade já aparece selecionado (é gravado ao salvar); o que não casa aparece como "ERP não identificado: ... — selecione na lista".
 * `aoMudar({ erp_id, erp })` devolve o vínculo e o nome do ERP escolhido. Com um ERP já escolhido não há volta para "sem ERP": troca-se por
 * outro da lista (o "Outro ERP (sem perfil)" serve quando o do cliente não está cadastrado). Assim a associação automática do texto antigo
 * nunca desfaz uma escolha do usuário.
 */
export function SeletorErp({ registro, aoMudar, rotulo = "ERP", id = "seletor-erp", desabilitado = false, ajuda }) {
  const q = useErps();
  const erps = (q.data || []).filter((e) => e.ativo !== false || e.id === registro?.erp_id);
  const { erp, texto, naoIdentificado } = erpDoRegistro(registro, q.data || []);
  const original = textoOriginalDivergente(registro, q.data || []);
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium">{rotulo}{ajuda}</label>
      <select id={id} aria-label={rotulo} className={selCls} disabled={desabilitado || q.isLoading} value={erp?.id ?? ""}
        onChange={(e) => { const novo = erps.find((x) => x.id === e.target.value); aoMudar(novo ? { erp_id: novo.id, erp: novo.nome } : { erp_id: null, erp: naoIdentificado ? texto : null }); }}>
        <option value="" disabled={!!erp}>{q.isLoading ? "Carregando a lista…" : "Selecione o ERP"}</option>
        {erps.map((e) => <option key={e.id} value={e.id}>{e.nome}{e.situacao === "A_DESENVOLVER" ? " (perfil a desenvolver)" : ""}</option>)}
      </select>
      {naoIdentificado && <p role="status" className="mt-1 text-xs text-amber-700 dark:text-amber-300">{avisoNaoIdentificado(texto)}</p>}
      {erp && <p className="mt-1 text-xs text-muted-foreground">Perfil {String(SITUACOES_ERP[erp.situacao] || erp.situacao || "").toLowerCase()}.</p>}
      {original && <p className="mt-1 text-xs text-muted-foreground">{avisoTextoOriginal(original)}</p>}
    </div>
  );
}

/** Nome do ERP para exibir (com o aviso quando o texto antigo não foi identificado). */
export function NomeErp({ registro, versao }) {
  const q = useErps();
  const { erp, texto, naoIdentificado } = erpDoRegistro(registro, q.data || []);
  if (naoIdentificado) return <span className="text-amber-700 dark:text-amber-300">{avisoNaoIdentificado(texto)}</span>;
  const nome = erp?.nome || texto;
  return <span>{nome ? [nome, versao].filter(Boolean).join(" ") : "ERP não informado"}</span>;
}

export const RotuloGrau = ({ grau }) => (
  <span className={`inline-block rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${grau === "CONFIRMADO" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"}`}>{GRAUS[grau] || grau}</span>
);

/**
 * Restrições do ERP para os tipos de ajuste (alerta com fonte e grau). Perfil a desenvolver ou "Outro ERP": nada (valem as regras gerais).
 */
export function AlertasErp({ perfil, tipos = [], titulo }) {
  const r = restricoesDoTipo(perfil, tipos);
  if (!r.length) return null;
  return (
    <section role="note" aria-label={`Restrições do ${perfil.nome}`} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      <p className="flex items-center gap-1.5 font-medium"><TriangleAlert className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />{titulo || `Restrições do ${perfil.nome} para este ajuste`}</p>
      <ul className="mt-2 space-y-1.5">
        {r.map((i) => (
          <li key={i.id} className="text-xs">
            <span className="font-medium">{TIPOS_AJUSTE_ERP[i.tipo_ajuste] || i.tipo_ajuste} · {i.chave}:</span> {i.texto} <RotuloGrau grau={i.grau} />{" "}
            {i.fonte_url && <a href={i.fonte_url} target="_blank" rel="noreferrer" className="text-primary underline">fonte</a>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BotaoCopiar({ texto, rotulo }) {
  const [ok, setOk] = useState(false);
  const copiar = async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 2000); } catch { setOk(false); } };
  return (
    <button type="button" onClick={copiar} aria-label={rotulo} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
      {ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}{ok ? "Copiada" : "Copiar"}
    </button>
  );
}

/** Consultas de extração do ERP (com botão copiar). Sem perfil específico: nada. */
export function ConsultasErp({ perfil }) {
  const c = consultasDeExtracao(perfil);
  if (!c.length) return null;
  return (
    <details className="rounded-md border border-border bg-card p-3 text-sm">
      <summary className="cursor-pointer font-medium">Como extrair do {perfil.nome} ({c.length} {c.length === 1 ? "consulta" : "consultas"})</summary>
      <div className="mt-2 space-y-3">
        {c.map((i) => (
          <div key={i.id} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{i.chave}</span><RotuloGrau grau={i.grau} />{i.fonte_url && <a href={i.fonte_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">fonte</a>}<BotaoCopiar texto={i.texto} rotulo={`Copiar ${i.chave}`} /></div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{i.texto}</pre>
          </div>
        ))}
      </div>
    </details>
  );
}
