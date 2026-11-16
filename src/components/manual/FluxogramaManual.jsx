import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Settings, Building2, KeyRound, Archive, ShieldCheck, FolderOpen, ListChecks, Activity, ScanSearch, Stethoscope,
  BookMarked, ArrowDown, ArrowRight, CircleCheck, Info, ExternalLink,
} from "lucide-react";
import { POPS } from "@/components/manual/pops";
import { moduloPorId } from "@/lib/navegacao";

/** Fluxo de trabalho do escritório no InTAX. Cada etapa abre o procedimento (POP) da tela; o ícone ao lado abre a tela. */
const ETAPAS = [
  { n: 1, icon: Settings, label: "Preparar o sistema", modulos: ["usuarios", "integracoes", "parametros-rotinas"],
    desc: "Administrador: cria os usuários, cadastra os contratos (Serpro, Infosimples) e define as rotinas automáticas." },
  { n: 2, icon: Building2, label: "Cadastrar os clientes", modulos: ["grupos-empresas", "carteira", "importacao-cadastro"],
    desc: "Cadastra cada cliente (um a um ou por planilha), marca os serviços contratados e quem atende cada um." },
  { n: 3, icon: KeyRound, label: "Liberar o acesso à Receita", modulos: ["procuracoes"],
    desc: "Guarda o certificado A1 do cliente no cofre ou confere a procuração eletrônica do escritório." },
  { n: 4, icon: Archive, label: "Capturar os XML", modulos: ["captura-xml"],
    desc: "Liga a captura automática da SEFAZ, importa os arquivos do cliente e recupera o histórico de NF-e." },
  { n: 5, icon: ShieldCheck, label: "Monitorar o fisco", modulos: ["monitoramento"],
    desc: "Situação fiscal, declarações, guias, caixa postal, certidões e SPED de cada cliente, com custo à vista." },
  { n: 6, icon: FolderOpen, label: "Guardar e enviar documentos", modulos: ["arquivos"],
    desc: "Arquivos por cliente, documentos com validade, download em ZIP e envio por e-mail." },
  { n: 7, icon: ListChecks, label: "Cumprir a rotina", modulos: ["tarefas", "agenda-geral"],
    desc: "Tarefas e processos recorrentes com responsável, e o calendário de obrigações." },
  { n: 8, icon: Activity, label: "Priorizar o risco", modulos: ["analise-risco", "carteira-bpo"],
    desc: "Saúde fiscal da carteira, fila de prioridade, radar de certidões e calculadora de multas." },
];
/** Fora do ciclo do BPO: venda e consultoria. */
const RAMOS = [
  { icon: ScanSearch, label: "Comercial", modulos: ["pre-analise", "propostas", "leads"], desc: "Pré-análise do prospect pelo CNPJ e proposta de honorários." },
  { icon: Stethoscope, label: "Consultoria tributária", modulos: ["carteira-diagnostico", "clientes-diagnostico"], desc: "Projetos de diagnóstico com as ferramentas de cada empresa." },
];

const primeiroPop = (modulos) => modulos.map((m) => POPS.find((p) => p.modulo === m)).find(Boolean);

function StepNode({ etapa }) {
  const [, setParams] = useSearchParams();
  const Icon = etapa.icon;
  const pop = primeiroPop(etapa.modulos);
  const tela = moduloPorId(etapa.modulos[0]);
  return (
    <div className="flex items-start gap-3 w-full">
      {etapa.n && (
        <div className="shrink-0 w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-heading font-semibold text-sm">
          {etapa.n}
        </div>
      )}
      <div className="flex-1 flex items-stretch rounded-lg border border-border bg-card hover:border-primary/50 transition-colors">
        <button type="button" disabled={!pop} onClick={() => setParams({ aba: "pop", pop: pop.codigo })} className="flex-1 p-3 text-left disabled:cursor-default" title={pop ? `Abrir o procedimento ${pop.codigo}` : undefined}>
          <span className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-heading font-medium text-sm text-foreground">{etapa.label}</span>
          </span>
          <span className="block text-xs text-muted-foreground mt-1.5 leading-relaxed">{etapa.desc}</span>
        </button>
        {tela?.to && (
          <Link to={tela.to} className="flex items-center border-l border-border px-2 text-muted-foreground hover:text-foreground" aria-label={`Abrir a tela ${tela.titulo}`} title={`Abrir a tela ${tela.titulo}`}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

const SECOES = [
  {
    titulo: "1. Objetivo",
    corpo: "O InTAX calcula o impacto financeiro da Reforma Tributária (IBS/CBS) sobre as operações da empresa, comparando o sistema atual com o regime de transição (2026–2033) e projetando preço-alvo, margem, caixa e funding tributário.",
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
    corpo: "O crédito presumido só é calculado em compra (Entrada) com o código localizado no catálogo. Os percentuais dos códigos 3 (resíduos) e 4 (bem usado) vêm da lei; nos códigos 1 (produtor rural) e 2 (frete de autônomo) o ato conjunto anual ainda é pendente e o crédito só é calculado, como estimativa, quando a operação traz o percentual. Status possível: Localizado (calcula), Estimativa (calcula com o percentual informado), Pendente (não calcula: falta o percentual do ato), Não localizado (código inexistente: não gera crédito) e Não informado (sem cCredPres). O método 'Por Fora' usa CP = VO×C/(1+C), com C a soma dos percentuais de IBS e CBS quando os dois são informados; o método 'Direto' usa CP = VO×C. A compra com crédito presumido não gera também o crédito normal de IBS/CBS.",
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

export default function FluxogramaManual() {
  return (
    <div className="space-y-6">
      {/* Fluxograma */}
      <section className="rounded-lg border border-border bg-card p-5 lg:p-6">
        <div className="flex items-center gap-2 mb-4">
          <CircleCheck className="w-4 h-4 text-chart-2" />
          <h2 className="font-heading font-semibold text-sm">Fluxograma de uso: a rotina do escritório</h2>
        </div>

        <ol className="grid gap-x-3 gap-y-1 md:grid-cols-2">
          {ETAPAS.map((etapa, i) => (
            <li key={etapa.n} className="flex flex-col">
              <StepNode etapa={etapa} />
              {i < ETAPAS.length - 1 && (
                <span className="flex justify-center py-1 text-muted-foreground/60" aria-hidden="true">
                  {i % 2 === 0 ? <ArrowRight className="hidden h-4 w-4 md:block" /> : null}
                  <ArrowDown className={`h-4 w-4 ${i % 2 === 0 ? "md:hidden" : ""}`} />
                </span>
              )}
            </li>
          ))}
        </ol>

        <h3 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fora da rotina do BPO</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {RAMOS.map((r) => <StepNode key={r.label} etapa={r} />)}
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-md bg-muted/50 p-3">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Clique numa etapa para abrir o procedimento passo a passo (POP) da tela; o ícone à direita abre a própria tela.
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
        <h2 className="font-heading font-semibold text-sm">Motor de cálculo da Reforma (Planejamento tributário)</h2>
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