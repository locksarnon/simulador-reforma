import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { areaPorId, caminhoDaArea, moduloDoCaminho } from "@/lib/navegacao";
import { ArrowLeft } from "lucide-react";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/**
 * Cabeçalho padrão de navegação — breadcrumb (hierarquia) + botão "Voltar"
 * (histórico do navegador). As duas formas de voltar pedidas pelo usuário:
 * "seja por link, seja por botão de voltar a tela anterior".
 *
* @param crumbs [{ label, to? }] — o último item sem `to` vira a página atual.
 */

/**
 * A raiz antiga "DataHub" (nome técnico) vira "Início > área da tela", tirada do catálogo do menu pelo endereço aberto.
 * Assim toda tela mostra o mesmo caminho do menu, mesmo as que ainda montam o breadcrumb à moda antiga.
 */
export function normalizarCrumbs(crumbs, pathname) {
  if (!crumbs.length || crumbs[0].label !== "DataHub") return crumbs;
  const area = areaPorId(moduloDoCaminho(pathname)?.area);
  const raiz = [{ label: "Início", to: "/inicio" }];
  if (area && area.id !== "inicio") raiz.push({ label: area.titulo, to: caminhoDaArea(area.id) });
  return [...raiz, ...crumbs.slice(1)];
}
export default function PageHeader({ crumbs: crumbsBrutos = [], title, subtitle, actions }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const crumbs = normalizarCrumbs(crumbsBrutos, pathname);

  return (
    <div className="border-b border-border bg-card px-6 lg:px-8 py-4">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar
          </button>
          {crumbs.length > 0 && (
            <>
              <span className="text-border shrink-0">·</span>
              <div className="min-w-0 flex-1 overflow-x-auto">
                <Breadcrumb>
                  <BreadcrumbList className="flex-nowrap">
                    {crumbs.map((c, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <BreadcrumbSeparator />}
                        <BreadcrumbItem>
                          {c.to ? (
                            <BreadcrumbLink asChild>
                              <Link to={c.to} className="whitespace-nowrap">{c.label}</Link>
                            </BreadcrumbLink>
                          ) : (
                            <BreadcrumbPage className="whitespace-nowrap">{c.label}</BreadcrumbPage>
                          )}
                        </BreadcrumbItem>
                      </React.Fragment>
                    ))}
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </>
          )}
        </div>
        {(title || actions) && (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              {title && <h1 className="text-xl font-heading font-semibold">{title}</h1>}
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
