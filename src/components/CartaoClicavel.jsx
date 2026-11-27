import React from "react";
import { Link } from "react-router-dom";

/** A ação se estica sobre o cartão inteiro (o ::after cobre o cartão): clicar em qualquer ponto abre o destino. */
const CLASSE_ACAO = "inline-block text-sm text-primary group-hover:underline after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none";

/**
 * Cartão inteiro clicável (padrão de toda a ferramenta para cartão com uma ação só): título, detalhe e a ação, que pode ser um link
 * (`para`) ou um botão (`aoClicar`). Para o teclado e o leitor de tela continua sendo um link (ou botão) só, com o texto da ação;
 * o foco contorna o cartão inteiro. `desligado` tira a ação e o realce (ex.: enquanto outro formulário está aberto).
 */
export default function CartaoClicavel({ titulo, detalhe = null, acao, para = null, aoClicar = null, desligado = false }) {
  const ativo = !desligado && (para || aoClicar);
  return (
    <article className={`group relative space-y-2 rounded-lg border bg-card p-4 transition-colors ${ativo ? "hover:border-primary/50 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-primary/40" : ""}`}>
      <h3 className="font-semibold">{titulo}</h3>
      {detalhe && <p className="text-sm text-muted-foreground">{detalhe}</p>}
      {ativo && (para
        ? <Link to={para} className={CLASSE_ACAO}>{acao}</Link>
        : <button type="button" onClick={aoClicar} className={CLASSE_ACAO}>{acao}</button>)}
    </article>
  );
}
