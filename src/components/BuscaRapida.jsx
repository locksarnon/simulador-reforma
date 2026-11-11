import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { areaPorId, buscarModulos, MODULOS, SITUACAO, situacaoDoModulo } from "@/lib/navegacao";

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soDigitos = (s) => String(s || "").replace(/\D/g, "");

/** Empresas que casam com o texto (nome, código ou CNPJ, sem ligar para acento, pontuação ou maiúscula). */
export function buscarEmpresas(empresas, termo, limite = 6) {
  const t = semAcento(termo).trim();
  if (!t) return [];
  const digitos = soDigitos(termo);
  return (empresas || [])
    .filter((e) => semAcento(e.razao_social).includes(t) || semAcento(e.id_empresa).includes(t) || (digitos.length >= 3 && soDigitos(e.cnpj_cpf).includes(digitos)))
    .slice(0, limite);
}

/**
 * Busca rápida (Ctrl+K ou ⌘K): módulos do catálogo e empresas. Sem texto, mostra os módulos que a pessoa abriu por último
 * e os atalhos principais; com texto, a lista é filtrada aqui (sem acento), não pelo componente.
 */
export default function BuscaRapida({ aberta, aoMudar, recentes = [] }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [texto, setTexto] = useState("");
  const { data: empresas } = useQuery({ queryKey: ["empresas", "busca-rapida"], queryFn: () => api.entities.Empresa.list(), enabled: aberta, staleTime: 60_000 });
  const { data: grupos } = useQuery({ queryKey: ["grupos"], queryFn: () => api.entities.Grupo.list(), enabled: aberta, staleTime: 60_000 });

  const modulos = useMemo(() => {
    if (texto.trim()) return buscarModulos(texto, user, 8);
    const recentesVisiveis = recentes.map((id) => MODULOS.find((m) => m.id === id)).filter(Boolean);
    return recentesVisiveis.length ? recentesVisiveis.slice(0, 6) : MODULOS.filter((m) => ["inicio", "grupos-empresas", "captura-xml", "tarefas", "agenda-geral", "manual"].includes(m.id));
  }, [texto, user, recentes]);
  const achadas = useMemo(() => buscarEmpresas(empresas, texto), [empresas, texto]);

  const ir = (to, externo) => {
    aoMudar(false);
    setTexto("");
    if (externo) window.open(to, "_blank", "noopener");
    else navigate(to);
  };
  const caminhoDaEmpresa = (e) => {
    const grupo = (grupos || []).find((g) => g.numero === e.grupo);
    return grupo ? `/workroom/${grupo.id}/empresas/${e.id}` : `/bpo/repositorio-xml/${e.id}`;
  };

  return (
    <Dialog open={aberta} onOpenChange={(v) => { aoMudar(v); if (!v) setTexto(""); }}>
      <DialogContent className="overflow-hidden p-0">
        <DialogTitle className="sr-only">Busca rápida</DialogTitle>
        <DialogDescription className="sr-only">Digite para achar um módulo ou uma empresa</DialogDescription>
        {/* O filtro é nosso (sem acento, por CNPJ): o do cmdk esconderia as empresas, que não têm o texto no value. */}
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5">
      <CommandInput placeholder="Buscar módulo ou empresa…" value={texto} onValueChange={setTexto} aria-label="Buscar módulo ou empresa" />
      <CommandList>
        <CommandEmpty>Nada encontrado para “{texto}”. Tente o nome do módulo, o nome da empresa ou o CNPJ.</CommandEmpty>
        {modulos.length > 0 && (
          <CommandGroup heading={texto.trim() ? "Módulos" : "Abertos há pouco e atalhos"}>
            {modulos.map((m) => (
              <CommandItem key={m.id} value={`modulo-${m.id}`} onSelect={() => ir(m.to, m.externo)}>
                <m.icone className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span>{m.titulo}</span>
                <span className="ml-2 text-xs text-muted-foreground">{areaPorId(m.area)?.titulo}</span>
                {situacaoDoModulo(m) === SITUACAO.EM_BREVE && <span className="ml-auto text-[10px] uppercase text-muted-foreground">Em breve</span>}
                {situacaoDoModulo(m) === SITUACAO.BETA && <span className="ml-auto text-[10px] uppercase text-primary">Beta</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {achadas.length > 0 && (
          <CommandGroup heading="Empresas">
            {achadas.map((e) => (
              <CommandItem key={e.id} value={`empresa-${e.id}`} onSelect={() => ir(caminhoDaEmpresa(e))}>
                <Building2 className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{e.razao_social}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{e.cnpj_cpf || e.id_empresa}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">↑ ↓ para escolher, Enter para abrir, Esc para fechar.</p>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
