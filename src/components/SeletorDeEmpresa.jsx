import { useId, useMemo, useState } from "react";
import { X } from "lucide-react";

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (s) => String(s || "").replace(/\D/g, "");

/** As empresas que casam com o texto (nome, código ou CNPJ), no máximo `limite`. */
export function buscarEmpresasPorTexto(empresas, texto, limite = 8) {
  const t = semAcento(texto).trim();
  const d = digitos(texto);
  if (!t) return empresas.slice(0, limite);
  return empresas.filter((e) => semAcento(e.razao_social).includes(t) || semAcento(e.id_empresa).includes(t) || (d.length >= 3 && digitos(e.cnpj_cpf).includes(d))).slice(0, limite);
}

/**
 * Campo para escolher uma empresa digitando: mostra as primeiras que casam, navega com as setas e escolhe com Enter.
 * Com uma empresa escolhida, aparece o nome com o botão de tirar.
 */
export default function SeletorDeEmpresa({ empresas, valor, aoMudar, rotulo = "Empresa", placeholder = "Digite o nome, o código ou o CNPJ", opcional = true }) {
  const idLista = useId();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const escolhida = empresas.find((e) => e.id === valor);
  const sugestoes = useMemo(() => buscarEmpresasPorTexto(empresas, busca), [empresas, busca]);

  const escolher = (e) => { aoMudar(e.id); setAberto(false); setBusca(""); };
  const aoTeclar = (ev) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); setAberto(true); setAtivo((i) => Math.min(i + 1, sugestoes.length - 1)); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)); }
    else if (ev.key === "Enter" && aberto && sugestoes[ativo]) { ev.preventDefault(); escolher(sugestoes[ativo]); }
    else if (ev.key === "Escape") setAberto(false);
  };

  return (
    <div className="relative space-y-1">
      <span className="block text-xs text-muted-foreground">{rotulo}{opcional ? " (opcional)" : ""}</span>
      {escolhida ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate">{escolhida.razao_social}</span>
          <button type="button" onClick={() => aoMudar("")} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Tirar a empresa ${escolhida.razao_social}`}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>
      ) : (
        <>
          <input
            role="combobox" aria-expanded={aberto} aria-controls={idLista} aria-autocomplete="list" aria-label={rotulo} autoComplete="off"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={placeholder} value={busca}
            onChange={(e) => { setBusca(e.target.value); setAberto(true); setAtivo(0); }}
            onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 120)} onKeyDown={aoTeclar}
          />
          {aberto && (
            <ul id={idLista} role="listbox" className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md">
              {sugestoes.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nenhuma empresa encontrada.</li>}
              {sugestoes.map((e, i) => (
                <li key={e.id} role="option" aria-selected={i === ativo}>
                  <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => escolher(e)} onMouseEnter={() => setAtivo(i)}
                    className={`block w-full px-3 py-1.5 text-left text-sm ${i === ativo ? "bg-muted" : ""}`}>
                    <span className="block truncate font-medium">{e.razao_social}</span>
                    <span className="block text-[11px] text-muted-foreground tabular-nums">{e.cnpj_cpf || e.id_empresa}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
