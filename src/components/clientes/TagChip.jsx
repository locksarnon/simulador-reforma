import { corDoTexto } from "@/lib/tags";

/** Etiqueta de empresa: a cor é a escolhida pela equipe, e o texto vira preto ou branco conforme o contraste. */
export default function TagChip({ tag, className = "" }) {
  return (
    <span className={`inline-block max-w-[160px] truncate rounded px-1.5 text-[11px] leading-4 font-medium ${className}`} style={{ backgroundColor: tag.cor, color: corDoTexto(tag.cor) }} title={tag.nome}>
      {tag.nome}
    </span>
  );
}

/** As etiquetas de uma empresa lado a lado, com o atalho para editar (ou "+ etiqueta" quando ela não tem nenhuma). */
export function EtiquetasDaEmpresa({ tags, aoEditar }) {
  if (!tags?.length && !aoEditar) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {(tags || []).map((t) => <TagChip key={t.id} tag={t} />)}
      {aoEditar && <button type="button" onClick={aoEditar} className="text-[11px] text-muted-foreground underline-offset-2 hover:text-primary hover:underline">{tags?.length ? "editar" : "+ etiqueta"}</button>}
    </div>
  );
}
