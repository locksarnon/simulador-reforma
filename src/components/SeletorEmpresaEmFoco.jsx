import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, X } from "lucide-react";
import { api } from "@/api/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import SeletorDeEmpresa from "@/components/SeletorDeEmpresa";
import { useEmpresaEmFoco } from "@/lib/EmpresaEmFoco";
import { caminhoDoRepositorio } from "@/lib/bpoCaminhos";

/** Os atalhos para a empresa em foco: XML, diagnóstico (se ela tem grupo), tarefas e agenda. */
export function atalhosDaEmpresa(empresa, grupos) {
  const g = grupos.find((x) => x.numero === empresa.grupo);
  return [
    { rotulo: "Captura de XML", to: caminhoDoRepositorio(empresa.id) },
    ...(g ? [{ rotulo: "Diagnóstico da empresa", to: `/workroom/${g.id}/empresas/${empresa.id}` }] : []),
    { rotulo: "Tarefas", to: "/bpo/tarefas" },
    { rotulo: "Agenda e obrigações", to: "/bpo/agenda" },
  ];
}

/** Botão do topo: escolhe a empresa em foco e mostra os atalhos dela. */
export default function SeletorEmpresaEmFoco() {
  const { empresaId, definir } = useEmpresaEmFoco();
  const [aberto, setAberto] = useState(false);
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list(), staleTime: 5 * 60_000 });
  const grupos = useQuery({ queryKey: ["grupos"], queryFn: () => api.entities.Grupo.list(), staleTime: 5 * 60_000 });
  const empresas = emp.data || [];
  const atual = empresas.find((e) => e.id === empresaId);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" className={`inline-flex max-w-[220px] items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted ${atual ? "text-foreground" : "text-muted-foreground"}`} aria-label={atual ? `Empresa em foco: ${atual.razao_social}` : "Escolher a empresa em foco"}>
          <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden truncate sm:inline">{atual ? atual.razao_social : "Empresa em foco"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <p className="text-xs text-muted-foreground">A empresa em foco já vem escolhida nas tarefas, na agenda e nas obrigações.</p>
        <SeletorDeEmpresa empresas={empresas} valor={empresaId} aoMudar={definir} rotulo="Empresa em foco" opcional={false} />
        {atual && (
          <>
            <ul className="space-y-1 text-sm">
              {atalhosDaEmpresa(atual, grupos.data || []).map((a) => <li key={a.to}><Link to={a.to} onClick={() => setAberto(false)} className="text-primary hover:underline">{a.rotulo}</Link></li>)}
            </ul>
            <button type="button" onClick={() => definir("")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><X className="h-3 w-3" aria-hidden="true" /> Tirar o foco</button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
