import { ABAS, abaPorTecla } from "./logica";

/** Faixa de abas com setas do teclado (padrão de abas do WAI-ARIA). */
export default function Abas({ atual, aoMudar }) {
  return (
    <div role="tablist" aria-label="Etapas do saneamento" className="flex flex-wrap gap-1 border-b border-border">
      {ABAS.map((a) => (
        <button key={a.id} type="button" role="tab" id={`san-aba-${a.id}`} aria-selected={atual === a.id} aria-controls="san-painel" tabIndex={atual === a.id ? 0 : -1}
          onClick={() => aoMudar(a.id)}
          onKeyDown={(e) => { const prox = abaPorTecla(atual, e.key); if (prox) { e.preventDefault(); aoMudar(prox); document.getElementById(`san-aba-${prox}`)?.focus(); } }}
          className={`-mb-px border-b-2 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${atual === a.id ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}
