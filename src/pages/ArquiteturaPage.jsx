import React, { useState } from "react";
import {
  Database, Server, Layout as LayoutIcon, Webhook, Boxes, Plug, FileText, Search, BookOpen,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import InfoTooltip from "@/components/InfoTooltip";
import {
  ARQUITETURA_RESUMO, ENTIDADES, BACKEND_FUNCTIONS, FRONTEND_PAGES,
  HOOKS, SHARED_MODULES, INTEGRATIONS, ORIENTACOES, COMPONENTES_AUXILIARES,
} from "@/components/arquitetura/arquiteturaData";

export default function ArquiteturaPage() {
  const [busca, setBusca] = useState("");

  return (
    <div className="p-6 lg:p-8 max-w-screen-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-heading font-semibold">Arquitetura & Correlações Front↔Back</h1>
          <InfoTooltip text="Documentação técnica interna para o time de desenvolvimento. Mapeia todas as entidades, backend functions, páginas, hooks e módulos shared." />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Simulador FAL v{ARQUITETURA_RESUMO.versao} — atualizado em {ARQUITETURA_RESUMO.dataBase}
        </p>
      </div>

      {/* Resumo */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Boxes className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-heading font-medium text-sm">Stack Técnica</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Linha label="Frontend" value={ARQUITETURA_RESUMO.stack} />
          <Linha label="Backend" value={ARQUITETURA_RESUMO.backend} />
          <Linha label="Auth" value={ARQUITETURA_RESUMO.auth} />
          <Linha label="Realtime" value={ARQUITETURA_RESUMO.realtime} />
        </div>
      </div>

      <Tabs defaultValue="entidades" className="w-full">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-2">
          <TabsList className="grid w-full sm:w-auto grid-cols-3 sm:grid-cols-6 lg:flex">
            <TabsTrigger value="entidades" className="gap-1.5 text-xs"><Database className="w-3.5 h-3.5" /> Entidades</TabsTrigger>
            <TabsTrigger value="backend" className="gap-1.5 text-xs"><Server className="w-3.5 h-3.5" /> Backend</TabsTrigger>
            <TabsTrigger value="pages" className="gap-1.5 text-xs"><LayoutIcon className="w-3.5 h-3.5" /> Páginas</TabsTrigger>
            <TabsTrigger value="hooks" className="gap-1.5 text-xs"><Webhook className="w-3.5 h-3.5" /> Hooks</TabsTrigger>
            <TabsTrigger value="shared" className="gap-1.5 text-xs"><Boxes className="w-3.5 h-3.5" /> Shared</TabsTrigger>
            <TabsTrigger value="outros" className="gap-1.5 text-xs"><Plug className="w-3.5 h-3.5" /> Outros</TabsTrigger>
          </TabsList>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na documentação..." className="pl-8 w-full sm:w-64" />
          </div>
        </div>

        <TabsContent value="entidades"><EntidadesTab busca={busca} /></TabsContent>
        <TabsContent value="backend"><BackendTab busca={busca} /></TabsContent>
        <TabsContent value="pages"><PagesTab busca={busca} /></TabsContent>
        <TabsContent value="hooks"><HooksTab busca={busca} /></TabsContent>
        <TabsContent value="shared"><SharedTab busca={busca} /></TabsContent>
        <TabsContent value="outros"><OutrosTab busca={busca} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Linha({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0 font-medium">{label}:</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function Card({ children, className = "" }) {
  return <div className={`rounded-lg border border-border bg-card p-4 ${className}`}>{children}</div>;
}

function CodeBlock({ lines }) {
  return (
    <pre className="text-xs font-mono bg-muted/50 rounded-md p-3 overflow-x-auto leading-relaxed">
      {lines.map((l, i) => <div key={i} className={l.startsWith("//") ? "text-muted-foreground" : ""}>{l}</div>)}
    </pre>
  );
}

function matchBusca(text, q) {
  if (!q) return true;
  return text.toLowerCase().includes(q.toLowerCase());
}

// === ENTIDADES ===
function EntidadesTab({ busca }) {
  const filtered = ENTIDADES.filter((e) =>
    matchBusca(e.nome + e.descricao + e.campos.join(" ") + e.usadoPor.join(" "), busca)
  );
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{ENTIDADES.length} entidades no schema — {filtered.length} exibidas</p>
      {filtered.map((e) => (
        <Card key={e.nome}>
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="font-heading font-semibold text-sm">{e.nome}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{e.descricao}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Arquivo</p>
              <p className="text-xs font-mono">{e.arquivo}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Campos ({e.campos.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {e.campos.map((c) => (
                  <span key={c} className="text-xs px-2 py-0.5 rounded bg-muted/60 font-mono">{c}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Usado por</p>
              <div className="flex flex-wrap gap-1.5">
                {e.usadoPor.map((u) => (
                  <span key={u} className="text-xs px-2 py-0.5 rounded bg-primary/8 text-primary border border-primary/15">{u}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">SDK Methods</p>
            <CodeBlock lines={e.sdk} />
          </div>
        </Card>
      ))}
    </div>
  );
}

// === BACKEND ===
function BackendTab({ busca }) {
  const filtered = BACKEND_FUNCTIONS.filter((f) => matchBusca(f.nome + f.descricao, busca));
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{BACKEND_FUNCTIONS.length} backend functions — {filtered.length} exibidas</p>
      {filtered.map((f) => (
        <Card key={f.nome}>
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="font-heading font-semibold text-sm font-mono">{f.nome}()</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{f.descricao}</p>
            </div>
            <p className="text-xs font-mono text-muted-foreground shrink-0">{f.arquivo}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Input</p>
              <CodeBlock lines={Object.entries(f.input).map(([k, v]) => `${k}: ${v}`)} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Output</p>
              <CodeBlock lines={Object.entries(f.output).map(([k, v]) => `// ${k}\n${JSON.stringify(v, null, 0)}`)} />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Fluxo</p>
            <div className="space-y-1">
              {f.fluxo.map((step, i) => (
                <div key={i} className="text-xs flex gap-2">
                  <span className="text-muted-foreground font-mono shrink-0">{step}</span>
                </div>
              ))}
            </div>
          </div>
          {f.processamentoAssincrono && (
            <div className="mt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Processamento Assíncrono (waitUntil)</p>
              <div className="space-y-1">
                {f.processamentoAssincrono.map((step, i) => (
                  <div key={i} className="text-xs text-muted-foreground font-mono">{step}</div>
                ))}
              </div>
            </div>
          )}
          {f.validacoes && (
            <div className="mt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Validações (4 camadas)</p>
              <div className="space-y-1">
                {f.validacoes.map((v, i) => (
                  <div key={i} className="text-xs text-muted-foreground">{v}</div>
                ))}
              </div>
            </div>
          )}
          {f.mapeamento && (
            <div className="mt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Mapeamento Item → Operação</p>
              <p className="text-xs text-muted-foreground font-mono">{f.mapeamento}</p>
            </div>
          )}
          {f.shared && (
            <div className="mt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Shared Modules</p>
              <div className="flex flex-wrap gap-1.5">
                {f.shared.map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded bg-chart-2/10 text-chart-2 border border-chart-2/15 font-mono">{s}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// === PÁGINAS ===
function PagesTab({ busca }) {
  const filtered = FRONTEND_PAGES.filter((p) =>
    matchBusca(p.rota + p.componente + p.descricao + (p.entidades || []).join(" "), busca)
  );
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{FRONTEND_PAGES.length} páginas/rotas — {filtered.length} exibidas</p>
      {filtered.map((p) => (
        <Card key={p.rota}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs font-mono px-2 py-0.5 rounded bg-primary/8 text-primary border border-primary/15">{p.rota}</code>
                <span className="font-heading font-medium text-sm">{p.componente}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{p.descricao}</p>
            </div>
            <p className="text-xs font-mono text-muted-foreground shrink-0 hidden sm:block">{p.arquivo}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.entidades?.map((e) => (
              <span key={e} className="text-xs px-2 py-0.5 rounded bg-muted/60 font-mono">{e}</span>
            ))}
            {p.hooks?.map((h) => (
              <span key={h} className="text-xs px-2 py-0.5 rounded bg-chart-3/10 text-foreground border border-chart-3/20 font-mono">{h}</span>
            ))}
            {p.shared?.map((s) => (
              <span key={s} className="text-xs px-2 py-0.5 rounded bg-chart-2/10 text-chart-2 border border-chart-2/15 font-mono">{s}</span>
            ))}
            {p.backend?.map((b) => (
              <span key={b} className="text-xs px-2 py-0.5 rounded bg-destructive/8 text-destructive border border-destructive/15 font-mono">{b}()</span>
            ))}
            {p.integrations?.map((i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded bg-chart-4/10 text-foreground border border-chart-4/20 font-mono">{i}</span>
            ))}
            {p.componentes?.map((c) => (
              <span key={c} className="text-xs px-2 py-0.5 rounded bg-chart-5/10 text-foreground border border-chart-5/20">{c}</span>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// === HOOKS ===
function HooksTab({ busca }) {
  const filtered = HOOKS.filter((h) => matchBusca(h.nome + h.descricao, busca));
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{HOOKS.length} hooks — {filtered.length} exibidos</p>
      {filtered.map((h) => (
        <Card key={h.nome}>
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="font-heading font-semibold text-sm font-mono">{h.nome}()</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{h.descricao}</p>
            </div>
            <p className="text-xs font-mono text-muted-foreground shrink-0">{h.arquivo}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {h.estado && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Estado Interno</p>
                <div className="flex flex-wrap gap-1.5">
                  {h.estado.map((s) => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded bg-muted/60 font-mono">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {h.acoes && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Ações</p>
                <div className="space-y-1">
                  {h.acoes.map((a, i) => <div key={i} className="text-xs text-muted-foreground font-mono">{a}</div>)}
                </div>
              </div>
            )}
          </div>
          <div className="mt-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Queries (TanStack)</p>
            <CodeBlock lines={h.queries.map((q) => `// key: ${q.key}${q.poll ? ` [poll: ${q.poll}]` : ""}${q.enabled ? ` [enabled: ${q.enabled}]` : ""}\n${q.fn}`)} />
          </div>
          {h.transformacoes && (
            <div className="mt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Transformações em Memória</p>
              <CodeBlock lines={h.transformacoes} />
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {h.retorna && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Retorna</p>
                <div className="flex flex-wrap gap-1.5">
                  {h.retorna.map((r) => (
                    <span key={r} className="text-xs px-2 py-0.5 rounded bg-primary/8 text-primary border border-primary/15 font-mono">{r}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              {h.shared && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Shared</p>
                  <div className="flex flex-wrap gap-1.5">
                    {h.shared.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded bg-chart-2/10 text-chart-2 border border-chart-2/15 font-mono">{s}</span>)}
                  </div>
                </div>
              )}
              {h.backend && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Backend Functions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {h.backend.map((b) => <span key={b} className="text-xs px-2 py-0.5 rounded bg-destructive/8 text-destructive border border-destructive/15 font-mono">{b}()</span>)}
                  </div>
                </div>
              )}
              {h.integrations && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Integrations</p>
                  <div className="flex flex-wrap gap-1.5">
                    {h.integrations.map((i) => <span key={i} className="text-xs px-2 py-0.5 rounded bg-chart-4/10 text-foreground border border-chart-4/20 font-mono">{i}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// === SHARED ===
function SharedTab({ busca }) {
  const filtered = SHARED_MODULES.filter((m) => matchBusca(m.nome + m.descricao, busca));
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{SHARED_MODULES.length} módulos shared — {filtered.length} exibidos</p>
      {filtered.map((m) => (
        <Card key={m.nome}>
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="font-heading font-semibold text-sm font-mono">{m.nome}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{m.descricao}</p>
            </div>
            <p className="text-xs font-mono text-muted-foreground shrink-0">{m.arquivo}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Funções Exportadas</p>
            <div className="space-y-2">
              {m.funcoes.map((f) => (
                <div key={f.nome} className="rounded-md bg-muted/40 p-2.5">
                  <p className="text-xs font-mono font-medium text-foreground">{f.nome}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.descricao}</p>
                  <p className="text-xs text-chart-2 mt-1">→ {f.retorna}</p>
                </div>
              ))}
            </div>
          </div>
          {m.constantes && (
            <div className="mt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Constantes</p>
              <CodeBlock lines={m.constantes} />
            </div>
          )}
          <div className="mt-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Usado por</p>
            <div className="flex flex-wrap gap-1.5">
              {m.usadoPor.map((u) => (
                <span key={u} className="text-xs px-2 py-0.5 rounded bg-primary/8 text-primary border border-primary/15">{u}</span>
              ))}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// === OUTROS ===
function OutrosTab({ busca }) {
  return (
    <div className="space-y-4">
      {/* Integrações */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Plug className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-heading font-medium text-sm">Integrações Core</h3>
        </div>
        <div className="space-y-2">
          {INTEGRATIONS.filter((i) => matchBusca(i.nome + i.descricao, busca)).map((i) => (
            <div key={i.nome} className="flex flex-col sm:flex-row gap-1 sm:gap-3 text-sm py-1.5 border-b border-border/40 last:border-0">
              <code className="text-xs font-mono px-2 py-0.5 rounded bg-chart-4/10 border border-chart-4/20 shrink-0 w-fit">{i.nome}</code>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{i.descricao}</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">Usado por: {i.usadoPor.join(", ")}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Orientações */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-heading font-medium text-sm">Dicionário de Orientações</h3>
        </div>
        <div className="space-y-2 text-sm">
          <Linha label="Arquivo" value={ORIENTACOES.arquivo} />
          <Linha label="Descrição" value={ORIENTACOES.descricao} />
          <Linha label="Consumo" value={ORIENTACOES.consumo} />
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 mt-2">Páginas com orientações</p>
            <div className="flex flex-wrap gap-1.5">
              {ORIENTACOES.paginas.map((p) => (
                <span key={p} className="text-xs px-2 py-0.5 rounded bg-muted/60 font-mono">{p}</span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Componentes auxiliares */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-heading font-medium text-sm">Componentes Auxiliares</h3>
        </div>
        <div className="space-y-2">
          {COMPONENTES_AUXILIARES.filter((c) => matchBusca(c.nome + c.descricao, busca)).map((c) => (
            <div key={c.nome} className="flex flex-col sm:flex-row gap-1 sm:gap-3 text-sm py-1.5 border-b border-border/40 last:border-0">
              <code className="text-xs font-mono font-medium shrink-0 w-fit">{c.nome}</code>
              <p className="text-xs text-muted-foreground flex-1">{c.descricao}</p>
              <p className="text-xs font-mono text-muted-foreground/60 shrink-0 hidden sm:block">{c.arquivo}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}