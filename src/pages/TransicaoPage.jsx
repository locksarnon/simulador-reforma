import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, CalendarRange } from "lucide-react";
import { pct } from "@/lib/format";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";
import TituloPagina from "@/components/TituloPagina";
import { useConfirmar } from "@/components/ConfirmProvider";
import SeletorCenarioAliquotas from "@/components/SeletorCenarioAliquotas";
import { useTransicaoComCenario } from "@/lib/cenarioAliquotasStore";
import { pctRef, referenciasDaTabela } from "@/motor/cenariosAliquota";

const empty = {
  ano: new Date().getFullYear(), pis_cofins_fator: 1, ipi_fator_geral: 1, icms_fator: 1,
  iss_fator: 1, ibs_efetivo: 0, ibs_uf_aliquota: 0, ibs_mun_aliquota: 0,
  cbs_efetiva: 0, efeito_financeiro: 0, redutor_compra_gov: 0, carater: "", fonte: "", status: "Oficial", observacao: "",
};

export default function TransicaoPage() {
  const confirmar = useConfirmar();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["transicao"], queryFn: () => api.entities.TransicaoAno.list() });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const rows = [...(data || [])].sort((a, b) => a.ano - b.ano);
  // O que os cálculos de fato usam: a tabela cadastrada + o cenário de alíquotas 2029–2033 escolhido.
  const { linhas: linhasCenario, resumo: cenario, selecao } = useTransicaoComCenario(data);
  const linhasUsadas = [...linhasCenario].sort((a, b) => a.ano - b.ano);
  const ref = referenciasDaTabela(rows);

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await api.entities.TransicaoAno.create(form);
    else await api.entities.TransicaoAno.update(editing.id, form);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["transicao"] });
  };

  const del = async (r) => {
    if (!(await confirmar({ titulo: "Confirmar exclusão", descricao: `Excluir o ano ${r.ano}?`, rotulo: "Excluir" }))) return;
    await api.entities.TransicaoAno.delete(r.id);
    qc.invalidateQueries({ queryKey: ["transicao"] });
  };

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Transição 2026–2033" }]} />
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <TituloPagina icon={CalendarRange} ajuda={<InfoTooltip pagina="transicao" chave="header" />}>Transição 2026–2033</TituloPagina>
          <p className="text-sm text-muted-foreground">Cronograma paramétrico — fatores de extinção e alíquotas de referência</p>
        </div>
        <button onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Novo ano
        </button>
      </div>

      <SeletorCenarioAliquotas resumo={cenario} selecao={selecao} />

      <h2 className="font-heading font-medium text-sm -mb-2">Tabela cadastrada <span className="text-muted-foreground font-normal">(base de todos os cenários; é a que você edita aqui)</span></h2>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-muted/40">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2.5 px-4 font-medium">Ano</th>
              <th className="py-2.5 px-4 font-medium">PIS/Cofins</th>
              <th className="py-2.5 px-4 font-medium">IPI</th>
              <th className="py-2.5 px-4 font-medium">ICMS</th>
              <th className="py-2.5 px-4 font-medium">ISS</th>
              <th className="py-2.5 px-4 font-medium">IBS efetivo</th>
              <th className="py-2.5 px-4 font-medium">CBS efetiva</th>
              <th className="py-2.5 px-4 font-medium">Efeito financeiro</th>
              <th className="py-2.5 px-4 font-medium">Redutor gov.</th>
              <th className="py-2.5 px-4 font-medium">Caráter*</th>
              <th className="py-2.5 px-4 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="py-2.5 px-4 font-medium">{r.ano}</td>
                <td className="py-2.5 px-4">{pct(r.pis_cofins_fator, 0)}</td>
                <td className="py-2.5 px-4">{pct(r.ipi_fator_geral, 0)}</td>
                <td className="py-2.5 px-4">{pct(r.icms_fator, 0)}</td>
                <td className="py-2.5 px-4">{pct(r.iss_fator, 0)}</td>
                <td className="py-2.5 px-4">{pct(r.ibs_efetivo, 2)}</td>
                <td className="py-2.5 px-4">{pct(r.cbs_efetiva, 2)}</td>
                <td className="py-2.5 px-4">{r.efeito_financeiro ? "Sim" : "Não"}</td>
                <td className="py-2.5 px-4 tabular-nums">{r.redutor_compra_gov ? pct(r.redutor_compra_gov, 2) : <span className="text-muted-foreground">—</span>}</td>
                <td className="py-2.5 px-4 text-muted-foreground">{r.carater}</td>
                <td className="py-2.5 px-4">
                  <div className="flex gap-1">
                    <button onClick={() => { setForm(r); setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => del(r)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="py-12 text-center text-muted-foreground">Nenhum ano cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      {(cenario.id !== "cadastrada" || cenario.redutorCompraGov) && (
        <>
          <h2 className="font-heading font-medium text-sm -mb-2">Alíquotas que os cálculos usam agora <span className="text-muted-foreground font-normal">(tabela cadastrada + cenário escolhido)</span></h2>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2.5 px-4 font-medium">Ano</th>
                  <th className="py-2.5 px-4 font-medium">IBS efetivo</th>
                  <th className="py-2.5 px-4 font-medium">CBS efetiva</th>
                  <th className="py-2.5 px-4 font-medium">IBS + CBS</th>
                  <th className="py-2.5 px-4 font-medium">Redutor gov.</th>
                  <th className="py-2.5 px-4 font-medium">Origem</th>
                </tr>
              </thead>
              <tbody>
                {linhasUsadas.map((r) => (
                  <tr key={r.ano} className="border-t border-border/50">
                    <td className="py-2.5 px-4 font-medium">{r.ano}</td>
                    <td className="py-2.5 px-4 tabular-nums">{pct(r.ibs_efetivo, 2)}</td>
                    <td className="py-2.5 px-4 tabular-nums">{pct(r.cbs_efetiva, 2)}</td>
                    <td className="py-2.5 px-4 tabular-nums">{pct(Number(r.ibs_efetivo) + Number(r.cbs_efetiva), 2)}</td>
                    <td className="py-2.5 px-4 tabular-nums">
                      {r.redutor_compra_gov ? <>{pct(r.redutor_compra_gov, 2)}{r.redutor_repetido_de && <span className="text-muted-foreground text-xs"> (repete {r.redutor_repetido_de})</span>}</> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground">{r.status === "Cenário" ? `Cenário: ${cenario.curto}` : (r.status || "Cadastro")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
        * O calendário de fatores (extinção de PIS/Cofins e IPI zerado em 2027, exceto produtos da Zona Franca de
        Manaus; ICMS e ISS a 9/10, 8/10, 7/10 e 6/10 entre 2029 e 2032, com extinção total em 2033) é o que a
        Constituição (ADCT, arts. 126, 128 e 129) determina: está fixado. Já as alíquotas de IBS e CBS são{" "}
        <strong>estimativas</strong> até a resolução do Senado (LC 214, art. 349). Só 2026 (IBS 0,1% e CBS 0,9%, arts.
        343 e 346) é oficial e, por lei, informativo: o valor é compensado com PIS/Cofins ou dispensado (art. 348).
        Em 2027 e 2028 a CBS cobrada é a referência menos 0,1 p.p. (art. 347): a tabela traz{" "}
        {pctRef(ref.cbsReferencia2027 - 0.001)}, que corresponde à referência de {pctRef(ref.cbsReferencia2027)}; em
        28/10/2026 o TCU aprovou 11,3468% para 2027, arredondada para 11,3% pelo art. 349, §14, e falta a resolução do
        Senado. De 2029 a 2033 não existe alíquota de referência: a tabela cadastrada guarda CBS de{" "}
        {pctRef(ref.cbsCadastrada ?? 0, 2)} e IBS cheio de {pctRef(ref.ibsCheioCadastrado)}, derivados da premissa do
        Comitê Gestor do IBS (Resolução CGIBS nº 14/2026: 18,7% de IBS e 27,91% no total, o que não fixa a CBS), e o
        cenário escolhido acima define o que os cálculos usam. O IBS dos anos de transição segue a escala do ADCT:
        10%, 20%, 30% e 40% do cheio de 2029 a 2032 e 100% em 2033. A coluna "Redutor gov." é o redutor das vendas à
        administração pública (LC 214, arts. 349, III, e 472): o TCU calculou 44,16% para 2027 (processo TC
        006.529/2026-7), ainda sem a resolução do Senado; para os demais anos não há cálculo (o do ano só sai no ano
        anterior, art. 349, §1º), então o InTAX repete o último redutor cadastrado, como mostra a tabela "Alíquotas que
        os cálculos usam agora". Traço na tabela cadastrada significa que nenhum redutor foi cadastrado naquele ano.
        Confira o campo "Fonte" de cada linha.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === "new" ? "Novo ano" : `Editar ${editing?.ano}`}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Ano <InfoTooltip pagina="transicao" chave="ano" /></Label><Input type="number" value={form.ano} onChange={(e) => set("ano", Number(e.target.value))} required /></div>
            <div><Label className="text-xs">Caráter <InfoTooltip pagina="transicao" chave="carater" /></Label><Input value={form.carater} onChange={(e) => set("carater", e.target.value)} placeholder="Informativo / Financeiro" /></div>
            <div><Label className="text-xs">PIS/Cofins fator <InfoTooltip pagina="transicao" chave="pis_cofins_fator" /></Label><Input type="number" step="any" value={form.pis_cofins_fator} onChange={(e) => set("pis_cofins_fator", Number(e.target.value))} /></div>
            <div><Label className="text-xs">IPI fator geral <InfoTooltip pagina="transicao" chave="ipi_fator_geral" /></Label><Input type="number" step="any" value={form.ipi_fator_geral} onChange={(e) => set("ipi_fator_geral", Number(e.target.value))} /></div>
            <div><Label className="text-xs">ICMS fator <InfoTooltip pagina="transicao" chave="icms_fator" /></Label><Input type="number" step="any" value={form.icms_fator} onChange={(e) => set("icms_fator", Number(e.target.value))} /></div>
            <div><Label className="text-xs">ISS fator <InfoTooltip pagina="transicao" chave="iss_fator" /></Label><Input type="number" step="any" value={form.iss_fator} onChange={(e) => set("iss_fator", Number(e.target.value))} /></div>
            <div><Label className="text-xs">IBS efetivo <InfoTooltip pagina="transicao" chave="ibs_efetivo" /></Label><Input type="number" step="any" value={form.ibs_efetivo} onChange={(e) => set("ibs_efetivo", Number(e.target.value))} /></div>
            <div><Label className="text-xs">CBS efetiva <InfoTooltip pagina="transicao" chave="cbs_efetiva" /></Label><Input type="number" step="any" value={form.cbs_efetiva} onChange={(e) => set("cbs_efetiva", Number(e.target.value))} /></div>
            <div><Label className="text-xs">IBS UF alíquota <InfoTooltip pagina="transicao" chave="ibs_uf_aliquota" /></Label><Input type="number" step="any" value={form.ibs_uf_aliquota} onChange={(e) => set("ibs_uf_aliquota", Number(e.target.value))} /></div>
            <div><Label className="text-xs">IBS Município alíquota <InfoTooltip pagina="transicao" chave="ibs_mun_aliquota" /></Label><Input type="number" step="any" value={form.ibs_mun_aliquota} onChange={(e) => set("ibs_mun_aliquota", Number(e.target.value))} /></div>
            <div><Label className="text-xs">Efeito financeiro (0/1) <InfoTooltip pagina="transicao" chave="efeito_financeiro" /></Label><Input type="number" step="any" value={form.efeito_financeiro} onChange={(e) => set("efeito_financeiro", Number(e.target.value))} /></div>
            <div><Label className="text-xs">Redutor compras gov. <InfoTooltip pagina="transicao" chave="redutor_compra_gov" /></Label><Input type="number" step="any" min="0" max="1" value={form.redutor_compra_gov ?? 0} onChange={(e) => set("redutor_compra_gov", Number(e.target.value))} /></div>
            <div><Label className="text-xs">Fonte <InfoTooltip pagina="transicao" chave="fonte" /></Label><Input value={form.fonte} onChange={(e) => set("fonte", e.target.value)} /></div>
            <div className="col-span-2"><Label className="text-xs">Observação <InfoTooltip pagina="transicao" chave="observacao" /></Label><Input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} /></div>
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground">Salvar</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}