import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams } from "react-router-dom";

const atual = () => new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());
const valida = (valor) => /^\d{4}-(0[1-9]|1[0-2])$/.test(valor || "");

export function useCompetenciaXml() {
  const [params, setParams] = useSearchParams();
  const valor = params.get("competencia");
  const competencia = valida(valor) ? valor : atual();
  const mudar = (mes) => {
    if (!valida(mes)) return;
    setParams((anteriores) => {
      const novos = new URLSearchParams(anteriores);
      novos.set("competencia", mes);
      return novos;
    });
  };
  return { competencia, mudar };
}

export default function CompetenciaXml({ competencia, mudar }) {
  const [ano, mes] = competencia.split("-").map(Number);
  const mover = (delta) => {
    const data = new Date(Date.UTC(ano, mes - 1 + delta, 1));
    mudar(data.toISOString().slice(0, 7));
  };
  const rotulo = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(ano, mes - 1, 1)));
  const seta = "p-1.5 hover:bg-muted focus-visible:outline focus-visible:outline-primary";
  return <div className="inline-flex flex-wrap items-center gap-2" role="group" aria-label="Competência de emissão dos XML">
    <div className="inline-flex items-center rounded-md border bg-background">
      <button type="button" className={seta} aria-label="Mês anterior" onClick={() => mover(-1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
      <label className="relative block min-w-28 text-center text-sm font-semibold focus-within:ring-2 focus-within:ring-primary">
        <span className="capitalize">{rotulo} {ano}</span>
        <input aria-label="Escolher mês e ano" type="month" value={competencia} onChange={(e) => mudar(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full" />
      </label>
      <button type="button" className={seta} aria-label="Próximo mês" onClick={() => mover(1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
    </div>
    <button type="button" onClick={() => mudar(atual())} className="rounded border px-2 py-1 text-xs hover:bg-muted">Hoje</button>
  </div>;
}
