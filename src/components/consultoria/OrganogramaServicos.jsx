import { useId } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";

function Ramo({ categoria, servicos, aoVerDocumentos }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0">
      <details className="group">
        <summary id={id} className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-primary/30 bg-card px-4 py-3 text-sm font-semibold text-foreground hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-open:border-primary group-open:bg-primary/5 [&::-webkit-details-marker]:hidden">
          {categoria}
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-primary transition-transform motion-reduce:transition-none group-open:rotate-180" />
        </summary>
        <ul className="ml-5 space-y-3 pt-3">
          {servicos.map((servico) => (
            <li key={servico.id} className="relative pl-4 before:absolute before:left-0 before:top-[-12px] before:h-[calc(100%+12px)] before:border-l before:border-primary/40 last:before:h-[calc(1rem+12px)] after:absolute after:left-0 after:top-4 after:w-4 after:border-t after:border-primary/40">
              <article className="space-y-2 rounded-md border bg-card p-3">
                <h3 className="text-sm font-medium">{servico.nome}</h3>
                {!servico.projeto && <p className="text-xs text-muted-foreground">Roteiro em desenvolvimento</p>}
                <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs text-primary">
                  <button type="button" className="text-left hover:underline" onClick={() => aoVerDocumentos(servico)}>Ver lista de documentos</button>
                  {(servico.acessos || []).map((acesso) => <Link className="hover:underline" key={acesso.rota} to={acesso.rota}>{acesso.nome}</Link>)}
                </div>
              </article>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export default function OrganogramaServicos({ categorias, servicos, aoVerDocumentos }) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
      {categorias.map((categoria) => (
        <Ramo key={categoria} categoria={categoria}
          servicos={servicos.filter((servico) => servico.area === categoria)} aoVerDocumentos={aoVerDocumentos} />
      ))}
    </div>
  );
}
