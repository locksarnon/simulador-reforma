import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/lib/AuthContext";
import { areasDoMenu, caminhoDaArea, MODULOS, SITUACAO, situacaoDoModulo } from "@/lib/navegacao";
import { CartaoDoModulo } from "@/pages/AreaPagina";
import ResumoDoDia from "@/components/inicio/ResumoDoDia";
import PrimeirosPassos from "@/components/inicio/PrimeirosPassos";

const CHAVE_RECENTES = "intax-modulos-recentes";
const ATALHOS = ["grupos-empresas", "captura-xml", "tarefas", "agenda-geral", "propostas", "base-legal"];

function lerRecentes() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || "[]");
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function saudacao(hora) {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Início: ponto de partida do InTAX. Mostra o que a pessoa abriu por último, os atalhos do dia a dia e as áreas do sistema.
 * Os cartões de tarefas, avisos e da carteira entram aqui conforme os módulos ficam prontos (docs/estrutura-de-telas.md).
 */
export default function InicioPagina({ agora = new Date() }) {
  const { user } = useAuth();
  const areas = areasDoMenu(user).filter((a) => a.id !== "inicio");
  const visiveis = useMemo(() => new Set(areas.flatMap((a) => a.modulos.map((m) => m.id))), [areas]);
  const recentes = lerRecentes().map((id) => MODULOS.find((m) => m.id === id)).filter((m) => m && visiveis.has(m.id)).slice(0, 4);
  const atalhos = ATALHOS.map((id) => MODULOS.find((m) => m.id === id)).filter((m) => m && visiveis.has(m.id));
  const primeiroNome = (user?.name || user?.email || "").split(/[ @]/)[0];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início" }]}
        title={`${saudacao(agora.getHours())}${primeiroNome ? `, ${primeiroNome}` : ""}`}
        actions={<Link to="/cockpit" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"><LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Painel executivo</Link>}
      />
      <div className="px-6 lg:px-8 py-6 space-y-8">
        <PrimeirosPassos usuarioId={user?.id} />
        <ResumoDoDia />

        {recentes.length > 0 && (
          <section aria-labelledby="titulo-recentes">
            <h2 id="titulo-recentes" className="mb-3 font-heading text-sm font-semibold">Continue de onde parou</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {recentes.map((m) => <CartaoDoModulo key={m.id} modulo={m} />)}
            </div>
          </section>
        )}

        <section aria-labelledby="titulo-atalhos">
          <h2 id="titulo-atalhos" className="mb-3 font-heading text-sm font-semibold">Atalhos do dia a dia</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {atalhos.map((m) => <CartaoDoModulo key={m.id} modulo={m} />)}
          </div>
        </section>

        <section aria-labelledby="titulo-areas">
          <h2 id="titulo-areas" className="mb-3 font-heading text-sm font-semibold">Áreas do InTAX</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {areas.map((a) => (
              <div key={a.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-heading text-sm font-semibold">
                    <a.icone className="h-4 w-4 text-primary" aria-hidden="true" /> {a.titulo}
                  </h3>
                  <Link to={caminhoDaArea(a.id)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" aria-label={`Ver todos os módulos de ${a.titulo}`}>
                    Ver tudo <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.descricao}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {a.modulos.slice(0, 4).map((m) => (
                    <li key={m.id}>
                      {m.externo
                        ? <a href={m.to} target="_blank" rel="noreferrer" className="text-foreground hover:text-primary hover:underline">{m.titulo}</a>
                        : <Link to={m.to} className="text-foreground hover:text-primary hover:underline">{m.titulo}</Link>}
                      {situacaoDoModulo(m) === SITUACAO.EM_BREVE && <span className="ml-2 text-[10px] uppercase text-muted-foreground">Em breve</span>}
                      {situacaoDoModulo(m) === SITUACAO.BETA && <span className="ml-2 text-[10px] uppercase text-primary">Beta</span>}
                    </li>
                  ))}
                  {a.modulos.length > 4 && <li className="text-xs text-muted-foreground">e mais {a.modulos.length - 4}</li>}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
