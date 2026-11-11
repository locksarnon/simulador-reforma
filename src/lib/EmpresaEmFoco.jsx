import { createContext, useCallback, useContext, useMemo, useState } from "react";

const CHAVE = "intax-empresa-em-foco";
const Contexto = createContext({ empresaId: "", definir: () => {} });

function ler() {
  try { return localStorage.getItem(CHAVE) || ""; } catch { return ""; }
}

/**
 * Empresa em foco: a empresa escolhida no topo vale como filtro inicial das telas que trabalham por empresa (tarefas, agenda,
 * obrigações) e dá atalhos para ela. Fica guardada neste navegador.
 */
export function EmpresaEmFocoProvider({ children }) {
  const [empresaId, setEmpresaId] = useState(ler);
  const definir = useCallback((id) => {
    setEmpresaId(id || "");
    try { if (id) localStorage.setItem(CHAVE, id); else localStorage.removeItem(CHAVE); } catch { /* sem armazenamento: vale só nesta visita */ }
  }, []);
  const valor = useMemo(() => ({ empresaId, definir }), [empresaId, definir]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** A empresa em foco (id, ou "" quando não há) e a função para mudar. Fora do provedor, devolve "nenhuma". */
export const useEmpresaEmFoco = () => useContext(Contexto);
