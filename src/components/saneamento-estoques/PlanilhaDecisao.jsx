import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CampoArquivo from "@/components/ui/CampoArquivo";
import { san } from "./api";
import { Aviso, botaoPrimario, botaoSecundario, campoCls, Rotulo, usePodeAlterar } from "./comuns";
import { CAMADAS, mensagemDeErro, ROTULO_CAMADA, rotuloTipoCaso, travaDeDecisao } from "./logica";
import BuscaNaTabela from "@/components/BuscaNaTabela";

const n = (v) => Number(v || 0).toLocaleString("pt-BR");

/** As contagens da prévia, na ordem da tela. */
export const CONTAGENS_DA_PREVIA = [
  ["aprovar", "a aprovar"], ["rejeitar", "a rejeitar"], ["pedirInformacao", "com pedido de informação"], ["semDecisao", "sem decisão"], ["recusadas", "recusadas"], ["jaAplicadas", "já aplicadas"],
];
/** Há o que aplicar? (alguma linha válida com decisão) */
export const temOQueAplicar = (previa) => !!previa && ["aprovar", "rejeitar", "pedirInformacao"].some((k) => (previa.contagem?.[k] || 0) > 0);

/**
 * Aplica em rodadas: o servidor devolve `restantes` quando o tempo da chamada acaba e a chamada seguinte, com o mesmo arquivo, continua
 * (as linhas já aplicadas por ele contam como "já aplicadas"). Para quando acaba, quando uma rodada não anda ou quando `parar()` diz.
 */
export async function aplicarEmRodadas(chamar, { aoProgresso, parar } = {}) {
  const total = { aprovar: 0, rejeitar: 0, pedirInformacao: 0 };
  let recusadas = []; let restantes = 0; let rodadas = 0;
  for (;;) {
    const r = await chamar();
    rodadas++;
    const feitas = (r.aplicadas?.aprovar || 0) + (r.aplicadas?.rejeitar || 0) + (r.aplicadas?.pedirInformacao || 0);
    for (const k of Object.keys(total)) total[k] += r.aplicadas?.[k] || 0;
    // A cada rodada a conferência é refeita: as recusas que valem são as da última.
    recusadas = r.recusadas || [];
    restantes = r.restantes || 0;
    aoProgresso?.({ ...total, restantes });
    if (!restantes || !feitas || parar?.()) break;
  }
  return { aplicadas: total, recusadas, restantes, rodadas };
}

/** Item da linha recusada: código e tipo do caso, nunca o id. */
const identificacao = (x) => [x.codigo, x.tipo ? rotuloTipoCaso(x.tipo) : null].filter(Boolean).join(" · ") || "—";

function TabelaRecusadas({ linhas }) {
  if (!linhas?.length) return null;
  return (
    <>
    <BuscaNaTabela />
    <div className="max-h-56 overflow-auto border border-foreground/30 bg-card">
      <table className="w-full text-xs" aria-label="Linhas recusadas">
        <thead className="sticky top-0 bg-muted text-left text-muted-foreground"><tr><th scope="col" className="px-2 py-1">Linha</th><th scope="col">Item e tipo</th><th scope="col" className="px-2">Motivo</th></tr></thead>
        <tbody>{linhas.slice(0, 300).map((x, i) => <tr key={`${i}-${x.linha}`} className="border-t border-border/60 align-top"><td className="px-2 py-1 tabular-nums">{x.linha}</td><td>{identificacao(x)}</td><td className="px-2">{x.motivo}</td></tr>)}</tbody>
      </table>
      {linhas.length > 300 && <p className="px-2 py-1 text-xs text-muted-foreground">Mostrando 300 de {n(linhas.length)}.</p>}
    </div>
    </>
  );
}

