import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronRight, LogOut, Pin, PinOff } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";
import { useAuth } from "@/lib/AuthContext";
import { areasDoMenu, caminhoDaArea, moduloDoCaminho, SITUACAO, situacaoDoModulo } from "@/lib/navegacao";

/** "Administrador" ou "Consultor": o papel decide quem envia certificado, ativa a captura e exclui. */
const LARGURA_ABERTA = 256;
const rotuloPapel = (role) => (role === "admin" ? "Administrador" : "Consultor");
const iniciais = (u) => String(u?.name || u?.email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

/*
 * Tipografia por profundidade (padrão único):
 *  nível 1 (atalhos do topo e áreas): 13,5px, peso 600 nas áreas e 500 nos atalhos;
 *  nível 2 (módulos, no painel lateral ou na gaveta): 13px, peso 400 (500 no ativo);
 *  rótulos de seção: 11px, maiúsculas, espaçamento 0,08em.
 */
const linha = "group/linha relative flex h-10 w-full items-center gap-3 rounded-lg pl-[14px] pr-2 text-left transition-[background-color,color,box-shadow] duration-150 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-primary";
const linhaInativa = "text-rail-foreground hover:bg-rail-hover hover:text-rail-strong hover:shadow-[inset_0_0_0_1px_hsl(var(--rail-border))]";
const linhaAtiva = "bg-gradient-to-r from-rail-primary/25 via-rail-primary/10 to-transparent text-rail-strong shadow-[inset_0_0_0_1px_hsl(var(--rail-primary)/0.25)] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-rail-primary";
const icone = "h-[18px] w-[18px] shrink-0 transition-transform duration-150 ease-out group-hover/linha:scale-110 motion-reduce:transition-none";
const sumir = (compacto) => `whitespace-nowrap transition-opacity duration-150 motion-reduce:transition-none ${compacto ? "pointer-events-none opacity-0" : "opacity-100"}`;
const itemModulo = "group/linha relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-[background-color,color,transform] duration-150 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-primary";
const itemModuloInativo = "text-rail-foreground hover:translate-x-0.5 hover:bg-rail-hover hover:text-rail-strong";
const itemModuloAtivo = "bg-rail-primary/20 font-medium text-rail-strong before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-rail-primary";

function Selo({ situacao }) {
  if (situacao === SITUACAO.BETA) return <span className="ml-auto rounded bg-rail-primary/25 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-rail-strong">Beta</span>;
  if (situacao === SITUACAO.EM_BREVE) return <span className="ml-auto rounded bg-rail-accent px-1.5 text-[10px] font-semibold uppercase tracking-wide text-rail-muted">Em breve</span>;
  return null;
}

function ItemModulo({ m, ativo, aoNavegar }) {
  const classe = `${itemModulo} ${ativo ? itemModuloAtivo : itemModuloInativo}`;
  const conteudo = (
    <>
      <m.icone className="h-4 w-4 shrink-0 opacity-90" aria-hidden="true" />
      <span className="min-w-0 truncate">{m.titulo}</span>
      <Selo situacao={situacaoDoModulo(m)} />
    </>
  );
  return m.externo
    ? <a href={m.to} target="_blank" rel="noreferrer" className={classe}>{conteudo}</a>
    : <Link to={m.to} onClick={aoNavegar} aria-current={ativo ? "page" : undefined} className={classe}>{conteudo}</Link>;
}

/** Painel que abre ao lado da área (sem empurrar o menu para baixo), com abertura e fechamento automáticos ao passar o mouse. */
function PainelLateral({ area, posicao, ativoId, aoNavegar, aoEntrar, aoSair }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="group"
      data-painel-menu=""
      aria-label={`Módulos de ${area.titulo}`}
      onMouseEnter={aoEntrar}
      onMouseLeave={aoSair}
      style={{ top: posicao.top, left: posicao.left }}
      className="sem-barra fixed z-50 max-h-[calc(100vh-16px)] w-[272px] overflow-y-auto rounded-xl border border-rail-border bg-rail p-2 text-rail-foreground shadow-[0_18px_48px_-12px_rgba(0,0,0,0.55)] ring-1 ring-black/10 animate-in fade-in-0 slide-in-from-left-2 duration-150 motion-reduce:animate-none"
    >
      <div className="flex items-center gap-2 px-2.5 pb-2 pt-1">
        <area.icone className="h-3.5 w-3.5 text-rail-primary" aria-hidden="true" />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rail-muted">{area.titulo}</span>
        <Link to={caminhoDaArea(area.id)} onClick={aoNavegar} className="rounded px-1.5 py-0.5 text-[11px] text-rail-muted transition-colors hover:bg-rail-hover hover:text-rail-strong">Ver tudo</Link>
      </div>
      <div className="space-y-0.5">
        {area.modulos.map((m) => <ItemModulo key={m.id} m={m} ativo={ativoId === m.id} aoNavegar={aoNavegar} />)}
      </div>
    </div>,
    document.body,
  );
}

