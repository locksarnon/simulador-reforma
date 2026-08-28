import React, { useState, useMemo } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Search, HelpCircle } from "lucide-react";
import { FAQ_SECOES } from "./faqData";

function highlight(text, query) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">{part}</mark>
      : part
  );
}

export default function FaqAccordion() {
  const [busca, setBusca] = useState("");

  const { secoesFiltradas, totalResultados } = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return { secoesFiltradas: FAQ_SECOES, totalResultados: 0 };
    let count = 0;
    const filtradas = FAQ_SECOES.map((secao) => {
      const itens = secao.itens.filter(
        (item) =>
          item.p.toLowerCase().includes(q) ||
          item.r.toLowerCase().includes(q)
      );
      count += itens.length;
      return { ...secao, itens };
    }).filter((s) => s.itens.length > 0);
    return { secoesFiltradas: filtradas, totalResultados: count };
  }, [busca]);

  return (
    <section className="rounded-lg border border-border bg-card p-5 lg:p-6">
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-heading font-semibold text-sm">Central de Ajuda e FAQ</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Dúvidas comuns sobre o uso, os cálculos e as funções do simulador. Pesquise pelo conteúdo ou clique em cada pergunta para expandir a resposta.
      </p>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Digite para pesquisar nas perguntas e respostas..."
          className="pl-9"
        />
      </div>

      {!busca.trim() && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="w-8 h-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">Pesquise para encontrar respostas</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Digite uma palavra-chave acima para buscar entre as {FAQ_SECOES.reduce((acc, s) => acc + s.itens.length, 0)} perguntas cadastradas.
          </p>
        </div>
      )}

      {busca.trim() && totalResultados === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Nenhuma pergunta encontrada para "{busca}".
        </p>
      )}

      {busca.trim() && totalResultados > 0 && (
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground">
            {totalResultados} {totalResultados === 1 ? "resultado encontrado" : "resultados encontrados"} para "{busca}".
          </p>
          {secoesFiltradas.map((secao) => (
            <div key={secao.titulo}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2 pb-1 border-b border-border/60">
                {secao.titulo}
              </h3>
              <Accordion type="single" collapsible className="w-full">
                {secao.itens.map((item, idx) => (
                  <AccordionItem key={`${secao.titulo}-${idx}`} value={`${secao.titulo}-${idx}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <span className="text-sm font-medium text-foreground text-left">
                        {highlight(item.p, busca)}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {highlight(item.r, busca)}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}