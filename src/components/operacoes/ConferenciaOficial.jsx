import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { BRL } from "@/lib/format";

const TOLERANCIA = 0.0105;

/** Corpo do pedido: os mesmos números que o motor usou nesta operação (fatores e alíquotas do ano). */
export function pedidoDeConferencia(calc, anoParams, classTrib) {
  const op = calc.op;
  const ib = calc.ibsCbs;
  const ano = Number(anoParams?.ano) || Number(op.ano);
  let semAlcance = null;
  if (op.direcao !== "Saida") semAlcance = "A conferência com a calculadora oficial é feita para as saídas (débito de IBS e CBS).";
  else if (Number(op.valor_bruto) <= 0) semAlcance = "Devolução: a conferência com a calculadora oficial é feita para a venda original.";
  else if (ib.combustivel?.aplicavel) semAlcance = "Combustível do regime específico (alíquota por unidade): a calculadora oficial ainda não calcula.";
  else if (Number(op.is_pct) > 0) semAlcance = "Operação com Imposto Seletivo: a conferência do IS ainda não é feita.";
  else if (String(op.compra_governamental_informado || "").toLowerCase().startsWith("s")) semAlcance = "Venda a órgão público: o redutor de compras governamentais depende de ato ainda não publicado.";
  else if (ib.naoRecolhido === "Suspensão") semAlcance = "Suspensão: sem tributo a conferir nesta etapa.";
  else if (ib.regimeReceitaBruta && ano >= 2027) semAlcance = "Locação pelo regime opcional (art. 487 da LC 214): a calculadora oficial usa alíquota fictícia a partir de 2027; o simulador aplica os 3,65% da receita bruta da lei.";
  return {
    data: op.data ? String(op.data).slice(0, 10) : undefined, ano, cst: String(classTrib?.cst || op.cst_ibs_cbs || ""), cClassTrib: String(classTrib?.c_class_trib || op.c_class_trib || ""),
    ncm: op.ncm || undefined, nbs: op.nbs || undefined, valorBruto: Number(op.valor_bruto), pisPct: Number(op.pis_pct) || 0, cofinsPct: Number(op.cofins_pct) || 0,
    icmsPct: Number(op.icms_pct) || 0, fcpPct: Number(op.fcp_pct) || 0, issPct: Number(op.iss_pct) || 0,
    fatores: { pisCofins: Number(anoParams?.pis_cofins_fator) || 0, icms: Number(anoParams?.icms_fator) || 0, iss: Number(anoParams?.iss_fator) || 0 },
    aliquotas: { cbs: (Number(anoParams?.cbs_efetiva) || 0) * 100, ibsUf: (Number(anoParams?.ibs_uf_aliquota) || 0) * 100, ibsMun: (Number(anoParams?.ibs_mun_aliquota) || 0) * 100 },
    semAlcance,
  };
}

/** O motor × a calculadora oficial: o que cada um achou de base, CBS e IBS. */
export function compararComMotor(ib, oficial) {
  const linhas = [
    ["Base de cálculo", ib.baseCalculo, oficial.vBC],
    ["CBS", ib.debitoCbs, oficial.vCBS],
    ["IBS", ib.debitoIbs, oficial.vIBS],
  ].map(([rotulo, motor, of]) => ({ rotulo, motor: Number(motor) || 0, oficial: Number(of) || 0 }));
  return { linhas, confere: linhas.every((l) => Math.abs(l.motor - l.oficial) <= TOLERANCIA) };
}

/** Selo "conferido com a calculadora oficial da Receita" no detalhe da operação. */
export default function ConferenciaOficial({ calc, anoParams, classTrib }) {
  const pedido = pedidoDeConferencia(calc, anoParams, classTrib);
  const q = useQuery({ queryKey: ["conferir-operacao", pedido], queryFn: () => api.post("/calculadora-rfb/conferir-operacao", pedido), staleTime: 10 * 60 * 1000, retry: false });
  if (q.isLoading) return <p className="text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" aria-hidden="true" /> Conferindo com a calculadora oficial da Receita…</p>;
  if (q.error) return <p className="text-xs text-muted-foreground">Calculadora oficial da Receita indisponível agora: a conferência não foi feita.</p>;
  const c = q.data;
  const v = c.versao ? ` (calculadora ${c.versao.versaoApp}, banco ${c.versao.versaoDb})` : "";
  if (c.estado !== "COMPARAVEL") return <p className="text-xs text-muted-foreground" role="status">Conferência com a calculadora oficial da Receita: {c.motivo}{c.erros?.length ? ` (${c.erros.map((e) => `${e.codigo}: ${e.mensagem}`).join(" · ")})` : ""}</p>;
  const r = compararComMotor(calc.ibsCbs, c.oficial);
  return (
    <div className="space-y-1 text-xs" role="status">
      <p className={r.confere ? "font-medium text-emerald-700 dark:text-emerald-400" : "font-medium text-red-700 dark:text-red-400"}>
        {r.confere ? `Conferido com a calculadora oficial da Receita${v}.` : `Diverge da calculadora oficial da Receita${v}.`}
      </p>
      {!r.confere && (
        <ul className="text-muted-foreground">{r.linhas.map((l) => <li key={l.rotulo}>{l.rotulo}: motor {BRL(l.motor)} × calculadora oficial {BRL(l.oficial)}</li>)}</ul>
      )}
      <p className="text-muted-foreground">Confere a base do art. 12, a redução e o tributo; a partir de 2027 usa as alíquotas do cenário escolhido. O município é de referência.</p>
    </div>
  );
}
