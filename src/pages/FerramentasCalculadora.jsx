import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { calcOperacao } from "@/motor/taxEngine";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Calculator } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";
import { BRL, pct } from "@/lib/format";
import TituloPagina from "@/components/TituloPagina";
import SeletorCenarioAliquotas from "@/components/SeletorCenarioAliquotas";
import { useTransicaoComCenario } from "@/lib/cenarioAliquotasStore";
import PctInput from "@/components/ui/pct-input";
import { PRODUTOS_COMBUSTIVEL, aliquotasCombustivelDoAno } from "@/motor/combustiveis";

const empty = {
  valor_bruto: 1000, direcao: "Saida",
  pis_pct: 0, cofins_pct: 0, icms_pct: 0, fcp_pct: 0, ipi_pct: 0, iss_pct: 0, mva_st_pct: 0,
  credito_elegivel_pct: 0,
  // Regimes específicos (LC 214): venda a órgão público, combustível e Imposto Seletivo.
  compra_governamental_informado: "Não", combustivel_produto: "", quantidade: 0, is_pct: 0,
};

/**
 * Calculadora avulsa — chama o mesmo motor (calcOperacao) sem precisar
 * cadastrar Empresa nem Operação. Pra quem só quer um número rápido.
 */
export default function FerramentasCalculadora() {
  const [form, setForm] = useState(empty);
  const [ano, setAno] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const transicaoQ = useQuery({
    queryKey: ["transicao"],
    queryFn: () => api.entities.TransicaoAno.list(),
  });
  // Alíquotas de 2029–2033 vêm do cenário escolhido (src/motor/cenariosAliquota.js).
  const { linhas: transicao, resumo: cenarioAliquotas, selecao: selecaoCenario } = useTransicaoComCenario(transicaoQ.data);
  const anos = [...transicao].sort((a, b) => a.ano - b.ano);
  const combQ = useQuery({ queryKey: ["aliquotaCombustivel"], queryFn: () => api.entities.AliquotaCombustivel.list() });
  const linhaAno = anos.find((t) => String(t.ano) === ano);
  const anoParams = useMemo(
    () => (linhaAno ? { ...linhaAno, combustiveis: aliquotasCombustivelDoAno(combQ.data || [], linhaAno.ano) } : {}),
    [linhaAno, combQ.data],
  );
  const produtoComb = PRODUTOS_COMBUSTIVEL.find((p) => p.id === form.combustivel_produto);

  const resultado = useMemo(() => {
    if (!ano) return null;
    const op = { ...form, ano: Number(ano), combustivel_produto: form.combustivel_produto || null };
    return calcOperacao(op, anoParams, {}, {}, {}, new Map());
  }, [form, ano, anoParams]);

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Calculadora Rápida" }]} />
      <div className="p-6 lg:p-8 space-y-5">
        <div>
          <TituloPagina icon={Calculator} ajuda={<InfoTooltip pagina="ferramentas" chave="calculadora_header" />}>Calculadora Reforma Tributária</TituloPagina>
          <p className="text-sm text-muted-foreground">
            Simulação de uma operação avulsa, sem cadastrar Empresa nem Operação — mesmo motor de cálculo
            (<code className="font-mono text-xs">taxEngine.js</code>) usado no resto do simulador. Para guardar o
            resultado ou analisar várias operações juntas, use o Cockpit dentro de uma empresa.
          </p>
        </div>

        <SeletorCenarioAliquotas resumo={cenarioAliquotas} selecao={selecaoCenario} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Ano (parâmetros de transição)</Label>
                <Select value={ano} onValueChange={setAno}>
                  <SelectTrigger><SelectValue placeholder="Escolha o ano" /></SelectTrigger>
                  <SelectContent>
                    {anos.map((t) => <SelectItem key={t.ano} value={String(t.ano)}>{t.ano}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Direção</Label>
                <Select value={form.direcao} onValueChange={(v) => set("direcao", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Saida">Saída (venda)</SelectItem>
                    <SelectItem value="Entrada">Entrada (compra)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Valor bruto (R$)</Label>
                <Input type="number" step="any" value={form.valor_bruto} onChange={(e) => set("valor_bruto", Number(e.target.value))} />
              </div>
              <div><Label className="text-xs">PIS %</Label><Input type="number" step="any" value={form.pis_pct * 100} onChange={(e) => set("pis_pct", Number(e.target.value) / 100)} /></div>
              <div><Label className="text-xs">Cofins %</Label><Input type="number" step="any" value={form.cofins_pct * 100} onChange={(e) => set("cofins_pct", Number(e.target.value) / 100)} /></div>
              <div><Label className="text-xs">ICMS %</Label><Input type="number" step="any" value={form.icms_pct * 100} onChange={(e) => set("icms_pct", Number(e.target.value) / 100)} /></div>
              <div><Label className="text-xs">FCP %</Label><Input type="number" step="any" value={form.fcp_pct * 100} onChange={(e) => set("fcp_pct", Number(e.target.value) / 100)} /></div>
              <div><Label className="text-xs">IPI %</Label><Input type="number" step="any" value={form.ipi_pct * 100} onChange={(e) => set("ipi_pct", Number(e.target.value) / 100)} /></div>
              <div><Label className="text-xs">ISS %</Label><Input type="number" step="any" value={form.iss_pct * 100} onChange={(e) => set("iss_pct", Number(e.target.value) / 100)} /></div>
              <div className="col-span-2">
                <Label className="text-xs">Crédito elegível % (só relevante em Entrada)</Label>
                <Input type="number" step="any" value={form.credito_elegivel_pct * 100} onChange={(e) => set("credito_elegivel_pct", Number(e.target.value) / 100)} />
              </div>
              <div>
                <Label className="text-xs inline-flex items-center gap-1">Venda a órgão público? <InfoTooltip pagina="operacao_form" chave="compra_governamental_informado" /></Label>
                <Select value={form.compra_governamental_informado} onValueChange={(v) => set("compra_governamental_informado", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Não">Não</SelectItem>
                    <SelectItem value="Sim">Sim (redutor)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs inline-flex items-center gap-1">Imposto Seletivo % <InfoTooltip pagina="operacao_form" chave="is_pct" /></Label>
                <PctInput value={form.is_pct} onChange={(v) => set("is_pct", v)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs inline-flex items-center gap-1">Combustível (regime específico) <InfoTooltip pagina="operacao_form" chave="combustivel_produto" /></Label>
                <Select value={form.combustivel_produto || "nenhum"} onValueChange={(v) => set("combustivel_produto", v === "nenhum" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Não é combustível</SelectItem>
                    {PRODUTOS_COMBUSTIVEL.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {produtoComb && (
                <div className="col-span-2">
                  <Label className="text-xs">Quantidade ({produtoComb.unidade === "kg" ? "quilogramas" : "litros a 20 °C"})</Label>
                  <Input type="number" step="any" value={form.quantidade} onChange={(e) => set("quantidade", Number(e.target.value))} />
                </div>
              )}
            </div>
            {!ano && <p className="text-xs text-amber-600">Escolha um ano para calcular — os parâmetros de IBS/CBS/transição variam por ano.</p>}
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-heading font-medium text-sm mb-4">Resultado</h2>
            {!resultado ? (
              <p className="text-sm text-muted-foreground">Preencha os campos ao lado.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <Linha label="Sistema atual líquido" value={BRL(resultado.sistemaAtual.tributosLiquidos)} sub={pct(resultado.sistemaAtual.cargaEfetiva)} />
                <Linha label="IBS/CBS líquido" value={BRL(resultado.ibsCbs.ibsCbsLiquido)} sub={`IBS ${BRL(resultado.ibsCbs.debitoIbs)} + CBS ${BRL(resultado.ibsCbs.debitoCbs)}`} />
                {resultado.ibsCbs.redutorCompraGov > 0 && (
                  <Linha label="Redutor de compra governamental" value={pct(resultado.ibsCbs.redutorCompraGov)} sub="aplicado às alíquotas de IBS e CBS desta venda" />
                )}
                {resultado.transicao.impostoSeletivo !== 0 && (
                  <Linha label="Imposto Seletivo" value={BRL(resultado.transicao.impostoSeletivo)} sub="dentro do valor da operação, sem crédito" />
                )}
                {resultado.ibsCbs.combustivel?.avisos?.length > 0 && (
                  <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 rounded-md p-2 list-disc pl-5">
                    {resultado.ibsCbs.combustivel.avisos.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                )}
                <Linha label="Carga da transição" value={BRL(resultado.transicao.cargaTotalTransicao)} sub={pct(resultado.transicao.cargaEfetiva)} destaque />
                <Linha label="Diferença vs. sistema atual" value={BRL(resultado.transicao.diferencaVsAtual)} sub={pct(resultado.transicao.diferencaPct)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Linha({ label, value, sub, destaque }) {
  return (
    <div className={`flex items-center justify-between py-2 ${destaque ? "border-y border-border" : "border-b border-border/50"}`}>
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <div className={`font-medium ${destaque ? "text-base" : ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}
