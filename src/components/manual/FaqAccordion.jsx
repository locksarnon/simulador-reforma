import React, { useState, useMemo } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Search, HelpCircle } from "lucide-react";
import { FAQ_SECOES, FAQ_ATUALIZADO_EM } from "./faqData";

function highlight(text, query) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">{part}</mark>
      : part
  );
}

function ListaItens({ secao, itens, busca }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {itens.map((item, idx) => (
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
            {item.f && (
              <p className="mt-2 text-xs text-muted-foreground/80">
                Fonte: {highlight(item.f, busca)}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export default function FaqAccordion() {
  const [busca, setBusca] = useState("");
  const [ativa, setAtiva] = useState(FAQ_SECOES[0].titulo);

  const total = useMemo(() => FAQ_SECOES.reduce((acc, s) => acc + s.itens.length, 0), []);
  const secaoAtiva = FAQ_SECOES.find((s) => s.titulo === ativa) || FAQ_SECOES[0];
  const q = busca.trim().toLowerCase();

  const { secoesFiltradas, totalResultados } = useMemo(() => {
    if (!q) return { secoesFiltradas: [], totalResultados: 0 };
    let count = 0;
    const filtradas = FAQ_SECOES.map((secao) => {
      const itens = secao.itens.filter(
        (item) =>
          item.p.toLowerCase().includes(q) ||
          item.r.toLowerCase().includes(q) ||
          (item.f || "").toLowerCase().includes(q)
      );
      count += itens.length;
      return { ...secao, itens };
    }).filter((s) => s.itens.length > 0);
    return { secoesFiltradas: filtradas, totalResultados: count };
  }, [q]);

  return (
    <section className="rounded-lg border border-border bg-card p-5 lg:p-6">
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-heading font-semibold text-sm">Central de Ajuda e FAQ</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Dúvidas comuns sobre o uso, os cálculos, as ferramentas e as novidades da Reforma Tributária: {total} perguntas, atualizadas em {FAQ_ATUALIZADO_EM}. Pesquise pelo conteúdo ou escolha uma seção e clique em cada pergunta para expandir a resposta.
      </p>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Digite para pesquisar nas perguntas e respostas..."
          className="pl-9"
        />
      </div>

      {!q && (
        <div>
          <div role="tablist" aria-label="Seções do FAQ" className="flex flex-wrap gap-2 mb-5">
            {FAQ_SECOES.map((s) => {
              const selecionada = s.titulo === secaoAtiva.titulo;
              return (
                <button
                  key={s.titulo}
                  type="button"
                  role="tab"
                  aria-selected={selecionada}
                  onClick={() => setAtiva(s.titulo)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs transition-colors ${
                    selecionada
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {s.rotulo || s.titulo}
                  <span className={selecionada ? "opacity-80" : "opacity-60"}>{s.itens.length}</span>
                </button>
              );
            })}
          </div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2 pb-1 border-b border-border/60">
            {secaoAtiva.titulo}
          </h3>
          {secaoAtiva.nota && <p className="text-xs text-muted-foreground mb-3">{secaoAtiva.nota}</p>}
          <ListaItens secao={secaoAtiva} itens={secaoAtiva.itens} busca="" />
        </div>
      )}

      {q && totalResultados === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Nenhuma pergunta encontrada para "{busca}".
        </p>
      )}

      {q && totalResultados > 0 && (
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground">
            {totalResultados} {totalResultados === 1 ? "resultado encontrado" : "resultados encontrados"} para "{busca}".
          </p>
          {secoesFiltradas.map((secao) => (
            <div key={secao.titulo}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2 pb-1 border-b border-border/60">
                {secao.titulo}
              </h3>
              <ListaItens secao={secao} itens={secao.itens} busca={busca} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
