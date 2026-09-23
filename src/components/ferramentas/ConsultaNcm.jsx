import React, { useEffect, useRef, useState } from "react";
import { Search, Loader2, Copy, Check, ChevronDown } from "lucide-react";
import { api } from "@/api/base44Client";

const SITUACAO = {
  ALIQUOTA_ZERO: { rotulo: "Alíquota zero", cor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
  REDUCAO: { rotulo: "Redução", cor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
  AMBIGUO: { rotulo: "Depende do produto", cor: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  PADRAO_OU_OUTRA_BASE: { rotulo: "Sem exceção nos anexos", cor: "bg-muted text-muted-foreground" },
};

const EXEMPLOS = ["2309", "milho", "ração para bovinos", "1201", "fertilizante"];
const pct = (v) => `${Math.round((v || 0) * 100)}%`;

function Item({ it, aberto: abertoInicial }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [copiado, setCopiado] = useState(false);
  const t = it.tratamento;
  const s = SITUACAO[t.situacao] || SITUACAO.PADRAO_OU_OUTRA_BASE;

  const copiar = async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(it.codigo); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* sem clipboard */ }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <button type="button" onClick={() => setAberto((a) => !a)} className="w-full text-left p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold">{it.codigo_formatado}</span>
            <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${s.cor}`}>{s.rotulo}</span>
            {it.status !== "Ativo" && <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700">Não vigente</span>}
          </div>
          <p className="text-sm text-muted-foreground mt-1 leading-snug">{it.descricao}</p>
        </div>
        <ChevronDown className={`w-4 h-4 mt-1 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{t.titulo}</p>
            <button type="button" onClick={copiar} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copiado ? "Copiado" : "Copiar NCM"}
            </button>
          </div>

          {t.classes.length > 0 && (
            <div className="space-y-1.5">
              {t.classes.map((c) => (
                <div key={c.c_class_trib} className="rounded-md bg-muted/40 p-2.5 text-sm">
                  <span className="font-mono font-semibold">{c.c_class_trib}</span>
                  {c.pct_reducao_ibs > 0 || c.pct_reducao_cbs > 0 ? <span className="text-muted-foreground"> · redução {pct(Math.max(c.pct_reducao_ibs, c.pct_reducao_cbs))}</span> : null}
                  {c.descricao && <p className="text-xs text-muted-foreground mt-0.5">{c.descricao}</p>}
                </div>
              ))}
            </div>
          )}

          {t.anexos.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Base na lei:</span>{" "}
              {t.anexos.map((a, i) => (
                <span key={i}>{i > 0 && "; "}Anexo {a.anexo}{a.item_lei ? `, item ${a.item_lei}` : ""}{a.produto ? ` (${a.produto.slice(0, 80)})` : ""}</span>
              ))}
              {t.confianca !== "—" && <span> · Confiança: {t.confianca}</span>}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed">{t.aviso}</p>
        </div>
      )}
    </div>
  );
}

/** Consulta NCM: digite o código ou parte da descrição e veja o tratamento na reforma. */
export default function ConsultaNcm({ aoConsultar }) {
  const [q, setQ] = useState("");
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) { setDados(null); setErro(""); return undefined; }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setCarregando(true);
      try {
        const r = await api.get("/ncm/consulta", { q: termo });
        if (id === seq.current) { setDados(r); setErro(""); aoConsultar?.(termo); }
      } catch (e) {
        if (id === seq.current) setErro(e.status === 429 ? "Muitas consultas seguidas. Aguarde um instante." : e.message);
      } finally {
        if (id === seq.current) setCarregando(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o NCM (ex.: 2309.90.10) ou o nome do produto"
          className="w-full h-12 rounded-lg border border-input bg-background pl-10 pr-10 text-base focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Buscar NCM"
        />
        {carregando && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {!dados && !erro && (
        <div className="text-sm text-muted-foreground">
          Tente:{" "}
          {EXEMPLOS.map((e, i) => (
            <button key={e} type="button" onClick={() => setQ(e)} className="underline underline-offset-2 hover:text-foreground mr-2">{e}{i < EXEMPLOS.length - 1 ? "," : ""}</button>
          ))}
        </div>
      )}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {dados && (
        <>
          <p className="text-xs text-muted-foreground">
            {dados.total === 0 ? "Nenhum NCM encontrado. Tente outro termo ou apenas os primeiros dígitos." : `${dados.total.toLocaleString("pt-BR")} resultado(s)${dados.truncado ? " — mostrando os 25 primeiros; refine a busca" : ""}`}
          </p>
          <div className="space-y-2">
            {dados.itens.map((it) => <Item key={it.codigo} it={it} aberto={dados.itens.length <= 2} />)}
          </div>
        </>
      )}
    </div>
  );
}
