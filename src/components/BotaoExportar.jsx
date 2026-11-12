import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/use-toast";
import { exportarLista } from "@/lib/exportarLista";
import { plural } from "@/lib/plural";

const FORMATOS = [["xlsx", "Excel"], ["pdf", "PDF"], ["csv", "CSV"]];

/** Botão "Exportar" das listas: escolhe as colunas e o formato (Excel, PDF ou CSV) e baixa o que está filtrado na tela. */
export default function BotaoExportar({ titulo, colunas, linhas }) {
  const [aberto, setAberto] = useState(false);
  const [escolhidas, setEscolhidas] = useState(() => colunas.map((c) => c.chave));
  const [formato, setFormato] = useState("xlsx");
  const [gerando, setGerando] = useState(false);
  const alternar = (k) => setEscolhidas((e) => (e.includes(k) ? e.filter((x) => x !== k) : [...e, k]));
  const exportar = async () => {
    setGerando(true);
    try {
      await exportarLista({ titulo, colunas: colunas.filter((c) => escolhidas.includes(c.chave)), linhas, formato });
      setAberto(false);
    } catch (e) {
      toast({ title: "Não foi possível exportar", description: e.message, variant: "destructive" });
    } finally {
      setGerando(false);
    }
  };
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" disabled={!linhas.length} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50" aria-label={`Exportar ${titulo}`}><Download className="h-4 w-4" aria-hidden="true" /> Exportar</button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">{plural(linhas.length, "linha", "linhas")} com os filtros da tela.</p>
        <fieldset className="space-y-1"><legend className="text-xs font-medium">Colunas</legend>
          {colunas.map((c) => <label key={c.chave} className="flex items-center gap-2"><input type="checkbox" checked={escolhidas.includes(c.chave)} onChange={() => alternar(c.chave)} /> {c.rotulo}</label>)}
        </fieldset>
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Formato">
          {FORMATOS.map(([v, r]) => <button key={v} type="button" aria-pressed={formato === v} onClick={() => setFormato(v)} className={`rounded px-3 py-1 text-xs ${formato === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{r}</button>)}
        </div>
        <button type="button" onClick={exportar} disabled={!escolhidas.length || gerando} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{gerando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Baixar</button>
      </PopoverContent>
    </Popover>
  );
}
