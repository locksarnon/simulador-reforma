import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

/** Tela fora do acesso da conta (nível e exceções definidos em Administração > Usuários e acessos). */
export default function SemAcesso({ titulo }) {
  return (
    <div role="alert" className="mx-auto max-w-lg px-6 py-16 text-center">
      <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-semibold">Sem acesso a esta tela{titulo ? `: ${titulo}` : ""}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sem acesso a esta tela. Peça ao administrador.</p>
      <Link to="/inicio" className="mt-4 inline-block text-sm text-primary hover:underline">Voltar ao Início</Link>
    </div>
  );
}
