import { NIVEIS, SEM_CONSULTA } from "@/lib/monitoramento";

/** Legenda das bolinhas: a mesma escala em todo o monitoramento. */
export default function LegendaNiveis() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda das cores">
      {[...Object.entries(NIVEIS), ["SEM", SEM_CONSULTA]].map(([k, n]) => (
        <span key={k} className="inline-flex items-center gap-1.5"><span className={`inline-block h-2.5 w-2.5 rounded-full ${n.ponto}`} aria-hidden="true" />{n.rotulo}</span>
      ))}
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground/30 ring-2 ring-amber-500 ring-offset-1 ring-offset-background" aria-hidden="true" />Última consulta falhou (vale a anterior)</span>
    </p>
  );
}
