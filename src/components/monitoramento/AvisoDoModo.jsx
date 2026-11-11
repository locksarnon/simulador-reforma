import { Link } from "react-router-dom";
import { FlaskConical, PowerOff } from "lucide-react";
import { MODOS } from "@/lib/monitoramento";

/** A faixa do topo das telas do monitoramento: deixa claro quando os dados são de demonstração ou quando está desligado. */
export default function AvisoDoModo({ modo, ehAdmin }) {
  if (!modo || modo === "PRODUCAO") return null;
  const demo = modo === "DEMONSTRACAO";
  const Icone = demo ? FlaskConical : PowerOff;
  return (
    <div role="status" className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${demo ? "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200" : "border-border bg-muted text-muted-foreground"}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong>{MODOS[modo].rotulo}.</strong> {MODOS[modo].texto}
        {ehAdmin && <> <Link to="/admin/integracoes" className="underline">Mudar em Integrações</Link>.</>}
      </p>
    </div>
  );
}
