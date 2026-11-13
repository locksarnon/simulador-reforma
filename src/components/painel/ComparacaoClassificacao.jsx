import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { api } from "@/api/client";
import { calcularOperacoes } from "@/hooks/useSimuladorData";
import { consolidarPorAno } from "@/motor/taxEngine";
import { Card } from "@/components/ui/card";
import { BRL } from "@/lib/format";
import { plural } from "@/lib/plural";
import TabelaPadrao from "@/components/TabelaPadrao";

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
              : `${r.trocadas} de ${plural(r.total, "operação", "operações")} com cClassTrib diferente do indicado nos anexos da LC 214.`}
          </p>
          <TabelaPadrao simples id="painel-classificacao-resultado" ariaLabel="Resultado como no XML e conforme a LC 214" chaveLinha={(l) => l.nome} ordemInicial={null}
            linhas={[{ nome: "IBS/CBS líquido", xml: xml.ibsCbs, lei: r.lei.ibsCbs }, { nome: "Carga da transição", xml: xml.carga, lei: r.lei.carga }]}
            colunas={[
              { chave: "nome", rotulo: "Resultado" },
              { chave: "xml", rotulo: "Como no XML", alinhar: "direita", render: (l) => BRL(l.xml) },
              { chave: "lei", rotulo: "Conforme a LC 214", alinhar: "direita", render: (l) => BRL(l.lei) },
              { chave: "diferenca", rotulo: "Diferença", alinhar: "direita", valor: (l) => l.lei - l.xml, render: (l) => <span className={`font-medium ${l.lei - l.xml < 0 ? "text-chart-2" : l.lei - l.xml > 0 ? "text-destructive" : ""}`}>{BRL(l.lei - l.xml)}</span> },
            ]}
          />
          {r.lista.length > 0 && (
            <TabelaPadrao simples titulo="Principais diferenças" id="painel-classificacao-diferencas" ariaLabel="Principais diferenças de cClassTrib" chaveLinha={(d) => `${d.ncm}${d.xml}${d.lei}`} ordemInicial={{ chave: "qtd", dir: -1 }}
              linhas={r.lista}
              colunas={[
                { chave: "ncm", rotulo: "NCM" },
                { chave: "xml", rotulo: "cClassTrib no XML" },
                { chave: "lei", rotulo: "cClassTrib pela LC 214" },
                { chave: "reducao", rotulo: "Redução", alinhar: "direita", valor: (d) => d.reducao || null, render: (d) => (d.reducao ? `${Math.round(d.reducao * 100)}%` : "") },
                { chave: "qtd", rotulo: "Operações", tipo: "numero", alinhar: "direita" },
                { chave: "anexos", rotulo: "Anexo", valor: (d) => (d.anexos?.length ? d.anexos.join(", ") : "") },
              ]}
            />
          )}
          <p className="text-[11px] text-muted-foreground">Orientativo: só considera NCMs que apontam uma única classe nos anexos mapeados. Não substitui a classificação fiscal do contribuinte.</p>
        </>
      )}
    </Card>
  );
}
