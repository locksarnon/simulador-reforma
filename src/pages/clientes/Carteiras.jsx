import { useState } from "react";
import VincularBpo from "@/components/clientes/VincularBpo";
import CarteiraPagina from "@/pages/clientes/CarteiraPagina";
import { areaPorId } from "@/lib/navegacao";

/** Carteira do BPO fiscal: as empresas com BPO ativo ou pausado. */
export function CarteiraBpo() {
  const [aberto, setAberto] = useState(false);
  return <>
    <CarteiraPagina
      tipo="BPO_FISCAL"
      area={areaPorId("bpo")}
      titulo="Carteira do BPO"
      acoes={<button className="botao-acao rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" onClick={() => setAberto(true)}>Vincular cliente</button>}
    />
    {aberto && <VincularBpo aoFechar={() => setAberto(false)} />}
  </>;
}
