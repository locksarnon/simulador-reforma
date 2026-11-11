import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "@/api/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORIAS, quandoFoi, seloDoSino } from "@/lib/notificacoes";

/** Uma linha de aviso (no sino e na central): ícone da categoria, título, mensagem e quando chegou; não lida fica em destaque. */
export function LinhaDeAviso({ n, aoAbrir }) {
  const cat = CATEGORIAS[n.tipo] || CATEGORIAS.SISTEMA;
  const Icone = cat.icone;
  return (
    <button type="button" onClick={() => aoAbrir(n)} className={`flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-muted/60 ${n.lida_em ? "" : "bg-primary/5"}`}>
      <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${n.lida_em ? "text-muted-foreground" : "text-primary"}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm leading-snug ${n.lida_em ? "" : "font-medium"}`}>{n.titulo}</span>
        {n.mensagem && <span className="block text-xs text-muted-foreground">{n.mensagem}</span>}
        <span className="block text-[11px] text-muted-foreground">{cat.rotulo} · {quandoFoi(n.createdAt)}</span>
      </span>
      {!n.lida_em && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Não lida" />}
    </button>
  );
}

/** O sino da barra superior: o número de avisos não lidos (confere a cada minuto) e os 8 mais recentes. */
export default function SinoNotificacoes() {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const contagem = useQuery({ queryKey: ["notificacoes", "contagem"], queryFn: () => api.get("/notificacoes/contagem"), refetchInterval: 60_000, refetchOnWindowFocus: true });
  const recentes = useQuery({ queryKey: ["notificacoes", "recentes"], queryFn: () => api.get("/notificacoes", { limite: 8 }), enabled: aberto });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["notificacoes"] });
  const lida = useMutation({ mutationFn: (id) => api.post(`/notificacoes/${id}/lida`, {}), onSuccess: recarregar });
  const todas = useMutation({ mutationFn: () => api.post("/notificacoes/lidas", {}), onSuccess: recarregar });
  const naoLidas = contagem.data?.nao_lidas ?? 0;

  const abrir = (n) => {
    if (!n.lida_em) lida.mutate(n.id);
    setAberto(false);
    if (n.link) navegar(n.link);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={naoLidas ? `Notificações: ${naoLidas} não lida(s)` : "Notificações"}>
          <Bell className="h-5 w-5" aria-hidden="true" />
          {naoLidas > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-[18px] text-destructive-foreground">{seloDoSino(naoLidas)}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Notificações</p>
          <button type="button" onClick={() => todas.mutate()} disabled={!naoLidas || todas.isPending} className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"><CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Marcar todas como lidas</button>
        </div>
        <div className="max-h-[380px] overflow-y-auto divide-y divide-border/60">
          {recentes.isLoading && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Carregando…</p>}
          {recentes.error && <p role="alert" className="px-3 py-6 text-center text-sm">Não foi possível carregar.</p>}
          {recentes.data && recentes.data.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação por enquanto.</p>}
          {(recentes.data || []).map((n) => <LinhaDeAviso key={n.id} n={n} aoAbrir={abrir} />)}
        </div>
        <div className="border-t border-border px-3 py-2 text-center">
          <Link to="/notificacoes" onClick={() => setAberto(false)} className="text-xs font-medium text-primary hover:underline">Ver todas as notificações</Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
