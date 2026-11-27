import { classeBotaoFiltro } from "@/components/BotaoFiltro";
import { SETORES_BASE_LEGAL } from "@/lib/setoresBaseLegal";
import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw, Scale } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import { PerguntasRecentes } from "@/components/base-legal/AssistenteLegal";
import { Orbe } from "@/components/assistente/AssistenteGlobal";
import { abrirAssistente, sugestoesDoContexto } from "@/lib/assistente";
import CartoesLegais from "@/components/base-legal/CartoesLegais";
import AlertasBaseLegal from "@/components/base-legal/AlertasBaseLegal";
import RevisoesPendentes from "@/components/base-legal/RevisoesPendentes";
import ConsultaBasesLegais from "@/components/base-legal/ConsultaBasesLegais";
import NovidadesLegais from "@/components/base-legal/NovidadesLegais";
import RevisaoSemanalPainel from "@/components/base-legal/RevisaoSemanalPainel";
import RegrasEstaduais from "@/components/base-legal/RegrasEstaduais";
import { resumoRevisao } from "@/lib/revisaoLegal";
import { dataBr, ROTULO_GRUPO_NORMA, situacaoDaNorma } from "@/lib/novidadesLegais";

export { Trecho } from "@/components/base-legal/Trecho";

export const fmtData = (v) => {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }); } catch { return v; }
};

const ABAS = [["normas", "Normas e assistente"], ["estaduais", "Regras estaduais"], ["novidades", "Novidades e revogações"], ["revisao", "Revisão semanal"]];

