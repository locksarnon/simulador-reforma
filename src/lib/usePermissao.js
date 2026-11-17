import { useAuth } from "@/lib/AuthContext";
import { semFuncao, temFuncao, temTela } from "@/lib/permissoes";

/** A conta logada pode usar a função? (ex.: usePermissao("consultas_pagas")). O servidor confere de novo a cada pedido. */
export function usePermissao(funcao) {
  const { user } = useAuth();
  return temFuncao(user, funcao);
}

/** Várias checagens na mesma tela: pode(funcao), tela(id) e o texto do aviso quando falta a função. */
export function usePermissoes() {
  const { user } = useAuth();
  return { pode: (funcao) => temFuncao(user, funcao), tela: (id) => temTela(user, id), motivo: semFuncao };
}
