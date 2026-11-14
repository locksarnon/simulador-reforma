import CarteiraPagina from "@/pages/clientes/CarteiraPagina";
import { areaPorId } from "@/lib/navegacao";

/** Carteira do BPO fiscal: as empresas com BPO ativo ou pausado. */
export function CarteiraBpo() {
  return (
    <CarteiraPagina
      tipo="BPO_FISCAL"
      area={areaPorId("bpo")}
      titulo="Carteira do BPO"
    />
  );
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
