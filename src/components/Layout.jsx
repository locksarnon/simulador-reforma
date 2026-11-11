import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu, Search } from "lucide-react";
import MenuLateral from "@/components/MenuLateral";
import BuscaRapida from "@/components/BuscaRapida";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { moduloDoCaminho } from "@/lib/navegacao";

const CHAVE_RECENTES = "intax-modulos-recentes";

function lerRecentes() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || "[]");
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/**
 * Casca das telas internas: menu lateral (no celular, uma gaveta), barra superior com a busca rápida (Ctrl+K) e o conteúdo.
 * Os módulos abertos há pouco ficam guardados neste navegador e aparecem na busca e no Início.
 */
export default function Layout() {
  const { pathname } = useLocation();
  const [gaveta, setGaveta] = useState(false);
  const [busca, setBusca] = useState(false);
  const [recentes, setRecentes] = useState(lerRecentes);

  // Ctrl+K ou ⌘K abre a busca em qualquer tela.
  useEffect(() => {
    const aoTeclar = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBusca((aberta) => !aberta);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  // Guarda os últimos módulos abertos (sem repetir, no máximo 8).
  useEffect(() => {
    const m = moduloDoCaminho(pathname);
    if (!m || m.id === "inicio") return;
    setRecentes((atuais) => {
      const novos = [m.id, ...atuais.filter((id) => id !== m.id)].slice(0, 8);
      try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify(novos)); } catch { /* sem armazenamento */ }
      return novos;
    });
  }, [pathname]);

  const fecharGaveta = useCallback(() => setGaveta(false), []);

  return (
    <div className="min-h-screen bg-canvas flex">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground">
        Pular para o conteúdo
      </a>
      <aside className="hidden lg:block w-64 shrink-0 border-r border-rail-border h-screen sticky top-0">
        <MenuLateral />
      </aside>
      <Sheet open={gaveta} onOpenChange={setGaveta}>
        <SheetContent side="left" className="w-72 border-rail-border bg-rail p-0 text-rail-foreground [&>button]:text-rail-strong">
          <SheetTitle className="sr-only">Menu principal</SheetTitle>
          <SheetDescription className="sr-only">Áreas e módulos do InTAX</SheetDescription>
          <MenuLateral aoNavegar={fecharGaveta} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur lg:px-6">
          <button type="button" onClick={() => setGaveta(true)} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden" aria-label="Abrir o menu">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setBusca(true)}
            className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Buscar módulo ou empresa (Ctrl K)"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Buscar módulo ou empresa</span>
            <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
          </button>
          <div id="barra-superior-acoes" className="ml-auto flex items-center gap-1" />
        </header>
        <main id="conteudo" tabIndex={-1} className="flex-1 min-w-0 focus:outline-none">
          <Outlet />
        </main>
      </div>
      <BuscaRapida aberta={busca} aoMudar={setBusca} recentes={recentes} />
    </div>
  );
}
