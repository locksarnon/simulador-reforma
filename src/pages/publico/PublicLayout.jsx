import React, { useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { Mail, Check } from "lucide-react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { api } from "@/api/base44Client";

const LINKS = [
  { to: "/calculadora", label: "Calculadora" },
  { to: "/consulta-ncm", label: "Consulta NCM" },
  { to: "/validador-cadastro", label: "Validador de cadastro" },
];

function Inscricao() {
  const [email, setEmail] = useState("");
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState("");
  const enviar = async (e) => {
    e.preventDefault();
    setErro("");
    try { await api.post("/public/newsletter/inscrever", { email }); setOk(true); } catch (err) { setErro(err.message); }
  };
  if (ok) return <p className="text-sm flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /> Inscrição feita! Você receberá o Radar da reforma tributária.</p>;
  return (
    <form onSubmit={enviar} className="flex flex-col sm:flex-row gap-2 sm:items-center">
      <div className="flex items-center gap-2 text-sm font-medium"><Mail className="w-4 h-4" /> Radar semanal da reforma tributária</div>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:w-64" />
      <button className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm">Quero receber</button>
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </form>
  );
}

/** Moldura das ferramentas abertas do InTAX (sem menu lateral, sem login). */
export default function PublicLayout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link to="/calculadora" className="flex items-center gap-2 shrink-0">
            <span className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground"><Logo className="w-4.5 h-4.5" /></span>
            <span className="leading-tight"><span className="block font-heading font-semibold text-sm">InTAX</span><span className="block text-[10px] text-muted-foreground -mt-0.5">por FAL Agro</span></span>
          </Link>
          <nav className="flex-1 flex items-center gap-1 overflow-x-auto">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${isActive ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}>{l.label}</NavLink>
            ))}
          </nav>
          <ThemeToggle />
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">Entrar</Link>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8"><Outlet /></main>
      <footer className="border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
          <Inscricao />
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-3xl">
            InTAX é uma ferramenta orientativa da FAL Agro, baseada na EC 132/2023 e na LC 214/2025. Os resultados são estimativas e não constituem parecer tributário; as regras e alíquotas da transição ainda estão sendo definidas. Valide com um especialista antes de decidir.
          </p>
        </div>
      </footer>
    </div>
  );
}
