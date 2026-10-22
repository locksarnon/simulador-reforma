import React from "react";

/**
 * Título padrão de página: ícone + título (sempre text-xl) + ajuda opcional (InfoTooltip).
 * Todas as telas usam este bloco para o título ter o mesmo tamanho, ícone e espaçamento em qualquer lugar do sistema.
 * O subtítulo continua sendo um <p className="text-sm text-muted-foreground"> logo abaixo.
 */
export default function TituloPagina({ icon: Icon, ajuda, children }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="w-5 h-5 text-muted-foreground" aria-hidden="true" />}
      <h1 className="text-xl font-heading font-semibold">{children}</h1>
      {ajuda}
    </div>
  );
}
