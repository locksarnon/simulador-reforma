import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSimuladorData, calcularOperacoes } from "@/hooks/useSimuladorData";
import { consolidarPorAno, VERSAO_MOTOR } from "../../../base44/shared/taxEngine";
import { base44 } from "@/api/base44Client";
import { hashSnapshot } from "@/lib/snapshotHash";
import { gerarRelatorioSimulacao } from "@/lib/pdfReport";
import KpiCard from "@/components/KpiCard";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { BRL, pct } from "@/lib/format";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  Legend, LineChart, Line,
} from "recharts";
import { AlertTriangle, TrendingUp, Wallet, FileText, Scale, Save, Loader2, Download, GitCompare } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";

function Card({ className, children, ...props }) {
  return (
    <div className={`rounded-lg border border-border bg-card ${className || ""}`} {...props}>
      {children}
    </div>
  );
}

const num = (v) => Number(v) || 0;
const fmtFator = (v) => `${(num(v) * 100).toFixed(0)}%`;

// Linha simples de memória de cálculo — deliberadamente sem cor/ícone,
// só rótulo + valor alinhado à direita, tipo planilha.
function MemRow({ label, value, strong }) {
  return (
    <tr className={strong ? "font-medium" : ""}>
      <td className="py-0.5 pr-4 text-muted-foreground">{label}</td>
      <td className="py-0.5 text-right tabular-nums">{value}</td>
    </tr>
  );
}

// Soma o consolidado por ano nos mesmos totais do topo — usada tanto para o
// cenário selecionado quanto para cada cenário na comparação lado a lado,
// pra garantir que as duas telas nunca divirjam sobre como somar/truncar.
function somarTotais(consolidado) {
  return consolidado.reduce(
    (acc, c) => {
      acc.valorBruto += c.valorBruto;
      acc.tributosAtuais += c.tributosAtuaisLiquidos;
      acc.cargaTransicao += c.cargaTransicao;
      acc.ibsCbs += c.ibsCbsLiquido;
      acc.split += c.splitRetido;
      acc.funding += c.funding;
      acc.margemAtual += c.margemAtual;
      acc.margemTransicao += c.margemTransicao;
      return acc;
    },
    { valorBruto: 0, tributosAtuais: 0, cargaTransicao: 0, ibsCbs: 0, split: 0, funding: 0, margemAtual: 0, margemTransicao: 0 }
  );
}

/**
 * Conteúdo do Painel Executivo — extraído de Home.jsx para ser reaproveitado
 * tanto no /cockpit standalone quanto dentro do workspace de uma empresa
 * (EmpresaPainel.jsx), sem duplicar KPIs/gráficos/exportação.
 *
 * @param grupoNumero, empresaId — escopo do cálculo (repassados a useSimuladorData).
 * @param grupoLabel, empresaLabel — texto de contexto exibido no subtítulo;
 * quem chama já tem os registros de Grupo/Empresa carregados, então monta o
 * texto (evita este componente refazer as mesmas queries).
 * @param headerControls — slot opcional para seletores (usado só pelo /cockpit
 * standalone — dentro do workspace de empresa o contexto já vem fixo pela URL).
 * @param escopo — "grupo" | "empresa" | "global", gravado em Simulacao.escopo.
 * @param grupoId, empresaDbId — ids (cuid) de Grupo/Empresa para Simulacao.grupo_id/empresa_id.
 */
