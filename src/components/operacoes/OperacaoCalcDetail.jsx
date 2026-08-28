import { BRL, pct } from "@/lib/format";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

function Row({ label, value, isPct, strong }) {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-medium font-heading" : ""}>{isPct ? pct(value) : BRL(value)}</span>
    </div>
  );
}

function Module({ title, children, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40"
      >
        <span className="font-heading font-medium text-sm">{title}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export default function OperacaoCalcDetail({ calc }) {
  const { sistemaAtual: s, ibsCbs: ib, transicao: t, precoMargem: pm, caixa: cx } = calc;
  return (
    <div className="space-y-2.5">
      <Module title="Sistema atual" defaultOpen>
        <Row label="PIS" value={s.pis} />
        <Row label="Cofins" value={s.cofins} />
        <Row label="ICMS próprio" value={s.icmsProprio} />
        <Row label="FCP" value={s.fcp} />
        <Row label="ICMS-ST" value={s.icmsSt} />
        <Row label="ISS" value={s.iss} />
        <Row label="IPI" value={s.ipi} />
        <Row label="Tributos brutos" value={s.tributosBrutos} strong />
        <Row label="Créditos atuais" value={s.creditosAtuais} />
        <Row label="Tributos líquidos" value={s.tributosLiquidos} strong />
        <Row label="Carga efetiva" value={s.cargaEfetiva} isPct strong />
      </Module>

      <Module title="IBS/CBS">
        <Row label="IBS nominal" value={ib.ibsNominal} isPct />
        <Row label="CBS nominal" value={ib.cbsNominal} isPct />
        <Row label="IBS efetiva" value={ib.ibsEfetiva} isPct />
        <Row label="CBS efetiva" value={ib.cbsEfetiva} isPct />
        <Row label="Débito IBS" value={ib.debitoIbs} />
        <Row label="Débito CBS" value={ib.debitoCbs} />
        <Row label="Crédito IBS" value={ib.creditoIbs} />
        <Row label="Crédito CBS" value={ib.creditoCbs} />
        <Row label="Crédito presumido total" value={ib.credPresTotal} />
        <div className="flex justify-between py-1.5 text-sm border-b border-border/40 last:border-0">
          <span className="text-muted-foreground">Status crédito presumido</span>
          <span className={`font-medium ${ib.statusCredPres === "Localizado" ? "text-chart-2" : ib.statusCredPres === "Pendente" || ib.statusCredPres === "Não localizado" ? "text-destructive" : "text-muted-foreground"}`}>{ib.statusCredPres}</span>
        </div>
        <Row label="IBS/CBS líquido" value={ib.ibsCbsLiquido} strong />
        <Row label="Carga efetiva" value={ib.cargaEfetiva} isPct strong />
        <Row label="Split retido" value={ib.splitRetido} />
      </Module>

      <Module title="Transição">
        <Row label="PIS/Cofins remanescente" value={t.pisCofinsAtual} />
        <Row label="IPI remanescente" value={t.ipiAtual} />
        <Row label="ICMS/FCP/ST remanescente" value={t.icmsFcpStAtual} />
        <Row label="ISS remanescente" value={t.issAtual} />
        <Row label="Sistema atual remanescente" value={t.sistemaAtualRemanescente} strong />
        <Row label="IBS/CBS financeiro" value={t.ibsCbsFinanceiro} />
        <Row label="Carga total transição" value={t.cargaTotalTransicao} strong />
        <Row label="Carga efetiva" value={t.cargaEfetiva} isPct strong />
        <Row label="Diferença vs atual" value={t.diferencaVsAtual} />
        <Row label="Diferença %" value={t.diferencaPct} isPct />
      </Module>

      <Module title="Preço e margem">
        <Row label="Receita ajustada" value={pm.receita} />
        <Row label="Custo base" value={pm.custoBase} />
        <Row label="Margem atual" value={pm.margemAtual} />
        <Row label="Margem transição" value={pm.margemTransicao} />
        <Row label="Margem % atual" value={pm.margemPctAtual} isPct />
        <Row label="Margem % transição" value={pm.margemPctTransicao} isPct strong />
        <Row label="Preço bruto p/ margem-alvo" value={pm.precoBrutoAlvo} />
        <Row label="Diferença preço" value={pm.diferencaPreco} />
        {pm.alerta && (
          <p className="text-xs text-destructive mt-1.5">{pm.alerta}</p>
        )}
      </Module>

      <Module title="Caixa e split payment">
        <Row label="Débito IBS/CBS" value={cx.debitoIbsCbs} />
        <Row label="Crédito IBS/CBS total" value={cx.creditoIbsCbsTotal} />
        <Row label="Split retido" value={cx.splitRetido} />
        <Row label="Caixa imediato" value={cx.caixaImediato} />
        <Row label="Crédito acumulado" value={cx.creditoAcumulado} />
        <Row label="Custo financeiro do crédito" value={cx.custoFinanceiro} />
        <Row label="Caixa após realização" value={cx.caixaAposRealizacao} strong />
        <Row label="Diferença caixa vs atual" value={cx.diferencaCaixaVsAtual} />
        <Row label="Funding tributário" value={cx.fundingTributario} />
        <div className="mt-2 text-xs">
          <span className="text-muted-foreground">Classificação: </span>
          <span className="font-medium">{cx.classificacao}</span>
        </div>
      </Module>
    </div>
  );
}