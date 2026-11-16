import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ExternalLink, Printer, Search } from "lucide-react";
import { POPS, POPS_ATUALIZADO_EM } from "@/components/manual/pops";
import { AREAS, moduloPorId } from "@/lib/navegacao";

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const textoDoPop = (p) => semAcento([p.codigo, p.titulo, p.objetivo, p.caminho, p.quem, p.quando, ...(p.antes || []), ...(p.passos || []).flatMap((x) => [x.acao, x.detalhe]), p.resultado, ...(p.atencao || [])].join(" "));

/** Um POP: cabeçalho que abre e fecha; dentro, objetivo, responsável, quando, pré-requisitos, passos, resultado e cuidados. */
function CartaoPop({ pop, aberto, alternar }) {
  const modulo = moduloPorId(pop.modulo);
  return (
    <article id={pop.codigo} className={`rounded-lg border border-border bg-card ${aberto ? "pop-aberto" : "print:hidden"}`}>
      <button type="button" onClick={alternar} aria-expanded={aberto} className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted/50">
        <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] tabular-nums">{pop.codigo}</span>
        <span className="flex-1">
          <span className="block text-sm font-medium">{pop.titulo}</span>
          <span className="block text-xs text-muted-foreground">{pop.caminho}</span>
        </span>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 transition-transform print:hidden ${aberto ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {aberto && (
        <div className="space-y-3 border-t border-border px-3 py-3 text-sm">
          <p>{pop.objetivo}</p>
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            <div><dt className="inline text-muted-foreground">Quem faz: </dt><dd className="inline">{pop.quem}</dd></div>
            <div><dt className="inline text-muted-foreground">Quando: </dt><dd className="inline">{pop.quando}</dd></div>
          </dl>
          {pop.antes?.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Antes de começar</h4>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{pop.antes.map((a) => <li key={a}>{a}</li>)}</ul>
            </section>
          )}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passo a passo</h4>
            <ol className="mt-1 space-y-1.5">
              {pop.passos.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular-nums">{i + 1}</span>
                  <span>{p.acao}{p.detalhe && <span className="block text-xs text-muted-foreground">{p.detalhe}</span>}</span>
                </li>
              ))}
            </ol>
          </section>
          {pop.resultado && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resultado esperado</h4>
              <p className="mt-1">{pop.resultado}</p>
            </section>
          )}
          {pop.atencao?.length > 0 && (
            <section className="rounded-md border border-amber-300/60 bg-amber-50 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Atenção</h4>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{pop.atencao.map((a) => <li key={a}>{a}</li>)}</ul>
            </section>
          )}
          <div className="flex flex-wrap gap-2 print:hidden">
            {modulo?.to && !modulo.externo && (
              <Link to={modulo.to} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Abrir a tela</Link>
            )}
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><Printer className="h-3.5 w-3.5" aria-hidden="true" />Imprimir este POP</button>
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * Manual em POP: procedimentos passo a passo de cada tela, por área do menu, com busca. O endereço ?pop=CODIGO abre direto um POP
 * (para mandar o link a um colega).
 */
export default function ManualPop() {
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState("");
  const [area, setArea] = useState("");
  const aberto = params.get("pop") || "";
  const alternar = (codigo) => setParams((p) => { const n = new URLSearchParams(p); if (n.get("pop") === codigo) n.delete("pop"); else n.set("pop", codigo); n.set("aba", "pop"); return n; }, { replace: true });
  const porArea = useMemo(() => {
    const termo = semAcento(busca.trim());
    const lista = POPS.filter((p) => (!termo || termo.split(/\s+/).every((t) => textoDoPop(p).includes(t))) && (!area || moduloPorId(p.modulo)?.area === area));
    return AREAS.map((a) => ({ ...a, pops: lista.filter((p) => moduloPorId(p.modulo)?.area === a.id) })).filter((a) => a.pops.length);
  }, [busca, area]);
  const total = porArea.reduce((n, a) => n + a.pops.length, 0);
  const areasComPop = AREAS.filter((a) => POPS.some((p) => moduloPorId(p.modulo)?.area === a.id));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <label className="relative flex-1 min-w-[16rem]">
          <span className="sr-only">Buscar procedimento</span>
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar: o que você quer fazer? (ex.: certidão, XML, usuário)" className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm" />
        </label>
        <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área do menu" className="h-8 rounded-md border border-border bg-background px-2 text-sm">
          <option value="">Todas as áreas</option>
          {areasComPop.map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
        </select>
        <span className="text-xs text-muted-foreground tabular-nums">{total} de {POPS.length} procedimentos · atualizado em {POPS_ATUALIZADO_EM}</span>
      </div>
      {!total && <p className="text-sm text-muted-foreground">Nenhum procedimento com essa busca.</p>}
      {porArea.map((a) => (
        <section key={a.id} className="space-y-2" aria-label={a.titulo}>
          <h3 className="text-sm font-semibold print:hidden">{a.titulo}</h3>
          {a.pops.map((p) => <CartaoPop key={p.codigo} pop={p} aberto={aberto === p.codigo} alternar={() => alternar(p.codigo)} />)}
        </section>
      ))}
    </div>
  );
}
