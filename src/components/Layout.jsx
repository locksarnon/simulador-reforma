import { NavLink, useNavigate } from "react-router-dom";
import { Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarClock,
  BookMarked,
  Settings,
  Scale,
  HelpCircle,
  Plus,
  Layers,
  Code2,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

const sections = [
  {
    title: "Geral",
    items: [
      { to: "/", label: "DataHub", icon: Layers, end: true },
      { to: "/cockpit", label: "Cockpit", icon: LayoutDashboard },
    ],
  },
  {
    title: "Bases Técnicas",
    items: [
      { to: "/transicao", label: "Transição 2026–2033", icon: CalendarClock },
      { to: "/catalogos", label: "Catálogos IBS/CBS", icon: BookMarked },
      { to: "/configuracao", label: "Configuração", icon: Settings },
    ],
  },
  {
    title: "Suporte",
    items: [
      { to: "/manual", label: "FAQ & Manual", icon: HelpCircle },
      { to: "/arquitetura", label: "Arquitetura & Correlações", icon: Code2 },
    ],
  },
];

export default function Layout() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 shrink-0 border-r border-border bg-sidebar h-screen sticky top-0 flex flex-col">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <Scale className="w-5 h-5" />
            </div>
            <div className="leading-tight">
              <p className="font-heading font-semibold text-sm text-foreground">Simulador FAL</p>
              <p className="text-[11px] text-muted-foreground">Reforma Tributária</p>
            </div>
          </div>
        </div>

        <div className="p-3 border-b border-sidebar-border">
          <Button
            className="w-full gap-2"
            size="sm"
            onClick={() => navigate("/")}
          >
            <Plus className="w-4 h-4" />
            Novo Diagnóstico
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/60"
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

        <div className="p-4 border-t border-sidebar-border flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">v0.18 · 14/08/2026</span>
          <ThemeToggle />
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}