import { useNavigate } from "react-router-dom";
import { Archive, CalendarRange, FolderOpen, ListChecks, ShieldCheck, Stethoscope } from "lucide-react";
import { useEmpresaEmFoco } from "@/lib/EmpresaEmFoco";
import { CAMINHO_REPOSITORIO_XML } from "@/lib/bpoCaminhos";
import { caminhoDoDiagnostico } from "@/lib/clientes";

/** Os atalhos do cliente: cada um abre a tela já com este cliente em foco. */
export function atalhosDoCliente(empresa, grupos) {
  const diag = caminhoDoDiagnostico(empresa, grupos);
  return [
    { id: "xml", rotulo: "XML e certificado A1", icone: Archive, to: `${CAMINHO_REPOSITORIO_XML}/${empresa.id}` },
    { id: "monitoramento", rotulo: "Monitoramento fiscal", icone: ShieldCheck, to: `/bpo/monitoramento/${empresa.id}` },
    { id: "tarefas", rotulo: "Tarefas", icone: ListChecks, to: "/bpo/tarefas", foco: true },
    { id: "agenda", rotulo: "Obrigações e agenda", icone: CalendarRange, to: "/bpo/agenda", foco: true },
    { id: "arquivos", rotulo: "Arquivos e documentos", icone: FolderOpen, to: "/bpo/arquivos", foco: true },
    ...(diag ? [{ id: "diagnostico", rotulo: "Trabalho do diagnóstico", icone: Stethoscope, to: diag }] : []),
  ];
}

export default function AtalhosDoCliente({ empresa, grupos, grade = false }) {
  const navigate = useNavigate();
  const { definir } = useEmpresaEmFoco();
  const ir = (a) => { definir(empresa.id); navigate(a.to); };
  return (
    <ul className={grade ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-3" : "space-y-1"} aria-label={`Atalhos de ${empresa.razao_social}`}>
      {atalhosDoCliente(empresa, grupos).map((a) => {
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