/**
 * O menu lateral: as áreas do catálogo (src/lib/navegacao.js), a conta logada, o Sair e a troca de tema.
 * modo "trilho" (computador): recolhe em ícones e os módulos abrem num painel ao lado.
 * modo "gaveta" (celular): lista completa, uma área aberta por vez.
 */
export default function MenuLateral({ aoNavegar, modo = "gaveta", compacto = false, fixa = false, aoFixar, aoEntrarZona, aoSairZona }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [saindo, setSaindo] = useState(false);
  const ativo = moduloDoCaminho(pathname);
  const areas = areasDoMenu(user);
  const trilho = modo === "trilho";

  // Gaveta: só uma área aberta por vez; a da tela aberta abre sozinha.
  const [aberta, setAberta] = useState(ativo?.area ?? null);
  useEffect(() => { if (ativo?.area) setAberta(ativo.area); }, [ativo?.area]);

  // Trilho: painel lateral da área sob o mouse (ou aberta pelo teclado).
  const [painel, setPainel] = useState(null);
  const timer = useRef();
  const navRef = useRef(null);
  const fecharPainel = useCallback(() => { clearTimeout(timer.current); setPainel(null); }, []);
  const abrirPainel = (area, el, atraso = 70) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      // O menu termina de abrir enquanto o painel aparece: a borda é a do menu aberto (256 px), não a medida do meio da animação.
      const borda = LARGURA_ABERTA;
      const altura = 56 + area.modulos.length * 38;
      const top = Math.max(8, Math.min(r.top - 6, window.innerHeight - altura - 8));
      setPainel({ id: area.id, posicao: { top, left: borda + 6 } });
    }, atraso);
  };
  const agendarFechar = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setPainel(null), 140); };
  const manterPainel = () => { clearTimeout(timer.current); aoEntrarZona?.(); };
  useEffect(() => fecharPainel(), [pathname, fecharPainel]);
  useEffect(() => { if (compacto) fecharPainel(); }, [compacto, fecharPainel]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!painel) return undefined;
    const aoTeclar = (e) => { if (e.key === "Escape") fecharPainel(); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [painel, fecharPainel]);

  const sair = async () => {
    setSaindo(true);
    try { await logout(); } finally { setSaindo(false); }
  };
  const navegar = () => { fecharPainel(); aoNavegar?.(); };
  const areaDoPainel = painel ? areas.find((a) => a.id === painel.id) : null;

  return (
    // No trilho o conteúdo tem largura fixa (256 px): ao abrir e fechar, o menu só é recortado, sem recalcular o layout a cada quadro.
    <div className={`flex h-full flex-col overflow-hidden bg-rail text-rail-foreground ${trilho ? "w-64" : ""}`}>
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-rail-border pl-[18px] pr-2">
        <Link to="/inicio" onClick={navegar} className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-primary" aria-label="InTAX: ir para o Início">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--rail-primary)/0.6)]">
            <Logo className="h-5 w-5" />
          </div>
          <div className={`leading-tight ${sumir(compacto)}`}>
            <p className="font-heading text-[15px] font-semibold text-rail-strong">InTAX</p>
            <p className="text-[11px] text-rail-muted">por FAL Agro</p>
          </div>
        </Link>
        {trilho && aoFixar && !compacto && (
          <button type="button" onClick={aoFixar} aria-pressed={fixa} aria-label={fixa ? "Soltar o menu (abre ao passar o mouse)" : "Fixar o menu aberto"} title={fixa ? "Soltar o menu" : "Fixar o menu aberto"}
            className={`rounded-md p-1.5 text-rail-muted hover:bg-rail-hover hover:text-rail-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-primary ${sumir(compacto)}`}>
            {fixa ? <PinOff className="h-4 w-4" aria-hidden="true" /> : <Pin className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}
      </div>

      <nav ref={navRef} aria-label="Menu principal" className="sem-barra flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        {areas.map((area) => {
          const areaAtiva = area.id === ativo?.area;
          if (area.id === "inicio") {
            return (
              <div key={area.id} className="space-y-1 pb-2">
                {area.modulos.map((m) => (
                  <Link key={m.id} to={m.to} onClick={navegar} aria-current={ativo?.id === m.id ? "page" : undefined} title={compacto ? m.titulo : undefined}
                    className={`${linha} text-[13.5px] font-medium ${ativo?.id === m.id ? linhaAtiva : linhaInativa}`}>
                    <m.icone className={icone} aria-hidden="true" />
                    <span className={sumir(compacto)}>{m.titulo}</span>
                  </Link>
                ))}
                <div className="mx-3 border-t border-rail-border/70" aria-hidden="true" />
              </div>
            );
          }

          if (trilho) {
            const aberto = painel?.id === area.id;
            return (
              <div key={area.id}>
                <div className="relative" onMouseEnter={(e) => abrirPainel(area, e.currentTarget)} onMouseLeave={agendarFechar}>
                  <Link to={caminhoDaArea(area.id)} onClick={navegar} title={compacto ? area.titulo : undefined}
                    className={`${linha} text-[13.5px] font-semibold ${areaAtiva ? linhaAtiva : linhaInativa} ${aberto && !areaAtiva ? "bg-rail-hover text-rail-strong" : ""}`}>
                    <area.icone className={icone} aria-hidden="true" />
                    <span className={`min-w-0 flex-1 truncate ${sumir(compacto)}`}>{area.titulo}</span>
                  </Link>
                  <button type="button" aria-expanded={aberto} aria-label={`${aberto ? "Recolher" : "Abrir"} ${area.titulo}`}
                    onClick={(e) => (aberto ? fecharPainel() : abrirPainel(area, e.currentTarget.parentElement, 0))}
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-rail-muted transition-[opacity,color] duration-150 hover:text-rail-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-primary ${aberto ? "text-rail-strong" : ""} ${sumir(compacto)}`}>
                    <ChevronRight className={`h-4 w-4 transition-transform duration-150 ${aberto ? "translate-x-0.5" : ""}`} aria-hidden="true" />
                  </button>
                </div>
                {areaAtiva && ativo && (
                  <Link to={ativo.to} onClick={navegar} aria-current="page" className={`ml-[44px] mr-2 mt-0.5 block truncate rounded px-2 py-1 text-[12px] font-medium text-rail-primary transition-colors hover:text-rail-strong ${compacto ? "hidden" : ""}`}>
                    {ativo.titulo}
                  </Link>
                )}
              </div>
            );
          }

          const expandida = aberta === area.id;
          return (
            <div key={area.id}>
              <div className="relative">
                <Link to={caminhoDaArea(area.id)} onClick={navegar} className={`${linha} pr-10 text-[13.5px] font-semibold ${areaAtiva ? linhaAtiva : linhaInativa}`}>
                  <area.icone className={icone} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{area.titulo}</span>
                </Link>
                <button type="button" onClick={() => setAberta(expandida ? null : area.id)} aria-expanded={expandida} aria-label={`${expandida ? "Recolher" : "Abrir"} ${area.titulo}`}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-rail-muted transition-colors hover:bg-rail-hover hover:text-rail-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-primary">
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandida ? "" : "-rotate-90"}`} aria-hidden="true" />
                </button>
              </div>
              <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${expandida ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  {expandida && (
                    <div className="ml-[22px] space-y-0.5 border-l border-rail-border/80 py-1 pl-2">
                      {area.modulos.map((m) => <ItemModulo key={m.id} m={m} ativo={ativo?.id === m.id} aoNavegar={navegar} />)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-rail-border px-2 py-3">
        {user && (
          <Link to="/perfil" onClick={navegar} title="Meu perfil e troca de senha" className={`${linha} h-auto py-1.5 ${linhaInativa}`}>
            <span className="-ml-1 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-rail-accent text-[11px] font-semibold text-rail-strong ring-1 ring-rail-border" aria-hidden="true">{iniciais(user)}</span>
            <span className={`min-w-0 leading-tight ${sumir(compacto)}`}>
              <span className="block truncate text-[12.5px] font-medium text-rail-strong">{user.name || user.email}</span>
              <span className="block truncate text-[11px] text-rail-muted">{user.name ? `${rotuloPapel(user.role)} · ${user.email}` : rotuloPapel(user.role)}</span>
            </span>
          </Link>
        )}
        <button type="button" onClick={sair} disabled={saindo} title={compacto ? "Sair" : undefined} className={`${linha} text-[13.5px] font-medium ${linhaInativa} disabled:opacity-60`}>
          <LogOut className={icone} aria-hidden="true" />
          <span className={sumir(compacto)}>{saindo ? "Saindo…" : "Sair"}</span>
        </button>
        <div className="flex items-center justify-between gap-2 pl-[14px] pr-1 pt-1">
          <span className={`text-[11px] text-rail-muted ${compacto ? "hidden" : ""}`}>InTAX v1.0 · 23/09/2026</span>
          <ThemeToggle />
        </div>
      </div>

      {trilho && areaDoPainel && painel && (
        <PainelLateral area={areaDoPainel} posicao={painel.posicao} ativoId={ativo?.id} aoNavegar={navegar}
          aoEntrar={manterPainel} aoSair={() => { agendarFechar(); aoSairZona?.(); }} />
      )}
    </div>
  );
}
