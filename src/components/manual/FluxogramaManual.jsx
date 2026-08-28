import React from "react";
import {
  Settings, Building2, CalendarClock, BookMarked, SlidersHorizontal,
  FileText, LayoutDashboard, ShieldCheck, ArrowDown, ArrowRight,
  CircleCheck, Info,
} from "lucide-react";

const ETAPAS = [
  {
    n: 1, icon: Settings, label: "Configuração", to: "/configuracao",
    desc: "Definir versão, data-base normativa, cenário ativo, margem-meta global e taxa de custo financeiro.",
  },
  {
    n: 2, icon: Building2, label: "Empresas", to: "/empresas",
    desc: "Cadastrar empresas e unidades com regime, setor, UF e indicadores de contribuinte/produtor rural/cooperativa.",
  },
  {
    n: 3, icon: CalendarClock, label: "Transição 2026–2033", to: "/transicao",
    desc: "Parametrizar fatores de extinção (PIS/Cofins, IPI, ICMS, ISS) e alíquotas efetivas de IBS/CBS por ano.",
  },
  {
    n: 4, icon: BookMarked, label: "Catálogos IBS/CBS", to: "/catalogos",
    desc: "Validar CST, cClassTrib (reduções e incidência) e cCredPres (crédito presumido, vigência e método).",
  },
  {
    n: 5, icon: SlidersHorizontal, label: "Cenários", to: "/cenarios",
    desc: "Criar cenários com fatores de volume, preço e custo. Ativar o cenário que alimenta os cálculos.",
  },
  {
    n: 6, icon: FileText, label: "Operações", to: "/operacoes",
    desc: "Lançar operações com valores, classificação fiscal, tributos atuais, split, crédito presumido e DF-e.",
  },
  {
    n: 7, icon: LayoutDashboard, label: "Painel Executivo", to: "/",
    desc: "Acompanhar a consolidação por ano: carga atual vs. transição, margem, split, crédito acumulado e funding.",
  },
  {
    n: 8, icon: ShieldCheck, label: "Validação DF-e", to: "/operacoes",
    desc: "Conferir status de classificação, redução, diferimento e crédito presumido após 03/08/2026.",
  },
];

const SECOES = [
  {
    titulo: "1. Objetivo",
    corpo: "O Simulador FAL calcula o impacto financeiro da Reforma Tributária (IBS/CBS) sobre as operações da empresa, comparando o sistema atual com o regime de transição (2026–2033) e projetando preço-alvo, margem, caixa e funding tributário.",
  },
  {
    titulo: "2. Ordem recomendada de uso",
    corpo: "Siga as etapas do fluxograma na ordem: Configuração → Empresas → Transição → Catálogos → Cenários → Operações → Painel → Validação. Parâmetros globais e catálogos devem estar prontos antes de lançar operações, pois o motor os consome no momento do cálculo.",
  },
  {
    titulo: "3. Configuração global",
    corpo: "A margem-meta é global (Configuração) e controla o gross-up do preço-alvo. A taxa de custo financeiro (% a.m.) e o prazo de realização de crédito (dias) definem o custo financeiro do crédito acumulado. Alterar a margem na Configuração recalcula o preço-alvo de todas as operações.",
  },
  {
    titulo: "4. Percentuais",
    corpo: "Todos os campos de percentual são exibidos em pontos percentuais (ex.: 18 para 18% e 1,5 para 1,5% a.m.) e armazenados internamente como fração decimal (0,18; 0,015). Não digite 0,18 em um campo de percentual.",
  },
  {
    titulo: "5. Crédito presumido (cCredPres)",
    corpo: "O crédito presumido só é calculado quando o código é localizado no catálogo e o percentual oficial não está pendente. Status possível: Localizado (calcula), Pendente (não calcula — aguarda ato conjunto), Não localizado (código inexistente — não gera crédito) e Não informado (sem cCredPres). O método 'Por Fora' usa CP = VO×C/(1+C); o método 'Direto' usa CP = VO×C.",
  },
  {
    titulo: "6. Carga de dados",
    corpo: "Os dados v0.14 (operações, empresas, cenários, transição e catálogos) são carregados a partir da planilha oficial. A carga integral exige publicação do app para a integração ler o arquivo no servidor.",
  },
  {
    titulo: "7. Limites e alertas",
    corpo: "Líquidos de IBS/CBS nunca ficam negativos — o excedente vira crédito acumulado. A margem abaixo da meta gera alerta de repricing. O funding é classificado em faixas: Baixa (=0), Moderada (>0), Alta (>5% do valor bruto) e Crítica (>10%).",
  },
];

function StepNode({ etapa }) {
  const Icon = etapa.icon;
  return (
    <div className="flex items-start gap-3 w-full">
      <div className="shrink-0 w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-heading font-semibold text-sm">
        {etapa.n}
      </div>
      <a
        href={etapa.to}
        className="flex-1 rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="font-heading font-medium text-sm text-foreground">{etapa.label}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{etapa.desc}</p>
      </a>
    </div>
  );
}

function FlowConnector() {
  return (
    <div className="flex justify-center py-1">
      <ArrowDown className="w-4 h-4 text-muted-foreground/60" />
    </div>
  );
}

export default function FluxogramaManual() {
  return (
    <div className="space-y-6">
      {/* Fluxograma */}
      <section className="rounded-lg border border-border bg-card p-5 lg:p-6">
        <div className="flex items-center gap-2 mb-4">
          <CircleCheck className="w-4 h-4 text-chart-2" />
          <h2 className="font-heading font-semibold text-sm">Fluxograma de Uso</h2>
        </div>

        <div className="hidden md:grid grid-cols-2 gap-x-8 gap-y-1">
          {ETAPAS.map((etapa, i) => {
            const left = i % 2 === 0;
            return (
              <React.Fragment key={etapa.n}>
                <div className={left ? "" : "order-2"}>
                  <StepNode etapa={etapa} />
                </div>
                <div className={left ? "order-2 flex items-center justify-center" : "flex items-center justify-center"}>
                  {i < ETAPAS.length - 1 && (
                    left
                      ? <ArrowRight className="w-5 h-5 text-muted-foreground/50" />
                      : <ArrowDown className="w-5 h-5 text-muted-foreground/50 md:hidden lg:block" />
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div className="md:hidden space-y-1">
          {ETAPAS.map((etapa, i) => (
            <React.Fragment key={etapa.n}>
              <StepNode etapa={etapa} />
              {i < ETAPAS.length - 1 && <FlowConnector />}
            </React.Fragment>
          ))}
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-md bg-muted/50 p-3">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Cada etapa é navegável. O motor recalcula os cinco módulos (sistema atual, IBS/CBS, transição,
            preço/margem e caixa/funding) ao abrir uma operação, consumindo os parâmetros globais, o
            cronograma de transição, os catálogos e o cenário ativo.
          </p>
        </div>
      </section>

      {/* Manual por seção */}
      <ManualSecoes />
    </div>
  );
}

function ManualSecoes() {
  const [secao, setSecao] = React.useState(0);
  return (
    <section className="rounded-lg border border-border bg-card p-5 lg:p-6">
      <div className="flex items-center gap-2 mb-4">
        <BookMarked className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-heading font-semibold text-sm">Manual de Uso</h2>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4 border-b border-border pb-3">
        {SECOES.map((s, i) => (
          <button
            key={i}
            onClick={() => setSecao(i)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              secao === i
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {s.titulo.replace(/^\d+\.\s*/, "")}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        <h3 className="font-heading font-medium text-sm text-foreground">{SECOES[secao].titulo}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{SECOES[secao].corpo}</p>
      </div>
    </section>
  );
}