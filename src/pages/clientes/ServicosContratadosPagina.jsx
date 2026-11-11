import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Pencil, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import DialogoServico from "@/components/clientes/DialogoServico";
import { useCarteiras } from "@/lib/useCarteiras";
import { carteiraDaEmpresa, filtrarEmpresas, fmtDataCurta, naCarteira, SITUACOES, TIPOS, TOM_DA_SITUACAO } from "@/lib/servicos";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CARTEIRAS = [["", "Todas as carteiras"], ["bpo", "Só BPO fiscal"], ["diagnostico", "Só diagnóstico pontual"], ["ambas", "Nas duas"], ["nenhuma", "Sem carteira"]];

function Cartao({ rotulo, valor, destaque, aoClicar, ativo }) {
  const classe = `rounded-xl border bg-card px-4 py-3 text-left ${destaque ? "border-amber-400/60" : "border-border"} ${ativo ? "ring-2 ring-primary" : ""}`;
  const conteudo = <><p className="text-xs text-muted-foreground">{rotulo}</p><p className="text-xl font-semibold tabular-nums">{valor ?? "—"}</p></>;
  return aoClicar ? <button type="button" onClick={aoClicar} className={`${classe} hover:bg-muted/50`}>{conteudo}</button> : <div className={classe}>{conteudo}</div>;
}

