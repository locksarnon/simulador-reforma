import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/** O arquivo principal (index-XXXX.js) que a página carregou; null no ambiente de desenvolvimento. */
export function scriptAtual(doc = document) {
  const s = [...doc.querySelectorAll("script[src]")].map((x) => x.getAttribute("src")).find((src) => /\/assets\/index-[^/]+\.js$/.test(src || ""));
  return s || null;
}

/** O arquivo principal anunciado pelo index.html publicado agora; null se não achar. */
export function scriptPublicado(html) {
  const m = /\/assets\/index-[^"']+\.js/.exec(html || "");
  return m ? m[0] : null;
}

/**
 * Faixa "Há uma versão nova do InTAX": a cada 5 minutos e ao voltar para a aba, compara o arquivo carregado com o publicado.
 * Assim ninguém fica preso numa versão antiga depois de uma publicação.
 */
export default function AvisoVersaoNova() {
  const [nova, setNova] = useState(false);
  useEffect(() => {
    const atual = scriptAtual();
    if (!atual) return undefined;
    let vivo = true;
    const conferir = async () => {
      try {
        const r = await fetch(`/?v=${Date.now()}`, { cache: "no-store" });
        const publicado = scriptPublicado(await r.text());
        if (vivo && publicado && !atual.endsWith(publicado)) setNova(true);
      } catch { /* sem rede: confere na próxima vez */ }
    };
    const id = setInterval(conferir, 5 * 60_000);
    const aoVoltar = () => { if (document.visibilityState === "visible") conferir(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { vivo = false; clearInterval(id); document.removeEventListener("visibilitychange", aoVoltar); };
  }, []);
  if (!nova) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground">
      <span>Há uma versão nova do InTAX.</span>
      <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-md bg-background px-3 py-1 font-medium text-foreground hover:bg-background/90">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Atualizar agora
      </button>
    </div>
  );
}
