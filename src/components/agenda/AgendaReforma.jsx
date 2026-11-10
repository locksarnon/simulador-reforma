import React, { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarPlus, Loader2, Mail, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { agruparPorMes, nomeDoArquivoIcs, paramsDaAgenda, urlDoCalendario } from "@/lib/agendaReforma";
import MarcoAgenda from "./MarcoAgenda";
import LembretesAgenda from "./LembretesAgenda";

const campo = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/**
 * Agenda da Reforma: marcos e prazos com a fonte oficial de cada data, filtráveis por regime tributário e UF.
 * Na aba da empresa (`empresa` informada) o regime e a UF vêm do cadastro dela; na tela geral dá para escolher uma empresa
 * ou filtrar à mão. Exporta .ics e liga os lembretes por e-mail.
 */
export default function AgendaReforma({ empresa = null, admin = false }) {
  const qc = useQueryClient();
  const [empresaId, setEmpresaId] = useState("");
  const [regime, setRegime] = useState("");
  const [uf, setUf] = useState("");
  const [categoria, setCategoria] = useState("");
  const [passados, setPassados] = useState(false);
  const [lembretes, setLembretes] = useState(false);
  const [ocupado, setOcupado] = useState("");

  const empresaEmFoco = empresa?.id || empresaId;
  const filtros = { empresaId: empresaEmFoco, regime: empresaEmFoco ? "" : regime, uf: empresaEmFoco ? "" : uf, categoria, passados };

  const { data: empresas = [] } = useQuery({ queryKey: ["agenda-empresas"], queryFn: () => api.entities.Empresa.list(), enabled: !empresa });
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["agenda-reforma", filtros],
    queryFn: () => api.get("/agenda-reforma/marcos", paramsDaAgenda(filtros)),
    placeholderData: keepPreviousData,
  });

  const recarregar = () => { qc.invalidateQueries({ queryKey: ["agenda-reforma"] }); qc.invalidateQueries({ queryKey: ["base-legal-revisoes"] }); };
  const opcoes = data?.opcoes || { regimes: [], ufs: [], categorias: [] };
  const empresaDoFiltro = data?.empresa || null;
  const grupos = agruparPorMes(data?.marcos);

  const baixar = async () => {
    setOcupado("ics");
    try { await api.baixar("GET", urlDoCalendario(filtros), { nome: nomeDoArquivoIcs(empresaDoFiltro?.razao_social) }); }
    catch (e) { toast({ title: "Não foi possível gerar o calendário", description: e.message, variant: "destructive" }); }
    finally { setOcupado(""); }
  };

  const carregarDatas = async () => {
    setOcupado("semear");
    try {
      const r = await api.post("/agenda-reforma/semear", {});
      toast({
        title: `${r.criados} data(s) nova(s), ${r.atualizados} atualizada(s)`,
        description: r.divergentes?.length ? `${r.divergentes.length} com trecho que não bate com a Base legal ficaram como não confirmadas.` : `${r.confirmados} confirmadas em fonte oficial; cada trecho foi conferido contra a Base legal.`,
      });
      recarregar();
    } catch (e) { toast({ title: "Não foi possível carregar as datas", description: e.message, variant: "destructive" }); }
    finally { setOcupado(""); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        {!empresa && (
          <label className="text-xs">Empresa
            <select className={`${campo} block mt-1 max-w-[16rem]`} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
              <option value="">Nenhuma (filtrar à mão)</option>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.razao_social}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs">Regime tributário
          <select className={`${campo} block mt-1`} value={empresaEmFoco ? "" : regime} onChange={(e) => setRegime(e.target.value)} disabled={Boolean(empresaEmFoco)}>
            <option value="">{empresaEmFoco ? (empresaDoFiltro?.regime_atual || "Não informado") : "Todos"}</option>
            {!empresaEmFoco && opcoes.regimes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="text-xs">UF
          <select className={`${campo} block mt-1`} value={empresaEmFoco ? "" : uf} onChange={(e) => setUf(e.target.value)} disabled={Boolean(empresaEmFoco)}>
            <option value="">{empresaEmFoco ? (empresaDoFiltro?.uf || "Não informada") : "Todas"}</option>
            {!empresaEmFoco && opcoes.ufs.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="text-xs">Assunto
          <select className={`${campo} block mt-1`} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todos</option>
            {opcoes.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-sm inline-flex items-center gap-1.5 h-9">
          <input type="checkbox" checked={passados} onChange={(e) => setPassados(e.target.checked)} /> Mostrar datas já passadas
        </label>
        <div className="flex flex-wrap gap-2 ml-auto">
          <button type="button" onClick={baixar} disabled={ocupado === "ics"} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50">
            {ocupado === "ics" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />} Baixar calendário (.ics)
          </button>
          <button type="button" aria-pressed={lembretes} onClick={() => setLembretes((v) => !v)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm ${lembretes ? "border-primary text-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
            <Mail className="w-3.5 h-3.5" /> Lembretes por e-mail
          </button>
          {admin && (
            <button type="button" onClick={carregarDatas} disabled={ocupado === "semear"} title="Grava as datas oficiais da lista da FAL, conferindo cada trecho contra a Base legal" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50">
              {ocupado === "semear" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Atualizar datas oficiais
            </button>
          )}
        </div>
      </div>

      {lembretes && <LembretesAgenda empresa={empresaDoFiltro ? { id: empresaDoFiltro.id, razao_social: empresaDoFiltro.razao_social } : null} />}

      {empresaDoFiltro && (empresaDoFiltro.sem_regime || empresaDoFiltro.sem_uf) && (
        <p role="status" className="text-xs rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 p-2">
          O cadastro da empresa está sem {[empresaDoFiltro.sem_regime && "regime tributário", empresaDoFiltro.sem_uf && "UF"].filter(Boolean).join(" e ")}: só aparecem as datas que valem para todos. Preencha o cadastro para ver as datas específicas.
        </p>
      )}

      {isLoading ? <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando a agenda…</p>
        : isError ? <p role="alert" className="text-sm text-red-600">Não foi possível carregar a agenda: {error?.message}</p>
        : data?.total === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground space-y-1">
            <p className="flex items-center gap-2 font-medium text-foreground"><CalendarDays className="w-4 h-4" /> Nenhuma data para estes filtros.</p>
            <p>{admin ? "Se a agenda ainda não foi carregada, use Atualizar datas oficiais. Caso contrário, tente outros filtros ou mostre as datas já passadas." : "Tente outros filtros ou mostre as datas já passadas. Se a agenda ainda não foi carregada, peça a um administrador."}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-xs text-muted-foreground">{data.total} {data.total === 1 ? "data" : "datas"}{passados ? ", inclusive as já passadas" : " a partir de hoje"}. Cada data traz a fonte oficial; o que não foi confirmado em fonte oficial vem marcado.</p>
            {grupos.map((g) => (
              <section key={g.chave} aria-label={g.rotulo} className="space-y-2">
                <h2 className="text-sm font-heading font-semibold capitalize border-b border-border pb-1">{g.rotulo}</h2>
                <ul className="space-y-3">{g.marcos.map((m) => <MarcoAgenda key={m.id} m={m} admin={admin} onConferido={recarregar} />)}</ul>
              </section>
            ))}
          </div>
        )}
    </div>
  );
}
