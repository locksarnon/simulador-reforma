import { useCallback, useEffect, useRef, useState } from "react";

const PREFIXO = "intax_rascunho:";
const IGUAL = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function ler(chave) {
  try { return JSON.parse(localStorage.getItem(PREFIXO + chave) || "null"); } catch { return null; }
}

/**
 * Rascunho automático de um formulário, guardado neste navegador (nunca grava cadastro pela metade no servidor).
 * - Salva ~1 s depois da última alteração, só se o formulário mudou em relação ao valor inicial.
 * - Ao abrir de novo, oferece "Restaurar" ou "Descartar" (não aplica sozinho).
 * - `limpar()` depois de salvar de verdade ou de cancelar.
 *
 * @param chave  identifica o formulário (ex.: "empresa:nova", "operacao:<id>")
 * @param valor  estado atual do formulário
 * @param ativo  false enquanto o formulário está fechado
 */
export function useRascunho(chave, valor, ativo = true) {
  const inicial = useRef(valor);
  const [pendente, setPendente] = useState(null); // { valor, em } encontrado ao abrir
  const [salvoEm, setSalvoEm] = useState(null);

  // ao (re)abrir: guarda o valor inicial e procura rascunho anterior
  useEffect(() => {
    if (!ativo) return;
    inicial.current = valor;
    const r = ler(chave);
    setPendente(r && r.valor && !IGUAL(r.valor, valor) ? r : null);
    setSalvoEm(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ativo]);

  // salva com atraso
  useEffect(() => {
    if (!ativo || pendente) return undefined;
    if (IGUAL(valor, inicial.current)) return undefined;
    const t = setTimeout(() => {
      try { const em = new Date().toISOString(); localStorage.setItem(PREFIXO + chave, JSON.stringify({ valor, em })); setSalvoEm(em); } catch { /* sem storage */ }
    }, 1000);
    return () => clearTimeout(t);
  }, [valor, chave, ativo, pendente]);

  const limpar = useCallback(() => {
    try { localStorage.removeItem(PREFIXO + chave); } catch { /* sem storage */ }
    setPendente(null);
    setSalvoEm(null);
  }, [chave]);

  const restaurar = useCallback((aplicar) => {
    if (pendente) aplicar(pendente.valor);
    setPendente(null);
  }, [pendente]);

  return { pendente, salvoEm, restaurar, descartar: limpar, limpar };
}
