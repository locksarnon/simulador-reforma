import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Map as IconeMapa, Printer, X } from "lucide-react";
import Janela from "./diretrizes/Janela";
import { chaves, san } from "./api";
import { botaoSecundario, Tag } from "./comuns";
import { FASES_ROTEIRO, situacaoDaEtapa, situacaoDaLiberacao } from "./roteiro";

const COR = {
  fase1: { caixa: "border-teal-600/50 bg-teal-500/10", titulo: "text-teal-800 dark:text-teal-200" },
  fase2: { caixa: "border-violet-600/50 bg-violet-500/10", titulo: "text-violet-800 dark:text-violet-200" },
  fechamento: { caixa: "border-border bg-muted/50", titulo: "text-foreground" },
};

/** Conteúdo do roteiro (separado da janela para os testes e a impressão). */
export function Roteiro({ nome, estado, itens, liberadas, projeto, fases, apresentacao, selecionada, aoSelecionar }) {
  const ctx = { estado, itens, liberadas, projeto, fases };
  const sel = selecionada && FASES_ROTEIRO.flatMap((f) => f.etapas.map((e) => ({ f, e }))).find((x) => x.e.id === selecionada);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {FASES_ROTEIRO.map((f) => (
          <section key={f.id} aria-label={f.titulo} className="flex flex-col gap-2">
            <h3 className={`border border-border bg-card px-3 py-2 text-sm font-semibold ${COR[f.id].titulo}`}>{f.titulo}</h3>
            <p className="text-xs text-muted-foreground">{f.objetivo}</p>
            <ol className="flex flex-col gap-2">
              {f.etapas.map((e) => {
                const s = situacaoDaEtapa(f.id, e, ctx);
                const ativa = selecionada === e.id;
                return (
                  <li key={e.id}>
                    <button type="button" aria-pressed={ativa} onClick={() => aoSelecionar(ativa ? null : e.id)}
                      className={`w-full border px-3 py-2 text-left transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${COR[f.id].caixa} ${ativa ? "ring-2 ring-primary" : ""}`}>
                      <span className="flex items-start justify-between gap-2">
                        <span>
                          <span className={`block text-sm font-semibold ${COR[f.id].titulo}`}>{e.titulo}</span>
                          <span className="block text-xs text-muted-foreground">{e.resumo}</span>
                        </span>
                        <Tag tom={s.tom}>{s.texto}</Tag>
                      </span>
                      {!apresentacao && s.detalhe && <span className="mt-1 block text-xs text-muted-foreground">{s.detalhe}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
            {f.liberacao && (() => {
              const s = situacaoDaLiberacao(f.id, ctx);
              return (
                <div className="border-2 border-dashed border-border bg-card px-3 py-2" title={f.liberacao.recebe}>
                  <span className="flex items-center justify-between gap-2">
                    <span><span className="block text-sm font-semibold">{f.liberacao.titulo}</span><span className="block text-xs text-muted-foreground">{f.liberacao.resumo}</span></span>
                    <Tag tom={s.tom}>{s.texto}</Tag>
                  </span>
                  {!apresentacao && s.detalhe && <span className="mt-1 block text-xs text-muted-foreground">{s.detalhe}</span>}
                  <span className="mt-1 block text-xs text-muted-foreground">{f.liberacao.recebe}</span>
                </div>
              );
            })()}
          </section>
        ))}
      </div>
      {sel && (
        <section aria-label={`Detalhe: ${sel.e.titulo}`} className={`border p-3 text-sm ${COR[sel.f.id].caixa}`}>
          <h4 className={`font-semibold ${COR[sel.f.id].titulo}`}>{sel.f.titulo} · {sel.e.titulo}</h4>
          <dl className="mt-2 grid gap-2 sm:grid-cols-3">
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que é feito</dt><dd>{sel.e.faz}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que o cliente fornece</dt><dd>{sel.e.fornece}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que o cliente recebe</dt><dd>{sel.e.recebe}</dd></div>
          </dl>
        </section>
      )}
      {/* Impressão: todas as etapas com o detalhe, para levar à reunião. */}
      <div className="hidden print:block">
        {FASES_ROTEIRO.map((f) => (
          <section key={f.id} className="mt-4 break-inside-avoid">
            <h3 className="text-sm font-semibold">{f.titulo}</h3>
            <p className="text-xs">{f.objetivo}</p>
            <table className="mt-1 w-full border-collapse text-xs">
              <thead><tr>{["Etapa", "O que é feito", "O que o cliente fornece", "O que o cliente recebe"].map((t) => <th key={t} className="border border-gray-400 px-1 py-0.5 text-left">{t}</th>)}</tr></thead>
              <tbody>{f.etapas.map((e) => <tr key={e.id}><td className="border border-gray-400 px-1 py-0.5 font-semibold">{e.titulo}</td><td className="border border-gray-400 px-1 py-0.5">{e.faz}</td><td className="border border-gray-400 px-1 py-0.5">{e.fornece}</td><td className="border border-gray-400 px-1 py-0.5">{e.recebe}</td></tr>)}</tbody>
            </table>
          </section>
        ))}
      </div>
      <p className="sr-only">{nome}</p>
    </div>
  );
}

/** Botão "Roteiro do projeto" e a janela com as fases, a situação real de cada etapa, o modo apresentação e a impressão (PDF). */
export default function RoteiroProjeto({ projeto, nome }) {
  const [aberto, setAberto] = useState(false);
  const [apresentacao, setApresentacao] = useState(false);
  const [selecionada, setSelecionada] = useState(null);
  const estado = useQuery({ queryKey: chaves.estadoCamadas(projeto.id), queryFn: () => san.estadoCamadas(projeto.id), enabled: aberto });
  const visao = useQuery({ queryKey: chaves.visao(projeto.id), queryFn: () => san.visaoGeral(projeto.id), enabled: aberto });
  const versoes = useQuery({ queryKey: chaves.versoes(projeto.id), queryFn: () => san.versoes(projeto.id), enabled: aberto });
  const fases = useQuery({ queryKey: chaves.fases(projeto.id), queryFn: () => san.fases(projeto.id), enabled: aberto });
  const porCamada = new Map((estado.data?.camadas || []).map((l) => [l.camada, l]));
  const itens = (visao.data?.grupos || []).reduce((s, g) => s + (Number(g.itens) || 0), 0);
  const liberadas = Array.isArray(versoes.data) ? versoes.data.length : 0;
  const imprimir = () => {
    document.body.classList.add("imprimir-roteiro");
    const fim = () => { document.body.classList.remove("imprimir-roteiro"); window.removeEventListener("afterprint", fim); };
    window.addEventListener("afterprint", fim);
    window.print();
  };
  return (
    <>
      <button type="button" className={`${botaoSecundario} px-3 py-1.5 text-sm`} onClick={() => setAberto(true)}>
        <IconeMapa className="h-4 w-4" aria-hidden="true" />Roteiro do projeto
      </button>
      {aberto && (
        <Janela titulo="Roteiro do projeto" aoFechar={() => setAberto(false)} largura="max-w-7xl">
          <style>{`@media print { body.imprimir-roteiro * { visibility: hidden !important; } body.imprimir-roteiro .roteiro-imprimivel, body.imprimir-roteiro .roteiro-imprimivel * { visibility: visible !important; } body.imprimir-roteiro .roteiro-imprimivel { position: absolute; inset: 0 auto auto 0; width: 100%; } body.imprimir-roteiro .nao-imprimir { display: none !important; } }`}</style>
          <div className="roteiro-imprimivel p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="mr-auto">
                <h2 className="text-lg font-semibold">Roteiro do projeto</h2>
                <p className="text-xs text-muted-foreground">{nome} · Saneamento de estoques e cadastro de produtos · FAL Auditores e Consultores</p>
              </div>
              <label className="nao-imprimir flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={apresentacao} onChange={(e) => setApresentacao(e.target.checked)} />Modo apresentação
              </label>
              <button type="button" className={`${botaoSecundario} nao-imprimir px-2 py-1 text-sm`} onClick={imprimir}><Printer className="h-4 w-4" aria-hidden="true" />Imprimir ou salvar em PDF</button>
              <button type="button" className="nao-imprimir p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar o roteiro" onClick={() => setAberto(false)}><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <p className="nao-imprimir mb-3 text-xs text-muted-foreground">Clique numa etapa para ver o que é feito, o que o cliente fornece e o que recebe. A situação de cada etapa vem do projeto (camadas, premissas e liberações); o Modo apresentação esconde os números internos.</p>
            <Roteiro nome={nome} estado={porCamada} itens={itens} liberadas={liberadas} projeto={projeto} fases={fases.data} apresentacao={apresentacao} selecionada={selecionada} aoSelecionar={setSelecionada} />
          </div>
        </Janela>
      )}
    </>
  );
}
