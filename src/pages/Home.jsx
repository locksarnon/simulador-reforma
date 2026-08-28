import React, { useMemo } from "react";
import { useSimuladorData } from "@/hooks/useSimuladorData";
import { consolidarPorAno } from "../../base44/shared/taxEngine";
import KpiCard from "@/components/KpiCard";
import { BRL, pct, num } from "@/lib/format";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  Legend, LineChart, Line,
} from "recharts";
import { AlertTriangle, TrendingUp, Wallet, FileText, Scale } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";

export default function Home() {
  const { operacoesCalculadas, isLoading } = useSimuladorData();

  const consolidado = useMemo(
    () => consolidarPorAno(operacoesCalculadas),
    [operacoesCalculadas]
  );

  const totais = useMemo(() => {
    return operacoesCalculadas.reduce(
      (acc, oc) => {
        acc.valorBruto += num(oc.op.valor_bruto);
        acc.tributosAtuais += oc.sistemaAtual.tributosLiquidos;
        acc.cargaTransicao += oc.transicao.cargaTotalTransicao;
        acc.ibsCbs += oc.ibsCbs.ibsCbsLiquido;
        acc.split += oc.ibsCbs.splitRetido;
        acc.funding += oc.caixa.fundingTributario;
        acc.margemAtual += oc.precoMargem.margemAtual;
        acc.margemTransicao += oc.precoMargem.margemTransicao;
        return acc;
      },
      { valorBruto: 0, tributosAtuais: 0, cargaTransicao: 0, ibsCbs: 0, split: 0, funding: 0, margemAtual: 0, margemTransicao: 0 }
    );
  }, [operacoesCalculadas]);

  const chartData = consolidado.map((c) => ({
    ano: String(c.ano),
    "Tributos atuais": Math.round(c.tributosAtuaisLiquidos),
    "Carga transição": Math.round(c.cargaTransicao),
    "IBS/CBS líquido": Math.round(c.ibsCbsLiquido),
  }));

  const margemData = consolidado.map((c) => ({
    ano: String(c.ano),
    "Margem atual": +(c.margemAtual / (c.valorBruto || 1) * 100).toFixed(1),
    "Margem transição": +(c.margemTransicao / (c.valorBruto || 1) * 100).toFixed(1),
  }));

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
          <Scale className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-heading font-semibold">Painel Executivo</h1>
            <InfoTooltip pagina="home" chave="header" />
          </div>
          <p className="text-sm text-muted-foreground">
            Visão consolidada do sistema atual, IBS/CBS, transição, margem e caixa
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Operações carregadas" value={operacoesCalculadas.length} sub="total na base" />
        <KpiCard label="Valor bruto simulado" value={BRL(totais.valorBruto)} sub="somatório" />
        <KpiCard label="Tributos atuais líquidos" value={BRL(totais.tributosAtuais)} accent="text-foreground" />
        <KpiCard
          label="Carga da transição"
          value={BRL(totais.cargaTransicao)}
          sub={totais.valorBruto > 0 ? pct(totais.cargaTransicao / totais.valorBruto) : "—"}
        />
        <KpiCard label="IBS/CBS líquido" value={BRL(totais.ibsCbs)} accent="text-chart-2" />
        <KpiCard label="Split retido" value={BRL(totais.split)} sub="split payment" />
        <KpiCard label="Funding tributário estimado" value={BRL(totais.funding)} accent="text-destructive" />
        <KpiCard
          label="Δ Margem transição"
          value={BRL(totais.margemTransicao - totais.margemAtual)}
          accent={totais.margemTransicao < totais.margemAtual ? "text-destructive" : "text-chart-2"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-heading font-medium text-sm">Tributos por ano — atual vs transição</h2>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="ano" className="text-xs" />
              <YAxis className="text-xs" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => BRL(v)} />
              <Legend />
              <Bar dataKey="Tributos atuais" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Carga transição" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="IBS/CBS líquido" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-heading font-medium text-sm">Margem % por ano</h2>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={margemData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="ano" className="text-xs" />
              <YAxis className="text-xs" tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              <Line type="monotone" dataKey="Margem atual" stroke="hsl(var(--chart-1))" strokeWidth={2} />
              <Line type="monotone" dataKey="Margem transição" stroke="hsl(var(--chart-3))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-heading font-medium text-sm">Consolidado por ano</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Ano</th>
                <th className="py-2 pr-4 font-medium">Valor bruto</th>
                <th className="py-2 pr-4 font-medium">Tributos atuais</th>
                <th className="py-2 pr-4 font-medium">Carga transição</th>
                <th className="py-2 pr-4 font-medium">IBS/CBS</th>
                <th className="py-2 pr-4 font-medium">Split retido</th>
                <th className="py-2 pr-4 font-medium">Funding</th>
                <th className="py-2 pr-4 font-medium">Carga efetiva</th>
              </tr>
            </thead>
            <tbody>
              {consolidado.map((c) => (
                <tr key={c.ano} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2.5 pr-4 font-medium">{c.ano}</td>
                  <td className="py-2.5 pr-4">{BRL(c.valorBruto)}</td>
                  <td className="py-2.5 pr-4">{BRL(c.tributosAtuaisLiquidos)}</td>
                  <td className="py-2.5 pr-4">{BRL(c.cargaTransicao)}</td>
                  <td className="py-2.5 pr-4">{BRL(c.ibsCbsLiquido)}</td>
                  <td className="py-2.5 pr-4">{BRL(c.splitRetido)}</td>
                  <td className="py-2.5 pr-4 text-destructive">{BRL(c.funding)}</td>
                  <td className="py-2.5 pr-4">{c.valorBruto > 0 ? pct(c.cargaTransicao / c.valorBruto) : "—"}</td>
                </tr>
              ))}
              {consolidado.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhuma operação cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border">
        <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Premissas e alíquotas futuras permanecem como hipóteses até publicação oficial.
          O motor calcula IBS/CBS, transição, margem, caixa e split a partir dos parâmetros
          editáveis nas abas de Cenários, Transição e Catálogos.
        </p>
      </div>
    </div>
  );
}

function Card({ className, children, ...props }) {
  return (
    <div className={`rounded-lg border border-border bg-card ${className || ""}`} {...props}>
      {children}
    </div>
  );
}