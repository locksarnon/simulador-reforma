import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, X } from "lucide-react";

export const PASSOS = [
  { id: "carteira", titulo: "Marque quem é do BPO e quem tem diagnóstico", texto: "Em Serviços contratados, defina a carteira de cada empresa.", to: "/clientes/servicos-contratados" },
  { id: "colaboradores", titulo: "Distribua as empresas entre a equipe", texto: "Em Carteira e colaboradores, diga quem atende cada empresa.", to: "/clientes/carteira" },
  { id: "etiquetas", titulo: "Crie etiquetas para achar clientes rápido", texto: "Agro, Prioridade, Lucro presumido… e salve listas de filtros.", to: "/clientes/tags" },
  { id: "processos", titulo: "Cadastre as rotinas que se repetem", texto: "Os processos recorrentes viram tarefas sozinhos, 10 dias antes do prazo.", to: "/bpo/tarefas" },
  { id: "agenda", titulo: "Veja as obrigações do mês", texto: "A agenda mostra as obrigações federais com a fonte oficial de cada prazo.", to: "/bpo/agenda" },
  { id: "foco", titulo: "Use a empresa em foco e o sino", texto: "No topo: escolha a empresa em foco e acompanhe os avisos no sino.", to: "/notificacoes" },
];

const chave = (usuarioId) => `intax-primeiros-passos-${usuarioId || "anonimo"}`;
function ler(usuarioId) {
  try { return JSON.parse(localStorage.getItem(chave(usuarioId)) || "null") || { feitos: [], fechado: false }; } catch { return { feitos: [], fechado: false }; }
}

/** Guia da primeira visita: os primeiros passos no InTAX, que a pessoa marca como feitos ou fecha. Fica guardado neste navegador. */
export default function PrimeirosPassos({ usuarioId }) {
  const [estado, setEstado] = useState(() => ler(usuarioId));
  const gravar = (novo) => { setEstado(novo); try { localStorage.setItem(chave(usuarioId), JSON.stringify(novo)); } catch { /* sem armazenamento */ } };
  if (estado.fechado) return null;
  const feitos = estado.feitos.length;
  const alternar = (id) => gravar({ ...estado, feitos: estado.feitos.includes(id) ? estado.feitos.filter((x) => x !== id) : [...estado.feitos, id] });
  return (
    <section className="rounded-xl border border-primary/30 bg-card p-4" aria-labelledby="titulo-primeiros-passos">
      <div className="mb-2 flex items-center gap-2">
        <h2 id="titulo-primeiros-passos" className="font-heading text-sm font-semibold">Primeiros passos no InTAX</h2>
        <span className="text-xs text-muted-foreground">{feitos} de {PASSOS.length}</span>
        <button type="button" onClick={() => gravar({ ...estado, fechado: true })} className="ml-auto inline-flex items-center gap-1 rounded p-1 text-xs text-muted-foreground hover:bg-muted" aria-label="Fechar os primeiros passos"><X className="h-3.5 w-3.5" aria-hidden="true" /> Fechar</button>
      </div>
      <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {PASSOS.map((p) => {
          const feito = estado.feitos.includes(p.id);
          return (
            <li key={p.id} className="flex items-start gap-2 rounded-md border border-border p-2.5">
              <button type="button" onClick={() => alternar(p.id)} aria-pressed={feito} aria-label={feito ? `Desmarcar: ${p.titulo}` : `Marcar como feito: ${p.titulo}`} className="mt-0.5 text-primary">{feito ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}</button>
              <div className="text-sm"><Link to={p.to} className={`font-medium hover:text-primary hover:underline ${feito ? "text-muted-foreground line-through" : ""}`}>{p.titulo}</Link><p className="text-xs text-muted-foreground">{p.texto}</p></div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
