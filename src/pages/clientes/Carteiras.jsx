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
      acoes={<button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => setAberto(true)}>Vincular cliente</button>}
    />
    {aberto && <VincularBpo aoFechar={() => setAberto(false)} />}
  </>;
}

/** Carteira de diagnósticos: as empresas com diagnóstico pontual ativo ou pausado. */
export function CarteiraDiagnostico({ consultoria = false }) {
  return (
    <CarteiraPagina
      tipo="DIAGNOSTICO_PONTUAL"
      area={areaPorId("diagnostico")}
      titulo={consultoria ? "Carteira de Consultoria" : "Carteira de diagnósticos"}
    />
  );
}
