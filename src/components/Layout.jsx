import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu, Search, X } from "lucide-react";
import MenuLateral from "@/components/MenuLateral";
import BuscaRapida from "@/components/BuscaRapida";
import SinoNotificacoes from "@/components/SinoNotificacoes";
import SeletorEmpresaEmFoco from "@/components/SeletorEmpresaEmFoco";
import AvisoVersaoNova from "@/components/AvisoVersaoNova";
import { EmpresaEmFocoProvider } from "@/lib/EmpresaEmFoco";
import { moduloDoCaminho } from "@/lib/navegacao";

const CHAVE_RECENTES = "intax-modulos-recentes";
const CHAVE_FIXA = "intax-menu-fixo";

function lerFixa() {
  try { return localStorage.getItem(CHAVE_FIXA) === "1"; } catch { return false; }
}

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

  const botaoMenu = useRef(null);
  const fecharGaveta = useCallback(() => {
    setGaveta(false);
    botaoMenu.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!gaveta) return;
    const aoTeclar = (e) => {
      if (e.key === "Escape" && !e.defaultPrevented) fecharGaveta();
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const aoRedimensionar = (e) => { if (e.matches) setGaveta(false); };
    window.addEventListener("keydown", aoTeclar);
    desktop.addEventListener("change", aoRedimensionar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      desktop.removeEventListener("change", aoRedimensionar);
    };
  }, [gaveta, fecharGaveta]);

  // Menu do computador: recolhido em ícones, expande no fluxo da página ao passar o mouse e recolhe ao sair; o alfinete deixa fixo.
  const [fixa, setFixa] = useState(lerFixa);
  const [sobre, setSobre] = useState(false);
  const timerZona = useRef();
  const dentroRef = useRef(false);
  const entrarZona = useCallback(() => { clearTimeout(timerZona.current); timerZona.current = setTimeout(() => setSobre(true), 40); }, []);
  const sairZona = useCallback(() => { clearTimeout(timerZona.current); timerZona.current = setTimeout(() => setSobre(false), 90); }, []);
  useEffect(() => () => clearTimeout(timerZona.current), []);
  // A posição do ponteiro decide abrir e fechar (menu ou painel lateral de módulos = dentro; qualquer outro lugar = fora).
  // Não depende do foco nem do mouseleave, que falham quando o menu encolhe debaixo do cursor ou o foco fica num link clicado.
  useEffect(() => {
    if (fixa) return undefined;
    const aoMover = (e) => {
      const alvo = e.target instanceof Element ? e.target : null;
      const dentro = !!alvo?.closest("[data-menu-lateral],[data-painel-menu]");
      if (dentro === dentroRef.current) return;
      dentroRef.current = dentro;
      if (dentro) entrarZona(); else sairZona();
    };
    const aoSairDaJanela = (e) => { if (!e.relatedTarget) { dentroRef.current = false; sairZona(); } };
    document.addEventListener("pointermove", aoMover, { passive: true });
    document.addEventListener("pointerout", aoSairDaJanela);
    return () => { document.removeEventListener("pointermove", aoMover); document.removeEventListener("pointerout", aoSairDaJanela); };
  }, [fixa, entrarZona, sairZona]);
  // Teclado: o menu abre quando o foco chega por Tab e fecha quando sai (clique de mouse não conta).
  const aoFocar = (e) => { if (e.target.matches?.(":focus-visible")) entrarZona(); };
  const aoDesfocar = (e) => { if (!e.currentTarget.contains(e.relatedTarget) && !dentroRef.current) sairZona(); };
  const alternarFixa = () => setFixa((v) => { try { localStorage.setItem(CHAVE_FIXA, v ? "0" : "1"); } catch { /* sem armazenamento */ } return !v; });
  const expandida = fixa || sobre;

  return (
    <EmpresaEmFocoProvider>
    <div className="flex min-h-screen overflow-x-clip bg-canvas">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground">
        Pular para o conteúdo
      </a>
      <aside
        data-menu-lateral=""
        onFocus={aoFocar}
        onBlur={aoDesfocar}
        className={`sticky top-0 hidden h-dvh shrink-0 self-start overflow-hidden border-r border-rail-border transition-[width] duration-150 ease-out motion-reduce:transition-none lg:block ${expandida ? "w-64" : "w-[72px]"}`}
      >
        <MenuLateral modo="trilho" compacto={!expandida} fixa={fixa} aoFixar={alternarFixa} />
      </aside>
      <aside
        id="menu-movel"
        aria-label="Menu principal"
        inert={gaveta ? undefined : ""}
        className={`sticky top-0 h-dvh shrink-0 self-start overflow-hidden transition-[width] duration-150 ease-out motion-reduce:transition-none lg:hidden ${gaveta ? "w-[min(18rem,75vw)]" : "w-0"}`}
      >
        <div className="flex h-full w-[min(18rem,75vw)] flex-col border-r border-rail-border bg-rail text-rail-foreground">
          {gaveta && <button type="button" className="m-2 self-end rounded-md p-2 hover:bg-rail-hover" aria-label="Fechar o menu" onClick={fecharGaveta} autoFocus>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>}
          <div className="min-h-0 flex-1">{gaveta && <MenuLateral modo="gaveta" aoNavegar={fecharGaveta} />}</div>
        </div>
      </aside>

      <div className="flex w-full min-w-0 shrink-0 flex-col lg:w-auto lg:flex-1">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur lg:px-6">
          <button type="button" ref={botaoMenu} aria-controls="menu-movel" aria-expanded={gaveta} onClick={() => gaveta ? fecharGaveta() : setGaveta(true)} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden" aria-label={gaveta ? "Fechar menu principal" : "Abrir o menu"}>
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
          <div id="barra-superior-acoes" className="ml-auto flex items-center gap-1">
            <SeletorEmpresaEmFoco />
            <SinoNotificacoes />
          </div>
        </header>
        <AvisoVersaoNova />
        <main id="conteudo" tabIndex={-1} className="flex-1 min-w-0 focus:outline-none">
          <Outlet />
        </main>
      </div>
      <BuscaRapida aberta={busca} aoMudar={setBusca} recentes={recentes} />
    </div>
    </EmpresaEmFocoProvider>
  );
}
