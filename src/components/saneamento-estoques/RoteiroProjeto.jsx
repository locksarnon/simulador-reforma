import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, Map as IconeMapa, Printer, X } from "lucide-react";
import Janela from "./diretrizes/Janela";
import { chaves, san } from "./api";
import { botaoSecundario, Tag } from "./comuns";
import { FASES_ROTEIRO, situacaoDaEtapa, situacaoDaLiberacao } from "./roteiro";

const COR = {
  fase1: { caixa: "border-teal-600/50 bg-teal-500/10", titulo: "text-teal-800 dark:text-teal-200" },
  fase2: { caixa: "border-violet-600/50 bg-violet-500/10", titulo: "text-violet-800 dark:text-violet-200" },
  fechamento: { caixa: "border-border bg-muted/50", titulo: "text-foreground" },
};

/** Ordem global das etapas (as três fases em sequência), para acender o traço até a etapa escolhida. */
const ORDEM = FASES_ROTEIRO.flatMap((f) => f.etapas.map((e) => e.id));

/** Traço de ligação entre dois cards: acende (cor primária) quando o caminho já passou por ele. */
function Traco({ aceso, horizontal = false }) {
  if (horizontal) {
    return (
      <div className="flex items-center justify-center" aria-hidden="true">
        <div className={`h-6 w-0.5 transition-colors duration-500 lg:hidden ${aceso ? "bg-primary" : "bg-border"}`} />
        <div className={`hidden h-0.5 w-8 transition-colors duration-500 lg:block ${aceso ? "bg-primary" : "bg-border"}`} />
        <ArrowRight className={`hidden h-4 w-4 -ml-1 transition-colors duration-500 lg:block ${aceso ? "text-primary" : "text-muted-foreground"}`} />
        <ArrowDown className={`h-4 w-4 -mt-1 transition-colors duration-500 lg:hidden ${aceso ? "text-primary" : "text-muted-foreground"}`} />
      </div>
    );
  }
  return <div className={`mx-auto h-3 w-0.5 transition-colors duration-500 ${aceso ? "bg-primary" : "bg-border"}`} aria-hidden="true" />;
}

/** Conteúdo do roteiro (separado da janela para os testes e a impressão). */
export function Roteiro({ nome, estado, itens, liberadas, apresentacao, selecionada, aoSelecionar }) {
  const ctx = { estado, itens, liberadas };
  const pos = selecionada ? ORDEM.indexOf(selecionada) : -1;
  const ir = (n) => aoSelecionar(ORDEM[Math.max(0, Math.min(ORDEM.length - 1, n))]);
  return (
    <div className="space-y-3">
      <div className="nao-imprimir flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className={`${botaoSecundario} px-2 py-1`} disabled={pos <= 0} onClick={() => ir(pos - 1)}>Etapa anterior</button>
        <button type="button" className={`${botaoSecundario} px-2 py-1`} disabled={pos >= ORDEM.length - 1} onClick={() => ir(pos + 1)}>{pos < 0 ? "Começar pelo início" : "Próxima etapa"}</button>
        {pos >= 0 && <button type="button" className="px-2 py-1 text-muted-foreground hover:text-foreground" onClick={() => aoSelecionar(null)}>Recomeçar</button>}
        {pos >= 0 && <span className="text-xs text-muted-foreground">Etapa {pos + 1} de {ORDEM.length}</span>}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {FASES_ROTEIRO.map((f, n) => {
          const primeira = ORDEM.indexOf(f.etapas[0].id);
          const ultima = ORDEM.indexOf(f.etapas[f.etapas.length - 1].id);
          return (
            <Fragment key={f.id}>
              {n > 0 && <Traco horizontal aceso={pos >= primeira} />}
              <section aria-label={f.titulo} className="flex flex-col">
                <h3 className={`border border-border bg-card px-3 py-2 text-sm font-semibold ${COR[f.id].titulo}`}>{f.titulo}</h3>
                <p className="mb-1 mt-1 text-xs text-muted-foreground">{f.objetivo}</p>
                <ol className="flex flex-col">
                  {f.etapas.map((e, k) => {
                    const s = situacaoDaEtapa(f.id, e, ctx);
                    const i = ORDEM.indexOf(e.id);
                    const ativa = i === pos;
                    const passou = pos >= 0 && i < pos;
                    return (
                      <li key={e.id}>
                        {k > 0 && <Traco aceso={pos >= i} />}
                        <div className={`border transition-all duration-300 ${COR[f.id].caixa} ${ativa ? "scale-[1.02] shadow-md ring-2 ring-primary" : passou ? "border-primary/60" : ""}`}>
                          <button type="button" aria-pressed={ativa} aria-expanded={ativa} onClick={() => aoSelecionar(ativa ? null : e.id)}
                            className="w-full px-3 py-2 text-left hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <span className="flex items-start justify-between gap-2">
                              <span>
                                <span className={`block text-sm font-semibold ${COR[f.id].titulo}`}>{e.titulo}</span>
                                <span className="block text-xs text-muted-foreground">{e.resumo}</span>
                              </span>
                              <Tag tom={s.tom}>{s.texto}</Tag>
                            </span>
                            {!apresentacao && s.detalhe && <span className="mt-1 block text-xs text-muted-foreground">{s.detalhe}</span>}
                          </button>
                          {/* Explicação: abre dentro do card, com animação de altura. */}
                          <div className={`grid transition-all duration-500 ease-out ${ativa ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                            <div className="overflow-hidden">
                              <dl className="space-y-1.5 border-t border-border/60 px-3 py-2 text-xs">
                                <div><dt className="font-semibold uppercase tracking-wide text-muted-foreground">O que é feito</dt><dd>{e.faz}</dd></div>
                                <div><dt className="font-semibold uppercase tracking-wide text-muted-foreground">O que o cliente fornece</dt><dd>{e.fornece}</dd></div>
                                <div><dt className="font-semibold uppercase tracking-wide text-muted-foreground">O que o cliente recebe</dt><dd>{e.recebe}</dd></div>
                              </dl>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {f.liberacao && (() => {
                  const s = situacaoDaLiberacao(f.id, liberadas);
                  return (
                    <>
                      <Traco aceso={pos > ultima} />
                      <div className={`border-2 border-dashed bg-card px-3 py-2 transition-colors duration-500 ${pos > ultima ? "border-primary" : "border-border"}`} title={f.liberacao.recebe}>
                        <span className="flex items-center justify-between gap-2">
                          <span><span className="block text-sm font-semibold">{f.liberacao.titulo}</span><span className="block text-xs text-muted-foreground">{f.liberacao.resumo}</span></span>
                          <Tag tom={s.tom}>{s.texto}</Tag>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">{f.liberacao.recebe}</span>
                      </div>
                    </>
                  );
                })()}
              </section>
            </Fragment>
          );
        })}
      </div>
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
            <p className="nao-imprimir mb-3 text-xs text-muted-foreground">Clique numa etapa para ver o que é feito, o que o cliente fornece e o que recebe. A situação da Fase 1 vem do projeto; o Modo apresentação esconde os números internos.</p>
            <Roteiro nome={nome} estado={porCamada} itens={itens} liberadas={liberadas} apresentacao={apresentacao} selecionada={selecionada} aoSelecionar={setSelecionada} />
          </div>
        </Janela>
      )}
    </>
  );
}
