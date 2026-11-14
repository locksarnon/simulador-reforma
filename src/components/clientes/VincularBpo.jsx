import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useCarteiras } from "@/lib/useCarteiras";
import NovoClienteDialog from "./NovoClienteDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function VincularBpo({ aoFechar }) {
  const { empresas, grupos, mapa } = useCarteiras();
  const qc = useQueryClient();
  const [novo, setNovo] = useState(false);
  const [busca, setBusca] = useState("");
  const salvar = useMutation({
    mutationFn: (empresa_id) => api.post("/servicos-contratados", { empresa_id, tipo: "BPO_FISCAL", situacao: "ATIVO" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["servicos-contratados"] }); aoFechar(); },
  });
  if (novo) return <NovoClienteDialog aberto bpoInicial grupos={grupos} aoFechar={aoFechar} />;
  const encontrados = empresas.filter((e) => !e.arquivado_em && e.cnpj_cpf?.replace(/[^a-z0-9]/gi, "").length === 14
    && !["ATIVO", "PAUSADO", "PROPOSTA"].includes(mapa.get(e.id)?.BPO_FISCAL?.situacao)
    && `${e.razao_social} ${e.cnpj_cpf}`.toLowerCase().includes(busca.trim().toLowerCase()));
  return <Dialog open onOpenChange={(v) => !v && aoFechar()}><DialogContent>
    <DialogHeader><DialogTitle>Vincular cliente ao BPO Fiscal</DialogTitle><DialogDescription>Escolha um cliente para ativar o serviço.</DialogDescription></DialogHeader>
    <input aria-label="Buscar cliente" type="search" className="rounded border bg-background p-2" value={busca} onChange={(e) => setBusca(e.target.value)} />
    <ul className="max-h-64 overflow-y-auto">{encontrados.slice(0, 50).map((e) => <li key={e.id}><button disabled={salvar.isPending} className="w-full p-2 text-left hover:bg-muted" onClick={() => salvar.mutate(e.id)}>{e.razao_social} · {e.cnpj_cpf}</button></li>)}</ul>
    {salvar.isError && <p role="alert">{salvar.error.message}</p>}
    <button className="text-left text-primary hover:underline" onClick={() => setNovo(true)}>Cadastrar novo cliente com BPO</button>
  </DialogContent></Dialog>;
}
