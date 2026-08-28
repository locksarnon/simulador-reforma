import { Check, ClipboardCheck, FileText, Calculator, ShieldCheck, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Preparação", icon: ClipboardCheck, desc: "Cadastros e configurações" },
  { id: 2, label: "Modelagem", icon: FileText, desc: "Operações e participantes" },
  { id: 3, label: "Cálculo", icon: Calculator, desc: "IBS/CBS e transição" },
  { id: 4, label: "Validação", icon: ShieldCheck, desc: "Auditoria e gates" },
  { id: 5, label: "Análise", icon: BarChart3, desc: "Painel e relatórios" },
];

export default function PipelineStepper({ currentStep, onStepClick }) {
  return (
    <div className="flex items-start justify-between w-full overflow-x-auto pb-2">
      {STEPS.map((step, idx) => {
        const state =
          step.id < currentStep ? "done" :
          step.id === currentStep ? "active" : "pending";
        const Icon = step.icon;
        return (
          <div key={step.id} className="flex items-start flex-1 last:flex-none">
            <button
              onClick={() => onStepClick?.(step.id)}
              className="flex flex-col items-center gap-1.5 group min-w-[80px]"
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                state === "done" && "bg-primary border-primary text-primary-foreground",
                state === "active" && "bg-primary border-primary text-primary-foreground ring-4 ring-primary/20",
                state === "pending" && "bg-card border-border text-muted-foreground group-hover:border-primary/50"
              )}>
                {state === "done" ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>
              <div className="text-center">
                <p className={cn(
                  "text-xs font-medium",
                  state === "pending" ? "text-muted-foreground" : "text-foreground"
                )}>
                  {step.label}
                </p>
                <p className="text-[10px] text-muted-foreground hidden sm:block">{step.desc}</p>
              </div>
            </button>
            {idx < STEPS.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 mx-2 mt-5 transition-colors",
                step.id < currentStep ? "bg-primary" : "bg-border"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}