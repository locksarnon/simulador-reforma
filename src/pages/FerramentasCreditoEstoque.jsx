import React, { useMemo, useState } from "react";
import { Boxes, Download, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import InfoTooltip from "@/components/InfoTooltip";
import InfoLegal from "@/components/InfoLegal";
import PageHeader from "@/components/PageHeader";
import TituloPagina from "@/components/TituloPagina";
import RascunhoAviso from "@/components/RascunhoAviso";
import { useRascunho } from "@/hooks/useRascunho";
import { BRL } from "@/lib/format";
import {
  ALIQUOTA_ESTOQUE_NACIONAL, DESTINOS_ESTOQUE, HIPOTESES_ESTOQUE, PARCELAS_ESTOQUE, calcCreditoEstoque,
} from "@/motor/creditoEstoque";

const MESES_APROPRIACAO = [
  ["2027-01", "janeiro/2027"], ["2027-02", "fevereiro/2027"], ["2027-03", "março/2027"],
  ["2027-04", "abril/2027"], ["2027-05", "maio/2027"], ["2027-06", "junho/2027 (último mês permitido)"],
];

let contador = 0;
const novoItem = () => ({
  id: `i${Date.now().toString(36)}${contador++}`, descricao: "", origem: "nacional", valor: "", pisCofinsImportacaoPago: "",
  hipotese: "II", destino: "revenda", bemUsado: false, bemDeTerceiros: false, compradoDePessoaFisica: false, aquisicaoSemPisCofins: false,
});
const ESTADO_INICIAL = () => ({ regimeRegular: true, cumulativo: "nao_sei", mes: "2027-06", cbsMensal: "", itens: [novoItem()] });

/** "1.234,56" → 1234.56 (aceita também "1234.56"). Vazio vira 0. */
const lerValor = (texto) => {
  const t = String(texto ?? "").trim();
  if (!t) return 0;
  const limpo = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(limpo.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const mesRotulo = (aaaamm) => {
  const [a, m] = aaaamm.split("-");
  return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m) - 1]}/${a}`;
};
const dataRotulo = (iso) => iso.split("-").reverse().join("/");

function baixarCsv(nome, linhas) {
  const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function Cartao({ titulo, valor, detalhe, destaque }) {
  return (
    <div className={`rounded-lg border p-4 ${destaque ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums mt-1">{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground mt-1">{detalhe}</p>}
    </div>
  );
}

/**
 * Crédito presumido de CBS sobre o estoque de 31/12/2026 (LC 214/2025, art. 381; Decreto 12.955/2026, arts. 605 a 609).
 * A elegibilidade e o valor vêm da lei, não de escolha de quem usa: a pessoa só informa os FATOS (regime da empresa,
 * inventário e como cada bem foi comprado). O cálculo está em src/motor/creditoEstoque.js.
 */
