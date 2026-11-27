import { AlertTriangle } from "lucide-react";

/**
 * Aviso discreto quando a atualização em segundo plano (ao voltar para a aba) falha mas a lista já estava carregada: a tabela
 * continua na tela com os dados anteriores. O erro de tela inteira fica só para quando não há dado nenhum.
 */
export default function AvisoFalhaAtualizar({ aoTentar, texto = "Não foi possível atualizar a lista agora; mostrando os dados já carregados." }) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-1.5 rounded-md border border-amber-400/60 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {texto}
      {aoTentar && <button type="button" onClick={aoTentar} className="font-medium underline-offset-2 hover:underline">Tentar de novo</button>}
    </p>
  );
}
