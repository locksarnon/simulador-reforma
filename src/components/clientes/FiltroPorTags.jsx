import { ChevronDown, Tag } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { corDoTexto } from "@/lib/tags";
import { botaoBarraCls } from "@/lib/estiloTabela";

const campo = "rounded-md border border-border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Etiquetas({ tags, escolhidas, modo, aoMudar, rotulo }) {
  const alternar = (id) => aoMudar({ tags: escolhidas.includes(id) ? escolhidas.filter((i) => i !== id) : [...escolhidas, id], tagModo: modo });
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={rotulo}>
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
  );
}

/**
 * Filtro por etiquetas: clique nas etiquetas para ligar ou desligar; com duas ou mais, escolhe-se "qualquer uma" ou "todas".
 * `compacto`: um botão "Etiquetas" da barra única da lista (mostra quantas estão ligadas) que abre as etiquetas ao lado.
 */
export default function FiltroPorTags({ tags, escolhidas, modo, aoMudar, compacto = false }) {
  if (!tags.length) return null;
  if (compacto) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Filtrar por etiquetas" className={`${botaoBarraCls} ${escolhidas.length ? "bg-primary/10 text-primary" : ""}`}>
            <Tag className="h-3.5 w-3.5" aria-hidden="true" /> Etiquetas{escolhidas.length > 0 && <span className="tabular-nums">: {escolhidas.length}</span>}
            <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3">
          <Etiquetas tags={tags} escolhidas={escolhidas} modo={modo} aoMudar={aoMudar} rotulo="Etiquetas para filtrar" />
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <div className="space-y-1">
      <span className="block text-xs text-muted-foreground">Etiquetas</span>
      <Etiquetas tags={tags} escolhidas={escolhidas} modo={modo} aoMudar={aoMudar} rotulo="Filtrar por etiquetas" />
    </div>
  );
}
