import { corDoTexto } from "@/lib/tags";

const campo = "rounded-md border border-border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Filtro por etiquetas: clique nas etiquetas para ligar ou desligar; com duas ou mais, escolhe-se "qualquer uma" ou "todas". */
export default function FiltroPorTags({ tags, escolhidas, modo, aoMudar }) {
  if (!tags.length) return null;
  const alternar = (id) => aoMudar({ tags: escolhidas.includes(id) ? escolhidas.filter((i) => i !== id) : [...escolhidas, id], tagModo: modo });
  return (
    <div className="space-y-1">
      <span className="block text-xs text-muted-foreground">Etiquetas</span>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por etiquetas">
        {tags.map((t) => {
          const ligada = escolhidas.includes(t.id);
          return (
            <button key={t.id} type="button" aria-pressed={ligada} onClick={() => alternar(t.id)}
              className={`rounded border px-1.5 text-[11px] leading-5 font-medium ${ligada ? "" : "opacity-70 hover:opacity-100"}`}
              style={ligada ? { backgroundColor: t.cor, color: corDoTexto(t.cor), borderColor: t.cor } : { borderColor: t.cor }}>
              {t.nome}
            </button>
          );
        })}
        {escolhidas.length > 1 && (
          <select aria-label="Combinar as etiquetas" className={campo} value={modo} onChange={(e) => aoMudar({ tags: escolhidas, tagModo: e.target.value })}>
            <option value="qualquer">com qualquer uma</option>
            <option value="todas">com todas</option>
          </select>
        )}
        {escolhidas.length > 0 && <button type="button" onClick={() => aoMudar({ tags: [], tagModo: "qualquer" })} className="text-xs text-muted-foreground hover:underline">limpar</button>}
      </div>
    </div>
  );
}
