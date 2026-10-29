import { BRL, pct } from "@/lib/format";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import InfoLegal from "@/components/InfoLegal";

function Row({ label, value, isPct, strong, legal }) {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}{legal && <InfoLegal chave={legal} />}</span>
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
  const { sistemaAtual: s, ibsCbs: ib, transicao: t, precoMargem: pm, caixa: cx, impostoSeletivo: is } = calc;
  const comb = ib.combustivel;
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
        <Row label="IBS nominal" value={ib.ibsNominal} isPct legal="aliquotas_transicao" />
        <Row label="CBS nominal" value={ib.cbsNominal} isPct legal="aliquotas_transicao" />
        <Row label={comb?.aplicavel ? "IBS equivalente (tributo específico ÷ valor)" : "IBS efetiva"} value={ib.ibsEfetiva} isPct />
        <Row label={comb?.aplicavel ? "CBS equivalente (tributo específico ÷ valor)" : "CBS efetiva"} value={ib.cbsEfetiva} isPct />
        {ib.redutorCompraGov > 0 && (
          <Row label="Redutor de compra governamental aplicado" value={ib.redutorCompraGov} isPct legal="compras_governamentais" />
        )}
        {!comb?.aplicavel && ib.baseExcluida !== 0 && (
          <>
            <Row label="Base de cálculo do IBS/CBS" value={ib.baseCalculo} legal="base_calculo_ibs_cbs" />
            <p className="text-xs text-muted-foreground pb-1.5">
              Valor da operação menos {BRL(Math.abs(ib.baseExcluida))} de ICMS, ISS, PIS e Cofins ainda cobrados neste ano, que ficam fora da base (LC 214, art. 12, §2º, V).
            </p>
          </>
        )}
        {comb?.aplicavel && (
          <>
            <Row label={`Combustível: ${comb.nome} (${comb.quantidade} ${comb.unidade})`} value={comb.cbsAdRem} />
            {comb.cbsPorUnidade != null && <p className="text-xs text-muted-foreground pb-1.5">CBS = quantidade × R$ {comb.cbsPorUnidade.toFixed(4).replace(".", ",")} por {comb.unidade}</p>}
          </>
        )}
        {comb?.avisos?.length > 0 && (
          <ul className="my-1.5 space-y-1 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 rounded-md p-2 list-disc pl-5">
            {comb.avisos.map((a) => <li key={a}>{a}</li>)}
          </ul>
        )}
        <Row label="Débito IBS" value={ib.debitoIbs} />
        <Row label="Débito CBS" value={ib.debitoCbs} />
        <Row label="Crédito IBS" value={ib.creditoIbs} legal="credito_ibs_cbs" />
        <Row label="Crédito CBS" value={ib.creditoCbs} legal="credito_ibs_cbs" />
        <Row label="Crédito presumido total (estimativa)" value={ib.credPresTotal} legal="credito_presumido" />
        <div className="flex justify-between py-1.5 text-sm border-b border-border/40 last:border-0">
          <span className="text-muted-foreground">Status crédito presumido</span>
          <span className={`font-medium ${ib.statusCredPres === "Localizado" ? "text-chart-2" : ib.statusCredPres === "Pendente" || ib.statusCredPres === "Não localizado" ? "text-destructive" : ib.statusCredPres === "Estimativa" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{ib.statusCredPres}</span>
        </div>
        {ib.creditoNormalSubstituidoPorCredPres && (
          <p className="text-xs text-muted-foreground pb-1.5">
            O crédito normal de IBS/CBS ficou zerado: o fornecedor deste código de crédito presumido não é contribuinte e não cobrou IBS/CBS na nota, então o crédito desta compra é só o presumido.
            {ib.credPresTotal === 0 && " Como o percentual do ato oficial ainda não foi informado, o presumido também não foi calculado: informe os percentuais de crédito presumido na operação."}
          </p>
        )}
        {ib.credPresEstimativa && (
          <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 rounded-md p-2 my-1.5">
            Estimativa: o ato conjunto com o percentual oficial ainda está pendente, e o cálculo usa o percentual informado nesta operação.
          </p>
        )}
        {ib.credPresTotal !== 0 && ib.credPresRessarcivel === false && (
          <p className="text-xs text-muted-foreground pb-1.5">
            Este crédito presumido só compensa o tributo devido; a lei não admite o ressarcimento em dinheiro (LC 214, arts. 169, §7º, 170, §2º e 171, §2º; Decreto 12.955, art. 254).
          </p>
        )}
        <Row label="IBS/CBS líquido" value={ib.ibsCbsLiquido} strong />
        <Row label="Carga efetiva" value={ib.cargaEfetiva} isPct strong />
        <Row label="Split retido" value={ib.splitRetido} legal="split_payment" />
      </Module>

      <Module title="Transição">
        <Row label="PIS/Cofins remanescente" value={t.pisCofinsAtual} legal="extincao_pis_cofins" />
        <Row label="IPI remanescente" value={t.ipiAtual} />
        <Row label="ICMS/FCP/ST remanescente" value={t.icmsFcpStAtual} legal="icms_iss_transicao" />
        <Row label="ISS remanescente" value={t.issAtual} legal="icms_iss_transicao" />
        <Row label="Sistema atual remanescente" value={t.sistemaAtualRemanescente} strong />
        <Row label="IBS/CBS financeiro" value={t.ibsCbsFinanceiro} />
        {t.impostoSeletivo !== 0 && <Row label={`Imposto Seletivo (alíquota informada ${pct(is?.aliquota ?? 0)}; dentro do preço, sem crédito)`} value={t.impostoSeletivo} legal="imposto_seletivo" />}
        {t.impostoSeletivo !== 0 && is?.aproximacaoBase && (
          <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 rounded-md p-2 my-1.5">
            Base aproximada: neste caso a lei usa o valor de referência, definido por ato do Poder Executivo (LC 214, art. 414, III), e o cálculo usa o valor da operação.
          </p>
        )}
        {is?.acimaDoTeto && (
          <p className="text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-2 my-1.5">
            A alíquota informada passa do máximo legal de 0,25% para bens minerais extraídos (art. 422, §2º).
          </p>
        )}
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
        <Row label="Crédito IBS/CBS total" value={cx.creditoIbsCbsTotal} legal="credito_ibs_cbs" />
        <Row label="Split retido" value={cx.splitRetido} legal="split_payment" />
        <Row label="Caixa imediato" value={cx.caixaImediato} />
        <Row label="Crédito acumulado" value={cx.creditoAcumulado} />
        {cx.credPresNaoRessarcivel !== 0 && cx.credPresNaoRessarcivel != null && (
          <Row label="Crédito presumido sem ressarcimento (fora do acumulado a realizar)" value={cx.credPresNaoRessarcivel} />
        )}
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