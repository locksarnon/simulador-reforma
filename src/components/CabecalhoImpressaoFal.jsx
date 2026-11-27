import { URL_LOGO_FAL } from "@/lib/marcaFal";

/**
 * Logo da FAL no topo de toda impressão (Ctrl+P, "Imprimir", "Salvar em PDF" do navegador). Invisível na tela; aparece só no papel.
 * Fica no App (vale para todas as telas); telas que imprimem só um pedaço da página (ex.: Roteiro do projeto) põem uma cópia no pedaço impresso.
 */
export default function CabecalhoImpressaoFal({ className = "" }) {
  return (
    <div className={`cabecalho-impressao-fal hidden print:mb-4 print:block ${className}`} data-testid="cabecalho-impressao-fal">
      <img src={URL_LOGO_FAL} alt="FAL Agro" style={{ height: "14mm", width: "auto" }} />
    </div>
  );
}
