import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { areasDoCatalogo, caminhoDaConsultoria, situacaoDoServico } from "@/lib/consultoria";

export function useCatalogoConsultoria(enabled = true) {
  return useQuery({ queryKey: ["consultoria", "catalogo"], queryFn: () => api.get("/consultoria/catalogo"), enabled });
}

export function useVinculosConsultoria(enabled = true) {
  return useQuery({ queryKey: ["consultoria", "vinculos"], queryFn: () => api.get("/consultoria/vinculos"), enabled });
}

/** Vincula um cliente a um serviço do catálogo (o servidor não duplica um vínculo que já existe). */
export const vincularConsultoria = (clienteId, servico) => api.post("/consultoria/vinculos", { cliente_id: clienteId, servico });

/** Opções do catálogo agrupadas por área, para um <select>. */
export function OpcoesPorArea({ servicos }) {
  return areasDoCatalogo(servicos).map((area) => (
    <optgroup key={area} label={area}>
      {servicos.filter((s) => s.area === area).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
    </optgroup>
  ));
}

/**
 * Consultoria Tributária do cliente. Sem `clienteId` (cadastro novo): o catálogo do público, agrupado por área, para marcar
 * (`desabilitado` com a `dica` quando ainda falta o documento). Com `clienteId`: os serviços vinculados, com a área e os projetos
 * em andamento, o caminho para a Carteira de Consultoria e o seletor para vincular outro serviço (fora quando `somenteLeitura`).
 */
export default function ServicosConsultoria({ publico, selecao = [], mudar, clienteId, desabilitado = false, dica, somenteLeitura = false }) {
  const catalogo = useCatalogoConsultoria();
  const qc = useQueryClient();
  const vinculos = useVinculosConsultoria(Boolean(clienteId));
  const projetos = useQuery({ queryKey: ["projetos-diagnostico"], queryFn: () => api.get("/projetos-diagnostico"), enabled: Boolean(clienteId) });
  const salvar = useMutation({
    mutationFn: (servico) => vincularConsultoria(clienteId, servico),
    onSuccess: (_, servico) => {
      qc.invalidateQueries({ queryKey: ["consultoria", "vinculos"] });
      toast({ title: "Serviço de consultoria vinculado", description: (catalogo.data || []).find((s) => s.id === servico)?.nome });
    },
  });
  const opcoes = (catalogo.data || []).filter((s) => s.publico === publico);
  const existentes = (vinculos.data || []).filter((v) => v.publico === publico && v.cliente_id === clienteId);
  const vinculados = existentes.map((v) => opcoes.find((s) => s.id === v.servico) || { id: v.servico, nome: v.servico, area: "" });
  const livres = opcoes.filter((s) => !existentes.some((v) => v.servico === s.id));
  const erro = catalogo.isError || vinculos.isError;

  if (clienteId) {
    return (
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 text-xs font-medium text-muted-foreground">Consultoria Tributária</legend>
        {erro ? <p role="alert">Não foi possível carregar os serviços.</p> : <>
          {vinculados.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">{s.nome}</p>
                <p className="text-xs text-muted-foreground">{[s.area, situacaoDoServico(projetos.data, clienteId, s.id, publico)].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          ))}
          {!vinculos.isPending && vinculados.length === 0 && <p className="text-xs text-muted-foreground">Nenhum serviço de consultoria vinculado.</p>}
          {!somenteLeitura && livres.length > 0 && (
            <select aria-label="Vincular serviço de consultoria" className="w-full rounded-md border border-border bg-background px-2.5 py-1.5" value="" disabled={salvar.isPending || vinculos.isPending} onChange={(e) => e.target.value && salvar.mutate(e.target.value)}>
              <option value="">+ Vincular serviço de consultoria</option>
              <OpcoesPorArea servicos={livres} />
            </select>
          )}
          {salvar.isError && <p role="alert" className="text-xs text-destructive">{salvar.error.message}</p>}
          {vinculados.length > 0 && <Link to={caminhoDaConsultoria(clienteId, publico)} className="inline-block text-xs text-primary hover:underline">Abrir na Carteira de Consultoria</Link>}
        </>}
      </fieldset>
    );
  }

  return (
    <fieldset className="space-y-2 rounded-md border border-border p-3 text-sm" disabled={desabilitado}>
      <legend className="px-1 text-xs text-muted-foreground">Consultoria Tributária</legend>
      {dica && <p className="text-[11px] text-muted-foreground">{dica}</p>}
      {erro ? <p role="alert">Não foi possível carregar os serviços.</p> : (
        <div className={`max-h-56 space-y-2 overflow-y-auto ${desabilitado ? "opacity-60" : ""}`}>
          {areasDoCatalogo(opcoes).map((area) => (
            <div key={area} className="space-y-1">
              <p className="text-xs font-medium">{area}</p>
              {opcoes.filter((s) => s.area === area).map((s) => (
                <label key={s.id} className="flex items-center gap-2"><input type="checkbox" checked={selecao.includes(s.id)} onChange={(e) => mudar(e.target.checked ? [...selecao, s.id] : selecao.filter((id) => id !== s.id))} />{s.nome}</label>
              ))}
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}
