import { useMemo, useSyncExternalStore } from "react";
import { CENARIO_PADRAO_ID, normalizarSelecao, resolverTransicao } from "@/motor/cenariosAliquota";

/**
 * Guarda a escolha do cenário de alíquotas 2029–2033 neste navegador. É uma preferência de quem
 * está olhando (como o tema), não um dado da empresa: o administrador não precisa publicar nada e
 * cada pessoa vê o cenário que escolheu em todas as telas (Painel, Calculadora, Transição, PDF).
 */
const CHAVE = "intax.cenarioAliquotas.v1";
const PADRAO = Object.freeze({ id: CENARIO_PADRAO_ID, cbs: null, ibs: null });

function lerInicial() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) || "null");
    return bruto ? normalizarSelecao(bruto) : PADRAO;
  } catch {
    return PADRAO; // sem storage (janela privada, bloqueio): usa o padrão
  }
}

let estado = lerInicial();
const ouvintes = new Set();

/** A escolha atual, para quem não está dentro de um componente React (e para os testes). */
export const obterCenarioAliquotas = () => estado;

export function definirCenarioAliquotas(proximo) {
  estado = normalizarSelecao({ ...estado, ...proximo });
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* sem storage */ }
  ouvintes.forEach((f) => f());
}

function assinar(aoMudar) {
  ouvintes.add(aoMudar);
  // Outra aba mudou o cenário: acompanha.
  const aoMudarEmOutraAba = (e) => {
    if (e.key !== CHAVE) return;
    estado = lerInicial();
    aoMudar();
  };
  window.addEventListener("storage", aoMudarEmOutraAba);
  return () => {
    ouvintes.delete(aoMudar);
    window.removeEventListener("storage", aoMudarEmOutraAba);
  };
}

/** [selecao, definir] — a escolha atual ({ id, cbs, ibs }) e a função para trocá-la. */
export function useSelecaoCenarioAliquotas() {
  const selecao = useSyncExternalStore(assinar, () => estado, () => PADRAO);
  return [selecao, definirCenarioAliquotas];
}

/**
 * Aplica o cenário escolhido às linhas de TransicaoAno.
 * @returns { linhas, resumo, selecao } — `linhas` tem o mesmo formato da tabela; `resumo` descreve o cenário.
 */
export function useTransicaoComCenario(linhas) {
  const [selecao] = useSelecaoCenarioAliquotas();
  return useMemo(() => ({ ...resolverTransicao(linhas, selecao), selecao }), [linhas, selecao]);
}
