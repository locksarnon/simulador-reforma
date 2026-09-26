import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { api } from "@/api/base44Client";
import { calcularOperacoes } from "@/hooks/useSimuladorData";
import { consolidarPorAno } from "../../../base44/shared/taxEngine";
import { Card } from "@/components/ui/card";
import { BRL } from "@/lib/format";

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

function somar(consolidado) {
  return consolidado.reduce(
    (a, c) => ({ ibsCbs: a.ibsCbs + c.ibsCbsLiquido, carga: a.carga + c.cargaTransicao, debito: a.debito + (c.debitoIbs || 0) + (c.debitoCbs || 0), credito: a.credito + (c.creditoIbs || 0) + (c.creditoCbs || 0) }),
    { ibsCbs: 0, carga: 0, debito: 0, credito: 0 },
  );
}

/**
 * "Como no XML" × "conforme a LC 214 pelo NCM": recalcula as mesmas operações trocando o cClassTrib pelo que os
 * anexos da lei indicam para o NCM (só quando o NCM aponta uma única classe). Não altera nenhum dado salvo.
 */
export default function ComparacaoClassificacao({ operacoes, transicaoMap, transicaoPorAno, classTribGrouped, credPresGrouped, cenarioAtivo, config, totaisXml }) {
  const ncms = useMemo(() => [...new Set(operacoes.map((o) => soDigitos(o.ncm)).filter((d) => d.length >= 4))].sort(), [operacoes]);
  const { data: sugestoes, isLoading } = useQuery({
    queryKey: ["sugestoes-ncm", ncms.join(",")],
    queryFn: () => api.post("/ncm/sugestoes", { ncms }),
    enabled: ncms.length > 0,
    staleTime: 5 * 60_000,
  });

  const r = useMemo(() => {
    if (!sugestoes) return null;
    let trocadas = 0;
    const divergentes = new Map();
    const ops = operacoes.map((op) => {
      const s = sugestoes[soDigitos(op.ncm)];
      if (!s?.c_class_trib || s.c_class_trib === op.c_class_trib) return op;
      trocadas += 1;
      const chave = `${soDigitos(op.ncm)}|${op.c_class_trib}|${s.c_class_trib}`;
      divergentes.set(chave, { ncm: op.ncm, xml: op.c_class_trib, lei: s.c_class_trib, reducao: Math.max(s.pct_reducao_ibs, s.pct_reducao_cbs), qtd: (divergentes.get(chave)?.qtd || 0) + 1, anexos: s.anexos });
      return { ...op, c_class_trib: s.c_class_trib };
    });
    const calc = calcularOperacoes(ops, transicaoMap, classTribGrouped, credPresGrouped, cenarioAtivo, config);
    return { trocadas, total: operacoes.length, lei: somar(consolidarPorAno(calc, transicaoPorAno)), lista: [...divergentes.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 6) };
  }, [sugestoes, operacoes, transicaoMap, transicaoPorAno, classTribGrouped, credPresGrouped, cenarioAtivo, config]);

  if (ncms.length === 0) return null;
  const xml = { ibsCbs: totaisXml.ibsCbs, carga: totaisXml.cargaTransicao };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-heading font-medium text-sm">Classificação: como no XML × conforme a LC 214 pelo NCM</h3>
      </div>
      {isLoading || !r ? <p className="text-sm text-muted-foreground">Comparando com os anexos da lei…</p> : (
        <>
          <p className="text-xs text-muted-foreground">
            {r.trocadas === 0
              ? "Os cClassTrib do XML já batem com o que os anexos da LC 214 indicam para os NCMs — não há diferença de cálculo."
              : `${r.trocadas} de ${r.total} operação(ões) têm cClassTrib no XML diferente do que os anexos da LC 214 indicam para o NCM. Abaixo, o efeito no resultado se a lei fosse aplicada.`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-b border-border"><th className="py-1.5 pr-4">Resultado</th><th className="pr-4 text-right">Como no XML</th><th className="pr-4 text-right">Conforme a LC 214</th><th className="text-right">Diferença</th></tr></thead>
              <tbody>
                {[["IBS/CBS líquido", xml.ibsCbs, r.lei.ibsCbs], ["Carga da transição", xml.carga, r.lei.carga]].map(([nome, a, b]) => (
                  <tr key={nome} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-4">{nome}</td>
                    <td className="pr-4 text-right tabular-nums">{BRL(a)}</td>
                    <td className="pr-4 text-right tabular-nums">{BRL(b)}</td>
                    <td className={`text-right tabular-nums font-medium ${b - a < 0 ? "text-chart-2" : b - a > 0 ? "text-destructive" : ""}`}>{BRL(b - a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.lista.length > 0 && (
            <div className="text-xs">
              <p className="font-medium mb-1">Principais diferenças (NCM: XML → LC 214)</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {r.lista.map((d) => <li key={`${d.ncm}${d.xml}${d.lei}`}>{d.ncm}: {d.xml} → {d.lei}{d.reducao ? ` (redução de ${Math.round(d.reducao * 100)}%)` : ""} · {d.qtd} operação(ões){d.anexos?.length ? ` · Anexo ${d.anexos.join(", ")}` : ""}</li>)}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Orientativo: só considera NCMs que apontam uma única classe nos anexos mapeados. Não substitui a classificação fiscal do contribuinte.</p>
        </>
      )}
    </Card>
  );
}
