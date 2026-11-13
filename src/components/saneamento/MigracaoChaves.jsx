import React, { useEffect, useState } from "react";
import { Download, Info, Loader2 } from "lucide-react";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Botao, Chip, dataBr, fmt, plural } from "./ui";
import TabelaPadrao from "@/components/TabelaPadrao";
import { hojeIso } from "./logica";
import { origemCompleta } from "./identidade";
import { ROT_RESULTADO, ROT_TIPO, guardarComoLegado, planejarMigracao, totalLegado } from "./migracao";
import { gerarXlsxMigracao, relatorioDoLegado } from "./migracaoXlsx";
import { OrigemDosDados } from "./OrigemDosDados";

const TXT_MIGRACAO = "Este projeto foi criado quando as decisões eram guardadas pelo número da linha da planilha. Numa nova extração a linha aponta para outro produto, então a ferramenta passa a guardar tudo pelo código do item (como texto, com os zeros à esquerda). A migração recupera o código de cada decisão na base original: só vincula o que a conferência comprova, e o que não vincular com segurança fica guardado, intacto, como pendente de revisão. Simule primeiro: nada é gravado no projeto até você aplicar.";

/** Linhas do quadro de totais: decisões, confirmações de execução e decisões fiscais. */
function Totais({ totais }) {
  const linhas = [["Decisões", totais.decisoes], ["Confirmações de execução", totais.execucao], ["Decisões fiscais", totais.fiscal]];
  const num = (chave, rotulo) => ({ chave, rotulo, tipo: "numero", alinhar: "direita", valor: (l) => l[1][chave] });
  return (
    <TabelaPadrao id="saneamento-migracao-totais" ariaLabel="Totais da migração" simples ordemInicial={null} linhas={linhas} chaveLinha={(l) => l[0]} colunas={[
      { chave: "rotulo", rotulo: "O que estava guardado", valor: (l) => l[0] },
      num("total", "Total"), num("vinculadas", "Vinculadas ao código"), num("ambiguas", "Ambíguas"), num("naoEncontradas", "Não encontradas"),
    ]} />
  );
}

/** Pendências (ambíguas e não encontradas) da simulação ou do legado, na tabela padrão; o Excel traz tudo. */
function TabelaPendencias({ linhas }) {
  if (!linhas.length) return null;
  return (
    <TabelaPadrao id="saneamento-migracao-pendencias" ariaLabel="Pendências da migração" linhas={linhas} chaveLinha={(l, i) => `${l.tipo}${l.chaveAntiga}${i}`} colunas={[
      { chave: "tipo", rotulo: "Tipo", valor: (l) => ROT_TIPO[l.tipo] },
      { chave: "chaveAntiga", rotulo: "Chave antiga", alinhar: "direita" },
      { chave: "codigo", rotulo: "Código", valor: (l) => l.codigo || "—" },
      { chave: "resultado", rotulo: "Resultado", valor: (l) => ROT_RESULTADO[l.resultado] },
      { chave: "motivo", rotulo: "Motivo", quebrar: true, render: (l) => <span className="text-muted-foreground">{l.motivo}</span> },
    ]} />
  );
}

/**
 * Migração das decisões do formato antigo (pela linha da planilha) para o código do item. Roda uma simulação sobre uma cópia do projeto, mostra o que vincula, o que fica
 * ambíguo e o que não foi encontrado, e só grava quando o analista aplica. Sem a base original, o caminho é guardar tudo como legado. Nada é apagado.
 */
