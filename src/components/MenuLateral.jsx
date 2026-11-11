import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, LogOut } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";
import { useAuth } from "@/lib/AuthContext";
import { areasDoMenu, caminhoDaArea, moduloDoCaminho, SITUACAO, situacaoDoModulo } from "@/lib/navegacao";

const CHAVE_ABERTAS = "intax-menu-areas-abertas";

function lerAbertas() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_ABERTAS) || "[]");
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function gravarAbertas(lista) {
  try { localStorage.setItem(CHAVE_ABERTAS, JSON.stringify(lista)); } catch { /* sem armazenamento: vale só nesta visita */ }
}

/** "Administrador" ou "Consultor": o papel decide quem envia certificado, ativa a captura e exclui. */
const rotuloPapel = (role) => (role === "admin" ? "Administrador" : "Consultor");

const itemBase = "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-primary";
const itemInativo = "text-rail-foreground hover:bg-rail-accent/60 hover:text-rail-strong";
const itemAtivo = "bg-rail-accent text-rail-strong shadow-[inset_3px_0_0_hsl(var(--rail-primary))]";

function Selo({ situacao }) {
  if (situacao === SITUACAO.BETA) return <span className="ml-auto rounded bg-rail-primary/20 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-rail-strong">Beta</span>;
  if (situacao === SITUACAO.EM_BREVE) return <span className="ml-auto rounded bg-rail-accent px-1.5 text-[10px] font-semibold uppercase tracking-wide text-rail-muted">Em breve</span>;
  return null;
}

/** O menu lateral: as áreas do catálogo (src/lib/navegacao.js), a conta logada, o Sair e a troca de tema. */
export default function MenuLateral({ aoNavegar }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [saindo, setSaindo] = useState(false);
  const ativo = moduloDoCaminho(pathname);
  // A área da tela aberta já nasce aberta; as outras seguem o que a pessoa abriu antes.
  const [abertas, setAbertas] = useState(() => {
    const guardadas = lerAbertas();
    return ativo && !guardadas.includes(ativo.area) ? [...guardadas, ativo.area] : guardadas;
  });
  const areas = areasDoMenu(user);

  // Ao mudar de área (por link, busca ou botão Voltar), a área nova abre sozinha: ninguém fica perdido no menu.
  useEffect(() => {
    if (ativo && !abertas.includes(ativo.area)) {
      const nova = [...abertas, ativo.area];
      setAbertas(nova);
      gravarAbertas(nova);
    }
  }, [ativo?.area]);

  const alternar = (id) => {
    const nova = abertas.includes(id) ? abertas.filter((a) => a !== id) : [...abertas, id];
    setAbertas(nova);
    gravarAbertas(nova);
  };
  const sair = async () => {
    setSaindo(true);
    try { await logout(); } finally { setSaindo(false); }
  };

  return (
    <div className="flex h-full flex-col bg-rail">
      <div className="p-5 border-b border-rail-border">
        <Link to="/inicio" onClick={aoNavegar} className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-primary" aria-label="InTAX: ir para o Início">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <Logo className="w-5 h-5" />
          </div>
          <div className="leading-tight">
            <p className="font-heading font-semibold text-sm text-rail-strong">InTAX</p>
            <p className="text-[11px] text-rail-muted">por FAL Agro · Reforma Tributária</p>
          </div>
        </Link>
      </div>

      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto p-3 space-y-1">
        {areas.map((area) => {
          const aberta = abertas.includes(area.id);
          const areaAtiva = area.id === ativo?.area;
          if (area.id === "inicio") {
            const m = area.modulos[0];
            return (
              <Link key={area.id} to={m.to} onClick={aoNavegar} aria-current={ativo?.id === m.id ? "page" : undefined} className={`${itemBase} ${ativo?.id === m.id ? itemAtivo : itemInativo}`}>
                <area.icone className="w-4 h-4 shrink-0" aria-hidden="true" />
                {m.titulo}
              </Link>
            );
          }
          return (
            <div key={area.id} className="pt-1">
              <div className={`flex items-center rounded-md ${areaAtiva ? "text-rail-strong" : "text-rail-muted"}`}>
                <Link to={caminhoDaArea(area.id)} onClick={aoNavegar} className="flex flex-1 items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider hover:text-rail-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-primary rounded-md" title={`Ver os módulos de ${area.titulo}`}>
                  <area.icone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {area.titulo}
                </Link>
                <button type="button" onClick={() => alternar(area.id)} aria-expanded={aberta} aria-label={`${aberta ? "Recolher" : "Abrir"} ${area.titulo}`} className="mr-1 rounded p-1.5 hover:bg-rail-accent/60 hover:text-rail-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-primary">
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberta ? "" : "-rotate-90"}`} aria-hidden="true" />
                </button>
              </div>
              {aberta && (
                <div className="mt-0.5 space-y-0.5">
                  {area.modulos.map((m) => m.externo ? (
                    <a key={m.id} href={m.to} target="_blank" rel="noreferrer" className={`${itemBase} ${itemInativo}`}>
                      <m.icone className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {m.titulo}
                    </a>
                  ) : (
                    <Link key={m.id} to={m.to} onClick={aoNavegar} aria-current={ativo?.id === m.id ? "page" : undefined} className={`${itemBase} ${ativo?.id === m.id ? itemAtivo : itemInativo}`}>
                      <m.icone className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 truncate">{m.titulo}</span>
                      <Selo situacao={situacaoDoModulo(m)} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-rail-border space-y-2">
        {user && (
          <div className="px-1 leading-tight">
            <p className="truncate text-xs font-medium text-rail-strong" title={user.name || user.email}>{user.name || user.email}</p>
            <p className="truncate text-[11px] text-rail-muted" title={user.email}>{user.name ? `${rotuloPapel(user.role)} · ${user.email}` : rotuloPapel(user.role)}</p>
          </div>
        )}
        <button
          type="button"
          onClick={sair}
          disabled={saindo}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors text-rail-foreground hover:bg-rail-accent/60 hover:text-rail-strong disabled:opacity-60"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {saindo ? "Saindo…" : "Sair"}
        </button>
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-rail-muted">InTAX v1.0 · 23/09/2026</span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
