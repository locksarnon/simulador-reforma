import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useCatalogoConsultoria() {
  return useQuery({ queryKey: ["consultoria", "catalogo"], queryFn: () => api.get("/consultoria/catalogo") });
}

export default function ServicosConsultoria({ publico, selecao, mudar, clienteId }) {
  const catalogo = useCatalogoConsultoria();
  const qc = useQueryClient();
  const vinculos = useQuery({ queryKey: ["consultoria", "vinculos"], queryFn: () => api.get("/consultoria/vinculos"), enabled: Boolean(clienteId) });
  const salvar = useMutation({
    mutationFn: (servico) => api.post("/consultoria/vinculos", { cliente_id: clienteId, servico }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["consultoria", "vinculos"] }),
  });
  const opcoes = (catalogo.data || []).filter((s) => s.publico === publico);
  const existentes = (vinculos.data || []).filter((v) => v.publico === publico && v.cliente_id === clienteId);
  return <fieldset className="space-y-2 rounded-md border p-3 text-sm">
    <legend className="px-1">Consultoria Tributária</legend>
    {catalogo.isError || vinculos.isError ? <p role="alert">Não foi possível carregar os serviços.</p> : clienteId ? <>
      {opcoes.filter((s) => existentes.some((v) => v.servico === s.id)).map((s) => <p key={s.id}>{s.nome}</p>)}
      <select aria-label="Adicionar serviço de consultoria" className="w-full rounded border bg-background p-2" value="" disabled={salvar.isPending || vinculos.isPending} onChange={(e) => e.target.value && salvar.mutate(e.target.value)}>
        <option value="">Adicionar serviço</option>
        {opcoes.filter((s) => !existentes.some((v) => v.servico === s.id)).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
      {salvar.isError && <p role="alert">{salvar.error.message}</p>}
    </> : <div className="max-h-36 space-y-1 overflow-y-auto">
      {opcoes.map((s) => <label key={s.id} className="flex items-center gap-2"><input type="checkbox" checked={selecao.includes(s.id)} onChange={(e) => mudar(e.target.checked ? [...selecao, s.id] : selecao.filter((id) => id !== s.id))} />{s.nome}</label>)}
    </div>}
  </fieldset>;
}
