import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { EM_ABERTO, naCarteira, SITUACOES, TIPOS } from "@/lib/servicos";
import { CHAVES_DOS_SERVICOS } from "@/lib/useCarteiras";

const CURTO = { BPO_FISCAL: "BPO fiscal", DIAGNOSTICO_PONTUAL: "Diagnóstico" };
const TOM = {
  ATIVO: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  PAUSADO: "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300",
  PROPOSTA: "bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-300",
};

/** Liga o serviço da empresa: reativa o que está em aberto ou cria um novo (o encerrado fica no histórico). */
export async function ligarServico(empresaId, tipo, atual) {
  if (atual && EM_ABERTO.includes(atual.situacao)) return api.put(`/servicos-contratados/${atual.id}`, { situacao: "ATIVO" });
  return api.post("/servicos-contratados", { empresa_id: empresaId, tipo, situacao: "ATIVO" });
}

/**
 * O serviço na linha do cliente. Ligado (ativo, pausado ou proposta): selo colorido que abre os detalhes. Desligado: "+ BPO fiscal",
 * um clique liga.
 */
export default function ChipDeServico({ empresa, tipo, servico, aoEditar }) {
  const qc = useQueryClient();
  const [ligando, setLigando] = useState(false);
  const ligado = servico && EM_ABERTO.includes(servico.situacao);
  if (ligado) {
    const pausadoOuProposta = !naCarteira(servico) || servico.situacao === "PAUSADO";
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); aoEditar(); }} className={`rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 ${TOM[servico.situacao]}`} title={`${TIPOS[tipo]}: ${SITUACOES[servico.situacao]}. Clique para mudar.`}>
        {CURTO[tipo]}{pausadoOuProposta ? ` · ${SITUACOES[servico.situacao].toLowerCase()}` : ""}
      </button>
    );
  }
  const ligar = async (e) => {
    e.stopPropagation();
    setLigando(true);
    try {
      await ligarServico(empresa.id, tipo, servico);
      CHAVES_DOS_SERVICOS.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast({ title: `${TIPOS[tipo]} ligado`, description: empresa.razao_social });
    } catch (err) {
      toast({ title: "Não foi possível ligar o serviço", description: err.message, variant: "destructive" });
    } finally { setLigando(false); }
  };
  return (
    <button type="button" onClick={ligar} disabled={ligando} className="inline-flex items-center gap-0.5 rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-60" aria-label={`Ligar ${TIPOS[tipo]} para ${empresa.razao_social}`}>
      {ligando ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Plus className="h-3 w-3" aria-hidden="true" />}{CURTO[tipo]}
    </button>
  );
}