/** Conteúdo do painel (separado do diálogo para os testes). `inicial` = estado de partida (prévia, resultado). */
export function PainelPlanilha({ projeto, camadaInicial = "", aoMudou, inicial = {}, camadas = null, bloqueioFase2 = null }) {
  const { pode, razao } = usePodeAlterar();
  const [camada, setCamada] = useState(camadaInicial);
  const [arquivo, setArquivo] = useState(inicial.arquivo || null);
  const [previa, setPrevia] = useState(inicial.previa || null);
  const [resultado, setResultado] = useState(inicial.resultado || null);
  const [ocupado, setOcupado] = useState("");
  const [progresso, setProgresso] = useState(null);
  const [erro, setErro] = useState(null);

  // Fase 2 ainda não liberada: a planilha das camadas travadas pode ser baixada e conferida, mas não aplicada.
  const trava = travaDeDecisao(bloqueioFase2, camada);
  const trocarCamada = (c) => { setCamada(c); setPrevia(null); setResultado(null); setErro(null); };
  const trocarArquivo = (lista) => { setArquivo(lista[0] || null); setPrevia(null); setResultado(null); setErro(null); };
  const tarefa = (nome, f) => async () => { setErro(null); setOcupado(nome); try { await f(); } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(""); setProgresso(null); } };
  const baixar = tarefa("baixar", () => san.baixarPlanilhaDecisao(projeto.id, camada));
  const verPrevia = tarefa("previa", async () => { setResultado(null); setPrevia(await san.previaPlanilhaDecisao(projeto.id, camada, arquivo)); });
  const aplicar = tarefa("aplicar", async () => {
    try {
      const r = await aplicarEmRodadas(() => san.aplicarPlanilhaDecisao(projeto.id, camada, arquivo), { aoProgresso: setProgresso });
      setResultado(r); setPrevia(null);
    } finally { aoMudou?.(); }
  });

  return (
    <div className="space-y-4 text-sm">
      <label className="block"><Rotulo>Camada</Rotulo>
        <select className={campoCls} value={camada} disabled={!!ocupado} onChange={(e) => trocarCamada(e.target.value)}>
          <option value="">Escolha a camada…</option>{(camadas || CAMADAS).filter((c) => c !== "ESTOQUE" || projeto.modulos?.conciliacao).map((c) => <option key={c} value={c}>{ROTULO_CAMADA[c] || c}</option>)}
        </select>
      </label>
      {!camada && <Aviso tom="alerta">A planilha é de uma camada por vez: escolha a camada acima.</Aviso>}

      <section className="space-y-2" aria-label="Baixar planilha">
        <h4 className="font-semibold">1. Baixar</h4>
        <p className="text-muted-foreground">Uma linha por caso em aberto da camada (e os que aguardam informação). Preencha só Decisão, Motivo e, se discordar da proposta, Valor corrigido.</p>
        <button type="button" className={botaoSecundario} disabled={!camada || !!ocupado} onClick={baixar}><FileSpreadsheet className="h-4 w-4" aria-hidden="true" />{ocupado === "baixar" ? "Gerando…" : "Baixar planilha da camada"}</button>
      </section>

      <section className="space-y-2" aria-label="Reimportar planilha">
        <h4 className="font-semibold">2. Reimportar</h4>
        <CampoArquivo accept=".xlsx" icone={FileSpreadsheet} arquivo={arquivo} rotulo="Planilha de decisão preenchida" dica="A planilha baixada aqui, em Excel (.xlsx)" disabled={!camada || !!ocupado} aoEscolher={trocarArquivo} />
        <button type="button" className={botaoSecundario} disabled={!camada || !arquivo || !!ocupado} onClick={verPrevia}>{ocupado === "previa" ? "Conferindo…" : previa ? "Refazer a prévia" : "Ver a prévia"}</button>
      </section>

      {trava && <Aviso tom="bloqueio" titulo="Fase 2 ainda não liberada">{trava} Dá para baixar a planilha e ver a prévia; aplicar fica desligado até lá.</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {previa && (
        <section className="space-y-2" aria-label="Prévia da planilha">
          <h4 className="font-semibold">3. Prévia (nada foi gravado ainda)</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CONTAGENS_DA_PREVIA.map(([k, rotulo]) => <div key={k} className="border border-foreground/30 bg-card p-2"><div className="text-xl font-semibold tabular-nums">{n(previa.contagem?.[k])}</div>{rotulo}</div>)}
          </div>
          {previa.recusadas?.length > 0 && <p>As linhas recusadas ficam de fora; corrija a planilha e reimporte para incluí-las.</p>}
          <TabelaRecusadas linhas={previa.recusadas} />
          <button type="button" className={botaoPrimario} disabled={!pode || !!trava || !!ocupado || !temOQueAplicar(previa)} title={razao || trava || (!temOQueAplicar(previa) ? "Nenhuma linha com decisão válida." : undefined)} onClick={aplicar}>
            {ocupado === "aplicar" ? "Aplicando…" : "Aplicar as decisões"}
          </button>
          {progresso && <p role="status">Aplicadas até agora: {n(progresso.aprovar + progresso.rejeitar + progresso.pedirInformacao)}; faltam {n(progresso.restantes)}.</p>}
        </section>
      )}

      {resultado && (
        <Aviso tom={resultado.recusadas.length || resultado.restantes ? "alerta" : "ok"} titulo="Planilha aplicada">
          <p>{n(resultado.aplicadas.aprovar)} aprovado(s), {n(resultado.aplicadas.rejeitar)} rejeitado(s), {n(resultado.aplicadas.pedirInformacao)} com pedido de informação.</p>
          {resultado.restantes > 0 && <p>{n(resultado.restantes)} linha(s) ficaram para depois: clique em Ver a prévia e aplique de novo.</p>}
          {resultado.recusadas.length > 0 && <p>{n(resultado.recusadas.length)} linha(s) não foram aplicadas:</p>}
          <TabelaRecusadas linhas={resultado.recusadas} />
        </Aviso>
      )}
    </div>
  );
}

/** Botão "Planilha de decisão" da aba Casos: baixar a planilha da camada, reimportar com prévia e aplicar. `camadas`: só as da fase. */
export default function PlanilhaDecisao({ projeto, camada = "", camadas = null, aoMudou, bloqueioFase2 = null }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className={botaoSecundario} onClick={() => setAberto(true)} title="Decidir os casos de uma camada no Excel e reimportar">
        <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />Planilha de decisão
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Planilha de decisão</DialogTitle>
            <DialogDescription>Decida os casos de uma camada no Excel, um por linha, e reimporte: a prévia mostra o que será feito antes de aplicar.</DialogDescription>
          </DialogHeader>
          {aberto && <PainelPlanilha key={camada} projeto={projeto} camadaInicial={camada} camadas={camadas} aoMudou={aoMudou} bloqueioFase2={bloqueioFase2} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
