import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Campo de envio de arquivo do InTAX: a área inteira aceita clique, Enter/Espaço e arrastar e soltar.
 * Ao arrastar por cima, realce verde (cor primária). Respeita `accept` (recusa a extensão errada com mensagem) e `multiple`.
 * `aoEscolher(arquivos)` recebe sempre uma lista (só os aceitos; com `multiple` falso, no máximo um).
 * `arquivo` (opcional: File, lista de File ou nome) mostra o que foi escolhido e o "trocar".
 * O preventDefault do arrastar fica só dentro da área: soltar aqui nunca abre o arquivo no navegador,
 * e o resto da página (colunas arrastáveis, por exemplo) continua como está.
 */

const MIME_EXTENSOES = {
  "application/pdf": [".pdf"],
  "application/x-pkcs12": [".pfx", ".p12"],
  "text/xml": [".xml"],
  "application/xml": [".xml"],
};

function extensao(nome) {
  const i = String(nome || "").lastIndexOf(".");
  return i < 0 ? "" : String(nome).slice(i).toLowerCase();
}

/** O arquivo atende ao `accept` do campo? (extensões, tipos MIME e curingas como image/*). Sem accept, aceita tudo. */
export function aceitaArquivo(arquivo, accept) {
  const regras = String(accept || "").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (!regras.length) return true;
  const ext = extensao(arquivo?.name);
  const tipo = String(arquivo?.type || "").toLowerCase();
  return regras.some((r) => {
    if (r.startsWith(".")) return ext === r;
    if (r.endsWith("/*")) return tipo.startsWith(r.slice(0, -1));
    return tipo === r || (MIME_EXTENSOES[r] || []).includes(ext);
  });
}

/** Rótulo legível do accept: ".xlsx, .csv" (tipos MIME viram a extensão conhecida). */
export function descreverAccept(accept) {
  const itens = String(accept || "").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean)
    .flatMap((r) => (r.startsWith(".") ? [r] : MIME_EXTENSOES[r] || [r]));
  return [...new Set(itens)].join(", ");
}

/** Separa a lista recebida (seletor ou soltar) em aceitos e a mensagem de recusa, se houver. */
export function separarArquivos(lista, { accept, multiple } = {}) {
  const todos = [...(lista || [])];
  if (!multiple && todos.length > 1) return { aceitos: [], mensagem: "Solte um arquivo só neste campo." };
  const aceitos = todos.filter((a) => aceitaArquivo(a, accept));
  const recusados = todos.filter((a) => !aceitaArquivo(a, accept));
  const mensagem = recusados.length
    ? `${recusados.length === 1 ? `Arquivo recusado: ${recusados[0].name}` : `${recusados.length} arquivos recusados (${recusados.slice(0, 3).map((a) => a.name).join(", ")}${recusados.length > 3 ? "…" : ""})`}. Este campo aceita ${descreverAccept(accept)}.`
    : "";
  return { aceitos, mensagem };
}

/** Enter e Espaço abrem o seletor, como num botão. */
export const teclaAbreSeletor = (tecla) => tecla === "Enter" || tecla === " " || tecla === "Spacebar";

const temArquivos = (e) => [...(e.dataTransfer?.types || [])].includes("Files");

/** Manipuladores da área (sem React), para o componente e para os testes. */
export function criarManipuladores({ accept, multiple, disabled, aoEscolher, aoRecusar, aoArrastar, abrirSeletor }) {
  const receber = (lista) => {
    const { aceitos, mensagem } = separarArquivos(lista, { accept, multiple });
    aoRecusar?.(mensagem);
    if (aceitos.length) aoEscolher?.(aceitos);
  };
  return {
    receber,
    onClick: (e) => { e.preventDefault(); if (!disabled) abrirSeletor?.(); },
    onKeyDown: (e) => { if (teclaAbreSeletor(e.key)) { e.preventDefault(); if (!disabled) abrirSeletor?.(); } },
    onDragEnter: (e) => { if (!temArquivos(e)) return; e.preventDefault(); if (!disabled) aoArrastar?.(true); },
    onDragOver: (e) => { if (!temArquivos(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = disabled ? "none" : "copy"; if (!disabled) aoArrastar?.(true); },
    onDragLeave: (e) => { if (e.currentTarget?.contains?.(e.relatedTarget)) return; aoArrastar?.(false); },
    onDrop: (e) => { e.preventDefault(); aoArrastar?.(false); if (!disabled) receber(e.dataTransfer?.files); },
  };
}

const nomesDe = (arquivo) => (arquivo == null ? [] : (Array.isArray(arquivo) ? arquivo : [arquivo]).map((a) => (typeof a === "string" ? a : a?.name)).filter(Boolean));

export default function CampoArquivo({
  accept, multiple = false, disabled = false, aoEscolher, arquivo, titulo, dica, icone: Icone = UploadCloud,
  compacto = false, className = "", id, rotulo, title, children,
}) {
  const entrada = useRef(null);
  const [arrastando, setArrastando] = useState(false);
  const [recusa, setRecusa] = useState("");
  const m = criarManipuladores({ accept, multiple, disabled, aoEscolher, aoRecusar: setRecusa, aoArrastar: setArrastando, abrirSeletor: () => entrada.current?.click() });
  const nomes = nomesDe(arquivo);
  const texto = titulo || (multiple ? "Arraste os arquivos aqui ou clique para escolher" : "Arraste o arquivo aqui ou clique para escolher");
  const escolhido = nomes.length ? (nomes.length === 1 ? nomes[0] : `${nomes.length} arquivos`) : "";
  const estado = disabled ? "cursor-not-allowed opacity-60"
    : arrastando ? "cursor-copy border-primary bg-primary/10 ring-2 ring-primary/40"
      : "cursor-pointer hover:border-primary hover:bg-primary/5";
  const forma = compacto
    ? "inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs"
    : "flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border px-4 py-5 text-center text-sm";
  return (
    <div className={compacto ? "flex flex-col items-start gap-1" : "space-y-1"}>
      <div
        id={id} title={title} role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled || undefined}
        aria-label={rotulo ? `${rotulo}${escolhido ? ` (escolhido: ${escolhido}; clique para trocar)` : ""}` : undefined}
        onClick={m.onClick} onKeyDown={m.onKeyDown} onDragEnter={m.onDragEnter} onDragOver={m.onDragOver} onDragLeave={m.onDragLeave} onDrop={m.onDrop}
        className={cn(forma, "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1", className, estado)}
      >
        {children ?? (
          <>
            <Icone className={`${compacto ? "h-3.5 w-3.5" : "h-6 w-6"} shrink-0 text-muted-foreground`} aria-hidden="true" />
            {escolhido
              ? <span className={compacto ? "" : "font-medium"}><span className="break-all">{escolhido}</span> <span className="text-primary underline">trocar</span></span>
              : <span className={compacto ? "" : "font-medium"}>{texto}</span>}
            {dica && !compacto && <span className="text-xs text-muted-foreground">{dica}</span>}
          </>
        )}
      </div>
      <input ref={entrada} type="file" accept={accept} multiple={multiple} disabled={disabled} className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const lista = [...(e.target.files || [])]; e.target.value = ""; if (lista.length) m.receber(lista); }} />
      {recusa && <p role="alert" className="text-xs text-destructive">{recusa}</p>}
    </div>
  );
}