/** Selo do serviço de uma empresa num tipo: situação, responsável e a data de início; "—" quando não há. */
export function SeloDoServico({ servico, aoEditar, rotuloVazio = "Definir" }) {
  if (!servico) {
    return <button type="button" onClick={aoEditar} className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline">{rotuloVazio}</button>;
  }
  return (
    <div className="flex items-start gap-1.5">
      <div className="min-w-0">
        <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${TOM_DA_SITUACAO[servico.situacao] || "bg-muted"}`}>{SITUACOES[servico.situacao] || servico.situacao}</span>
        {(servico.responsavel || servico.inicio) && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{[servico.responsavel, servico.inicio ? `desde ${fmtDataCurta(servico.inicio)}` : null].filter(Boolean).join(" · ")}</p>}
      </div>
      <button type="button" onClick={aoEditar} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Editar serviço" title="Editar"><Pencil className="h-3 w-3" aria-hidden="true" /></button>
    </div>
  );
}

/**
 * Clientes > Serviços contratados: o cadastro da empresa é um só; aqui se marca quem é do BPO fiscal e quem tem diagnóstico pontual.
 * As carteiras das áreas BPO Fiscal e Diagnóstico e Serviços saem daqui.
 */
export default function ServicosContratadosPagina() {
  const { empresas, grupos, servicos, resumo, mapa, carregando, erro, recarregar } = useCarteiras();
  const [filtros, setFiltros] = useState({ busca: "", grupo: "", carteira: "" });
  const [marcadas, setMarcadas] = useState(new Set());
  const [dialogo, setDialogo] = useState(null); // { empresas, servico, tipoInicial }

  const lista = useMemo(() => filtrarEmpresas(empresas, mapa, filtros).sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR")), [empresas, mapa, filtros]);
  const sugestoes = useMemo(() => [...new Set(servicos.map((s) => s.responsavel).filter(Boolean))].sort(), [servicos]);
  const grupoDe = (e) => grupos.find((g) => g.numero === e.grupo);
  const todasMarcadas = lista.length > 0 && lista.every((e) => marcadas.has(e.id));
  const mudar = (chave, valor) => setFiltros((f) => ({ ...f, [chave]: valor }));
  const alternar = (id) => setMarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarTodas = () => setMarcadas(todasMarcadas ? new Set() : new Set(lista.map((e) => e.id)));
  const abrir = (empresasAlvo, servico = null, tipoInicial) => setDialogo({ empresas: empresasAlvo, servico, tipoInicial });
  const selecionadas = empresas.filter((e) => marcadas.has(e.id));

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Clientes", to: "/area/clientes" }, { label: "Serviços contratados" }]}
        title="Serviços contratados"
        subtitle="O cadastro da empresa é um só. Aqui você marca quem é do BPO fiscal e quem tem diagnóstico pontual; cada área abre com a sua carteira."
      />
      <div className="px-6 lg:px-8 py-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cartao rotulo="Empresas no cadastro" valor={resumo?.empresas} aoClicar={() => mudar("carteira", "")} ativo={filtros.carteira === ""} />
          <Cartao rotulo="No BPO fiscal" valor={resumo?.em_carteira?.BPO_FISCAL} aoClicar={() => mudar("carteira", "bpo")} ativo={filtros.carteira === "bpo"} />
          <Cartao rotulo="Com diagnóstico pontual" valor={resumo?.em_carteira?.DIAGNOSTICO_PONTUAL} aoClicar={() => mudar("carteira", "diagnostico")} ativo={filtros.carteira === "diagnostico"} />
          <Cartao rotulo="Sem carteira" valor={resumo?.sem_carteira} destaque={(resumo?.sem_carteira ?? 0) > 0} aoClicar={() => mudar("carteira", "nenhuma")} ativo={filtros.carteira === "nenhuma"} />
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1 flex-1 min-w-[200px]"><span className="block text-xs text-muted-foreground">Buscar (nome, código ou CNPJ)</span>
              <input type="search" className={`${campo} w-full`} value={filtros.busca} onChange={(e) => mudar("busca", e.target.value)} /></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Carteira</span>
              <select className={campo} value={filtros.carteira} onChange={(e) => mudar("carteira", e.target.value)}>{CARTEIRAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Grupo</span>
              <select className={campo} value={filtros.grupo} onChange={(e) => mudar("grupo", e.target.value)}>
                <option value="">Todos</option>{grupos.map((g) => <option key={g.id} value={g.numero}>{g.numero} {g.nome}</option>)}
              </select></label>
            <button type="button" onClick={recarregar} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" title="Buscar de novo"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Atualizar</button>
          </div>

          {selecionadas.length > 0 && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium">{selecionadas.length} empresa(s) marcada(s)</span>
              <button type="button" onClick={() => abrir(selecionadas, null, "BPO_FISCAL")} className="rounded-md bg-primary px-3 py-1 text-primary-foreground">Definir BPO fiscal</button>
              <button type="button" onClick={() => abrir(selecionadas, null, "DIAGNOSTICO_PONTUAL")} className="rounded-md border border-border bg-background px-3 py-1 hover:bg-muted">Definir diagnóstico pontual</button>
              <button type="button" onClick={() => setMarcadas(new Set())} className="ml-auto text-xs text-muted-foreground hover:underline">Limpar seleção</button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-[13px] leading-5" aria-label="Serviços contratados por empresa">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-1.5 pr-2 w-8"><input type="checkbox" aria-label="Marcar todas as empresas da lista" checked={todasMarcadas} onChange={alternarTodas} /></th>
                  <th className="py-1.5 pr-3">Empresa</th><th className="py-1.5 pr-3">Grupo</th>
                  <th className="py-1.5 pr-3">{TIPOS.BPO_FISCAL}</th><th className="py-1.5 pr-3">{TIPOS.DIAGNOSTICO_PONTUAL}</th>
                </tr>
              </thead>
              <tbody>
                {carregando && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</td></tr>}
                {!carregando && erro && <tr><td colSpan={5} className="py-8 text-center" role="alert">Não foi possível carregar. <button type="button" onClick={recarregar} className="text-primary hover:underline">Tentar de novo</button></td></tr>}
                {!carregando && !erro && lista.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">{empresas.length === 0 ? <>Nenhuma empresa cadastrada. <Link to="/" className="text-primary hover:underline">Cadastre em Grupos e empresas</Link>.</> : "Nenhuma empresa com esses filtros."}</td></tr>}
                {lista.map((e) => {
                  const porTipo = mapa.get(e.id) || {};
                  const g = grupoDe(e);
                  return (
                    <tr key={e.id} className="border-b border-border/60 hover:bg-muted/40 align-top">
                      <td className="py-1.5 pr-2"><input type="checkbox" aria-label={`Marcar ${e.razao_social}`} checked={marcadas.has(e.id)} onChange={() => alternar(e.id)} /></td>
                      <td className="py-1.5 pr-3"><p className="font-medium">{e.razao_social}</p><p className="text-[11px] text-muted-foreground tabular-nums">{e.cnpj_cpf || e.id_empresa}</p></td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">{g ? `${g.numero} ${g.nome}` : e.grupo || "—"}</td>
                      <td className="py-1.5 pr-3"><SeloDoServico servico={porTipo.BPO_FISCAL} aoEditar={() => abrir([e], porTipo.BPO_FISCAL || null, "BPO_FISCAL")} /></td>
                      <td className="py-1.5 pr-3"><SeloDoServico servico={porTipo.DIAGNOSTICO_PONTUAL} aoEditar={() => abrir([e], porTipo.DIAGNOSTICO_PONTUAL || null, "DIAGNOSTICO_PONTUAL")} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{lista.length} de {empresas.length} empresa(s). Proposta e encerrado não entram na carteira: só serviço ativo ou pausado.</p>
        </div>
      </div>
      {dialogo && <DialogoServico aberto empresas={dialogo.empresas} servico={dialogo.servico} tipoInicial={dialogo.tipoInicial} sugestoes={sugestoes} aoFechar={() => { setDialogo(null); setMarcadas(new Set()); }} />}
    </div>
  );
}

export { carteiraDaEmpresa, naCarteira };