/** Base legal (área Bases legais): a consulta em todas as normas (busca no texto e IA), o texto integral de cada norma, o que mudou ou foi revogado e a revisão semanal. */
export default function BaseLegalPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const admin = user?.role === "admin";
  const [params, setParams] = useSearchParams();
  const aba = ABAS.some(([id]) => id === params.get("aba")) ? params.get("aba") : "normas";
  const juntar = (mudanca) => {
    const novo = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudanca)) { if (v) novo.set(k, v); else novo.delete(k); }
    setParams(novo, { replace: true });
  };
  const trocarAba = (id) => juntar({ aba: id === "normas" ? "" : id });
  const [setorId, setSetorId] = useState("");
  const [pedido, setPedido] = useState(null);
  const setor = SETORES_BASE_LEGAL.find(s => s.id === setorId);
  const [atualizando, setAtualizando] = useState(null);

  const { data: normas = [], isLoading } = useQuery({ queryKey: ["base-legal-normas"], queryFn: () => api.get("/base-legal/normas") });
  const { data: resumo } = useQuery({ queryKey: ["base-legal-novidades-resumo"], queryFn: () => api.get("/base-legal/novidades/resumo") });

  const atualizar = async (chave) => {
    setAtualizando(chave);
    try {
      const r = await api.post("/base-legal/importar", { chave });
      toast({ title: r.alterada ? "Texto atualizado" : "Sem mudanças", description: r.alterada ? `${r.novos} novos, ${r.alterados} alterados, ${r.removidos} removidos. ${resumoRevisao(r.revisao)}`.trim() : "O texto oficial é idêntico ao que já estava carregado." });
      qc.invalidateQueries({ queryKey: ["base-legal-normas"] });
      qc.invalidateQueries({ queryKey: ["base-legal-cartoes"] });
      qc.invalidateQueries({ queryKey: ["base-legal-revisoes"] });
      qc.invalidateQueries({ queryKey: ["base-legal-novidades"] });
      qc.invalidateQueries({ queryKey: ["base-legal-novidades-resumo"] });
    } catch (e) {
      toast({ title: "Não foi possível atualizar", description: e.message, variant: "destructive" });
    } finally { setAtualizando(null); }
  };

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Base legal" }]} />
      <div className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-xl font-heading font-semibold flex items-center gap-2"><Scale className="w-5 h-5" /> Base legal</h1>
          <p className="text-sm text-muted-foreground mt-1">O texto oficial das normas, com a redação anterior e as revogações de cada dispositivo, a consulta por busca e por IA em todas elas, o que mudou na legislação e a revisão semanal.</p>
        </div>

        <ConsultaBasesLegais
          inicial={params.get("q") || ""} normas={normas} emailPadrao={user?.email || ""} pedido={pedido}
          sugestoes={sugestoesDoContexto({ id: "base-legal", area: "conhecimento" }, setor?.perguntas)}
          aoConsultar={(texto) => juntar({ q: texto })}
        />

        <div role="tablist" aria-label="Seções das bases legais" className="flex flex-wrap gap-1 border-b border-border">
          {ABAS.map(([id, rotulo]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => trocarAba(id)}
              className={`px-4 py-2 text-sm -mb-px border-b-2 ${aba === id ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {rotulo}
              {id === "novidades" && resumo?.novas > 0 && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{resumo.novas}</span>}
            </button>
          ))}
        </div>

        {aba === "estaduais" && <RegrasEstaduais uf={params.get("uf") || ""} aoEscolherUf={(uf) => juntar({ uf })} />}
        {aba === "novidades" && <NovidadesLegais admin={admin} normaInicial={params.get("norma") || ""} />}
        {aba === "revisao" && <RevisaoSemanalPainel admin={admin} />}

        {aba === "normas" && (
          <>
            <Link to="/base-legal/guia-art-11" className="block rounded-xl border border-border bg-card p-4 hover:border-primary"><strong>Guia do Artigo 11</strong><p className="text-sm text-muted-foreground mt-1">Consulte o local de incidência do IBS por tipo de operação.</p></Link>

            {admin && <AlertasBaseLegal />}

            {admin && <RevisoesPendentes />}

            <section className="space-y-3"><h2 className="text-sm font-medium">Explorar por setor</h2><div className="flex flex-wrap gap-2"><button type="button" aria-pressed={!setorId} onClick={() => setSetorId('')} className={classeBotaoFiltro(!setorId)}>Todos</button>{SETORES_BASE_LEGAL.map(s => <button key={s.id} type="button" aria-pressed={setorId === s.id} onClick={() => setSetorId(s.id)} className={classeBotaoFiltro(setorId === s.id)}>{s.nome}</button>)}</div>{setor && <button type="button" onClick={() => setPedido({ texto: setor.busca, n: Date.now() })} className="text-primary text-sm underline">Consultar as bases legais sobre {setor.nome}</button>}</section>
            <section className="flex flex-wrap items-center gap-4 border border-border bg-gradient-to-r from-primary/10 via-card to-card p-4" aria-label="Assistente tributário">
              <Orbe tamanho={40} />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">Prefere conversar?</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">O botão <b>Assistente</b> do menu lateral (atalho Ctrl+/) abre a conversa em qualquer tela e guarda as últimas perguntas. A resposta vem só do texto das normas e cita o artigo; dispositivo revogado ou alterado há pouco vem sempre com o aviso.</p>
              </div>
              <button type="button" onClick={() => abrirAssistente({ sugestoes: setor?.perguntas })} className="botao-acao inline-flex items-center gap-2 bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">Abrir o assistente{setor ? ` (${setor.nome})` : ""}</button>
            </section>
            {admin && <PerguntasRecentes />}

            <CartoesLegais admin={admin} setor={setor} />

            <section>
              <h2 className="text-sm font-medium mb-3">Normas carregadas</h2>
              {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : normas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma norma cadastrada ainda. {admin ? "Use o botão Atualizar de cada norma depois que ela aparecer aqui, ou rode a revisão semanal na aba Revisão semanal." : "Peça a um administrador para carregar a base."}</p>
              ) : (
                <TabelaPadrao id="base-legal:normas" ariaLabel="Normas carregadas" linhas={normas} chaveLinha={(n) => n.chave}
                  colunas={[
                    { chave: "numero", rotulo: "Norma", render: (n) => <span className="font-medium">{n.numero}</span> },
                    { chave: "tipo", rotulo: "Tipo" },
                    { chave: "grupo", rotulo: "Bloco", valor: (n) => ROTULO_GRUPO_NORMA[n.grupo] || "—" },
                    { chave: "titulo", rotulo: "Assunto", quebrar: true },
                    { chave: "ementa", rotulo: "Ementa", quebrar: true },
                    { chave: "observacao", rotulo: "Observação", quebrar: true },
                    { chave: "data_publicacao", rotulo: "Publicação", tipo: "data", render: (n) => fmtData(n.data_publicacao) },
                    { chave: "situacao", rotulo: "Situação", valor: (n) => situacaoDaNorma(n).rotulo, render: (n) => { const s = situacaoDaNorma(n); return <span className={`text-xs rounded px-2 py-0.5 ${s.classe}`}>{s.rotulo}</span>; } },
                    { chave: "total_dispositivos", rotulo: "Dispositivos", tipo: "numero", alinhar: "direita", render: (n) => n.total_dispositivos || "—" },
                    { chave: "atualizada_em", rotulo: "Texto mudou em", tipo: "data", render: (n) => dataBr(n.atualizada_em) },
                    { chave: "capturada_em", rotulo: "Conferida em", tipo: "data", render: (n) => (n.capturada_em ? new Date(n.capturada_em).toLocaleDateString("pt-BR") : "—") },
                    {
                      chave: "acoes", rotulo: "Ações", valor: () => "", ordenavel: false, filtravel: false,
                      render: (n) => (
                        <span className="inline-flex items-center gap-2">
                          {n.formato !== "externo" && <Link to={"/base-legal/" + n.chave} className="text-primary underline">Ler texto integral</Link>}
                          <a href={n.url_oficial} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline"><ExternalLink className="w-3 h-3" />Fonte oficial</a>
                          {admin && n.formato !== "externo" && <button type="button" disabled={atualizando === n.chave} onClick={() => atualizar(n.chave)} className="botao-acao inline-flex gap-1 items-center rounded px-2 py-px disabled:opacity-50">{atualizando === n.chave ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}Atualizar</button>}
                        </span>
                      ),
                    },
                  ]} />
              )}
            </section>

            <p className="text-xs text-muted-foreground">Os textos vêm dos sites oficiais (Planalto, CGIBS, Confaz e outros órgãos). O que o site mostra riscado ou revogado fica guardado como histórico e nunca é apresentado como texto vigente; as normas marcadas “Só referência” são publicadas em páginas que o sistema não consegue ler e abrem direto na fonte oficial. A revisão semanal confere tudo toda segunda-feira. Em caso de dúvida, vale o texto publicado no órgão oficial — use o link “Fonte oficial”.</p>
          </>
        )}
      </div>
    </div>
  );
}
