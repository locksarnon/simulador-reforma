import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import ConsultaBasesLegais from "@/components/base-legal/ConsultaBasesLegais";
import RegrasEstaduais from "@/components/base-legal/RegrasEstaduais";
import { useAuth } from "@/lib/AuthContext";
import { sugestoesDoContexto } from "@/lib/assistente";
import { areaPorId, caminhoDaArea, modulosDaArea, SITUACAO, situacaoDoModulo } from "@/lib/navegacao";
import { temTela } from "@/lib/permissoes";

/** Selo de situação do módulo (Beta ou Em breve); módulo ativo não leva selo. */
export function SeloSituacao({ situacao }) {
  if (situacao === SITUACAO.BETA) return <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Beta</span>;
  if (situacao === SITUACAO.EM_BREVE) return <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Em breve</span>;
  return null;
}

/** Cartão de um módulo: título, descrição e o que falta (quando ainda não está pronto). */
export function CartaoDoModulo({ modulo }) {
  const situacao = situacaoDoModulo(modulo);
  const conteudo = (
    <>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${situacao === SITUACAO.EM_BREVE ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
          <modulo.icone className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-sm font-semibold">{modulo.titulo}</h3>
            <SeloSituacao situacao={situacao} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{modulo.descricao}</p>
          {situacao === SITUACAO.EM_BREVE && modulo.quando && <p className="mt-2 text-[11px] text-muted-foreground">O que falta: {modulo.quando}</p>}
        </div>
      </div>
    </>
  );
  const classe = "block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return modulo.externo
    ? <a href={modulo.to} target="_blank" rel="noreferrer" className={classe}>{conteudo}</a>
    : <Link to={modulo.to} className={classe}>{conteudo}</Link>;
}

/** Área "Bases legais": a página já abre com a consulta em todas as normas (busca no texto e IA), antes dos cartões das telas. */
export function ConsultaDaArea({ user }) {
  const [params, setParams] = useSearchParams();
  const { data: normas = [] } = useQuery({ queryKey: ["base-legal-normas"], queryFn: () => api.get("/base-legal/normas") });
  return (
    <ConsultaBasesLegais
      inicial={params.get("q") || ""} normas={normas} emailPadrao={user?.email || ""}
      sugestoes={sugestoesDoContexto({ id: "base-legal", area: "conhecimento" })}
      aoConsultar={(texto) => setParams(texto ? { q: texto } : {}, { replace: true })}
    />
  );
}

/** Área "Bases legais": os botões por UF das regras estaduais (RICMS, lei do ICMS, fundos), logo abaixo da consulta. */
export function RegrasDaArea() {
  const [params, setParams] = useSearchParams();
  const escolher = (uf) => setParams((p) => { const n = new URLSearchParams(p); if (uf) n.set("uf", uf); else n.delete("uf"); return n; }, { replace: true });
  return <RegrasEstaduais compacto uf={params.get("uf") || ""} aoEscolherUf={escolher} />;
}

/** Página de uma área: o que ela é e os módulos que a pessoa pode usar. */
export default function AreaPagina() {
  const { areaId } = useParams();
  const { user } = useAuth();
  const area = areaPorId(areaId);
  if (!area) return <Navigate to="/inicio" replace />;
  if (area.id === "inicio") return <Navigate to={caminhoDaArea("inicio")} replace />;
  const modulos = modulosDaArea(area.id, user);
  const consulta = area.id === "conhecimento" && temTela(user, "base-legal");

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: area.titulo }]}
        title={area.titulo}
      />
      <div className="px-6 lg:px-8 py-6 space-y-6">
        {consulta && <ConsultaDaArea user={user} />}
        {consulta && <RegrasDaArea />}
        {modulos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Você ainda não tem módulos liberados nesta área.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {modulos.map((m) => <CartaoDoModulo key={m.id} modulo={m} />)}
          </div>
        )}
      </div>
    </div>
  );
}
