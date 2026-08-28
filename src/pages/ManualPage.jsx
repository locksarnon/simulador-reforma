import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookOpen, HelpCircle, TriangleAlert } from "lucide-react";
import FluxogramaManual from "@/components/manual/FluxogramaManual";
import FaqAccordion from "@/components/manual/FaqAccordion";
import InfoTooltip from "@/components/InfoTooltip";

export default function ManualPage() {
  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-heading font-semibold">FAQ & Manual</h1>
          <InfoTooltip pagina="manual" chave="header" />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Fluxograma de utilização, manual técnico e perguntas frequentes do Simulador FAL — v0.16
        </p>
      </div>

      <Tabs defaultValue="manual" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="manual" className="gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Manual & Fluxograma
          </TabsTrigger>
          <TabsTrigger value="faq" className="gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            FAQ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-4">
          <FluxogramaManual />
        </TabsContent>
        <TabsContent value="faq" className="mt-4">
          <FaqAccordion />
        </TabsContent>
      </Tabs>

      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <TriangleAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Os resultados são premissas de simulação e não substituem a apuração oficial. Alíquotas
          futuras permanecem premissas até publicação oficial. Valide sempre com a legislação vigente.
        </p>
      </div>
    </div>
  );
}