export default function MigracaoChaves({ estado, setEstado, itens, baseInfo, temBase, quem, slug, nomeProjeto, onIrTriagem, onMudarOrigem }) {
  const confirmar = useConfirmar();
  const [atesta, setAtesta] = useState(false); const [ciente, setCiente] = useState(false); const [plano, setPlano] = useState(null); const [gerando, setGerando] = useState(false); const [msg, setMsg] = useState("");
  const origem = estado.origem || {};
  const n = { decisoes: Object.keys(estado.decisoes || {}).length, execucao: Object.keys(estado.execucao?.registros || {}).length, fiscal: Object.keys(estado.fiscal?.decisoes || {}).length };
  // a simulação vale para a origem, a base e a atestação com que foi feita
  useEffect(() => { setPlano(null); setCiente(false); }, [atesta, origem.erp, origem.instancia, origem.empresa, baseInfo?.id]);

  const simular = () => { setPlano(planejarMigracao(estado, itens, { base: baseInfo, origem, por: quem, em: hojeIso() })); setCiente(false); setMsg(""); };
  const aplicar = async () => {
    if (plano?.relatorio?.verificacao?.fraca && !ciente) return; // verificação fraca: só com o "estou ciente" do analista
    if (!(await confirmar({ titulo: "Aplicar a migração?", descricao: `O projeto passa a guardar ${plural(plano.relatorio.totais.decisoes.vinculadas, "decisão", "decisões")} pelo código do item. O que não vinculou fica guardado no legado do projeto, intacto, e pendente de revisão. Baixe o relatório antes, se quiser guardar a conferência.`, rotulo: "Aplicar a migração" }))) return;
    setEstado((e) => planejarMigracao(e, itens, { base: baseInfo, origem: e.origem, por: quem, em: hojeIso() }).estado);
  };
  const guardar = async () => {
    if (!(await confirmar({ titulo: "Guardar as decisões antigas como legado?", descricao: "Sem a base original não há fundamento para ligar cada decisão ao item certo. Todas as decisões, confirmações e decisões fiscais antigas ficam guardadas, intactas, em uma lista de pendências, e o projeto segue sem elas. Nada é apagado.", rotulo: "Guardar como legado" }))) return;
    setEstado((e) => guardarComoLegado(e, { por: quem, em: hojeIso() }));
  };
  const baixar = async () => {
    setGerando(true); setMsg("");
    try { await gerarXlsxMigracao(plano.relatorio, { nomeProjeto }, `${slug}-relatorio-da-migracao.xlsx`); setMsg("Relatório emitido."); }
    catch (e) { setMsg(`Não foi possível emitir o relatório: ${e.message}`); } finally { setGerando(false); }
  };

  const r = plano?.relatorio; const pend = r ? r.linhas.filter((l) => l.resultado !== "VINCULADA") : [];
  return (
    <div className="space-y-3" role="region" aria-label="Migração das decisões para o código do item">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-xs dark:border-amber-700/50 dark:bg-amber-950/20">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="space-y-1.5">
          <p><b className="font-medium">Antes de seguir: migrar as decisões para o código do item.</b> Há {plural(n.decisoes, "decisão", "decisões")}, {plural(n.execucao, "confirmação de execução", "confirmações de execução")} e {plural(n.fiscal, "decisão fiscal", "decisões fiscais")} guardadas pela linha da planilha.</p>
          <p>{TXT_MIGRACAO}</p>
        </div>
      </div>
      <OrigemDosDados origem={origem} onMudar={onMudarOrigem} />
      {!temBase ? (
        <div className="rounded-lg border border-dashed border-border p-3 text-sm space-y-2">
          <p className="font-medium">Este projeto não tem base vinculada</p>
          <p className="text-muted-foreground">Para migrar, vincule a base original (a mesma que fundamentou as decisões) no passo Triagem. Sem ela, não há como ligar cada decisão ao item certo.</p>
          <div className="flex flex-wrap gap-2"><Botao onClick={onIrTriagem}>Ir para a Triagem</Botao><Botao onClick={guardar}>Guardar as decisões antigas como legado…</Botao></div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={atesta} onChange={(e) => setAtesta(e.target.checked)} />
            <span>Confirmo que a base vinculada ao projeto{baseInfo?.arquivo ? <> (<b className="font-medium">{baseInfo.arquivo}</b>)</> : ""} é a base original, a que fundamentou estas decisões.
              <span className="block text-xs text-muted-foreground">Se você trocou a base depois de decidir, esta não é a original: a conferência abaixo vai acusar, e o caminho é guardar as decisões como legado.</span></span></label>
          <div className="flex flex-wrap items-center gap-2">
            <Botao disabled={!atesta || !origemCompleta(origem)} onClick={simular} title={!origemCompleta(origem) ? "Declare o ERP, a instância e a empresa" : !atesta ? "Confirme que esta é a base original" : undefined}>Simular a migração (nada é gravado)</Botao>
            <Botao onClick={guardar}>Guardar as decisões antigas como legado…</Botao>
            {!origemCompleta(origem) && <span className="text-xs text-muted-foreground">Declare o ERP, a instância e a empresa para simular.</span>}
          </div>
          {r && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className={`text-sm ${r.verificacao.confere ? "" : "text-destructive"}`} role="status">{r.verificacao.mensagem}{r.verificacao.exemplos.length > 0 && <span className="block text-xs text-muted-foreground">Por exemplo: {r.verificacao.exemplos.join("; ")}.</span>}</p>
              <Totais totais={r.totais} />
              <TabelaPendencias linhas={pend} />
              {r.verificacao.fraca && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-xs dark:border-amber-700/50 dark:bg-amber-950/20"><input type="checkbox" className="mt-0.5" checked={ciente} onChange={(e) => setCiente(e.target.checked)} />
                  <span>Estou ciente de que a conferência não achou nada que a base pudesse contrariar: a migração depende só da minha atestação de que esta é a base original. Conferi o arquivo e a data da extração.</span></label>)}
              <div className="flex flex-wrap items-center gap-2">
                <Botao disabled={!r.verificacao.confere || (r.verificacao.fraca && !ciente)} onClick={aplicar} title={!r.verificacao.confere ? "Esta base não confere com as decisões: guarde como legado ou vincule a base original" : r.verificacao.fraca && !ciente ? "Marque que está ciente de que a verificação depende só da sua atestação" : undefined}>Aplicar a migração</Botao>
                <Botao disabled={gerando} onClick={baixar}>{gerando ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Relatório da migração (Excel)</Botao>
                {msg && <span className="text-xs text-muted-foreground" role="status">{msg}</span>}
              </div>
            </div>)}
        </div>)}
    </div>
  );
}

