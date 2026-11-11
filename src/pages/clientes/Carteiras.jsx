import CarteiraPagina from "@/pages/clientes/CarteiraPagina";
import { areaPorId } from "@/lib/navegacao";

/** Carteira do BPO fiscal: as empresas com BPO ativo ou pausado. */
export function CarteiraBpo() {
  return (
    <CarteiraPagina
      tipo="BPO_FISCAL"
      area={areaPorId("bpo")}
      titulo="Carteira do BPO"
      subtitulo="As empresas com BPO fiscal ativo, com o responsável, os módulos ligados e o caminho para trabalhar em cada uma."
    />
  );
}

/** Carteira de diagnósticos: as empresas com diagnóstico pontual ativo ou pausado. */
export function CarteiraDiagnostico() {
  return (
    <CarteiraPagina
      tipo="DIAGNOSTICO_PONTUAL"
      area={areaPorId("diagnostico")}
      titulo="Carteira de diagnósticos"
      subtitulo="As empresas com diagnóstico pontual em andamento. O trabalho de cada uma fica no diagnóstico dela."
    />
  );
}
