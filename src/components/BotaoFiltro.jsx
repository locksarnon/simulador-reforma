/**
 * Botão de filtro / alternância (filtros rápidos, segmentos, opções): mesmo relevo dos botões do sistema (`botao-acao`),
 * cantos levemente arredondados (nunca pílula). Ativo = verde cheio com texto branco; inativo = fundo da tela com contorno
 * verde. `aria-pressed` diz o estado; a contagem fica dentro do botão.
 */
export function classeBotaoFiltro(ativo, tamanho = "sm") {
  const medida = tamanho === "xs" ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm";
  return `botao-acao botao-filtro inline-flex items-center justify-center gap-1.5 rounded-md ${medida} ${ativo ? "bg-primary font-medium text-primary-foreground" : "bg-background text-foreground hover:bg-muted"}`;
}

export default function BotaoFiltro({ ativo = false, contagem, tamanho, className = "", children, ...props }) {
  return (
    <button type="button" aria-pressed={!!ativo} className={`${classeBotaoFiltro(ativo, tamanho)} ${className}`} {...props}>
      {children}
      {contagem !== undefined && contagem !== null && <span className="tabular-nums opacity-80">{contagem}</span>}
    </button>
  );
}
