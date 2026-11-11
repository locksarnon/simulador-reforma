import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useCarteiras } from "@/lib/useCarteiras";
import { fmtDataCurta, MODULOS_BPO, naCarteira, SITUACOES, TIPOS, TOM_DA_SITUACAO } from "@/lib/servicos";
import { caminhoDoRepositorio } from "@/lib/bpoCaminhos";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (s) => String(s || "").replace(/\D/g, "");

/** Caminhos que a carteira oferece para entrar numa empresa. */
const ACOES = {
  BPO_FISCAL: (e) => [{ rotulo: "Captura de XML", to: caminhoDoRepositorio(e.id) }],
  DIAGNOSTICO_PONTUAL: (e, g) => (g ? [{ rotulo: "Abrir diagnóstico", to: `/workroom/${g.id}/empresas/${e.id}` }] : []),
};

/**
 * Carteira de uma área: as empresas que contrataram aquele serviço (ativo ou pausado), com responsável, início e o caminho para
 * trabalhar em cada uma. Se nada foi marcado ainda, a página explica como marcar e oferece ver todas as empresas.
 */
export default function CarteiraPagina({ tipo, area, titulo, subtitulo }) {
  const { empresas, grupos, servicos, mapa, carregando, erro, recarregar } = useCarteiras();
  const [filtros, setFiltros] = useState({ busca: "", situacao: "", grupo: "" });
  const [todas, setTodas] = useState(false);

  const daCarteira = useMemo(() => empresas.filter((e) => naCarteira(mapa.get(e.id)?.[tipo])), [empresas, mapa, tipo]);
  const ninguemMarcado = !carregando && !erro && servicos.length > 0 && daCarteira.length === 0;
  const base = todas ? empresas : daCarteira;
  const lista = useMemo(() => {
    const t = semAcento(filtros.busca).trim();
    const d = digitos(filtros.busca);
    return base
      .filter((e) => (!filtros.grupo || e.grupo === filtros.grupo)
        && (!filtros.situacao || mapa.get(e.id)?.[tipo]?.situacao === filtros.situacao)
        && (!t || semAcento(e.razao_social).includes(t) || semAcento(e.id_empresa).includes(t) || (d.length >= 3 && digitos(e.cnpj_cpf).includes(d))))
      .sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR"));
  }, [base, filtros, mapa, tipo]);
  const mudar = (chave, valor) => setFiltros((f) => ({ ...f, [chave]: valor }));
  const grupoDe = (e) => grupos.find((g) => g.numero === e.grupo);

  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: area.titulo, to: `/area/${area.id}` }, { label: titulo }]} title={titulo} subtitle={subtitulo} />
      <div className="px-6 lg:px-8 py-6 space-y-4">
        {ninguemMarcado && !todas && (
          <div role="status" className="rounded-xl border border-amber-400/60 bg-card p-4 text-sm space-y-2">
            <p className="font-medium">Nenhuma empresa está na carteira de {TIPOS[tipo].toLowerCase()} ainda.</p>
            <p className="text-muted-foreground">Marque quem é desta carteira em Clientes &gt; Serviços contratados. Enquanto isso, você pode ver todas as empresas.</p>
            <div className="flex gap-2">
              <Link to="/clientes/servicos-contratados" className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">Definir a carteira</Link>
              <button type="button" onClick={() => setTodas(true)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Ver todas as empresas</button>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1 flex-1 min-w-[200px]"><span className="block text-xs text-muted-foreground">Buscar (nome, código ou CNPJ)</span>
              <input type="search" className={`${campo} w-full`} value={filtros.busca} onChange={(e) => mudar("busca", e.target.value)} /></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Situação</span>
              <select className={campo} value={filtros.situacao} onChange={(e) => mudar("situacao", e.target.value)}>
                <option value="">Todas</option>{Object.entries(SITUACOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Grupo</span>
              <select className={campo} value={filtros.grupo} onChange={(e) => mudar("grupo", e.target.value)}>
                <option value="">Todos</option>{grupos.map((g) => <option key={g.id} value={g.numero}>{g.numero} {g.nome}</option>)}
              </select></label>
            {(todas || daCarteira.length > 0) && (
              <label className="flex items-center gap-2 pb-1.5"><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> <span>Mostrar todas as empresas</span></label>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] leading-5" aria-label={`Empresas da carteira: ${titulo}`}>
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-1.5 pr-3">Empresa</th><th className="py-1.5 pr-3">Grupo</th><th className="py-1.5 pr-3">Situação</th>
                  <th className="py-1.5 pr-3">Responsável</th><th className="py-1.5 pr-3">Desde</th>
                  {tipo === "BPO_FISCAL" && <th className="py-1.5 pr-3">Módulos ligados</th>}<th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {carregando && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</td></tr>}
                {!carregando && erro && <tr><td colSpan={7} className="py-8 text-center" role="alert">Não foi possível carregar. <button type="button" onClick={recarregar} className="text-primary hover:underline">Tentar de novo</button></td></tr>}
                {!carregando && !erro && lista.length === 0 && !ninguemMarcado && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">{servicos.length === 0 && empresas.length === 0 ? "Nenhuma empresa cadastrada." : "Nenhuma empresa com esses filtros."}</td></tr>}
                {lista.map((e) => {
                  const s = mapa.get(e.id)?.[tipo];
                  const g = grupoDe(e);
                  return (
                    <tr key={e.id} className="border-b border-border/60 hover:bg-muted/40 align-top">
                      <td className="py-1.5 pr-3"><p className="font-medium">{e.razao_social}</p><p className="text-[11px] text-muted-foreground tabular-nums">{e.cnpj_cpf || e.id_empresa}</p></td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">{g ? `${g.numero} ${g.nome}` : e.grupo || "—"}</td>
                      <td className="py-1.5 pr-3">{s ? <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${TOM_DA_SITUACAO[s.situacao] || "bg-muted"}`}>{SITUACOES[s.situacao] || s.situacao}</span> : <span className="text-muted-foreground">Sem serviço</span>}</td>
                      <td className="py-1.5 pr-3">{s?.responsavel || "—"}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{fmtDataCurta(s?.inicio)}</td>
                      {tipo === "BPO_FISCAL" && <td className="py-1.5 pr-3 text-[11px] text-muted-foreground">{s?.modulos?.length ? s.modulos.map((m) => MODULOS_BPO[m] || m).join(", ") : "—"}</td>}
                      <td className="py-1.5 whitespace-nowrap">
                        <div className="flex gap-3">{ACOES[tipo](e, g).map((a) => <Link key={a.to} to={a.to} className="text-primary hover:underline">{a.rotulo}</Link>)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{lista.length} empresa(s) {todas ? "(todas)" : "na carteira"}. Para mudar quem é de cada carteira: <Link to="/clientes/servicos-contratados" className="text-primary hover:underline">Serviços contratados</Link>.</p>
        </div>
      </div>
    </div>
  );
}