export default function FerramentasCreditoEstoque() {
  const [estado, setEstado] = useState(ESTADO_INICIAL);
  const rascunho = useRascunho("credito-estoque", estado, true);
  const set = (k, v) => setEstado((e) => ({ ...e, [k]: v }));
  const setItem = (id, k, v) => setEstado((e) => ({ ...e, itens: e.itens.map((i) => (i.id === id ? { ...i, [k]: v } : i)) }));
  const removerItem = (id) => setEstado((e) => ({ ...e, itens: e.itens.length > 1 ? e.itens.filter((i) => i.id !== id) : [novoItem()] }));

  const resultado = useMemo(() => calcCreditoEstoque(
    estado.itens.map((i) => ({ ...i, valor: lerValor(i.valor), pisCofinsImportacaoPago: lerValor(i.pisCofinsImportacaoPago) })),
    {
      regimeRegular: estado.regimeRegular,
      cumulativoEm31122026: estado.cumulativo === "sim" ? true : estado.cumulativo === "nao" ? false : null,
      mesApropriacao: estado.mes,
      cbsMensal: estado.cbsMensal === "" ? null : lerValor(estado.cbsMensal),
    },
  ), [estado]);
  const comCbs = estado.cbsMensal !== "";

  const exportar = () => {
    const cab = ["Mês", "Parcela do crédito (R$)", ...(comCbs ? ["CBS a pagar (R$)", "Compensado (R$)", "CBS líquida (R$)", "Saldo do crédito (R$)"] : [])];
    const corpo = resultado.cronograma.map((p) => [mesRotulo(p.mes), p.parcela.toFixed(2).replace(".", ","),
      ...(comCbs ? [p.cbsAPagar.toFixed(2).replace(".", ","), p.compensado.toFixed(2).replace(".", ","), p.cbsLiquida.toFixed(2).replace(".", ","), p.saldoAposCompensar.toFixed(2).replace(".", ",")] : [])]);
    baixarCsv("credito-presumido-estoque-cbs.csv", [cab, ...corpo]);
  };

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Crédito presumido de estoque" }]} />
      <div className="p-6 lg:p-8 space-y-6">
        <div>
          <TituloPagina icon={Boxes} ajuda={<InfoLegal chave="credito_estoque" />}>Crédito presumido de CBS sobre o estoque</TituloPagina>
          <p className="text-sm text-muted-foreground max-w-4xl mt-1">
            A empresa do regime regular da CBS pode apropriar crédito presumido sobre o estoque que tinha em 31/12/2026, nas hipóteses do art. 381 da LC 214/2025:
            <b className="text-foreground"> {(ALIQUOTA_ESTOQUE_NACIONAL * 100).toFixed(2).replace(".", ",")}% do valor do estoque comprado no País</b>, ou o PIS/Cofins-Importação efetivamente pago nos bens importados.
            O crédito é apropriado até junho de 2027 e usado em {PARCELAS_ESTOQUE} parcelas mensais, só contra CBS. Quem pode e quanto é definido pela lei: aqui você informa os fatos (regime, inventário e como cada bem foi comprado).
          </p>
        </div>

        <RascunhoAviso rascunho={rascunho} aplicar={(v) => setEstado(v)} />

        <section className="rounded-lg border border-border bg-card p-4 space-y-4" aria-label="Situação da empresa">
          <h2 className="font-heading font-medium text-sm">Situação da empresa</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label className="text-xs mb-1.5 block">Regime na CBS a partir de 2027</Label>
              <Select value={estado.regimeRegular ? "regular" : "simples"} onValueChange={(v) => set("regimeRegular", v === "regular")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regime regular da CBS</SelectItem>
                  <SelectItem value="simples">Simples Nacional (sem opção pelo regime regular)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">PIS/Cofins em 31/12/2026</Label>
              <Select value={estado.cumulativo} onValueChange={(v) => set("cumulativo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao_sei">Ainda não conferi</SelectItem>
                  <SelectItem value="sim">Cumulativo (ex.: lucro presumido)</SelectItem>
                  <SelectItem value="nao">Não cumulativo (ex.: lucro real)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Apropriação do crédito em</Label>
              <Select value={estado.mes} onValueChange={(v) => set("mes", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MESES_APROPRIACAO.map(([v, r]) => <SelectItem key={v} value={v}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 inline-flex items-center gap-1" htmlFor="cbs-mensal">
                CBS mensal a pagar, estimada (opcional) <InfoTooltip text="Se informar a CBS que a empresa estima pagar por mês, a tela mostra quanto do crédito é compensado a cada mês e o saldo que sobra. O crédito só compensa CBS: não há ressarcimento nem uso contra outros tributos (art. 381, §4º, III)." />
              </Label>
              <Input id="cbs-mensal" inputMode="decimal" placeholder="Ex.: 25.000,00" value={estado.cbsMensal} onChange={(e) => set("cbsMensal", e.target.value.replace(/[^\d.,]/g, ""))} />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 space-y-3" aria-label="Itens do estoque">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-heading font-medium text-sm">Estoque de abertura (inventário de 31/12/2026)</h2>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-4xl">
                Agrupe por tipo de compra. Valor = custo de aquisição pelas regras do IRPJ, separando o nacional do importado; em produto acabado e em elaboração entram só os custos de aquisição das matérias-primas e embalagens (Decreto 12.955, art. 609). Bens de terceiros ficam fora do inventário.
              </p>
            </div>
            <button type="button" onClick={() => set("itens", [...estado.itens, novoItem()])} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
              <Plus className="w-4 h-4" /> Adicionar item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[64rem]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-2 font-medium w-48">Descrição</th>
                  <th className="py-2 pr-2 font-medium w-32">Origem</th>
                  <th className="py-2 pr-2 font-medium w-36">Custo de aquisição (R$)</th>
                  <th className="py-2 pr-2 font-medium w-60">Hipótese do art. 381</th>
                  <th className="py-2 pr-2 font-medium w-44">Destino do bem</th>
                  <th className="py-2 pr-2 font-medium">Exceções</th>
                  <th className="py-2 pr-2 font-medium text-right w-32">Crédito</th>
                  <th className="py-2 w-8"><span className="sr-only">Remover</span></th>
                </tr>
              </thead>
              <tbody>
                {estado.itens.map((item, idx) => {
                  const linha = resultado.linhas[idx];
                  const importado = item.origem === "importado";
                  return (
                    <tr key={item.id} className="border-b border-border/50 align-top">
                      <td className="py-2 pr-2"><Input aria-label={`Descrição do item ${idx + 1}`} value={item.descricao} onChange={(e) => setItem(item.id, "descricao", e.target.value)} placeholder="Ex.: Defensivos" /></td>
                      <td className="py-2 pr-2">
                        <Select value={item.origem} onValueChange={(v) => setItem(item.id, "origem", v)}>
                          <SelectTrigger aria-label={`Origem do item ${idx + 1}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nacional">Nacional</SelectItem>
                            <SelectItem value="importado">Importado</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 pr-2">
                        <Input aria-label={`Custo de aquisição do item ${idx + 1}`} inputMode="decimal" value={item.valor} onChange={(e) => setItem(item.id, "valor", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0,00" />
                        {importado && (
                          <Input className="mt-1.5" aria-label={`PIS/Cofins-Importação pago do item ${idx + 1}`} inputMode="decimal" value={item.pisCofinsImportacaoPago} onChange={(e) => setItem(item.id, "pisCofinsImportacaoPago", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="PIS/Cofins-Imp. pago" title="PIS/Cofins-Importação efetivamente pago, sem o adicional de alíquota (Lei 10.865, art. 8º, §21)" />
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <Select value={item.hipotese} onValueChange={(v) => setItem(item.id, "hipotese", v)}>
                          <SelectTrigger aria-label={`Hipótese do item ${idx + 1}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{HIPOTESES_ESTOQUE.map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}</SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{HIPOTESES_ESTOQUE.find((h) => h.id === item.hipotese)?.detalhe}</p>
                      </td>
                      <td className="py-2 pr-2">
                        <Select value={item.destino} onValueChange={(v) => setItem(item.id, "destino", v)}>
                          <SelectTrigger aria-label={`Destino do item ${idx + 1}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{DESTINOS_ESTOQUE.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="space-y-1 text-xs">
                          {[
                            ["bemUsado", "Bem usado"],
                            ["bemDeTerceiros", "Bem de terceiros"],
                            ["compradoDePessoaFisica", "Comprado de pessoa física (ex.: produtor rural PF)"],
                            ["aquisicaoSemPisCofins", "Compra com alíquota zero, isenção, suspensão ou não incidência de PIS/Cofins"],
                          ].map(([k, r]) => (
                            <label key={k} className="flex items-start gap-1.5 cursor-pointer">
                              <input type="checkbox" className="mt-0.5" checked={item[k]} onChange={(e) => setItem(item.id, k, e.target.checked)} />
                              <span>{r}</span>
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-2 text-right">
                        {linha?.elegivel
                          ? <span className="font-medium tabular-nums">{BRL(linha.credito)}</span>
                          : <span className="text-xs text-amber-700 dark:text-amber-400 leading-snug block">{linha?.motivo}</span>}
                      </td>
                      <td className="py-2">
                        <button type="button" onClick={() => removerItem(item.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label={`Remover item ${idx + 1}`}><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4" aria-label="Resultado">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Cartao titulo="Crédito presumido total" valor={BRL(resultado.total)} detalhe="Soma dos itens que a lei admite" destaque />
            <Cartao titulo={`Parcela mensal (${PARCELAS_ESTOQUE}×)`} valor={BRL(resultado.parcelaMensal)} detalhe={`De ${mesRotulo(resultado.cronograma[0].mes)} a ${mesRotulo(resultado.cronograma[PARCELAS_ESTOQUE - 1].mes)}`} />
            <Cartao titulo="Estoque nacional com direito ao crédito" valor={BRL(resultado.valorElegivel)} detalhe={`${(ALIQUOTA_ESTOQUE_NACIONAL * 100).toFixed(2).replace(".", ",")}% sobre esse valor`} />
            <Cartao titulo="Estoque informado sem direito" valor={BRL(resultado.valorFora)} detalhe="Motivo de cada item na tabela acima" />
          </div>

          {resultado.avisos.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 rounded-md p-3 list-disc pl-6" role="status">
              {resultado.avisos.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-heading font-medium text-sm">Cronograma de uso do crédito</h2>
              <button type="button" onClick={exportar} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted">
                <Download className="w-4 h-4" /> Baixar CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-4 font-medium">Mês</th>
                    <th className="py-2 pr-4 font-medium text-right">Parcela do crédito</th>
                    {comCbs && <><th className="py-2 pr-4 font-medium text-right">CBS a pagar</th><th className="py-2 pr-4 font-medium text-right">Compensado</th><th className="py-2 pr-4 font-medium text-right">CBS líquida</th><th className="py-2 font-medium text-right">Saldo do crédito</th></>}
                  </tr>
                </thead>
                <tbody>
                  {resultado.cronograma.map((p) => (
                    <tr key={p.mes} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-4">{mesRotulo(p.mes)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{BRL(p.parcela)}</td>
                      {comCbs && <>
                        <td className="py-2 pr-4 text-right tabular-nums">{BRL(p.cbsAPagar)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{BRL(p.compensado)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{BRL(p.cbsLiquida)}</td>
                        <td className="py-2 text-right tabular-nums">{BRL(p.saldoAposCompensar)}</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              O direito de usar o crédito vence em {dataRotulo(resultado.venceEm)}, cinco anos depois do último dia do período de apuração em que foi apropriado (LC 214, art. 383). A utilização do crédito de CBS para compensação tem preferência sobre os demais créditos de CBS (art. 382).
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1.5">
            <p className="font-medium text-foreground text-sm">O que a empresa precisa fazer e guardar</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Fazer o inventário exatamente em 31/12/2026 (não vale o dia 1º/1/2027), uma só vez, separando os bens comprados no País dos importados (Decreto 12.955, arts. 608 e 609).</li>
              <li>Todos os itens precisam de documento fiscal idôneo, guardado por no mínimo cinco anos a contar do inventário (art. 606, §§ 2º e 3º).</li>
              <li>Só entram bens novos, comprados de pessoa jurídica domiciliada no País ou importados, para revenda, produção ou serviços; ficam de fora compras de pessoa física, uso e consumo, ativo imobilizado, imóveis e bens de terceiros (art. 381, §1º; art. 607).</li>
              <li>O Poder Executivo da União disciplina a forma de verificar o estoque (art. 381, §2º): confira o ato vigente antes de apropriar.</li>
              <li>Estimativa gerencial: o valor a apropriar deve ser validado pelo especialista tributário da empresa.</li>
            </ul>
          </div>

          <button type="button" onClick={() => { rascunho.limpar(); setEstado(ESTADO_INICIAL()); }} className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Limpar e começar de novo
          </button>
        </section>
      </div>
    </div>
  );
}