/** Pendências que a migração deixou no legado do projeto: decisões, confirmações e decisões fiscais antigas que não vincularam, guardadas intactas. */
export function PainelLegado({ estado, slug, nomeProjeto }) {
  const [aberto, setAberto] = useState(false); const [gerando, setGerando] = useState(false);
  const total = totalLegado(estado); if (!total) return null;
  const rel = relatorioDoLegado(estado); const linhas = rel?.linhas || [];
  const baixar = async () => { setGerando(true); try { await gerarXlsxMigracao(rel, { nomeProjeto }, `${slug}-pendencias-da-migracao.xlsx`); } finally { setGerando(false); } };
  return (
    <div className="rounded-lg border border-border p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm font-medium">Decisões antigas pendentes de revisão</b><Chip tom="a">{fmt(total)}</Chip>
        <span className="text-muted-foreground">migração de {dataBr(estado.migracao?.em)}{estado.migracao?.por ? ` por ${estado.migracao.por}` : ""}</span>
        <Botao onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>{aberto ? "Ocultar a lista" : "Ver a lista"}</Botao>
        <Botao disabled={gerando} onClick={baixar}><Download className="w-3.5 h-3.5 inline mr-1" />Baixar a lista (Excel)</Botao>
      </div>
      <p className="text-muted-foreground">Estas decisões estavam guardadas pela linha da planilha e não puderam ser ligadas ao item com segurança. Ficam guardadas aqui, intactas, e não valem para o trabalho: avalie cada caso de novo nas Análises e encaminhe o que ainda fizer sentido.</p>
      {aberto && <TabelaPendencias linhas={linhas} />}
    </div>
  );
}
