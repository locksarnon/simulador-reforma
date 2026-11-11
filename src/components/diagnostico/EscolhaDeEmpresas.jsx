import { useMemo, useState } from "react";
import { Building2, Layers, Search, X } from "lucide-react";
import { mascararDocumento, opcoesDoSeletor, rotuloDoGrupo } from "@/lib/clientes";

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Escolha do escopo: busca por empresa ou grupo; clicar num grupo traz todas as empresas dele (dá para tirar as que não entram);
 * clicar numa empresa traz só ela. `valor` é a lista de ids escolhidos.
 */
export default function EscolhaDeEmpresas({ empresas, grupos, valor, aoMudar, aoEscolherGrupo }) {
  const [busca, setBusca] = useState("");
  const { grupos: gruposReais } = useMemo(() => opcoesDoSeletor(grupos, empresas), [grupos, empresas]);
  const escolhidas = new Set(valor);
  const q = semAcento(busca).trim();
  const digitos = busca.replace(/\D/g, "");
  const achadosGrupos = q ? gruposReais.filter((g) => semAcento(g.nome).includes(q)).slice(0, 5) : [];
  const achadas = q ? empresas.filter((e) => !escolhidas.has(e.id) && (semAcento(e.razao_social).includes(q) || (digitos.length >= 3 && String(e.cnpj_cpf || "").replace(/\D/g, "").includes(digitos)))).slice(0, 8) : [];
  const porId = new Map(empresas.map((e) => [e.id, e]));
  const addGrupo = (g) => {
    const doGrupo = empresas.filter((e) => e.grupo === g.numero).map((e) => e.id);
    aoMudar([...new Set([...valor, ...doGrupo])]);
    aoEscolherGrupo?.(g);
    setBusca("");
  };
  const addEmpresa = (e) => { aoMudar([...valor, e.id]); setBusca(""); };
  return (
    <div className="space-y-2">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder="Buscar empresa (nome ou CNPJ) ou grupo" aria-label="Buscar empresa ou grupo" className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      {(achadosGrupos.length > 0 || achadas.length > 0) && (
        <ul className="max-h-56 overflow-y-auto rounded-md border border-border bg-card text-sm" role="listbox" aria-label="Resultados">
          {achadosGrupos.map((g) => (
            <li key={g.id}><button type="button" role="option" aria-selected="false" onClick={() => addGrupo(g)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"><Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {rotuloDoGrupo(g)} <span className="ml-auto text-xs text-muted-foreground">{empresas.filter((e) => e.grupo === g.numero).length} empresa(s)</span></button></li>
          ))}
          {achadas.map((e) => (
            <li key={e.id}><button type="button" role="option" aria-selected="false" onClick={() => addEmpresa(e)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"><Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {e.razao_social} <span className="ml-auto text-xs tabular-nums text-muted-foreground">{mascararDocumento(e.cnpj_cpf)}</span></button></li>
          ))}
        </ul>
      )}
      {valor.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Empresas do escopo">
          {valor.map((id) => {
            const e = porId.get(id);
            return (
              <li key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs">
                {e?.razao_social || "Empresa removida"}
                <button type="button" onClick={() => aoMudar(valor.filter((x) => x !== id))} className="rounded-full p-0.5 hover:bg-primary/20" aria-label={`Tirar ${e?.razao_social || "empresa"} do escopo`}><X className="h-3 w-3" aria-hidden="true" /></button>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-xs text-muted-foreground">Nenhuma empresa escolhida. Busque por uma empresa ou por um grupo (o grupo traz todas as empresas dele; tire as que não entram).</p>}
    </div>
  );
}
