import { useNavigate } from "react-router-dom";
import { Archive, CalendarRange, FolderOpen, Landmark, ListChecks, ShieldCheck } from "lucide-react";
import { useEmpresaEmFoco } from "@/lib/EmpresaEmFoco";
import { CAMINHO_REPOSITORIO_XML } from "@/lib/bpoCaminhos";
import { caminhoDaConsultoria } from "@/lib/consultoria";
import { useVinculosConsultoria } from "@/components/clientes/ServicosConsultoria";

/** Os atalhos do cliente: cada um abre a tela já com este cliente em foco. `consultoria`: o cliente tem serviço de consultoria. */
export function atalhosDoCliente(empresa, { consultoria = false } = {}) {
  return [
    { id: "xml", rotulo: "XML e certificado A1", icone: Archive, to: `${CAMINHO_REPOSITORIO_XML}/${empresa.id}` },
    { id: "monitoramento", rotulo: "Monitoramento fiscal", icone: ShieldCheck, to: `/bpo/monitoramento/${empresa.id}` },
    { id: "tarefas", rotulo: "Tarefas", icone: ListChecks, to: "/bpo/tarefas", foco: true },
    { id: "agenda", rotulo: "Obrigações e agenda", icone: CalendarRange, to: "/bpo/agenda", foco: true },
    { id: "arquivos", rotulo: "Arquivos e documentos", icone: FolderOpen, to: "/bpo/arquivos", foco: true },
    ...(consultoria ? [{ id: "consultoria", rotulo: "Consultoria tributária", icone: Landmark, to: caminhoDaConsultoria(empresa.id) }] : []),
  ];
}

export default function AtalhosDoCliente({ empresa, grade = false }) {
  const navigate = useNavigate();
  const { definir } = useEmpresaEmFoco();
  const vinculos = useVinculosConsultoria();
  const consultoria = (vinculos.data || []).some((v) => v.publico === "PJ" && v.cliente_id === empresa.id);
  const ir = (a) => { definir(empresa.id); navigate(a.to); };
  return (
    <ul className={grade ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-3" : "space-y-1"} aria-label={`Atalhos de ${empresa.razao_social}`}>
      {atalhosDoCliente(empresa, { consultoria }).map((a) => {
        const Icone = a.icone;
        return (
          <li key={a.id}>
            <button type="button" onClick={() => ir(a)} className={grade ? "flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm hover:border-primary hover:bg-muted/40" : "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm text-primary hover:bg-muted"}>
              <Icone className="h-4 w-4 shrink-0" aria-hidden="true" /> {a.rotulo}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
