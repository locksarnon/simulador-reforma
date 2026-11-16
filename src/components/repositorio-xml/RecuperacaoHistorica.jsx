import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { base, fmtMoeda } from "./formatos";

const situacoes = {
  EM_FILA: "Em andamento",
  CONCLUIDA: "Concluída",
  INTERROMPIDA: "Interrompida",
};
const dataBr = (iso) => iso.split("-").reverse().join("/");
const fontes = {
  EFD_LIDA: "EFD consultada",
  SEM_EFD: "Cobertura desconhecida · sem EFD",
  EFD_NAO_LIDA: "Cobertura desconhecida · EFD indisponível",
};

export default function RecuperacaoHistorica({ empresaId }) {
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [previa, setPrevia] = useState(null);
  const cache = useQueryClient();
  const url = base(empresaId) + "/historico";
  const queryKey = ["repo-xml-historico", empresaId];
  const lotes = useQuery({
    queryKey,
    queryFn: () => api.get(url),
    enabled: aberto,
    refetchInterval: (query) => aberto && query.state.data?.some((lote) => lote.situacao === "EM_FILA") ? 5000 : false,
  });
  const preparar = useMutation({
    mutationFn: () => api.post(url + "/previa", { de, ate }),
    onMutate: () => setPrevia(null),
    onSuccess: setPrevia,
  });
  const autorizar = useMutation({
    mutationFn: (lote) => api.post(url + "/" + lote.id + "/confirmar", {}),
    onSuccess: () => {
      setPrevia(null);
      cache.invalidateQueries({ queryKey });
    },
  });
  const pendente = preparar.isPending || autorizar.isPending;
  const erro = preparar.error || autorizar.error || lotes.error;
  const execucoes = (lotes.data ?? []).filter((lote) => lote.situacao !== "PREVIA");
  const ativo = execucoes.some((lote) => lote.situacao === "EM_FILA");

  useEffect(() => {
    if (!lotes.dataUpdatedAt) return;
    cache.invalidateQueries({ queryKey: ["repo-xml-docs", empresaId] });
    cache.invalidateQueries({ queryKey: ["repo-xml-resumo", empresaId] });
  }, [cache, empresaId, lotes.dataUpdatedAt]);

  function mudarData(setter, valor) {
    setter(valor);
    setPrevia(null);
    preparar.reset();
    autorizar.reset();
  }

  return (
    <section className="rounded-md border border-border bg-card p-3 text-sm">
      <Button type="button" variant="outline" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        Recuperar histórico de NF-e
      </Button>
      {aberto && (
        <div className="mt-3 space-y-3">
          <p className="text-muted-foreground">
            Identifica chaves de NF-e modelo 55 nas EFDs ICMS/IPI já armazenadas e consulta no Serpro os XMLs que faltam.
          </p>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); autorizar.reset(); preparar.mutate(); }}>
            <label className="grid gap-1">De
              <input className="h-9 rounded-md border border-border bg-background px-2" type="date" required value={de} onChange={(e) => mudarData(setDe, e.target.value)} disabled={pendente} />
            </label>
            <label className="grid gap-1">Até
              <input className="h-9 rounded-md border border-border bg-background px-2" type="date" required value={ate} min={de || undefined} onChange={(e) => mudarData(setAte, e.target.value)} disabled={pendente} />
            </label>
            <Button type="submit" variant="outline" disabled={pendente}>{preparar.isPending ? "Conferindo EFDs…" : "Calcular prévia"}</Button>
          </form>
          {erro && <p role="alert" className="text-destructive">{erro.response?.data?.message || erro.message || "Falha ao consultar a recuperação."}</p>}
          {previa && (
            <div className="space-y-2 rounded-md border border-border p-3" aria-live="polite">
              <p><strong>{previa.total}</strong> chaves no lote · Custo máximo estimado {previa.estimativa == null ? "indisponível" : fmtMoeda(previa.estimativa)}</p>
              {previa.mensagem && <p>{previa.mensagem}</p>}
              {!previa.configurado && <p>Cadastre as chaves da Consulta NF-e em Administração &gt; Integrações (contrato do Serpro).</p>}
              <p className="text-muted-foreground">Preço pela faixa do contrato Consulta NF-e (volume do ciclo de faturamento, do dia 21 ao dia 20). O Serpro devolve os dados da nota com o protocolo de autorização, sem a assinatura do emitente.</p>
              <Cobertura linhas={previa.cobertura} />
              <Button disabled={pendente || ativo || !previa.total || previa.estimativa == null || !previa.configurado}
                onClick={() => autorizar.mutate(previa)}>
                {autorizar.isPending ? "Autorizando…" : "Autorizar consultas do lote"}
              </Button>
            </div>
          )}
          {execucoes.length > 0 && (
            <div className="space-y-2" aria-live="polite">
              <h3 className="font-medium">Execuções recentes</h3>
              {execucoes.map((lote) => (
                <details key={lote.id} className="rounded-md border border-border p-3">
                  <summary className="cursor-pointer">
                    {dataBr(lote.de)} a {dataBr(lote.ate)} · {situacoes[lote.situacao]} · {lote.cursor}/{lote.total} processadas
                  </summary>
                  <p className="mt-2">{lote.recuperadas} recuperadas · {lote.reaproveitadas} já disponíveis · {lote.indisponiveis} indisponíveis · {lote.falhas} falhas</p>
                  <p>Custo calculado pelas consultas registradas {fmtMoeda(lote.custo_registrado)}</p>
                  {lote.mensagem && <p>{lote.mensagem}</p>}
                  <Cobertura linhas={lote.cobertura} />
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** CT-e da EFD que não estão no repositório: não há consulta de CT-e no Serpro; a planilha vai para o pedido ao cliente. */
function baixarCteFaltantes(linhas) {
  const corpo = linhas.flatMap((l) => (l.cte_pendentes || []).map((k) => `${l.competencia};${k};${k.slice(20, 22) === "67" ? "CT-e OS" : "CT-e"};${k.slice(6, 20)}`));
  const csv = "﻿Competência;Chave de acesso;Modelo;CNPJ do emitente\n" + corpo.join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "CT-e faltantes.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function Cobertura({ linhas }) {
  const cteFaltantes = linhas.reduce((s, l) => s + (l.cte_faltantes ?? 0), 0);
  return (
    <details className="py-1">
      {cteFaltantes > 0 && (
        <p className="mt-1">
          {cteFaltantes} CT-e da EFD fora do repositório (CT-e não tem consulta por chave no Serpro).{" "}
          <button type="button" className="underline" onClick={() => baixarCteFaltantes(linhas)}>Baixar a lista para pedir ao cliente</button>
        </p>
      )}
      <summary className="cursor-pointer">Cobertura por competência</summary>
      <ul className="mt-1 max-h-52 overflow-auto text-muted-foreground">
        {linhas.map((linha) => (
          <li key={linha.competencia}>
            {linha.competencia} · {fontes[linha.fonte]}
            {linha.fonte === "EFD_LIDA" && (" · NF-e: " + linha.chaves + " na EFD, " + linha.faltantes + " faltantes")}
            {linha.cte > 0 && (" · CT-e: " + linha.cte + " na EFD, " + (linha.cte_faltantes ?? 0) + " faltantes")}
            {(linha.recuperadas || linha.indisponiveis || linha.falhas || linha.reaproveitadas) > 0 && (
              <span> · {linha.recuperadas ?? 0} recuperadas, {linha.indisponiveis ?? 0} indisponíveis, {linha.falhas ?? 0} falhas, {linha.reaproveitadas ?? 0} já disponíveis</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
