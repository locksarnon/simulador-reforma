import { CheckCircle2, Lock } from "lucide-react";
import { classeBotaoFiltro } from "@/components/BotaoFiltro";
import { ABAS_COMUNS, AREAS, abasDaArea, proximoPorTecla } from "./logica";

/** Teclado do padrão de abas do WAI-ARIA: setas, Home e End, circular; o foco acompanha. */
const aoTeclar = (ids, atual, aoMudar, prefixo) => (e) => {
  const prox = proximoPorTecla(ids, atual, e.key);
  if (!prox) return;
  e.preventDefault();
  aoMudar(prox);
  document.getElementById(`${prefixo}${prox}`)?.focus();
};

/**
 * Seletor de fases (primeiro nível): Fase 1 · Saneamento, Fase 2 · Tributário e Fechamento, cada uma com a sua situação
 * (`situacoes` de situacaoDasFases). A fase aberta fica em verde. A Fase 2 bloqueada mostra o cadeado e o motivo, mas abre (consulta).
 */
export function SeletorDeFases({ atual, situacoes, aoMudar }) {
  const ids = AREAS.map((a) => a.id);
  return (
    <div role="tablist" aria-label="Fases do projeto" className="grid gap-2 sm:grid-cols-3">
      {AREAS.map((a, n) => {
        const s = situacoes?.[a.id] || { texto: "", tom: "neutro", travada: false };
        const ativa = atual === a.id;
        const Icone = s.travada ? Lock : s.tom === "ok" ? CheckCircle2 : null;
        return (
          <button key={a.id} type="button" role="tab" id={`san-fase-${a.id}`} aria-selected={ativa} aria-controls="san-fase-painel" tabIndex={ativa ? 0 : -1}
            title={s.detalhe || undefined} onClick={() => aoMudar(a.id)} onKeyDown={aoTeclar(ids, atual, aoMudar, "san-fase-")}
            className={`botao-acao flex items-center gap-3 border-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ativa ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`}>
            <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${ativa ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/80"}`}>
              {Icone ? <Icone className="h-4 w-4" /> : n + 1}
            </span>
            <span className="min-w-0">
              <span className={`block text-sm ${ativa ? "font-semibold text-foreground" : "font-medium text-foreground/85"}`}>{a.rotulo}</span>
              <span className={`block truncate text-xs ${s.tom === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-foreground/75"}`}>{s.texto}{s.travada && s.detalhe ? <span className="sr-only">: {s.detalhe}</span> : null}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Faixa de abas de uma fase (segundo nível): as abas da fase, numeradas pela fase (1.1, 1.2…; o número vem de numeroDaAba), e, à direita,
 * as áreas comuns sem número (Tabela, Visão geral, Impacto no SPED e Versões), que mostram o projeto inteiro: botões lado a lado no padrão
 * dos botões de filtro (relevo, cantos retos; a aberta em verde cheio, as outras com contorno verde), na mesma faixa de abas. Setas do
 * teclado percorrem a faixa toda.
 */
export const classeAreaComum = (ativa) => `${classeBotaoFiltro(ativa)} !rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`;
export default function Abas({ fase, atual, aoMudar }) {
  const lista = abasDaArea(fase);
  const ids = lista.map((a) => a.id);
  const daFase = lista.filter((a) => !ABAS_COMUNS.some((c) => c.id === a.id));
  const comum = (a) => (
    <button key={a.id} type="button" role="tab" id={`san-aba-${a.id}`} aria-selected={atual === a.id} aria-controls="san-painel" tabIndex={atual === a.id ? 0 : -1}
      onClick={() => aoMudar(a.id)} onKeyDown={aoTeclar(ids, atual, aoMudar, "san-aba-")} data-area-comum="" className={classeAreaComum(atual === a.id)}>
      {a.rotulo}
    </button>
  );
  const botao = (a) => (
    <button key={a.id} type="button" role="tab" id={`san-aba-${a.id}`} aria-selected={atual === a.id} aria-controls="san-painel" tabIndex={atual === a.id ? 0 : -1}
      onClick={() => aoMudar(a.id)} onKeyDown={aoTeclar(ids, atual, aoMudar, "san-aba-")}
      className={`-mb-px border-b-2 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${atual === a.id ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
      {a.numero && <><span className="tabular-nums">{a.numero}</span>{" "}</>}{a.rotulo}
    </button>
  );
  return (
    <div role="tablist" aria-label="Etapas da fase e áreas do projeto" className="flex flex-wrap items-end gap-1 border-b border-border">
      {daFase.map(botao)}
      <span className="mb-1 ml-auto flex flex-wrap items-center gap-1.5" role="presentation">
        {ABAS_COMUNS.map(comum)}
      </span>
    </div>
  );
}