export default function PainelExecutivoView({
  grupoNumero, empresaId, grupoLabel, empresaLabel, headerControls,
  escopo = "global", grupoId = null, empresaDbId = null,
}) {
  // Cenário selecionado no seletor abaixo — null usa o padrão (Configuracao.cenario_ativo).
  // Os 3 cenários (Normal/Conservador/Otimista, ou o que estiver cadastrado)
  // ficam sempre disponíveis: o usuário escolhe qual ver em detalhe, ou liga
  // "Comparar" para ver os três lado a lado — nenhum fica "trancado" fora da tela.
  const [cenarioNome, setCenarioNome] = useState(null);
  const [comparar, setComparar] = useState(false);
  const [verProjecao, setVerProjecao] = useState(false);

  const {
    operacoes, operacoesCalculadas, isLoading, cenarioAtivo, cenarios, config,
    transicao, transicaoMap, classTrib, classTribGrouped, credPresGrouped, credPres,
  } = useSimuladorData({
    grupoNumero: grupoNumero || undefined,
    empresaId: empresaId || undefined,
    cenarioNome: cenarioNome || undefined,
  });
  const [salvando, setSalvando] = useState(false);

  const qc = useQueryClient();
  // Filtra pelo mesmo escopo do cálculo — senão a lista de simulações salvas
  // mistura resultados de outras empresas/grupos, o problema que esta tela
  // inteira existe para resolver.
  const simulacoesFiltro = empresaDbId ? { empresa_id: empresaDbId } : (grupoId ? { grupo_id: grupoId } : {});
  const simulacoesQ = useQuery({
    queryKey: ["simulacoes", grupoId, empresaDbId],
    queryFn: () => base44.entities.Simulacao.filter(simulacoesFiltro, "-createdAt", 20),
  });

  const transicaoPorAno = useMemo(
    () => new Map(transicao.map((t) => [t.ano, t])),
    [transicao]
  );
  const consolidado = useMemo(
    () => consolidarPorAno(operacoesCalculadas, transicaoPorAno),
    [operacoesCalculadas, transicaoPorAno]
  );

  // Deriva os KPIs do topo do mesmo consolidado por ano (já compensado por
  // empresa) em vez de re-somar operacoesCalculadas cru — evitava que os
  // dois lugares divergissem sobre como truncar IBS/CBS em zero.
  const totais = useMemo(() => somarTotais(consolidado), [consolidado]);

  // Comparação lado a lado: recalcula o motor para CADA cenário cadastrado
  // sobre a MESMA base de operações já filtrada (grupo/empresa) — sem
  // refazer nenhuma query, só reaproveitando os dados já carregados.
  const comparacaoCenarios = useMemo(() => {
    if (!comparar || cenarios.length === 0) return [];
    return cenarios.map((cen) => {
      const calc = calcularOperacoes(operacoes, transicaoMap, classTribGrouped, credPresGrouped, cen, config);
      const cons = consolidarPorAno(calc, transicaoPorAno);
      return { cenario: cen, totais: somarTotais(cons) };
    });
  }, [comparar, cenarios, operacoes, transicaoMap, classTribGrouped, credPresGrouped, config, transicaoPorAno]);

  // Projeção da transição 2026-2033: o "Consolidado por ano" acima é
  // histórico — só mostra os anos em que existe operação de verdade
  // lançada (ex.: hoje só 2024-2027). Pra ver a curva completa até 2033,
  // simula o MESMO conjunto de operações que já existe repetido em cada
  // ano da tabela Transição, trocando só os parâmetros daquele ano —
  // "se meu volume atual se repetisse, como fica a carga em cada ano".
  const projecaoTransicao = useMemo(() => {
    if (!verProjecao || operacoes.length === 0) return [];
    const anosProjecao = [...transicaoPorAno.keys()].sort((a, b) => a - b);
    return anosProjecao.map((anoAlvo) => {
      const opsProjetadas = operacoes.map((op) => ({ ...op, ano: anoAlvo, data: null }));
      const calc = calcularOperacoes(opsProjetadas, transicaoMap, classTribGrouped, credPresGrouped, cenarioAtivo, config);
      const cons = consolidarPorAno(calc, transicaoPorAno);
      // Memória de cálculo: soma os 4 componentes do sistema atual remanescente
      // (já com fator e o desconto de crédito de entrada aplicados por
      // calcTransicao, sem nenhuma etapa de truncamento) — a soma dos 4 bate
      // exatamente com "sistemaAtualRemanescente" abaixo, sem aproximação.
      const memoria = calc.reduce(
        (acc, oc) => {
          acc.pisCofinsAtual += oc.transicao.pisCofinsAtual;
          acc.ipiAtual += oc.transicao.ipiAtual;
          acc.icmsFcpStAtual += oc.transicao.icmsFcpStAtual;
          acc.issAtual += oc.transicao.issAtual;
          return acc;
        },
        { pisCofinsAtual: 0, ipiAtual: 0, icmsFcpStAtual: 0, issAtual: 0 }
      );
      return { ano: anoAlvo, ...somarTotais(cons), memoria, parametros: transicaoPorAno.get(anoAlvo) || {} };
    });
  }, [verProjecao, operacoes, transicaoPorAno, transicaoMap, classTribGrouped, credPresGrouped, cenarioAtivo, config]);

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

  const handleSalvarSimulacao = async () => {
    setSalvando(true);
    try {
      const entrada = {
        operacoes: operacoesCalculadas.map((oc) => oc.op),
        cenarioAtivo, config, transicao, classTrib, credPres,
      };
      const resultado = { consolidado, totais };
      const nomeEscopo = empresaLabel || grupoLabel || "todos os grupos";
      await base44.entities.Simulacao.create({
        escopo,
        grupo_id: grupoId,
        empresa_id: empresaDbId,
        nome: `Painel executivo (${nomeEscopo}) — ${new Date().toLocaleString("pt-BR")}`,
        versao_motor: VERSAO_MOTOR,
        versao_regras: config.versao_simulador || "v0.18",
        input_hash: hashSnapshot(entrada),
        entrada_json: JSON.stringify(entrada),
        resultado_json: JSON.stringify(resultado),
      });
      toast({ title: "Simulação salva", description: "Snapshot gravado com sucesso — os dados de entrada e o resultado ficaram registrados." });
      qc.invalidateQueries({ queryKey: ["simulacoes"] });
    } catch (err) {
      toast({ title: "Falha ao salvar simulação", description: err.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const handleExportarPdf = () => {
    try {
      const nome = gerarRelatorioSimulacao({
        totais, consolidado,
        versaoMotor: VERSAO_MOTOR,
        versaoRegras: config.versao_simulador || "v0.18",
        cenarioNome: cenarioAtivo?.nome,
        grupoNome: empresaLabel || grupoLabel || "Todos os grupos",
      });
      toast({ title: "PDF gerado", description: nome });
    } catch (err) {
      toast({ title: "Falha ao gerar PDF", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-screen-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
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
              {empresaLabel || grupoLabel || "Todos os grupos — sistema atual, IBS/CBS, transição, margem e caixa"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {headerControls}
          <Button variant="outline" onClick={handleExportarPdf} disabled={operacoesCalculadas.length === 0} className="gap-2">
            <Download className="w-4 h-4" />
            Exportar PDF
          </Button>
          <Button onClick={handleSalvarSimulacao} disabled={salvando || operacoesCalculadas.length === 0} className="gap-2">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar simulação
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Cenário:</span>
        {cenarios.map((cen) => {
          const nomeEfetivo = cenarioNome || cenarioAtivo?.nome;
          const selecionado = cen.nome === nomeEfetivo;
          return (
            <button
              key={cen.id}
              onClick={() => setCenarioNome(cen.nome)}
              disabled={comparar}
              title={cen.descricao || cen.nome}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                selecionado && !comparar
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted text-foreground"
              }`}
            >
              {cen.nome}
            </button>
          );
        })}
        <button
          onClick={() => setComparar((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
            comparar ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted text-foreground"
          }`}
        >
          <GitCompare className="w-3.5 h-3.5" />
          Comparar os {cenarios.length || 3}
        </button>
      </div>

      {comparar && comparacaoCenarios.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitCompare className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-heading font-medium text-sm">Comparação entre cenários</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Cenário</th>
                  <th className="py-2 pr-4 font-medium">Fatores (vol · preço · custo)</th>
                  <th className="py-2 pr-4 font-medium">Margem atual</th>
                  <th className="py-2 pr-4 font-medium">Margem transição</th>
                  <th className="py-2 pr-4 font-medium">Margem % transição</th>
                </tr>
              </thead>
              <tbody>
                {comparacaoCenarios.map(({ cenario: cen, totais: t }) => (
                  <tr key={cen.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2.5 pr-4 font-medium">
                      {cen.nome}
                      {cen.nome === config.cenario_ativo && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground align-middle">padrão</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground font-mono">
                      {cen.fator_volume}x · {cen.fator_preco}x · {cen.fator_custo}x
                    </td>
                    <td className="py-2.5 pr-4">{BRL(t.margemAtual)}</td>
                    <td className={`py-2.5 pr-4 font-medium ${t.margemTransicao < t.margemAtual ? "text-destructive" : "text-chart-2"}`}>
                      {BRL(t.margemTransicao)}
                    </td>
                    <td className="py-2.5 pr-4">{t.valorBruto > 0 ? pct(t.margemTransicao / t.valorBruto) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Cada linha recalcula o mesmo conjunto de operações sob os fatores de volume/preço/custo daquele cenário (aba Cenários).
            Valor bruto, tributos, IBS/CBS e funding não mudam entre cenários — só a margem, porque só ela usa esses fatores hoje.
            Os gráficos e o consolidado por ano abaixo mostram sempre o cenário selecionado nas abas acima.
          </p>
        </Card>
      )}

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

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-heading font-medium text-sm">Projeção da transição (2026-2033)</h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => setVerProjecao((v) => !v)} className="gap-1.5">
            {verProjecao ? "Ocultar projeção" : "Ver projeção"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          O "Consolidado por ano" acima é histórico — só mostra anos com operação real lançada. Esta projeção simula o
          MESMO conjunto de operações que você já tem repetido em cada ano da tabela Transição, trocando só os
          parâmetros daquele ano — é uma simulação ("se meu volume atual se repetisse todo ano"), não um dado real.
        </p>
        {verProjecao && (
          projecaoTransicao.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma operação cadastrada para projetar.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={projecaoTransicao.map((p) => ({
                  ano: String(p.ano),
                  "Carga efetiva %": p.valorBruto > 0 ? +((p.cargaTransicao / p.valorBruto) * 100).toFixed(2) : 0,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="ano" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="Carga efetiva %" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Ano</th>
                      <th className="py-2 pr-4 font-medium">Valor bruto (mesmo volume)</th>
                      <th className="py-2 pr-4 font-medium">Tributos atuais</th>
                      <th className="py-2 pr-4 font-medium">IBS/CBS</th>
                      <th className="py-2 pr-4 font-medium">Carga transição</th>
                      <th className="py-2 pr-4 font-medium">Carga efetiva</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projecaoTransicao.map((p) => (
                      <tr key={p.ano} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2.5 pr-4 font-medium">{p.ano}</td>
                        <td className="py-2.5 pr-4">{BRL(p.valorBruto)}</td>
                        <td className="py-2.5 pr-4">{BRL(p.tributosAtuais)}</td>
                        <td className="py-2.5 pr-4">{BRL(p.ibsCbs)}</td>
                        <td className="py-2.5 pr-4">{BRL(p.cargaTransicao)}</td>
                        <td className="py-2.5 pr-4">{p.valorBruto > 0 ? pct(p.cargaTransicao / p.valorBruto) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">Memória de cálculo, ano a ano (fechada por padrão — clique para abrir):</p>
                <div className="space-y-1">
                  {projecaoTransicao.map((p) => {
                    const par = p.parametros;
                    return (
                      <details key={p.ano} className="border border-border rounded text-xs">
                        <summary className="cursor-pointer select-none px-3 py-2 font-medium">
                          {p.ano} — {par.carater || par.status || "parâmetros"}
                        </summary>
                        <div className="px-3 pb-3 pt-1 overflow-x-auto">
                          <table className="w-full border-collapse">
                            <tbody>
                              <tr><td className="py-1 pr-4 text-muted-foreground" colSpan={2}>Parâmetros usados (Transição {p.ano})</td></tr>
                              <MemRow label="Fator ICMS" value={fmtFator(par.icms_fator)} />
                              <MemRow label="Fator ISS" value={fmtFator(par.iss_fator)} />
                              <MemRow label="Fator PIS/COFINS" value={fmtFator(par.pis_cofins_fator)} />
                              <MemRow label="Fator IPI" value={fmtFator(par.ipi_fator_geral)} />
                              <MemRow label="IBS efetivo" value={pct(num(par.ibs_efetivo))} />
                              <MemRow label="CBS efetiva" value={pct(num(par.cbs_efetiva))} />
                              <MemRow label="Efeito financeiro" value={fmtFator(par.efeito_financeiro)} />
                              <tr><td className="pt-2 pr-4 text-muted-foreground" colSpan={2}>Sistema atual remanescente (soma dos 4, já com fator aplicado)</td></tr>
                              <MemRow label="PIS/COFINS remanescente" value={BRL(p.memoria.pisCofinsAtual)} />
                              <MemRow label="IPI remanescente" value={BRL(p.memoria.ipiAtual)} />
                              <MemRow label="ICMS + FCP + ST remanescente" value={BRL(p.memoria.icmsFcpStAtual)} />
                              <MemRow label="ISS remanescente" value={BRL(p.memoria.issAtual)} />
                              <MemRow label="= Sistema atual remanescente" value={BRL(p.memoria.pisCofinsAtual + p.memoria.ipiAtual + p.memoria.icmsFcpStAtual + p.memoria.issAtual)} strong />
                              <tr><td className="pt-2 pr-4 text-muted-foreground" colSpan={2}>IBS/CBS financeiro</td></tr>
                              <MemRow label="IBS/CBS líquido apurado (débitos − créditos, nunca negativo)" value={BRL(p.ibsCbs)} />
                              <MemRow label={`× Efeito financeiro (${fmtFator(par.efeito_financeiro)})`} value={BRL(p.ibsCbs * num(par.efeito_financeiro))} />
                              <tr><td className="pt-2 pr-4 font-medium" colSpan={2}>= Carga total da transição: {BRL(p.cargaTransicao)}</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            </>
          )
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Save className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-heading font-medium text-sm">Simulações salvas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Data</th>
                <th className="py-2 pr-4 font-medium">Nome</th>
                <th className="py-2 pr-4 font-medium">Versão motor</th>
                <th className="py-2 pr-4 font-medium">Versão regras</th>
                <th className="py-2 pr-4 font-medium">Hash da entrada</th>
              </tr>
            </thead>
            <tbody>
              {(simulacoesQ.data || []).map((s) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2.5 pr-4 whitespace-nowrap">{new Date(s.createdAt).toLocaleString("pt-BR")}</td>
                  <td className="py-2.5 pr-4">{s.nome}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs">{s.versao_motor}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs">{s.versao_regras}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{s.input_hash}</td>
                </tr>
              ))}
              {(simulacoesQ.data || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    Nenhuma simulação salva ainda — clique em "Salvar simulação" acima.
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
