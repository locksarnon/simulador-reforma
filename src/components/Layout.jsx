import { NavLink } from "react-router-dom";
import { Outlet } from "react-router-dom";
import {
  CalendarClock,
  CalendarDays,
  BookMarked,
  Settings,
  HelpCircle,
  Layers,
  Code2,
  SlidersHorizontal,
  Newspaper,
  Radar,
  Scale,
  Search,
  Mail,
  Users,
  ExternalLink,
  ClipboardCheck,
  Boxes,
  Archive,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";
import { CAMINHO_REPOSITORIO_XML } from "@/lib/bpoCaminhos";

/**
 * BPO fiscal: guarda e captura dos XML dos clientes e o certificado digital deles.
 * Seção independente do diagnóstico e dos serviços (Grupos e empresas). Para mudar o menu de lugar, mova a linha
 * `secaoBpo` dentro de `sections`; para renomear a seção ou acrescentar itens, mexa só aqui.
 */
const secaoBpo = {
  title: "BPO fiscal",
  items: [
    { to: CAMINHO_REPOSITORIO_XML, label: "Repositório de XML", icon: Archive },
  ],
};

const sections = [
  {
    title: "Trabalho",
    items: [
      { to: "/", label: "Grupos e empresas", icon: Layers, end: true },
    ],
  },
  secaoBpo,
  {
    title: "Consultas e cálculos",
    items: [
      { to: "/ferramentas/consulta-ncm", label: "Consulta NCM", icon: Search },
      { to: "/ferramentas/credito-estoque", label: "Crédito presumido de estoque", icon: Boxes },
    ],
  },
  {
    title: "Inteligência de mercado",
    items: [
      { to: "/base-legal", label: "Base legal", icon: Scale },
      { to: "/agenda-reforma", label: "Agenda da Reforma", icon: CalendarDays },
      { to: "/ferramentas/radar-reforma", label: "Radar de Novidades", icon: Radar },
      { to: "/ferramentas/noticias", label: "Acervo de Notícias", icon: Newspaper },
      { to: "/comercial/newsletter", label: "Newsletter", icon: Mail },
    ],
  },
  {
    title: "Comercial",
    items: [
      { to: "/comercial/leads", label: "Leads", icon: Users },
      { to: "/calculadora", label: "Calculadora pública", icon: ExternalLink, externo: true },
    ],
  },
  {
    title: "Bases Técnicas",
    items: [
      { to: "/cenarios", label: "Cenários", icon: SlidersHorizontal },
      { to: "/transicao", label: "Transição 2026–2033", icon: CalendarClock },
      { to: "/catalogos", label: "Catálogos IBS/CBS", icon: BookMarked },
      { to: "/configuracao", label: "Configuração", icon: Settings },
    ],
  },
  {
    title: "Suporte",
    items: [
      { to: "/roteiro-testes", label: "Roteiro de testes (provisório)", icon: ClipboardCheck },
      { to: "/manual", label: "FAQ & Manual", icon: HelpCircle },
      { to: "/arquitetura", label: "Arquitetura & Correlações", icon: Code2 },
    ],
  },
];

export default function Layout() {

  return (
    <div className="min-h-screen bg-canvas flex">
      <aside className="w-64 shrink-0 border-r border-rail-border bg-rail h-screen sticky top-0 flex flex-col">
        <div className="p-5 border-b border-rail-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <Logo className="w-5 h-5" />
            </div>
            <div className="leading-tight">
              <p className="font-heading font-semibold text-sm text-rail-strong">InTAX</p>
              <p className="text-[11px] text-rail-muted">por FAL Agro · Reforma Tributária</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-rail-muted">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => item.externo ? (
                  <a
                    key={item.to}
                    href={item.to}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors text-rail-foreground hover:bg-rail-accent/60 hover:text-rail-strong"
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </a>
                ) : (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-rail-accent text-rail-strong shadow-[inset_3px_0_0_hsl(var(--rail-primary))]"
                          : "text-rail-foreground hover:bg-rail-accent/60 hover:text-rail-strong"
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-rail-border flex items-center justify-between">
          <span className="text-[11px] text-rail-muted">InTAX v1.0 · 23/09/2026</span>
          <ThemeToggle />
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}