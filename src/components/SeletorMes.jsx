import { ChevronLeft, ChevronRight } from "lucide-react";

/** Mês atual em Brasília (AAAA-MM). */
export const mesDeHoje = () => new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());
export const mesValido = (valor) => /^\d{4}-(0[1-9]|1[0-2])$/.test(valor || "");

/**
 * Seletor de mês padrão do InTAX (setas, mês por extenso que abre o calendário, e "Hoje"). O mesmo da Captura de XML e dos Custos:
 * mudar aqui muda nas duas telas.
 */
export default function SeletorMes({ valor, mudar, ariaLabel = "Mês" }) {
  const [ano, mes] = valor.split("-").map(Number);
  const mover = (delta) => mudar(new Date(Date.UTC(ano, mes - 1 + delta, 1)).toISOString().slice(0, 7));
  const rotulo = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(ano, mes - 1, 1)));
  const seta = "grid h-full w-7 shrink-0 place-items-center hover:bg-muted focus-visible:outline focus-visible:outline-primary";
  const trocar = (v) => { if (mesValido(v)) mudar(v); };
  return <div className="inline-flex items-center gap-2" role="group" aria-label={ariaLabel}>
    <div className="inline-flex h-9 items-center rounded-md border border-border bg-background">
      <button type="button" className={seta} aria-label="Mês anterior" onClick={() => mover(-1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
      <label className="relative grid h-full min-w-28 place-items-center px-1 text-center text-sm font-semibold focus-within:ring-2 focus-within:ring-primary">
        <span className="capitalize">{rotulo} {ano}</span>
        <input aria-label="Escolher mês e ano" type="month" value={valor} onChange={(e) => trocar(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full" />
      </label>
      <button type="button" className={seta} aria-label="Próximo mês" onClick={() => mover(1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
    </div>
    <button type="button" onClick={() => mudar(mesDeHoje())} className="botao-acao h-9 rounded-md bg-background px-2.5 text-sm hover:bg-muted">Hoje</button>
  </div>;
}
