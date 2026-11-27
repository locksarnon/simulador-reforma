import { classeBotaoFiltro } from "@/components/BotaoFiltro";
import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { api } from "@/api/client";

const dataBr = (s) => (s ? new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

/**
 * Regras estaduais: um botão por UF; a UF escolhida mostra um botão por norma (RICMS, Lei do ICMS, fundos do agro) que abre o
 * documento no site oficial do estado. Fica na aba Regras estaduais da Base legal e na página da área Bases legais.
 */
export default function RegrasEstaduais({ uf = "", aoEscolherUf = () => {}, compacto = false }) {
  const { data: ufs = [], isLoading, isError } = useQuery({
    queryKey: ["base-legal-regras-estaduais"], queryFn: () => api.get("/base-legal/regras-estaduais"), staleTime: 10 * 60_000,
  });
  const escolhida = ufs.find((u) => u.uf === uf) ?? null;

  return (
    <section aria-label="Regras estaduais" className="rounded-xl border border-border p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Regras estaduais</h2>
        {!compacto && (
          <p className="text-xs text-muted-foreground">
            Regulamento do ICMS (RICMS), lei do ICMS, anexos e fundos de cada estado. O botão abre o documento no site oficial do estado; o texto também está na base (Ler no InTAX), o assistente responde com ele, e toda segunda-feira a revisão semanal confere se mudou.
          </p>
        )}
      </div>
      {isLoading && <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Carregando…</p>}
      {isError && <p role="alert" className="text-xs text-destructive">Não foi possível carregar as regras estaduais.</p>}
      <div role="group" aria-label="Escolha a UF" className="flex flex-wrap gap-1.5">
        {ufs.map((u) => (
          <button
            key={u.uf} type="button" aria-pressed={u.uf === uf} title={u.nome} onClick={() => aoEscolherUf(u.uf === uf ? "" : u.uf)}
            className={`min-w-11 ${classeBotaoFiltro(u.uf === uf)}`}
          >
            {u.uf}
          </button>
        ))}
      </div>
      {escolhida && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{escolhida.nome}</p>
          {escolhida.documentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda sem documento oficial cadastrado para {escolhida.nome}.</p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-2" aria-label={`Normas de ${escolhida.nome}`}>
                {escolhida.documentos.map((d) => (
                  <li key={d.chave}>
                    <a
                      href={d.url} target="_blank" rel="noreferrer" title={`${d.numero}: ${d.titulo}`}
                      className="botao-acao inline-flex items-center gap-1.5 rounded-md bg-primary/5 px-3 py-[5px] text-sm font-medium text-primary hover:bg-primary/10"
                    >
                      {d.botao}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {escolhida.documentos.map((d) => (
                  <li key={d.chave}>
                    <b className="text-foreground">{d.botao}:</b> {d.numero} — {d.titulo}
                    {d.mudou_em
                      ? <span className="text-amber-700 dark:text-amber-300"> · mudou em {dataBr(d.mudou_em)}: confira</span>
                      : d.conferida_em ? ` · conferido em ${dataBr(d.conferida_em)}` : ""}
                    {d.texto_na_base && <> · <Link to={`/base-legal/${d.chave}`} className="text-primary underline">Ler no InTAX</Link></>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
