import { funcoesDoModulo } from "@/lib/funcoesPlanejadas";

const depende = (d) => (/^Rec/.test(d) ? "Receita Federal (Integra Contador)" : /^Ext/.test(d) ? "conta ou contrato externo" : /Rec \+ Ext/.test(d) ? "Receita e conta externa" : d === "—" ? "nada externo" : d);

/** As funções previstas de um módulo (fases 3 e 4 do mapa), com o número do mapa e do que cada uma depende. */
export default function ListaDePrevistas({ moduloId, titulo = "O que está previsto" }) {
  const lista = funcoesDoModulo(moduloId);
  if (!lista.length) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label={titulo}>
      <h2 className="mb-2 font-heading text-sm font-semibold">{titulo} ({lista.length})</h2>
      <ul className="divide-y divide-border/60 text-sm">
        {lista.map((f) => (
          <li key={f.id} className="flex flex-wrap items-baseline gap-2 py-1.5">
            <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{f.id}</span>
            <span className="flex-1 min-w-[220px]">{f.funcao}</span>
            <span className="text-[11px] text-muted-foreground">fase {f.fase} · {/^depende/.test(f.depende) ? f.depende : `depende de ${depende(f.depende)}`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
