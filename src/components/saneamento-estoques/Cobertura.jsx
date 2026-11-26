import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chaves, san, atualizarTudo } from "./api";
import { Aviso, botaoSecundario, Tag, usePodeAlterar } from "./comuns";
import { camadasAtivas, coberturaDeCamadas, estadoDaTrava, mensagemDeErro, ROTULO_CAMADA, ROTULO_COBERTURA } from "./logica";

const TOM = { COM_DADOS: "ok", AGUARDA_INFORMACAO: "alerta", NAO_ANALISADA: "neutro", SEM_ANALISE: "neutro", SEM_ITENS: "neutro" };

/** Cobertura: o que já tem dados, o que depende de informação e o que ainda não pode ser analisado; daqui se roda cada análise. */
export default function Cobertura({ projeto }) {
  const qc = useQueryClient();
  const trava = estadoDaTrava(projeto);
  const { pode, razao } = usePodeAlterar();
  const camadas = camadasAtivas(projeto.modulos);
  const visao = useQuery({ queryKey: chaves.visao(projeto.id), queryFn: () => san.visaoGeral(projeto.id) });
  const disponiveis = useQuery({ queryKey: chaves.camadas(), queryFn: () => san.camadasDisponiveis() });
  const [resultado, setResultado] = useState(null);
  const executar = useMutation({
    mutationFn: (camada) => san.executarCamada(projeto.id, camada),
    onSuccess: (r) => { setResultado({ tom: "ok", r }); atualizarTudo(qc, projeto.id); },
    onError: (e) => setResultado({ tom: "erro", texto: mensagemDeErro(e) }),
  });
  const cobertura = coberturaDeCamadas(camadas, disponiveis.data, visao.data);
  const pronto = visao.data !== undefined && disponiveis.data !== undefined;

  return (
    <section aria-labelledby="san-cobertura" className="space-y-2 border border-border bg-card p-3">
      <h2 id="san-cobertura" className="text-sm font-semibold">Cobertura das camadas</h2>
      {visao.isError || disponiveis.isError ? <p className="text-sm text-muted-foreground" role="alert">Não foi possível carregar a cobertura agora.</p>
        : !pronto ? <p className="text-sm text-muted-foreground" role="status">Carregando a cobertura…</p>
          : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {cobertura.map((c) => (
                <li key={c.camada} className="flex flex-col gap-1 border border-border p-2 text-xs">
                  <span className="font-medium">{ROTULO_CAMADA[c.camada]}</span>
                  <Tag tom={TOM[c.estado]}>{ROTULO_COBERTURA[c.estado]}</Tag>
                  {c.aguardando > 0 && <span className="text-muted-foreground">{c.aguardando.toLocaleString("pt-BR")} dependem de informação</span>}
                  {c.analisavel && (
                    <button type="button" className={`${botaoSecundario} mt-auto px-2 py-1 text-xs`} disabled={!pode || trava.bloqueada || c.estado === "SEM_ITENS" || executar.isPending}
                      title={!pode ? razao : trava.bloqueada ? trava.mensagem : c.estado === "SEM_ITENS" ? "Importe o cadastro de itens antes" : undefined} onClick={() => executar.mutate(c.camada)}>
                      {executar.isPending && executar.variables === c.camada ? "Analisando…" : c.estado === "NAO_ANALISADA" || c.estado === "SEM_ITENS" ? "Analisar" : "Analisar de novo"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
      {trava.bloqueada && <p className="text-xs text-muted-foreground">{trava.mensagem}: as análises ficam bloqueadas até lá.</p>}
      {resultado?.tom === "erro" && <Aviso tom="erro">{resultado.texto}</Aviso>}
      {resultado?.tom === "ok" && (
        <Aviso tom={resultado.r.semDados ? "alerta" : "ok"} titulo={`${ROTULO_CAMADA[resultado.r.camada]}: ${resultado.r.analisados.toLocaleString("pt-BR")} itens analisados`}>
          {resultado.r.casosNovos} caso(s) novo(s); {resultado.r.casosJaExistentes} já existiam.
          {resultado.r.semDados && ` Faltou dado para analisar ${resultado.r.semDados.itens.toLocaleString("pt-BR")} item(ns): ${resultado.r.semDados.motivo}`}
        </Aviso>
      )}
    </section>
  );
}
